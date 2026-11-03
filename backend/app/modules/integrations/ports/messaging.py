"""Mesajlaşma və Bildiriş Provayderləri Portları (SMS, Email, WhatsApp)."""

from __future__ import annotations

import abc
from typing import Any


class SmsProviderPort(abc.ABC):
    """SMS provayderi (Azercell, Bakcell və s.) üçün mücərrəd port."""

    @abc.abstractmethod
    async def send_sms(self, to: str, message: str) -> dict[str, Any]:
        """SMS göndərişi."""
        pass

    @abc.abstractmethod
    async def check_balance(self) -> dict[str, Any]:
        """SMS balansının yoxlanılması."""
        pass

    @abc.abstractmethod
    async def verify_credentials(self) -> bool:
        """API açarlarının doğrulanması."""
        pass


class EmailProviderPort(abc.ABC):
    """E-poçt (SMTP) provayderi üçün mücərrəd port."""

    @abc.abstractmethod
    async def send_email(self, to: str, subject: str, body_html: str) -> dict[str, Any]:
        """E-poçt göndərişi."""
        pass

    @abc.abstractmethod
    async def verify_smtp(self) -> bool:
        """SMTP bağlantısının doğrulanması."""
        pass


class WhatsAppProviderPort(abc.ABC):
    """WhatsApp Business API üçün mücərrəd port."""

    @abc.abstractmethod
    async def send_template(
        self,
        to: str,
        template_name: str,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        """WhatsApp şablon mesajı göndərişi."""
        pass

    @abc.abstractmethod
    async def verify_credentials(self) -> bool:
        """WhatsApp API tokeninin yoxlanılması."""
        pass

