"""Kənar İnteqrasiya Portları və Provayder-Agnostik İnterfeyslər (Integration Ports)."""

from app.modules.integrations.ports.accounting import AccountingPort
from app.modules.integrations.ports.antivirus import (
    ALLOWED_DOCUMENT_MIME_TYPES,
    BLOCKED_FILE_EXTENSIONS,
    AntiVirusScannerPort,
    UnconfiguredAntiVirusScanner,
    validate_file_safety,
)
from app.modules.integrations.ports.attendance import AttendanceDevicePort
from app.modules.integrations.ports.fiscal import FiscalServicePort, UnconfiguredFiscalService
from app.modules.integrations.ports.legacy import BrendhouseLegacyAdapter, LegacyStorePort
from app.modules.integrations.ports.messaging import (
    EmailProviderPort,
    SmsProviderPort,
    WhatsAppProviderPort,
)
from app.modules.integrations.ports.payment import PaymentGatewayPort
from app.modules.integrations.ports.printer import PrinterServicePort

__all__ = [
    "AccountingPort",
    "ALLOWED_DOCUMENT_MIME_TYPES",
    "BLOCKED_FILE_EXTENSIONS",
    "AntiVirusScannerPort",
    "UnconfiguredAntiVirusScanner",
    "validate_file_safety",
    "AttendanceDevicePort",
    "FiscalServicePort",
    "UnconfiguredFiscalService",
    "BrendhouseLegacyAdapter",
    "LegacyStorePort",
    "EmailProviderPort",
    "SmsProviderPort",
    "WhatsAppProviderPort",
    "PaymentGatewayPort",
    "PrinterServicePort",
]

