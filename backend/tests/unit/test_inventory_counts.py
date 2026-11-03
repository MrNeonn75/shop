"""Fiziki İnventarizasiya və Sayım Sessiyaları (Count Sessions) Vahid Testləri."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import CountSessionClosedError
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
    CountSessionStatus,
    MovementType,
    StockStatus,
)
from app.modules.inventory.schemas import (
    CountEntryCreate,
    CountSessionCreate,
    MovementDraft,
)
from app.modules.inventory.service import InventoryService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_count_supervisor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="count_sup",
        email="count_sup@brandhouse.az",
        full_name="Sayım Nəzarətçisi",
        roles=["warehouse_keeper", "branch_manager", "system_admin"],
        permissions=[
            "inventory.ledger.view",
            "inventory.balance.view",
            "inventory.adjust",
            "inventory.count.manage",
            "inventory.count.freeze",
            "inventory.count.scan",
            "inventory.count.approve",
            "inventory.documents.manage",
            "inventory.documents.confirm",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


async def setup_count_test_data() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, str]:
    company = await get_company_service().get_company()
    actor = get_count_supervisor()

    wh = await WarehouseService().create_warehouse(
        WarehouseCreate(
            code=f"WH_{uuid.uuid4().hex[:6].upper()}",
            name="Sayım Sınaq Anbarı",
            warehouse_type="central",
        ),
        company_id=company.id,
        actor=actor,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        CategoryCreate(name="Şalvarlar", code=f"pt_{uuid.uuid4().hex[:6]}", level=1),
        company_id=company.id,
        actor=actor,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"PT-{uuid.uuid4().hex[:6].upper()}",
            name="Cins Şalvar",
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
            sizes=["32"],
            colors=["Göy"],
            dry_run=False,
            default_price=Decimal("89.90"),
            default_cost=Decimal("35.00"),
        ),
        actor=actor,
    )

    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(ProductVariant).where(ProductVariant.product_id == prod.id)
        )
        variant = res.scalars().first()
        assert variant is not None
        barcode = variant.barcode or ""
        return company.id, wh.id, variant.id, barcode


@pytest.mark.asyncio
async def test_count_session_freeze_watermark() -> None:
    company_id, wh_id, var_id, _barcode = await setup_count_test_data()
    service = InventoryService()
    actor = get_count_supervisor()

    # Əvvəlcə anbara 40 ədəd mədaxil edirik
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=40,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("35.0000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )

    # Sayım sessiyası yaradırıq (DRAFT)
    create_dto = CountSessionCreate(
        warehouse_id=wh_id,
        count_scope="full",
        notes="İllik tam inventarizasiya",
    )
    cs = await service.create_count_session(company_id=company_id, data=create_dto, actor=actor)
    assert cs.status == CountSessionStatus.DRAFT.value
    assert cs.session_no.startswith("SC-")

    # Qalıqları dondururuq (Freeze & Start)
    frozen_cs = await service.freeze_and_start_count(cs.id, actor=actor)
    assert frozen_cs.status == CountSessionStatus.COUNTING.value
    assert frozen_cs.frozen_at is not None
    assert len(frozen_cs.lines) >= 1

    # Dondurulmuş gözlənilən qalıq 40 olmalıdır
    line = next(entry for entry in frozen_cs.lines if entry.variant_id == var_id)
    assert line.snapshot_qty == 40
    assert line.counted_qty == 0


@pytest.mark.asyncio
async def test_count_session_scanning_and_entries() -> None:
    company_id, wh_id, var_id, barcode = await setup_count_test_data()
    service = InventoryService()
    actor = get_count_supervisor()

    # 50 ədəd mədaxil
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=50,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("35.0000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )

    # Yarad və dondur
    cs = await service.create_count_session(
        company_id=company_id,
        data=CountSessionCreate(warehouse_id=wh_id, count_scope="full"),
        actor=actor,
    )
    await service.freeze_and_start_count(cs.id, actor=actor)

    # 1. Variant ID ilə 30 ədəd daxil edirik
    e1 = await service.record_count_entry(
        session_id=cs.id,
        data=CountEntryCreate(variant_id=var_id, counted_qty=30),
        actor=actor,
    )
    assert e1.counted_qty == 30

    # 2. Barkod ilə daha 15 ədəd daxil edirik
    e2 = await service.record_count_entry(
        session_id=cs.id,
        data=CountEntryCreate(barcode=barcode, counted_qty=15),
        actor=actor,
    )
    assert e2.counted_qty == 15

    # Sessiyanı yoxlayırıq: cəmi sayılmış 45 olmalıdır, kənarlaşma: 45 - 50 = -5
    cur_cs = await service.get_count_session(cs.id)
    assert cur_cs is not None
    line = next(entry for entry in cur_cs.lines if entry.variant_id == var_id)
    assert line.counted_qty == 45
    assert line.variance_qty == -5


@pytest.mark.asyncio
async def test_count_session_approval_creates_adjustment_doc() -> None:
    company_id, wh_id, var_id, _barcode = await setup_count_test_data()
    service = InventoryService()
    actor = get_count_supervisor()

    # 20 ədəd mədaxil
    await service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=20,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=wh_id,
                to_status=StockStatus.AVAILABLE.value,
                unit_cost=Decimal("30.0000"),
                reference_type="stock_document",
                reference_id=generate_uuid7(),
            )
        ],
        actor=actor,
    )

    # Sessiya yarat və dondur
    cs = await service.create_count_session(
        company_id=company_id,
        data=CountSessionCreate(warehouse_id=wh_id, count_scope="full"),
        actor=actor,
    )
    await service.freeze_and_start_count(cs.id, actor=actor)

    # Faktiki olaraq 25 ədəd sayıldı (+5 kənarlaşma - artıq çıxdı)
    await service.record_count_entry(
        session_id=cs.id,
        data=CountEntryCreate(variant_id=var_id, counted_qty=25),
        actor=actor,
    )

    # Sayımı təsdiqləyirik
    approved = await service.approve_count_session(
        session_id=cs.id,
        reason_code="ANNUAL_COUNT",
        notes="Artıq çıxan 5 ədəd tənzimləndi",
        actor=actor,
    )
    assert approved.status == CountSessionStatus.APPROVED.value
    assert approved.adjustment_document_id is not None

    # Təsdiqdən sonra anbar qalığı faktiki sayılmış 25 olmalıdır!
    bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal is not None
    assert bal["on_hand"] == 25


@pytest.mark.asyncio
async def test_count_entry_on_closed_session_fails() -> None:
    company_id, wh_id, var_id, _barcode = await setup_count_test_data()
    service = InventoryService()
    actor = get_count_supervisor()

    # Sessiya yarat, dondur və təsdiqlə
    cs = await service.create_count_session(
        company_id=company_id,
        data=CountSessionCreate(warehouse_id=wh_id, count_scope="full"),
        actor=actor,
    )
    await service.freeze_and_start_count(cs.id, actor=actor)
    await service.approve_count_session(
        session_id=cs.id,
        reason_code="QUICK_CLOSE",
        notes="Bağlandı",
        actor=actor,
    )

    # Bağlanmış sessiyaya skan etmək cəhdi xəta verməlidir
    with pytest.raises(CountSessionClosedError):
        await service.record_count_entry(
            session_id=cs.id,
            data=CountEntryCreate(variant_id=var_id, counted_qty=1),
            actor=actor,
        )
