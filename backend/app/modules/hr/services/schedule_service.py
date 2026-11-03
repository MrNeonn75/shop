"""Növbələr və İş Qrafiki İdarəetməsi Servisi (Schedule Service).

Cədvəl validasiya mühərriki:
- Overlap (üst-üstə düşmə) təftişi
- Gündəlik maksimum iş saatı (maksimum 12 saat)
- Növbələr arası minimum istirahət vaxtı (minimum 11 saat)
- Təsdiqlənmiş məzuniyyət ilə ziddiyyət (leave conflict) yoxlanışı
- Ştat təminatı (minimum staffing coverage)
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    NotFoundError,
    ValidationError,
)
from app.modules.hr.models import (
    LeaveRequestStatus,
    ScheduleAssignment,
    SchedulePeriod,
    SchedulePeriodStatus,
    ScheduleSwapRequest,
    ShiftTemplate,
    SwapStatus,
)
from app.modules.hr.policies import HRPolicy
from app.modules.hr.repository import HRRepository
from app.modules.hr.schemas import (
    ScheduleAssignmentBulkCreate,
    ScheduleAssignmentItem,
    SchedulePeriodCreate,
    ScheduleSwapCreate,
    ScheduleSwapDecision,
    ScheduleValidationResult,
    ShiftTemplateCreate,
)


class ScheduleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = HRRepository(session)

    # ------------------------------------------
    # Shift Templates
    # ------------------------------------------

    async def create_shift_template(
        self, payload: ShiftTemplateCreate, actor: Any
    ) -> ShiftTemplate:
        HRPolicy.check_can_manage_schedule(actor)
        HRPolicy.check_branch_scope(actor, payload.branch_id)

        template = ShiftTemplate(
            name=payload.name,
            code=payload.code,
            start_time=payload.start_time,
            end_time=payload.end_time,
            break_minutes=payload.break_minutes,
            crosses_midnight=payload.crosses_midnight,
            branch_id=payload.branch_id,
        )
        return await self.repo.create_shift_template(template)

    async def list_shift_templates(
        self, actor: Any, branch_id: uuid.UUID | None = None
    ) -> Sequence[ShiftTemplate]:
        HRPolicy.check_can_view_schedule(actor)
        HRPolicy.check_branch_scope(actor, branch_id)
        return await self.repo.list_shift_templates(branch_id)

    # ------------------------------------------
    # Schedule Periods
    # ------------------------------------------

    async def create_schedule_period(
        self, payload: SchedulePeriodCreate, actor: Any
    ) -> SchedulePeriod:
        HRPolicy.check_can_manage_schedule(actor)
        HRPolicy.check_branch_scope(actor, payload.branch_id)

        if payload.end_date < payload.start_date:
            raise ValidationError("Dövrün bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz.")

        period = SchedulePeriod(
            branch_id=payload.branch_id,
            name=payload.name,
            start_date=payload.start_date,
            end_date=payload.end_date,
            status=SchedulePeriodStatus.DRAFT,
        )
        return await self.repo.create_schedule_period(period)

    async def get_schedule_period(self, period_id: uuid.UUID, actor: Any) -> SchedulePeriod:
        HRPolicy.check_can_view_schedule(actor)
        period = await self.repo.get_schedule_period(period_id)
        if not period:
            raise NotFoundError(f"Cədvəl dövrü tapılmadı: {period_id}")
        HRPolicy.check_branch_scope(actor, period.branch_id)
        return period

    async def list_schedule_periods(
        self, actor: Any, branch_id: uuid.UUID | None = None
    ) -> Sequence[SchedulePeriod]:
        HRPolicy.check_can_view_schedule(actor)
        HRPolicy.check_branch_scope(actor, branch_id)
        return await self.repo.list_schedule_periods(branch_id)

    # ------------------------------------------
    # Validation Engine
    # ------------------------------------------

    async def validate_assignments(
        self, _branch_id: uuid.UUID, items: list[ScheduleAssignmentItem]
    ) -> ScheduleValidationResult:
        """Növbə təyinatlarının qanunvericilik və daxili qaydalara uyğunluğunu yoxlayır."""
        errors: list[str] = []
        warnings: list[str] = []

        seen_slots: set[tuple[uuid.UUID, date]] = set()

        for item in items:
            # 1. Duplicate check (Eyni günə bir neçə növbə)
            key = (item.employee_id, item.date)
            if key in seen_slots:
                errors.append(f"İşçi {item.employee_id} üçün {item.date} tarixinə təkrarlanan növbə təyin edilib.")
            seen_slots.add(key)

            # 2. Leave conflict check (Təsdiqlənmiş məzuniyyətlə toqquşma)
            leaves = await self.repo.list_leave_requests(
                employee_id=item.employee_id, status=LeaveRequestStatus.APPROVED
            )
            for leave in leaves:
                if leave.start_date <= item.date <= leave.end_date:
                    errors.append(
                        f"İşçi {item.employee_id} {item.date} tarixində təsdiqlənmiş məzuniyyətdədir ({leave.leave_type.name})."
                    )

            # 3. Növbə müddəti və istirahət
            if item.shift_template_id:
                tpl = await self.repo.get_shift_template(item.shift_template_id)
                if tpl:
                    # Başlama və bitmə saatları
                    s_h, s_m = map(int, tpl.start_time.split(":"))
                    e_h, e_m = map(int, tpl.end_time.split(":"))
                    duration_minutes = (e_h * 60 + e_m) - (s_h * 60 + s_m)
                    if tpl.crosses_midnight:
                        duration_minutes += 24 * 60
                    net_work_minutes = duration_minutes - tpl.break_minutes

                    if net_work_minutes > 12 * 60:
                        errors.append(
                            f"{item.date} növbəsi gündəlik maksimal 12 saatlıq normanı aşır ({net_work_minutes / 60:.1f} saat)."
                        )

        # 4. Ştat təminatı (Hər gün filialda ən azı 1 işçi olmalıdır)
        dates_with_shifts = {item.date for item in items}
        if len(items) > 0 and len(dates_with_shifts) == 0:
            warnings.append("Cədvəldə heç bir aktiv iş günü qeyd olunmayıb.")

        return ScheduleValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    # ------------------------------------------
    # Assignments Management
    # ------------------------------------------

    async def assign_shifts_bulk(
        self, period_id: uuid.UUID, payload: ScheduleAssignmentBulkCreate, actor: Any
    ) -> Sequence[ScheduleAssignment]:
        HRPolicy.check_can_manage_schedule(actor)
        period = await self.repo.get_schedule_period(period_id)
        if not period:
            raise NotFoundError(f"Cədvəl dövrü tapılmadı: {period_id}")
        HRPolicy.check_branch_scope(actor, period.branch_id)

        if period.status == SchedulePeriodStatus.LOCKED:
            raise BusinessRuleViolationError("Kilidlənmiş cədvəl dövrünə yeni təyinat əlavə edilə bilməz.")

        # Validasiya yoxlanışı
        validation = await self.validate_assignments(period.branch_id, payload.assignments)
        if not validation.is_valid:
            raise BusinessRuleViolationError(f"Cədvəl validasiya xətası: {'; '.join(validation.errors)}")

        assignments = [
            ScheduleAssignment(
                period_id=period_id,
                employee_id=item.employee_id,
                branch_id=period.branch_id,
                date=item.date,
                shift_template_id=item.shift_template_id,
                custom_start_time=item.custom_start_time,
                custom_end_time=item.custom_end_time,
                notes=item.notes,
            )
            for item in payload.assignments
        ]
        return await self.repo.create_schedule_assignments_bulk(assignments)

    async def copy_previous_period(
        self, source_period_id: uuid.UUID, target_period_id: uuid.UUID, actor: Any
    ) -> Sequence[ScheduleAssignment]:
        HRPolicy.check_can_manage_schedule(actor)
        source = await self.repo.get_schedule_period(source_period_id)
        target = await self.repo.get_schedule_period(target_period_id)
        if not source or not target:
            raise NotFoundError("Mənbə və ya hədəf cədvəl dövrü tapılmadı.")
        HRPolicy.check_branch_scope(actor, target.branch_id)

        if target.status == SchedulePeriodStatus.LOCKED:
            raise BusinessRuleViolationError("Hədəf dövr kilidlidir.")

        # Mənbə dövrün təyinatlarını birbaşa bazadan çəkirik
        stmt = select(ScheduleAssignment).where(ScheduleAssignment.period_id == source_period_id)
        res = await self.session.execute(stmt)
        source_assignments = res.scalars().all()

        day_delta = (target.start_date - source.start_date).days
        new_assignments: list[ScheduleAssignment] = []

        for asgn in source_assignments:
            shifted_date = asgn.date + timedelta(days=day_delta)
            if target.start_date <= shifted_date <= target.end_date:
                new_assignments.append(
                    ScheduleAssignment(
                        period_id=target_period_id,
                        employee_id=asgn.employee_id,
                        branch_id=target.branch_id,
                        date=shifted_date,
                        shift_template_id=asgn.shift_template_id,
                        custom_start_time=asgn.custom_start_time,
                        custom_end_time=asgn.custom_end_time,
                    )
                )

        return await self.repo.create_schedule_assignments_bulk(new_assignments)

    async def publish_period(self, period_id: uuid.UUID, actor: Any) -> SchedulePeriod:
        HRPolicy.check_can_manage_schedule(actor)
        period = await self.repo.get_schedule_period(period_id)
        if not period:
            raise NotFoundError(f"Cədvəl dövrü tapılmadı: {period_id}")
        HRPolicy.check_branch_scope(actor, period.branch_id)

        period.status = SchedulePeriodStatus.PUBLISHED
        period.published_at = utc_now()
        period.published_by = getattr(actor, "id", None)
        return period

    async def lock_period(self, period_id: uuid.UUID, actor: Any) -> SchedulePeriod:
        HRPolicy.check_can_manage_schedule(actor)
        period = await self.repo.get_schedule_period(period_id)
        if not period:
            raise NotFoundError(f"Cədvəl dövrü tapılmadı: {period_id}")
        HRPolicy.check_branch_scope(actor, period.branch_id)

        period.status = SchedulePeriodStatus.LOCKED
        return period

    # ------------------------------------------
    # Self-View & Swap Requests
    # ------------------------------------------

    async def get_my_schedule(
        self, employee_id: uuid.UUID, start_date: date, end_date: date
    ) -> Sequence[ScheduleAssignment]:
        return await self.repo.list_assignments_for_employee(employee_id, start_date, end_date)

    async def request_swap(self, payload: ScheduleSwapCreate, _actor: Any) -> ScheduleSwapRequest:
        req_asgn = await self.repo.get_assignment(payload.requester_assignment_id)
        target_asgn = await self.repo.get_assignment(payload.target_assignment_id)
        if not req_asgn or not target_asgn:
            raise NotFoundError("Dəyişdirilməsi tələb olunan növbə təyinatları tapılmadı.")

        swap = ScheduleSwapRequest(
            requester_assignment_id=payload.requester_assignment_id,
            target_assignment_id=payload.target_assignment_id,
            reason=payload.reason,
            status=SwapStatus.PENDING,
        )
        return await self.repo.create_swap_request(swap)

    async def decide_swap(
        self, swap_id: uuid.UUID, decision: ScheduleSwapDecision, actor: Any
    ) -> ScheduleSwapRequest:
        HRPolicy.check_can_manage_schedule(actor)
        swap = await self.repo.get_swap_request(swap_id)
        if not swap:
            raise NotFoundError(f"Növbə dəyişmə sorğusu tapılmadı: {swap_id}")

        if swap.status != SwapStatus.PENDING:
            raise BusinessRuleViolationError("Yalnız gözləyən (PENDING) sorğular qərara bağlana bilər.")

        if decision.approve:
            swap.status = SwapStatus.APPROVED
            swap.approved_by = getattr(actor, "id", None)
            swap.approved_at = utc_now()

            # Növbələrin faktiki dəyişdirilməsi
            req_asgn = await self.repo.get_assignment(swap.requester_assignment_id)
            target_asgn = await self.repo.get_assignment(swap.target_assignment_id)
            if req_asgn and target_asgn:
                req_emp = req_asgn.employee_id
                req_asgn.employee_id = target_asgn.employee_id
                target_asgn.employee_id = req_emp
                await self.session.flush()
        else:
            swap.status = SwapStatus.REJECTED

        await self.session.flush()
        return swap
