"""Maaş Sənədləri (Payroll Runs), SoD, Outbox və Bank İxracı Testləri."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BusinessRuleViolationError
from app.modules.hr.models import Employee, EmployeeStatus
from app.modules.payroll.models import (
    CompensationModel,
    PayrollRunStatus,
    SalaryProfile,
)
from app.modules.payroll.schemas import (
    PayrollRuleSetCreate,
    PayrollRunCreate,
    SalaryProfileCreate,
)
from app.modules.payroll.service import PayrollService
from app.shared.outbox import OutboxEvent


class MockUser:
    def __init__(self, user_id: uuid.UUID, roles: list[str], permissions: list[str]) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions
        self.allowed_branches: list[uuid.UUID] = []


@pytest.fixture
def preparer_actor() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["hr_manager"],
        permissions=[
            "payroll.run.create",
            "payroll.run.view",
            "payroll.profile.manage",
            "payroll.profile.view",
            "payroll.rules.manage",
            "payroll.run.finalize",
            "payroll.run.pay",
            "payroll.export",
            "payroll.payslip.view",
        ],
    )


@pytest.fixture
def approver_actor() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["accountant"],
        permissions=[
            "payroll.run.approve",
            "payroll.run.view",
            "payroll.run.finalize",
            "payroll.run.pay",
            "payroll.export",
            "payroll.payslip.view",
        ],
    )


@pytest.mark.asyncio
async def test_payroll_run_lifecycle_and_sod_enforcement(
    session: AsyncSession, preparer_actor: MockUser, approver_actor: MockUser
) -> None:
    service = PayrollService(session)
    branch_id = uuid.uuid4()

    # 1. İşçilər və Qaydalar bazası
    emp1_id = uuid.uuid4()
    emp1 = Employee(
        id=emp1_id,
        employee_no="EMP-RUN-1",
        full_name="Nihad Quliyev",
        email="nihad@brandhouse.az",
        phone="1",
        job_title="Satıcı",
        hire_date=date(2026, 1, 1),
        branch_id=branch_id,
        status=EmployeeStatus.ACTIVE,
    )
    session.add(emp1)
    await session.flush()

    await service.create_salary_profile(
        SalaryProfileCreate(
            employee_id=emp1_id,
            effective_date=date(2026, 1, 1),
            compensation_model=CompensationModel.FIXED,
            base_salary=Decimal("1200.00"),
        ),
        preparer_actor,
    )

    await service.create_rule_set(
        PayrollRuleSetCreate(
            name="Standart Qaydalar",
            effective_date=date(2026, 1, 1),
            rules_config={
                "dsmf_employee_rate": "0.03",
                "its_employee_rate": "0.02",
                "unemployment_employee_rate": "0.00",
            },
        ),
        preparer_actor,
    )

    # 2. DRAFT dövrü yaradılması
    run = await service.create_payroll_run(
        PayrollRunCreate(
            period_start=date(2026, 10, 1),
            period_end=date(2026, 10, 31),
            branch_id=branch_id,
        ),
        preparer_actor,
    )
    assert run.status == PayrollRunStatus.DRAFT
    assert run.prepared_by == preparer_actor.id

    # 3. Hesablama (CALCULATED)
    calc_run = await service.calculate_payroll_run(run.id, preparer_actor)
    assert calc_run.status == PayrollRunStatus.CALCULATED
    assert calc_run.total_gross == Decimal("1200.00")
    assert calc_run.total_employee_taxes == Decimal("60.00")  # (3% + 2% = 5%)
    assert calc_run.total_net == Decimal("1140.00")
    assert calc_run.input_hash is not None

    # 4. Rəyə göndərmə (UNDER_REVIEW)
    review_run = await service.submit_for_review(run.id, preparer_actor)
    assert review_run.status == PayrollRunStatus.UNDER_REVIEW

    # 5. SoD Yoxlanışı: Hazırlayan şəxs (preparer) özü təsdiq edə bilməz!
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await service.approve_payroll_run(run.id, preparer_actor)
    assert "SoD Qaydası" in str(exc_info.value)

    # Müstəqil təsdiqçi (approver) təsdiq edir
    approved_run = await service.approve_payroll_run(run.id, approver_actor)
    assert approved_run.status == PayrollRunStatus.APPROVED
    assert approved_run.approved_by == approver_actor.id

    # 6. Yekunlaşdırma (FINALIZED) və Outbox Hadisəsi
    finalized_run = await service.finalize_payroll_run(run.id, approver_actor)
    assert finalized_run.status == PayrollRunStatus.FINALIZED

    # Filial bölgüsü yoxlanışı
    assert len(finalized_run.branch_allocations) == 1
    alloc = finalized_run.branch_allocations[0]
    assert alloc.branch_id == branch_id
    assert alloc.allocated_gross == Decimal("1200.00")
    assert alloc.allocated_net == Decimal("1140.00")

    # Transactional outbox hadisəsi
    outbox_stmt = select(OutboxEvent).where(
        OutboxEvent.aggregate_id == str(run.id),
        OutboxEvent.event_type == "payroll.finalized",
    )
    outbox_res = await session.execute(outbox_stmt)
    outbox_evt = outbox_res.scalar_one()
    assert outbox_evt.payload["total_net_salary"] == "1140.00"
    assert len(outbox_evt.payload["allocations"]) == 1

    # 7. Bank faylı ixracı
    bank_export = await service.export_bank_payment_file(run.id, approver_actor)
    assert bank_export.total_records == 1
    assert bank_export.total_amount == Decimal("1140.00")
    assert "EMP-RUN-1;Nihad Quliyev" in bank_export.content

    # 8. Rəsmi PDF payslip generasiyası (ReportLab)
    payslip_id = finalized_run.payslips[0].id
    pdf_bytes = await service.generate_payslip_pdf(payslip_id, approver_actor)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 500

    # 9. Ödənildi statusu
    paid_run = await service.mark_run_as_paid(run.id, approver_actor)
    assert paid_run.status == PayrollRunStatus.PAID


@pytest.mark.asyncio
async def test_payroll_reversal_run(
    session: AsyncSession, preparer_actor: MockUser, approver_actor: MockUser
) -> None:
    service = PayrollService(session)

    # Sadə run yaradıb final edirik
    emp_id = uuid.uuid4()
    session.add(
        Employee(
            id=emp_id,
            employee_no="EMP-REV-1",
            full_name="Kərim",
            email="k@b.az",
            phone="1",
            job_title="J",
            hire_date=date(2026, 1, 1),
            status=EmployeeStatus.ACTIVE,
        )
    )
    session.add(
        SalaryProfile(
            employee_id=emp_id,
            effective_date=date(2026, 1, 1),
            compensation_model=CompensationModel.FIXED,
            base_salary=Decimal("600.00"),
        )
    )
    await session.flush()

    run = await service.create_payroll_run(
        PayrollRunCreate(period_start=date(2026, 10, 1), period_end=date(2026, 10, 31)),
        preparer_actor,
    )
    await service.calculate_payroll_run(run.id, preparer_actor)
    await service.submit_for_review(run.id, preparer_actor)
    await service.approve_payroll_run(run.id, approver_actor)
    await service.finalize_payroll_run(run.id, approver_actor)

    # Reversal sənədi yaradılması
    reversal_run = await service.create_reversal_run(
        run.id, reason="Səhv filial üzrə qeydiyyat", actor=approver_actor
    )
    assert reversal_run.reversal_of_run_id == run.id
    assert reversal_run.total_gross == Decimal("-600.00")
    assert reversal_run.total_net == Decimal("-567.00")
    assert reversal_run.payslips[0].gross_pay == Decimal("-600.00")
