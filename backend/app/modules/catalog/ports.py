"""Kataloq Modulu Portları və Köməkçi Funksiyaları (Catalog Ports & Helpers).

Bu fayl digər modullarla asılısız əlaqə üçün oxuma portlarını (InventoryQueryPort, SupplierPort)
və Azərbaycan dilinin fonetik/diakritik normalizasiyasını, EAN-13 çeksum hesablamasını təmin edir.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class StockAvailability:
    """Variant üzrə mövcud stok göstəriciləri."""

    variant_id: uuid.UUID
    on_hand: int = 0
    reserved: int = 0
    available: int = 0
    status: str = "in_stock"  # in_stock, low_stock, out_of_stock


class InventoryQueryPort(Protocol):
    """Anbar modulu (B5) üçün oxuma portu."""

    async def get_variant_stock(
        self, variant_id: uuid.UUID, branch_id: uuid.UUID | None = None
    ) -> StockAvailability: ...

    async def get_variants_stock_bulk(
        self, variant_ids: list[uuid.UUID], branch_id: uuid.UUID | None = None
    ) -> dict[uuid.UUID, StockAvailability]: ...


class DefaultInventoryQueryPort:
    """Anbar modulu tam hazır olana qədər fəaliyyət göstərən standart mock/boş port."""

    async def get_variant_stock(
        self, variant_id: uuid.UUID, branch_id: uuid.UUID | None = None
    ) -> StockAvailability:
        _ = branch_id
        return StockAvailability(
            variant_id=variant_id, on_hand=0, reserved=0, available=0, status="out_of_stock"
        )

    async def get_variants_stock_bulk(
        self, variant_ids: list[uuid.UUID], branch_id: uuid.UUID | None = None
    ) -> dict[uuid.UUID, StockAvailability]:
        _ = branch_id
        return {
            vid: StockAvailability(
                variant_id=vid, on_hand=0, reserved=0, available=0, status="out_of_stock"
            )
            for vid in variant_ids
        }


# Qlobal port instansiyası
_inventory_port: InventoryQueryPort = DefaultInventoryQueryPort()


def get_inventory_port() -> InventoryQueryPort:
    return _inventory_port


def set_inventory_port(port: InventoryQueryPort) -> None:
    global _inventory_port
    _inventory_port = port


# --- Azərbaycan Dilində Fonetik və Diakritik Normalizasiya ---

AZ_CHAR_MAP = {
    "ə": "e",
    "Ə": "e",
    "ı": "i",
    "I": "i",
    "İ": "i",
    "i": "i",
    "ö": "o",
    "Ö": "o",
    "ü": "u",
    "Ü": "u",
    "ç": "c",
    "Ç": "c",
    "ş": "s",
    "Ş": "s",
    "ğ": "g",
    "Ğ": "g",
}


def normalize_az_text(text: str | None) -> str:
    """Azərbaycan əlifbasının xüsusi hərflərini (ə, ı, ö, ü, ç, ş, ğ, İ) axtarış üçün standartlaşdırır."""
    if not text:
        return ""
    result = []
    for ch in text.strip():
        if ch in AZ_CHAR_MAP:
            result.append(AZ_CHAR_MAP[ch])
        else:
            result.append(ch.lower())
    # Çoxsaylı boşluqları tək boşluğa endiririk
    return re.sub(r"\s+", " ", "".join(result)).strip()


# --- EAN-13 və Barcode Funksiyaları ---


def calculate_ean13_checksum(digits12: str) -> str:
    """12 rəqəmli sətir üçün EAN-13 çeksum rəqəmini hesablayır."""
    if len(digits12) != 12 or not digits12.isdigit():
        raise ValueError("EAN-13 yoxlama rəqəmi üçün dəqiq 12 rəqəm tələb olunur.")

    odd_sum = sum(int(digits12[i]) for i in range(0, 12, 2))
    even_sum = sum(int(digits12[i]) for i in range(1, 12, 2)) * 3
    total = odd_sum + even_sum
    check_digit = (10 - (total % 10)) % 10
    return str(check_digit)


def validate_ean13(barcode: str | None) -> bool:
    """Barkodun EAN-13 standartına və yoxlama rəqəminə uyğunluğunu yoxlayır."""
    if not barcode:
        return False
    clean = barcode.strip()
    if len(clean) != 13 or not clean.isdigit():
        return False
    expected_check = calculate_ean13_checksum(clean[:12])
    return clean[12] == expected_check


def generate_ean13(prefix: str, sequence_num: int) -> str:
    """Verilmiş prefiks və ardıcıl sayğac əsasında tam 13 rəqəmli EAN-13 barkodu yaradır."""
    # Prefix (məsələn: 200 - daxili mağaza prefiksi)
    clean_prefix = re.sub(r"\D", "", prefix) or "200"
    if len(clean_prefix) > 6:
        clean_prefix = clean_prefix[:6]

    remaining_len = 12 - len(clean_prefix)
    seq_str = str(sequence_num % (10**remaining_len)).zfill(remaining_len)
    digits12 = f"{clean_prefix}{seq_str}"
    checksum = calculate_ean13_checksum(digits12)
    return f"{digits12}{checksum}"
