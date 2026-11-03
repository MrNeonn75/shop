"""HR Modulu Məlumat Bazası Əməliyyatları (HR Repository).

Dəyişməz audit, append-only məzuniyyət jurnalı və filial üzrə sorğular.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.hr.models import (
    AttendanceCorrection,
    AttendancePunch,
    DailyAttendance,
    Department,
    Employee,
    EmployeeAssignment,
    EmployeeDocument,
    EmployeeSensitiveData,
    EmployeeStatus,
    EmploymentContract,
    LeaveEntryType,
    LeaveLedgerEntry,
    LeaveRequest,
    LeaveRequestStatus,
    LeaveType,
    OffboardingChecklist,
    Position,
    ScheduleAssignment,
    SchedulePeriod,
    ScheduleSwapRequest,
    ShiftTemplate,
    Timesheet,
)


class HRRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ==========================================
    # 1. ORG STRUCTURE
    # ==========================================

    async def get_department(self, department_id: uuid.UUID) -> Department | None:
        stmt = (
            select(Department)
            .options(selectinload(Department.parent), selectinload(Department.children))
            .where(Department.id == department_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_department_by_code(self, code: str) -> Department | None:
        stmt = select(Department).where(Department.code == code)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_departments(self) -> Sequence[Department]:
        stmt = select(Department).order_by(Department.name.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_department(self, department: Department) -> Department:
        self.session.add(department)
        await self.session.flush()
        return department

    async def get_position(self, position_id: uuid.UUID) -> Position | None:
        stmt = select(Position).where(Position.id == position_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_positions(self, department_id: uuid.UUID | None = None) -> Sequence[Position]:
        stmt = select(Position)
        if department_id:
            stmt = stmt.where(Position.department_id == department_id)
        stmt = stmt.order_by(Position.title.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_position(self, position: Position) -> Position:
        self.session.add(position)
        await self.session.flush()
        return position

    # ==========================================
    # 2. EMPLOYEES & SENSITIVE DATA
    # ==========================================

    async def get_employee(self, employee_id: uuid.UUID) -> Employee | None:
        stmt = (
            select(Employee)
            .options(
                selectinload(Employee.sensitive_data),
                selectinload(Employee.assignments),
                selectinload(Employee.contracts),
                selectinload(Employee.documents),
            )
            .where(Employee.id == employee_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_employee_by_no(self, employee_no: str) -> Employee | None:
        stmt = select(Employee).where(Employee.employee_no == employee_no)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_employee_by_user_id(self, user_id: uuid.UUID) -> Employee | None:
        stmt = select(Employee).where(Employee.linked_user_id == user_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_employees(
        self,
        branch_id: uuid.UUID | None = None,
        department_id: uuid.UUID | None = None,
        status: EmployeeStatus | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[Sequence[Employee], int]:
        stmt = select(Employee)
        count_stmt = select(func.count(Employee.id))

        if branch_id:
            stmt = stmt.where(Employee.branch_id == branch_id)
            count_stmt = count_stmt.where(Employee.branch_id == branch_id)
        if department_id:
            stmt = stmt.where(Employee.department_id == department_id)
            count_stmt = count_stmt.where(Employee.department_id == department_id)
        if status:
            stmt = stmt.where(Employee.status == status)
            count_stmt = count_stmt.where(Employee.status == status)

        total_res = await self.session.execute(count_stmt)
        total = total_res.scalar_one()

        stmt = stmt.order_by(Employee.full_name.asc()).offset(skip).limit(limit)
        res = await self.session.execute(stmt)
        return res.scalars().all(), total

    async def create_employee(self, employee: Employee) -> Employee:
        self.session.add(employee)
        await self.session.flush()
        return employee

    async def get_sensitive_data(self, employee_id: uuid.UUID) -> EmployeeSensitiveData | None:
        stmt = select(EmployeeSensitiveData).where(EmployeeSensitiveData.employee_id == employee_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def save_sensitive_data(self, sensitive: EmployeeSensitiveData) -> EmployeeSensitiveData:
        self.session.add(sensitive)
        await self.session.flush()
        return sensitive

    async def add_assignment(self, assignment: EmployeeAssignment) -> EmployeeAssignment:
        self.session.add(assignment)
        await self.session.flush()
        return assignment

    async def list_assignments(self, employee_id: uuid.UUID) -> Sequence[EmployeeAssignment]:
        stmt = (
            select(EmployeeAssignment)
            .where(EmployeeAssignment.employee_id == employee_id)
            .order_by(EmployeeAssignment.valid_from.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def add_contract(self, contract: EmploymentContract) -> EmploymentContract:
        self.session.add(contract)
        await self.session.flush()
        return contract

    async def list_contracts(self, employee_id: uuid.UUID) -> Sequence[EmploymentContract]:
        stmt = (
            select(EmploymentContract)
            .where(EmploymentContract.employee_id == employee_id)
            .order_by(EmploymentContract.start_date.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def add_document(self, document: EmployeeDocument) -> EmployeeDocument:
        self.session.add(document)
        await self.session.flush()
        return document

    async def list_documents(self, employee_id: uuid.UUID) -> Sequence[EmployeeDocument]:
        stmt = (
            select(EmployeeDocument)
            .where(EmployeeDocument.employee_id == employee_id)
            .order_by(EmployeeDocument.created_at.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def get_offboarding_checklist(self, employee_id: uuid.UUID) -> OffboardingChecklist | None:
        stmt = select(OffboardingChecklist).where(OffboardingChecklist.employee_id == employee_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def save_offboarding_checklist(self, checklist: OffboardingChecklist) -> OffboardingChecklist:
        self.session.add(checklist)
        await self.session.flush()
        return checklist

    # ==========================================
    # 3. SCHEDULES & SHIFTS
    # ==========================================

    async def get_shift_template(self, template_id: uuid.UUID) -> ShiftTemplate | None:
        stmt = select(ShiftTemplate).where(ShiftTemplate.id == template_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_shift_templates(
        self, branch_id: uuid.UUID | None = None
    ) -> Sequence[ShiftTemplate]:
        stmt = select(ShiftTemplate).where(ShiftTemplate.is_active.is_(True))
        if branch_id:
            stmt = stmt.where((ShiftTemplate.branch_id == branch_id) | (ShiftTemplate.branch_id.is_(None)))
        stmt = stmt.order_by(ShiftTemplate.start_time.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_shift_template(self, template: ShiftTemplate) -> ShiftTemplate:
        self.session.add(template)
        await self.session.flush()
        return template

    async def get_schedule_period(self, period_id: uuid.UUID) -> SchedulePeriod | None:
        stmt = (
            select(SchedulePeriod)
            .options(
                selectinload(SchedulePeriod.assignments).selectinload(ScheduleAssignment.shift_template)
            )
            .where(SchedulePeriod.id == period_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_schedule_periods(
        self, branch_id: uuid.UUID | None = None
    ) -> Sequence[SchedulePeriod]:
        stmt = select(SchedulePeriod)
        if branch_id:
            stmt = stmt.where(SchedulePeriod.branch_id == branch_id)
        stmt = stmt.order_by(SchedulePeriod.start_date.desc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_schedule_period(self, period: SchedulePeriod) -> SchedulePeriod:
        self.session.add(period)
        await self.session.flush()
        return period

    async def get_assignment(self, assignment_id: uuid.UUID) -> ScheduleAssignment | None:
        stmt = (
            select(ScheduleAssignment)
            .options(selectinload(ScheduleAssignment.shift_template))
            .where(ScheduleAssignment.id == assignment_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_assignment_by_date(
        self, employee_id: uuid.UUID, work_date: date
    ) -> ScheduleAssignment | None:
        stmt = (
            select(ScheduleAssignment)
            .options(selectinload(ScheduleAssignment.shift_template))
            .where(
                ScheduleAssignment.employee_id == employee_id,
                ScheduleAssignment.date == work_date,
            )
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_assignments_for_employee(
        self, employee_id: uuid.UUID, start_date: date, end_date: date
    ) -> Sequence[ScheduleAssignment]:
        stmt = (
            select(ScheduleAssignment)
            .options(selectinload(ScheduleAssignment.shift_template))
            .where(
                ScheduleAssignment.employee_id == employee_id,
                ScheduleAssignment.date >= start_date,
                ScheduleAssignment.date <= end_date,
            )
            .order_by(ScheduleAssignment.date.asc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_schedule_assignment(
        self, assignment: ScheduleAssignment
    ) -> ScheduleAssignment:
        self.session.add(assignment)
        await self.session.flush()
        return assignment

    async def create_schedule_assignments_bulk(
        self, assignments: list[ScheduleAssignment]
    ) -> list[ScheduleAssignment]:
        self.session.add_all(assignments)
        await self.session.flush()
        return assignments

    async def get_swap_request(self, swap_id: uuid.UUID) -> ScheduleSwapRequest | None:
        stmt = select(ScheduleSwapRequest).where(ScheduleSwapRequest.id == swap_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_swap_request(self, swap: ScheduleSwapRequest) -> ScheduleSwapRequest:
        self.session.add(swap)
        await self.session.flush()
        return swap

    # ==========================================
    # 4. ATTENDANCE & TIMESHEETS
    # ==========================================

    async def create_punch(self, punch: AttendancePunch) -> AttendancePunch:
        self.session.add(punch)
        await self.session.flush()
        return punch

    async def list_punches(
        self, employee_id: uuid.UUID, start_dt: datetime, end_dt: datetime
    ) -> Sequence[AttendancePunch]:
        stmt = (
            select(AttendancePunch)
            .where(
                AttendancePunch.employee_id == employee_id,
                AttendancePunch.punch_time >= start_dt,
                AttendancePunch.punch_time <= end_dt,
            )
            .order_by(AttendancePunch.punch_time.asc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def get_daily_attendance(self, da_id: uuid.UUID) -> DailyAttendance | None:
        stmt = (
            select(DailyAttendance)
            .options(selectinload(DailyAttendance.corrections))
            .where(DailyAttendance.id == da_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_daily_attendance_by_date(
        self, employee_id: uuid.UUID, work_date: date
    ) -> DailyAttendance | None:
        stmt = (
            select(DailyAttendance)
            .options(selectinload(DailyAttendance.corrections))
            .where(
                DailyAttendance.employee_id == employee_id,
                DailyAttendance.work_date == work_date,
            )
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_daily_attendance(
        self, employee_id: uuid.UUID, start_date: date, end_date: date
    ) -> Sequence[DailyAttendance]:
        stmt = (
            select(DailyAttendance)
            .options(selectinload(DailyAttendance.corrections))
            .where(
                DailyAttendance.employee_id == employee_id,
                DailyAttendance.work_date >= start_date,
                DailyAttendance.work_date <= end_date,
            )
            .order_by(DailyAttendance.work_date.asc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_daily_attendance(self, da: DailyAttendance) -> DailyAttendance:
        self.session.add(da)
        await self.session.flush()
        return da

    async def create_correction(self, correction: AttendanceCorrection) -> AttendanceCorrection:
        self.session.add(correction)
        await self.session.flush()
        return correction

    async def get_timesheet(self, timesheet_id: uuid.UUID) -> Timesheet | None:
        stmt = select(Timesheet).where(Timesheet.id == timesheet_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_timesheet_by_period(
        self, employee_id: uuid.UUID, year: int, month: int
    ) -> Timesheet | None:
        stmt = select(Timesheet).where(
            Timesheet.employee_id == employee_id,
            Timesheet.period_year == year,
            Timesheet.period_month == month,
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def save_timesheet(self, ts: Timesheet) -> Timesheet:
        self.session.add(ts)
        await self.session.flush()
        return ts

    # ==========================================
    # 5. LEAVE MANAGEMENT & DERIVED BALANCE
    # ==========================================

    async def get_leave_type(self, leave_type_id: uuid.UUID) -> LeaveType | None:
        stmt = select(LeaveType).where(LeaveType.id == leave_type_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_leave_type_by_code(self, code: str) -> LeaveType | None:
        stmt = select(LeaveType).where(LeaveType.code == code)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_leave_types(self) -> Sequence[LeaveType]:
        stmt = select(LeaveType).where(LeaveType.is_active.is_(True)).order_by(LeaveType.name.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_leave_type(self, lt: LeaveType) -> LeaveType:
        self.session.add(lt)
        await self.session.flush()
        return lt

    async def add_leave_ledger_entry(self, entry: LeaveLedgerEntry) -> LeaveLedgerEntry:
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def get_leave_balance(
        self, employee_id: uuid.UUID, leave_type_id: uuid.UUID
    ) -> tuple[Decimal, Decimal, Decimal]:
        """Append-only məzuniyyət balansını hesablayır (Accrued, Used, Balance)."""
        stmt = select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            LeaveLedgerEntry.entry_type.in_(
                                [LeaveEntryType.ACCRUAL, LeaveEntryType.CARRYOVER]
                            ),
                            LeaveLedgerEntry.days,
                        ),
                        (
                            (LeaveLedgerEntry.entry_type == LeaveEntryType.ADJUSTMENT)
                            & (LeaveLedgerEntry.days > 0),
                            LeaveLedgerEntry.days,
                        ),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ).label("accrued"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            LeaveLedgerEntry.entry_type.in_(
                                [LeaveEntryType.USAGE, LeaveEntryType.EXPIRY, LeaveEntryType.PAYOUT]
                            ),
                            func.abs(LeaveLedgerEntry.days),
                        ),
                        (
                            (LeaveLedgerEntry.entry_type == LeaveEntryType.ADJUSTMENT)
                            & (LeaveLedgerEntry.days < 0),
                            func.abs(LeaveLedgerEntry.days),
                        ),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ).label("used"),
        ).where(
            LeaveLedgerEntry.employee_id == employee_id,
            LeaveLedgerEntry.leave_type_id == leave_type_id,
        )
        res = await self.session.execute(stmt)
        row = res.one()
        accrued = Decimal(str(row.accrued))
        used = Decimal(str(row.used))
        balance = accrued - used
        return accrued, used, balance

    async def get_leave_request(self, request_id: uuid.UUID) -> LeaveRequest | None:
        stmt = (
            select(LeaveRequest)
            .options(selectinload(LeaveRequest.leave_type))
            .where(LeaveRequest.id == request_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_leave_requests(
        self,
        employee_id: uuid.UUID | None = None,
        status: LeaveRequestStatus | None = None,
    ) -> Sequence[LeaveRequest]:
        stmt = select(LeaveRequest).options(selectinload(LeaveRequest.leave_type))
        if employee_id:
            stmt = stmt.where(LeaveRequest.employee_id == employee_id)
        if status:
            stmt = stmt.where(LeaveRequest.status == status)
        stmt = stmt.order_by(LeaveRequest.start_date.desc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_leave_request(self, req: LeaveRequest) -> LeaveRequest:
        self.session.add(req)
        await self.session.flush()
        return req
