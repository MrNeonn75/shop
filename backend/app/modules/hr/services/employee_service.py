"""İşçi İdarəetməsi və PII Qorunması Servisi (Employee Service)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import (
    decrypt_pii,
    encrypt_pii,
    mask_address,
    mask_bank_account,
    mask_national_id,
)
from app.core.database import utc_now
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.modules.hr.models import (
    Department,
    Employee,
    EmployeeAssignment,
    EmployeeDocument,
    EmployeeSensitiveData,
    EmployeeStatus,
    EmploymentContract,
    OffboardingChecklist,
    Position,
)
from app.modules.hr.policies import HRPolicy
from app.modules.hr.repository import HRRepository
from app.modules.hr.schemas import (
    DepartmentCreate,
    EmployeeCreate,
    EmployeeDocumentCreate,
    EmployeeResponse,
    EmployeeRevealPIIResponse,
    EmployeeTerminateRequest,
    EmployeeUpdate,
    EmploymentContractCreate,
    OffboardingChecklistUpdate,
    PositionCreate,
)
from app.shared.audit import record_audit_event


class EmployeeService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = HRRepository(session)

    # ------------------------------------------
    # Org Structure
    # ------------------------------------------

    async def create_department(self, payload: DepartmentCreate) -> Department:
        existing = await self.repo.get_department_by_code(payload.code)
        if existing:
            raise ConflictError(f"Bu kodla departament artıq mövcuddur: {payload.code}")
        dep = Department(
            name=payload.name,
            code=payload.code,
            parent_id=payload.parent_id,
            manager_id=payload.manager_id,
        )
        return await self.repo.create_department(dep)

    async def list_departments(self) -> Sequence[Department]:
        return await self.repo.list_departments()

    async def create_position(self, payload: PositionCreate) -> Position:
        pos = Position(
            title=payload.title,
            code=payload.code,
            department_id=payload.department_id,
            description=payload.description,
            requirements=payload.requirements,
        )
        return await self.repo.create_position(pos)

    async def list_positions(self, department_id: uuid.UUID | None = None) -> Sequence[Position]:
        return await self.repo.list_positions(department_id)

    # ------------------------------------------
    # Employees
    # ------------------------------------------

    async def create_employee(self, payload: EmployeeCreate, actor: Any) -> EmployeeResponse:
        HRPolicy.check_can_manage_employee(actor)
        HRPolicy.check_branch_scope(actor, payload.branch_id)

        existing = await self.repo.get_employee_by_no(payload.employee_no)
        if existing:
            raise ConflictError(f"Bu tabel nömrəsi ilə işçi artıq mövcuddur: {payload.employee_no}")

        emp = Employee(
            employee_no=payload.employee_no,
            full_name=payload.full_name,
            email=str(payload.email),
            phone=payload.phone,
            job_title=payload.job_title,
            department_id=payload.department_id,
            branch_id=payload.branch_id,
            manager_id=payload.manager_id,
            hire_date=payload.hire_date,
            employment_type=payload.employment_type,
            linked_user_id=payload.linked_user_id,
            photo_url=payload.photo_url,
            status=EmployeeStatus.ACTIVE,
        )
        created_emp = await self.repo.create_employee(emp)

        # Şifrələnmiş PII saxlanması
        sens = EmployeeSensitiveData(
            employee_id=created_emp.id,
            national_id_encrypted=encrypt_pii(payload.national_id),
            bank_account_encrypted=encrypt_pii(payload.bank_account),
            date_of_birth_encrypted=encrypt_pii(payload.date_of_birth),
            address_encrypted=encrypt_pii(payload.home_address),
            emergency_contact_encrypted=encrypt_pii(payload.emergency_contact),
        )
        await self.repo.save_sensitive_data(sens)

        # İlkin təyinat qeydi
        if payload.branch_id:
            asgn = EmployeeAssignment(
                employee_id=created_emp.id,
                branch_id=payload.branch_id,
                department_id=payload.department_id,
                job_title=payload.job_title,
                manager_id=payload.manager_id,
                valid_from=payload.hire_date,
            )
            await self.repo.add_assignment(asgn)

        return self._format_employee_response(created_emp, sens)

    async def get_employee(self, employee_id: uuid.UUID, actor: Any) -> EmployeeResponse:
        HRPolicy.check_can_view_employee(actor)
        emp = await self.repo.get_employee(employee_id)
        if not emp:
            raise NotFoundError(f"İşçi tapılmadı: {employee_id}")
        HRPolicy.check_branch_scope(actor, emp.branch_id)
        return self._format_employee_response(emp, emp.sensitive_data)

    async def list_employees(
        self,
        actor: Any,
        branch_id: uuid.UUID | None = None,
        department_id: uuid.UUID | None = None,
        status: EmployeeStatus | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[EmployeeResponse], int]:
        HRPolicy.check_can_view_employee(actor)
        HRPolicy.check_branch_scope(actor, branch_id)
        employees, total = await self.repo.list_employees(
            branch_id=branch_id,
            department_id=department_id,
            status=status,
            skip=skip,
            limit=limit,
        )
        return [self._format_employee_response(e, e.sensitive_data) for e in employees], total

    async def update_employee(
        self, employee_id: uuid.UUID, payload: EmployeeUpdate, actor: Any
    ) -> EmployeeResponse:
        HRPolicy.check_can_manage_employee(actor)
        emp = await self.repo.get_employee(employee_id)
        if not emp:
            raise NotFoundError(f"İşçi tapılmadı: {employee_id}")
        HRPolicy.check_branch_scope(actor, emp.branch_id)

        if payload.full_name is not None:
            emp.full_name = payload.full_name
        if payload.email is not None:
            emp.email = str(payload.email)
        if payload.phone is not None:
            emp.phone = payload.phone
        if payload.job_title is not None:
            emp.job_title = payload.job_title
        if payload.department_id is not None:
            emp.department_id = payload.department_id
        if payload.branch_id is not None:
            emp.branch_id = payload.branch_id
        if payload.manager_id is not None:
            emp.manager_id = payload.manager_id
        if payload.employment_type is not None:
            emp.employment_type = payload.employment_type
        if payload.photo_url is not None:
            emp.photo_url = payload.photo_url
        if payload.is_legal_hold is not None:
            emp.is_legal_hold = payload.is_legal_hold

        emp.version += 1

        # Həssas məlumatların yenilənməsi
        sens = await self.repo.get_sensitive_data(employee_id)
        if not sens:
            sens = EmployeeSensitiveData(employee_id=employee_id)
        if payload.national_id is not None:
            sens.national_id_encrypted = encrypt_pii(payload.national_id)
        if payload.bank_account is not None:
            sens.bank_account_encrypted = encrypt_pii(payload.bank_account)
        if payload.date_of_birth is not None:
            sens.date_of_birth_encrypted = encrypt_pii(payload.date_of_birth)
        if payload.home_address is not None:
            sens.address_encrypted = encrypt_pii(payload.home_address)
        if payload.emergency_contact is not None:
            sens.emergency_contact_encrypted = encrypt_pii(payload.emergency_contact)
        await self.repo.save_sensitive_data(sens)

        return self._format_employee_response(emp, sens)

    async def reveal_pii(
        self, employee_id: uuid.UUID, reason: str, actor: Any
    ) -> EmployeeRevealPIIResponse:
        """Həssas PII məlumatlarını audit qeydiyyatı ilə açır."""
        HRPolicy.check_can_reveal_pii(actor)
        if not reason or len(reason.strip()) < 5:
            raise ValidationError("PII məlumatlarının açılması üçün ətraflı səbəb (ən azı 5 simvol) göstərilməlidir.")

        emp = await self.repo.get_employee(employee_id)
        if not emp:
            raise NotFoundError(f"İşçi tapılmadı: {employee_id}")

        sens = await self.repo.get_sensitive_data(employee_id)

        # Audit hadisəsi qeyd olunur
        actor_id = getattr(actor, "id", None)
        actor_session_id = getattr(actor, "session_id", None)
        await record_audit_event(
            session=self.session,
            action="hr.pii.revealed",
            resource_type="employee",
            resource_id=str(employee_id),
            actor_id=actor_id,
            actor_session_id=actor_session_id,
            branch_id=emp.branch_id,
            module="hr",
            diff={"reason": reason, "employee_no": emp.employee_no},
            reason=reason,
            severity="security",
        )
        await self.session.flush()

        return EmployeeRevealPIIResponse(
            employee_id=employee_id,
            national_id=decrypt_pii(sens.national_id_encrypted) if sens else None,
            bank_account=decrypt_pii(sens.bank_account_encrypted) if sens else None,
            date_of_birth=decrypt_pii(sens.date_of_birth_encrypted) if sens else None,
            home_address=decrypt_pii(sens.address_encrypted) if sens else None,
            emergency_contact=decrypt_pii(sens.emergency_contact_encrypted) if sens else None,
            revealed_at=utc_now(),
            revealed_by=getattr(actor, "full_name", str(actor_id)),
        )

    async def terminate_employee(
        self, employee_id: uuid.UUID, payload: EmployeeTerminateRequest, actor: Any
    ) -> EmployeeResponse:
        HRPolicy.check_can_manage_employee(actor)
        emp = await self.repo.get_employee(employee_id)
        if not emp:
            raise NotFoundError(f"İşçi tapılmadı: {employee_id}")
        HRPolicy.check_branch_scope(actor, emp.branch_id)

        emp.status = EmployeeStatus.TERMINATED
        emp.termination_date = payload.termination_date
        emp.termination_reason = payload.reason
        emp.version += 1

        # Avtomatik offboarding checklist yaradılır
        checklist = await self.repo.get_offboarding_checklist(employee_id)
        if not checklist:
            checklist = OffboardingChecklist(employee_id=employee_id)
            await self.repo.save_offboarding_checklist(checklist)

        return self._format_employee_response(emp, emp.sensitive_data)

    async def update_offboarding_checklist(
        self, employee_id: uuid.UUID, payload: OffboardingChecklistUpdate, actor: Any
    ) -> OffboardingChecklist:
        HRPolicy.check_can_manage_employee(actor)
        checklist = await self.repo.get_offboarding_checklist(employee_id)
        if not checklist:
            checklist = OffboardingChecklist(employee_id=employee_id)

        if payload.equipment_returned is not None:
            checklist.equipment_returned = payload.equipment_returned
        if payload.access_revoked is not None:
            checklist.access_revoked = payload.access_revoked
        if payload.final_payroll_included is not None:
            checklist.final_payroll_included = payload.final_payroll_included
        if payload.leave_balance_paid is not None:
            checklist.leave_balance_paid = payload.leave_balance_paid
        if payload.notes is not None:
            checklist.notes = payload.notes

        if (
            checklist.equipment_returned
            and checklist.access_revoked
            and checklist.final_payroll_included
        ):
            checklist.completed_at = utc_now()
            checklist.completed_by = getattr(actor, "id", None)

        return await self.repo.save_offboarding_checklist(checklist)

    async def add_contract(
        self, employee_id: uuid.UUID, payload: EmploymentContractCreate, actor: Any
    ) -> EmploymentContract:
        HRPolicy.check_can_manage_employee(actor)
        emp = await self.repo.get_employee(employee_id)
        if not emp:
            raise NotFoundError(f"İşçi tapılmadı: {employee_id}")

        ctr = EmploymentContract(
            employee_id=employee_id,
            contract_no=payload.contract_no,
            contract_type=payload.contract_type,
            start_date=payload.start_date,
            end_date=payload.end_date,
            probation_end_date=payload.probation_end_date,
            terms_reference=payload.terms_reference,
            document_url=payload.document_url,
        )
        return await self.repo.add_contract(ctr)

    async def list_contracts(self, employee_id: uuid.UUID, actor: Any) -> Sequence[EmploymentContract]:
        HRPolicy.check_can_view_employee(actor)
        return await self.repo.list_contracts(employee_id)

    async def add_document(
        self, employee_id: uuid.UUID, payload: EmployeeDocumentCreate, actor: Any
    ) -> EmployeeDocument:
        HRPolicy.check_can_manage_employee(actor)
        emp = await self.repo.get_employee(employee_id)
        if not emp:
            raise NotFoundError(f"İşçi tapılmadı: {employee_id}")

        doc = EmployeeDocument(
            employee_id=employee_id,
            document_type=payload.document_type,
            document_name=payload.document_name,
            file_url=payload.file_url,
            expiry_date=payload.expiry_date,
        )
        return await self.repo.add_document(doc)

    async def list_documents(self, employee_id: uuid.UUID, actor: Any) -> Sequence[EmployeeDocument]:
        HRPolicy.check_can_view_employee(actor)
        return await self.repo.list_documents(employee_id)

    # ------------------------------------------
    # Formatters
    # ------------------------------------------

    def _format_employee_response(
        self, emp: Employee, sens: EmployeeSensitiveData | None
    ) -> EmployeeResponse:
        plain_national_id = decrypt_pii(sens.national_id_encrypted) if sens else None
        plain_bank_account = decrypt_pii(sens.bank_account_encrypted) if sens else None
        plain_address = decrypt_pii(sens.address_encrypted) if sens else None

        return EmployeeResponse(
            id=emp.id,
            employee_no=emp.employee_no,
            full_name=emp.full_name,
            email=emp.email,
            phone=emp.phone,
            status=emp.status,
            job_title=emp.job_title,
            department_id=emp.department_id,
            branch_id=emp.branch_id,
            manager_id=emp.manager_id,
            hire_date=emp.hire_date,
            termination_date=emp.termination_date,
            termination_reason=emp.termination_reason,
            employment_type=emp.employment_type,
            linked_user_id=emp.linked_user_id,
            photo_url=emp.photo_url,
            is_legal_hold=emp.is_legal_hold,
            is_anonymized=emp.is_anonymized,
            version=emp.version,
            created_at=emp.created_at,
            updated_at=emp.updated_at,
            masked_national_id=mask_national_id(plain_national_id),
            masked_bank_account=mask_bank_account(plain_bank_account),
            masked_address=mask_address(plain_address),
        )
