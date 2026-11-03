"""Marketinq, CRM və Loyallıq Modulları REST API İnteqrasiya Testləri.

Bütün marşrutları (routers) və xidmətləri əhatə edir:
1. CRM API:
   - Müştəri qeydiyyatı, sürətli qeydiyyat, axtarış, maskalanmış və açıq (unmask) PII baxışı
   - Dublikat axtarışı və profillərin birləşdirilməsi (merge)
   - Razılıqların qeydə alınması və STOP (opt-out)
   - GDPR əsaslı silinmə / anonimləşdirmə
   - Dinamik seqmentlərin yaradılması, ilkin baxışı və yenilənməsi
2. Loyallıq API:
   - Loyallıq proqramı və cari aktiv proqram
   - Müştərinin balansı və xal jurnalı (ledger)
   - Kassada xal xərcləməsinin ilkin baxışı (redeem/preview)
   - Manual tənzimləmə (adjustment)
   - Mükafatlar kataloqu və xalların vauçerə dəyişdirilməsi
3. Marketinq API:
   - Kampaniyaların yaradılması, siyahısı, SoD təsdiqi, dayandırılması və ROI göstəriciləri
   - Aksiya qaydaları və konflikt detektoru
   - Tək və kütləvi promokod generasiyası
   - Aksiya mühərriki simulyatoru (/marketing/simulate)
   - Bildiriş şablonları və təhlükəsiz göndəriş sorğuları (dry-run)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.tokens import create_access_token
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService


async def create_auth_headers(role_code: str = "system_admin") -> dict[str, str]:
    rbac_svc = RbacService()
    await rbac_svc.seed_catalog()

    user_svc = UserService()
    user_dto = UserCreate(
        username=f"api_{role_code}_{uuid.uuid4().hex[:6]}",
        email=f"api_{role_code}_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name="Marketing & CRM Admin",
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
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_crm_rest_api_workflow(client: AsyncClient) -> None:
    headers = await create_auth_headers("system_admin")

    # 1. Müştəri yaradılması
    create_resp = await client.post(
        "/api/v1/crm/customers",
        json={
            "full_name": "Nigar Qasımova",
            "phone": "050 333 22 11",
            "email": "nigar@example.com",
            "consents": [
                {
                    "purpose": "marketing_sms",
                    "status": "GRANTED",
                    "channel_source": "POS",
                }
            ],
        },
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    cust1 = create_resp.json()
    cust1_id = cust1["id"]
    assert cust1["phone"] == "+99450***11"  # Maskalanmış
    assert cust1["email"] == "n***r@example.com"

    # 2. Sürətli qeydiyyat (Quick-Create)
    quick_resp = await client.post(
        "/api/v1/crm/customers/quick-create",
        json={
            "full_name": "Nigar Qasımova Dublikat",
            "phone": "055 333 22 11",
            "email": "nigar_dup@example.com",
            "marketing_sms_consent": True,
        },
        headers=headers,
    )
    assert quick_resp.status_code == 201, quick_resp.text
    cust2 = quick_resp.json()
    cust2_id = cust2["id"]

    # 3. Siyahı və tək müştəri baxışı
    list_resp = await client.get("/api/v1/crm/customers", headers=headers)
    assert list_resp.status_code == 200, list_resp.text
    assert len(list_resp.json()) >= 2

    get_resp = await client.get(f"/api/v1/crm/customers/{cust1_id}", headers=headers)
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["id"] == cust1_id

    # 4. Açıq PII baxışı (Unmask endpoint)
    sensitive_resp = await client.get(
        f"/api/v1/crm/customers/{cust1_id}/sensitive",
        params={"reason": "Müştəri zəng edərək nömrəsini dəqiqləşdirmək istəyir"},
        headers=headers,
    )
    assert sensitive_resp.status_code == 200, sensitive_resp.text
    sens_data = sensitive_resp.json()
    assert sens_data["raw_phone"] == "+994503332211"
    assert sens_data["raw_email"] == "nigar@example.com"
    assert len(sens_data["consents"]) >= 1

    # 5. Müştəri məlumatlarının yenilənməsi
    patch_resp = await client.patch(
        f"/api/v1/crm/customers/{cust1_id}",
        json={"notes": "VİP daimi müştəri"},
        headers=headers,
    )
    assert patch_resp.status_code == 200, patch_resp.text
    assert patch_resp.json()["notes"] == "VİP daimi müştəri"

    # 6. Dublikat axtarışı
    dup_resp = await client.get(
        "/api/v1/crm/customers/duplicates/search",
        params={"phone": "0503332211"},
        headers=headers,
    )
    assert dup_resp.status_code == 200, dup_resp.text
    assert len(dup_resp.json()) >= 1

    # 7. Müştərilərin birləşdirilməsi (Merge preview & commit)
    preview_merge_resp = await client.post(
        "/api/v1/crm/customers/merge/preview",
        params={"winner_id": cust1_id, "loser_id": cust2_id},
        headers=headers,
    )
    assert preview_merge_resp.status_code == 200, preview_merge_resp.text
    assert preview_merge_resp.json()["winner_customer_id"] == cust1_id

    commit_merge_resp = await client.post(
        "/api/v1/crm/customers/merge",
        json={
            "winner_customer_id": cust1_id,
            "loser_customer_id": cust2_id,
            "audit_reason": "Dublikat hesabın birləşdirilməsi",
        },
        headers=headers,
    )
    assert commit_merge_resp.status_code == 200, commit_merge_resp.text

    # 8. Razılıq jurnalı və Opt-Out
    consent_resp = await client.post(
        "/api/v1/crm/consents",
        json={
            "customer_id": cust1_id,
            "purpose": "marketing_email",
            "status": "GRANTED",
            "channel_source": "POS",
        },
        headers=headers,
    )
    assert consent_resp.status_code == 201, consent_resp.text
    assert consent_resp.json()["status"] == "GRANTED"

    opt_out_resp = await client.post(
        "/api/v1/crm/consents/opt-out",
        params={"phone": "0503332211", "purpose": "marketing_email"},
        headers=headers,
    )
    assert opt_out_resp.status_code == 200, opt_out_resp.text
    assert opt_out_resp.json()["success"] is True

    # 9. GDPR Silinmə və Anonimləşdirmə
    erasure_resp = await client.post(
        "/api/v1/crm/privacy/erasure",
        json={
            "customer_id": cust1_id,
            "request_type": "ERASURE",
            "reason": "Məlumatların silinməsi tələbi",
        },
        headers=headers,
    )
    assert erasure_resp.status_code == 200, erasure_resp.text
    assert erasure_resp.json()["status"] == "PROCESSED"

    # 10. Seqmentlər (Create, List, Preview, Refresh)
    seg_resp = await client.post(
        "/api/v1/crm/segments",
        json={
            "name": "Böyük Alıcılar",
            "description": "100 AZN-dən çox xərcləyənlər",
            "type": "DYNAMIC",
            "rule_tree": {"min_spent": "100.00"},
        },
        headers=headers,
    )
    assert seg_resp.status_code == 201, seg_resp.text
    seg_id = seg_resp.json()["id"]

    seg_list_resp = await client.get("/api/v1/crm/segments", headers=headers)
    assert seg_list_resp.status_code == 200, seg_list_resp.text
    assert len(seg_list_resp.json()) >= 1

    seg_preview_resp = await client.post(
        "/api/v1/crm/segments/preview",
        json={"rule_tree": {"min_spent": "50.00"}},
        headers=headers,
    )
    assert seg_preview_resp.status_code == 200, seg_preview_resp.text
    assert "matched_count" in seg_preview_resp.json()

    seg_refresh_resp = await client.post(
        f"/api/v1/crm/segments/{seg_id}/refresh",
        headers=headers,
    )
    assert seg_refresh_resp.status_code == 200, seg_refresh_resp.text
    assert "member_count" in seg_refresh_resp.json()


@pytest.mark.asyncio
async def test_loyalty_rest_api_workflow(client: AsyncClient) -> None:
    headers = await create_auth_headers("system_admin")
    cust_id = generate_uuid7()

    # 1. Proqram yaratma və aktiv proqram
    prog_resp = await client.post(
        "/api/v1/loyalty/programs",
        json={
            "name": f"VIP Proqram {uuid.uuid4().hex[:4]}",
            "earn_rules": {"points_per_azn": 1},
            "redemption_rules": {"point_value_azn": "0.01", "min_points_to_redeem": 50, "max_receipt_percent": 50},
            "tier_rules": {"rolling_window_days": 365, "tiers": [{"name": "Bronze", "threshold_spend": 0, "earn_multiplier": 1.0}]},
            "expiry_rules": {"lot_expiry_days": 365},
        },
        headers=headers,
    )
    assert prog_resp.status_code == 201, prog_resp.text

    active_resp = await client.get("/api/v1/loyalty/programs/active", headers=headers)
    assert active_resp.status_code == 200, active_resp.text
    assert "name" in active_resp.json()

    # 2. Xalların manual tənzimlənməsi (Manual Adjustment)
    adj_resp = await client.post(
        "/api/v1/loyalty/adjustments",
        json={
            "customer_id": str(cust_id),
            "points": 300,
            "reason": "Xoş gəldin bonusu",
        },
        headers=headers,
    )
    assert adj_resp.status_code == 200, adj_resp.text
    assert adj_resp.json()["points"] == 300

    # 3. Müştərinin balansı və jurnalı
    summary_resp = await client.get(f"/api/v1/loyalty/customers/{cust_id}", headers=headers)
    assert summary_resp.status_code == 200, summary_resp.text
    assert summary_resp.json()["available_points"] == 300

    ledger_resp = await client.get(f"/api/v1/loyalty/customers/{cust_id}/ledger", headers=headers)
    assert ledger_resp.status_code == 200, ledger_resp.text
    assert len(ledger_resp.json()) >= 1

    # 4. Kassada xal xərcləməsinin ilkin baxışı (preview_redeem)
    preview_resp = await client.post(
        "/api/v1/loyalty/redeem/preview",
        json={
            "customer_id": str(cust_id),
            "points_to_redeem": 100,
            "receipt_subtotal": "50.00",
        },
        headers=headers,
    )
    assert preview_resp.status_code == 200, preview_resp.text
    assert preview_resp.json()["allowed"] is True
    assert preview_resp.json()["discount_amount"] == "1.00"

    # 5. Mükafatlar kataloqu (Rewards)
    rew_resp = await client.post(
        "/api/v1/loyalty/rewards",
        json={
            "name": f"10 AZN Vauçer {uuid.uuid4().hex[:4]}",
            "description": "Kassa endirim kuponu",
            "points_cost": 150,
            "reward_type": "DISCOUNT_VOUCHER",
            "benefit_value": "10.00",
            "stock_limit": 10,
            "valid_days": 30,
        },
        headers=headers,
    )
    assert rew_resp.status_code == 201, rew_resp.text
    reward_id = rew_resp.json()["id"]

    list_rew_resp = await client.get("/api/v1/loyalty/rewards", headers=headers)
    assert list_rew_resp.status_code == 200, list_rew_resp.text
    assert len(list_rew_resp.json()) >= 1

    redeem_rew_resp = await client.post(
        f"/api/v1/loyalty/rewards/{reward_id}/redeem",
        params={"customer_id": str(cust_id)},
        headers=headers,
    )
    assert redeem_rew_resp.status_code == 200, redeem_rew_resp.text
    assert redeem_rew_resp.json()["voucher_code"].startswith("RW-")


@pytest.mark.asyncio
async def test_marketing_rest_api_workflow(client: AsyncClient) -> None:
    headers = await create_auth_headers("system_admin")
    admin_headers = await create_auth_headers("system_admin")
    now = datetime.now(UTC)

    # 1. Kampaniya yaradılması
    camp_resp = await client.post(
        "/api/v1/marketing/campaigns",
        json={
            "name": f"Bahar Kampaniyası {uuid.uuid4().hex[:4]}",
            "objective": "Yeni mövsüm satışı",
            "type": "SEASONAL",
            "start_date": (now - timedelta(hours=1)).isoformat(),
            "end_date": (now + timedelta(days=15)).isoformat(),
            "budget": "3000.00",
        },
        headers=headers,
    )
    assert camp_resp.status_code == 201, camp_resp.text
    camp_id = camp_resp.json()["id"]

    # 2. Kampaniyalar siyahısı və tək kampaniya baxışı
    list_c_resp = await client.get("/api/v1/marketing/campaigns", headers=headers)
    assert list_c_resp.status_code == 200, list_c_resp.text
    assert len(list_c_resp.json()) >= 1

    get_c_resp = await client.get(f"/api/v1/marketing/campaigns/{camp_id}", headers=headers)
    assert get_c_resp.status_code == 200, get_c_resp.text
    assert get_c_resp.json()["id"] == camp_id

    # 3. Kampaniya təsdiqi (admin fərqli istifadəçi olaraq təsdiqləyir - SoD)
    appr_resp = await client.post(f"/api/v1/marketing/campaigns/{camp_id}/approve", headers=admin_headers)
    assert appr_resp.status_code == 200, appr_resp.text
    assert appr_resp.json()["status"] == "ACTIVE"

    # 4. Kampaniyanı dayandırma (pause)
    pause_resp = await client.post(f"/api/v1/marketing/campaigns/{camp_id}/pause", headers=headers)
    assert pause_resp.status_code == 200, pause_resp.text
    assert pause_resp.json()["status"] == "PAUSED"

    # Yenidən aktivləşdiririk
    await client.post(f"/api/v1/marketing/campaigns/{camp_id}/approve", headers=admin_headers)

    # 5. Aksiya qaydası təyini
    v_id = generate_uuid7()
    promo_resp = await client.post(
        "/api/v1/marketing/promotions",
        json={
            "campaign_id": camp_id,
            "name": "10% Mövsüm Endirimi",
            "type": "PERCENT_OFF",
            "rule_definition": {"percent": 10, "variant_ids": [str(v_id)]},
            "priority": 100,
            "stacking_mode": "STACKABLE_WITH_GROUPS",
        },
        headers=headers,
    )
    assert promo_resp.status_code == 201, promo_resp.text
    promo_id = promo_resp.json()["id"]

    # 6. Konflikt detektoru
    conflicts_resp = await client.get("/api/v1/marketing/promotions/conflicts", headers=headers)
    assert conflicts_resp.status_code == 200, conflicts_resp.text

    # 7. Promokod yaradılması və kütləvi generasiya
    pc_resp = await client.post(
        "/api/v1/marketing/promocodes",
        json={
            "code": f"PROMO-{uuid.uuid4().hex[:4].upper()}",
            "campaign_id": camp_id,
            "promotion_id": promo_id,
            "max_total_uses": 50,
            "max_uses_per_customer": 1,
        },
        headers=headers,
    )
    assert pc_resp.status_code == 201, pc_resp.text

    bulk_pc_resp = await client.post(
        "/api/v1/marketing/promocodes/bulk",
        json={
            "campaign_id": camp_id,
            "promotion_id": promo_id,
            "count": 5,
            "prefix": "BULK-",
            "length": 6,
        },
        headers=headers,
    )
    assert bulk_pc_resp.status_code == 200, bulk_pc_resp.text
    assert len(bulk_pc_resp.json()) == 5

    # 8. Simulyator
    sim_resp = await client.post(
        "/api/v1/marketing/simulate",
        json={
            "branch_id": str(generate_uuid7()),
            "items": [
                {
                    "variant_id": str(v_id),
                    "product_id": str(generate_uuid7()),
                    "unit_price": "100.00",
                    "cost_price": "50.00",
                    "quantity": 2,
                }
            ],
        },
        headers=headers,
    )
    assert sim_resp.status_code == 200, sim_resp.text
    assert sim_resp.json()["subtotal"] == "200.00"

    # 9. Bildirişlər və Safe Communications (NOT_CONFIGURED)
    tmpl_resp = await client.post(
        "/api/v1/marketing/communications/templates",
        json={
            "channel": "SMS",
            "language": "AZ",
            "name": "Bahar Təbriki",
            "body_template": "Hörmətli müştəri, bayramınız mübarək!",
        },
        headers=headers,
    )
    assert tmpl_resp.status_code == 201, tmpl_resp.text
    tmpl_id = tmpl_resp.json()["id"]

    send_req_resp = await client.post(
        "/api/v1/marketing/communications/send-requests",
        json={
            "template_id": tmpl_id,
            "channel": "SMS",
        },
        headers=headers,
    )
    assert send_req_resp.status_code == 201, send_req_resp.text
    assert send_req_resp.json()["dry_run_summary"]["provider_integration_status"] == "NOT_CONFIGURED"

    # 10. Kampaniya Metrikləri və ROI
    metrics_resp = await client.get(f"/api/v1/marketing/campaigns/{camp_id}/metrics", headers=headers)
    assert metrics_resp.status_code == 200, metrics_resp.text
    assert metrics_resp.json()["campaign_id"] == camp_id
