"""Fiskal Çek Şablon Validasiyası.

Məcburi elementlər rule pack-dən DATA olaraq ötürülür —
validator daxilində hardcode siyahı YOXDUR.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    message: str
    element: str | None = None


@dataclass(frozen=True, slots=True)
class ValidationResult:
    ok: bool
    missing_elements: tuple[str, ...] = ()
    issues: tuple[ValidationIssue, ...] = ()
    checked_elements: tuple[str, ...] = ()

    @property
    def is_valid(self) -> bool:
        return self.ok


def _has_element(template: Mapping[str, Any], element: str) -> bool:
    """Nöqtəli yol (a.b.c) və ya sadə açar; boş/None dəyərlər yox sayılır."""
    if element in template:
        val = template[element]
        return val is not None and val != "" and val != []

    parts = element.split(".")
    cur: Any = template
    for part in parts:
        if not isinstance(cur, Mapping) or part not in cur:
            return False
        cur = cur[part]
    return cur is not None and cur != "" and cur != []


def validate_receipt_template(
    template_dict: Mapping[str, Any],
    mandatory_elements: Sequence[str],
) -> ValidationResult:
    """Şablonda rule pack-dən gələn məcburi elementlərin mövcudluğunu yoxlayır.

    Parameters
    ----------
    template_dict:
        Çek şablonu / render payload.
    mandatory_elements:
        Rule pack-dən gələn məcburi sahə adları (məs. company_voen, fiscal_number, qr).
    """
    missing: list[str] = []
    issues: list[ValidationIssue] = []
    checked = list(mandatory_elements)

    for el in mandatory_elements:
        if not _has_element(template_dict, el):
            missing.append(el)
            issues.append(
                ValidationIssue(
                    code="MISSING_MANDATORY_ELEMENT",
                    message=f"Məcburi çek elementi çatışmır: {el}",
                    element=el,
                )
            )

    return ValidationResult(
        ok=len(missing) == 0,
        missing_elements=tuple(missing),
        issues=tuple(issues),
        checked_elements=tuple(checked),
    )
