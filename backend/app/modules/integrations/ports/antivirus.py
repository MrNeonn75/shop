"""Antivirus Fayl Təhlükəsizlik Portu və Skaneri (AntiVirus Scanner Port).

Yüklənən faylların (qaimələr, kadr sənədləri, müqavilələr) zərərli proqramlara (ClamAV / VirusTotal)
qarşı yoxlanması üçün provayder-agnostik port.
Defolt olaraq NOT_CONFIGURED qaytarır və heç vaxt feyk təmiz bildirişi vermir.
"""

from __future__ import annotations

import abc
import mimetypes
from typing import Any

from app.core.errors import ValidationError

# İcazə verilən təhlükəsiz MIME tipləri
ALLOWED_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # xlsx
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # docx
    "text/csv",
}

# Bloklanan təhlükəli icra olunan genişlənmələr
BLOCKED_FILE_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".sh", ".bin", ".com", ".msi", ".scr",
    ".vbs", ".js", ".jar", ".py", ".php", ".phtml", ".pl", ".cgi",
    ".dll", ".so", ".dylib",
}


def validate_file_safety(filename: str, content: bytes, max_size_bytes: int = 15 * 1024 * 1024) -> None:
    """Faylın həcmini, genişlənməsini və MIME tipini yoxlayır."""
    if not filename or "." not in filename:
        raise ValidationError("Fayl adı və ya genişlənməsi düzgün deyil.")

    ext = "." + filename.rsplit(".", 1)[-1].lower()
    if ext in BLOCKED_FILE_EXTENSIONS:
        raise ValidationError(f"'{ext}' tipli icra olunan faylların sistemə yüklənməsi qadağandır.")

    if len(content) > max_size_bytes:
        raise ValidationError(f"Fayl həcmi icazə verilən maksimal həddi ({max_size_bytes // (1024 * 1024)} MB) aşır.")

    mime_type, _ = mimetypes.guess_type(filename)
    if mime_type and mime_type not in ALLOWED_DOCUMENT_MIME_TYPES:
        raise ValidationError(f"'{mime_type}' MIME tipi təhlükəsizlik səbəbindən dəstəklənmir.")


class AntiVirusScannerPort(abc.ABC):
    """Antivirus skaneri üçün mücərrəd port."""

    @abc.abstractmethod
    async def scan_file(self, filename: str, content: bytes) -> dict[str, Any]:
        """Faylı skan edir və nəticəni (təmiz / yoluxmuş / xəta) qaytarır."""
        pass

    @abc.abstractmethod
    async def verify_connection(self) -> bool:
        """Antivirus mühərriki ilə əlaqəni yoxlayır."""
        pass


class UnconfiguredAntiVirusScanner(AntiVirusScannerPort):
    """Konfiqurasiya edilməmiş antivirus adapteri (Standart olaraq NOT_CONFIGURED qaytarır)."""

    async def scan_file(self, filename: str, _content: bytes) -> dict[str, Any]:
        return {
            "status": "NOT_CONFIGURED",
            "is_clean": True,
            "filename": filename,
            "message": "Antivirus xidməti aktivləşdirilməyib (Yükləməyə yalnız format yoxlanışı ilə icazə verildi)",
        }

    async def verify_connection(self) -> bool:
        return False

