"""HR Modulu: Davamiyyət, Xam Qeydlər, Kənarlaşmalar və Tabel Testləri."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BusinessRuleViolationError
from app.modules.hr.models import (
    AttendanceStatus,
    Employee,
    PunchType,
    ScheduleAssignment,
    ShiftTemplate,
    TimesheetStatus,
)
from app.modules.hr.schemas import (
    AttendanceCorrectionCreate,
    AttendancePunchCreate,
    TimesheetReopenRequest,
)
from app.modules.hr.services.attendance_service import AttendanceService


class MockUser:
    def __init__(self, user_id: uuid.UUID, roles: list[str], permissions: list[str]) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions


@pytest.fixture
def hr_actor() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["hr_manager"],
        permissions=[
            "hr.attendance.record",
            "hr.attendance.correct",
            "hr.attendance.view",
            "hr.timesheet.manage",
            "hr.timesheet.view",
            "hr.timesheet.reopen",
        ],
    )


@pytest.fixture
def supervisor_actor() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["branch_manager"],
        permissions=["hr.timesheet.manage", "hr.timesheet.reopen"],
    )


@pytest.mark.asyncio
async def test_punch_recording_and_deterministic_daily_attendance(
    session: AsyncSession, hr_actor: MockUser
) -> None:
    service = AttendanceService(session)

    # 1. İşçi və Növbə şablonu (09:00 - 18:00, 60 dəqiqə fasilə)
    emp_id = uuid.uuid4()
    session.add(
        Employee(
            id=emp_id,
            employee_no="EMP-ATT-1",
            full_name="Elnur Qasımov",
            email="elnur@brandhouse.az",
            phone="123",
            job_title="Satıcı",
            hire_date=date(2026, 1, 1),
        )
    )
    tpl = ShiftTemplate(
        name="9-6 Növbəsi",
        code="9_6",
        start_time="09:00",
        end_time="18:00",
        break_minutes=60,
    )
    session.add(tpl)
    await session.flush()

    work_date = date(2026, 10, 20)
    # Təyinat
    period_id = uuid.uuid4()
    asgn = ScheduleAssignment(
        period_id=period_id,
        employee_id=emp_id,
        branch_id=uuid.uuid4(),
        date=work_date,
        shift_template_id=tpl.id,
    )
    session.add(asgn)
    await session.flush()

    # 2. Giriş qeydi (Punch IN) saat 09:12 (12 dəqiqə gecikmə)
    dt_in = datetime(2026, 10, 20, 9, 12, tzinfo=UTC)
    await service.record_punch(
        AttendancePunchCreate(
            employee_id=emp_id,
            punch_time=dt_in,
            punch_type=PunchType.IN,
        ),
        hr_actor,
    )

    # Çıxış olmadığı üçün EXCEPTION statusunda olmalıdır
    da = await service.repo.get_daily_attendance_by_date(emp_id, work_date)
    assert da is not None
    assert da.status == AttendanceStatus.EXCEPTION
    assert "punch-out" in (da.exception_reason or "")

    # 3. Çıxış qeydi (Punch OUT) saat 18:30 (30 dəqiqə əlavə vaxt)
    dt_out = datetime(2026, 10, 20, 18, 30, tzinfo=UTC)
    await service.record_punch(
        AttendancePunchCreate(
            employee_id=emp_id,
            punch_time=dt_out,
            punch_type=PunchType.OUT,
        ),
        hr_actor,
    )

    # Gündəlik davamiyyət yenilənir
    await session.refresh(da)
    assert da.status == AttendanceStatus.NORMAL
    assert da.late_minutes == 12
    assert da.overtime_minutes == 30
    assert not da.is_absent


@pytest.mark.asyncio
async def test_non_destructive_attendance_correction(
    session: AsyncSession, hr_actor: MockUser
) -> None:
    service = AttendanceService(session)

    emp_id = uuid.uuid4()
    session.add(
        Employee(
            id=emp_id,
            employee_no="EMP-ATT-2",
            full_name="Günel Həsənova",
            email="gunel@brandhouse.az",
            phone="456",
            job_title="Kassir",
            hire_date=date(2026, 1, 1),
        )
    )
    work_date = date(2026, 10, 21)
    await session.flush()

    # Avtomatik hesablanmış qeyd (məs: çıxış unudulub və kənarlaşma yaranıb)
    da = await service.recompute_daily_attendance(emp_id, work_date)
    assert da.status in (AttendanceStatus.NORMAL, AttendanceStatus.EXCEPTION)

    # Menecer düzəlişi
    corr = await service.correct_attendance(
        da.id,
        AttendanceCorrectionCreate(
            reason="İşçi texniki nasazlıq səbəbindən çıxış kartını vura bilməmişdir",
            regular_minutes=480,  # 8 saat
            overtime_minutes=0,
            is_absent=False,
        ),
        hr_actor,
    )
    assert corr.id is not None
    assert corr.corrected_by == hr_actor.id
    assert "texniki nasazlıq" in corr.reason

    # Dəyişdirilmiş status
    await session.refresh(da)
    assert da.status == AttendanceStatus.CORRECTED
    assert da.regular_minutes == 480


@pytest.mark.asyncio
async def test_timesheet_lifecycle_and_sod_reopen(
    session: AsyncSession, hr_actor: MockUser, supervisor_actor: MockUser
) -> None:
    service = AttendanceService(session)

    emp_id = uuid.uuid4()
    session.add(
        Employee(
            id=emp_id,
            employee_no="EMP-ATT-3",
            full_name="Tural Nəsirov",
            email="tural@brandhouse.az",
            phone="789",
            job_title="Menecer Köməkçisi",
            hire_date=date(2026, 1, 1),
        )
    )
    await session.flush()

    # 1. Tabel formalaşdırılması
    ts = await service.generate_timesheet(emp_id, year=2026, month=10, actor=hr_actor)
    assert ts.status == TimesheetStatus.DRAFT

    # 2. Təsdiqə göndərmə və Təsdiq
    submitted = await service.submit_timesheet(ts.id, hr_actor)
    assert submitted.status == TimesheetStatus.SUBMITTED

    approved = await service.approve_timesheet(ts.id, hr_actor)
    assert approved.status == TimesheetStatus.APPROVED
    assert approved.approved_by == hr_actor.id

    # 3. Kilidləmə (Maaş hesablaması üçün dondurulur)
    locked = await service.lock_timesheet(ts.id, hr_actor)
    assert locked.status == TimesheetStatus.LOCKED
    assert locked.locked_at is not None

    # Kilidlənmiş tabel yenidən hesablana bilməz
    with pytest.raises(BusinessRuleViolationError):
        await service.generate_timesheet(emp_id, year=2026, month=10, actor=hr_actor)

    # 4. SoD: Tabeli təsdiqləyən/kilidləyən şəxs təkbaşına onu aça bilməz!
    with pytest.raises(BusinessRuleViolationError):
        await service.reopen_timesheet(
            ts.id,
            TimesheetReopenRequest(reason="Davamiyyətə əlavə qeydlər daxil edilməlidir"),
            actor=hr_actor,  # hr_actor təsdiq edib, özü təkbaşına aça bilməz
        )

    # Digər səlahiyyətli menecer (supervisor_actor) aça bilər
    reopened = await service.reopen_timesheet(
        ts.id,
        TimesheetReopenRequest(reason="Davamiyyətə əlavə qeydlər daxil edilməlidir"),
        actor=supervisor_actor,
    )
    assert reopened.status == TimesheetStatus.DRAFT
    assert reopened.reopen_by == supervisor_actor.id
