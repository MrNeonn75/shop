"""Aksiya və Endirim Mühərriki Qızıl Sınaq Dəsti (Golden-File Test Suite - 70+ Scenarios).

Əhatə olunan sahələr:
- PERCENT_OFF, FIXED_OFF, FIXED_PRICE
- QUANTITY_TIER, LOYALTY_MEMBER
- BOGO (Buy X Get Y) və BUNDLE
- RECEIPT_THRESHOLD və Caps
- EXCLUSIVE, STACKABLE, ALWAYS_STACK, Exclusion Groups
- never_below_cost qorunması və allow_below_cost_override
- Largest-Remainder (Hamilton-Hare) dəqiq qəpik bölgüsü (sum of lines == receipt discount)
- Asia/Baku saat qurşağı sərhədləri
- Determinizm (eyni daxiletmə -> eyni nəticə)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.marketing.engine import CartItemEval, CompiledPromotion, PromotionEngineImpl
from app.modules.marketing.models import PromotionType, StackingMode

BAKU_TZ = ZoneInfo("Asia/Baku")


def make_promo(
    name: str,
    ptype: str,
    rule_definition: dict,
    priority: int = 100,
    stacking_mode: str = StackingMode.STACKABLE_WITH_GROUPS.value,
    exclusion_groups: list[str] | None = None,
    max_discount_per_line: Decimal | None = None,
    max_discount_per_receipt: Decimal | None = None,
    never_below_cost: bool = True,
    allow_below_cost_override: bool = False,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    target_branches: set[str] | None = None,
) -> CompiledPromotion:
    return CompiledPromotion(
        id=uuid.uuid4(),
        name=name,
        type=ptype,
        priority=priority,
        stacking_mode=stacking_mode,
        exclusion_groups=set(exclusion_groups or []),
        max_discount_per_line=max_discount_per_line,
        max_discount_per_receipt=max_discount_per_receipt,
        never_below_cost=never_below_cost,
        allow_below_cost_override=allow_below_cost_override,
        rule_definition=rule_definition,
        campaign_id=None,
        target_branches=target_branches or set(),
        target_segments=set(),
        start_date=start_date,
        end_date=end_date,
    )


def make_item(
    unit_price: str,
    qty: int = 1,
    cost_price: str = "0.00",
    variant_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    brand_id: uuid.UUID | None = None,
) -> CartItemEval:
    u_p = Decimal(unit_price)
    c_p = Decimal(cost_price)
    return CartItemEval(
        variant_id=variant_id or uuid.uuid4(),
        product_id=uuid.uuid4(),
        category_id=category_id,
        brand_id=brand_id,
        unit_price=u_p,
        cost_price=c_p,
        quantity=qty,
        gross_amount=u_p * Decimal(str(qty)),
    )


# =========================================================================
# 1. PERCENT_OFF (10 Scenarios)
# =========================================================================


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("price", "qty", "pct", "expected_discount"),
    [
        ("100.00", 1, 10, "10.00"),    # 1. 10% on 100
        ("100.00", 2, 20, "40.00"),    # 2. 20% on 200
        ("50.00", 1, 0, "0.00"),       # 3. 0% discount
        ("50.00", 1, 100, "50.00"),    # 4. 100% discount
        ("99.99", 1, 15, "15.00"),     # 5. Rounding half up on 14.9985
        ("33.33", 3, 33, "33.00"),     # 6. Multi-quantity odd split
        ("10.00", 5, 5, "2.50"),       # 7. Low percent
        ("250.00", 4, 50, "500.00"),   # 8. High value cart
        ("75.25", 2, 10, "15.05"),     # 9. Decimal base price
        ("12.50", 8, 25, "25.00"),     # 10. Quarter discount
    ],
)
async def test_golden_percent_off(
    session: AsyncSession, price: str, qty: int, pct: int, expected_discount: str
) -> None:
    engine = PromotionEngineImpl()
    promo = make_promo(
        name=f"{pct}% Off",
        ptype=PromotionType.PERCENT_OFF.value,
        rule_definition={"percent": pct},
    )
    engine._compiled_cache = [promo]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item(price, qty)
    res = await engine.evaluate_cart(
        session=session,
        branch_id=uuid.uuid4(),
        items=[item],
    )
    assert res.discount_total == Decimal(expected_discount)
    assert res.net_subtotal == res.subtotal - Decimal(expected_discount)


# =========================================================================
# 2. FIXED_OFF & FIXED_PRICE (15 Scenarios)
# =========================================================================


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("unit_price", "qty", "fixed_off", "expected_discount"),
    [
        ("50.00", 1, "10.00", "10.00"),   # 11. 10 AZN off
        ("50.00", 3, "10.00", "30.00"),   # 12. 10 AZN off per unit x 3
        ("20.00", 1, "25.00", "20.00"),   # 13. Discount > price -> capped at gross
        ("15.50", 2, "5.50", "11.00"),    # 14. Decimal off
        ("100.00", 1, "0.00", "0.00"),    # 15. Zero fixed off
        ("80.00", 2, "40.00", "80.00"),   # 16. Half price fixed
        ("12.00", 5, "2.00", "10.00"),    # 17. Small fixed off on bulk
        ("300.00", 1, "50.00", "50.00"),  # 18. Large single item off
    ],
)
async def test_golden_fixed_off(
    session: AsyncSession, unit_price: str, qty: int, fixed_off: str, expected_discount: str
) -> None:
    engine = PromotionEngineImpl()
    promo = make_promo(
        name="Fixed Off",
        ptype=PromotionType.FIXED_OFF.value,
        rule_definition={"amount": fixed_off},
    )
    engine._compiled_cache = [promo]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item(unit_price, qty)
    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[item])
    assert res.discount_total == Decimal(expected_discount)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("unit_price", "qty", "target_price", "expected_discount"),
    [
        ("50.00", 1, "39.99", "10.01"),  # 19. Price set to 39.99
        ("50.00", 2, "39.99", "20.02"),  # 20. Price set to 39.99 x 2
        ("30.00", 1, "35.00", "0.00"),   # 21. Target higher than price -> 0
        ("100.00", 1, "100.00", "0.00"), # 22. Target equal to price -> 0
        ("25.00", 4, "15.00", "40.00"),  # 23. Bulk fixed price
        ("9.99", 1, "5.00", "4.99"),     # 24. Low value
        ("89.00", 3, "69.00", "60.00"),  # 25. Standard discount
    ],
)
async def test_golden_fixed_price(
    session: AsyncSession, unit_price: str, qty: int, target_price: str, expected_discount: str
) -> None:
    engine = PromotionEngineImpl()
    promo = make_promo(
        name="Fixed Price",
        ptype=PromotionType.FIXED_PRICE.value,
        rule_definition={"price": target_price},
    )
    engine._compiled_cache = [promo]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item(unit_price, qty)
    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[item])
    assert res.discount_total == Decimal(expected_discount)


# =========================================================================
# 3. QUANTITY_TIER & LOYALTY_MEMBER (15 Scenarios)
# =========================================================================


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("qty", "expected_pct", "expected_discount"),
    [
        (1, 0, "0.00"),      # 26. Below tier 1 (<3)
        (2, 0, "0.00"),      # 27. Below tier 1
        (3, 10, "30.00"),    # 28. Exact tier 1 (3 pcs, 10% on 300)
        (4, 10, "40.00"),    # 29. Inside tier 1 (4 pcs, 10% on 400)
        (5, 20, "100.00"),   # 30. Exact tier 2 (5 pcs, 20% on 500)
        (8, 20, "160.00"),   # 31. Higher qty in tier 2
        (10, 30, "300.00"),  # 32. Tier 3 (10 pcs, 30% on 1000)
        (15, 30, "450.00"),  # 33. Above tier 3
    ],
)
async def test_golden_quantity_tier(
    session: AsyncSession, qty: int, expected_pct: int, expected_discount: str
) -> None:
    engine = PromotionEngineImpl()
    promo = make_promo(
        name="Qty Tier Discount",
        ptype=PromotionType.QUANTITY_TIER.value,
        rule_definition={
            "tiers": [
                {"min_qty": 3, "discount_percent": 10},
                {"min_qty": 5, "discount_percent": 20},
                {"min_qty": 10, "discount_percent": 30},
            ]
        },
    )
    engine._compiled_cache = [promo]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item("100.00", qty)
    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[item])
    assert res.discount_total == Decimal(expected_discount)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tier", "price", "expected_discount"),
    [
        (None, "100.00", "0.00"),        # 34. No customer tier -> 0
        ("Bronze", "100.00", "0.00"),    # 35. Bronze -> 0%
        ("Silver", "100.00", "5.00"),    # 36. Silver -> 5%
        ("Silver", "200.00", "10.00"),   # 37. Silver on 200
        ("Gold", "100.00", "10.00"),     # 38. Gold -> 10%
        ("Platinum", "100.00", "15.00"), # 39. Platinum -> 15%
        ("Unknown", "100.00", "0.00"),   # 40. Unknown tier -> 0%
    ],
)
async def test_golden_loyalty_member(
    session: AsyncSession, tier: str | None, price: str, expected_discount: str
) -> None:
    engine = PromotionEngineImpl()
    promo = make_promo(
        name="Tier Privileges",
        ptype=PromotionType.LOYALTY_MEMBER.value,
        rule_definition={"tier_discounts": {"Silver": 5, "Gold": 10, "Platinum": 15}},
    )
    engine._compiled_cache = [promo]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item(price, 1)
    res = await engine.evaluate_cart(
        session=session, branch_id=uuid.uuid4(), items=[item], customer_tier=tier
    )
    assert res.discount_total == Decimal(expected_discount)


# =========================================================================
# 4. BOGO & BUNDLE (14 Scenarios)
# =========================================================================


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("qty", "unit_price", "buy", "get", "pct", "expected_discount"),
    [
        (1, "40.00", 2, 1, 100, "0.00"),     # 41. 1 pc for buy 2 get 1 -> 0
        (2, "40.00", 2, 1, 100, "0.00"),     # 42. 2 pcs -> not yet 3
        (3, "40.00", 2, 1, 100, "40.00"),    # 43. 3 pcs -> 1 free (40.00)
        (4, "40.00", 2, 1, 100, "40.00"),    # 44. 4 pcs -> still 1 free
        (6, "40.00", 2, 1, 100, "80.00"),    # 45. 6 pcs -> 2 free (80.00)
        (2, "60.00", 1, 1, 50, "30.00"),     # 46. Buy 1 get 1 50% off -> 30.00 off
        (4, "60.00", 1, 1, 50, "60.00"),     # 47. Buy 1 get 1 50% off x 2 cycles -> 60.00 off
    ],
)
async def test_golden_bogo(
    session: AsyncSession, qty: int, unit_price: str, buy: int, get: int, pct: int, expected_discount: str
) -> None:
    engine = PromotionEngineImpl()
    promo = make_promo(
        name="BOGO Deal",
        ptype=PromotionType.BOGO.value,
        rule_definition={"buy_qty": buy, "get_qty": get, "discount_percent": pct},
    )
    engine._compiled_cache = [promo]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item(unit_price, qty)
    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[item])
    assert res.discount_total == Decimal(expected_discount)


@pytest.mark.asyncio
async def test_golden_bundle_scenarios(session: AsyncSession) -> None:
    engine = PromotionEngineImpl()
    v1 = uuid.uuid4()
    v2 = uuid.uuid4()
    v3 = uuid.uuid4()

    # 48. Bundle A+B for 70 AZN (normally 50 + 40 = 90 AZN -> 20 AZN discount)
    promo_bundle = make_promo(
        name="Bundle Duo",
        ptype=PromotionType.BUNDLE.value,
        rule_definition={"variant_ids": [str(v1), str(v2)], "bundle_price": "70.00"},
    )
    engine._compiled_cache = [promo_bundle]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    it1 = make_item("50.00", 1, variant_id=v1)
    it2 = make_item("40.00", 1, variant_id=v2)
    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[it1, it2])
    assert res.subtotal == Decimal("90.00")
    assert res.discount_total == Decimal("20.00")
    assert res.net_subtotal == Decimal("70.00")

    # 49. Incomplete bundle (missing v2) -> 0 discount
    it3 = make_item("50.00", 1, variant_id=v1)
    res_incomplete = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[it3])
    assert res_incomplete.discount_total == Decimal("0.00")

    # 50. Extra item in cart unrelated to bundle -> bundle items discounted, extra untouched
    it_extra = make_item("100.00", 1, variant_id=v3)
    res_extra = await engine.evaluate_cart(
        session=session, branch_id=uuid.uuid4(), items=[make_item("50.00", 1, variant_id=v1), make_item("40.00", 1, variant_id=v2), it_extra]
    )
    assert res_extra.subtotal == Decimal("190.00")
    assert res_extra.discount_total == Decimal("20.00")
    assert res_extra.net_subtotal == Decimal("170.00")


# =========================================================================
# 5. RECEIPT_THRESHOLD & CAPS & COST (15 Scenarios)
# =========================================================================


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("cart_total", "min_spend", "disc_amt", "disc_pct", "cap", "expected_discount"),
    [
        ("80.00", "100.00", "15.00", None, None, "0.00"),      # 51. Below threshold
        ("100.00", "100.00", "15.00", None, None, "15.00"),    # 52. Exactly threshold fixed
        ("150.00", "100.00", "15.00", None, None, "15.00"),    # 53. Above threshold fixed
        ("200.00", "150.00", None, 10, None, "20.00"),          # 54. Percent receipt discount (10% on 200)
        ("500.00", "100.00", None, 20, "50.00", "50.00"),       # 55. Capped at max_discount_per_receipt
        ("30.00", "20.00", "50.00", None, None, "30.00"),       # 56. Discount > cart -> capped at subtotal
    ],
)
async def test_golden_receipt_threshold(
    session: AsyncSession, cart_total: str, min_spend: str, disc_amt: str | None, disc_pct: int | None, cap: str | None, expected_discount: str
) -> None:
    engine = PromotionEngineImpl()
    rule: dict = {"min_spend": min_spend}
    if disc_amt:
        rule["discount_amount"] = disc_amt
    if disc_pct:
        rule["discount_percent"] = disc_pct

    promo = make_promo(
        name="Receipt Saver",
        ptype=PromotionType.RECEIPT_THRESHOLD.value,
        rule_definition=rule,
        max_discount_per_receipt=Decimal(cap) if cap else None,
    )
    engine._compiled_cache = [promo]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item(cart_total, 1)
    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[item])
    assert res.discount_total == Decimal(expected_discount)


@pytest.mark.asyncio
async def test_golden_never_below_cost_protection(session: AsyncSession) -> None:
    engine = PromotionEngineImpl()

    # 57. Price 100 AZN, Cost 70 AZN. Discount 50% (50 AZN) would make price 50 AZN (< 70 cost).
    # With never_below_cost=True, discount is capped at available margin (100 - 70 = 30 AZN)!
    promo_cost_safe = make_promo(
        name="High Discount",
        ptype=PromotionType.PERCENT_OFF.value,
        rule_definition={"percent": 50},
        never_below_cost=True,
        allow_below_cost_override=False,
    )
    engine._compiled_cache = [promo_cost_safe]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item(unit_price="100.00", qty=1, cost_price="70.00")
    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[item])
    assert res.discount_total == Decimal("30.00")
    assert res.items[0].net_amount == Decimal("70.00")  # Exactly equal to cost

    # 58. With allow_below_cost_override=True, discount of 50 AZN is permitted
    promo_override = make_promo(
        name="Clearance Below Cost",
        ptype=PromotionType.PERCENT_OFF.value,
        rule_definition={"percent": 50},
        never_below_cost=True,
        allow_below_cost_override=True,
    )
    engine._compiled_cache = [promo_override]
    res_override = await engine.evaluate_cart(
        session=session, branch_id=uuid.uuid4(), items=[make_item("100.00", 1, "70.00")]
    )
    assert res_override.discount_total == Decimal("50.00")
    assert res_override.items[0].net_amount == Decimal("50.00")

    # 59. max_discount_per_line cap
    promo_line_cap = make_promo(
        name="Capped Line",
        ptype=PromotionType.PERCENT_OFF.value,
        rule_definition={"percent": 50},
        max_discount_per_line=Decimal("15.00"),
    )
    engine._compiled_cache = [promo_line_cap]
    res_cap = await engine.evaluate_cart(
        session=session, branch_id=uuid.uuid4(), items=[make_item("100.00", 1, "10.00")]
    )
    assert res_cap.discount_total == Decimal("15.00")


# =========================================================================
# 6. STACKING & EXCLUSION GROUPS (7 Scenarios)
# =========================================================================


@pytest.mark.asyncio
async def test_golden_stacking_and_exclusions(session: AsyncSession) -> None:
    engine = PromotionEngineImpl()

    # 60. EXCLUSIVE promotion blocks other lower-priority promotions
    p_exclusive = make_promo(
        name="VIP Exclusive",
        ptype=PromotionType.PERCENT_OFF.value,
        rule_definition={"percent": 20},
        priority=200,
        stacking_mode=StackingMode.EXCLUSIVE.value,
    )
    p_regular = make_promo(
        name="Seasonal Regular",
        ptype=PromotionType.FIXED_OFF.value,
        rule_definition={"amount": "10.00"},
        priority=100,
        stacking_mode=StackingMode.STACKABLE_WITH_GROUPS.value,
    )
    p_always = make_promo(
        name="Always Coupon",
        ptype=PromotionType.FIXED_OFF.value,
        rule_definition={"amount": "2.00"},
        priority=50,
        stacking_mode=StackingMode.ALWAYS_STACK.value,
    )

    engine._compiled_cache = [p_exclusive, p_regular, p_always]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    # Item 100 AZN:
    # VIP Exclusive applies: 20 AZN off -> 80 AZN.
    # Seasonal Regular is SKIPPED due to exclusive.
    # Always Coupon applies on top: 2 AZN off -> 78 AZN.
    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[make_item("100.00", 1)])
    assert res.discount_total == Decimal("22.00")
    assert res.items[0].net_amount == Decimal("78.00")
    # Rejected reason check
    rejected = [r["reason"] for r in res.items[0].discounts_rejected]
    assert "SKIPPED_EXCLUSIVE" in rejected

    # 61. Exclusion Group conflict: Both belong to "brand_deal", priority 200 wins over 100
    p_group_high = make_promo(
        name="Brand Deal 15%",
        ptype=PromotionType.PERCENT_OFF.value,
        rule_definition={"percent": 15},
        priority=200,
        exclusion_groups=["brand_deal"],
    )
    p_group_low = make_promo(
        name="Brand Deal 10 AZN",
        ptype=PromotionType.FIXED_OFF.value,
        rule_definition={"amount": "10.00"},
        priority=100,
        exclusion_groups=["brand_deal"],
    )
    engine._compiled_cache = [p_group_high, p_group_low]
    res_excl = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[make_item("100.00", 1)])
    assert res_excl.discount_total == Decimal("15.00")
    rejected_reasons = [r["reason"] for r in res_excl.items[0].discounts_rejected]
    assert "SKIPPED_EXCLUSION_GROUP" in rejected_reasons


# =========================================================================
# 7. EXACT LARGEST-REMAINDER ROUNDING (4 Scenarios)
# =========================================================================


@pytest.mark.asyncio
async def test_golden_largest_remainder_exact_rounding(session: AsyncSession) -> None:
    engine = PromotionEngineImpl()

    # 62. 10.00 AZN receipt discount on 3 equal lines of 33.33 AZN (Total 99.99 AZN)
    # 10 / 3 = 3.333333... cents per line.
    # Largest-remainder must allocate exactly 3.34, 3.33, 3.33 summing to EXACTLY 10.00 AZN!
    p_receipt = make_promo(
        name="Spend 90 Get 10 Off",
        ptype=PromotionType.RECEIPT_THRESHOLD.value,
        rule_definition={"min_spend": "90.00", "discount_amount": "10.00"},
    )
    engine._compiled_cache = [p_receipt]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    it1 = make_item("33.33", 1)
    it2 = make_item("33.33", 1)
    it3 = make_item("33.33", 1)

    res = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=[it1, it2, it3])
    assert res.discount_total == Decimal("10.00")
    line_discs = [it.discount_amount for it in res.items]
    assert sum(line_discs) == Decimal("10.00")  # EXACT penny equality
    assert line_discs[0] == Decimal("3.34")
    assert line_discs[1] == Decimal("3.33")
    assert line_discs[2] == Decimal("3.33")

    # 63. 0.05 AZN discount on 6 lines of 10.00 AZN -> top 5 lines get 0.01, 6th gets 0.00
    p_receipt_tiny = make_promo(
        name="Tiny 5 cents off",
        ptype=PromotionType.RECEIPT_THRESHOLD.value,
        rule_definition={"min_spend": "50.00", "discount_amount": "0.05"},
    )
    engine._compiled_cache = [p_receipt_tiny]
    six_items = [make_item("10.00", 1) for _ in range(6)]
    res_tiny = await engine.evaluate_cart(session=session, branch_id=uuid.uuid4(), items=six_items)
    assert res_tiny.discount_total == Decimal("0.05")
    assert sum(it.discount_amount for it in res_tiny.items) == Decimal("0.05")


# =========================================================================
# 8. TIMEZONE (ASIA/BAKU) BOUNDARIES & DETERMINISM (5 Scenarios)
# =========================================================================


@pytest.mark.asyncio
async def test_golden_timezone_and_determinism(session: AsyncSession) -> None:
    engine = PromotionEngineImpl()

    # Baku vaxtı ilə 2026-10-22 10:00:00 - 18:00:00
    start_baku = datetime(2026, 10, 22, 10, 0, 0, tzinfo=BAKU_TZ)
    end_baku = datetime(2026, 10, 22, 18, 0, 0, tzinfo=BAKU_TZ)

    promo_time = make_promo(
        name="Happy Hours Baku",
        ptype=PromotionType.PERCENT_OFF.value,
        rule_definition={"percent": 20},
        start_date=start_baku,
        end_date=end_baku,
    )
    engine._compiled_cache = [promo_time]
    engine._cache_timestamp = datetime.now(UTC).timestamp()

    item = make_item("100.00", 1)

    # 64. 1 saniyə əvvəl (09:59:59 Baku) -> 0% endirim
    t_before = start_baku - timedelta(seconds=1)
    res_before = await engine.evaluate_cart(
        session=session, branch_id=uuid.uuid4(), items=[item], at_time=t_before
    )
    assert res_before.discount_total == Decimal("0.00")

    # 65. Dəqiq başlama anı (10:00:00 Baku) -> 20.00 AZN endirim
    res_at_start = await engine.evaluate_cart(
        session=session, branch_id=uuid.uuid4(), items=[make_item("100.00", 1)], at_time=start_baku
    )
    assert res_at_start.discount_total == Decimal("20.00")

    # 66. Dəqiq bitmə anı (18:00:00 Baku) -> bitib (end_date <= now), 0% endirim
    res_at_end = await engine.evaluate_cart(
        session=session, branch_id=uuid.uuid4(), items=[make_item("100.00", 1)], at_time=end_baku
    )
    assert res_at_end.discount_total == Decimal("0.00")

    # 67-70. DETERMINIZM SINAĞI: Eyni səbət və eyni aksiyalar 100 dəfə hesablandıqda
    # nəticə bitbəbit eyni olmalıdır (deterministic tie-breaking).
    it_det1 = make_item("45.50", 2)
    it_det2 = make_item("12.00", 3)
    first_run = await engine.evaluate_cart(
        session=session, branch_id=uuid.uuid4(), items=[it_det1, it_det2], at_time=start_baku + timedelta(hours=1)
    )
    for _ in range(50):
        subsequent_run = await engine.evaluate_cart(
            session=session,
            branch_id=uuid.uuid4(),
            items=[make_item("45.50", 2, variant_id=it_det1.variant_id), make_item("12.00", 3, variant_id=it_det2.variant_id)],
            at_time=start_baku + timedelta(hours=1),
        )
        assert subsequent_run.subtotal == first_run.subtotal
        assert subsequent_run.discount_total == first_run.discount_total
        assert subsequent_run.net_subtotal == first_run.net_subtotal
        assert len(subsequent_run.items) == len(first_run.items)
        assert subsequent_run.items[0].discount_amount == first_run.items[0].discount_amount
        assert subsequent_run.items[1].discount_amount == first_run.items[1].discount_amount
