"""Qaytarmalar və Mübadilələr Modulu Hadisələri (Domain Events)."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from app.shared.events import DomainEvent


class ReturnCompletedEvent(DomainEvent):
    """Qaytarma sənədi tamamlandıqda yayımlanan hadisə (Maliyyə, Stok və CRM üçün)."""

    def __init__(
        self,
        return_id: uuid.UUID,
        return_no: str,
        original_sale_id: uuid.UUID | None,
        branch_id: uuid.UUID,
        register_id: uuid.UUID,
        shift_id: uuid.UUID,
        cashier_id: uuid.UUID,
        customer_id: uuid.UUID | None,
        return_type: str,
        refund_total: Decimal,
        cost_total: Decimal,
        exchange_group_id: uuid.UUID | None = None,
    ) -> None:
        super().__init__(
            event_type="return.completed",
            aggregate_type="sale_return",
            aggregate_id=str(return_id),
            payload={
                "return_id": str(return_id),
                "return_no": return_no,
                "original_sale_id": str(original_sale_id) if original_sale_id else None,
                "branch_id": str(branch_id),
                "register_id": str(register_id),
                "shift_id": str(shift_id),
                "cashier_id": str(cashier_id),
                "customer_id": str(customer_id) if customer_id else None,
                "return_type": return_type,
                "refund_total": str(refund_total),
                "cost_total": str(cost_total),
                "exchange_group_id": str(exchange_group_id) if exchange_group_id else None,
            },
        )


class ReturnApprovedEvent(DomainEvent):
    """Menecer təsdiqi gözləyən qaytarma təsdiqləndikdə yayımlanır."""

    def __init__(
        self,
        return_id: uuid.UUID,
        return_no: str,
        approver_id: uuid.UUID,
        refund_total: Decimal,
    ) -> None:
        super().__init__(
            event_type="return.approved",
            aggregate_type="sale_return",
            aggregate_id=str(return_id),
            payload={
                "return_id": str(return_id),
                "return_no": return_no,
                "approver_id": str(approver_id),
                "refund_total": str(refund_total),
            },
        )


class ReturnRejectedEvent(DomainEvent):
    """Təsdiq gözləyən qaytarma rədd edildikdə yayımlanır."""

    def __init__(
        self,
        return_id: uuid.UUID,
        return_no: str,
        rejector_id: uuid.UUID,
        reason: str,
    ) -> None:
        super().__init__(
            event_type="return.rejected",
            aggregate_type="sale_return",
            aggregate_id=str(return_id),
            payload={
                "return_id": str(return_id),
                "return_no": return_no,
                "rejector_id": str(rejector_id),
                "reason": reason,
            },
        )


class ReturnCancelledEvent(DomainEvent):
    """Qaytarma ləğv edildikdə yayımlanır."""

    def __init__(
        self,
        return_id: uuid.UUID,
        return_no: str,
        cancelled_by_id: uuid.UUID,
        reason: str,
    ) -> None:
        super().__init__(
            event_type="return.cancelled",
            aggregate_type="sale_return",
            aggregate_id=str(return_id),
            payload={
                "return_id": str(return_id),
                "return_no": return_no,
                "cancelled_by_id": str(cancelled_by_id),
                "reason": reason,
            },
        )


class ExchangeCompletedEvent(DomainEvent):
    """Mübadilə (Exchange) əməliyyatı tamamlandıqda yayımlanır."""

    def __init__(
        self,
        exchange_group_id: uuid.UUID,
        return_id: uuid.UUID,
        sale_id: uuid.UUID,
        net_difference: Decimal,
    ) -> None:
        super().__init__(
            event_type="exchange.completed",
            aggregate_type="exchange_group",
            aggregate_id=str(exchange_group_id),
            payload={
                "exchange_group_id": str(exchange_group_id),
                "return_id": str(return_id),
                "sale_id": str(sale_id),
                "net_difference": str(net_difference),
            },
        )


class StoreCreditIssuedEvent(DomainEvent):
    """Müştəriyə mağaza krediti (Store Credit) verildikdə yayımlanır."""

    def __init__(
        self,
        customer_id: uuid.UUID,
        amount: Decimal,
        return_id: uuid.UUID,
        balance_after: Decimal,
    ) -> None:
        super().__init__(
            event_type="store_credit.issued",
            aggregate_type="customer",
            aggregate_id=str(customer_id),
            payload={
                "customer_id": str(customer_id),
                "amount": str(amount),
                "return_id": str(return_id),
                "balance_after": str(balance_after),
            },
        )


class LoyaltyReversedEvent(DomainEvent):
    """Qaytarma nəticəsində loyallıq xalları geri hesablandıqda yayımlanır."""

    def __init__(
        self,
        customer_id: uuid.UUID,
        sale_id: uuid.UUID,
        return_id: uuid.UUID,
        points_reversed: int,
        points_restored: int,
    ) -> None:
        super().__init__(
            event_type="loyalty.points_reversed",
            aggregate_type="customer",
            aggregate_id=str(customer_id),
            payload={
                "customer_id": str(customer_id),
                "sale_id": str(sale_id),
                "return_id": str(return_id),
                "points_reversed": points_reversed,
                "points_restored": points_restored,
            },
        )


class ReturnFraudAlertEvent(DomainEvent):
    """Qaytarma anomaliyası və ya fırıldaqçılıq indikatoru aşkarlandıqda yayımlanır."""

    def __init__(
        self,
        branch_id: uuid.UUID,
        indicator: str,
        details: dict[str, Any],
    ) -> None:
        super().__init__(
            event_type="return.fraud_alert",
            aggregate_type="branch",
            aggregate_id=str(branch_id),
            payload={
                "branch_id": str(branch_id),
                "indicator": indicator,
                "details": details,
            },
        )
