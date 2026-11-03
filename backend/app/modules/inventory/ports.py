"""İnventar Modulu Portları və Xarici Modul Adaptorları (Inventory Ports).

Bu fayl digər modulların (Kataloq, Kassa/POS, Transferlər) inventar moduluna
müraciət etməsi üçün port interfeyslərini və Kataloq modulu üçün real
stok adapterini təmin edir.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.modules.catalog.ports import InventoryQueryPort, StockAvailability, set_inventory_port
from app.modules.inventory.models import StockBalance, StockReservation, StockStatus


class RealInventoryCatalogAdapter(InventoryQueryPort):
    """Kataloq modulu üçün real verilənlər bazası əsaslı inventar sorğu portu."""

    async def get_variant_stock(
        self, variant_id: uuid.UUID, branch_id: uuid.UUID | None = None
    ) -> StockAvailability:
        _ = branch_id
        async with AsyncSessionLocal() as session:
            # Cari mövcud qalıq
            bal_stmt = select(func.coalesce(func.sum(StockBalance.on_hand), 0)).where(
                StockBalance.variant_id == variant_id,
                StockBalance.stock_status == StockStatus.AVAILABLE.value,
            )
            on_hand = (await session.execute(bal_stmt)).scalar_one()

            # Aktiv rezervlər
            res_stmt = select(func.coalesce(func.sum(StockReservation.quantity), 0)).where(
                StockReservation.variant_id == variant_id,
                StockReservation.status == "active",
            )
            reserved = (await session.execute(res_stmt)).scalar_one()

            available = max(0, on_hand - reserved)
            status = "out_of_stock"
            if available > 0:
                status = "in_stock"

            return StockAvailability(
                variant_id=variant_id,
                on_hand=int(on_hand),
                reserved=int(reserved),
                available=int(available),
                status=status,
            )

    async def get_variants_stock_bulk(
        self, variant_ids: list[uuid.UUID], branch_id: uuid.UUID | None = None
    ) -> dict[uuid.UUID, StockAvailability]:
        _ = branch_id
        if not variant_ids:
            return {}

        async with AsyncSessionLocal() as session:
            # Qalıqlar
            bal_stmt = (
                select(
                    StockBalance.variant_id,
                    func.coalesce(func.sum(StockBalance.on_hand), 0).label("on_hand"),
                )
                .where(
                    StockBalance.variant_id.in_(variant_ids),
                    StockBalance.stock_status == StockStatus.AVAILABLE.value,
                )
                .group_by(StockBalance.variant_id)
            )
            bal_rows = (await session.execute(bal_stmt)).all()
            on_hand_map = {row.variant_id: int(row.on_hand) for row in bal_rows}

            # Rezervlər
            res_stmt = (
                select(
                    StockReservation.variant_id,
                    func.coalesce(func.sum(StockReservation.quantity), 0).label("reserved"),
                )
                .where(
                    StockReservation.variant_id.in_(variant_ids),
                    StockReservation.status == "active",
                )
                .group_by(StockReservation.variant_id)
            )
            res_rows = (await session.execute(res_stmt)).all()
            reserved_map = {row.variant_id: int(row.reserved) for row in res_rows}

            results: dict[uuid.UUID, StockAvailability] = {}
            for vid in variant_ids:
                oh = on_hand_map.get(vid, 0)
                res = reserved_map.get(vid, 0)
                av = max(0, oh - res)
                st = "in_stock" if av > 0 else "out_of_stock"
                results[vid] = StockAvailability(
                    variant_id=vid,
                    on_hand=oh,
                    reserved=res,
                    available=av,
                    status=st,
                )
            return results


def register_inventory_catalog_port() -> None:
    """Kataloq modulu üçün real inventar adapterini aktivləşdirir."""
    set_inventory_port(RealInventoryCatalogAdapter())
