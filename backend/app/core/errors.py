"""Vahid Xəta İdarəetməsi və Xəta Zərfi (Error Envelope).

Bütün tətbiqdaxili istisnalar vahid JSON strukturunda qaytarılır.
Müştərilərə heç vaxt texniki stack trace sızdırılmır.
"""

from __future__ import annotations

import contextvars
from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.localization import get_message

# Correlation ID Context Variable
correlation_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default=""
)


def get_current_correlation_id() -> str:
    return correlation_id_ctx.get()


class AppException(Exception):
    """Tətbiqdaxili bütün xətaların baza sinfi."""

    def __init__(
        self,
        code: str,
        message: str | None = None,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.code = code
        self.message = message or get_message(code)
        self.status_code = status_code
        self.details = details or []
        self.headers = headers or {}
        super().__init__(self.message)


class ValidationError(AppException):
    def __init__(
        self,
        message: str | None = None,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="VALIDATION_ERROR",
            message=message or get_message("VALIDATION_ERROR"),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class UnauthenticatedError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="UNAUTHENTICATED",
            message=message or get_message("UNAUTHENTICATED"),
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="FORBIDDEN",
            message=message or get_message("FORBIDDEN"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class NotFoundError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="NOT_FOUND",
            message=message or get_message("NOT_FOUND"),
            status_code=status.HTTP_404_NOT_FOUND,
        )


class ConflictError(AppException):
    def __init__(
        self,
        message: str | None = None,
        code: str = "CONFLICT",
        details: list[dict[str, Any]] | dict[str, Any] | None = None,
    ) -> None:
        det = [details] if isinstance(details, dict) else details
        super().__init__(
            code=code,
            message=message or get_message(code),
            status_code=status.HTTP_409_CONFLICT,
            details=det,
        )


class VersionConflictError(ConflictError):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="VERSION_CONFLICT",
            message=message or get_message("VERSION_CONFLICT"),
        )


ConcurrencyError = VersionConflictError
OptimisticLockError = VersionConflictError


class IdempotencyConflictError(ConflictError):
    def __init__(
        self,
        code: str = "IDEMPOTENCY_IN_FLIGHT",
        message: str | None = None,
        status_code: int = status.HTTP_409_CONFLICT,
        retry_after: int = 2,
    ) -> None:
        super().__init__(message=message or get_message(code), code=code)
        self.status_code = status_code
        self.headers = {"Retry-After": str(retry_after)}


class RateLimitedError(AppException):
    def __init__(self, message: str | None = None, retry_after: int = 60) -> None:
        self.retry_after = retry_after
        super().__init__(
            code="RATE_LIMITED",
            message=message or get_message("RATE_LIMITED"),
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )


class BusinessRuleViolationError(AppException):
    def __init__(
        self,
        message: str | None = None,
        details: list[dict[str, Any]] | dict[str, Any] | None = None,
        code: str = "BUSINESS_RULE_VIOLATION",
    ) -> None:
        det = [details] if isinstance(details, dict) else details
        super().__init__(
            code=code,
            message=message or get_message(code) if code == "BUSINESS_RULE_VIOLATION" else (message or code),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=det,
        )


class InternalServerError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="INTERNAL_SERVER_ERROR",
            message=message or get_message("INTERNAL_SERVER_ERROR"),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class InvalidCredentialsError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="INVALID_CREDENTIALS",
            message=message or get_message("INVALID_CREDENTIALS"),
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class AccountLockedError(AppException):
    def __init__(self, message: str | None = None, retry_after: int = 900) -> None:
        self.retry_after = retry_after
        super().__init__(
            code="ACCOUNT_LOCKED",
            message=message or get_message("ACCOUNT_LOCKED"),
            status_code=status.HTTP_403_FORBIDDEN,
            headers={"Retry-After": str(retry_after)},
        )


class AccountSuspendedError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="ACCOUNT_SUSPENDED",
            message=message or get_message("ACCOUNT_SUSPENDED"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class MustChangePasswordError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="MUST_CHANGE_PASSWORD",
            message=message or get_message("MUST_CHANGE_PASSWORD"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class PasswordPolicyError(AppException):
    def __init__(
        self,
        message: str | None = None,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="PASSWORD_POLICY_VIOLATION",
            message=message or get_message("PASSWORD_POLICY_VIOLATION"),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class PasswordInHistoryError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="PASSWORD_IN_HISTORY",
            message=message or get_message("PASSWORD_IN_HISTORY"),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class TokenExpiredError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="TOKEN_EXPIRED",
            message=message or get_message("TOKEN_EXPIRED"),
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class TokenInvalidError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="TOKEN_INVALID",
            message=message or get_message("TOKEN_INVALID"),
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class TokenReuseDetectedError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="TOKEN_REUSE_DETECTED",
            message=message or get_message("TOKEN_REUSE_DETECTED"),
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class TwoFactorRequiredError(AppException):
    def __init__(self, message: str | None = None, temp_token: str | None = None) -> None:
        details = [{"temp_token": temp_token}] if temp_token else None
        super().__init__(
            code="TWO_FACTOR_REQUIRED",
            message=message or get_message("TWO_FACTOR_REQUIRED"),
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class TwoFactorInvalidError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="TWO_FACTOR_INVALID",
            message=message or get_message("TWO_FACTOR_INVALID"),
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class ManagerPinInvalidError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="MANAGER_PIN_INVALID",
            message=message or get_message("MANAGER_PIN_INVALID"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class ManagerApprovalError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="MANAGER_APPROVAL_REQUIRED",
            message=message or get_message("MANAGER_APPROVAL_REQUIRED"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class LastAdminProtectionError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="LAST_ADMIN_PROTECTION",
            message=message or get_message("LAST_ADMIN_PROTECTION"),
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class SegregationOfDutiesError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="SEGREGATION_OF_DUTIES_CONFLICT",
            message=message or get_message("SEGREGATION_OF_DUTIES_CONFLICT"),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class CrossBranchAccessError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="CROSS_BRANCH_ACCESS_DENIED",
            message=message or get_message("CROSS_BRANCH_ACCESS_DENIED"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class AuditImmutableError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="AUDIT_IMMUTABLE_ERROR",
            message=message or get_message("AUDIT_IMMUTABLE_ERROR"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class SelfEscalationError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="SELF_ESCALATION_DENIED",
            message=message or get_message("SELF_ESCALATION_DENIED"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class InsufficientStockError(AppException):
    def __init__(
        self,
        message: str | None = None,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="INSUFFICIENT_STOCK",
            message=message or get_message("INSUFFICIENT_STOCK"),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class StockLedgerImmutableError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="STOCK_LEDGER_IMMUTABLE",
            message=message or get_message("STOCK_LEDGER_IMMUTABLE"),
            status_code=status.HTTP_403_FORBIDDEN,
        )


class NegativeStockForbiddenError(AppException):
    def __init__(
        self,
        message: str | None = None,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="NEGATIVE_STOCK_FORBIDDEN",
            message=message or get_message("NEGATIVE_STOCK_FORBIDDEN"),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class TransferInvalidTransitionError(AppException):
    def __init__(
        self,
        message: str | None = None,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="TRANSFER_INVALID_TRANSITION",
            message=message or get_message("TRANSFER_INVALID_TRANSITION"),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class CountSessionClosedError(AppException):
    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            code="COUNT_SESSION_CLOSED",
            message=message or get_message("COUNT_SESSION_CLOSED"),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


def format_error_response(
    code: str,
    message: str,
    details: list[dict[str, Any]] | None = None,
    correlation_id: str | None = None,
) -> dict[str, Any]:
    """Standart API xəta zərfini generasiya edir."""
    cid = correlation_id or get_current_correlation_id()
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
            "correlation_id": cid,
        }
    }


async def app_exception_handler(_: Request, exc: AppException) -> JSONResponse:
    content = format_error_response(
        code=exc.code,
        message=exc.message,
        details=exc.details,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers=exc.headers,
    )


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    details: list[dict[str, Any]] = []
    for err in exc.errors():
        loc = " -> ".join(str(x) for x in err.get("loc", []) if x != "body")
        msg = err.get("msg", "Yanlış dəyər")
        details.append(
            {
                "field": loc or "body",
                "message": msg,
                "type": err.get("type", "value_error"),
            }
        )

    content = format_error_response(
        code="VALIDATION_ERROR",
        message=get_message("VALIDATION_ERROR"),
        details=details,
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=content,
    )


async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code_map = {
        400: ("BAD_REQUEST", "Yanlış sorğu parametri"),
        401: ("UNAUTHENTICATED", get_message("UNAUTHENTICATED")),
        403: ("FORBIDDEN", get_message("FORBIDDEN")),
        404: ("NOT_FOUND", get_message("NOT_FOUND")),
        405: ("METHOD_NOT_ALLOWED", "Bu metod cari resurs üçün dəstəklənmir"),
        409: ("CONFLICT", get_message("CONFLICT")),
        429: ("RATE_LIMITED", get_message("RATE_LIMITED")),
        500: ("INTERNAL_SERVER_ERROR", get_message("INTERNAL_SERVER_ERROR")),
    }
    default_code, default_msg = code_map.get(exc.status_code, ("HTTP_ERROR", "Xəta baş verdi"))
    msg = str(exc.detail) if exc.detail and exc.detail != "" else default_msg
    content = format_error_response(code=default_code, message=msg)
    return JSONResponse(status_code=exc.status_code, content=content)


async def unhandled_exception_handler(_: Request, _exc: Exception) -> JSONResponse:
    # Loglama middleware/structlog tərəfindən idarə olunur
    content = format_error_response(
        code="INTERNAL_SERVER_ERROR",
        message=get_message("INTERNAL_SERVER_ERROR"),
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=content,
    )


def register_exception_handlers(app: Any) -> None:
    """FastAPI tətbiqinə mərkəzi xəta emalçılarını qeydiyyatdan keçirir."""
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
