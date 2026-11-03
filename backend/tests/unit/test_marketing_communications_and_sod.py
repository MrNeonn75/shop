"""Marketinq Kampaniyaları, SoD Təsdiqi, Konflikt Detektoru və Təhlükəsiz Kommunikasiya Testləri.

Əhatə olunan sahələr:
1. Vəzifələrin Bölgüsü (SoD): Kampaniyanı yaradan şəxs onu özü təsdiq edə bilməz (SOD_VIOLATION_SELF_APPROVAL).
2. Təsdiq və Tarixə Görə Status Keçidləri (DRAFT -> ACTIVE və ya SCHEDULED).
3. Aksiya Konflikt Detektoru (Conflict Detector): Eyni variantlar üzərində üst-üstə düşən aksiyalar və prioritet həlli proqnozu.
4. Təhlükəsiz Bildirişlər (Safe Communications):
   - Şablon yaradılması (SMS / Email).
   - Göndəriş sorğusunda məcburi razılıq filtri (Consent Filtering: 100% razılığı olanlar seçilir).
   - Provayder statusunun NOT_CONFIGURED təhlükəsiz ilkin vəziyyəti.
5. Kampaniya Metrikləri və Qayıdış (ROI & Attribution).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BusinessRuleViolationError, ValidationError
from app.core.ids import generate_uuid7
from app.modules.auth.policies import AuthenticatedUser
from app.modules.crm.models import ConsentPurpose, ConsentSource, ConsentStatus
from app.modules.crm.schemas import ConsentInput, CustomerCreate
from app.modules.crm.service import CrmService
from app.modules.marketing.models import CampaignStatus, CampaignType, PromotionType, StackingMode
from app.modules.marketing.schemas import (
    CampaignCreate,
    MessageSendRequestCreate,
    MessageTemplateCreate,
    PromotionRuleCreate,
)
from app.modules.marketing.service import MarketingService


def make_marketing_user(name: str, perms: list[str]) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=f"{name}_{uuid.uuid4().hex[:4]}",
        email=f"{name}@brandhouse.az",
        full_name=f"User {name}",
        roles=["marketing_manager"],
        permissions=perms,
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )


# =========================================================================
# 1. SoD & CAMPAIGN APPROVAL TESTS
# =========================================================================


@pytest.mark.asyncio
async def test_campaign_sod_self_approval_rejected(session: AsyncSession) -> None:
    svc = MarketingService(session)
    creator = make_marketing_user(
        "creator",
        ["marketing.campaign.create", "marketing.campaign.approve"],
    )

    now = datetime.now(UTC)
    # Kampaniya yaradılır
    camp = await svc.create_campaign(
        payload=CampaignCreate(
            name="Novruz Endirimi",
            objective="Mövsümi satış",
            type=CampaignType.SEASONAL,
            start_date=now + timedelta(days=1),
            end_date=now + timedelta(days=10),
            budget=Decimal("2000.00"),
        ),
        actor=creator,
    )
    assert camp.status == CampaignStatus.DRAFT.value

    # Kampaniyanı yaradan şəxs özü təsdiq etməyə çalışır -> SoD xətası!
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await svc.approve_campaign(camp.id, actor=creator)

    assert exc_info.value.code == "SOD_VIOLATION_SELF_APPROVAL"


@pytest.mark.asyncio
async def test_campaign_approval_by_independent_approver(session: AsyncSession) -> None:
    svc = MarketingService(session)
    creator = make_marketing_user("creator", ["marketing.campaign.create"])
    approver = make_marketing_user("approver", ["marketing.campaign.approve"])

    now = datetime.now(UTC)
    # 1. Cari vaxtda aktiv olacaq kampaniya
    camp_active = await svc.create_campaign(
        payload=CampaignCreate(
            name="Cari Aktiv Kampaniya",
            type=CampaignType.SEASONAL,
            start_date=now - timedelta(hours=1),
            end_date=now + timedelta(days=5),
        ),
        actor=creator,
    )
    approved_active = await svc.approve_campaign(camp_active.id, actor=approver)
    assert approved_active.status == CampaignStatus.ACTIVE.value
    assert approved_active.approved_by == approver.id

    # 2. Gələcək vaxt üçün planlaşdırılmış kampaniya -> SCHEDULED
    camp_sched = await svc.create_campaign(
        payload=CampaignCreate(
            name="Gələcək Kampaniya",
            type=CampaignType.SEASONAL,
            start_date=now + timedelta(days=2),
            end_date=now + timedelta(days=10),
        ),
        actor=creator,
    )
    approved_sched = await svc.approve_campaign(camp_sched.id, actor=approver)
    assert approved_sched.status == CampaignStatus.SCHEDULED.value

    # Tarix ardıcıllığı yoxlanışı (start >= end olarsa ValidationError)
    with pytest.raises(ValidationError):
        await svc.create_campaign(
            payload=CampaignCreate(
                name="Səhv Tarixli",
                type=CampaignType.SEASONAL,
                start_date=now + timedelta(days=5),
                end_date=now + timedelta(days=2),
            ),
            actor=creator,
        )


# =========================================================================
# 2. PROMOTION CONFLICT DETECTOR
# =========================================================================


@pytest.mark.asyncio
async def test_promotion_conflict_detector(session: AsyncSession) -> None:
    svc = MarketingService(session)
    actor = make_marketing_user("mktg", ["marketing.promotion.manage"])

    variant_a = str(generate_uuid7())
    variant_b = str(generate_uuid7())

    # 1-ci aksiya: 20% endirim, prioritet 100
    await svc.create_promotion(
        payload=PromotionRuleCreate(
            name="20% Köynəklər",
            type=PromotionType.PERCENT_OFF,
            rule_definition={"percent": 20, "variant_ids": [variant_a, variant_b]},
            priority=100,
            stacking_mode=StackingMode.EXCLUSIVE,
        ),
        actor=actor,
    )

    # 2-ci aksiya: 10 AZN endirim, prioritet 200 (üstün), eyni variant_a daxildir
    await svc.create_promotion(
        payload=PromotionRuleCreate(
            name="10 AZN Xüsusi Variant A",
            type=PromotionType.FIXED_OFF,
            rule_definition={"amount": "10.00", "variant_ids": [variant_a]},
            priority=200,
            stacking_mode=StackingMode.EXCLUSIVE,
        ),
        actor=actor,
    )

    conflicts = await svc.detect_conflicts()
    assert len(conflicts) >= 1
    c = conflicts[0]
    assert c["overlapping_variants_count"] == 1
    assert "üstünlük qazanacaq" in c["predicted_resolution"]


# =========================================================================
# 3. SAFE COMMUNICATIONS & CONSENT FILTERING
# =========================================================================


@pytest.mark.asyncio
async def test_safe_communications_consent_filtering_and_not_configured(session: AsyncSession) -> None:
    mktg_svc = MarketingService(session)
    crm_svc = CrmService(session)
    actor = make_marketing_user(
        "comms",
        ["marketing.message.send", "crm.customer.manage", "crm.consent.manage"],
    )

    # 3 Müştəri yaradılır
    # Müştəri 1: SMS razılığı verib
    await crm_svc.create_customer(
        payload=CustomerCreate(
            full_name="Razı Müştəri",
            phone="050 777 00 01",
            consents=[
                ConsentInput(
                    purpose=ConsentPurpose.MARKETING_SMS,
                    status=ConsentStatus.GRANTED,
                    channel_source=ConsentSource.POS,
                )
            ],
        ),
        actor=actor,
    )

    # Müştəri 2: SMS razılığı verməyib (razılıq yoxdur)
    await crm_svc.create_customer(
        payload=CustomerCreate(
            full_name="Razılığı Olmayan Müştəri",
            phone="050 777 00 02",
        ),
        actor=actor,
    )

    # Müştəri 3: Əvvəl verib, sonra ləğv edib (WITHDRAWN)
    c3 = await crm_svc.create_customer(
        payload=CustomerCreate(
            full_name="İmtina Edən Müştəri",
            phone="050 777 00 03",
        ),
        actor=actor,
    )
    await crm_svc.record_consent(
        customer_id=c3.id,
        purpose=ConsentPurpose.MARKETING_SMS,
        status=ConsentStatus.WITHDRAWN,
        actor=actor,
    )

    # SMS Şablonu yaradılır
    tmpl = await mktg_svc.create_message_template(
        payload=MessageTemplateCreate(
            channel="SMS",
            language="AZ",
            name="Yeni Kolleksiya SMS",
            body_template="Hörmətli müştəri, yeni kolleksiya mağazalarımızda!",
        ),
        actor=actor,
    )

    # Göndəriş sorğusu hazırlanır (dry-run)
    send_req = await mktg_svc.prepare_send_request(
        payload=MessageSendRequestCreate(
            template_id=tmpl.id,
            channel="SMS",
        ),
        actor=actor,
    )

    # Yoxlanış:
    # 1. Razılığı olmayan və ya imtina edən şəxslər 100% kənarlaşdırılmalıdır!
    dry = send_req.dry_run_summary
    assert dry["eligible_with_consent_count"] == 1
    assert dry["excluded_no_consent_count"] >= 2
    # 2. Provayder NOT_CONFIGURED olmalıdır (təhlükəsiz ilkin vəziyyət)
    assert dry["provider_integration_status"] == "NOT_CONFIGURED"
    assert send_req.status == "DRAFT"


# =========================================================================
# 4. ATTRIBUTION & ROI METRICS
# =========================================================================


@pytest.mark.asyncio
async def test_campaign_attribution_metrics(session: AsyncSession) -> None:
    svc = MarketingService(session)
    actor = make_marketing_user(
        "mktg",
        ["marketing.campaign.create", "marketing.promotion.manage"],
    )
    now = datetime.now(UTC)

    # 1. Aksiyası olmayan kampaniya -> INSUFFICIENT_DATA
    camp = await svc.create_campaign(
        payload=CampaignCreate(
            name="ROI Test Kampaniyası",
            type=CampaignType.SEASONAL,
            start_date=now,
            end_date=now + timedelta(days=10),
            budget=Decimal("1000.00"),
        ),
        actor=actor,
    )

    metrics_empty = await svc.get_campaign_metrics(camp.id)
    assert metrics_empty["campaign_id"] == str(camp.id)
    assert metrics_empty["roi_status"] == "INSUFFICIENT_DATA"

    # 2. Aksiya qaydası əlavə edildikdə
    await svc.create_promotion(
        payload=PromotionRuleCreate(
            campaign_id=camp.id,
            name="10% Endirim",
            type=PromotionType.PERCENT_OFF,
            rule_definition={"percent": 10},
        ),
        actor=actor,
    )
    # Refresh to load relationships
    await session.refresh(camp)

    metrics = await svc.get_campaign_metrics(camp.id)
    assert metrics["campaign_id"] == str(camp.id)
    assert metrics["campaign_budget"] == "1000.00"
    assert metrics["redemption_count"] == 0
    assert metrics["discount_cost_total"] == "0.00"
    assert metrics["roi_status"] == "CALCULATED"
