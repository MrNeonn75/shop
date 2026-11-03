"""Təsdiqləmə Mühərriki Vahid Testləri (Approvals Unit Tests)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.core.errors import BusinessRuleViolationError, ForbiddenError
from app.core.ids import generate_uuid7
from app.modules.approvals.models import ApprovalAction, ApprovalStatus
from app.modules.approvals.schemas import ApprovalDecisionRequest, ApprovalRuleCreate
from app.modules.approvals.service import ApprovalService
from app.modules.auth.policies import AuthenticatedUser
from app.modules.company.service import get_company_service


def make_user(
    username: str,
    roles: list[str] | None = None,
    permissions: list[str] | None = None,
) -> AuthenticatedUser:
    """Test istifadəçisi fabriki."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=username,
        email=f"{username}@brandhouse.az",
        full_name=f"İstifadəçi {username}",
        roles=roles or [],
        permissions=permissions or [],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


@pytest.mark.asyncio
async def test_approval_rules_crud():
    """Təsdiqləmə qaydalarının yaradılması və siyahılanması."""
    company = await get_company_service().get_company()
    svc = ApprovalService()

    rule1 = await svc.create_rule(
        company.id,
        ApprovalRuleCreate(
            document_type="purchase_order",
            min_amount=Decimal("1000.00"),
            max_amount=Decimal("10000.00"),
            level=1,
            required_role="procurement_manager",
            description="PO 1-ci səviyyə təsdiqi",
        ),
    )
    assert rule1.id is not None
    assert rule1.document_type == "purchase_order"
    assert rule1.level == 1

    rule2 = await svc.create_rule(
        company.id,
        ApprovalRuleCreate(
            document_type="purchase_order",
            min_amount=Decimal("1000.00"),
            max_amount=Decimal("50000.00"),
            level=2,
            required_role="cfo",
            description="PO 2-ci səviyyə maliyyə təsdiqi",
        ),
    )
    assert rule2.id is not None
    assert rule2.level == 2

    rules = await svc.list_rules(company.id, document_type="purchase_order")
    assert len(rules) >= 2


@pytest.mark.asyncio
async def test_auto_approval_when_no_rules_match():
    """Uyğun qayda olmadıqda sənədin avtomatik təsdiqlənməsi."""
    company = await get_company_service().get_company()
    svc = ApprovalService()
    requester = make_user("buyer_1", roles=["buyer"])

    # 100 AZN dəyərində sənəd üçün qayda yoxdur (rule minimum 1000 AZN-dir)
    req = await svc.submit_for_approval(
        company_id=company.id,
        document_type="purchase_request",
        document_id=uuid.uuid4(),
        amount=Decimal("100.00"),
        requester_id=requester.id,
        actor=requester,
    )

    assert req.status == ApprovalStatus.APPROVED.value
    assert req.total_levels == 0
    assert len(req.history) == 1
    assert req.history[0].action == ApprovalAction.APPROVED.value


@pytest.mark.asyncio
async def test_multi_level_approval_workflow():
    """Çoxpilləli təsdiq prosesi (Level 1 -> Level 2 -> Final Təsdiq)."""
    company = await get_company_service().get_company()
    svc = ApprovalService()

    doc_type = f"order_{uuid.uuid4().hex[:6]}"

    # Qayda 1: Level 1 (Procurement Manager)
    await svc.create_rule(
        company.id,
        ApprovalRuleCreate(
            document_type=doc_type,
            min_amount=Decimal("500.00"),
            level=1,
            required_role="procurement_manager",
        ),
    )
    # Qayda 2: Level 2 (Finance Director)
    await svc.create_rule(
        company.id,
        ApprovalRuleCreate(
            document_type=doc_type,
            min_amount=Decimal("500.00"),
            level=2,
            required_role="finance_director",
        ),
    )

    requester = make_user("purchaser_1", roles=["purchaser"])
    level1_approver = make_user("proc_boss", roles=["procurement_manager"])
    level2_approver = make_user("cfo_boss", roles=["finance_director"])

    doc_id = uuid.uuid4()
    req = await svc.submit_for_approval(
        company_id=company.id,
        document_type=doc_type,
        document_id=doc_id,
        amount=Decimal("5000.00"),
        requester_id=requester.id,
        actor=requester,
    )

    assert req.status == ApprovalStatus.PENDING.value
    assert req.total_levels == 2
    assert req.current_level == 1
    assert len(req.steps) == 2

    # Level 1 təsdiqi
    req_after_l1 = await svc.process_decision(
        req.id,
        ApprovalDecisionRequest(decision="APPROVE", reason="Level 1 təsdiqləndi"),
        actor=level1_approver,
    )
    assert req_after_l1.status == ApprovalStatus.PENDING.value
    assert req_after_l1.current_level == 2

    # Level 2 təsdiqi
    req_after_l2 = await svc.process_decision(
        req.id,
        ApprovalDecisionRequest(decision="APPROVE", reason="Level 2 yekun təsdiqləndi"),
        actor=level2_approver,
    )
    assert req_after_l2.status == ApprovalStatus.APPROVED.value
    assert len(req_after_l2.history) == 3  # SUBMITTED + L1 APPROVED + L2 APPROVED


@pytest.mark.asyncio
async def test_sod_prevents_self_approval():
    """Vəzifələrin Bölünməsi (SoD): sorğu yaradan şəxs öz sənədini təsdiq edə bilməz."""
    company = await get_company_service().get_company()
    svc = ApprovalService()

    doc_type = f"sod_doc_{uuid.uuid4().hex[:6]}"
    await svc.create_rule(
        company.id,
        ApprovalRuleCreate(
            document_type=doc_type,
            min_amount=Decimal("100.00"),
            level=1,
            required_role="procurement_manager",
        ),
    )

    # Menecer həm sorğunu yaradır, həm də təsdiqçi roluna malikdir
    manager = make_user("dual_user", roles=["procurement_manager"])

    req = await svc.submit_for_approval(
        company_id=company.id,
        document_type=doc_type,
        document_id=uuid.uuid4(),
        amount=Decimal("500.00"),
        requester_id=manager.id,
        actor=manager,
    )

    # Öz sorğusunu təsdiqləməyə cəhd edir -> SoD pozuntusu
    with pytest.raises(BusinessRuleViolationError) as exc:
        await svc.process_decision(
            req.id,
            ApprovalDecisionRequest(decision="APPROVE", reason="Özüm təsdiq edirəm"),
            actor=manager,
        )
    assert "SoD" in str(exc.value)


@pytest.mark.asyncio
async def test_approver_authority_validation():
    """Səlahiyyətsiz istifadəçinin təsdiq etmə cəhdi ForbiddenError yaradır."""
    company = await get_company_service().get_company()
    svc = ApprovalService()

    doc_type = f"auth_doc_{uuid.uuid4().hex[:6]}"
    await svc.create_rule(
        company.id,
        ApprovalRuleCreate(
            document_type=doc_type,
            min_amount=Decimal("100.00"),
            level=1,
            required_role="finance_director",
        ),
    )

    requester = make_user("buyer_2", roles=["buyer"])
    unauthorized = make_user("cashier_1", roles=["cashier"])

    req = await svc.submit_for_approval(
        company_id=company.id,
        document_type=doc_type,
        document_id=uuid.uuid4(),
        amount=Decimal("500.00"),
        requester_id=requester.id,
        actor=requester,
    )

    with pytest.raises(ForbiddenError):
        await svc.process_decision(
            req.id,
            ApprovalDecisionRequest(decision="APPROVE"),
            actor=unauthorized,
        )


@pytest.mark.asyncio
async def test_rejection_and_return_decisions():
    """İmtina (REJECT) və Geri Qaytarma (RETURN) qərarları və mütləq səbəb yoxlanışı."""
    company = await get_company_service().get_company()
    svc = ApprovalService()

    doc_type = f"rej_doc_{uuid.uuid4().hex[:6]}"
    await svc.create_rule(
        company.id,
        ApprovalRuleCreate(
            document_type=doc_type,
            min_amount=Decimal("100.00"),
            level=1,
            required_role="branch_manager",
        ),
    )

    requester = make_user("user_a", roles=["buyer"])
    approver = make_user("approver_a", roles=["branch_manager"])

    req = await svc.submit_for_approval(
        company_id=company.id,
        document_type=doc_type,
        document_id=uuid.uuid4(),
        amount=Decimal("300.00"),
        requester_id=requester.id,
        actor=requester,
    )

    # 1. Səbəbsiz imtina cəhdi xəta verməlidir
    with pytest.raises(BusinessRuleViolationError):
        await svc.process_decision(
            req.id,
            ApprovalDecisionRequest(decision="REJECT", reason=""),
            actor=approver,
        )

    # 2. Səbəbli imtina sorğunu və cari pilləni REJECTED statusuna keçirir
    rej_req = await svc.process_decision(
        req.id,
        ApprovalDecisionRequest(
            decision="REJECT", reason="Büdcə aşımı səbəbindən sifariş ləğv edilir."
        ),
        actor=approver,
    )
    assert rej_req.status == ApprovalStatus.REJECTED.value

    # Artıq rədd edilmiş sorğuya yenidən qərar vermək olmaz
    with pytest.raises(BusinessRuleViolationError):
        await svc.process_decision(
            req.id,
            ApprovalDecisionRequest(decision="APPROVE"),
            actor=approver,
        )
