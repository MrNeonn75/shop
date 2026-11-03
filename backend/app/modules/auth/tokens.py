"""JWT və Token İdarəetməsi (Auth Tokens).

Fırlanan açar dəsti (rotating kid) ilə qısamüddətli JWT tokenlərinin imzalanması və yoxlanışı.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta
from typing import Any

import jwt

from app.core.config import settings
from app.core.database import utc_now
from app.core.errors import TokenExpiredError, TokenInvalidError


def get_jwt_keys() -> dict[str, str]:
    """Konfiqurasiya edilmiş açarları qaytarır."""
    secret = settings.SECRET_KEY.get_secret_value()
    return {
        "v1": secret,
        settings.JWT_CURRENT_KID: secret,
    }


def create_access_token(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    roles: list[str],
    branch_scope_version: str = "v1",
    expires_minutes: int | None = None,
) -> str:
    """Qısamüddətli imzalanmış Access Token (JWT) yaradır."""
    now = utc_now()
    exp_delta = timedelta(minutes=expires_minutes or settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    exp = now + exp_delta

    roles_hash = hashlib.sha256(",".join(sorted(roles)).encode("utf-8")).hexdigest()[:16]
    kid = settings.JWT_CURRENT_KID
    secret = get_jwt_keys().get(kid, settings.SECRET_KEY.get_secret_value())

    payload = {
        "sub": str(user_id),
        "session_id": str(session_id),
        "roles": roles,
        "roles_hash": roles_hash,
        "branch_scope_version": branch_scope_version,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": str(uuid.uuid4()),
    }

    headers = {"kid": kid}
    return jwt.encode(payload, secret, algorithm=settings.JWT_ALGORITHM, headers=headers)


def decode_access_token(token: str) -> dict[str, Any]:
    """Access tokeni yoxlayır və deşifrə edir."""
    try:
        # Əvvəlcə header-dən 'kid'-i oxuyuruq
        unverified_headers = jwt.get_unverified_header(token)
        kid = unverified_headers.get("kid", "v1")
        keys = get_jwt_keys()
        secret = keys.get(kid, settings.SECRET_KEY.get_secret_value())

        payload: dict[str, Any] = jwt.decode(
            token,
            secret,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "iat", "sub", "session_id"]},
        )
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("Access tokenin etibarlılıq müddəti bitib.") from exc
    except jwt.PyJWTError as exc:
        raise TokenInvalidError(f"Access token etibarsızdır: {exc!s}") from exc


def create_temporary_token(user_id: uuid.UUID, purpose: str, expires_minutes: int = 10) -> str:
    """2FA və ya ilkin giriş şifrə dəyişimi üçün qısamüddətli müvəqqəti token."""
    now = utc_now()
    exp = now + timedelta(minutes=expires_minutes)
    secret = settings.SECRET_KEY.get_secret_value()

    payload = {
        "sub": str(user_id),
        "purpose": purpose,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, secret, algorithm=settings.JWT_ALGORITHM)


def decode_temporary_token(token: str, expected_purpose: str) -> uuid.UUID:
    """Müvəqqəti tokeni yoxlayır və istifadəçi ID-sini qaytarır."""
    try:
        secret = settings.SECRET_KEY.get_secret_value()
        payload = jwt.decode(
            token,
            secret,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "iat", "sub", "purpose"]},
        )
        if payload.get("purpose") != expected_purpose:
            raise TokenInvalidError("Müvəqqəti tokenin təyinatı uyğun deyil.")
        return uuid.UUID(payload["sub"])
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("Müvəqqəti tokenin müddəti bitib.") from exc
    except jwt.PyJWTError as exc:
        raise TokenInvalidError("Müvəqqəti token etibarsızdır.") from exc
