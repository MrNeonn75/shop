"""Qaytarma və Mübadilə Qiymət / Məbləğ Kalkulyasiyası Xidməti (Returns Quote Service).

1. Orijinal satış sətirlərindən immutable qiymət və vergi dərəcəsi anlıq surəti (Snapshot).
2. Mütənasib endirim bölgüsü və qəpik itkisinin qarşısının alınması (Largest-remainder).
3. Aksiya pozulması (Promotion Invalidation) qaydalarının qiymətləndirilməsi.
4. Çeksiz qaytarmalarda ən aşağı qiymət prinsipi (Lowest of current/last known price).
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    NotFoundError,
    ValidationError,
)
from app.core.money import round_money
from app.modules.catalog.service import CatalogService
from app.modules.returns.repository import ReturnsRepository
from app.modules.returns.schemas import (
    ReturnQuoteLine,
    ReturnQuoteRequest,
    ReturnQuoteResponse,
)
from app.modules.sales.models import Sale, SaleLine
from app.modules.settings.service import SettingsService


class ReturnsQuoteService:
    """Server-authoritative qaytarma qiymət və qayda kalkulyasiyası."""

    def __init__(
        self,
        repository: ReturnsRepository | None = None,
        settings_service: SettingsService | None = None,
        catalog_service: CatalogService | None = None,
    ) -> None:
        self.repo = repository or ReturnsRepository()
        self.settings = settings_service or SettingsService()
        self.catalog = catalog_service or CatalogService()

    async def quote(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        request: ReturnQuoteRequest,
        actor: Any = None,
    ) -> ReturnQuoteResponse:
        """Qaytarma sorğusu üzrə server-tərəfli dəqiq kalkulyasiya və yoxlamalar aparır."""
        _ = (company_id, actor)
        if not request.items:
            raise ValidationError("Qaytarma üçün ən azı bir məhsul sətri daxil edilməlidir.")

        # 1. Tənzimləmələri oxuyuruq
        window_days = 14
        try:
            w_setting = await self.settings.get(
                key="returns.window_days", branch_id=request.branch_id
            )
            if w_setting and isinstance(w_setting.value, int | float):
                window_days = int(w_setting.value)
        except Exception:
            pass

        strict_promo_default = False
        try:
            sp_setting = await self.settings.get(
                key="returns.strict_promotion_invalidation", branch_id=request.branch_id
            )
            if sp_setting and isinstance(sp_setting.value, bool):
                strict_promo_default = sp_setting.value
        except Exception:
            pass

        strict_promo = (
            request.strict_promotion_invalidation
            if request.strict_promotion_invalidation is not None
            else strict_promo_default
        )

        # 2. Orijinal satışın oxunması və sətirlərin xəritələnməsi
        sale: Sale | None = None
        days_elapsed = 0
        window_valid = True
        sale_lines_by_id: dict[uuid.UUID, SaleLine] = {}

        if request.original_sale_id:
            sale = await self.repo.get_sale_by_id(session, request.original_sale_id)
            if not sale:
                raise NotFoundError(f"'{request.original_sale_id}' ID-li satış sənədi tapılmadı.")
            if sale.status == "CANCELLED":
                raise BusinessRuleViolationError(
                    code="SALE_CANCELLED",
                    message="Ləğv edilmiş satış sənədi üzrə qaytarma aparıla bilməz.",
                )

            # Vaxt həddi hesabatı
            now = utc_now().date()
            days_elapsed = (now - sale.business_date).days
            window_valid = days_elapsed <= window_days

            sale_lines_by_id = {line.id: line for line in sale.lines}

        # 3. Hər bir sətir üzrə say, qiymət və endirim kalkulyasiyası
        quote_lines: list[ReturnQuoteLine] = []
        total_subtotal = Decimal("0.00")
        total_discount_rev = Decimal("0.00")
        total_tax_rev = Decimal("0.00")
        total_refund = Decimal("0.00")
        total_cost = Decimal("0.00")
        total_lost_benefit = Decimal("0.00")

        for idx, item in enumerate(request.items, start=1):
            # Keyfiyyət / Təyinat statusunun müəyyənləşdirilməsi
            dest_status = "available"
            if item.condition == "DAMAGED":
                dest_status = "damaged"
            elif item.condition == "RESTRICTED":
                dest_status = "quarantine"

            if sale and item.original_sale_line_id:
                s_line = sale_lines_by_id.get(item.original_sale_line_id)
                if not s_line:
                    raise NotFoundError(
                        f"'{item.original_sale_line_id}' ID-li satış sətri orijinal sənəddə tapılmadı."
                    )
                if s_line.variant_id != item.variant_id:
                    raise ValidationError(
                        f"Sətirdəki məhsul variantı ({item.variant_id}) orijinal satış variantı ilə ({s_line.variant_id}) uyğun gəlmir."
                    )

                # Qaytarıla bilən say yoxlanışı (Oxuma məqsədli kilidsiz sayğac)
                state = await self.repo.get_or_create_return_state(session, s_line)
                returnable_qty = state.sold_qty - state.returned_qty - state.reserved_qty
                if item.quantity > returnable_qty:
                    raise BusinessRuleViolationError(
                        code="EXCEEDS_RETURNABLE_QUANTITY",
                        message=(
                            f"'{s_line.sku}' ({s_line.product_name}) üçün qaytarıla bilən say {returnable_qty} ədəddir. "
                            f"Sorğuda tələb olunan: {item.quantity} ədəd."
                        ),
                    )

                # Tarixi Qiymət İntellekti (Orijinal sənəd snapshotları)
                unit_price = s_line.unit_price
                cost_price = s_line.cost_price
                qty = item.quantity

                gross = round_money(unit_price * qty)

                # Mütənasib Faktiki Ödənilmiş Məbləğ:
                # Orijinalda s_line.quantity ədəd üçün s_line.total_amount ödənilmişdisə,
                # qty ədəd üçün ödənilən = qty * (s_line.total_amount / s_line.quantity)
                original_qty = Decimal(str(s_line.quantity))
                line_total_paid = s_line.total_amount
                unit_paid = line_total_paid / original_qty
                net_refund = round_money(unit_paid * Decimal(str(qty)))

                # Endirim fərqi
                line_disc = round_money(gross - net_refund)
                if line_disc < Decimal("0.00"):
                    line_disc = Decimal("0.00")

                # Vergi qaytarılışı
                tax_rate = s_line.tax_rate
                tax_rev = round_money(net_refund * (tax_rate / Decimal("100.00")))

                line_cost = round_money(cost_price * qty)

                # Aksiya pozulması (Promotion Invalidation) - Məsələn BOGO / Bundle
                lost_benefit = Decimal("0.00")
                if strict_promo and s_line.promotion_info:
                    # Əgər aksiya növü BOGO və ya BUNDLE idisə və qaytarma aksiyanı pozursa
                    promo_benefit = Decimal(
                        str(s_line.promotion_info.get("benefit_amount", "0.00"))
                    )
                    if promo_benefit > Decimal("0.00"):
                        lost_benefit = promo_benefit
                        if lost_benefit > net_refund:
                            lost_benefit = net_refund
                        net_refund = round_money(net_refund - lost_benefit)

                q_line = ReturnQuoteLine(
                    line_no=idx,
                    original_sale_line_id=s_line.id,
                    variant_id=s_line.variant_id,
                    sku=s_line.sku,
                    product_name=s_line.product_name,
                    quantity=qty,
                    unit_price=unit_price,
                    cost_price=cost_price,
                    gross_amount=gross,
                    discount_amount=line_disc,
                    tax_rate=tax_rate,
                    tax_amount=tax_rev,
                    refund_amount=net_refund,
                    lost_promotion_benefit=lost_benefit,
                    destination_status=dest_status,
                    notes=item.notes,
                )
                quote_lines.append(q_line)

                total_subtotal += gross
                total_discount_rev += line_disc
                total_tax_rev += tax_rev
                total_refund += net_refund
                total_cost += line_cost
                total_lost_benefit += lost_benefit

            else:
                # Çeksiz Qaytarma (Receipt-less Return)
                var = await self.repo.get_product_variant(session, item.variant_id)
                if not var:
                    raise NotFoundError(f"'{item.variant_id}' ID-li məhsul variantı tapılmadı.")

                # Siyasət: Cari qiymət ilə son məlum qiymətin ən aşağısı (Lowest of current/last)
                current_price = var.price_override or Decimal("0.00")
                lowest_price = current_price
                cost_price = Decimal("0.0000")

                qty = item.quantity
                gross = round_money(lowest_price * qty)
                net_refund = gross
                tax_rate = Decimal("0.00")
                tax_rev = Decimal("0.00")
                line_cost = Decimal("0.00")

                p_name = var.product.name if var.product else var.sku
                q_line = ReturnQuoteLine(
                    line_no=idx,
                    original_sale_line_id=None,
                    variant_id=var.id,
                    sku=var.sku,
                    product_name=p_name,
                    quantity=qty,
                    unit_price=lowest_price,
                    cost_price=cost_price,
                    gross_amount=gross,
                    discount_amount=Decimal("0.00"),
                    tax_rate=tax_rate,
                    tax_amount=tax_rev,
                    refund_amount=net_refund,
                    lost_promotion_benefit=Decimal("0.00"),
                    destination_status=dest_status,
                    notes=item.notes,
                )
                quote_lines.append(q_line)

                total_subtotal += gross
                total_refund += net_refund
                total_cost += line_cost

        # 4. Təsdiq tələb edilib-edilməməsinin müəyyənləşdirilməsi
        requires_approval = False
        approval_reasons: list[str] = []

        if not window_valid:
            requires_approval = True
            approval_reasons.append(
                f"Qaytarma vaxt həddi ({window_days} gün) aşılıb ({days_elapsed} gün)."
            )

        if not sale:
            requires_approval = True
            approval_reasons.append("Çeksiz (qəbzsiz) qaytarma əməliyyatıdır.")

        return ReturnQuoteResponse(
            original_sale_id=request.original_sale_id,
            return_type=request.return_type,
            subtotal=total_subtotal,
            discount_reversal_total=total_discount_rev,
            tax_reversal_total=total_tax_rev,
            refund_total=total_refund,
            cost_total=total_cost,
            currency="AZN",
            items=quote_lines,
            promotion_invalidation_applied=total_lost_benefit > Decimal("0.00"),
            lost_promotion_benefit_total=total_lost_benefit,
            window_valid=window_valid,
            window_days_elapsed=days_elapsed,
            requires_manager_approval=requires_approval,
            approval_reason="; ".join(approval_reasons) if approval_reasons else None,
        )
