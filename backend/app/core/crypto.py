"""Həssas Məlumatların Kriptoqrafik Qorunması (Column-Level Encryption & PII Masking).

HR və əməkhaqqı modullarında həssas fərdi məlumatlar (FIN, bank hesabı, doğum tarixi,
yaşayış ünvanı) verilənlər bazasında AES/Fernet ilə şifrələnmiş saxlanılır.
Açarların rotasiyası (MultiFernet) və API üçün maskalama funksiyaları təmin edilir.
"""

from __future__ import annotations

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import settings


@lru_cache(maxsize=1)
def _get_fernet_engine() -> MultiFernet:
    """Konfiqurasiyadan əsas və rotasiya açarlarını oxuyaraq MultiFernet instansiyasını qaytarır."""
    primary_raw = settings.PII_ENCRYPTION_KEY.get_secret_value()
    # Açarı Fernet formatına (32 bayt base64) uyğunlaşdırırıq
    primary_key = _normalize_key(primary_raw)
    keys = [Fernet(primary_key)]

    for rot_raw in settings.PII_ROTATION_KEYS:
        if rot_raw:
            keys.append(Fernet(_normalize_key(rot_raw)))

    return MultiFernet(keys)


def _normalize_key(raw_key: str) -> bytes:
    """İstənilən uzunluqda açarı 32 baytlıq base64-kodlaşdırılmış Fernet açarına çevirir."""
    raw_bytes = raw_key.encode("utf-8")
    try:
        # Artıq etibarlı 32-baytlıq base64 olub-olmadığını yoxlayırıq
        decoded = base64.urlsafe_b64decode(raw_bytes)
        if len(decoded) == 32:
            return raw_bytes
    except Exception:
        pass

    # Əgər birbaşa Fernet açarı deyilsə, SHA-256 vasitəsilə 32 baytlıq xəritələndirib base64 edirik
    digest = hashlib.sha256(raw_bytes).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_pii(plaintext: str | None) -> str | None:
    """Açıq mətni şifrələyir və saxlanılacaq şifrəli mətn (token) qaytarır."""
    if plaintext is None:
        return None
    engine = _get_fernet_engine()
    encrypted_bytes = engine.encrypt(plaintext.encode("utf-8"))
    return encrypted_bytes.decode("utf-8")


def decrypt_pii(ciphertext: str | None) -> str | None:
    """Şifrələnmiş mətni açır (əsas və ya rotasiya açarı ilə)."""
    if ciphertext is None:
        return None
    engine = _get_fernet_engine()
    try:
        decrypted_bytes = engine.decrypt(ciphertext.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except InvalidToken:
        return "[Şifrəsi açıla bilmədi]"


def rotate_pii_ciphertext(ciphertext: str) -> str:
    """Şifrəli mətni cari əsas açarla yenidən şifrələyir."""
    engine = _get_fernet_engine()
    rotated_bytes = engine.rotate(ciphertext.encode("utf-8"))
    return rotated_bytes.decode("utf-8")


def mask_string(val: str | None, unmasked_suffix_len: int = 3, mask_char: str = "*") -> str:
    """Sətiri maskalayır (yalnız son N simvolu görünən saxlayır)."""
    if not val:
        return "***"
    cleaned = val.strip()
    if len(cleaned) <= unmasked_suffix_len:
        return mask_char * len(cleaned)
    masked_part = mask_char * (len(cleaned) - unmasked_suffix_len)
    visible_part = cleaned[-unmasked_suffix_len:]
    return f"{masked_part}{visible_part}"


def mask_national_id(val: str | None) -> str:
    """Fərdi identifikasiya nömrəsini (FİN/Pasport) maskalayır."""
    if not val:
        return "***"
    cleaned = val.strip()
    if len(cleaned) <= 3:
        return "***"
    return f"****{cleaned[-3:]}"


def mask_bank_account(val: str | None) -> str:
    """Bank hesabını / IBAN-ı maskalayır (məs: AZ...1234)."""
    if not val:
        return "***"
    cleaned = val.strip()
    if len(cleaned) <= 4:
        return "****"
    return f"{cleaned[:2]}...{cleaned[-4:]}"


def mask_address(val: str | None) -> str:
    """Yaşayış ünvanını maskalayır."""
    if not val:
        return "[Gizli ünvan]"
    cleaned = val.strip()
    parts = cleaned.split(",")
    city = parts[0].strip() if parts else "Bakı"
    return f"{city}, ***"

