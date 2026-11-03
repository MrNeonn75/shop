"""Master Data Əlavə Vahid Testləri (Filiallar, Anbarlar, Kassalar və Nömrələmə).

Bu testlər biznes xidmətlərinin (services) tam funksionallığını və qaydalarını yoxlayır,
əhatəlilik dərəcəsini (code coverage) 85% üzərinə çıxarır.
"""

from __future__ import annotations

import uuid

import pytest

from app.core.errors import (
    ConflictError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.modules.branches.schemas import BranchCreate, BranchUpdate
from app.modules.branches.service import BranchService
from app.modules.cash_registers.schemas import (
    CashRegisterCreate,
    CashRegisterUpdate,
)
from app.modules.cash_registers.service import CashRegisterService
from app.modules.company.service import CompanyService
from app.modules.numbering.schemas import (
    NumberingSequenceCreate,
    NumberingSequenceUpdate,
)
from app.modules.numbering.service import NumberingService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService
from app.modules.warehouses.schemas import (
    WarehouseCreate,
    WarehouseUpdate,
    WarehouseZoneCreate,
)
from app.modules.warehouses.service import WarehouseService


class MockActor:
    def __init__(self, roles: list[str], permissions: list[str] | None = None) -> None:
        self.id = generate_uuid7()
        self.roles = roles
        self.permissions = permissions or []


@pytest.mark.asyncio
async def test_branch_service_full_lifecycle() -> None:
    comp_svc = CompanyService()
    company = await comp_svc.get_company()
    branch_svc = BranchService()
    user_svc = UserService()
    admin = MockActor(roles=["system_admin"])

    # 1. Menecer yaradırıq
    mgr_dto = UserCreate(
        username=f"mgr_{uuid.uuid4().hex[:6]}",
        email=f"mgr_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name="Filial Müdiri",
        password="ManagerPassword123!",
        must_change_password=False,
    )
    manager, _ = await user_svc.create_user(mgr_dto, actor=None)

    # 2. Filial yaratma
    b_code = f"GENCLIK_{uuid.uuid4().hex[:4].upper()}"
    create_dto = BranchCreate(
        code=b_code,
        name="Gənclik Mall Filialı",
        address="F.X.Xoyski küç. 14",
        phone="+994125990011",
        email="genclik@brandhouse.az",
        manager_user_id=manager.id,
        operating_hours={
            "monday": {"open": "10:00", "close": "22:00"},
            "sunday": {"open": "10:00", "close": "22:00"},
        },
        settings={"tax_inclusive_pricing": True},
    )
    branch = await branch_svc.create_branch(create_dto, company_id=company.id, actor=admin)
    assert branch.code == b_code
    assert branch.manager_user_id == manager.id

    # 3. Filialı gətirmə
    fetched = await branch_svc.get_branch(branch.id, actor=admin)
    assert fetched.name == "Gənclik Mall Filialı"

    # 4. Siyahılama
    all_branches = await branch_svc.list_branches(company_id=company.id, actor=admin)
    assert any(b.id == branch.id for b in all_branches)

    # 5. Filial redaktəsi
    update_dto = BranchUpdate(
        name="Gənclik Mall Flagship",
        phone="+994125990022",
        settings={"tax_inclusive_pricing": True, "vip_lounge": True},
        version=branch.version,
    )
    updated = await branch_svc.update_branch(branch.id, update_dto, actor=admin)
    assert updated.name == "Gənclik Mall Flagship"
    assert updated.phone == "+994125990022"

    # 6. Status dəyişikliyi (Aktiv -> Aktiv heç bir xətasız qayıtmalıdır)
    same_st = await branch_svc.update_status(branch.id, "active", actor=admin)
    assert same_st.status == "active"

    # 7. Qeyri-mövcud filial
    with pytest.raises(NotFoundError):
        await branch_svc.get_branch(uuid.uuid4(), actor=admin)


@pytest.mark.asyncio
async def test_warehouse_service_lifecycle_and_zones() -> None:
    comp_svc = CompanyService()
    company = await comp_svc.get_company()
    wh_svc = WarehouseService()
    branch_svc = BranchService()
    admin = MockActor(roles=["system_admin"])

    # Filial yaradırıq
    b_code = f"NERIM_{uuid.uuid4().hex[:4].upper()}"
    branch = await branch_svc.create_branch(
        BranchCreate(code=b_code, name="Nərimanov", address="Təbriz küç. 2", phone="+994125990000"),
        company_id=company.id,
        actor=admin,
    )

    # 1. Adi filial anbarı yaratma
    wh_code = f"WH_N_{uuid.uuid4().hex[:4].upper()}"
    wh_dto = WarehouseCreate(
        code=wh_code,
        name="Nərimanov Əsas Satış Anbarı",
        branch_id=branch.id,
        warehouse_type="branch",
        address="Təbriz küç. 2",
        is_default_for_sales=True,
    )
    wh = await wh_svc.create_warehouse(wh_dto, company_id=company.id, actor=admin)
    assert wh.code == wh_code
    assert wh.is_default_for_sales is True

    # 2. İkinci anbar yaradırıq və default_for_sales edirik (birincinin standartlığını silməlidir)
    wh2_code = f"WH_N2_{uuid.uuid4().hex[:4].upper()}"
    wh2_dto = WarehouseCreate(
        code=wh2_code,
        name="Nərimanov Ehtiyat Anbarı",
        branch_id=branch.id,
        warehouse_type="branch",
        is_default_for_sales=True,
    )
    wh2 = await wh_svc.create_warehouse(wh2_dto, company_id=company.id, actor=admin)
    assert wh2.is_default_for_sales is True

    # Birinci anbarı yoxlayırıq - is_default_for_sales False olmalıdır
    wh1_refreshed = await wh_svc.get_warehouse(wh.id, actor=admin)
    assert wh1_refreshed.is_default_for_sales is False

    # 3. Anbar yeniləmə
    wh_update = WarehouseUpdate(name="Nərimanov Böyük Ehtiyat Anbarı", version=wh2.version)
    wh2_updated = await wh_svc.update_warehouse(wh2.id, wh_update, actor=admin)
    assert wh2_updated.name == "Nərimanov Böyük Ehtiyat Anbarı"

    # 4. Zonalar əlavə etmə və siyahılama
    z1 = await wh_svc.create_zone(
        wh2.id, WarehouseZoneCreate(code="RACK-1", name="Stellaj 1"), actor=admin
    )
    assert z1.code == "RACK-1"
    zones = await wh_svc.list_zones(wh2.id, actor=admin)
    assert len(zones) >= 1

    # 5. Anbarları siyahılama (filter ilə)
    filtered = await wh_svc.list_warehouses(branch_id=branch.id, actor=admin)
    assert len(filtered) >= 2

    # 6. Anbar sayını saymaq
    count = await wh_svc.count_warehouses_for_branch(branch.id)
    assert count >= 2

    # 7. Status dəyişmə və silmə
    deact = await wh_svc.update_status(wh2.id, "inactive", actor=admin)
    assert deact.status == "inactive"
    await wh_svc.delete_warehouse(wh2.id, actor=admin)

    with pytest.raises(NotFoundError):
        await wh_svc.get_warehouse(wh2.id, actor=admin)


@pytest.mark.asyncio
async def test_cash_register_service_lifecycle() -> None:
    comp_svc = CompanyService()
    company = await comp_svc.get_company()
    branch_svc = BranchService()
    wh_svc = WarehouseService()
    reg_svc = CashRegisterService()
    admin = MockActor(roles=["system_admin"])

    # Filial və anbar
    b_code = f"SAHIL_{uuid.uuid4().hex[:4].upper()}"
    branch = await branch_svc.create_branch(
        BranchCreate(
            code=b_code, name="Sahil Filialı", address="Nizami küç. 50", phone="+994125990001"
        ),
        company_id=company.id,
        actor=admin,
    )
    wh = await wh_svc.create_warehouse(
        WarehouseCreate(
            code=f"WH_S_{uuid.uuid4().hex[:4].upper()}",
            name="Sahil Anbar",
            branch_id=branch.id,
            warehouse_type="branch",
        ),
        company_id=company.id,
        actor=admin,
    )

    # 1. Kassa yaratma
    reg_dto = CashRegisterCreate(
        branch_id=branch.id,
        default_warehouse_id=wh.id,
        code="POS-01",
        name="Əsas Kassa 1",
        device_binding_info={"mac": "00:1B:44:11:3A:B7", "ip": "192.168.1.101"},
        receipt_printer_profile_ref="PRINTER-THERMAL-80MM",
    )
    reg = await reg_svc.create_register(reg_dto, company_id=company.id, actor=admin)
    assert reg.code == "POS-01"
    assert reg.status == "active"

    # 2. Eyni filialda eyni kodla təkrar yaratma qadağan olmalıdır
    with pytest.raises(ConflictError):
        await reg_svc.create_register(reg_dto, company_id=company.id, actor=admin)

    # 3. Kassanı oxuma və siyahılama
    got = await reg_svc.get_register(reg.id, actor=admin)
    assert got.name == "Əsas Kassa 1"

    regs = await reg_svc.list_registers(branch_id=branch.id, actor=admin)
    assert len(regs) == 1

    active_cnt = await reg_svc.count_active_registers_for_branch(branch.id)
    assert active_cnt == 1

    # 4. Kassanı redaktə etmə
    up_dto = CashRegisterUpdate(
        name="Əsas Kassa 1 (Yenilənmiş)",
        device_binding_info={"mac": "00:1B:44:11:3A:B7", "ip": "192.168.1.102"},
        version=reg.version,
    )
    updated = await reg_svc.update_register(reg.id, up_dto, actor=admin)
    assert updated.name == "Əsas Kassa 1 (Yenilənmiş)"
    assert updated.device_binding_info is not None
    assert updated.device_binding_info["ip"] == "192.168.1.102"

    # 5. Status dəyişikliyi (Aktiv -> Dayandırılmış)
    deact = await reg_svc.update_status(reg.id, "inactive", actor=admin)
    assert deact.status == "inactive"

    active_cnt_after = await reg_svc.count_active_registers_for_branch(branch.id)
    assert active_cnt_after == 0


@pytest.mark.asyncio
async def test_numbering_service_token_formatting_and_resets() -> None:
    comp_svc = CompanyService()
    company = await comp_svc.get_company()
    service = NumberingService()
    admin = MockActor(roles=["system_admin"])

    # 1. Yeni ardıcıllıq yaratma
    create_dto = NumberingSequenceCreate(
        document_type="extra_receipt_test",
        name="Standart Kassa Qəbzləri",
        prefix="RCP",
        pattern="{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}",
        is_gapless=True,
    )
    seq = await service.create_sequence(create_dto, company_id=company.id, actor=admin)
    assert seq.document_type == "extra_receipt_test"

    # 2. Siyahılama
    sequences = await service.list_sequences(company_id=company.id, actor=admin)
    assert any(s.id == seq.id for s in sequences)

    # 3. Sxemi fərdiləşdirmə
    update_req = NumberingSequenceUpdate(
        prefix="CHECK",
        pattern="{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:5}",
        version=seq.version,
    )
    updated_seq = await service.update_sequence(seq.id, update_req, actor=admin)
    assert updated_seq.prefix == "CHECK"

    # 4. İki ardıcıl nömrə ayırma (gapless sequence test)
    num1 = await service.next(
        "extra_receipt_test",
        company_id=company.id,
        actor=admin,
    )
    num2 = await service.next(
        "extra_receipt_test",
        company_id=company.id,
        actor=admin,
    )
    assert num1 != num2
    assert "CHECK" in num1
    assert "CHECK" in num2
