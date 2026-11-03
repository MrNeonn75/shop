"""POS Checkout & Lookup Locust Load Testing Script.

Bu skript POS satış və axtarış əməliyyatlarının p95 hədəflərini simulyasiya edir:
- POS Checkout (10 sətir): p95 < 150 ms
- POS Quote (10 sətir): p95 < 50 ms
- POS Lookup (Barkod / SKU): p95 < 30 ms

İstifadə qaydası:
    locust -f tests/load/pos_checkout_locust.py --host=http://localhost:8000 --headless -u 50 -r 10 --run-time 1m
"""

import json
import uuid

from locust import HttpUser, between, task


class PosCashierUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self) -> None:
        """Kassir istifadəçisi üçün sessiya və ilkin məlumatları hazırlayır."""
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer TEST_CASHIER_TOKEN",  # Test mühitində mock və ya real token
        }
        self.register_id = str(uuid.uuid4())
        self.shift_id = None
        self.variant_ids = [str(uuid.uuid4()) for _ in range(10)]
        self.sample_barcode = "4760123456789"

    @task(5)
    def fast_lookup(self) -> None:
        """Barkod / SKU üzrə anbar qalığı və qiymət axtarışı (Hədəf: p95 < 30 ms)."""
        self.client.get(
            f"/api/v1/pos/lookup?code={self.sample_barcode}&register_id={self.register_id}",
            headers=self.headers,
            name="/api/v1/pos/lookup",
        )

    @task(3)
    def calculate_quote(self) -> None:
        """10 sətirli səbət üçün server-tərəfli qiymət kalkulyasiyası (Hədəf: p95 < 50 ms)."""
        payload = {
            "branch_id": str(uuid.uuid4()),
            "items": [
                {"variant_id": v_id, "quantity": 1}
                for v_id in self.variant_ids
            ],
            "receipt_discount_percent": "5.00",
        }
        self.client.post(
            "/api/v1/pos/quote",
            data=json.dumps(payload),
            headers=self.headers,
            name="/api/v1/pos/quote",
        )

    @task(2)
    def atomic_checkout(self) -> None:
        """10 sətirli səbət üzrə 10 addımlı atomik çıxış (Hədəf: p95 < 150 ms)."""
        idem_key = f"locust-{uuid.uuid4().hex}"
        total_amount = "250.00"
        payload = {
            "shift_id": self.shift_id or str(uuid.uuid4()),
            "register_id": self.register_id,
            "items": [
                {"variant_id": v_id, "quantity": 1}
                for v_id in self.variant_ids
            ],
            "expected_grand_total": total_amount,
            "payments": [
                {
                    "tender_type": "cash",
                    "amount": total_amount,
                    "tendered_amount": "300.00",
                }
            ],
        }
        req_headers = {**self.headers, "Idempotency-Key": idem_key}
        self.client.post(
            "/api/v1/pos/sales",
            data=json.dumps(payload),
            headers=req_headers,
            name="/api/v1/pos/sales (checkout)",
        )

    @task(1)
    def get_x_report(self) -> None:
        """Kassa növbəsinin cari X-Hesabatı."""
        if self.shift_id:
            self.client.get(
                f"/api/v1/pos/shifts/{self.shift_id}/x-report",
                headers=self.headers,
                name="/api/v1/pos/shifts/[id]/x-report",
            )

