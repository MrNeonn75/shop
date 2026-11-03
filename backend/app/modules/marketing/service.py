"""Marketinq (Marketing) Mərkəzi Xidməti (Campaigns, Codes, Comm, Attribution)."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.modules.crm.models import ConsentPurpose
from app.modules.crm.repository import CrmRepository
from app.modules.marketing.engine import CartItemEval, PromotionEngineImpl
from app.modules.marketing.models import (
    Campaign,
    CampaignStatus,
    MessageSendRequest,
    MessageTemplate,
    PromoCode,
    PromoCodeRedemption,
    PromoCodeStatus,
    Promotion,
)
from app.modules.marketing.policies import MarketingPolicy
from app.modules.marketing.repository import MarketingRepository
from app.modules.marketing.schemas import (
    BulkPromoCodeGenerateRequest,
    CampaignCreate,
    MessageSendRequestCreate,
    MessageTemplateCreate,
    PromoCodeCreate,
    PromotionRuleCreate,
    SimulatorRequest,
    SimulatorResponse,
)
from app.shared.audit import record_audit_event

BAKU_TZ = ZoneInfo("Asia/Baku")

# İkibaşlı/qarışıq simvollar (0, O, 1, I, L) çıxarılmış təhlükəsiz əlifba
SAFE_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


class MarketingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MarketingRepository(session)
        self.crm_repo = CrmRepository(session)
        self.engine = PromotionEngineImpl()

    # ==========================================
    # 1. CAMPAIGNS & APPROVALS (SoD)
    # ==========================================

    async def create_campaign(
        self, payload: CampaignCreate, actor: Any
    ) -> Campaign:
        MarketingPolicy.check_can_create_campaign(actor)

        # Asia/Baku vaxtı ilə başlama və bitmə ardıcıllığının yoxlanışı
        if payload.start_date >= payload.end_date:
            raise ValidationError("Kampaniyanın başlama tarixi bitmə tarixindən əvvəl olmalıdır.")

        camp = Campaign(
            name=payload.name.strip(),
            objective=payload.objective,
            type=payload.type.value,
            status=CampaignStatus.DRAFT.value,
            start_date=payload.start_date,
            end_date=payload.end_date,
            budget=payload.budget,
            target_branches=[str(b) for b in payload.target_branches],
            target_segments=[str(s) for s in payload.target_segments],
            eligibility_criteria=payload.eligibility_criteria,
            created_by=getattr(actor, "id", uuid.uuid4()),
            version=1,
        )
        created = await self.repo.create_campaign(camp)

        await record_audit_event(
            session=self.session,
            action="marketing.campaign.create",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="campaign",
            resource_id=str(created.id),
            reason=f"Yeni kampaniya yaradıldı: {created.name}",
        )
        return created

    async def approve_campaign(
        self, campaign_id: uuid.UUID, actor: Any
    ) -> Campaign:
        camp = await self.repo.get_campaign(campaign_id)
        if not camp:
            raise NotFoundError(f"Kampaniya tapılmadı: {campaign_id}")

        # SoD Yoxlanışı (Yaradan təsdiq edə bilməz)
        MarketingPolicy.check_can_approve_campaign(actor, created_by=camp.created_by)

        now = utc_now()
        camp.approved_by = getattr(actor, "id", None)
        camp.approved_at = now

        # Tarixə əsasən status təyini
        c_s = ensure_utc(camp.start_date)
        c_e = ensure_utc(camp.end_date)
        now_utc = ensure_utc(now) or utc_now()
        if c_s and c_e and c_s <= now_utc < c_e:
            camp.status = CampaignStatus.ACTIVE.value
        elif c_s and now_utc < c_s:
            camp.status = CampaignStatus.SCHEDULED.value
        else:
            camp.status = CampaignStatus.ENDED.value

        camp.version += 1
        PromotionEngineImpl.invalidate_cache()
        await self.session.flush()

        await record_audit_event(
            session=self.session,
            action="marketing.campaign.approve",
            actor_id=getattr(actor, "id", None) if actor else None,
            resource_type="campaign",
            resource_id=str(camp.id),
            reason=f"Kampaniya təsdiq edildi: {camp.name} (Status: {camp.status})",
        )
        return camp

    async def pause_campaign(
        self, campaign_id: uuid.UUID, actor: Any = None
    ) -> Campaign:
        _ = actor
        camp = await self.repo.get_campaign(campaign_id)
        if not camp:
            raise NotFoundError(f"Kampaniya tapılmadı: {campaign_id}")

        camp.status = CampaignStatus.PAUSED.value
        camp.version += 1
        PromotionEngineImpl.invalidate_cache()
        await self.session.flush()
        return camp

    # ==========================================
    # 2. PROMOTIONS & CONFLICT DETECTOR
    # ==========================================

    async def create_promotion(
        self, payload: PromotionRuleCreate, actor: Any
    ) -> Promotion:
        MarketingPolicy.check_can_manage_promotions(actor)

        promo = Promotion(
            campaign_id=payload.campaign_id,
            name=payload.name.strip(),
            description=payload.description,
            type=payload.type.value,
            rule_definition=payload.rule_definition,
            priority=payload.priority,
            stacking_mode=payload.stacking_mode.value,
            exclusion_groups=payload.exclusion_groups,
            max_discount_per_line=payload.max_discount_per_line,
            max_discount_per_receipt=payload.max_discount_per_receipt,
            never_below_cost=payload.never_below_cost,
            allow_below_cost_override=payload.allow_below_cost_override,
            start_date=payload.start_date,
            end_date=payload.end_date,
            is_active=True,
            version=1,
        )
        created = await self.repo.create_promotion(promo)
        PromotionEngineImpl.invalidate_cache()
        return created

    async def detect_conflicts(self) -> list[dict[str, Any]]:
        """Aktiv aksiyalar arasında eyni variantlar üzrə kəsişmələri və həll proqnozunu aşkar edir."""
        promos = await self.repo.list_active_promotions()
        conflicts: list[dict[str, Any]] = []

        for i in range(len(promos)):
            for j in range(i + 1, len(promos)):
                p1 = promos[i]
                p2 = promos[j]

                v1 = set(p1.rule_definition.get("variant_ids", []))
                v2 = set(p2.rule_definition.get("variant_ids", []))
                overlap = v1 & v2

                if overlap:
                    resolution = (
                        f"Prioritetə əsasən '{p1.name}' ({p1.priority}) "
                        f"'{p2.name}' ({p2.priority}) qarşısında üstünlük qazanacaq."
                    )
                    conflicts.append(
                        {
                            "promotion_1": {"id": str(p1.id), "name": p1.name, "priority": p1.priority},
                            "promotion_2": {"id": str(p2.id), "name": p2.name, "priority": p2.priority},
                            "overlapping_variants_count": len(overlap),
                            "predicted_resolution": resolution,
                        }
                    )
        return conflicts

    # ==========================================
    # 3. PROMO CODES (ATOMIC & CONCURRENCY SAFE)
    # ==========================================

    def _generate_random_code(self, length: int = 8, prefix: str = "") -> str:
        token = "".join(secrets.choice(SAFE_CHARSET) for _ in range(length))
        return f"{prefix}{token}" if prefix else token

    async def create_promo_code(
        self, payload: PromoCodeCreate, actor: Any
    ) -> PromoCode:
        MarketingPolicy.check_can_manage_promocodes(actor)

        code_str = payload.code.strip().upper() if payload.code else self._generate_random_code()

        existing = await self.repo.get_promo_code_by_code(code_str)
        if existing:
            raise ConflictError(f"Bu promokod artıq mövcuddur: {code_str}")

        promo_code = PromoCode(
            code=code_str,
            campaign_id=payload.campaign_id,
            promotion_id=payload.promotion_id,
            status=PromoCodeStatus.ACTIVE.value,
            max_total_uses=payload.max_total_uses,
            max_uses_per_customer=payload.max_uses_per_customer,
            max_uses_per_day=payload.max_uses_per_day,
            current_uses=0,
            start_date=payload.start_date,
            end_date=payload.end_date,
            target_branches=[str(b) for b in payload.target_branches],
            target_segments=[str(s) for s in payload.target_segments],
            version=1,
        )
        return await self.repo.create_promo_code(promo_code)

    async def bulk_generate_promo_codes(
        self, payload: BulkPromoCodeGenerateRequest, actor: Any
    ) -> list[PromoCode]:
        MarketingPolicy.check_can_manage_promocodes(actor)
        created_codes: list[PromoCode] = []

        for _ in range(payload.count):
            code_str = self._generate_random_code(length=payload.length, prefix=payload.prefix)
            # Təkrarlanmama zəmanəti
            while await self.repo.get_promo_code_by_code(code_str):
                code_str = self._generate_random_code(length=payload.length, prefix=payload.prefix)

            pc = PromoCode(
                code=code_str,
                campaign_id=payload.campaign_id,
                promotion_id=payload.promotion_id,
                status=PromoCodeStatus.ACTIVE.value,
                max_total_uses=payload.max_total_uses,
                max_uses_per_customer=payload.max_uses_per_customer,
                current_uses=0,
                start_date=payload.start_date,
                end_date=payload.end_date,
                version=1,
            )
            self.session.add(pc)
            created_codes.append(pc)

        await self.session.flush()
        return created_codes

    async def redeem_promo_code(
        self,
        session: AsyncSession,
        code_str: str,
        sale_id: uuid.UUID,
        customer_id: uuid.UUID | None,
        discount_amount: Decimal,
        at_time: datetime | None = None,
    ) -> PromoCodeRedemption:
        """Satış tranzaksiyası daxilində icra olunan atomik və yarış-təhlükəsiz qeydiyyat."""
        repo = MarketingRepository(session)
        now = at_time or utc_now()

        # Row lock (SELECT ... FOR UPDATE) ilə promokod oxunur
        base_code = await repo.get_promo_code_by_code(code_str)
        if not base_code:
            raise NotFoundError(f"Promokod tapılmadı: {code_str}")

        pc = await repo.get_promo_code_by_id(base_code.id, for_update=True)
        if not pc or pc.status != PromoCodeStatus.ACTIVE.value:
            raise BusinessRuleViolationError(
                code="PROMO_CODE_NOT_ACTIVE",
                message=f"Promokod aktiv deyil və ya tükənib (Status: {pc.status if pc else 'None'}).",
            )

        # Tarix yoxlanışı
        pc_s = ensure_utc(pc.start_date)
        pc_e = ensure_utc(pc.end_date)
        now_utc = ensure_utc(now) or utc_now()
        if pc_s and pc_s > now_utc:
            raise BusinessRuleViolationError(code="PROMO_CODE_NOT_STARTED", message="Promokod hələ qüvvəyə minməyib.")
        if pc_e and pc_e <= now_utc:
            raise BusinessRuleViolationError(code="PROMO_CODE_EXPIRED", message="Promokodun vaxtı bitib.")

        # Ümumi istifadə limiti
        if pc.max_total_uses is not None and pc.current_uses >= pc.max_total_uses:
            pc.status = PromoCodeStatus.EXHAUSTED.value
            raise BusinessRuleViolationError(
                code="PROMO_CODE_LIMIT_REACHED",
                message=f"Promokodun ümumi istifadə limiti ({pc.max_total_uses}) tükənib.",
            )

        # Müştəri üzrə limit
        if customer_id and pc.max_uses_per_customer:
            cust_uses = await repo.get_redemption_count_for_customer(pc.id, customer_id)
            if cust_uses >= pc.max_uses_per_customer:
                raise BusinessRuleViolationError(
                    code="PROMO_CODE_CUSTOMER_LIMIT_REACHED",
                    message="Bu promokod üzrə şəxsi istifadə limitiniz tükənib.",
                )

        # Günlük limit
        if pc.max_uses_per_day:
            day_uses = await repo.get_redemption_count_for_day(pc.id, now.date())
            if day_uses >= pc.max_uses_per_day:
                raise BusinessRuleViolationError(
                    code="PROMO_CODE_DAILY_LIMIT_REACHED",
                    message="Bu promokod üzrə bugünkü limit tükənib.",
                )

        # Qeydiyyat
        red = PromoCodeRedemption(
            promo_code_id=pc.id,
            customer_id=customer_id,
            sale_id=sale_id,
            discount_amount=discount_amount,
            status="REDEEMED",
            redeemed_at=now,
        )
        created_red = await repo.record_redemption(red)

        pc.current_uses += 1
        if pc.max_total_uses is not None and pc.current_uses >= pc.max_total_uses:
            pc.status = PromoCodeStatus.EXHAUSTED.value

        pc.version += 1
        await session.flush()
        return created_red

    # ==========================================
    # 4. SIMULATION
    # ==========================================

    async def simulate(
        self, payload: SimulatorRequest, actor: Any = None
    ) -> SimulatorResponse:
        MarketingPolicy.check_can_simulate(actor)
        return await self.engine.evaluate_cart(
            session=self.session,
            branch_id=payload.branch_id,
            items=[
                CartItemEval(
                    variant_id=it.variant_id,
                    product_id=it.product_id,
                    category_id=it.category_id,
                    brand_id=it.brand_id,
                    unit_price=it.unit_price,
                    cost_price=it.cost_price,
                    quantity=it.quantity,
                    gross_amount=it.unit_price * Decimal(str(it.quantity)),
                )
                for it in payload.items
            ],
            customer_id=payload.customer_id,
            customer_tier=payload.customer_tier,
            promo_code=payload.promo_code,
            at_time=payload.at_time,
        )

    # ==========================================
    # 5. COMMUNICATIONS (SAFE BY DEFAULT)
    # ==========================================

    async def create_message_template(
        self, payload: MessageTemplateCreate, actor: Any
    ) -> MessageTemplate:
        MarketingPolicy.check_can_send_messages(actor)
        tmpl = MessageTemplate(
            channel=payload.channel.upper(),
            language=payload.language.upper(),
            name=payload.name.strip(),
            body_template=payload.body_template,
            is_active=True,
        )
        return await self.repo.create_message_template(tmpl)

    async def prepare_send_request(
        self, payload: MessageSendRequestCreate, actor: Any
    ) -> MessageSendRequest:
        """Kütləvi göndəriş üçün razılıq filtri və dry-run statistikası tərtib edir."""
        MarketingPolicy.check_can_send_messages(actor)
        tmpl = await self.repo.get_message_template(payload.template_id)
        if not tmpl or not tmpl.is_active:
            raise NotFoundError("Bildiriş şablonu tapılmadı və ya aktiv deyil.")

        # Seqment üzvləri və ya bütün aktiv müştərilər
        if payload.segment_id:
            customer_ids = await self.crm_repo.list_segment_customer_ids(payload.segment_id)
        else:
            all_custs = await self.crm_repo.list_customers(limit=10000)
            customer_ids = [c.id for c in all_custs]

        # Razılıq filtri (MƏCBURİDİR: Razılığı olmayanlar 100% kənarlaşdırılır)
        purpose = ConsentPurpose.MARKETING_SMS.value if tmpl.channel == "SMS" else ConsentPurpose.MARKETING_EMAIL.value
        consented_ids = await self.crm_repo.get_customers_with_consent(customer_ids, purpose)

        dry_run = {
            "total_target_count": len(customer_ids),
            "eligible_with_consent_count": len(consented_ids),
            "excluded_no_consent_count": len(customer_ids) - len(consented_ids),
            "channel": tmpl.channel,
            "provider_integration_status": "NOT_CONFIGURED",  # Standart təhlükəsiz vəziyyət
        }

        req = MessageSendRequest(
            template_id=tmpl.id,
            segment_id=payload.segment_id,
            channel=tmpl.channel,
            status="DRAFT",
            dry_run_summary=dry_run,
            created_by=getattr(actor, "id", uuid.uuid4()),
        )
        return await self.repo.create_send_request(req)

    # ==========================================
    # 6. ATTRIBUTION & METRICS
    # ==========================================

    async def get_campaign_metrics(
        self, campaign_id: uuid.UUID
    ) -> dict[str, Any]:
        """Kampaniyanın dövriyyə, marja və ROI göstəricilərini təqdim edir."""
        camp = await self.repo.get_campaign(campaign_id)
        if not camp:
            raise NotFoundError(f"Kampaniya tapılmadı: {campaign_id}")

        promo_ids = [p.id for p in camp.promotions]
        if not promo_ids:
            return {
                "campaign_id": str(camp.id),
                "sales_total": "0.00",
                "units_total": 0,
                "discount_cost": "0.00",
                "gross_margin": "0.00",
                "roi_status": "INSUFFICIENT_DATA",
                "reason": "Kampaniyaya bağlı aksiya qaydası tapılmadı.",
            }

        # Promokod istifadələri və ya xətt üzrə endirimlər
        stmt = (
            select(
                func.count(PromoCodeRedemption.id).label("redemptions"),
                func.coalesce(func.sum(PromoCodeRedemption.discount_amount), Decimal("0.00")).label("disc_total"),
            )
            .join(PromoCode, PromoCodeRedemption.promo_code_id == PromoCode.id)
            .where(PromoCode.campaign_id == campaign_id, PromoCodeRedemption.status == "REDEEMED")
        )
        res = await self.session.execute(stmt)
        row = res.one()

        spend = camp.budget or Decimal("0.00")
        roi_status = "CALCULATED" if spend > Decimal("0.00") else "INSUFFICIENT_DATA"

        return {
            "campaign_id": str(camp.id),
            "campaign_name": camp.name,
            "redemption_count": row.redemptions or 0,
            "discount_cost_total": str(row.disc_total),
            "campaign_budget": str(spend),
            "roi_status": roi_status,
            "reason": None if roi_status == "CALCULATED" else "Kampaniya büdcəsi müəyyən edilməyib",
        }
