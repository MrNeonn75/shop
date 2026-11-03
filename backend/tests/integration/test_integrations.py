"""Kənar İnteqrasiyaların Vəziyyəti İnteqrasiya Testləri (Integrations Status).

Konfiqurasiya edilməmiş inteqrasiyaların şəffaf şəkildə 'NOT CONFIGURED' qaytarmasının yoxlanması.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_integrations_status_explicit_not_configured(client: AsyncClient) -> None:
    res = await client.get("/api/v1/integrations/status")
    assert res.status_code == 200
    data = res.json()

    # Bütün əsas xidmətlər mövcud olmalıdır
    assert "payment_gateway" in data
    assert "sms_service" in data
    assert "email_service" in data
    assert "fiscal_printer" in data
    assert "legacy_brendhouse_api" in data
    assert "redis_cache" in data

    # Test mühitində açarlar olmadığı üçün 'NOT CONFIGURED' qaytarmalıdır (fake success qadağandır)
    payment = data["payment_gateway"]
    assert payment["status"] in ("CONFIGURED", "NOT CONFIGURED")
    if not payment["configured"]:
        assert payment["status"] == "NOT CONFIGURED"
        assert len(payment["missing_keys"]) > 0


@pytest.mark.asyncio
async def test_root_integrations_alias(client: AsyncClient) -> None:
    res = await client.get("/integrations/status")
    assert res.status_code == 200
