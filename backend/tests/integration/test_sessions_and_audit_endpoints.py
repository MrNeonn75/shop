"""Sessiyalar və Audit API İnteqrasiya Testləri (Integration Tests for Sessions and Audit).

Əhatə dairəsi:
- GET /api/v1/me/sessions: Cari istifadəçinin aktiv sessiyaları (is_current işarəsi ilə).
- DELETE /api/v1/me/sessions/{id}: İstifadəçinin öz sessiyasını bağlaması.
- DELETE /api/v1/users/{id}/sessions: İnzibatçı tərəfindən istifadəçinin bütün sessiyalarının bağlanması.
- GET /api/v1/audit/events: Audit jurnalının səhifələmə və filtrlərlə gətirilməsi (icazə yoxlanışı ilə).
- GET /api/v1/audit/entities/{entity_type}/{entity_id}/timeline: Müəyyən obyektin tarixçəsi.
- POST /api/v1/audit/verify-integrity: Kriptoqrafik heş zəncirinin bütövlüyünün yoxlanılması.
- GET /api/v1/audit/export: Audit məlumatlarının ixrac edilməsi və əməliyyatın qeydə alınması.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.audit.service import AuditService
from app.modules.auth.tokens import create_access_token
from app.modules.rbac.service import RbacService
from app.modules.sessions.service import SessionService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


@pytest.fixture
def user_service() -> UserService:
    return UserService()


@pytest.fixture
def rbac_service() -> RbacService:
    return RbacService()


@pytest.fixture
def session_service() -> SessionService:
    return SessionService()


@pytest.fixture
def audit_service() -> AuditService:
    return AuditService()


async def create_user_with_role(
    user_service: UserService,
    rbac_service: RbacService,
    username: str,
    email: str,
    role_code: str,
) -> tuple[uuid.UUID, dict[str, str], uuid.UUID]:
    """İstifadəçi yaradır, rol təyin edir və bearer token başlıqlarını qaytarır."""
    await rbac_service.seed_catalog()
    dto = UserCreate(
        username=username,
        email=email,
        full_name=f"Full {username}",
        password="ValidPassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(dto, actor=None)

    async with UnitOfWork() as uow:
        role = await rbac_service.repo.get_role_by_code(uow.session, role_code)
        assert role is not None
        role_id = role.id

    await rbac_service.assign_user_roles(user.id, [role_id], actor=None)

    session_id = generate_uuid7()
    token = create_access_token(
        user_id=user.id,
        session_id=session_id,
        roles=[role_code],
    )
    return user.id, {"Authorization": f"Bearer {token}"}, session_id


@pytest.mark.asyncio
async def test_my_sessions_flow(
    client: AsyncClient,
    user_service: UserService,
    rbac_service: RbacService,
    session_service: SessionService,
) -> None:
    """Cari istifadəçinin aktiv sessiyalarının siyahılanması və birinin ləğv edilməsi."""
    # 1. İstifadəçi yaradırıq
    user_id, _, _ = await create_user_with_role(
        user_service, rbac_service, "sess_user", "sess_user@brandhouse.az", "cashier"
    )

    # 2. İki ədəd sessiya açırıq
    sess1, _ = await session_service.create_session(
        user_id=user_id, device_info="Chrome on Windows"
    )
    sess2, _ = await session_service.create_session(user_id=user_id, device_info="Safari on iPhone")

    # sess1 üçün token yaradırıq
    token1 = create_access_token(user_id=user_id, session_id=sess1.id, roles=["cashier"])
    headers = {"Authorization": f"Bearer {token1}"}

    # 3. GET /api/v1/me/sessions
    res = await client.get("/api/v1/me/sessions", headers=headers)
    assert res.status_code == 200
    sessions_data = res.json()
    assert len(sessions_data) == 2

    # sess1 is_current=True, sess2 is_current=False olmalıdır
    s1_item = next(s for s in sessions_data if s["id"] == str(sess1.id))
    s2_item = next(s for s in sessions_data if s["id"] == str(sess2.id))
    assert s1_item["is_current"] is True
    assert s2_item["is_current"] is False

    # 4. sess2-ni ləğv edirik: DELETE /api/v1/me/sessions/{sess2.id}
    del_res = await client.delete(f"/api/v1/me/sessions/{sess2.id}", headers=headers)
    assert del_res.status_code == 204

    # 5. Təkrar siyahılayırıq: yalnız sess1 qalmalıdır
    res2 = await client.get("/api/v1/me/sessions", headers=headers)
    assert res2.status_code == 200
    remaining = res2.json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == str(sess1.id)


@pytest.mark.asyncio
async def test_revoke_other_user_session_forbidden(
    client: AsyncClient,
    user_service: UserService,
    rbac_service: RbacService,
    session_service: SessionService,
) -> None:
    """Adi istifadəçinin başqasının sessiyasını ləğv etməyə cəhdinin qarşısının alınması."""
    user_a_id, _, _ = await create_user_with_role(
        user_service, rbac_service, "user_a", "user_a@brandhouse.az", "cashier"
    )
    user_b_id, _, _ = await create_user_with_role(
        user_service, rbac_service, "user_b", "user_b@brandhouse.az", "cashier"
    )

    sess_a, _ = await session_service.create_session(user_id=user_a_id, device_info="Device A")
    sess_b, _ = await session_service.create_session(user_id=user_b_id, device_info="Device B")

    token_b = create_access_token(user_id=user_b_id, session_id=sess_b.id, roles=["cashier"])
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B User A-nın sessiyasını silməyə çalışır -> 403 Forbidden
    res = await client.delete(f"/api/v1/me/sessions/{sess_a.id}", headers=headers_b)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_revoke_all_user_sessions(
    client: AsyncClient,
    user_service: UserService,
    rbac_service: RbacService,
    session_service: SessionService,
) -> None:
    """İnzibatçının istifadəçinin bütün aktiv sessiyalarını bağlaması."""
    # Hədəf istifadəçi
    target_id, _, _ = await create_user_with_role(
        user_service, rbac_service, "target_sessions", "target_sess@brandhouse.az", "cashier"
    )
    await session_service.create_session(user_id=target_id, device_info="Device 1")
    await session_service.create_session(user_id=target_id, device_info="Device 2")

    # Admin
    _, admin_headers, _ = await create_user_with_role(
        user_service, rbac_service, "admin_sessions", "admin_sess@brandhouse.az", "system_admin"
    )

    # DELETE /api/v1/users/{target_id}/sessions
    res = await client.delete(f"/api/v1/users/{target_id}/sessions", headers=admin_headers)
    assert res.status_code == 204

    # Yoxlayırıq ki, aktiv sessiyalar qalmayıb
    async with UnitOfWork() as uow:
        active = await session_service.repo.list_active_by_user(uow.session, target_id)
        assert len(active) == 0


@pytest.mark.asyncio
async def test_audit_endpoints_and_integrity_flow(
    client: AsyncClient,
    user_service: UserService,
    rbac_service: RbacService,
) -> None:
    """Audit hadisələrinin siyahısı, xronologiyası, kriptoqrafik bütövlüyü və ixracı."""
    # 1. Admin və Adi istifadəçi
    target_id, _, _ = await create_user_with_role(
        user_service, rbac_service, "audit_subject", "audit_subject@brandhouse.az", "cashier"
    )
    _, admin_headers, _ = await create_user_with_role(
        user_service, rbac_service, "audit_admin", "audit_admin@brandhouse.az", "system_admin"
    )
    _, cashier_headers, _ = await create_user_with_role(
        user_service, rbac_service, "audit_cashier", "audit_cashier@brandhouse.az", "cashier"
    )

    # 2. Adi istifadəçi audit jurnalına baxa bilməz (403 Forbidden)
    forbidden_res = await client.get("/api/v1/audit/events", headers=cashier_headers)
    assert forbidden_res.status_code == 403

    # 3. İnzibatçı audit jurnalına baxır (200 OK)
    list_res = await client.get("/api/v1/audit/events", headers=admin_headers)
    assert list_res.status_code == 200
    page_data = list_res.json()
    assert "items" in page_data
    assert page_data["total"] >= 1

    # 3b. Filtrlərlə audit axtarışı (action, resource_type, severity)
    filtered_res = await client.get(
        "/api/v1/audit/events?action=USER_CREATED&resource_type=users&severity=info",
        headers=admin_headers,
    )
    assert filtered_res.status_code == 200
    filtered_data = filtered_res.json()
    assert filtered_data["total"] >= 1
    assert all(item["resource_type"] == "users" for item in filtered_data["items"])

    # 4. Obyektin xronologiyası (Timeline)
    timeline_res = await client.get(
        f"/api/v1/audit/entities/users/{target_id}/timeline",
        headers=admin_headers,
    )
    assert timeline_res.status_code == 200
    timeline_data = timeline_res.json()
    assert timeline_data["entity_type"] == "users"
    assert timeline_data["entity_id"] == str(target_id)
    assert timeline_data["total_events"] >= 1

    # 5. Kriptoqrafik Heş Zəncirinin Bütövlük Təftişi (Verify Integrity)
    verify_res = await client.post(
        "/api/v1/audit/verify-integrity",
        json={},
        headers=admin_headers,
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["status"] == "valid"
    assert verify_data["is_tampered"] is False
    assert verify_data["checked_count"] >= 1

    # 6. Audit İxracı (Export)
    export_res = await client.get("/api/v1/audit/export", headers=admin_headers)
    assert export_res.status_code == 200
    export_data = export_res.json()
    assert export_data["status"] == "success"
    assert "download_url" in export_data
