"""Əmək Haqqı (Payroll) Modulu REST API Marşrutları."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Header, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import select

from app.core.errors import NotFoundError
from app.core.uow import UnitOfWork
from app.modules.hr.models import Employee
from app.modules.payroll.models import PayrollRunStatus
from app.modules.payroll.schemas import (
    BankPaymentExportResponse,
    PayrollAdjustmentCreate,
    PayrollAdjustmentResponse,
    PayrollRuleSetCreate,
    PayrollRuleSetResponse,
    PayrollRunCreate,
    PayrollRunResponse,
    PayslipResponse,
    SalaryProfileCreate,
    SalaryProfileResponse,
)
from app.modules.payroll.service import PayrollService

router = APIRouter(prefix="/payroll", tags=["Əmək Haqqı (Payroll)"])


def get_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


# ==========================================
# 1. SALARY PROFILES & RULES
# ==========================================


@router.post(
    "/profiles",
    response_model=SalaryProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="İşçiyə Əmək Haqqı Profili Təyin Et",
)
async def create_salary_profile(
    request: Request, data: SalaryProfileCreate
) -> SalaryProfileResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        prof = await service.create_salary_profile(data, actor)
        return SalaryProfileResponse.model_validate(prof)


@router.get(
    "/profiles/{employee_id}",
    response_model=SalaryProfileResponse,
    summary="İşçinin Aktiv Əmək Haqqı Profili",
)
async def get_salary_profile(
    request: Request, employee_id: uuid.UUID
) -> SalaryProfileResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        prof = await service.get_salary_profile(employee_id, actor)
        return SalaryProfileResponse.model_validate(prof)


@router.post(
    "/rule-sets",
    response_model=PayrollRuleSetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Maaş Hesablama Qaydaları Quraşdır (Rule Set)",
)
async def create_rule_set(
    request: Request, data: PayrollRuleSetCreate
) -> PayrollRuleSetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        rs = await service.create_rule_set(data, actor)
        return PayrollRuleSetResponse.model_validate(rs)


@router.get(
    "/rule-sets/latest",
    response_model=PayrollRuleSetResponse,
    summary="Ən Son Aktiv Qaydalar Paketi",
)
async def get_latest_rule_set(request: Request) -> PayrollRuleSetResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        rs = await service.get_latest_rule_set(actor)
        return PayrollRuleSetResponse.model_validate(rs)


@router.post(
    "/adjustments",
    response_model=PayrollAdjustmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Əmək Haqqına Düzəliş (Bonus/Kəsinti) Əlavə Et",
)
async def create_adjustment(
    request: Request, data: PayrollAdjustmentCreate
) -> PayrollAdjustmentResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        adj = await service.create_adjustment(data, actor)
        return PayrollAdjustmentResponse.model_validate(adj)


# ==========================================
# 2. PAYROLL RUNS LIFECYCLE
# ==========================================


@router.post(
    "/runs",
    response_model=PayrollRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Maaş Hesablama Sənədi Yarat (DRAFT)",
)
async def create_payroll_run(
    request: Request, data: PayrollRunCreate
) -> PayrollRunResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        run = await service.create_payroll_run(data, actor)
        return PayrollRunResponse.model_validate(run)


@router.get(
    "/runs",
    response_model=list[PayrollRunResponse],
    summary="Maaş Hesablama Sənədlərinin Siyahısı",
)
async def list_payroll_runs(
    request: Request,
    branch_id: uuid.UUID | None = None,
    status_: PayrollRunStatus | None = Query(None, alias="status"),
) -> list[PayrollRunResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        runs = await service.repo.list_runs(branch_id, status_)
        return [PayrollRunResponse.model_validate(r) for r in runs]


@router.get(
    "/runs/{run_id}",
    response_model=PayrollRunResponse,
    summary="Maaş Hesablama Sənədi Təfərrüatları",
)
async def get_payroll_run(request: Request, run_id: uuid.UUID) -> PayrollRunResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        run = await service.repo.get_run(run_id)
        if not run:
            raise NotFoundError(f"Maaş hesablama sənədi tapılmadı: {run_id}")
        return PayrollRunResponse.model_validate(run)


@router.post(
    "/runs/{run_id}/calculate",
    response_model=PayrollRunResponse,
    summary="Maaşları Deterministik Hesabla (CALCULATED)",
)
async def calculate_payroll_run(
    request: Request, run_id: uuid.UUID
) -> PayrollRunResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        run = await service.calculate_payroll_run(run_id, actor)
        return PayrollRunResponse.model_validate(run)


@router.post(
    "/runs/{run_id}/submit",
    response_model=PayrollRunResponse,
    summary="Maaş Layihəsini Rəyə Göndər (UNDER_REVIEW)",
)
async def submit_payroll_run(request: Request, run_id: uuid.UUID) -> PayrollRunResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        run = await service.submit_for_review(run_id, actor)
        return PayrollRunResponse.model_validate(run)


@router.post(
    "/runs/{run_id}/approve",
    response_model=PayrollRunResponse,
    summary="Maaş Cədvəlini Təsdiqlə (APPROVED - SoD Qorunması)",
)
async def approve_payroll_run(request: Request, run_id: uuid.UUID) -> PayrollRunResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        run = await service.approve_payroll_run(run_id, actor)
        return PayrollRunResponse.model_validate(run)


@router.post(
    "/runs/{run_id}/finalize",
    response_model=PayrollRunResponse,
    summary="Maaş Cədvəlini Yekunlaşdır və Dondur (FINALIZED - Outbox Hadisəsi)",
)
async def finalize_payroll_run(
    request: Request,
    run_id: uuid.UUID,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> PayrollRunResponse:
    _ = idempotency_key
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        run = await service.finalize_payroll_run(run_id, actor)
        return PayrollRunResponse.model_validate(run)


@router.post(
    "/runs/{run_id}/pay",
    response_model=PayrollRunResponse,
    summary="Maaşları Ödənilmiş Qeyd Et (PAID)",
)
async def mark_run_as_paid(request: Request, run_id: uuid.UUID) -> PayrollRunResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        run = await service.mark_run_as_paid(run_id, actor)
        return PayrollRunResponse.model_validate(run)


@router.post(
    "/runs/{run_id}/reversal",
    response_model=PayrollRunResponse,
    summary="Maaş Sənədinə Kompensasiya Edici Ləğv Sənədi Yarat",
)
async def create_reversal_run(
    request: Request, run_id: uuid.UUID, reason: str = Query(..., min_length=5)
) -> PayrollRunResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        rev = await service.create_reversal_run(run_id, reason, actor)
        return PayrollRunResponse.model_validate(rev)


# ==========================================
# 3. EXPORTS & PAYSLIPS
# ==========================================


@router.get(
    "/runs/{run_id}/export-bank",
    response_model=BankPaymentExportResponse,
    summary="Bank Ödəniş Reyestrini İxrac Et (CSV)",
)
async def export_bank_payment_file(
    request: Request, run_id: uuid.UUID
) -> BankPaymentExportResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        return await service.export_bank_payment_file(run_id, actor)


@router.get(
    "/payslips/{payslip_id}",
    response_model=PayslipResponse,
    summary="Fərdi Maaş Vərəqəsi Təfərrüatları",
)
async def get_payslip(request: Request, payslip_id: uuid.UUID) -> PayslipResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        payslip = await service.repo.get_payslip(payslip_id)
        return PayslipResponse.model_validate(payslip)


@router.get(
    "/payslips/{payslip_id}/pdf",
    summary="Maaş Vərəqəsinin Rəsmi PDF Çapı",
)
async def download_payslip_pdf(request: Request, payslip_id: uuid.UUID) -> Response:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        pdf_bytes = await service.generate_payslip_pdf(payslip_id, actor)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=payslip_{payslip_id}.pdf"},
        )


@router.get(
    "/my-payslips",
    response_model=list[PayslipResponse],
    summary="İşçinin Öz Maaş Vərəqələri (Self-Service)",
)
async def get_my_payslips(
    request: Request, employee_id: uuid.UUID | None = None
) -> list[PayslipResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = PayrollService(uow.session)
        target_emp_id = employee_id
        if not target_emp_id and actor and getattr(actor, "id", None):
            emp_stmt = select(Employee).where(Employee.linked_user_id == actor.id)
            emp_res = await uow.session.execute(emp_stmt)
            emp = emp_res.scalar_one_or_none()
            if emp:
                target_emp_id = emp.id
        if not target_emp_id:
            return []
        payslips = await service.repo.list_payslips_for_employee(target_emp_id)
        return [PayslipResponse.model_validate(p) for p in payslips]
