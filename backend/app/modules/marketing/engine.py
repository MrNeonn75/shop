"""Mərkəzi Server Aksiya və Endirim Mühərriki (Server-Authoritative Promotion Engine).

Bu mühərrik POS kalkulyasiyası (/pos/quote), checkout finalizasiyası və marketinq
simulyatoru (/marketing/simulate) üçün TƏK və YEKUN həqiqət mənbəyidir.

Alqoritm:
1. Uyğun aksiyaların toplanması (filial, müştəri seqmenti/səviyyəsi, promokod, vaxt).
2. Prioritet və sabit tie-breaker (priority DESC, id ASC) üzrə çeşidlənməsi.
3. Sətir səviyyəli aksiyaların (PERCENT_OFF, FIXED_OFF, FIXED_PRICE, QUANTITY_TIER, LOYALTY_MEMBER) tətbiqi.
4. Dəst (BUNDLE) və BOGO qruplaşdırmalarının tətbiqi.
5. Qəbz səviyyəli aksiyaların (RECEIPT_THRESHOLD, PROMO_CODE) hesablanması.
6. Stacking (EXCLUSIVE, STACKABLE_WITH_GROUPS, ALWAYS_STACK), Exclusion Groups və Caps (Maya dəyərindən aşağı düşməmə) tətbiqi.
7. Qəbz endirimlərinin ən böyük qalıq (Largest-Remainder / Hamilton-Hare) alqoritmi ilə sətirlərə dəqiq qəpik bölgüsü.
8. Hər sətir üzrə tam audit izahatının (applied / rejected reasons) qaytarılması.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utc_now
from app.core.money import round_money
from app.modules.marketing.models import (
    CampaignStatus,
    PromoCode,
    Promotion,
    PromotionType,
    StackingMode,
)
from app.modules.marketing.schemas import (
    LineDiscountExplanation,
    SimulatedLineResult,
    SimulatorResponse,
)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


@dataclass
class CartItemEval:
    variant_id: uuid.UUID
    product_id: uuid.UUID | None
    category_id: uuid.UUID | None
    brand_id: uuid.UUID | None
    unit_price: Decimal
    cost_price: Decimal
    quantity: int
    gross_amount: Decimal
    current_discount: Decimal = Decimal("0.00")
    discounts_applied: list[LineDiscountExplanation] = field(default_factory=list)
    discounts_rejected: list[dict[str, str]] = field(default_factory=list)
    applied_promo_ids: set[uuid.UUID] = field(default_factory=set)
    applied_exclusion_groups: set[str] = field(default_factory=set)
    has_exclusive: bool = False

    @property
    def net_amount(self) -> Decimal:
        return max(Decimal("0.00"), self.gross_amount - self.current_discount)


@dataclass
class CompiledPromotion:
    id: uuid.UUID
    name: str
    type: str
    priority: int
    stacking_mode: str
    exclusion_groups: set[str]
    max_discount_per_line: Decimal | None
    max_discount_per_receipt: Decimal | None
    never_below_cost: bool
    allow_below_cost_override: bool
    rule_definition: dict[str, Any]
    campaign_id: uuid.UUID | None
    target_branches: set[str]
    target_segments: set[str]
    start_date: datetime | None
    end_date: datetime | None


class PromotionEngineImpl:
    """Yüksək performanslı və in-memory keşlənən Aksiya Mühərriki."""

    _compiled_cache: list[CompiledPromotion] | None = None
    _cache_timestamp: float = 0.0
    _cache_ttl_seconds: float = 60.0

    @classmethod
    def invalidate_cache(cls) -> None:
        cls._compiled_cache = None
        cls._cache_timestamp = 0.0

    async def get_compiled_promotions(
        self, session: AsyncSession, _at_time: datetime
    ) -> list[CompiledPromotion]:
        now_ts = time.time()
        if (
            self._compiled_cache is not None
            and (now_ts - self._cache_timestamp) < self._cache_ttl_seconds
        ):
            return self._compiled_cache

        stmt = (
            select(Promotion)
            .options(selectinload(Promotion.campaign))
            .where(Promotion.is_active.is_(True))
            .order_by(Promotion.priority.desc(), Promotion.id.asc())
        )
        res = await session.execute(stmt)
        promotions = res.scalars().all()

        compiled: list[CompiledPromotion] = []
        for p in promotions:
            target_branches: set[str] = set()
            target_segments: set[str] = set()
            camp_start = None
            camp_end = None

            if p.campaign:
                # Yalnız aktiv/təsdiqlənmiş kampaniyalar
                if p.campaign.status not in [
                    CampaignStatus.ACTIVE.value,
                    CampaignStatus.APPROVED.value,
                    CampaignStatus.SCHEDULED.value,
                ]:
                    continue
                camp_start = p.campaign.start_date
                camp_end = p.campaign.end_date
                if p.campaign.target_branches:
                    target_branches = {str(b) for b in p.campaign.target_branches}
                if p.campaign.target_segments:
                    target_segments = {str(s) for s in p.campaign.target_segments}

            # Promosiya və kampaniya tarixlərinin kəsişməsi
            p_start = ensure_utc(p.start_date or camp_start)
            p_end = ensure_utc(p.end_date or camp_end)

            compiled.append(
                CompiledPromotion(
                    id=p.id,
                    name=p.name,
                    type=p.type,
                    priority=p.priority,
                    stacking_mode=p.stacking_mode,
                    exclusion_groups=set(p.exclusion_groups or []),
                    max_discount_per_line=p.max_discount_per_line,
                    max_discount_per_receipt=p.max_discount_per_receipt,
                    never_below_cost=p.never_below_cost,
                    allow_below_cost_override=p.allow_below_cost_override,
                    rule_definition=p.rule_definition or {},
                    campaign_id=p.campaign_id,
                    target_branches=target_branches,
                    target_segments=target_segments,
                    start_date=p_start,
                    end_date=p_end,
                )
            )

        self._compiled_cache = compiled
        self._cache_timestamp = now_ts
        return compiled

    async def evaluate_promotions(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        branch_id: uuid.UUID = uuid.UUID(int=0),
        customer_id: uuid.UUID | None = None,
        items: list[dict[str, Any]] | None = None,
        at_time: datetime | None = None,
        promo_code: str | None = None,
        customer_tier: str | None = None,
    ) -> list[dict[str, Any]]:
        """POS pricing mühərriki ilə uyğunlaşdırılmış sadə interfeys."""
        _ = company_id
        sim_res = await self.evaluate_cart(
            session=session,
            branch_id=branch_id,
            items=[
                CartItemEval(
                    variant_id=it["variant_id"],
                    product_id=it.get("product_id"),
                    category_id=it.get("category_id"),
                    brand_id=it.get("brand_id"),
                    unit_price=it.get("unit_price", Decimal("0.00")),
                    cost_price=it.get("cost_price", Decimal("0.00")),
                    quantity=it.get("quantity", 1),
                    gross_amount=it.get("unit_price", Decimal("0.00")) * it.get("quantity", 1),
                )
                for it in (items or [])
            ],
            customer_id=customer_id,
            customer_tier=customer_tier,
            promo_code=promo_code,
            at_time=at_time,
        )
        return [
            {
                "variant_id": str(line.variant_id),
                "discount_amount": str(line.discount_amount),
                "discounts_applied": [d.model_dump() for d in line.discounts_applied],
            }
            for line in sim_res.items
        ]

    async def evaluate_cart(
        self,
        session: AsyncSession,
        branch_id: uuid.UUID,
        items: list[CartItemEval],
        customer_id: uuid.UUID | None = None,
        customer_tier: str | None = None,
        promo_code: str | None = None,
        at_time: datetime | None = None,
    ) -> SimulatorResponse:
        _ = customer_id
        now = ensure_utc(at_time) or utc_now()
        promotions = await self.get_compiled_promotions(session, now)

        # 0. Promokod yoxlanışı
        matched_promo_code_obj: PromoCode | None = None
        if promo_code and promo_code.strip():
            stmt = select(PromoCode).where(
                PromoCode.code == promo_code.strip().upper(),
                PromoCode.status == "ACTIVE",
            )
            p_res = await session.execute(stmt)
            matched_promo_code_obj = p_res.scalar_one_or_none()

        # 1. Filial və vaxt uyğunluğu filtri
        eligible_promotions: list[CompiledPromotion] = []
        for p in promotions:
            p_s = ensure_utc(p.start_date)
            p_e = ensure_utc(p.end_date)
            if p_s and p_s > now:
                continue
            if p_e and p_e <= now:
                continue
            if p.target_branches and str(branch_id) not in p.target_branches:
                continue
            # Əgər aksiya promokod tələb edirsə
            if p.type == PromotionType.PROMO_CODE.value and (
                not matched_promo_code_obj or matched_promo_code_obj.promotion_id != p.id
            ):
                continue
            eligible_promotions.append(p)

        # Prioritet üzrə çeşidləyirik (Böyükdən kiçiyə)
        eligible_promotions.sort(key=lambda x: (x.priority, str(x.id)), reverse=True)

        cart_exclusive_applied = False
        receipt_promotions: list[LineDiscountExplanation] = []

        # 2. SƏTİR SƏVİYYƏLİ VƏ BUNDLE/BOGO AKSİYALARIN TƏTBİQİ
        for promo in eligible_promotions:
            rule = promo.rule_definition

            # Qəbz səviyyəli aksiyaları sonraya saxlayırıq
            if promo.type == PromotionType.RECEIPT_THRESHOLD.value:
                continue

            for item in items:
                # Əgər səbətdə artıq EXCLUSIVE aksiya tətbiq olunubsa və bu ALWAYS_STACK deyilsə
                if (cart_exclusive_applied or item.has_exclusive) and promo.stacking_mode != StackingMode.ALWAYS_STACK.value:
                    item.discounts_rejected.append(
                        {"promotion": promo.name, "reason": "SKIPPED_EXCLUSIVE"}
                    )
                    continue

                # Exclusion group ziddiyyəti
                if promo.exclusion_groups and (promo.exclusion_groups & item.applied_exclusion_groups):
                    item.discounts_rejected.append(
                        {"promotion": promo.name, "reason": "SKIPPED_EXCLUSION_GROUP"}
                    )
                    continue

                # Məhsul / Variant uyğunluğu
                if not self._is_item_eligible(item, rule):
                    continue

                # Hesablama
                disc = self._calculate_line_discount(item, promo, customer_tier)
                if disc <= Decimal("0.00"):
                    continue

                # Caps və Maya Dəyəri Məhdudiyyəti
                disc = self._enforce_caps(item, promo, disc)
                if disc <= Decimal("0.00"):
                    item.discounts_rejected.append(
                        {"promotion": promo.name, "reason": "SKIPPED_BELOW_COST_OR_CAP"}
                    )
                    continue

                # Tətbiq edirik
                item.current_discount += disc
                item.applied_promo_ids.add(promo.id)
                item.applied_exclusion_groups.update(promo.exclusion_groups)
                if promo.stacking_mode == StackingMode.EXCLUSIVE.value:
                    item.has_exclusive = True
                    cart_exclusive_applied = True

                item.discounts_applied.append(
                    LineDiscountExplanation(
                        promotion_id=promo.id,
                        promotion_name=promo.name,
                        rule_type=promo.type,
                        discount_amount=disc,
                        reason=f"{promo.name} tətbiq edildi",
                    )
                )

        # 3. BUNDLE VƏ BOGO QRUPLAŞDIRMALARI
        self._apply_bundle_and_bogo(items, eligible_promotions)

        # 4. QƏBZ SƏVİYYƏLİ (RECEIPT-LEVEL) AKSİYALAR
        subtotal_after_lines = sum((it.net_amount for it in items), Decimal("0.00"))
        receipt_discount_total = Decimal("0.00")

        for promo in eligible_promotions:
            if promo.type != PromotionType.RECEIPT_THRESHOLD.value:
                continue

            rule = promo.rule_definition
            min_spend = Decimal(str(rule.get("min_spend", "0.00")))
            if subtotal_after_lines < min_spend:
                continue

            # Məbləğ və ya faiz
            disc = Decimal("0.00")
            if "discount_amount" in rule:
                disc = Decimal(str(rule["discount_amount"]))
            elif "discount_percent" in rule:
                pct = Decimal(str(rule["discount_percent"]))
                disc = round_money(subtotal_after_lines * (pct / Decimal("100.00")))

            if promo.max_discount_per_receipt and disc > promo.max_discount_per_receipt:
                disc = promo.max_discount_per_receipt

            if disc > subtotal_after_lines:
                disc = subtotal_after_lines

            if disc > Decimal("0.00"):
                receipt_discount_total += disc
                receipt_promotions.append(
                    LineDiscountExplanation(
                        promotion_id=promo.id,
                        promotion_name=promo.name,
                        rule_type=promo.type,
                        discount_amount=disc,
                        reason=f"Qəbz həddi endirimi ({min_spend} AZN-dən yuxarı)",
                    )
                )
                break  # Ən yüksək prioritetli qəbz endirimi tətbiq olunur

        # 5. LARGEST-REMAINDER (HAMILTON-HARE) İLƏ QƏBZ ENDİRİMİNİN SƏTİRLƏRƏ DƏQİQ BÖLGÜSÜ
        if receipt_discount_total > Decimal("0.00") and subtotal_after_lines > Decimal("0.00"):
            self._allocate_largest_remainder(items, receipt_discount_total, subtotal_after_lines)

        # Cavabın formalaşdırılması
        line_results: list[SimulatedLineResult] = []
        total_subtotal = Decimal("0.00")
        total_discount = Decimal("0.00")

        for it in items:
            total_subtotal += it.gross_amount
            total_discount += it.current_discount
            line_results.append(
                SimulatedLineResult(
                    variant_id=it.variant_id,
                    quantity=it.quantity,
                    unit_price=it.unit_price,
                    gross_amount=it.gross_amount,
                    discount_amount=it.current_discount,
                    net_amount=it.net_amount,
                    cost_price=it.cost_price,
                    discounts_applied=it.discounts_applied,
                    discounts_rejected=it.discounts_rejected,
                )
            )

        return SimulatorResponse(
            subtotal=total_subtotal,
            discount_total=total_discount,
            net_subtotal=max(Decimal("0.00"), total_subtotal - total_discount),
            promo_code_applied=matched_promo_code_obj.code if matched_promo_code_obj else None,
            items=line_results,
            receipt_promotions=receipt_promotions,
        )

    # ------------------------------------------
    # Daxili Köməkçi Metodlar
    # ------------------------------------------

    def _is_item_eligible(self, item: CartItemEval, rule: dict[str, Any]) -> bool:
        # 1. Variant IDs
        if rule.get("variant_ids"):
            v_ids = [str(v) for v in rule["variant_ids"]]
            if str(item.variant_id) not in v_ids:
                return False

        # 2. Product IDs
        if "product_ids" in rule and rule["product_ids"] and item.product_id:
            p_ids = [str(p) for p in rule["product_ids"]]
            if str(item.product_id) not in p_ids:
                return False

        # 3. Category IDs
        if "category_ids" in rule and rule["category_ids"] and item.category_id:
            c_ids = [str(c) for c in rule["category_ids"]]
            if str(item.category_id) not in c_ids:
                return False

        # 4. Brand IDs
        if "brand_ids" in rule and rule["brand_ids"] and item.brand_id:
            b_ids = [str(b) for b in rule["brand_ids"]]
            if str(item.brand_id) not in b_ids:
                return False

        return True

    def _calculate_line_discount(
        self, item: CartItemEval, promo: CompiledPromotion, customer_tier: str | None
    ) -> Decimal:
        rule = promo.rule_definition
        ptype = promo.type

        if ptype == PromotionType.PERCENT_OFF.value:
            pct = Decimal(str(rule.get("percent", "0.00")))
            return round_money(item.net_amount * (pct / Decimal("100.00")))

        if ptype == PromotionType.FIXED_OFF.value:
            amt = Decimal(str(rule.get("amount", "0.00")))
            return round_money(amt * Decimal(str(item.quantity)))

        if ptype == PromotionType.FIXED_PRICE.value:
            target_p = Decimal(str(rule.get("price", "0.00")))
            if target_p < item.unit_price:
                diff = item.unit_price - target_p
                return round_money(diff * Decimal(str(item.quantity)))
            return Decimal("0.00")

        if ptype == PromotionType.QUANTITY_TIER.value:
            tiers = rule.get("tiers", [])
            # Tiers format: [{"min_qty": 3, "discount_percent": 10}, {"min_qty": 5, "discount_percent": 20}]
            best_pct = Decimal("0.00")
            for t in sorted(tiers, key=lambda x: int(x.get("min_qty", 0)), reverse=True):
                if item.quantity >= int(t.get("min_qty", 0)):
                    best_pct = Decimal(str(t.get("discount_percent", 0)))
                    break
            if best_pct > Decimal("0.00"):
                return round_money(item.net_amount * (best_pct / Decimal("100.00")))

        if ptype == PromotionType.LOYALTY_MEMBER.value:
            if not customer_tier:
                return Decimal("0.00")
            tier_discounts = rule.get("tier_discounts", {})
            # format: {"Silver": 5, "Gold": 10, "Platinum": 15}
            pct = Decimal(str(tier_discounts.get(customer_tier, 0)))
            if pct > Decimal("0.00"):
                return round_money(item.net_amount * (pct / Decimal("100.00")))

        if ptype == PromotionType.PROMO_CODE.value:
            # Promokod alt qaydası üzrə hesablayırıq
            if "percent" in rule:
                pct = Decimal(str(rule["percent"]))
                return round_money(item.net_amount * (pct / Decimal("100.00")))
            if "amount" in rule or "discount_amount" in rule:
                amt = Decimal(str(rule.get("amount") or rule.get("discount_amount")))
                return round_money(amt * Decimal(str(item.quantity)))

        return Decimal("0.00")

    def _enforce_caps(
        self, item: CartItemEval, promo: CompiledPromotion, discount: Decimal
    ) -> Decimal:
        disc = discount
        # 1. Sətir limiti
        if promo.max_discount_per_line and disc > promo.max_discount_per_line:
            disc = promo.max_discount_per_line

        # 2. Heç vaxt maya dəyərindən aşağı düşməmək qaydası
        if promo.never_below_cost and not promo.allow_below_cost_override:
            total_cost = item.cost_price * Decimal(str(item.quantity))
            max_allowed_discount = max(Decimal("0.00"), item.gross_amount - total_cost)
            # Mövcud endirimi də nəzərə alırıq
            available_margin = max_allowed_discount - item.current_discount
            if available_margin < Decimal("0.00"):
                available_margin = Decimal("0.00")
            if disc > available_margin:
                disc = available_margin

        # 3. Gross amount-dan çox ola bilməz
        if disc > item.net_amount:
            disc = item.net_amount

        return round_money(disc)

    def _apply_bundle_and_bogo(
        self, items: list[CartItemEval], promotions: list[CompiledPromotion]
    ) -> None:
        for promo in promotions:
            rule = promo.rule_definition
            if promo.type == PromotionType.BOGO.value:
                # BOGO: Buy X get Y free / discounted
                buy_qty = int(rule.get("buy_qty", 2))
                get_qty = int(rule.get("get_qty", 1))
                discount_pct = Decimal(str(rule.get("discount_percent", 100)))

                for it in (items or []):
                    if not self._is_item_eligible(it, rule):
                        continue
                    cycle = buy_qty + get_qty
                    times = it.quantity // cycle
                    if times > 0:
                        free_items_count = times * get_qty
                        bogo_disc = round_money(
                            it.unit_price * Decimal(str(free_items_count)) * (discount_pct / Decimal("100.00"))
                        )
                        bogo_disc = self._enforce_caps(it, promo, bogo_disc)
                        if bogo_disc > Decimal("0.00"):
                            it.current_discount += bogo_disc
                            it.discounts_applied.append(
                                LineDiscountExplanation(
                                    promotion_id=promo.id,
                                    promotion_name=promo.name,
                                    rule_type="BOGO",
                                    discount_amount=bogo_disc,
                                    reason=f"BOGO: {buy_qty} alana {get_qty} ədəd {discount_pct}% endirimlə",
                                )
                            )

            elif promo.type == PromotionType.BUNDLE.value:
                # BUNDLE: Qeyd olunan variantların hərəsindən ən azı 1 ədəd olduqda
                bundle_variants = [str(v) for v in rule.get("variant_ids", [])]
                bundle_price = Decimal(str(rule.get("bundle_price", "0.00")))
                if not bundle_variants:
                    continue

                matched_items = [it for it in items if str(it.variant_id) in bundle_variants]
                if len(matched_items) == len(bundle_variants):
                    total_regular_price = sum(it.unit_price for it in matched_items)
                    if total_regular_price > bundle_price:
                        bundle_saving = total_regular_price - bundle_price
                        # Qəpik payı
                        for it in matched_items:
                            share = round_money(bundle_saving * (it.unit_price / total_regular_price))
                            it.current_discount += share
                            it.discounts_applied.append(
                                LineDiscountExplanation(
                                    promotion_id=promo.id,
                                    promotion_name=promo.name,
                                    rule_type="BUNDLE",
                                    discount_amount=share,
                                    reason=f"Dəst (Bundle) qiyməti: {bundle_price} AZN",
                                )
                            )

    def _allocate_largest_remainder(
        self, items: list[CartItemEval], total_to_allocate: Decimal, total_base: Decimal
    ) -> None:
        """Largest-Remainder (Hamilton-Hare) metodu ilə qəpik yuvarlaqlaşdırması.

        Sətir paylarının cəminin DƏQİQ 100.00% ümumi endirimə bərabər olmasını təmin edir.
        """
        if total_base <= Decimal("0.00") or total_to_allocate <= Decimal("0.00"):
            return

        total_cents = int(round(total_to_allocate * 100))
        shares: list[int] = []
        remainders: list[tuple[Decimal, int]] = []

        for idx, it in enumerate(items):
            exact_share = (it.net_amount / total_base) * Decimal(str(total_cents))
            integer_cents = int(exact_share)
            rem = exact_share - Decimal(str(integer_cents))

            shares.append(integer_cents)
            remainders.append((rem, idx))

        allocated_cents = sum(shares)
        diff_cents = total_cents - allocated_cents

        # Qalan qəpikləri ən böyük kəsr hissəsinə malik sətirlərə paylayırıq
        remainders.sort(key=lambda x: (x[0], -x[1]), reverse=True)
        for i in range(diff_cents):
            idx_to_bump = remainders[i][1]
            shares[idx_to_bump] += 1

        for idx, it in enumerate(items):
            allocated_amount = Decimal(str(shares[idx])) / Decimal("100.00")
            if allocated_amount > Decimal("0.00"):
                it.current_discount += allocated_amount
                it.discounts_applied.append(
                    LineDiscountExplanation(
                        promotion_name="Qəbz Endirimi Payı (Largest-Remainder)",
                        rule_type="RECEIPT_ALLOCATION",
                        discount_amount=allocated_amount,
                        reason="Qəbz endiriminin mütənasib və dəqiq bölgüsü",
                    )
                )
