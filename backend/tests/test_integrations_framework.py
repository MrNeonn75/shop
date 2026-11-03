"""Kənar İnteqrasiyalar Çərçivəsi Vahid və İnteqrasiya Testləri (Integrations Tests)."""

from __future__ import annotations

import time
from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.main import app
from app.modules.auth.policies import AuthenticatedUser
from app.modules.integrations.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError
from app.modules.integrations.ports.fiscal import UnconfiguredFiscalService
from app.modules.integrations.ports.legacy import BrendhouseLegacyAdapter
from app.modules.integrations.schemas import IntegrationUpdateRequest
from app.modules.integrations.secrets import (
    decrypt_integration_secrets,
    encrypt_integration_secrets,
    generate_masked_display,
    rotate_secrets_ciphertext,
)
from app.modules.integrations.service import IntegrationService
from app.modules.integrations.sync import SyncRunner
from app.modules.integrations.webhooks import verify_webhook_signature


@pytest.fixture
def admin_actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="admin@brandhouse.az",
        full_name="Sistem Administratoru",
        roles=["system_admin"],
        permissions=["system.branches.all", "integrations.configure", "integrations.test"],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


@pytest.mark.asyncio
async def test_integrations_status_and_unconfigured_behavior(admin_actor: AuthenticatedUser) -> None:
    """Konfiqurasiya edilməmiş xidmətlərin NOT_CONFIGURED qaytarması və heç vaxt feyk ACTIVE olmaması."""
    service = IntegrationService()
    items = await service.list_integrations(actor=admin_actor)
    assert len(items) >= 8

    # Payment provider üçün test-connection
    test_res = await service.test_connection(key="payment_provider", actor=admin_actor)
    assert test_res.status == "NOT_CONFIGURED"
    assert test_res.success is False


@pytest.mark.asyncio
async def test_secrets_envelope_encryption_and_rotation(admin_actor: AuthenticatedUser) -> None:
    """Zərf şifrələnməsi (Envelope Encryption), maskalanma və açarların rotasiyası."""
    secrets = {"api_key": "live_secret_key_998877", "merchant_id": "M12345"}

    # Şifrələmə
    encrypted = encrypt_integration_secrets(secrets)
    assert encrypted != str(secrets)

    # Deşifrələmə
    decrypted = decrypt_integration_secrets(encrypted)
    assert decrypted["api_key"] == "live_secret_key_998877"

    # Maskalama
    masked = generate_masked_display(secrets)
    assert "8877" in masked
    assert "live_secret_key" not in masked

    # Rotasiya
    rotated = rotate_secrets_ciphertext(encrypted)
    assert rotated is not None

    # Service vasitəsilə açar yeniləməsi və rotasiya testi
    service = IntegrationService()
    update_req = IntegrationUpdateRequest(
        secrets=secrets,
        version=1,
    )
    resp = await service.update_integration(key="sms", data=update_req, actor=admin_actor)
    assert resp.masked_display is not None
    assert "8877" in resp.masked_display

    rot_resp = await service.rotate_secrets(key="sms", actor=admin_actor)
    assert rot_resp.rotated is True


def test_circuit_breaker_state_transitions() -> None:
    """Circuit Breaker vəziyyət keçidləri: CLOSED -> 5 xəta -> OPEN -> HALF_OPEN -> CLOSED."""
    cb = CircuitBreaker(failure_threshold=3, recovery_timeout_seconds=2)

    # 1. Başlanğıcda CLOSED vəziyyəti
    state = cb.check_can_execute("CLOSED", failure_count=0, last_failure_at=None)
    assert state == "CLOSED"

    # 2. Xətaların qeydə alınması
    state1, count1, _ = cb.record_failure(0)
    assert count1 == 1
    assert state1 == "CLOSED"

    state2, count2, _ = cb.record_failure(1)
    assert count2 == 2
    assert state2 == "CLOSED"

    # Hədd aşılır -> OPEN
    state3, count3, fail_time = cb.record_failure(2)
    assert count3 == 3
    assert state3 == "OPEN"

    # 3. OPEN olduqda çağırış dərhal rədd edilir
    with pytest.raises(CircuitBreakerOpenError):
        cb.check_can_execute("OPEN", failure_count=3, last_failure_at=fail_time)

    # 4. Soyuma müddəti keçdikdən sonra HALF_OPEN olur
    old_fail_time = utc_now() - timedelta(seconds=5)
    half_state = cb.check_can_execute("OPEN", failure_count=3, last_failure_at=old_fail_time)
    assert half_state == "HALF_OPEN"

    # 5. Uğur qeydə alındıqda yenidən CLOSED-a qayıdır
    reset_state, reset_count = cb.record_success()
    assert reset_state == "CLOSED"
    assert reset_count == 0


def test_webhook_hmac_signature_and_replay_defense() -> None:
    """Vebhuk HMAC imza doğrulanması və zaman pəncərəsi yoxlanışı."""
    payload = b'{"event":"sms.delivered","message_id":"123"}'
    secret = "webhook_secret_key_abc"

    import hashlib
    import hmac

    # Düzgün imza generasiyası
    valid_sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    # Düzgün imzanın təsdiqi
    assert verify_webhook_signature(payload, valid_sig, secret)

    # Səhv imza
    assert not verify_webhook_signature(payload, "wrong_signature", secret)

    # Vaxt damğası ilə təkrar hücum (Replay) sınağı
    now_ts = str(time.time())
    ts_payload = f"{now_ts}.".encode() + payload
    ts_sig = hmac.new(secret.encode("utf-8"), ts_payload, hashlib.sha256).hexdigest()

    assert verify_webhook_signature(payload, ts_sig, secret, timestamp_header=now_ts, tolerance_seconds=300)

    # 10 dəqiqə köhnə zaman damğası rədd edilməlidir
    old_ts = str(time.time() - 600)
    assert not verify_webhook_signature(payload, ts_sig, secret, timestamp_header=old_ts, tolerance_seconds=300)


@pytest.mark.asyncio
async def test_sync_runner_and_external_refs(session: AsyncSession, admin_actor: AuthenticatedUser) -> None:
    """Sinxronizasiya mühərrikinin yalnız ACTIVE inteqrasiyalarla işləməsi və ExternalRef xəritələnməsi."""
    runner = SyncRunner(session)

    # 1. NOT_CONFIGURED inteqrasiya ilə sinxronizasiya cəhdi xəta verməlidir
    with pytest.raises(RuntimeError) as exc:
        await runner.execute_sync("brendhouse_legacy_api", is_dry_run=True)
    assert "aktiv deyil" in str(exc.value)

    # 2. Xarici referans xəritələnməsi
    mapping = await runner.link_external_ref(
        system="brendhouse_legacy",
        entity_type="product",
        internal_id="p_uuid_100",
        external_id="legacy_id_55",
    )
    assert mapping.internal_id == "p_uuid_100"
    assert mapping.external_id == "legacy_id_55"

    # Əks axtarış
    resolved = await runner.resolve_internal_id("brendhouse_legacy", "product", "legacy_id_55")
    assert resolved == "p_uuid_100"


@pytest.mark.asyncio
async def test_ports_default_behavior() -> None:
    """Defolt port adapterlərinin etibarlı davranışı."""
    fiscal = UnconfiguredFiscalService()
    fiscal_res = await fiscal.print_fiscal_receipt({})
    assert fiscal_res["status"] == "NOT_CONFIGURED"

    legacy = BrendhouseLegacyAdapter(is_active=False)
    with pytest.raises(RuntimeError):
        await legacy.fetch_legacy_catalog()


@pytest.mark.asyncio
async def test_health_details_contains_outbox_and_notifications() -> None:
    """GET /health/details endpoint-ində outbox və bildiriş metrikalarının olması."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health/details")
        assert resp.status_code == 200
        data = resp.json()
        assert "queue" in data
        assert "pending_outbox_events" in data["queue"]
        assert "dead_letter_count" in data["queue"]
        assert "oldest_lag_seconds" in data["queue"]
        assert "notifications" in data
        assert "unread_queue_depth" in data["notifications"]
        assert "integrations" in data


@pytest.mark.asyncio
async def test_all_ports_interfaces_and_adapters() -> None:
    """Bütün kənar portların mücərrəd interfeysləri və adapter metodlarının icrası."""
    from decimal import Decimal

    from app.modules.integrations.ports import (
        AccountingPort,
        AttendanceDevicePort,
        EmailProviderPort,
        PaymentGatewayPort,
        PrinterServicePort,
        SmsProviderPort,
        WhatsAppProviderPort,
    )

    # 1. Concrete implementations to verify port contracts
    class DummyAccounting(AccountingPort):
        async def sync_journal_entry(self, entry_data: dict) -> dict:
            return {"synced": True}
        async def verify_connection(self) -> bool:
            return True

    acc = DummyAccounting()
    assert (await acc.sync_journal_entry({}))["synced"] is True
    assert (await acc.verify_connection()) is True

    class DummyAttendance(AttendanceDevicePort):
        async def fetch_punch_logs(self, device_ip: str, since=None) -> list:
            return [{"ip": device_ip, "punch": "IN"}]
        async def ping_device(self, device_ip: str) -> bool:
            return True

    att = DummyAttendance()
    assert len(await att.fetch_punch_logs("192.168.1.100")) == 1
    assert (await att.ping_device("192.168.1.100")) is True

    class DummyPayment(PaymentGatewayPort):
        async def authorize(self, amount: Decimal, currency: str, order_id: str, card_token=None) -> dict:
            return {"authorized": True}
        async def capture(self, transaction_id: str, amount: Decimal) -> dict:
            return {"captured": True}
        async def refund(self, transaction_id: str, amount: Decimal, reason=None) -> dict:
            return {"refunded": True}
        async def void(self, transaction_id: str) -> dict:
            return {"voided": True}
        async def verify_credentials(self) -> bool:
            return True

    pay = DummyPayment()
    assert (await pay.authorize(Decimal("10.00"), "AZN", "ord-1"))["authorized"] is True
    assert (await pay.capture("tx-1", Decimal("10.00")))["captured"] is True
    assert (await pay.refund("tx-1", Decimal("5.00")))["refunded"] is True
    assert (await pay.void("tx-1"))["voided"] is True
    assert (await pay.verify_credentials()) is True

    class DummySms(SmsProviderPort):
        async def send_sms(self, to: str, message: str) -> dict:
            return {"sent": True}
        async def check_balance(self) -> dict:
            return {"balance": 100}
        async def verify_credentials(self) -> bool:
            return True

    sms = DummySms()
    assert (await sms.send_sms("+99450", "Salam"))["sent"] is True
    assert (await sms.check_balance())["balance"] == 100
    assert (await sms.verify_credentials()) is True

    class DummyEmail(EmailProviderPort):
        async def send_email(self, to: str, subject: str, body_html: str) -> dict:
            return {"sent": True}
        async def verify_smtp(self) -> bool:
            return True

    email = DummyEmail()
    assert (await email.send_email("a@b.az", "Mövzu", "<p>HTML</p>"))["sent"] is True
    assert (await email.verify_smtp()) is True

    class DummyWhatsApp(WhatsAppProviderPort):
        async def send_template(self, to: str, template_name: str, parameters: dict) -> dict:
            return {"sent": True}
        async def verify_credentials(self) -> bool:
            return True

    wa = DummyWhatsApp()
    assert (await wa.send_template("+99450", "tpl_1", {}))["sent"] is True
    assert (await wa.verify_credentials()) is True

    class DummyPrinter(PrinterServicePort):
        async def print_raw(self, printer_ip: str, port: int, payload: bytes) -> bool:
            return True
        async def check_printer_status(self, printer_ip: str, port: int) -> dict:
            return {"online": True}

    pr = DummyPrinter()
    assert (await pr.print_raw("192.168.1.50", 9100, b"raw")) is True
    assert (await pr.check_printer_status("192.168.1.50", 9100))["online"] is True

    # 2. Fiscal Service Unconfigured methods
    fisc = UnconfiguredFiscalService()
    assert (await fisc.print_fiscal_receipt({}))["status"] == "NOT_CONFIGURED"
    assert (await fisc.generate_e_receipt({}))["status"] == "NOT_CONFIGURED"
    assert (await fisc.get_fiscal_status())["status"] == "NOT_CONFIGURED"

    # 3. Legacy adapter active methods
    legacy_act = BrendhouseLegacyAdapter(is_active=True)
    cat = await legacy_act.fetch_legacy_catalog()
    assert isinstance(cat, list)
    custs = await legacy_act.fetch_legacy_customers()
    assert isinstance(custs, list)
    stock_up = await legacy_act.sync_stock_levels([{"sku": "LEG_SKU", "qty": 50}])
    assert stock_up["status"] == "SUCCESS"
    assert stock_up["synced_count"] == 1

    legacy_inact = BrendhouseLegacyAdapter(is_active=False)
    stock_inact = await legacy_inact.sync_stock_levels([])
    assert stock_inact["status"] == "NOT_CONFIGURED"


def test_redact_payload_helper() -> None:
    """redact_payload məxfi sahələri (secret, password, key, pin, token) maskalaması."""
    from app.modules.integrations.service import redact_payload

    data = {
        "user_id": 123,
        "api_key": "supersecret123",
        "auth_token": "bearer xyz",
        "card_pin": "9999",
        "nested": {
            "password_hash": "argon2id",
            "normal_field": "visible",
            "items": [{"secret_code": "code", "label": "test"}],
        },
    }
    redacted = redact_payload(data)
    assert redacted["api_key"] == "[REDACTED]"
    assert redacted["auth_token"] == "[REDACTED]"
    assert redacted["card_pin"] == "[REDACTED]"
    assert redacted["nested"]["password_hash"] == "[REDACTED]"
    assert redacted["nested"]["normal_field"] == "visible"
    assert redacted["nested"]["items"][0]["secret_code"] == "[REDACTED]"
    assert redacted["nested"]["items"][0]["label"] == "test"


@pytest.mark.asyncio
async def test_integrations_service_comprehensive(
    session: AsyncSession, admin_actor: AuthenticatedUser
) -> None:
    """IntegrationService metodlarının tam əhatə testi."""
    from app.core.errors import NotFoundError
    from app.modules.integrations.service import get_integration_service

    svc = get_integration_service()
    assert svc is not None

    # 1. get_integration
    item = await svc.get_integration("payment_provider", actor=admin_actor)
    assert item.key == "payment_provider"
    with pytest.raises(NotFoundError):
        await svc.get_integration("non_existent_key", actor=admin_actor)

    # 2. test_connection with mock_error
    update_req = IntegrationUpdateRequest(
        secrets={"api_key": "some_key", "mock_error": "Connection refused by host"},
        version=item.version,
    )
    await svc.update_integration("payment_provider", update_req, actor=admin_actor)
    test_fail = await svc.test_connection("payment_provider", actor=admin_actor)
    assert test_fail.status == "ERROR"
    assert test_fail.success is False
    assert "refused" in test_fail.message

    # test_connection with success
    item_updated = await svc.get_integration("payment_provider", actor=admin_actor)
    update_ok = IntegrationUpdateRequest(
        secrets={"api_key": "valid_key", "merchant_id": "M_123"},
        version=item_updated.version,
    )
    await svc.update_integration("payment_provider", update_ok, actor=admin_actor)
    test_ok = await svc.test_connection("payment_provider", actor=admin_actor)
    assert test_ok.status == "ACTIVE"
    assert test_ok.success is True

    # 3. list_logs
    logs = await svc.list_logs("payment_provider", limit=10, actor=admin_actor)
    assert len(logs) >= 1

    # 4. sync_runs and trigger_sync on ACTIVE integration
    # Yuxarıda payment_provider artıq ACTIVE status aldı
    sync_run = await svc.trigger_sync("payment_provider", direction="IMPORT", is_dry_run=True, actor=admin_actor)
    assert sync_run.integration_key == "payment_provider"
    assert sync_run.status in ["SUCCESS", "FAILED"]

    sync_list = await svc.list_sync_runs("payment_provider", limit=10, actor=admin_actor)
    assert len(sync_list) >= 1

    # 5. dead-letter operations
    admin_actor.permissions.extend(["events.deadletter.manage", "events.replay"])
    dead_list = await svc.list_dead_letters(limit=10, actor=admin_actor)
    assert isinstance(dead_list, list)

    bulk_count = await svc.bulk_replay(actor=admin_actor)
    assert bulk_count >= 0


@pytest.mark.asyncio
async def test_integrations_router_direct_calls(admin_actor: AuthenticatedUser) -> None:
    """Router marşrutlarının birbaşa çağırışlarla tam əhatə olunması."""
    from starlette.requests import Request

    from app.modules.integrations.router import (
        bulk_replay_dead_letters,
        get_all_integrations_status,
        get_integration,
        list_dead_letters,
        list_integration_logs,
        list_integrations,
        list_sync_runs,
        rotate_secrets,
        test_connection,
        update_integration,
    )
    from app.modules.integrations.schemas import BulkReplayRequest
    from app.modules.integrations.service import get_integration_service

    svc = get_integration_service()

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

    # 1. list_integrations & status
    items = await list_integrations(req, svc)
    assert len(items) >= 8
    all_status = await get_all_integrations_status()
    assert all_status is not None

    # 2. get_integration & update_integration
    item = await get_integration("sms", req, svc)
    assert item.key == "sms"

    up_resp = await update_integration(
        "sms",
        IntegrationUpdateRequest(name="SMS Xidməti (Azercell)", version=item.version),
        req,
        svc,
    )
    assert up_resp.name == "SMS Xidməti (Azercell)"

    # 3. rotate-secrets & test-connection
    rot = await rotate_secrets("sms", req, svc)
    assert rot.key == "sms"

    test_c = await test_connection("sms", req, svc)
    assert test_c.key == "sms"

    # 4. logs
    logs = await list_integration_logs("sms", req, svc, limit=50)
    assert isinstance(logs, list)

    # 5. sync-runs
    sync_runs = await list_sync_runs("sms", req, service=svc, limit=20)
    assert isinstance(sync_runs, list)

    # 6. dead-letter router endpoints
    dead_items = await list_dead_letters(req, service=svc, limit=50, offset=0)
    assert isinstance(dead_items, list)

    bulk_res = await bulk_replay_dead_letters(BulkReplayRequest(), req, svc)
    assert "replayed_count" in bulk_res

