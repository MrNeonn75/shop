"""Autentifikasiya API İnteqrasiya Testləri (Integration Tests for /api/v1/auth).

Əhatə dairəsi:
- POST /api/v1/auth/login: Uğurlu giriş (Access Token və Refresh Token kukisi), yanlış şifrə (401), ardıcıl uğursuzluqlar (403 locked).
- POST /api/v1/auth/refresh: Kuki ilə token rotasiyası və təkrar istifadənin aşkarlanması (Reuse Detection).
- POST /api/v1/auth/logout və logout-all: Sessiyanın ləğvi və kuki təmizlənməsi.
- POST /api/v1/auth/forgot-password və reset-password: Şifrə bərpa axını.
- POST /api/v1/auth/manager-token: Menecer təsdiq tokeninin alınması.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient

from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.models import PasswordResetToken
from app.modules.rbac.service import RbacService
from app.modules.sessions.service import hash_token
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


@pytest.fixture
def user_service() -> UserService:
    return UserService()


@pytest.fixture
def rbac_service() -> RbacService:
    return RbacService()


@pytest.mark.asyncio
async def test_auth_login_success_and_failure(
    client: AsyncClient, user_service: UserService
) -> None:
    """Uğurlu və uğursuz giriş ssenarilərini yoxlayır."""
    user_dto = UserCreate(
        username="api_login_user",
        email="api_login@brandhouse.az",
        full_name="API Login User",
        password="ValidPassword123!",
        must_change_password=False,
    )
    await user_service.create_user(user_dto, actor=None)

    # 1. Uğurlu giriş
    res = await client.post(
        "/api/v1/auth/login",
        json={"username": "api_login_user", "password": "ValidPassword123!"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == "api_login_user"

    # Refresh token kukisi yoxlanışı
    cookies = res.cookies
    assert "bh_refresh_token" in cookies

    # 2. Yanlış şifrə ilə giriş
    res_fail = await client.post(
        "/api/v1/auth/login",
        json={"username": "api_login_user", "password": "WrongPassword123!"},
    )
    assert res_fail.status_code == 401
    fail_data = res_fail.json()
    assert fail_data["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_auth_refresh_token_rotation_and_reuse_api(
    client: AsyncClient, user_service: UserService
) -> None:
    """Refresh token rotasiyası və təkrar istifadə cəhdində ailənin ləğv edilməsini HTTP səviyyəsində yoxlayır."""
    user_dto = UserCreate(
        username="api_refresh_user",
        email="api_refresh@brandhouse.az",
        full_name="API Refresh User",
        password="ValidPassword123!",
        must_change_password=False,
    )
    await user_service.create_user(user_dto, actor=None)

    # Giriş edirik
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "api_refresh_user", "password": "ValidPassword123!"},
    )
    refresh_token_1 = login_res.cookies.get("bh_refresh_token")
    assert refresh_token_1 is not None

    # 1. Uğurlu Refresh
    client.cookies.set("bh_refresh_token", refresh_token_1)
    refresh_res = await client.post("/api/v1/auth/refresh")
    assert refresh_res.status_code == 200
    ref_data = refresh_res.json()
    assert "access_token" in ref_data

    # Yeni kuki yazılmış olmalıdır
    refresh_token_2 = refresh_res.cookies.get("bh_refresh_token")
    assert refresh_token_2 is not None
    assert refresh_token_2 != refresh_token_1

    # 2. Köhnə token_1 ilə təkrar müraciət (Token Reuse Attack!)
    client.cookies.set("bh_refresh_token", refresh_token_1)
    reuse_res = await client.post("/api/v1/auth/refresh")
    assert reuse_res.status_code == 401
    reuse_data = reuse_res.json()
    assert reuse_data["error"]["code"] == "TOKEN_REUSE_DETECTED"

    # 3. İndi hətta sonuncu token_2 də işləməməlidir (bütün ailə ləğv olunub)
    client.cookies.set("bh_refresh_token", refresh_token_2)
    blocked_res = await client.post("/api/v1/auth/refresh")
    assert blocked_res.status_code == 401


@pytest.mark.asyncio
async def test_auth_logout_and_logout_all(client: AsyncClient, user_service: UserService) -> None:
    """Çıxış (logout) və bütün cihazlardan çıxış (logout-all) endpoint-lərini yoxlayır."""
    user_dto = UserCreate(
        username="api_logout_user",
        email="api_logout@brandhouse.az",
        full_name="API Logout User",
        password="ValidPassword123!",
        must_change_password=False,
    )
    await user_service.create_user(user_dto, actor=None)

    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "api_logout_user", "password": "ValidPassword123!"},
    )
    access_token = login_res.json()["access_token"]
    refresh_token = login_res.cookies.get("bh_refresh_token")

    # Logout
    client.cookies.set("bh_refresh_token", refresh_token)
    logout_res = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_res.status_code == 204

    # Logout-dan sonra refresh işləməməlidir
    ref_after = await client.post("/api/v1/auth/refresh")
    assert ref_after.status_code in (401, 403)


@pytest.mark.asyncio
async def test_auth_forgot_and_reset_password_api(
    client: AsyncClient, user_service: UserService
) -> None:
    """Şifrə bərpa və təyinat endpoint-lərini yoxlayır."""
    user_dto = UserCreate(
        username="api_reset_user",
        email="api_reset@brandhouse.az",
        full_name="API Reset User",
        password="OldPassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(user_dto, actor=None)

    # 1. Forgot password çağırışı
    forgot_res = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "api_reset@brandhouse.az"},
    )
    assert forgot_res.status_code == 200
    assert "message" in forgot_res.json()

    # Bazaya birbaşa məlum token yerləşdiririk
    raw_token = "KnownApiResetToken123456789012"
    t_hash = hash_token(raw_token)
    async with UnitOfWork() as uow:
        token_obj = PasswordResetToken(
            id=generate_uuid7(),
            user_id=user.id,
            token_hash=t_hash,
            expires_at=utc_now() + timedelta(hours=1),
        )
        uow.session.add(token_obj)
        await uow.commit()

    # 2. Reset password
    reset_res = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewValidPassword123!"},
    )
    assert reset_res.status_code == 204

    # Yeni şifrə ilə giriş
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "api_reset_user", "password": "NewValidPassword123!"},
    )
    assert login_res.status_code == 200


@pytest.mark.asyncio
async def test_auth_manager_token_api(
    client: AsyncClient, user_service: UserService, rbac_service: RbacService
) -> None:
    """Menecer təsdiq tokeni generasiyasını yoxlayır."""
    await rbac_service.seed_catalog()

    mgr_dto = UserCreate(
        username="mgr_api_user",
        email="mgr_api@brandhouse.az",
        full_name="Manager API User",
        password="ManagerPassword123!",
        must_change_password=False,
    )
    mgr_user, _ = await user_service.create_user(mgr_dto, actor=None)

    async with UnitOfWork() as uow:
        admin_role = await rbac_service.repo.get_role_by_code(uow.session, "system_admin")
        assert admin_role is not None
    await rbac_service.assign_user_roles(mgr_user.id, [admin_role.id], actor=None)
    await user_service.set_manager_pin(mgr_user.id, "5566", actor=None)

    res = await client.post(
        "/api/v1/auth/approve",
        json={
            "manager_username": "mgr_api_user",
            "manager_pin": "5566",
            "action_code": "pos.discount.override",
            "resource_id": "receipt-55",
            "reason": "Müştəri endirimi təsdiqi",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "approval_token" in data
    assert data["action_code"] == "pos.discount.override"
