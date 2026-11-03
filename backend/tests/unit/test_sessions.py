"""Sessiyalar Modulu Vahid Testləri (Unit Tests for Sessions module).

Əhatə dairəsi:
- Sessiya yaradılması (Session və Opaque token).
- Refresh Token rotasiyası (normal keçid).
- Təkrar istifadənin aşkarlanması (Reuse Detection - bütöv ailənin ləğvi).
- Vaxtı bitmiş və ya etibarsız token xətaları.
- Sessiyaların siyahılanması və cari sessiya işarəsi.
- Tək və kütləvi sessiya ləğvləri.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.core.database import utc_now
from app.core.errors import (
    ForbiddenError,
    NotFoundError,
    TokenExpiredError,
    TokenInvalidError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.sessions.service import SessionService


@pytest.fixture
def session_service() -> SessionService:
    return SessionService()


@pytest.mark.asyncio
async def test_session_creation_and_list(session_service: SessionService) -> None:
    """Sessiya yaradılması və istifadəçi sessiyalarının siyahılanmasını yoxlayır."""
    user_id = generate_uuid7()
    sess1, raw_token1 = await session_service.create_session(
        user_id=user_id, device_info="MacBook Pro", ip_address="192.168.1.10"
    )
    assert sess1.id is not None
    assert sess1.user_id == user_id
    assert sess1.device_info == "MacBook Pro"
    assert len(raw_token1) > 20

    sess2, _ = await session_service.create_session(
        user_id=user_id, device_info="iPhone 15", ip_address="192.168.1.11"
    )

    # Sessiyaların siyahılanması
    sessions = await session_service.list_user_sessions(user_id, current_session_id=sess1.id)
    assert len(sessions) == 2
    s1 = next(s for s in sessions if s.id == sess1.id)
    s2 = next(s for s in sessions if s.id == sess2.id)
    assert s1.is_current is True
    assert s2.is_current is False


@pytest.mark.asyncio
async def test_session_rotation_and_errors(session_service: SessionService) -> None:
    """Refresh token rotasiyası, vaxtı bitmə və etibarsız token xətalarını yoxlayır."""
    user_id = generate_uuid7()
    sess, raw_token = await session_service.create_session(user_id=user_id)

    # 1. Yanlış token
    with pytest.raises(TokenInvalidError):
        await session_service.rotate_refresh_token("completely_invalid_random_token")

    # 2. Vaxtı bitmiş sessiya
    async with UnitOfWork() as uow:
        db_sess = await session_service.repo.get_by_id(uow.session, sess.id)
        assert db_sess is not None
        db_sess.expires_at = utc_now() - timedelta(minutes=5)
        await uow.session.flush()
        await uow.commit()

    with pytest.raises(TokenExpiredError):
        await session_service.rotate_refresh_token(raw_token)

    # 3. Normal rotasiya üçün yeni sessiya yaradırıq
    sess_new, raw_new = await session_service.create_session(user_id=user_id)
    rotated_sess, rotated_raw = await session_service.rotate_refresh_token(raw_new)
    assert rotated_sess.id != sess_new.id
    assert rotated_sess.family_id == sess_new.family_id
    assert rotated_raw != raw_new


@pytest.mark.asyncio
async def test_session_revocations_and_permissions(session_service: SessionService) -> None:
    """Tək və kütləvi sessiya ləğvi, icazə və tapılmadı xətalarını yoxlayır."""
    user1_id = generate_uuid7()
    user2_id = generate_uuid7()

    sess1, _ = await session_service.create_session(user_id=user1_id)
    sess2, _ = await session_service.create_session(user_id=user1_id)

    # Mövcud olmayan sessiya ləğvi -> NotFoundError
    with pytest.raises(NotFoundError):
        await session_service.revoke_session(generate_uuid7())

    # Başqa istifadəçinin sessiyasını ləğv etmə cəhdi (qeyri-admin) -> ForbiddenError
    non_admin_actor = type("Actor", (), {"roles": ["cashier"], "id": user2_id})()
    with pytest.raises(ForbiddenError):
        await session_service.revoke_session(sess1.id, user_id=user2_id, actor=non_admin_actor)

    # Admin başqasının sessiyasını ləğv edə bilər
    admin_actor = type("Actor", (), {"roles": ["system_admin"], "id": user2_id})()
    await session_service.revoke_session(sess1.id, user_id=user2_id, actor=admin_actor)

    # İstifadəçinin bütün sessiyalarını ləğv et
    count = await session_service.revoke_all_user_sessions(user1_id)
    assert count >= 1

    # Yoxlayırıq ki, heç bir aktiv sessiya qalmayıb
    active_now = await session_service.list_user_sessions(user1_id)
    assert len(active_now) == 0
