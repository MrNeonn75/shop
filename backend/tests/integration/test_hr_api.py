"""HR Modulu REST API İnteqrasiya Testləri (End-to-End)."""

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
async def test_hr_api_full_flow(client: AsyncClient) -> None:
    headers, _ = await create_api_user("system_admin")

    # 1. Departament və Vəzifə yaradılması
    dep_resp = await client.post(
        "/api/v1/hr/departments",
        json={"name": "Pərakəndə Əməliyyatlar", "code": f"DEP_{uuid.uuid4().hex[:4].upper()}"},
        headers=headers,
    )
    assert dep_resp.status_code == 201
    dep_data = dep_resp.json()

    pos_resp = await client.post(
        "/api/v1/hr/positions",
        json={"title": "Satıcı-Məsləhətçi", "code": f"POS_{uuid.uuid4().hex[:4].upper()}", "department_id": dep_data["id"]},
        headers=headers,
    )
    assert pos_resp.status_code == 201

    # 2. İşçi yaradılması
    emp_no = f"EMP-{uuid.uuid4().hex[:4].upper()}"
    emp_payload = {
        "employee_no": emp_no,
        "full_name": "Rüstəm Əhmədov",
        "email": f"rustam_{uuid.uuid4().hex[:4]}@brandhouse.az",
        "phone": "+994509990011",
        "job_title": "Satıcı-Məsləhətçi",
        "department_id": dep_data["id"],
        "hire_date": "2026-02-01",
        "employment_type": "FULL_TIME",
        "national_id": "9998887",
        "bank_account": "AZ12NABZ01350100000000007777",
        "date_of_birth": "1998-03-15",
    }
    emp_resp = await client.post("/api/v1/hr/employees", json=emp_payload, headers=headers)
    assert emp_resp.status_code == 201
    emp_data = emp_resp.json()
    assert emp_data["masked_national_id"] == "****887"
    assert emp_data["masked_bank_account"] == "AZ...7777"
    emp_id = emp_data["id"]

    # 3. PII Reveal endpoint-i (Səbəblə)
    reveal_resp = await client.post(
        f"/api/v1/hr/employees/{emp_id}/reveal-pii",
        json={"reason": "Maaş kartının sifarişi üçün banka təqdim edilməsi"},
        headers=headers,
    )
    assert reveal_resp.status_code == 200
    rev_data = reveal_resp.json()
    assert rev_data["national_id"] == "9998887"
    assert rev_data["bank_account"] == "AZ12NABZ01350100000000007777"

    # 4. Növbə Şablonu və Planlama
    tpl_resp = await client.post(
        "/api/v1/hr/shift-templates",
        json={
            "name": "Növbə A",
            "code": f"TPL_{uuid.uuid4().hex[:4].upper()}",
            "start_time": "10:00",
            "end_time": "19:00",
            "break_minutes": 60,
        },
        headers=headers,
    )
    assert tpl_resp.status_code == 201
    tpl_data = tpl_resp.json()

    period_resp = await client.post(
        "/api/v1/hr/schedules/periods",
        json={
            "branch_id": str(uuid.uuid4()),
            "name": "Həftəlik Qrafik 44",
            "start_date": "2026-10-26",
            "end_date": "2026-11-01",
        },
        headers=headers,
    )
    assert period_resp.status_code == 201
    period_id = period_resp.json()["id"]

    # Toplu təyinat
    assign_resp = await client.post(
        f"/api/v1/hr/schedules/periods/{period_id}/assignments-bulk",
        json={
            "assignments": [
                {
                    "employee_id": emp_id,
                    "date": "2026-10-26",
                    "shift_template_id": tpl_data["id"],
                }
            ]
        },
        headers=headers,
    )
    assert assign_resp.status_code == 200

    # 5. Davamiyyət (Punch IN / OUT)
    punch_resp = await client.post(
        "/api/v1/hr/attendance/punches",
        json={
            "employee_id": emp_id,
            "punch_time": "2026-10-26T10:02:00Z",
            "punch_type": "IN",
            "source": "MANUAL",
        },
        headers=headers,
    )
    assert punch_resp.status_code == 201

    # 6. Məzuniyyət növü və Balans
    lt_resp = await client.post(
        "/api/v1/hr/leave/types",
        json={
            "code": f"ANNUAL_{uuid.uuid4().hex[:4].upper()}",
            "name": "İllik Əmək Məzuniyyəti",
            "is_paid": True,
            "accrual_rate_per_month": 1.75,
        },
        headers=headers,
    )
    assert lt_resp.status_code == 201
    lt_data = lt_resp.json()

    # Manual balans artımı
    adj_resp = await client.post(
        "/api/v1/hr/leave/ledger/adjust",
        json={
            "employee_id": emp_id,
            "leave_type_id": lt_data["id"],
            "entry_type": "ADJUSTMENT",
            "days": 15.0,
            "effective_date": "2026-02-01",
            "notes": "İlkin balans təyini",
        },
        headers=headers,
    )
    assert adj_resp.status_code == 201

    # Balans sorğusu
    bal_resp = await client.get(f"/api/v1/hr/leave/balances/{emp_id}", headers=headers)
    assert bal_resp.status_code == 200
    balances = bal_resp.json()
    assert any(float(b["current_balance"]) == 15.0 for b in balances)


@pytest.mark.asyncio
async def test_hr_api_extended_coverage(client: AsyncClient) -> None:
    headers, _ = await create_api_user("system_admin")

    # 1. Departament və Vəzifə siyahıları
    dep_list = await client.get("/api/v1/hr/departments", headers=headers)
    assert dep_list.status_code == 200
    pos_list = await client.get("/api/v1/hr/positions", headers=headers)
    assert pos_list.status_code == 200

    # 2. İşçi yaratma və əldə etmə
    emp_no = f"EMP-EXT-{uuid.uuid4().hex[:4].upper()}"
    emp_resp = await client.post(
        "/api/v1/hr/employees",
        json={
            "employee_no": emp_no,
            "full_name": "Leyla Əliyeva",
            "email": f"leyla_{uuid.uuid4().hex[:4]}@brandhouse.az",
            "phone": "+994503332211",
            "job_title": "HR Mütəxəssis",
            "hire_date": "2026-03-01",
            "employment_type": "FULL_TIME",
        },
        headers=headers,
    )
    assert emp_resp.status_code == 201
    emp_id = emp_resp.json()["id"]

    # Detal
    get_emp = await client.get(f"/api/v1/hr/employees/{emp_id}", headers=headers)
    assert get_emp.status_code == 200
    assert get_emp.json()["employee_no"] == emp_no

    # Redaktə
    upd_emp = await client.patch(
        f"/api/v1/hr/employees/{emp_id}",
        json={"job_title": "Aparıcı HR Mütəxəssis"},
        headers=headers,
    )
    assert upd_emp.status_code == 200
    assert upd_emp.json()["job_title"] == "Aparıcı HR Mütəxəssis"

    # 3. Əmək Müqaviləsi və Sənədlər
    c_resp = await client.post(
        f"/api/v1/hr/employees/{emp_id}/contracts",
        json={
            "contract_no": f"CTR-{uuid.uuid4().hex[:6].upper()}",
            "contract_type": "PERMANENT",
            "start_date": "2026-03-01",
            "probation_end_date": "2026-06-01",
            "terms_reference": "Müqavilə №45",
        },
        headers=headers,
    )
    assert c_resp.status_code == 201

    get_c = await client.get(f"/api/v1/hr/employees/{emp_id}/contracts", headers=headers)
    assert get_c.status_code == 200
    assert len(get_c.json()) >= 1

    d_resp = await client.post(
        f"/api/v1/hr/employees/{emp_id}/documents",
        json={
            "document_type": "ID_CARD",
            "document_name": "Şəxsiyyət Vəsiqəsi",
            "file_url": "/uploads/id.pdf",
            "expiry_date": "2030-01-01",
        },
        headers=headers,
    )
    assert d_resp.status_code == 201

    get_d = await client.get(f"/api/v1/hr/employees/{emp_id}/documents", headers=headers)
    assert get_d.status_code == 200
    assert len(get_d.json()) >= 1

    # 4. Cədvəl şablonları və dövrləri siyahılama
    tpls = await client.get("/api/v1/hr/shift-templates", headers=headers)
    assert tpls.status_code == 200
    periods = await client.get("/api/v1/hr/schedules/periods", headers=headers)
    assert periods.status_code == 200

    # 5. Məzuniyyət sorğusu və qərar
    lt_resp = await client.post(
        "/api/v1/hr/leave/types",
        json={
            "code": f"LEAVE_{uuid.uuid4().hex[:4].upper()}",
            "name": "Təhsil Məzuniyyəti",
            "is_paid": False,
            "accrual_rate_per_month": 0.0,
        },
        headers=headers,
    )
    assert lt_resp.status_code == 201
    lt_id = lt_resp.json()["id"]

    # Əvvəlcə balans əlavə edirik
    await client.post(
        "/api/v1/hr/leave/ledger/adjust",
        json={
            "employee_id": emp_id,
            "leave_type_id": lt_id,
            "entry_type": "ADJUSTMENT",
            "days": 10.0,
            "effective_date": "2026-03-01",
            "notes": "Təhsil balansı",
        },
        headers=headers,
    )

    req_resp = await client.post(
        "/api/v1/hr/leave/requests",
        json={
            "employee_id": emp_id,
            "leave_type_id": lt_id,
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "days_count": 3.0,
            "reason": "İmtahan sessiyası",
        },
        headers=headers,
    )
    assert req_resp.status_code == 201
    req_id = req_resp.json()["id"]

    decide_resp = await client.post(
        f"/api/v1/hr/leave/requests/{req_id}/decision",
        json={"approve": True},
        headers=headers,
    )
    assert decide_resp.status_code == 200
    assert decide_resp.json()["status"] == "APPROVED"

    # 6. Tabel (Timesheet)
    ts_resp = await client.post(
        f"/api/v1/hr/attendance/timesheets/generate?employee_id={emp_id}&year=2026&month=3",
        headers=headers,
    )
    assert ts_resp.status_code in (200, 201)
    ts_data = ts_resp.json()
    ts_id = ts_data["id"]

    sub_ts = await client.post(f"/api/v1/hr/attendance/timesheets/{ts_id}/submit", headers=headers)
    assert sub_ts.status_code == 200
    appr_ts = await client.post(f"/api/v1/hr/attendance/timesheets/{ts_id}/approve", headers=headers)
    assert appr_ts.status_code == 200
    lock_ts = await client.post(f"/api/v1/hr/attendance/timesheets/{ts_id}/lock", headers=headers)
    assert lock_ts.status_code == 200

    # 7. Offboarding və İşdən çıxarma
    off_resp = await client.patch(
        f"/api/v1/hr/employees/{emp_id}/offboarding",
        json={
            "equipment_returned": True,
            "access_revoked": True,
            "final_payroll_processed": True,
            "leave_balance_payout": 0.0,
            "notes": "Bütün avadanlıqlar təhvil verildi.",
        },
        headers=headers,
    )
    assert off_resp.status_code == 200

    get_off = await client.get(
        f"/api/v1/hr/employees/{emp_id}/offboarding", headers=headers
    )
    assert get_off.status_code == 200
    assert get_off.json()["equipment_returned"] is True

    term_resp = await client.post(
        f"/api/v1/hr/employees/{emp_id}/terminate",
        json={
            "termination_date": "2026-03-31",
            "reason": "Öz xahişi ilə",
        },
        headers=headers,
    )
    assert term_resp.status_code == 200
    assert term_resp.json()["status"] == "TERMINATED"

