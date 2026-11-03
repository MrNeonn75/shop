"""Catalog Module Unit Tests (Validation, Matrix Generator, Pricing, Categories, Import/Export, Labels)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.core.errors import BusinessRuleViolationError
from app.core.ids import generate_uuid7
from app.modules.auth.policies import AuthenticatedUser
from app.modules.catalog.ports import (
    calculate_ean13_checksum,
    generate_ean13,
    normalize_az_text,
    validate_ean13,
)
from app.modules.catalog.schemas import (
    CategoryCreate,
    CategoryMergeRequest,
    CategoryUpdate,
    CostChangeRequest,
    LabelItem,
    LabelRenderRequest,
    PriceChangeRequest,
    ProductCreate,
    ProductDiscontinueRequest,
    VariantMatrixGenerateRequest,
)
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service


def get_test_actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="admin@brandhouse.az",
        full_name="Administrator",
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


def test_az_text_normalization() -> None:
    """Azərbaycan hərflərinin axtarış üçün düzgün normallaşdırılması yoxlanılır."""
    raw = "Kişi Qış Köynəyi və İpək Şalvar (Ölçü: XL, Çeşid: Ağ/Yaşıl, Qiymət: 45.50₼)"
    normalized = normalize_az_text(raw)
    assert "kisi" in normalized
    assert "qis" in normalized
    assert "koyneyi" in normalized
    assert "ipek" in normalized
    assert "salvar" in normalized
    assert "olcu" in normalized
    assert "cesid" in normalized
    assert "ag" in normalized
    assert "yasil" in normalized


def test_ean13_checksum_and_validation() -> None:
    """EAN-13 barkod kontrol rəqəmi hesablanması və validasiyası."""
    chk = calculate_ean13_checksum("200000000001")
    assert chk == "5"
    assert validate_ean13("2000000000015") is True
    assert validate_ean13("2000000000018") is False
    assert validate_ean13("123") is False

    # Generator test
    generated = generate_ean13(prefix="200", sequence_num=1)
    assert len(generated) == 13
    assert generated.startswith("200000000001")
    assert validate_ean13(generated) is True


@pytest.mark.asyncio
async def test_category_tree_and_cycle_prevention() -> None:
    """Kateqoriya ağacı strukturu və dövri asılılığın qarşısının alınması (Cycle Prevention)."""
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_test_actor()

    # 1. Kök kateqoriya
    root = await service.create_category(
        CategoryCreate(name="Qadın", code=f"women_{uuid.uuid4().hex[:6]}", parent_id=None, level=1),
        company_id=comp.id,
        actor=actor,
    )
    assert root.level == 1
    assert root.path == f"/{root.id}"

    # 2. Alt kateqoriya 1
    child1 = await service.create_category(
        CategoryCreate(
            name="Geyim", code=f"clothing_{uuid.uuid4().hex[:6]}", parent_id=root.id, level=2
        ),
        company_id=comp.id,
        actor=actor,
    )
    assert child1.level == 2
    assert child1.path == f"{root.path}/{child1.id}"

    # 3. Alt kateqoriya 2
    child2 = await service.create_category(
        CategoryCreate(
            name="Köynək", code=f"shirt_{uuid.uuid4().hex[:6]}", parent_id=child1.id, level=3
        ),
        company_id=comp.id,
        actor=actor,
    )
    assert child2.level == 3
    assert child2.path == f"{child1.path}/{child2.id}"

    # 4. Dövri asılılıq sınağı: Valideyni öz alt budağına köçürmək cəhdi bloklanmalıdır
    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.update_category(root.id, CategoryUpdate(parent_id=child2.id), actor=actor)
    assert "dövrə" in str(exc.value).lower()

    # 5. Özünü özünə valideyn təyin etmək bloklanmalıdır
    with pytest.raises(BusinessRuleViolationError):
        await service.update_category(root.id, CategoryUpdate(parent_id=root.id), actor=actor)


@pytest.mark.asyncio
async def test_category_merge_and_redirect() -> None:
    """Kateqoriyaların birləşdirilməsi və yönləndirilməsi (Merge & Redirect)."""
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_test_actor()

    cat1 = await service.create_category(
        CategoryCreate(name="Köhnə Köynək", code=f"old_shirt_{uuid.uuid4().hex[:6]}", level=3),
        company_id=comp.id,
        actor=actor,
    )
    cat2 = await service.create_category(
        CategoryCreate(name="Yeni Köynək", code=f"new_shirt_{uuid.uuid4().hex[:6]}", level=3),
        company_id=comp.id,
        actor=actor,
    )

    # Merge cat1 into cat2
    res = await service.merge_categories(
        cat1.id,
        CategoryMergeRequest(target_category_id=cat2.id, reason="Taksonomiya təmizlənməsi"),
        actor=actor,
    )
    assert res.is_active is False
    assert res.redirect_category_id == cat2.id

    # cat1 deaktiv edilməli və redirect_category_id cat2 olmalıdır
    merged = await service.get_category(cat1.id, actor=actor)
    assert merged.is_active is False
    assert merged.redirect_category_id == cat2.id


@pytest.mark.asyncio
async def test_variant_matrix_generator_dry_run_and_commit() -> None:
    """Ölçü × Rəng matrisi generatoru (Dry-run və Təsdiq)."""
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_test_actor()

    # Valideyn məhsul yaradırıq
    cat = await service.create_category(
        CategoryCreate(name="Matris Kateqoriya", code=f"mat_cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    prod = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Klassik Polo Köynək",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
            description="Premium pambıq köynək",
        ),
        company_id=comp.id,
        actor=actor,
    )

    matrix_dto_dry = VariantMatrixGenerateRequest(
        sizes=["S", "M", "L"],
        colors=["Qara", "Ağ"],
        dry_run=True,
        default_price=Decimal("49.90"),
        default_cost=Decimal("22.50"),
    )

    # Dry-run
    preview = await service.generate_variant_matrix(prod.id, matrix_dto_dry, actor=actor)
    assert preview.total_combinations == 6
    assert preview.to_create == 6
    assert preview.conflicts == 0
    assert len(preview.items) == 6
    assert preview.items[0].barcode is not None
    assert len(preview.items[0].barcode) == 13

    # Commit
    matrix_dto_commit = VariantMatrixGenerateRequest(
        sizes=["S", "M", "L"],
        colors=["Qara", "Ağ"],
        dry_run=False,
        default_price=Decimal("49.90"),
        default_cost=Decimal("22.50"),
    )
    committed = await service.generate_variant_matrix(prod.id, matrix_dto_commit, actor=actor)
    assert committed.to_create == 6

    # Eyni kombinasiyaları təkrar yaratmaq cəhdi konflikt göstərməlidir
    re_preview = await service.generate_variant_matrix(prod.id, matrix_dto_dry, actor=actor)
    assert re_preview.conflicts == 6
    assert re_preview.to_create == 0


@pytest.mark.asyncio
async def test_product_price_and_cost_immutability() -> None:
    """Qiymət və maya dəyərinin dəyişməz (APPEND-ONLY) tarixçəsi və price_at testi."""
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_test_actor()

    cat = await service.create_category(
        CategoryCreate(name="Qiymət Test Kat", code=f"pr_cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    prod = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Qiymət Test Məhsulu",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=comp.id,
        actor=actor,
    )

    matrix = await service.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["M"],
            colors=["Göy"],
            dry_run=False,
            default_price=Decimal("100.00"),
            default_cost=Decimal("50.00"),
        ),
        actor=actor,
    )
    assert matrix.to_create == 1
    # Variantı əldə edirik
    refreshed_prod = await service.get_product(prod.id, actor=actor)
    variant_id = refreshed_prod.variants[0].id
    sku = refreshed_prod.variants[0].sku

    # 1. İlkin qiymət POS lookup
    pos1 = await service.lookup_by_code(sku, actor=actor)
    assert pos1.effective_price == Decimal("100.00")

    # 2. Yeni qiymət təyin edirik
    await service.update_variant_price(
        variant_id,
        PriceChangeRequest(
            price=Decimal("120.00"),
            reason="Mövsüm qiymət artımı",
        ),
        actor=actor,
    )

    pos2 = await service.lookup_by_code(sku, actor=actor)
    assert pos2.effective_price == Decimal("120.00")

    # 3. Qiymət tarixçəsi siyahısı (2 qeyd olmalıdır: köhnə və yeni)
    hist = await service.list_price_history(variant_id, actor=actor)
    assert len(hist) == 2
    # Ən sonuncu birinci sıralanmalıdır
    assert hist[0].value == Decimal("120.00")
    assert hist[0].effective_to is None
    assert hist[1].value == Decimal("100.00")
    assert hist[1].effective_to is not None

    # 4. Maya dəyəri yenilənməsi
    await service.update_variant_cost(
        variant_id,
        CostChangeRequest(
            cost=Decimal("55.00"),
            reason="Yeni partiya maya dəyəri",
        ),
        actor=actor,
    )
    cost_hist = await service.list_cost_history(variant_id, actor=actor)
    assert len(cost_hist) == 2
    assert cost_hist[0].value == Decimal("55.00")


@pytest.mark.asyncio
async def test_product_discontinue_and_reactivate() -> None:
    """Məhsulun dövriyyədən çıxarılması (is_sell_through) və yenidən aktiv edilməsi."""
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_test_actor()

    cat = await service.create_category(
        CategoryCreate(name="Status Test Kat", code=f"st_cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    prod = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Status Test Məhsulu",
            section="Qadın",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=comp.id,
        actor=actor,
    )

    # 1. Discontinue with sell-through
    disc = await service.discontinue_product(
        prod.id, ProductDiscontinueRequest(is_sell_through=True), actor=actor
    )
    assert disc.status == "discontinued"
    assert disc.is_sell_through is True

    # 2. Reactivate
    react = await service.reactivate_product(prod.id, actor=actor)
    assert react.status == "active"
    assert react.is_sell_through is False


@pytest.mark.asyncio
async def test_barcode_label_pdf_rendering() -> None:
    """ReportLab ilə barkod etiketlərinin PDF formatında generasiyası."""
    service = CatalogService()
    comp = await get_company_service().get_company()
    actor = get_test_actor()

    cat = await service.create_category(
        CategoryCreate(name="Etiket Test Kat", code=f"lbl_cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=comp.id,
        actor=actor,
    )
    prod = await service.create_product(
        ProductCreate(
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Etiket Test Məhsulu",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=comp.id,
        actor=actor,
    )
    await service.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["L"], colors=["Qara"], dry_run=False, default_price=Decimal("45.00")
        ),
        actor=actor,
    )
    refreshed = await service.get_product(prod.id, actor=actor)
    variant_id = refreshed.variants[0].id

    req = LabelRenderRequest(
        items=[LabelItem(variant_id=variant_id, quantity=2)],
        template_code="58x40",
    )

    pdf_bytes = await service.render_labels_pdf(req, actor=actor)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0
    # PDF faylının başlığı %PDF olmalıdır
    assert pdf_bytes.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_seed_catalog_foundations_idempotency() -> None:
    """scripts/seed.py daxilindəki seed_catalog_foundations funksiyasının idempotentliyini yoxlayır."""
    from scripts.seed import seed_catalog_foundations

    # İlk icra
    await seed_catalog_foundations()

    # İkinci icra (təkrar icra heç bir konflikt yaratmamalıdır)
    await seed_catalog_foundations()
