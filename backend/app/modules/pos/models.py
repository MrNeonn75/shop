"""POS (Kassa) Modulu ORM Modelləri (POS Models).

Kassa növbələri (shifts), nağd pul hərəkətləri (cash movements),
saxlanmış səbətlər (suspended carts), ödəniş cəhdləri (payment attempts)
və istifadə edilmiş menecer təsdiq tokenləri (single-use approval tokens).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class PosShift(Base):
    """Kassa Növbəsi (Cash Register Shift).

    Bir kassa aparatında eyni anda yalnız BİR aktiv (OPEN) növbə ola bilər (Partial Unique Index).
    """

    __tablename__ = "pos_shifts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    shift_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
        index=True,
        doc="Unikal növbə nömrəsi (məs: SH-REG01-202610-000001)",
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    register_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cash_registers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    cashier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opening_cash: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), doc="İlkin kassa qalığı (float)"
    )
    opening_denominations: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType, nullable=True, doc="Açılış əskinas və qəpik bölgüsü (denomination breakdown)"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="OPEN", index=True, doc="OPEN, CLOSING, CLOSED"
    )
    expected_cash_by_tender: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType, nullable=True, doc="Gözlənilən məbləğlər (tender üzrə: cash, card və s.)"
    )
    counted_cash_by_tender: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType, nullable=True, doc="Faktiki sayılmış məbləğlər (tender üzrə)"
    )
    closing_denominations: Mapped[dict[str, Any] | None] = mapped_column(
        JSONBType, nullable=True, doc="Bağlanış əskinas və qəpik bölgüsü"
    )
    variance: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2),
        nullable=True,
        doc="Kassa fərqi (Faktiki - Gözlənilən). Mənfi: kəsir, Müsbət: artıq",
    )
    closing_approver_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    closing_notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopened_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reopen_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    cash_movements: Mapped[list[CashMovement]] = relationship(
        "CashMovement", back_populates="shift", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("opening_cash >= 0", name="chk_pos_shift_opening_cash_non_negative"),
        Index(
            "uq_pos_shift_open_register",
            "register_id",
            unique=True,
            postgresql_where=text("status = 'OPEN'"),
            sqlite_where=text("status = 'OPEN'"),
        ),
    )


class CashMovement(Base):
    """Kassa Nağd Pul Hərəkəti (Cash Movement Ledger - Append Only)."""

    __tablename__ = "pos_cash_movements"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    movement_no: Mapped[str] = mapped_column(
        String(50), nullable=False, unique=True, index=True, doc="Unikal hərəkət nömrəsi"
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pos_shifts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    register_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cash_registers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_type: Mapped[str] = mapped_column(
        String(30), nullable=False, index=True, doc="CASH_IN, CASH_OUT, DROP, FLOAT_ADJUST"
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, doc="Məbləğ (> 0)")
    reason_code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Səbəb kodu (məs: SAFE_DROP, PETTY_CASH, BANK_DEPOSIT, FLOAT_TOPUP)",
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attachment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    manager_approval_token: Mapped[str | None] = mapped_column(
        String(500), nullable=True, doc="Limitdən artıq olduqda tələb olunan menecer tokeni"
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )

    shift: Mapped[PosShift] = relationship("PosShift", back_populates="cash_movements")

    __table_args__ = (CheckConstraint("amount > 0", name="chk_pos_cash_movement_amount_positive"),)


class PosCart(Base):
    """Saxlanılmış Kassa Səbəti (Suspended Sale Cart)."""

    __tablename__ = "pos_carts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pos_shifts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cart_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(
        String(100), nullable=False, doc="Səbətin təsviri adı və ya müştəri qeydi"
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="SUSPENDED",
        index=True,
        doc="SUSPENDED, RECALLED, EXPIRED, CANCELLED",
    )
    lines: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBType,
        nullable=False,
        default=list,
        doc="Qiymət səlahiyyəti olmayan sətir məlumatları (variant, qty, endirim sorğusu)",
    )
    suspended_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    recalled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class PaymentAttempt(Base):
    """Ödəniş Cəhdi və Provayder Tranzaksiyası (Two-Phase Payment Attempt)."""

    __tablename__ = "pos_payment_attempts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    register_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("cash_registers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pos_shifts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    tender_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True, doc="card, external_terminal"
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="AZN")
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDING",
        index=True,
        doc="PENDING, AUTHORIZED, CAPTURED, FAILED, VOIDED, UNKNOWN",
    )
    provider_id: Mapped[str] = mapped_column(
        String(50), nullable=False, doc="kapital_bank, pasha_bank, external_terminal"
    )
    provider_transaction_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    authorization_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    masked_card: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        doc="Yalnız maskalanmış nömrə (məs: ****1234). Əsla CVV/Tam PAN saxlanılmır!",
    )
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_pos_payment_attempt_amount_positive"),
        Index("uq_payment_attempt_idempotency", "company_id", "idempotency_key", unique=True),
    )


class UsedApprovalToken(Base):
    """İstifadə Edilmiş Menecer Təsdiq Tokenləri (Token Replay Prevention)."""

    __tablename__ = "pos_used_approval_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    jti: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True, index=True, doc="Tokenin unikal JWT ID-si"
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, doc="Təsdiq edilən əməliyyat")
    manager_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    used_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
