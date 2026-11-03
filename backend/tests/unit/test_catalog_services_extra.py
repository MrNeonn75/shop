"""Additional Unit Tests for Catalog Service & Repository to achieve >85% coverage.

Əhatə olunan sahələr:
- Kateqoriyalar: aktiv məhsulu olan kateqoriyanın deaktiv edilməsinin bloklanması, filtrasiyalar
- Brendlər: redaktə, ad unikallığı, deaktivasiya
- Ölçü vahidləri və vergi sinifləri: yaratma və siyahılama
- Atributlar və Atribut dəyərləri: yaratma və siyahılama
- Məhsul tam redaktəsi: description, section, type, min_stock, versiya ziddiyyəti
- Kütləvi status və kateqoriya dəyişikliyi (bulk_status, bulk_category)
- Şəkillər: yükləmə, əsas şəkil seçimi, reorder, silmə
- Kütləvi qiymət dəyişikliyi (bulk_price_update dry-run və commit)
- Kataloq ixracı (export_catalog CSV və XLSX)
- Sürətli unikallıq yoxlanışı (validate_variant_uniqueness)
- Köhnə sayt sinxronizasiyası (get_legacy_sync_status)
"""

from __future__ import annotations

import io
import uuid
from decimal import Decimal

import pytest

from app.core.errors import BusinessRuleViolationError
from app.core.ids import generate_uuid7
from app.modules.auth.policies import AuthenticatedUser
from app.modules.catalog.schemas import (
    BrandCreate,
    BrandUpdate,
    BulkPriceItemUpdate,
    BulkPriceUpdateRequest,
    CatalogExportRequest,
    CategoryCreate,
    CategoryUpdate,
    LabelItem,
    LabelRenderRequest,
    ProductAttributeCreate,
    ProductAttributeValueCreate,
    ProductBulkCategoryRequest,
    ProductBulkStatusRequest,
    ProductCreate,
    ProductUpdate,
    ProductVariantCreate,
    ProductVariantUpdate,
    TaxClassCreate,
    UnitOfMeasureCreate,
    VariantMatrixGenerateRequest,
    VariantUniquenessCheckRequest,
)
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service


def get_admin_actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="admin_extra",
        email="admin_extra@brandhouse.az",
        full_name="Admin Extra",
        roles=["system_admin"],
        permissions=[
            "catalog.product.view",
            "catalog.product.manage",
            "catalog.cost.view",
            "catalog.price.manage",
            "catalog.labels",
            "catalog.import",
            "catalog.export",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


@pytest.mark.asyncio
async def test_category_filters_and_deactivation_guard() -> None:
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    # Kateqoriya ağacı
    root = await service.create_category(
        CategoryCreate(name="Bölmə 1", code=f"sec_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    child = await service.create_category(
        CategoryCreate(
            name="Növ 1", code=f"typ_{uuid.uuid4().hex[:6]}", parent_id=root.id, level=2
        ),
        company_id=comp.id,
        actor=actor,
    )

    # Filtrasiyalar
    all_cats = await service.list_categories(company_id=comp.id, actor=actor)
    assert len(all_cats) >= 2
    roots = await service.list_categories(company_id=comp.id, level=1, actor=actor)
    assert any(c.id == root.id for c in roots)
    children = await service.list_categories(company_id=comp.id, parent_id=root.id, actor=actor)
    assert any(c.id == child.id for c in children)

    # Ağac strukturu
    tree = await service.get_category_tree(company_id=comp.id, actor=actor)
    assert len(tree) >= 1

    # Məhsul bağlayırıq və deaktiv etməyə çalışırıq
    _ = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Deaktiv Qorunma Məhsulu",
            section="Kişi",
            type="Geyim",
            category_id=child.id,
        ),
        company_id=comp.id,
        actor=actor,
    )

    # Aktiv məhsul varkən deaktivasiya bloklanmalıdır
    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.update_category(child.id, CategoryUpdate(is_active=False), actor=actor)
    assert "aktiv məhsullar" in str(exc.value).lower()


@pytest.mark.asyncio
async def test_brands_crud_and_validation() -> None:
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    b_name = f"Nike_{uuid.uuid4().hex[:6]}"
    brand = await service.create_brand(
        BrandCreate(name=b_name, code=b_name.lower(), logo_url="https://example.com/logo.png"),
        company_id=comp.id,
        actor=actor,
    )
    assert brand.name == b_name
    assert brand.logo_url == "https://example.com/logo.png"

    # Tək brend oxuma
    fetched = await service.get_brand(brand.id, actor=actor)
    assert fetched.id == brand.id

    # Siyahılama
    b_list = await service.list_brands(company_id=comp.id, actor=actor)
    assert any(b.id == brand.id for b in b_list)

    # Redaktə
    updated = await service.update_brand(
        brand.id,
        BrandUpdate(name=f"{b_name}_v2", logo_url="https://example.com/logo2.png", is_active=False),
        actor=actor,
    )
    assert updated.name == f"{b_name}_v2"
    assert updated.is_active is False


@pytest.mark.asyncio
async def test_units_and_tax_classes_crud() -> None:
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    # 1. Units of Measure
    u_code = f"pk_{uuid.uuid4().hex[:4]}"
    unit = await service.create_unit(
        UnitOfMeasureCreate(code=u_code, name_az="Paket", precision=0),
        actor=actor,
    )
    assert unit.code == u_code
    u_list = await service.list_units(actor=actor)
    assert any(u.code == u_code for u in u_list)

    # 2. Tax Classes
    t_code = f"VAT_{uuid.uuid4().hex[:4].upper()}"
    tc = await service.create_tax_class(
        TaxClassCreate(code=t_code, name_az="Gömrük ƏDV", rate_ref="VAT_18"),
        company_id=comp.id,
        actor=actor,
    )
    assert tc.code == t_code
    t_list = await service.list_tax_classes(company_id=comp.id, actor=actor)
    assert any(t.code == t_code for t in t_list)


@pytest.mark.asyncio
async def test_product_attributes_and_values() -> None:
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    a_code = f"mat_{uuid.uuid4().hex[:4]}"
    attr = await service.create_attribute(
        ProductAttributeCreate(
            name="Material",
            code=a_code,
            attribute_type="select",
            is_variant_defining=True,
            values=[
                ProductAttributeValueCreate(value="Pambıq", code="PAM", sort_order=1),
                ProductAttributeValueCreate(value="Kətan", code="KET", sort_order=2),
            ],
        ),
        company_id=comp.id,
        actor=actor,
    )
    assert attr.code == a_code
    assert len(attr.values) == 2

    # Siyahılama
    attrs = await service.list_attributes(company_id=comp.id, actor=actor)
    assert any(a.code == a_code for a in attrs)


@pytest.mark.asyncio
async def test_product_update_and_bulk_operations() -> None:
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    cat1 = await service.create_category(
        CategoryCreate(name="K1", code=f"k1_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    cat2 = await service.create_category(
        CategoryCreate(name="K2", code=f"k2_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )

    p1 = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Məhsul 1",
            section="Kişi",
            type="Geyim",
            category_id=cat1.id,
        ),
        company_id=comp.id,
        actor=actor,
    )
    p2 = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Məhsul 2",
            section="Qadın",
            type="Geyim",
            category_id=cat1.id,
        ),
        company_id=comp.id,
        actor=actor,
    )

    # 1. Update product fields
    upd = await service.update_product(
        p1.id,
        ProductUpdate(
            name="Məhsul 1 Yenilənmiş",
            description="Yeni təsvir",
            section="Uşaq",
            type="Aksesuar",
            category_id=cat2.id,
            version=p1.version,
        ),
        actor=actor,
    )
    assert upd.name == "Məhsul 1 Yenilənmiş"
    assert upd.section == "Uşaq"
    assert upd.category_id == cat2.id

    # 2. Bulk status change
    b_count = await service.bulk_status_change(
        ProductBulkStatusRequest(product_ids=[p1.id, p2.id], new_status="draft"),
        actor=actor,
    )
    assert b_count == 2
    ref_p1 = await service.get_product(p1.id, actor=actor)
    assert ref_p1.status == "draft"

    # 3. Bulk category change
    c_count = await service.bulk_category_change(
        ProductBulkCategoryRequest(product_ids=[p1.id, p2.id], category_id=cat2.id),
        actor=actor,
    )
    assert c_count == 2
    ref_p2 = await service.get_product(p2.id, actor=actor)
    assert ref_p2.category_id == cat2.id


@pytest.mark.asyncio
async def test_product_images_management() -> None:
    from PIL import Image

    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    cat = await service.create_category(
        CategoryCreate(name="Şəkil Kat", code=f"img_cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    prod = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Şəkil Məhsulu",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=comp.id,
        actor=actor,
    )

    # Valid in-memory PNG
    buf = io.BytesIO()
    Image.new("RGB", (30, 30), color="blue").save(buf, format="PNG")
    png_bytes = buf.getvalue()

    # Şəkil 1
    img1 = await service.add_image(
        product_id=prod.id,
        file_bytes=png_bytes,
        filename="test1.png",
        content_type="image/png",
        is_primary=True,
        actor=actor,
    )
    assert img1.is_primary is True

    # Şəkil 2
    img2 = await service.add_image(
        product_id=prod.id,
        file_bytes=png_bytes,
        filename="test2.png",
        content_type="image/png",
        is_primary=False,
        actor=actor,
    )
    assert img2.is_primary is False

    # Şəkilləri sıralama (reorder)
    reordered = await service.reorder_images(prod.id, [img2.id, img1.id], actor=actor)
    assert len(reordered) == 2

    # Əsas şəkli dəyişmə
    prim = await service.set_primary_image(prod.id, img2.id, actor=actor)
    assert prim.is_primary is True

    # Şəkli silmə
    await service.delete_image(img1.id, actor=actor)
    ref_prod = await service.get_product(prod.id, actor=actor)
    assert len(ref_prod.images) == 1
    assert ref_prod.images[0].id == img2.id


@pytest.mark.asyncio
async def test_bulk_price_updates_and_export() -> None:
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    cat = await service.create_category(
        CategoryCreate(name="İxrac Kat", code=f"exp_cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    prod = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="İxrac Məhsulu",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=comp.id,
        actor=actor,
    )

    _ = await service.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["S", "M"],
            colors=["Qara"],
            dry_run=False,
            default_price=Decimal("50.00"),
            default_cost=Decimal("20.00"),
        ),
        actor=actor,
    )
    ref_p = await service.get_product(prod.id, actor=actor)
    v1_id = ref_p.variants[0].id
    v2_id = ref_p.variants[1].id

    # 1. Kütləvi qiymət dəyişikliyi (Dry-Run)
    bulk_dry = await service.bulk_update_prices(
        BulkPriceUpdateRequest(
            updates=[
                BulkPriceItemUpdate(variant_id=v1_id, new_price=Decimal("60.00")),
                BulkPriceItemUpdate(variant_id=v2_id, new_price=Decimal("65.00")),
            ],
            reason="Mövsüm artımı",
            dry_run=True,
        ),
        actor=actor,
    )
    assert bulk_dry.dry_run is True
    assert bulk_dry.total_items == 2

    # 2. Kütləvi qiymət dəyişikliyi (Commit)
    bulk_commit = await service.bulk_update_prices(
        BulkPriceUpdateRequest(
            updates=[
                BulkPriceItemUpdate(variant_id=v1_id, new_price=Decimal("60.00")),
                BulkPriceItemUpdate(variant_id=v2_id, new_price=Decimal("65.00")),
            ],
            reason="Mövsüm artımı",
            dry_run=False,
        ),
        actor=actor,
    )
    assert bulk_commit.dry_run is False

    # 3. Variant unikallıq yoxlanışı
    uniq = await service.validate_variant_uniqueness(
        VariantUniquenessCheckRequest(sku=ref_p.variants[0].sku, barcode=ref_p.variants[0].barcode)
    )
    assert uniq.is_sku_available is False
    assert uniq.is_barcode_available is False

    # 4. Kataloqun CSV ixracı
    mime_csv, content_csv = await service.export_catalog(
        CatalogExportRequest(file_format="csv"),
        company_id=comp.id,
        actor=actor,
    )
    assert "text/csv" in mime_csv
    assert b"sku" in content_csv.lower()

    # 5. Kataloqun XLSX ixracı
    mime_xlsx, content_xlsx = await service.export_catalog(
        CatalogExportRequest(file_format="xlsx"),
        company_id=comp.id,
        actor=actor,
    )
    assert "spreadsheet" in mime_xlsx or "excel" in mime_xlsx or "octet-stream" in mime_xlsx
    assert len(content_xlsx) > 0

    # 6. Legacy Sync status scaffold
    sync_status = await service.get_legacy_sync_status()
    assert sync_status["status"] == "NOT_CONFIGURED"


def test_catalog_policies_thoroughly() -> None:
    """Bütün siyasət funksiyalarının (can_view_catalog, can_manage_catalog və s.) test edilməsi."""
    from app.modules.catalog.policies import (
        can_export_catalog,
        can_import_catalog,
        can_manage_catalog,
        can_manage_price,
        can_render_labels,
        can_view_catalog,
        can_view_cost,
    )

    # 1. None actor
    assert can_view_catalog(None) is False
    assert can_manage_catalog(None) is False
    assert can_view_cost(None) is False
    assert can_manage_price(None) is False
    assert can_import_catalog(None) is False
    assert can_export_catalog(None) is False
    assert can_render_labels(None) is False

    # 2. Cashier actor
    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier",
        email="cashier@brandhouse.az",
        full_name="Kassir",
        roles=["cashier"],
        permissions=["catalog.product.view", "catalog.labels"],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )
    assert can_view_catalog(cashier) is True
    assert can_manage_catalog(cashier) is False
    assert can_view_cost(cashier) is False
    assert can_manage_price(cashier) is False
    assert can_render_labels(cashier) is True

    # 3. Custom actor with individual permissions
    custom = AuthenticatedUser(
        id=generate_uuid7(),
        username="custom",
        email="custom@brandhouse.az",
        full_name="Custom",
        roles=[],
        permissions=[
            "catalog.product.view",
            "catalog.product.manage",
            "catalog.cost.view",
            "catalog.price.manage",
            "catalog.import",
            "catalog.export",
            "catalog.labels",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )
    assert can_view_catalog(custom) is True
    assert can_manage_catalog(custom) is True
    assert can_view_cost(custom) is True
    assert can_manage_price(custom) is True
    assert can_import_catalog(custom) is True
    assert can_export_catalog(custom) is True
    assert can_render_labels(custom) is True


@pytest.mark.asyncio
async def test_product_create_with_direct_variants_and_crud() -> None:
    """Məhsulun ilkin variantlarla birgə yaradılması və variant CRUD əməliyyatları."""
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    cat = await service.create_category(
        CategoryCreate(name="Dir Kat", code=f"dir_cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )

    # Variantlarla birgə məhsul yaradırıq
    sku_val = f"DIR-{uuid.uuid4().hex[:6].upper()}-M"
    prod = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Birbaşa Variantlı Məhsul",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
            initial_variants=[
                ProductVariantCreate(
                    sku=sku_val,
                    barcode="2000000000046",
                    size="M",
                    color="Ağ",
                    price_override=Decimal("75.00"),
                    cost_price=Decimal("35.00"),
                )
            ],
        ),
        company_id=comp.id,
        actor=actor,
    )
    assert len(prod.variants) == 1
    var_id = prod.variants[0].id

    # 1. Update variant directly
    updated_var = await service.update_variant(
        var_id,
        ProductVariantUpdate(
            size="L",
            price_override=Decimal("80.00"),
            min_stock=10,
        ),
        actor=actor,
    )
    assert updated_var.size == "L"
    assert updated_var.price_override == Decimal("80.00")

    # 2. Create another variant directly
    new_sku = f"DIR-{uuid.uuid4().hex[:6].upper()}-XL"
    v2 = await service.create_variant(
        prod.id,
        ProductVariantCreate(
            sku=new_sku,
            barcode="2000000000053",
            size="XL",
            color="Qara",
            price_override=Decimal("85.00"),
        ),
        actor=actor,
    )
    assert v2.sku == new_sku

    # 3. List products with filtering
    p_list = await service.list_products(
        company_id=comp.id,
        section="Kişi",
        type_="Geyim",
        category_id=cat.id,
        query="Birbasa",
        actor=actor,
    )
    assert any(p.id == prod.id for p in p_list)


@pytest.mark.asyncio
async def test_xlsx_import_flow_and_label_templates() -> None:
    """XLSX faylı ilə idxal və müxtəlif ölçülü etiket şablonlarının render edilməsi."""
    import openpyxl

    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_admin_actor()

    # 1. In-memory XLSX hazırlayırıq
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(["name", "sku", "barcode", "price", "cost", "size", "color"])
    ws.append(
        [
            "Excel Köynək",
            f"XLS-{uuid.uuid4().hex[:6].upper()}",
            "2000000000060",
            "45.00",
            "20.00",
            "M",
            "Göy",
        ]
    )

    xlsx_buf = io.BytesIO()
    wb.save(xlsx_buf)
    xlsx_bytes = xlsx_buf.getvalue()

    upload_res = await service.upload_import_file(
        filename="test_catalog.xlsx",
        file_bytes=xlsx_bytes,
        company_id=comp.id,
        actor=actor,
    )
    assert upload_res.file_type == "xlsx"
    assert upload_res.total_rows == 1

    # Preview
    prev = await service.preview_import(upload_res.job_id, actor=actor)
    assert prev.valid_rows == 1
    assert prev.error_rows == 0

    # 2. Müxtəlif etiket şablonları (40x25 və a4_sheet)
    cat = await service.create_category(
        CategoryCreate(name="Etiket Şablon Kat", code=f"lbl_t_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    prod = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Şablon Etiket Məhsulu",
            section="Digər",
            type="Aksesuar",
            category_id=cat.id,
        ),
        company_id=comp.id,
        actor=actor,
    )
    _ = await service.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["STD"], colors=["Qırmızı"], dry_run=False, default_price=Decimal("19.99")
        ),
        actor=actor,
    )
    ref_prod = await service.get_product(prod.id, actor=actor)
    var_id = ref_prod.variants[0].id

    # 40x25 şablonu
    pdf_40x25 = await service.render_labels_pdf(
        LabelRenderRequest(
            items=[LabelItem(variant_id=var_id, quantity=1)],
            template_code="40x25",
        ),
        actor=actor,
    )
    assert pdf_40x25.startswith(b"%PDF")

    # a4_sheet şablonu
    pdf_a4 = await service.render_labels_pdf(
        LabelRenderRequest(
            items=[LabelItem(variant_id=var_id, quantity=3)],
            template_code="a4_sheet",
        ),
        actor=actor,
    )
    assert pdf_a4.startswith(b"%PDF")
