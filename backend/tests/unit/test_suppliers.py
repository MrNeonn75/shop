"""Təchizatçılar Modulu Vahid Testləri (Suppliers Unit Tests)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import ConflictError
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
from app.modules.suppliers.models import (
    SupplierLedgerEntryType,
    SupplierStatus,
)
from app.modules.suppliers.policies import (
    calculate_name_similarity,
    mask_bank_details,
    normalize_tax_id,
)
from app.modules.suppliers.schemas import (
    SupplierContactCreate,
    SupplierCreate,
    SupplierDocumentCreate,
    SupplierProductCreate,
    SupplierUpdate,
)
from app.modules.suppliers.service import SupplierService


def get_supplier_admin() -> AuthenticatedUser:
    """Tam hüquqlu təchizat meneceri."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="sup_admin",
        email="sup_admin@brandhouse.az",
        full_name="Təchizat İnzibatçısı",
        roles=["system_admin", "procurement_manager", "finance_manager"],
        permissions=[
            "suppliers.manage",
            "suppliers.bank.view",
            "suppliers.documents.manage",
            "catalog.product.manage",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


def get_supplier_viewer_no_bank() -> AuthenticatedUser:
    """Bank məlumatlarına icazəsi olmayan təchizat əməkdaşı."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="sup_viewer",
        email="sup_viewer@brandhouse.az",
        full_name="Təchizatçı Baxıcı",
        roles=["procurement_specialist"],
        permissions=["suppliers.manage"],  # lacking suppliers.bank.view
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


def get_unauthorized_user() -> AuthenticatedUser:
    """Heç bir icazəsi olmayan kənar istifadəçi."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="guest",
        email="guest@brandhouse.az",
        full_name="Qonaq İstifadəçi",
        roles=[],
        permissions=[],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


@pytest.mark.asyncio
async def test_supplier_policies_tax_and_name_matching():
    """VÖEN normalizasiyası və ad oxşarlığı alqoritmini yoxlayır."""
    assert normalize_tax_id("  1234567890  ") == "1234567890"
    assert normalize_tax_id(None) is None

    # Eyni və ya oxşar adlar
    score1 = calculate_name_similarity("Zara Moda MMC", "Zara Moda MMC")
    assert score1 == 1.0

    score2 = calculate_name_similarity("Zara Moda MMC", "Zara Moda ASC")
    assert score2 > 0.6

    score3 = calculate_name_similarity("Apple MMC", "Bakı Tekstil MMC")
    assert score3 < 0.3


@pytest.mark.asyncio
async def test_mask_bank_details():
    """Bank detallarının maskalanma siyasətini yoxlayır."""
    assert mask_bank_details(None, has_permission=False) is None
    masked = mask_bank_details(
        {"iban": "AZ12345678901234567890", "bank_name": "Kapital Bank"}, has_permission=False
    )
    assert masked is not None
    assert masked["bank_name"].endswith("Bank")
    assert masked["iban"].endswith("7890")
    assert "****" in masked["iban"]

    unmasked = mask_bank_details(
        {"iban": "AZ12345678901234567890", "bank_name": "Kapital Bank"}, has_permission=True
    )
    assert unmasked is not None
    assert unmasked["iban"] == "AZ12345678901234567890"


@pytest.mark.asyncio
async def test_supplier_crud_and_bank_masking():
    """Təchizatçı yaradılması, oxunması və bank məlumatlarının maskalanması."""
    company = await get_company_service().get_company()
    admin = get_supplier_admin()
    viewer = get_supplier_viewer_no_bank()
    svc = SupplierService()

    tax_id = f"TAX{uuid.uuid4().hex[:6].upper()}"
    create_dto = SupplierCreate(
        code=f"SUP-{uuid.uuid4().hex[:4].upper()}",
        name="Tekstil Group MMC",
        legal_name="Tekstil Group Məhdud Məsuliyyətli Cəmiyyəti",
        tax_id=tax_id,
        payment_terms_days=30,
        payment_method="bank_transfer",
        default_currency="AZN",
        bank_details={"iban": "AZ21NABZ01350100000000123456", "bank_name": "ABB"},
        notes="Əsas parça təchizatçısı",
    )

    created = await svc.create_supplier(company.id, create_dto, actor=admin)
    assert created.id is not None
    assert created.name == "Tekstil Group MMC"
    assert created.tax_id == tax_id
    assert created.status == SupplierStatus.ACTIVE

    # Admin ilə baxış (bank unmasked)
    admin_view = await svc.get_supplier(created.id, actor=admin)
    assert admin_view.bank_details is not None
    assert admin_view.bank_details.get("iban") == "AZ21NABZ01350100000000123456"

    # Bank icazəsi olmayan baxıcı ilə baxış (bank masked)
    viewer_view = await svc.get_supplier(created.id, actor=viewer)
    assert viewer_view.bank_details is not None
    assert "****" in viewer_view.bank_details.get("iban", "")
    assert viewer_view.bank_details.get("_is_masked") is True

    # Təkrar eyni kod ilə yaradılma xətası (ConflictError)
    with pytest.raises(ConflictError):
        await svc.create_supplier(company.id, create_dto, actor=admin)

    # Yeniləmə (Update)
    updated = await svc.update_supplier(
        created.id,
        SupplierUpdate(name="Tekstil Group Yenilənmiş MMC", payment_terms_days=45),
        actor=admin,
    )
    assert updated.name == "Tekstil Group Yenilənmiş MMC"
    assert updated.payment_terms_days == 45


@pytest.mark.asyncio
async def test_supplier_contacts_and_documents():
    """Təchizatçı kontakt və sənədlərinin (müqavilə, sertifikat) idarə olunması."""
    company = await get_company_service().get_company()
    admin = get_supplier_admin()
    svc = SupplierService()

    sup = await svc.create_supplier(
        company.id,
        SupplierCreate(
            code=f"SUP-DOC-{uuid.uuid4().hex[:4].upper()}",
            name="Sənəd Test Təchizatçı",
        ),
        actor=admin,
    )

    # Kontakt əlavə etmə
    contact = await svc.add_contact(
        sup.id,
        SupplierContactCreate(
            name="Əli Məmmədov",
            role="Satış Meneceri",
            email="ali@example.com",
            phone="+994501234567",
            is_primary=True,
        ),
        actor=admin,
    )
    assert contact.id is not None
    assert contact.name == "Əli Məmmədov"
    assert contact.is_primary is True

    # Sənəd əlavə etmə (müddətli müqavilə)
    today = date.today()
    doc = await svc.add_document(
        sup.id,
        SupplierDocumentCreate(
            doc_type="contract",
            doc_number="CONTRACT-2026-01",
            file_url="https://storage.brandhouse.az/contracts/2026-01.pdf",
            valid_from=today,
            valid_to=today + timedelta(days=365),
            metadata_info={"title": "İllik Təchizat Müqaviləsi"},
        ),
        actor=admin,
    )
    assert doc.id is not None
    assert doc.doc_type == "contract"
    assert doc.valid_to == today + timedelta(days=365)


@pytest.mark.asyncio
async def test_supplier_product_catalog_link():
    """Təchizatçı və məhsul variantı əlaqəsi (qiymət, çatdırılma müddəti, MOQ)."""
    company = await get_company_service().get_company()
    admin = get_supplier_admin()
    svc = SupplierService()
    cat_svc = CatalogService()

    # Məhsul və variant yaradılması
    cat = await cat_svc.create_category(
        CategoryCreate(name="Təchizat Test Kat", code=f"c_{uuid.uuid4().hex[:4]}", level=1),
        company_id=company.id,
        actor=admin,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"SP-P-{uuid.uuid4().hex[:4].upper()}",
            name="Təchizatçı Köynək",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=admin,
    )
    await cat_svc.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["M"],
            colors=["Ağ"],
            dry_run=False,
            default_price=Decimal("45.00"),
            default_cost=Decimal("20.00"),
        ),
        actor=admin,
    )
    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(ProductVariant).where(ProductVariant.product_id == prod.id)
        )
        variant = res.scalars().first()
        assert variant is not None
        variant_id = variant.id

    # Təchizatçı yaradılması
    sup = await svc.create_supplier(
        company.id,
        SupplierCreate(code=f"SUP-P-{uuid.uuid4().hex[:4].upper()}", name="Parça Fabriki ASC"),
        actor=admin,
    )

    # Təchizatçı məhsulu bağlama
    sp_prod = await svc.upsert_supplier_product(
        sup.id,
        SupplierProductCreate(
            variant_id=variant_id,
            supplier_sku="FAB-WHT-M",
            last_price=Decimal("18.50"),
            lead_time_days=7,
            min_order_qty=50,
        ),
        actor=admin,
    )
    assert sp_prod.supplier_sku == "FAB-WHT-M"
    assert sp_prod.last_price == Decimal("18.50")
    assert sp_prod.min_order_qty == 50


@pytest.mark.asyncio
async def test_supplier_duplicate_detection_and_merge():
    """Təchizatçı dublikat axtarışı və birləşdirmə (Merge) prosesi."""
    company = await get_company_service().get_company()
    admin = get_supplier_admin()
    svc = SupplierService()

    tax1 = f"99{uuid.uuid4().hex[:8]}"
    sup1 = await svc.create_supplier(
        company.id,
        SupplierCreate(
            code=f"SUP-M1-{uuid.uuid4().hex[:4].upper()}",
            name="Baku Fashion MMC",
            tax_id=tax1,
        ),
        actor=admin,
    )
    sup2 = await svc.create_supplier(
        company.id,
        SupplierCreate(
            code=f"SUP-M2-{uuid.uuid4().hex[:4].upper()}",
            name="Baku Fashion Group",
            tax_id=f"88{uuid.uuid4().hex[:8]}",
        ),
        actor=admin,
    )

    # Dublikat axtarışı (ad oxşarlığı üzrə)
    dup_res = await svc.check_duplicates(
        company.id,
        name="Baku Fashion MMC",
        actor=admin,
    )
    assert dup_res.has_duplicate is True
    assert len(dup_res.candidates) >= 1

    # Birləşdirmə önbaxışı (Merge Preview)
    preview = await svc.merge_preview(sup2.id, sup1.id)
    assert preview.source_supplier_id == sup2.id
    assert preview.target_supplier_id == sup1.id

    # Birləşdirmə icrası (Merge)
    merged_target = await svc.merge_suppliers(
        source_supplier_id=sup2.id,
        target_supplier_id=sup1.id,
        reason="İki fərqli adla qeydiyyata alınmış eyni şirkət",
        actor=admin,
    )
    assert merged_target.id == sup1.id

    # Mənbə təchizatçı arxivləşdirilməlidir
    src_after = await svc.get_supplier(sup2.id, actor=admin)
    assert src_after.status == SupplierStatus.ARCHIVED.value


@pytest.mark.asyncio
async def test_supplier_ledger_statement_and_aging():
    """Təchizatçı dəftəri, borc çıxarışı və yaş qrupları (Aging Buckets)."""
    company = await get_company_service().get_company()
    admin = get_supplier_admin()
    svc = SupplierService()

    sup = await svc.create_supplier(
        company.id,
        SupplierCreate(
            code=f"SUP-LDG-{uuid.uuid4().hex[:4].upper()}",
            name="Qlobal Daşıma və Təchizat",
        ),
        actor=admin,
    )

    # İlkin qalıq 0 olmalıdır
    assert await svc.get_current_balance(sup.id) == Decimal("0.00")

    now = datetime.now(UTC)

    # 1. Qaimə-Faktura (Invoice) -> Kreditor Borcunu artırır (+1000 AZN)
    inv_entry = await svc.record_ledger_entry(
        company_id=company.id,
        supplier_id=sup.id,
        entry_type=SupplierLedgerEntryType.INVOICE.value,
        amount=Decimal("1000.00"),
        direction="credit",
        reference_type="supplier_invoice",
        reference_id=uuid.uuid4(),
        due_date=(now - timedelta(days=45)).date(),  # 31-60 gün intervalında gecikmiş
        actor=admin,
        notes="Faktura #INV-001",
    )
    assert inv_entry.id is not None
    assert await svc.get_current_balance(sup.id) == Decimal("1000.00")

    # 2. İkinci Qaimə -> Kreditor Borcunu artırır (+500 AZN), bu gün üçün
    await svc.record_ledger_entry(
        company_id=company.id,
        supplier_id=sup.id,
        entry_type=SupplierLedgerEntryType.INVOICE.value,
        amount=Decimal("500.00"),
        direction="credit",
        reference_type="supplier_invoice",
        reference_id=uuid.uuid4(),
        due_date=(now + timedelta(days=10)).date(),  # 0-30 gün intervalında
        actor=admin,
        notes="Faktura #INV-002",
    )
    assert await svc.get_current_balance(sup.id) == Decimal("1500.00")

    # 3. Ödəniş (Payment) -> Borcu azaldır (-400 AZN)
    await svc.record_ledger_entry(
        company_id=company.id,
        supplier_id=sup.id,
        entry_type=SupplierLedgerEntryType.PAYMENT.value,
        amount=Decimal("400.00"),
        direction="debit",
        reference_type="supplier_payment",
        reference_id=uuid.uuid4(),
        actor=admin,
        notes="Ödəniş #PMT-001",
    )
    assert await svc.get_current_balance(sup.id) == Decimal("1100.00")

    # Çıxarış və Yaşlanma hesabatı (Statement & Aging)
    stmt = await svc.get_statement(sup.id, actor=admin)
    assert stmt.total_payable == Decimal("1100.00")
    assert len(stmt.entries) == 3
    assert stmt.aging.days_31_60 > Decimal("0.00")


@pytest.mark.asyncio
async def test_supplier_metrics():
    """Təchizatçı performans metrikalarının hesablanmasını yoxlayır."""
    company = await get_company_service().get_company()
    admin = get_supplier_admin()
    svc = SupplierService()

    sup = await svc.create_supplier(
        company.id,
        SupplierCreate(
            code=f"SUP-MTR-{uuid.uuid4().hex[:4].upper()}",
            name="Metrika Test Təchizatçı",
        ),
        actor=admin,
    )

    metrics = await svc.get_metrics(sup.id, actor=admin)
    assert metrics.supplier_id == sup.id
    assert metrics.on_time_delivery_rate == 100.0
    assert metrics.fill_rate == 100.0
    assert metrics.discrepancy_rate == 0.0
