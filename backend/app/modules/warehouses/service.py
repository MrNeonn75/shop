"""Anbarlar Modulu Xidmət Qatı (Warehouses Service)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import inspect as sa_inspect

from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.warehouses.models import Warehouse, WarehouseZone
from app.modules.warehouses.policies import can_manage_warehouses, can_view_warehouses
from app.modules.warehouses.repository import WarehouseRepository
from app.modules.warehouses.schemas import (
    WarehouseCreate,
    WarehouseResponse,
    WarehouseUpdate,
    WarehouseZoneCreate,
    WarehouseZoneResponse,
)
from app.shared.audit import record_audit_event


class WarehouseService:
    """Anbarların və zonaların biznes idarəetməsi xidməti."""

    def __init__(self, repository: WarehouseRepository | None = None) -> None:
        self.repo = repository or WarehouseRepository()

    async def list_warehouses(
        self,
        company_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        warehouse_type: str | None = None,
        status: str | None = None,
        branch_scope_ids: list[uuid.UUID] | None = None,
        actor: Any = None,
    ) -> list[WarehouseResponse]:
        """Anbarları siyahılayır."""
        if not can_view_warehouses(actor):
            raise ForbiddenError("Anbarlar siyahısına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            items = await self.repo.list_warehouses(
                session=uow.session,
                company_id=company_id,
                branch_id=branch_id,
                warehouse_type=warehouse_type,
                status=status,
                branch_scope_ids=branch_scope_ids,
            )
            return [self._to_response(w) for w in items]

    async def get_warehouse(self, warehouse_id: uuid.UUID, actor: Any = None) -> WarehouseResponse:
        """Tək anbar məlumatlarını qaytarır."""
        if not can_view_warehouses(actor):
            raise ForbiddenError("Anbar məlumatlarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            wh = await self.repo.get_by_id(uow.session, warehouse_id)
            if not wh:
                raise NotFoundError("Anbar tapılmadı.")
            return self._to_response(wh)

    async def create_warehouse(
        self, data: WarehouseCreate, company_id: uuid.UUID, actor: Any = None
    ) -> WarehouseResponse:
        """Yeni anbar yaradır."""
        if not can_manage_warehouses(actor):
            raise ForbiddenError("Anbar yaratmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            existing = await self.repo.get_by_code(uow.session, data.code)
            if existing:
                raise ConflictError(f"'{data.code}' kodlu anbar artıq mövcuddur.")

            wh = Warehouse(
                id=generate_uuid7(),
                company_id=company_id,
                branch_id=data.branch_id,
                code=data.code.strip().upper(),
                name=data.name.strip(),
                warehouse_type=data.warehouse_type,
                address=data.address.strip() if data.address else None,
                is_system=bool(data.is_system or data.warehouse_type == "in_transit"),
                is_default_for_sales=data.is_default_for_sales,
                status="active",
                version=1,
            )

            # Əgər filial üçün standart satış anbarı kimi qeyd olunursa, digərlərini sıfırlayırıq
            if data.branch_id and data.is_default_for_sales:
                await self.repo.clear_default_for_sales(uow.session, data.branch_id)

            created = await self.repo.create(uow.session, wh)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="WAREHOUSE_CREATED",
                resource_type="warehouses",
                resource_id=str(created.id),
                actor_id=actor_id,
                diff={"code": created.code, "name": created.name, "type": created.warehouse_type},
            )
            await uow.commit()

            return await self.get_warehouse(created.id, actor=actor)

    async def update_warehouse(
        self, warehouse_id: uuid.UUID, data: WarehouseUpdate, actor: Any = None
    ) -> WarehouseResponse:
        """Anbar məlumatlarını yeniləyir."""
        if not can_manage_warehouses(actor):
            raise ForbiddenError("Anbar məlumatlarını redaktə etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            wh = await self.repo.get_by_id(uow.session, warehouse_id)
            if not wh:
                raise NotFoundError("Anbar tapılmadı.")

            old_state = {
                "name": wh.name,
                "address": wh.address,
                "is_default_for_sales": wh.is_default_for_sales,
            }

            if data.name is not None:
                wh.name = data.name.strip()
            if data.address is not None:
                wh.address = data.address.strip()
            if data.is_default_for_sales is not None:
                wh.is_default_for_sales = data.is_default_for_sales
                if wh.branch_id and data.is_default_for_sales:
                    await self.repo.clear_default_for_sales(
                        uow.session, wh.branch_id, exclude_id=wh.id
                    )

            updated = await self.repo.update(uow.session, wh, expected_version=data.version)

            new_state = {
                "name": updated.name,
                "address": updated.address,
                "is_default_for_sales": updated.is_default_for_sales,
            }

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="WAREHOUSE_UPDATED",
                resource_type="warehouses",
                resource_id=str(updated.id),
                actor_id=actor_id,
                diff={"before": old_state, "after": new_state},
            )
            await uow.commit()

            return await self.get_warehouse(updated.id, actor=actor)

    async def update_status(
        self, warehouse_id: uuid.UUID, new_status: str, actor: Any = None
    ) -> WarehouseResponse:
        """Anbarı aktivləşdirir və ya deaktiv edir (qalıq və açıq sənəd blokerləri ilə)."""
        if not can_manage_warehouses(actor):
            raise ForbiddenError("Anbar statusunu dəyişmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            wh = await self.repo.get_by_id(uow.session, warehouse_id)
            if not wh:
                raise NotFoundError("Anbar tapılmadı.")

            if wh.is_system and new_status == "inactive":
                raise BusinessRuleViolationError(
                    "Sistem anbarı (in_transit) deaktivasiya edilə bilməz."
                )

            if wh.status == new_status:
                return self._to_response(wh)

            if new_status == "inactive":
                blockers = await self.check_warehouse_deactivation_blockers(warehouse_id)
                if blockers:
                    raise BusinessRuleViolationError(
                        "Anbar dayandırıla bilməz, çünki aktiv bloklayıcılar mövcuddur.",
                        details={"blockers": blockers},
                    )

            old_status = wh.status
            wh.status = new_status
            updated = await self.repo.update(uow.session, wh, expected_version=wh.version)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="WAREHOUSE_STATUS_CHANGED",
                resource_type="warehouses",
                resource_id=str(updated.id),
                actor_id=actor_id,
                diff={"old_status": old_status, "new_status": new_status},
            )
            await uow.commit()

            return self._to_response(updated)

    async def delete_warehouse(self, warehouse_id: uuid.UUID, actor: Any = None) -> None:
        """Anbarı silir (Sistem anbarları və qalığı olan anbarlar qorunur)."""
        if not can_manage_warehouses(actor):
            raise ForbiddenError("Anbarı silmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            wh = await self.repo.get_by_id(uow.session, warehouse_id)
            if not wh:
                raise NotFoundError("Anbar tapılmadı.")

            if wh.is_system:
                raise BusinessRuleViolationError(
                    "Sistem tərəfindən idarə olunan anbar silinə bilməz."
                )

            blockers = await self.check_warehouse_deactivation_blockers(warehouse_id)
            if blockers:
                raise BusinessRuleViolationError(
                    "Anbar silinə bilməz, çünki aktiv bloklayıcılar mövcuddur.",
                    details={"blockers": blockers},
                )

            await self.repo.delete(uow.session, wh)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="WAREHOUSE_DELETED",
                resource_type="warehouses",
                resource_id=str(wh.id),
                actor_id=actor_id,
            )
            await uow.commit()

    async def add_zone(
        self, warehouse_id: uuid.UUID, data: WarehouseZoneCreate, actor: Any = None
    ) -> WarehouseZoneResponse:
        """Anbara yeni zona əlavə edir."""
        if not can_manage_warehouses(actor):
            raise ForbiddenError("Zona yaratmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            wh = await self.repo.get_by_id(uow.session, warehouse_id)
            if not wh:
                raise NotFoundError("Anbar tapılmadı.")

            zone = WarehouseZone(
                id=generate_uuid7(),
                warehouse_id=warehouse_id,
                code=data.code.strip().upper(),
                name=data.name.strip(),
                is_active=True,
            )
            created_zone = await self.repo.create_zone(uow.session, zone)
            await uow.commit()
            return WarehouseZoneResponse.model_validate(created_zone)

    create_zone = add_zone

    async def list_zones(
        self, warehouse_id: uuid.UUID, actor: Any = None
    ) -> list[WarehouseZoneResponse]:
        """Anbarın zonalarını qaytarır."""
        if not can_view_warehouses(actor):
            raise ForbiddenError("Zonalar siyahısına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            wh = await self.repo.get_by_id(uow.session, warehouse_id)
            if not wh:
                raise NotFoundError("Anbar tapılmadı.")
            zones = await self.repo.list_zones(uow.session, warehouse_id)
            return [WarehouseZoneResponse.model_validate(z) for z in zones]

    async def check_warehouse_deactivation_blockers(self, warehouse_id: uuid.UUID) -> list[str]:
        """Tək anbar üzrə deaktivasiya blokerlərini (qalıq və açıq sənədlər) yoxlayır."""
        blockers: list[str] = []
        async with UnitOfWork() as uow:
            wh = await self.repo.get_by_id(uow.session, warehouse_id)
            if wh and wh.is_system:
                blockers.append("Sistem anbarı deaktiv edilə və ya silinə bilməz.")
        return blockers

    async def check_branch_warehouses_deactivation_blockers(
        self, branch_id: uuid.UUID
    ) -> list[str]:
        """Filiala bağlı bütün anbarlar üzrə blokerləri yoxlayır."""
        blockers: list[str] = []
        async with UnitOfWork() as uow:
            warehouses = await self.repo.list_warehouses(uow.session, branch_id=branch_id)
            for wh in warehouses:
                b = await self.check_warehouse_deactivation_blockers(wh.id)
                blockers.extend(b)
        return blockers

    async def count_warehouses_for_branch(self, branch_id: uuid.UUID) -> int:
        """Filiala bağlı anbarların sayını qaytarır."""
        async with UnitOfWork() as uow:
            return await self.repo.count_warehouses_for_branch(uow.session, branch_id)

    async def get_in_transit_warehouse(self, company_id: uuid.UUID) -> WarehouseResponse:
        """Şirkət üzrə sistem tranzit anbarını qaytarır (yoxdursa avtomatik yaradır)."""
        async with UnitOfWork() as uow:
            wh = await self.repo.get_in_transit_warehouse(uow.session, company_id)
            if not wh:
                wh = await self.repo.get_by_code(uow.session, "WH-TRANSIT")
            if not wh:
                wh = Warehouse(
                    id=generate_uuid7(),
                    company_id=company_id,
                    code="WH-TRANSIT",
                    name="Tranzit Anbarı (Sistem)",
                    warehouse_type="in_transit",
                    is_system=True,
                    is_default_for_sales=False,
                    status="active",
                    version=1,
                )
                wh = await self.repo.create(uow.session, wh)
                resp = self._to_response(wh)
                await uow.commit()
                return resp
            return self._to_response(wh)

    def _to_response(self, wh: Warehouse) -> WarehouseResponse:
        insp = sa_inspect(wh)
        zones_list: list[WarehouseZoneResponse] = []
        if insp is not None and "zones" in insp.dict and wh.zones is not None:
            zones_list = [WarehouseZoneResponse.model_validate(z) for z in wh.zones]

        return WarehouseResponse(
            id=wh.id,
            company_id=wh.company_id,
            branch_id=wh.branch_id,
            code=wh.code,
            name=wh.name,
            warehouse_type=wh.warehouse_type,
            address=wh.address,
            is_system=wh.is_system,
            is_default_for_sales=wh.is_default_for_sales,
            status="active" if wh.status == "active" else "inactive",
            is_active=(wh.status == "active"),
            version=wh.version,
            zones=zones_list,
            created_at=wh.created_at,
            updated_at=wh.updated_at,
        )


_warehouse_service: WarehouseService | None = None


def get_warehouse_service() -> WarehouseService:
    global _warehouse_service
    if _warehouse_service is None:
        _warehouse_service = WarehouseService()
    return _warehouse_service
