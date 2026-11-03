"""Kataloq Modulu İcazə Qaydaları (Catalog Policies).

Bu modul istifadəçi rolları və icazələri əsasında kataloq məhsullarına baxış,
redaktə, həssas maya dəyəri (cost) sahələrinin gizlədilməsi və qiymət idarəetməsini tənzimləyir.
"""

from __future__ import annotations

from typing import Any

ADMIN_ROLES = {"system_admin", "general_manager"}
CATALOG_MANAGERS = {"system_admin", "general_manager", "inventory_manager"}


def can_view_catalog(actor: Any) -> bool:
    """Kataloq məhsullarına və struktura baxış hüququ."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    if roles & (ADMIN_ROLES | {"branch_manager", "inventory_manager", "cashier"}):
        return True
    permissions = set(getattr(actor, "permissions", []))
    return bool({"catalog.product.view", "catalog.product.manage"} & permissions)


def can_manage_catalog(actor: Any) -> bool:
    """Məhsul, kateqoriya, brend və variant yaratma/redaktə hüququ."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    if roles & CATALOG_MANAGERS:
        return True
    permissions = set(getattr(actor, "permissions", []))
    return "catalog.product.manage" in permissions


def can_view_cost(actor: Any) -> bool:
    """Həssas maya dəyəri (cost), mənfəət və marja məlumatlarına baxış hüququ."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    if roles & ADMIN_ROLES:
        return True
    permissions = set(getattr(actor, "permissions", []))
    return "catalog.cost.view" in permissions


def can_manage_price(actor: Any) -> bool:
    """Qiymət dəyişikliyi və qiymət cədvəllərinin təsdiqi hüququ."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    if roles & ADMIN_ROLES:
        return True
    permissions = set(getattr(actor, "permissions", []))
    return "catalog.price.manage" in permissions


def can_import_catalog(actor: Any) -> bool:
    """Kütləvi məhsul idxalı (CSV/XLSX) hüququ."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    if roles & CATALOG_MANAGERS:
        return True
    permissions = set(getattr(actor, "permissions", []))
    return "catalog.import" in permissions


def can_export_catalog(actor: Any) -> bool:
    """Kataloq məlumatlarının ixracı (CSV/XLSX) hüququ."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    if roles & (CATALOG_MANAGERS | {"branch_manager"}):
        return True
    permissions = set(getattr(actor, "permissions", []))
    return "catalog.export" in permissions


def can_render_labels(actor: Any) -> bool:
    """Qiymət kağızı və barkod etiketlərinin PDF çapı hüququ."""
    if not actor:
        return False
    roles = set(getattr(actor, "roles", []))
    if roles & (CATALOG_MANAGERS | {"branch_manager", "cashier"}):
        return True
    permissions = set(getattr(actor, "permissions", []))
    return "catalog.labels" in permissions
