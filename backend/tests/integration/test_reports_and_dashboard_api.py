"""Brand House ERP — Hesabatlılıq və İdarə Paneli REST API İnteqrasiya Testləri."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.tokens import create_access_token
from app.modules.branches.models import Branch
from app.modules.company.models import Company
from app.modules.rbac.service import RbacService
from app.modules.reporting.models import DailySalesSummary
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


async def create_api_user(role_code: str = "system_admin") -> tuple[dict[str, str], uuid.UUID]:
    rbac_svc = RbacService()
    await rbac_svc.seed_catalog()

    user_svc = UserService()
    user_dto = UserCreate(
        username=f"rep_{role_code}_{uuid.uuid4().hex[:6]}",
        email=f"rep_{role_code}_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name=f"Report {role_code.title()}",
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
async def test_reporting_and_dashboard_api_full_suite(client: AsyncClient) -> None:
    """Hesabatlılıq və İdarə Paneli bütün API marşrutlarının tam sınağı."""
    headers, user_id = await create_api_user("system_admin")

    # İlkin şirkət və filial yaradılır
    branch_id = uuid.uuid4()
    company_id = uuid.uuid4()
    async with UnitOfWork() as uow:
        comp = Company(
            id=company_id,
            name="Test Şirkət",
            code=f"CMP-{uuid.uuid4().hex[:4]}",
            legal_name="Test Şirkət MMC",
            tax_id="1234567890",
            address="Bakı ş.",
            phone="+994120000000",
            email="info@brandhouse.az",
        )
        uow.session.add(comp)
        branch = Branch(
            id=branch_id,
            company_id=company_id,
            name="Nizami Filialı",
            code=f"BR-{uuid.uuid4().hex[:4]}",
            address="Bakı ş., Nizami küç. 10",
            phone="+994125555555",
        )
        uow.session.add(branch)

        # Xülasə məlumatı əlavə edirik
        summary = DailySalesSummary(
            company_id=company_id,
            report_date=date.today(),
            branch_id=branch_id,
            tender_type="CASH",
            gross_sales=Decimal("1500.00"),
            net_sales=Decimal("1500.00"),
            cogs_amount=Decimal("900.00"),
            gross_profit=Decimal("600.00"),
            transaction_count=15,
            units_sold=25,
            source_version=1,
        )
        uow.session.add(summary)
        await uow.commit()

    # 1. Hesabat Kataloqu (Definitions)
    resp = await client.get("/api/v1/reports/definitions", headers=headers)
    assert resp.status_code == 200
    defs = resp.json()
    assert len(defs) >= 61

    # 2. Hesabat İcrası (Run Report)
    run_payload = {
        "filters": {"date_from": date.today().isoformat(), "date_to": date.today().isoformat()},
        "page": 1,
        "page_size": 20,
    }
    resp = await client.post(
        "/api/v1/reports/sales_daily/run", json=run_payload, headers=headers
    )
    assert resp.status_code == 200
    rep_res = resp.json()
    assert rep_res["report_id"] == "sales_daily"
    assert rep_res["data_as_of"] is not None
    assert len(rep_res["columns"]) > 0

    # 3. Asinxron Hesabat Tapşırığı (Run Async)
    async_payload = {
        "filters": {"date_from": date.today().isoformat()},
        "channel": "EMAIL",
    }
    resp = await client.post(
        "/api/v1/reports/sales_daily/run-async", json=async_payload, headers=headers
    )
    assert resp.status_code == 202
    job_res = resp.json()
    job_id = job_res["id"]

    # Statusun oxunması
    resp = await client.get(f"/api/v1/reports/jobs/{job_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "COMPLETED"

    # 4. İxrac (Export: CSV, XLSX, PDF)
    for fmt in ["CSV", "XLSX", "PDF"]:
        exp_payload = {
            "format": fmt,
            "filters": {},
            "reason": "Rəsmi audit yoxlanışı",
        }
        resp = await client.post(
            "/api/v1/reports/sales_daily/export", json=exp_payload, headers=headers
        )
        assert resp.status_code == 200
        assert len(resp.content) > 0

    # 5. Yadda saxlanılmış filtrlər (Presets)
    preset_payload = {
        "report_id": "sales_daily",
        "name": "Mənim Sevimli Filtrim",
        "filters": {"branch_id": str(branch_id)},
        "is_shared": True,
        "is_favorite": True,
    }
    resp = await client.post("/api/v1/reports/sales_daily/presets", json=preset_payload, headers=headers)
    assert resp.status_code == 201
    preset_id = resp.json()["id"]

    resp = await client.get("/api/v1/reports/presets", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    resp = await client.delete(f"/api/v1/reports/presets/{preset_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # 6. Avtomatik Çatdırılma Cədvəli (Schedules)
    sched_payload = {
        "name": "Hər gün səhər 09:00 Satış Hesabatı",
        "cron_expression": "0 9 * * *",
        "channel": "EMAIL",
        "destination": "director@brandhouse.az",
        "format": "XLSX",
        "filters": {},
    }
    resp = await client.post("/api/v1/reports/sales_daily/schedules", json=sched_payload, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["channel"] == "EMAIL"

    resp = await client.get("/api/v1/reports/schedules", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # 7. Təhlükəsiz Hesabat Konstruktoru (Builder)
    resp = await client.get("/api/v1/reports/builder/datasets", headers=headers)
    assert resp.status_code == 200
    datasets = resp.json()
    assert len(datasets) == 5

    # Konstruktor sorğusu
    builder_query = {
        "dataset": "sales_lines",
        "dimensions": ["branch_name"],
        "measures": ["net_total"],
        "filters": [],
    }
    resp = await client.post("/api/v1/reports/builder/query", json=builder_query, headers=headers)
    assert resp.status_code == 200
    b_res = resp.json()
    assert b_res["dataset"] == "sales_lines"
    assert b_res["total_rows"] >= 1

    # 8. Baş İdarəetmə Paneli (Executive Dashboard)
    resp = await client.get("/api/v1/dashboard", headers=headers)
    assert resp.status_code == 200
    dash = resp.json()
    assert dash["data_as_of"] is not None
    assert "kpis" in dash
    assert "widgets" in dash
    assert "sales_trend" in dash["widgets"]
    assert "low_stock_alerts" in dash["widgets"]

    # 9. Filial İdarəetmə Paneli (Branch Dashboard)
    resp = await client.get(f"/api/v1/dashboard/branch/{branch_id}", headers=headers)
    assert resp.status_code == 200
    b_dash = resp.json()
    assert b_dash["data_as_of"] is not None

    # 10. Biznes İntellekti (BI) Analitika API-ləri
    resp = await client.get("/api/v1/analytics/performance", headers=headers)
    assert resp.status_code == 200
    assert "branch_ranking" in resp.json()

    resp = await client.get("/api/v1/analytics/inventory", headers=headers)
    assert resp.status_code == 200
    assert "reorder_suggestions" in resp.json()

    resp = await client.get("/api/v1/analytics/customers", headers=headers)
    assert resp.status_code == 200
    assert "rfm_segments" in resp.json()

    resp = await client.get("/api/v1/analytics/profitability", headers=headers)
    assert resp.status_code == 200
    assert "gross_margin_percent" in resp.json()

    resp = await client.get("/api/v1/analytics/anomalies", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

    resp = await client.get("/api/v1/analytics/forecast", headers=headers)
    assert resp.status_code == 200
    assert "points" in resp.json()
    assert "mae" in resp.json()
    assert "mape" in resp.json()

    # 11. Satış Hədəfləri (Targets)
    target_payload = {
        "branch_id": str(branch_id),
        "year": 2026,
        "month": 11,
        "target_amount": "250000.00",
    }
    resp = await client.post("/api/v1/analytics/targets", json=target_payload, headers=headers)
    assert resp.status_code == 201
    target_id = resp.json()["id"]

    resp = await client.post(f"/api/v1/analytics/targets/{target_id}/approve", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "APPROVED"

    # 12. Qrafik Annotasiyaları (Chart Annotations)
    anno_payload = {
        "series_name": "sales_trend",
        "annotation_date": date.today().isoformat(),
        "note": "Böyük Qara Cümə Kampaniyası - Bütün mağazalarda 30% endirim aksiyası başladı",
        "category": "CAMPAIGN",
    }
    resp = await client.post(
        "/api/v1/analytics/annotations", json=anno_payload, headers=headers
    )
    assert resp.status_code == 201

    resp = await client.get("/api/v1/analytics/annotations", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
