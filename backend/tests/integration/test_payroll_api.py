"""Əmək Haqqı (Payroll) REST API İnteqrasiya Testləri (End-to-End)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.tokens import create_access_token
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


async def create_api_user(role_code: str = "system_admin") -> tuple[dict[str, str], uuid.UUID]:
    rbac_svc = RbacService()
    await rbac_svc.seed_catalog()

    user_svc = UserService()
    user_dto = UserCreate(
        username=f"api_{role_code}_{uuid.uuid4().hex[:6]}",
        email=f"api_{role_code}_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name=f"API {role_code.title()}",
        password="TestPassword123!",
        must_change_password=False,
    )
    user, _ = await user_svc.create_user(user_dto, actor=None)

    async with UnitOfWork() as uow:
        role = await rbac_svc.repo.get_role_by_code(uow.session, role_code)
        assert role is not None
        role_id = role.id

    await rbac_svc.assign_user_roles(user.id, [role_id], actor=None)

    token = create_access_token(
        user_id=user.id,
        session_id=generate_uuid7(),
        roles=[role_code],
    )
    return {"Authorization": f"Bearer {token}"}, user.id


@pytest.mark.asyncio
async def test_payroll_api_full_flow(client: AsyncClient) -> None:
    admin_headers, _ = await create_api_user("system_admin")

    # 1. İşçi qeydiyyatı
    emp_no = f"EMP-{uuid.uuid4().hex[:4].upper()}"
    emp_resp = await client.post(
        "/api/v1/hr/employees",
        json={
            "employee_no": emp_no,
            "full_name": "Murad Qafarov",
            "email": f"murad_{uuid.uuid4().hex[:4]}@brandhouse.az",
            "phone": "+994508887766",
            "job_title": "Baş Satıcı",
            "hire_date": "2026-01-01",
            "employment_type": "FULL_TIME",
            "national_id": "5554443",
            "bank_account": "AZ88NABZ01350100000000008888",
        },
        headers=admin_headers,
    )
    assert emp_resp.status_code == 201
    emp_id = emp_resp.json()["id"]

    # 2. Maaş Profili təyini
    prof_resp = await client.post(
        "/api/v1/payroll/profiles",
        json={
            "employee_id": emp_id,
            "effective_date": "2026-01-01",
            "compensation_model": "FIXED",
            "base_salary": 1500.0,
            "currency": "AZN",
        },
        headers=admin_headers,
    )
    assert prof_resp.status_code == 201

    # 3. Qaydalar Paketi
    rules_resp = await client.post(
        "/api/v1/payroll/rule-sets",
        json={
            "name": "Qaydalar 2026",
            "version": 1,
            "effective_date": "2026-01-01",
            "rules_config": {
                "dsmf_employee_rate": "0.03",
                "its_employee_rate": "0.02",
                "unemployment_employee_rate": "0.005",
            },
        },
        headers=admin_headers,
    )
    assert rules_resp.status_code == 201

    # 4. Maaş sənədi yaradılması (DRAFT)
    run_resp = await client.post(
        "/api/v1/payroll/runs",
        json={"period_start": "2026-10-01", "period_end": "2026-10-31"},
        headers=admin_headers,
    )
    assert run_resp.status_code == 201
    run_id = run_resp.json()["id"]

    # 5. Hesablama (CALCULATE)
    calc_resp = await client.post(f"/api/v1/payroll/runs/{run_id}/calculate", headers=admin_headers)
    assert calc_resp.status_code == 200
    calc_data = calc_resp.json()
    assert calc_data["status"] == "CALCULATED"
    assert float(calc_data["total_gross"]) >= 1500.0

    # 6. Rəyə göndərmə (SUBMIT)
    sub_resp = await client.post(f"/api/v1/payroll/runs/{run_id}/submit", headers=admin_headers)
    assert sub_resp.status_code == 200
    assert sub_resp.json()["status"] == "UNDER_REVIEW"

    # 7. Təsdiq (APPROVE)
    appr_resp = await client.post(f"/api/v1/payroll/runs/{run_id}/approve", headers=admin_headers)
    assert appr_resp.status_code == 200
    assert appr_resp.json()["status"] == "APPROVED"

    # 8. Yekunlaşdırma (FINALIZE)
    fin_resp = await client.post(f"/api/v1/payroll/runs/{run_id}/finalize", headers=admin_headers)
    assert fin_resp.status_code == 200
    fin_data = fin_resp.json()
    assert fin_data["status"] == "FINALIZED"

    # 9. Bank faylı ixracı
    bank_resp = await client.get(f"/api/v1/payroll/runs/{run_id}/export-bank", headers=admin_headers)
    assert bank_resp.status_code == 200
    bank_data = bank_resp.json()
    assert bank_data["total_records"] >= 1
    assert "AZ88NABZ" in bank_data["content"]

    # 10. PDF Payslip yüklənməsi
    # Sənəd detallarını çəkib payslip id tapırıq
    run_details = await client.get(f"/api/v1/payroll/runs/{run_id}", headers=admin_headers)
    payslip_id = run_details.json()["payslips"][0]["id"]

    pdf_resp = await client.get(f"/api/v1/payroll/payslips/{payslip_id}/pdf", headers=admin_headers)
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert pdf_resp.content.startswith(b"%PDF")

    # 11. Siyahılar və Düzəlişlər (Adjustments)
    runs_resp = await client.get("/api/v1/payroll/runs", headers=admin_headers)
    assert runs_resp.status_code == 200
    assert len(runs_resp.json()) >= 1

    prof_get = await client.get(f"/api/v1/payroll/profiles/{emp_id}", headers=admin_headers)
    assert prof_get.status_code == 200
    assert float(prof_get.json()["base_salary"]) == 1500.0

    rules_get = await client.get("/api/v1/payroll/rule-sets/latest", headers=admin_headers)
    assert rules_get.status_code == 200
    assert rules_get.json()["name"] == "Qaydalar 2026"

    adj_resp = await client.post(
        "/api/v1/payroll/adjustments",
        json={
            "employee_id": emp_id,
            "type": "BONUS",
            "amount": 200.0,
            "description": "Rüblük uğurlu satış bonusu",
        },
        headers=admin_headers,
    )
    assert adj_resp.status_code == 201

    slips_resp = await client.get(
        f"/api/v1/payroll/my-payslips?employee_id={emp_id}", headers=admin_headers
    )
    assert slips_resp.status_code == 200
    assert len(slips_resp.json()) >= 1

    # 12. Ödənildi kimi qeyd etmə və Reversal
    paid_resp = await client.post(f"/api/v1/payroll/runs/{run_id}/pay", headers=admin_headers)
    assert paid_resp.status_code == 200
    assert paid_resp.json()["status"] == "PAID"

    rev_resp = await client.post(
        f"/api/v1/payroll/runs/{run_id}/reversal?reason=S%C9%99hv+d%C3%B6vr+qeydiyyat%C4%B1",
        headers=admin_headers,
    )
    assert rev_resp.status_code == 200
    assert rev_resp.json()["status"] == "FINALIZED"
    assert rev_resp.json()["reversal_of_run_id"] == run_id
