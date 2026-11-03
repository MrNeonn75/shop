"""Middleware Təbəqəsi Testləri (Security, Correlation ID, Size Limiter, Rate Limiter)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.middleware import rate_limiter


@pytest.mark.asyncio
async def test_security_headers_present(client: AsyncClient) -> None:
    res = await client.get("/health/live")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("x-xss-protection") == "1; mode=block"


@pytest.mark.asyncio
async def test_correlation_id_generated_and_preserved(client: AsyncClient) -> None:
    # 1. Avtomatik generasiya
    res1 = await client.get("/health/live")
    assert "x-correlation-id" in res1.headers
    cid1 = res1.headers["x-correlation-id"]
    assert len(cid1) > 0

    # 2. Göndərilən UUID-nin saxlanması
    custom_cid = "018b3f88-1000-7000-8000-000000000001"
    res2 = await client.get("/health/live", headers={"X-Correlation-ID": custom_cid})
    assert res2.headers.get("x-correlation-id") == custom_cid


@pytest.mark.asyncio
async def test_payload_too_large_returns_413(client: AsyncClient) -> None:
    # 11 MB Content-Length başlığı
    headers = {"Content-Length": str(11 * 1024 * 1024)}
    res = await client.post("/api/v1/ping", content=b"large", headers=headers)
    assert res.status_code == 413
    data = res.json()
    assert data["error"]["code"] == "PAYLOAD_TOO_LARGE"


@pytest.mark.asyncio
async def test_rate_limiter_blocks_excessive_requests() -> None:
    # InMemoryRateLimiter testi
    key = "test_ip:auth"
    # Maksimum 3 sorğuya icazə verilir
    for _ in range(3):
        assert rate_limiter.is_allowed(key, max_requests=3, window_seconds=60) is True

    # 4-cü sorğu bloklanmalıdır
    assert rate_limiter.is_allowed(key, max_requests=3, window_seconds=60) is False
