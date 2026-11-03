"""Kassa Aparatları Modulu Xidmət Qatı (Cash Registers Service)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

import app.core.database as db_module
from app.core.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.cash_registers.models import CashRegister
from app.modules.cash_registers.policies import (
    can_manage_cash_registers,
    can_view_cash_registers,
)
from app.modules.cash_registers.repository import CashRegisterRepository
from app.modules.cash_registers.schemas import (
    CashRegisterCreate,
    CashRegisterResponse,
    CashRegisterUpdate,
)
from app.shared.audit import record_audit_event


class CashRegisterService:
    """Kassa aparatlarının biznes idarəetməsi xidməti."""

    def __init__(self, repository: CashRegisterRepository | None = None) -> None:
        self.repo = repository or CashRegisterRepository()

    async def list_registers(
        self,
        company_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        status: str | None = None,
        branch_scope_ids: list[uuid.UUID] | None = None,
        actor: Any = None,
    ) -> list[CashRegisterResponse]:
        """Kassaları siyahılayır."""
        if not can_view_cash_registers(actor):
            raise ForbiddenError("Kassalar siyahısına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            items = await self.repo.list_registers(
                session=uow.session,
                company_id=company_id,
                branch_id=branch_id,
                status=status,
                branch_scope_ids=branch_scope_ids,
            )
            return [self._to_response(r) for r in items]

    async def get_register(
        self,
        register_id: uuid.UUID,
        actor: Any = None,
        session: AsyncSession | None = None,
    ) -> CashRegisterResponse:
        """Tək kassa məlumatlarını qaytarır."""
        if not can_view_cash_registers(actor):
            raise ForbiddenError("Kassa məlumatlarına baxış hüququnuz yoxdur.")

        if session is not None:
            reg = await self.repo.get_by_id(session, register_id)
            if not reg:
                raise NotFoundError("Kassa aparatı tapılmadı.")
            return self._to_response(reg)

        async with db_module.AsyncSessionLocal() as db_session:
            reg = await self.repo.get_by_id(db_session, register_id)
            if not reg:
                raise NotFoundError("Kassa aparatı tapılmadı.")
            return self._to_response(reg)

    async def create_register(
        self, data: CashRegisterCreate, company_id: uuid.UUID, actor: Any = None
    ) -> CashRegisterResponse:
        """Yeni kassa aparatı qeydiyyata alır."""
        if not can_manage_cash_registers(actor):
            raise ForbiddenError("Kassa qeydiyyatı hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            # 1. Filial daxili kod unikallığı
            existing = await self.repo.get_by_branch_and_code(
                uow.session, data.branch_id, data.code
            )
            if existing:
                raise ConflictError(f"Bu filialda '{data.code}' kodlu kassa artıq mövcuddur.")

            # 2. Filial və standart anbarın mövcudluğunun yoxlanışı
            from app.modules.branches.service import get_branch_service
            from app.modules.warehouses.service import get_warehouse_service

            branch_svc = get_branch_service()
            await branch_svc.get_branch(data.branch_id)

            wh_svc = get_warehouse_service()
            await wh_svc.get_warehouse(data.default_warehouse_id)

            reg = CashRegister(
                id=generate_uuid7(),
                company_id=company_id,
                branch_id=data.branch_id,
                default_warehouse_id=data.default_warehouse_id,
                code=data.code.strip().upper(),
                name=data.name.strip(),
                status="active",
                device_binding_info=data.device_binding_info,
                receipt_printer_profile_ref=data.receipt_printer_profile_ref,
                version=1,
            )
            created = await self.repo.create(uow.session, reg)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="CASH_REGISTER_CREATED",
                resource_type="cash_registers",
                resource_id=str(created.id),
                actor_id=actor_id,
                branch_id=created.branch_id,
                diff={"code": created.code, "name": created.name},
            )
            await uow.commit()

            return self._to_response(created)

    async def update_register(
        self, register_id: uuid.UUID, data: CashRegisterUpdate, actor: Any = None
    ) -> CashRegisterResponse:
        """Kassa məlumatlarını yeniləyir."""
        if not can_manage_cash_registers(actor):
            raise ForbiddenError("Kassa məlumatlarını redaktə etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            reg = await self.repo.get_by_id(uow.session, register_id)
            if not reg:
                raise NotFoundError("Kassa aparatı tapılmadı.")

            old_state = {
                "name": reg.name,
                "default_warehouse_id": str(reg.default_warehouse_id),
                "device_binding_info": reg.device_binding_info,
                "receipt_printer_profile_ref": reg.receipt_printer_profile_ref,
            }

            if data.name is not None:
                reg.name = data.name.strip()
            if data.default_warehouse_id is not None:
                from app.modules.warehouses.service import get_warehouse_service

                wh_svc = get_warehouse_service()
                await wh_svc.get_warehouse(data.default_warehouse_id)
                reg.default_warehouse_id = data.default_warehouse_id
            if data.device_binding_info is not None:
                reg.device_binding_info = data.device_binding_info
            if data.receipt_printer_profile_ref is not None:
                reg.receipt_printer_profile_ref = data.receipt_printer_profile_ref

            updated = await self.repo.update(uow.session, reg, expected_version=data.version)

            new_state = {
                "name": updated.name,
                "default_warehouse_id": str(updated.default_warehouse_id),
                "device_binding_info": updated.device_binding_info,
                "receipt_printer_profile_ref": updated.receipt_printer_profile_ref,
            }

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="CASH_REGISTER_UPDATED",
                resource_type="cash_registers",
                resource_id=str(updated.id),
                actor_id=actor_id,
                branch_id=updated.branch_id,
                diff={"before": old_state, "after": new_state},
            )
            await uow.commit()

            return self._to_response(updated)

    async def update_status(
        self, register_id: uuid.UUID, new_status: str, actor: Any = None
    ) -> CashRegisterResponse:
        """Kassanı aktivləşdirir və ya dayandırır."""
        if not can_manage_cash_registers(actor):
            raise ForbiddenError("Kassa statusunu dəyişmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            reg = await self.repo.get_by_id(uow.session, register_id)
            if not reg:
                raise NotFoundError("Kassa aparatı tapılmadı.")

            if reg.status == new_status:
                return self._to_response(reg)

            old_status = reg.status
            reg.status = new_status
            updated = await self.repo.update(uow.session, reg, expected_version=reg.version)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="CASH_REGISTER_STATUS_CHANGED",
                resource_type="cash_registers",
                resource_id=str(updated.id),
                actor_id=actor_id,
                branch_id=updated.branch_id,
                diff={"old_status": old_status, "new_status": new_status},
            )
            await uow.commit()

            return self._to_response(updated)

    async def count_active_registers_for_branch(self, branch_id: uuid.UUID) -> int:
        """Filial üzrə aktiv kassaların sayını qaytarır."""
        async with UnitOfWork() as uow:
            return await self.repo.count_active_by_branch(uow.session, branch_id)

    def _to_response(self, r: CashRegister) -> CashRegisterResponse:
        return CashRegisterResponse(
            id=r.id,
            company_id=r.company_id,
            branch_id=r.branch_id,
            default_warehouse_id=r.default_warehouse_id,
            code=r.code,
            name=r.name,
            status="active" if r.status == "active" else "inactive",
            is_active=(r.status == "active"),
            device_binding_info=r.device_binding_info,
            receipt_printer_profile_ref=r.receipt_printer_profile_ref,
            version=r.version,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )


_cash_register_service: CashRegisterService | None = None


def get_cash_register_service() -> CashRegisterService:
    global _cash_register_service
    if _cash_register_service is None:
        _cash_register_service = CashRegisterService()
    return _cash_register_service
