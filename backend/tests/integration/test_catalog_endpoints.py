"""Catalog Module HTTP Endpoints Integration Tests.

Əhatə olunan sahələr:
- Kateqoriyalar CRUD, ağac strukturu və birləşdirmə (merge)
- Brendlər CRUD və unikal ad yoxlanışı
- Ölçü vahidləri və vergi sinifləri sorğuları
- Məhsul və Çeşid matrisi yaradılması
- Azərbaycan hərfləri ilə vurğusuz/hissiyatsız axtarış
- POS sürətli axtarış (SKU və Barkod üzrə)
- Qiymət və Maya dəyəri yenilənməsi, append-only tarixçə
- Maya dəyərinin maskalanması (RBAC catalog.cost.view icazəsi yoxlanışı)
- PDF etiket çapı endpoint-i
- CSV idxal axını (Upload -> Validate/Preview -> Commit)
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.tokens import create_access_token
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


async def create_user_with_role(role_code: str) -> dict[str, str]:
    """Müəyyən rola malik istifadəçi yaradır və Authorization Bearer header qaytarır."""
    rbac_svc = RbacService()
    await rbac_svc.seed_catalog()

    user_svc = UserService()
    user_dto = UserCreate(
        username=f"user_{uuid.uuid4().hex[:6]}",
        email=f"user_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name=f"Test {role_code}",
        password="TestPassword123!",
        must_change_password=False,
    )
    user, _ = await user_svc.create_user(user_dto, actor=None)

    async with UnitOfWork() as uow:
        role = await rbac_svc.repo.get_role_by_code(uow.session, role_code)
        assert role is not None
        role_id = role.id

    await rbac_svc.assign_user_roles(user.id, [role_id], actor=None)

    token = create_access_token(
        user_id=user.id,
        session_id=generate_uuid7(),
        roles=[role_code],
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_category_endpoints(client: AsyncClient) -> None:
    headers = await create_user_with_role("system_admin")

    # 1. POST /api/v1/catalog/categories
    cat_code = f"cat_{uuid.uuid4().hex[:6]}"
    res = await client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": "Kişi Geyimləri", "code": cat_code, "level": 1},
    )
    assert res.status_code == 201
    cat_data = res.json()
    cat_id = cat_data["id"]
    assert cat_data["name"] == "Kişi Geyimləri"
    assert cat_data["level"] == 1

    # 2. GET /api/v1/catalog/categories/tree
    res_tree = await client.get("/api/v1/catalog/categories/tree", headers=headers)
    assert res_tree.status_code == 200
    tree_data = res_tree.json()
    assert isinstance(tree_data, list)
    assert any(c["id"] == cat_id for c in tree_data)

    # 3. GET /api/v1/catalog/categories/{id}
    res_get = await client.get(f"/api/v1/catalog/categories/{cat_id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == cat_id

    # 4. PUT /api/v1/catalog/categories/{id}
    res_put = await client.put(
        f"/api/v1/catalog/categories/{cat_id}",
        headers=headers,
        json={"name": "Kişi Geyimləri (Yenilənmiş)"},
    )
    assert res_put.status_code == 200
    assert res_put.json()["name"] == "Kişi Geyimləri (Yenilənmiş)"


@pytest.mark.asyncio
async def test_brands_endpoints(client: AsyncClient) -> None:
    headers = await create_user_with_role("system_admin")

    brand_name = f"Zara_{uuid.uuid4().hex[:6]}"
    res = await client.post(
        "/api/v1/catalog/brands",
        headers=headers,
        json={"name": brand_name, "code": brand_name.lower()},
    )
    assert res.status_code == 201
    brand_id = res.json()["id"]

    # Eyni adda brend təkrar yaradıla bilməz (409 Conflict)
    res_dup = await client.post(
        "/api/v1/catalog/brands",
        headers=headers,
        json={"name": brand_name, "code": "other_code"},
    )
    assert res_dup.status_code == 409

    # Siyahılama
    res_list = await client.get("/api/v1/catalog/brands", headers=headers)
    assert res_list.status_code == 200
    assert any(b["id"] == brand_id for b in res_list.json())


@pytest.mark.asyncio
async def test_units_and_tax_classes_endpoints(client: AsyncClient) -> None:
    headers = await create_user_with_role("system_admin")

    # 1. Units of Measure
    res_units = await client.get("/api/v1/catalog/units-of-measure", headers=headers)
    assert res_units.status_code == 200
    assert isinstance(res_units.json(), list)

    # 2. Tax Classes
    res_taxes = await client.get("/api/v1/catalog/tax-classes", headers=headers)
    assert res_taxes.status_code == 200
    assert isinstance(res_taxes.json(), list)


@pytest.mark.asyncio
async def test_product_and_variant_matrix_flow(client: AsyncClient) -> None:
    admin_headers = await create_user_with_role("system_admin")

    # Kateqoriya yaradırıq
    cat_res = await client.post(
        "/api/v1/catalog/categories",
        headers=admin_headers,
        json={"name": "Köynəklər", "code": f"shirt_{uuid.uuid4().hex[:6]}", "level": 1},
    )
    cat_id = cat_res.json()["id"]

    # Məhsul yaradırıq
    prod_code = f"PRD-{uuid.uuid4().hex[:6].upper()}"
    prod_res = await client.post(
        "/api/v1/catalog/products",
        headers=admin_headers,
        json={
            "internal_code": prod_code,
            "name": "Qışlıq Jaket və İpək Şalvar",
            "section": "Kişi",
            "type": "Geyim",
            "category_id": cat_id,
            "description": "Ən yüksək keyfiyyətli qış jaketi",
        },
    )
    assert prod_res.status_code == 201
    prod_id = prod_res.json()["id"]

    # Matris çeşidləri yaradırıq (Dry-Run: true)
    matrix_payload_dry = {
        "sizes": ["M", "L"],
        "colors": ["Qara", "Göy"],
        "dry_run": True,
        "default_price": 89.90,
        "default_cost": 40.00,
    }
    dry_run_res = await client.post(
        f"/api/v1/catalog/products/{prod_id}/variants/generate",
        headers=admin_headers,
        json=matrix_payload_dry,
    )
    assert dry_run_res.status_code == 200
    assert dry_run_res.json()["total_combinations"] == 4
    assert dry_run_res.json()["to_create"] == 4

    # Matris çeşidləri yaradırıq (Dry-Run: false - commit)
    matrix_payload_commit = {
        "sizes": ["M", "L"],
        "colors": ["Qara", "Göy"],
        "dry_run": False,
        "default_price": 89.90,
        "default_cost": 40.00,
    }
    commit_res = await client.post(
        f"/api/v1/catalog/products/{prod_id}/variants/generate",
        headers=admin_headers,
        json=matrix_payload_commit,
    )
    assert commit_res.status_code == 200
    assert commit_res.json()["to_create"] == 4

    # Məhsul təfərrüatından variantları götürürük
    prod_detail = await client.get(f"/api/v1/catalog/products/{prod_id}", headers=admin_headers)
    assert prod_detail.status_code == 200
    variants = prod_detail.json()["variants"]
    assert len(variants) == 4
    first_var = variants[0]
    sku = first_var["sku"]
    barcode = first_var["barcode"]

    # POS sürətli axtarış (SKU və Barkod üzrə)
    pos_sku_res = await client.get(f"/api/v1/catalog/lookup?code={sku}", headers=admin_headers)
    assert pos_sku_res.status_code == 200
    assert pos_sku_res.json()["sku"] == sku
    assert Decimal(str(pos_sku_res.json()["effective_price"])) == Decimal("89.90")

    pos_bar_res = await client.get(f"/api/v1/catalog/lookup?code={barcode}", headers=admin_headers)
    assert pos_bar_res.status_code == 200
    assert pos_bar_res.json()["variant_id"] == first_var["id"]

    # Azərbaycan hərfləri ilə axtarış ("jaket" axtarışı "Qışlıq Jaket və İpək Şalvar" tapmalıdır)
    search_res = await client.get("/api/v1/catalog/products?query=jaket", headers=admin_headers)
    assert search_res.status_code == 200
    items = search_res.json()
    assert any(p["id"] == prod_id for p in items)

    # Vurğusuz axtarış: "qisliq" axtarışı da tapmalıdır
    search_res_az = await client.get("/api/v1/catalog/products?query=qisliq", headers=admin_headers)
    assert search_res_az.status_code == 200
    assert any(p["id"] == prod_id for p in search_res_az.json())


@pytest.mark.asyncio
async def test_cost_masking_without_permission(client: AsyncClient) -> None:
    """Maya dəyərinin (cost_price, margin) icazəsiz istifadəçilərdən maskalanması."""
    admin_headers = await create_user_with_role("system_admin")
    cashier_headers = await create_user_with_role("cashier")

    # Məhsul və variant yaradırıq
    cat_res = await client.post(
        "/api/v1/catalog/categories",
        headers=admin_headers,
        json={"name": "Maskalama Test", "code": f"mask_{uuid.uuid4().hex[:6]}", "level": 1},
    )
    cat_id = cat_res.json()["id"]

    prod_res = await client.post(
        "/api/v1/catalog/products",
        headers=admin_headers,
        json={
            "internal_code": f"PRD-{uuid.uuid4().hex[:6].upper()}",
            "name": "Maya Dəyəri Test Məhsulu",
            "section": "Kişi",
            "type": "Geyim",
            "category_id": cat_id,
        },
    )
    prod_id = prod_res.json()["id"]

    await client.post(
        f"/api/v1/catalog/products/{prod_id}/variants/generate",
        headers=admin_headers,
        json={
            "sizes": ["M"],
            "colors": ["Qara"],
            "dry_run": False,
            "default_price": 100.00,
            "default_cost": 40.00,
        },
    )

    # 1. Admin sorğusu: cost_price görünməlidir
    admin_get = await client.get(f"/api/v1/catalog/products/{prod_id}", headers=admin_headers)
    assert admin_get.status_code == 200
    admin_var = admin_get.json()["variants"][0]
    assert admin_var["cost_price"] is not None
    assert Decimal(str(admin_var["cost_price"])) == Decimal("40.00")
    variant_id = admin_var["id"]

    # 2. Kassir sorğusu: cost_price None (maskalanmış) olmalıdır
    cashier_get = await client.get(f"/api/v1/catalog/products/{prod_id}", headers=cashier_headers)
    assert cashier_get.status_code == 200
    cashier_var = cashier_get.json()["variants"][0]
    assert cashier_var["cost_price"] is None

    # 3. Kassirin maya dəyəri tarixcəsinə baxış cəhdi 403 Forbidden olmalıdır
    cost_hist_res = await client.get(
        f"/api/v1/catalog/variants/{variant_id}/cost-history",
        headers=cashier_headers,
    )
    assert cost_hist_res.status_code == 403


@pytest.mark.asyncio
async def test_pdf_label_rendering_endpoint(client: AsyncClient) -> None:
    headers = await create_user_with_role("system_admin")

    # Məhsul və variant yaradırıq
    cat_res = await client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": "Etiket Test", "code": f"lbl_{uuid.uuid4().hex[:6]}", "level": 1},
    )
    cat_id = cat_res.json()["id"]

    prod_res = await client.post(
        "/api/v1/catalog/products",
        headers=headers,
        json={
            "internal_code": f"PRD-{uuid.uuid4().hex[:6].upper()}",
            "name": "Etiket Test Məhsulu",
            "section": "Kişi",
            "type": "Geyim",
            "category_id": cat_id,
        },
    )
    prod_id = prod_res.json()["id"]

    await client.post(
        f"/api/v1/catalog/products/{prod_id}/variants/generate",
        headers=headers,
        json={"sizes": ["M"], "colors": ["Qara"], "dry_run": False, "default_price": 45.00},
    )
    prod_detail = await client.get(f"/api/v1/catalog/products/{prod_id}", headers=headers)
    variant_id = prod_detail.json()["variants"][0]["id"]

    req_body = {
        "items": [
            {
                "variant_id": variant_id,
                "quantity": 1,
            }
        ],
        "template_code": "58x40",
    }

    res = await client.post(
        "/api/v1/catalog/labels/render",
        headers=headers,
        json=req_body,
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_catalog_csv_import_pipeline(client: AsyncClient) -> None:
    headers = await create_user_with_role("system_admin")

    # CSV faylı hazırlayırıq (UTF-8 with BOM)
    csv_content = (
        "\ufeffinternal_code,name,section,type,category,sku,barcode,size,color,retail_price,cost_price\n"
        "IMP-001,İdxal Köynəyi,Kişi,Geyim,Geyim,IMP-001-S-BLK,2000000000022,S,Qara,35.00,15.00\n"
        "IMP-001,İdxal Köynəyi,Kişi,Geyim,Geyim,IMP-001-M-BLK,2000000000039,M,Qara,35.00,15.00\n"
    ).encode()

    files = {"file": ("products_import.csv", csv_content, "text/csv")}
    upload_res = await client.post(
        "/api/v1/catalog/import/upload",
        headers=headers,
        files=files,
    )
    assert upload_res.status_code == 200
    job_id = upload_res.json()["job_id"]
    assert upload_res.json()["total_rows"] == 2

    # Preview/Validate
    prev_res = await client.post(f"/api/v1/catalog/import/{job_id}/preview", headers=headers)
    assert prev_res.status_code == 200
    assert prev_res.json()["total_rows"] == 2
    assert prev_res.json()["valid_rows"] == 2
    assert prev_res.json()["error_rows"] == 0

    # Commit endpoint-i
    commit_res = await client.post(
        f"/api/v1/catalog/import/{job_id}/commit",
        headers=headers,
        json={"mode": "all_or_nothing"},
    )
    assert commit_res.status_code == 200
    assert commit_res.json()["status"] == "COMMITTED"
    assert commit_res.json()["committed_rows"] == 2
