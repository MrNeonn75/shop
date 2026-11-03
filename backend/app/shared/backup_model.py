"""Ehtiyat Nüsxələnmə Status Modeli (Backup Status Table).

Bütün ehtiyat nüsxə çıxarma əməliyyatlarının nəticəsi, bütövlük checksum-ı
və icra statusu bu cədvəldə qeyd olunur və /health/details vasitəsilə monitorinq edilir.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, BaseMixin


class BackupRecord(Base, BaseMixin):
    """Ehtiyat nüsxələmə jurnal qeydi."""

    __tablename__ = "backup_status"

    backup_type: Mapped[str] = mapped_column(String(50), default="full", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[str] = mapped_column(
        String(30),
        default="STARTED",
        nullable=False,
        index=True,
        doc="STARTED | SUCCESS | FAILED",
    )

    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True, doc="SHA-256")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_backup_status_started_at", "started_at"),)
