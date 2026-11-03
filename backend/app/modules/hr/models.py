"""HR (İnsan Resursları) Modulu ORM Modelləri.

Struktur:
1. Department, Position: Təşkilati struktur (ağac) və vəzifələr.
2. Employee, EmployeeSensitiveData: İşçi profili və şifrələnmiş PII məlumatları.
3. EmployeeAssignment: Vəzifə və filial təyinatı tarixçəsi.
4. EmploymentContract, EmployeeDocument: Müqavilələr və sənədlərin etibarlılıq izlənməsi.
5. ShiftTemplate, SchedulePeriod, ScheduleAssignment, ScheduleSwapRequest: Növbələr və iş cədvəli.
6. AttendancePunch, DailyAttendance, AttendanceCorrection, Timesheet: Davamiyyət və aylıq tabel.
7. LeaveType, LeaveLedgerEntry, LeaveRequest: Məzuniyyət idarəsi və append-only məzuniyyət jurnalı.
8. OffboardingChecklist: İşdən çıxış (offboarding) yoxlama siyahısı.
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
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, utc_now

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class EmployeeStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ON_LEAVE = "ON_LEAVE"
    SUSPENDED = "SUSPENDED"
    TERMINATED = "TERMINATED"


class EmploymentType(str, enum.Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACTOR = "CONTRACTOR"
    INTERN = "INTERN"


class SchedulePeriodStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    LOCKED = "LOCKED"


class SwapStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class PunchType(str, enum.Enum):
    IN = "IN"
    OUT = "OUT"
    BREAK_START = "BREAK_START"
    BREAK_END = "BREAK_END"


class PunchSource(str, enum.Enum):
    MANUAL = "MANUAL"
    DEVICE_IMPORT = "DEVICE_IMPORT"
    API = "API"


class AttendanceStatus(str, enum.Enum):
    NORMAL = "NORMAL"
    EXCEPTION = "EXCEPTION"
    CORRECTED = "CORRECTED"


class TimesheetStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    LOCKED = "LOCKED"


class LeaveEntryType(str, enum.Enum):
    ACCRUAL = "ACCRUAL"
    USAGE = "USAGE"
    ADJUSTMENT = "ADJUSTMENT"
    CARRYOVER = "CARRYOVER"
    EXPIRY = "EXPIRY"
    PAYOUT = "PAYOUT"


class LeaveRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


# ==========================================
# 1. ORG STRUCTURE
# ==========================================


class Department(Base):
    """Təşkilati struktur departamentləri (ağac strukturu)."""

    __tablename__ = "hr_departments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("hr_departments.id", ondelete="SET NULL"), nullable=True
    )
    manager_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    parent: Mapped[Department | None] = relationship(
        "Department", remote_side=[id], back_populates="children"
    )
    children: Mapped[list[Department]] = relationship(
        "Department", back_populates="parent"
    )


class Position(Base):
    """Vəzifə təsnifatı."""

    __tablename__ = "hr_positions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("hr_departments.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


# ==========================================
# 2. EMPLOYEES & SENSITIVE DATA
# ==========================================


class Employee(Base):
    """İşçi profili (ümumi açıq məlumatlar)."""

    __tablename__ = "hr_employees"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_no: Mapped[str] = mapped_column(
        String(50), nullable=False, unique=True, index=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[EmployeeStatus] = mapped_column(
        String(30), default=EmployeeStatus.ACTIVE, nullable=False, index=True
    )
    job_title: Mapped[str] = mapped_column(String(150), nullable=False)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("hr_departments.id", ondelete="SET NULL"), nullable=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, index=True
    )
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True
    )
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)
    termination_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    termination_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    employment_type: Mapped[EmploymentType] = mapped_column(
        String(30), default=EmploymentType.FULL_TIME, nullable=False
    )
    linked_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True, unique=True, index=True
    )
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_legal_hold: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_anonymized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    sensitive_data: Mapped[EmployeeSensitiveData | None] = relationship(
        "EmployeeSensitiveData", uselist=False, back_populates="employee", cascade="all, delete-orphan", lazy="selectin"
    )
    assignments: Mapped[list[EmployeeAssignment]] = relationship(
        "EmployeeAssignment", back_populates="employee", cascade="all, delete-orphan", lazy="selectin"
    )
    contracts: Mapped[list[EmploymentContract]] = relationship(
        "EmploymentContract", back_populates="employee", cascade="all, delete-orphan", lazy="selectin"
    )
    documents: Mapped[list[EmployeeDocument]] = relationship(
        "EmployeeDocument", back_populates="employee", cascade="all, delete-orphan", lazy="selectin"
    )


class EmployeeSensitiveData(Base):
    """Şifrələnmiş həssas fərdi məlumatlar (Column-Level Encryption at Rest)."""

    __tablename__ = "hr_employee_sensitive_data"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    national_id_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    bank_account_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_of_birth_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    address_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    employee: Mapped[Employee] = relationship("Employee", back_populates="sensitive_data")


class EmployeeAssignment(Base):
    """İşçinin filial, vəzifə və menecer təyinatı tarixçəsi."""

    __tablename__ = "hr_employee_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("hr_departments.id", ondelete="SET NULL"), nullable=True
    )
    job_title: Mapped[str] = mapped_column(String(150), nullable=False)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    employee: Mapped[Employee] = relationship("Employee", back_populates="assignments")


class EmploymentContract(Base):
    """Əmək müqaviləsi detalları."""

    __tablename__ = "hr_employment_contracts"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contract_no: Mapped[str] = mapped_column(String(50), nullable=False)
    contract_type: Mapped[str] = mapped_column(
        String(50), default="PERMANENT", nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    probation_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    terms_reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    employee: Mapped[Employee] = relationship("Employee", back_populates="contracts")


class EmployeeDocument(Base):
    """İşçi sənədləri və etibarlılıq müddətləri (Expiry alerts 30/14/7 days)."""

    __tablename__ = "hr_employee_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    document_name: Mapped[str] = mapped_column(String(200), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    alert_30_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    alert_14_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    alert_7_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    employee: Mapped[Employee] = relationship("Employee", back_populates="documents")


# ==========================================
# 3. SCHEDULES & SHIFTS
# ==========================================


class ShiftTemplate(Base):
    """Növbə şablonları."""

    __tablename__ = "hr_shift_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:MM
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:MM
    break_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    crosses_midnight: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class SchedulePeriod(Base):
    """Filial üzrə qrafik planlama dövrü (həftəlik / aylıq)."""

    __tablename__ = "hr_schedule_periods"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[SchedulePeriodStatus] = mapped_column(
        String(30), default=SchedulePeriodStatus.DRAFT, nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    assignments: Mapped[list[ScheduleAssignment]] = relationship(
        "ScheduleAssignment", back_populates="period", cascade="all, delete-orphan", lazy="selectin"
    )


class ScheduleAssignment(Base):
    """İşçinin konkret gün üçün növbə təyinatı."""

    __tablename__ = "hr_schedule_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    period_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_schedule_periods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift_template_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_shift_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    custom_start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    custom_end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    period: Mapped[SchedulePeriod] = relationship("SchedulePeriod", back_populates="assignments")
    shift_template: Mapped[ShiftTemplate | None] = relationship("ShiftTemplate", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("employee_id", "date", name="uq_hr_schedule_employee_date"),
    )


class ScheduleSwapRequest(Base):
    """Növbə dəyişmə sorğuları və təsdiq prosesi."""

    __tablename__ = "hr_schedule_swap_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    requester_assignment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_schedule_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_assignment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_schedule_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[SwapStatus] = mapped_column(
        String(30), default=SwapStatus.PENDING, nullable=False
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


# ==========================================
# 4. ATTENDANCE & TIMESHEETS
# ==========================================


class AttendancePunch(Base):
    """Xam giriş-çıxış qeydləri (punches)."""

    __tablename__ = "hr_attendance_punches"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    punch_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    punch_type: Mapped[PunchType] = mapped_column(
        String(30), default=PunchType.IN, nullable=False
    )
    source: Mapped[PunchSource] = mapped_column(
        String(30), default=PunchSource.MANUAL, nullable=False
    )
    device_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    raw_data: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class DailyAttendance(Base):
    """Hesablanmış gündəlik davamiyyət nəticələri."""

    __tablename__ = "hr_daily_attendance"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    planned_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    planned_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    regular_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    late_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    early_departure_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overtime_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_absent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[AttendanceStatus] = mapped_column(
        String(30), default=AttendanceStatus.NORMAL, nullable=False
    )
    exception_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rule_version: Mapped[str] = mapped_column(String(20), default="v1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    corrections: Mapped[list[AttendanceCorrection]] = relationship(
        "AttendanceCorrection", back_populates="daily_attendance", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_hr_daily_attendance_employee_date"),
    )


class AttendanceCorrection(Base):
    """Menecer tərəfindən davamiyyətə edilən düzəlişlər (Audit-backed, non-destructive)."""

    __tablename__ = "hr_attendance_corrections"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    daily_attendance_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_daily_attendance.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    corrected_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    original_values: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False)
    corrected_values: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    daily_attendance: Mapped[DailyAttendance] = relationship(
        "DailyAttendance", back_populates="corrections"
    )


class Timesheet(Base):
    """Aylıq icmal iş vaxtı uçotu tabeli."""

    __tablename__ = "hr_timesheets"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    total_regular_hours: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0.00"), nullable=False
    )
    total_overtime_hours: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0.00"), nullable=False
    )
    total_late_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_absence_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[TimesheetStatus] = mapped_column(
        String(30), default=TimesheetStatus.DRAFT, nullable=False, index=True
    )
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopen_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reopen_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "employee_id", "period_year", "period_month", name="uq_hr_timesheets_employee_period"
        ),
    )


# ==========================================
# 5. LEAVE MANAGEMENT & APPEND-ONLY LEDGER
# ==========================================


class LeaveType(Base):
    """Məzuniyyət növləri və qaydaları."""

    __tablename__ = "hr_leave_types"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    accrual_rate_per_month: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("1.75"), nullable=False
    )
    carryover_limit: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("5.00"), nullable=False
    )
    requires_attachment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class LeaveLedgerEntry(Base):
    """Məzuniyyət hərəkətləri jurnalı (Append-only). Balans buradan cəmlənir!"""

    __tablename__ = "hr_leave_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_type_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_leave_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    entry_type: Mapped[LeaveEntryType] = mapped_column(
        String(30), nullable=False, index=True
    )
    days: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), nullable=False, doc="Məzuniyyət günlərinin sayı (məs: +2.0 və ya -3.0)"
    )
    effective_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reference_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True, doc="Əlaqəli leave_request və ya job ID"
    )
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    leave_type: Mapped[LeaveType] = relationship("LeaveType", lazy="selectin")


class LeaveRequest(Base):
    """Məzuniyyət sorğuları."""

    __tablename__ = "hr_leave_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_type_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_leave_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    is_half_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    days_count: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), nullable=False
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[LeaveRequestStatus] = mapped_column(
        String(30), default=LeaveRequestStatus.PENDING, nullable=False, index=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    leave_type: Mapped[LeaveType] = relationship("LeaveType", lazy="selectin")


# ==========================================
# 6. OFFBOARDING
# ==========================================


class OffboardingChecklist(Base):
    """İşdən azad edilmə və çıxış yoxlama siyahısı."""

    __tablename__ = "hr_offboarding_checklists"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hr_employees.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    equipment_returned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    access_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    final_payroll_included: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    leave_balance_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    leave_balance_payout_days: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0.00"), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
