"""Sənəd Nömrələnməsi ORM Modelləri (Document Numbering Models).

Qanuni və daxili sənədlərin (kassa qəbzləri, qaytarmalar, vergi hesab-fakturaları,
anbar hərəkətləri) fasiləsiz (gapless) və yarış vəziyyətlərinə davamlı (concurrency-safe)
nömrələnməsi üçün cədvəllər.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, BaseMixin, utc_now


class NumberingSequence(Base, BaseMixin):
    """Sənəd növləri üzrə nömrələnmə ardıcıllıqları (Sequences)."""

    __tablename__ = "numbering_sequences"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Bağlı olduğu şirkət ID-si",
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        doc="Filial səviyyəli ardıcıllıq üçün filial ID-si (şirkət səviyyəlidirsə boş)",
    )
    register_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cash_registers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        doc="Kassa səviyyəli ardıcıllıq üçün kassa ID-si (məs: qəbzlər üçün)",
    )
    document_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Sənəd növü: receipt, return, po, goods_receipt, transfer, adjustment, stock_count, expense, payroll_run, invoice, payment",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Ardıcıllığın adı (məs: Kassa Qəbzləri Nömrələnməsi)",
    )
    prefix: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="",
        doc="Prefiks (məs: RCP, RET, PO, INV, TRF)",
    )
    pattern: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="{PREFIX}-{YYYY}-{SEQ:6}",
        doc="Nömrə şablonu (məs: {PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6})",
    )
    reset_rule: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="never",
        doc="Sıfırlanma qaydası: never, yearly, monthly, daily",
    )
    scope: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="company",
        doc="Əhatə dairəsi: company, branch, register",
    )
    current_sequence: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        doc="Son istifadə edilmiş ardıcıl nömrə",
    )
    last_reset_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
        doc="Son sıfırlanma tarixi",
    )
    is_gapless: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="Fasiləsizlik tələb edilirmi (məs: kassa qəbzlərində True)?",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        doc="Ardıcıllıq aktivdirmi?",
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        doc="Versiya nömrəsi (şablon dəyişikliyi yalnız gələcək sənədlərə təsir edir)",
    )

    __table_args__ = (
        Index(
            "ix_numbering_sequences_lookup",
            "company_id",
            "document_type",
            "branch_id",
            "register_id",
        ),
    )


class AllocatedNumber(Base, BaseMixin):
    """Verilmiş və təsdiq edilmiş sənəd nömrələrinin jurnalı."""

    __tablename__ = "allocated_numbers"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Sənəd növü",
    )
    number: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Verilmiş unikal nömrə (məs: RCP-28MAY-202610-000001)",
    )
    sequence_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("numbering_sequences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    register_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cash_registers.id", ondelete="SET NULL"),
        nullable=True,
    )
    allocated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    allocated_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        Index("uq_allocated_numbers_doc_num", "document_type", "number", unique=True),
    )
