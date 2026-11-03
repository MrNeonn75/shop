"""İnventar Maya Dəyəri (Costing), Qiymətləndirmə (Valuation) və Rekonsiliasiya Testləri."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.policies import AuthenticatedUser
from app.modules.catalog.models import ProductVariant
from app.modules.catalog.schemas import (
    CategoryCreate,
    ProductCreate,
    VariantMatrixGenerateRequest,
)
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service
from app.modules.inventory.models import (
    InventoryCostState,
    MovementType,
    StockBalance,
    StockStatus,
)
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_cost_admin() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="cost_admin",
        email="cost_admin@brandhouse.az",
        full_name="Maliyyə Mühasibi",
        roles=["accountant", "system_admin"],
        permissions=[
            "inventory.ledger.view",
            "inventory.balance.view",
            "inventory.adjust",
            "inventory.valuation.view",
            "inventory.reconcile",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


async def setup_cost_test_data() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    company = await get_company_service().get_company()
    actor = get_cost_admin()

    wh = await WarehouseService().create_warehouse(
        WarehouseCreate(
            code=f"WH_{uuid.uuid4().hex[:6].upper()}",
            name="Mərkəzi Qiymətləndirmə Anbarı",
            warehouse_type="central",
        ),
        company_id=company.id,
        actor=actor,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        CategoryCreate(name="Aksesuarlar", code=f"acc_{uuid.uuid4().hex[:6]}", level=1),
        company_id=company.id,
        actor=actor,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"ACC-{uuid.uuid4().hex[:6].upper()}",
            name="Dəri Kəmər",
            section="Kişi",
            type="Aksesuar",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=actor,
    )
    await cat_svc.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["STD"],
            colors=["Qara"],
            dry_run=False,
            default_price=Decimal("40.00"),
            default_cost=Decimal("10.00"),
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
async def test_weighted_average_cost_calculations() -> None:
    company_id, wh_id, var_id = await setup_cost_test_data()
    service = InventoryService()
    actor = get_cost_admin()

    # 1. İlk mədaxil: 10 ədəd @ 10.00 AZN
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=10,
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

    # Orta çəkili maya 10.0000 olmalıdır
    async with UnitOfWork() as uow:
        st1 = (
            await uow.session.execute(
                select(InventoryCostState).where(
                    InventoryCostState.company_id == company_id,
                    InventoryCostState.warehouse_id.is_(None),
                    InventoryCostState.variant_id == var_id,
                )
            )
        ).scalar_one()
        assert st1.unit_cost == Decimal("10.0000")
        assert st1.total_quantity == 10
        assert st1.total_value == Decimal("100.0000")

    # 2. İkinci mədaxil: 10 ədəd @ 20.00 AZN
    # Yeni orta çəkili: (10 * 10 + 10 * 20) / 20 = 300 / 20 = 15.0000 AZN
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=10,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("20.0000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )

    async with UnitOfWork() as uow:
        st2 = (
            await uow.session.execute(
                select(InventoryCostState).where(
                    InventoryCostState.company_id == company_id,
                    InventoryCostState.warehouse_id.is_(None),
                    InventoryCostState.variant_id == var_id,
                )
            )
        ).scalar_one()
        assert st2.unit_cost == Decimal("15.0000")
        assert st2.total_quantity == 20
        assert st2.total_value == Decimal("300.0000")

    # 3. Satış / Məxaric: 5 ədəd çıxır -> Maya dəyəri snapshot 15.0000 olmalıdır, orta dəyər dəyişmir
    sale_movs = await service.post_batch(
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
    assert sale_movs[0].unit_cost == Decimal("15.0000")
    assert sale_movs[0].total_cost == Decimal("75.0000")

    async with UnitOfWork() as uow:
        st3 = (
            await uow.session.execute(
                select(InventoryCostState).where(
                    InventoryCostState.company_id == company_id,
                    InventoryCostState.warehouse_id.is_(None),
                    InventoryCostState.variant_id == var_id,
                )
            )
        ).scalar_one()
        assert st3.unit_cost == Decimal("15.0000")
        assert st3.total_quantity == 15


@pytest.mark.asyncio
async def test_inventory_valuation_report() -> None:
    company_id, wh_id, var_id = await setup_cost_test_data()
    service = InventoryService()
    actor = get_cost_admin()

    # Mədaxil edirik: 20 ədəd @ 12.50 AZN
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=20,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("12.5000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )

    report = await service.get_valuation_report(company_id=company_id, warehouse_id=wh_id)
    assert report.total_quantity >= 20
    assert report.total_value >= Decimal("250.00")
    assert len(report.items) >= 1

    item = next(it for it in report.items if it.variant_id == var_id)
    assert item.quantity == 20
    assert item.unit_cost == Decimal("12.5000")
    assert item.total_value == Decimal("250.0000")


@pytest.mark.asyncio
async def test_reconciliation_and_rebuild() -> None:
    company_id, wh_id, var_id = await setup_cost_test_data()
    service = InventoryService()
    actor = get_cost_admin()

    # 1. Hərəkətlər icra edirik
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=30,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("8.0000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            ),
            MovementDraft(
                variant_id=var_id,
                quantity=10,
                movement_type=MovementType.SALE.value,
                from_warehouse_id=wh_id,
                from_status=StockStatus.AVAILABLE.value,
                reference_type="pos_sale",
                reference_id=generate_uuid7(),
            ),
        ],
        actor=actor,
    )

    # 2. Rekonsiliasiya yoxlayırıq (Drift = 0 olmalıdır)
    recon = await service.reconcile_balances(
        company_id=company_id, warehouse_id=wh_id, variant_id=var_id
    )
    assert recon.status == "OK"
    assert recon.drifts_count == 0

    # 3. Süni drift yaradırıq (balansı dəyişirik)
    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(StockBalance).where(
                StockBalance.warehouse_id == wh_id,
                StockBalance.variant_id == var_id,
                StockBalance.stock_status == StockStatus.AVAILABLE.value,
            )
        )
        bal = res.scalar_one()
        bal.on_hand = 999  # Süni pozuntu
        await uow.commit()

    # Rekonsiliasiya indi drift aşkar etməlidir
    drifted_recon = await service.reconcile_balances(
        company_id=company_id, warehouse_id=wh_id, variant_id=var_id
    )
    assert drifted_recon.status == "DRIFT_DETECTED"
    assert drifted_recon.drifts_count == 1
    assert drifted_recon.drifts[0].drift == 999 - 20  # 979 vahid fərq

    # 4. Rebuild icra edirik və Ledger-dən qalıqların bərpa olunduğunu təsdiqləyirik
    rebuild_res = await service.rebuild_balances(
        company_id=company_id, warehouse_id=wh_id, variant_id=var_id
    )
    assert rebuild_res.records_rebuilt >= 1
    assert rebuild_res.drifts_repaired >= 1

    # İndi yenidən yoxlayırıq: qalıq tam 20 olmalıdır!
    fixed_bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert fixed_bal is not None
    assert fixed_bal["on_hand"] == 20
