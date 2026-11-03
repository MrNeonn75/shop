"""Təhlükəsizlik və Parol İdarəetməsi (Argon2id).

OWASP standartlarına uyğun Argon2id alqoritmi ilə parolların heşlənməsi və yoxlanışı.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# OWASP tövsiyə etdiyi parametrlər
_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(plain_password: str) -> str:
    """Parolu Argon2id ilə heşləyir."""
    return _hasher.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Parolun heşlə uyğunluğunu yoxlayır."""
    try:
        return _hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, Exception):
        return False


def needs_rehash(hashed_password: str) -> bool:
    """Heş parametrlərinin yenilənməyə ehtiyacı olub-olmadığını yoxlayır."""
    return _hasher.check_needs_rehash(hashed_password)


# POS və Menecer PIN kodları üçün yüngülləşdirilmiş Argon2id (sürətli reaksiya)
_pin_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=19456,  # 19 MB
    parallelism=1,
    hash_len=32,
    salt_len=16,
)


def hash_pin(plain_pin: str) -> str:
    """POS və ya Menecer PIN kodunu heşləyir."""
    return _pin_hasher.hash(plain_pin)


def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    """PIN kodun heşlə uyğunluğunu yoxlayır."""
    try:
        return _pin_hasher.verify(hashed_pin, plain_pin)
    except (VerifyMismatchError, Exception):
        return False


def constant_time_compare(val1: str, val2: str) -> bool:
    """Zaman hücumlarına (timing attacks) qarşı sabit zamanlı sətir müqayisəsi."""
    import hmac

    return hmac.compare_digest(val1.encode("utf-8"), val2.encode("utf-8"))


def validate_password_policy(password: str) -> None:
    """Konfiqurasiya edilmiş təhlükəsizlik siyasətinə əsasən şifrəni yoxlayır."""
    import re

    from app.core.config import settings
    from app.core.errors import PasswordPolicyError

    issues: list[dict[str, str]] = []

    if len(password) < settings.SECURITY_PASSWORD_MIN_LENGTH:
        issues.append(
            {
                "field": "password",
                "issue": f"Şifrə ən azı {settings.SECURITY_PASSWORD_MIN_LENGTH} simvoldan ibarət olmalıdır.",
            }
        )

    if settings.SECURITY_PASSWORD_REQUIRE_UPPERCASE and not re.search(r"[A-Z]", password):
        issues.append(
            {"field": "password", "issue": "Şifrədə ən azı bir böyük hərf (A-Z) olmalıdır."}
        )

    if settings.SECURITY_PASSWORD_REQUIRE_LOWERCASE and not re.search(r"[a-z]", password):
        issues.append(
            {"field": "password", "issue": "Şifrədə ən azı bir kiçik hərf (a-z) olmalıdır."}
        )

    if settings.SECURITY_PASSWORD_REQUIRE_DIGITS and not re.search(r"\d", password):
        issues.append({"field": "password", "issue": "Şifrədə ən azı bir rəqəm (0-9) olmalıdır."})

    if settings.SECURITY_PASSWORD_REQUIRE_SYMBOLS and not re.search(
        r"[!@#$%^&*(),.?\":{}|<>\-_+=\[\]]", password
    ):
        issues.append(
            {
                "field": "password",
                "issue": "Şifrədə ən azı bir xüsusi simvol (!@#$%^&*...) olmalıdır.",
            }
        )

    if issues:
        raise PasswordPolicyError(details=issues)
