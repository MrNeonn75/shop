"""İnventar Maya Dəyəri və Qiymətləndirmə Strategiyaları (Costing Strategies).

Sistem hazırda Orta Çəkili Maya Dəyəri (Weighted-Average Cost) strategiyasını
icra edir və gələcəkdə FIFO / LIFO dəstəyi üçün `CostingStrategy` protokolu üzərindən
abstraksiya təmin edir.
"""

from __future__ import annotations

import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.modules.inventory.models import InventoryCostState


class CostingStrategy(Protocol):
    """Maya dəyərinin hesablanması və qeydiyyatı üçün protokol."""

    async def apply_inbound_cost(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        variant_id: uuid.UUID,
        quantity: int,
        unit_cost: Decimal,
        warehouse_id: uuid.UUID | None = None,
    ) -> Decimal:
        """Mədaxil zamanı maya dəyərini yeniləyir və yeni vahid maya dəyərini qaytarır."""
        ...

    async def get_outbound_unit_cost(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        variant_id: uuid.UUID,
        quantity: int,
        warehouse_id: uuid.UUID | None = None,
    ) -> Decimal:
        """Məxaric (satış, transfer, itki) zamanı istifadə olunacaq vahid maya dəyərini qaytarır (COGS snapshot)."""
        ...


class WeightedAverageCostingStrategy:
    """Orta Çəkili Maya Dəyəri (Weighted-Average Cost) strategiyası.

    Düstur:
    new_avg = (old_quantity * old_unit_cost + inbound_quantity * inbound_unit_cost) / (old_quantity + inbound_quantity)
    """

    async def apply_inbound_cost(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        variant_id: uuid.UUID,
        quantity: int,
        unit_cost: Decimal,
        warehouse_id: uuid.UUID | None = None,
    ) -> Decimal:
        if quantity <= 0:
            return unit_cost

        # Mövcud maya vəziyyətini tapırıq
        stmt = (
            select(InventoryCostState)
            .where(
                InventoryCostState.company_id == company_id,
                InventoryCostState.warehouse_id == warehouse_id,
                InventoryCostState.variant_id == variant_id,
            )
            .with_for_update()
        )
        res = await session.execute(stmt)
        cost_state = res.scalar_one_or_none()

        inbound_value = (Decimal(quantity) * unit_cost).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )

        if not cost_state:
            cost_state = InventoryCostState(
                id=generate_uuid7(),
                company_id=company_id,
                warehouse_id=warehouse_id,
                variant_id=variant_id,
                valuation_method="weighted_average",
                total_quantity=quantity,
                total_value=inbound_value,
                unit_cost=unit_cost.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
                last_updated_at=utc_now(),
            )
            session.add(cost_state)
            await session.flush()
            return cost_state.unit_cost

        # Mövcud qalıq mənfi və ya sıfırdırsa, yeni daxil olan qiymət baza götürülür
        if cost_state.total_quantity <= 0:
            new_qty = quantity
            new_val = inbound_value
            new_avg = unit_cost.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        else:
            new_qty = cost_state.total_quantity + quantity
            new_val = cost_state.total_value + inbound_value
            new_avg = (new_val / Decimal(new_qty)).quantize(
                Decimal("0.0001"), rounding=ROUND_HALF_UP
            )

        cost_state.total_quantity = new_qty
        cost_state.total_value = new_val
        cost_state.unit_cost = new_avg
        cost_state.last_updated_at = utc_now()
        await session.flush()
        return cost_state.unit_cost

    async def get_outbound_unit_cost(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        variant_id: uuid.UUID,
        quantity: int,
        warehouse_id: uuid.UUID | None = None,
    ) -> Decimal:
        stmt = select(InventoryCostState).where(
            InventoryCostState.company_id == company_id,
            InventoryCostState.warehouse_id == warehouse_id,
            InventoryCostState.variant_id == variant_id,
        )
        res = await session.execute(stmt)
        cost_state = res.scalar_one_or_none()

        # Əgər anbara xüsusi maya tapılmasa, şirkət üzrə ümumi mayaya baxırıq
        if (
            not cost_state or cost_state.unit_cost <= Decimal("0.0000")
        ) and warehouse_id is not None:
            stmt_global = select(InventoryCostState).where(
                InventoryCostState.company_id == company_id,
                InventoryCostState.warehouse_id.is_(None),
                InventoryCostState.variant_id == variant_id,
            )
            res_global = await session.execute(stmt_global)
            cost_state = res_global.scalar_one_or_none()

        unit_cost = cost_state.unit_cost if cost_state else Decimal("0.0000")

        # Əgər cost_state mövcuddursa, məxaric miqdarını çıxırıq
        if cost_state and quantity > 0:
            cost_state.total_quantity = max(0, cost_state.total_quantity - quantity)
            deduction = (Decimal(quantity) * unit_cost).quantize(
                Decimal("0.0001"), rounding=ROUND_HALF_UP
            )
            cost_state.total_value = max(Decimal("0.0000"), cost_state.total_value - deduction)
            cost_state.last_updated_at = utc_now()
            await session.flush()

        return unit_cost
