"""Azərbaycan Pərakəndə Sektoru üçün Test Məlumat Fabrikləri (Retail Test Data Factories).

Real Azərbaycan adları, geyim növləri, rəngləri, ölçüləri və filialları ilə
deterministik və etibarlı sınaq məlumatları generasiya edir.
"""

from __future__ import annotations

import random
import uuid
from decimal import Decimal
from typing import Any

from app.modules.catalog.models import Brand, Category, Product, ProductVariant

AZERBAIJANI_FIRST_NAMES = ["Elşən", "Nigar", "Rauf", "Leyla", "Tural", "Aysel", "Fərid", "Günel", "Kamran", "Sevinc"]
AZERBAIJANI_LAST_NAMES = ["Məmmədov", "Əliyeva", "Quliyev", "Həsənova", "İsmayılov", "Rzayeva", "Cəfərov", "Bağırova"]

RETAIL_PRODUCTS = [
    {"name": "Kişi Köynəyi Slim-Fit", "category": "Kişi Geyimi", "price": Decimal("79.90"), "cost": Decimal("35.00")},
    {"name": "Qadın İpək Don", "category": "Qadın Geyimi", "price": Decimal("149.00"), "cost": Decimal("60.00")},
    {"name": "Klassik Kostyum Şalvarı", "category": "Kişi Geyimi", "price": Decimal("119.50"), "cost": Decimal("50.00")},
    {"name": "Kaşmir Yun Jaket", "category": "Trikotaj", "price": Decimal("189.00"), "cost": Decimal("85.00")},
    {"name": "Kətan Yay Köynəyi", "category": "Kişi Geyimi", "price": Decimal("65.00"), "cost": Decimal("28.00")},
    {"name": "Dəri Şalvar Kəməri", "category": "Aksessuarlar", "price": Decimal("45.00"), "cost": Decimal("18.00")},
]

AZ_COLORS = ["Ağ", "Qara", "Tünd Göy", "Boz", "Zeytun Yaşılı", "Bej", "Tünd Qırmızı"]
CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "38", "40", "42"]


def random_az_name() -> str:
    return f"{random.choice(AZERBAIJANI_FIRST_NAMES)} {random.choice(AZERBAIJANI_LAST_NAMES)}"


def random_az_phone() -> str:
    prefix = random.choice(["50", "51", "55", "70", "77", "99"])
    digits = "".join([str(random.randint(0, 9)) for _ in range(7)])
    return f"+994{prefix}{digits}"


def create_retail_catalog_fixtures(company_id: uuid.UUID) -> dict[str, Any]:
    """Sınaq üçün kateqoriya, brend, məhsul və variantlar generasiya edir."""
    brand_id = uuid.uuid4()
    cat_id = uuid.uuid4()
    prod_id = uuid.uuid4()
    var_id = uuid.uuid4()

    brand = Brand(
        id=brand_id,
        company_id=company_id,
        name="Brand House Milano",
        code="BHM",
        is_active=True,
    )

    category = Category(
        id=cat_id,
        company_id=company_id,
        name="Kişi Geyimi",
        code="MENS-WEAR",
        is_active=True,
    )

    product = Product(
        id=prod_id,
        company_id=company_id,
        brand_id=brand_id,
        category_id=cat_id,
        name="Kişi Köynəyi Slim-Fit",
        internal_code="PRD-SHIRT-001",
        status="active",
    )

    variant = ProductVariant(
        id=var_id,
        company_id=company_id,
        product_id=prod_id,
        sku="SHIRT-SLIM-BLU-M",
        barcode="4760001002003",
        color="Tünd Göy",
        size="M",
        price_override=Decimal("89.90"),
        cost_price=Decimal("40.00"),
        status="active",
    )

    return {
        "brand": brand,
        "category": category,
        "product": product,
        "variant": variant,
    }
