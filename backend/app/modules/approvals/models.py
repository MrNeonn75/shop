"""Təsdiqləmə Mühərriki ORM Modelləri (Approval Engine Models).

Müxtəlif sənəd növləri (Satınalma sorğusu, Satınalma sifarişi, Təchizatçı qaiməsi, Xərclər)
üçün məbləğ hədləri, filiallar, rollar və icazələr üzrə çoxpilləli təsdiq qaydalarını,
sorğuları, addımları və qərar tarixçəsini idarə edir.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, BaseMixin


class ApprovalStatus(str, enum.Enum):
    """Təsdiqləmə statusları."""

    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RETURNED = "RETURNED"
    SKIPPED = "SKIPPED"


class ApprovalAction(str, enum.Enum):
    """Qərar hərəkətləri."""

    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RETURNED = "RETURNED"
    DELEGATED = "DELEGATED"


class ApprovalRule(Base, BaseMixin):
    """Sənəd təsdiq qaydası (konfiqurasiya cədvəli)."""

    __tablename__ = "approval_rules"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    min_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    max_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    required_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    required_permission: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_approval_rules_lookup", "company_id", "document_type", "level", "is_active"),
    )


class ApprovalRequest(Base, BaseMixin):
    """Spesifik bir sənəd üzrə aktiv və ya tamamlanmış təsdiqləmə sorğusu."""

    __tablename__ = "approval_requests"

    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    requester_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 4), nullable=False, default=Decimal("0.0000")
    )
    current_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_levels: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ApprovalStatus.PENDING.value, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    steps: Mapped[list[ApprovalStep]] = relationship(
        "ApprovalStep",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="ApprovalStep.level",
    )
    history: Mapped[list[ApprovalHistory]] = relationship(
        "ApprovalHistory",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="ApprovalHistory.created_at",
    )

    __table_args__ = (
        Index("ix_approval_requests_doc", "company_id", "document_type", "document_id"),
    )


class ApprovalStep(Base, BaseMixin):
    """Təsdiqləmə zəncirindəki tək bir pillə (addım)."""

    __tablename__ = "approval_steps"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("approval_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    required_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    required_permission: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ApprovalStatus.PENDING.value
    )
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    delegated_from_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    request: Mapped[ApprovalRequest] = relationship("ApprovalRequest", back_populates="steps")


class ApprovalHistory(Base, BaseMixin):
    """Təsdiqləmə hadisələrinin dəyişməz audit qeydləri."""

    __tablename__ = "approval_history"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("approval_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    request: Mapped[ApprovalRequest] = relationship("ApprovalRequest", back_populates="history")
