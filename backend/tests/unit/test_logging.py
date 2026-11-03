"""Loglama və Həssas Məlumatların Maskalanması Testləri (structlog)."""

from __future__ import annotations

from app.core.config import settings
from app.core.errors import correlation_id_ctx
from app.core.logging import (
    correlation_id_processor,
    mask_sensitive_data,
    mask_sensitive_value,
    redaction_processor,
    setup_logging,
)


def test_card_number_masking() -> None:
    card = "4169123456789012"
    masked = mask_sensitive_value(card)
    assert masked == "4169****9012"

    card_with_spaces = "4169 1234 5678 9012"
    masked_spaces = mask_sensitive_value(card_with_spaces)
    assert masked_spaces == "4169****9012"


def test_sensitive_keys_redaction() -> None:
    assert mask_sensitive_data("password", "MyPass123") == "[REDACTED]"
    assert mask_sensitive_data("auth_token", "jwt.token.value") == "[REDACTED]"
    assert mask_sensitive_data("user_pin", "1234") == "[REDACTED]"
    assert mask_sensitive_data("safe_key", "visible_value") == "visible_value"


def test_redaction_processor() -> None:
    event_dict = {
        "event": "User login attempt",
        "username": "elshan",
        "password": "SecretPassword!",
        "card_number": "4169123456789012",
        "nested": {"token": "secret_token"},
    }
    processed = redaction_processor(None, "info", event_dict)

    assert processed["password"] == "[REDACTED]"
    assert processed["card_number"] == "[REDACTED]"
    assert processed["username"] == "elshan"


def test_correlation_id_processor() -> None:
    token = correlation_id_ctx.set("cid-test-456")
    try:
        event = correlation_id_processor(None, "info", {"event": "test"})
        assert event["correlation_id"] == "cid-test-456"
    finally:
        correlation_id_ctx.reset(token)


def test_setup_logging_initialization() -> None:
    # Development mode
    settings.APP_ENV = "development"
    setup_logging()

    # Production mode
    settings.APP_ENV = "production"
    setup_logging()
    settings.APP_ENV = "development"
