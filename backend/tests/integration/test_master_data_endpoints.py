"""B3 Master Data və Parametrlər API İnteqrasiya Testləri (HTTP Endpoints)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.tokens import create_access_token
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


async def get_test_admin_headers() -> dict[str, str]:
    """Testlər üçün administrator Bearer token başlıqlarını formalaşdırır."""
    rbac_svc = RbacService()
    await rbac_svc.seed_catalog()

    user_svc = UserService()
    admin_dto = UserCreate(
        username=f"admin_{uuid.uuid4().hex[:6]}",
        email=f"admin_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name="Master Data Admin",
        password="AdminPassword123!",
        must_change_password=False,
    )
    admin_user, _ = await user_svc.create_user(admin_dto, actor=None)

    async with UnitOfWork() as uow:
        role = await rbac_svc.repo.get_role_by_code(uow.session, "system_admin")
        assert role is not None
        role_id = role.id

    await rbac_svc.assign_user_roles(admin_user.id, [role_id], actor=None)

    token = create_access_token(
        user_id=admin_user.id,
        session_id=generate_uuid7(),
        roles=["system_admin"],
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_company_endpoints(client: AsyncClient) -> None:
    headers = await get_test_admin_headers()

    # GET /api/v1/company
    res = await client.get("/api/v1/company", headers=headers)
    assert res.status_code == 200
    comp_data = res.json()
    assert comp_data["code"] == "BH_MAIN"
    assert comp_data["default_currency"] == "AZN"

    # PUT /api/v1/company
    update_res = await client.put(
        "/api/v1/company",
        json={"name": "BRAND HOUSE YENİ", "version": comp_data["version"]},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "BRAND HOUSE YENİ"


@pytest.mark.asyncio
async def test_branches_warehouses_registers_endpoints(client: AsyncClient) -> None:
    headers = await get_test_admin_headers()

    # 1. Filial yaratma
    branch_code = f"B_{uuid.uuid4().hex[:4].upper()}"
    create_branch_res = await client.post(
        "/api/v1/branches",
        json={
            "code": branch_code,
            "name": "Nizami Filialı",
            "address": "Nizami küç. 50",
            "phone": "+994125990000",
        },
        headers=headers,
    )
    assert create_branch_res.status_code == 201
    branch = create_branch_res.json()
    branch_id = branch["id"]

    # 2. Filiallar siyahısı
    list_res = await client.get("/api/v1/branches", headers=headers)
    assert list_res.status_code == 200
    assert any(b["id"] == branch_id for b in list_res.json())

    # 3. Anbar yaratma
    wh_code = f"WH_{uuid.uuid4().hex[:4].upper()}"
    create_wh_res = await client.post(
        "/api/v1/warehouses",
        json={
            "code": wh_code,
            "name": "Nizami Əsas Anbar",
            "branch_id": branch_id,
            "warehouse_type": "branch",
            "is_default_for_sales": True,
        },
        headers=headers,
    )
    assert create_wh_res.status_code == 201
    wh = create_wh_res.json()
    wh_id = wh["id"]

    # 4. Anbara zona əlavə etmə
    zone_res = await client.post(
        f"/api/v1/warehouses/{wh_id}/zones",
        json={"code": "Z-01", "name": "Qadın Geyimi"},
        headers=headers,
    )
    assert zone_res.status_code == 201
    assert zone_res.json()["code"] == "Z-01"

    # 5. Kassa aparatı yaratma
    reg_code = f"POS_{uuid.uuid4().hex[:4].upper()}"
    create_reg_res = await client.post(
        "/api/v1/cash-registers",
        json={
            "branch_id": branch_id,
            "default_warehouse_id": wh_id,
            "code": reg_code,
            "name": "Kassa 1",
        },
        headers=headers,
    )
    assert create_reg_res.status_code == 201
    reg = create_reg_res.json()
    assert reg["code"] == reg_code

    # 6. Filial xülasəsi (Summary)
    summary_res = await client.get(f"/api/v1/branches/{branch_id}/summary", headers=headers)
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["warehouses_count"] >= 1
    assert summary["registers_count"] >= 1


@pytest.mark.asyncio
async def test_settings_and_system_status_endpoints(client: AsyncClient) -> None:
    headers = await get_test_admin_headers()

    # 1. Qruplar siyahısı
    groups_res = await client.get("/api/v1/settings/groups", headers=headers)
    assert groups_res.status_code == 200
    assert len(groups_res.json()) >= 10

    # 2. Parametr dəyərini oxuma
    key = "inventory_rules"
    val_res = await client.get(f"/api/v1/settings/{key}", headers=headers)
    assert val_res.status_code == 200
    assert val_res.json()["value"]["negative_stock_policy"] == "FORBIDDEN"

    # 3. Parametr dəyərini yeniləmə
    update_res = await client.put(
        f"/api/v1/settings/{key}",
        json={
            "value": {"negative_stock_policy": "WARNING"},
            "reason": "Mənfi stok siyasətinin dəyişdirilməsi təsdiqi",
            "version": 1,
        },
        headers=headers,
    )
    assert update_res.status_code == 200

    # 4. Parametr fərq önizlənməsi (Preview)
    preview_res = await client.post(
        "/api/v1/settings/preview",
        json={"key": key, "new_value": {"negative_stock_policy": "ALLOWED"}},
        headers=headers,
    )
    assert preview_res.status_code == 200
    assert preview_res.json()["is_changed"] is True

    # 5. Səbəb kodları CRUD
    r_code = f"DEF_{uuid.uuid4().hex[:4].upper()}"
    rc_res = await client.post(
        "/api/v1/settings/reason-codes",
        json={
            "category": "returns",
            "code": r_code,
            "name_az": "Defektli məhsul",
        },
        headers=headers,
    )
    assert rc_res.status_code == 201
    rc_id = rc_res.json()["id"]

    list_rc_res = await client.get("/api/v1/settings/reason-codes/list", headers=headers)
    assert list_rc_res.status_code == 200
    assert any(c["id"] == rc_id for c in list_rc_res.json())

    # 6. Sistem sağlamlıq və backup status
    health_res = await client.get("/api/v1/settings/system/health", headers=headers)
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "operational"

    backup_res = await client.get("/api/v1/settings/system/backup-status", headers=headers)
    assert backup_res.status_code == 200


@pytest.mark.asyncio
async def test_numbering_endpoints(client: AsyncClient) -> None:
    headers = await get_test_admin_headers()

    # 1. Ardıcıllıqlar siyahısı
    seq_res = await client.get("/api/v1/numbering/sequences", headers=headers)
    assert seq_res.status_code == 200
    assert isinstance(seq_res.json(), list)

    # 2. Şablon önizlənməsi
    preview_res = await client.post(
        "/api/v1/numbering/preview",
        json={
            "pattern": "{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}",
            "prefix": "RCP",
            "branch_code": "28MAY",
            "sequence_number": 5,
        },
        headers=headers,
    )
    assert preview_res.status_code == 200
    assert preview_res.json()["preview_number"].startswith("RCP-28MAY-")

    # 3. Növbəti nömrə alma
    next_res = await client.post(
        "/api/v1/numbering/next",
        json={"document_type": "receipt"},
        headers=headers,
    )
    assert next_res.status_code == 200
    assert len(next_res.json()["number"]) > 5


@pytest.mark.asyncio
async def test_integrations_endpoints(client: AsyncClient) -> None:
    headers = await get_test_admin_headers()

    # 1. Bütün inteqrasiyaların siyahısı
    int_res = await client.get("/api/v1/integrations", headers=headers)
    assert int_res.status_code == 200
    items = int_res.json()
    assert len(items) >= 8

    # 2. B1 status formatı uyğunluğu
    status_res = await client.get("/api/v1/integrations/status", headers=headers)
    assert status_res.status_code == 200
    assert "payment_gateway" in status_res.json()

    # 3. Konfiqurasiya edilməmiş xidmət testi (NOT_CONFIGURED qayıtmalıdır)
    test_res = await client.post("/api/v1/integrations/email/test-connection", headers=headers)
    assert test_res.status_code == 200
    assert test_res.json()["status"] == "NOT_CONFIGURED"
    assert test_res.json()["success"] is False
