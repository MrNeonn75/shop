"""HR Modulu Pydantic Sxemləri (Schemas).

API sorğu və cavab modelləri, validasiyalar və həssas məlumatların maskalanması.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.hr.models import (
    AttendanceStatus,
    EmployeeStatus,
    EmploymentType,
    LeaveEntryType,
    LeaveRequestStatus,
    PunchSource,
    PunchType,
    SchedulePeriodStatus,
    SwapStatus,
    TimesheetStatus,
)

# ==========================================
# 1. ORG STRUCTURE
# ==========================================


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    code: str = Field(..., min_length=2, max_length=50)
    parent_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = None
    manager_id: uuid.UUID | None = None
    is_active: bool | None = None


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    parent_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PositionCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    code: str = Field(..., min_length=2, max_length=50)
    department_id: uuid.UUID | None = None
    description: str | None = None
    requirements: str | None = None


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    code: str
    department_id: uuid.UUID | None = None
    description: str | None = None
    requirements: str | None = None
    is_active: bool
    created_at: datetime


# ==========================================
# 2. EMPLOYEES & SENSITIVE DATA
# ==========================================


class EmployeeCreate(BaseModel):
    employee_no: str = Field(..., min_length=2, max_length=50)
    full_name: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    phone: str = Field(..., min_length=5, max_length=50)
    job_title: str = Field(..., min_length=2, max_length=150)
    department_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    hire_date: date
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    linked_user_id: uuid.UUID | None = None
    photo_url: str | None = None

    # Həssas məlumatlar (şifrələnəcək)
    national_id: str | None = None
    bank_account: str | None = None
    date_of_birth: str | None = None
    home_address: str | None = None
    emergency_contact: str | None = None


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    job_title: str | None = None
    department_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    employment_type: EmploymentType | None = None
    photo_url: str | None = None
    is_legal_hold: bool | None = None

    # Həssas məlumatlar yenilənməsi
    national_id: str | None = None
    bank_account: str | None = None
    date_of_birth: str | None = None
    home_address: str | None = None
    emergency_contact: str | None = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_no: str
    full_name: str
    email: str
    phone: str
    status: EmployeeStatus
    job_title: str
    department_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    hire_date: date
    termination_date: date | None = None
    termination_reason: str | None = None
    employment_type: EmploymentType
    linked_user_id: uuid.UUID | None = None
    photo_url: str | None = None
    is_legal_hold: bool
    is_anonymized: bool
    version: int
    created_at: datetime
    updated_at: datetime

    # Maskalanmış məlumatlar (Public safe)
    masked_national_id: str = "***"
    masked_bank_account: str = "***"
    masked_address: str = "***"


class EmployeeRevealPIIRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500, description="PII məlumatlarının açılması üçün səbəb")


class EmployeeRevealPIIResponse(BaseModel):
    employee_id: uuid.UUID
    national_id: str | None = None
    bank_account: str | None = None
    date_of_birth: str | None = None
    home_address: str | None = None
    emergency_contact: str | None = None
    revealed_at: datetime
    revealed_by: str


class EmployeeTerminateRequest(BaseModel):
    termination_date: date
    reason: str = Field(..., min_length=3, max_length=500)


class EmployeeAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    branch_id: uuid.UUID
    department_id: uuid.UUID | None = None
    job_title: str
    manager_id: uuid.UUID | None = None
    valid_from: date
    valid_to: date | None = None
    created_at: datetime


class EmploymentContractCreate(BaseModel):
    contract_no: str = Field(..., min_length=2, max_length=50)
    contract_type: str = "PERMANENT"
    start_date: date
    end_date: date | None = None
    probation_end_date: date | None = None
    terms_reference: str | None = None
    document_url: str | None = None


class EmploymentContractResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    contract_no: str
    contract_type: str
    start_date: date
    end_date: date | None = None
    probation_end_date: date | None = None
    terms_reference: str | None = None
    document_url: str | None = None
    created_at: datetime


class EmployeeDocumentCreate(BaseModel):
    document_type: str = Field(..., min_length=2, max_length=50)
    document_name: str = Field(..., min_length=2, max_length=200)
    file_url: str = Field(..., min_length=5, max_length=500)
    expiry_date: date | None = None


class EmployeeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    document_type: str
    document_name: str
    file_url: str
    expiry_date: date | None = None
    created_at: datetime


# ==========================================
# 3. SCHEDULES & SHIFTS
# ==========================================


class ShiftTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=50)
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    break_minutes: int = 60
    crosses_midnight: bool = False
    branch_id: uuid.UUID | None = None


class ShiftTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    start_time: str
    end_time: str
    break_minutes: int
    crosses_midnight: bool
    branch_id: uuid.UUID | None = None
    is_active: bool
    created_at: datetime


class SchedulePeriodCreate(BaseModel):
    branch_id: uuid.UUID
    name: str = Field(..., min_length=2, max_length=100)
    start_date: date
    end_date: date


class SchedulePeriodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    branch_id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    status: SchedulePeriodStatus
    published_at: datetime | None = None
    published_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class ScheduleAssignmentItem(BaseModel):
    employee_id: uuid.UUID
    date: date
    shift_template_id: uuid.UUID | None = None
    custom_start_time: str | None = None
    custom_end_time: str | None = None
    notes: str | None = None


class ScheduleAssignmentBulkCreate(BaseModel):
    assignments: list[ScheduleAssignmentItem]


class ScheduleAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    period_id: uuid.UUID
    employee_id: uuid.UUID
    branch_id: uuid.UUID
    date: date
    shift_template_id: uuid.UUID | None = None
    custom_start_time: str | None = None
    custom_end_time: str | None = None
    notes: str | None = None
    created_at: datetime


class ScheduleValidationResult(BaseModel):
    is_valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ScheduleSwapCreate(BaseModel):
    requester_assignment_id: uuid.UUID
    target_assignment_id: uuid.UUID
    reason: str | None = None


class ScheduleSwapDecision(BaseModel):
    approve: bool
    reason: str | None = None


class ScheduleSwapResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requester_assignment_id: uuid.UUID
    target_assignment_id: uuid.UUID
    status: SwapStatus
    reason: str | None = None
    approved_by: uuid.UUID | None = None
    approved_at: datetime | None = None
    created_at: datetime


# ==========================================
# 4. ATTENDANCE & TIMESHEETS
# ==========================================


class AttendancePunchCreate(BaseModel):
    employee_id: uuid.UUID
    punch_time: datetime
    punch_type: PunchType = PunchType.IN
    source: PunchSource = PunchSource.MANUAL
    device_id: str | None = None
    raw_data: dict[str, Any] | None = None


class AttendancePunchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    punch_time: datetime
    punch_type: PunchType
    source: PunchSource
    device_id: str | None = None
    created_at: datetime


class DailyAttendanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    work_date: date
    planned_start: datetime | None = None
    planned_end: datetime | None = None
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    regular_minutes: int
    late_minutes: int
    early_departure_minutes: int
    overtime_minutes: int
    is_absent: bool
    status: AttendanceStatus
    exception_reason: str | None = None
    rule_version: str
    created_at: datetime


class AttendanceCorrectionCreate(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    regular_minutes: int | None = None
    overtime_minutes: int | None = None
    is_absent: bool | None = None


class AttendanceCorrectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    daily_attendance_id: uuid.UUID
    corrected_by: uuid.UUID
    reason: str
    original_values: dict[str, Any]
    corrected_values: dict[str, Any]
    created_at: datetime


class TimesheetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    period_year: int
    period_month: int
    total_regular_hours: Decimal
    total_overtime_hours: Decimal
    total_late_minutes: int
    total_absence_days: int
    status: TimesheetStatus
    submitted_by: uuid.UUID | None = None
    approved_by: uuid.UUID | None = None
    locked_at: datetime | None = None
    reopen_reason: str | None = None
    created_at: datetime


class TimesheetReopenRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


# ==========================================
# 5. LEAVE MANAGEMENT & LEDGER
# ==========================================


class LeaveTypeCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    is_paid: bool = True
    accrual_rate_per_month: Decimal = Decimal("1.75")
    carryover_limit: Decimal = Decimal("5.00")
    requires_attachment: bool = False


class LeaveTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    is_paid: bool
    accrual_rate_per_month: Decimal
    carryover_limit: Decimal
    requires_attachment: bool
    is_active: bool
    created_at: datetime


class LeaveBalanceResponse(BaseModel):
    leave_type_id: uuid.UUID
    leave_type_code: str
    leave_type_name: str
    accrued_days: Decimal
    used_days: Decimal
    current_balance: Decimal


class LeaveRequestCreate(BaseModel):
    employee_id: uuid.UUID
    leave_type_id: uuid.UUID
    start_date: date
    end_date: date
    is_half_day: bool = False
    days_count: Decimal = Field(..., gt=0)
    reason: str | None = None
    attachment_url: str | None = None


class LeaveRequestDecision(BaseModel):
    approve: bool
    rejection_reason: str | None = None


class LeaveRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    leave_type_id: uuid.UUID
    start_date: date
    end_date: date
    is_half_day: bool
    days_count: Decimal
    reason: str | None = None
    attachment_url: str | None = None
    status: LeaveRequestStatus
    approved_by: uuid.UUID | None = None
    approved_at: datetime | None = None
    rejection_reason: str | None = None
    created_at: datetime


class LeaveLedgerEntryCreate(BaseModel):
    employee_id: uuid.UUID
    leave_type_id: uuid.UUID
    entry_type: LeaveEntryType = LeaveEntryType.ADJUSTMENT
    days: Decimal
    effective_date: date
    notes: str = Field(..., min_length=3, max_length=255)


class LeaveLedgerEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    leave_type_id: uuid.UUID
    entry_type: LeaveEntryType
    days: Decimal
    effective_date: date
    reference_id: str | None = None
    notes: str | None = None
    created_at: datetime


# ==========================================
# 6. OFFBOARDING
# ==========================================


class OffboardingChecklistUpdate(BaseModel):
    equipment_returned: bool | None = None
    access_revoked: bool | None = None
    final_payroll_included: bool | None = None
    leave_balance_paid: bool | None = None
    notes: str | None = None


class OffboardingChecklistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    equipment_returned: bool
    access_revoked: bool
    final_payroll_included: bool
    leave_balance_paid: bool
    leave_balance_payout_days: Decimal
    completed_at: datetime | None = None
    completed_by: uuid.UUID | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
