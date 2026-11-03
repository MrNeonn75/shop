"""HR Modulu Arxa Plan Tapşırıqları (Background Jobs) Testləri."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.database as db_module
from app.modules.hr.jobs import (
    accrue_monthly_leave_job,
    anonymize_retention_expired_employees_job,
    check_document_expiry_alerts_job,
)
from app.modules.hr.models import (
    Employee,
    EmployeeDocument,
    EmployeeSensitiveData,
    EmployeeStatus,
    LeaveType,
)


@pytest.mark.asyncio
async def test_accrue_monthly_leave_job(session: AsyncSession) -> None:
    # Aktiv işçi və ödənişli məzuniyyət növü
    emp_id = uuid.uuid4()
    emp = Employee(
        id=emp_id,
        employee_no="JOB-EMP-1",
        full_name="Cəmil Məmmədov",
        email="camil@brandhouse.az",
        phone="+994501112233",
        job_title="Satıcı",
        hire_date=date(2026, 1, 1),
        status=EmployeeStatus.ACTIVE,
    )
    lt = LeaveType(
        code="JOB_ANNUAL",
        name="İllik Məzuniyyət",
        is_paid=True,
        accrual_rate_per_month=Decimal("1.75"),
        is_active=True,
    )
    session.add_all([emp, lt])
    await session.commit()

    # AsyncSessionLocal mock-layırıq ki, eyni test DB sessiyasını istifadə etsin
    class MockSessionFactory:
        def __call__(self) -> MockSessionFactory:
            return self

        async def __aenter__(self) -> AsyncSession:
            return session

        async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
            pass

    with patch.object(db_module, "AsyncSessionLocal", MockSessionFactory()):
        accrued = await accrue_monthly_leave_job()
        assert accrued >= 1


@pytest.mark.asyncio
async def test_check_document_expiry_alerts_job(session: AsyncSession) -> None:
    emp_id = uuid.uuid4()
    emp = Employee(
        id=emp_id,
        employee_no="JOB-EMP-2",
        full_name="Samirə Rzayeva",
        email="samira@brandhouse.az",
        phone="+994501112244",
        job_title="Menecer",
        hire_date=date(2026, 1, 1),
        status=EmployeeStatus.ACTIVE,
    )
    session.add(emp)
    await session.flush()

    today = date.today()
    doc7 = EmployeeDocument(
        employee_id=emp_id,
        document_type="PASSPORT",
        document_name="Pasport",
        file_url="/docs/passport.pdf",
        expiry_date=today + timedelta(days=5),
    )
    doc14 = EmployeeDocument(
        employee_id=emp_id,
        document_type="DRIVING_LICENSE",
        document_name="Sürücülük Vəsiqəsi",
        file_url="/docs/license.pdf",
        expiry_date=today + timedelta(days=10),
    )
    doc30 = EmployeeDocument(
        employee_id=emp_id,
        document_type="MEDICAL_CERT",
        document_name="Tibbi Arayış",
        file_url="/docs/med.pdf",
        expiry_date=today + timedelta(days=20),
    )
    session.add_all([doc7, doc14, doc30])
    await session.commit()

    class MockSessionFactory:
        def __call__(self) -> MockSessionFactory:
            return self

        async def __aenter__(self) -> AsyncSession:
            return session

        async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
            pass

    with patch.object(db_module, "AsyncSessionLocal", MockSessionFactory()):
        alerts = await check_document_expiry_alerts_job()
        assert alerts >= 3
        assert doc7.alert_7_sent is True
        assert doc14.alert_14_sent is True
        assert doc30.alert_30_sent is True


@pytest.mark.asyncio
async def test_anonymize_retention_expired_employees_job(session: AsyncSession) -> None:
    emp_id = uuid.uuid4()
    # 5 ildən çox əvvəl işdən azad olunmuş işçi (retention müddəti bitmiş)
    emp = Employee(
        id=emp_id,
        employee_no="JOB-EMP-OLD",
        full_name="Köhnə Əməkdaş",
        email="old_emp@brandhouse.az",
        phone="+994509999999",
        job_title="Köhnə Vəzifə",
        hire_date=date(2018, 1, 1),
        termination_date=date.today() - timedelta(days=2000),
        status=EmployeeStatus.TERMINATED,
        is_legal_hold=False,
        is_anonymized=False,
    )
    sens = EmployeeSensitiveData(
        employee_id=emp_id,
        national_id_encrypted="secret_id",
        bank_account_encrypted="secret_bank",
    )
    session.add_all([emp, sens])
    await session.commit()

    class MockSessionFactory:
        def __call__(self) -> MockSessionFactory:
            return self

        async def __aenter__(self) -> AsyncSession:
            return session

        async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
            pass

    with patch.object(db_module, "AsyncSessionLocal", MockSessionFactory()):
        count = await anonymize_retention_expired_employees_job(retention_days=1825)
        assert count >= 1
        assert emp.is_anonymized is True
        assert "Anonim İşçi" in emp.full_name
        assert sens.national_id_encrypted is None
