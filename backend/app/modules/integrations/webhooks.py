"""Kənar Vebhukların İmzalanması və Yoxlanışı (Webhook Signature Verification).

- HMAC-SHA256 kriptoqrafik imza yoxlanışı
- Sabit vaxtlı müqayisə (Timing attack prevention via hmac.compare_digest)
- Təkrar hücumdan müdafiə (Replay attack defense via timestamp tolerance)
"""

from __future__ import annotations

import hashlib
import hmac
import time


def verify_webhook_signature(
    payload_bytes: bytes,
    signature: str,
    secret_key: str,
    timestamp_header: str | None = None,
    tolerance_seconds: int = 300,
) -> bool:
    """HMAC-SHA256 ilə vebhuk imzasını və zaman pəncərəsini yoxlayır."""
    if not signature or not secret_key:
        return False

    # 1. Replay hücumuna qarşı zaman pəncərəsi yoxlanışı
    if timestamp_header:
        try:
            ts = float(timestamp_header)
            current_ts = time.time()
            if abs(current_ts - ts) > tolerance_seconds:
                return False
            # Əgər imza zaman damğasını da əhatə edirsə
            data_to_sign = f"{timestamp_header}.".encode() + payload_bytes
        except Exception:
            return False
    else:
        data_to_sign = payload_bytes

    expected_signature = hmac.new(
        secret_key.encode("utf-8"),
        data_to_sign,
        hashlib.sha256,
    ).hexdigest()

    # Prefiksli imzalar (məs: sha256=...) təmizlənir
    clean_signature = signature.removeprefix("sha256=").strip()

    return hmac.compare_digest(expected_signature, clean_signature)

