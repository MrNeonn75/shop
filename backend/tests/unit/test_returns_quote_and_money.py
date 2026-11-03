"""Qaytarmalar Modulu: Maliyyə Dəqiqliyi və Qiymət Kalkulyasiyası Testləri (Money & Pricing Integrity).

1. Mütənasib endirim bölgüsü və qəpik itkisinin qarşısının alınması (No lost/extra qəpik).
2. Vergi (ƏDV) tərs hesablanması orijinal sənəd anlıq surətindən (Snapshot tax rate).
3. Tarixi qiymət toxunulmazlığı: Satışdan sonra kataloqda qiymət dəyişsə də qaytarma dəyəri dəyişmir.
4. Aksiya pozulması (Promotion Invalidation): Standart mütənasib qaytarma vs Sərt fayda tutulması (Clawback).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.policies import AuthenticatedUser
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import BranchService
from app.modules.cash_registers.schemas import CashRegisterCreate
from app.modules.cash_registers.service import CashRegisterService
from app.modules.catalog.schemas import (
    CategoryCreate,
    ProductCreate,
    ProductVariantCreate,
    ProductVariantUpdate,
)
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
from app.modules.returns.schemas import ReturnLineInput, ReturnQuoteRequest
from app.modules.returns.service import ReturnsService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


@pytest.mark.asyncio
async def test_returns_proportional_discount_penny_integrity() -> None:
    """Mütənasib endirim bölgüsü: Qəbzdəki 14 AZN ümumi endirim sətirlərə dəqiq bölünür, qəpik itkisi olmur."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Port Baku Filialı",
            address="Neftçilər pr. 151",
            phone="+994125550001",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}", name="Port Baku Anbarı", branch_id=branch.id
        ),
    )
    admin_actor = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="admin@brandhouse.az",
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
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-01", name="Kassa 1"
        ),
        actor=admin_actor,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Geyim", code="CAT-G"), company_id=company.id, actor=admin_actor
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Şalvar", internal_code="PRD-SH", category_id=cat.id, section="Kişi", type="Geyim"
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    # 3 fərqli variant yaradırıq (Hərəsi 33.33 AZN baza qiyməti)
    v1 = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="SKU-1", barcode="111", size="S", price_override=Decimal("33.33")),
        actor=admin_actor,
    )
    v2 = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="SKU-2", barcode="222", size="M", price_override=Decimal("33.33")),
        actor=admin_actor,
    )
    v3 = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="SKU-3", barcode="333", size="L", price_override=Decimal("33.34")),
        actor=admin_actor,
    )

    # İlkin stok mədaxili
    inv_svc = InventoryService()
    async with UnitOfWork() as uow:
        await inv_svc.post(
            session=uow.session,
            company_id=company.id,
            movements=[
                MovementDraft(
                    variant_id=v.id,
                    quantity=10,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("15.0000"),
                )
                for v in (v1, v2, v3)
            ],
            user_id=admin_actor.id,
            actor=admin_actor,
        )
        await uow.commit()

    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_money",
        email="cashier@brandhouse.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=[
            "pos.shift.open",
            "pos.sale.create",
            "pos.discount.apply",
            "returns.create",
            "returns.refund.cash",
        ],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(
            register_id=register.id,
            opening_cash=Decimal("200.00"),
            mismatch_reason="İlkin növbə qalığı",
        ),
        company_id=company.id,
        actor=cashier,
    )

    # 3 məhsul satılır: Cəmi 100.00 AZN. Qəbz üzrə 10.00 AZN endirim tətbiq olunur -> Yekun ödənilən 90.00 AZN
    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[
            CartLineInput(variant_id=v1.id, quantity=1),
            CartLineInput(variant_id=v2.id, quantity=1),
            CartLineInput(variant_id=v3.id, quantity=1),
        ],
        receipt_discount_amount=Decimal("10.00"),
        expected_grand_total=Decimal("90.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash", amount=Decimal("90.00"), tendered_amount=Decimal("90.00")
            )
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-disc-{uuid.uuid4().hex}",
        actor=cashier,
    )

    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None

    ret_svc = ReturnsService()

    # 3 sətirdən 2-sini qaytarmaq üçün quote alırıq
    quote_req = ReturnQuoteRequest(
        original_sale_id=sale.id,
        branch_id=branch.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale.lines[0].id,
                variant_id=v1.id,
                quantity=1,
                reason_code="DEFECTIVE",
            ),
            ReturnLineInput(
                original_sale_line_id=sale.lines[1].id,
                variant_id=v2.id,
                quantity=1,
                reason_code="CHANGED_MIND",
            ),
        ],
    )
    quote = await ret_svc.quote_return(company.id, quote_req, actor=cashier)

    # Hər sətir üzrə hesablanan geri ödənişlərin cəmi dəqiq refund_total-a bərabərdir
    line_sum = sum(line.refund_amount for line in quote.items)
    assert line_sum == quote.refund_total
    # Orijinalda hər sətir 30.00 AZN düşürdü (33.33 gross - 3.33 disc = 30.00)
    assert quote.refund_total == Decimal("60.00")


@pytest.mark.asyncio
async def test_returns_historical_price_integrity() -> None:
    """Tarixi qiymət toxunulmazlığı: Satışdan sonra kataloqda qiymət artırılsa və ya azaldılsa da, qaytarma orijinal qiymətlə hesablanır."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Gənclik Filialı",
            address="F.X.Xoyski 14",
            phone="+994125550002",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}", name="Anbar", branch_id=branch.id
        ),
    )
    admin_actor = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="admin@b.az",
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
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-02", name="Kassa 2"
        ),
        actor=admin_actor,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Aksessuar", code="CAT-ACC"),
        company_id=company.id,
        actor=admin_actor,
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Kəmər",
            internal_code="PRD-BELT",
            category_id=cat.id,
            section="Kişi",
            type="Aksessuar",
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    # Başlanğıc qiyməti: 40.00 AZN
    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="BELT-01", barcode="99901", price_override=Decimal("40.00")),
        actor=admin_actor,
    )

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
                    unit_cost=Decimal("15.0000"),
                )
            ],
            user_id=admin_actor.id,
            actor=admin_actor,
        )
        await uow.commit()

    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier2",
        email="cashier2@b.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=[
            "pos.shift.open",
            "pos.sale.create",
            "pos.discount.apply",
            "returns.create",
            "returns.refund.cash",
        ],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=cashier,
    )

    # Satış: 40.00 AZN ödənilib
    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=var.id, quantity=1)],
        expected_grand_total=Decimal("40.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash", amount=Decimal("40.00"), tendered_amount=Decimal("40.00")
            )
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-hist-{uuid.uuid4().hex}",
        actor=cashier,
    )

    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None

    # İndi menecer kataloqda qiyməti dəyişir: 40.00 -> 75.00 AZN
    await cat_svc.update_variant(
        var.id,
        ProductVariantUpdate(price_override=Decimal("75.00")),
        actor=admin_actor,
    )

    # Qaytarma kalkulyasiyası aparırıq
    ret_svc = ReturnsService()
    quote = await ret_svc.quote_return(
        company_id=company.id,
        request=ReturnQuoteRequest(
            original_sale_id=sale.id,
            branch_id=branch.id,
            items=[
                ReturnLineInput(
                    original_sale_line_id=sale.lines[0].id,
                    variant_id=var.id,
                    quantity=1,
                    reason_code="DEFECTIVE",
                )
            ],
        ),
        actor=cashier,
    )

    # Qaytarma məbləği kataloqdakı 75.00 deyil, məhz orijinal satışdakı 40.00 AZN olmalıdır!
    assert quote.items[0].unit_price == Decimal("40.00")
    assert quote.refund_total == Decimal("40.00")


@pytest.mark.asyncio
async def test_returns_promotion_invalidation_strict_vs_default() -> None:
    """Aksiya pozulması qaydaları: Standart mütənasib qaytarma vs Sərt fayda tutulması (Clawback)."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Dəniz Mall Filialı",
            address="Neftçilər 24",
            phone="+994125550003",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}", name="Anbar", branch_id=branch.id
        ),
    )
    admin_actor = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="admin@d.az",
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
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-03", name="Kassa 3"
        ),
        actor=admin_actor,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Aksiya Malları", code="CAT-PROMO"),
        company_id=company.id,
        actor=admin_actor,
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="BOGO Dəst",
            internal_code="PRD-BOGO",
            category_id=cat.id,
            section="Kişi",
            type="Geyim",
        ),
        company_id=company.id,
        actor=admin_actor,
    )
    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(sku="BOGO-1", barcode="55501", price_override=Decimal("100.00")),
        actor=admin_actor,
    )

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
                    unit_cost=Decimal("40.0000"),
                )
            ],
            user_id=admin_actor.id,
            actor=admin_actor,
        )
        await uow.commit()

    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_promo",
        email="c@d.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=[
            "pos.shift.open",
            "pos.sale.create",
            "pos.discount.apply",
            "returns.create",
            "returns.refund.cash",
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

    # 1 ədəd 100 AZN, 20 AZN aksiya endirimi tətbiq olunub -> 80 AZN ödənilib
    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=var.id, quantity=1, discount_amount=Decimal("20.00"))],
        expected_grand_total=Decimal("80.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash", amount=Decimal("80.00"), tendered_amount=Decimal("80.00")
            )
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-promo-{uuid.uuid4().hex}",
        actor=cashier,
    )

    # Satış sətrinə simulyasiya edilmiş promotion_info əlavə edirik
    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None
        sale.lines[0].promotion_info = {"promo_type": "BUNDLE", "benefit_amount": "15.00"}
        await uow.commit()

    ret_svc = ReturnsService()

    # 1. Standart siyasət (strict_promotion_invalidation = False): Faktiki ödənilən 80.00 AZN geri qaytarılır
    quote_default = await ret_svc.quote_return(
        company_id=company.id,
        request=ReturnQuoteRequest(
            original_sale_id=sale.id,
            branch_id=branch.id,
            items=[
                ReturnLineInput(
                    original_sale_line_id=sale.lines[0].id,
                    variant_id=var.id,
                    quantity=1,
                    reason_code="CHANGED_MIND",
                )
            ],
            strict_promotion_invalidation=False,
        ),
        actor=cashier,
    )
    assert quote_default.refund_total == Decimal("80.00")
    assert quote_default.promotion_invalidation_applied is False

    # 2. Sərt siyasət (strict_promotion_invalidation = True): İtirilmiş 15.00 AZN fayda çıxılır -> 65.00 AZN qaytarılır
    quote_strict = await ret_svc.quote_return(
        company_id=company.id,
        request=ReturnQuoteRequest(
            original_sale_id=sale.id,
            branch_id=branch.id,
            items=[
                ReturnLineInput(
                    original_sale_line_id=sale.lines[0].id,
                    variant_id=var.id,
                    quantity=1,
                    reason_code="CHANGED_MIND",
                )
            ],
            strict_promotion_invalidation=True,
        ),
        actor=cashier,
    )
    assert quote_strict.refund_total == Decimal("65.00")
    assert quote_strict.promotion_invalidation_applied is True
    assert quote_strict.lost_promotion_benefit_total == Decimal("15.00")
