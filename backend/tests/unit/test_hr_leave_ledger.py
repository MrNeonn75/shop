"""HR Modulu: Məzuniyyət və Append-Only Məzuniyyət Jurnalı Testləri."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BusinessRuleViolationError, ValidationError
from app.modules.hr.models import Employee, EmployeeStatus, LeaveEntryType, LeaveRequestStatus
from app.modules.hr.schemas import (
    LeaveLedgerEntryCreate,
    LeaveRequestCreate,
    LeaveRequestDecision,
    LeaveTypeCreate,
)
from app.modules.hr.services.leave_service import LeaveService


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
            "hr.leave.request",
            "hr.leave.approve",
            "hr.leave.ledger.view",
            "hr.leave.ledger.adjust",
            "hr.employee.manage",
        ],
    )


@pytest.fixture
def employee_user() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["cashier"],
        permissions=["hr.leave.request"],
    )


@pytest.mark.asyncio
async def test_append_only_leave_ledger_derived_balance(
    session: AsyncSession, hr_actor: MockUser, employee_user: MockUser
) -> None:
    service = LeaveService(session)

    # 1. İşçi və Məzuniyyət növü yaradılır
    emp_id = uuid.uuid4()
    emp = Employee(
        id=emp_id,
        employee_no="EMP-LV-1",
        full_name="Nərmin Qasımova",
        email="narmin@brandhouse.az",
        phone="111",
        job_title="Satıcı",
        hire_date=date(2026, 1, 1),
        linked_user_id=employee_user.id,
        status=EmployeeStatus.ACTIVE,
    )
    session.add(emp)

    lt = await service.create_leave_type(
        LeaveTypeCreate(
            code="ANNUAL",
            name="Əsas Əmək Məzuniyyəti",
            is_paid=True,
            accrual_rate_per_month=Decimal("1.75"),
        ),
        hr_actor,
    )

    # İlkin qalıq 0 olmalıdır
    accrued, used, balance = await service.repo.get_leave_balance(emp_id, lt.id)
    assert balance == Decimal("0.00")

    # 2. Append-only jurnala əlavə (İllik ilkin qalıq +21 gün)
    await service.adjust_leave_ledger(
        LeaveLedgerEntryCreate(
            employee_id=emp_id,
            leave_type_id=lt.id,
            entry_type=LeaveEntryType.ADJUSTMENT,
            days=Decimal("21.00"),
            effective_date=date(2026, 1, 1),
            notes="İllik məzuniyyət kvotası təyini",
        ),
        hr_actor,
    )

    accrued, used, balance = await service.repo.get_leave_balance(emp_id, lt.id)
    assert accrued == Decimal("21.00")
    assert used == Decimal("0.00")
    assert balance == Decimal("21.00")

    # 3. Məzuniyyət sorğusu verilməsi (5 gün)
    req = await service.request_leave(
        LeaveRequestCreate(
            employee_id=emp_id,
            leave_type_id=lt.id,
            start_date=date(2026, 7, 10),
            end_date=date(2026, 7, 14),
            days_count=Decimal("5.00"),
            reason="Ailəvi istirahət",
        ),
        employee_user,
    )
    assert req.status == LeaveRequestStatus.PENDING

    # 4. SoD: İşçi öz məzuniyyətini özü təsdiq edə bilməz!
    with pytest.raises(BusinessRuleViolationError):
        await service.decide_leave(
            req.id, LeaveRequestDecision(approve=True), actor=employee_user
        )

    # 5. Səlahiyyətli HR menecer təsdiq edir
    decided = await service.decide_leave(
        req.id, LeaveRequestDecision(approve=True), actor=hr_actor
    )
    assert decided.status == LeaveRequestStatus.APPROVED
    assert decided.approved_by == hr_actor.id

    # 6. Təsdiqdən dərhal sonra balans təkrar törənir: 21 - 5 = 16 gün!
    accrued, used, balance = await service.repo.get_leave_balance(emp_id, lt.id)
    assert accrued == Decimal("21.00")
    assert used == Decimal("5.00")
    assert balance == Decimal("16.00")


@pytest.mark.asyncio
async def test_leave_insufficient_balance_and_attachment_validation(
    session: AsyncSession, hr_actor: MockUser, employee_user: MockUser
) -> None:
    service = LeaveService(session)

    emp_id = uuid.uuid4()
    session.add(
        Employee(
            id=emp_id,
            employee_no="EMP-LV-2",
            full_name="Orxan Vəliyev",
            email="orxan@brandhouse.az",
            phone="222",
            job_title="Kassir",
            hire_date=date(2026, 1, 1),
            linked_user_id=employee_user.id,
        )
    )

    # Xəstəlik məzuniyyəti (sənəd tələb edən)
    sick_lt = await service.create_leave_type(
        LeaveTypeCreate(
            code="SICK",
            name="Xəstəlik Vərəqəsi",
            is_paid=True,
            requires_attachment=True,
        ),
        hr_actor,
    )

    # 1. Attachment olmadan xəstəlik məzuniyyəti sorğusu -> ValidationError
    with pytest.raises(ValidationError):
        await service.request_leave(
            LeaveRequestCreate(
                employee_id=emp_id,
                leave_type_id=sick_lt.id,
                start_date=date(2026, 4, 1),
                end_date=date(2026, 4, 3),
                days_count=Decimal("3.00"),
                reason="Soyuqdəymə",
                attachment_url=None,  # Boşdur!
            ),
            employee_user,
        )

    # 2. Kifayət qədər balans olmadıqda ödənişli məzuniyyət sorğusu -> BusinessRuleViolationError
    with pytest.raises(BusinessRuleViolationError):
        await service.request_leave(
            LeaveRequestCreate(
                employee_id=emp_id,
                leave_type_id=sick_lt.id,
                start_date=date(2026, 4, 1),
                end_date=date(2026, 4, 3),
                days_count=Decimal("3.00"),
                reason="Soyuqdəymə",
                attachment_url="https://storage.local/sick_leaf.pdf",
            ),
            employee_user,
        )
