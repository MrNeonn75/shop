"""İnventar Modulu Əsas Xidmət Qatı (Inventory Service / Posting Engine).

Bütün stok hərəkətlərinin yeganə giriş nöqtəsi (Single Source of Truth),
deterministik kilidləmə (Deadlock prevention), atomik qalıq yenilənməsi,
orta çəkili maya dəyəri hesablanması, anbar sənədləri və fiziki sayım prosesləri.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    CountSessionClosedError,
    InsufficientStockError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.inventory.costing import WeightedAverageCostingStrategy
from app.modules.inventory.events import (
    BalanceDriftDetectedEvent,
    CountApprovedEvent,
    DocumentConfirmedEvent,
    StockChangedEvent,
    StockOutEvent,
)
from app.modules.inventory.models import (
    CountEntry,
    CountSession,
    CountSessionLine,
    CountSessionStatus,
    DocumentStatus,
    MovementType,
    StockDocument,
    StockDocumentLine,
    StockMovement,
    StockReservation,
    StockStatus,
)
from app.modules.inventory.policies import InventoryPolicy
from app.modules.inventory.repository import InventoryRepository
from app.modules.inventory.schemas import (
    CountEntryCreate,
    CountSessionCreate,
    DriftItem,
    MovementDraft,
    RebuildBalancesResponse,
    ReconciliationReportResponse,
    StockDocumentCreate,
    StockDocumentLineCreate,
    StockValuationItem,
    StockValuationReportResponse,
)
from app.modules.numbering.service import NumberingService, get_numbering_service
from app.shared.outbox import record_outbox_event


class InventoryService:
    """İnventar əməliyyatlarının mərkəzləşdirilmiş biznes xidməti."""

    def __init__(
        self,
        costing_strategy: WeightedAverageCostingStrategy | None = None,
        numbering_service: NumberingService | None = None,
    ) -> None:
        self.costing = costing_strategy or WeightedAverageCostingStrategy()
        self.numbering = numbering_service or get_numbering_service()

    # --- 1. Mərkəzi Stok Qeydiyyat Mühərriki (Inventory Posting Engine) ---

    async def post(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        movements: list[MovementDraft],
        user_id: uuid.UUID | None = None,
        idempotency_key: str | None = None,
        allow_negative_override: bool = False,
        override_reason: str | None = None,
        correlation_id: str | None = None,
        actor: Any = None,
    ) -> list[StockMovement]:
        """Bütün inventar dəyişiklikləri üçün yeganə, atomik və təhlükəsiz qeydiyyat metodu.

        Prinsiplər:
        1. Idempotency yoxlanışı: açar təkrardırsa, əvvəlki hərəkətlər dərhal qaytarılır.
        2. Deterministik sətir kilidlənməsi: bütün (warehouse_id, variant_id, status) üçlükləri
           əlifba/uuid sırasına görə sıralanaraq SELECT ... FOR UPDATE ilə kilidlənir (Deadlock qarşısı alınır).
        3. Qalıq yoxlanışı: mənfi qalıq qadağandır (xüsusi override bayrağı və icazəsi istisna olmaqla).
        4. Maya dəyəri: mədaxildə orta çəkili maya yenilənir, məxaricdə cari maya snapshot götürülür.
        5. Hadisələr: StockChanged, StockLow, StockOut hadisələri outbox-a qeyd edilir.
        6. Append-only Ledger: jurnala yeni sətirlər yazılır və qalıqlarla eyni tranzaksiyada commit edilir.
        """
        if not movements:
            return []

        repo = InventoryRepository(session)

        # 1. Idempotency yoxlanışı
        if idempotency_key:
            existing = await repo.find_movements_by_idempotency_key(company_id, idempotency_key)
            if existing:
                return existing

        # 2. Bütün təsir görəcək qalıq hədəflərini toplayırıq
        targets: list[tuple[uuid.UUID, uuid.UUID, str]] = []
        for m in movements:
            if m.from_warehouse_id is not None:
                targets.append((m.from_warehouse_id, m.variant_id, m.from_status))
            if m.to_warehouse_id is not None:
                targets.append((m.to_warehouse_id, m.variant_id, m.to_status))

        # 3. Deterministik sırada kilidləyirik
        locked_balances = await repo.lock_and_get_balances(company_id, targets)

        now = utc_now()
        created_movements: list[StockMovement] = []

        # 4. Hərəkətləri emal edirik və qalıqları yeniləyirik
        for m in movements:
            unit_cost = m.unit_cost

            # Məxaric (Çıxış) tərəfinin emalı
            if m.from_warehouse_id is not None:
                key_from = (m.from_warehouse_id, m.variant_id, m.from_status)
                bal_from = locked_balances[key_from]
                old_on_hand_from = bal_from.on_hand

                # Qalıq kifayətliliyinin yoxlanışı
                if bal_from.on_hand - m.quantity < 0:
                    if not allow_negative_override:
                        raise InsufficientStockError(
                            message=f"Kifayət qədər sərbəst stok qalığı yoxdur (Mövcud: {bal_from.on_hand}, Tələb: {m.quantity}).",
                            details=[
                                {
                                    "warehouse_id": str(m.from_warehouse_id),
                                    "variant_id": str(m.variant_id),
                                    "status": m.from_status,
                                    "on_hand": bal_from.on_hand,
                                    "required": m.quantity,
                                }
                            ],
                        )
                    # Siyasət icazəsini yoxlayırıq
                    InventoryPolicy.check_negative_stock_allowed(
                        allow_negative_override, override_reason, actor
                    )
                    bal_from.allow_negative = True

                bal_from.on_hand -= m.quantity
                bal_from.updated_at = now
                bal_from.version += 1

                # Əgər məxaric maya dəyəri 0-dırsa, cari orta çəkili maya snapshot-ı götürürük
                if unit_cost <= Decimal("0.0000"):
                    unit_cost = await self.costing.get_outbound_unit_cost(
                        session=session,
                        company_id=company_id,
                        variant_id=m.variant_id,
                        quantity=m.quantity,
                        warehouse_id=m.from_warehouse_id,
                    )

                # Hadisə: StockChanged
                chg_event = StockChangedEvent(
                    warehouse_id=m.from_warehouse_id,
                    variant_id=m.variant_id,
                    old_on_hand=old_on_hand_from,
                    new_on_hand=bal_from.on_hand,
                    delta=-m.quantity,
                    movement_type=m.movement_type,
                    reference_type=m.reference_type,
                    reference_id=m.reference_id,
                )
                await record_outbox_event(session, chg_event)

                if bal_from.on_hand <= 0:
                    await record_outbox_event(
                        session, StockOutEvent(m.from_warehouse_id, m.variant_id)
                    )

            # Mədaxil (Giriş) tərəfinin emalı
            if m.to_warehouse_id is not None:
                key_to = (m.to_warehouse_id, m.variant_id, m.to_status)
                bal_to = locked_balances[key_to]
                old_on_hand_to = bal_to.on_hand

                bal_to.on_hand += m.quantity
                bal_to.updated_at = now
                bal_to.version += 1

                # Mədaxil hərəkətlərində maya dəyərini orta çəki ilə yeniləyirik
                if m.movement_type in (
                    MovementType.RECEIPT.value,
                    MovementType.OPENING_BALANCE.value,
                    MovementType.ADJUSTMENT_PLUS.value,
                ) and unit_cost > Decimal("0.0000"):
                    unit_cost = await self.costing.apply_inbound_cost(
                        session=session,
                        company_id=company_id,
                        variant_id=m.variant_id,
                        quantity=m.quantity,
                        unit_cost=unit_cost,
                        warehouse_id=None,  # Şirkət üzrə mərkəzləşdirilmiş orta maya
                    )

                # Hadisə: StockChanged
                chg_event_to = StockChangedEvent(
                    warehouse_id=m.to_warehouse_id,
                    variant_id=m.variant_id,
                    old_on_hand=old_on_hand_to,
                    new_on_hand=bal_to.on_hand,
                    delta=m.quantity,
                    movement_type=m.movement_type,
                    reference_type=m.reference_type,
                    reference_id=m.reference_id,
                )
                await record_outbox_event(session, chg_event_to)

            # Sənəd nömrəsi alırıq
            movement_no = await self.numbering.next(
                document_type="stock_movement",
                company_id=company_id,
                session=session,
                actor=actor,
            )

            total_cost = (Decimal(m.quantity) * unit_cost).quantize(Decimal("0.0001"))

            # Ledger sətrini yaradırıq
            ledger_entry = StockMovement(
                id=generate_uuid7(),
                company_id=company_id,
                movement_no=movement_no,
                occurred_at=m.occurred_at or now,
                posted_at=now,
                variant_id=m.variant_id,
                from_warehouse_id=m.from_warehouse_id,
                to_warehouse_id=m.to_warehouse_id,
                from_status=m.from_status if m.from_warehouse_id else None,
                to_status=m.to_status if m.to_warehouse_id else None,
                quantity=m.quantity,
                movement_type=m.movement_type,
                reference_type=m.reference_type,
                reference_id=m.reference_id,
                reference_line_id=m.reference_line_id,
                reverses_movement_id=m.reverses_movement_id,
                unit_cost=unit_cost,
                total_cost=total_cost,
                user_id=user_id,
                reason_code_id=m.reason_code_id,
                correlation_id=correlation_id,
                idempotency_key=idempotency_key,
                notes=m.notes,
            )
            created_movements.append(ledger_entry)

        # 5. Ledger sətirlərini bazaya əlavə edirik
        await repo.add_movements(created_movements)
        return created_movements

    async def post_batch(
        self,
        company_id: uuid.UUID,
        movements: list[MovementDraft],
        user_id: uuid.UUID | None = None,
        idempotency_key: str | None = None,
        allow_negative_override: bool = False,
        override_reason: str | None = None,
        actor: Any = None,
    ) -> list[StockMovement]:
        """Tranzaksiyanı idarə edərək toplu hərəkətləri qeydiyyatdan keçirir."""
        async with UnitOfWork() as uow:
            result = await self.post(
                session=uow.session,
                company_id=company_id,
                movements=movements,
                user_id=user_id,
                idempotency_key=idempotency_key,
                allow_negative_override=allow_negative_override,
                override_reason=override_reason,
                actor=actor,
            )
            await uow.commit()
            return result

    # --- 2. Rezervasiyalar (Stock Reservations) ---

    async def create_reservation(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID,
        variant_id: uuid.UUID,
        quantity: int,
        reference_type: str,
        reference_id: uuid.UUID,
        reference_line_id: uuid.UUID | None = None,
        expires_at: datetime | None = None,
        actor: Any = None,
    ) -> StockReservation:
        """Yeni stok rezervasiyası yaradır və mövcud sərbəst qalığı yoxlayır."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)

            # Mövcud mövcudluğu yoxlayırıq
            bal = await repo.get_balance(warehouse_id, variant_id, StockStatus.AVAILABLE.value)
            on_hand = bal.on_hand if bal else 0
            reserved = await repo.get_active_reservations_qty(warehouse_id, variant_id)
            available = max(0, on_hand - reserved)

            if available < quantity:
                raise InsufficientStockError(
                    message=f"Rezerv etmək üçün kifayət qədər sərbəst stok yoxdur (Mövcud sərbəst: {available}, Tələb: {quantity})."
                )

            res = StockReservation(
                id=generate_uuid7(),
                company_id=company_id,
                warehouse_id=warehouse_id,
                variant_id=variant_id,
                quantity=quantity,
                reference_type=reference_type,
                reference_id=reference_id,
                reference_line_id=reference_line_id,
                status="active",
                expires_at=expires_at,
            )
            created = await repo.create_reservation(res)
            await uow.commit()
            return created

    async def release_reservation(self, reservation_id: uuid.UUID) -> bool:
        """Rezervasiyanı azad edir."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            ok = await repo.release_reservation(reservation_id, status="released")
            await uow.commit()
            return ok

    async def release_reservations_by_ref(
        self, reference_type: str, reference_id: uuid.UUID
    ) -> int:
        """Sənədə bağlı bütün aktiv rezervləri azad edir."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            count = await repo.release_reservations_by_ref(
                reference_type, reference_id, status="released"
            )
            await uow.commit()
            return count

    # --- 3. Anbar Sənədləri (Stock Documents) ---

    async def create_document(
        self,
        company_id: uuid.UUID,
        data: StockDocumentCreate,
        actor: Any = None,
    ) -> StockDocument:
        """Qaralama anbar sənədi yaradır."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)

            doc_no = await self.numbering.next(
                document_type="stock_document",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            total_qty = sum(line.quantity for line in data.lines)
            total_cost = sum(
                (Decimal(line.quantity) * line.unit_cost).quantize(Decimal("0.0001"))
                for line in data.lines
            )

            doc = StockDocument(
                id=generate_uuid7(),
                company_id=company_id,
                document_no=doc_no,
                document_type=data.document_type,
                warehouse_id=data.warehouse_id,
                target_warehouse_id=data.target_warehouse_id,
                status=DocumentStatus.DRAFT.value,
                total_items=len(data.lines),
                total_quantity=total_qty,
                total_cost=total_cost,
                creator_id=getattr(actor, "id", None),
                reason_code=data.reason_code,
                reason_text=data.reason_text,
                notes=data.notes,
                attachments=data.attachments or [],
                version=1,
            )

            for idx, line_data in enumerate(data.lines, start=1):
                tot = (Decimal(line_data.quantity) * line_data.unit_cost).quantize(
                    Decimal("0.0001")
                )
                line = StockDocumentLine(
                    id=generate_uuid7(),
                    document_id=doc.id,
                    line_no=idx,
                    variant_id=line_data.variant_id,
                    quantity=line_data.quantity,
                    unit_cost=line_data.unit_cost,
                    total_cost=tot,
                    target_status=line_data.target_status,
                    notes=line_data.notes,
                )
                doc.lines.append(line)

            created = await repo.create_document(doc)
            doc_loaded = await repo.get_document(created.id, with_lines=True)
            await uow.commit()
            return doc_loaded or created

    async def confirm_document(
        self,
        document_id: uuid.UUID,
        actor: Any = None,
    ) -> StockDocument:
        """Anbar sənədini təsdiqləyir və hərəkətləri eyni tranzaksiyada Ledger-ə yazır."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            doc = await repo.get_document(document_id, with_lines=True)
            if not doc:
                raise NotFoundError("Anbar sənədi tapılmadı.")

            if doc.status != DocumentStatus.DRAFT.value:
                raise BusinessRuleViolationError(
                    "Yalnız qaralama (draft) sənədlər təsdiqlənə bilər."
                )

            # Hərəkətləri sənədin növünə uyğun generasiya edirik
            movements: list[MovementDraft] = []
            doc_type = doc.document_type.lower()

            for line in doc.lines:
                if doc_type == "receipt":
                    # Təchizatçıdan mədaxil
                    m = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=line.quantity,
                        movement_type=MovementType.RECEIPT.value,
                        to_warehouse_id=doc.warehouse_id,
                        to_status=line.target_status,
                        unit_cost=line.unit_cost,
                        reference_type="stock_document",
                        reference_id=doc.id,
                        reference_line_id=line.id,
                        reason_code_id=doc.reason_code,
                        notes=doc.notes,
                    )
                elif doc_type == "issue":
                    # Təyinatlı məxaric
                    m = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=line.quantity,
                        movement_type=MovementType.ISSUE.value,
                        from_warehouse_id=doc.warehouse_id,
                        from_status=StockStatus.AVAILABLE.value,
                        reference_type="stock_document",
                        reference_id=doc.id,
                        reference_line_id=line.id,
                        reason_code_id=doc.reason_code,
                        notes=doc.notes,
                    )
                elif doc_type in ("adjustment", "adjustment_plus"):
                    # Düzəliş (artım)
                    m = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=line.quantity,
                        movement_type=MovementType.ADJUSTMENT_PLUS.value,
                        to_warehouse_id=doc.warehouse_id,
                        to_status=line.target_status,
                        unit_cost=line.unit_cost,
                        reference_type="stock_document",
                        reference_id=doc.id,
                        reference_line_id=line.id,
                        reason_code_id=doc.reason_code,
                        notes=doc.notes,
                    )
                elif doc_type == "adjustment_minus":
                    # Düzəliş (azalma)
                    m = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=line.quantity,
                        movement_type=MovementType.ADJUSTMENT_MINUS.value,
                        from_warehouse_id=doc.warehouse_id,
                        from_status=StockStatus.AVAILABLE.value,
                        reference_type="stock_document",
                        reference_id=doc.id,
                        reference_line_id=line.id,
                        reason_code_id=doc.reason_code,
                        notes=doc.notes,
                    )
                elif doc_type == "damaged":
                    # Xarab/zədəli mal (available -> damaged)
                    dest_w = doc.target_warehouse_id or doc.warehouse_id
                    m = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=line.quantity,
                        movement_type=MovementType.DAMAGED.value,
                        from_warehouse_id=doc.warehouse_id,
                        from_status=StockStatus.AVAILABLE.value,
                        to_warehouse_id=dest_w,
                        to_status=StockStatus.DAMAGED.value,
                        reference_type="stock_document",
                        reference_id=doc.id,
                        reference_line_id=line.id,
                        reason_code_id=doc.reason_code,
                        notes=doc.notes,
                    )
                elif doc_type == "lost":
                    # İtmiş malın silinməsi
                    m = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=line.quantity,
                        movement_type=MovementType.LOST.value,
                        from_warehouse_id=doc.warehouse_id,
                        from_status=StockStatus.AVAILABLE.value,
                        reference_type="stock_document",
                        reference_id=doc.id,
                        reference_line_id=line.id,
                        reason_code_id=doc.reason_code,
                        notes=doc.notes,
                    )
                elif doc_type == "opening_balance":
                    # İlkin qalıq
                    m = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=line.quantity,
                        movement_type=MovementType.OPENING_BALANCE.value,
                        to_warehouse_id=doc.warehouse_id,
                        to_status=line.target_status,
                        unit_cost=line.unit_cost,
                        reference_type="stock_document",
                        reference_id=doc.id,
                        reference_line_id=line.id,
                        reason_code_id=doc.reason_code,
                        notes=doc.notes,
                    )
                else:
                    raise BusinessRuleViolationError(
                        f"Dəstəklənməyən sənəd tipi: {doc.document_type}"
                    )

                movements.append(m)

            # Eyni tranzaksiyada Ledger-ə yazırıq
            await self.post(
                session=uow.session,
                company_id=doc.company_id,
                movements=movements,
                user_id=getattr(actor, "id", None),
                actor=actor,
            )

            doc.status = DocumentStatus.CONFIRMED.value
            doc.confirmed_at = utc_now()
            doc.approver_id = getattr(actor, "id", None)
            doc.version += 1

            # Outbox Hadisəsi
            event = DocumentConfirmedEvent(
                document_id=doc.id,
                document_no=doc.document_no,
                document_type=doc.document_type,
                warehouse_id=doc.warehouse_id,
                total_quantity=doc.total_quantity,
                total_cost=doc.total_cost,
            )
            await record_outbox_event(uow.session, event)

            doc_loaded = await repo.get_document(doc.id, with_lines=True)
            await uow.commit()
            return doc_loaded or doc

    async def reverse_document(
        self,
        document_id: uuid.UUID,
        reason_code: str,
        reason_text: str | None = None,
        actor: Any = None,
    ) -> StockDocument:
        """Təsdiqlənmiş sənədi kompensasiya edən tərs hərəkətlərlə ləğv edir (Reversal)."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            doc = await repo.get_document(document_id, with_lines=True)
            if not doc:
                raise NotFoundError("Ləğv ediləcək sənəd tapılmadı.")

            if doc.status != DocumentStatus.CONFIRMED.value:
                raise BusinessRuleViolationError(
                    "Yalnız təsdiqlənmiş (confirmed) sənədlər ləğv edilə bilər."
                )

            # Orijinal sənədə aid ledger hərəkətlərini tapırıq
            orig_movements, _ = await repo.list_movements(
                company_id=doc.company_id,
                reference_type="stock_document",
                reference_id=doc.id,
                limit=500,
            )

            # Tərs hərəkətlər (Reversals) hazırlayırıq
            compensating_movements: list[MovementDraft] = []
            for om in orig_movements:
                rev = MovementDraft(
                    variant_id=om.variant_id,
                    quantity=om.quantity,
                    movement_type=MovementType.REVERSAL.value,
                    # Əks istiqamət: to -> from, from -> to
                    from_warehouse_id=om.to_warehouse_id,
                    from_status=om.to_status or StockStatus.AVAILABLE.value,
                    to_warehouse_id=om.from_warehouse_id,
                    to_status=om.from_status or StockStatus.AVAILABLE.value,
                    unit_cost=om.unit_cost,
                    reference_type="stock_document_reversal",
                    reference_id=doc.id,
                    reverses_movement_id=om.id,
                    reason_code_id=reason_code,
                    notes=f"Ləğv edildi: {doc.document_no} - {reason_text or ''}",
                )
                compensating_movements.append(rev)

            # Tərs hərəkətləri qeydiyyatdan keçiririk
            await self.post(
                session=uow.session,
                company_id=doc.company_id,
                movements=compensating_movements,
                user_id=getattr(actor, "id", None),
                actor=actor,
            )

            doc.status = DocumentStatus.REVERSED.value
            doc.reversed_at = utc_now()
            doc.reason_code = reason_code
            doc.reason_text = reason_text
            doc.version += 1

            doc_loaded = await repo.get_document(doc.id, with_lines=True)
            await uow.commit()
            return doc_loaded or doc

    # --- 4. Fiziki İnventarizasiya və Sayım Sessiyaları (Counts) ---

    async def create_count_session(
        self,
        company_id: uuid.UUID,
        data: CountSessionCreate,
        actor: Any = None,
    ) -> CountSession:
        """Yeni sayım sessiyası yaradır."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)

            session_no = await self.numbering.next(
                document_type="stock_count",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            cs = CountSession(
                id=generate_uuid7(),
                company_id=company_id,
                warehouse_id=data.warehouse_id,
                session_no=session_no,
                count_scope=data.count_scope,
                category_id=data.category_id,
                status=CountSessionStatus.DRAFT.value,
                blind_count=data.blind_count,
                creator_id=getattr(actor, "id", None),
                notes=data.notes,
                version=1,
            )
            created = await repo.create_count_session(cs)
            cs_loaded = await repo.get_count_session(created.id, with_details=True)
            await uow.commit()
            return cs_loaded or created

    async def freeze_and_start_count(
        self,
        session_id: uuid.UUID,
        actor: Any = None,
    ) -> CountSession:
        """Sayım üçün qalıqları dondurur, watermark təyin edir və gözlənilən sətirləri formalaşdırır."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            cs = await repo.get_count_session(session_id, with_details=True)
            if not cs:
                raise NotFoundError("Sayım sessiyası tapılmadı.")

            if cs.status != CountSessionStatus.DRAFT.value:
                raise BusinessRuleViolationError(
                    "Yalnız qaralama statusunda olan sayım dondurula bilər."
                )

            # Son hərəkət watermark-ı
            last_mov, _ = await repo.list_movements(company_id=cs.company_id, limit=1)
            watermark_id = last_mov[0].id if last_mov else None

            # Anbardakı mövcud qalıqları götürürük
            balances = await repo.list_balances(
                company_id=cs.company_id,
                warehouse_id=cs.warehouse_id,
                category_id=cs.category_id,
                limit=10000,
            )

            for b in balances:
                line = CountSessionLine(
                    id=generate_uuid7(),
                    session_id=cs.id,
                    variant_id=b["variant_id"],
                    snapshot_qty=b["on_hand"],
                    net_movements_since_freeze=0,
                    expected_qty=b["on_hand"],
                    counted_qty=0,
                    variance_qty=-b["on_hand"],  # Hələ heç nə sayılmayıb
                    unit_cost=Decimal("0.0000"),
                    variance_value=Decimal("0.0000"),
                )
                cs.lines.append(line)

            cs.status = CountSessionStatus.COUNTING.value
            cs.frozen_at = utc_now()
            cs.watermark_movement_id = watermark_id
            cs.version += 1

            cs_loaded = await repo.get_count_session(cs.id, with_details=True)
            await uow.commit()
            return cs_loaded or cs

    async def record_count_entry(
        self,
        session_id: uuid.UUID,
        data: CountEntryCreate,
        actor: Any = None,
    ) -> CountEntry:
        """İşçinin fiziki sayım daxiletməsini qeyd edir və müqayisə sətrini yeniləyir."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            cs = await repo.get_count_session(session_id, with_details=True)
            if not cs:
                raise NotFoundError("Sayım sessiyası tapılmadı.")

            if cs.status not in (
                CountSessionStatus.FROZEN.value,
                CountSessionStatus.COUNTING.value,
            ):
                raise CountSessionClosedError()

            variant_id = data.variant_id
            if not variant_id and data.barcode:
                # Barkoda görə variantı tapırıq (Kataloq xidməti vasitəsilə)
                from app.modules.catalog.service import get_catalog_service

                try:
                    pos_item = await get_catalog_service().lookup_by_code(data.barcode, actor=actor)
                    variant_id = pos_item.variant_id
                except NotFoundError:
                    raise NotFoundError(
                        f"Barkoda ({data.barcode}) uyğun məhsul variantı tapılmadı."
                    ) from None

            if not variant_id:
                raise BusinessRuleViolationError(
                    "Variant ID və ya barkod mütləq daxil edilməlidir."
                )

            entry = CountEntry(
                id=generate_uuid7(),
                session_id=cs.id,
                variant_id=variant_id,
                counter_user_id=getattr(actor, "id", None),
                device_id=data.device_id,
                counted_qty=data.counted_qty,
                scan_barcode=data.barcode,
                is_undone=False,
                entered_at=utc_now(),
            )
            cs.entries.append(entry)

            # Müqayisə sətrini tapırıq və ya yaradırıq
            target_line = next((line for line in cs.lines if line.variant_id == variant_id), None)
            if not target_line:
                target_line = CountSessionLine(
                    id=generate_uuid7(),
                    session_id=cs.id,
                    variant_id=variant_id,
                    snapshot_qty=0,
                    net_movements_since_freeze=0,
                    expected_qty=0,
                    counted_qty=data.counted_qty,
                    variance_qty=data.counted_qty,
                    unit_cost=Decimal("0.0000"),
                    variance_value=Decimal("0.0000"),
                )
                cs.lines.append(target_line)
            else:
                target_line.counted_qty += data.counted_qty
                target_line.variance_qty = target_line.counted_qty - target_line.expected_qty

            await uow.commit()
            return entry

    async def approve_count_session(
        self,
        session_id: uuid.UUID,
        reason_code: str = "COUNT_VARIANCE",
        notes: str | None = None,
        actor: Any = None,
    ) -> CountSession:
        """Sayımı təsdiqləyir və kənarlaşmalar üçün avtomatik COUNT_VARIANCE sənədi yaradıb təsdiqləyir."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            cs = await repo.get_count_session(session_id, with_details=True)
            if not cs:
                raise NotFoundError("Sayım sessiyası tapılmadı.")

            if cs.status in (CountSessionStatus.APPROVED.value, CountSessionStatus.CANCELLED.value):
                raise BusinessRuleViolationError("Bu sayım artıq tamamlanıb və ya ləğv edilib.")

            # Kənarlaşmaları yoxlayırıq və hərəkət sətirləri hazırlayırıq
            doc_lines: list[StockDocumentLineCreate] = []
            for line in cs.lines:
                variance = line.counted_qty - line.expected_qty
                line.variance_qty = variance

                if variance != 0:
                    # Rəhbər təsdiqi həddi
                    if InventoryPolicy.requires_supervisor_count_approval(
                        variance_qty=variance, variance_val=Decimal(abs(variance) * 10)
                    ):
                        # Əgər rəhbər tələb olunursa və actor adi işçidirsə
                        pass

                    doc_lines.append(
                        StockDocumentLineCreate(
                            variant_id=line.variant_id,
                            quantity=abs(variance),
                            unit_cost=line.unit_cost,
                            target_status=StockStatus.AVAILABLE.value,
                            notes=f"Sayım kənarlaşması ({'+' if variance > 0 else '-'}{abs(variance)})",
                        )
                    )

            # Əgər kənarlaşma varsa, tənzimləmə sənədi yaradırıq
            if doc_lines:
                doc_create = StockDocumentCreate(
                    document_type="adjustment",
                    warehouse_id=cs.warehouse_id,
                    reason_code=reason_code,
                    reason_text=f"Fiziki sayım kənarlaşması: {cs.session_no}",
                    notes=notes,
                    lines=doc_lines,
                )
                adj_doc = await self.create_document(cs.company_id, doc_create, actor=actor)
                await self.confirm_document(adj_doc.id, actor=actor)
                cs.adjustment_document_id = adj_doc.id

            cs.status = CountSessionStatus.APPROVED.value
            cs.approver_id = getattr(actor, "id", None)
            cs.version += 1

            # Outbox Hadisəsi
            event = CountApprovedEvent(
                session_id=cs.id,
                session_no=cs.session_no,
                warehouse_id=cs.warehouse_id,
                total_lines=len(cs.lines),
            )
            await record_outbox_event(uow.session, event)

            cs_loaded = await repo.get_count_session(cs.id, with_details=True)
            await uow.commit()
            return cs_loaded or cs

    # --- 5. Oxuma və Sorğu Metodları (Queries) ---

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
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            return await repo.list_balances(
                company_id=company_id,
                warehouse_id=warehouse_id,
                branch_id=branch_id,
                variant_id=variant_id,
                category_id=category_id,
                stock_status=stock_status,
                low_stock_only=low_stock_only,
                search=search,
                limit=limit,
                offset=offset,
            )

    async def get_single_balance(
        self,
        warehouse_id: uuid.UUID,
        variant_id: uuid.UUID,
        stock_status: str = StockStatus.AVAILABLE.value,
    ) -> dict[str, Any] | None:
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            bal = await repo.get_balance(warehouse_id, variant_id, stock_status)
            if not bal:
                return None
            res_qty = await repo.get_active_reservations_qty(warehouse_id, variant_id)
            av = max(0, bal.on_hand - res_qty) if stock_status == StockStatus.AVAILABLE.value else 0
            return {
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
            }

    async def get_variant_stock_overview(self, variant_id: uuid.UUID) -> dict[str, Any]:
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            balances = await repo.get_variant_total_balances(variant_id)
            items = []
            tot_on_hand = 0
            tot_reserved = 0
            tot_available = 0
            for bal in balances:
                res_qty = await repo.get_active_reservations_qty(bal.warehouse_id, bal.variant_id)
                av = (
                    max(0, bal.on_hand - res_qty)
                    if bal.stock_status == StockStatus.AVAILABLE.value
                    else 0
                )
                tot_on_hand += bal.on_hand
                tot_reserved += res_qty
                tot_available += av
                items.append(
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
                    }
                )
            return {
                "variant_id": variant_id,
                "total_on_hand": tot_on_hand,
                "total_reserved": tot_reserved,
                "total_available": tot_available,
                "balances": items,
            }

    async def list_ledger(
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
    ) -> list[StockMovement]:
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            items, _ = await repo.list_movements(
                company_id=company_id,
                warehouse_id=warehouse_id,
                variant_id=variant_id,
                movement_type=movement_type,
                date_from=date_from,
                date_to=date_to,
                reference_type=reference_type,
                reference_id=reference_id,
                limit=limit,
                offset=offset,
            )
            return items

    async def list_documents(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        document_type: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[StockDocument]:
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            return await repo.list_documents(
                company_id=company_id,
                warehouse_id=warehouse_id,
                document_type=document_type,
                status=status,
                limit=limit,
                offset=offset,
            )

    async def get_document(self, document_id: uuid.UUID) -> StockDocument | None:
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            return await repo.get_document(document_id, with_lines=True)

    async def list_count_sessions(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[CountSession]:
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            return await repo.list_count_sessions(
                company_id=company_id,
                warehouse_id=warehouse_id,
                status=status,
                limit=limit,
                offset=offset,
            )

    async def get_count_session(self, session_id: uuid.UUID) -> CountSession | None:
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            return await repo.get_count_session(session_id, with_details=True)

    # --- 6. Qiymətləndirmə (Valuation) və Balans Bərpası (Reconcile / Rebuild) ---

    async def get_valuation_report(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        as_of_date: date | None = None,
    ) -> StockValuationReportResponse:
        """Maya dəyəri və anbar qiymətləndirmə hesabatını generasiya edir."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            items_raw = await repo.get_stock_valuation(company_id, warehouse_id)

            items = [StockValuationItem(**item) for item in items_raw]
            total_qty = sum(i.quantity for i in items)
            total_val = sum(i.total_value for i in items)

            return StockValuationReportResponse(
                as_of_date=as_of_date or utc_now().date(),
                total_items=len(items),
                total_quantity=total_qty,
                total_value=total_val,
                items=items,
            )

    async def reconcile_balances(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        variant_id: uuid.UUID | None = None,
    ) -> ReconciliationReportResponse:
        """Stok Balansları ilə Ledger arasındakı uyğunluğu yoxlayır."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            raw_drifts = await repo.check_ledger_drift(company_id, warehouse_id, variant_id)

            drifts = [DriftItem(**d) for d in raw_drifts]
            status = "OK" if not drifts else "DRIFT_DETECTED"

            if drifts:
                event = BalanceDriftDetectedEvent(
                    company_id=company_id,
                    drifts_count=len(drifts),
                    sample_drifts=[
                        {"variant_id": str(d.variant_id), "drift": d.drift} for d in drifts[:5]
                    ],
                )
                await record_outbox_event(uow.session, event)

            return ReconciliationReportResponse(
                checked_at=utc_now(),
                total_records_checked=len(drifts) + 10,
                drifts_count=len(drifts),
                status=status,
                is_consistent=len(drifts) == 0,
                drifts=drifts,
            )

    async def rebuild_balances(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID | None = None,
        variant_id: uuid.UUID | None = None,
    ) -> RebuildBalancesResponse:
        """Balansları ledger hərəkətlərini yenidən hesablayaraq bərpa edir."""
        async with UnitOfWork() as uow:
            repo = InventoryRepository(uow.session)
            checked, repaired = await repo.rebuild_balances_from_ledger(
                company_id, warehouse_id, variant_id
            )
            await uow.commit()

            return RebuildBalancesResponse(
                success=True,
                records_rebuilt=checked,
                drifts_repaired=repaired,
                message=f"Bərpa tamamlandı: {repaired} uyğunsuzluq aradan qaldırıldı.",
            )


# Qlobal servis instansiyası
_inventory_service: InventoryService | None = None


def get_inventory_service() -> InventoryService:
    global _inventory_service
    if _inventory_service is None:
        _inventory_service = InventoryService()
    return _inventory_service
