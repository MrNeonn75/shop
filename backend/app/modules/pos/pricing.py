"""POS Qiymət və Endirim Hesablama Mühərriki (Pricing & Promotion Service).

Server-authoritative qiymət kalkulyasiyası:
1. Kataloqdan filial üzrə qüvvədə olan baza qiymətin (price_at) oxunması.
2. Kampaniyalar və promosiyalar mühərriki (Promotions Engine pluggable stub).
3. Fərdi və qəbz səviyyəli manual endirimlər (rol limitləri və menecer tokeni ilə).
4. Vergi təsnifatı (TaxClass və settings.tax_rates üzrə).
5. Qəpik dəqiqliyi ilə yuvarlaqlaşdırma (central round_money ROUND_HALF_UP).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utc_now
from app.core.errors import NotFoundError, ValidationError
from app.core.money import round_money
from app.modules.catalog.models import Product, ProductVariant
from app.modules.marketing.engine import PromotionEngineImpl
from app.modules.pos.policies import PosPolicy
from app.modules.pos.schemas import CartLineInput, QuoteLineBreakdown, QuoteResponse
from app.modules.settings.service import SettingsService


class PromotionEngine(Protocol):
    """Kampaniyalar və endirimlər mühərriki üçün inteqrasiya interfeysi."""

    async def evaluate_promotions(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        branch_id: uuid.UUID,
        customer_id: uuid.UUID | None,
        items: list[dict[str, Any]],
        at_time: datetime,
        promo_code: str | None = None,
        customer_tier: str | None = None,
    ) -> list[dict[str, Any]]: ...


class DefaultPromotionEngine:
    """Standart no-op aksiya mühərriki."""

    async def evaluate_promotions(
        self,
        _session: AsyncSession,
        _company_id: uuid.UUID,
        _branch_id: uuid.UUID,
        _customer_id: uuid.UUID | None,
        _items: list[dict[str, Any]],
        _at_time: datetime,
        promo_code: str | None = None,
        customer_tier: str | None = None,
    ) -> list[dict[str, Any]]:
        _ = (promo_code, customer_tier)
        return []


class PricingService:
    """Mərkəzi POS Qiymət və Kalkulyasiya Xidməti."""

    def __init__(
        self,
        promotion_engine: PromotionEngine | None = None,
        settings_service: SettingsService | None = None,
    ) -> None:
        self.promo_engine = promotion_engine or PromotionEngineImpl()
        self.settings_service = settings_service or SettingsService()

    async def quote(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        branch_id: uuid.UUID,
        items: list[CartLineInput],
        customer_id: uuid.UUID | None = None,
        at_time: datetime | None = None,
        receipt_discount_percent: Decimal | None = None,
        receipt_discount_amount: Decimal | None = None,
        manager_approval_token: str | None = None,
        actor: Any = None,
        promo_code: str | None = None,
    ) -> QuoteResponse:
        """Səbət üzrə server-tərəfli dəqiq və immutable qiymət kalkulyasiyası təqdim edir."""
        if not items:
            raise ValidationError("Kalkulyasiya üçün ən azı bir məhsul variantı daxil edilməlidir.")

        now = at_time or utc_now()

        # 1. Tənzimləmələrdən endirim limitlərini və vergi dərəcələrini oxuyuruq
        discount_limits: dict[str, float] = {
            "cashier": 5.0,
            "branch_manager": 20.0,
            "general_manager": 50.0,
            "system_admin": 100.0,
        }
        tax_rates_list: list[dict[str, Any]] = []

        try:
            dl_setting = await self.settings_service.get(
                key="discount_limits", branch_id=branch_id, session=session
            )
            if dl_setting and isinstance(dl_setting.value, dict):
                discount_limits = dl_setting.value
        except Exception:
            pass

        try:
            tr_setting = await self.settings_service.get(
                key="tax_rates", branch_id=branch_id, session=session
            )
            if tr_setting and isinstance(tr_setting.value, list):
                tax_rates_list = tr_setting.value
        except Exception:
            pass

        # 2. Bütün variantları və onlara bağlı məhsul/vergi siniflərini bazadan oxuyuruq
        variant_ids = [item.variant_id for item in items]
        stmt = (
            select(ProductVariant)
            .options(selectinload(ProductVariant.product).selectinload(Product.tax_class))
            .where(ProductVariant.id.in_(variant_ids))
        )
        res = await session.execute(stmt)
        variants_by_id = {v.id: v for v in res.scalars().all()}

        # Aksiya mühərrikini çağırırıq
        promo_inputs = [
            {
                "variant_id": it.variant_id,
                "quantity": it.quantity,
                "unit_price": variants_by_id[it.variant_id].price_override or Decimal("0.00"),
                "cost_price": variants_by_id[it.variant_id].cost_price or Decimal("0.00"),
                "product_id": variants_by_id[it.variant_id].product_id,
                "category_id": getattr(variants_by_id[it.variant_id].product, "category_id", None)
                if variants_by_id[it.variant_id].product
                else None,
                "brand_id": getattr(variants_by_id[it.variant_id].product, "brand_id", None)
                if variants_by_id[it.variant_id].product
                else None,
            }
            for it in items
            if it.variant_id in variants_by_id
        ]
        _promo_discounts = await self.promo_engine.evaluate_promotions(
            session=session,
            company_id=company_id,
            branch_id=branch_id,
            customer_id=customer_id,
            items=promo_inputs,
            at_time=now,
            promo_code=promo_code,
        )
        promo_by_var = {str(p["variant_id"]): p for p in _promo_discounts}

        # 3. Hər bir sətir üçün baza qiyməti, kampaniyanı və manual endirimləri hesablayırıq
        pre_lines: list[dict[str, Any]] = []
        raw_subtotal = Decimal("0.00")

        for item in items:
            var = variants_by_id.get(item.variant_id)
            if not var:
                raise NotFoundError(f"'{item.variant_id}' ID-li məhsul variantı tapılmadı.")
            if var.status != "active":
                raise ValidationError(
                    f"'{var.sku}' SKU-lu məhsul aktiv satışda deyil (Status: {var.status})."
                )

            # Baza vahid qiymət: price_override və ya 0.00
            unit_price = var.price_override or Decimal("0.00")
            qty = item.quantity
            gross = round_money(unit_price * qty)
            raw_subtotal += gross

            # Sətir səviyyəsində endirimlər
            line_disc = Decimal("0.00")
            line_disc_rate = Decimal("0.00")
            discount_sources: list[dict[str, Any]] = []

            # 1. Aksiya və kampaniya endirimi
            p_disc_item = promo_by_var.get(str(item.variant_id))
            if p_disc_item:
                p_amt = Decimal(str(p_disc_item.get("discount_amount", "0.00")))
                if p_amt > Decimal("0.00"):
                    line_disc += p_amt
                    for da in p_disc_item.get("discounts_applied", []):
                        discount_sources.append(
                            {
                                "type": "PROMOTION",
                                "promotion_name": da.get("promotion_name", "Aksiya"),
                                "amount": str(da.get("discount_amount", "0.00")),
                            }
                        )

            # 2. Manual sətir endirimi (kassir/menecer)
            if item.discount_percent is not None and item.discount_percent > Decimal("0.00"):
                line_disc_rate = item.discount_percent
                m_disc = round_money(gross * (line_disc_rate / Decimal("100.00")))
                line_disc += m_disc
                discount_sources.append(
                    {
                        "type": "MANUAL_LINE_PERCENT",
                        "rate": str(line_disc_rate),
                        "amount": str(m_disc),
                    }
                )
            elif item.discount_amount is not None and item.discount_amount > Decimal("0.00"):
                m_disc = round_money(item.discount_amount)
                line_disc += m_disc
                if gross > Decimal("0.00"):
                    line_disc_rate = round_money((m_disc / gross) * Decimal("100.00"))
                discount_sources.append(
                    {
                        "type": "MANUAL_LINE_AMOUNT",
                        "rate": str(line_disc_rate),
                        "amount": str(m_disc),
                    }
                )

            if line_disc > gross:
                line_disc = gross

            # Sətir endirim limitini yoxlayırıq
            if line_disc_rate > Decimal("0.00") and actor:
                PosPolicy.check_discount_allowed(
                    actor=actor,
                    discount_percent=line_disc_rate,
                    discount_limits=discount_limits,
                    manager_token=manager_approval_token,
                    branch_id=branch_id,
                )
                PosPolicy.check_discount_allowed(
                    actor=actor,
                    discount_percent=line_disc_rate,
                    discount_limits=discount_limits,
                    manager_token=manager_approval_token,
                    branch_id=branch_id,
                )

            # Vergi dərəcəsi
            tax_rate = Decimal("0.00")
            tax_class_id = None
            if var.product and var.product.tax_class:
                tc = var.product.tax_class
                tax_class_id = tc.id
                # rate_ref settings.tax_rates-də axtarılır
                for tr in tax_rates_list:
                    if isinstance(tr, dict) and tr.get("code") == tc.rate_ref:
                        tax_rate = Decimal(str(tr.get("rate", 0.0)))
                        break

            pre_lines.append(
                {
                    "item": item,
                    "variant": var,
                    "product": var.product,
                    "unit_price": unit_price,
                    "quantity": qty,
                    "gross_amount": gross,
                    "line_discount": line_disc,
                    "line_disc_rate": line_disc_rate,
                    "discount_sources": discount_sources,
                    "tax_class_id": tax_class_id,
                    "tax_rate": tax_rate,
                }
            )

        # 4. Qəbz səviyyəli (Receipt-level) endirim hesablanması
        receipt_discount_total = Decimal("0.00")
        subtotal_after_line_discounts = sum(
            (p_line["gross_amount"] - p_line["line_discount"]) for p_line in pre_lines
        )

        if receipt_discount_percent is not None and receipt_discount_percent > Decimal("0.00"):
            if actor:
                PosPolicy.check_discount_allowed(
                    actor=actor,
                    discount_percent=receipt_discount_percent,
                    discount_limits=discount_limits,
                    manager_token=manager_approval_token,
                    branch_id=branch_id,
                )
            receipt_discount_total = round_money(
                subtotal_after_line_discounts * (receipt_discount_percent / Decimal("100.00"))
            )
        elif receipt_discount_amount is not None and receipt_discount_amount > Decimal("0.00"):
            receipt_discount_total = round_money(receipt_discount_amount)
            if subtotal_after_line_discounts > Decimal("0.00"):
                receipt_eff_percent = round_money(
                    (receipt_discount_total / subtotal_after_line_discounts) * Decimal("100.00")
                )
                if actor:
                    PosPolicy.check_discount_allowed(
                        actor=actor,
                        discount_percent=receipt_eff_percent,
                        discount_limits=discount_limits,
                        manager_token=manager_approval_token,
                        branch_id=branch_id,
                    )

        if receipt_discount_total > subtotal_after_line_discounts:
            receipt_discount_total = subtotal_after_line_discounts

        # Qəbz endirimini sətirlərə mütənasib bölüşdürürük
        allocated_receipt_disc = Decimal("0.00")
        line_breakdowns: list[QuoteLineBreakdown] = []

        total_net_sum = Decimal("0.00")
        total_tax_sum = Decimal("0.00")
        total_discount_sum = Decimal("0.00")

        num_lines = len(pre_lines)
        for idx, line in enumerate(pre_lines):
            base_line_net = line["gross_amount"] - line["line_discount"]

            # Qəbz endirimi payı
            if receipt_discount_total > Decimal("0.00") and subtotal_after_line_discounts > Decimal(
                "0.00"
            ):
                if idx == num_lines - 1:
                    # Sonuncu sətir qalıq qəpiyi kompensasiya edir
                    share = receipt_discount_total - allocated_receipt_disc
                else:
                    share = round_money(
                        receipt_discount_total * (base_line_net / subtotal_after_line_discounts)
                    )
                    allocated_receipt_disc += share
            else:
                share = Decimal("0.00")

            total_item_disc = line["line_discount"] + share
            if total_item_disc > line["gross_amount"]:
                total_item_disc = line["gross_amount"]

            if share > Decimal("0.00"):
                line["discount_sources"].append(
                    {
                        "type": "RECEIPT_PROPORTIONAL_SHARE",
                        "amount": str(share),
                    }
                )

            net_line_amount = line["gross_amount"] - total_item_disc
            tax_rate = line["tax_rate"]
            tax_amount = round_money(net_line_amount * (tax_rate / Decimal("100.00")))
            total_line_amount = round_money(net_line_amount + tax_amount)

            eff_rate = Decimal("0.00")
            if line["gross_amount"] > Decimal("0.00"):
                eff_rate = round_money((total_item_disc / line["gross_amount"]) * Decimal("100.00"))

            prod_name = line["product"].name if line["product"] else line["variant"].sku
            prod_id = line["product"].id if line["product"] else line["variant"].product_id

            bdown = QuoteLineBreakdown(
                variant_id=line["variant"].id,
                product_id=prod_id,
                sku=line["variant"].sku,
                product_name=prod_name,
                quantity=line["quantity"],
                unit_price=line["unit_price"],
                gross_amount=line["gross_amount"],
                discount_amount=total_item_disc,
                discount_rate=eff_rate,
                discount_sources=line["discount_sources"],
                net_amount=net_line_amount,
                tax_class_id=line["tax_class_id"],
                tax_rate=tax_rate,
                tax_amount=tax_amount,
                total_amount=total_line_amount,
            )
            line_breakdowns.append(bdown)

            total_net_sum += net_line_amount
            total_tax_sum += tax_amount
            total_discount_sum += total_item_disc

        grand_total = round_money(total_net_sum + total_tax_sum)

        return QuoteResponse(
            subtotal=raw_subtotal,
            discount_total=total_discount_sum,
            net_subtotal=total_net_sum,
            tax_total=total_tax_sum,
            grand_total=grand_total,
            currency="AZN",
            items=line_breakdowns,
            receipt_discount_amount=receipt_discount_total,
        )
