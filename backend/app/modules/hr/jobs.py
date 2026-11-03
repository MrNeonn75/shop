"""HR Modulu Arxa Plan Tapşırıqları (HR Background Jobs).

1. Aylıq məzuniyyət günlərinin hesablanması (Accrual Job).
2. Sənədlərin bitmə müddəti bildirişləri (30/14/7 gün).
3. Saxlama müddəti bitmiş işçilərin anonimləşdirilməsi (Retention & GDPR/Anonymization).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select

import app.core.database as db_module
from app.core.logging import logger
from app.modules.hr.models import (
    Employee,
    EmployeeDocument,
    EmployeeSensitiveData,
    EmployeeStatus,
    LeaveEntryType,
    LeaveLedgerEntry,
    LeaveType,
)


async def accrue_monthly_leave_job(_ctx: dict[str, Any] | None = None) -> int:
    """Aktiv işçilər üçün aylıq məzuniyyət günlərini append-only jurnala yazır."""
    accrued_count = 0
    today = date.today()

    async with db_module.AsyncSessionLocal() as session:
        # Bütün aktiv işçiləri və ödənişli məzuniyyət növlərini çəkirik
        emp_stmt = select(Employee).where(Employee.status == EmployeeStatus.ACTIVE)
        emp_res = await session.execute(emp_stmt)
        employees = emp_res.scalars().all()

        lt_stmt = select(LeaveType).where(LeaveType.is_active.is_(True), LeaveType.is_paid.is_(True))
        lt_res = await session.execute(lt_stmt)
        leave_types = lt_res.scalars().all()

        for emp in employees:
            for lt in leave_types:
                entry = LeaveLedgerEntry(
                    employee_id=emp.id,
                    leave_type_id=lt.id,
                    entry_type=LeaveEntryType.ACCRUAL,
                    days=lt.accrual_rate_per_month,
                    effective_date=today,
                    notes=f"Aylıq məzuniyyət hesabı ({today.strftime('%Y-%m')})",
                )
                session.add(entry)
                accrued_count += 1

        await session.commit()

    logger.info("Aylıq məzuniyyət günləri hesablandı", count=accrued_count)
    return accrued_count


async def check_document_expiry_alerts_job(_ctx: dict[str, Any] | None = None) -> int:
    """Sənədlərin bitmə müddətinə 30, 14 və 7 gün qalmış xəbərdarlıq edir."""
    today = date.today()
    alert_count = 0

    async with db_module.AsyncSessionLocal() as session:
        stmt = select(EmployeeDocument).where(EmployeeDocument.expiry_date.is_not(None))
        res = await session.execute(stmt)
        docs = res.scalars().all()

        for doc in docs:
            if not doc.expiry_date:
                continue
            days_left = (doc.expiry_date - today).days

            if 0 <= days_left <= 7 and not doc.alert_7_sent:
                logger.warning(
                    "Sənədin bitməsinə 7 gün qaldı!",
                    document_id=str(doc.id),
                    employee_id=str(doc.employee_id),
                    name=doc.document_name,
                    expiry=doc.expiry_date.isoformat(),
                )
                doc.alert_7_sent = True
                alert_count += 1
            elif 7 < days_left <= 14 and not doc.alert_14_sent:
                logger.warning(
                    "Sənədin bitməsinə 14 gün qaldı",
                    document_id=str(doc.id),
                    employee_id=str(doc.employee_id),
                    name=doc.document_name,
                    expiry=doc.expiry_date.isoformat(),
                )
                doc.alert_14_sent = True
                alert_count += 1
            elif 14 < days_left <= 30 and not doc.alert_30_sent:
                logger.info(
                    "Sənədin bitməsinə 30 gün qaldı",
                    document_id=str(doc.id),
                    employee_id=str(doc.employee_id),
                    name=doc.document_name,
                    expiry=doc.expiry_date.isoformat(),
                )
                doc.alert_30_sent = True
                alert_count += 1

        await session.commit()

    return alert_count


async def anonymize_retention_expired_employees_job(
    retention_days: int = 1825, _ctx: dict[str, Any] | None = None
) -> int:
    """Müddəti bitmiş və hüquqi qadağası (legal hold) olmayan işçiləri anonimləşdirir."""
    cutoff_date = date.today() - timedelta(days=retention_days)
    anonymized_count = 0

    async with db_module.AsyncSessionLocal() as session:
        stmt = (
            select(Employee)
            .where(
                Employee.status == EmployeeStatus.TERMINATED,
                Employee.termination_date <= cutoff_date,
                Employee.is_legal_hold.is_(False),
                Employee.is_anonymized.is_(False),
            )
        )
        res = await session.execute(stmt)
        employees = res.scalars().all()

        for emp in employees:
            emp.full_name = f"Anonim İşçi #{emp.employee_no}"
            emp.email = f"anonymized_{emp.id}@deleted.local"
            emp.phone = "+994000000000"
            emp.is_anonymized = True

            # Həssas PII cədvəlini təmizləyirik
            sens_stmt = select(EmployeeSensitiveData).where(
                EmployeeSensitiveData.employee_id == emp.id
            )
            sens_res = await session.execute(sens_stmt)
            sens = sens_res.scalar_one_or_none()
            if sens:
                sens.national_id_encrypted = None
                sens.bank_account_encrypted = None
                sens.address_encrypted = None
                sens.date_of_birth_encrypted = None
                sens.emergency_contact_encrypted = None

            anonymized_count += 1

        await session.commit()

    if anonymized_count > 0:
        logger.info("Saxlama müddəti bitmiş işçilər anonimləşdirildi", count=anonymized_count)
    return anonymized_count
