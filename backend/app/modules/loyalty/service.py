"""Loyallıq (Loyalty) Xidməti (Service & Ledger Engine)."""

from __future__ import annotations

import secrets
import string
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import BusinessRuleViolationError, NotFoundError
from app.core.money import round_money
from app.modules.loyalty.models import (
    LoyaltyCustomerSummary,
    LoyaltyEntryType,
    LoyaltyLedgerEntry,
    LoyaltyProgram,
    LoyaltyReward,
    LoyaltyRewardRedemption,
    LoyaltyTierHistory,
)
from app.modules.loyalty.policies import LoyaltyPolicy
from app.modules.loyalty.repository import LoyaltyRepository
from app.modules.loyalty.schemas import (
    LoyaltyManualAdjustmentRequest,
    LoyaltyProgramCreate,
    LoyaltyRedeemPreviewResponse,
    LoyaltyRewardCreate,
)
from app.shared.audit import record_audit_event
from app.shared.events import DomainEvent
from app.shared.outbox import record_outbox_event


class LoyaltyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = LoyaltyRepository(session)

    # ==========================================
    # 1. PROGRAMS & TIERS
    # ==========================================

    async def create_program(
        self, payload: LoyaltyProgramCreate, actor: Any = None
    ) -> LoyaltyProgram:
        LoyaltyPolicy.check_can_manage_program(actor)
        now = utc_now()
        prog = LoyaltyProgram(
            name=payload.name.strip(),
            version=1,
            is_active=True,
            effective_from=payload.effective_from or now,
            effective_to=payload.effective_to,
            earn_rules=payload.earn_rules,
            redemption_rules=payload.redemption_rules,
            tier_rules=payload.tier_rules,
            expiry_rules=payload.expiry_rules,
        )
        return await self.repo.create_program(prog)

    async def get_or_create_default_program(self) -> LoyaltyProgram:
        prog = await self.repo.get_active_program()
        if not prog:
            prog = LoyaltyProgram(
                name="Standart Loyallıq Proqramı",
                version=1,
                is_active=True,
                effective_from=utc_now(),
                earn_rules={
                    "points_per_azn": 1,
                    "category_multipliers": {},
                    "exclude_discounted_items": False,
                },
                redemption_rules={
                    "point_value_azn": "0.01",
                    "min_points_to_redeem": 100,
                    "max_receipt_percent": 50,
                },
                tier_rules={
                    "rolling_window_days": 365,
                    "tiers": [
                        {"name": "Bronze", "threshold_spend": 0, "earn_multiplier": 1.0},
                        {"name": "Silver", "threshold_spend": 500, "earn_multiplier": 1.2},
                        {"name": "Gold", "threshold_spend": 2000, "earn_multiplier": 1.5},
                        {"name": "Platinum", "threshold_spend": 5000, "earn_multiplier": 2.0},
                    ],
                },
                expiry_rules={"lot_expiry_days": 365},
            )
            await self.repo.create_program(prog)
        return prog

    # ==========================================
    # 2. REDEEM PREVIEW & TRANSACTIONAL REDEEM
    # ==========================================

    async def preview_redeem(
        self,
        customer_id: uuid.UUID,
        points_to_redeem: int,
        receipt_subtotal: Decimal,
        _at_time: datetime | None = None,
    ) -> LoyaltyRedeemPreviewResponse:
        """Kassada xal xərcləməsinin qaydalara uyğunluğunu və endirim məbləğini yoxlayır."""
        if points_to_redeem <= 0:
            return LoyaltyRedeemPreviewResponse(
                allowed=False,
                points_to_redeem=0,
                discount_amount=Decimal("0.00"),
                available_points=0,
                reason="Xərclənəcək xal 0-dan böyük olmalıdır.",
            )

        prog = await self.get_or_create_default_program()
        summary = await self.repo.get_or_create_summary(customer_id)

        if summary.available_points < points_to_redeem:
            return LoyaltyRedeemPreviewResponse(
                allowed=False,
                points_to_redeem=points_to_redeem,
                discount_amount=Decimal("0.00"),
                available_points=summary.available_points,
                reason=f"Kifayət qədər xal yoxdur (Mövcud: {summary.available_points}, Tələb olunan: {points_to_redeem}).",
            )

        red_rules = prog.redemption_rules
        min_points = int(red_rules.get("min_points_to_redeem", 100))
        if points_to_redeem < min_points:
            return LoyaltyRedeemPreviewResponse(
                allowed=False,
                points_to_redeem=points_to_redeem,
                discount_amount=Decimal("0.00"),
                available_points=summary.available_points,
                reason=f"Minimum xərcləmə həddi {min_points} xaldır.",
            )

        pt_val = Decimal(str(red_rules.get("point_value_azn", "0.01")))
        disc_amount = round_money(Decimal(str(points_to_redeem)) * pt_val)

        # Maksimum qəbz faizi limiti (məs. 50%)
        max_pct = Decimal(str(red_rules.get("max_receipt_percent", 50)))
        max_allowed_disc = round_money(receipt_subtotal * (max_pct / Decimal("100.00")))

        if disc_amount > max_allowed_disc:
            return LoyaltyRedeemPreviewResponse(
                allowed=False,
                points_to_redeem=points_to_redeem,
                discount_amount=disc_amount,
                available_points=summary.available_points,
                reason=f"Xallarla ödəniş qəbzin maksimum {max_pct}%-ni ({max_allowed_disc} AZN) keçə bilməz.",
            )

        return LoyaltyRedeemPreviewResponse(
            allowed=True,
            points_to_redeem=points_to_redeem,
            discount_amount=disc_amount,
            available_points=summary.available_points,
        )

    async def redeem(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        points_to_redeem: int,
        sale_id: uuid.UUID,
        at_time: datetime | None = None,
    ) -> Decimal:
        """Kassa checkout tranzaksiyası DAXİLİNDƏ icra olunan atomik xərcləmə."""
        repo = LoyaltyRepository(session)
        now = at_time or utc_now()
        prog = await self.get_or_create_default_program()

        # Double-spend qorunması: FOR UPDATE ilə summary kilidlənir
        summary = await repo.get_or_create_summary(customer_id, for_update=True)
        if summary.available_points < points_to_redeem:
            raise BusinessRuleViolationError(
                code="INSUFFICIENT_LOYALTY_POINTS",
                message=f"Kifayət qədər loyallıq xalı yoxdur (Mövcud: {summary.available_points}).",
            )

        # FIFO lot deduct: Ən qədim qüvvədə olan partiyalardan ardıcıl çıxılır
        earn_lots = await repo.list_active_earn_lots(customer_id, at_time=now)
        remaining_to_deduct = points_to_redeem
        for lot in earn_lots:
            if remaining_to_deduct <= 0:
                break
            take = min(lot.remaining_lot_points, remaining_to_deduct)
            lot.remaining_lot_points -= take
            remaining_to_deduct -= take

        # Append-only jurnal qeydi
        entry = LoyaltyLedgerEntry(
            customer_id=customer_id,
            entry_type=LoyaltyEntryType.REDEEM.value,
            points=-points_to_redeem,
            source_type="SALE",
            source_id=sale_id,
            program_version=prog.version,
            created_at=now,
        )
        await repo.record_ledger_entry(entry)

        # Balans yeniləməsi
        summary.available_points -= points_to_redeem
        summary.lifetime_redeemed_points += points_to_redeem
        summary.version += 1
        summary.updated_at = now
        await session.flush()

        pt_val = Decimal(str(prog.redemption_rules.get("point_value_azn", "0.01")))
        return round_money(Decimal(str(points_to_redeem)) * pt_val)

    # ==========================================
    # 3. TRANSACTIONAL EARN & TIER ADVANCEMENT
    # ==========================================

    async def earn(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        sale_id: uuid.UUID,
        eligible_amount: Decimal,
        at_time: datetime | None = None,
    ) -> int:
        """Kassa checkout tranzaksiyası daxilində ödənilmiş yekun məbləğdən xal hesablayır."""
        repo = LoyaltyRepository(session)
        now = at_time or utc_now()
        prog = await self.get_or_create_default_program()

        summary = await repo.get_or_create_summary(customer_id, for_update=True)

        # Cari səviyyə üzrə multiplier tapılır
        tier_rules = prog.tier_rules.get("tiers", [])
        multiplier = 1.0
        for t in tier_rules:
            if t.get("name") == summary.current_tier:
                multiplier = float(t.get("earn_multiplier", 1.0))
                break

        pts_per_azn = float(prog.earn_rules.get("points_per_azn", 1))
        points_earned = int(float(eligible_amount) * pts_per_azn * multiplier)

        if points_earned <= 0:
            return 0

        # Partiyanın bitmə tarixi (FIFO lot expiry)
        lot_days = int(prog.expiry_rules.get("lot_expiry_days", 365))
        expires_at = now + timedelta(days=lot_days)

        # Append-only jurnal qeydi
        entry = LoyaltyLedgerEntry(
            customer_id=customer_id,
            entry_type=LoyaltyEntryType.EARN.value,
            points=points_earned,
            source_type="SALE",
            source_id=sale_id,
            program_version=prog.version,
            expires_at=expires_at,
            remaining_lot_points=points_earned,
            created_at=now,
        )
        await repo.record_ledger_entry(entry)

        summary.available_points += points_earned
        summary.lifetime_earned_points += points_earned
        summary.rolling_spend += eligible_amount
        summary.version += 1
        summary.updated_at = now

        # Səviyyənin (Tier) yenilənməsi yoxlanılır
        await self._check_and_update_tier(session, repo, summary, prog, now)
        await session.flush()
        return points_earned

    async def _check_and_update_tier(
        self,
        session: AsyncSession,
        repo: LoyaltyRepository,
        summary: LoyaltyCustomerSummary,
        prog: LoyaltyProgram,
        now: datetime,
    ) -> None:
        tiers = prog.tier_rules.get("tiers", [])
        # Thresholds görə azalan sırada çeşidləyirik
        sorted_tiers = sorted(tiers, key=lambda x: Decimal(str(x.get("threshold_spend", 0))), reverse=True)

        target_tier = "Bronze"
        for t in sorted_tiers:
            th = Decimal(str(t.get("threshold_spend", 0)))
            if summary.rolling_spend >= th:
                target_tier = str(t.get("name"))
                break

        if target_tier != summary.current_tier:
            old_tier = summary.current_tier
            summary.current_tier = target_tier
            window_days = int(prog.tier_rules.get("rolling_window_days", 365))
            summary.tier_valid_until = now + timedelta(days=window_days)

            th_rec = LoyaltyTierHistory(
                customer_id=summary.customer_id,
                old_tier=old_tier,
                new_tier=target_tier,
                reason=f"Dövriyyə {summary.rolling_spend} AZN-ə çatdı",
                created_at=now,
            )
            await repo.record_tier_history(th_rec)

            evt = DomainEvent(
                event_type="loyalty.tier_changed",
                aggregate_type="customer",
                aggregate_id=str(summary.customer_id),
                payload={
                    "customer_id": str(summary.customer_id),
                    "old_tier": old_tier,
                    "new_tier": target_tier,
                    "rolling_spend": str(summary.rolling_spend),
                },
                occurred_at=now,
            )
            await record_outbox_event(session, evt)

    # ==========================================
    # 4. REVERSAL FOR RETURNS
    # ==========================================

    async def reverse_for_return(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        return_id: uuid.UUID,
        return_amount: Decimal,
        at_time: datetime | None = None,
    ) -> int:
        """Qaytarma zamanı qazanılmış xalların proporsional ləğvi."""
        repo = LoyaltyRepository(session)
        now = at_time or utc_now()
        prog = await self.get_or_create_default_program()

        summary = await repo.get_or_create_summary(customer_id, for_update=True)
        pts_per_azn = float(prog.earn_rules.get("points_per_azn", 1))
        points_to_reverse = int(float(return_amount) * pts_per_azn)

        if points_to_reverse <= 0:
            return 0

        # Balansın mənfiyə düşməməsi qaydası
        actual_deduction = min(summary.available_points, points_to_reverse)

        entry = LoyaltyLedgerEntry(
            customer_id=customer_id,
            entry_type=LoyaltyEntryType.REVERSE_EARN.value,
            points=-actual_deduction,
            source_type="RETURN",
            source_id=return_id,
            program_version=prog.version,
            created_at=now,
        )
        await repo.record_ledger_entry(entry)

        summary.available_points -= actual_deduction
        summary.rolling_spend = max(Decimal("0.00"), summary.rolling_spend - return_amount)
        summary.version += 1
        summary.updated_at = now
        await session.flush()
        return actual_deduction

    # ==========================================
    # 5. MANUAL ADJUSTMENT & REWARDS
    # ==========================================

    async def adjust_points(
        self, payload: LoyaltyManualAdjustmentRequest, actor: Any
    ) -> LoyaltyLedgerEntry:
        LoyaltyPolicy.check_can_adjust_points(actor)
        summary = await self.repo.get_or_create_summary(payload.customer_id, for_update=True)

        if payload.points < 0 and summary.available_points < abs(payload.points):
            raise BusinessRuleViolationError(
                code="INSUFFICIENT_POINTS_FOR_DEDUCTION",
                message="Müştərinin balansı tələb olunan xalın tutulması üçün kifayət deyil.",
            )

        prog = await self.get_or_create_default_program()
        now = utc_now()

        entry = LoyaltyLedgerEntry(
            customer_id=payload.customer_id,
            entry_type=LoyaltyEntryType.ADJUST.value,
            points=payload.points,
            source_type="MANUAL_ADJUSTMENT",
            program_version=prog.version,
            created_at=now,
        )
        created_entry = await self.repo.record_ledger_entry(entry)

        summary.available_points += payload.points
        if payload.points > 0:
            summary.lifetime_earned_points += payload.points
        summary.version += 1
        summary.updated_at = now
        await self.session.flush()

        await record_audit_event(
            session=self.session,
            action="loyalty.points.adjust",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="customer",
            resource_id=str(payload.customer_id),
            reason=f"Loyallıq xalı manual tənzimləndi: {payload.points} xal. Səbəb: {payload.reason}",
        )
        return created_entry

    async def create_reward(self, payload: LoyaltyRewardCreate, actor: Any) -> LoyaltyReward:
        LoyaltyPolicy.check_can_manage_rewards(actor)
        rew = LoyaltyReward(
            name=payload.name.strip(),
            description=payload.description,
            points_cost=payload.points_cost,
            reward_type=payload.reward_type.value,
            benefit_value=payload.benefit_value,
            stock_limit=payload.stock_limit,
            valid_days=payload.valid_days,
            is_active=True,
        )
        return await self.repo.create_reward(rew)

    async def redeem_reward(
        self, customer_id: uuid.UUID, reward_id: uuid.UUID, actor: Any = None
    ) -> LoyaltyRewardRedemption:
        """Xalları mükafat vauçerinə dəyişdirir."""
        _ = actor
        rew = await self.repo.get_reward(reward_id)
        if not rew or not rew.is_active:
            raise NotFoundError("Mükafat tapılmadı və ya aktiv deyil.")

        if rew.stock_limit is not None and rew.redeemed_count >= rew.stock_limit:
            raise BusinessRuleViolationError(
                code="REWARD_OUT_OF_STOCK",
                message="Mükafatın mövcud stoku tükənib.",
            )

        now = utc_now()
        # Xalları çıxırıq
        await self.redeem(
            self.session,
            customer_id=customer_id,
            points_to_redeem=rew.points_cost,
            sale_id=uuid.uuid4(),
            at_time=now,
        )

        # Unikal vauçer kodu generasiyası
        charset = string.ascii_uppercase + string.digits
        token = "".join(secrets.choice(charset) for _ in range(8))
        voucher_code = f"RW-{token[:4]}-{token[4:]}"

        red = LoyaltyRewardRedemption(
            customer_id=customer_id,
            reward_id=rew.id,
            voucher_code=voucher_code,
            points_spent=rew.points_cost,
            status="ACTIVE",
            expires_at=now + timedelta(days=rew.valid_days),
            created_at=now,
        )
        created_red = await self.repo.create_redemption(red)
        rew.redeemed_count += 1
        await self.session.flush()
        return created_red

    # ==========================================
    # 6. EXPIRY JOB
    # ==========================================

    async def expire_lots(self, at_time: datetime | None = None) -> int:
        """Vaxtı bitmiş FIFO xal partiyalarını dondurur və balansı azaldır."""
        now = at_time or utc_now()
        stmt = select(LoyaltyLedgerEntry).where(
            LoyaltyLedgerEntry.entry_type.in_([LoyaltyEntryType.EARN.value, LoyaltyEntryType.BONUS.value]),
            LoyaltyLedgerEntry.remaining_lot_points > 0,
            LoyaltyLedgerEntry.expires_at <= now,
        )
        res = await self.session.execute(stmt)
        expired_lots = res.scalars().all()

        total_expired = 0
        for lot in expired_lots:
            pts = lot.remaining_lot_points
            lot.remaining_lot_points = 0

            exp_entry = LoyaltyLedgerEntry(
                customer_id=lot.customer_id,
                entry_type=LoyaltyEntryType.EXPIRE.value,
                points=-pts,
                source_type="EXPIRY",
                source_id=lot.id,
                created_at=now,
            )
            await self.repo.record_ledger_entry(exp_entry)

            summary = await self.repo.get_or_create_summary(lot.customer_id, for_update=True)
            summary.available_points = max(0, summary.available_points - pts)
            summary.version += 1
            summary.updated_at = now
            total_expired += pts

        await self.session.flush()
        return total_expired
