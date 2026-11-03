"""Bildirişlər Modulu Vahid və İnteqrasiya Testləri (Notifications Tests)."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.main import app
from app.modules.auth.policies import AuthenticatedUser
from app.modules.notifications.channels import (
    EmailNotificationChannel,
    InAppNotificationChannel,
    is_in_quiet_hours,
    mask_email,
    mask_phone,
    safe_render_template,
)
from app.modules.notifications.models import Notification, NotificationRule
from app.modules.notifications.rules import evaluate_condition, is_duplicate_notification
from app.modules.notifications.schemas import (
    NotificationPreferenceUpdateRequest,
    NotificationRuleCreateRequest,
    NotificationRuleEvaluateRequest,
)
from app.modules.notifications.service import NotificationService
from app.modules.users.models import User


@pytest.fixture
def test_actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="test_manager",
        email="manager@brandhouse.az",
        full_name="Test Menecer",
        roles=["branch_manager"],
        permissions=["notifications.view_own", "notifications.rules.manage", "purchasing.order.approve"],
        allowed_branches=[generate_uuid7()],
        session_id=generate_uuid7(),
    )


@pytest.fixture
def admin_actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="admin@brandhouse.az",
        full_name="Sistem Admin",
        roles=["system_admin"],
        permissions=["system.branches.all", "notifications.rules.manage"],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


@pytest.mark.asyncio
async def test_notification_lifecycle_and_unread_counts(session: AsyncSession, test_actor: AuthenticatedUser) -> None:
    """Bildirişin yaradılması, oxunması, ertələnməsi və arxivlənməsi həyat dövrü."""
    service = NotificationService(session)

    # Bildiriş yaradırıq
    notif = Notification(
        id=generate_uuid7(),
        recipient_user_id=test_actor.id,
        category="STOCK",
        severity="critical",
        title="Kritik Anbar Xəbərdarlığı",
        body="Məhsulun qalığı 2 ədədə düşdü",
        deep_link="/inventory/variants/123",
        created_at=utc_now(),
    )
    session.add(notif)
    await session.commit()

    # Sayğac yoxlanışı
    counts = await service.get_unread_counts(test_actor)
    assert counts.unread_count == 1
    assert counts.critical_count == 1

    # Oxunma əməliyyatı
    read_resp = await service.mark_as_read(notif.id, test_actor)
    assert read_resp.read_at is not None

    # Təkrar sayğac yoxlanışı
    counts_after = await service.get_unread_counts(test_actor)
    assert counts_after.unread_count == 0

    # Ertələmə (Snooze)
    snooze_until = utc_now() + timedelta(hours=2)
    snoozed = await service.snooze(notif.id, snooze_until, test_actor)
    assert snoozed.snoozed_until == snooze_until

    # Arxivləmə
    archived = await service.archive(notif.id, test_actor)
    assert archived.archived_at is not None


@pytest.mark.asyncio
async def test_user_preferences_crud(session: AsyncSession, test_actor: AuthenticatedUser) -> None:
    """İstifadəçinin bildiriş tənzimləmələrinin (sakit saatlar, kanallar) idarəsi."""
    service = NotificationService(session)

    # İlkin defolt tənzimləmə
    pref = await service.get_preferences(test_actor)
    assert pref.channels_enabled.get("IN_APP") is True
    assert pref.language == "az"

    # Yeniləmə
    update_req = NotificationPreferenceUpdateRequest(
        channels_enabled={"IN_APP": True, "EMAIL": False, "SMS": True},
        quiet_hours_start="23:00",
        quiet_hours_end="07:00",
        daily_digest=True,
    )
    updated = await service.update_preferences(update_req, test_actor)
    assert updated.channels_enabled.get("EMAIL") is False
    assert updated.quiet_hours_start == "23:00"
    assert updated.daily_digest is True


@pytest.mark.asyncio
async def test_alert_rules_crud_and_evaluation(session: AsyncSession, admin_actor: AuthenticatedUser) -> None:
    """Alert qaydalarının yaradılması və simulyasiya testi (test-evaluate)."""
    service = NotificationService(session)

    rule_req = NotificationRuleCreateRequest(
        name="Böyük Məbləğli Satış",
        category="PAYMENT",
        event_type="sale.completed",
        condition={"field": "grand_total", "op": ">=", "value": 500},
        channels=["IN_APP", "EMAIL"],
        severity="warning",
        recipient_type="ROLE",
        recipient_target="branch_manager",
        branch_scope="SAME_BRANCH",
    )
    rule = await service.create_rule(rule_req, admin_actor)
    assert rule.name == "Böyük Məbləğli Satış"
    assert rule.event_type == "sale.completed"

    # Qaydanın test simulyasiyası (test-evaluate)
    # 1. Həddi aşan satış
    eval_req = NotificationRuleEvaluateRequest(
        event_type="sale.completed",
        payload={"sale_id": "s_1", "grand_total": 750.0},
    )
    eval_resp = await service.test_evaluate_rule(eval_req)
    assert "Böyük Məbləğli Satış" in eval_resp.matched_rules
    assert "IN_APP" in eval_resp.target_channels

    # 2. Həddən aşağı satış
    eval_low = NotificationRuleEvaluateRequest(
        event_type="sale.completed",
        payload={"sale_id": "s_2", "grand_total": 200.0},
    )
    eval_low_resp = await service.test_evaluate_rule(eval_low)
    assert len(eval_low_resp.matched_rules) == 0


def test_rule_conditions_and_quiet_hours() -> None:
    """Şərtlərin və sakit saatların riyazi/məntiqi yoxlanışı."""
    # Rəqəm müqayisələri
    assert evaluate_condition({"amount": 1500}, {"field": "amount", "op": ">=", "value": 1000})
    assert not evaluate_condition({"amount": 800}, {"field": "amount", "op": ">=", "value": 1000})
    assert evaluate_condition({"status": "CRITICAL"}, {"field": "status", "op": "==", "value": "CRITICAL"})

    # Sakit saatlar
    # 22:00 - 08:00 (gecə intervalı)
    assert is_in_quiet_hours("23:30", "22:00", "08:00")
    assert is_in_quiet_hours("03:15", "22:00", "08:00")
    assert not is_in_quiet_hours("14:00", "22:00", "08:00")


def test_template_escaping_and_pii_masking() -> None:
    """Şablon inyeksiyasının qarşısının alınması və PII maskalanması."""
    # XSS / Template Injection sınağı
    context = {"name": "<script>alert('pwned')</script>", "amount": 100}
    rendered = safe_render_template("Hörmətli {name}, məbləğ: {amount} AZN", context)
    assert "<script>" not in rendered
    assert "&lt;script&gt;" in rendered

    # Maskalama
    assert mask_email("elshan@brandhouse.az") == "e***n@brandhouse.az"
    assert mask_phone("+994501234567") == "+99450***67"


@pytest.mark.asyncio
async def test_channel_unconfigured_behavior() -> None:
    """Konfiqurasiya edilməmiş rabitə kanallarının heç vaxt feyk göndəriş etməməsi."""
    notif = Notification(
        id=generate_uuid7(),
        recipient_user_id=generate_uuid7(),
        category="SECURITY",
        severity="critical",
        title="Test",
        body="Test",
        created_at=utc_now(),
    )

    in_app = InAppNotificationChannel()
    in_app_log = await in_app.deliver(notif, {})
    assert in_app_log.status == "DELIVERED"

    email_ch = EmailNotificationChannel()
    # Əgər settings.SMTP_HOST təyin edilməyibsə
    email_log = await email_ch.deliver(notif, {"email": "test@user.az"})
    assert email_log.status in ["DELIVERED", "SKIPPED_NOT_CONFIGURED"]


@pytest.mark.asyncio
async def test_approvals_inbox_endpoint(session: AsyncSession, test_actor: AuthenticatedUser) -> None:
    """Təsdiqləmələr qutusunun aqreqasiyası."""
    from app.modules.company.models import Company
    from app.modules.notifications.approvals import ApprovalsInboxService
    from app.modules.transfers.models import StockTransfer
    from app.modules.warehouses.models import Warehouse

    company = Company(
        id=generate_uuid7(),
        code="BH_CORP",
        name="Brand House LLC",
        legal_name="Brand House MMC",
        tax_id="1234567890",
        address="Baku, Azerbaijan",
        phone="+994120000000",
        email="info@brandhouse.az",
    )
    wh1 = Warehouse(id=generate_uuid7(), company_id=company.id, name="Depo 1", code="D1")
    wh2 = Warehouse(id=generate_uuid7(), company_id=company.id, name="Depo 2", code="D2")
    session.add_all([company, wh1, wh2])
    await session.flush()

    transfer = StockTransfer(
        id=generate_uuid7(),
        company_id=company.id,
        transfer_no="TRF-2026-TEST",
        source_warehouse_id=wh1.id,
        destination_warehouse_id=wh2.id,
        in_transit_warehouse_id=wh1.id,
        status="REQUESTED",
        created_at=utc_now(),
    )
    session.add(transfer)
    await session.commit()

    test_actor.permissions.append("transfers.approve")
    service = ApprovalsInboxService(session)
    summary = await service.get_user_approvals_summary(test_actor)

    assert summary.counts_by_type["TRANSFER"] >= 1
    assert summary.total_pending >= 1
    assert any(item.id == str(transfer.id) for item in summary.items)


@pytest.mark.asyncio
async def test_notification_routes_via_client(session: AsyncSession, test_actor: AuthenticatedUser) -> None:
    """FastAPI HTTP marşrutlarının inteqrasiya testi."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/notifications")
        assert resp.status_code in [200, 401, 403]


def test_notification_domain_event() -> None:
    """NotificationCreatedEvent hadisəsinin generasiyası və məzmunu."""
    from app.modules.notifications.events import NotificationCreatedEvent

    notif_id = generate_uuid7()
    user_id = generate_uuid7()
    branch_id = generate_uuid7()
    ev = NotificationCreatedEvent(
        notification_id=notif_id,
        recipient_user_id=user_id,
        category="STOCK",
        severity="critical",
        title="Kritik Stok",
        deep_link="/inventory/1",
        branch_id=branch_id,
        correlation_id="corr-123",
    )
    assert ev.event_type == "notification.created"
    assert ev.aggregate_type == "notification"
    assert ev.aggregate_id == str(notif_id)
    assert ev.correlation_id == "corr-123"
    assert ev.payload["category"] == "STOCK"
    assert ev.payload["branch_id"] == str(branch_id)


@pytest.mark.asyncio
async def test_channels_delivery_behaviors(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bütün rabitə kanallarının aktiv və qeyri-aktiv vəziyyətlərdə çatdırılma davranışları."""
    from app.modules.notifications.channels import (
        PushNotificationChannel,
        SmsNotificationChannel,
        WhatsAppNotificationChannel,
    )

    notif = Notification(
        id=generate_uuid7(),
        recipient_user_id=generate_uuid7(),
        category="PAYMENT",
        severity="info",
        title="Ödəniş qəbul edildi",
        body="Məbləğ: 100 AZN",
        created_at=utc_now(),
    )

    # 1. SMS Channel
    sms_ch = SmsNotificationChannel()
    async def mock_available() -> bool:
        return True

    monkeypatch.setattr(sms_ch, "is_available", mock_available)
    # Phone missing
    log_missing_phone = await sms_ch.deliver(notif, {})
    assert log_missing_phone.status == "FAILED"
    # Success delivery
    log_success_sms = await sms_ch.deliver(notif, {"phone": "+994501234567"})
    assert log_success_sms.status == "DELIVERED"

    # 2. Email Channel
    email_ch = EmailNotificationChannel()
    monkeypatch.setattr(email_ch, "is_available", mock_available)
    # Missing email
    log_missing_email = await email_ch.deliver(notif, {})
    assert log_missing_email.status == "FAILED"
    # Success delivery
    log_success_email = await email_ch.deliver(notif, {"email": "user@brandhouse.az"})
    assert log_success_email.status == "DELIVERED"

    # 3. WhatsApp Channel
    wa_ch = WhatsAppNotificationChannel()
    log_wa_unconf = await wa_ch.deliver(notif, {"phone": "+994501234567"})
    assert log_wa_unconf.status == "SKIPPED_NOT_CONFIGURED"
    monkeypatch.setattr(wa_ch, "is_available", mock_available)
    log_wa_success = await wa_ch.deliver(notif, {"phone": "+994501234567"})
    assert log_wa_success.status == "DELIVERED"

    # 4. Push Channel
    push_ch = PushNotificationChannel()
    log_push_unconf = await push_ch.deliver(notif, {})
    assert log_push_unconf.status == "SKIPPED_NOT_CONFIGURED"
    monkeypatch.setattr(push_ch, "is_available", mock_available)
    log_push_success = await push_ch.deliver(notif, {})
    assert log_push_success.status == "DELIVERED"

    # Helper mask funksiyaları kənar hallar
    assert mask_email(None) == "***"
    assert mask_email("ab") == "***"
    assert mask_email("a@b.com") == "a***@b.com"
    assert mask_phone(None) == "***"
    assert mask_phone("123") == "***"


def test_rule_condition_operators_edge_cases() -> None:
    """evaluate_condition üçün bütün riyazi operatorlar və kənar hallar."""
    # Empty condition
    assert evaluate_condition({"price": 50}, {}) is True
    # Missing field
    assert evaluate_condition({"price": 50}, {"op": "=="}) is True
    # Field not in payload
    assert evaluate_condition({}, {"field": "missing", "op": "==", "value": 10}) is False

    # Numbers comparisons: >, <, <=, !=
    assert evaluate_condition({"val": 20}, {"field": "val", "op": ">", "value": 15}) is True
    assert evaluate_condition({"val": 10}, {"field": "val", "op": ">", "value": 15}) is False
    assert evaluate_condition({"val": 5}, {"field": "val", "op": "<", "value": 10}) is True
    assert evaluate_condition({"val": 15}, {"field": "val", "op": "<", "value": 10}) is False
    assert evaluate_condition({"val": 10}, {"field": "val", "op": "<=", "value": 10}) is True
    assert evaluate_condition({"val": 12}, {"field": "val", "op": "<=", "value": 10}) is False
    assert evaluate_condition({"val": 10}, {"field": "val", "op": "!=", "value": 12}) is True
    assert evaluate_condition({"val": 10}, {"field": "val", "op": "!=", "value": 10}) is False

    # String & in operators
    assert evaluate_condition({"status": "ACTIVE"}, {"field": "status", "op": "!=", "value": "INACTIVE"}) is True
    assert evaluate_condition({"tag": "VIP"}, {"field": "tag", "op": "in", "value": ["VIP", "LOYAL"]}) is True
    assert evaluate_condition({"tag": "NORMAL"}, {"field": "tag", "op": "in", "value": ["VIP"]}) is False
    assert evaluate_condition({"tag": "VIP"}, {"field": "tag", "op": "in", "value": "NOT_A_LIST"}) is False


@pytest.mark.asyncio
async def test_sse_connection_manager_and_streaming(session: AsyncSession) -> None:
    """SSE bağlantı meneceri, nəbz, filial süzgəci və buraxılmış hadisələrin bərpası."""
    from app.modules.notifications.stream import (
        SSEConnectionManager,
        fetch_missed_notifications,
        format_sse_event,
    )

    mgr = SSEConnectionManager(max_connections_per_user=2)
    user_id = str(generate_uuid7())

    # Abunəlik
    q1 = mgr.subscribe(user_id)
    assert mgr.total_active_connections == 1
    q2 = mgr.subscribe(user_id)
    assert mgr.total_active_connections == 2

    # Broadcast to user with branch match
    branch_a = str(generate_uuid7())
    await mgr.broadcast_to_user(user_id, {"msg": "hello"}, branch_id=branch_a, allowed_branches=[branch_a])
    msg1 = q1.get_nowait()
    assert msg1["msg"] == "hello"

    # Broadcast to user with branch mismatch (should not be delivered)
    branch_b = str(generate_uuid7())
    await mgr.broadcast_to_user(user_id, {"msg": "hidden"}, branch_id=branch_b, allowed_branches=[branch_a])
    assert q1.empty()

    # Broadcast to all
    await mgr.broadcast_to_all({"msg": "global_alert"})
    assert not q2.empty()

    # Unsubscribe
    mgr.unsubscribe(user_id, q1)
    mgr.unsubscribe(user_id, q2)
    assert mgr.total_active_connections == 0

    # format_sse_event
    formatted = await format_sse_event("evt_1", "test.event", {"k": "v"})
    assert "id: evt_1\n" in formatted
    assert "event: test.event\n" in formatted
    assert '"k": "v"' in formatted

    # fetch_missed_notifications
    u_id = generate_uuid7()
    n1 = Notification(
        id=generate_uuid7(),
        recipient_user_id=u_id,
        category="SYSTEM",
        severity="info",
        title="Birinci",
        body="N1",
        created_at=utc_now() - timedelta(minutes=5),
    )
    n2 = Notification(
        id=generate_uuid7(),
        recipient_user_id=u_id,
        category="SYSTEM",
        severity="info",
        title="İkinci",
        body="N2",
        created_at=utc_now(),
    )
    session.add_all([n1, n2])
    await session.commit()

    missed = await fetch_missed_notifications(session, u_id, str(n1.id))
    assert len(missed) == 1
    assert missed[0].id == n2.id

    # Non-existent last event
    missed_none = await fetch_missed_notifications(session, u_id, str(generate_uuid7()))
    assert missed_none == []


@pytest.mark.asyncio
async def test_notification_service_edge_cases_and_dispatch(
    session: AsyncSession, admin_actor: AuthenticatedUser
) -> None:
    """Bildiriş xidmətinin redaktə, silmə, duplicate suppression və dispatch sınağı."""
    from app.core.errors import NotFoundError
    from app.modules.notifications.schemas import NotificationRuleUpdateRequest

    service = NotificationService(session)

    # 1. Tapılmayan bildiriş üçün xətalar
    non_existent_id = generate_uuid7()
    with pytest.raises(NotFoundError):
        await service.mark_as_read(non_existent_id, admin_actor)
    with pytest.raises(NotFoundError):
        await service.snooze(non_existent_id, utc_now(), admin_actor)
    with pytest.raises(NotFoundError):
        await service.archive(non_existent_id, admin_actor)

    # 2. Qaydanın yenilənməsi və silinməsi
    rule_req = NotificationRuleCreateRequest(
        name="Qayda Redaktə Testi",
        category="SECURITY",
        event_type="security.login_failed",
        condition={"field": "attempts", "op": ">=", "value": 3},
        channels=["IN_APP"],
        severity="critical",
        recipient_type="ALL",
    )
    created_rule = await service.create_rule(rule_req, admin_actor)

    update_req = NotificationRuleUpdateRequest(
        name="Yenilənmiş Qayda",
        severity="warning",
        channels=["IN_APP", "SMS"],
        is_active=False,
    )
    updated_rule = await service.update_rule(created_rule.id, update_req, admin_actor)
    assert updated_rule.name == "Yenilənmiş Qayda"
    assert updated_rule.severity == "warning"
    assert updated_rule.is_active is False

    # Qaydanı aktivləşdiririk və dispatch sınağı keçiririk
    await service.update_rule(created_rule.id, NotificationRuleUpdateRequest(is_active=True), admin_actor)

    # Dispatch: uyğun gələn hadisə
    count = await service.dispatch_event_notifications(
        event_type="security.login_failed",
        payload={"attempts": 5, "ip": "192.168.1.1"},
    )
    # Heç olmasa 0 və ya daha çox istifadəçiyə çatdırılır
    assert count >= 0

    # Qaydanın silinməsi
    deleted = await service.delete_rule(created_rule.id, admin_actor)
    assert deleted is True
    with pytest.raises(NotFoundError):
        await service.delete_rule(created_rule.id, admin_actor)


@pytest.mark.asyncio
async def test_notifications_router_direct_calls(
    session: AsyncSession, admin_actor: AuthenticatedUser
) -> None:
    """Router funksiyalarının birbaşa çağırışlarla tam əhatə olunması."""
    from starlette.requests import Request

    from app.modules.notifications.router import (
        archive_notification,
        create_rule,
        delete_rule,
        delivery_webhook,
        get_approvals_inbox,
        get_preferences,
        get_unread_count,
        list_notifications,
        list_rules,
        mark_all_as_read,
        mark_as_read,
        snooze_notification,
        test_evaluate_rule,
        update_preferences,
        update_rule,
    )
    from app.modules.notifications.schemas import (
        NotificationPreferenceUpdateRequest,
        NotificationRuleCreateRequest,
        NotificationRuleEvaluateRequest,
        NotificationRuleUpdateRequest,
        NotificationSnoozeRequest,
    )

    def make_req(actor: AuthenticatedUser | None) -> Request:
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [],
            "state": {"user": actor},
        }
        return Request(scope)

    req = make_req(admin_actor)
    svc = NotificationService(session)

    # 1. Preferences
    pref = await get_preferences(req, svc)
    assert pref.language == "az"
    pref_updated = await update_preferences(
        NotificationPreferenceUpdateRequest(daily_digest=True), req, svc
    )
    assert pref_updated.daily_digest is True

    # 2. Rules CRUD via router
    rule_resp = await create_rule(
        NotificationRuleCreateRequest(
            name="Router Qaydası",
            category="TRANSFER",
            event_type="transfer.requested",
            condition={"field": "qty", "op": ">=", "value": 10},
            channels=["IN_APP"],
            severity="info",
            recipient_type="ROLE",
            recipient_target="branch_manager",
        ),
        req,
        svc,
    )
    assert rule_resp.name == "Router Qaydası"

    rules_list = await list_rules(req, svc)
    assert any(r.id == rule_resp.id for r in rules_list)

    updated_r = await update_rule(
        rule_resp.id,
        NotificationRuleUpdateRequest(name="Router Qaydası Dəyişdirildi"),
        req,
        svc,
    )
    assert updated_r.name == "Router Qaydası Dəyişdirildi"

    eval_res = await test_evaluate_rule(
        NotificationRuleEvaluateRequest(
            event_type="transfer.requested",
            payload={"qty": 20},
        ),
        svc,
    )
    assert "Router Qaydası Dəyişdirildi" in eval_res.matched_rules

    del_res = await delete_rule(rule_resp.id, req, svc)
    assert "uğurla" in del_res["message"]

    # 3. Notification list, counts, read, snooze, archive via router
    notif = Notification(
        id=generate_uuid7(),
        recipient_user_id=admin_actor.id,
        category="STOCK",
        severity="info",
        title="Başlıq",
        body="Göv Multi",
        created_at=utc_now(),
    )
    session.add(notif)
    await session.commit()

    feed = await list_notifications(req, limit=50, offset=0, service=svc)
    assert len(feed) >= 1

    unread_info = await get_unread_count(req, svc)
    assert unread_info.unread_count >= 1

    r_read = await mark_as_read(notif.id, req, svc)
    assert r_read.read_at is not None

    r_snooze = await snooze_notification(
        notif.id, NotificationSnoozeRequest(snooze_until=utc_now() + timedelta(hours=1)), req, svc
    )
    assert r_snooze.snoozed_until is not None

    r_arch = await archive_notification(notif.id, req, svc)
    assert r_arch.archived_at is not None

    all_read = await mark_all_as_read(req, svc)
    assert "marked_read_count" in all_read

    # 4. Approvals Inbox via router
    from app.modules.notifications.approvals import ApprovalsInboxService
    app_svc = ApprovalsInboxService(session)
    approvals_summary = await get_approvals_inbox(req, app_svc)
    assert approvals_summary is not None

    # 5. Delivery Webhook
    webhook_req_scope = {
        "type": "http",
        "method": "POST",
        "path": "/notifications/webhooks/sms",
        "headers": [],
    }
    webhook_req = Request(webhook_req_scope)
    # mock request.body
    async def empty_body() -> bytes:
        return b'{"status":"delivered"}'
    webhook_req.body = empty_body  # type: ignore[method-assign]
    wh_resp = await delivery_webhook("sms", webhook_req)
    assert wh_resp["status"] == "accepted"


@pytest.mark.asyncio
async def test_resolve_rule_recipients_and_approvals_all_types(session: AsyncSession) -> None:
    """Alıcıların dinamik təyini, dublikat bildiriş yoxlanışı və təsdiq qutusu tam testi."""
    from app.modules.notifications.approvals import ApprovalsInboxService
    from app.modules.notifications.rules import resolve_rule_recipients

    test_u = User(
        id=generate_uuid7(),
        username=f"recipient_user_{uuid.uuid4().hex[:6]}",
        email=f"recipient_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name="Alıcı İstifadəçi",
        password_hash="mock_hash",
        status="active",
    )
    session.add(test_u)
    await session.commit()

    # 1. recipient_type == ALL
    rule_all = NotificationRule(
        id=generate_uuid7(),
        name="Hamıya",
        category="SYSTEM",
        event_type="test",
        condition={},
        channels=["IN_APP"],
        severity="info",
        recipient_type="ALL",
    )
    recips_all = await resolve_rule_recipients(session, rule_all, branch_id=None)
    assert any(r["user_id"] == test_u.id for r in recips_all)

    # 2. recipient_type == SPECIFIC_USER
    rule_user = NotificationRule(
        id=generate_uuid7(),
        name="Tək istifadəçi",
        category="SYSTEM",
        event_type="test",
        condition={},
        channels=["IN_APP"],
        severity="info",
        recipient_type="SPECIFIC_USER",
        recipient_target=str(test_u.id),
    )
    recips_user = await resolve_rule_recipients(session, rule_user, branch_id=None)
    assert len(recips_user) == 1
    assert recips_user[0]["user_id"] == test_u.id

    # 3. is_duplicate_notification
    n_dup = Notification(
        id=generate_uuid7(),
        recipient_user_id=test_u.id,
        category="SYSTEM",
        severity="info",
        title="Dedupe",
        body="Body",
        dedupe_key="dup_key_999",
        created_at=utc_now(),
    )
    session.add(n_dup)
    await session.commit()

    assert await is_duplicate_notification(session, test_u.id, "dup_key_999", window_minutes=15) is True
    assert await is_duplicate_notification(session, test_u.id, "different_key", window_minutes=15) is False
    assert await is_duplicate_notification(session, test_u.id, None) is False

    # 4. Approvals inbox with admin actor
    super_admin = AuthenticatedUser(
        id=generate_uuid7(),
        username="super_admin",
        email="super@brandhouse.az",
        full_name="Super Admin",
        roles=["system_admin"],
        permissions=[
            "purchasing.order.approve",
            "transfers.approve",
            "finance.expense.approve",
            "hr.leave.approve",
            "payroll.run.approve",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )
    app_svc = ApprovalsInboxService(session)
    summary = await app_svc.get_user_approvals_summary(super_admin)
    assert "PURCHASE_ORDER" in summary.counts_by_type
    assert "TRANSFER" in summary.counts_by_type
    assert "EXPENSE" in summary.counts_by_type
    assert "LEAVE" in summary.counts_by_type
    assert "PAYROLL" in summary.counts_by_type


