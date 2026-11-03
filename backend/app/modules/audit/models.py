"""Audit Modulu Modelləri (Audit Models).

Mərkəzi AuditEvent modelini app.shared.audit paketindən təqdim edir.
"""

from __future__ import annotations

from app.shared.audit import AuditEvent

__all__ = ["AuditEvent"]
