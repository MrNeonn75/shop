"""Sessiyalar Modulu Xidmət Qatı (Sessions Service).

Sessiya yaradılması, Refresh Token rotasiyası və Təkrar İstifadənin Aşkarlanması (Reuse Detection).
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import timedelta
from typing import Any

from app.core.config import settings
from app.core.database import ensure_utc, utc_now
from app.core.errors import (
    ForbiddenError,
    NotFoundError,
    TokenExpiredError,
    TokenInvalidError,
    TokenReuseDetectedError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.sessions.models import Session
from app.modules.sessions.repository import SessionRepository
from app.modules.sessions.schemas import SessionResponse
from app.shared.audit import record_audit_event


def hash_token(raw_token: str) -> str:
    """Opaque tokeni verilənlər bazasında saxlamaq üçün SHA-256 ilə heşləyir."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class SessionService:
    """İstifadəçi sessiyalarının biznes idarəetməsi."""

    def __init__(self, repository: SessionRepository | None = None) -> None:
        self.repo = repository or SessionRepository()

    async def create_session(
        self,
        user_id: uuid.UUID,
        device_info: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        family_id: uuid.UUID | None = None,
    ) -> tuple[Session, str]:
        """Yeni sessiya və qeyri-şəffaf (opaque) Refresh Token yaradır."""
        raw_refresh_token = secrets.token_urlsafe(48)
        token_hash = hash_token(raw_refresh_token)

        now = utc_now()
        expires_at = now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

        session_obj = Session(
            id=generate_uuid7(),
            user_id=user_id,
            family_id=family_id or generate_uuid7(),
            refresh_token_hash=token_hash,
            device_info=device_info,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=now,
            last_seen_at=now,
            expires_at=expires_at,
        )

        async with UnitOfWork() as uow:
            await self.repo.create(uow.session, session_obj)
            await record_audit_event(
                session=uow.session,
                action="SESSION_CREATED",
                resource_type="sessions",
                resource_id=str(session_obj.id),
                actor_id=user_id,
                actor_ip=ip_address,
                diff={"device_info": device_info},
            )
            await uow.commit()

        return session_obj, raw_refresh_token

    async def rotate_refresh_token(
        self,
        raw_refresh_token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[Session, str]:
        """Refresh tokeni rotasiya edir. Təkrar istifadə edildikdə bütün ailəni ləğv edir (Reuse Detection)."""
        token_hash = hash_token(raw_refresh_token)

        async with UnitOfWork() as uow:
            sess = await self.repo.get_by_refresh_token_hash(uow.session, token_hash)

            if not sess:
                # Token tapılmadı
                raise TokenInvalidError("Etibarsız sessiya açarı.")

            # TƏKRAR İSTİFADƏ AŞKARLANDI (Reuse Detection)!
            if sess.revoked_at is not None:
                # Köhnə istifadə olunmuş və ya ləğv edilmiş token təqdim olundu -> token oğurlanıb!
                # Bütün ailəni ləğv edirik
                await self.repo.revoke_family(uow.session, sess.family_id)
                await record_audit_event(
                    session=uow.session,
                    action="TOKEN_REUSE_DETECTED",
                    resource_type="sessions",
                    resource_id=str(sess.id),
                    actor_id=sess.user_id,
                    actor_ip=ip_address,
                    diff={"family_id": str(sess.family_id), "reason": "Revoked token presented"},
                )
                await uow.commit()
                raise TokenReuseDetectedError()

            now = utc_now()
            if ensure_utc(sess.expires_at) <= now:
                raise TokenExpiredError("Sessiyanın müddəti bitib.")

            # Cari sessiyanı köhnəlmiş edirik
            await self.repo.revoke(uow.session, sess.id)

            # Eyni family_id daxilində yeni sessiya açırıq
            new_raw_token = secrets.token_urlsafe(48)
            new_token_hash = hash_token(new_raw_token)
            new_expires = now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

            new_session = Session(
                id=generate_uuid7(),
                user_id=sess.user_id,
                family_id=sess.family_id,
                refresh_token_hash=new_token_hash,
                device_info=sess.device_info,
                ip_address=ip_address or sess.ip_address,
                user_agent=user_agent or sess.user_agent,
                created_at=now,
                last_seen_at=now,
                expires_at=new_expires,
            )
            await self.repo.create(uow.session, new_session)

            await record_audit_event(
                session=uow.session,
                action="SESSION_REFRESHED",
                resource_type="sessions",
                resource_id=str(new_session.id),
                actor_id=sess.user_id,
                actor_ip=ip_address,
            )
            await uow.commit()

            return new_session, new_raw_token

    async def list_user_sessions(
        self, user_id: uuid.UUID, current_session_id: uuid.UUID | None = None
    ) -> list[SessionResponse]:
        """İstifadəçinin aktiv sessiyalarını siyahılayır."""
        async with UnitOfWork() as uow:
            sessions = await self.repo.list_active_by_user(uow.session, user_id)
            return [
                SessionResponse(
                    id=s.id,
                    device_info=s.device_info,
                    ip_address=s.ip_address,
                    user_agent=s.user_agent,
                    created_at=s.created_at,
                    last_seen_at=s.last_seen_at,
                    expires_at=s.expires_at,
                    is_current=(s.id == current_session_id),
                )
                for s in sessions
            ]

    async def revoke_session(
        self,
        session_id: uuid.UUID,
        user_id: uuid.UUID | None = None,
        actor: Any = None,
    ) -> None:
        """Tək sessiyanı ləğv edir."""
        async with UnitOfWork() as uow:
            sess = await self.repo.get_by_id(uow.session, session_id)
            if not sess:
                raise NotFoundError("Sessiya tapılmadı.")

            # Əgər öz sessiyası deyilsə, idarəçi hüququ olmalıdır
            if user_id and sess.user_id != user_id:
                actor_roles = getattr(actor, "roles", [])
                if "system_admin" not in actor_roles:
                    raise ForbiddenError("Başqasının sessiyasını ləğv etmək hüququnuz yoxdur.")

            await self.repo.revoke(uow.session, session_id)
            actor_id = getattr(actor, "id", user_id)
            await record_audit_event(
                session=uow.session,
                action="SESSION_REVOKED",
                resource_type="sessions",
                resource_id=str(session_id),
                actor_id=actor_id,
            )
            await uow.commit()

    async def revoke_all_user_sessions(
        self,
        user_id: uuid.UUID,
        actor: Any = None,
        reason: str | None = None,
    ) -> int:
        """İstifadəçinin bütün aktiv sessiyalarını ləğv edir."""
        async with UnitOfWork() as uow:
            count = await self.repo.revoke_all_for_user(uow.session, user_id)
            actor_id = getattr(actor, "id", user_id)
            await record_audit_event(
                session=uow.session,
                action="ALL_SESSIONS_REVOKED",
                resource_type="users",
                resource_id=str(user_id),
                actor_id=actor_id,
                diff={"revoked_count": count, "reason": reason},
            )
            await uow.commit()
            return count


_session_service: SessionService | None = None


def get_session_service() -> SessionService:
    global _session_service
    if _session_service is None:
        _session_service = SessionService()
    return _session_service
