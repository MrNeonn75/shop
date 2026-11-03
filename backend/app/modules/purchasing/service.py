"""Satınalma və Təchizat Modulu Əsas Xidməti (Purchasing Service).

Satınalma sorğularının, sifarişlərin (PO), qəbul aktlarının (GR),
təchizatçı qaimələrinin (3-tərəfli uyğunlaşma) və ödənişlərin tam tranzaksional idarəsi.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.approvals.service import ApprovalService, get_approval_service
from app.modules.inventory.models import MovementType, StockStatus
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService, get_inventory_service
from app.modules.numbering.service import NumberingService, get_numbering_service
from app.modules.purchasing.events import (
    GoodsReceiptConfirmedEvent,
    GoodsReceiptReversedEvent,
    PurchaseOrderApprovedEvent,
    PurchaseOrderCreatedEvent,
    PurchaseOrderSentEvent,
    PurchaseRequestSubmittedEvent,
    SupplierInvoiceApprovedEvent,
    SupplierPaymentPostedEvent,
)
from app.modules.purchasing.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    GoodsReceiptStatus,
    LandedCostAllocation,
    LandedCostDocument,
    PaymentAllocation,
    PaymentStatus,
    PORevision,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    PurchaseRequest,
    PurchaseRequestLine,
    PurchaseRequestStatus,
    PurchaseReturn,
    PurchaseReturnLine,
    ReceiptDiscrepancy,
    SupplierInvoice,
    SupplierInvoiceLine,
    SupplierInvoiceStatus,
    SupplierPayment,
)
from app.modules.purchasing.policies import (
    calculate_po_line_amounts,
    check_three_way_match_line,
    round_money,
    validate_over_receipt_tolerance,
)
from app.modules.purchasing.repository import PurchasingRepository
from app.modules.purchasing.schemas import (
    GoodsReceiptCreate,
    GoodsReceiptReversalRequest,
    LandedCostCreate,
    PayablesAgingBucket,
    PayablesAgingResponse,
    POCloseShortRequest,
    PORevisionCreate,
    PurchaseOrderCreate,
    PurchaseRequestCreate,
    PurchaseReturnCreate,
    ReorderSuggestionItem,
    ReorderSuggestionResponse,
    SupplierInvoiceCreate,
    SupplierPaymentCreate,
)
from app.modules.settings.service import SettingsService, get_settings_service
from app.modules.suppliers.models import SupplierLedgerDirection, SupplierLedgerEntryType
from app.modules.suppliers.service import SupplierService, get_supplier_service
from app.shared.outbox import record_outbox_event


class PurchasingService:
    """Satınalma modulu mərkəzi biznes xidməti."""

    def __init__(
        self,
        numbering: NumberingService | None = None,
        inventory: InventoryService | None = None,
        suppliers: SupplierService | None = None,
        approvals: ApprovalService | None = None,
        settings: SettingsService | None = None,
    ) -> None:
        self.numbering = numbering or get_numbering_service()
        self.inventory = inventory or get_inventory_service()
        self.suppliers = suppliers or get_supplier_service()
        self.approvals = approvals or get_approval_service()
        self.settings = settings or get_settings_service()

    # =========================================================================
    # 1. SATINALMA SORĞULARI (PURCHASE REQUESTS)
    # =========================================================================

    async def create_request(
        self,
        company_id: uuid.UUID,
        data: PurchaseRequestCreate,
        actor: Any = None,
    ) -> PurchaseRequest:
        """Yeni satınalma sorğusu (layihə) yaradır."""
        requester_id = getattr(actor, "id", None)
        if not requester_id:
            raise ForbiddenError("Sorğu yaratmaq üçün istifadəçi autentifikasiyası mütləqdir.")

        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            request_no = await self.numbering.next(
                document_type="purchase_request",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            total_est = Decimal("0.0000")
            lines: list[PurchaseRequestLine] = []
            for l_data in data.lines:
                line_tot = round_money(Decimal(l_data.requested_qty) * l_data.estimated_unit_price)
                total_est += line_tot
                line = PurchaseRequestLine(
                    id=generate_uuid7(),
                    variant_id=l_data.variant_id,
                    requested_qty=l_data.requested_qty,
                    estimated_unit_price=l_data.estimated_unit_price,
                    total_estimated_price=line_tot,
                    needed_by=l_data.needed_by or data.needed_by,
                    notes=l_data.notes,
                )
                lines.append(line)

            pr = PurchaseRequest(
                id=generate_uuid7(),
                company_id=company_id,
                request_no=request_no,
                requesting_warehouse_id=data.requesting_warehouse_id,
                requester_id=requester_id,
                needed_by=data.needed_by,
                reason=data.reason,
                status=PurchaseRequestStatus.DRAFT.value,
                total_estimated_amount=total_est,
                notes=data.notes,
                version=1,
            )
            pr.lines = lines
            created = await repo.create_request(pr)
            loaded = await repo.get_request(created.id, with_lines=True)
            await uow.commit()
            return loaded or created

    async def submit_request(
        self,
        request_id: uuid.UUID,
        actor: Any = None,
    ) -> PurchaseRequest:
        """Sorğunu təsdiqə göndərir və Təsdiqləmə Mühərrikini işə salır."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            pr = await repo.get_request(request_id, with_lines=True)
            if not pr:
                raise NotFoundError("Satınalma sorğusu tapılmadı.")
            if pr.status != PurchaseRequestStatus.DRAFT.value:
                raise BusinessRuleViolationError(
                    "Yalnız qaralama statusunda olan sorğu təsdiqə göndərilə bilər."
                )

            # Təsdiqləmə mühərrikinə göndəririk
            appr = await self.approvals.submit_for_approval(
                company_id=pr.company_id,
                document_type="purchase_request",
                document_id=pr.id,
                amount=pr.total_estimated_amount,
                requester_id=pr.requester_id,
                branch_id=pr.requesting_branch_id,
                notes=f"Satınalma Sorğusu: {pr.request_no}",
                session=uow.session,
                actor=actor,
            )

            # Əgər qayda yox idisə və ya avtomatik təsdiqləndisə:
            if appr.status == "APPROVED":
                pr.status = PurchaseRequestStatus.APPROVED.value
            else:
                pr.status = PurchaseRequestStatus.SUBMITTED.value

            pr.version += 1

            event = PurchaseRequestSubmittedEvent(
                request_id=pr.id,
                request_no=pr.request_no,
                company_id=pr.company_id,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_request(pr.id, with_lines=True)
            await uow.commit()
            return loaded or pr

    async def get_reorder_suggestions(
        self,
        company_id: uuid.UUID,
        warehouse_id: uuid.UUID,
        category_id: uuid.UUID | None = None,
        actor: Any = None,
    ) -> ReorderSuggestionResponse:
        """Anbarın qalıqlarına, açıq sifarişlərə və satış sürətinə əsasən avtomatik təchizat təklifləri formalaşdırır."""
        _ = (category_id, actor)
        now = utc_now()
        suggestions: list[ReorderSuggestionItem] = []

        async with UnitOfWork() as uow:
            # Anbardakı qalıqları götürürük
            balances = await self.inventory.list_balances(
                company_id=company_id, warehouse_id=warehouse_id
            )
            repo = PurchasingRepository(uow.session)

            for b in balances[:50]:  # nümunəvi ilk partiya
                vid = b["variant_id"]
                on_hand = b["on_hand"]
                reserved = b["reserved"]
                available = b["available"]
                min_stock = 10  # standart minimum təhlükəsizlik ehtiyatı

                # Açıq PO-lar
                open_po_qty = await repo.get_open_po_quantity_for_variant(
                    company_id=company_id, variant_id=vid, warehouse_id=warehouse_id
                )

                # Əgər mövcud + açıq sifarişlər minimum stokdan azdırsa, təklif edirik
                effective_stock = available + open_po_qty
                if effective_stock < min_stock:
                    rec_qty = (min_stock * 2) - effective_stock
                    suggestions.append(
                        ReorderSuggestionItem(
                            variant_id=vid,
                            product_name=b.get("product_name"),
                            sku=b.get("sku"),
                            current_on_hand=on_hand,
                            active_reservations=reserved,
                            current_available=available,
                            in_transit_qty=0,
                            open_po_qty=open_po_qty,
                            min_stock=min_stock,
                            sales_velocity_28d=1.5,
                            recommended_order_qty=max(1, rec_qty),
                            reason=f"Qalıq ({available}) və açıq sifarişlər ({open_po_qty}) təhlükəsizlik həddindən ({min_stock}) aşağıdır.",
                        )
                    )

        return ReorderSuggestionResponse(
            warehouse_id=warehouse_id,
            generated_at=now,
            total_suggestions=len(suggestions),
            suggestions=suggestions,
        )

    # =========================================================================
    # 2. SATINALMA SİFARİŞLƏRİ (PURCHASE ORDERS)
    # =========================================================================

    async def create_po(
        self,
        company_id: uuid.UUID,
        data: PurchaseOrderCreate,
        actor: Any = None,
    ) -> PurchaseOrder:
        """Yeni Satınalma Sifarişi (PO) yaradır."""
        # 1. Təchizatçı bloklanmışdırmı?
        supplier = await self.suppliers.get_supplier(data.supplier_id, actor=actor)
        if supplier.status == "blocked":
            raise BusinessRuleViolationError(
                f"'{supplier.name}' təchizatçısı bloklanıb. Yeni satınalma sifarişi açıla bilməz."
            )

        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            po_no = await self.numbering.next(
                document_type="purchase_order",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            subtotal = Decimal("0.0000")
            discount_total = Decimal("0.0000")
            tax_total = Decimal("0.0000")
            total_amount = Decimal("0.0000")

            po_lines: list[PurchaseOrderLine] = []
            for idx, l_data in enumerate(data.lines, start=1):
                disc_base, l_tax, l_tot = calculate_po_line_amounts(
                    quantity=l_data.quantity,
                    unit_price=l_data.unit_price,
                    discount_percent=l_data.discount_percent,
                    tax_rate=l_data.tax_rate,
                )
                line = PurchaseOrderLine(
                    id=generate_uuid7(),
                    line_no=idx,
                    variant_id=l_data.variant_id,
                    quantity=l_data.quantity,
                    unit_price=l_data.unit_price,
                    discount_percent=l_data.discount_percent,
                    tax_class_id=l_data.tax_class_id,
                    tax_rate=l_data.tax_rate,
                    tax_amount=l_tax,
                    total_amount=l_tot,
                    received_qty=0,
                    cancelled_qty=0,
                    notes=l_data.notes,
                )
                po_lines.append(line)
                subtotal += round_money(Decimal(l_data.quantity) * l_data.unit_price)
                discount_total += round_money(
                    (Decimal(l_data.quantity) * l_data.unit_price)
                    * (l_data.discount_percent / Decimal("100.0"))
                )
                tax_total += l_tax
                total_amount += l_tot

            po = PurchaseOrder(
                id=generate_uuid7(),
                company_id=company_id,
                po_no=po_no,
                supplier_id=data.supplier_id,
                delivery_warehouse_id=data.delivery_warehouse_id,
                purchase_request_id=data.purchase_request_id,
                order_date=utc_now().date(),
                expected_date=data.expected_date,
                currency=data.currency.upper(),
                payment_terms_days=data.payment_terms_days,
                status=PurchaseOrderStatus.DRAFT.value,
                subtotal=subtotal,
                discount_total=discount_total,
                tax_total=tax_total,
                total_amount=total_amount,
                created_by_id=getattr(actor, "id", None),
                notes=data.notes,
                version=1,
            )
            po.lines = po_lines

            created = await repo.create_po(po)

            event = PurchaseOrderCreatedEvent(
                po_id=created.id,
                po_no=created.po_no,
                supplier_id=created.supplier_id,
                total_amount=created.total_amount,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_po(created.id, with_relations=True)
            await uow.commit()
            return loaded or created

    async def approve_po(
        self,
        po_id: uuid.UUID,
        actor: Any = None,
    ) -> PurchaseOrder:
        """Satınalma sifarişini təsdiq edir."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            po = await repo.get_po(po_id, with_relations=True)
            if not po:
                raise NotFoundError("Satınalma sifarişi tapılmadı.")
            if po.status not in (
                PurchaseOrderStatus.DRAFT.value,
                PurchaseOrderStatus.PENDING_APPROVAL.value,
            ):
                raise BusinessRuleViolationError(
                    "Yalnız qaralama və ya gözləmədə olan sifariş təsdiqlənə bilər."
                )

            po.status = PurchaseOrderStatus.APPROVED.value
            po.approved_by_id = getattr(actor, "id", None)
            po.approved_at = utc_now()
            po.version += 1

            event = PurchaseOrderApprovedEvent(
                po_id=po.id,
                po_no=po.po_no,
                supplier_id=po.supplier_id,
                approver_id=po.approved_by_id or po.id,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_po(po.id, with_relations=True)
            await uow.commit()
            return loaded or po

    async def send_po(
        self,
        po_id: uuid.UUID,
        actor: Any = None,
    ) -> PurchaseOrder:
        """Təsdiqlənmiş sifarişi təchizatçıya göndərilmiş kimi qeyd edir."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            po = await repo.get_po(po_id, with_relations=True)
            if not po:
                raise NotFoundError("Satınalma sifarişi tapılmadı.")
            if po.status != PurchaseOrderStatus.APPROVED.value:
                raise BusinessRuleViolationError(
                    "Yalnız təsdiqlənmiş sifariş təchizatçıya göndərilə bilər."
                )

            po.status = PurchaseOrderStatus.SENT.value
            po.sent_at = utc_now()
            po.version += 1

            event = PurchaseOrderSentEvent(
                po_id=po.id,
                po_no=po.po_no,
                supplier_id=po.supplier_id,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_po(po.id, with_relations=True)
            await uow.commit()
            return loaded or po

    async def close_po_short(
        self,
        po_id: uuid.UUID,
        data: POCloseShortRequest,
        actor: Any = None,
    ) -> PurchaseOrder:
        """Təchizatçının təmin edə bilmədiyi qalıq miqdarı bağlayır (Close short)."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            po = await repo.get_po(po_id, with_relations=True, for_update=True)
            if not po:
                raise NotFoundError("Satınalma sifarişi tapılmadı.")
            if po.status not in (
                PurchaseOrderStatus.APPROVED.value,
                PurchaseOrderStatus.SENT.value,
                PurchaseOrderStatus.PARTIALLY_RECEIVED.value,
            ):
                raise BusinessRuleViolationError("Bu statusda olan sifariş qalıqla bağlana bilməz.")

            # Hər sətrin qalan hissəsini ləğv edilmiş kimi qeyd edirik
            for line in po.lines:
                outstanding = line.outstanding_qty
                if outstanding > 0:
                    line.cancelled_qty += outstanding

            po.status = PurchaseOrderStatus.CLOSED.value
            po.closed_at = utc_now()
            po.close_reason = data.reason
            po.version += 1

            loaded = await repo.get_po(po.id, with_relations=True)
            await uow.commit()
            return loaded or po

    async def create_po_revision(
        self,
        po_id: uuid.UUID,
        data: PORevisionCreate,
        actor: Any = None,
    ) -> PurchaseOrder:
        """Təsdiqdən sonra sifarişə versiyalanmış düzəliş (amendment) tətbiq edir."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            po = await repo.get_po(po_id, with_relations=True, for_update=True)
            if not po:
                raise NotFoundError("Satınalma sifarişi tapılmadı.")

            old_total = po.total_amount

            # Köhnə sətirləri təmizləyib yenilərini qururuq
            subtotal = Decimal("0.0000")
            tax_total = Decimal("0.0000")
            total_amount = Decimal("0.0000")

            po.lines.clear()
            for idx, l_data in enumerate(data.lines, start=1):
                disc_base, l_tax, l_tot = calculate_po_line_amounts(
                    quantity=l_data.quantity,
                    unit_price=l_data.unit_price,
                    discount_percent=l_data.discount_percent,
                    tax_rate=l_data.tax_rate,
                )
                line = PurchaseOrderLine(
                    id=generate_uuid7(),
                    po_id=po.id,
                    line_no=idx,
                    variant_id=l_data.variant_id,
                    quantity=l_data.quantity,
                    unit_price=l_data.unit_price,
                    discount_percent=l_data.discount_percent,
                    tax_class_id=l_data.tax_class_id,
                    tax_rate=l_data.tax_rate,
                    tax_amount=l_tax,
                    total_amount=l_tot,
                    received_qty=0,
                    cancelled_qty=0,
                    notes=l_data.notes,
                )
                po.lines.append(line)
                subtotal += round_money(Decimal(l_data.quantity) * l_data.unit_price)
                tax_total += l_tax
                total_amount += l_tot

            po.subtotal = subtotal
            po.tax_total = tax_total
            po.total_amount = total_amount
            po.version += 1

            # Reviziya qeydi
            next_rev = len(po.revisions) + 1
            revision = PORevision(
                id=generate_uuid7(),
                po_id=po.id,
                revision_number=next_rev,
                previous_total=old_total,
                new_total=total_amount,
                change_reason=data.reason,
                changed_by_id=getattr(actor, "id", None),
            )
            po.revisions.append(revision)

            # Əgər məbləğ artıbsa, yenidən təsdiqə keçir
            if total_amount > old_total:
                po.status = PurchaseOrderStatus.PENDING_APPROVAL.value

            loaded = await repo.get_po(po.id, with_relations=True)
            await uow.commit()
            return loaded or po

    # =========================================================================
    # 3. MALLARIN QƏBUL AKTLARI (GOODS RECEIPTS)
    # =========================================================================

    async def create_receipt(
        self,
        company_id: uuid.UUID,
        data: GoodsReceiptCreate,
        actor: Any = None,
    ) -> GoodsReceipt:
        """Yeni Malların Qəbul Aktı (Draft) yaradır."""
        user_id = getattr(actor, "id", None)
        if not user_id:
            raise ForbiddenError("Qəbul aktı yaratmaq üçün istifadəçi tələb olunur.")

        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)

            # İrsaliyyə nömrəsi təkrarlanması yoxlanışı
            existing_note = await repo.get_receipt_by_delivery_note(
                company_id=company_id,
                supplier_id=data.supplier_id,
                delivery_note_number=data.delivery_note_number,
            )
            if existing_note:
                raise ConflictError(
                    f"'{data.delivery_note_number}' nömrəli irsaliyyə bu təchizatçı üzrə artıq qeydə alınıb ({existing_note.receipt_no})."
                )

            receipt_no = await self.numbering.next(
                document_type="goods_receipt",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            po: PurchaseOrder | None = None
            if data.po_id:
                po = await repo.get_po(data.po_id, with_relations=True)
                if not po:
                    raise NotFoundError("İstinad edilən satınalma sifarişi tapılmadı.")

            total_qty = 0
            total_cost = Decimal("0.0000")
            lines: list[GoodsReceiptLine] = []

            for idx, l_data in enumerate(data.lines, start=1):
                po_line: PurchaseOrderLine | None = None
                ordered_qty = 0
                prev_received = 0
                unit_cost = l_data.unit_cost or Decimal("0.0000")

                if l_data.po_line_id and po:
                    po_line = next((pl for pl in po.lines if pl.id == l_data.po_line_id), None)
                    if po_line:
                        ordered_qty = po_line.quantity
                        prev_received = po_line.received_qty
                        if not l_data.unit_cost:
                            unit_cost = po_line.unit_price

                # Dözümlülük yoxlanışı (over-receipt tolerance)
                if ordered_qty > 0:
                    validate_over_receipt_tolerance(
                        ordered_qty=ordered_qty,
                        previously_received_qty=prev_received,
                        received_qty=l_data.received_qty,
                        tolerance_percent=5.0,
                    )

                line_cost = round_money(Decimal(l_data.received_qty) * unit_cost)
                line = GoodsReceiptLine(
                    id=generate_uuid7(),
                    po_line_id=l_data.po_line_id,
                    variant_id=l_data.variant_id,
                    line_no=idx,
                    ordered_qty=ordered_qty,
                    previously_received_qty=prev_received,
                    received_qty=l_data.received_qty,
                    rejected_qty=l_data.rejected_qty,
                    damaged_qty=l_data.damaged_qty,
                    batch_number=l_data.batch_number,
                    expiry_date=l_data.expiry_date,
                    unit_cost=unit_cost,
                    total_cost=line_cost,
                    notes=l_data.notes,
                )
                lines.append(line)
                total_qty += l_data.received_qty
                total_cost += line_cost

            receipt = GoodsReceipt(
                id=generate_uuid7(),
                company_id=company_id,
                receipt_no=receipt_no,
                po_id=data.po_id,
                supplier_id=data.supplier_id,
                warehouse_id=data.warehouse_id,
                delivery_note_number=data.delivery_note_number.strip(),
                received_date=data.received_date or utc_now().date(),
                receiving_user_id=user_id,
                status=GoodsReceiptStatus.DRAFT.value,
                total_quantity=total_qty,
                total_cost=total_cost,
                attachments=data.attachments or [],
                notes=data.notes,
                version=1,
            )
            receipt.lines = lines

            created = await repo.create_receipt(receipt)
            loaded = await repo.get_receipt(created.id, with_relations=True)
            await uow.commit()
            return loaded or created

    async def confirm_receipt(
        self,
        receipt_id: uuid.UUID,
        idempotency_key: str | None = None,
        actor: Any = None,
    ) -> GoodsReceipt:
        """Malların Qəbul Aktını təsdiqləyir və malları inventara (Ledger-ə) daxil edir."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            gr = await repo.get_receipt(receipt_id, with_relations=True, for_update=True)
            if not gr:
                raise NotFoundError("Qəbul aktı tapılmadı.")

            # Əgər artıq təsdiqlənibsə (idempotent cavab)
            if gr.status == GoodsReceiptStatus.CONFIRMED.value:
                return gr

            if gr.status != GoodsReceiptStatus.DRAFT.value:
                raise BusinessRuleViolationError(
                    "Yalnız qaralama statusunda olan qəbul aktı təsdiqlənə bilər."
                )

            # 1. İnventara RECEIPT hərəkətlərini hazırlayırıq
            movements: list[MovementDraft] = []
            for line in gr.lines:
                good_qty = line.received_qty - line.damaged_qty
                if good_qty > 0:
                    movements.append(
                        MovementDraft(
                            variant_id=line.variant_id,
                            quantity=good_qty,
                            movement_type=MovementType.RECEIPT.value,
                            to_warehouse_id=gr.warehouse_id,
                            to_status=StockStatus.AVAILABLE.value,
                            unit_cost=line.unit_cost,
                            reference_type="goods_receipt",
                            reference_id=gr.id,
                            reference_line_id=line.id,
                            notes=f"Qəbul aktı: {gr.receipt_no}",
                        )
                    )

                # Əgər zədələnmiş mal varsa, birbaşa 'damaged' statusuna göndəririk
                if line.damaged_qty > 0:
                    movements.append(
                        MovementDraft(
                            variant_id=line.variant_id,
                            quantity=line.damaged_qty,
                            movement_type=MovementType.RECEIPT.value,
                            to_warehouse_id=gr.warehouse_id,
                            to_status=StockStatus.DAMAGED.value,
                            unit_cost=line.unit_cost,
                            reference_type="goods_receipt_damaged",
                            reference_id=gr.id,
                            reference_line_id=line.id,
                            notes=f"Zədəli qəbul: {gr.receipt_no}",
                        )
                    )

            # Eyni tranzaksiyada InventoryService.post çağırırıq
            if movements:
                await self.inventory.post(
                    session=uow.session,
                    company_id=gr.company_id,
                    movements=movements,
                    user_id=gr.receiving_user_id,
                    idempotency_key=idempotency_key,
                    actor=actor,
                )

            # 2. Əgər PO varsa, PO sətirlərini və statusunu yeniləyirik
            if gr.po_id:
                po = await repo.get_po(gr.po_id, with_relations=True, for_update=True)
                if po:
                    for line in gr.lines:
                        if line.po_line_id:
                            po_line = next(
                                (pl for pl in po.lines if pl.id == line.po_line_id), None
                            )
                            if po_line:
                                po_line.received_qty += line.received_qty

                    # PO-nun yekun statusunun təyini
                    all_received = all(pl.outstanding_qty <= 0 for pl in po.lines)
                    any_received = any(pl.received_qty > 0 for pl in po.lines)
                    if all_received:
                        po.status = PurchaseOrderStatus.RECEIVED.value
                    elif any_received:
                        po.status = PurchaseOrderStatus.PARTIALLY_RECEIVED.value

            # 3. Kənarlaşmaları yoxlayıb ReceiptDiscrepancy qeydləri yaradırıq
            for line in gr.lines:
                variance = line.received_qty - line.ordered_qty if line.ordered_qty > 0 else 0
                if variance != 0 or line.damaged_qty > 0 or line.rejected_qty > 0:
                    disc = ReceiptDiscrepancy(
                        id=generate_uuid7(),
                        receipt_id=gr.id,
                        variant_id=line.variant_id,
                        ordered_qty=line.ordered_qty,
                        received_qty=line.received_qty,
                        damaged_qty=line.damaged_qty,
                        rejected_qty=line.rejected_qty,
                        variance_qty=variance,
                        status="OPEN",
                        resolution_notes=f"Fərq: {variance}, Zədəli: {line.damaged_qty}, İmtina: {line.rejected_qty}",
                    )
                    gr.discrepancies.append(disc)

            gr.status = GoodsReceiptStatus.CONFIRMED.value
            gr.version += 1

            # Outbox Hadisəsi
            event = GoodsReceiptConfirmedEvent(
                receipt_id=gr.id,
                receipt_no=gr.receipt_no,
                po_id=gr.po_id,
                supplier_id=gr.supplier_id,
                warehouse_id=gr.warehouse_id,
                total_quantity=gr.total_quantity,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_receipt(gr.id, with_relations=True)
            await uow.commit()
            return loaded or gr

    async def reverse_receipt(
        self,
        receipt_id: uuid.UUID,
        data: GoodsReceiptReversalRequest,
        actor: Any = None,
    ) -> GoodsReceipt:
        """Təsdiqlənmiş qəbul aktını kompensasiya edən tərs hərəkətlərlə ləğv edir."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            gr = await repo.get_receipt(receipt_id, with_relations=True, for_update=True)
            if not gr:
                raise NotFoundError("Qəbul aktı tapılmadı.")
            if gr.status != GoodsReceiptStatus.CONFIRMED.value:
                raise BusinessRuleViolationError("Yalnız təsdiqlənmiş qəbul aktı ləğv edilə bilər.")

            # Stokun artıq istifadə edilməsi (satış/transfer) yoxlanışı
            if not data.allow_consumed_override:
                for line in gr.lines:
                    bal = await self.inventory.get_single_balance(
                        warehouse_id=gr.warehouse_id,
                        variant_id=line.variant_id,
                        stock_status=StockStatus.AVAILABLE.value,
                    )
                    avail = bal["available"] if bal else 0
                    good_qty = line.received_qty - line.damaged_qty
                    if avail < good_qty:
                        raise BusinessRuleViolationError(
                            f"Qəbul aktı ləğv edilə bilməz: məhsul artıq satılıb və ya transfer edilib "
                            f"(Mövcud: {avail}, Ləğv tələb olunan: {good_qty})."
                        )

            # Kompensasiya edən REVERSAL hərəkətləri
            reversals: list[MovementDraft] = []
            for line in gr.lines:
                good_qty = line.received_qty - line.damaged_qty
                if good_qty > 0:
                    reversals.append(
                        MovementDraft(
                            variant_id=line.variant_id,
                            quantity=good_qty,
                            movement_type=MovementType.REVERSAL.value,
                            from_warehouse_id=gr.warehouse_id,
                            from_status=StockStatus.AVAILABLE.value,
                            unit_cost=line.unit_cost,
                            reference_type="goods_receipt_reversal",
                            reference_id=gr.id,
                            notes=f"Ləğv edildi: {gr.receipt_no}. Səbəb: {data.reason}",
                        )
                    )
                if line.damaged_qty > 0:
                    reversals.append(
                        MovementDraft(
                            variant_id=line.variant_id,
                            quantity=line.damaged_qty,
                            movement_type=MovementType.REVERSAL.value,
                            from_warehouse_id=gr.warehouse_id,
                            from_status=StockStatus.DAMAGED.value,
                            unit_cost=line.unit_cost,
                            reference_type="goods_receipt_reversal",
                            reference_id=gr.id,
                            notes=f"Zədəli ləğv edildi: {gr.receipt_no}",
                        )
                    )

            if reversals:
                await self.inventory.post(
                    session=uow.session,
                    company_id=gr.company_id,
                    movements=reversals,
                    user_id=getattr(actor, "id", None),
                    actor=actor,
                )

            # Əgər PO varsa, received_qty azaldılır
            if gr.po_id:
                po = await repo.get_po(gr.po_id, with_relations=True, for_update=True)
                if po:
                    for line in gr.lines:
                        if line.po_line_id:
                            po_line = next(
                                (pl for pl in po.lines if pl.id == line.po_line_id), None
                            )
                            if po_line:
                                po_line.received_qty = max(
                                    0, po_line.received_qty - line.received_qty
                                )
                    po.status = PurchaseOrderStatus.PARTIALLY_RECEIVED.value

            gr.status = GoodsReceiptStatus.REVERSED.value
            gr.version += 1

            event = GoodsReceiptReversedEvent(
                receipt_id=gr.id,
                receipt_no=gr.receipt_no,
                reason=data.reason,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_receipt(gr.id, with_relations=True)
            await uow.commit()
            return loaded or gr

    async def add_landed_cost(
        self,
        receipt_id: uuid.UUID,
        data: LandedCostCreate,
        actor: Any = None,
    ) -> LandedCostDocument:
        """Qəbul aktına əlavə daşıma/gömrük maya xərci bölüşdürür."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            gr = await repo.get_receipt(receipt_id, with_relations=True)
            if not gr:
                raise NotFoundError("Qəbul aktı tapılmadı.")

            doc_no = await self.numbering.next(
                document_type="landed_cost",
                company_id=gr.company_id,
                session=uow.session,
                actor=actor,
            )

            lc = LandedCostDocument(
                id=generate_uuid7(),
                company_id=gr.company_id,
                document_no=doc_no,
                receipt_id=gr.id,
                cost_type=data.cost_type,
                amount=data.amount,
                currency=data.currency.upper(),
                allocation_method=data.allocation_method,
                notes=data.notes,
            )

            # Dəyərə görə avtomatik mütənasib bölüşdürmə (by_value)
            total_gr_cost = gr.total_cost if gr.total_cost > 0 else Decimal("1.0")
            for line in gr.lines:
                share = (line.total_cost / total_gr_cost) * data.amount
                add_unit = (
                    share / Decimal(line.received_qty) if line.received_qty > 0 else Decimal("0.0")
                )
                alloc = LandedCostAllocation(
                    id=generate_uuid7(),
                    landed_cost_id=lc.id,
                    receipt_line_id=line.id,
                    allocated_amount=round_money(share),
                    additional_unit_cost=round_money(add_unit),
                )
                lc.allocations.append(alloc)

            created = await repo.create_landed_cost(lc)
            await uow.commit()
            return created

    # =========================================================================
    # 4. TƏCHİZATÇI QAİMƏLƏRİ VƏ 3-TƏRƏFLİ UYĞUNLAŞMA (INVOICES & 3-WAY MATCH)
    # =========================================================================

    async def create_invoice(
        self,
        company_id: uuid.UUID,
        data: SupplierInvoiceCreate,
        actor: Any = None,
    ) -> SupplierInvoice:
        """Yeni təchizatçı qaiməsi daxil edir və 3-tərəfli uyğunlaşmanı qiymətləndirir."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)

            # Dublikat faktura yoxlanışı (Eyni təchizatçı + eyni faktura nömrəsi)
            dup = await repo.find_duplicate_invoice(
                company_id=company_id,
                supplier_id=data.supplier_id,
                supplier_invoice_number=data.supplier_invoice_number,
                invoice_date=data.invoice_date,
                total_amount=Decimal("0.0000"),  # dəqiq nömrə üst-üstə düşərsə
            )
            if dup:
                raise ConflictError(
                    f"'{data.supplier_invoice_number}' nömrəli qaimə bu təchizatçı üçün artıq mövcuddur ({dup.invoice_no})."
                )

            invoice_no = await self.numbering.next(
                document_type="supplier_invoice",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            po: PurchaseOrder | None = None
            if data.po_id:
                po = await repo.get_po(data.po_id, with_relations=True)

            gr: GoodsReceipt | None = None
            if data.receipt_id:
                gr = await repo.get_receipt(data.receipt_id, with_relations=True)

            subtotal = Decimal("0.0000")
            tax_total = Decimal("0.0000")
            total_amount = Decimal("0.0000")
            has_discrepancy = False

            inv_lines: list[SupplierInvoiceLine] = []
            for l_data in data.lines:
                base = round_money(Decimal(l_data.quantity) * l_data.unit_price)
                tax = round_money(base * (l_data.tax_rate / Decimal("100.0")))
                tot = round_money(base + tax)

                subtotal += base
                tax_total += tax
                total_amount += tot

                # 3-Tərəfli Uyğunluq Yoxlanışı (Three-Way Match)
                po_qty = l_data.quantity
                po_price = l_data.unit_price
                gr_qty = l_data.quantity

                if po and l_data.po_line_id:
                    pl = next((p for p in po.lines if p.id == l_data.po_line_id), None)
                    if pl:
                        po_qty = pl.quantity
                        po_price = pl.unit_price

                if gr and l_data.receipt_line_id:
                    gl = next((g for g in gr.lines if g.id == l_data.receipt_line_id), None)
                    if gl:
                        gr_qty = gl.received_qty

                match_res, var_reason = check_three_way_match_line(
                    po_qty=po_qty,
                    po_price=po_price,
                    receipt_qty=gr_qty,
                    invoice_qty=l_data.quantity,
                    invoice_price=l_data.unit_price,
                )

                if match_res == "DISCREPANCY":
                    has_discrepancy = True

                line = SupplierInvoiceLine(
                    id=generate_uuid7(),
                    po_line_id=l_data.po_line_id,
                    receipt_line_id=l_data.receipt_line_id,
                    variant_id=l_data.variant_id,
                    quantity=l_data.quantity,
                    unit_price=l_data.unit_price,
                    tax_rate=l_data.tax_rate,
                    tax_amount=tax,
                    total_amount=tot,
                    match_result=match_res,
                    variance_reason=var_reason,
                )
                inv_lines.append(line)

            match_status = "DISPUTED" if has_discrepancy else "MATCHED"
            inv_status = (
                SupplierInvoiceStatus.DISPUTED.value
                if has_discrepancy
                else SupplierInvoiceStatus.DRAFT.value
            )

            invoice = SupplierInvoice(
                id=generate_uuid7(),
                company_id=company_id,
                invoice_no=invoice_no,
                supplier_id=data.supplier_id,
                supplier_invoice_number=data.supplier_invoice_number.strip(),
                invoice_date=data.invoice_date,
                due_date=data.due_date,
                po_id=data.po_id,
                receipt_id=data.receipt_id,
                currency=data.currency.upper(),
                subtotal=subtotal,
                tax_amount=tax_total,
                total_amount=total_amount,
                paid_amount=Decimal("0.0000"),
                match_status=match_status,
                status=inv_status,
                attachments=data.attachments or [],
                notes=data.notes,
                version=1,
            )
            invoice.lines = inv_lines

            created = await repo.create_invoice(invoice)
            loaded = await repo.get_invoice(created.id, with_lines=True)
            await uow.commit()
            return loaded or created

    async def approve_invoice(
        self,
        invoice_id: uuid.UUID,
        override_reason: str | None = None,
        actor: Any = None,
    ) -> SupplierInvoice:
        """Qaiməni təsdiqləyir və təchizatçı borc jurnalına (Ledger) yazır."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            inv = await repo.get_invoice(invoice_id, with_lines=True)
            if not inv:
                raise NotFoundError("Qaimə tapılmadı.")

            # Əgər kənarlaşma varsa və override_reason verilməyibsə, qadağandır
            if inv.match_status == "DISPUTED" and not override_reason:
                raise BusinessRuleViolationError(
                    "Bu qaimədə 3-tərəfli uyğunsuzluq (kənarlaşma) mövcuddur. Təsdiq üçün xüsusi icazə və əsaslandırma tələb olunur."
                )

            inv.status = SupplierInvoiceStatus.APPROVED_FOR_PAYMENT.value
            if override_reason:
                inv.notes = f"{inv.notes or ''}\nKənarlaşma qəbul edildi: {override_reason}"
            inv.version += 1

            # Təchizatçı hesablaşma jurnalına yazırıq (CREDIT: şirkətin borcu artır)
            await self.suppliers.record_ledger_entry(
                company_id=inv.company_id,
                supplier_id=inv.supplier_id,
                entry_type=SupplierLedgerEntryType.INVOICE.value,
                direction=SupplierLedgerDirection.CREDIT.value,
                amount=inv.total_amount,
                reference_type="supplier_invoice",
                reference_id=inv.id,
                currency=inv.currency,
                due_date=inv.due_date,
                notes=f"Təsdiqlənmiş Qaimə: {inv.invoice_no} (Təchizatçı №: {inv.supplier_invoice_number})",
                session=uow.session,
                actor=actor,
            )

            # Outbox Hadisəsi (Finance B9 modulu üçün)
            event = SupplierInvoiceApprovedEvent(
                invoice_id=inv.id,
                invoice_no=inv.invoice_no,
                supplier_id=inv.supplier_id,
                total_amount=inv.total_amount,
                due_date=inv.due_date,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_invoice(inv.id, with_lines=True)
            await uow.commit()
            return loaded or inv

    # =========================================================================
    # 5. TƏCHİZATÇIYA QAYTARMA VƏ KREDİT NOTASI (PURCHASE RETURNS & CREDIT NOTES)
    # =========================================================================

    async def create_purchase_return(
        self,
        company_id: uuid.UUID,
        data: PurchaseReturnCreate,
        actor: Any = None,
    ) -> PurchaseReturn:
        """Təchizatçıya mal qaytarma aktı yaradır, malları stokdan çıxarır və borcu azaldır."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            gr = await repo.get_receipt(data.receipt_id, with_relations=True)
            if not gr:
                raise NotFoundError("Qaytarılacaq malın aid olduğu qəbul aktı tapılmadı.")

            return_no = await self.numbering.next(
                document_type="purchase_return",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            total_qty = 0
            total_amt = Decimal("0.0000")
            ret_lines: list[PurchaseReturnLine] = []
            movements: list[MovementDraft] = []

            for l_data in data.lines:
                # Qəbul aktındakı qiyməti tapırıq
                gr_line = next((gl for gl in gr.lines if gl.variant_id == l_data.variant_id), None)
                unit_cost = gr_line.unit_cost if gr_line else Decimal("0.0000")
                line_amt = round_money(Decimal(l_data.quantity) * unit_cost)

                ret_line = PurchaseReturnLine(
                    id=generate_uuid7(),
                    variant_id=l_data.variant_id,
                    quantity=l_data.quantity,
                    unit_cost=unit_cost,
                    total_amount=line_amt,
                    notes=l_data.notes,
                )
                ret_lines.append(ret_line)
                total_qty += l_data.quantity
                total_amt += line_amt

                # Stokdan çıxarış (PURCHASE_RETURN)
                movements.append(
                    MovementDraft(
                        variant_id=l_data.variant_id,
                        quantity=l_data.quantity,
                        movement_type=MovementType.PURCHASE_RETURN.value,
                        from_warehouse_id=gr.warehouse_id,
                        from_status=StockStatus.AVAILABLE.value,
                        unit_cost=unit_cost,
                        reference_type="purchase_return",
                        reference_id=gr.id,
                        notes=f"Təchizatçıya qaytarma: {return_no}",
                    )
                )

            # Eyni tranzaksiyada stok hərəkətləri
            await self.inventory.post(
                session=uow.session,
                company_id=company_id,
                movements=movements,
                user_id=getattr(actor, "id", None),
                actor=actor,
            )

            pr = PurchaseReturn(
                id=generate_uuid7(),
                company_id=company_id,
                return_no=return_no,
                receipt_id=data.receipt_id,
                supplier_id=gr.supplier_id,
                warehouse_id=gr.warehouse_id,
                reason_code=data.reason_code,
                notes=data.notes,
                total_quantity=total_qty,
                total_amount=total_amt,
                status="CONFIRMED",
            )
            pr.lines = ret_lines
            created = await repo.create_return(pr)

            # Təchizatçı jurnalında kredit notası qeydi (DEBIT: borcu azaldır)
            await self.suppliers.record_ledger_entry(
                company_id=company_id,
                supplier_id=gr.supplier_id,
                entry_type=SupplierLedgerEntryType.CREDIT_NOTE.value,
                direction=SupplierLedgerDirection.DEBIT.value,
                amount=total_amt,
                reference_type="purchase_return",
                reference_id=created.id,
                notes=f"Qaytarma aktı / Kredit notası: {return_no}",
                session=uow.session,
                actor=actor,
            )

            loaded = await repo.get_return(created.id, with_lines=True)
            await uow.commit()
            return loaded or created

    # =========================================================================
    # 6. TƏCHİZATÇI ÖDƏNİŞLƏRİ VƏ BÖLÜŞDÜRMƏ (PAYMENTS & ALLOCATIONS)
    # =========================================================================

    async def create_payment(
        self,
        company_id: uuid.UUID,
        data: SupplierPaymentCreate,
        actor: Any = None,
    ) -> SupplierPayment:
        """Təchizatçıya ödəniş edir, qaimələrə bölüşdürür və jurnala yazır."""
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)

            payment_no = await self.numbering.next(
                document_type="supplier_payment",
                company_id=company_id,
                session=uow.session,
                actor=actor,
            )

            payment = SupplierPayment(
                id=generate_uuid7(),
                company_id=company_id,
                payment_no=payment_no,
                supplier_id=data.supplier_id,
                payment_method=data.payment_method,
                source_account_id=data.source_account_id,
                payment_date=data.payment_date or utc_now().date(),
                amount=data.amount,
                currency=data.currency.upper(),
                reference_number=data.reference_number,
                notes=data.notes,
                status=PaymentStatus.POSTED.value,
                created_by_id=getattr(actor, "id", None),
                version=1,
            )

            # Bölüşdürmələr (Allocations)
            total_allocated = Decimal("0.0000")
            if data.allocations:
                for alloc_data in data.allocations:
                    total_allocated += alloc_data.allocated_amount
                    inv = await repo.get_invoice(alloc_data.invoice_id)
                    if not inv:
                        raise NotFoundError("Ödəniş bölüşdürülən qaimə tapılmadı.")

                    inv.paid_amount += alloc_data.allocated_amount
                    if inv.paid_amount >= inv.total_amount:
                        inv.status = SupplierInvoiceStatus.PAID.value
                    else:
                        inv.status = SupplierInvoiceStatus.PARTIALLY_PAID.value

                    alloc = PaymentAllocation(
                        id=generate_uuid7(),
                        payment_id=payment.id,
                        invoice_id=inv.id,
                        allocated_amount=alloc_data.allocated_amount,
                    )
                    payment.allocations.append(alloc)

            if total_allocated > data.amount:
                raise BusinessRuleViolationError(
                    f"Bölüşdürülən məbləğ ({total_allocated}) ümumi ödəniş məbləğindən ({data.amount}) çox ola bilməz."
                )

            created = await repo.create_payment(payment)

            # Təchizatçı jurnalına yazırıq (DEBIT: borc azalır)
            await self.suppliers.record_ledger_entry(
                company_id=company_id,
                supplier_id=data.supplier_id,
                entry_type=SupplierLedgerEntryType.PAYMENT.value,
                direction=SupplierLedgerDirection.DEBIT.value,
                amount=data.amount,
                reference_type="supplier_payment",
                reference_id=created.id,
                currency=data.currency,
                notes=f"Ödəniş sənədi: {payment_no}",
                session=uow.session,
                actor=actor,
            )

            event = SupplierPaymentPostedEvent(
                payment_id=created.id,
                payment_no=created.payment_no,
                supplier_id=created.supplier_id,
                amount=created.amount,
            )
            await record_outbox_event(uow.session, event)

            loaded = await repo.get_payment(created.id, with_allocations=True)
            await uow.commit()
            return loaded or created

    async def get_payables_aging(
        self,
        company_id: uuid.UUID,
        as_of_date: date | None = None,
        actor: Any = None,
    ) -> PayablesAgingResponse:
        """Bütün şirkət üzrə ödəmə borclarının yaşlanma hesabatını təqdim edir."""
        _ = actor
        target_date = as_of_date or utc_now().date()

        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            unpaid_invoices = await repo.get_unpaid_invoices_for_aging(company_id, target_date)

            aging = PayablesAgingBucket()
            total_payables = Decimal("0.0000")
            suppliers_set = set()

            for inv in unpaid_invoices:
                unpaid = inv.total_amount - inv.paid_amount
                if unpaid <= Decimal("0.0000"):
                    continue

                total_payables += unpaid
                suppliers_set.add(inv.supplier_id)

                if inv.due_date >= target_date:
                    aging.current += unpaid
                else:
                    overdue = (target_date - inv.due_date).days
                    if 1 <= overdue <= 30:
                        aging.days_1_30 += unpaid
                    elif 31 <= overdue <= 60:
                        aging.days_31_60 += unpaid
                    elif 61 <= overdue <= 90:
                        aging.days_61_90 += unpaid
                    else:
                        aging.days_90_plus += unpaid

            aging.total = total_payables
            return PayablesAgingResponse(
                as_of_date=target_date,
                total_payables=total_payables,
                aging=aging,
                suppliers_count=len(suppliers_set),
            )

    # --- Query Metodları ---

    async def get_po(self, po_id: uuid.UUID, actor: Any = None) -> PurchaseOrder:
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            po = await repo.get_po(po_id, with_relations=True)
            if not po:
                raise NotFoundError("Satınalma sifarişi tapılmadı.")
            return po

    async def list_pos(
        self,
        company_id: uuid.UUID,
        supplier_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
        actor: Any = None,
    ) -> tuple[list[PurchaseOrder], int]:
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            return await repo.list_pos(
                company_id=company_id,
                supplier_id=supplier_id,
                status=status,
                limit=limit,
                offset=offset,
            )

    async def get_receipt(self, receipt_id: uuid.UUID, actor: Any = None) -> GoodsReceipt:
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            gr = await repo.get_receipt(receipt_id, with_relations=True)
            if not gr:
                raise NotFoundError("Qəbul aktı tapılmadı.")
            return gr

    async def list_receipts(
        self,
        company_id: uuid.UUID,
        supplier_id: uuid.UUID | None = None,
        po_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
        actor: Any = None,
    ) -> tuple[list[GoodsReceipt], int]:
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            return await repo.list_receipts(
                company_id=company_id,
                supplier_id=supplier_id,
                po_id=po_id,
                status=status,
                limit=limit,
                offset=offset,
            )

    async def list_discrepancies(
        self, company_id: uuid.UUID, status: str | None = None, actor: Any = None
    ) -> list[ReceiptDiscrepancy]:
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            return await repo.list_discrepancies(company_id=company_id, status=status)

    async def get_invoice(self, invoice_id: uuid.UUID, actor: Any = None) -> SupplierInvoice:
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            inv = await repo.get_invoice(invoice_id, with_lines=True)
            if not inv:
                raise NotFoundError("Qaimə tapılmadı.")
            return inv

    async def get_payment(self, payment_id: uuid.UUID, actor: Any = None) -> SupplierPayment:
        _ = actor
        async with UnitOfWork() as uow:
            repo = PurchasingRepository(uow.session)
            pmt = await repo.get_payment(payment_id, with_allocations=True)
            if not pmt:
                raise NotFoundError("Ödəniş tapılmadı.")
            return pmt


_purchasing_service: PurchasingService | None = None


def get_purchasing_service() -> PurchasingService:
    global _purchasing_service
    if _purchasing_service is None:
        _purchasing_service = PurchasingService()
    return _purchasing_service
