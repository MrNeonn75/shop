"""Stok Qeydiyyat Mühərriki (Posting Engine) Vahid Testləri."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import (
    ForbiddenError,
    InsufficientStockError,
    NegativeStockForbiddenError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.policies import AuthenticatedUser
from app.modules.catalog.models import (
    ProductVariant,
)
from app.modules.company.service import get_company_service
from app.modules.inventory.models import MovementType, StockStatus
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.shared.outbox import OutboxEvent


def get_inventory_admin() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="inv_admin",
        email="inv_admin@brandhouse.az",
        full_name="İnventar Meneceri",
        roles=["system_admin", "general_manager"],
        permissions=[
            "inventory.ledger.view",
            "inventory.balance.view",
            "inventory.adjust",
            "inventory.negative.override",
            "inventory.documents.manage",
            "inventory.documents.confirm",
            "inventory.documents.reverse",
            "inventory.count.manage",
            "inventory.count.freeze",
            "inventory.count.scan",
            "inventory.count.approve",
            "inventory.valuation.view",
            "inventory.reconcile",
            "transfers.manage",
            "transfers.approve",
            "transfers.dispatch",
            "transfers.receive",
            "transfers.cancel",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


async def setup_test_master_data() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Test üçün zəruri olan Şirkət, Anbar və Məhsul Variantını yaradır."""
    company = await get_company_service().get_company()
    actor = get_inventory_admin()

    from app.modules.catalog.schemas import (
        CategoryCreate,
        ProductCreate,
        VariantMatrixGenerateRequest,
    )
    from app.modules.catalog.service import CatalogService
    from app.modules.warehouses.schemas import WarehouseCreate
    from app.modules.warehouses.service import WarehouseService

    wh = await WarehouseService().create_warehouse(
        WarehouseCreate(
            code=f"WH_{uuid.uuid4().hex[:6].upper()}",
            name="Əsas Mərkəzi Anbar",
            warehouse_type="central",
        ),
        company_id=company.id,
        actor=actor,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        CategoryCreate(name="Geyim", code=f"cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=company.id,
        actor=actor,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Kişi Köynəyi",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=actor,
    )
    await cat_svc.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["L"],
            colors=["Ağ"],
            dry_run=False,
            default_price=Decimal("25.00"),
            default_cost=Decimal("15.00"),
        ),
        actor=actor,
    )

    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(ProductVariant).where(ProductVariant.product_id == prod.id)
        )
        variant = res.scalars().first()
        assert variant is not None
        return company.id, wh.id, variant.id


@pytest.mark.asyncio
async def test_inventory_posting_receipt_and_balance_update() -> None:
    company_id, wh_id, var_id = await setup_test_master_data()
    service = InventoryService()
    actor = get_inventory_admin()

    # Mədaxil hərəkəti (RECEIPT)
    draft = MovementDraft(
        variant_id=var_id,
        quantity=20,
        movement_type=MovementType.RECEIPT.value,
        to_warehouse_id=wh_id,
        to_status=StockStatus.AVAILABLE.value,
        unit_cost=Decimal("15.5000"),
        reference_type="stock_document",
        reference_id=generate_uuid7(),
    )

    movements = await service.post_batch(
        company_id=company_id,
        movements=[draft],
        actor=actor,
    )

    assert len(movements) == 1
    m = movements[0]
    assert m.quantity == 20
    assert m.unit_cost == Decimal("15.5000")
    assert m.total_cost == Decimal("310.0000")
    assert m.movement_no is not None

    # Qalığı yoxlayırıq
    bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal is not None
    assert bal["on_hand"] == 20
    assert bal["available"] == 20


@pytest.mark.asyncio
async def test_inventory_posting_issue_and_sale() -> None:
    company_id, wh_id, var_id = await setup_test_master_data()
    service = InventoryService()
    actor = get_inventory_admin()

    # Əvvəlcə 20 ədəd mədaxil edirik
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=20,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("10.0000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )

    # 5 ədəd satış (SALE)
    sale_mov = await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=5,
                movement_type=MovementType.SALE.value,
                from_warehouse_id=wh_id,
                from_status=StockStatus.AVAILABLE.value,
                reference_type="pos_sale",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )
    assert len(sale_mov) == 1
    assert sale_mov[0].unit_cost == Decimal("10.0000")  # Snapshot COGS götürülür

    bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal is not None
    assert bal["on_hand"] == 15

    # 3 ədəd məxaric (ISSUE)
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=3,
                movement_type=MovementType.ISSUE.value,
                from_warehouse_id=wh_id,
                from_status=StockStatus.AVAILABLE.value,
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )
    bal2 = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal2 is not None
    assert bal2["on_hand"] == 12


@pytest.mark.asyncio
async def test_inventory_posting_negative_forbidden_by_default() -> None:
    company_id, wh_id, var_id = await setup_test_master_data()
    service = InventoryService()
    actor = get_inventory_admin()

    # Mədaxil olmadan birbaşa 10 ədəd məxaric cəhdi
    draft = MovementDraft(
        variant_id=var_id,
        quantity=10,
        movement_type=MovementType.ISSUE.value,
        from_warehouse_id=wh_id,
        from_status=StockStatus.AVAILABLE.value,
        reference_type="stock_document",
        reference_id=generate_uuid7(),
    )

    with pytest.raises(InsufficientStockError):
        await service.post_batch(
            company_id=company_id,
            movements=[draft],
            actor=actor,
        )

    # Qalıq dəyişməz qalmalıdır
    bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal is None or bal["on_hand"] == 0


@pytest.mark.asyncio
async def test_inventory_posting_negative_override_flow() -> None:
    company_id, wh_id, var_id = await setup_test_master_data()
    service = InventoryService()
    actor = get_inventory_admin()

    draft = MovementDraft(
        variant_id=var_id,
        quantity=7,
        movement_type=MovementType.ISSUE.value,
        from_warehouse_id=wh_id,
        from_status=StockStatus.AVAILABLE.value,
        reference_type="stock_document",
        reference_id=generate_uuid7(),
    )

    # 1. Bayraq verilib amma əsaslandırma səbəbi (override_reason) yoxdur -> Xəta verməlidir
    with pytest.raises(NegativeStockForbiddenError):
        await service.post_batch(
            company_id=company_id,
            movements=[draft],
            allow_negative_override=True,
            override_reason=None,
            actor=actor,
        )

    # 2. Hüququ olmayan istifadəçi override etməyə cəhd edir -> Xəta verməlidir
    unprivileged = AuthenticatedUser(
        id=generate_uuid7(),
        username="clerk",
        email="clerk@brandhouse.az",
        full_name="Kassir",
        roles=["cashier"],
        permissions=["inventory.ledger.view"],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )
    with pytest.raises(ForbiddenError):
        await service.post_batch(
            company_id=company_id,
            movements=[draft],
            allow_negative_override=True,
            override_reason="Satış tələb edir",
            actor=unprivileged,
        )

    # 3. Səlahiyyətli istifadəçi + əsaslandırma ilə icazə verilir
    movements = await service.post_batch(
        company_id=company_id,
        movements=[draft],
        allow_negative_override=True,
        override_reason="Rəhbərliyin təcili şifahi icazəsi",
        actor=actor,
    )
    assert len(movements) == 1

    bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal is not None
    assert bal["on_hand"] == -7
    assert bal["allow_negative"] is True


@pytest.mark.asyncio
async def test_inventory_posting_idempotency_replay() -> None:
    company_id, wh_id, var_id = await setup_test_master_data()
    service = InventoryService()
    actor = get_inventory_admin()
    idemp_key = f"key_{uuid.uuid4().hex}"

    draft = MovementDraft(
        variant_id=var_id,
        quantity=15,
        movement_type=MovementType.RECEIPT.value,
        to_warehouse_id=wh_id,
        to_status=StockStatus.AVAILABLE.value,
        unit_cost=Decimal("20.0000"),
        reference_type="stock_document",
        reference_id=generate_uuid7(),
    )

    # 1-ci çağırış
    first_res = await service.post_batch(
        company_id=company_id,
        movements=[draft],
        idempotency_key=idemp_key,
        actor=actor,
    )
    assert len(first_res) == 1
    first_id = first_res[0].id

    # 2-ci eyni açarla təkrar çağırış
    second_res = await service.post_batch(
        company_id=company_id,
        movements=[draft],
        idempotency_key=idemp_key,
        actor=actor,
    )
    assert len(second_res) == 1
    assert second_res[0].id == first_id

    # Qalıq 15 olmalıdır, 30 olmamalıdır!
    bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal is not None
    assert bal["on_hand"] == 15


@pytest.mark.asyncio
async def test_inventory_posting_reversal() -> None:
    company_id, wh_id, var_id = await setup_test_master_data()
    service = InventoryService()
    actor = get_inventory_admin()

    # Əvvəlcə mədaxil
    orig_movs = await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=10,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("50.0000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )
    orig_id = orig_movs[0].id

    # Kompensasiyaedici ləğvetmə (REVERSAL)
    rev_draft = MovementDraft(
        variant_id=var_id,
        quantity=10,
        movement_type=MovementType.REVERSAL.value,
        from_warehouse_id=wh_id,
        from_status=StockStatus.AVAILABLE.value,
        unit_cost=Decimal("50.0000"),
        reference_type="stock_document",
        reference_id=generate_uuid7(),
        reverses_movement_id=orig_id,
        notes="Səhv mədaxil ləğv edildi",
    )
    rev_movs = await service.post_batch(
        company_id=company_id,
        movements=[rev_draft],
        actor=actor,
    )
    assert len(rev_movs) == 1
    assert rev_movs[0].reverses_movement_id == orig_id

    bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal is not None
    assert bal["on_hand"] == 0


@pytest.mark.asyncio
async def test_inventory_outbox_events_recorded() -> None:
    company_id, wh_id, var_id = await setup_test_master_data()
    service = InventoryService()
    actor = get_inventory_admin()

    # Mədaxil
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=10,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("12.0000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )

    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(OutboxEvent).where(OutboxEvent.event_type == "stock.changed")
        )
        events = res.scalars().all()
        assert len(events) >= 1
