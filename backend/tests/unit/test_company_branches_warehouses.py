"""Şirkət, Filiallar və Anbarlar Vahid Testləri (Unit Tests)."""

from __future__ import annotations

import pytest

from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    VersionConflictError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import BranchService
from app.modules.cash_registers.models import CashRegister
from app.modules.company.schemas import CompanyUpdate
from app.modules.company.service import CompanyService
from app.modules.warehouses.schemas import WarehouseCreate, WarehouseZoneCreate
from app.modules.warehouses.service import WarehouseService


class MockActor:
    def __init__(self, roles: list[str], permissions: list[str] | None = None) -> None:
        self.id = generate_uuid7()
        self.roles = roles
        self.permissions = permissions or []


@pytest.mark.asyncio
async def test_company_service_default_and_update() -> None:
    service = CompanyService()
    admin = MockActor(roles=["system_admin"])

    comp = await service.get_company()
    assert comp.code == "BH_MAIN"
    assert comp.default_currency == "AZN"
    assert comp.timezone == "Asia/Baku"

    # Yeniləmə
    update_data = CompanyUpdate(name="BRAND HOUSE PREMIUM", version=comp.version)
    updated = await service.update_company(update_data, actor=admin)
    assert updated.name == "BRAND HOUSE PREMIUM"
    assert updated.version == comp.version + 1

    # Optimistik kilidləmə xətası
    bad_update = CompanyUpdate(name="BRAND HOUSE FAKE", version=1)
    with pytest.raises(VersionConflictError):
        await service.update_company(bad_update, actor=admin)


@pytest.mark.asyncio
async def test_branch_service_rules_and_deactivation_blockers() -> None:
    comp_svc = CompanyService()
    company = await comp_svc.get_company()

    branch_svc = BranchService()
    wh_svc = WarehouseService()
    admin = MockActor(roles=["system_admin"])

    # 1. Filial yaratma
    create_dto = BranchCreate(
        code="28MAY",
        name="28 May Filialı",
        address="28 May küç. 14",
        phone="+994124930000",
    )
    b1 = await branch_svc.create_branch(create_dto, company_id=company.id, actor=admin)
    assert b1.code == "28MAY"
    assert b1.status == "active"

    # 2. Case-insensitive kod unikallığı
    dup_dto = BranchCreate(
        code="28may",
        name="Təkrar Filial",
        address="Ünvan",
        phone="+994124930001",
    )
    with pytest.raises(ConflictError):
        await branch_svc.create_branch(dup_dto, company_id=company.id, actor=admin)

    # 3. Anbar yaratma (filial üçün)
    wh_dto = WarehouseCreate(
        code="WH-28MAY-01",
        name="28 May Əsas Anbar",
        branch_id=b1.id,
        warehouse_type="branch",
        is_default_for_sales=True,
    )
    wh = await wh_svc.create_warehouse(wh_dto, company_id=company.id, actor=admin)
    assert wh.is_default_for_sales is True

    # 4. Kassa aparatı əlavə etdikdə filialın deaktivasiyası bloklanmalıdır
    async with UnitOfWork() as uow:
        reg = CashRegister(
            id=generate_uuid7(),
            company_id=company.id,
            branch_id=b1.id,
            default_warehouse_id=wh.id,
            code="REG-01",
            name="Kassa 1",
            status="active",
            version=1,
        )
        uow.session.add(reg)
        await uow.commit()

    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await branch_svc.update_status(b1.id, "inactive", actor=admin)
    assert "aktiv kassa aparatı mövcuddur" in str(exc_info.value.details)

    # 5. Filial icmalı (Summary) servislər vasitəsilə
    summary = await branch_svc.get_branch_summary(b1.id, actor=admin)
    assert summary.branch_code == "28MAY"
    assert summary.warehouses_count >= 1
    assert summary.registers_count >= 1


@pytest.mark.asyncio
async def test_warehouse_system_in_transit_protection() -> None:
    comp_svc = CompanyService()
    company = await comp_svc.get_company()

    wh_svc = WarehouseService()
    admin = MockActor(roles=["system_admin"])

    # Tranzit anbarı
    wh_in_transit = WarehouseCreate(
        code="WH-TRANSIT-TEST",
        name="Tranzit Test Anbarı",
        warehouse_type="in_transit",
        is_system=True,
    )
    wh = await wh_svc.create_warehouse(wh_in_transit, company_id=company.id, actor=admin)
    assert wh.is_system is True

    # Sistem anbarını silmə cəhdi qadağan edilməlidir
    with pytest.raises(BusinessRuleViolationError):
        await wh_svc.delete_warehouse(wh.id, actor=admin)

    # Sistem anbarını deaktiv etmə cəhdi qadağan edilməlidir
    with pytest.raises(BusinessRuleViolationError):
        await wh_svc.update_status(wh.id, "inactive", actor=admin)

    # Zona yaratma
    zone_dto = WarehouseZoneCreate(code="ZONE-A", name="A Bölməsi")
    zone = await wh_svc.create_zone(wh.id, zone_dto, actor=admin)
    assert zone.code == "ZONE-A"
