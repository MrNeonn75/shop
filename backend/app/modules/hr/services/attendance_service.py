"""Davamiyyət və Aylıq Tabel Servisi (Attendance Service).

Xam qeydlərin (punches) emalı, gecikmə, erkən çıxış, iş vaxtından artıq saatların
və kənarlaşmaların (exceptions) deterministik hesablanması və aylıq tabelin kilidlənməsi.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import BusinessRuleViolationError, NotFoundError
from app.modules.hr.models import (
    AttendanceCorrection,
    AttendancePunch,
    AttendanceStatus,
    DailyAttendance,
    PunchType,
    Timesheet,
    TimesheetStatus,
)
from app.modules.hr.policies import HRPolicy
from app.modules.hr.repository import HRRepository
from app.modules.hr.schemas import (
    AttendanceCorrectionCreate,
    AttendancePunchCreate,
    TimesheetReopenRequest,
)


class AttendanceService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = HRRepository(session)

    # ------------------------------------------
    # Punches & Daily Calculation
    # ------------------------------------------

    async def record_punch(
        self, payload: AttendancePunchCreate, actor: Any | None = None
    ) -> AttendancePunch:
        if actor:
            HRPolicy.check_can_record_attendance(actor)

        punch = AttendancePunch(
            employee_id=payload.employee_id,
            punch_time=payload.punch_time,
            punch_type=payload.punch_type,
            source=payload.source,
            device_id=payload.device_id,
            raw_data=payload.raw_data,
        )
        created_punch = await self.repo.create_punch(punch)

        # Həmin gün üçün gündəlik davamiyyətin deterministik yenilənməsi
        work_date = payload.punch_time.date()
        await self.recompute_daily_attendance(payload.employee_id, work_date)

        return created_punch

    async def recompute_daily_attendance(
        self, employee_id: uuid.UUID, work_date: date
    ) -> DailyAttendance:
        """Qeydlər və plan əsasında gündəlik davamiyyəti yenidən hesablayır."""
        # 1. Planlaşdırılmış növbəni tapırıq
        asgn = await self.repo.get_assignment_by_date(employee_id, work_date)
        planned_start: datetime | None = None
        planned_end: datetime | None = None
        break_mins = 0

        if asgn and asgn.shift_template:
            s_h, s_m = map(int, asgn.shift_template.start_time.split(":"))
            e_h, e_m = map(int, asgn.shift_template.end_time.split(":"))
            planned_start = datetime.combine(work_date, time(s_h, s_m))
            planned_end = datetime.combine(work_date, time(e_h, e_m))
            if asgn.shift_template.crosses_midnight:
                planned_end += timedelta(days=1)
            break_mins = asgn.shift_template.break_minutes

        # 2. Həmin günün xam qeydlərini (punches) çəkirik
        day_start = datetime.combine(work_date, time.min)
        day_end = datetime.combine(work_date, time.max)
        punches = await self.repo.list_punches(employee_id, day_start, day_end)

        in_punches = [p for p in punches if p.punch_type == PunchType.IN]
        out_punches = [p for p in punches if p.punch_type == PunchType.OUT]

        actual_start = in_punches[0].punch_time if in_punches else None
        actual_end = out_punches[-1].punch_time if out_punches else None

        def _to_naive_utc(dt: datetime | None) -> datetime | None:
            if dt is None:
                return None
            if dt.tzinfo is not None:
                return dt.astimezone(UTC).replace(tzinfo=None)
            return dt

        act_st_naive = _to_naive_utc(actual_start)
        act_end_naive = _to_naive_utc(actual_end)

        late_mins = 0
        early_dep_mins = 0
        overtime_mins = 0
        regular_mins = 0
        is_absent = False
        status = AttendanceStatus.NORMAL
        exception_reason: str | None = None

        if planned_start and not actual_start and not actual_end:
            # Plan var amma heç bir qeyd yoxdur -> Qayıb (Absent)
            is_absent = True
        elif actual_start and not actual_end:
            # Giriş var, çıxış yoxdur -> Kənarlaşma (Exception)
            status = AttendanceStatus.EXCEPTION
            exception_reason = "Çıxış qeydi (punch-out) çatışmır"
        elif act_st_naive and act_end_naive:
            # Həm giriş, həm çıxış var -> Müddətlərin hesablanması
            actual_duration = int((act_end_naive - act_st_naive).total_seconds() / 60)
            net_actual = max(0, actual_duration - break_mins)

            if planned_start and planned_end:
                # Gecikmə yoxlanışı (5 dəqiqə güzəşt müddəti ilə)
                grace_start = planned_start + timedelta(minutes=5)
                if act_st_naive > grace_start:
                    late_mins = int((act_st_naive - planned_start).total_seconds() / 60)

                if act_end_naive < planned_end:
                    early_dep_mins = int((planned_end - act_end_naive).total_seconds() / 60)
                elif act_end_naive > planned_end:
                    overtime_mins = int((act_end_naive - planned_end).total_seconds() / 60)

                planned_duration = int((planned_end - planned_start).total_seconds() / 60)
                net_planned = max(0, planned_duration - break_mins)
                regular_mins = min(net_actual, net_planned)
            else:
                regular_mins = net_actual

        # Mövcud gündəlik qeydi tapırıq və ya yenisini yaradırıq
        da = await self.repo.get_daily_attendance_by_date(employee_id, work_date)
        if not da:
            da = DailyAttendance(
                employee_id=employee_id,
                work_date=work_date,
            )

        da.planned_start = planned_start
        da.planned_end = planned_end
        da.actual_start = actual_start
        da.actual_end = actual_end
        da.regular_minutes = regular_mins
        da.late_minutes = late_mins
        da.early_departure_minutes = early_dep_mins
        da.overtime_minutes = overtime_mins
        da.is_absent = is_absent
        da.status = status
        da.exception_reason = exception_reason
        da.rule_version = "v1"

        return await self.repo.save_daily_attendance(da)

    async def correct_attendance(
        self, daily_attendance_id: uuid.UUID, payload: AttendanceCorrectionCreate, actor: Any
    ) -> AttendanceCorrection:
        """Davamiyyətə audit qeydi ilə dağıdıcı olmayan menecer düzəlişi."""
        HRPolicy.check_can_correct_attendance(actor)
        da = await self.repo.get_daily_attendance(daily_attendance_id)
        if not da:
            raise NotFoundError(f"Davamiyyət qeydi tapılmadı: {daily_attendance_id}")

        original_values = {
            "actual_start": da.actual_start.isoformat() if da.actual_start else None,
            "actual_end": da.actual_end.isoformat() if da.actual_end else None,
            "regular_minutes": da.regular_minutes,
            "overtime_minutes": da.overtime_minutes,
            "is_absent": da.is_absent,
            "status": da.status,
        }

        # Düzəlişlər tətbiq edilir
        if payload.actual_start is not None:
            da.actual_start = payload.actual_start
        if payload.actual_end is not None:
            da.actual_end = payload.actual_end
        if payload.regular_minutes is not None:
            da.regular_minutes = payload.regular_minutes
        if payload.overtime_minutes is not None:
            da.overtime_minutes = payload.overtime_minutes
        if payload.is_absent is not None:
            da.is_absent = payload.is_absent

        da.status = AttendanceStatus.CORRECTED
        da.exception_reason = None
        await self.repo.save_daily_attendance(da)

        corrected_values = {
            "actual_start": da.actual_start.isoformat() if da.actual_start else None,
            "actual_end": da.actual_end.isoformat() if da.actual_end else None,
            "regular_minutes": da.regular_minutes,
            "overtime_minutes": da.overtime_minutes,
            "is_absent": da.is_absent,
            "status": da.status,
        }

        corr = AttendanceCorrection(
            daily_attendance_id=daily_attendance_id,
            corrected_by=getattr(actor, "id", uuid.uuid4()),
            reason=payload.reason,
            original_values=original_values,
            corrected_values=corrected_values,
        )
        return await self.repo.create_correction(corr)

    # ------------------------------------------
    # Timesheets (Aylıq Tabel)
    # ------------------------------------------

    async def generate_timesheet(
        self, employee_id: uuid.UUID, year: int, month: int, actor: Any
    ) -> Timesheet:
        HRPolicy.check_can_manage_timesheet(actor)
        start_date = date(year, month, 1)
        # Ayın sonu
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)

        daily_records = await self.repo.list_daily_attendance(employee_id, start_date, end_date)

        total_reg_mins = sum(r.regular_minutes for r in daily_records)
        total_ot_mins = sum(r.overtime_minutes for r in daily_records)
        total_late = sum(r.late_minutes for r in daily_records)
        total_absence = sum(1 for r in daily_records if r.is_absent)

        total_reg_hours = Decimal(f"{total_reg_mins / 60:.2f}")
        total_ot_hours = Decimal(f"{total_ot_mins / 60:.2f}")

        ts = await self.repo.get_timesheet_by_period(employee_id, year, month)
        if not ts:
            ts = Timesheet(
                employee_id=employee_id,
                period_year=year,
                period_month=month,
                status=TimesheetStatus.DRAFT,
            )

        if ts.status == TimesheetStatus.LOCKED:
            raise BusinessRuleViolationError("Kilidlənmiş tabel yenidən hesablana bilməz.")

        ts.total_regular_hours = total_reg_hours
        ts.total_overtime_hours = total_ot_hours
        ts.total_late_minutes = total_late
        ts.total_absence_days = total_absence

        return await self.repo.save_timesheet(ts)

    async def submit_timesheet(self, timesheet_id: uuid.UUID, actor: Any) -> Timesheet:
        HRPolicy.check_can_manage_timesheet(actor)
        ts = await self.repo.get_timesheet(timesheet_id)
        if not ts:
            raise NotFoundError(f"Tabel tapılmadı: {timesheet_id}")
        ts.status = TimesheetStatus.SUBMITTED
        ts.submitted_by = getattr(actor, "id", None)
        return await self.repo.save_timesheet(ts)

    async def approve_timesheet(self, timesheet_id: uuid.UUID, actor: Any) -> Timesheet:
        HRPolicy.check_can_manage_timesheet(actor)
        ts = await self.repo.get_timesheet(timesheet_id)
        if not ts:
            raise NotFoundError(f"Tabel tapılmadı: {timesheet_id}")
        ts.status = TimesheetStatus.APPROVED
        ts.approved_by = getattr(actor, "id", None)
        return await self.repo.save_timesheet(ts)

    async def lock_timesheet(self, timesheet_id: uuid.UUID, actor: Any) -> Timesheet:
        HRPolicy.check_can_manage_timesheet(actor)
        ts = await self.repo.get_timesheet(timesheet_id)
        if not ts:
            raise NotFoundError(f"Tabel tapılmadı: {timesheet_id}")
        ts.status = TimesheetStatus.LOCKED
        ts.locked_at = utc_now()
        return await self.repo.save_timesheet(ts)

    async def reopen_timesheet(
        self, timesheet_id: uuid.UUID, payload: TimesheetReopenRequest, actor: Any
    ) -> Timesheet:
        ts = await self.repo.get_timesheet(timesheet_id)
        if not ts:
            raise NotFoundError(f"Tabel tapılmadı: {timesheet_id}")

        HRPolicy.check_can_reopen_timesheet(actor, ts.approved_by)

        ts.status = TimesheetStatus.DRAFT
        ts.reopen_reason = payload.reason
        ts.reopen_by = getattr(actor, "id", None)
        ts.locked_at = None
        return await self.repo.save_timesheet(ts)
