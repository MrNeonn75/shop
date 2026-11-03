"""Autentifikasiya Modulu Xidmət Qatı (Auth Service).

Giriş, çıxış, şifrə bərpası, 2FA, POS login və menecer təsdiqləri.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

import pyotp

from app.core.config import settings
from app.core.database import ensure_utc, utc_now
from app.core.errors import (
    AccountLockedError,
    AccountSuspendedError,
    ForbiddenError,
    InvalidCredentialsError,
    ManagerApprovalError,
    ManagerPinInvalidError,
    NotFoundError,
    TokenExpiredError,
    TokenInvalidError,
    TwoFactorInvalidError,
)
from app.core.ids import generate_uuid7
from app.core.security import (
    verify_password,
    verify_pin,
)
from app.core.uow import UnitOfWork
from app.modules.auth.models import ManagerApprovalToken
from app.modules.auth.repository import AuthRepository
from app.modules.auth.schemas import (
    LoginRequest,
    LoginResponse,
    ManagerApproveRequest,
    ManagerApproveResponse,
    TwoFactorEnrollResponse,
)
from app.modules.auth.tokens import (
    create_access_token,
    create_temporary_token,
    decode_temporary_token,
)
from app.modules.rbac.service import RbacService, get_rbac_service
from app.modules.sessions.service import SessionService, get_session_service, hash_token
from app.modules.users.schemas import UserAuthRecord, UserResponse
from app.modules.users.service import UserService, get_user_service
from app.shared.audit import record_audit_event

# Timing-attack müdafiəsi üçün boş heş
_DUMMY_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHRmb3J0aW1pbmc$s+G3u4n+4h/o7i3XgQyZcW1bF5m7H5/i1Z4Z"
)


class AuthService:
    """Mərkəzi autentifikasiya xidməti."""

    def __init__(
        self,
        auth_repo: AuthRepository | None = None,
        user_service: UserService | None = None,
        session_service: SessionService | None = None,
        rbac_service: RbacService | None = None,
    ) -> None:
        self.auth_repo = auth_repo or AuthRepository()
        self.user_service = user_service or get_user_service()
        self.session_service = session_service or get_session_service()
        self.rbac_service = rbac_service or get_rbac_service()

    async def login(
        self,
        data: LoginRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[LoginResponse, str | None]:
        """İstifadəçi adı/şifrə ilə giriş (Progressive lockout və 2FA dəstəyi ilə)."""
        user = await self.user_service.get_user_auth_record(data.username)

        if not user:
            # Timing attack-ın qarşısını almaq üçün heş yoxlamasını simulyasiya edirik
            verify_password(data.password, _DUMMY_HASH)
            async with UnitOfWork() as uow:
                await record_audit_event(
                    session=uow.session,
                    action="LOGIN_FAILED",
                    resource_type="users",
                    resource_id="unknown",
                    actor_ip=ip_address,
                    diff={"reason": "USER_NOT_FOUND", "identifier": data.username},
                )
                await uow.commit()
            raise InvalidCredentialsError()

        now = utc_now()

        # 1. Hesab bloklanması yoxlanışı
        if user.status == "locked":
            if user.locked_until and ensure_utc(user.locked_until) > now:
                remaining = int((ensure_utc(user.locked_until) - now).total_seconds())
                raise AccountLockedError(retry_after=max(1, remaining))
            else:
                await self.user_service.unlock_user_if_expired(user.id)

        if user.status == "suspended":
            raise AccountSuspendedError()

        # 2. Şifrənin yoxlanışı
        if not verify_password(data.password, user.password_hash):
            attempts, is_locked, retry_after = await self.user_service.record_login_failure(
                user.id, ip_address=ip_address
            )
            if is_locked:
                raise AccountLockedError(retry_after=retry_after)
            raise InvalidCredentialsError()

        # Uğurlu autentifikasiya
        await self.user_service.record_login_success(user.id)

        # 3. 2FA Tələbi Yoxlanışı
        eff = await self.rbac_service.get_effective_permissions(user.id)
        role_codes = eff.roles
        needs_2fa = user.totp_enabled or any(
            r in settings.SECURITY_2FA_REQUIRED_ROLES for r in role_codes
        )

        user_resp = self._user_to_response(user, role_codes, eff.allowed_branches)

        if needs_2fa and settings.SECURITY_2FA_ENABLED and user.totp_enabled:
            temp_token = create_temporary_token(user.id, purpose="2fa_login", expires_minutes=5)
            return (
                LoginResponse(
                    access_token="",
                    token_type="bearer",
                    expires_in=0,
                    user=user_resp,
                    status="2fa_required",
                    temp_token=temp_token,
                ),
                None,
            )

        # 4. İlkin girişdə şifrə dəyişməsi tələbi
        if user.must_change_password:
            temp_token = create_temporary_token(
                user.id, purpose="force_password_change", expires_minutes=15
            )
            return (
                LoginResponse(
                    access_token="",
                    token_type="bearer",
                    expires_in=0,
                    user=user_resp,
                    status="must_change_password",
                    temp_token=temp_token,
                ),
                None,
            )

        # 5. Tam sessiyanın açılması və JWT generasiyası
        session_obj, raw_refresh = await self.session_service.create_session(
            user_id=user.id,
            device_info=None,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        access_token = create_access_token(
            user_id=user.id,
            session_id=session_obj.id,
            roles=role_codes,
            branch_scope_version=eff.permission_set_version,
        )

        async with UnitOfWork() as uow:
            await record_audit_event(
                session=uow.session,
                action="LOGIN_SUCCESS",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=user.id,
                actor_ip=ip_address,
                diff={"session_id": str(session_obj.id)},
            )
            await uow.commit()

        resp = LoginResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_resp,
            status="success",
        )
        return resp, raw_refresh

    async def complete_2fa_login(
        self,
        temp_token: str,
        code: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[LoginResponse, str]:
        """2FA kodu ilə girişi tamamlayır."""
        user_id = decode_temporary_token(temp_token, expected_purpose="2fa_login")

        user = await self.user_service.get_user_auth_record_by_id(user_id)
        if not user or not user.totp_secret:
            raise InvalidCredentialsError()

        totp = pyotp.TOTP(user.totp_secret)
        is_valid = totp.verify(code.strip(), valid_window=1)
        if not is_valid:
            raise TwoFactorInvalidError()

        eff = await self.rbac_service.get_effective_permissions(user.id)
        session_obj, raw_refresh = await self.session_service.create_session(
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        access_token = create_access_token(
            user_id=user.id,
            session_id=session_obj.id,
            roles=eff.roles,
            branch_scope_version=eff.permission_set_version,
        )

        user_resp = self._user_to_response(user, eff.roles, eff.allowed_branches)
        resp = LoginResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_resp,
            status="success",
        )
        return resp, raw_refresh

    async def refresh_tokens(
        self,
        raw_refresh_token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[str, str, int]:
        """Refresh tokeni rotasiya edir və yeni Access Token verir."""
        new_session, new_refresh = await self.session_service.rotate_refresh_token(
            raw_refresh_token=raw_refresh_token,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        eff = await self.rbac_service.get_effective_permissions(new_session.user_id)
        access_token = create_access_token(
            user_id=new_session.user_id,
            session_id=new_session.id,
            roles=eff.roles,
            branch_scope_version=eff.permission_set_version,
        )
        expires_in = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
        return access_token, new_refresh, expires_in

    async def forgot_password(self, email: str, ip_address: str | None = None) -> None:
        """Şifrə bərpa sorğusu qeydə alır (İstifadəçi mövcudluğu aşkar edilmir)."""
        user = await self.user_service.get_user_auth_record(email)
        if user and user.status == "active":
            raw_token = secrets.token_urlsafe(32)
            t_hash = hash_token(raw_token)
            expires = utc_now() + timedelta(hours=1)
            async with UnitOfWork() as uow:
                await self.auth_repo.create_password_reset_token(
                    uow.session, user_id=user.id, token_hash=t_hash, expires_at=expires
                )
                await record_audit_event(
                    session=uow.session,
                    action="PASSWORD_RESET_REQUESTED",
                    resource_type="users",
                    resource_id=str(user.id),
                    actor_ip=ip_address,
                )
                await uow.commit()

    async def reset_password(self, token: str, new_password: str) -> None:
        """Birdəfəlik token vasitəsilə şifrəni sıfırlayır."""
        t_hash = hash_token(token)

        async with UnitOfWork() as uow:
            token_obj = await self.auth_repo.get_password_reset_token(uow.session, t_hash)
            if not token_obj or token_obj.used_at is not None:
                raise TokenInvalidError(
                    "Şifrə bərpa linki artıq istifadə olunub və ya etibarsızdır."
                )

            if ensure_utc(token_obj.expires_at) <= utc_now():
                raise TokenExpiredError("Şifrə bərpa linkinin etibarlılıq müddəti bitib.")

            await self.user_service.reset_password_with_token(token_obj.user_id, new_password)
            await self.auth_repo.mark_password_reset_token_used(uow.session, token_obj.id)
            await uow.commit()

        if self.session_service:
            await self.session_service.revoke_all_user_sessions(
                token_obj.user_id, reason="Password reset"
            )

    async def enroll_2fa(self, user_id: uuid.UUID) -> TwoFactorEnrollResponse:
        """2FA üçün Base32 secret və birdəfəlik bərpa kodları generasiya edir."""
        if not settings.SECURITY_2FA_ENABLED:
            raise ForbiddenError("İki mərhələli təsdiqləmə (2FA) sistemdə aktivləşdirilməyib.")

        secret = pyotp.random_base32()
        recovery_codes = [secrets.token_hex(4).upper() for _ in range(8)]

        user = await self.user_service.get_user_auth_record_by_id(user_id)
        if not user:
            raise NotFoundError("İstifadəçi tapılmadı.")

        await self.user_service.update_totp_secret(user_id, secret, enabled=False)

        uri = pyotp.TOTP(secret).provisioning_uri(
            name=user.email,
            issuer_name=settings.APP_NAME,
        )
        return TwoFactorEnrollResponse(
            secret=secret,
            provisioning_uri=uri,
            recovery_codes=recovery_codes,
        )

    async def verify_2fa(self, user_id: uuid.UUID, code: str) -> None:
        """Daxil edilən kodu təsdiqləyərək 2FA-nı aktiv edir."""
        user = await self.user_service.get_user_auth_record_by_id(user_id)
        if not user or not user.totp_secret:
            raise NotFoundError("2FA quraşdırması tapılmadı.")

        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(code.strip(), valid_window=1):
            raise TwoFactorInvalidError()

        await self.user_service.update_totp_secret(user_id, user.totp_secret, enabled=True)

    async def disable_2fa(self, user_id: uuid.UUID, password: str) -> None:
        """Cari şifrəni yoxlayaraq 2FA-nı söndürür."""
        user = await self.user_service.get_user_auth_record_by_id(user_id)
        if not user:
            raise NotFoundError("İstifadəçi tapılmadı.")

        if not verify_password(password, user.password_hash):
            raise InvalidCredentialsError("Cari şifrə yanlışdır.")

        await self.user_service.update_totp_secret(user_id, None, enabled=False)

    async def create_manager_approval(
        self, data: ManagerApproveRequest, requester_id: uuid.UUID | None = None
    ) -> ManagerApproveResponse:
        """Menecer PIN kodunu yoxlayaraq tək istifadəlik təsdiq tokeni yaradır."""
        manager = await self.user_service.get_user_auth_record(data.manager_username)
        if not manager or not manager.manager_pin_hash:
            raise ManagerPinInvalidError()

        if not verify_pin(data.manager_pin, manager.manager_pin_hash):
            raise ManagerPinInvalidError()

        # Menecerin təsdiq edilən əməliyyata icazəsi olmalıdır
        eff = await self.rbac_service.get_effective_permissions(manager.id)
        if data.action_code not in eff.permissions and "system_admin" not in eff.roles:
            raise ForbiddenError("Menecerin bu əməliyyatı təsdiqləmək icazəsi yoxdur.")

        raw_token = secrets.token_urlsafe(32)
        t_hash = hash_token(raw_token)
        expires = utc_now() + timedelta(minutes=5)

        async with UnitOfWork() as uow:
            token_obj = ManagerApprovalToken(
                id=generate_uuid7(),
                manager_id=manager.id,
                requester_id=requester_id,
                action_code=data.action_code,
                resource_id=data.resource_id,
                branch_id=data.branch_id,
                reason=data.reason,
                token_hash=t_hash,
                expires_at=expires,
            )
            await self.auth_repo.create_manager_approval_token(uow.session, token_obj)

            await record_audit_event(
                session=uow.session,
                action="MANAGER_APPROVAL_GRANTED",
                resource_type="approvals",
                resource_id=str(token_obj.id),
                actor_id=manager.id,
                diff={"action_code": data.action_code, "reason": data.reason},
            )
            await uow.commit()

        return ManagerApproveResponse(
            approval_token=raw_token,
            action_code=data.action_code,
            expires_at=expires,
        )

    async def verify_and_consume_approval(
        self,
        token: str,
        expected_action: str,
        expected_resource_id: str | None = None,
        expected_branch_id: uuid.UUID | None = None,
    ) -> None:
        """Təsdiq tokenini yoxlayır və istifadə edilmiş kimi qeyd edir (Single-use)."""
        t_hash = hash_token(token)
        async with UnitOfWork() as uow:
            approval = await self.auth_repo.get_manager_approval_token(uow.session, t_hash)
            if not approval or approval.used_at is not None:
                raise ManagerApprovalError(
                    "Menecer təsdiq tokeni etibarsızdır və ya artıq istifadə olunub."
                )

            if ensure_utc(approval.expires_at) <= utc_now():
                raise ManagerApprovalError("Menecer təsdiq tokeninin vaxtı bitib.")

            if approval.action_code != expected_action:
                raise ManagerApprovalError("Təsdiq tokeni başqa əməliyyat üçündür.")

            if expected_resource_id and approval.resource_id != expected_resource_id:
                raise ManagerApprovalError("Təsdiq tokeni başqa sənəd üçündür.")

            if (
                expected_branch_id
                and approval.branch_id
                and approval.branch_id != expected_branch_id
            ):
                raise ManagerApprovalError("Təsdiq tokeni başqa filial üçündür.")

            await self.auth_repo.mark_manager_approval_token_used(uow.session, approval.id)
            await uow.commit()

    def _user_to_response(
        self, user: UserAuthRecord, roles: list[str], allowed_branches: list[uuid.UUID]
    ) -> UserResponse:
        return UserResponse(
            id=user.id,
            employee_ref=user.employee_ref,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            status=user.status,
            must_change_password=user.must_change_password,
            last_login_at=user.last_login_at,
            preferred_language=user.preferred_language,
            totp_enabled=user.totp_enabled,
            roles=roles,
            allowed_branches=allowed_branches,
            created_at=user.created_at,
            updated_at=user.updated_at,
            version=user.version,
        )


_auth_service: AuthService | None = None


def get_auth_service() -> AuthService:
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service
