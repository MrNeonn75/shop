"""HR Modulu: Növbələr, Qrafik Validasiyası və Dəyişmə Sorğuları Testləri."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.hr.models import (
    Employee,
    EmployeeStatus,
    LeaveRequest,
    LeaveRequestStatus,
    LeaveType,
    SchedulePeriodStatus,
    ShiftTemplate,
    SwapStatus,
)
from app.modules.hr.schemas import (
    ScheduleAssignmentBulkCreate,
    ScheduleAssignmentItem,
    SchedulePeriodCreate,
    ScheduleSwapCreate,
    ScheduleSwapDecision,
    ShiftTemplateCreate,
)
from app.modules.hr.services.schedule_service import ScheduleService


class MockUser:
    def __init__(self, user_id: uuid.UUID, roles: list[str], permissions: list[str]) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions
        self.allowed_branches: list[uuid.UUID] = []


@pytest.fixture
def hr_actor() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["hr_manager"],
        permissions=["hr.schedule.manage", "hr.schedule.view"],
    )


@pytest.mark.asyncio
async def test_schedule_shift_templates_and_periods(
    session: AsyncSession, hr_actor: MockUser
) -> None:
    service = ScheduleService(session)
    branch_id = uuid.uuid4()

    tpl = await service.create_shift_template(
        ShiftTemplateCreate(
            name="Səhər Növbəsi",
            code="SHIFT_MORNING",
            start_time="09:00",
            end_time="18:00",
            break_minutes=60,
            branch_id=branch_id,
        ),
        hr_actor,
    )
    assert tpl.id is not None
    assert tpl.start_time == "09:00"

    period = await service.create_schedule_period(
        SchedulePeriodCreate(
            branch_id=branch_id,
            name="2026-H43 Qrafiki",
            start_date=date(2026, 10, 19),
            end_date=date(2026, 10, 25),
        ),
        hr_actor,
    )
    assert period.status == SchedulePeriodStatus.DRAFT


@pytest.mark.asyncio
async def test_schedule_validation_engine_conflicts(
    session: AsyncSession, hr_actor: MockUser
) -> None:
    service = ScheduleService(session)
    branch_id = uuid.uuid4()

    # 1. İşçi yaradırıq
    emp_id = uuid.uuid4()
    emp = Employee(
        id=emp_id,
        employee_no="EMP-SCH-1",
        full_name="Kənan Məmmədli",
        email="kenan@brandhouse.az",
        phone="+994501112233",
        job_title="Kassir",
        hire_date=date(2026, 1, 1),
        branch_id=branch_id,
        status=EmployeeStatus.ACTIVE,
    )
    session.add(emp)

    # 2. Həmin günə təsdiqlənmiş məzuniyyət əlavə edirik
    lt = LeaveType(code="ANNUAL", name="Əsas Məzuniyyət", is_paid=True)
    session.add(lt)
    await session.flush()

    leave_req = LeaveRequest(
        employee_id=emp_id,
        leave_type_id=lt.id,
        start_date=date(2026, 10, 20),
        end_date=date(2026, 10, 22),
        days_count=3,
        status=LeaveRequestStatus.APPROVED,
    )
    session.add(leave_req)

    # 3. Şablonlar
    normal_tpl = ShiftTemplate(
        name="Normal Növbə",
        code="NORMAL_SHIFT",
        start_time="09:00",
        end_time="18:00",
        break_minutes=60,
    )
    overload_tpl = ShiftTemplate(
        name="14 Saatlıq Növbə",
        code="LONG_SHIFT",
        start_time="08:00",
        end_time="23:00",
        break_minutes=60,
    )
    session.add_all([normal_tpl, overload_tpl])
    await session.flush()

    # Period
    await service.create_schedule_period(
        SchedulePeriodCreate(
            branch_id=branch_id,
            name="2026-H43",
            start_date=date(2026, 10, 19),
            end_date=date(2026, 10, 25),
        ),
        hr_actor,
    )

    # Test A: Məzuniyyət ziddiyyəti (Leave conflict)
    conflict_items = [
        ScheduleAssignmentItem(
            employee_id=emp_id,
            date=date(2026, 10, 20),  # İşçi məzuniyyətdədir!
            shift_template_id=normal_tpl.id,
        )
    ]
    val_res = await service.validate_assignments(branch_id, conflict_items)
    assert not val_res.is_valid
    assert any("məzuniyyətdədir" in err for err in val_res.errors)

    # Test B: Eyni günə təkrar növbə təyini (Duplicate check)
    dup_items = [
        ScheduleAssignmentItem(
            employee_id=emp_id, date=date(2026, 10, 23), shift_template_id=normal_tpl.id
        ),
        ScheduleAssignmentItem(
            employee_id=emp_id, date=date(2026, 10, 23), shift_template_id=normal_tpl.id
        ),
    ]
    dup_val = await service.validate_assignments(branch_id, dup_items)
    assert not dup_val.is_valid
    assert any("təkrarlanan növbə" in err for err in dup_val.errors)

    # Test C: 12 saatdan artıq növbə norması aşılması
    long_items = [
        ScheduleAssignmentItem(
            employee_id=emp_id, date=date(2026, 10, 24), shift_template_id=overload_tpl.id
        )
    ]
    long_val = await service.validate_assignments(branch_id, long_items)
    assert not long_val.is_valid
    assert any("maksimal 12 saatlıq normanı aşır" in err for err in long_val.errors)


@pytest.mark.asyncio
async def test_schedule_assignment_bulk_copy_and_publish(
    session: AsyncSession, hr_actor: MockUser
) -> None:
    service = ScheduleService(session)
    branch_id = uuid.uuid4()

    emp_id = uuid.uuid4()
    session.add(
        Employee(
            id=emp_id,
            employee_no="EMP-SCH-2",
            full_name="Samir Rəhimov",
            email="samir@brandhouse.az",
            phone="+994508889900",
            job_title="Satıcı",
            hire_date=date(2026, 1, 1),
            branch_id=branch_id,
        )
    )
    tpl = ShiftTemplate(
        name="Standart",
        code="STD",
        start_time="10:00",
        end_time="19:00",
        break_minutes=60,
    )
    session.add(tpl)
    await session.flush()

    period1 = await service.create_schedule_period(
        SchedulePeriodCreate(
            branch_id=branch_id,
            name="Period 1",
            start_date=date(2026, 10, 5),
            end_date=date(2026, 10, 11),
        ),
        hr_actor,
    )

    # Toplu təyinat
    items = [
        ScheduleAssignmentItem(
            employee_id=emp_id, date=date(2026, 10, 5), shift_template_id=tpl.id
        ),
        ScheduleAssignmentItem(
            employee_id=emp_id, date=date(2026, 10, 6), shift_template_id=tpl.id
        ),
    ]
    created = await service.assign_shifts_bulk(
        period1.id, ScheduleAssignmentBulkCreate(assignments=items), hr_actor
    )
    assert len(created) == 2

    # Dərc etmə və Kilidləmə
    pub_period = await service.publish_period(period1.id, hr_actor)
    assert pub_period.status == SchedulePeriodStatus.PUBLISHED
    assert pub_period.published_by == hr_actor.id

    locked_period = await service.lock_period(period1.id, hr_actor)
    assert locked_period.status == SchedulePeriodStatus.LOCKED

    # Yeni dövr yaradıb əvvəlkindən kopyalayırıq
    period2 = await service.create_schedule_period(
        SchedulePeriodCreate(
            branch_id=branch_id,
            name="Period 2",
            start_date=date(2026, 10, 12),
            end_date=date(2026, 10, 18),
        ),
        hr_actor,
    )
    copied = await service.copy_previous_period(period1.id, period2.id, hr_actor)
    assert len(copied) == 2
    assert copied[0].date == date(2026, 10, 12)


@pytest.mark.asyncio
async def test_schedule_swap_request_workflow(
    session: AsyncSession, hr_actor: MockUser
) -> None:
    service = ScheduleService(session)
    branch_id = uuid.uuid4()

    emp1_id = uuid.uuid4()
    emp2_id = uuid.uuid4()
    session.add_all(
        [
            Employee(
                id=emp1_id,
                employee_no="EMP-SWAP-1",
                full_name="Aysel",
                email="aysel@brandhouse.az",
                phone="1",
                job_title="Kassir",
                hire_date=date(2026, 1, 1),
            ),
            Employee(
                id=emp2_id,
                employee_no="EMP-SWAP-2",
                full_name="Nərgiz",
                email="nergiz@brandhouse.az",
                phone="2",
                job_title="Kassir",
                hire_date=date(2026, 1, 1),
            ),
        ]
    )
    tpl = ShiftTemplate(name="S", code="S", start_time="09:00", end_time="18:00")
    session.add(tpl)
    await session.flush()

    period = await service.create_schedule_period(
        SchedulePeriodCreate(
            branch_id=branch_id,
            name="Swap Period",
            start_date=date(2026, 10, 19),
            end_date=date(2026, 10, 25),
        ),
        hr_actor,
    )

    items = [
        ScheduleAssignmentItem(
            employee_id=emp1_id, date=date(2026, 10, 19), shift_template_id=tpl.id
        ),
        ScheduleAssignmentItem(
            employee_id=emp2_id, date=date(2026, 10, 20), shift_template_id=tpl.id
        ),
    ]
    asgns = await service.assign_shifts_bulk(
        period.id, ScheduleAssignmentBulkCreate(assignments=items), hr_actor
    )
    asgn1, asgn2 = asgns[0], asgns[1]

    # Swap sorğusu
    swap = await service.request_swap(
        ScheduleSwapCreate(
            requester_assignment_id=asgn1.id,
            target_assignment_id=asgn2.id,
            reason="Ailə vəziyyəti ilə əlaqədar gün dəyişimi",
        ),
        hr_actor,
    )
    assert swap.status == SwapStatus.PENDING

    # Təsdiq
    decided = await service.decide_swap(
        swap.id, ScheduleSwapDecision(approve=True), hr_actor
    )
    assert decided.status == SwapStatus.APPROVED

    # Növbələrin faktiki dəyişdirildiyini yoxlayırıq
    await session.refresh(asgn1)
    await session.refresh(asgn2)
    assert asgn1.employee_id == emp2_id
    assert asgn2.employee_id == emp1_id
