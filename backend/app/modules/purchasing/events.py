"""Satınalma Modulu Hadisələri (Purchasing Outbox Events)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from app.shared.events import DomainEvent


class PurchaseRequestSubmittedEvent(DomainEvent):
    def __init__(self, request_id: uuid.UUID, request_no: str, company_id: uuid.UUID) -> None:
        super().__init__(
            event_type="purchasing.request.submitted",
            aggregate_type="purchasing_request",
            aggregate_id=str(request_id),
            payload={
                "request_id": str(request_id),
                "request_no": request_no,
                "company_id": str(company_id),
            },
        )


class PurchaseOrderCreatedEvent(DomainEvent):
    def __init__(
        self,
        po_id: uuid.UUID,
        po_no: str,
        supplier_id: uuid.UUID,
        total_amount: Decimal,
    ) -> None:
        super().__init__(
            event_type="purchasing.order.created",
            aggregate_type="purchasing_order",
            aggregate_id=str(po_id),
            payload={
                "po_id": str(po_id),
                "po_no": po_no,
                "supplier_id": str(supplier_id),
                "total_amount": str(total_amount),
            },
        )


class PurchaseOrderApprovedEvent(DomainEvent):
    def __init__(
        self,
        po_id: uuid.UUID,
        po_no: str,
        supplier_id: uuid.UUID,
        approver_id: uuid.UUID,
    ) -> None:
        super().__init__(
            event_type="purchasing.order.approved",
            aggregate_type="purchasing_order",
            aggregate_id=str(po_id),
            payload={
                "po_id": str(po_id),
                "po_no": po_no,
                "supplier_id": str(supplier_id),
                "approver_id": str(approver_id),
            },
        )


class PurchaseOrderSentEvent(DomainEvent):
    def __init__(self, po_id: uuid.UUID, po_no: str, supplier_id: uuid.UUID) -> None:
        super().__init__(
            event_type="purchasing.order.sent",
            aggregate_type="purchasing_order",
            aggregate_id=str(po_id),
            payload={
                "po_id": str(po_id),
                "po_no": po_no,
                "supplier_id": str(supplier_id),
            },
        )


class GoodsReceiptConfirmedEvent(DomainEvent):
    def __init__(
        self,
        receipt_id: uuid.UUID,
        receipt_no: str,
        supplier_id: uuid.UUID,
        warehouse_id: uuid.UUID,
        total_quantity: int,
        po_id: uuid.UUID | None = None,
    ) -> None:
        super().__init__(
            event_type="purchasing.receipt.confirmed",
            aggregate_type="goods_receipt",
            aggregate_id=str(receipt_id),
            payload={
                "receipt_id": str(receipt_id),
                "receipt_no": receipt_no,
                "supplier_id": str(supplier_id),
                "warehouse_id": str(warehouse_id),
                "total_quantity": total_quantity,
                "po_id": str(po_id) if po_id else None,
            },
        )


class GoodsReceiptReversedEvent(DomainEvent):
    def __init__(self, receipt_id: uuid.UUID, receipt_no: str, reason: str) -> None:
        super().__init__(
            event_type="purchasing.receipt.reversed",
            aggregate_type="goods_receipt",
            aggregate_id=str(receipt_id),
            payload={
                "receipt_id": str(receipt_id),
                "receipt_no": receipt_no,
                "reason": reason,
            },
        )


class SupplierInvoiceApprovedEvent(DomainEvent):
    def __init__(
        self,
        invoice_id: uuid.UUID,
        invoice_no: str,
        supplier_id: uuid.UUID,
        total_amount: Decimal,
        due_date: date,
    ) -> None:
        super().__init__(
            event_type="purchasing.invoice.approved",
            aggregate_type="supplier_invoice",
            aggregate_id=str(invoice_id),
            payload={
                "invoice_id": str(invoice_id),
                "invoice_no": invoice_no,
                "supplier_id": str(supplier_id),
                "total_amount": str(total_amount),
                "due_date": due_date.isoformat(),
            },
        )


class SupplierPaymentPostedEvent(DomainEvent):
    def __init__(
        self,
        payment_id: uuid.UUID,
        payment_no: str,
        supplier_id: uuid.UUID,
        amount: Decimal,
    ) -> None:
        super().__init__(
            event_type="purchasing.payment.posted",
            aggregate_type="supplier_payment",
            aggregate_id=str(payment_id),
            payload={
                "payment_id": str(payment_id),
                "payment_no": payment_no,
                "supplier_id": str(supplier_id),
                "amount": str(amount),
            },
        )


class SupplierPaymentReversedEvent(DomainEvent):
    def __init__(self, payment_id: uuid.UUID, payment_no: str, supplier_id: uuid.UUID) -> None:
        super().__init__(
            event_type="purchasing.payment.reversed",
            aggregate_type="supplier_payment",
            aggregate_id=str(payment_id),
            payload={
                "payment_id": str(payment_id),
                "payment_no": payment_no,
                "supplier_id": str(supplier_id),
            },
        )


class OverduePaymentEvent(DomainEvent):
    def __init__(
        self,
        invoice_id: uuid.UUID,
        supplier_id: uuid.UUID,
        due_date: date,
        outstanding_amount: Decimal,
    ) -> None:
        super().__init__(
            event_type="purchasing.payment.overdue",
            aggregate_type="supplier_invoice",
            aggregate_id=str(invoice_id),
            payload={
                "invoice_id": str(invoice_id),
                "supplier_id": str(supplier_id),
                "due_date": due_date.isoformat(),
                "outstanding_amount": str(outstanding_amount),
            },
        )
