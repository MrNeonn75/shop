"""Filiallar Modulu Xidmət Qatı (Branches Service)."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.branches.events import (
    BranchCreatedEvent,
    BranchStatusChangedEvent,
    BranchUpdatedEvent,
)
from app.modules.branches.models import Branch
from app.modules.branches.policies import can_manage_branches, can_view_branches
from app.modules.branches.repository import BranchRepository
from app.modules.branches.schemas import (
    BranchCreate,
    BranchResponse,
    BranchSummaryResponse,
    BranchUpdate,
)
from app.shared.audit import record_audit_event
from app.shared.outbox import record_outbox_event


class BranchService:
    """Filialların biznes idarəetməsi xidməti."""

    def __init__(self, repository: BranchRepository | None = None) -> None:
        self.repo = repository or BranchRepository()

    async def list_branches(
        self,
        company_id: uuid.UUID | None = None,
        branch_scope_ids: list[uuid.UUID] | None = None,
        status: str | None = None,
        actor: Any = None,
    ) -> list[BranchResponse]:
        """İstifadəçinin filial çıxış əhatəsinə (Branch Scope) uyğun filialları siyahılayır."""
        if not can_view_branches(actor):
            raise ForbiddenError("Filiallar siyahısına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            branches = await self.repo.list_branches(
                session=uow.session,
                company_id=company_id,
                branch_scope_ids=branch_scope_ids,
                status=status,
            )
            return [
                BranchResponse(
                    id=b.id,
                    company_id=b.company_id,
                    code=b.code,
                    name=b.name,
                    address=b.address,
                    phone=b.phone,
                    email=b.email,
                    manager_user_id=b.manager_user_id,
                    operating_hours=b.operating_hours or {},
                    exceptions=b.exceptions or [],
                    status="active" if b.status == "active" else "inactive",
                    is_active=(b.status == "active"),
                    settings=b.settings or {},
                    version=b.version,
                    created_at=b.created_at,
                    updated_at=b.updated_at,
                )
                for b in branches
            ]

    async def get_branch(self, branch_id: uuid.UUID, actor: Any = None) -> BranchResponse:
        """Tək filialın təfərrüatlarını qaytarır."""
        if not can_view_branches(actor):
            raise ForbiddenError("Filial məlumatlarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            branch = await self.repo.get_by_id(uow.session, branch_id)
            if not branch:
                raise NotFoundError("Filial tapılmadı.")

            return BranchResponse(
                id=branch.id,
                company_id=branch.company_id,
                code=branch.code,
                name=branch.name,
                address=branch.address,
                phone=branch.phone,
                email=branch.email,
                manager_user_id=branch.manager_user_id,
                operating_hours=branch.operating_hours or {},
                exceptions=branch.exceptions or [],
                status="active" if branch.status == "active" else "inactive",
                is_active=(branch.status == "active"),
                settings=branch.settings or {},
                version=branch.version,
                created_at=branch.created_at,
                updated_at=branch.updated_at,
            )

    async def create_branch(
        self, data: BranchCreate, company_id: uuid.UUID, actor: Any = None
    ) -> BranchResponse:
        """Yeni filial yaradır."""
        if not can_manage_branches(actor):
            raise ForbiddenError("Filial yaratmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            # 1. Kod unikallığı yoxlanışı
            existing = await self.repo.get_by_code(uow.session, data.code)
            if existing:
                raise ConflictError(f"'{data.code}' kodlu filial artıq mövcuddur.")

            # 2. Menecer istifadəçisinin yoxlanışı
            if data.manager_user_id:
                await self._validate_manager(data.manager_user_id)

            branch = Branch(
                id=generate_uuid7(),
                company_id=company_id,
                code=data.code.strip().upper(),
                name=data.name.strip(),
                address=data.address.strip(),
                phone=data.phone.strip(),
                email=data.email.strip().lower() if data.email else None,
                manager_user_id=data.manager_user_id,
                operating_hours=data.operating_hours,
                exceptions=data.exceptions,
                status="active",
                settings=data.settings,
                version=1,
            )
            created = await self.repo.create(uow.session, branch)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="BRANCH_CREATED",
                resource_type="branches",
                resource_id=str(created.id),
                actor_id=actor_id,
                diff={"code": created.code, "name": created.name},
            )

            event = BranchCreatedEvent(branch_id=created.id, code=created.code, name=created.name)
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return await self.get_branch(created.id, actor=actor)

    async def update_branch(
        self, branch_id: uuid.UUID, data: BranchUpdate, actor: Any = None
    ) -> BranchResponse:
        """Filial məlumatlarını yeniləyir."""
        if not can_manage_branches(actor):
            raise ForbiddenError("Filialı redaktə etmək hüququnuz yoxdur.")

        if data.manager_user_id:
            await self._validate_manager(data.manager_user_id)

        async with UnitOfWork() as uow:
            branch = await self.repo.get_by_id(uow.session, branch_id)
            if not branch:
                raise NotFoundError("Filial tapılmadı.")

            old_state = {
                "name": branch.name,
                "address": branch.address,
                "phone": branch.phone,
                "email": branch.email,
                "manager_user_id": str(branch.manager_user_id) if branch.manager_user_id else None,
            }

            if data.name is not None:
                branch.name = data.name.strip()
            if data.address is not None:
                branch.address = data.address.strip()
            if data.phone is not None:
                branch.phone = data.phone.strip()
            if data.email is not None:
                branch.email = data.email.strip().lower()
            if data.manager_user_id is not None:
                branch.manager_user_id = data.manager_user_id
            if data.operating_hours is not None:
                branch.operating_hours = data.operating_hours
            if data.exceptions is not None:
                branch.exceptions = data.exceptions
            if data.settings is not None:
                branch.settings = data.settings

            updated = await self.repo.update(uow.session, branch, expected_version=data.version)

            new_state = {
                "name": updated.name,
                "address": updated.address,
                "phone": updated.phone,
                "email": updated.email,
                "manager_user_id": str(updated.manager_user_id)
                if updated.manager_user_id
                else None,
            }

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="BRANCH_UPDATED",
                resource_type="branches",
                resource_id=str(updated.id),
                actor_id=actor_id,
                diff={"before": old_state, "after": new_state},
            )

            event = BranchUpdatedEvent(
                branch_id=updated.id,
                code=updated.code,
                diff={"before": old_state, "after": new_state},
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return await self.get_branch(updated.id, actor=actor)

    async def update_status(
        self, branch_id: uuid.UUID, new_status: str, actor: Any = None
    ) -> BranchResponse:
        """Filialı aktivləşdirir və ya deaktivasiya edir (blokerlər yoxlanışı ilə)."""
        if not can_manage_branches(actor):
            raise ForbiddenError("Filial statusunu dəyişmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            branch = await self.repo.get_by_id(uow.session, branch_id)
            if not branch:
                raise NotFoundError("Filial tapılmadı.")

            if branch.status == new_status:
                return await self.get_branch(branch.id, actor=actor)

            if new_status == "inactive":
                blockers = await self.check_deactivation_blockers(branch_id)
                if blockers:
                    raise BusinessRuleViolationError(
                        "Filial dayandırıla bilməz, çünki aktiv bloklayıcılar mövcuddur.",
                        details={"blockers": blockers},
                    )

            old_status = branch.status
            branch.status = new_status
            updated = await self.repo.update(uow.session, branch, expected_version=branch.version)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="BRANCH_STATUS_CHANGED",
                resource_type="branches",
                resource_id=str(updated.id),
                actor_id=actor_id,
                diff={"old_status": old_status, "new_status": new_status},
            )

            event = BranchStatusChangedEvent(
                branch_id=updated.id, old_status=old_status, new_status=new_status
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return await self.get_branch(updated.id, actor=actor)

    async def check_deactivation_blockers(self, branch_id: uuid.UUID) -> list[str]:
        """Filialın deaktiv edilməsinə mane olan səbəblərin siyahısını yoxlayır."""
        blockers: list[str] = []

        # 1. Aktiv kassa aparatlarının yoxlanışı
        from app.modules.cash_registers.service import get_cash_register_service

        reg_svc = get_cash_register_service()
        active_regs = await reg_svc.count_active_registers_for_branch(branch_id)
        if active_regs > 0:
            blockers.append(
                f"Filialda {active_regs} ədəd aktiv kassa aparatı mövcuddur. Əvvəlcə kassalar bağlanmalıdır."
            )

        # 2. Anbarlarda aktiv qalıq və ya açıq sənədlər
        from app.modules.warehouses.service import get_warehouse_service

        wh_svc = get_warehouse_service()
        wh_blockers = await wh_svc.check_branch_warehouses_deactivation_blockers(branch_id)
        blockers.extend(wh_blockers)

        return blockers

    async def get_branch_summary(
        self, branch_id: uuid.UUID, actor: Any = None
    ) -> BranchSummaryResponse:
        """Filialın icmal statistikası (anbarlar, kassalar, əməkdaşlar)."""
        branch_resp = await self.get_branch(branch_id, actor=actor)

        # Servislər vasitəsilə sayları əldə edirik (cross-module model import olmadan!)
        from app.modules.cash_registers.service import get_cash_register_service
        from app.modules.users.service import get_user_service
        from app.modules.warehouses.service import get_warehouse_service

        wh_svc = get_warehouse_service()
        wh_count = await wh_svc.count_warehouses_for_branch(branch_id)

        reg_svc = get_cash_register_service()
        reg_count = await reg_svc.count_active_registers_for_branch(branch_id)

        user_svc = get_user_service()
        emp_count = await user_svc.count_users_by_branch(branch_id)

        return BranchSummaryResponse(
            branch_id=branch_id,
            branch_code=branch_resp.code,
            branch_name=branch_resp.name,
            status=branch_resp.status,
            warehouses_count=wh_count,
            registers_count=reg_count,
            employees_count=emp_count,
            open_documents_count=0,
        )

    async def _validate_manager(self, manager_user_id: uuid.UUID) -> None:
        """Menecer istifadəçisinin aktiv statusda olduğunu yoxlayır."""
        from app.modules.users.service import get_user_service

        user_svc = get_user_service()
        user = await user_svc.get_user_by_id(manager_user_id)
        if user.status != "active":
            raise BusinessRuleViolationError(
                "Filial müdiri kimi yalnız aktiv statuslu istifadəçi təyin edilə bilər."
            )


_branch_service: BranchService | None = None


def get_branch_service() -> BranchService:
    global _branch_service
    if _branch_service is None:
        _branch_service = BranchService()
    return _branch_service
