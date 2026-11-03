"""Kənar İnteqrasiyalar Reyestri Vahid Testləri (Integrations Unit Tests)."""

from __future__ import annotations

import pytest

from app.core.ids import generate_uuid7
from app.modules.integrations.schemas import IntegrationUpdateRequest
from app.modules.integrations.service import (
    RESERVED_INTEGRATIONS,
    IntegrationService,
    redact_payload,
)


class MockActor:
    def __init__(self, roles: list[str], permissions: list[str] | None = None) -> None:
        self.id = generate_uuid7()
        self.roles = roles
        self.permissions = permissions or []


@pytest.mark.asyncio
async def test_integrations_reserved_keys_exist() -> None:
    service = IntegrationService()
    admin = MockActor(roles=["system_admin"])

    items = await service.list_integrations(actor=admin)
    existing_keys = {item.key for item in items}

    for expected_key in RESERVED_INTEGRATIONS:
        assert expected_key in existing_keys


@pytest.mark.asyncio
async def test_integration_never_reports_active_without_verification() -> None:
    service = IntegrationService()
    admin = MockActor(roles=["system_admin"])

    key = "sms"
    item = await service.get_integration(key, actor=admin)
    # Konfiqurasiya edilməyibsə və ya yeni yaranıbsa status NOT_CONFIGURED olmalıdır
    assert item.status == "NOT_CONFIGURED"

    # Test connection çağırırıq: konfiqurasiya yoxdursa yan təsirsiz NOT_CONFIGURED qaytarmalıdır
    test_res = await service.test_connection(key, actor=admin)
    assert test_res.status == "NOT_CONFIGURED"
    assert test_res.success is False

    # Status bazada ACTIVE OLMAMALIDIR!
    refreshed = await service.get_integration(key, actor=admin)
    assert refreshed.status == "NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_integration_write_only_secrets_and_verification() -> None:
    service = IntegrationService()
    admin = MockActor(roles=["system_admin"])

    key = "payment_provider"

    # Məxfi açarları təyin edirik (Write-only)
    update_req = IntegrationUpdateRequest(
        name="Pasha Bank POS Gateway",
        secrets={"merchant_id": "MERCH123456", "api_key": "sec_key_xyz_9988"},
        version=1,
    )
    updated = await service.update_integration(key, update_req, actor=admin)

    # API cavabında plaintext məxfi açar OLMAMALIDIR! Yalnız maskalanmış göstərici
    assert (
        hasattr(updated, "encrypted_secrets") is False
        or getattr(updated, "encrypted_secrets", None) is None
    )
    assert updated.masked_display is not None
    assert "••••" in updated.masked_display
    assert "MERCH123456" not in updated.masked_display  # Maskalanıb

    # Hələ test edilmədiyi üçün ACTIVE deyil
    assert updated.status == "NOT_CONFIGURED"

    # Test-connection icra edirik
    test_res = await service.test_connection(key, actor=admin)
    assert test_res.success is True
    assert test_res.status == "ACTIVE"

    # Yoxlanışdan sonra artıq ACTIVE olaraq qeyd edilir
    active_item = await service.get_integration(key, actor=admin)
    assert active_item.status == "ACTIVE"
    assert active_item.last_success_at is not None

    # Əgər xətalı test olarsa status ERROR-a keçməlidir
    await service.update_integration(
        key,
        IntegrationUpdateRequest(
            secrets={"mock_error": "Timeout bağlanışı", "merchant_id": "M1"},
            version=active_item.version,
        ),
        actor=admin,
    )
    fail_res = await service.test_connection(key, actor=admin)
    assert fail_res.success is False
    assert fail_res.status == "ERROR"


@pytest.mark.asyncio
async def test_integration_call_logs_redaction() -> None:
    service = IntegrationService()
    admin = MockActor(roles=["system_admin"])

    # Redaksiya funksiyası
    raw_payload = {
        "customer": "Ali Aliyev",
        "card_number": "4169738899990001",
        "api_secret": "my_super_secret",
        "details": {"auth_token": "token123", "amount": 100},
    }
    redacted = redact_payload(raw_payload)
    assert redacted["customer"] == "Ali Aliyev"
    assert redacted["card_number"] == "[REDACTED]"
    assert redacted["api_secret"] == "[REDACTED]"
    assert redacted["details"]["auth_token"] == "[REDACTED]"
    assert redacted["details"]["amount"] == 100

    # Test connection çağırırıq ki, jurnal qeydi yaransın
    await service.test_connection("payment_provider", actor=admin)

    # Çağırış jurnalının gətirilməsi
    logs = await service.list_logs("payment_provider", limit=10, actor=admin)
    assert len(logs) >= 1
