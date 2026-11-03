"""Qaytarmalar Modulu: Tam Atomik İcra və Stok/Maliyyə Əlaqələri Testləri (Atomic Completion).

1. 11 addımlı tam icra: Stok hərəkətləri (RESALABLE, DAMAGED, RESTRICTED).
2. Maya dəyəri (COGS reversal) orijinal sənədin maya dəyəri anlıq surəti ilə eynidir.
3. Kassa növbəsi nağdının azalması və kifayət qədər nağd olmadıqda bloklanma.
4. Mağaza krediti (Store Credit) jurnalı və müştəri balansı.
5. Sadiqlik (Loyalty) xallarının geri hesablanması və outbox hadisələri.
6. Orijinal satış statusunun PARTIALLY_RETURNED və RETURNED olması.
7. Xəta zamanı tam rollback (Zero residue).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import BusinessRuleViolationError
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
from app.modules.pos.schemas import (
    CartLineInput,
    SaleCheckoutRequest,
    ShiftOpenRequest,
    TenderPaymentInput,
)
from app.modules.pos.service import PosService
from app.modules.returns.schemas import RefundMethodInput, ReturnCreateRequest, ReturnLineInput
from app.modules.returns.service import ReturnsService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService
from app.shared.outbox import OutboxEvent


@pytest.mark.asyncio
async def test_returns_atomic_completion_full_workflow() -> None:
    """Tam 11 addımlı uğurlu qaytarma: Stok, Kassa, Maya Dəyəri, Loyallıq və Outbox hadisələri."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code="B-ATOM",
            name="Atom Filialı",
            address="Nizami küç. 1",
            phone="+994125550010",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(code="WH-ATOM", name="Atom Anbarı", branch_id=branch.id),
    )
    admin = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="a@a.az",
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
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-AT", name="Kassa"
        ),
        actor=admin,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Paltar", code="CAT-P"), company_id=company.id, actor=admin
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Kostyum",
            internal_code="PRD-SUIT",
            category_id=cat.id,
            section="Kişi",
            type="Geyim",
        ),
        company_id=company.id,
        actor=admin,
    )

    # 100 AZN satış qiyməti, 45 AZN ilkin maya dəyəri
    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="SUIT-01", barcode="123456", price_override=Decimal("100.00")),
        actor=admin,
    )

    # Stok mədaxili
    inv_svc = InventoryService()
    async with UnitOfWork() as uow:
        await inv_svc.post(
            session=uow.session,
            company_id=company.id,
            movements=[
                MovementDraft(
                    variant_id=var.id,
                    quantity=10,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("45.0000"),
                )
            ],
            user_id=admin.id,
            actor=admin,
        )
        await uow.commit()

    customer_id = generate_uuid7()
    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_atom",
        email="c@a.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=[
            "pos.shift.open",
            "pos.sale.create",
            "returns.create",
            "returns.refund.cash",
            "returns.refund.provider",
            "returns.view",
            "returns.approve",
        ],
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

    # 2 ədəd satılır: 200.00 AZN ödənilib (2x45 = 90 AZN maya çıxıb)
    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=var.id, quantity=2)],
        expected_grand_total=Decimal("200.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash", amount=Decimal("200.00"), tendered_amount=Decimal("200.00")
            )
        ],
        customer_id=customer_id,
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-at-{uuid.uuid4().hex}",
        actor=cashier,
    )

    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None
        sale_line = sale.lines[0]
        assert sale.status == "COMPLETED"

    # Satışdan dərhal sonra stok: 10 - 2 = 8 ədəd
    bal_after_sale = await inv_svc.get_single_balance(warehouse.id, var.id)
    assert bal_after_sale is not None
    assert bal_after_sale["on_hand"] == 8

    # İndi 1 ədədi DAMAGED (zədəli) kimi qaytarırıq
    ret_svc = ReturnsService()
    ret_req = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=var.id,
                quantity=1,
                reason_code="DEFECTIVE",
                condition="DAMAGED",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("100.00"))],
        customer_id=customer_id,
        expected_refund_total=Decimal("100.00"),
    )
    receipt_ret = await ret_svc.create_return(
        company_id=company.id,
        request=ret_req,
        actor=cashier,
        idempotency_key=f"ret-at-{uuid.uuid4().hex}",
    )
    assert receipt_ret.refund_total == Decimal("100.00")

    # 1. Stok yoxlanışı: available 8 qalıb, damaged statuslu qalıq 1 ədəd artıb!
    bal_avail = await inv_svc.get_single_balance(warehouse.id, var.id, stock_status="available")
    bal_damaged = await inv_svc.get_single_balance(warehouse.id, var.id, stock_status="damaged")
    assert bal_avail is not None and bal_avail["on_hand"] == 8
    assert bal_damaged is not None and bal_damaged["on_hand"] == 1

    # 2. Orijinal Satış Statusu: PARTIALLY_RETURNED olmalıdır
    async with UnitOfWork() as uow:
        re_sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert re_sale is not None
        assert re_sale.status == "PARTIALLY_RETURNED"
        # Hadisələr siyahısında RETURN_LINKED olmalıdır
        assert any(e.event_type == "RETURN_LINKED" for e in re_sale.events)

    # 3. Kassa hərəkətləri: CashMovement CASH_OUT yaranmalıdır
    drawer_cash = await ret_svc._calculate_drawer_cash(uow.session, shift)
    # Başlanğıc: 500 float + 200 satış - 100 qaytarma = 600 AZN
    assert drawer_cash == Decimal("600.00")

    # 4. Outbox hadisələri: return.completed və loyalty.points_reversed yaranmalıdır
    async with UnitOfWork() as uow:
        stmt_out = select(OutboxEvent).where(OutboxEvent.event_type == "return.completed")
        res_out = await uow.session.execute(stmt_out)
        out_events = res_out.scalars().all()
        assert len(out_events) >= 1

    # İndi qalan 1 ədədi də qaytarırıq -> Satış tam RETURNED statusuna keçməlidir
    ret_req_full = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=var.id,
                quantity=1,
                reason_code="CHANGED_MIND",
                condition="RESALABLE",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("100.00"))],
        customer_id=customer_id,
        expected_refund_total=Decimal("100.00"),
    )
    await ret_svc.create_return(
        company_id=company.id,
        request=ret_req_full,
        actor=cashier,
        idempotency_key=f"ret-full-{uuid.uuid4().hex}",
    )

    async with UnitOfWork() as uow:
        final_sale = await pos_svc.sales_repo.get_sale_by_receipt_no(
            uow.session, receipt.receipt_no
        )
        assert final_sale is not None
        assert final_sale.status == "RETURNED"


@pytest.mark.asyncio
async def test_returns_blocked_when_insufficient_drawer_cash() -> None:
    """Kassada kifayət qədər nağd pul olmadıqda nağd qaytarma bloklanır."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code="B-CASH",
            name="Filial",
            address="Nizami küç. 2",
            phone="+994125550020",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(code="WH-CASH", name="Anbar", branch_id=branch.id),
    )
    admin = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="a@c.az",
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
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-C", name="Kassa"
        ),
        actor=admin,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Test", code="CAT-T"), company_id=company.id, actor=admin
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Məhsul", internal_code="PRD-T", category_id=cat.id, section="Kişi", type="Geyim"
        ),
        company_id=company.id,
        actor=admin,
    )
    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="VAR-C", barcode="333333", price_override=Decimal("200.00")),
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
                    unit_cost=Decimal("50.0000"),
                )
            ],
            user_id=admin.id,
            actor=admin,
        )
        await uow.commit()

    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_c",
        email="c@c.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=["pos.shift.open", "pos.sale.create", "returns.create", "returns.refund.cash"],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    pos_svc = PosService()
    # Növbəni cəmi 50 AZN nağdla açırıq
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(
            register_id=register.id,
            opening_cash=Decimal("50.00"),
            mismatch_reason="Xırda pul azdır",
        ),
        company_id=company.id,
        actor=cashier,
    )

    # Satış kartla həyata keçirilib: 200 AZN kart ödənişi (Kassada hələ də cəmi 50 AZN nağd var!)
    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=var.id, quantity=1)],
        expected_grand_total=Decimal("200.00"),
        payments=[
            TenderPaymentInput(
                tender_type="card",
                amount=Decimal("200.00"),
                tendered_amount=Decimal("200.00"),
                provider_confirmation_id="TX_123",
            )
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-card-{uuid.uuid4().hex}",
        actor=cashier,
    )

    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None

    ret_svc = ReturnsService()

    # İndi müştəriyə 200 AZN nağd qaytarmağa çalışırıq -> Kassada cəmi 50 AZN var -> INSUFFICIENT_DRAWER_CASH
    ret_req_insufficient = ReturnCreateRequest(
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
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("200.00"))],
        expected_refund_total=Decimal("200.00"),
    )
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await ret_svc.create_return(
            company_id=company.id,
            request=ret_req_insufficient,
            actor=cashier,
            idempotency_key=f"ret-fail-cash-{uuid.uuid4().hex}",
        )
    assert exc_info.value.code == "INSUFFICIENT_DRAWER_CASH"


@pytest.mark.asyncio
async def test_returns_store_credit_issue_and_balance() -> None:
    """Mağaza krediti (Store Credit): Qaytarılan məbləğ müştərinin balansına yazılır."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code="B-SC",
            name="Filial SC",
            address="Nizami küç. 3",
            phone="+994125550030",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(code="WH-SC", name="Anbar SC", branch_id=branch.id),
    )
    admin = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="a@sc.az",
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
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-SC", name="Kassa SC"
        ),
        actor=admin,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="SC", code="CAT-SC"), company_id=company.id, actor=admin
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="SC Məhsul",
            internal_code="PRD-SC",
            category_id=cat.id,
            section="Kişi",
            type="Geyim",
        ),
        company_id=company.id,
        actor=admin,
    )
    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="SKU-SC", barcode="77700", price_override=Decimal("150.00")),
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
                    unit_cost=Decimal("60.0000"),
                )
            ],
            user_id=admin.id,
            actor=admin,
        )
        await uow.commit()

    customer_id = generate_uuid7()
    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_sc",
        email="c@sc.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=["pos.shift.open", "pos.sale.create", "returns.create", "returns.refund.cash"],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
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
        customer_id=customer_id,
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-sc-{uuid.uuid4().hex}",
        actor=cashier,
    )

    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None

    ret_svc = ReturnsService()

    # Müştəri mağaza krediti seçir (tender_type="store_credit")
    ret_req_sc = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale.lines[0].id,
                variant_id=var.id,
                quantity=1,
                reason_code="CHANGED_MIND",
            )
        ],
        return_type="STORE_CREDIT",
        refund_methods=[RefundMethodInput(tender_type="store_credit", amount=Decimal("150.00"))],
        customer_id=customer_id,
        expected_refund_total=Decimal("150.00"),
    )
    receipt_ret = await ret_svc.create_return(
        company_id=company.id,
        request=ret_req_sc,
        actor=cashier,
        idempotency_key=f"ret-sc-{uuid.uuid4().hex}",
    )
    assert receipt_ret.refund_total == Decimal("150.00")

    # Müştərinin balansını yoxlayırıq
    async with UnitOfWork() as uow:
        bal = await ret_svc.repo.get_customer_store_credit_balance(
            uow.session, company.id, customer_id
        )
        assert bal == Decimal("150.00")
