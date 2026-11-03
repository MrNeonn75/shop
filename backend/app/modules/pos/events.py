"""POS və Satış Hadisələri (Outbox Domain Events)."""

from __future__ import annotations

import uuid
from decimal import Decimal

from app.shared.events import DomainEvent


class ShiftOpenedEvent(DomainEvent):
    def __init__(
        self,
        shift_id: uuid.UUID,
        shift_no: str,
        register_id: uuid.UUID,
        branch_id: uuid.UUID,
        cashier_id: uuid.UUID,
        opening_cash: Decimal,
    ) -> None:
        super().__init__(
            event_type="pos.shift_opened",
            aggregate_type="pos_shift",
            aggregate_id=str(shift_id),
            payload={
                "shift_id": str(shift_id),
                "shift_no": shift_no,
                "register_id": str(register_id),
                "branch_id": str(branch_id),
                "cashier_id": str(cashier_id),
                "opening_cash": str(opening_cash),
            },
        )


class ShiftClosedEvent(DomainEvent):
    def __init__(
        self,
        shift_id: uuid.UUID,
        shift_no: str,
        register_id: uuid.UUID,
        branch_id: uuid.UUID,
        cashier_id: uuid.UUID,
        expected_cash: Decimal,
        counted_cash: Decimal,
        variance: Decimal,
    ) -> None:
        super().__init__(
            event_type="pos.shift_closed",
            aggregate_type="pos_shift",
            aggregate_id=str(shift_id),
            payload={
                "shift_id": str(shift_id),
                "shift_no": shift_no,
                "register_id": str(register_id),
                "branch_id": str(branch_id),
                "cashier_id": str(cashier_id),
                "expected_cash": str(expected_cash),
                "counted_cash": str(counted_cash),
                "variance": str(variance),
            },
        )


class CashMovementRecordedEvent(DomainEvent):
    def __init__(
        self,
        movement_id: uuid.UUID,
        movement_no: str,
        shift_id: uuid.UUID,
        register_id: uuid.UUID,
        movement_type: str,
        amount: Decimal,
        reason_code: str,
        created_by_id: uuid.UUID,
    ) -> None:
        super().__init__(
            event_type="pos.cash_movement_recorded",
            aggregate_type="pos_cash_movement",
            aggregate_id=str(movement_id),
            payload={
                "movement_id": str(movement_id),
                "movement_no": movement_no,
                "shift_id": str(shift_id),
                "register_id": str(register_id),
                "movement_type": movement_type,
                "amount": str(amount),
                "reason_code": reason_code,
                "created_by_id": str(created_by_id),
            },
        )


class CartSuspendedEvent(DomainEvent):
    def __init__(
        self,
        cart_id: uuid.UUID,
        cart_no: str,
        branch_id: uuid.UUID,
        shift_id: uuid.UUID,
        label: str,
        line_count: int,
    ) -> None:
        super().__init__(
            event_type="pos.cart_suspended",
            aggregate_type="pos_cart",
            aggregate_id=str(cart_id),
            payload={
                "cart_id": str(cart_id),
                "cart_no": cart_no,
                "branch_id": str(branch_id),
                "shift_id": str(shift_id),
                "label": label,
                "line_count": line_count,
            },
        )


class SaleCompletedEvent(DomainEvent):
    def __init__(
        self,
        sale_id: uuid.UUID,
        receipt_no: str,
        company_id: uuid.UUID,
        branch_id: uuid.UUID,
        register_id: uuid.UUID,
        shift_id: uuid.UUID,
        cashier_id: uuid.UUID,
        customer_id: uuid.UUID | None,
        grand_total: Decimal,
        paid_amount: Decimal,
        change_amount: Decimal,
        payment_tenders: list[str],
        items_count: int,
    ) -> None:
        super().__init__(
            event_type="sale.completed",
            aggregate_type="sale",
            aggregate_id=str(sale_id),
            payload={
                "sale_id": str(sale_id),
                "receipt_no": receipt_no,
                "company_id": str(company_id),
                "branch_id": str(branch_id),
                "register_id": str(register_id),
                "shift_id": str(shift_id),
                "cashier_id": str(cashier_id),
                "customer_id": str(customer_id) if customer_id else None,
                "grand_total": str(grand_total),
                "paid_amount": str(paid_amount),
                "change_amount": str(change_amount),
                "payment_tenders": payment_tenders,
                "items_count": items_count,
            },
        )


class SaleCancelledEvent(DomainEvent):
    def __init__(
        self,
        sale_id: uuid.UUID,
        receipt_no: str,
        company_id: uuid.UUID,
        branch_id: uuid.UUID,
        register_id: uuid.UUID,
        shift_id: uuid.UUID,
        cancelled_by_id: uuid.UUID,
        reason: str,
        grand_total: Decimal,
    ) -> None:
        super().__init__(
            event_type="sale.cancelled",
            aggregate_type="sale",
            aggregate_id=str(sale_id),
            payload={
                "sale_id": str(sale_id),
                "receipt_no": receipt_no,
                "company_id": str(company_id),
                "branch_id": str(branch_id),
                "register_id": str(register_id),
                "shift_id": str(shift_id),
                "cancelled_by_id": str(cancelled_by_id),
                "reason": reason,
                "grand_total": str(grand_total),
            },
        )


class FraudAlertDetectedEvent(DomainEvent):
    def __init__(
        self,
        branch_id: uuid.UUID,
        register_id: uuid.UUID | None,
        shift_id: uuid.UUID | None,
        cashier_id: uuid.UUID | None,
        indicator_type: str,
        threshold_value: Decimal,
        observed_value: Decimal,
        message: str,
    ) -> None:
        super().__init__(
            event_type="pos.fraud_alert_detected",
            aggregate_type="fraud_alert",
            aggregate_id=str(branch_id),
            payload={
                "branch_id": str(branch_id),
                "register_id": str(register_id) if register_id else None,
                "shift_id": str(shift_id) if shift_id else None,
                "cashier_id": str(cashier_id) if cashier_id else None,
                "indicator_type": indicator_type,
                "threshold_value": str(threshold_value),
                "observed_value": str(observed_value),
                "message": message,
            },
        )
