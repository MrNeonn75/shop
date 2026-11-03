"""Mərkəzi Strukturlaşdırılmış Loglama (structlog).

JSON formatlı loglar (production), rəngli konsol (development).
Həssas məlumatların (parol, token, kart nömrələri, PII) avtomatik maskalanması.
"""

from __future__ import annotations

import contextlib
import logging
import re
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog

if hasattr(sys.stdout, "reconfigure"):
    with contextlib.suppress(Exception):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.core.config import settings
from app.core.errors import get_current_correlation_id

# Həssas açar sözlər
SENSITIVE_KEYS = {
    "password",
    "secret",
    "token",
    "api_key",
    "access_token",
    "refresh_token",
    "authorization",
    "pin",
    "secret_key",
    "cvv",
    "card_number",
}

# Kart nömrələri üçün Regex (13-19 rəqəm, aralarında boşluq və ya defis ola bilər)
CARD_PATTERN = re.compile(r"\b(?:\d[ -]*?){13,19}\b")


def mask_sensitive_value(val: Any) -> Any:
    """Kart nömrələri və ya həssas sətirləri maskalayır."""
    if isinstance(val, str):
        # Əgər kart nömrəsinə bənzəyirsə
        def _mask_card(match: re.Match[str]) -> str:
            digits = re.sub(r"\D", "", match.group(0))
            if len(digits) >= 13 and len(digits) <= 19:
                return f"{digits[:4]}****{digits[-4:]}"
            return match.group(0)

        return CARD_PATTERN.sub(_mask_card, val)
    elif isinstance(val, dict):
        return {k: mask_sensitive_data(k, v) for k, v in val.items()}
    elif isinstance(val, list):
        return [mask_sensitive_value(item) for item in val]
    return val


def mask_sensitive_data(key: str, val: Any) -> Any:
    """Açar adına görə həssas dəyərləri maskalayır."""
    if any(k in key.lower() for k in SENSITIVE_KEYS):
        return "[REDACTED]"
    return mask_sensitive_value(val)


def redaction_processor(
    _: Any, __: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    """Structlog prosessoru: Bütün log hadisəsindən həssas məlumatları təmizləyir."""
    for key in list(event_dict.keys()):
        event_dict[key] = mask_sensitive_data(key, event_dict[key])
    return event_dict


def correlation_id_processor(
    _: Any, __: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    """Cari sorğunun correlation_id-sini log qeydinə əlavə edir."""
    cid = get_current_correlation_id()
    if cid and "correlation_id" not in event_dict:
        event_dict["correlation_id"] = cid
    return event_dict


def setup_logging() -> None:
    """Tətbiqin mərkəzi log sistemini konfiqurasiya edir."""
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        correlation_id_processor,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        redaction_processor,
    ]

    if settings.is_production:
        # Production: JSON Format
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        # Development: Rəngli konsol
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO if not settings.DEBUG else logging.DEBUG)

    # Xarici səs-küylü kitabxanaların səviyyəsini tənzimləyirik
    for noisy in ("uvicorn.access", "asyncpg"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


logger = structlog.get_logger("brand_house")
