"""Maliyyə Siyasəti və SoD Vahid Testləri (Finance Policies & SoD Unit Tests)."""

from __future__ import annotations

import uuid

import pytest

from app.core.errors import BusinessRuleViolationError, ForbiddenError, ValidationError
from app.modules.finance.policies import FinancePolicy


class MockActor:
    def __init__(self, user_id: uuid.UUID | None = None, roles: list[str] | None = None, permissions: list[str] | None = None) -> None:
        self.id = user_id or uuid.uuid4()
        self.roles = roles or []
        self.permissions = permissions or []


def test_finance_policies_forbidden_for_unprivileged():
    unprivileged = MockActor()

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_view_account(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_manage_account(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_transfer(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_create_expense(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_approve_expense(unprivileged, uuid.uuid4())

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_pay_expense(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_reverse_expense(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_create_income(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_manage_budget(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_approve_budget(unprivileged, uuid.uuid4())

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_run_reconciliation(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_close_period(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_reopen_period(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_view_gl(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_post_gl(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_configure_gl(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_view_report(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_view_profit(unprivileged)

    with pytest.raises(ForbiddenError):
        FinancePolicy.check_can_export(unprivileged)


def test_finance_policies_admin_bypass():
    admin = MockActor(roles=["system_admin"])

    # Bütün yoxlamalar admin üçün xətasız keçməlidir
    FinancePolicy.check_can_view_account(admin)
    FinancePolicy.check_can_manage_account(admin)
    FinancePolicy.check_can_transfer(admin)
    FinancePolicy.check_can_create_expense(admin)
    FinancePolicy.check_can_approve_expense(admin, admin.id)  # Admin SoD bypass
    FinancePolicy.check_can_pay_expense(admin)
    FinancePolicy.check_can_reverse_expense(admin)
    FinancePolicy.check_can_create_income(admin)
    FinancePolicy.check_can_manage_budget(admin)
    FinancePolicy.check_can_approve_budget(admin, admin.id)  # Admin SoD bypass
    FinancePolicy.check_can_run_reconciliation(admin)
    FinancePolicy.check_can_close_period(admin)
    FinancePolicy.check_can_reopen_period(admin)
    FinancePolicy.check_can_view_gl(admin)
    FinancePolicy.check_can_post_gl(admin)
    FinancePolicy.check_can_configure_gl(admin)
    FinancePolicy.check_can_view_report(admin)
    FinancePolicy.check_can_view_profit(admin)
    FinancePolicy.check_can_export(admin)


def test_finance_policies_segregation_of_duties_enforced():
    creator_id = uuid.uuid4()
    other_user_id = uuid.uuid4()

    # Eyni şəxs təsdiqləyə bilməz (SoD)
    creator_approver = MockActor(
        user_id=creator_id,
        roles=["accountant"],
        permissions=["finance.expense.approve", "finance.budget.approve"],
    )

    with pytest.raises(BusinessRuleViolationError) as exc_exp:
        FinancePolicy.check_can_approve_expense(creator_approver, creator_id)
    assert "Vəzifələrin Bölünməsi (SoD)" in str(exc_exp.value)

    with pytest.raises(BusinessRuleViolationError) as exc_bdg:
        FinancePolicy.check_can_approve_budget(creator_approver, creator_id)
    assert "Vəzifələrin Bölünməsi (SoD)" in str(exc_bdg.value)

    # Başqa şəxs təsdiqləyə bilər
    other_approver = MockActor(
        user_id=other_user_id,
        roles=["general_manager"],
        permissions=["finance.expense.approve", "finance.budget.approve"],
    )
    FinancePolicy.check_can_approve_expense(other_approver, creator_id)
    FinancePolicy.check_can_approve_budget(other_approver, creator_id)


def test_finance_validate_attachments():
    valid_attachments = [
        {"mime_type": "application/pdf", "size_bytes": 1024 * 1024},
        {"mime_type": "image/jpeg", "size_bytes": 500 * 1024},
        {"mime_type": "image/png", "size_bytes": 200 * 1024},
        {"mime_type": "image/webp", "size_bytes": 300 * 1024},
    ]
    FinancePolicy.validate_attachments(valid_attachments)

    invalid_mime = [{"mime_type": "application/x-executable", "size_bytes": 1000}]
    with pytest.raises(ValidationError) as exc_mime:
        FinancePolicy.validate_attachments(invalid_mime)
    assert "Dəstəklənməyən fayl formatı" in str(exc_mime.value)

    too_large = [{"mime_type": "application/pdf", "size_bytes": 11 * 1024 * 1024}]
    with pytest.raises(ValidationError) as exc_size:
        FinancePolicy.validate_attachments(too_large)
    assert "maksimal 10 MB həddini aşır" in str(exc_size.value)
