"""Loyallıq Jurnalı, FIFO Partiyaları və Səviyyə Testləri (Loyalty Ledger Tests).

Əhatə olunan sahələr:
1. İnvariantlar: Balans heç vaxt mənfiyə düşmür (available_points >= 0), bütün hərəkətlər append-only jurnala yazılır.
2. FIFO Lot İdarəetməsi: Xallar xərclənərkən ən köhnə qüvvədə olan partiyalardan ardıcıl silinir.
3. Xalların Vaxtının Bitməsi (Expiry Job): Vaxtı keçmiş qalıq partiyalar dondurulur, balans azaldılır və EXPIRE qeydi düşür.
4. Qaytarmalar üzrə proporsional ləğv (Return Reversal): Qaytarma məbləğinə uyğun xallar silinir, balans çatmadıqda mövcud qədər silinərək mənfi balansa yol verilmir.
5. Səviyyə Keçidləri (Tier Transitions): Dövriyyə artdıqca avtomatik Silver/Gold/Platinum pillələrinə keçid, audit qeydi və outbox hadisəsi (loyalty.tier_changed).
6. Mükafat Kataloqu və Vauçer Kodları: Vauçer generasiyası (RW-XXXX-XXXX) və stok limiti.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BusinessRuleViolationError
from app.core.ids import generate_uuid7
from app.modules.auth.policies import AuthenticatedUser
from app.modules.loyalty.models import (
    LoyaltyEntryType,
    LoyaltyLedgerEntry,
    LoyaltyTierHistory,
    RewardType,
)
from app.modules.loyalty.schemas import (
    LoyaltyManualAdjustmentRequest,
    LoyaltyRewardCreate,
)
from app.modules.loyalty.service import LoyaltyService
from app.shared.outbox import OutboxEvent


def make_loyalty_actor() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=f"loyalty_mgr_{uuid.uuid4().hex[:6]}",
        email="loyalty@brandhouse.az",
        full_name="Loyalty Manager",
        roles=["marketing_manager"],
        permissions=[
            "loyalty.program.manage",
            "loyalty.points.adjust",
            "loyalty.reward.manage",
        ],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )


# =========================================================================
# 1. EARN, REDEEM & FIFO LOT CONSUMPTION
# =========================================================================


@pytest.mark.asyncio
async def test_fifo_lot_consumption_in_order(session: AsyncSession) -> None:
    svc = LoyaltyService(session)
    cust_id = generate_uuid7()
    sale1_id = generate_uuid7()
    sale2_id = generate_uuid7()
    now = datetime.now(UTC)

    # 1. İlk alış: 100 AZN -> 100 xal (Lot 1, tez bitəcək)
    pts1 = await svc.earn(
        session=session,
        customer_id=cust_id,
        sale_id=sale1_id,
        eligible_amount=Decimal("100.00"),
        at_time=now,
    )
    assert pts1 == 100

    # 2. İkinci alış: 200 AZN -> 200 xal (Lot 2, gec bitəcək)
    pts2 = await svc.earn(
        session=session,
        customer_id=cust_id,
        sale_id=sale2_id,
        eligible_amount=Decimal("200.00"),
        at_time=now + timedelta(days=5),
    )
    assert pts2 == 200

    # Summary yoxlanışı
    summary = await svc.repo.get_or_create_summary(cust_id)
    assert summary.available_points == 300
    assert summary.lifetime_earned_points == 300

    # 3. 150 xal xərcləyirik (FIFO qaydasında: Lot 1-dən 100, Lot 2-dən 50 çıxılmalıdır)
    sale3_id = generate_uuid7()
    disc = await svc.redeem(
        session=session,
        customer_id=cust_id,
        points_to_redeem=150,
        sale_id=sale3_id,
        at_time=now + timedelta(days=10),
    )
    assert disc == Decimal("1.50")  # 150 * 0.01

    assert summary.available_points == 150
    assert summary.lifetime_redeemed_points == 150

    # Partiyaların (lots) qalıq vəziyyətini yoxlayırıq
    lots_stmt = (
        select(LoyaltyLedgerEntry)
        .where(
            LoyaltyLedgerEntry.customer_id == cust_id,
            LoyaltyLedgerEntry.entry_type == LoyaltyEntryType.EARN.value,
        )
        .order_by(LoyaltyLedgerEntry.expires_at.asc())
    )
    res = await session.execute(lots_stmt)
    lots = res.scalars().all()

    assert len(lots) == 2
    assert lots[0].remaining_lot_points == 0   # 1-ci lot tam istifadə olunub
    assert lots[1].remaining_lot_points == 150  # 2-ci lotdan 50 çıxılıb, 150 qalıb


# =========================================================================
# 2. EXPIRY JOB
# =========================================================================


@pytest.mark.asyncio
async def test_expiry_job_decrements_balance_and_records_entry(session: AsyncSession) -> None:
    svc = LoyaltyService(session)
    cust_id = generate_uuid7()
    base_time = datetime.now(UTC) - timedelta(days=400)

    # 400 gün əvvəl qazanılmış 200 xal (1 illik müddəti keçib)
    await svc.earn(
        session=session,
        customer_id=cust_id,
        sale_id=generate_uuid7(),
        eligible_amount=Decimal("200.00"),
        at_time=base_time,
    )

    summary = await svc.repo.get_or_create_summary(cust_id)
    assert summary.available_points == 200

    # Expiry job işə düşür (cari vaxtda)
    expired_count = await svc.expire_lots(at_time=datetime.now(UTC))
    assert expired_count == 200

    # Balans 0-a düşməlidir
    await session.refresh(summary)
    assert summary.available_points == 0

    # EXPIRE növlü jurnal qeydi olmalıdır
    exp_entry_stmt = select(LoyaltyLedgerEntry).where(
        LoyaltyLedgerEntry.customer_id == cust_id,
        LoyaltyLedgerEntry.entry_type == LoyaltyEntryType.EXPIRE.value,
    )
    res = await session.execute(exp_entry_stmt)
    exp_entry = res.scalar_one_or_none()
    assert exp_entry is not None
    assert exp_entry.points == -200


# =========================================================================
# 3. RETURN REVERSAL & NON-NEGATIVE BALANCE INVARIANT
# =========================================================================


@pytest.mark.asyncio
async def test_return_reversal_proportionality_and_safety(session: AsyncSession) -> None:
    svc = LoyaltyService(session)
    cust_id = generate_uuid7()
    now = datetime.now(UTC)

    # 100 AZN alış -> 100 xal
    await svc.earn(
        session=session,
        customer_id=cust_id,
        sale_id=generate_uuid7(),
        eligible_amount=Decimal("100.00"),
        at_time=now,
    )

    # Qismən qaytarma: 30 AZN -> 30 xal silinməlidir
    rev1 = await svc.reverse_for_return(
        session=session,
        customer_id=cust_id,
        return_id=generate_uuid7(),
        return_amount=Decimal("30.00"),
        at_time=now + timedelta(days=1),
    )
    assert rev1 == 30

    summary = await svc.repo.get_or_create_summary(cust_id)
    assert summary.available_points == 70
    assert summary.rolling_spend == Decimal("70.00")

    # Müştəri mövcud 70 xaldan 50-sini xərcləyir -> 20 xal qalır
    await svc.redeem(
        session=session,
        customer_id=cust_id,
        points_to_redeem=50,
        sale_id=generate_uuid7(),
        at_time=now + timedelta(days=2),
    )
    assert summary.available_points == 20

    # Daha bir böyük qaytarma: 50 AZN (normalda 50 xal silinməlidir, amma balansda cəmi 20 var)
    # İnvariant: Balans heç vaxt mənfiyə düşmür! Yalnız mövcud 20 silinir.
    rev2 = await svc.reverse_for_return(
        session=session,
        customer_id=cust_id,
        return_id=generate_uuid7(),
        return_amount=Decimal("50.00"),
        at_time=now + timedelta(days=3),
    )
    assert rev2 == 20
    assert summary.available_points == 0


# =========================================================================
# 4. TIER ADVANCEMENT & OUTBOX EVENT
# =========================================================================


@pytest.mark.asyncio
async def test_tier_advancement_and_outbox_event(session: AsyncSession) -> None:
    svc = LoyaltyService(session)
    cust_id = generate_uuid7()
    now = datetime.now(UTC)

    summary = await svc.repo.get_or_create_summary(cust_id)
    assert summary.current_tier == "Bronze"

    # 1. 600 AZN alış (Silver həddi 500 AZN-dir)
    await svc.earn(
        session=session,
        customer_id=cust_id,
        sale_id=generate_uuid7(),
        eligible_amount=Decimal("600.00"),
        at_time=now,
    )

    assert summary.current_tier == "Silver"
    assert summary.tier_valid_until is not None

    # Audit tarixçəsi yoxlanışı
    th_stmt = select(LoyaltyTierHistory).where(LoyaltyTierHistory.customer_id == cust_id)
    res = await session.execute(th_stmt)
    history = res.scalars().all()
    assert len(history) == 1
    assert history[0].old_tier == "Bronze"
    assert history[0].new_tier == "Silver"

    # Outbox hadisəsi yoxlanışı (loyalty.tier_changed)
    outbox_stmt = select(OutboxEvent).where(
        OutboxEvent.event_type == "loyalty.tier_changed",
        OutboxEvent.aggregate_id == str(cust_id),
    )
    res_ob = await session.execute(outbox_stmt)
    ob_evt = res_ob.scalar_one_or_none()
    assert ob_evt is not None
    assert ob_evt.payload["new_tier"] == "Silver"

    # 2. Növbəti böyük alış: 1500 AZN (Cəmi 2100 AZN -> Gold həddi 2000 AZN-dir)
    # Silver statusunda olduğu üçün multiplier 1.2 tətbiq olunmalıdır
    pts_gold = await svc.earn(
        session=session,
        customer_id=cust_id,
        sale_id=generate_uuid7(),
        eligible_amount=Decimal("1500.00"),
        at_time=now + timedelta(days=1),
    )
    # 1500 * 1.2 = 1800 xal
    assert pts_gold == 1800
    assert summary.current_tier == "Gold"


# =========================================================================
# 5. REWARDS CATALOG & VOUCHERS
# =========================================================================


@pytest.mark.asyncio
async def test_rewards_redemption_and_voucher_code(session: AsyncSession) -> None:
    svc = LoyaltyService(session)
    actor = make_loyalty_actor()
    cust_id = generate_uuid7()

    # Müştəriyə 500 xal veririk
    await svc.adjust_points(
        payload=LoyaltyManualAdjustmentRequest(
            customer_id=cust_id,
            points=500,
            reason="Kompensasiya",
        ),
        actor=actor,
    )

    # Mükafat yaradılır (200 xallıq 5 AZN vauçer, stok=2)
    reward = await svc.create_reward(
        payload=LoyaltyRewardCreate(
            name="5 AZN Endirim Vauçeri",
            points_cost=200,
            reward_type=RewardType.DISCOUNT_VOUCHER,
            benefit_value=Decimal("5.00"),
            stock_limit=2,
            valid_days=14,
        ),
        actor=actor,
    )

    # Mükafat dəyişdirilir
    redemption1 = await svc.redeem_reward(
        customer_id=cust_id,
        reward_id=reward.id,
        actor=actor,
    )
    assert redemption1.voucher_code.startswith("RW-")
    assert redemption1.points_spent == 200
    assert redemption1.status == "ACTIVE"

    summary = await svc.repo.get_or_create_summary(cust_id)
    assert summary.available_points == 300
    assert reward.redeemed_count == 1

    # 2-ci dəfə dəyişdirmə (stok sonuncudur)
    await svc.redeem_reward(
        customer_id=cust_id,
        reward_id=reward.id,
        actor=actor,
    )
    assert reward.redeemed_count == 2
    assert summary.available_points == 100

    # 3-cü dəfə cəhd -> REWARD_OUT_OF_STOCK
    with pytest.raises(BusinessRuleViolationError) as exc_stock:
        await svc.redeem_reward(
            customer_id=cust_id,
            reward_id=reward.id,
            actor=actor,
        )
    assert exc_stock.value.code == "REWARD_OUT_OF_STOCK"
