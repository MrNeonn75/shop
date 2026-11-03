"""Kataloq Modulu Domen Hadisələri (Catalog Domain Events).

Bu hadisələr outbox vasitəsilə asinxron emalçılara (anbar xəbərdarlıqları,
marketinq, qiymət dəyişikliyi təhlili və inteqrasiyalar) ötürülür.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.shared.events import DomainEvent


class ProductCreatedEvent(DomainEvent):
    def __init__(self, product_id: uuid.UUID, internal_code: str, name: str) -> None:
        super().__init__(
            event_type="product.created",
            aggregate_type="products",
            aggregate_id=str(product_id),
            payload={"product_id": str(product_id), "internal_code": internal_code, "name": name},
        )


class ProductUpdatedEvent(DomainEvent):
    def __init__(self, product_id: uuid.UUID, internal_code: str, diff: dict[str, Any]) -> None:
        super().__init__(
            event_type="product.updated",
            aggregate_type="products",
            aggregate_id=str(product_id),
            payload={"product_id": str(product_id), "internal_code": internal_code, "diff": diff},
        )


class ProductDiscontinuedEvent(DomainEvent):
    def __init__(self, product_id: uuid.UUID, internal_code: str, is_sell_through: bool) -> None:
        super().__init__(
            event_type="product.discontinued",
            aggregate_type="products",
            aggregate_id=str(product_id),
            payload={
                "product_id": str(product_id),
                "internal_code": internal_code,
                "is_sell_through": is_sell_through,
            },
        )


class ProductReactivatedEvent(DomainEvent):
    def __init__(self, product_id: uuid.UUID, internal_code: str) -> None:
        super().__init__(
            event_type="product.reactivated",
            aggregate_type="products",
            aggregate_id=str(product_id),
            payload={"product_id": str(product_id), "internal_code": internal_code},
        )


class VariantCreatedEvent(DomainEvent):
    def __init__(
        self, variant_id: uuid.UUID, product_id: uuid.UUID, sku: str, barcode: str | None
    ) -> None:
        super().__init__(
            event_type="variant.created",
            aggregate_type="variants",
            aggregate_id=str(variant_id),
            payload={
                "variant_id": str(variant_id),
                "product_id": str(product_id),
                "sku": sku,
                "barcode": barcode,
            },
        )


class VariantUpdatedEvent(DomainEvent):
    def __init__(self, variant_id: uuid.UUID, sku: str, diff: dict[str, Any]) -> None:
        super().__init__(
            event_type="variant.updated",
            aggregate_type="variants",
            aggregate_id=str(variant_id),
            payload={"variant_id": str(variant_id), "sku": sku, "diff": diff},
        )


class PriceChangedEvent(DomainEvent):
    def __init__(
        self,
        variant_id: uuid.UUID,
        product_id: uuid.UUID,
        old_price: float | None,
        new_price: float,
        reason: str | None,
    ) -> None:
        super().__init__(
            event_type="price.changed",
            aggregate_type="variants",
            aggregate_id=str(variant_id),
            payload={
                "variant_id": str(variant_id),
                "product_id": str(product_id),
                "old_price": old_price,
                "new_price": new_price,
                "reason": reason,
            },
        )


class CostChangedEvent(DomainEvent):
    def __init__(
        self,
        variant_id: uuid.UUID,
        old_cost: float | None,
        new_cost: float,
        reason: str | None,
    ) -> None:
        super().__init__(
            event_type="cost.changed",
            aggregate_type="variants",
            aggregate_id=str(variant_id),
            payload={
                "variant_id": str(variant_id),
                "old_cost": old_cost,
                "new_cost": new_cost,
                "reason": reason,
            },
        )
