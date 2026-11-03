"""Qaytarmalar Modulu: Say Təhlükəsizliyi və Paralellik Testləri (Quantity Safety & Concurrency).

1. Qismən qaytarmaların ardıcıllığı: Qaytarılan toplam say heç vaxt satılan sayı aşmır.
2. Eyni sətir üzrə 50 paralel qaytarma cəhdi: FOR UPDATE kilidi sayəsində oversell / over-return qeyri-mümkündür.
"""

from __future__ import annotations

import asyncio
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
from app.modules.returns.models import SaleLineReturnState
from app.modules.returns.repository import ReturnsRepository
from app.modules.returns.schemas import RefundMethodInput, ReturnCreateRequest, ReturnLineInput
from app.modules.returns.service import ReturnsService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_returns_user(branch_id: uuid.UUID, roles: list[str], perms: list[str]) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=f"user_{uuid.uuid4().hex[:6]}",
        email=f"user_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name="Kassir Test",
        roles=roles,
        permissions=perms,
        allowed_branches=[branch_id],
        session_id=uuid.uuid4(),
    )


async def setup_return_test_fixture(initial_stock: int = 20, sold_qty: int = 10) -> dict:
    """Qaytarma testləri üçün tam mühit və ilkin tamamlanmış satış sənədi formalaşdırır."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Gənclik Mall Filialı",
            address="Fətəli Xan Xoyski 14",
            phone="+994125550114",
        ),
    )

    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}",
            name="Gənclik Satış Anbarı",
            warehouse_type="branch",
            branch_id=branch.id,
        ),
    )

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

    reg_svc = CashRegisterService()
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
            name=f"Köynək-{uuid.uuid4().hex[:4]}",
            code=f"CAT-{uuid.uuid4().hex[:4].upper()}",
            level=1,
        ),
        company_id=company.id,
        actor=admin_actor,
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Klassik Köynək",
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            section="Kişi",
            type="Geyim",
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
            size="L",
            color="Ağ",
            price_override=Decimal("50.00"),
        ),
        actor=admin_actor,
    )

    # İlkin anbar stoku mədaxili (50 AZN satış, 20 AZN maya)
    inv_svc = InventoryService()
    async with UnitOfWork() as uow:
        await inv_svc.post(
            session=uow.session,
            company_id=company.id,
            movements=[
                MovementDraft(
                    variant_id=var.id,
                    quantity=initial_stock,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="OPENING",
                    unit_cost=Decimal("20.0000"),
                )
            ],
            user_id=admin_actor.id,
            actor=admin_actor,
        )
        await uow.commit()

    # Kassa növbəsi açırıq
    cashier = get_returns_user(
        branch.id,
        roles=["cashier", "branch_manager"],
        perms=[
            "pos.shift.open",
            "pos.shift.close",
            "pos.sale.create",
            "returns.create",
            "returns.refund.cash",
            "returns.refund.provider",
            "returns.view",
            "returns.approve",
        ],
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(
            register_id=register.id,
            opening_cash=Decimal("500.00"),
            mismatch_reason="İlkin növbə qalığı",
            opening_notes="Səhər növbəsi",
        ),
        company_id=company.id,
        actor=cashier,
    )

    # İlkin satış icra edirik (sold_qty qədər)
    grand_total = Decimal("50.00") * Decimal(str(sold_qty))
    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=var.id, quantity=sold_qty)],
        expected_grand_total=grand_total,
        payments=[
            TenderPaymentInput(tender_type="cash", amount=grand_total, tendered_amount=grand_total)
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"init-sale-{uuid.uuid4().hex}",
        actor=cashier,
    )

    # Satış sənədini oxuyuruq
    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None
        sale_line = sale.lines[0]
        ret_repo = ReturnsRepository()
        await ret_repo.get_or_create_return_state(uow.session, sale_line)
        await uow.commit()

    return {
        "company": company,
        "branch": branch,
        "warehouse": warehouse,
        "register": register,
        "product": prod,
        "variant": var,
        "shift": shift,
        "cashier": cashier,
        "sale": sale,
        "sale_line": sale_line,
    }


@pytest.mark.asyncio
async def test_returns_quantity_sequence_partial_returns() -> None:
    """Qismən qaytarmaların ardıcıllığı: Satılan saydan (10 ədəd) çox qaytarma bloklanır."""
    fixture = await setup_return_test_fixture(initial_stock=20, sold_qty=10)
    company = fixture["company"]
    register = fixture["register"]
    shift = fixture["shift"]
    cashier = fixture["cashier"]
    sale = fixture["sale"]
    sale_line = fixture["sale_line"]

    ret_svc = ReturnsService()

    # 1. İlk qaytarma: 4 ədəd (Qalıq qaytarıla bilən: 6)
    req1 = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=sale_line.variant_id,
                quantity=4,
                reason_code="CHANGED_MIND",
                condition="RESALABLE",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("200.00"))],
        expected_refund_total=Decimal("200.00"),
    )
    res1 = await ret_svc.create_return(
        company_id=company.id,
        request=req1,
        actor=cashier,
        idempotency_key=f"ret-step1-{uuid.uuid4().hex}",
    )
    assert res1.refund_total == Decimal("200.00")

    # Qalıq sayları yoxlayırıq: returnable = 6
    info1 = await ret_svc.get_sale_returnable_info(company.id, sale.id, actor=cashier)
    assert info1.lines[0].returnable_quantity == 6
    assert info1.lines[0].already_returned_quantity == 4

    # 2. İkinci qaytarma: 5 ədəd (Qalıq qaytarıla bilən: 1)
    req2 = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=sale_line.variant_id,
                quantity=5,
                reason_code="WRONG_SIZE",
                condition="RESALABLE",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("250.00"))],
        expected_refund_total=Decimal("250.00"),
    )
    res2 = await ret_svc.create_return(
        company_id=company.id,
        request=req2,
        actor=cashier,
        idempotency_key=f"ret-step2-{uuid.uuid4().hex}",
    )
    assert res2.refund_total == Decimal("250.00")

    # Qalıq sayları yoxlayırıq: returnable = 1
    info2 = await ret_svc.get_sale_returnable_info(company.id, sale.id, actor=cashier)
    assert info2.lines[0].returnable_quantity == 1
    assert info2.lines[0].already_returned_quantity == 9

    # 3. Üçüncü cəhd: 2 ədəd qaytarmağa çalışırıq -> 1 qalıb, 2 tələb edilir -> EXCEEDS_RETURNABLE_QUANTITY
    req3_bad = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=sale_line.variant_id,
                quantity=2,
                reason_code="DEFECTIVE",
                condition="DAMAGED",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("100.00"))],
        expected_refund_total=Decimal("100.00"),
    )
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await ret_svc.create_return(
            company_id=company.id,
            request=req3_bad,
            actor=cashier,
            idempotency_key=f"ret-step3-fail-{uuid.uuid4().hex}",
        )
    assert exc_info.value.code == "EXCEEDS_RETURNABLE_QUANTITY"

    # 4. Dördüncü cəhd: Düzgün 1 ədəd qaytarırıq (Tam 10 ədəd qaytarılmış olur)
    req4_ok = ReturnCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=sale_line.variant_id,
                quantity=1,
                reason_code="DEFECTIVE",
                condition="DAMAGED",
            )
        ],
        refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("50.00"))],
        expected_refund_total=Decimal("50.00"),
    )
    res4 = await ret_svc.create_return(
        company_id=company.id,
        request=req4_ok,
        actor=cashier,
        idempotency_key=f"ret-step4-{uuid.uuid4().hex}",
    )
    assert res4.refund_total == Decimal("50.00")

    # Qalıq sayları yoxlayırıq: returnable = 0, already_returned = 10
    info4 = await ret_svc.get_sale_returnable_info(company.id, sale.id, actor=cashier)
    assert info4.lines[0].returnable_quantity == 0
    assert info4.lines[0].already_returned_quantity == 10

    # 5. Artıq heç bir məhsul qaytarıla bilməz (0 qalıb)
    with pytest.raises(BusinessRuleViolationError) as exc_after:
        await ret_svc.create_return(
            company_id=company.id,
            request=req4_ok,
            actor=cashier,
            idempotency_key=f"ret-step5-zero-{uuid.uuid4().hex}",
        )
    assert exc_after.value.code == "EXCEEDS_RETURNABLE_QUANTITY"


@pytest.mark.asyncio
async def test_returns_50_concurrent_return_attempts() -> None:
    """50 paralel qaytarma cəhdi: 10 ədəd satılıb, 50 cəhdin hərəsi 1 ədəd tələb edir -> Dəqiq 10-u uğurlu, 40-ı rədd."""
    fixture = await setup_return_test_fixture(initial_stock=30, sold_qty=10)
    company = fixture["company"]
    register = fixture["register"]
    shift = fixture["shift"]
    cashier = fixture["cashier"]
    sale = fixture["sale"]
    sale_line = fixture["sale_line"]

    ret_svc = ReturnsService()

    async def attempt_return(task_idx: int) -> bool:
        req = ReturnCreateRequest(
            original_sale_id=sale.id,
            register_id=register.id,
            shift_id=shift.id,
            items=[
                ReturnLineInput(
                    original_sale_line_id=sale_line.id,
                    variant_id=sale_line.variant_id,
                    quantity=1,
                    reason_code="CHANGED_MIND",
                    condition="RESALABLE",
                )
            ],
            refund_methods=[RefundMethodInput(tender_type="cash", amount=Decimal("50.00"))],
            expected_refund_total=Decimal("50.00"),
        )
        try:
            await ret_svc.create_return(
                company_id=company.id,
                request=req,
                actor=cashier,
                idempotency_key=f"conc-ret-{task_idx}-{uuid.uuid4().hex}",
            )
            return True
        except BusinessRuleViolationError as e:
            if e.code == "EXCEEDS_RETURNABLE_QUANTITY":
                return False
            raise

    # 50 paralel sorğu icra edirik
    tasks = [attempt_return(i) for i in range(50)]
    results = await asyncio.gather(*tasks)

    success_count = sum(1 for r in results if r is True)
    failed_count = sum(1 for r in results if r is False)

    # Assert: Uğurlu olanların sayı dəqiq 10-dur (heç vaxt 10-dan çox ola bilməz)
    assert success_count == 10
    assert failed_count == 40

    # Bazada status sayğacını yoxlayırıq
    async with UnitOfWork() as uow:
        stmt = select(SaleLineReturnState).where(SaleLineReturnState.sale_line_id == sale_line.id)
        res = await uow.session.execute(stmt)
        state = res.scalar_one()
        assert state.sold_qty == 10
        assert state.returned_qty == 10
        assert state.reserved_qty == 0
