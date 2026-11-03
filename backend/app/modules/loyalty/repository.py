"""Loyallıq Modulu Verilənlər Bazası Repozitorisi (Repository)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.modules.loyalty.models import (
    LoyaltyCustomerSummary,
    LoyaltyEntryType,
    LoyaltyLedgerEntry,
    LoyaltyProgram,
    LoyaltyReward,
    LoyaltyRewardRedemption,
    LoyaltyTierHistory,
)


class LoyaltyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ==========================================
    # 1. PROGRAMS
    # ==========================================

    async def get_active_program(
        self, at_time: datetime | None = None
    ) -> LoyaltyProgram | None:
        now = at_time or utc_now()
        stmt = (
            select(LoyaltyProgram)
            .where(
                LoyaltyProgram.is_active.is_(True),
                LoyaltyProgram.effective_from <= now,
                or_(
                    LoyaltyProgram.effective_to.is_(None),
                    LoyaltyProgram.effective_to > now,
                ),
            )
            .order_by(LoyaltyProgram.version.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_program(self, program_id: uuid.UUID) -> LoyaltyProgram | None:
        stmt = select(LoyaltyProgram).where(LoyaltyProgram.id == program_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_program(self, program: LoyaltyProgram) -> LoyaltyProgram:
        self.session.add(program)
        await self.session.flush()
        return program

    # ==========================================
    # 2. CUSTOMER SUMMARY & LEDGER (ROW-LOCKED)
    # ==========================================

    async def get_or_create_summary(
        self, customer_id: uuid.UUID, for_update: bool = False
    ) -> LoyaltyCustomerSummary:
        """Müştərinin loyallıq balansını və səviyyəsini gətirir və ya yaradır.

        for_update=True paralel kassa satışlarında double-spend-in qarşısını almaq üçün
        sətri DB səviyyəsində kilidləyir (FOR UPDATE).
        """
        stmt = select(LoyaltyCustomerSummary).where(
            LoyaltyCustomerSummary.customer_id == customer_id
        )
        if for_update:
            stmt = stmt.with_for_update()

        res = await self.session.execute(stmt)
        summary = res.scalar_one_or_none()
        if not summary:
            summary = LoyaltyCustomerSummary(
                customer_id=customer_id,
                current_tier="Bronze",
                available_points=0,
                lifetime_earned_points=0,
                lifetime_redeemed_points=0,
                version=1,
            )
            self.session.add(summary)
            await self.session.flush()
        return summary

    async def record_ledger_entry(
        self, entry: LoyaltyLedgerEntry
    ) -> LoyaltyLedgerEntry:
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def list_active_earn_lots(
        self, customer_id: uuid.UUID, at_time: datetime | None = None
    ) -> list[LoyaltyLedgerEntry]:
        """FIFO prinsipi ilə xərclənə bilən aktiv EARN partiyalarını gətirir."""
        now = at_time or utc_now()
        stmt = (
            select(LoyaltyLedgerEntry)
            .where(
                LoyaltyLedgerEntry.customer_id == customer_id,
                LoyaltyLedgerEntry.entry_type.in_([LoyaltyEntryType.EARN.value, LoyaltyEntryType.BONUS.value]),
                LoyaltyLedgerEntry.remaining_lot_points > 0,
                or_(
                    LoyaltyLedgerEntry.expires_at.is_(None),
                    LoyaltyLedgerEntry.expires_at > now,
                ),
            )
            .order_by(LoyaltyLedgerEntry.created_at.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_ledger_entries(
        self, customer_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> Sequence[LoyaltyLedgerEntry]:
        stmt = (
            select(LoyaltyLedgerEntry)
            .where(LoyaltyLedgerEntry.customer_id == customer_id)
            .order_by(LoyaltyLedgerEntry.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def record_tier_history(
        self, history: LoyaltyTierHistory
    ) -> LoyaltyTierHistory:
        self.session.add(history)
        await self.session.flush()
        return history

    # ==========================================
    # 3. REWARDS CATALOG
    # ==========================================

    async def create_reward(self, reward: LoyaltyReward) -> LoyaltyReward:
        self.session.add(reward)
        await self.session.flush()
        return reward

    async def get_reward(self, reward_id: uuid.UUID) -> LoyaltyReward | None:
        stmt = select(LoyaltyReward).where(LoyaltyReward.id == reward_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_rewards(self, active_only: bool = True) -> Sequence[LoyaltyReward]:
        stmt = select(LoyaltyReward)
        if active_only:
            stmt = stmt.where(LoyaltyReward.is_active.is_(True))
        stmt = stmt.order_by(LoyaltyReward.points_cost.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_redemption(
        self, redemption: LoyaltyRewardRedemption
    ) -> LoyaltyRewardRedemption:
        self.session.add(redemption)
        await self.session.flush()
        return redemption

    async def get_redemption_by_code(
        self, voucher_code: str
    ) -> LoyaltyRewardRedemption | None:
        stmt = select(LoyaltyRewardRedemption).where(
            LoyaltyRewardRedemption.voucher_code == voucher_code
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()
