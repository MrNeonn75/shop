"""Əmək Haqqı (Payroll) Sxemləri (Pydantic Schemas)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.payroll.models import (
    AdjustmentType,
    CompensationModel,
    LineItemCategory,
    PayrollRunStatus,
)

# ==========================================
# 1. SALARY PROFILES & RULES
# ==========================================


class SalaryProfileCreate(BaseModel):
    employee_id: uuid.UUID
    effective_date: date
    compensation_model: CompensationModel = CompensationModel.FIXED
    currency: str = "AZN"
    base_salary: Decimal = Field(default=Decimal("0.00"), ge=0)
    hourly_rate: Decimal = Field(default=Decimal("0.00"), ge=0)


class SalaryProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    version: int
    effective_date: date
    compensation_model: CompensationModel
    currency: str
    base_salary: Decimal
    hourly_rate: Decimal
    is_active: bool
    created_at: datetime


class PayrollRuleSetCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    version: int = 1
    effective_date: date
    rules_config: dict[str, Any] = Field(default_factory=dict)


class PayrollRuleSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    version: int
    effective_date: date
    rules_config: dict[str, Any]
    is_active: bool
    created_at: datetime


class PayrollAdjustmentCreate(BaseModel):
    employee_id: uuid.UUID
    payroll_run_id: uuid.UUID | None = None
    type: AdjustmentType
    amount: Decimal
    description: str = Field(..., min_length=3, max_length=255)


class PayrollAdjustmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    payroll_run_id: uuid.UUID | None = None
    type: AdjustmentType
    amount: Decimal
    description: str
    approved_by: uuid.UUID
    created_at: datetime


# ==========================================
# 2. RUNS & PAYSLIPS
# ==========================================


class PayrollRunCreate(BaseModel):
    period_start: date
    period_end: date
    branch_id: uuid.UUID | None = None


class PayslipLineItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: LineItemCategory
    code: str
    name: str
    amount: Decimal
    calculation_detail: str | None = None


class PayslipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    payroll_run_id: uuid.UUID
    employee_id: uuid.UUID
    gross_pay: Decimal
    net_pay: Decimal
    employee_taxes: Decimal
    employer_taxes: Decimal
    deductions: Decimal
    payment_method: str
    masked_bank_account: str
    currency: str
    created_at: datetime
    line_items: list[PayslipLineItemResponse] = Field(default_factory=list)


class PayrollBranchAllocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    payroll_run_id: uuid.UUID
    branch_id: uuid.UUID
    allocated_gross: Decimal
    allocated_taxes: Decimal
    allocated_net: Decimal
    allocated_employer_cost: Decimal


class PayrollRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_no: str
    period_start: date
    period_end: date
    branch_id: uuid.UUID | None = None
    status: PayrollRunStatus
    prepared_by: uuid.UUID | None = None
    approved_by: uuid.UUID | None = None
    approved_at: datetime | None = None
    total_gross: Decimal
    total_employee_taxes: Decimal
    total_employer_taxes: Decimal
    total_deductions: Decimal
    total_net: Decimal
    total_employer_cost: Decimal
    input_hash: str | None = None
    reversal_of_run_id: uuid.UUID | None = None
    version: int
    created_at: datetime
    updated_at: datetime
    branch_allocations: list[PayrollBranchAllocationResponse] = Field(default_factory=list)
    payslips: list[PayslipResponse] = Field(default_factory=list)


class BankPaymentExportResponse(BaseModel):
    filename: str
    content: str
    total_records: int
    total_amount: Decimal
