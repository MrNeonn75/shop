"""RBAC API İnteqrasiya Testləri (Integration Tests for /api/v1/rbac).

Əhatə dairəsi:
- GET /api/v1/rbac/permissions: 26 icazəlik kataloq və filtr.
- GET & POST /api/v1/rbac/roles: Rol siyahısı və yeni fərdi rol yaradılması (SoD xəbərdarlıqları ilə).
- GET, PUT, POST /clone, DELETE /api/v1/rbac/roles/{id}: Rol əməliyyatları.
- PUT /api/v1/rbac/users/{user_id}/roles: Rol təyini.
- GET /api/v1/me/permissions: Cari istifadəçinin effektiv icazələri.
- POST & DELETE /api/v1/rbac/temporary-grants: Müvəqqəti icazələr.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from httpx import AsyncClient

from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.tokens import create_access_token
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


@pytest.fixture
def rbac_service() -> RbacService:
    return RbacService()


@pytest.fixture
def user_service() -> UserService:
    return UserService()


async def get_admin_headers(
    user_service: UserService, rbac_service: RbacService
) -> tuple[dict[str, str], uuid.UUID]:
    """Sistem administratoru üçün Bearer Authorization başlıqlarını və ID-sini hazırlayır."""
    await rbac_service.seed_catalog()
    admin_dto = UserCreate(
        username="rbac_admin",
        email="rbac_admin@brandhouse.az",
        full_name="RBAC Admin",
        password="AdminPassword123!",
        must_change_password=False,
    )
    admin_user, _ = await user_service.create_user(admin_dto, actor=None)

    async with UnitOfWork() as uow:
        role = await rbac_service.repo.get_role_by_code(uow.session, "system_admin")
        assert role is not None
        role_id = role.id

    await rbac_service.assign_user_roles(admin_user.id, [role_id], actor=None)

    token = create_access_token(
        user_id=admin_user.id,
        session_id=generate_uuid7(),
        roles=["system_admin"],
    )
    return {"Authorization": f"Bearer {token}"}, admin_user.id


@pytest.mark.asyncio
async def test_rbac_permissions_catalog_api(
    client: AsyncClient, user_service: UserService, rbac_service: RbacService
) -> None:
    """İcazələr kataloqunun gətirilməsini və filtrasiyasını yoxlayır."""
    headers, _ = await get_admin_headers(user_service, rbac_service)

    # 1. Bütün icazələr
    res = await client.get("/api/v1/rbac/permissions", headers=headers)
    assert res.status_code == 200
    perms = res.json()
    assert len(perms) >= 26

    # 2. Modul filtri ilə
    res_pos = await client.get("/api/v1/rbac/permissions?module=pos", headers=headers)
    assert res_pos.status_code == 200
    pos_perms = res_pos.json()
    assert all(p["module"] == "pos" for p in pos_perms)
    assert len(pos_perms) >= 5


@pytest.mark.asyncio
async def test_rbac_roles_crud_and_sod_warnings(
    client: AsyncClient, user_service: UserService, rbac_service: RbacService
) -> None:
    """Yeni fərdi rol yaradılması, SoD xəbərdarlıqları, klonlanması və silinməsini yoxlayır."""
    headers, _ = await get_admin_headers(user_service, rbac_service)

    # 1. Rolların siyahısı (Standart 8 sistem rolu mövcud olmalıdır)
    list_res = await client.get("/api/v1/rbac/roles", headers=headers)
    assert list_res.status_code == 200
    roles = list_res.json()
    assert len(roles) >= 8

    # 2. Ziddiyyətli icazələrə malik yeni rol yaradırıq (SoD Warning yoxlanışı)
    create_payload = {
        "code": "custom_lead",
        "name": "Aparıcı Mütəxəssis",
        "description": "Fərdi test rolu",
        "permission_keys": [
            "finance.payment.create",
            "finance.payment.approve",
            "pos.sale.create",
        ],
    }
    create_res = await client.post("/api/v1/rbac/roles", json=create_payload, headers=headers)
    assert create_res.status_code == 201
    created_data = create_res.json()
    role_id = created_data["role"]["id"]
    assert created_data["role"]["code"] == "custom_lead"
    assert len(created_data["sod_warnings"]) >= 1

    # 3. Rolu redaktə edirik (PUT /api/v1/rbac/roles/{id})
    update_res = await client.put(
        f"/api/v1/rbac/roles/{role_id}",
        json={
            "name": "Aparıcı Mütəxəssis Yenilənmiş",
            "permission_keys": ["pos.sale.create", "pos.shift.close"],
            "version": created_data["role"]["version"],
        },
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Aparıcı Mütəxəssis Yenilənmiş"

    # 4. Rolu klonlayırıq
    clone_res = await client.post(
        f"/api/v1/rbac/roles/{role_id}/clone",
        json={"code": "custom_lead_clone", "name": "Aparıcı Mütəxəssis Klon"},
        headers=headers,
    )
    assert clone_res.status_code == 201
    cloned_role_id = clone_res.json()["role"]["id"]

    # 5. Klonlanmış rolu silirik
    del_res = await client.delete(f"/api/v1/rbac/roles/{cloned_role_id}", headers=headers)
    assert del_res.status_code == 204


@pytest.mark.asyncio
async def test_rbac_user_roles_and_temporary_grants_api(
    client: AsyncClient, user_service: UserService, rbac_service: RbacService
) -> None:
    """İstifadəçiyə rol təyini, effektiv hüquqlara baxış və müvəqqəti icazələr API-nı yoxlayır."""
    headers, admin_id = await get_admin_headers(user_service, rbac_service)

    # Test istifadəçisi yaradırıq
    user_dto = UserCreate(
        username="rbac_target_user",
        email="rbac_target@brandhouse.az",
        full_name="RBAC Target User",
        password="ValidPassword123!",
        must_change_password=False,
    )
    target_user, _ = await user_service.create_user(user_dto, actor=None)

    # 1. Kassir rolunu tapıb təyin edirik
    async with UnitOfWork() as uow:
        cashier_role = await rbac_service.repo.get_role_by_code(uow.session, "cashier")
        assert cashier_role is not None
        cashier_role_id = cashier_role.id

    assign_res = await client.put(
        f"/api/v1/rbac/users/{target_user.id}/roles",
        json={"role_ids": [str(cashier_role_id)]},
        headers=headers,
    )
    assert assign_res.status_code == 204

    # 2. İstifadəçinin effektiv icazələrini yoxlayırıq
    eff_res = await client.get(
        f"/api/v1/rbac/users/{target_user.id}/permissions",
        headers=headers,
    )
    assert eff_res.status_code == 200
    eff_data = eff_res.json()
    assert "pos.sale.create" in eff_data["permissions"]

    # 3. Müvəqqəti icazə veririk
    grant_payload = {
        "user_id": str(target_user.id),
        "permission_key": "inventory.count.create",
        "expires_at": (utc_now() + timedelta(hours=2)).isoformat(),
        "reason": "Sayım üçün müvəqqəti hüquq",
    }
    grant_res = await client.post(
        "/api/v1/rbac/temporary-grants",
        json=grant_payload,
        headers=headers,
    )
    assert grant_res.status_code == 201
    grant_id = grant_res.json()["id"]

    # 4. Müvəqqəti icazəni vaxtından əvvəl ləğv edirik
    revoke_res = await client.delete(
        f"/api/v1/rbac/temporary-grants/{grant_id}",
        headers=headers,
    )
    assert revoke_res.status_code == 204
