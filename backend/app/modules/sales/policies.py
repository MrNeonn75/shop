"""Satışlar Modulu Biznes Qaydaları və Siyasətləri (Sales Policies).

Satış qeydlərinə baxış, maya dəyəri (COGS) və marja məlumatlarının məxfiliyi
və təkrar çap hüquqlarının yoxlanışı.
"""

from __future__ import annotations

from typing import Any

from app.core.errors import ForbiddenError


def can_view_sales(actor: Any) -> bool:
    """Satış reyestrinə və çəklərə baxış icazəsi."""
    roles = getattr(actor, "roles", []) or []
    if "system_admin" in roles:
        return True
    permissions = getattr(actor, "permissions", []) or []
    return "sales.view" in permissions or "pos.sale.create" in permissions


def can_view_sale_costs(actor: Any) -> bool:
    """Maya dəyəri və mənfəət marjasına baxış icazəsi."""
    roles = getattr(actor, "roles", []) or []
    if "system_admin" in roles:
        return True
    permissions = getattr(actor, "permissions", []) or []
    return "sales.cost.view" in permissions


def can_export_sales(actor: Any) -> bool:
    """Satış məlumatlarının fayla ixracı icazəsi."""
    roles = getattr(actor, "roles", []) or []
    if "system_admin" in roles:
        return True
    permissions = getattr(actor, "permissions", []) or []
    return "sales.export" in permissions


def can_reprint_sale(actor: Any) -> bool:
    """Çəkin təkrar çap edilməsi icazəsi."""
    roles = getattr(actor, "roles", []) or []
    if "system_admin" in roles:
        return True
    permissions = getattr(actor, "permissions", []) or []
    return "pos.sale.reprint" in permissions


def check_view_sales_permission(actor: Any) -> None:
    if not can_view_sales(actor):
        raise ForbiddenError("Satış qeydlərinə baxış hüququnuz yoxdur (sales.view tələb olunur).")


def check_reprint_sale_permission(actor: Any) -> None:
    if not can_reprint_sale(actor):
        raise ForbiddenError(
            "Kassa çəkini təkrar çap etmək hüququnuz yoxdur (pos.sale.reprint tələb olunur)."
        )
