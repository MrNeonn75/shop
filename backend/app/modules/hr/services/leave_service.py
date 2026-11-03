"""Məzuniyyət və Append-Only Məzuniyyət Jurnalı Servisi (Leave Service).

Qaydalar:
- Məzuniyyət balansı REDAKTƏ EDİLƏN SÜTUN DEYİL, append-only jurnaldan törənir.
- Məzuniyyət təsdiq edildikdə avtomatik USAGE qeydi jurnala yazılır.
- SoD: Heç bir işçi öz məzuniyyətini özü təsdiq edə bilməz.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.modules.hr.models import (
    LeaveEntryType,
    LeaveLedgerEntry,
    LeaveRequest,
    LeaveRequestStatus,
    LeaveType,
)
from app.modules.hr.policies import HRPolicy
from app.modules.hr.repository import HRRepository
from app.modules.hr.schemas import (
    LeaveBalanceResponse,
    LeaveLedgerEntryCreate,
    LeaveRequestCreate,
    LeaveRequestDecision,
    LeaveTypeCreate,
)


class LeaveService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = HRRepository(session)

    # ------------------------------------------
    # Leave Types
    # ------------------------------------------

    async def create_leave_type(self, payload: LeaveTypeCreate, actor: Any) -> LeaveType:
        HRPolicy.check_can_manage_employee(actor)
        existing = await self.repo.get_leave_type_by_code(payload.code)
        if existing:
            raise ConflictError(f"Bu kodla məzuniyyət növü artıq mövcuddur: {payload.code}")

        lt = LeaveType(
            code=payload.code,
            name=payload.name,
            is_paid=payload.is_paid,
            accrual_rate_per_month=payload.accrual_rate_per_month,
            carryover_limit=payload.carryover_limit,
            requires_attachment=payload.requires_attachment,
        )
        return await self.repo.create_leave_type(lt)

    async def list_leave_types(self) -> Sequence[LeaveType]:
        return await self.repo.list_leave_types()

    # ------------------------------------------
    # Balance & Ledger
    # ------------------------------------------

    async def get_employee_leave_balances(
        self, employee_id: uuid.UUID, actor: Any
    ) -> list[LeaveBalanceResponse]:
        HRPolicy.check_can_view_leave_ledger(actor)
        leave_types = await self.repo.list_leave_types()
        balances: list[LeaveBalanceResponse] = []

        for lt in leave_types:
            accrued, used, balance = await self.repo.get_leave_balance(employee_id, lt.id)
            balances.append(
                LeaveBalanceResponse(
                    leave_type_id=lt.id,
                    leave_type_code=lt.code,
                    leave_type_name=lt.name,
                    accrued_days=accrued,
                    used_days=used,
                    current_balance=balance,
                )
            )

        return balances

    async def adjust_leave_ledger(
        self, payload: LeaveLedgerEntryCreate, actor: Any
    ) -> LeaveLedgerEntry:
        """Məzuniyyət jurnalına səbəb göstərilməklə manual düzəliş qeydi əlavə edir."""
        HRPolicy.check_can_adjust_leave_ledger(actor)

        entry = LeaveLedgerEntry(
            employee_id=payload.employee_id,
            leave_type_id=payload.leave_type_id,
            entry_type=LeaveEntryType.ADJUSTMENT,
            days=payload.days,
            effective_date=payload.effective_date,
            notes=payload.notes,
        )
        return await self.repo.add_leave_ledger_entry(entry)

    # ------------------------------------------
    # Leave Requests & Approval
    # ------------------------------------------

    async def request_leave(self, payload: LeaveRequestCreate, actor: Any) -> LeaveRequest:
        emp = await self.repo.get_employee(payload.employee_id)
        if not emp:
            raise NotFoundError(f"İşçi tapılmadı: {payload.employee_id}")

        HRPolicy.check_can_request_leave(actor, emp.linked_user_id)

        if payload.end_date < payload.start_date:
            raise ValidationError("Məzuniyyətin bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz.")

        lt = await self.repo.get_leave_type(payload.leave_type_id)
        if not lt:
            raise NotFoundError(f"Məzuniyyət növü tapılmadı: {payload.leave_type_id}")

        if lt.requires_attachment and not payload.attachment_url:
            raise ValidationError(f"{lt.name} üçün təsdiqedici sənəd (attachment) əlavə edilməlidir.")

        # Əgər ödənişli məzuniyyətdirsə, balans yoxlanılır
        if lt.is_paid:
            _, _, balance = await self.repo.get_leave_balance(payload.employee_id, lt.id)
            if balance < payload.days_count:
                raise BusinessRuleViolationError(
                    f"Kifayət qədər məzuniyyət qalığı yoxdur. Cari qalıq: {balance} gün, tələb olunan: {payload.days_count} gün."
                )

        req = LeaveRequest(
            employee_id=payload.employee_id,
            leave_type_id=payload.leave_type_id,
            start_date=payload.start_date,
            end_date=payload.end_date,
            is_half_day=payload.is_half_day,
            days_count=payload.days_count,
            reason=payload.reason,
            attachment_url=payload.attachment_url,
            status=LeaveRequestStatus.PENDING,
        )
        return await self.repo.create_leave_request(req)

    async def decide_leave(
        self, request_id: uuid.UUID, decision: LeaveRequestDecision, actor: Any
    ) -> LeaveRequest:
        req = await self.repo.get_leave_request(request_id)
        if not req:
            raise NotFoundError(f"Məzuniyyət sorğusu tapılmadı: {request_id}")

        if req.status != LeaveRequestStatus.PENDING:
            raise BusinessRuleViolationError("Yalnız gözləyən (PENDING) məzuniyyət sorğuları qərara bağlana bilər.")

        # SoD yoxlanışı (İşçi öz məzuniyyətini təsdiq edə bilməz)
        emp = await self.repo.get_employee(req.employee_id)
        applicant_user_id = emp.linked_user_id if emp else None
        HRPolicy.check_can_approve_leave(actor, applicant_user_id)

        if decision.approve:
            req.status = LeaveRequestStatus.APPROVED
            req.approved_by = getattr(actor, "id", None)
            req.approved_at = utc_now()

            # Atomik olaraq jurnala USAGE qeydi yazılır
            usage_entry = LeaveLedgerEntry(
                employee_id=req.employee_id,
                leave_type_id=req.leave_type_id,
                entry_type=LeaveEntryType.USAGE,
                days=req.days_count,
                effective_date=req.start_date,
                reference_id=str(req.id),
                notes=f"Təsdiqlənmiş məzuniyyət istifadəsi: {req.start_date} - {req.end_date}",
            )
            await self.repo.add_leave_ledger_entry(usage_entry)
        else:
            req.status = LeaveRequestStatus.REJECTED
            req.rejection_reason = decision.rejection_reason or "İmtina edildi"

        return req
