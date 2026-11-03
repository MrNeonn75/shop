"""Xərclər, Təsdiqlər, SoD və Xərc Bölgüsü Vahid Testləri (Expenses & Allocations)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.core.errors import BusinessRuleViolationError, ValidationError
from app.modules.finance.schemas import (
    AttachmentPayload,
    ExpenseCreate,
    ExpensePayRequest,
    ExpenseReverseRequest,
    FinancialAccountCreate,
    RecurringTemplateCreate,
    SharedCostPreviewRequest,
)
from app.modules.finance.service import FinanceService


class MockActor:
    def __init__(self, user_id: uuid.UUID, roles: list[str], permissions: list[str]) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions


@pytest.mark.asyncio
async def test_expense_attachment_validation(db_session):
    """Qoşma faylın format və ölçü tələbləri yoxlanılır."""
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    service = FinanceService()
    admin = MockActor(uuid.uuid4(), ["system_admin"], ["finance.expense.create", "finance.budget.manage"])

    cat = await service.create_expense_category(company_id, "EXP-OFFICE", "Ofis ləvazimatları", actor=admin)

    # 1. Qadağan olunmuş MIME formatı (məs: exe və ya zip)
    invalid_att_data = ExpenseCreate(
        branch_id=branch_id,
        category_id=cat.id,
        gross_amount=Decimal("150.0000"),
        expense_date=date.today(),
        description="Dəftərxana malları",
        attachments=[
            AttachmentPayload(
                url="https://storage/files/malicious.exe",
                filename="malicious.exe",
                mime_type="application/x-msdownload",
                size_bytes=1024,
            )
        ],
    )
    with pytest.raises(ValidationError) as exc:
        await service.create_expense(company_id, invalid_att_data, admin)
    assert "Dəstəklənməyən fayl formatı" in str(exc.value)

    # 2. 10 MB-dan böyük fayl
    too_large_att_data = ExpenseCreate(
        branch_id=branch_id,
        category_id=cat.id,
        gross_amount=Decimal("150.0000"),
        expense_date=date.today(),
        description="Dəftərxana malları",
        attachments=[
            AttachmentPayload(
                url="https://storage/files/huge_scan.pdf",
                filename="huge_scan.pdf",
                mime_type="application/pdf",
                size_bytes=15 * 1024 * 1024,  # 15 MB
            )
        ],
    )
    with pytest.raises(ValidationError) as exc:
        await service.create_expense(company_id, too_large_att_data, admin)
    assert "10 MB həddini aşır" in str(exc.value)


@pytest.mark.asyncio
async def test_expense_sod_and_payment_flow(db_session):
    """Xərcin yaradılması, SoD təsdiqi, ödənişi və ləğvi ssenarisi."""
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    service = FinanceService()

    creator = MockActor(uuid.uuid4(), ["staff"], ["finance.expense.create", "finance.expense.approve"])
    approver = MockActor(uuid.uuid4(), ["manager"], ["finance.expense.approve", "finance.expense.pay", "finance.expense.reverse"])
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    cat = await service.create_expense_category(company_id, "EXP-RENT", "İcarə haqqı", actor=admin)

    # Bank hesabı yaradırıq və 5000 AZN qoyuruq
    bank_acc = await service.create_account(
        company_id,
        FinancialAccountCreate(code="BANK-EXP-01", name="Xərclər Bank Hesabı", type="bank"),
        admin,
    )
    await service.record_opening_balance(company_id, bank_acc.id, Decimal("5000.0000"), admin)

    # 1. Creator tərəfindən xərc yaradılır
    exp_data = ExpenseCreate(
        branch_id=branch_id,
        category_id=cat.id,
        gross_amount=Decimal("1200.0000"),
        tax_amount=Decimal("200.0000"),
        expense_date=date.today(),
        description="Mağaza icarə haqqı",
    )
    expense = await service.create_expense(company_id, exp_data, creator)
    assert expense.status == "DRAFT"
    assert expense.net_amount == Decimal("1000.0000")

    # 2. SoD Qaydası: Creator öz xərcini təsdiq edə bilməz!
    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.approve_expense(expense.id, creator)
    assert "Vəzifələrin Bölünməsi (SoD) Qaydası" in str(exc.value)

    # 3. Başqa səlahiyyətli şəxs (approver) təsdiq edir
    approved_exp = await service.approve_expense(expense.id, approver)
    assert approved_exp.status == "APPROVED"

    # 4. Xərc ödənilir -> Eyni tranzaksiyada bankdan 1200 AZN çıxır (OUT)
    paid_exp = await service.pay_expense(
        expense.id, ExpensePayRequest(payment_account_id=bank_acc.id), approver
    )
    assert paid_exp.status == "PAID"

    bank_bal = await service.get_account_balance(bank_acc.id, admin)
    assert bank_bal == Decimal("3800.0000")  # 5000 - 1200

    # 5. Ödənilmiş xərcin kompensasiya ilə ləğvi (Reverse)
    rev_exp = await service.reverse_expense(
        expense.id, ExpenseReverseRequest(reason="Səhv faktura məbləği"), approver
    )
    assert rev_exp.status == "REVERSED"
    assert rev_exp.reversal_of_id == expense.id

    # Bank balansı geri bərpa olunmalıdır
    restored_bal = await service.get_account_balance(bank_acc.id, admin)
    assert restored_bal == Decimal("5000.0000")


@pytest.mark.asyncio
async def test_shared_cost_allocation_largest_remainder_sums_exactly(db_session):
    """Mərkəzi xərcin filiallar arasında Largest Remainder bölgüsü hər zaman tam məbləğə bərabərdir."""
    service = FinanceService()
    b1 = uuid.uuid4()
    b2 = uuid.uuid4()
    b3 = uuid.uuid4()

    # 100.00 AZN 3 bərabər hissəyə bölünəndə [33.34, 33.33, 33.33] olmalıdır
    preview = service.preview_shared_cost_allocation(
        branches=[b1, b2, b3],
        data=SharedCostPreviewRequest(total_amount=Decimal("100.0000"), allocation_method="equal"),
    )
    assert len(preview.allocations) == 3
    total_allocated = sum(a.allocated_amount for a in preview.allocations)
    assert total_allocated == Decimal("100.0000")
    assert preview.allocations[0].allocated_amount == Decimal("33.3400")
    assert preview.allocations[1].allocated_amount == Decimal("33.3300")
    assert preview.allocations[2].allocated_amount == Decimal("33.3300")


@pytest.mark.asyncio
async def test_recurring_expense_templates_generates_draft_only(db_session):
    """Dövri xərclər avtomatik DRAFT qeydlər yaradır, heç vaxt auto-approve və ya auto-pay etmir."""
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    service = FinanceService()
    admin = MockActor(uuid.uuid4(), ["system_admin"], [])

    cat = await service.create_expense_category(company_id, "EXP-UTIL", "Kommunal xərclər", actor=admin)

    tmpl_data = RecurringTemplateCreate(
        template_name="Aylıq Elektrik Şablonu",
        branch_id=branch_id,
        category_id=cat.id,
        amount=Decimal("450.0000"),
        day_of_month=1,
        description="Elektrik təchizatı aylıq ödənişi",
    )
    tmpl = await service.create_recurring_template(company_id, tmpl_data, admin)
    assert tmpl.is_active is True

    # Generation job icra olunur
    count = await service.generate_recurring_expenses(company_id)
    assert count >= 1

    from app.modules.finance.repository import FinanceRepository
    repo = FinanceRepository(db_session)
    expenses = await repo.list_expenses(company_id=company_id)
    rec_exp = [e for e in expenses if "EXP-REC-" in e.expense_no]
    assert len(rec_exp) >= 1
    assert rec_exp[0].status == "DRAFT"
    assert rec_exp[0].paid_at is None
