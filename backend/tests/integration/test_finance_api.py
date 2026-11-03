"""Maliyyə Modulu REST API İnteqrasiya Testləri (Finance API End-to-End)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

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
async def test_finance_api_workflow(client: AsyncClient) -> None:
    headers, _ = await create_api_user("system_admin")

    # 1. Maliyyə Hesabı Yaradılması
    acc_payload = {
        "code": f"ACC-API-{uuid.uuid4().hex[:4].upper()}",
        "name": "API Test Kassası",
        "type": "cash",
        "sub_type": "cash_office",
        "currency": "AZN",
        "account_details": {},
    }
    resp = await client.post("/api/v1/finance/accounts", json=acc_payload, headers=headers)
    assert resp.status_code == 201
    acc_data = resp.json()
    acc_id = acc_data["id"]
    assert acc_data["code"] == acc_payload["code"]

    # 2. Hesablar siyahısı
    resp = await client.get("/api/v1/finance/accounts", headers=headers)
    assert resp.status_code == 200
    assert any(a["id"] == acc_id for a in resp.json())

    # 3. Açılış qalığı təyini
    open_bal_payload = {
        "account_id": acc_id,
        "amount": "1500.00",
        "memo": "İlkin qalıq",
    }
    resp = await client.post("/api/v1/finance/accounts/opening-balance", json=open_bal_payload, headers=headers)
    assert resp.status_code == 200

    # Hesab detalları və cari balans
    resp = await client.get(f"/api/v1/finance/accounts/{acc_id}", headers=headers)
    assert resp.status_code == 200
    assert Decimal(resp.json()["current_balance"]) == Decimal("1500.00")

    # 4. Xərc kateqoriyası
    cat_payload = {
        "code": f"EXP-API-{uuid.uuid4().hex[:4].upper()}",
        "name": "API Xərc Kateqoriyası",
    }
    resp = await client.post("/api/v1/finance/categories/expenses", json=cat_payload, headers=headers)
    assert resp.status_code == 201
    cat_id = resp.json()["id"]

    # 5. Xərc sənədi tərtibi
    branch_id = str(uuid.uuid4())
    exp_payload = {
        "branch_id": branch_id,
        "category_id": cat_id,
        "gross_amount": "300.00",
        "tax_amount": "0.00",
        "expense_date": str(date.today()),
        "description": "Ofis təmizlik vasitələri",
        "attachments": [],
    }
    resp = await client.post("/api/v1/finance/expenses", json=exp_payload, headers=headers)
    assert resp.status_code == 201
    exp_id = resp.json()["id"]
    assert resp.json()["status"] == "DRAFT"

    # 6. Xərcin təsdiqi
    resp = await client.post(f"/api/v1/finance/expenses/{exp_id}/approve", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "APPROVED"

    # 7. Xərcin ödənilməsi
    pay_payload = {
        "payment_account_id": acc_id,
    }
    resp = await client.post(f"/api/v1/finance/expenses/{exp_id}/pay", json=pay_payload, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "PAID"

    # Kassa balansının azalmasını yoxlayırıq (1500 - 300 = 1200)
    resp = await client.get(f"/api/v1/finance/accounts/{acc_id}", headers=headers)
    assert resp.status_code == 200
    assert Decimal(resp.json()["current_balance"]) == Decimal("1200.00")

    # 8. P&L Hesabatı
    resp = await client.get(f"/api/v1/finance/reports/pnl?period={date.today().strftime('%Y-%m')}", headers=headers)
    assert resp.status_code == 200
    pnl_data = resp.json()
    assert "net_revenue" in pnl_data
    assert "gross_profit" in pnl_data
    assert "opex_accrual" in pnl_data
    assert Decimal(pnl_data["opex_accrual"]["amount"]) >= Decimal("300.00")

    # 9. Xərcin ləğvi (Reversal)
    rev_resp = await client.post(
        f"/api/v1/finance/expenses/{exp_id}/reverse",
        json={"reason": "Səhv qeyd olundu"},
        headers=headers,
    )
    assert rev_resp.status_code == 200
    assert rev_resp.json()["status"] == "REVERSED"

    # Balans bərpa olunur (1200 + 300 = 1500)
    resp = await client.get(f"/api/v1/finance/accounts/{acc_id}", headers=headers)
    assert resp.status_code == 200
    assert Decimal(resp.json()["current_balance"]) == Decimal("1500.00")


@pytest.mark.asyncio
async def test_finance_transfers_and_transactions_api(client: AsyncClient) -> None:
    headers, _ = await create_api_user("system_admin")

    # İki hesab yaradılır: Kassa və Bank
    acc1_resp = await client.post(
        "/api/v1/finance/accounts",
        json={"code": f"TR-CASH-{uuid.uuid4().hex[:4].upper()}", "name": "Kassa", "type": "cash"},
        headers=headers,
    )
    assert acc1_resp.status_code == 201
    acc1_id = acc1_resp.json()["id"]

    acc2_resp = await client.post(
        "/api/v1/finance/accounts",
        json={"code": f"TR-BANK-{uuid.uuid4().hex[:4].upper()}", "name": "Bank", "type": "bank"},
        headers=headers,
    )
    assert acc2_resp.status_code == 201
    acc2_id = acc2_resp.json()["id"]

    # Açılış qalığı (acc1: 1000 AZN)
    await client.post(
        "/api/v1/finance/accounts/opening-balance",
        json={"account_id": acc1_id, "amount": "1000.00"},
        headers=headers,
    )

    # Köçürmə (acc1 -> acc2: 400 AZN)
    tr_payload = {
        "source_account_id": acc1_id,
        "destination_account_id": acc2_id,
        "amount": "400.00",
        "memo": "Kassadan banka depozit",
    }
    tr_resp = await client.post("/api/v1/finance/transfers", json=tr_payload, headers=headers)
    assert tr_resp.status_code == 201

    # Balanslar yoxlanılır: acc1 = 600, acc2 = 400
    b1_resp = await client.get(f"/api/v1/finance/accounts/{acc1_id}", headers=headers)
    assert Decimal(b1_resp.json()["current_balance"]) == Decimal("600.00")

    b2_resp = await client.get(f"/api/v1/finance/accounts/{acc2_id}", headers=headers)
    assert Decimal(b2_resp.json()["current_balance"]) == Decimal("400.00")

    # Tranzaksiyalar tarixçəsi
    txs_resp = await client.get(f"/api/v1/finance/accounts/{acc1_id}/transactions", headers=headers)
    assert txs_resp.status_code == 200
    assert len(txs_resp.json()) >= 2


@pytest.mark.asyncio
async def test_finance_categories_income_and_allocations_api(client: AsyncClient) -> None:
    headers, _ = await create_api_user("system_admin")

    # 1. Xərc kateqoriyaları siyahısı
    cat_list_resp = await client.get("/api/v1/finance/categories/expenses", headers=headers)
    assert cat_list_resp.status_code == 200

    # 2. Gəlir kateqoriyası yaradılması və siyahısı
    inc_cat_resp = await client.post(
        "/api/v1/finance/categories/incomes",
        json={"code": f"INC-CAT-{uuid.uuid4().hex[:4].upper()}", "name": "Faiz Gəlirləri"},
        headers=headers,
    )
    assert inc_cat_resp.status_code == 201
    inc_cat_id = inc_cat_resp.json()["id"]

    inc_list_resp = await client.get("/api/v1/finance/categories/incomes", headers=headers)
    assert inc_list_resp.status_code == 200
    assert any(c["id"] == inc_cat_id for c in inc_list_resp.json())

    # 3. Hesab yaradırıq və qeyri-satış gəliri qeydə alırıq
    acc_resp = await client.post(
        "/api/v1/finance/accounts",
        json={"code": f"INC-ACC-{uuid.uuid4().hex[:4].upper()}", "name": "Gəlir Hesabı", "type": "bank"},
        headers=headers,
    )
    acc_id = acc_resp.json()["id"]

    inc_resp = await client.post(
        "/api/v1/finance/other-income",
        json={
            "branch_id": str(uuid.uuid4()),
            "category_id": inc_cat_id,
            "payment_account_id": acc_id,
            "amount": "250.00",
            "income_date": str(date.today()),
            "description": "Bank faiz gəliri",
        },
        headers=headers,
    )
    assert inc_resp.status_code == 201

    # 4. Xərclər siyahısı
    exp_list_resp = await client.get("/api/v1/finance/expenses", headers=headers)
    assert exp_list_resp.status_code == 200

    # 5. Shared cost allocation preview
    b1 = str(uuid.uuid4())
    b2 = str(uuid.uuid4())
    preview_resp = await client.post(
        f"/api/v1/finance/expenses/allocation-preview?branch_ids={b1}&branch_ids={b2}",
        json={"total_amount": "100.00", "allocation_method": "equal"},
        headers=headers,
    )
    assert preview_resp.status_code == 200
    assert len(preview_resp.json()["allocations"]) == 2


@pytest.mark.asyncio
async def test_finance_periods_budgets_and_reports_api(client: AsyncClient) -> None:
    headers, _ = await create_api_user("system_admin")
    branch_id = str(uuid.uuid4())

    # 1. Maliyyə dövrü yaratma və yoxlama siyahısı
    month_int = (uuid.uuid4().int % 12) + 1
    period_str = f"2027-{month_int:02d}"
    p_resp = await client.post(
        "/api/v1/finance/periods",
        json={
            "period": period_str,
            "start_date": f"2027-{month_int:02d}-01",
            "end_date": f"2027-{month_int:02d}-28",
        },
        headers=headers,
    )
    assert p_resp.status_code == 201

    # Close checklist
    chk_resp = await client.get(f"/api/v1/finance/periods/{period_str}/checklist", headers=headers)
    assert chk_resp.status_code == 200

    # 2. Xərc kateqoriyası və Büdcə
    cat_resp = await client.post(
        "/api/v1/finance/categories/expenses",
        json={"code": f"BDG-CAT-{uuid.uuid4().hex[:4].upper()}", "name": "Büdcə Kateqoriyası"},
        headers=headers,
    )
    cat_id = cat_resp.json()["id"]

    bdg_resp = await client.post(
        "/api/v1/finance/budgets",
        json={
            "branch_id": branch_id,
            "category_id": cat_id,
            "period": period_str,
            "amount": "5000.00",
        },
        headers=headers,
    )
    assert bdg_resp.status_code == 201
    bdg_id = bdg_resp.json()["id"]

    bdg_list_resp = await client.get(f"/api/v1/finance/budgets?period={period_str}", headers=headers)
    assert bdg_list_resp.status_code == 200

    # Büdcə redaktəsi
    bdg_update_resp = await client.put(
        f"/api/v1/finance/budgets/{bdg_id}",
        json={"amount": "6000.00", "reason": "İnflyasiya səbəbindən artım"},
        headers=headers,
    )
    assert bdg_update_resp.status_code == 200

    # Variance
    var_resp = await client.get(f"/api/v1/finance/budgets/variance?period={period_str}", headers=headers)
    assert var_resp.status_code == 200

    # Büdcə təsdiqi
    bdg_appr_resp = await client.post(f"/api/v1/finance/budgets/{bdg_id}/approve", headers=headers)
    assert bdg_appr_resp.status_code == 200
    assert bdg_appr_resp.json()["status"] == "APPROVED"

    # Dövrün bağlanması və yenidən açılması
    close_resp = await client.post(f"/api/v1/finance/periods/{period_str}/close", headers=headers)
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "CLOSED"

    reopen_resp = await client.post(
        f"/api/v1/finance/periods/{period_str}/reopen",
        json={"reason": "Düzəliş qeydləri üçün açıldı"},
        headers=headers,
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["status"] == "OPEN"

    # 3. Hesabatlar
    today_str = str(date.today())
    cf_resp = await client.get(
        f"/api/v1/finance/reports/cash-flow?start_date={today_str}&end_date={today_str}",
        headers=headers,
    )
    assert cf_resp.status_code == 200

    daily_resp = await client.get(
        f"/api/v1/finance/reports/daily-cash?branch_id={branch_id}&report_date={today_str}",
        headers=headers,
    )
    assert daily_resp.status_code == 200

    rec_aging_resp = await client.get("/api/v1/finance/receivables/aging", headers=headers)
    assert rec_aging_resp.status_code == 200

    pay_aging_resp = await client.get("/api/v1/finance/payables/aging", headers=headers)
    assert pay_aging_resp.status_code == 200

    dd_resp = await client.get(
        f"/api/v1/finance/reports/drill-down?metric_id=DEF-FIN-REV-001&start_date={today_str}&end_date={today_str}",
        headers=headers,
    )
    assert dd_resp.status_code == 200


@pytest.mark.asyncio
async def test_finance_gl_and_templates_api(client: AsyncClient) -> None:
    headers, _ = await create_api_user("system_admin")
    branch_id = str(uuid.uuid4())

    # 1. Dövri xərc şablonu yaradılması və generativ DRAFT icrası
    cat_resp = await client.post(
        "/api/v1/finance/categories/expenses",
        json={"code": f"TMPL-CAT-{uuid.uuid4().hex[:4].upper()}", "name": "Şablon Kateqoriyası"},
        headers=headers,
    )
    cat_id = cat_resp.json()["id"]

    tmpl_resp = await client.post(
        "/api/v1/finance/recurring-templates",
        json={
            "template_name": "Aylıq İcarə",
            "branch_id": branch_id,
            "category_id": cat_id,
            "amount": "1200.00",
            "day_of_month": 1,
            "description": "Filial icarəsi",
        },
        headers=headers,
    )
    assert tmpl_resp.status_code == 201

    gen_resp = await client.post("/api/v1/finance/recurring-templates/generate", headers=headers)
    assert gen_resp.status_code == 200
    assert gen_resp.json()["status"] == "ok"

    # 2. GL Hesablar planı
    gl_resp = await client.post(
        "/api/v1/finance/gl/accounts",
        json={"code": f"GL-{uuid.uuid4().hex[:4].upper()}", "name": "Kassa GL", "account_type": "asset"},
        headers=headers,
    )
    assert gl_resp.status_code == 201

    gl_list_resp = await client.get("/api/v1/finance/gl/accounts", headers=headers)
    assert gl_list_resp.status_code == 200
    assert len(gl_list_resp.json()) >= 1

    # 3. GL Trial Balance (GL deaktiv olduqda NOT_ENABLED qaytarır)
    tb_resp = await client.get("/api/v1/finance/gl/trial-balance", headers=headers)
    assert tb_resp.status_code == 422
    assert tb_resp.json()["error"]["code"] == "NOT_ENABLED"

    # 4. Üzləşmə Sessiyası
    acc_resp = await client.post(
        "/api/v1/finance/accounts",
        json={"code": f"REC-ACC-{uuid.uuid4().hex[:4].upper()}", "name": "Üzləşmə Bankı", "type": "bank"},
        headers=headers,
    )
    acc_id = acc_resp.json()["id"]

    rec_resp = await client.post(
        "/api/v1/finance/reconciliations",
        json={
            "account_id": acc_id,
            "statement_date": str(date.today()),
            "expected_amount": "500.00",
            "notes": "Bank çıxarışı",
        },
        headers=headers,
    )
    assert rec_resp.status_code == 201


