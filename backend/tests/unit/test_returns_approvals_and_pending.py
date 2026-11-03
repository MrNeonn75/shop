"""Qaytarmalar Modulu: Təsdiqlər, Limitlər və PENDING_APPROVAL Axını Testləri (Approvals & Pending Flow).

1. Qaytarma vaxt həddinin (Return Window) aşılması və menecer təsdiq tokeni.
2. Rol üzrə geri ödəniş limitləri (Refund Limits).
3. Çeksiz qaytarma qaydaları və menecer icazəsi.
4. Təsdiq gözləyən (PENDING_APPROVAL) axını: Sayğacda rezervasiya, təsdiq və ya rədd edilmə.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ForbiddenError,
    ManagerApprovalError,
    ValidationError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.policies import AuthenticatedUser
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import BranchService
from app.modules.cash_registers.schemas import CashRegisterCreate
from app.modules.cash_registers.service import CashRegisterService
from app.modules.catalog.schemas import CategoryCreate, ProductCreate, ProductVariantCreate
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.pos.policies import PosPolicy
from app.modules.pos.schemas import (
    CartLineInput,
    SaleCheckoutRequest,
    ShiftOpenRequest,
    TenderPaymentInput,
)
from app.modules.pos.service import PosService
from app.modules.returns.models import SaleLineReturnState, SaleReturn
from app.modules.returns.policies import ReturnsPolicy
from app.modules.returns.repository import ReturnsRepository
from app.modules.returns.schemas import (
    RefundMethodInput,
    ReturnCreateRequest,
    ReturnFilterParams,
    ReturnLineInput,
    ReturnRejectRequest,
)
from app.modules.returns.service import ReturnsService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


@pytest.mark.asyncio
async def test_returns_window_override_requires_manager_token_and_reason() -> None:
    """Qaytarma müddəti (14 gün) bitdikdə menecer tokeni və əsaslandırma tələb olunur."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code="B-WIN",
            name="Filial Window",
            address="Bakı ş., Nizami 10",
            phone="+994125550040",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(code="WH-WIN", name="Anbar", branch_id=branch.id),
    )
    admin = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="a@w.az",
        full_name="Admin",
        roles=["system_admin"],
        permissions=[],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    reg_svc = CashRegisterService()
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-W", name="Kassa"
        ),
        actor=admin,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Window", code="CAT-W"), company_id=company.id, actor=admin
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Palto",
            internal_code="PRD-COAT",
            category_id=cat.id,
            section="Qadın",
            type="Geyim",
        ),
        company_id=company.id,
        actor=admin,
    )
    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="COAT-01", barcode="111222", price_override=Decimal("150.00")),
        actor=admin,
    )

    inv_svc = InventoryService()
    async with UnitOfWork() as uow:
        await inv_svc.post(
            session=uow.session,
            company_id=company.id,
            movements=[
                MovementDraft(
                    variant_id=var.id,
                    quantity=5,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("70.0000"),
                )
            ],
            user_id=admin.id,
            actor=admin,
        )
        await uow.commit()

    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_w",
        email="c@w.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=["pos.shift.open", "pos.sale.create", "returns.create", "returns.refund.cash"],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(
            register_id=register.id,
            opening_cash=Decimal("500.00"),
            mismatch_reason="İlkin növbə qalığı",
        ),
        company_id=company.id,
        actor=cashier,
    )

    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=var.id, quantity=1)],
        expected_grand_total=Decimal("150.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash", amount=Decimal("150.00"), tendered_amount=Decimal("150.00")
            )
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-win-{uuid.uuid4().hex}",
        actor=cashier,
    )

    # Satış tarixini süni olaraq 20 gün əvvələ çəkirik (14 günlük window-u aşmaq üçün)
    old_date = (utc_now() - timedelta(days=20)).date()
    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None
        sale.business_date = old_date
        await uow.commit()

    ret_svc = ReturnsService()

    # 1. Menecer tokeni olmadan qaytarmağa cəhd edirik -> ManagerApprovalError
    req_no_token = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale.lines[0].id,
                variant_id=var.id,
                quantity=1,
                reason_code="DEFECTIVE",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("150.00"))],
        expected_refund_total=Decimal("150.00"),
    )
    with pytest.raises(ManagerApprovalError):
        await ret_svc.create_return(
            company_id=company.id,
            request=req_no_token,
            actor=cashier,
            idempotency_key=f"ret-win-fail-{uuid.uuid4().hex}",
        )

    # 2. Token var, lakin izahat yoxdur -> ValidationError
    manager_token = PosPolicy.create_manager_approval_token(
        manager_id=admin.id,
        action="returns.override_window",
        branch_id=branch.id,
    )
    req_no_reason = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale.lines[0].id,
                variant_id=var.id,
                quantity=1,
                reason_code="DEFECTIVE",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("150.00"))],
        expected_refund_total=Decimal("150.00"),
        manager_approval_token=manager_token,
        override_window_reason=" ",
    )
    with pytest.raises(ValidationError):
        await ret_svc.create_return(
            company_id=company.id,
            request=req_no_reason,
            actor=cashier,
            idempotency_key=f"ret-win-noreason-{uuid.uuid4().hex}",
        )

    # 3. Həm token, həm də ətraflı izahat verildikdə -> Uğurlu tamamlanır
    req_valid = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale.lines[0].id,
                variant_id=var.id,
                quantity=1,
                reason_code="DEFECTIVE",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("150.00"))],
        expected_refund_total=Decimal("150.00"),
        manager_approval_token=manager_token,
        override_window_reason="Müştəri xaricdə ezamiyyətdə olduğuna görə gecikmişdi, menecer xüsusi razılıq verdi.",
    )
    res = await ret_svc.create_return(
        company_id=company.id,
        request=req_valid,
        actor=cashier,
        idempotency_key=f"ret-win-ok-{uuid.uuid4().hex}",
    )
    assert res.refund_total == Decimal("150.00")


@pytest.mark.asyncio
async def test_returns_pending_approval_flow_and_rejection() -> None:
    """Təsdiq gözləyən (PENDING_APPROVAL) axını: Rezervasiya edilməsi, rədd edilməsi və ya təsdiqi."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code="B-PEND",
            name="Filial Pending",
            address="Bakı ş., Nizami 20",
            phone="+994125550050",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(code="WH-PEND", name="Anbar", branch_id=branch.id),
    )
    admin = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="a@p.az",
        full_name="Admin",
        roles=["system_admin"],
        permissions=[],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    reg_svc = CashRegisterService()
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-P", name="Kassa"
        ),
        actor=admin,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Pend", code="CAT-P"), company_id=company.id, actor=admin
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Ceket", internal_code="PRD-JAC", category_id=cat.id, section="Kişi", type="Geyim"
        ),
        company_id=company.id,
        actor=admin,
    )
    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="JAC-01", barcode="88811", price_override=Decimal("300.00")),
        actor=admin,
    )

    inv_svc = InventoryService()
    async with UnitOfWork() as uow:
        await inv_svc.post(
            session=uow.session,
            company_id=company.id,
            movements=[
                MovementDraft(
                    variant_id=var.id,
                    quantity=5,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("120.0000"),
                )
            ],
            user_id=admin.id,
            actor=admin,
        )
        await uow.commit()

    # Kassirin limiti: 50 AZN. Məhsul isə 300 AZN-dir -> Təsdiq tələb olunur!
    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_pend",
        email="c@p.az",
        full_name="Kassir",
        roles=["cashier"],
        permissions=["pos.shift.open", "pos.sale.create", "returns.create", "returns.refund.cash"],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(
            register_id=register.id,
            opening_cash=Decimal("500.00"),
            mismatch_reason="İlkin növbə qalığı",
        ),
        company_id=company.id,
        actor=cashier,
    )

    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=var.id, quantity=1)],
        expected_grand_total=Decimal("300.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash", amount=Decimal("300.00"), tendered_amount=Decimal("300.00")
            )
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-p-{uuid.uuid4().hex}",
        actor=cashier,
    )

    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None
        sale_line = sale.lines[0]

    ret_svc = ReturnsService()

    # 1. save_as_pending_if_approval_needed=True ilə göndəririk
    req_pending = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=var.id,
                quantity=1,
                reason_code="DEFECTIVE",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("300.00"))],
        expected_refund_total=Decimal("300.00"),
        save_as_pending_if_approval_needed=True,
    )
    res_pending = await ret_svc.create_return(
        company_id=company.id,
        request=req_pending,
        actor=cashier,
        idempotency_key=f"ret-pend-{uuid.uuid4().hex}",
    )
    assert res_pending.status == "PENDING_APPROVAL"

    # Sayğacda reserved_qty 1 olmalıdır
    async with UnitOfWork() as uow:
        stmt = select(SaleLineReturnState).where(SaleLineReturnState.sale_line_id == sale_line.id)
        res_st = await uow.session.execute(stmt)
        st = res_st.scalar_one()
        assert st.reserved_qty == 1
        assert st.returned_qty == 0

    # 2. İndi menecer tərəfindən rədd edilir
    manager = AuthenticatedUser(
        id=generate_uuid7(),
        username="mgr",
        email="m@p.az",
        full_name="Menecer",
        roles=["branch_manager"],
        permissions=["returns.approve"],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    rej_res = await ret_svc.reject_pending_return(
        company_id=company.id,
        return_id=res_pending.id,
        actor=manager,
        request=ReturnRejectRequest(
            reason="Məhsul istifadə edilib, zədə müştəri tərəfindən vurulub."
        ),
    )
    assert rej_res.status == "REJECTED"

    # Sayğacda rezervasiya ləğv edilməlidir (reserved_qty = 0)
    async with UnitOfWork() as uow:
        stmt2 = select(SaleLineReturnState).where(SaleLineReturnState.sale_line_id == sale_line.id)
        res_st2 = await uow.session.execute(stmt2)
        st2 = res_st2.scalar_one()
        assert st2.reserved_qty == 0
        assert st2.returned_qty == 0


@pytest.mark.asyncio
async def test_returns_policies_comprehensive() -> None:
    """ReturnsPolicy bütün yoxlanışlarının və istisnalarının test edilməsi."""
    u_nobody = AuthenticatedUser(
        id=generate_uuid7(),
        username="nobody",
        email="n@b.az",
        full_name="Nobody",
        roles=[],
        permissions=[],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    branch_id = generate_uuid7()

    # 1. check_can_create_return
    with pytest.raises(ForbiddenError):
        ReturnsPolicy.check_can_create_return(u_nobody)
    ReturnsPolicy.check_can_create_return(
        AuthenticatedUser(
            id=generate_uuid7(),
            username="admin",
            email="a@b.az",
            full_name="Admin",
            roles=["system_admin"],
            permissions=[],
            allowed_branches=[],
            session_id=uuid.uuid4(),
        )
    )

    # 2. check_can_exchange
    with pytest.raises(ForbiddenError):
        ReturnsPolicy.check_can_exchange(u_nobody)
    ReturnsPolicy.check_can_exchange(
        AuthenticatedUser(
            id=generate_uuid7(),
            username="c",
            email="c@b.az",
            full_name="Cashier",
            roles=[],
            permissions=["returns.exchange"],
            allowed_branches=[],
            session_id=uuid.uuid4(),
        )
    )

    # 3. check_can_approve
    with pytest.raises(ForbiddenError):
        ReturnsPolicy.check_can_approve(u_nobody)
    ReturnsPolicy.check_can_approve(
        AuthenticatedUser(
            id=generate_uuid7(),
            username="mgr",
            email="m@b.az",
            full_name="Manager",
            roles=[],
            permissions=["returns.approve"],
            allowed_branches=[],
            session_id=uuid.uuid4(),
        )
    )

    # 4. check_return_window
    today = utc_now().date()
    # Müddət daxilində
    ReturnsPolicy.check_return_window(
        sale_date=today - timedelta(days=5),
        business_date=today,
        window_days=14,
        actor=u_nobody,
        manager_token=None,
        reason=None,
        branch_id=branch_id,
    )
    # Müddət keçib, token yoxdur
    with pytest.raises(ManagerApprovalError):
        ReturnsPolicy.check_return_window(
            sale_date=today - timedelta(days=20),
            business_date=today,
            window_days=14,
            actor=u_nobody,
            manager_token=None,
            reason=None,
            branch_id=branch_id,
        )
    # Müddət keçib, səbəb qısa
    with pytest.raises(ValidationError):
        ReturnsPolicy.check_return_window(
            sale_date=today - timedelta(days=20),
            business_date=today,
            window_days=14,
            actor=AuthenticatedUser(
                id=generate_uuid7(),
                username="a",
                email="a@b.az",
                full_name="A",
                roles=["system_admin"],
                permissions=[],
                allowed_branches=[],
                session_id=uuid.uuid4(),
            ),
            manager_token=None,
            reason="qısa",
            branch_id=branch_id,
        )

    # 5. check_no_receipt_allowed
    with pytest.raises(ForbiddenError):
        ReturnsPolicy.check_no_receipt_allowed(u_nobody, None, None, False, branch_id)
    u_no_rec = AuthenticatedUser(
        id=generate_uuid7(),
        username="u_nr",
        email="nr@b.az",
        full_name="NR",
        roles=[],
        permissions=["returns.no_receipt"],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    with pytest.raises(ValidationError):
        ReturnsPolicy.check_no_receipt_allowed(
            u_no_rec, None, None, requires_customer=True, branch_id=branch_id
        )
    with pytest.raises(ManagerApprovalError):
        ReturnsPolicy.check_no_receipt_allowed(
            u_no_rec, None, generate_uuid7(), requires_customer=True, branch_id=branch_id
        )

    # 6. check_refund_limits
    with pytest.raises(ManagerApprovalError):
        ReturnsPolicy.check_refund_limits(
            actor=u_nobody,
            refund_total=Decimal("150.00"),
            refund_limits={"cashier": 50.0},
            manager_token=None,
            branch_id=branch_id,
        )

    # 7. check_cash_refund_allowed
    with pytest.raises(ForbiddenError):
        ReturnsPolicy.check_cash_refund_allowed(
            u_nobody, "OPEN", Decimal("20.00"), Decimal("100.00")
        )
    u_cash = AuthenticatedUser(
        id=generate_uuid7(),
        username="cash",
        email="cash@b.az",
        full_name="Cash",
        roles=[],
        permissions=["returns.refund.cash"],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    with pytest.raises(BusinessRuleViolationError):
        ReturnsPolicy.check_cash_refund_allowed(
            u_cash, "CLOSED", Decimal("20.00"), Decimal("100.00")
        )
    with pytest.raises(BusinessRuleViolationError):
        ReturnsPolicy.check_cash_refund_allowed(
            u_cash, "OPEN", Decimal("200.00"), Decimal("50.00")
        )

    # 8. check_card_refund_allowed
    with pytest.raises(ForbiddenError):
        ReturnsPolicy.check_card_refund_allowed(u_nobody, "INTEGRATED", False)
    u_card = AuthenticatedUser(
        id=generate_uuid7(),
        username="card",
        email="card@b.az",
        full_name="Card",
        roles=[],
        permissions=["returns.refund.provider"],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    with pytest.raises(BusinessRuleViolationError):
        ReturnsPolicy.check_card_refund_allowed(u_card, "NOT_CONFIGURED", False)
    ReturnsPolicy.check_card_refund_allowed(u_card, "NOT_CONFIGURED", True)

    # 9. check_store_credit_allowed
    with pytest.raises(BusinessRuleViolationError):
        ReturnsPolicy.check_store_credit_allowed(generate_uuid7(), False)
    with pytest.raises(ValidationError):
        ReturnsPolicy.check_store_credit_allowed(None, True)
    ReturnsPolicy.check_store_credit_allowed(generate_uuid7(), True)


@pytest.mark.asyncio
async def test_returns_repository_search_and_no_lookup() -> None:
    """ReturnsRepository axtarış, süzgəclər və nömrə üzrə tapma."""
    repo = ReturnsRepository()
    comp_id = generate_uuid7()
    branch_id = generate_uuid7()
    reg_id = generate_uuid7()
    cust_id = generate_uuid7()

    now_dt = utc_now()
    ret = SaleReturn(
        id=generate_uuid7(),
        return_no=f"RET-TEST-{uuid.uuid4().hex[:6].upper()}",
        original_sale_id=generate_uuid7(),
        company_id=comp_id,
        branch_id=branch_id,
        register_id=reg_id,
        shift_id=generate_uuid7(),
        processed_by_id=generate_uuid7(),
        customer_id=cust_id,
        status="COMPLETED",
        return_type="REFUND",
        subtotal=Decimal("100.00"),
        discount_reversal_total=Decimal("0.00"),
        tax_reversal_total=Decimal("18.00"),
        refund_total=Decimal("100.00"),
        cost_total=Decimal("50.00"),
        currency="AZN",
        refund_method_breakdown={"cash": "100.00"},
        reason_summary="Sınaq qaytarma",
        business_date=now_dt.date(),
        correlation_id=str(uuid.uuid4()),
        version=1,
    )
    async with UnitOfWork() as uow:
        await repo.create_return(uow.session, ret)
        await uow.commit()

    async with UnitOfWork() as uow:
        # get_return_by_no
        found = await repo.get_return_by_no(uow.session, ret.return_no)
        assert found is not None
        assert found.id == ret.id

        # search_returns ilə müxtəlif filtrlər
        items, count = await repo.search_returns(
            uow.session,
            comp_id,
            ReturnFilterParams(
                branch_id=branch_id,
                register_id=reg_id,
                status="COMPLETED",
                return_type="REFUND",
                date_from=now_dt.date() - timedelta(days=1),
                date_to=now_dt.date() + timedelta(days=1),
                min_refund=Decimal("50.00"),
                max_refund=Decimal("150.00"),
                search="Sınaq",
            ),
        )
        assert count >= 1
        assert any(i.id == ret.id for i in items)

        # get_product_variant
        pv = await repo.get_product_variant(uow.session, generate_uuid7())
        assert pv is None
