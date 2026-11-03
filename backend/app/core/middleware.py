"""HTTP Middleware Təbəqəsi.

1. Correlation ID generasiyası və ötürülməsi (X-Correlation-ID)
2. Sorğu icra vaxtının ölçülməsi (X-Process-Time-Ms)
3. Təhlükəsizlik başlıqları (Security Headers)
4. Sorğu ölçüsü limiti (Request Size Limiter)
5. Sürət məhdudiyyəti (Rate Limiter - In-memory / Redis fallback)
"""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings
from app.core.errors import correlation_id_ctx, format_error_response
from app.core.ids import generate_uuid7, is_valid_uuid
from app.core.logging import logger

MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """X-Correlation-ID başlığını generasiya və ya təsdiq edir, kontekstə bağlayır."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        header_val = request.headers.get("X-Correlation-ID")
        cid = header_val if header_val and is_valid_uuid(header_val) else str(generate_uuid7())

        token = correlation_id_ctx.set(cid)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = cid
            return response
        finally:
            correlation_id_ctx.reset(token)


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Sorğunun icra vaxtını hesablayır və structlog ilə qeyd edir."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        response.headers["X-Process-Time-Ms"] = str(duration_ms)

        # Statik və ya health yoxlanışlarını log ilə yükləmirik
        if not request.url.path.startswith(("/health", "/docs", "/openapi.json")):
            logger.info(
                "HTTP Sorğusu Tamamlandı",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Standart təhlükəsizlik başlıqlarını əlavə edir."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Həddindən artıq böyük sorğuları (DOS qorunması) bloklayır."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        content_length = request.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_BODY_SIZE:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content=format_error_response(
                    code="PAYLOAD_TOO_LARGE",
                    message="Sorğunun ölçüsü icazə verilən 10MB həddini aşır.",
                ),
            )
        return await call_next(request)


class InMemoryRateLimiter:
    """Sliding-window alqoritmli yüngül in-memory rate limiter."""

    def __init__(self) -> None:
        self.requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        # Köhnəlmiş sorğuları təmizləyirik
        self.requests[key] = [t for t in self.requests[key] if t > cutoff]

        if len(self.requests[key]) >= max_requests:
            return False

        self.requests[key].append(now)
        return True


rate_limiter = InMemoryRateLimiter()


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """IP və ya İstifadəçi əsaslı sorğu tezliyi məhdudiyyəti."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Health və test yoxlamalarına limit tətbiq olunmur
        if (
            request.url.path.startswith(("/health", "/docs", "/openapi.json"))
            or settings.APP_ENV == "testing"
        ):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        is_auth_route = "/auth" in request.url.path

        max_req = (
            settings.RATE_LIMIT_AUTH_PER_MINUTE
            if is_auth_route
            else settings.RATE_LIMIT_DEFAULT_PER_MINUTE
        )

        key = f"{client_ip}:{ 'auth' if is_auth_route else 'api' }"
        if not rate_limiter.is_allowed(key, max_requests=max_req, window_seconds=60):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content=format_error_response(
                    code="RATE_LIMITED",
                    message="Həddindən artıq çox sorğu göndərildi. Zəhmət olmasa gözləyin.",
                ),
                headers={"Retry-After": "60"},
            )

        return await call_next(request)
