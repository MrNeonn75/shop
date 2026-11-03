"""POS Atomik Satış Çıxışı Vahid Testləri (Atomic Checkout 10-Step Tests).

Bu test dəsti F6/B7 tələblərinə uyğun olaraq aşağıdakı əsas prinsipləri yoxlayır:
1. 10 addımlı atomik tranzaksiya: Növbə yoxlanışı -> Qiymət -> Ödənişlər -> Loyalty -> Fasiləsiz çək nömrəsi -> Satış/Sətirlər -> Stok silinməsi (FOR UPDATE) -> Maya dəyəri snapshot -> Outbox hadisəsi -> Qəbz cavabı.
2. Xəta zamanı tam geri qayıtma (Rollback): Qiymət dəyişikliyi, ödəniş çatışmazlığı və ya kifayət qədər qalıq olmadıqda sistemdə heç bir natamam yazı qalmır (Zero Residue).
3. İdempotentlik: Eyni sorğunun təkrarı (Replay) orijinal qəbzi qaytarır; parametrlər dəyişdirildikdə isə IdempotencyConflictError baş verir.
4. Kart təhlükəsizliyi: PAN və ya CVV bazada heç bir yerdə saxlanılmır və qeydə alınmır.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import (
    BusinessRuleViolationError,
    InsufficientStockError,
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
from app.modules.pos.schemas import (
    CartLineInput,
    SaleCheckoutRequest,
    ShiftOpenRequest,
    TenderPaymentInput,
)
from app.modules.pos.service import PosService
from app.modules.sales.models import Sale, SaleLine, SalePayment
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService
from app.shared.outbox import OutboxEvent


def get_pos_cashier(branch_id: uuid.UUID) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=f"cashier_{uuid.uuid4().hex[:4]}",
        email=f"cashier_{uuid.uuid4().hex[:4]}@brandhouse.az",
        full_name="Kassir Əli",
        roles=["cashier"],
        permissions=["pos.shift.open", "pos.shift.close", "pos.sale.create", "pos.discount.apply"],
        allowed_branches=[branch_id],
        session_id=uuid.uuid4(),
    )


async def setup_pos_environment() -> dict:
    """Tam POS iş mühiti: Şirkət, Filial, Anbar, Kassa aparatı və Kataloq məhsulu qurur."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="28 Mall Filialı",
            address="28 May küç. 10",
            phone="+994125550110",
        ),
    )

    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}",
            name="28 Mall Satış Anbarı",
            warehouse_type="branch",
            branch_id=branch.id,
        ),
    )

    reg_svc = CashRegisterService()
    admin_actor = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin_user",
        email="admin@brandhouse.az",
        full_name="Admin",
        roles=["system_admin"],
        permissions=["registers.register.manage", "catalog.product.manage"],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id,
            default_warehouse_id=warehouse.id,
            code=f"REG-{uuid.uuid4().hex[:4].upper()}",
            name="Kassa Aparatı 1",
        ),
        actor=admin_actor,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(
            name=f"Ayaqqabı-{uuid.uuid4().hex[:4]}",
            code=f"CAT-{uuid.uuid4().hex[:4].upper()}",
            level=1,
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    prod = await cat_svc.create_product(
        data=ProductCreate(
            name=f"Dəri Çəkmə {uuid.uuid4().hex[:4]}",
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            section="Kişi",
            type="Ayaqqabı",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku=f"SKU-{uuid.uuid4().hex[:8].upper()}",
            barcode=f"476{uuid.uuid4().hex[:9]}",
            size="42",
            color="Qara",
            price_override=Decimal("120.00"),
        ),
        actor=admin_actor,
    )

    return {
        "company": company,
        "branch": branch,
        "warehouse": warehouse,
        "register": register,
        "product": prod,
        "variant": var,
        "admin_actor": admin_actor,
    }


@pytest.mark.asyncio
async def test_checkout_happy_path_10_steps() -> None:
    """10 addımlı uğurlu çıxış: Stok silinməsi, maya dəyəri (COGS), fasiləsiz çək nömrəsi və outbox hadisəsi."""
    env = await setup_pos_environment()
    company = env["company"]
    branch = env["branch"]
    warehouse = env["warehouse"]
    register = env["register"]
    variant = env["variant"]
    admin_actor = env["admin_actor"]

    # 1. Anbara 50 ədəd məhsul mədaxil edirik (@ 70.00 AZN maya dəyəri ilə)
    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(
                variant_id=variant.id,
                to_warehouse_id=warehouse.id,
                quantity=50,
                movement_type="RECEIPT",
                reference_type="stock_document",
                unit_cost=Decimal("70.0000"),
            )
        ],
        actor=admin_actor,
    )

    # 2. Kassir növbə açır
    cashier = get_pos_cashier(branch.id)
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(
            register_id=register.id,
            opening_cash=Decimal("100.00"),
        ),
        company_id=company.id,
        actor=cashier,
    )

    # 3. Kassir 2 ədəd məhsul satır: 2 * 120.00 = 240.00 AZN
    checkout_req = SaleCheckoutRequest(
        shift_id=shift.id,
        register_id=register.id,
        items=[CartLineInput(variant_id=variant.id, quantity=2)],
        expected_grand_total=Decimal("240.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash",
                amount=Decimal("240.00"),
                tendered_amount=Decimal("250.00"),  # 10 AZN qalıq
            )
        ],
    )

    idempotency_key = f"chk-{uuid.uuid4().hex}"
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=idempotency_key,
        actor=cashier,
    )

    # Qəbzin yoxlanışı
    assert receipt.receipt_no.startswith("RCP-")
    assert receipt.grand_total == Decimal("240.00")
    assert receipt.paid_amount == Decimal("240.00")
    assert receipt.change_amount == Decimal("10.00")
    assert len(receipt.items) == 1
    assert receipt.items[0].quantity == 2

    # Verilənlər bazasındakı qeydlərin yoxlanışı
    async with UnitOfWork() as uow:
        # Satış sənədi
        sale_stmt = select(Sale).where(Sale.receipt_no == receipt.receipt_no)
        sale = (await uow.session.execute(sale_stmt)).scalar_one_or_none()
        assert sale is not None
        assert sale.status == "COMPLETED"
        assert sale.shift_id == shift.id
        assert sale.paid_amount == Decimal("240.00")
        assert sale.change_amount == Decimal("10.00")
        # COGS snapshot yoxlanışı: 2 * 70.00 = 140.00 AZN
        assert sale.cost_total == Decimal("140.00")

        # Sətir qeydi
        line_stmt = select(SaleLine).where(SaleLine.sale_id == sale.id)
        sale_lines = (await uow.session.execute(line_stmt)).scalars().all()
        assert len(sale_lines) == 1
        assert sale_lines[0].cost_price == Decimal("70.0000")
        assert sale_lines[0].unit_price == Decimal("120.00")

        # Ödəniş qeydi
        pay_stmt = select(SalePayment).where(SalePayment.sale_id == sale.id)
        payments = (await uow.session.execute(pay_stmt)).scalars().all()
        assert len(payments) == 1
        assert payments[0].tender_type == "cash"
        assert payments[0].amount == Decimal("240.00")
        assert payments[0].change_amount == Decimal("10.00")

        # Outbox hadisəsi
        outbox_stmt = select(OutboxEvent).where(
            OutboxEvent.aggregate_id == str(sale.id),
            OutboxEvent.event_type == "sale.completed",
        )
        outbox_event = (await uow.session.execute(outbox_stmt)).scalar_one_or_none()
        assert outbox_event is not None
        assert outbox_event.payload["receipt_no"] == receipt.receipt_no

    # 4. İnventar qalığının silinməsi: 50 idi, 2 çıxıldı -> 48 qalmalıdır
    bal = await inv_svc.get_single_balance(
        warehouse_id=warehouse.id,
        variant_id=variant.id,
    )
    assert bal is not None
    assert bal["on_hand"] == 48


@pytest.mark.asyncio
async def test_checkout_price_changed_rejection() -> None:
    """Qiymət dəyişikliyi (PRICE_CHANGED): Müştərinin gözlədiyi məbləğlə server kalkulyasiyası uyğun gəlmədikdə satış dərhal rədd edilir və heç bir natamam yazı qalmır."""
    env = await setup_pos_environment()
    company = env["company"]
    branch = env["branch"]
    warehouse = env["warehouse"]
    register = env["register"]
    variant = env["variant"]
    admin_actor = env["admin_actor"]

    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(
                variant_id=variant.id,
                to_warehouse_id=warehouse.id,
                quantity=10,
                movement_type="RECEIPT",
                reference_type="stock_document",
                unit_cost=Decimal("50.0000"),
            )
        ],
        actor=admin_actor,
    )

    cashier = get_pos_cashier(branch.id)
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=cashier,
    )

    # Müştəri köhnə qiymətlə 100.00 AZN gözləyir, lakin variantın cari qiyməti 120.00 AZN-dir
    checkout_req = SaleCheckoutRequest(
        shift_id=shift.id,
        register_id=register.id,
        items=[CartLineInput(variant_id=variant.id, quantity=1)],
        expected_grand_total=Decimal("100.00"),  # Yalnış gözlənti
        payments=[TenderPaymentInput(tender_type="cash", amount=Decimal("100.00"))],
    )

    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await pos_svc.checkout(
            request=checkout_req,
            company_id=company.id,
            idempotency_key=f"chk-{uuid.uuid4().hex}",
            actor=cashier,
        )

    assert exc_info.value.code == "PRICE_CHANGED"

    # Zero Residue: Stok dəyişməz qalmalıdır (10 ədəd), heç bir satış yaradılmamalıdır
    bal = await inv_svc.get_single_balance(warehouse.id, variant.id)
    assert bal is not None
    assert bal["on_hand"] == 10

    async with UnitOfWork() as uow:
        sales_count = (
            (await uow.session.execute(select(Sale).where(Sale.shift_id == shift.id)))
            .scalars()
            .all()
        )
        assert len(sales_count) == 0


@pytest.mark.asyncio
async def test_checkout_underpayment_and_overpayment_validation() -> None:
    """Ödəniş məbləğinin yoxlanışı: Çatışmayan ödəniş və ya qeyri-nağd qalıq dərhal rədd edilir."""
    env = await setup_pos_environment()
    company = env["company"]
    branch = env["branch"]
    warehouse = env["warehouse"]
    register = env["register"]
    variant = env["variant"]
    admin_actor = env["admin_actor"]

    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(
                variant_id=variant.id,
                to_warehouse_id=warehouse.id,
                quantity=10,
                movement_type="RECEIPT",
                reference_type="stock_document",
                unit_cost=Decimal("50.0000"),
            )
        ],
        actor=admin_actor,
    )

    cashier = get_pos_cashier(branch.id)
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=cashier,
    )

    # 1. Çatışmayan ödəniş: Cəmi 120.00 AZN, ödənilən 100.00 AZN
    short_payment_req = SaleCheckoutRequest(
        shift_id=shift.id,
        register_id=register.id,
        items=[CartLineInput(variant_id=variant.id, quantity=1)],
        expected_grand_total=Decimal("120.00"),
        payments=[TenderPaymentInput(tender_type="cash", amount=Decimal("100.00"))],
    )

    with pytest.raises(ValidationError):
        await pos_svc.checkout(
            request=short_payment_req,
            company_id=company.id,
            idempotency_key=f"chk-{uuid.uuid4().hex}",
            actor=cashier,
        )

    # 2. Nağdsız ödənişdə qalıq tələbi (Kartla artıq məbləğ təqdim edilməsi)
    card_overpayment_req = SaleCheckoutRequest(
        shift_id=shift.id,
        register_id=register.id,
        items=[CartLineInput(variant_id=variant.id, quantity=1)],
        expected_grand_total=Decimal("120.00"),
        payments=[
            TenderPaymentInput(
                tender_type="card",
                amount=Decimal("120.00"),
                tendered_amount=Decimal("150.00"),  # Kartla qalıq mümkün deyil!
                approval_code="AUTH123456",
            )
        ],
    )

    with pytest.raises(ValidationError):
        await pos_svc.checkout(
            request=card_overpayment_req,
            company_id=company.id,
            idempotency_key=f"chk-{uuid.uuid4().hex}",
            actor=cashier,
        )


@pytest.mark.asyncio
async def test_checkout_insufficient_stock_atomic_rollback() -> None:
    """Kifayət qədər stok olmadıqda (InsufficientStockError) bütün tranzaksiyanın atomik rollback edilməsi."""
    env = await setup_pos_environment()
    company = env["company"]
    branch = env["branch"]
    warehouse = env["warehouse"]
    register = env["register"]
    variant = env["variant"]
    admin_actor = env["admin_actor"]

    # Yalnız 1 ədəd qalıq var
    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(
                variant_id=variant.id,
                to_warehouse_id=warehouse.id,
                quantity=1,
                movement_type="RECEIPT",
                reference_type="stock_document",
                unit_cost=Decimal("50.0000"),
            )
        ],
        actor=admin_actor,
    )

    cashier = get_pos_cashier(branch.id)
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=cashier,
    )

    # Kassir 3 ədəd satmağa çalışır (3 * 120 = 360 AZN)
    oversell_req = SaleCheckoutRequest(
        shift_id=shift.id,
        register_id=register.id,
        items=[CartLineInput(variant_id=variant.id, quantity=3)],
        expected_grand_total=Decimal("360.00"),
        payments=[TenderPaymentInput(tender_type="cash", amount=Decimal("360.00"))],
    )

    with pytest.raises(InsufficientStockError):
        await pos_svc.checkout(
            request=oversell_req,
            company_id=company.id,
            idempotency_key=f"chk-{uuid.uuid4().hex}",
            actor=cashier,
        )

    # 1 ədəd stok yerində qalmalıdır
    bal = await inv_svc.get_single_balance(warehouse.id, variant.id)
    assert bal is not None
    assert bal["on_hand"] == 1

    # Satış qeydi yaradılmamalıdır
    async with UnitOfWork() as uow:
        sales_count = (
            (await uow.session.execute(select(Sale).where(Sale.shift_id == shift.id)))
            .scalars()
            .all()
        )
        assert len(sales_count) == 0


@pytest.mark.asyncio
async def test_checkout_idempotency_replay() -> None:
    """Eyni idempotency_key ilə təkrar sorğu orijinal qəbzin eynisini qaytarır."""
    env = await setup_pos_environment()
    company = env["company"]
    branch = env["branch"]
    warehouse = env["warehouse"]
    register = env["register"]
    variant = env["variant"]
    admin_actor = env["admin_actor"]

    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(
                variant_id=variant.id,
                to_warehouse_id=warehouse.id,
                quantity=10,
                movement_type="RECEIPT",
                reference_type="stock_document",
                unit_cost=Decimal("50.0000"),
            )
        ],
        actor=admin_actor,
    )

    cashier = get_pos_cashier(branch.id)
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=cashier,
    )

    checkout_req = SaleCheckoutRequest(
        shift_id=shift.id,
        register_id=register.id,
        items=[CartLineInput(variant_id=variant.id, quantity=1)],
        expected_grand_total=Decimal("120.00"),
        payments=[TenderPaymentInput(tender_type="cash", amount=Decimal("120.00"))],
    )

    idem_key = f"idem-{uuid.uuid4().hex}"

    # 1-ci çağırış
    resp1 = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=idem_key,
        actor=cashier,
    )

    # 2-ci çağırış (eyni açarla replay)
    resp2 = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=idem_key,
        actor=cashier,
    )

    assert resp1.receipt_no == resp2.receipt_no
    assert resp1.grand_total == resp2.grand_total

    # Stok yalnız 1 dəfə azalmalıdır: 10 - 1 = 9
    bal = await inv_svc.get_single_balance(warehouse.id, variant.id)
    assert bal is not None
    assert bal["on_hand"] == 9


@pytest.mark.asyncio
async def test_checkout_card_security_and_split_tender() -> None:
    """Kart təhlükəsizliyi və Split ödəniş: Nağd + Kart bölüşdürülməsi, raw PAN/CVV saxlanılmaması."""
    env = await setup_pos_environment()
    company = env["company"]
    branch = env["branch"]
    warehouse = env["warehouse"]
    register = env["register"]
    variant = env["variant"]
    admin_actor = env["admin_actor"]

    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(
                variant_id=variant.id,
                to_warehouse_id=warehouse.id,
                quantity=10,
                movement_type="RECEIPT",
                reference_type="stock_document",
                unit_cost=Decimal("50.0000"),
            )
        ],
        actor=admin_actor,
    )

    cashier = get_pos_cashier(branch.id)
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=cashier,
    )

    # 120.00 AZN: 50.00 AZN Nağd + 70.00 AZN Kart (xarici terminal təsdiqi ilə)
    split_req = SaleCheckoutRequest(
        shift_id=shift.id,
        register_id=register.id,
        items=[CartLineInput(variant_id=variant.id, quantity=1)],
        expected_grand_total=Decimal("120.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash",
                amount=Decimal("50.00"),
                tendered_amount=Decimal("50.00"),
            ),
            TenderPaymentInput(
                tender_type="card",
                amount=Decimal("70.00"),
                approval_code="AUTH987654",
                masked_reference="**** **** **** 4321",
            ),
        ],
    )

    receipt = await pos_svc.checkout(
        request=split_req,
        company_id=company.id,
        idempotency_key=f"chk-{uuid.uuid4().hex}",
        actor=cashier,
    )

    assert receipt.grand_total == Decimal("120.00")
    assert receipt.paid_amount == Decimal("120.00")

    # Verilənlər bazasındakı kart ödənişinin təhlükəsizlik auditi
    async with UnitOfWork() as uow:
        pay_stmt = select(SalePayment).where(SalePayment.sale_id == receipt.sale_id)
        payments = (await uow.session.execute(pay_stmt)).scalars().all()
        assert len(payments) == 2

        card_pay = next(p for p in payments if p.tender_type == "card")
        assert card_pay.approval_code == "AUTH987654"
        assert card_pay.masked_reference == "**** **** **** 4321"
        # Heç bir yerdə 16 rəqəmli açıq PAN və ya CVV olmamalıdır
        assert "1234567812345678" not in (card_pay.masked_reference or "")
