"""Domen Hadisələri Sxem Reyestri və Uyğunluq Yoxlayıcısı (Event Schema Registry).

Bütün outbox hadisələrinin struktur sxemlərini saxlayır, qeydiyyat zamanı
sahələrin düzgünlüyünü yoxlayır və versiyalar arası geriyə uyğunluğu (backward compatibility)
zəmanətləndirir (yeni versiyalarda mövcud tələb olunan sahələrin silinməsi qadağandır).
"""

from __future__ import annotations

from typing import Any


class EventSchemaValidationError(ValueError):
    """Hadisə yükü (payload) sxem standartına cavab vermədikdə qaldırılır."""
    pass


class EventSchemaIncompatibleError(ValueError):
    """Yeni sxem versiyası əvvəlki versiya ilə geriyə uyğun olmadıqda qaldırılır."""
    pass


# Standart Domen Hadisələri Sxem Reyestri (v1)
EVENT_SCHEMAS: dict[str, dict[int, dict[str, Any]]] = {
    "sale.completed": {
        1: {
            "required_fields": {
                "sale_id": str,
                "branch_id": str,
                "grand_total": (str, int, float),
            },
            "optional_fields": {
                "customer_id": (str, type(None)),
                "cashier_id": str,
                "lines": list,
                "payment_methods": list,
                "discount_total": (str, int, float),
            },
        }
    },
    "return.completed": {
        1: {
            "required_fields": {
                "return_id": str,
                "branch_id": str,
                "refund_total": (str, int, float),
            },
            "optional_fields": {
                "original_sale_id": (str, type(None)),
                "customer_id": (str, type(None)),
                "items": list,
            },
        }
    },
    "stock.changed": {
        1: {
            "required_fields": {
                "variant_id": str,
                "warehouse_id": str,
                "quantity_change": (int, float),
            },
            "optional_fields": {
                "reason": str,
                "reference_document": str,
            },
        }
    },
    "stock.low": {
        1: {
            "required_fields": {
                "variant_id": str,
                "warehouse_id": str,
                "current_stock": (int, float),
                "reorder_point": (int, float),
            },
            "optional_fields": {
                "sku": str,
                "product_name": str,
            },
        }
    },
    "stock.out": {
        1: {
            "required_fields": {
                "variant_id": str,
                "warehouse_id": str,
            },
            "optional_fields": {
                "sku": str,
                "product_name": str,
            },
        }
    },
    "transfer.dispatched": {
        1: {
            "required_fields": {
                "transfer_id": str,
                "source_warehouse_id": str,
                "target_warehouse_id": str,
            },
            "optional_fields": {
                "item_count": int,
            },
        }
    },
    "transfer.received": {
        1: {
            "required_fields": {
                "transfer_id": str,
                "target_warehouse_id": str,
            },
            "optional_fields": {
                "discrepancies": list,
            },
        }
    },
    "purchase.order_approved": {
        1: {
            "required_fields": {
                "po_id": str,
                "supplier_id": str,
                "total_amount": (str, int, float),
            },
            "optional_fields": {
                "currency": str,
            },
        }
    },
    "payroll.finalized": {
        1: {
            "required_fields": {
                "payroll_run_id": str,
                "period": str,
                "total_net": (str, int, float),
            },
            "optional_fields": {
                "employee_count": int,
            },
        }
    },
    "shift.closed": {
        1: {
            "required_fields": {
                "shift_id": str,
                "register_id": str,
                "cashier_id": str,
            },
            "optional_fields": {
                "closing_cash": (str, int, float),
                "difference": (str, int, float),
            },
        }
    },
    "security.audit_alert": {
        1: {
            "required_fields": {
                "alert_id": str,
                "severity": str,
                "action": str,
            },
            "optional_fields": {
                "actor_id": (str, type(None)),
                "ip_address": (str, type(None)),
                "details": dict,
            },
        }
    },
    "integration.status_changed": {
        1: {
            "required_fields": {
                "integration_key": str,
                "old_status": str,
                "new_status": str,
            },
            "optional_fields": {
                "reason": (str, type(None)),
            },
        }
    },
    "backup.completed": {
        1: {
            "required_fields": {
                "backup_id": str,
                "backup_type": str,
                "size_bytes": int,
            },
            "optional_fields": {
                "checksum": (str, type(None)),
            },
        }
    },
    "campaign.status_changed": {
        1: {
            "required_fields": {
                "campaign_id": str,
                "old_status": str,
                "new_status": str,
            },
            "optional_fields": {},
        }
    },
    "notification.created": {
        1: {
            "required_fields": {
                "notification_id": str,
                "recipient_user_id": str,
                "category": str,
                "severity": str,
                "title": str,
            },
            "optional_fields": {
                "body": str,
                "deep_link": (str, type(None)),
                "branch_id": (str, type(None)),
            },
        }
    },
    "ping.recorded": {
        1: {
            "required_fields": {},
            "optional_fields": {
                "ping_id": str,
                "message": str,
            },
        }
    },
}


def validate_event_payload(event_type: str, payload: dict[str, Any], version: int = 1) -> None:
    """Hadisə yükünü sxemə qarşı yoxlayır."""
    type_schemas = EVENT_SCHEMAS.get(event_type)
    if not type_schemas:
        # Tanınmayan hadisə tipləri üçün sərbəst payload qəbul edilir
        return

    schema = type_schemas.get(version)
    if not schema:
        raise EventSchemaValidationError(
            f"Hadisə '{event_type}' üçün versiya {version} sxemi tapılmadı."
        )

    required = schema.get("required_fields", {})
    for field_name, expected_type in required.items():
        if field_name not in payload:
            raise EventSchemaValidationError(
                f"Hadisə '{event_type}' (v{version}) üçün tələb olunan sahə çatışmır: '{field_name}'"
            )
        val = payload[field_name]
        if not isinstance(val, expected_type):
            raise EventSchemaValidationError(
                f"Hadisə '{event_type}' sahəsi '{field_name}' üçün səhv tip: "
                f"gözlənən {expected_type}, alınan {type(val)}"
            )


def check_schema_compatibility(old_schema: dict[str, Any], new_schema: dict[str, Any]) -> bool:
    """İki sxem versiyası arasında geriyə uyğunluğu təsdiqləyir.

    Qaydalar:
    1. Əvvəlki versiyada olan tələb olunan sahələrdən heç biri silinə bilməz.
    2. Mövcud sahənin tipi ziddiyyətli şəkildə dəyişdirilə bilməz.
    3. Yeni əlavə edilən sahələr yalnız könüllü (optional) ola bilər.
    """
    old_req = old_schema.get("required_fields", {})
    new_req = new_schema.get("required_fields", {})

    # 1. Köhnə required sahələr yenidən silinməyibmi?
    for f_name, f_type in old_req.items():
        if f_name not in new_req:
            raise EventSchemaIncompatibleError(
                f"Geriyə uyğunluq pozuldu: tələb olunan '{f_name}' sahəsi yeni versiyadan çıxarılıb."
            )
        # Tip uyğunluğu yoxlanışı
        if f_type != new_req[f_name]:
            raise EventSchemaIncompatibleError(
                f"Geriyə uyğunluq pozuldu: '{f_name}' sahəsinin tipi dəyişdirilib: {f_type} -> {new_req[f_name]}"
            )

    # 2. Yeni tələb olunan sahə əlavə edilibsə (breaking change)
    for f_name in new_req:
        if f_name not in old_req:
            raise EventSchemaIncompatibleError(
                f"Geriyə uyğunluq pozuldu: yeni məcburi sahə əlavə edilib: '{f_name}'. "
                "Yeni sahələr yalnız optional olmalıdır."
            )

    return True

