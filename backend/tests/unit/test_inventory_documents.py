"""Anbar Sənədləri (Stock Documents) Vahid Testləri."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import BusinessRuleViolationError
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
    DocumentStatus,
    StockStatus,
)
from app.modules.inventory.schemas import (
    StockDocumentCreate,
    StockDocumentLineCreate,
)
from app.modules.inventory.service import InventoryService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_doc_admin() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="doc_admin",
        email="doc_admin@brandhouse.az",
        full_name="Anbardar Məsul",
        roles=["warehouse_keeper", "system_admin"],
        permissions=[
            "inventory.ledger.view",
            "inventory.balance.view",
            "inventory.adjust",
            "inventory.documents.manage",
            "inventory.documents.confirm",
            "inventory.documents.reverse",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


async def setup_doc_test_data() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    company = await get_company_service().get_company()
    actor = get_doc_admin()

    wh = await WarehouseService().create_warehouse(
        WarehouseCreate(
            code=f"WH_{uuid.uuid4().hex[:6].upper()}",
            name="Sənədlər Əsas Anbarı",
            warehouse_type="central",
        ),
        company_id=company.id,
        actor=actor,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        CategoryCreate(name="Ayaqqabı", code=f"sh_{uuid.uuid4().hex[:6]}", level=1),
        company_id=company.id,
        actor=actor,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"SH-{uuid.uuid4().hex[:6].upper()}",
            name="Dəri Çəkmə",
            section="Kişi",
            type="Ayaqqabı",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=actor,
    )
    await cat_svc.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["42"],
            colors=["Qəhvəyi"],
            dry_run=False,
            default_price=Decimal("120.00"),
            default_cost=Decimal("60.00"),
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
async def test_document_create_draft_and_list() -> None:
    company_id, wh_id, var_id = await setup_doc_test_data()
    service = InventoryService()
    actor = get_doc_admin()

    create_data = StockDocumentCreate(
        document_type="receipt",
        warehouse_id=wh_id,
        notes="Sənəd layihəsi qeydləri: INV-2026-999",
        lines=[
            StockDocumentLineCreate(
                variant_id=var_id,
                quantity=50,
                unit_cost=Decimal("55.0000"),
                target_status=StockStatus.AVAILABLE.value,
                notes="Mövsümi ilkin qəbul",
            )
        ],
    )

    doc = await service.create_document(company_id=company_id, data=create_data, actor=actor)
    assert doc.id is not None
    assert doc.status == DocumentStatus.DRAFT.value
    assert doc.document_no.startswith("DOC-")
    assert doc.total_quantity == 50
    assert doc.total_cost == Decimal("2750.0000")
    assert len(doc.lines) == 1

    # Siyahıda görünməsi
    docs = await service.list_documents(
        company_id=company_id, warehouse_id=wh_id, document_type="receipt"
    )
    assert len(docs) >= 1
    found = next((d for d in docs if d.id == doc.id), None)
    assert found is not None


@pytest.mark.asyncio
async def test_document_confirm_and_ledger_commit() -> None:
    company_id, wh_id, var_id = await setup_doc_test_data()
    service = InventoryService()
    actor = get_doc_admin()

    # Mədaxil sənədi yaradırıq
    create_data = StockDocumentCreate(
        document_type="receipt",
        warehouse_id=wh_id,
        lines=[
            StockDocumentLineCreate(
                variant_id=var_id,
                quantity=15,
                unit_cost=Decimal("70.0000"),
                target_status=StockStatus.AVAILABLE.value,
            )
        ],
    )
    doc = await service.create_document(company_id=company_id, data=create_data, actor=actor)

    # Təsdiqləyirik
    confirmed = await service.confirm_document(doc.id, actor=actor)
    assert confirmed.status == DocumentStatus.CONFIRMED.value
    assert confirmed.confirmed_at is not None

    # Ledger və Balans yoxlanılır
    bal = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal is not None
    assert bal["on_hand"] == 15

    # Təkrar təsdiq xəta verməlidir
    with pytest.raises(BusinessRuleViolationError):
        await service.confirm_document(doc.id, actor=actor)


@pytest.mark.asyncio
async def test_document_reverse_and_compensating_movements() -> None:
    company_id, wh_id, var_id = await setup_doc_test_data()
    service = InventoryService()
    actor = get_doc_admin()

    # Sənəd yarat və təsdiqlə
    create_data = StockDocumentCreate(
        document_type="receipt",
        warehouse_id=wh_id,
        lines=[
            StockDocumentLineCreate(
                variant_id=var_id,
                quantity=8,
                unit_cost=Decimal("45.0000"),
                target_status=StockStatus.AVAILABLE.value,
            )
        ],
    )
    doc = await service.create_document(company_id=company_id, data=create_data, actor=actor)
    await service.confirm_document(doc.id, actor=actor)

    bal_before = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal_before is not None
    assert bal_before["on_hand"] == 8

    # Ləğv (reversal)
    rev_doc = await service.reverse_document(
        document_id=doc.id,
        reason_code="DATA_ENTRY_ERROR",
        reason_text="Məbləğ səhv daxil edilib",
        actor=actor,
    )
    assert rev_doc.status == DocumentStatus.REVERSED.value
    assert rev_doc.reversed_at is not None

    # Qalıq 0-a düşməlidir
    bal_after = await service.get_single_balance(wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal_after is not None
    assert bal_after["on_hand"] == 0

    # Artıq ləğv edilmiş sənədi yenidən ləğv etmək xəta verməlidir
    with pytest.raises(BusinessRuleViolationError):
        await service.reverse_document(
            document_id=doc.id,
            reason_code="ANOTHER_REASON",
            reason_text="Təkrar ləğv",
            actor=actor,
        )
