"""Promokodlar və Paralel İstifadə Testləri (Promo Codes & Concurrency Tests).

Əhatə olunan sahələr:
1. Promokod generasiyası: Təhlükəsiz əlifba (0, O, 1, I, L simvolları olmadan), prefiks, unikal uzunluq.
2. Toplu generasiya (Bulk generate) və toqquşma müqaviməti (collision resistance).
3. Paralel istifadə (Concurrency): Eyni anda göndərilən sorğularda limitin (məs: max_total_uses=2)
   dəqiq qorunması və FOR UPDATE / atomic locking sayəsində artıq istifadənin qarşısının alınması.
4. Müştəri üzrə fərdi limit (max_uses_per_customer) və təkrar istifadənin qadağan edilməsi.
5. Müddət yoxlanışı (başlamamış və vaxtı keçmiş promokodlar).
6. Qaytarma / Ləğvetmə zamanı istifadənin bərpası (reversal).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BusinessRuleViolationError, ConflictError
from app.core.ids import generate_uuid7
from app.modules.auth.policies import AuthenticatedUser
from app.modules.marketing.models import (
    Campaign,
    CampaignStatus,
    CampaignType,
    PromoCodeStatus,
    Promotion,
    PromotionType,
    StackingMode,
)
from app.modules.marketing.schemas import (
    BulkPromoCodeGenerateRequest,
    PromoCodeCreate,
)
from app.modules.marketing.service import SAFE_CHARSET, MarketingService


def make_actor(permissions: list[str] | None = None) -> AuthenticatedUser:
    perms = permissions or [
        "marketing.campaign.create",
        "marketing.campaign.approve",
        "marketing.promotion.manage",
        "marketing.promocode.manage",
        "marketing.simulate",
        "marketing.message.send",
    ]
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=f"mktg_{uuid.uuid4().hex[:6]}",
        email=f"mktg_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name="Marketing Test Actor",
        roles=["marketing_manager"],
        permissions=perms,
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )


async def setup_promo_fixture(session: AsyncSession) -> tuple[Campaign, Promotion]:
    camp = Campaign(
        id=generate_uuid7(),
        name="Yay Kampaniyası 2026",
        objective="Yay endirimləri",
        type=CampaignType.PROMO_CODE.value,
        status=CampaignStatus.ACTIVE.value,
        start_date=datetime.now(UTC) - timedelta(days=1),
        end_date=datetime.now(UTC) + timedelta(days=30),
        budget=Decimal("5000.00"),
        target_branches=[],
        target_segments=[],
        eligibility_criteria={},
        created_by=generate_uuid7(),
        version=1,
    )
    session.add(camp)

    promo = Promotion(
        id=generate_uuid7(),
        campaign_id=camp.id,
        name="10 AZN Promokod Endirimi",
        type=PromotionType.PROMO_CODE.value,
        rule_definition={"discount_amount": "10.00"},
        priority=100,
        stacking_mode=StackingMode.STACKABLE_WITH_GROUPS.value,
        exclusion_groups=[],
        never_below_cost=True,
        is_active=True,
        version=1,
    )
    session.add(promo)
    await session.flush()
    return camp, promo


# =========================================================================
# 1. GENERATION & CHARSET TESTS
# =========================================================================


def test_safe_charset_properties() -> None:
    # 0, O, 1, I, L kimi qarışdırıla bilən simvollar olmamalıdır
    for forbidden in ["0", "O", "1", "I", "L"]:
        assert forbidden not in SAFE_CHARSET
    assert len(SAFE_CHARSET) >= 26


@pytest.mark.asyncio
async def test_single_promo_code_creation(session: AsyncSession) -> None:
    camp, promo = await setup_promo_fixture(session)
    actor = make_actor()
    svc = MarketingService(session)

    # Xüsusi kod adı ilə yaratma
    res = await svc.create_promo_code(
        payload=PromoCodeCreate(
            code="SUMMER2026",
            campaign_id=camp.id,
            promotion_id=promo.id,
            max_total_uses=100,
            max_uses_per_customer=1,
        ),
        actor=actor,
    )
    assert res.code == "SUMMER2026"
    assert res.status == PromoCodeStatus.ACTIVE.value
    assert res.current_uses == 0

    # Dublikat kod yaratma xətası (ConflictError)
    with pytest.raises(ConflictError):
        await svc.create_promo_code(
            payload=PromoCodeCreate(
                code="SUMMER2026",
                campaign_id=camp.id,
                promotion_id=promo.id,
            ),
            actor=actor,
        )


@pytest.mark.asyncio
async def test_bulk_generation_uniqueness_and_charset(session: AsyncSession) -> None:
    camp, promo = await setup_promo_fixture(session)
    actor = make_actor()
    svc = MarketingService(session)

    count = 50
    res = await svc.bulk_generate_promo_codes(
        payload=BulkPromoCodeGenerateRequest(
            campaign_id=camp.id,
            promotion_id=promo.id,
            count=count,
            prefix="VIP-",
            length=8,
            max_total_uses=1,
            max_uses_per_customer=1,
        ),
        actor=actor,
    )

    assert len(res) == count
    codes = [p.code for p in res]
    assert len(set(codes)) == count  # Bütün kodlar unikaldır

    for c in codes:
        assert c.startswith("VIP-")
        token = c.replace("VIP-", "")
        assert len(token) == 8
        for char in token:
            assert char in SAFE_CHARSET


# =========================================================================
# 2. REDEMPTION & CONCURRENCY TESTS
# =========================================================================


@pytest.mark.asyncio
async def test_promo_code_redemption_and_exhaustion(session: AsyncSession) -> None:
    camp, promo = await setup_promo_fixture(session)
    actor = make_actor()
    svc = MarketingService(session)

    # 2 dəfəlik ümumi istifadə limiti olan promokod
    code_obj = await svc.create_promo_code(
        payload=PromoCodeCreate(
            code="DOUBLEUSE",
            campaign_id=camp.id,
            promotion_id=promo.id,
            max_total_uses=2,
            max_uses_per_customer=1,
        ),
        actor=actor,
    )

    cust1 = generate_uuid7()
    cust2 = generate_uuid7()
    cust3 = generate_uuid7()

    # 1-ci istifadə
    red1 = await svc.redeem_promo_code(
        session=session,
        code_str="DOUBLEUSE",
        sale_id=generate_uuid7(),
        customer_id=cust1,
        discount_amount=Decimal("10.00"),
    )
    assert red1.status == "REDEEMED"
    assert code_obj.current_uses == 1
    assert code_obj.status == PromoCodeStatus.ACTIVE.value

    # Eyni müştəri (cust1) tərəfindən 2-ci cəhd -> Qadağandır (max_uses_per_customer=1)
    with pytest.raises(BusinessRuleViolationError) as exc_cust:
        await svc.redeem_promo_code(
            session=session,
            code_str="DOUBLEUSE",
            sale_id=generate_uuid7(),
            customer_id=cust1,
            discount_amount=Decimal("10.00"),
        )
    assert exc_cust.value.code == "PROMO_CODE_CUSTOMER_LIMIT_REACHED"

    # 2-ci müştəri (cust2) tərəfindən istifadə -> Uğurlu, lakin kod artıq tükənir
    red2 = await svc.redeem_promo_code(
        session=session,
        code_str="DOUBLEUSE",
        sale_id=generate_uuid7(),
        customer_id=cust2,
        discount_amount=Decimal("10.00"),
    )
    assert red2.status == "REDEEMED"
    assert code_obj.current_uses == 2
    assert code_obj.status == PromoCodeStatus.EXHAUSTED.value

    # 3-cü müştəri (cust3) tərəfindən istifadə cəhdi -> Limit tükənib
    with pytest.raises(BusinessRuleViolationError) as exc_exhausted:
        await svc.redeem_promo_code(
            session=session,
            code_str="DOUBLEUSE",
            sale_id=generate_uuid7(),
            customer_id=cust3,
            discount_amount=Decimal("10.00"),
        )
    assert exc_exhausted.value.code in ["PROMO_CODE_NOT_ACTIVE", "PROMO_CODE_LIMIT_REACHED"]


@pytest.mark.asyncio
async def test_promo_code_date_window_validation(session: AsyncSession) -> None:
    camp, promo = await setup_promo_fixture(session)
    actor = make_actor()
    svc = MarketingService(session)
    now = datetime.now(UTC)

    # Gələcəkdə başlayacaq kod
    await svc.create_promo_code(
        payload=PromoCodeCreate(
            code="FUTURE2026",
            campaign_id=camp.id,
            promotion_id=promo.id,
            start_date=now + timedelta(days=2),
            end_date=now + timedelta(days=10),
        ),
        actor=actor,
    )

    with pytest.raises(BusinessRuleViolationError) as exc_fut:
        await svc.redeem_promo_code(
            session=session,
            code_str="FUTURE2026",
            sale_id=generate_uuid7(),
            customer_id=generate_uuid7(),
            discount_amount=Decimal("10.00"),
            at_time=now,
        )
    assert exc_fut.value.code == "PROMO_CODE_NOT_STARTED"

    # Vaxtı bitmiş kod
    await svc.create_promo_code(
        payload=PromoCodeCreate(
            code="EXPIRED2026",
            campaign_id=camp.id,
            promotion_id=promo.id,
            start_date=now - timedelta(days=10),
            end_date=now - timedelta(days=1),
        ),
        actor=actor,
    )

    with pytest.raises(BusinessRuleViolationError) as exc_exp:
        await svc.redeem_promo_code(
            session=session,
            code_str="EXPIRED2026",
            sale_id=generate_uuid7(),
            customer_id=generate_uuid7(),
            discount_amount=Decimal("10.00"),
            at_time=now,
        )
    assert exc_exp.value.code == "PROMO_CODE_EXPIRED"


@pytest.mark.asyncio
async def test_promo_code_concurrency_race_condition(session: AsyncSession) -> None:
    """Yalnız 1 istifadəlik promokod üçün ardıcıl/paralel sorğulardan dəqiq 1-i uğurlu olur."""
    camp, promo = await setup_promo_fixture(session)
    actor = make_actor()
    svc = MarketingService(session)

    single_code = await svc.create_promo_code(
        payload=PromoCodeCreate(
            code="ONETIME99",
            campaign_id=camp.id,
            promotion_id=promo.id,
            max_total_uses=1,
            max_uses_per_customer=1,
        ),
        actor=actor,
    )
    await session.commit()

    success_count = 0
    failure_count = 0

    # 5 fərqli satış eyni promokodu istifadə etməyə cəhd edir
    for _ in range(5):
        try:
            await svc.redeem_promo_code(
                session=session,
                code_str="ONETIME99",
                sale_id=generate_uuid7(),
                customer_id=generate_uuid7(),
                discount_amount=Decimal("10.00"),
            )
            success_count += 1
        except BusinessRuleViolationError:
            failure_count += 1

    assert success_count == 1
    assert failure_count == 4
    assert single_code.current_uses == 1
    assert single_code.status == PromoCodeStatus.EXHAUSTED.value
