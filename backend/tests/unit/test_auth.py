"""Autentifikasiya və Sessiya İdarəetməsi Vahid Testləri (Unit Tests for Auth & Sessions).

Əhatə dairəsi:
1. Login timing attack müdafiəsi (naməlum istifadəçi üçün dummy heş yoxlanışı).
2. Proqressiv bloklanma (lockout) və retry-after hesablaması.
3. Access token (JWT) generasiyası, claims və kid rotasiyası.
4. Refresh token rotasiyası və ailə ləğvi (Token Family Reuse Detection).
5. Birdəfəlik şifrə bərpa tokenləri və vaxt aşımı.
6. 2FA TOTP quraşdırma, təsdiq və söndürmə.
7. Menecer təsdiq tokenlərinin birdəfəlik istifadəsi və hüdud (scope) bağlaması.
"""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pyotp
import pytest
from sqlalchemy import select

from app.core.database import utc_now
from app.core.errors import (
    AccountLockedError,
    InvalidCredentialsError,
    ManagerApprovalError,
    ManagerPinInvalidError,
    TokenExpiredError,
    TokenInvalidError,
    TokenReuseDetectedError,
    TwoFactorInvalidError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.models import PasswordResetToken
from app.modules.auth.schemas import (
    LoginRequest,
    ManagerApproveRequest,
)
from app.modules.auth.service import AuthService
from app.modules.auth.tokens import (
    create_access_token,
    decode_access_token,
)
from app.modules.rbac.service import RbacService
from app.modules.sessions.service import SessionService, hash_token
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


@pytest.fixture
def auth_service() -> AuthService:
    return AuthService()


@pytest.fixture
def user_service() -> UserService:
    return UserService()


@pytest.fixture
def session_service() -> SessionService:
    return SessionService()


@pytest.fixture
def rbac_service() -> RbacService:
    return RbacService()


@pytest.mark.asyncio
async def test_login_timing_attack_invariance(auth_service: AuthService) -> None:
    """Mövcud olmayan istifadəçi üçün dummy hash yoxlanışının icra olunduğunu təsdiqləyir."""
    req = LoginRequest(username="nonexistent_user", password="WrongPassword123!")
    with patch(
        "app.modules.auth.service.verify_password", wraps=lambda _p, _h: False
    ) as mock_verify:
        with pytest.raises(InvalidCredentialsError):
            await auth_service.login(req, ip_address="192.168.1.100")
        assert mock_verify.called


@pytest.mark.asyncio
async def test_login_progressive_lockout(
    auth_service: AuthService, user_service: UserService
) -> None:
    """Ardıcıl uğursuz cəhdlərdən sonra hesabın bloklandığını və retry_after qaytarıldığını yoxlayır."""
    user_dto = UserCreate(
        username="lockout_test_user",
        email="lockout@brandhouse.az",
        full_name="Lockout Test User",
        password="ValidPassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(user_dto, actor=None)

    login_req = LoginRequest(username="lockout_test_user", password="IncorrectPassword123!")

    # 4 uğursuz cəhd
    for _ in range(4):
        with pytest.raises(InvalidCredentialsError):
            await auth_service.login(login_req, ip_address="192.168.1.200")

    # 5-ci uğursuz cəhddə hesab bloklanmalıdır
    with pytest.raises(AccountLockedError) as exc_info:
        await auth_service.login(login_req, ip_address="192.168.1.200")
    assert exc_info.value.retry_after > 0

    # Düzgün şifrə daxil edilsə belə, blok müddətində giriş qadağandır
    valid_req = LoginRequest(username="lockout_test_user", password="ValidPassword123!")
    with pytest.raises(AccountLockedError):
        await auth_service.login(valid_req, ip_address="192.168.1.200")


def test_jwt_access_token_creation_and_claims() -> None:
    """Access token-in bütün tələb olunan sahələri və kid header-i saxladığını təsdiqləyir."""
    user_id = generate_uuid7()
    session_id = generate_uuid7()
    roles = ["cashier", "branch_manager"]

    token = create_access_token(
        user_id=user_id,
        session_id=session_id,
        roles=roles,
        branch_scope_version="v2",
        expires_minutes=15,
    )

    claims = decode_access_token(token)
    assert claims["sub"] == str(user_id)
    assert claims["session_id"] == str(session_id)
    assert sorted(claims["roles"]) == sorted(roles)
    assert claims["branch_scope_version"] == "v2"
    assert "jti" in claims
    assert "exp" in claims
    assert "iat" in claims
    assert "roles_hash" in claims


def test_jwt_access_token_tampered_and_expired() -> None:
    """Saxtalaşdırılmış və ya müddəti bitmiş tokenin etibarsız sayıldığını yoxlayır."""
    user_id = generate_uuid7()
    session_id = generate_uuid7()

    # Müddəti bitmiş token
    expired_token = create_access_token(
        user_id=user_id,
        session_id=session_id,
        roles=["cashier"],
        expires_minutes=-5,
    )
    with pytest.raises(TokenExpiredError):
        decode_access_token(expired_token)

    # Saxtalaşdırılmış token
    valid_token = create_access_token(
        user_id=user_id,
        session_id=session_id,
        roles=["cashier"],
        expires_minutes=15,
    )
    tampered_token = valid_token[:-4] + "fake"
    with pytest.raises(TokenInvalidError):
        decode_access_token(tampered_token)


@pytest.mark.asyncio
async def test_refresh_token_rotation(session_service: SessionService) -> None:
    """Refresh token rotasiyasının köhnə tokeni ləğv etdiyini və yenisini yaratdığını yoxlayır."""
    user_id = generate_uuid7()
    session, raw_refresh = await session_service.create_session(
        user_id=user_id, ip_address="127.0.0.1"
    )

    new_session, new_refresh = await session_service.rotate_refresh_token(
        raw_refresh_token=raw_refresh, ip_address="127.0.0.1"
    )

    assert new_refresh != raw_refresh
    assert new_session.family_id == session.family_id

    # Köhnə sessiya ləğv edilmiş olmalıdır
    async with UnitOfWork() as uow:
        old_sess = await session_service.repo.get_by_id(uow.session, session.id)
        assert old_sess is not None
        assert old_sess.revoked_at is not None


@pytest.mark.asyncio
async def test_refresh_token_family_reuse_detection(session_service: SessionService) -> None:
    """Ləğv edilmiş refresh token təqdim edildikdə bütün ailənin dərhal ləğv olunduğunu (Reuse Detection) təsdiqləyir."""
    user_id = generate_uuid7()
    session1, raw_refresh1 = await session_service.create_session(
        user_id=user_id, ip_address="127.0.0.1"
    )

    session2, raw_refresh2 = await session_service.rotate_refresh_token(
        raw_refresh_token=raw_refresh1, ip_address="127.0.0.1"
    )

    # raw_refresh1 artıq istifadə olunub (revoked). İndi onu yenidən təqdim edirik:
    with pytest.raises(TokenReuseDetectedError):
        await session_service.rotate_refresh_token(
            raw_refresh_token=raw_refresh1, ip_address="192.168.1.55"
        )

    # İndi ailədəki bütün sessiyalar (o cümlədən sonuncu session2) ləğv edilməlidir
    async with UnitOfWork() as uow:
        s2 = await session_service.repo.get_by_id(uow.session, session2.id)
        assert s2 is not None
        assert s2.revoked_at is not None

    # session2-nin tokeni də artıq işləməməlidir
    with pytest.raises(TokenReuseDetectedError):
        await session_service.rotate_refresh_token(
            raw_refresh_token=raw_refresh2, ip_address="127.0.0.1"
        )


@pytest.mark.asyncio
async def test_password_reset_token_single_use(
    auth_service: AuthService, user_service: UserService
) -> None:
    """Şifrə bərpa tokeninin yalnız 1 dəfə işlədiyini və təkrar cəhddə xəta verdiyini yoxlayır."""
    user_dto = UserCreate(
        username="reset_pwd_user",
        email="reset_pwd@brandhouse.az",
        full_name="Reset Pwd User",
        password="InitialPassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(user_dto, actor=None)

    await auth_service.forgot_password("reset_pwd@brandhouse.az")

    # DB-dən yaradılmış tokeni tapırıq
    async with UnitOfWork() as uow:
        stmt = (
            select(PasswordResetToken)
            .where(PasswordResetToken.user_id == user.id)
            .order_by(PasswordResetToken.created_at.desc())
        )
        res = await uow.session.execute(stmt)
        token_obj = res.scalars().first()
        assert token_obj is not None

    # Token heşlənmiş saxlandığı üçün birbaşa test məqsədilə yeni məlum token yaradırıq
    raw_token = "KnownResetTokenValue123456789012"
    t_hash = hash_token(raw_token)
    async with UnitOfWork() as uow:
        await auth_service.auth_repo.create_password_reset_token(
            uow.session, user.id, t_hash, utc_now() + timedelta(hours=1)
        )
        await uow.commit()

    # İlk sıfırlama uğurla tamamlanmalıdır
    await auth_service.reset_password(raw_token, "NewSecretPassword456!")

    # Yeni şifrə ilə daxil olmağı yoxlayırıq
    login_resp, _ = await auth_service.login(
        LoginRequest(username="reset_pwd_user", password="NewSecretPassword456!")
    )
    assert login_resp.status == "success"

    # Eyni tokenlə ikinci cəhd xəta verməlidir
    with pytest.raises(TokenInvalidError):
        await auth_service.reset_password(raw_token, "AnotherPassword789!")


@pytest.mark.asyncio
async def test_totp_2fa_enroll_and_verify(
    auth_service: AuthService, user_service: UserService
) -> None:
    """TOTP 2FA quraşdırma, aktivləşdirmə və ləğv etmə axınını yoxlayır."""
    user_dto = UserCreate(
        username="totp_user",
        email="totp@brandhouse.az",
        full_name="TOTP User",
        password="SecurePassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(user_dto, actor=None)

    # 1. 2FA quraşdırma
    enroll_resp = await auth_service.enroll_2fa(user.id)
    assert enroll_resp.secret is not None
    assert "otpauth://" in enroll_resp.provisioning_uri
    assert len(enroll_resp.recovery_codes) == 8

    # 2. Yanlış kodla aktivləşdirmə cəhdi
    with pytest.raises(TwoFactorInvalidError):
        await auth_service.verify_2fa(user.id, "000000")

    # 3. Düzgün kodla aktivləşdirmə
    totp = pyotp.TOTP(enroll_resp.secret)
    valid_code = totp.now()
    await auth_service.verify_2fa(user.id, valid_code)

    # Statusu yoxlayırıq
    rec = await user_service.get_user_auth_record_by_id(user.id)
    assert rec is not None
    assert rec.totp_enabled is True

    # 4. Söndürmə (Disable 2FA)
    await auth_service.disable_2fa(user.id, "SecurePassword123!")
    rec_after = await user_service.get_user_auth_record_by_id(user.id)
    assert rec_after is not None
    assert rec_after.totp_enabled is False


@pytest.mark.asyncio
async def test_manager_approval_token_single_use_and_scope(
    auth_service: AuthService, user_service: UserService, rbac_service: RbacService
) -> None:
    """Menecer təsdiq tokeninin hüdud (action/resource) bağlılığını və birdəfəlik istifadəsini yoxlayır."""
    await rbac_service.seed_catalog()

    # Menecer hesabı yaradırıq
    mgr_dto = UserCreate(
        username="manager_approver",
        email="manager_approver@brandhouse.az",
        full_name="Manager Approver",
        password="ManagerPassword123!",
        must_change_password=False,
    )
    mgr_user, _ = await user_service.create_user(mgr_dto, actor=None)

    # Menecerə sistem admin rolunu və PIN kodunu təyin edirik
    async with UnitOfWork() as uow:
        admin_role = await rbac_service.repo.get_role_by_code(uow.session, "system_admin")
        assert admin_role is not None
    await rbac_service.assign_user_roles(mgr_user.id, [admin_role.id], actor=None)
    await user_service.set_manager_pin(mgr_user.id, "7788", actor=None)

    branch_id = generate_uuid7()

    # Yanlış PIN ilə cəhd
    bad_req = ManagerApproveRequest(
        manager_username="manager_approver",
        manager_pin="0000",
        action_code="pos.discount.override",
        branch_id=branch_id,
        resource_id="doc-100",
        reason="Test discount override invalid pin",
    )
    with pytest.raises(ManagerPinInvalidError):
        await auth_service.create_manager_approval(bad_req)

    # Düzgün PIN ilə token almaq
    good_req = ManagerApproveRequest(
        manager_username="manager_approver",
        manager_pin="7788",
        action_code="pos.discount.override",
        branch_id=branch_id,
        resource_id="doc-100",
        reason="Test discount override valid pin",
    )
    approve_resp = await auth_service.create_manager_approval(good_req)
    token = approve_resp.approval_token
    assert token is not None

    # Başqa sənəd üçün istifadə cəhdi xəta verməlidir
    with pytest.raises(ManagerApprovalError):
        await auth_service.verify_and_consume_approval(
            token=token,
            expected_action="pos.discount.override",
            expected_resource_id="different-doc",
        )

    # Başqa əməliyyat üçün istifadə cəhdi xəta verməlidir
    with pytest.raises(ManagerApprovalError):
        await auth_service.verify_and_consume_approval(
            token=token,
            expected_action="pos.sale.cancel",
            expected_resource_id="doc-100",
        )

    # Düzgün parametrlərlə ilk istifadə uğurlu olmalıdır
    await auth_service.verify_and_consume_approval(
        token=token,
        expected_action="pos.discount.override",
        expected_resource_id="doc-100",
    )

    # İkinci dəfə istifadə cəhdi xəta verməlidir (Single-use)
    with pytest.raises(ManagerApprovalError):
        await auth_service.verify_and_consume_approval(
            token=token,
            expected_action="pos.discount.override",
            expected_resource_id="doc-100",
        )
