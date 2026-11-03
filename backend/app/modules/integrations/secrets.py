"""İnteqrasiya Rekvizitlərinin Zərf Şifrələnməsi (Envelope Encryption for Secrets).

API açarları, şifrələr, tokenlər verilənlər bazasında AES-256 (Fernet) ilə şifrələnmiş saxlanılır.
Açarlar yalnız yazma-tiplidir (Write-only); API oxunuşlarında yalnız maskalanmış təhlükəsiz təsvir qaytarılır.
Açarların rotasiyası (Key Rotation) dəstəklənir.
"""

from __future__ import annotations

import json
from typing import Any

from app.core.crypto import decrypt_pii, encrypt_pii, rotate_pii_ciphertext


def encrypt_integration_secrets(secrets_dict: dict[str, Any]) -> str:
    """Məxfi rekvizitlər lüğətini JSON formatına salıb şifrələyir."""
    raw_json = json.dumps(secrets_dict, ensure_ascii=False)
    encrypted = encrypt_pii(raw_json)
    if not encrypted:
        raise ValueError("Məxfi rekvizitlərin şifrələnməsi uğursuz oldu")
    return encrypted


def decrypt_integration_secrets(ciphertext: str | None) -> dict[str, Any]:
    """Şifrələnmiş mətni açır və rekvizitlər lüğəti kimi qaytarır."""
    if not ciphertext:
        return {}
    decrypted_str = decrypt_pii(ciphertext)
    if not decrypted_str or decrypted_str == "[Şifrəsi açıla bilmədi]":
        return {}
    try:
        data = json.loads(decrypted_str)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def rotate_secrets_ciphertext(ciphertext: str) -> str:
    """Şifrələnmiş açarları yeni əsas açarla yenidən şifrələyir."""
    return rotate_pii_ciphertext(ciphertext)


def generate_masked_display(secrets_dict: dict[str, Any]) -> str:
    """UI və audit üçün məxfi məlumatı ifşa etmədən maskalanmış xülasə yaradır."""
    parts: list[str] = []
    for key, val in secrets_dict.items():
        val_str = str(val)
        masked = f"{key}: ••••{val_str[-4:]}" if len(val_str) > 4 else f"{key}: ••••"
        parts.append(masked)
    return ", ".join(parts) if parts else "Konfiqurasiya yoxdur"

