"""Təchizatçılar Modulu Qaydaları və Hesablama Məntiqləri (Suppliers Policies)."""

from __future__ import annotations

import re
from typing import Any

from app.core.errors import ForbiddenError


def normalize_tax_id(tax_id: str | None) -> str | None:
    """VÖEN-i normallaşdırır (boşluqları və defisləri silir)."""
    if not tax_id:
        return None
    cleaned = re.sub(r"[\s\-]", "", tax_id).strip()
    return cleaned if cleaned else None


def normalize_name_for_comparison(name: str) -> str:
    """Təchizatçı adını oxşarlıq müqayisəsi üçün normallaşdırır."""
    s = name.lower().strip()
    # Şirkət formalarını təmizləyirik
    s = re.sub(r"\b(mmc|asc|qsc|llc|inc|ltd|corp)\b", "", s)
    s = re.sub(r"[^\w\s]", "", s)
    return " ".join(s.split())


def calculate_name_similarity(name1: str, name2: str) -> float:
    """İki ad arasındakı leksik oxşarlıq dərəcəsini (0.0 - 1.0) hesablayır."""
    n1 = normalize_name_for_comparison(name1)
    n2 = normalize_name_for_comparison(name2)
    if not n1 or not n2:
        return 0.0
    if n1 == n2:
        return 1.0

    # Token overlap (Jaccard similarity)
    words1 = set(n1.split())
    words2 = set(n2.split())
    intersection = words1.intersection(words2)
    union = words1.union(words2)
    if not union:
        return 0.0
    jaccard = len(intersection) / len(union)

    # Bigram character similarity
    def get_bigrams(s: str) -> set[str]:
        return {s[i : i + 2] for i in range(len(s) - 1)}

    bg1 = get_bigrams(n1)
    bg2 = get_bigrams(n2)
    if not bg1 or not bg2:
        return jaccard
    dice = 2.0 * len(bg1.intersection(bg2)) / (len(bg1) + len(bg2))

    return max(jaccard, dice)


def mask_bank_details(
    bank_details: dict[str, Any] | None, has_permission: bool
) -> dict[str, Any] | None:
    """Həssas bank məlumatlarını icazəsi olmayan istifadəçilərdən maskalayır."""
    if not bank_details:
        return None
    if has_permission:
        return bank_details

    masked: dict[str, Any] = {}
    for key, val in bank_details.items():
        if isinstance(val, str):
            if len(val) > 4:
                masked[key] = f"****{val[-4:]}"
            else:
                masked[key] = "****"
        else:
            masked[key] = "****"
    masked["_is_masked"] = True
    return masked


def check_suppliers_permission(permission: str, actor: Any | None) -> None:
    """Təchizatçı əməliyyatları üçün istifadəçi icazəsini yoxlayır."""
    if actor is None:
        raise ForbiddenError("Autentifikasiya tələb olunur.")
    is_superuser = getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False)
    if is_superuser:
        return
    roles = set(getattr(actor, "roles", []) or [])
    if "system_admin" in roles or "general_manager" in roles:
        return
    perms = set(getattr(actor, "permissions", []) or [])
    if permission not in perms:
        raise ForbiddenError(f"Bu əməliyyat üçün '{permission}' icazəsi tələb olunur.")


def has_bank_view_permission(actor: Any | None) -> bool:
    """İstifadəçinin bank rekvizitlərinə baxış icazəsinin olub-olmadığını yoxlayır."""
    if actor is None:
        return False
    if getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False):
        return True
    roles = set(getattr(actor, "roles", []) or [])
    if "system_admin" in roles or "general_manager" in roles or "accountant" in roles:
        return True
    perms = set(getattr(actor, "permissions", []) or [])
    return "suppliers.bank.view" in perms
