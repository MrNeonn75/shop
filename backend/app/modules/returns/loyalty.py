"""CRM və Loyallıq İnteqrasiyası Qatı (CRM Loyalty Stub Protocol)."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.returns.events import LoyaltyReversedEvent
from app.modules.sales.models import Sale
from app.shared.outbox import record_outbox_event


class CrmLoyaltyService(Protocol):
    """Müştəri loyallıq xallarının tərs hesablanması üçün xidmət interfeysi."""

    async def process_return_loyalty(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        customer_id: uuid.UUID | None,
        sale: Sale | None,
        return_id: uuid.UUID,
        refund_amount: Decimal,
        allow_negative: bool = True,
    ) -> tuple[int, int]:
        """Qaytarma zamanı qazanılmış xalların ləğvi və istifadə edilmiş xalların bərpası.

        Qaytarır: (points_reversed, points_restored)
        """
        ...


class DefaultCrmLoyaltyService:
    """Standart CRM və loyallıq xidməti stubu (B11 gələnə qədər aktivdir)."""

    async def process_return_loyalty(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        customer_id: uuid.UUID | None,
        sale: Sale | None,
        return_id: uuid.UUID,
        refund_amount: Decimal,
        allow_negative: bool = True,
    ) -> tuple[int, int]:
        _ = (company_id, allow_negative)
        if not customer_id or not sale or sale.grand_total <= Decimal("0.00"):
            return 0, 0

        # Mütənasib nisbət: Qaytarılan məbləğ / Satışın yekun məbləği
        ratio = refund_amount / sale.grand_total
        if ratio > Decimal("1.00"):
            ratio = Decimal("1.00")

        # 1. Satışda qazanılmış xallar (Hər 1 AZN xalis ödənişə 1 xal)
        earned_points_base = int(sale.grand_total)
        points_to_reverse = int(round(Decimal(str(earned_points_base)) * ratio))

        # 2. Satışda xərclənmiş (redeemed) loyallıq xalları
        redeemed_points_base = 0
        for p in getattr(sale, "payments", []):
            if p.tender_type == "loyalty_points":
                redeemed_points_base += int(p.amount)

        points_to_restore = int(round(Decimal(str(redeemed_points_base)) * ratio))

        # Hadisəni outbox-a yazırıq (CRM və Tier Recalculation üçün)
        if points_to_reverse > 0 or points_to_restore > 0:
            event = LoyaltyReversedEvent(
                customer_id=customer_id,
                sale_id=sale.id,
                return_id=return_id,
                points_reversed=points_to_reverse,
                points_restored=points_to_restore,
            )
            await record_outbox_event(session, event)

        return points_to_reverse, points_to_restore
