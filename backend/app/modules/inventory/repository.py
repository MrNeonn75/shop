"""İnventar Modulu Məlumat Bazası Əməliyyatları (Inventory Repository).

Stok jurnalı (stock_movements), qalıqlar (stock_balances - deterministik kilidlənmə ilə),
rezervasiyalar (stock_reservations), anbar sənədləri (stock_documents) və
fiziki sayım sessiyaları üçün repozitori.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.modules.catalog.models import Product, ProductVariant
from app.modules.inventory.models import (
    CountEntry,
    CountSession,
    InventoryCostState,
    StockBalance,
    StockDocument,
    StockMovement,
    StockReservation,
    StockStatus,
)
from app.modules.warehouses.models import Warehouse


class InventoryRepository:
    """İnventar verilənlər bazası əməliyyatları."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # --- 1. Deterministik Kilidləmə və Balans İdarəetməsi ---

    async def lock_and_get_balances(
        self,
        company_id: uuid.UUID,
        targets: list[tuple[uuid.UUID, uuid.UUID, str]],
    ) -> dict[tuple[uuid.UUID, uuid.UUID, str], StockBalance]:
        """Bütün təsir görən (warehouse_id, variant_id, stock_status) üçlüklərini deterministik sırada kilidləyir.

        Deadlock yaranmasının qarşısını almaq üçün sətirlər mütləq (warehouse_id, variant_id, stock_status)
        əlifba/uuid sırasına görə sıralanır və SELECT ... FOR UPDATE icra edilir.
        Mövcud olmayan sətirlər tranzaksiyada 0 qalığı ilə yaradılır və kilidlənir.
        """
        if not targets:
            return {}

        # 1. Unikal və deterministik sıralama (deadlock-un qarşısını almaq üçün qızıl qayda)
        sorted_targets = sorted(set(targets), key=lambda x: (str(x[0]), str(x[1]), x[2]))

        # 2. Mövcud olmayan sətirləri təhlükəsiz yaratmaq üçün postgres upsert (ON CONFLICT DO NOTHING)
        for w_id, v_id, status in sorted_targets:
            stmt = (
                pg_insert(StockBalance)
                .values(
                    id=generate_uuid7(),
                    company_id=company_id,
                    warehouse_id=w_id,
                    variant_id=v_id,
                    stock_status=status,
                    on_hand=0,
                    allow_negative=False,
                    version=1,
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
                .on_conflict_do_nothing(
                    index_elements=["warehouse_id", "variant_id", "stock_status"]
                )
            )
            await self.session.execute(stmt)

        await self.session.flush()

        # 3. Deterministik sırada SELECT ... FOR UPDATE ilə kilidləyirik
        result_map: dict[tuple[uuid.UUID, uuid.UUID, str], StockBalance] = {}

        # Hər bir hədəfi sıralanmış ardıcıllıqla kilidləyib götürürük
        for w_id, v_id, status in sorted_targets:
            q = (
                select(StockBalance)
                .where(
                    StockBalance.company_id == company_id,
                    StockBalance.warehouse_id == w_id,
                    StockBalance.variant_id == v_id,
                    StockBalance.stock_status == status,
                )
                .with_for_update()
            )
            row = (await self.session.execute(q)).scalar_one()
            result_map[(w_id, v_id, status)] = row

        return result_map

    async def get_active_reservations_qty(
        self, warehouse_id: uuid.UUID, variant_id: uuid.UUID
    ) -> int:
        """Aktiv və vaxtı bitməmiş rezervasiyaların cəmini qaytarır."""
        now = utc_now()
        stmt = select(func.coalesce(func.sum(StockReservation.quantity), 0)).where(
            StockReservation.warehouse_id == warehouse_id,
            StockReservation.variant_id == variant_id,
            StockReservation.status == "active",
            or_(StockReservation.expires_at.is_(None), StockReservation.expires_at > now),
        )
        return int((await self.session.execute(stmt)).scalar_one())

    # --- 2. Stok Hərəkətləri Jurnalı (Ledger) ---

    async def add_movements(self, movements: list[StockMovement]) -> list[StockMovement]:
        """Jurnala yeni hərəkətlər əlavə edir (Append-only)."""
        for m in movements:
            self.session.add(m)
        await self.session.flush()
        return movements

    async def find_movements_by_idempotency_key(
        self, company_id: uuid.UUID, idempotency_key: str
    ) -> list[StockMovement]:
        """Idempotency açarına görə artıq yazılmış hərəkətləri axtarır."""
        stmt = (
            select(StockMovement)
            .where(
                StockMovement.company_id == company_id,
                StockMovement.idempotency_key == idempotency_key,
            )
            .order_by(StockMovement.posted_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_movements(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        variant_id: uuid.UUID | None = None,
        movement_type: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        reference_type: str | None = None,
        reference_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[StockMovement], int]:
        """Stok jurnalı üzrə filtrlənmiş axtarış və ümumi say."""
        query = select(StockMovement).where(StockMovement.company_id == company_id)

        if warehouse_id:
            query = query.where(
                or_(
                    StockMovement.from_warehouse_id == warehouse_id,
                    StockMovement.to_warehouse_id == warehouse_id,
                )
            )
        if variant_id:
            query = query.where(StockMovement.variant_id == variant_id)
        if movement_type:
            query = query.where(StockMovement.movement_type == movement_type)
        if date_from:
            query = query.where(StockMovement.posted_at >= date_from)
        if date_to:
            query = query.where(StockMovement.posted_at <= date_to)
        if reference_type:
            query = query.where(StockMovement.reference_type == reference_type)
        if reference_id:
            query = query.where(StockMovement.reference_id == reference_id)

        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        items_stmt = (
            query.order_by(StockMovement.posted_at.desc(), StockMovement.id.desc())
            .limit(limit)
            .offset(offset)
        )
        items = list((await self.session.execute(items_stmt)).scalars().all())
        return items, total

    # --- 3. Qalıqların Oxunması və Axtarışı ---

    async def get_balance(
        self,
        warehouse_id: uuid.UUID,
        variant_id: uuid.UUID,
        stock_status: str = StockStatus.AVAILABLE.value,
    ) -> StockBalance | None:
        stmt = select(StockBalance).where(
            StockBalance.warehouse_id == warehouse_id,
            StockBalance.variant_id == variant_id,
            StockBalance.stock_status == stock_status,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_balances(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        variant_id: uuid.UUID | None = None,
        category_id: uuid.UUID | None = None,
        stock_status: str | None = None,
        low_stock_only: bool = False,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Qalıqları məhsul və anbar adları ilə birlikdə qaytarır."""
        stmt = (
            select(
                StockBalance,
                ProductVariant.sku,
                ProductVariant.barcode,
                ProductVariant.min_stock,
                Product.name.label("product_name"),
                Warehouse.name.label("warehouse_name"),
            )
            .join(Warehouse, StockBalance.warehouse_id == Warehouse.id)
            .join(ProductVariant, StockBalance.variant_id == ProductVariant.id)
            .join(Product, ProductVariant.product_id == Product.id)
            .where(StockBalance.company_id == company_id)
        )

        if warehouse_id:
            stmt = stmt.where(StockBalance.warehouse_id == warehouse_id)
        if branch_id:
            stmt = stmt.where(Warehouse.branch_id == branch_id)
        if variant_id:
            stmt = stmt.where(StockBalance.variant_id == variant_id)
        if category_id:
            stmt = stmt.where(
                or_(Product.category_id == category_id, Product.subcategory_id == category_id)
            )
        if stock_status:
            stmt = stmt.where(StockBalance.stock_status == stock_status)
        if search:
            s = f"%{search.strip().lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(ProductVariant.sku).like(s),
                    func.lower(ProductVariant.barcode).like(s),
                    func.lower(Product.name).like(s),
                )
            )
        if low_stock_only:
            stmt = stmt.where(
                and_(
                    ProductVariant.min_stock > 0,
                    StockBalance.on_hand <= ProductVariant.min_stock,
                )
            )

        stmt = stmt.order_by(Warehouse.name.asc(), Product.name.asc()).limit(limit).offset(offset)
        rows = (await self.session.execute(stmt)).all()

        results = []
        for bal, sku, barcode, _min_stock, p_name, w_name in rows:
            # Rezervasiyanı da nəzərə alırıq
            res_qty = await self.get_active_reservations_qty(bal.warehouse_id, bal.variant_id)
            av = (
                max(0, bal.on_hand - res_qty)
                if bal.stock_status == StockStatus.AVAILABLE.value
                else 0
            )
            results.append(
                {
                    "id": bal.id,
                    "warehouse_id": bal.warehouse_id,
                    "variant_id": bal.variant_id,
                    "stock_status": bal.stock_status,
                    "on_hand": bal.on_hand,
                    "reserved": res_qty,
                    "available": av,
                    "allow_negative": bal.allow_negative,
                    "updated_at": bal.updated_at,
                    "version": bal.version,
                    "sku": sku,
                    "barcode": barcode,
                    "product_name": p_name,
                    "warehouse_name": w_name,
                }
            )
        return results

    async def get_variant_total_balances(self, variant_id: uuid.UUID) -> list[StockBalance]:
        stmt = (
            select(StockBalance)
            .where(StockBalance.variant_id == variant_id)
            .order_by(StockBalance.stock_status.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    # --- 4. Rezervasiyalar (Reservations) ---

    async def create_reservation(self, res: StockReservation) -> StockReservation:
        self.session.add(res)
        await self.session.flush()
        return res

    async def get_reservation(self, reservation_id: uuid.UUID) -> StockReservation | None:
        stmt = select(StockReservation).where(StockReservation.id == reservation_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def release_reservation(
        self, reservation_id: uuid.UUID, status: str = "released"
    ) -> bool:
        stmt = (
            update(StockReservation)
            .where(StockReservation.id == reservation_id, StockReservation.status == "active")
            .values(status=status)
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount > 0

    async def release_reservations_by_ref(
        self, reference_type: str, reference_id: uuid.UUID, status: str = "released"
    ) -> int:
        stmt = (
            update(StockReservation)
            .where(
                StockReservation.reference_type == reference_type,
                StockReservation.reference_id == reference_id,
                StockReservation.status == "active",
            )
            .values(status=status)
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount

    # --- 5. Anbar Sənədləri (Stock Documents) ---

    async def create_document(self, doc: StockDocument) -> StockDocument:
        self.session.add(doc)
        await self.session.flush()
        return doc

    async def get_document(
        self, document_id: uuid.UUID, with_lines: bool = True
    ) -> StockDocument | None:
        stmt = select(StockDocument).where(StockDocument.id == document_id)
        if with_lines:
            stmt = stmt.options(selectinload(StockDocument.lines))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_documents(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        document_type: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[StockDocument]:
        stmt = select(StockDocument).where(StockDocument.company_id == company_id)
        if warehouse_id:
            stmt = stmt.where(StockDocument.warehouse_id == warehouse_id)
        if document_type:
            stmt = stmt.where(StockDocument.document_type == document_type)
        if status:
            stmt = stmt.where(StockDocument.status == status)

        stmt = (
            stmt.options(selectinload(StockDocument.lines))
            .order_by(StockDocument.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    # --- 6. Fiziki İnventarizasiya və Sayım Sessiyaları (Counts) ---

    async def create_count_session(self, cs: CountSession) -> CountSession:
        self.session.add(cs)
        await self.session.flush()
        return cs

    async def get_count_session(
        self, session_id: uuid.UUID, with_details: bool = True
    ) -> CountSession | None:
        stmt = select(CountSession).where(CountSession.id == session_id)
        if with_details:
            stmt = stmt.options(
                selectinload(CountSession.lines),
                selectinload(CountSession.entries),
            )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_count_sessions(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[CountSession]:
        stmt = select(CountSession).where(CountSession.company_id == company_id)
        if warehouse_id:
            stmt = stmt.where(CountSession.warehouse_id == warehouse_id)
        if status:
            stmt = stmt.where(CountSession.status == status)

        stmt = (
            stmt.options(selectinload(CountSession.lines))
            .order_by(CountSession.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def add_count_entry(self, entry: CountEntry) -> CountEntry:
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def undo_count_entry(self, entry_id: uuid.UUID) -> bool:
        stmt = (
            update(CountEntry)
            .where(CountEntry.id == entry_id, CountEntry.is_undone.is_(False))
            .values(is_undone=True)
        )
        res = await self.session.execute(stmt)
        await self.session.flush()
        return res.rowcount > 0

    # --- 7. Qiymətləndirmə (Valuation) və Balans Bərpası (Reconciliation / Rebuild) ---

    async def get_stock_valuation(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Cari qalıqlar və orta maya dəyəri üzrə inventar dəyərini çıxarır."""
        stmt = (
            select(
                StockBalance.warehouse_id,
                Warehouse.name.label("warehouse_name"),
                StockBalance.variant_id,
                ProductVariant.sku,
                Product.name.label("product_name"),
                func.sum(StockBalance.on_hand).label("quantity"),
                func.coalesce(InventoryCostState.unit_cost, Decimal("0.0000")).label("unit_cost"),
            )
            .join(Warehouse, StockBalance.warehouse_id == Warehouse.id)
            .join(ProductVariant, StockBalance.variant_id == ProductVariant.id)
            .join(Product, ProductVariant.product_id == Product.id)
            .outerjoin(
                InventoryCostState,
                and_(
                    InventoryCostState.company_id == StockBalance.company_id,
                    InventoryCostState.variant_id == StockBalance.variant_id,
                    InventoryCostState.warehouse_id.is_(None),  # Şirkət üzrə mərkəzi maya
                ),
            )
            .where(
                StockBalance.company_id == company_id,
                StockBalance.on_hand > 0,
            )
        )
        if warehouse_id:
            stmt = stmt.where(StockBalance.warehouse_id == warehouse_id)

        stmt = stmt.group_by(
            StockBalance.warehouse_id,
            Warehouse.name,
            StockBalance.variant_id,
            ProductVariant.sku,
            Product.name,
            InventoryCostState.unit_cost,
        ).order_by(Warehouse.name.asc(), Product.name.asc())

        rows = (await self.session.execute(stmt)).all()
        items = []
        for w_id, w_name, v_id, sku, p_name, qty, u_cost in rows:
            q = int(qty or 0)
            uc = Decimal(u_cost or 0)
            tot = (Decimal(q) * uc).quantize(Decimal("0.0001"))
            items.append(
                {
                    "warehouse_id": w_id,
                    "warehouse_name": w_name,
                    "variant_id": v_id,
                    "sku": sku,
                    "product_name": p_name,
                    "quantity": q,
                    "unit_cost": uc,
                    "total_value": tot,
                }
            )
        return items

    async def check_ledger_drift(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        variant_id: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Stok Balansları (stock_balances) ilə Ledger (stock_movements) arasındakı uyğunsuzluğu yoxlayır."""
        # Ledger üzrə daxil olan və çıxan miqdarları toplayırıq
        # Mədaxil: to_warehouse_id = w_id AND to_status = status
        # Məxaric: from_warehouse_id = w_id AND from_status = status

        # Bütün aktiv balansları götürürük
        bal_q = select(StockBalance).where(StockBalance.company_id == company_id)
        if warehouse_id:
            bal_q = bal_q.where(StockBalance.warehouse_id == warehouse_id)
        if variant_id:
            bal_q = bal_q.where(StockBalance.variant_id == variant_id)

        balances = list((await self.session.execute(bal_q)).scalars().all())
        drifts = []

        for b in balances:
            # Ledger-dən xalis hərəkət
            inbound_stmt = select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
                StockMovement.company_id == company_id,
                StockMovement.to_warehouse_id == b.warehouse_id,
                StockMovement.variant_id == b.variant_id,
                StockMovement.to_status == b.stock_status,
            )
            inbound = (await self.session.execute(inbound_stmt)).scalar_one()

            outbound_stmt = select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
                StockMovement.company_id == company_id,
                StockMovement.from_warehouse_id == b.warehouse_id,
                StockMovement.variant_id == b.variant_id,
                StockMovement.from_status == b.stock_status,
            )
            outbound = (await self.session.execute(outbound_stmt)).scalar_one()

            ledger_total = int(inbound - outbound)
            if ledger_total != b.on_hand:
                drifts.append(
                    {
                        "warehouse_id": b.warehouse_id,
                        "variant_id": b.variant_id,
                        "stock_status": b.stock_status,
                        "balance_on_hand": b.on_hand,
                        "ledger_calculated_on_hand": ledger_total,
                        "drift": b.on_hand - ledger_total,
                    }
                )

        return drifts

    async def rebuild_balances_from_ledger(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        variant_id: uuid.UUID | None = None,
    ) -> tuple[int, int]:
        """Balansları ledger hərəkətlərinə əsasən bərpa edir."""
        drifts = await self.check_ledger_drift(company_id, warehouse_id, variant_id)
        repaired = 0

        for d in drifts:
            stmt = (
                update(StockBalance)
                .where(
                    StockBalance.company_id == company_id,
                    StockBalance.warehouse_id == d["warehouse_id"],
                    StockBalance.variant_id == d["variant_id"],
                    StockBalance.stock_status == d["stock_status"],
                )
                .values(
                    on_hand=d["ledger_calculated_on_hand"],
                    updated_at=utc_now(),
                    version=StockBalance.version + 1,
                )
            )
            await self.session.execute(stmt)
            repaired += 1

        await self.session.flush()
        return len(drifts), repaired
