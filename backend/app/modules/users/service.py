"""İstifadəçilər Modulu Xidmət Qatı (Users Service).

Biznes məntiqi, hüquq yoxlanışları, audit qeydiyyatı və Unit of Work koordinasiyası.
"""

from __future__ import annotations

import contextlib
import secrets
import string
import uuid
from datetime import timedelta
from typing import Any

from app.core.config import settings
from app.core.database import ensure_utc, utc_now
from app.core.errors import (
    ConflictError,
    ForbiddenError,
    InvalidCredentialsError,
    LastAdminProtectionError,
    NotFoundError,
    PasswordInHistoryError,
    SelfEscalationError,
)
from app.core.ids import generate_uuid7
from app.core.pagination import FilterBarParams
from app.core.security import (
    hash_password,
    hash_pin,
    validate_password_policy,
    verify_password,
    verify_pin,
)
from app.core.uow import UnitOfWork
from app.modules.users.events import (
    UserCreatedEvent,
    UserPasswordChangedEvent,
    UserStatusChangedEvent,
)
from app.modules.users.models import User
from app.modules.users.policies import can_manage_users, can_view_user
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import (
    UserAuthRecord,
    UserBranchAssignment,
    UserCreate,
    UserResponse,
    UserStatusUpdate,
    UserUpdate,
)
from app.shared.audit import record_audit_event
from app.shared.outbox import record_outbox_event


def generate_secure_temporary_password(length: int = 12) -> str:
    """Təhlükəsizlik siyasətinə tam uyğun müvəqqəti təsadüfi şifrə yaradır."""
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        pwd = "".join(secrets.choice(chars) for _ in range(length))
        try:
            validate_password_policy(pwd)
            return pwd
        except Exception:
            continue


class UserService:
    """İstifadəçi idarəetməsi biznes xidməti."""

    def __init__(
        self,
        repository: UserRepository | None = None,
        session_service: Any = None,
        rbac_service: Any = None,
    ) -> None:
        self.repo = repository or UserRepository()
        self.session_service = session_service
        self.rbac_service = rbac_service

    async def create_user(self, data: UserCreate, actor: Any = None) -> tuple[UserResponse, str]:
        """Yeni istifadəçi yaradır və generirlənmiş şifrəni (yalnız 1 dəfə) qaytarır."""
        if not can_manage_users(actor):
            raise ForbiddenError("Yeni istifadəçi yaratmaq üçün icazəniz yoxdur.")

        raw_password = data.password or generate_secure_temporary_password()
        validate_password_policy(raw_password)

        async with UnitOfWork() as uow:
            # Unikallıq yoxlanışı
            existing_user = await self.repo.get_by_username(uow.session, data.username)
            if existing_user:
                raise ConflictError(
                    f"'{data.username}' istifadəçi adı artıq qeydiyyatdan keçib.",
                    code="CONFLICT",
                )

            existing_email = await self.repo.get_by_email(uow.session, data.email)
            if existing_email:
                raise ConflictError(
                    f"'{data.email}' e-poçt ünvanı artıq istifadə olunur.",
                    code="CONFLICT",
                )

            hashed = hash_password(raw_password)
            user_id = generate_uuid7()

            user = User(
                id=user_id,
                employee_ref=data.employee_ref,
                username=data.username.strip().lower(),
                email=data.email.strip().lower(),
                full_name=data.full_name.strip(),
                password_hash=hashed,
                status="active",
                must_change_password=data.must_change_password,
                preferred_language=data.preferred_language,
                version=1,
            )
            await self.repo.create(uow.session, user)

            # İlk şifrəni tarixçəyə yazırıq
            await self.repo.add_password_history(uow.session, user.id, hashed)

            # Filial təyinatı
            if data.allowed_branch_ids:
                await self.repo.set_branch_access(uow.session, user.id, data.allowed_branch_ids)

            # Audit və Outbox hadisəsi
            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="USER_CREATED",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=actor_id,
                diff={"username": user.username, "email": user.email, "full_name": user.full_name},
            )

            event = UserCreatedEvent(
                user_id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            response = self._to_response(user, allowed_branches=data.allowed_branch_ids)
            return response, raw_password

    async def get_user_by_id(self, user_id: uuid.UUID, actor: Any = None) -> UserResponse:
        """İstifadəçi məlumatlarını ID üzrə çəkir."""
        if not can_view_user(actor, user_id):
            raise ForbiddenError("Bu istifadəçinin məlumatlarına baxmaq icazəniz yoxdur.")

        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            branches = await self.repo.get_branch_access(uow.session, user_id)
            branch_ids = [b.branch_id for b in branches]
            return self._to_response(user, allowed_branches=branch_ids)

    async def list_users(
        self,
        params: FilterBarParams,
        actor: Any = None,
        branch_scope_ids: list[uuid.UUID] | None = None,
    ) -> tuple[list[UserResponse], int]:
        """Səhifələnmiş istifadəçi siyahısını qaytarır."""
        if not can_manage_users(actor):
            raise ForbiddenError("İstifadəçi siyahısını görmək icazəniz yoxdur.")

        async with UnitOfWork() as uow:
            users, total = await self.repo.list_users(
                uow.session, params, branch_scope_ids=branch_scope_ids
            )
            responses: list[UserResponse] = []
            for u in users:
                branch_ids = [b.branch_id for b in getattr(u, "branch_accesses", [])]
                responses.append(self._to_response(u, allowed_branches=branch_ids))
            return responses, total

    async def update_user(
        self, user_id: uuid.UUID, data: UserUpdate, actor: Any = None
    ) -> UserResponse:
        """İstifadəçi profil məlumatlarını yeniləyir."""
        if not can_manage_users(actor) and getattr(actor, "id", None) != user_id:
            raise ForbiddenError("Bu hesabı yeniləmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            old_state = {"full_name": user.full_name, "email": user.email}

            if data.full_name is not None:
                user.full_name = data.full_name.strip()
            if data.email is not None:
                new_email = data.email.strip().lower()
                if new_email != user.email:
                    existing = await self.repo.get_by_email(uow.session, new_email)
                    if existing:
                        raise ConflictError("Bu e-poçt ünvanı artıq başqa istifadəçidə mövcuddur.")
                    user.email = new_email
            if data.preferred_language is not None:
                user.preferred_language = data.preferred_language
            if data.employee_ref is not None:
                user.employee_ref = data.employee_ref

            await self.repo.update(uow.session, user, expected_version=data.version)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="USER_UPDATED",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=actor_id,
                diff={
                    "before": old_state,
                    "after": {"full_name": user.full_name, "email": user.email},
                },
            )
            await uow.commit()

            branches = await self.repo.get_branch_access(uow.session, user_id)
            branch_ids = [b.branch_id for b in branches]
            return self._to_response(user, allowed_branches=branch_ids)

    async def update_status(
        self, user_id: uuid.UUID, data: UserStatusUpdate, actor: Any = None
    ) -> UserResponse:
        """İstifadəçi statusunu yeniləyir (Aktivləşdir / Dayandır).

        Hesab dayandırıldıqda ('suspended') istifadəçinin bütün sessiyaları dərhal ləğv edilir.
        """
        if not can_manage_users(actor):
            raise ForbiddenError("İstifadəçi statusunu dəyişmək icazəniz yoxdur.")

        actor_id = getattr(actor, "id", None)
        if actor_id == user_id and data.status == "suspended":
            raise SelfEscalationError("İstifadəçi öz hesabını dayandıra bilməz.")

        if data.status in ("suspended", "locked"):
            from app.modules.rbac.service import get_rbac_service

            rbac_svc = self.rbac_service or get_rbac_service()
            eff = await rbac_svc.get_effective_permissions(user_id)
            if "system_admin" in eff.roles:
                active_admins = await rbac_svc.count_active_system_admins()
                if active_admins <= 1:
                    raise LastAdminProtectionError(
                        "Sistemdəki yeganə aktiv administrator hesabı dayandırıla bilməz."
                    )

        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            old_status = user.status
            user.status = data.status

            if data.status == "active":
                user.failed_login_count = 0
                user.locked_until = None

            await self.repo.update(uow.session, user, expected_version=data.version)

            await record_audit_event(
                session=uow.session,
                action="USER_STATUS_CHANGED",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=actor_id,
                diff={"old_status": old_status, "new_status": data.status, "reason": data.reason},
            )

            event = UserStatusChangedEvent(
                user_id=user.id,
                old_status=old_status,
                new_status=data.status,
                reason=data.reason,
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

        # Dayandırıldıqda bütün sessiyaları ləğv edirik
        if data.status == "suspended" and self.session_service:
            with contextlib.suppress(Exception):
                await self.session_service.revoke_all_user_sessions(
                    user_id=user_id, reason="User suspended"
                )

        return await self.get_user_by_id(user_id, actor=actor)

    async def force_password_reset(self, user_id: uuid.UUID, actor: Any = None) -> None:
        """İstifadəçidən növbəti girişdə şifrəsini dəyişməsini tələb edir."""
        if not can_manage_users(actor):
            raise ForbiddenError("Məcburi şifrə dəyişməsi tələb etmək icazəniz yoxdur.")

        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            user.must_change_password = True
            await self.repo.update(uow.session, user, expected_version=user.version)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="USER_FORCE_PASSWORD_RESET",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=actor_id,
            )
            await uow.commit()

    async def assign_branches(
        self, user_id: uuid.UUID, data: UserBranchAssignment, actor: Any = None
    ) -> list[uuid.UUID]:
        """İstifadəçiyə filial çıxış icazələrini təyin edir."""
        if not can_manage_users(actor):
            raise ForbiddenError("Filial icazələrini təyin etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            accesses = await self.repo.set_branch_access(
                uow.session,
                user_id=user_id,
                branch_ids=data.branch_ids,
                manage_branch_ids=data.manage_branch_ids,
            )

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="USER_BRANCHES_ASSIGNED",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=actor_id,
                diff={"branch_ids": [str(b) for b in data.branch_ids]},
            )
            await uow.commit()
            return [a.branch_id for a in accesses]

    async def set_manager_pin(self, user_id: uuid.UUID, pin: str, actor: Any = None) -> None:
        """POS təsdiqləri üçün menecer PIN kodunu quraşdırır."""
        if not can_manage_users(actor) and getattr(actor, "id", None) != user_id:
            raise ForbiddenError("Menecer PIN kodunu dəyişmək icazəniz yoxdur.")

        if not pin.isdigit() or len(pin) < 4 or len(pin) > 8:
            raise ValueError("Menecer PIN kodu 4-8 rəqəmdən ibarət olmalıdır.")

        hashed_pin = hash_pin(pin)
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            user.manager_pin_hash = hashed_pin
            await self.repo.update(uow.session, user, expected_version=user.version)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="USER_MANAGER_PIN_SET",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=actor_id,
            )
            await uow.commit()

    async def set_pos_pin(self, user_id: uuid.UUID, pin: str, actor: Any = None) -> None:
        """Kassir üçün POS sürətli giriş PIN kodunu quraşdırır."""
        if not can_manage_users(actor) and getattr(actor, "id", None) != user_id:
            raise ForbiddenError("POS PIN kodunu dəyişmək icazəniz yoxdur.")

        if not pin.isdigit() or len(pin) < 4 or len(pin) > 8:
            raise ValueError("POS PIN kodu 4-8 rəqəmdən ibarət olmalıdır.")

        hashed_pin = hash_pin(pin)
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            user.pos_pin_hash = hashed_pin
            await self.repo.update(uow.session, user, expected_version=user.version)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="USER_POS_PIN_SET",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=actor_id,
            )
            await uow.commit()

    async def change_password(
        self, user_id: uuid.UUID, current_password: str, new_password: str
    ) -> None:
        """İstifadəçinin öz şifrəsini dəyişməsi (tarixçə və siyasət yoxlanışı ilə)."""
        validate_password_policy(new_password)

        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            # Cari şifrənin yoxlanışı
            if not verify_password(current_password, user.password_hash):
                raise InvalidCredentialsError("Cari şifrə yanlışdır.")

            # Şifrə tarixçəsi yoxlanışı
            recent_hashes = await self.repo.get_recent_password_hashes(
                uow.session, user.id, limit=settings.SECURITY_PASSWORD_HISTORY_COUNT
            )
            for h in recent_hashes:
                if verify_password(new_password, h):
                    raise PasswordInHistoryError()

            new_hash = hash_password(new_password)
            user.password_hash = new_hash
            user.must_change_password = False

            await self.repo.add_password_history(uow.session, user.id, new_hash)
            await self.repo.update(uow.session, user, expected_version=user.version)

            await record_audit_event(
                session=uow.session,
                action="USER_PASSWORD_CHANGED",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=user.id,
            )

            event = UserPasswordChangedEvent(user_id=user.id, forced=False)
            await record_outbox_event(uow.session, event)
            await uow.commit()

    async def get_user_auth_record(self, identifier: str) -> UserAuthRecord | None:
        """İstifadəçi adı və ya e-poçt üzrə autentifikasiya qeydini qaytarır."""
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_identifier(uow.session, identifier)
            if not user:
                return None
            return UserAuthRecord.model_validate(user)

    async def get_user_auth_record_by_id(self, user_id: uuid.UUID) -> UserAuthRecord | None:
        """ID üzrə autentifikasiya qeydini qaytarır."""
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                return None
            return UserAuthRecord.model_validate(user)

    async def record_login_failure(
        self, user_id: uuid.UUID, ip_address: str | None = None
    ) -> tuple[int, bool, int]:
        """Uğursuz giriş cəhdini qeydə alır və limit aşıldıqda hesabı bloklayır.

        Qaytarır: (cəhd_sayı, bloklandı_mı, gözləmə_saniyəsi)
        """
        now = utc_now()
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                return 0, False, 0

            user.failed_login_count += 1
            is_locked = False
            retry_after = 0
            if user.failed_login_count >= settings.SECURITY_MAX_LOGIN_ATTEMPTS:
                user.status = "locked"
                user.locked_until = now + timedelta(
                    minutes=settings.SECURITY_LOCKOUT_DURATION_MINUTES
                )
                is_locked = True
                retry_after = settings.SECURITY_LOCKOUT_DURATION_MINUTES * 60
                await record_audit_event(
                    session=uow.session,
                    action="USER_LOCKED_OUT",
                    resource_type="users",
                    resource_id=str(user.id),
                    actor_id=user.id,
                    actor_ip=ip_address,
                    diff={"failed_attempts": user.failed_login_count},
                )
            else:
                await record_audit_event(
                    session=uow.session,
                    action="LOGIN_FAILED",
                    resource_type="users",
                    resource_id=str(user.id),
                    actor_id=user.id,
                    actor_ip=ip_address,
                    diff={"reason": "BAD_PASSWORD", "attempts": user.failed_login_count},
                )
            await self.repo.update(uow.session, user, expected_version=user.version)
            await uow.commit()
            return user.failed_login_count, is_locked, retry_after

    async def record_login_success(self, user_id: uuid.UUID) -> None:
        """Uğurlu giriş zamanı sayğacları sıfırlayır və son giriş vaxtını yeniləyir."""
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if user:
                user.failed_login_count = 0
                user.locked_until = None
                user.last_login_at = utc_now()
                await self.repo.update(uow.session, user, expected_version=user.version)
                await uow.commit()

    async def unlock_user_if_expired(self, user_id: uuid.UUID) -> bool:
        """Əgər kilidlənmə müddəti bitibsə hesabı aktivləşdirir."""
        now = utc_now()
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                return False
            if user.status == "locked":
                if user.locked_until and ensure_utc(user.locked_until) > now:
                    return False
                user.status = "active"
                user.failed_login_count = 0
                user.locked_until = None
                await self.repo.update(uow.session, user, expected_version=user.version)
                await uow.commit()
            return True

    async def verify_pos_pin(self, user_id: uuid.UUID, pin: str) -> bool:
        """Kassirin POS PIN kodunu yoxlayır."""
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user or not user.pos_pin_hash:
                return False
            return verify_pin(pin, user.pos_pin_hash)

    async def verify_manager_pin(self, user_id: uuid.UUID, pin: str) -> bool:
        """Menecer təsdiq PIN kodunu yoxlayır."""
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user or not user.manager_pin_hash:
                return False
            return verify_pin(pin, user.manager_pin_hash)

    async def update_totp_secret(
        self, user_id: uuid.UUID, secret: str | None, enabled: bool
    ) -> None:
        """2FA TOTP açarını və aktivlik vəziyyətini yeniləyir."""
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")
            user.totp_secret = secret
            user.totp_enabled = enabled
            await self.repo.update(uow.session, user, expected_version=user.version)
            await record_audit_event(
                session=uow.session,
                action="USER_2FA_UPDATED",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=user.id,
                diff={"enabled": enabled},
            )
            await uow.commit()

    async def reset_password_with_token(self, user_id: uuid.UUID, new_password: str) -> None:
        """Sıfırlama tokeni vasitəsilə yeni şifrə təyin edir."""
        validate_password_policy(new_password)
        async with UnitOfWork() as uow:
            user = await self.repo.get_by_id(uow.session, user_id)
            if not user:
                raise NotFoundError("İstifadəçi tapılmadı.")

            # Şifrə tarixçəsi yoxlanışı
            recent_hashes = await self.repo.get_recent_password_hashes(
                uow.session, user.id, limit=settings.SECURITY_PASSWORD_HISTORY_COUNT
            )
            for h in recent_hashes:
                if verify_password(new_password, h):
                    raise PasswordInHistoryError()

            new_hash = hash_password(new_password)
            user.password_hash = new_hash
            user.must_change_password = False
            user.failed_login_count = 0
            user.locked_until = None
            if user.status == "locked":
                user.status = "active"

            await self.repo.add_password_history(uow.session, user.id, new_hash)
            await self.repo.update(uow.session, user, expected_version=user.version)

            await record_audit_event(
                session=uow.session,
                action="USER_PASSWORD_RESET_COMPLETED",
                resource_type="users",
                resource_id=str(user.id),
                actor_id=user.id,
            )
            event = UserPasswordChangedEvent(user_id=user.id, forced=False)
            await record_outbox_event(uow.session, event)
            await uow.commit()

    async def get_user_allowed_branches(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        """İstifadəçinin filial icazələri siyahısını qaytarır."""
        async with UnitOfWork() as uow:
            accesses = await self.repo.get_branch_access(uow.session, user_id)
            return [a.branch_id for a in accesses]

    async def count_active_users(self, user_ids: list[uuid.UUID]) -> int:
        """Verilmiş istifadəçi ID-ləri arasında aktiv olanların sayını qaytarır."""
        if not user_ids:
            return 0
        from sqlalchemy import func, select

        async with UnitOfWork() as uow:
            stmt = select(func.count(User.id)).where(
                User.id.in_(user_ids),
                User.status == "active",
                User.is_deleted.is_(False),
            )
            res = await uow.session.execute(stmt)
            return int(res.scalar_one_or_none() or 0)

    async def count_users_by_branch(self, branch_id: uuid.UUID) -> int:
        """Filiala təyin olunmuş aktiv istifadəçilərin sayını xidmət interfeysi vasitəsilə qaytarır."""
        async with UnitOfWork() as uow:
            return await self.repo.count_users_by_branch(uow.session, branch_id)

    def _to_response(
        self, user: User, allowed_branches: list[uuid.UUID] | None = None
    ) -> UserResponse:
        """Daxili User modelini xarici UserResponse sxeminə çevirir."""
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
            roles=[],  # RBAC modulu tərəfindən doldurulacaq
            allowed_branches=allowed_branches or [],
            created_at=user.created_at,
            updated_at=user.updated_at,
            version=user.version,
        )


_user_service: UserService | None = None


def get_user_service() -> UserService:
    """Dependency injection üçün UserService tək instansiyası."""
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service
