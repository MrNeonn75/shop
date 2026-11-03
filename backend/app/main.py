"""Brand House ERP — Əsas Tətbiq Giriş Nöqtəsi (FastAPI Application).

Modular Monolith arxitekturası, mərkəzi middleware zənciri,
standart xəta emalı və marşrut qeydiyyatı.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings
from app.core.database import engine, utc_now
from app.core.errors import register_exception_handlers
from app.core.health import router as health_router
from app.core.logging import logger, setup_logging
from app.core.middleware import (
    CorrelationIdMiddleware,
    RateLimitingMiddleware,
    RequestSizeLimitMiddleware,
    RequestTimingMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.telemetry import setup_telemetry
from app.modules.analytics.router import router as analytics_router
from app.modules.approvals.router import router as approvals_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.branches.router import router as branches_router
from app.modules.cash_registers.router import router as cash_registers_router
from app.modules.catalog.router import router as catalog_router
from app.modules.company.router import router as company_router
from app.modules.compliance.router import router as compliance_router
from app.modules.crm.router import router as crm_router
from app.modules.finance.router import router as finance_router
from app.modules.hr.router import router as hr_router
from app.modules.integrations.router import router as integrations_router
from app.modules.inventory.ports import register_inventory_catalog_port
from app.modules.inventory.router import router as inventory_router
from app.modules.loyalty.router import router as loyalty_router
from app.modules.marketing.router import router as marketing_router
from app.modules.notifications.router import router as notifications_router
from app.modules.numbering.router import router as numbering_router
from app.modules.payroll.router import router as payroll_router
from app.modules.ping.router import router as ping_router
from app.modules.pos.router import router as pos_router
from app.modules.purchasing.router import router as purchasing_router
from app.modules.rbac.router import router as rbac_router
from app.modules.reporting.router import router as reporting_router
from app.modules.returns.router import router as returns_router
from app.modules.sales.router import router as sales_router
from app.modules.sessions.router import router as sessions_router
from app.modules.settings.router import router as settings_router
from app.modules.suppliers.router import router as suppliers_router
from app.modules.transfers.router import router as transfers_router
from app.modules.users.router import router as users_router
from app.modules.warehouses.router import router as warehouses_router


class AuthContextMiddleware(BaseHTTPMiddleware):
    """Authorization: Bearer <token> başlığından istifadəçini request.state-ə yükləyir."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ").strip()
            try:
                from app.modules.auth.policies import AuthenticatedUser
                from app.modules.auth.tokens import decode_access_token
                from app.modules.rbac.service import get_rbac_service
                from app.modules.users.service import get_user_service

                payload = decode_access_token(token)
                user_id = uuid.UUID(payload["sub"])
                session_id = uuid.UUID(payload.get("session_id", str(user_id)))

                user_service = get_user_service()
                user_resp = await user_service.get_user_by_id(user_id)
                if user_resp.status != "suspended":
                    rbac_service = get_rbac_service()
                    eff = await rbac_service.get_effective_permissions(user_id)
                    request.state.user = AuthenticatedUser(
                        id=user_resp.id,
                        username=user_resp.username,
                        email=user_resp.email,
                        full_name=user_resp.full_name,
                        roles=eff.roles,
                        permissions=eff.permissions,
                        allowed_branches=eff.allowed_branches,
                        session_id=session_id,
                    )
                    request.state.session_id = session_id
                    is_all_branches = (
                        "system_admin" in eff.roles or "system.branches.all" in eff.permissions
                    )
                    request.state.branch_scope_ids = (
                        None if is_all_branches else eff.allowed_branches
                    )
            except Exception:
                pass
        return await call_next(request)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Tətbiqin başlanğıc (startup) və tamamlanma (shutdown) həyat dövrü."""
    # 1. Startup: Loglama və Telemetriya quraşdırılması
    setup_logging()
    setup_telemetry()
    register_inventory_catalog_port()

    logger.info(
        "Brand House ERP Backend İşə Düşdü",
        app_name=settings.APP_NAME,
        env=settings.APP_ENV,
        debug=settings.DEBUG,
    )

    yield

    # 2. Shutdown: Resursların azad edilməsi
    logger.info("Brand House ERP Backend Dayandırılır...")
    await engine.dispose()
    logger.info("Verilənlər bazası bağlantıları bağlandı")


def create_app() -> FastAPI:
    """FastAPI tətbiq instansiyasını konfiqurasiya edir və qaytarır."""
    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        description="Brand House Multi-Filial Pərakəndə İdarəetmə Sistemi (ERP) Backend API",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # 1. Middleware Zənciri (Starlette/FastAPI-da ən son əlavə olunan birinci icra edilir)
    # Autentifikasiya konteksti (Bearer token -> request.state.user)
    app.add_middleware(AuthContextMiddleware)
    # Rate Limiting
    app.add_middleware(RateLimitingMiddleware)
    # Request Size Limiter (DOS protection)
    app.add_middleware(RequestSizeLimitMiddleware)
    # Security Headers
    app.add_middleware(SecurityHeadersMiddleware)
    # Timing
    app.add_middleware(RequestTimingMiddleware)
    # Correlation ID (Hər sorğuya unikal izləmə ID-si)
    app.add_middleware(CorrelationIdMiddleware)

    # CORS Konfiqurasiyası
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Correlation-ID",
            "X-Process-Time-Ms",
            "X-Idempotent-Replay",
            "Content-Disposition",
        ],
    )

    # 2. Mərkəzi Xəta Emalçıları
    register_exception_handlers(app)

    # 3. Marşrutlar (Routers)
    app.include_router(health_router)
    app.include_router(company_router, prefix="/api/v1")
    app.include_router(company_router)
    app.include_router(branches_router, prefix="/api/v1")
    app.include_router(branches_router)
    app.include_router(warehouses_router, prefix="/api/v1")
    app.include_router(warehouses_router)
    app.include_router(cash_registers_router, prefix="/api/v1")
    app.include_router(cash_registers_router)
    app.include_router(settings_router, prefix="/api/v1")
    app.include_router(settings_router)
    app.include_router(numbering_router, prefix="/api/v1")
    app.include_router(numbering_router)
    app.include_router(integrations_router, prefix="/api/v1")
    app.include_router(integrations_router)
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(auth_router)
    app.include_router(users_router, prefix="/api/v1")
    app.include_router(rbac_router, prefix="/api/v1")
    app.include_router(sessions_router, prefix="/api/v1")
    app.include_router(audit_router, prefix="/api/v1")
    app.include_router(catalog_router, prefix="/api/v1")
    app.include_router(catalog_router)
    app.include_router(inventory_router, prefix="/api/v1")
    app.include_router(inventory_router)
    app.include_router(transfers_router, prefix="/api/v1")
    app.include_router(transfers_router)
    app.include_router(approvals_router, prefix="/api/v1")
    app.include_router(approvals_router)
    app.include_router(suppliers_router, prefix="/api/v1")
    app.include_router(suppliers_router)
    app.include_router(purchasing_router, prefix="/api/v1")
    app.include_router(purchasing_router)
    app.include_router(pos_router, prefix="/api/v1")
    app.include_router(pos_router)
    app.include_router(sales_router, prefix="/api/v1")
    app.include_router(sales_router)
    app.include_router(returns_router, prefix="/api/v1")
    app.include_router(returns_router)
    app.include_router(finance_router, prefix="/api/v1")
    app.include_router(finance_router)
    app.include_router(hr_router, prefix="/api/v1")
    app.include_router(hr_router)
    app.include_router(compliance_router, prefix="/api/v1")
    app.include_router(compliance_router)
    app.include_router(payroll_router, prefix="/api/v1")
    app.include_router(payroll_router)
    app.include_router(marketing_router, prefix="/api/v1")
    app.include_router(marketing_router)
    app.include_router(crm_router, prefix="/api/v1")
    app.include_router(crm_router)
    app.include_router(loyalty_router, prefix="/api/v1")
    app.include_router(loyalty_router)
    app.include_router(reporting_router, prefix="/api/v1")
    app.include_router(reporting_router)
    app.include_router(analytics_router, prefix="/api/v1")
    app.include_router(analytics_router)
    app.include_router(notifications_router, prefix="/api/v1")
    app.include_router(notifications_router)
    app.include_router(ping_router)

    # 4. Kök Məlumat Endpoint-i
    @app.get("/", summary="Tətbiq Haqqında Məlumat", tags=["Sistem"])
    async def root_info() -> dict[str, str]:
        return {
            "name": settings.APP_NAME,
            "version": "0.1.0",
            "environment": settings.APP_ENV,
            "status": "operational",
            "docs": "/docs" if not settings.is_production else "disabled",
            "timestamp": utc_now().isoformat(),
        }

    return app


app = create_app()
