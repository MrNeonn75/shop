"""Marketinq Modulu Verilənlər Bazası Repozitorisi (Repository)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utc_now
from app.modules.marketing.models import (
    Campaign,
    CampaignStatus,
    MessageDeliveryLog,
    MessageSendRequest,
    MessageTemplate,
    PromoCode,
    PromoCodeRedemption,
    Promotion,
)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


class MarketingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ==========================================
    # 1. CAMPAIGNS
    # ==========================================

    async def create_campaign(self, campaign: Campaign) -> Campaign:
        self.session.add(campaign)
        await self.session.flush()
        return campaign

    async def get_campaign(self, campaign_id: uuid.UUID) -> Campaign | None:
        stmt = (
            select(Campaign)
            .options(selectinload(Campaign.promotions))
            .where(Campaign.id == campaign_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_campaigns(
        self, status_: str | None = None
    ) -> Sequence[Campaign]:
        stmt = select(Campaign)
        if status_:
            stmt = stmt.where(Campaign.status == status_)
        stmt = stmt.order_by(Campaign.created_at.desc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # ==========================================
    # 2. PROMOTIONS
    # ==========================================

    async def create_promotion(self, promotion: Promotion) -> Promotion:
        self.session.add(promotion)
        await self.session.flush()
        return promotion

    async def get_promotion(self, promo_id: uuid.UUID) -> Promotion | None:
        stmt = (
            select(Promotion)
            .options(selectinload(Promotion.campaign))
            .where(Promotion.id == promo_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_active_promotions(
        self, at_time: datetime | None = None, branch_id: uuid.UUID | None = None
    ) -> Sequence[Promotion]:
        """Aktiv kampaniyalara aid və ya müstəqil olan bütün qüvvədə olan aksiyaları gətirir."""
        now = at_time or utc_now()
        now_utc = ensure_utc(now) or utc_now()
        stmt = (
            select(Promotion)
            .options(selectinload(Promotion.campaign))
            .where(
                Promotion.is_active.is_(True),
                or_(Promotion.start_date.is_(None), Promotion.start_date <= now),
                or_(Promotion.end_date.is_(None), Promotion.end_date > now),
            )
            .order_by(Promotion.priority.desc(), Promotion.id.asc())
        )
        res = await self.session.execute(stmt)
        all_promos = res.scalars().all()

        # Kampaniyası olanların da statusunu və filial uyğunluğunu yoxlayırıq
        eligible: list[Promotion] = []
        for p in all_promos:
            if p.campaign:
                # Kampaniya vaxtı və statusu
                if p.campaign.status not in [CampaignStatus.ACTIVE.value, CampaignStatus.APPROVED.value, CampaignStatus.SCHEDULED.value]:
                    continue
                c_s = ensure_utc(p.campaign.start_date)
                c_e = ensure_utc(p.campaign.end_date)
                if (c_s and c_s > now_utc) or (c_e and c_e <= now_utc):
                    continue
                if branch_id and p.campaign.target_branches:
                    b_ids = [str(b) for b in p.campaign.target_branches]
                    if str(branch_id) not in b_ids:
                        continue
            eligible.append(p)
        return eligible

    # ==========================================
    # 3. PROMO CODES
    # ==========================================

    async def create_promo_code(self, code: PromoCode) -> PromoCode:
        self.session.add(code)
        await self.session.flush()
        return code

    async def get_promo_code_by_code(self, code: str) -> PromoCode | None:
        stmt = (
            select(PromoCode)
            .options(selectinload(PromoCode.promotion))
            .where(PromoCode.code == code.strip().upper())
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_promo_code_by_id(self, code_id: uuid.UUID, for_update: bool = False) -> PromoCode | None:
        stmt = (
            select(PromoCode)
            .options(selectinload(PromoCode.promotion))
            .where(PromoCode.id == code_id)
        )
        if for_update:
            stmt = stmt.with_for_update()
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def record_redemption(
        self, redemption: PromoCodeRedemption
    ) -> PromoCodeRedemption:
        self.session.add(redemption)
        await self.session.flush()
        return redemption

    async def get_redemption_count_for_customer(
        self, promo_code_id: uuid.UUID, customer_id: uuid.UUID
    ) -> int:
        stmt = select(func.count(PromoCodeRedemption.id)).where(
            PromoCodeRedemption.promo_code_id == promo_code_id,
            PromoCodeRedemption.customer_id == customer_id,
            PromoCodeRedemption.status == "REDEEMED",
        )
        res = await self.session.execute(stmt)
        return res.scalar_one() or 0

    async def get_redemption_count_for_day(
        self, promo_code_id: uuid.UUID, business_day: date
    ) -> int:
        stmt = select(func.count(PromoCodeRedemption.id)).where(
            PromoCodeRedemption.promo_code_id == promo_code_id,
            func.date(PromoCodeRedemption.redeemed_at) == business_day,
            PromoCodeRedemption.status == "REDEEMED",
        )
        res = await self.session.execute(stmt)
        return res.scalar_one() or 0

    # ==========================================
    # 4. COMMUNICATIONS
    # ==========================================

    async def create_message_template(self, tmpl: MessageTemplate) -> MessageTemplate:
        self.session.add(tmpl)
        await self.session.flush()
        return tmpl

    async def get_message_template(self, tmpl_id: uuid.UUID) -> MessageTemplate | None:
        stmt = select(MessageTemplate).where(MessageTemplate.id == tmpl_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_message_templates(self) -> Sequence[MessageTemplate]:
        stmt = select(MessageTemplate).order_by(MessageTemplate.name.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def create_send_request(self, req: MessageSendRequest) -> MessageSendRequest:
        self.session.add(req)
        await self.session.flush()
        return req

    async def get_send_request(self, req_id: uuid.UUID) -> MessageSendRequest | None:
        stmt = select(MessageSendRequest).where(MessageSendRequest.id == req_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def record_delivery_log(self, log: MessageDeliveryLog) -> MessageDeliveryLog:
        self.session.add(log)
        await self.session.flush()
        return log
