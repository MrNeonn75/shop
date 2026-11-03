"""Locust Yük və Məhsuldarlıq Sınaq Ssenarisi (Load Testing & Capacity Benchmarks).

Hədəf Metriklər və SLA/SLO Tələbləri:
- GET /health, GET /catalog/products: p95 < 100 ms, 500 RPS
- POST /pos/quote (server-side discount calculation): p95 < 200 ms, 200 RPS
- POST /pos/sales/checkout (10-step atomic checkout): p95 < 350 ms, 100 RPS
- GET /reports/dashboard (materialized view / analytics): p95 < 500 ms, 50 RPS
- Xəta dərəcəsi (Error Rate): < 0.01%
"""

from __future__ import annotations

import os
import uuid

from locust import HttpUser, between, task


class RetailPosLoadUser(HttpUser):
    """Realist pərakəndə kassir və menecer istifadəçi davranış profili."""

    wait_time = between(0.5, 2.0)
    token: str | None = None
    branch_id: str = os.getenv("LOAD_TEST_BRANCH_ID", str(uuid.uuid4()))
    register_id: str = os.getenv("LOAD_TEST_REGISTER_ID", str(uuid.uuid4()))
    shift_id: str = os.getenv("LOAD_TEST_SHIFT_ID", str(uuid.uuid4()))

    def on_start(self) -> None:
        """İstifadəçi sessiyasını başladır və autentifikasiyadan keçir."""
        login_payload = {
            "username": os.getenv("LOAD_TEST_USER", "admin"),
            "password": os.getenv("LOAD_TEST_PASSWORD", "AdminPass123!"),
        }
        res = self.client.post("/auth/login", json=login_payload)
        if res.status_code == 200:
            data = res.json()
            self.token = data.get("access_token")

    def _auth_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    @task(10)
    def check_health(self) -> None:
        """Sistem sağlamlığı yoxlanışı (10x tezlik)."""
        self.client.get("/health", headers=self._auth_headers())

    @task(6)
    def browse_catalog(self) -> None:
        """Məhsul kataloqunun axtarışı və səhifələnməsi (6x tezlik)."""
        self.client.get("/catalog/products?page=1&page_size=20", headers=self._auth_headers())

    @task(4)
    def calculate_pos_quote(self) -> None:
        """Kassa qiymət və endirim kalkulyasiyası (4x tezlik)."""
        quote_payload = {
            "branch_id": self.branch_id,
            "items": [
                {
                    "variant_id": str(uuid.uuid4()),
                    "quantity": 2,
                    "unit_price": "89.90",
                }
            ],
        }
        self.client.post("/pos/quote", json=quote_payload, headers=self._auth_headers())

    @task(2)
    def checkout_sale(self) -> None:
        """Kassa atomik satış çıxışı (2x tezlik)."""
        idempotency_key = f"locust-chk-{uuid.uuid4()}"
        headers = self._auth_headers()
        headers["Idempotency-Key"] = idempotency_key

        checkout_payload = {
            "shift_id": self.shift_id,
            "register_id": self.register_id,
            "items": [
                {
                    "variant_id": str(uuid.uuid4()),
                    "quantity": 1,
                }
            ],
            "expected_grand_total": "89.90",
            "payments": [
                {
                    "tender_type": "cash",
                    "amount": "89.90",
                    "tendered_amount": "100.00",
                }
            ],
        }
        self.client.post("/pos/sales/checkout", json=checkout_payload, headers=headers)

    @task(1)
    def view_reports_dashboard(self) -> None:
        """İdarəetmə paneli və analitika oxunuşu (1x tezlik)."""
        self.client.get("/reports/dashboard", headers=self._auth_headers())
