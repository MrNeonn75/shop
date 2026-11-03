"""Əmək Haqqı və Maaş Hesablanması (Payroll) ORM Modelləri.

Struktur:
1. SalaryProfile: Versiyalaşdırılmış əmək haqqı profili (4 kompensasiya modeli).
2. PayrollRuleSet: Konfiqurasiya edilə bilən dərəcələr və vergi qaydaları (Heç bir qanuni dərəcə hardcode edilmir!).
3. PayrollAdjustment: Bonus, kəsinti, komissiya və avans qaytarmaları.
4. PayrollRun: Dövri maaş hesablama sənədi və həyat dövrü.
5. Payslip, PayslipLineItem: Fərdi maaş vərəqələri və sətirlər.
6. PayrollBranchAllocation: Filiallar üzrə xərc bölgüsü (Finance inteqrasiyası).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class CompensationModel(str, enum.Enum):
    FIXED = "FIXED"  # Aylıq sabit maaş
    HOURLY = "HOURLY"  # Saatlıq tarif
    MIXED = "MIXED"  # Sabit baza + saatlıq/əlavə vaxt
    COMMISSION_BONUS = "COMMISSION_BONUS"  # Baza + satış bonusları


class AdjustmentType(str, enum.Enum):
    BONUS = "BONUS"
    DEDUCTION = "DEDUCTION"
    ALLOWANCE = "ALLOWANCE"
    COMMISSION = "COMMISSION"
    ADVANCE_REPAYMENT = "ADVANCE_REPAYMENT"


class PayrollRunStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    CALCULATED = "CALCULATED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    FINALIZED = "FINALIZED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class LineItemCategory(str, enum.Enum):
    BASE = "BASE"
    OVERTIME = "OVERTIME"
    BONUS = "BONUS"
    COMMISSION = "COMMISSION"
    ALLOWANCE = "ALLOWANCE"
    DEDUCTION = "DEDUCTION"
    TAX = "TAX"
    SOCIAL_INSURANCE = "SOCIAL_INSURANCE"


# ==========================================
# 1. SALARY PROFILES & RULES
# ==========================================


class SalaryProfile(Base):
    """İşçinin versiyalaşdırılmış əmək haqqı profili."""

    __tablename__ = "payroll_salary_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    compensation_model: Mapped[CompensationModel] = mapped_column(
        String(30), default=CompensationModel.FIXED, nullable=False
    )
    currency: Mapped[str] = mapped_column(String(3), default="AZN", nullable=False)
    base_salary: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    hourly_rate: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class PayrollRuleSet(Base):
    """Maaş hesablama qaydaları (Vergilər, DSMF, İTS dərəcələri - konfiqurasiya edilə bilən)."""

    __tablename__ = "payroll_rule_sets"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    rules_config: Mapped[dict[str, Any]] = mapped_column(
        JSONBType,
        nullable=False,
        default=dict,
        doc="Vergi və sığorta dərəcələri (məs: income_tax_rate, dsmf_employee_rate, overtimes və s.)",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class PayrollAdjustment(Base):
    """Əmək haqqına əlavə və kəsintilər (Bonus, cərimə, avans və s.)."""

    __tablename__ = "payroll_adjustments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payroll_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("payroll_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    type: Mapped[AdjustmentType] = mapped_column(String(30), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    approved_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


# ==========================================
# 2. PAYROLL RUNS & PAYSLIPS
# ==========================================


class PayrollRun(Base):
    """Aylıq maaş hesablama sənədi."""

    __tablename__ = "payroll_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    status: Mapped[PayrollRunStatus] = mapped_column(
        String(30), default=PayrollRunStatus.DRAFT, nullable=False, index=True
    )
    prepared_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    total_gross: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    total_employee_taxes: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    total_employer_taxes: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    total_deductions: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    total_net: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    total_employer_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )

    input_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reversal_of_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("payroll_runs.id"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    payslips: Mapped[list[Payslip]] = relationship(
        "Payslip", back_populates="payroll_run", cascade="all, delete-orphan", lazy="selectin"
    )
    branch_allocations: Mapped[list[PayrollBranchAllocation]] = relationship(
        "PayrollBranchAllocation", back_populates="payroll_run", cascade="all, delete-orphan", lazy="selectin"
    )

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("payslips", [])
        kwargs.setdefault("branch_allocations", [])
        super().__init__(**kwargs)


class Payslip(Base):
    """İşçinin fərdi maaş vərəqəsi."""

    __tablename__ = "payroll_payslips"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payroll_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("payroll_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    gross_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    employee_taxes: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    employer_taxes: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    deductions: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    payment_method: Mapped[str] = mapped_column(
        String(30), default="BANK_TRANSFER", nullable=False
    )
    masked_bank_account: Mapped[str] = mapped_column(String(50), default="***", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="AZN", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    payroll_run: Mapped[PayrollRun] = relationship("PayrollRun", back_populates="payslips")
    line_items: Mapped[list[PayslipLineItem]] = relationship(
        "PayslipLineItem", back_populates="payslip", cascade="all, delete-orphan", lazy="selectin"
    )

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("line_items", [])
        super().__init__(**kwargs)

    __table_args__ = (
        UniqueConstraint(
            "payroll_run_id", "employee_id", name="uq_payroll_payslips_run_employee"
        ),
    )


class PayslipLineItem(Base):
    """Maaş vərəqəsinin təfərrüatlı sətirləri (Baza, vergi, sığorta, kəsinti və s.)."""

    __tablename__ = "payroll_payslip_line_items"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payslip_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("payroll_payslips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped[LineItemCategory] = mapped_column(String(30), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    calculation_detail: Mapped[str | None] = mapped_column(String(255), nullable=True)

    payslip: Mapped[Payslip] = relationship("Payslip", back_populates="line_items")


class PayrollBranchAllocation(Base):
    """Filiallar üzrə xərc bölgüsü (Finance integration)."""

    __tablename__ = "payroll_branch_allocations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payroll_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("payroll_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    allocated_gross: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    allocated_taxes: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    allocated_net: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    allocated_employer_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    payroll_run: Mapped[PayrollRun] = relationship(
        "PayrollRun", back_populates="branch_allocations"
    )
