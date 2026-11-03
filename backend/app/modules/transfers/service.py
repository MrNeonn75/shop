"""Transferlər Modulu Əsas Xidmət Qatı (Transfers Service).

Anbarlararası və filiallararası transferlərin sonlu vəziyyət maşını (State Machine),
rezervasiya, yola salma (TRANSFER_OUT) və qəbul (TRANSFER_IN) əməliyyatları,
qismən qəbul, zədə/itki hadisələri və tranzit SLA monitorinqi.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.inventory.models import MovementType, StockStatus
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService, get_inventory_service
from app.modules.numbering.service import NumberingService
from app.modules.transfers.events import (
    TransferAgingAlertEvent,
    TransferCancelledEvent,
    TransferDiscrepancyEvent,
    TransferDispatchedEvent,
    TransferReceivedEvent,
)
from app.modules.transfers.models import (
    StockTransfer,
    StockTransferLine,
    TransferReceivingEvent,
    TransferReceivingLine,
    TransferStatus,
)
from app.modules.transfers.policies import TransferPolicy
from app.modules.transfers.repository import TransfersRepository
from app.modules.transfers.schemas import (
    InTransitReportResponse,
    InTransitTransferItem,
    TransferCreate,
    TransferDispatchRequest,
    TransferPickRequest,
    TransferReceiveRequest,
)
from app.modules.warehouses.service import WarehouseService, get_warehouse_service
from app.shared.outbox import record_outbox_event


class TransfersService:
    """Transferlər biznes xidməti."""

    def __init__(
        self,
        inventory_service: InventoryService | None = None,
        warehouse_service: WarehouseService | None = None,
        numbering_service: NumberingService | None = None,
    ) -> None:
        self.inventory_service = inventory_service or get_inventory_service()
        self.warehouse_service = warehouse_service or get_warehouse_service()
        self.numbering = numbering_service or NumberingService()

    # --- 1. Transfer Yaratma və Qaralama İdarəetməsi ---

    async def create_transfer(
        self,
        company_id: uuid.UUID,
        data: TransferCreate,
        actor: Any = None,
    ) -> StockTransfer:
        """Yeni anbarlararası və ya filiallararası transfer sənədi yaradır (DRAFT)."""
        if data.source_warehouse_id == data.destination_warehouse_id:
            raise BusinessRuleViolationError("Göndərən və qəbul edən anbar eyni ola bilməz.")

        # Anbarların mövcudluğunu yoxlayırıq
        src_w = await self.warehouse_service.get_warehouse(data.source_warehouse_id, actor=actor)
        _ = await self.warehouse_service.get_warehouse(data.destination_warehouse_id, actor=actor)

        # Çıxış hüququnu yoxlayırıq
        TransferPolicy.check_transfer_dispatch_access(src_w.branch_id, actor)

        # Şirkət üzrə sistem tranzit anbarını əldə edirik
        in_transit_w = await self.warehouse_service.get_in_transit_warehouse(company_id)

        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)

            transfer_no = await self.numbering.next(
                document_type="stock_transfer",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            total_qty = sum(line.requested_qty for line in data.lines)

            transfer = StockTransfer(
                id=generate_uuid7(),
                company_id=company_id,
                transfer_no=transfer_no,
                source_warehouse_id=data.source_warehouse_id,
                destination_warehouse_id=data.destination_warehouse_id,
                in_transit_warehouse_id=in_transit_w.id,
                status=TransferStatus.DRAFT.value,
                total_lines=len(data.lines),
                total_requested_qty=total_qty,
                total_picked_qty=0,
                total_dispatched_qty=0,
                total_received_qty=0,
                total_cost=Decimal("0.0000"),
                creator_id=getattr(actor, "id", None),
                shipping_method=data.shipping_method,
                tracking_number=data.tracking_number,
                vehicle_no=data.vehicle_no,
                driver_name=data.driver_name,
                notes=data.notes,
                version=1,
            )

            for idx, line_data in enumerate(data.lines, start=1):
                line = StockTransferLine(
                    id=generate_uuid7(),
                    transfer_id=transfer.id,
                    line_no=idx,
                    variant_id=line_data.variant_id,
                    requested_qty=line_data.requested_qty,
                    picked_qty=0,
                    dispatched_qty=0,
                    received_qty=0,
                    damaged_qty=0,
                    missing_qty=0,
                    unit_cost=Decimal("0.0000"),
                    total_cost=Decimal("0.0000"),
                    notes=line_data.notes,
                )
                transfer.lines.append(line)

            created = await repo.create_transfer(transfer)
            tr_loaded = await repo.get_transfer(created.id, with_relations=True)
            await uow.commit()
            return tr_loaded or created

    async def get_transfer(self, transfer_id: uuid.UUID, actor: Any = None) -> StockTransfer:
        """Transfer məlumatlarını əldə edir."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            tr = await repo.get_transfer(transfer_id, with_relations=True)
            if not tr:
                raise NotFoundError("Transfer tapılmadı.")
            return tr

    async def list_transfers(
        self,
        company_id: uuid.UUID,
        status: str | None = None,
        source_warehouse_id: uuid.UUID | None = None,
        destination_warehouse_id: uuid.UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
        actor: Any = None,
    ) -> tuple[list[StockTransfer], int]:
        """Transferlərin siyahısını qaytarır."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            return await repo.list_transfers(
                company_id=company_id,
                status=status,
                source_warehouse_id=source_warehouse_id,
                destination_warehouse_id=destination_warehouse_id,
                date_from=date_from,
                date_to=date_to,
                limit=limit,
                offset=offset,
            )

    # --- 2. Vəziyyət Keçidləri (Submit, Approve, Reject, Pick) ---

    async def submit_transfer(self, transfer_id: uuid.UUID, actor: Any = None) -> StockTransfer:
        """Transferi təsdiqə göndərir (DRAFT -> SUBMITTED)."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            tr = await repo.get_transfer(transfer_id, with_relations=True)
            if not tr:
                raise NotFoundError("Transfer tapılmadı.")

            TransferPolicy.validate_transition(TransferStatus(tr.status), TransferStatus.SUBMITTED)

            tr.status = TransferStatus.SUBMITTED.value
            tr.submitted_at = utc_now()
            tr.version += 1

            tr_loaded = await repo.get_transfer(tr.id, with_relations=True)
            await uow.commit()
            return tr_loaded or tr

    async def approve_transfer(self, transfer_id: uuid.UUID, actor: Any = None) -> StockTransfer:
        """Transferi təsdiqləyir və göndərən anbarda malları rezerv edir (SUBMITTED -> APPROVED)."""
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            tr = await repo.get_transfer(transfer_id, with_relations=True)
            if not tr:
                raise NotFoundError("Transfer tapılmadı.")

            TransferPolicy.validate_transition(TransferStatus(tr.status), TransferStatus.APPROVED)

            # Göndərən anbarda malları rezerv edirik
            for line in tr.lines:
                await self.inventory_service.create_reservation(
                    company_id=tr.company_id,
                    warehouse_id=tr.source_warehouse_id,
                    variant_id=line.variant_id,
                    quantity=line.requested_qty,
                    reference_type="transfer",
                    reference_id=tr.id,
                    reference_line_id=line.id,
                    actor=actor,
                )

            tr.status = TransferStatus.APPROVED.value
            tr.approved_at = utc_now()
            tr.approver_id = getattr(actor, "id", None)
            tr.version += 1

            tr_loaded = await repo.get_transfer(tr.id, with_relations=True)
            await uow.commit()
            return tr_loaded or tr

    async def reject_transfer(
        self, transfer_id: uuid.UUID, reason: str, actor: Any = None
    ) -> StockTransfer:
        """Transferdən imtina edir (SUBMITTED -> REJECTED)."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            tr = await repo.get_transfer(transfer_id, with_relations=True)
            if not tr:
                raise NotFoundError("Transfer tapılmadı.")

            TransferPolicy.validate_transition(TransferStatus(tr.status), TransferStatus.REJECTED)

            # Əgər rezervasiya edilmişdisə, azad edirik
            await self.inventory_service.release_reservations_by_ref("transfer", tr.id)

            tr.status = TransferStatus.REJECTED.value
            tr.cancellation_reason = reason
            tr.version += 1

            tr_loaded = await repo.get_transfer(tr.id, with_relations=True)
            await uow.commit()
            return tr_loaded or tr

    async def pick_transfer(
        self,
        transfer_id: uuid.UUID,
        data: TransferPickRequest,
        actor: Any = None,
    ) -> StockTransfer:
        """Anbardan mal yığımını qeydə alır (APPROVED -> PICKING)."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            tr = await repo.get_transfer(transfer_id, with_relations=True)
            if not tr:
                raise NotFoundError("Transfer tapılmadı.")

            TransferPolicy.validate_transition(TransferStatus(tr.status), TransferStatus.PICKING)

            line_map = {line.id: line for line in tr.lines}
            total_picked = 0

            for p_line in data.lines:
                line = line_map.get(p_line.line_id)
                if not line:
                    raise NotFoundError(f"Transfer sətri ({p_line.line_id}) tapılmadı.")
                line.picked_qty = p_line.picked_qty
                line.short_pick_reason = p_line.short_pick_reason
                total_picked += p_line.picked_qty

            tr.status = TransferStatus.PICKING.value
            tr.total_picked_qty = total_picked
            tr.version += 1

            tr_loaded = await repo.get_transfer(tr.id, with_relations=True)
            await uow.commit()
            return tr_loaded or tr

    # --- 3. Yola Salma (Dispatch - TRANSFER_OUT) ---

    async def dispatch_transfer(
        self,
        transfer_id: uuid.UUID,
        data: TransferDispatchRequest,
        actor: Any = None,
    ) -> StockTransfer:
        """Malları yola salır (TRANSFER_OUT: Mənbə Anbarı -> Tranzit Anbarı).

        Bu addımda mənbə anbarındakı rezervasiyalar azad edilir, mənbə anbarı balansı
        azaldılır, tranzit anbarı balansı artırılır və transfer statusu IN_TRANSIT olur.
        """
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            tr = await repo.get_transfer(transfer_id, with_relations=True)
            if not tr:
                raise NotFoundError("Transfer tapılmadı.")

            TransferPolicy.validate_transition(TransferStatus(tr.status), TransferStatus.IN_TRANSIT)

            # Mənbə filialına çıxış icazəsini yoxlayırıq
            src_w = await self.warehouse_service.get_warehouse(tr.source_warehouse_id, actor=actor)
            TransferPolicy.check_transfer_dispatch_access(src_w.branch_id, actor)

            # Əvvəlki rezervasiyaları azad edirik
            await self.inventory_service.release_reservations_by_ref("transfer", tr.id)

            # Yola salınacaq miqdarları təyin edirik
            dispatch_lines = {
                d_line.line_id: d_line.dispatched_qty for d_line in (data.lines or [])
            }
            movements: list[MovementDraft] = []
            total_dispatched = 0

            for line in tr.lines:
                qty = dispatch_lines.get(line.id)
                if qty is None:
                    # Əgər yığım edilibsə yığılan, yoxsa sifariş edilən miqdar
                    qty = line.picked_qty if line.picked_qty > 0 else line.requested_qty

                if qty <= 0:
                    continue

                line.dispatched_qty = qty
                total_dispatched += qty

                # Mənbə -> Tranzit hərəkəti
                m = MovementDraft(
                    variant_id=line.variant_id,
                    quantity=qty,
                    movement_type=MovementType.TRANSFER_OUT.value,
                    from_warehouse_id=tr.source_warehouse_id,
                    from_status=StockStatus.AVAILABLE.value,
                    to_warehouse_id=tr.in_transit_warehouse_id,
                    to_status=StockStatus.AVAILABLE.value,
                    reference_type="transfer_dispatch",
                    reference_id=tr.id,
                    reference_line_id=line.id,
                    notes=f"Transfer yola salma: {tr.transfer_no}",
                )
                movements.append(m)

            if not movements:
                raise BusinessRuleViolationError(
                    "Yola salmaq üçün ən az bir məhsul sətri tələb olunur."
                )

            # Ledger qeydiyyatı eyni tranzaksiyada
            await self.inventory_service.post(
                session=uow.session,
                company_id=tr.company_id,
                movements=movements,
                user_id=getattr(actor, "id", None),
                actor=actor,
            )

            now = utc_now()
            tr.status = TransferStatus.IN_TRANSIT.value
            tr.dispatched_at = now
            tr.dispatched_by_id = getattr(actor, "id", None)
            tr.total_dispatched_qty = total_dispatched
            if data.shipping_method:
                tr.shipping_method = data.shipping_method
            if data.tracking_number:
                tr.tracking_number = data.tracking_number
            if data.vehicle_no:
                tr.vehicle_no = data.vehicle_no
            if data.driver_name:
                tr.driver_name = data.driver_name
            tr.version += 1

            # Outbox Hadisəsi
            event = TransferDispatchedEvent(
                transfer_id=tr.id,
                transfer_no=tr.transfer_no,
                source_warehouse_id=tr.source_warehouse_id,
                destination_warehouse_id=tr.destination_warehouse_id,
                in_transit_warehouse_id=tr.in_transit_warehouse_id,
                total_dispatched_qty=total_dispatched,
            )
            await record_outbox_event(uow.session, event)

            tr_loaded = await repo.get_transfer(tr.id, with_relations=True)
            await uow.commit()
            return tr_loaded or tr

    # --- 4. Təyinat Anbarında Qəbul (Receive - TRANSFER_IN) ---

    async def receive_transfer(
        self,
        transfer_id: uuid.UUID,
        data: TransferReceiveRequest,
        actor: Any = None,
    ) -> StockTransfer:
        """Təyinat anbarında malları qəbul edir (TRANSFER_IN: Tranzit -> Təyinat Anbarı).

        Sağlam mallar təyinat anbarının 'available' qalığına daxil olur.
        Zədəli mallar təyinat anbarının 'damaged' qalığına daxil olur.
        Çatışmayan/əskik mallar araşdırma aparılana qədər tranzitdə qalır.
        """
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            tr = await repo.get_transfer(transfer_id, with_relations=True)
            if not tr:
                raise NotFoundError("Transfer tapılmadı.")

            # Təyinat filialına çıxış icazəsini yoxlayırıq
            dst_w = await self.warehouse_service.get_warehouse(
                tr.destination_warehouse_id, actor=actor
            )
            TransferPolicy.check_transfer_receive_access(dst_w.branch_id, actor)

            # Qəbul qəbzi nömrəsi alırıq
            receipt_no = await self.numbering.next(
                document_type="transfer_receipt",
                company_id=tr.company_id,
                session=uow.session,
                actor=actor,
            )

            rec_event = TransferReceivingEvent(
                id=generate_uuid7(),
                transfer_id=tr.id,
                receipt_no=receipt_no,
                received_by_id=getattr(actor, "id", None),
                received_at=utc_now(),
                is_final=data.is_final,
                notes=data.notes,
            )

            line_map = {line.id: line for line in tr.lines}
            movements: list[MovementDraft] = []
            total_missing_in_event = 0
            total_damaged_in_event = 0
            total_received_in_event = 0

            for r_line in data.lines:
                line = line_map.get(r_line.line_id)
                if not line:
                    raise NotFoundError(f"Transfer sətri ({r_line.line_id}) tapılmadı.")

                event_line = TransferReceivingLine(
                    id=generate_uuid7(),
                    receiving_event_id=rec_event.id,
                    transfer_line_id=line.id,
                    variant_id=line.variant_id,
                    received_qty=r_line.received_qty,
                    damaged_qty=r_line.damaged_qty,
                    missing_qty=r_line.missing_qty,
                    notes=r_line.notes,
                )
                rec_event.lines.append(event_line)

                line.received_qty += r_line.received_qty
                line.damaged_qty += r_line.damaged_qty
                line.missing_qty += r_line.missing_qty

                total_received_in_event += r_line.received_qty
                total_damaged_in_event += r_line.damaged_qty
                total_missing_in_event += r_line.missing_qty

                # 1. Sağlam malın qəbulu: Tranzit (available) -> Təyinat Anbarı (available)
                if r_line.received_qty > 0:
                    m_rec = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=r_line.received_qty,
                        movement_type=MovementType.TRANSFER_IN.value,
                        from_warehouse_id=tr.in_transit_warehouse_id,
                        from_status=StockStatus.AVAILABLE.value,
                        to_warehouse_id=tr.destination_warehouse_id,
                        to_status=StockStatus.AVAILABLE.value,
                        reference_type="transfer_receive",
                        reference_id=tr.id,
                        reference_line_id=line.id,
                        notes=f"Qəbul aktı: {receipt_no}",
                    )
                    movements.append(m_rec)

                # 2. Zədəli malın qəbulu: Tranzit (available) -> Təyinat Anbarı (damaged)
                if r_line.damaged_qty > 0:
                    m_dmg = MovementDraft(
                        variant_id=line.variant_id,
                        quantity=r_line.damaged_qty,
                        movement_type=MovementType.TRANSFER_IN.value,
                        from_warehouse_id=tr.in_transit_warehouse_id,
                        from_status=StockStatus.AVAILABLE.value,
                        to_warehouse_id=tr.destination_warehouse_id,
                        to_status=StockStatus.DAMAGED.value,
                        reference_type="transfer_receive_damaged",
                        reference_id=tr.id,
                        reference_line_id=line.id,
                        notes=f"Zədəli qəbul: {receipt_no}",
                    )
                    movements.append(m_dmg)

            # Qəbul aktını yadda saxlayırıq
            await repo.create_receiving_event(rec_event)

            # Əgər hərəkətlər varsa, Ledger-ə yazırıq
            if movements:
                await self.inventory_service.post(
                    session=uow.session,
                    company_id=tr.company_id,
                    movements=movements,
                    user_id=getattr(actor, "id", None),
                    actor=actor,
                )

            tr.total_received_qty += total_received_in_event

            # Status keçidini təyin edirik
            if data.is_final:
                tr.status = TransferStatus.RECEIVED.value
                tr.received_at = utc_now()
            else:
                tr.status = TransferStatus.PARTIALLY_RECEIVED.value

            tr.version += 1

            # Hadisələr
            rec_event_domain = TransferReceivedEvent(
                transfer_id=tr.id,
                transfer_no=tr.transfer_no,
                receiving_event_id=rec_event.id,
                destination_warehouse_id=tr.destination_warehouse_id,
                received_qty=total_received_in_event,
                damaged_qty=total_damaged_in_event,
                missing_qty=total_missing_in_event,
                is_final=data.is_final,
            )
            await record_outbox_event(uow.session, rec_event_domain)

            if total_missing_in_event > 0 or total_damaged_in_event > 0:
                disc_event = TransferDiscrepancyEvent(
                    transfer_id=tr.id,
                    transfer_no=tr.transfer_no,
                    total_missing=total_missing_in_event,
                    total_damaged=total_damaged_in_event,
                )
                await record_outbox_event(uow.session, disc_event)

            tr_loaded = await repo.get_transfer(tr.id, with_relations=True)
            await uow.commit()
            return tr_loaded or tr

    # --- 5. Ləğv Etmə (Cancel / Reversal) ---

    async def cancel_transfer(
        self,
        transfer_id: uuid.UUID,
        reason: str,
        actor: Any = None,
    ) -> StockTransfer:
        """Transferi ləğv edir (Yoldadırsa kompensasiya hərəkətləri ilə geri qaytarır)."""
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            tr = await repo.get_transfer(transfer_id, with_relations=True)
            if not tr:
                raise NotFoundError("Transfer tapılmadı.")

            current_status = TransferStatus(tr.status)
            TransferPolicy.validate_transition(current_status, TransferStatus.CANCELLED)

            # Əgər yola salınmayıbsa, sadəcə rezervasiyaları azad edirik
            if current_status in (
                TransferStatus.DRAFT,
                TransferStatus.SUBMITTED,
                TransferStatus.APPROVED,
                TransferStatus.PICKING,
            ):
                await self.inventory_service.release_reservations_by_ref("transfer", tr.id)
            elif current_status in (TransferStatus.DISPATCHED, TransferStatus.IN_TRANSIT):
                # Yolda olan malları Tranzit Anbarından Mənbə Anbarına geri qaytarırıq (RETURN)
                compensating: list[MovementDraft] = []
                for line in tr.lines:
                    rem_in_transit = line.dispatched_qty - line.received_qty
                    if rem_in_transit > 0:
                        m_ret = MovementDraft(
                            variant_id=line.variant_id,
                            quantity=rem_in_transit,
                            movement_type=MovementType.REVERSAL.value,
                            from_warehouse_id=tr.in_transit_warehouse_id,
                            from_status=StockStatus.AVAILABLE.value,
                            to_warehouse_id=tr.source_warehouse_id,
                            to_status=StockStatus.AVAILABLE.value,
                            reference_type="transfer_cancellation",
                            reference_id=tr.id,
                            reference_line_id=line.id,
                            notes=f"Ləğv edilərək geri qaytarıldı: {reason}",
                        )
                        compensating.append(m_ret)

                if compensating:
                    await self.inventory_service.post(
                        session=uow.session,
                        company_id=tr.company_id,
                        movements=compensating,
                        user_id=getattr(actor, "id", None),
                        actor=actor,
                    )

            tr.status = TransferStatus.CANCELLED.value
            tr.cancelled_at = utc_now()
            tr.cancellation_reason = reason
            tr.version += 1

            # Outbox Hadisəsi
            event = TransferCancelledEvent(
                transfer_id=tr.id,
                transfer_no=tr.transfer_no,
                reason=reason,
            )
            await record_outbox_event(uow.session, event)

            tr_loaded = await repo.get_transfer(tr.id, with_relations=True)
            await uow.commit()
            return tr_loaded or tr

    # --- 6. Tranzit Monitorinqi və SLA Hesabatı (In-Transit Aging) ---

    async def get_in_transit_report(
        self,
        company_id: uuid.UUID,
        actor: Any = None,
    ) -> InTransitReportResponse:
        """Tranzitdə olan bütün transferləri və SLA gecikmələrini hesabat şəklində təqdim edir."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = TransfersRepository(uow.session)
            transfers = await repo.list_in_transit_transfers(company_id)

            items: list[InTransitTransferItem] = []
            delayed_count = 0
            total_items = 0

            for tr in transfers:
                is_delayed, days_passed = TransferPolicy.is_transit_delayed(tr.dispatched_at)
                if is_delayed:
                    delayed_count += 1
                    # Gecikmə xəbərdarlıq hadisəsi qeyd edirik
                    alert = TransferAgingAlertEvent(
                        transfer_id=tr.id,
                        transfer_no=tr.transfer_no,
                        days_in_transit=days_passed,
                        threshold_days=2,
                    )
                    await record_outbox_event(uow.session, alert)

                total_items += tr.total_dispatched_qty
                items.append(
                    InTransitTransferItem(
                        transfer_id=tr.id,
                        transfer_no=tr.transfer_no,
                        source_warehouse_id=tr.source_warehouse_id,
                        destination_warehouse_id=tr.destination_warehouse_id,
                        dispatched_at=tr.dispatched_at or tr.created_at,
                        days_in_transit=days_passed,
                        is_delayed=is_delayed,
                        total_dispatched_qty=tr.total_dispatched_qty,
                    )
                )

            return InTransitReportResponse(
                total_in_transit_transfers=len(items),
                total_items_in_transit=total_items,
                delayed_count=delayed_count,
                transfers=items,
            )


# Qlobal servis instansiyası
_transfers_service: TransfersService | None = None


def get_transfers_service() -> TransfersService:
    global _transfers_service
    if _transfers_service is None:
        _transfers_service = TransfersService()
    return _transfers_service
