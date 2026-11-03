"""Xətalar və Lokallaşdırma Testləri (Errors & Localization).

Standart xəta zərfi strukturu və Azərbaycan dili mesajlarının doğruluğu.
"""

from __future__ import annotations

import pytest
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    RateLimitedError,
    UnauthenticatedError,
    ValidationError,
    format_error_response,
    http_exception_handler,
    unhandled_exception_handler,
)
from app.core.localization import get_message


def test_localization_catalog() -> None:
    assert get_message("NOT_FOUND", lang="az") == "Axtarılan resurs tapılmadı."
    assert (
        get_message("UNAUTHENTICATED", lang="az")
        == "Giriş tələb olunur. Sessiya tapılmadı və ya bitib."
    )
    assert get_message("FORBIDDEN", lang="az") == "Bu əməliyyatı icra etmək üçün icazəniz yoxdur."

    # İngilis dili
    assert get_message("NOT_FOUND", lang="en") == "The requested resource was not found."

    # Rus dili
    assert get_message("NOT_FOUND", lang="ru") == "Запрашиваемый ресурс не найден."


def test_app_exception_hierarchy() -> None:
    nf = NotFoundError("Məhsul tapılmadı.")
    assert nf.status_code == 404
    assert nf.code == "NOT_FOUND"
    assert nf.message == "Məhsul tapılmadı."

    cf = ConflictError("Bu barkod artıq mövcuddur.")
    assert cf.status_code == 409
    assert cf.code == "CONFLICT"

    val = ValidationError(
        message="Daxiletmə xətası",
        details=[{"field": "price", "message": "Mənfi ola bilməz"}],
    )
    assert val.status_code == 422
    assert len(val.details) == 1


def test_format_error_response() -> None:
    resp = format_error_response(
        code="TEST_ERROR",
        message="Test xətası baş verdi",
        details=[{"field": "username", "message": "Tələb olunur"}],
        correlation_id="test-cid-123",
    )

    assert "error" in resp
    err = resp["error"]
    assert err["code"] == "TEST_ERROR"
    assert err["message"] == "Test xətası baş verdi"
    assert err["correlation_id"] == "test-cid-123"
    assert len(err["details"]) == 1
    assert err["details"][0]["field"] == "username"


def test_other_exceptions() -> None:
    unauth = UnauthenticatedError()
    assert unauth.status_code == 401
    assert unauth.code == "UNAUTHENTICATED"

    forb = ForbiddenError()
    assert forb.status_code == 403

    rl = RateLimitedError()
    assert rl.status_code == 429
    assert rl.headers["Retry-After"] == "60"

    brv = BusinessRuleViolationError()
    assert brv.status_code == 422

    ise = InternalServerError()
    assert ise.status_code == 500


@pytest.mark.asyncio
async def test_exception_handlers_directly() -> None:
    # StarletteHTTPException 405
    http_exc = StarletteHTTPException(status_code=405, detail="Metod dəstəklənmir")
    res = await http_exception_handler(None, http_exc)
    assert res.status_code == 405

    # Unhandled Exception 500
    res500 = await unhandled_exception_handler(None, RuntimeError("Bilinməyən xəta"))
    assert res500.status_code == 500
    assert res500.body is not None
