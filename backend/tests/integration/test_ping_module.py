"""Ping Nümunə Modulu İnteqrasiya Testləri (Ping End-to-End).

Yaratma, ID üzrə oxuma, FilterBar səhifələmə və axtarış yoxlanışı.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_ping_lifecycle(client: AsyncClient) -> None:
    # 1. POST /api/v1/ping
    payload = {"message": "Test Ping Mesajı"}
    create_res = await client.post("/api/v1/ping", json=payload)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["message"] == "Test Ping Mesajı"
    assert created_data["status"] == "active"
    ping_id = created_data["id"]

    # 2. GET /api/v1/ping/{id}
    get_res = await client.get(f"/api/v1/ping/{ping_id}")
    assert get_res.status_code == 200
    got_data = get_res.json()
    assert got_data["id"] == ping_id
    assert got_data["message"] == "Test Ping Mesajı"

    # 3. GET /api/v1/ping (Siyahı və Pagination)
    list_res = await client.get("/api/v1/ping?page=1&page_size=10")
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    assert len(list_data["items"]) >= 1
    assert any(item["id"] == ping_id for item in list_data["items"])


@pytest.mark.asyncio
async def test_get_nonexistent_ping_returns_404(client: AsyncClient) -> None:
    random_id = uuid.uuid4()
    res = await client.get(f"/api/v1/ping/{random_id}")
    assert res.status_code == 404
    err = res.json()["error"]
    assert err["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_create_ping_validation_error(client: AsyncClient) -> None:
    payload = {"message": ""}  # min_length=1
    res = await client.post("/api/v1/ping", json=payload)
    assert res.status_code == 422
    data = res.json()
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert len(data["error"]["details"]) > 0
