"""HR Modulu REST API Marşrutları (HR Endpoints)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Query, Request, status

from app.core.uow import UnitOfWork
from app.modules.hr.models import EmployeeStatus, LeaveRequestStatus
from app.modules.hr.schemas import (
    AttendanceCorrectionCreate,
    AttendanceCorrectionResponse,
    AttendancePunchCreate,
    AttendancePunchResponse,
    DailyAttendanceResponse,
    DepartmentCreate,
    DepartmentResponse,
    EmployeeCreate,
    EmployeeDocumentCreate,
    EmployeeDocumentResponse,
    EmployeeResponse,
    EmployeeRevealPIIRequest,
    EmployeeRevealPIIResponse,
    EmployeeTerminateRequest,
    EmployeeUpdate,
    EmploymentContractCreate,
    EmploymentContractResponse,
    LeaveBalanceResponse,
    LeaveLedgerEntryCreate,
    LeaveLedgerEntryResponse,
    LeaveRequestCreate,
    LeaveRequestDecision,
    LeaveRequestResponse,
    LeaveTypeCreate,
    LeaveTypeResponse,
    OffboardingChecklistResponse,
    OffboardingChecklistUpdate,
    PositionCreate,
    PositionResponse,
    ScheduleAssignmentBulkCreate,
    ScheduleAssignmentResponse,
    SchedulePeriodCreate,
    SchedulePeriodResponse,
    ScheduleSwapCreate,
    ScheduleSwapDecision,
    ScheduleSwapResponse,
    ShiftTemplateCreate,
    ShiftTemplateResponse,
    TimesheetReopenRequest,
    TimesheetResponse,
)
from app.modules.hr.service import HRService

router = APIRouter(prefix="/hr", tags=["HR və Kadrlar"])


def get_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


# ==========================================
# 1. ORG STRUCTURE
# ==========================================


@router.post(
    "/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Departament Yarat",
)
async def create_department(request: Request, data: DepartmentCreate) -> DepartmentResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        dep = await service.employees.create_department(data)
        return DepartmentResponse.model_validate(dep)


@router.get(
    "/departments",
    response_model=list[DepartmentResponse],
    summary="Departamentlərin Siyahısı",
)
async def list_departments(request: Request) -> list[DepartmentResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        deps = await service.employees.list_departments()
        return [DepartmentResponse.model_validate(d) for d in deps]


@router.post(
    "/positions",
    response_model=PositionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Vəzifə Yarat",
)
async def create_position(request: Request, data: PositionCreate) -> PositionResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        pos = await service.employees.create_position(data)
        return PositionResponse.model_validate(pos)


@router.get(
    "/positions",
    response_model=list[PositionResponse],
    summary="Vəzifələrin Siyahısı",
)
async def list_positions(
    request: Request,
    department_id: uuid.UUID | None = None,
) -> list[PositionResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        positions = await service.employees.list_positions(department_id)
        return [PositionResponse.model_validate(p) for p in positions]


# ==========================================
# 2. EMPLOYEES & PII
# ==========================================


@router.post(
    "/employees",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni İşçi Qeydiyyatı",
)
async def create_employee(request: Request, data: EmployeeCreate) -> EmployeeResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        return await service.employees.create_employee(data, actor)


@router.get(
    "/employees",
    response_model=list[EmployeeResponse],
    summary="İşçilərin Siyahısı (Maskalanmış PII)",
)
async def list_employees(
    request: Request,
    branch_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    status_: EmployeeStatus | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> list[EmployeeResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        employees, _ = await service.employees.list_employees(
            actor, branch_id, department_id, status_, skip, limit
        )
        return employees


@router.get(
    "/employees/{employee_id}",
    response_model=EmployeeResponse,
    summary="İşçi Təfərrüatları (Maskalanmış PII)",
)
async def get_employee(request: Request, employee_id: uuid.UUID) -> EmployeeResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        return await service.employees.get_employee(employee_id, actor)


@router.patch(
    "/employees/{employee_id}",
    response_model=EmployeeResponse,
    summary="İşçi Məlumatlarını Yenilə",
)
async def update_employee(
    request: Request, employee_id: uuid.UUID, data: EmployeeUpdate
) -> EmployeeResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        return await service.employees.update_employee(employee_id, data, actor)


@router.post(
    "/employees/{employee_id}/reveal-pii",
    response_model=EmployeeRevealPIIResponse,
    summary="Həssas PII Məlumatlarını Aç (Audit Qeydiyyatı ilə)",
)
async def reveal_employee_pii(
    request: Request, employee_id: uuid.UUID, data: EmployeeRevealPIIRequest
) -> EmployeeRevealPIIResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        return await service.employees.reveal_pii(employee_id, data.reason, actor)


@router.post(
    "/employees/{employee_id}/terminate",
    response_model=EmployeeResponse,
    summary="İşçini İşdən Azad Et (Offboarding Başlat)",
)
async def terminate_employee(
    request: Request, employee_id: uuid.UUID, data: EmployeeTerminateRequest
) -> EmployeeResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        return await service.employees.terminate_employee(employee_id, data, actor)


@router.get(
    "/employees/{employee_id}/offboarding",
    response_model=OffboardingChecklistResponse,
    summary="İşdən Çıxış Yoxlama Siyahısı",
)
async def get_offboarding_checklist(
    request: Request, employee_id: uuid.UUID
) -> OffboardingChecklistResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        checklist = await service.employees.repo.get_offboarding_checklist(employee_id)
        if not checklist:
            checklist = await service.employees.update_offboarding_checklist(
                employee_id, OffboardingChecklistUpdate(), actor
            )
        return OffboardingChecklistResponse.model_validate(checklist)


@router.patch(
    "/employees/{employee_id}/offboarding",
    response_model=OffboardingChecklistResponse,
    summary="İşdən Çıxış Siyahısını Yenilə",
)
async def update_offboarding_checklist(
    request: Request, employee_id: uuid.UUID, data: OffboardingChecklistUpdate
) -> OffboardingChecklistResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        checklist = await service.employees.update_offboarding_checklist(employee_id, data, actor)
        return OffboardingChecklistResponse.model_validate(checklist)


@router.post(
    "/employees/{employee_id}/contracts",
    response_model=EmploymentContractResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Əmək Müqaviləsi Əlavə Et",
)
async def add_contract(
    request: Request, employee_id: uuid.UUID, data: EmploymentContractCreate
) -> EmploymentContractResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        ctr = await service.employees.add_contract(employee_id, data, actor)
        return EmploymentContractResponse.model_validate(ctr)


@router.get(
    "/employees/{employee_id}/contracts",
    response_model=list[EmploymentContractResponse],
    summary="İşçinin Müqavilələri",
)
async def list_contracts(
    request: Request, employee_id: uuid.UUID
) -> list[EmploymentContractResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        ctrs = await service.employees.list_contracts(employee_id, actor)
        return [EmploymentContractResponse.model_validate(c) for c in ctrs]


@router.post(
    "/employees/{employee_id}/documents",
    response_model=EmployeeDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="İşçi Sənədi Əlavə Et",
)
async def add_document(
    request: Request, employee_id: uuid.UUID, data: EmployeeDocumentCreate
) -> EmployeeDocumentResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        doc = await service.employees.add_document(employee_id, data, actor)
        return EmployeeDocumentResponse.model_validate(doc)


@router.get(
    "/employees/{employee_id}/documents",
    response_model=list[EmployeeDocumentResponse],
    summary="İşçinin Sənədləri",
)
async def list_documents(
    request: Request, employee_id: uuid.UUID
) -> list[EmployeeDocumentResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        docs = await service.employees.list_documents(employee_id, actor)
        return [EmployeeDocumentResponse.model_validate(d) for d in docs]


# ==========================================
# 3. SCHEDULES & SHIFTS
# ==========================================


@router.post(
    "/shift-templates",
    response_model=ShiftTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Növbə Şablonu Yarat",
)
async def create_shift_template(
    request: Request, data: ShiftTemplateCreate
) -> ShiftTemplateResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        tpl = await service.schedules.create_shift_template(data, actor)
        return ShiftTemplateResponse.model_validate(tpl)


@router.get(
    "/shift-templates",
    response_model=list[ShiftTemplateResponse],
    summary="Növbə Şablonlarının Siyahısı",
)
async def list_shift_templates(
    request: Request, branch_id: uuid.UUID | None = None
) -> list[ShiftTemplateResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        tpls = await service.schedules.list_shift_templates(actor, branch_id)
        return [ShiftTemplateResponse.model_validate(t) for t in tpls]


@router.post(
    "/schedules/periods",
    response_model=SchedulePeriodResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cədvəl Planlama Dövrü Yarat",
)
async def create_schedule_period(
    request: Request, data: SchedulePeriodCreate
) -> SchedulePeriodResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        period = await service.schedules.create_schedule_period(data, actor)
        return SchedulePeriodResponse.model_validate(period)


@router.get(
    "/schedules/periods",
    response_model=list[SchedulePeriodResponse],
    summary="Cədvəl Dövrlərinin Siyahısı",
)
async def list_schedule_periods(
    request: Request, branch_id: uuid.UUID | None = None
) -> list[SchedulePeriodResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        periods = await service.schedules.list_schedule_periods(actor, branch_id)
        return [SchedulePeriodResponse.model_validate(p) for p in periods]


@router.get(
    "/schedules/periods/{period_id}",
    response_model=SchedulePeriodResponse,
    summary="Cədvəl Dövrü Təfərrüatları",
)
async def get_schedule_period(
    request: Request, period_id: uuid.UUID
) -> SchedulePeriodResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        period = await service.schedules.get_schedule_period(period_id, actor)
        return SchedulePeriodResponse.model_validate(period)


@router.post(
    "/schedules/periods/{period_id}/assignments-bulk",
    response_model=list[ScheduleAssignmentResponse],
    summary="Növbələrin Toplu Təyini (Validasiya ilə)",
)
async def assign_shifts_bulk(
    request: Request, period_id: uuid.UUID, data: ScheduleAssignmentBulkCreate
) -> list[ScheduleAssignmentResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        assignments = await service.schedules.assign_shifts_bulk(period_id, data, actor)
        return [ScheduleAssignmentResponse.model_validate(a) for a in assignments]


@router.post(
    "/schedules/periods/{period_id}/copy-from/{source_period_id}",
    response_model=list[ScheduleAssignmentResponse],
    summary="Əvvəlki Dövrün Qrafikini Kopyala",
)
async def copy_schedule_period(
    request: Request, period_id: uuid.UUID, source_period_id: uuid.UUID
) -> list[ScheduleAssignmentResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        copied = await service.schedules.copy_previous_period(source_period_id, period_id, actor)
        return [ScheduleAssignmentResponse.model_validate(a) for a in copied]


@router.post(
    "/schedules/periods/{period_id}/publish",
    response_model=SchedulePeriodResponse,
    summary="Cədvəli Dərc Et (Publish)",
)
async def publish_schedule_period(
    request: Request, period_id: uuid.UUID
) -> SchedulePeriodResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        period = await service.schedules.publish_period(period_id, actor)
        return SchedulePeriodResponse.model_validate(period)


@router.post(
    "/schedules/periods/{period_id}/lock",
    response_model=SchedulePeriodResponse,
    summary="Cədvəli Kilidlə (Lock)",
)
async def lock_schedule_period(
    request: Request, period_id: uuid.UUID
) -> SchedulePeriodResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        period = await service.schedules.lock_period(period_id, actor)
        return SchedulePeriodResponse.model_validate(period)


@router.get(
    "/schedules/my-schedule",
    response_model=list[ScheduleAssignmentResponse],
    summary="İşçinin Öz Qrafiki (Self-Service)",
)
async def get_my_schedule(
    request: Request,
    start_date: date,
    end_date: date,
    employee_id: uuid.UUID | None = None,
) -> list[ScheduleAssignmentResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        target_emp_id = employee_id
        if not target_emp_id and actor and getattr(actor, "id", None):
            emp = await service.employees.repo.get_employee_by_user_id(actor.id)
            if emp:
                target_emp_id = emp.id
        if not target_emp_id:
            return []
        assignments = await service.schedules.get_my_schedule(target_emp_id, start_date, end_date)
        return [ScheduleAssignmentResponse.model_validate(a) for a in assignments]


@router.post(
    "/schedules/swap-requests",
    response_model=ScheduleSwapResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Növbə Dəyişmə Sorğusu Ver",
)
async def request_schedule_swap(
    request: Request, data: ScheduleSwapCreate
) -> ScheduleSwapResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        swap = await service.schedules.request_swap(data, actor)
        return ScheduleSwapResponse.model_validate(swap)


@router.post(
    "/schedules/swap-requests/{swap_id}/decision",
    response_model=ScheduleSwapResponse,
    summary="Növbə Dəyişmə Sorğusuna Qərar Ver",
)
async def decide_schedule_swap(
    request: Request, swap_id: uuid.UUID, data: ScheduleSwapDecision
) -> ScheduleSwapResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        swap = await service.schedules.decide_swap(swap_id, data, actor)
        return ScheduleSwapResponse.model_validate(swap)


# ==========================================
# 4. ATTENDANCE & TIMESHEETS
# ==========================================


@router.post(
    "/attendance/punches",
    response_model=AttendancePunchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Giriş-Çıxış Qeydi Vur (Punch In/Out)",
)
async def record_attendance_punch(
    request: Request, data: AttendancePunchCreate
) -> AttendancePunchResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        punch = await service.attendance.record_punch(data, actor)
        return AttendancePunchResponse.model_validate(punch)


@router.get(
    "/attendance/daily",
    response_model=list[DailyAttendanceResponse],
    summary="Gündəlik Davamiyyət Qeydləri",
)
async def list_daily_attendance(
    request: Request,
    employee_id: uuid.UUID,
    start_date: date,
    end_date: date,
) -> list[DailyAttendanceResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        records = await service.attendance.repo.list_daily_attendance(
            employee_id, start_date, end_date
        )
        return [DailyAttendanceResponse.model_validate(r) for r in records]


@router.post(
    "/attendance/daily/{daily_attendance_id}/corrections",
    response_model=AttendanceCorrectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Davamiyyət Kənarlaşmasına Düzəliş Et",
)
async def correct_attendance(
    request: Request,
    daily_attendance_id: uuid.UUID,
    data: AttendanceCorrectionCreate,
) -> AttendanceCorrectionResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        corr = await service.attendance.correct_attendance(daily_attendance_id, data, actor)
        return AttendanceCorrectionResponse.model_validate(corr)


@router.post(
    "/attendance/timesheets/generate",
    response_model=TimesheetResponse,
    summary="Aylıq Tabeli Formalaşdır / Yenidən Hesabla",
)
async def generate_timesheet(
    request: Request,
    employee_id: uuid.UUID,
    year: int = Query(..., ge=2020, le=2050),
    month: int = Query(..., ge=1, le=12),
) -> TimesheetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        ts = await service.attendance.generate_timesheet(employee_id, year, month, actor)
        return TimesheetResponse.model_validate(ts)


@router.get(
    "/attendance/timesheets/{timesheet_id}",
    response_model=TimesheetResponse,
    summary="Tabel Təfərrüatları",
)
async def get_timesheet(
    request: Request,
    timesheet_id: uuid.UUID,
) -> TimesheetResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        ts = await service.attendance.repo.get_timesheet(timesheet_id)
        return TimesheetResponse.model_validate(ts)


@router.post(
    "/attendance/timesheets/{timesheet_id}/submit",
    response_model=TimesheetResponse,
    summary="Tabeli Təsdiqə Göndər",
)
async def submit_timesheet(
    request: Request, timesheet_id: uuid.UUID
) -> TimesheetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        ts = await service.attendance.submit_timesheet(timesheet_id, actor)
        return TimesheetResponse.model_validate(ts)


@router.post(
    "/attendance/timesheets/{timesheet_id}/approve",
    response_model=TimesheetResponse,
    summary="Tabeli Təsdiq Et",
)
async def approve_timesheet(
    request: Request, timesheet_id: uuid.UUID
) -> TimesheetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        ts = await service.attendance.approve_timesheet(timesheet_id, actor)
        return TimesheetResponse.model_validate(ts)


@router.post(
    "/attendance/timesheets/{timesheet_id}/lock",
    response_model=TimesheetResponse,
    summary="Tabeli Kilidlə (Maaş Hesablaması Üçün)",
)
async def lock_timesheet(
    request: Request, timesheet_id: uuid.UUID
) -> TimesheetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        ts = await service.attendance.lock_timesheet(timesheet_id, actor)
        return TimesheetResponse.model_validate(ts)


@router.post(
    "/attendance/timesheets/{timesheet_id}/reopen",
    response_model=TimesheetResponse,
    summary="Kilidlənmiş Tabeli Yenidən Aç",
)
async def reopen_timesheet(
    request: Request, timesheet_id: uuid.UUID, data: TimesheetReopenRequest
) -> TimesheetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        ts = await service.attendance.reopen_timesheet(timesheet_id, data, actor)
        return TimesheetResponse.model_validate(ts)


# ==========================================
# 5. LEAVE MANAGEMENT & LEDGER
# ==========================================


@router.post(
    "/leave/types",
    response_model=LeaveTypeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Məzuniyyət Növü Yarat",
)
async def create_leave_type(request: Request, data: LeaveTypeCreate) -> LeaveTypeResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        lt = await service.leave.create_leave_type(data, actor)
        return LeaveTypeResponse.model_validate(lt)


@router.get(
    "/leave/types",
    response_model=list[LeaveTypeResponse],
    summary="Məzuniyyət Növlərinin Siyahısı",
)
async def list_leave_types(request: Request) -> list[LeaveTypeResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        lts = await service.leave.list_leave_types()
        return [LeaveTypeResponse.model_validate(lt) for lt in lts]


@router.get(
    "/leave/balances/{employee_id}",
    response_model=list[LeaveBalanceResponse],
    summary="İşçinin Məzuniyyət Qalıqları (Append-Only Derivasiya)",
)
async def get_leave_balances(
    request: Request, employee_id: uuid.UUID
) -> list[LeaveBalanceResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        return await service.leave.get_employee_leave_balances(employee_id, actor)


@router.post(
    "/leave/requests",
    response_model=LeaveRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Məzuniyyət Sorğusu Ver",
)
async def request_leave(request: Request, data: LeaveRequestCreate) -> LeaveRequestResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        req = await service.leave.request_leave(data, actor)
        return LeaveRequestResponse.model_validate(req)


@router.get(
    "/leave/requests",
    response_model=list[LeaveRequestResponse],
    summary="Məzuniyyət Sorğularının Siyahısı",
)
async def list_leave_requests(
    employee_id: uuid.UUID | None = None,
    status_: LeaveRequestStatus | None = Query(None, alias="status"),
) -> list[LeaveRequestResponse]:
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        reqs = await service.leave.repo.list_leave_requests(employee_id, status_)
        return [LeaveRequestResponse.model_validate(r) for r in reqs]


@router.post(
    "/leave/requests/{request_id}/decision",
    response_model=LeaveRequestResponse,
    summary="Məzuniyyət Sorğusunu Təsdiq və ya İmtina Et",
)
async def decide_leave_request(
    request: Request, request_id: uuid.UUID, data: LeaveRequestDecision
) -> LeaveRequestResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        req = await service.leave.decide_leave(request_id, data, actor)
        return LeaveRequestResponse.model_validate(req)


@router.post(
    "/leave/ledger/adjust",
    response_model=LeaveLedgerEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Məzuniyyət Jurnalına Manual Düzəliş Et",
)
async def adjust_leave_ledger(
    request: Request, data: LeaveLedgerEntryCreate
) -> LeaveLedgerEntryResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = HRService(uow.session)
        entry = await service.leave.adjust_leave_ledger(data, actor)
        return LeaveLedgerEntryResponse.model_validate(entry)
