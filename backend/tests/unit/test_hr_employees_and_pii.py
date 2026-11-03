"""HR Modulu: İşçilər, Şifrələnmiş PII və Offboarding Testləri."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_pii
from app.core.errors import ConflictError, ForbiddenError, ValidationError
from app.modules.hr.models import (
    EmployeeSensitiveData,
    EmployeeStatus,
    EmploymentType,
)
from app.modules.hr.schemas import (
    DepartmentCreate,
    EmployeeCreate,
    EmployeeDocumentCreate,
    EmployeeTerminateRequest,
    EmployeeUpdate,
    EmploymentContractCreate,
    OffboardingChecklistUpdate,
    PositionCreate,
)
from app.modules.hr.services.employee_service import EmployeeService
from app.shared.audit import AuditEvent


class MockUser:
    def __init__(
        self,
        user_id: uuid.UUID,
        roles: list[str],
        permissions: list[str],
        allowed_branches: list[uuid.UUID] | None = None,
        full_name: str = "Admin User",
    ) -> None:
        self.id = user_id
        self.roles = roles
        self.permissions = permissions
        self.allowed_branches = allowed_branches or []
        self.full_name = full_name
        self.session_id = uuid.uuid4()


@pytest.fixture
def admin_actor() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["system_admin"],
        permissions=["hr.employee.manage", "hr.employee.view", "hr.pii.view"],
    )


@pytest.fixture
def hr_manager_actor() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["hr_manager"],
        permissions=["hr.employee.manage", "hr.employee.view", "hr.pii.view"],
    )


@pytest.fixture
def restricted_actor() -> MockUser:
    return MockUser(
        user_id=uuid.uuid4(),
        roles=["cashier"],
        permissions=["hr.employee.view"],  # PII view hüququ yoxdur
    )


@pytest.mark.asyncio
async def test_org_structure_crud(session: AsyncSession, admin_actor: MockUser) -> None:
    service = EmployeeService(session)

    # 1. Departament yaradılması
    dep = await service.create_department(
        DepartmentCreate(name="Pərakəndə Satış", code="DEP_RETAIL")
    )
    assert dep.id is not None
    assert dep.code == "DEP_RETAIL"

    # Təkrarlanan kod xətası
    with pytest.raises(ConflictError):
        await service.create_department(
            DepartmentCreate(name="Başqa Şöbə", code="DEP_RETAIL")
        )

    # 2. Vəzifə yaradılması
    pos = await service.create_position(
        PositionCreate(title="Baş Kassir", code="POS_CHIEF_CASHIER", department_id=dep.id)
    )
    assert pos.id is not None
    assert pos.title == "Baş Kassir"

    deps = await service.list_departments()
    assert len(deps) >= 1

    positions = await service.list_positions(dep.id)
    assert len(positions) == 1


@pytest.mark.asyncio
async def test_employee_creation_and_pii_encryption_at_rest(
    session: AsyncSession, hr_manager_actor: MockUser
) -> None:
    service = EmployeeService(session)
    branch_id = uuid.uuid4()

    create_payload = EmployeeCreate(
        employee_no="EMP-001",
        full_name="Əli Əliyev",
        email="ali.aliyev@brandhouse.az",
        phone="+994501234567",
        job_title="Satış Məsləhətçisi",
        branch_id=branch_id,
        hire_date=date(2026, 1, 15),
        employment_type=EmploymentType.FULL_TIME,
        national_id="1234567",  # FİN
        bank_account="AZ21NABZ01350100000000001234",
        date_of_birth="1995-05-20",
        home_address="Bakı şəhəri, Nizami küç. 45",
        emergency_contact="+994509876543",
    )

    resp = await service.create_employee(create_payload, hr_manager_actor)
    assert resp.employee_no == "EMP-001"
    assert resp.status == EmployeeStatus.ACTIVE

    # API cavabında məlumatlar maskalanmış olmalıdır!
    assert resp.masked_national_id == "****567"
    assert resp.masked_bank_account == "AZ...1234"
    assert "Nizami" not in resp.masked_address

    # Verilənlər bazasını birbaşa yoxlayırıq: plain text YOX, şifrəli token saxlanmalıdır!
    sens_stmt = select(EmployeeSensitiveData).where(
        EmployeeSensitiveData.employee_id == resp.id
    )
    sens_res = await session.execute(sens_stmt)
    sens_record = sens_res.scalar_one()

    assert sens_record.national_id_encrypted != "1234567"
    assert sens_record.bank_account_encrypted != "AZ21NABZ01350100000000001234"
    # Şifrəsi açıldıqda orijinal dəyər qayıtmalıdır
    assert decrypt_pii(sens_record.national_id_encrypted) == "1234567"
    assert decrypt_pii(sens_record.bank_account_encrypted) == "AZ21NABZ01350100000000001234"


@pytest.mark.asyncio
async def test_pii_reveal_with_mandatory_reason_and_audit_event(
    session: AsyncSession, hr_manager_actor: MockUser, restricted_actor: MockUser
) -> None:
    service = EmployeeService(session)

    emp = await service.create_employee(
        EmployeeCreate(
            employee_no="EMP-002",
            full_name="Leyla Məmmədova",
            email="leyla@brandhouse.az",
            phone="+994507654321",
            job_title="Baş Mühasib",
            hire_date=date(2026, 2, 1),
            national_id="7654321",
            bank_account="AZ99NABZ01350100000000009999",
            date_of_birth="1992-08-10",
        ),
        hr_manager_actor,
    )

    # 1. İcazəsiz istifadəçi PII açmağa cəhd edirsə -> ForbiddenError
    with pytest.raises(ForbiddenError):
        await service.reveal_pii(emp.id, reason="Bank yoxlanışı", actor=restricted_actor)

    # 2. Səbəb qısa və ya boşdursa -> ValidationError
    with pytest.raises(ValidationError):
        await service.reveal_pii(emp.id, reason="az", actor=hr_manager_actor)

    # 3. Uğurlu PII açılması
    reveal_resp = await service.reveal_pii(
        emp.id, reason="Əmək Müfəttişliyi Rəsmi Yoxlanışı", actor=hr_manager_actor
    )
    assert reveal_resp.national_id == "7654321"
    assert reveal_resp.bank_account == "AZ99NABZ01350100000000009999"
    assert reveal_resp.date_of_birth == "1992-08-10"

    # 4. Audit jurnalında kriptoqrafik hadisə yaranmalıdır!
    audit_stmt = select(AuditEvent).where(
        AuditEvent.resource_id == str(emp.id), AuditEvent.action == "hr.pii.revealed"
    )
    audit_res = await session.execute(audit_stmt)
    audit_evt = audit_res.scalar_one()

    assert audit_evt.severity == "security"
    assert audit_evt.reason == "Əmək Müfəttişliyi Rəsmi Yoxlanışı"
    assert audit_evt.actor_id == hr_manager_actor.id


@pytest.mark.asyncio
async def test_employee_update_and_contracts_documents(
    session: AsyncSession, hr_manager_actor: MockUser
) -> None:
    service = EmployeeService(session)

    emp = await service.create_employee(
        EmployeeCreate(
            employee_no="EMP-003",
            full_name="Rəşad Quliyev",
            email="rashad@brandhouse.az",
            phone="+994503332211",
            job_title="Anbardar",
            hire_date=date(2026, 3, 1),
            national_id="9988776",
        ),
        hr_manager_actor,
    )

    # Məlumatın yenilənməsi
    updated = await service.update_employee(
        emp.id,
        EmployeeUpdate(phone="+994509998877", national_id="1122334"),
        hr_manager_actor,
    )
    assert updated.phone == "+994509998877"
    assert updated.masked_national_id == "****334"

    # Müqavilə əlavə edilməsi
    contract = await service.add_contract(
        emp.id,
        EmploymentContractCreate(
            contract_no="MÜQ-2026-003",
            start_date=date(2026, 3, 1),
            probation_end_date=date(2026, 6, 1),
        ),
        hr_manager_actor,
    )
    assert contract.id is not None
    contracts = await service.list_contracts(emp.id, hr_manager_actor)
    assert len(contracts) == 1

    # Sənəd əlavə edilməsi
    doc = await service.add_document(
        emp.id,
        EmployeeDocumentCreate(
            document_type="PASSPORT",
            document_name="Xarici Pasport",
            file_url="https://storage.local/docs/passport.pdf",
            expiry_date=date(2028, 12, 31),
        ),
        hr_manager_actor,
    )
    assert doc.id is not None
    docs = await service.list_documents(emp.id, hr_manager_actor)
    assert len(docs) == 1


@pytest.mark.asyncio
async def test_employee_termination_and_offboarding_checklist(
    session: AsyncSession, hr_manager_actor: MockUser
) -> None:
    service = EmployeeService(session)

    emp = await service.create_employee(
        EmployeeCreate(
            employee_no="EMP-004",
            full_name="Vüqar Kərimov",
            email="vuqar@brandhouse.az",
            phone="+994504445566",
            job_title="Kassir",
            hire_date=date(2026, 1, 1),
        ),
        hr_manager_actor,
    )

    # İşdən azad edilmə
    term_resp = await service.terminate_employee(
        emp.id,
        EmployeeTerminateRequest(
            termination_date=date(2026, 10, 20),
            reason="Öz xahişi ilə əmək müqaviləsinə xitam",
        ),
        hr_manager_actor,
    )
    assert term_resp.status == EmployeeStatus.TERMINATED
    assert term_resp.termination_date == date(2026, 10, 20)

    # Offboarding checklist yoxlanışı və tamamlanması
    checklist = await service.update_offboarding_checklist(
        emp.id,
        OffboardingChecklistUpdate(
            equipment_returned=True,
            access_revoked=True,
            final_payroll_included=True,
            leave_balance_paid=True,
            notes="Bütün avadanlıqlar təhvil alındı, hesablar bağlandı.",
        ),
        hr_manager_actor,
    )
    assert checklist.equipment_returned is True
    assert checklist.access_revoked is True
    assert checklist.completed_at is not None
    assert checklist.completed_by == hr_manager_actor.id
