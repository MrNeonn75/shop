"""Müştəri Telefon və Əlaqə Məlumatlarının Normalizasiyası və Maskalanması."""

from __future__ import annotations

import re

from app.core.errors import ValidationError

# Azərbaycan Mobil Operator Prefiksləri (10, 50, 51, 55, 60, 70, 77, 99 və s.)
AZ_PREFIXES = {"10", "50", "51", "55", "60", "70", "77", "99"}


def normalize_phone(raw_phone: str | None) -> str | None:
    """Telefon nömrəsini beynəlxalq E.164 formatına (+994XXXXXXXXX) gətirir.

    Qəbul edilən format nümunələri:
    - "0501234567" -> "+994501234567"
    - "501234567" -> "+994501234567"
    - "994501234567" -> "+994501234567"
    - "+994 50 123 45 67" -> "+994501234567"
    - "+905321234567" -> "+905321234567"
    """
    if not raw_phone:
        return None

    cleaned = raw_phone.strip()
    if not cleaned:
        return None

    # Yalnız rəqəmlər və başlanğıc '+' saxlanılır
    has_plus = cleaned.startswith("+")
    digits_only = re.sub(r"\D", "", cleaned)

    if not digits_only:
        raise ValidationError(f"Yararsız telefon nömrəsi: '{raw_phone}'")

    # Əgər '+' ilə başlayıb və rəqəm sayı 10-15 arasıdırsa (Beynəlxalq standart E.164)
    if has_plus:
        if len(digits_only) < 7 or len(digits_only) > 15:
            raise ValidationError(f"Beynəlxalq telefon nömrəsinin uzunluğu düzgün deyil: '{raw_phone}'")
        return f"+{digits_only}"

    # Azərbaycan yerli formatları:
    # 1. 050XXXXXXX (10 rəqəm, 0 ilə başlayır)
    if len(digits_only) == 10 and digits_only.startswith("0"):
        return f"+994{digits_only[1:]}"

    # 2. 50XXXXXXX (9 rəqəm)
    if len(digits_only) == 9 and digits_only[:2] in AZ_PREFIXES:
        return f"+994{digits_only}"

    # 3. 99450XXXXXXX (12 rəqəm)
    if len(digits_only) == 12 and digits_only.startswith("994"):
        return f"+{digits_only}"

    # Ümumi halda rəqəm sayı 8-15 arasıdırsa, standart '+' əlavə edirik
    if 8 <= len(digits_only) <= 15:
        return f"+{digits_only}"

    raise ValidationError(f"Telefon nömrəsi formatı tanınmadı: '{raw_phone}'")


def mask_phone(phone: str | None) -> str:
    """Telefon nömrəsini PII tələblərinə uyğun maskalayır (+994 50 *** ** 67)."""
    if not phone:
        return ""
    cleaned = phone.strip()
    if len(cleaned) < 6:
        return "***"
    # İlk 6 simvol (məs. +99450) və son 2 simvol saxlanılır, arası ulduzlanır
    prefix = cleaned[:6]
    suffix = cleaned[-2:]
    return f"{prefix}***{suffix}"


def mask_email(email: str | None) -> str:
    """E-poçt ünvanını maskalayır (e***n@example.com)."""
    if not email:
        return ""
    cleaned = email.strip()
    if "@" not in cleaned:
        return "***"
    local_part, domain = cleaned.split("@", 1)
    if len(local_part) <= 2:
        masked_local = local_part[0] + "*"
    else:
        masked_local = local_part[0] + "***" + local_part[-1]
    return f"{masked_local}@{domain}"
