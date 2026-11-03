"""Kənar İnteqrasiyalar Reyestri Modulu (Integrations Registry Module)."""

from app.modules.integrations.models import Integration, IntegrationCallLog
from app.modules.integrations.service import IntegrationService, get_integration_service

__all__ = [
    "Integration",
    "IntegrationCallLog",
    "IntegrationService",
    "get_integration_service",
]
