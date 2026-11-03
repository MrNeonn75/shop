"""Kataloq Modulu Repozitorisi (Catalog Repository).

Verilənlər bazası sorğularını, axtarış, ağac strukturu və qiymət/maya dəyəri tarixçəsini icra edir.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    and_,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utc_now
from app.core.errors import VersionConflictError
from app.modules.catalog.models import (
    Brand,
    Category,
    CostHistory,
    ImportJob,
    ImportRow,
    PriceHistory,
    PriceList,
    PriceListItem,
    Product,
    ProductAttribute,
    ProductAttributeValue,
    ProductImage,
    ProductVariant,
    TaxClass,
    UnitOfMeasure,
)
from app.modules.catalog.ports import normalize_az_text


class CatalogRepository:
    """Kataloq üzrə bütün verilənlər bazası əməliyyatlarını həyata keçirən repozitori."""

    # --- Kateqoriyalar ---

    async def list_categories(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        parent_id: uuid.UUID | None = None,
        level: int | None = None,
        is_active: bool | None = None,
    ) -> list[Category]:
        stmt = select(Category)
        conditions = []
        if company_id is not None:
            conditions.append(Category.company_id == company_id)
        if parent_id is not None:
            conditions.append(Category.parent_id == parent_id)
        if level is not None:
            conditions.append(Category.level == level)
        if is_active is not None:
            conditions.append(Category.is_active == is_active)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(Category.level.asc(), Category.sort_order.asc(), Category.name.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_category_by_id(
        self, session: AsyncSession, category_id: uuid.UUID
    ) -> Category | None:
        stmt = select(Category).where(Category.id == category_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_category_by_code(
        self, session: AsyncSession, code: str, company_id: uuid.UUID | None = None
    ) -> Category | None:
        stmt = select(Category).where(func.lower(Category.code) == code.strip().lower())
        if company_id:
            stmt = stmt.where(Category.company_id == company_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_category_by_name(
        self, session: AsyncSession, name: str, parent_id: uuid.UUID | None = None
    ) -> Category | None:
        stmt = select(Category).where(func.lower(Category.name) == name.strip().lower())
        if parent_id is not None:
            stmt = stmt.where(Category.parent_id == parent_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_category(self, session: AsyncSession, category: Category) -> Category:
        session.add(category)
        await session.flush()
        return category

    async def update_category(self, session: AsyncSession, category: Category) -> Category:
        category.updated_at = utc_now()
        await session.flush()
        return category

    async def get_category_subtree_ids(
        self, session: AsyncSession, category_id: uuid.UUID
    ) -> list[uuid.UUID]:
        """Verilmiş kateqoriya və onun altındakı bütün budaqların ID-lərini qaytarır."""
        target = await self.get_category_by_id(session, category_id)
        if not target:
            return [category_id]
        # path /target_id/ və ya path == target.path
        stmt = select(Category.id).where(
            or_(
                Category.id == category_id,
                Category.path.like(f"{target.path}/%"),
                Category.path == target.path,
            )
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def check_category_has_active_products(
        self, session: AsyncSession, category_id: uuid.UUID
    ) -> bool:
        stmt = (
            select(func.count(Product.id))
            .where(
                or_(
                    Product.category_id == category_id,
                    Product.subcategory_id == category_id,
                )
            )
            .where(Product.status == "active")
        )
        res = await session.execute(stmt)
        cnt = res.scalar() or 0
        return cnt > 0

    async def reassign_category_products(
        self, session: AsyncSession, from_category_id: uuid.UUID, to_category_id: uuid.UUID
    ) -> int:
        stmt_cat = (
            update(Product)
            .where(Product.category_id == from_category_id)
            .values(category_id=to_category_id, updated_at=utc_now())
        )
        res_cat = await session.execute(stmt_cat)
        stmt_sub = (
            update(Product)
            .where(Product.subcategory_id == from_category_id)
            .values(subcategory_id=to_category_id, updated_at=utc_now())
        )
        res_sub = await session.execute(stmt_sub)
        return (res_cat.rowcount or 0) + (res_sub.rowcount or 0)

    # --- Brendlər ---

    async def list_brands(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        is_active: bool | None = None,
    ) -> list[Brand]:
        stmt = select(Brand)
        conditions = []
        if company_id is not None:
            conditions.append(Brand.company_id == company_id)
        if is_active is not None:
            conditions.append(Brand.is_active == is_active)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(Brand.name.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_brand_by_id(self, session: AsyncSession, brand_id: uuid.UUID) -> Brand | None:
        stmt = select(Brand).where(Brand.id == brand_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_brand_by_name(
        self, session: AsyncSession, name: str, company_id: uuid.UUID | None = None
    ) -> Brand | None:
        stmt = select(Brand).where(func.lower(Brand.name) == name.strip().lower())
        if company_id:
            stmt = stmt.where(Brand.company_id == company_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_brand_by_code(
        self, session: AsyncSession, code: str, company_id: uuid.UUID | None = None
    ) -> Brand | None:
        stmt = select(Brand).where(func.lower(Brand.code) == code.strip().lower())
        if company_id:
            stmt = stmt.where(Brand.company_id == company_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_brand(self, session: AsyncSession, brand: Brand) -> Brand:
        session.add(brand)
        await session.flush()
        return brand

    async def update_brand(self, session: AsyncSession, brand: Brand) -> Brand:
        brand.updated_at = utc_now()
        await session.flush()
        return brand

    # --- Ölçü Vahidləri və Vergi Sinifləri ---

    async def list_units(
        self, session: AsyncSession, is_active: bool | None = None
    ) -> list[UnitOfMeasure]:
        stmt = select(UnitOfMeasure)
        if is_active is not None:
            stmt = stmt.where(UnitOfMeasure.is_active == is_active)
        stmt = stmt.order_by(UnitOfMeasure.code.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_unit_by_id(
        self, session: AsyncSession, unit_id: uuid.UUID
    ) -> UnitOfMeasure | None:
        stmt = select(UnitOfMeasure).where(UnitOfMeasure.id == unit_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_unit_by_code(self, session: AsyncSession, code: str) -> UnitOfMeasure | None:
        stmt = select(UnitOfMeasure).where(func.lower(UnitOfMeasure.code) == code.strip().lower())
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_unit(self, session: AsyncSession, unit: UnitOfMeasure) -> UnitOfMeasure:
        session.add(unit)
        await session.flush()
        return unit

    async def list_tax_classes(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        is_active: bool | None = None,
    ) -> list[TaxClass]:
        stmt = select(TaxClass)
        conditions = []
        if company_id is not None:
            conditions.append(TaxClass.company_id == company_id)
        if is_active is not None:
            conditions.append(TaxClass.is_active == is_active)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(TaxClass.code.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_tax_class_by_id(
        self, session: AsyncSession, tax_class_id: uuid.UUID
    ) -> TaxClass | None:
        stmt = select(TaxClass).where(TaxClass.id == tax_class_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_tax_class_by_code(
        self, session: AsyncSession, code: str, company_id: uuid.UUID | None = None
    ) -> TaxClass | None:
        stmt = select(TaxClass).where(func.lower(TaxClass.code) == code.strip().lower())
        if company_id:
            stmt = stmt.where(TaxClass.company_id == company_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_tax_class(self, session: AsyncSession, tc: TaxClass) -> TaxClass:
        session.add(tc)
        await session.flush()
        return tc

    # --- Atributlar ---

    async def list_attributes(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        is_active: bool | None = None,
    ) -> list[ProductAttribute]:
        stmt = select(ProductAttribute).options(selectinload(ProductAttribute.values))
        conditions = []
        if company_id is not None:
            conditions.append(ProductAttribute.company_id == company_id)
        if is_active is not None:
            conditions.append(ProductAttribute.is_active == is_active)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(ProductAttribute.sort_order.asc(), ProductAttribute.name.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_attribute_by_id(
        self, session: AsyncSession, attribute_id: uuid.UUID
    ) -> ProductAttribute | None:
        stmt = (
            select(ProductAttribute)
            .options(selectinload(ProductAttribute.values))
            .where(ProductAttribute.id == attribute_id)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_attribute_by_name(
        self, session: AsyncSession, name: str, company_id: uuid.UUID | None = None
    ) -> ProductAttribute | None:
        stmt = (
            select(ProductAttribute)
            .options(selectinload(ProductAttribute.values))
            .where(func.lower(ProductAttribute.name) == name.strip().lower())
        )
        if company_id:
            stmt = stmt.where(ProductAttribute.company_id == company_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_attribute(
        self, session: AsyncSession, attr: ProductAttribute
    ) -> ProductAttribute:
        session.add(attr)
        await session.flush()
        return attr

    async def create_attribute_value(
        self, session: AsyncSession, val: ProductAttributeValue
    ) -> ProductAttributeValue:
        session.add(val)
        await session.flush()
        return val

    # --- Məhsullar (Products) ---

    async def list_products(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        section: str | None = None,
        type_: str | None = None,
        category_ids: list[uuid.UUID] | None = None,
        brand_id: uuid.UUID | None = None,
        status: str | None = None,
        query: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Product]:
        stmt = select(Product).options(
            selectinload(Product.variants),
            selectinload(Product.images),
        )
        conditions = []
        if company_id is not None:
            conditions.append(Product.company_id == company_id)
        if section:
            conditions.append(Product.section == section)
        if type_:
            conditions.append(Product.type == type_)
        if category_ids:
            conditions.append(
                or_(
                    Product.category_id.in_(category_ids),
                    Product.subcategory_id.in_(category_ids),
                )
            )
        if brand_id:
            conditions.append(Product.brand_id == brand_id)
        if status:
            conditions.append(Product.status == status)

        if query:
            clean_q = query.strip()
            norm_q = normalize_az_text(clean_q)
            q_like = f"%{clean_q.lower()}%"
            norm_like = f"%{norm_q}%"

            # Ad, internal_code və ya variant SKU/barkod axtarışı
            variant_match_stmt = select(ProductVariant.product_id).where(
                or_(
                    func.lower(ProductVariant.sku).like(q_like),
                    ProductVariant.barcode.like(q_like),
                )
            )

            conditions.append(
                or_(
                    func.lower(Product.name).like(q_like),
                    Product.normalized_name.like(norm_like),
                    func.lower(Product.internal_code).like(q_like),
                    Product.id.in_(variant_match_stmt),
                )
            )

        if conditions:
            stmt = stmt.where(and_(*conditions))

        stmt = stmt.order_by(Product.created_at.desc()).limit(limit).offset(offset)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def count_products(
        self,
        session: AsyncSession,
        company_id: uuid.UUID | None = None,
        section: str | None = None,
        type_: str | None = None,
        category_ids: list[uuid.UUID] | None = None,
        brand_id: uuid.UUID | None = None,
        status: str | None = None,
        query: str | None = None,
    ) -> int:
        stmt = select(func.count(Product.id))
        conditions = []
        if company_id is not None:
            conditions.append(Product.company_id == company_id)
        if section:
            conditions.append(Product.section == section)
        if type_:
            conditions.append(Product.type == type_)
        if category_ids:
            conditions.append(
                or_(
                    Product.category_id.in_(category_ids),
                    Product.subcategory_id.in_(category_ids),
                )
            )
        if brand_id:
            conditions.append(Product.brand_id == brand_id)
        if status:
            conditions.append(Product.status == status)

        if query:
            clean_q = query.strip()
            norm_q = normalize_az_text(clean_q)
            q_like = f"%{clean_q.lower()}%"
            norm_like = f"%{norm_q}%"

            variant_match_stmt = select(ProductVariant.product_id).where(
                or_(
                    func.lower(ProductVariant.sku).like(q_like),
                    ProductVariant.barcode.like(q_like),
                )
            )

            conditions.append(
                or_(
                    func.lower(Product.name).like(q_like),
                    Product.normalized_name.like(norm_like),
                    func.lower(Product.internal_code).like(q_like),
                    Product.id.in_(variant_match_stmt),
                )
            )

        if conditions:
            stmt = stmt.where(and_(*conditions))

        res = await session.execute(stmt)
        return res.scalar() or 0

    async def get_product_by_id(
        self, session: AsyncSession, product_id: uuid.UUID, load_relations: bool = True
    ) -> Product | None:
        stmt = select(Product).where(Product.id == product_id)
        if load_relations:
            stmt = stmt.options(
                selectinload(Product.variants),
                selectinload(Product.images),
            )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_product_by_code(
        self, session: AsyncSession, internal_code: str
    ) -> Product | None:
        stmt = (
            select(Product)
            .options(selectinload(Product.variants), selectinload(Product.images))
            .where(func.lower(Product.internal_code) == internal_code.strip().lower())
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_product(self, session: AsyncSession, product: Product) -> Product:
        product.normalized_name = normalize_az_text(product.name)
        session.add(product)
        await session.flush()
        return product

    async def update_product(
        self, session: AsyncSession, product: Product, expected_version: int | None = None
    ) -> Product:
        if expected_version is not None and product.version != expected_version:
            raise VersionConflictError(
                f"Məhsul başqa istifadəçi tərəfindən dəyişdirilib (gözlənilən versiya: {expected_version}, cari: {product.version})."
            )
        product.version += 1
        product.normalized_name = normalize_az_text(product.name)
        product.updated_at = utc_now()
        await session.flush()
        return product

    # --- Variantlar (Product Variants) ---

    async def list_variants(
        self,
        session: AsyncSession,
        product_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[ProductVariant]:
        stmt = select(ProductVariant)
        conditions = []
        if product_id is not None:
            conditions.append(ProductVariant.product_id == product_id)
        if status is not None:
            conditions.append(ProductVariant.status == status)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(ProductVariant.sku.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_variant_by_id(
        self, session: AsyncSession, variant_id: uuid.UUID
    ) -> ProductVariant | None:
        stmt = (
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .where(ProductVariant.id == variant_id)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_variant_by_sku(self, session: AsyncSession, sku: str) -> ProductVariant | None:
        stmt = (
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .where(func.lower(ProductVariant.sku) == sku.strip().lower())
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_variant_by_barcode(
        self, session: AsyncSession, barcode: str
    ) -> ProductVariant | None:
        stmt = (
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .where(ProductVariant.barcode == barcode.strip())
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def lookup_by_code(self, session: AsyncSession, code: str) -> ProductVariant | None:
        """POS üçün sürətli indekslənmiş axtarış (Barkod və ya SKU üzrə)."""
        clean_code = code.strip()
        stmt = (
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .where(
                or_(
                    ProductVariant.barcode == clean_code,
                    func.lower(ProductVariant.sku) == clean_code.lower(),
                )
            )
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_variant_by_attrs_hash(
        self, session: AsyncSession, product_id: uuid.UUID, attributes_hash: str
    ) -> ProductVariant | None:
        stmt = select(ProductVariant).where(
            ProductVariant.product_id == product_id,
            ProductVariant.attributes_hash == attributes_hash,
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_variant(
        self, session: AsyncSession, variant: ProductVariant
    ) -> ProductVariant:
        session.add(variant)
        await session.flush()
        return variant

    async def update_variant(
        self, session: AsyncSession, variant: ProductVariant, expected_version: int | None = None
    ) -> ProductVariant:
        if expected_version is not None and variant.version != expected_version:
            raise VersionConflictError(
                f"Variant başqa istifadəçi tərəfindən dəyişdirilib (gözlənilən versiya: {expected_version}, cari: {variant.version})."
            )
        variant.version += 1
        variant.updated_at = utc_now()
        await session.flush()
        return variant

    # --- Şəkillər ---

    async def list_images(self, session: AsyncSession, product_id: uuid.UUID) -> list[ProductImage]:
        stmt = (
            select(ProductImage)
            .where(ProductImage.product_id == product_id, ProductImage.is_deleted.is_(False))
            .order_by(ProductImage.sort_order.asc(), ProductImage.created_at.asc())
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def get_image_by_id(
        self, session: AsyncSession, image_id: uuid.UUID
    ) -> ProductImage | None:
        stmt = select(ProductImage).where(
            ProductImage.id == image_id, ProductImage.is_deleted.is_(False)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_image(self, session: AsyncSession, image: ProductImage) -> ProductImage:
        session.add(image)
        await session.flush()
        return image

    async def update_image(self, session: AsyncSession, image: ProductImage) -> ProductImage:
        await session.flush()
        return image

    async def clear_primary_images(self, session: AsyncSession, product_id: uuid.UUID) -> None:
        stmt = (
            update(ProductImage)
            .where(ProductImage.product_id == product_id)
            .values(is_primary=False)
        )
        await session.execute(stmt)

    # --- Qiymət Cədvəlləri və Dəyişməz Qiymət/Maya Dəyəri Tarixçəsi ---

    async def get_default_price_list(
        self, session: AsyncSession, company_id: uuid.UUID
    ) -> PriceList | None:
        stmt = select(PriceList).where(
            PriceList.company_id == company_id,
            PriceList.is_default.is_(True),
            PriceList.is_active.is_(True),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_price_for_variant(
        self,
        session: AsyncSession,
        variant_id: uuid.UUID,
        branch_id: uuid.UUID | None = None,
        at: datetime | None = None,
    ) -> Decimal | None:
        """Variant üçün cari və ya verilmiş zamandakı effektiv qiyməti hesablayır."""
        query_time = at or utc_now()

        # 1. Filial əsaslı qiymət cədvəli
        if branch_id is not None:
            stmt_branch = (
                select(PriceListItem.price)
                .join(PriceList, PriceList.id == PriceListItem.price_list_id)
                .where(
                    PriceListItem.variant_id == variant_id,
                    PriceList.branch_id == branch_id,
                    PriceList.is_active.is_(True),
                    PriceListItem.effective_from <= query_time,
                    or_(
                        PriceListItem.effective_to.is_(None),
                        PriceListItem.effective_to > query_time,
                    ),
                )
                .order_by(PriceListItem.effective_from.desc())
                .limit(1)
            )
            res_b = await session.execute(stmt_branch)
            branch_price = res_b.scalar_one_or_none()
            if branch_price is not None:
                return branch_price

        # 2. Ümumi PriceHistory qeydi
        stmt_hist = (
            select(PriceHistory.value)
            .where(
                PriceHistory.variant_id == variant_id,
                PriceHistory.effective_from <= query_time,
                or_(
                    PriceHistory.effective_to.is_(None),
                    PriceHistory.effective_to > query_time,
                ),
            )
            .order_by(PriceHistory.effective_from.desc())
            .limit(1)
        )
        res_h = await session.execute(stmt_hist)
        hist_price = res_h.scalar_one_or_none()
        if hist_price is not None:
            return hist_price

        # 3. Variantın birbaşa price_override qiyməti
        var = await self.get_variant_by_id(session, variant_id)
        if var and var.price_override is not None:
            return var.price_override

        return None

    async def get_cost_for_variant(
        self,
        session: AsyncSession,
        variant_id: uuid.UUID,
        at: datetime | None = None,
    ) -> Decimal | None:
        """Variant üçün verilmiş zamandakı maya dəyərini (cost) qaytarır."""
        query_time = at or utc_now()
        stmt_cost = (
            select(CostHistory.value)
            .where(
                CostHistory.variant_id == variant_id,
                CostHistory.effective_from <= query_time,
                or_(
                    CostHistory.effective_to.is_(None),
                    CostHistory.effective_to > query_time,
                ),
            )
            .order_by(CostHistory.effective_from.desc())
            .limit(1)
        )
        res = await session.execute(stmt_cost)
        cost_val = res.scalar_one_or_none()
        if cost_val is not None:
            return cost_val

        var = await self.get_variant_by_id(session, variant_id)
        return var.cost_price if var else None

    async def close_active_price_period(
        self,
        session: AsyncSession,
        variant_id: uuid.UUID,
        effective_from: datetime,
        branch_id: uuid.UUID | None = None,
    ) -> None:
        """Əvvəlki aktiv qiymət qeydinin effective_to tarixini yeni qeydin başlama vaxtına qapayır."""
        stmt = (
            update(PriceHistory)
            .where(
                PriceHistory.variant_id == variant_id,
                PriceHistory.branch_id == branch_id,
                PriceHistory.effective_to.is_(None),
            )
            .values(effective_to=effective_from)
        )
        await session.execute(stmt)

    async def add_price_history(
        self, session: AsyncSession, price_hist: PriceHistory
    ) -> PriceHistory:
        session.add(price_hist)
        await session.flush()
        return price_hist

    async def close_active_cost_period(
        self,
        session: AsyncSession,
        variant_id: uuid.UUID,
        effective_from: datetime,
    ) -> None:
        """Əvvəlki aktiv maya dəyəri qeydinin effective_to tarixini bağlayır."""
        stmt = (
            update(CostHistory)
            .where(
                CostHistory.variant_id == variant_id,
                CostHistory.effective_to.is_(None),
            )
            .values(effective_to=effective_from)
        )
        await session.execute(stmt)

    async def add_cost_history(self, session: AsyncSession, cost_hist: CostHistory) -> CostHistory:
        session.add(cost_hist)
        await session.flush()
        return cost_hist

    async def list_price_history(
        self, session: AsyncSession, variant_id: uuid.UUID
    ) -> list[PriceHistory]:
        stmt = (
            select(PriceHistory)
            .where(PriceHistory.variant_id == variant_id)
            .order_by(
                PriceHistory.effective_from.desc(),
                PriceHistory.created_at.desc(),
                PriceHistory.id.desc(),
            )
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def list_cost_history(
        self, session: AsyncSession, variant_id: uuid.UUID
    ) -> list[CostHistory]:
        stmt = (
            select(CostHistory)
            .where(CostHistory.variant_id == variant_id)
            .order_by(
                CostHistory.effective_from.desc(),
                CostHistory.created_at.desc(),
                CostHistory.id.desc(),
            )
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    # --- İdxal Tapşırıqları və Sətirləri ---

    async def create_import_job(self, session: AsyncSession, job: ImportJob) -> ImportJob:
        session.add(job)
        await session.flush()
        return job

    async def get_import_job(self, session: AsyncSession, job_id: uuid.UUID) -> ImportJob | None:
        stmt = select(ImportJob).options(selectinload(ImportJob.rows)).where(ImportJob.id == job_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def update_import_job(self, session: AsyncSession, job: ImportJob) -> ImportJob:
        await session.flush()
        return job

    async def create_import_rows(
        self, session: AsyncSession, rows: list[ImportRow]
    ) -> list[ImportRow]:
        session.add_all(rows)
        await session.flush()
        return rows

    async def list_import_rows(
        self, session: AsyncSession, job_id: uuid.UUID, status: str | None = None
    ) -> list[ImportRow]:
        stmt = select(ImportRow).where(ImportRow.job_id == job_id)
        if status:
            stmt = stmt.where(ImportRow.status == status)
        stmt = stmt.order_by(ImportRow.row_number.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())
