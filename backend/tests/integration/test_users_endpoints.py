"""İstifadəçilər API İnteqrasiya Testləri (Integration Tests for /api/v1/users).

Əhatə dairəsi:
- POST /api/v1/users: Yeni istifadəçi yaradılması və birdəfəlik şifrə.
- GET /api/v1/users: İstifadəçilərin səhifələmə və axtarışla gətirilməsi.
- GET /api/v1/users/{id}: İstifadəçi profilinə baxış (heşlər qayıtmır).
- PUT /api/v1/users/{id}: Optimistic locking ilə redaktə.
- PATCH /api/v1/users/{id}/status: Statusun dəyişdirilməsi.
- PUT /api/v1/users/{id}/branches: Filial icazələrinin təyini.
- PUT /api/v1/users/{id}/manager-pin və pos-pin: PIN kodların təyini.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.modules.auth.tokens import create_access_token
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


@pytest.fixture
def user_service() -> UserService:
    return UserService()


@pytest.fixture
def rbac_service() -> RbacService:
    return RbacService()


async def get_admin_headers(user_service: UserService, rbac_service: RbacService) -> dict[str, str]:
    """Sistem administratoru üçün Bearer Authorization başlıqlarını hazırlayır."""
    await rbac_service.seed_catalog()
    admin_dto = UserCreate(
        username="integration_admin",
        email="integration_admin@brandhouse.az",
        full_name="Integration Admin",
        password="AdminPassword123!",
        must_change_password=False,
    )
    admin_user, _ = await user_service.create_user(admin_dto, actor=None)

    # UnitOfWork ilə rolu götürürük
    from app.core.uow import UnitOfWork

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
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_user_create_and_read(
    client: AsyncClient, user_service: UserService, rbac_service: RbacService
) -> None:
    """İstifadəçi yaradılması və məlumatların oxunmasını yoxlayır."""
    headers = await get_admin_headers(user_service, rbac_service)

    # 1. POST /api/v1/users
    create_payload = {
        "username": "new_employee",
        "email": "employee@brandhouse.az",
        "full_name": "Rəşad Əliyev",
        "preferred_language": "az",
        "must_change_password": True,
    }
    create_res = await client.post("/api/v1/users", json=create_payload, headers=headers)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert "user" in created_data
    assert "initial_password" in created_data
    user_id = created_data["user"]["id"]
    assert created_data["user"]["username"] == "new_employee"
    assert "password_hash" not in str(created_data)

    # 2. GET /api/v1/users/{id}
    get_res = await client.get(f"/api/v1/users/{user_id}", headers=headers)
    assert get_res.status_code == 200
    user_data = get_res.json()
    assert user_data["id"] == user_id
    assert user_data["full_name"] == "Rəşad Əliyev"
    assert "password_hash" not in user_data

    # 3. GET /api/v1/users (Siyahılama və Axtarış)
    list_res = await client.get("/api/v1/users?q=Rəşad", headers=headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    assert any(u["id"] == user_id for u in list_data["items"])


@pytest.mark.asyncio
async def test_user_update_with_optimistic_locking(
    client: AsyncClient, user_service: UserService, rbac_service: RbacService
) -> None:
    """İstifadəçi redaktəsi və versiya konfliktinin (Optimistic Locking) qarşısının alınmasını yoxlayır."""
    headers = await get_admin_headers(user_service, rbac_service)

    user_dto = UserCreate(
        username="update_target_user",
        email="target@brandhouse.az",
        full_name="Target User",
        password="ValidPassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(user_dto, actor=None)

    # 1. Düzgün versiya ilə yeniləmə
    update_res = await client.put(
        f"/api/v1/users/{user.id}",
        json={"full_name": "Target User Updated", "version": user.version},
        headers=headers,
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["full_name"] == "Target User Updated"
    assert updated_data["version"] == user.version + 1

    # 2. Köhnə versiya ilə yeniləmə cəhdi (Konflikt 409)
    conflict_res = await client.put(
        f"/api/v1/users/{user.id}",
        json={"full_name": "Target Conflict", "version": user.version},
        headers=headers,
    )
    assert conflict_res.status_code == 409
    assert conflict_res.json()["error"]["code"] == "VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_user_status_branches_and_pins(
    client: AsyncClient, user_service: UserService, rbac_service: RbacService
) -> None:
    """Status dəyişimi, filial təyinatı və PIN quraşdırmalarını yoxlayır."""
    headers = await get_admin_headers(user_service, rbac_service)

    user_dto = UserCreate(
        username="pins_target_user",
        email="pins_target@brandhouse.az",
        full_name="Pins Target User",
        password="ValidPassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(user_dto, actor=None)

    # 1. Status dəyişimi (PATCH /api/v1/users/{id}/status)
    status_res = await client.patch(
        f"/api/v1/users/{user.id}/status",
        json={"status": "suspended", "reason": "İntizam tənbehi", "version": user.version},
        headers=headers,
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "suspended"

    # Statusu yenidən aktiv edirik
    active_res = await client.patch(
        f"/api/v1/users/{user.id}/status",
        json={"status": "active", "reason": "İşə bərpa", "version": status_res.json()["version"]},
        headers=headers,
    )
    assert active_res.status_code == 200
    assert active_res.json()["status"] == "active"

    # 2. Filial təyinatı (PUT /api/v1/users/{id}/branches)
    b1 = str(generate_uuid7())
    b2 = str(generate_uuid7())
    branch_res = await client.put(
        f"/api/v1/users/{user.id}/branches",
        json={"branch_ids": [b1, b2]},
        headers=headers,
    )
    assert branch_res.status_code == 200
    assert len(branch_res.json()) == 2

    # 3. Menecer PIN təyini
    mgr_pin_res = await client.put(
        f"/api/v1/users/{user.id}/manager-pin",
        json={"pin": "4321"},
        headers=headers,
    )
    assert mgr_pin_res.status_code == 204

    # 4. POS PIN təyini
    pos_pin_res = await client.put(
        f"/api/v1/users/{user.id}/pos-pin",
        json={"pin": "8888"},
        headers=headers,
    )
    assert pos_pin_res.status_code == 204
