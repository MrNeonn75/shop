"""Kataloq Modulu Biznes Xidmət Qatı (Catalog Service).

Məhsul idarəetməsi, matris variant generatoru, kateqoriya ağacı (cycle prevention, merge),
fasiləsiz barkod generasiyası, dəyişməz qiymət/maya dəyəri tarixçəsi, PDF etiket renderi
və CSV/XLSX idxal/ixrac boru kəmərini icra edir.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
import uuid
from decimal import Decimal
from typing import Any

from PIL import Image
from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.lib.pagesizes import mm
from reportlab.pdfgen import canvas

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.catalog.events import (
    CostChangedEvent,
    PriceChangedEvent,
    ProductCreatedEvent,
    ProductDiscontinuedEvent,
    ProductReactivatedEvent,
    ProductUpdatedEvent,
    VariantCreatedEvent,
    VariantUpdatedEvent,
)
from app.modules.catalog.models import (
    Brand,
    Category,
    CostHistory,
    ImportJob,
    ImportRow,
    PriceHistory,
    Product,
    ProductAttribute,
    ProductAttributeValue,
    ProductImage,
    ProductVariant,
    TaxClass,
    UnitOfMeasure,
)
from app.modules.catalog.policies import (
    can_export_catalog,
    can_import_catalog,
    can_manage_catalog,
    can_manage_price,
    can_render_labels,
    can_view_catalog,
    can_view_cost,
)
from app.modules.catalog.ports import (
    generate_ean13,
    get_inventory_port,
    normalize_az_text,
    validate_ean13,
)
from app.modules.catalog.repository import CatalogRepository
from app.modules.catalog.schemas import (
    BrandCreate,
    BrandResponse,
    BrandUpdate,
    BulkPriceUpdateRequest,
    BulkPriceUpdateResponse,
    CatalogExportRequest,
    CategoryCreate,
    CategoryMergeRequest,
    CategoryResponse,
    CategoryUpdate,
    CostChangeRequest,
    CostHistoryResponse,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    ImportUploadResponse,
    LabelRenderRequest,
    PosLookupResponse,
    PriceChangeRequest,
    PriceHistoryResponse,
    ProductAttributeCreate,
    ProductAttributeResponse,
    ProductAttributeValueResponse,
    ProductBulkCategoryRequest,
    ProductBulkStatusRequest,
    ProductCreate,
    ProductDiscontinueRequest,
    ProductImageResponse,
    ProductListItem,
    ProductResponse,
    ProductUpdate,
    ProductVariantCreate,
    ProductVariantResponse,
    ProductVariantUpdate,
    TaxClassCreate,
    TaxClassResponse,
    UnitOfMeasureCreate,
    UnitOfMeasureResponse,
    VariantMatrixGenerateRequest,
    VariantMatrixGenerateResponse,
    VariantMatrixItemPreview,
    VariantUniquenessCheckRequest,
    VariantUniquenessCheckResponse,
)
from app.shared.audit import record_audit_event
from app.shared.outbox import record_outbox_event


def compute_attributes_hash(
    size: str | None, color: str | None, other_attrs: dict[str, Any] | None
) -> str:
    """Variantın ölçü, rəng və digər xassələri üzrə unikal deterministik heşini hesablayır."""
    norm_size = (size or "").strip().lower()
    norm_color = (color or "").strip().lower()
    items = []
    if other_attrs:
        for k in sorted(other_attrs.keys()):
            items.append(f"{k.lower()}={str(other_attrs[k]).lower()}")
    attrs_str = f"s:{norm_size}|c:{norm_color}|o:{','.join(items)}"
    return hashlib.sha256(attrs_str.encode("utf-8")).hexdigest()[:32]


class CatalogService:
    """Kataloq modulu üzrə bütün biznes məntiqini icra edən mərkəzi xidmət."""

    def __init__(self, repository: CatalogRepository | None = None) -> None:
        self.repo = repository or CatalogRepository()

    # --- Kateqoriyalar ---

    async def list_categories(
        self,
        company_id: uuid.UUID | None = None,
        parent_id: uuid.UUID | None = None,
        level: int | None = None,
        is_active: bool | None = None,
        actor: Any = None,
    ) -> list[CategoryResponse]:
        if not can_view_catalog(actor):
            raise ForbiddenError("Kataloq kateqoriyalarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            categories = await self.repo.list_categories(
                uow.session,
                company_id=company_id,
                parent_id=parent_id,
                level=level,
                is_active=is_active,
            )
            return [CategoryResponse.model_validate(c) for c in categories]

    async def get_category_tree(
        self, company_id: uuid.UUID | None = None, actor: Any = None
    ) -> list[CategoryResponse]:
        """Bütün kateqoriyaları iyerarxik ağac strukturu şəklində qaytarır."""
        if not can_view_catalog(actor):
            raise ForbiddenError("Kataloq kateqoriyalarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            all_cats = await self.repo.list_categories(uow.session, company_id=company_id)
            cat_map: dict[uuid.UUID, CategoryResponse] = {
                c.id: CategoryResponse.model_validate(c) for c in all_cats
            }
            roots: list[CategoryResponse] = []
            for c in all_cats:
                dto = cat_map[c.id]
                if c.parent_id and c.parent_id in cat_map:
                    cat_map[c.parent_id].children.append(dto)
                else:
                    roots.append(dto)
            return roots

    async def get_category(self, category_id: uuid.UUID, actor: Any = None) -> CategoryResponse:
        if not can_view_catalog(actor):
            raise ForbiddenError("Kateqoriya məlumatlarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            cat = await self.repo.get_category_by_id(uow.session, category_id)
            if not cat:
                raise NotFoundError("Kateqoriya tapılmadı.")
            return CategoryResponse.model_validate(cat)

    async def create_category(
        self, data: CategoryCreate, company_id: uuid.UUID, actor: Any = None
    ) -> CategoryResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Kateqoriya yaratmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            existing = await self.repo.get_category_by_code(
                uow.session, data.code, company_id=company_id
            )
            if existing:
                raise ConflictError(f"'{data.code}' kodlu kateqoriya artıq mövcuddur.")

            cat_id = generate_uuid7()
            path = f"/{cat_id}"
            level = data.level

            if data.parent_id:
                parent = await self.repo.get_category_by_id(uow.session, data.parent_id)
                if not parent:
                    raise NotFoundError("Valideyn kateqoriya tapılmadı.")
                path = f"{parent.path}/{cat_id}"
                level = parent.level + 1

            cat = Category(
                id=cat_id,
                company_id=company_id,
                parent_id=data.parent_id,
                name=data.name.strip(),
                code=data.code.strip().upper(),
                level=level,
                path=path,
                sort_order=data.sort_order,
                is_active=True,
                default_min_stock=data.default_min_stock,
                created_at=utc_now(),
            )
            created = await self.repo.create_category(uow.session, cat)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="CATEGORY_CREATED",
                resource_type="categories",
                resource_id=str(created.id),
                actor_id=actor_id,
                diff={"name": created.name, "code": created.code, "level": created.level},
            )
            await uow.commit()
            return CategoryResponse.model_validate(created)

    async def update_category(
        self, category_id: uuid.UUID, data: CategoryUpdate, actor: Any = None
    ) -> CategoryResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Kateqoriya redaktə etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            cat = await self.repo.get_category_by_id(uow.session, category_id)
            if not cat:
                raise NotFoundError("Kateqoriya tapılmadı.")

            # Dövrə (Cycle) qarşısının alınması
            if data.parent_id is not None:
                if data.parent_id == category_id:
                    raise BusinessRuleViolationError(
                        "Kateqoriya özünün valideyni ola bilməz (dövrə xətası)."
                    )
                subtree_ids = await self.repo.get_category_subtree_ids(uow.session, category_id)
                if data.parent_id in subtree_ids:
                    raise BusinessRuleViolationError(
                        "Kateqoriya öz alt budağının altına köçürülə bilməz (dövrə xətası)."
                    )
                parent = await self.repo.get_category_by_id(uow.session, data.parent_id)
                if not parent:
                    raise NotFoundError("Yeni valideyn kateqoriya tapılmadı.")
                cat.parent_id = data.parent_id
                cat.path = f"{parent.path}/{cat.id}"
                cat.level = parent.level + 1

            # Deaktivasiya qadağası: aktiv məhsullar varsa deaktiv etmək olmaz!
            if data.is_active is False and cat.is_active is True:
                has_active = await self.repo.check_category_has_active_products(
                    uow.session, category_id
                )
                if has_active:
                    raise BusinessRuleViolationError(
                        "Bu kateqoriyaya bağlı aktiv məhsullar mövcuddur. Deaktiv etməzdən əvvəl məhsulları "
                        "başqa kateqoriyaya birləşdirmək (merge) və ya köçürmək tələb olunur."
                    )
                cat.is_active = False
            elif data.is_active is True:
                cat.is_active = True

            if data.name is not None:
                cat.name = data.name.strip()
            if data.sort_order is not None:
                cat.sort_order = data.sort_order
            if data.default_min_stock is not None:
                cat.default_min_stock = data.default_min_stock

            updated = await self.repo.update_category(uow.session, cat)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="CATEGORY_UPDATED",
                resource_type="categories",
                resource_id=str(updated.id),
                actor_id=actor_id,
                diff={"name": updated.name, "is_active": updated.is_active},
            )
            await uow.commit()
            return CategoryResponse.model_validate(updated)

    async def merge_categories(
        self, source_category_id: uuid.UUID, data: CategoryMergeRequest, actor: Any = None
    ) -> CategoryResponse:
        """İki kateqoriyanı birləşdirir: məhsulları hədəf kateqoriyaya köçürür və yönləndirmə (redirect) təyin edir."""
        if not can_manage_catalog(actor):
            raise ForbiddenError("Kateqoriyaları birləşdirmək hüququnuz yoxdur.")

        if source_category_id == data.target_category_id:
            raise BusinessRuleViolationError("Eyni kateqoriya özü ilə birləşdirilə bilməz.")

        async with UnitOfWork() as uow:
            source = await self.repo.get_category_by_id(uow.session, source_category_id)
            if not source:
                raise NotFoundError("Mənbə kateqoriya tapılmadı.")
            target = await self.repo.get_category_by_id(uow.session, data.target_category_id)
            if not target:
                raise NotFoundError("Hədəf kateqoriya tapılmadı.")

            # Məhsulları köçürürük
            moved_count = await self.repo.reassign_category_products(
                uow.session,
                from_category_id=source_category_id,
                to_category_id=data.target_category_id,
            )

            # Mənbə kateqoriyanı deaktiv edirik və redirect qeyd edirik
            source.is_active = False
            source.redirect_category_id = data.target_category_id
            await self.repo.update_category(uow.session, source)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="CATEGORY_MERGED",
                resource_type="categories",
                resource_id=str(source_category_id),
                actor_id=actor_id,
                diff={
                    "source_id": str(source_category_id),
                    "target_id": str(data.target_category_id),
                    "moved_products_count": moved_count,
                    "reason": data.reason,
                },
            )
            await uow.commit()
            return CategoryResponse.model_validate(source)

    # --- Brendlər ---

    async def list_brands(
        self, company_id: uuid.UUID | None = None, is_active: bool | None = None, actor: Any = None
    ) -> list[BrandResponse]:
        if not can_view_catalog(actor):
            raise ForbiddenError("Brendlərə baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            brands = await self.repo.list_brands(
                uow.session, company_id=company_id, is_active=is_active
            )
            return [BrandResponse.model_validate(b) for b in brands]

    async def get_brand(self, brand_id: uuid.UUID, actor: Any = None) -> BrandResponse:
        if not can_view_catalog(actor):
            raise ForbiddenError("Brend məlumatlarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            b = await self.repo.get_brand_by_id(uow.session, brand_id)
            if not b:
                raise NotFoundError("Brend tapılmadı.")
            return BrandResponse.model_validate(b)

    async def create_brand(
        self, data: BrandCreate, company_id: uuid.UUID, actor: Any = None
    ) -> BrandResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Brend yaratmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            existing = await self.repo.get_brand_by_name(
                uow.session, data.name, company_id=company_id
            )
            if existing:
                raise ConflictError(f"'{data.name}' adlı brend artıq mövcuddur.")

            brand = Brand(
                id=generate_uuid7(),
                company_id=company_id,
                name=data.name.strip(),
                code=data.code.strip().upper(),
                logo_url=data.logo_url.strip() if data.logo_url else None,
                is_active=True,
                created_at=utc_now(),
            )
            created = await self.repo.create_brand(uow.session, brand)
            await uow.commit()
            return BrandResponse.model_validate(created)

    async def update_brand(
        self, brand_id: uuid.UUID, data: BrandUpdate, actor: Any = None
    ) -> BrandResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Brendi redaktə etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            b = await self.repo.get_brand_by_id(uow.session, brand_id)
            if not b:
                raise NotFoundError("Brend tapılmadı.")

            if data.name is not None and data.name.strip().lower() != b.name.lower():
                existing = await self.repo.get_brand_by_name(
                    uow.session, data.name, company_id=b.company_id
                )
                if existing:
                    raise ConflictError(f"'{data.name}' adlı brend artıq mövcuddur.")
                b.name = data.name.strip()

            if data.logo_url is not None:
                b.logo_url = data.logo_url.strip() if data.logo_url else None
            if data.is_active is not None:
                b.is_active = data.is_active

            updated = await self.repo.update_brand(uow.session, b)
            await uow.commit()
            return BrandResponse.model_validate(updated)

    # --- Ölçü Vahidləri və Vergi Sinifləri ---

    async def list_units(self, actor: Any = None) -> list[UnitOfMeasureResponse]:
        _ = actor
        async with UnitOfWork() as uow:
            units = await self.repo.list_units(uow.session, is_active=True)
            return [UnitOfMeasureResponse.model_validate(u) for u in units]

    async def create_unit(
        self, data: UnitOfMeasureCreate, actor: Any = None
    ) -> UnitOfMeasureResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Ölçü vahidi yaratmaq hüququnuz yoxdur.")
        async with UnitOfWork() as uow:
            existing = await self.repo.get_unit_by_code(uow.session, data.code)
            if existing:
                raise ConflictError(f"'{data.code}' kodlu ölçü vahidi artıq mövcuddur.")
            unit = UnitOfMeasure(
                id=generate_uuid7(),
                code=data.code.strip().lower(),
                name_az=data.name_az.strip(),
                precision=data.precision,
                is_active=True,
            )
            created = await self.repo.create_unit(uow.session, unit)
            await uow.commit()
            return UnitOfMeasureResponse.model_validate(created)

    async def list_tax_classes(
        self, company_id: uuid.UUID | None = None, actor: Any = None
    ) -> list[TaxClassResponse]:
        _ = actor
        async with UnitOfWork() as uow:
            tcs = await self.repo.list_tax_classes(
                uow.session, company_id=company_id, is_active=True
            )
            return [TaxClassResponse.model_validate(tc) for tc in tcs]

    async def create_tax_class(
        self, data: TaxClassCreate, company_id: uuid.UUID, actor: Any = None
    ) -> TaxClassResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Vergi sinfi yaratmaq hüququnuz yoxdur.")
        async with UnitOfWork() as uow:
            existing = await self.repo.get_tax_class_by_code(
                uow.session, data.code, company_id=company_id
            )
            if existing:
                raise ConflictError(f"'{data.code}' kodlu vergi sinfi artıq mövcuddur.")
            tc = TaxClass(
                id=generate_uuid7(),
                company_id=company_id,
                code=data.code.strip().upper(),
                name_az=data.name_az.strip(),
                rate_ref=data.rate_ref.strip(),
                is_active=True,
            )
            created = await self.repo.create_tax_class(uow.session, tc)
            await uow.commit()
            return TaxClassResponse.model_validate(created)

    # --- Atributlar ---

    async def list_attributes(
        self, company_id: uuid.UUID | None = None, actor: Any = None
    ) -> list[ProductAttributeResponse]:
        _ = actor
        async with UnitOfWork() as uow:
            attrs = await self.repo.list_attributes(
                uow.session, company_id=company_id, is_active=True
            )
            return [
                ProductAttributeResponse(
                    id=a.id,
                    company_id=a.company_id,
                    name=a.name,
                    code=a.code,
                    attribute_type=a.attribute_type,
                    is_variant_defining=a.is_variant_defining,
                    is_active=a.is_active,
                    sort_order=a.sort_order,
                    values=[ProductAttributeValueResponse.model_validate(v) for v in a.values],
                )
                for a in attrs
            ]

    async def create_attribute(
        self, data: ProductAttributeCreate, company_id: uuid.UUID, actor: Any = None
    ) -> ProductAttributeResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Atribut yaratmaq hüququnuz yoxdur.")
        async with UnitOfWork() as uow:
            existing = await self.repo.get_attribute_by_name(
                uow.session, data.name, company_id=company_id
            )
            if existing:
                raise ConflictError(f"'{data.name}' adlı atribut artıq mövcuddur.")

            attr = ProductAttribute(
                id=generate_uuid7(),
                company_id=company_id,
                name=data.name.strip(),
                code=data.code.strip().lower(),
                attribute_type=data.attribute_type,
                is_variant_defining=data.is_variant_defining,
                sort_order=data.sort_order,
                is_active=True,
            )
            created = await self.repo.create_attribute(uow.session, attr)
            for v in data.values:
                val = ProductAttributeValue(
                    id=generate_uuid7(),
                    attribute_id=created.id,
                    value=v.value.strip(),
                    code=v.code.strip().upper(),
                    color_hex=v.color_hex,
                    sort_order=v.sort_order,
                )
                await self.repo.create_attribute_value(uow.session, val)

            await uow.commit()
            fetched = await self.repo.get_attribute_by_id(uow.session, created.id)
            assert fetched is not None
            return ProductAttributeResponse(
                id=fetched.id,
                company_id=fetched.company_id,
                name=fetched.name,
                code=fetched.code,
                attribute_type=fetched.attribute_type,
                is_variant_defining=fetched.is_variant_defining,
                is_active=fetched.is_active,
                sort_order=fetched.sort_order,
                values=[ProductAttributeValueResponse.model_validate(v) for v in fetched.values],
            )

    # --- Məhsullar (Products) ---

    async def list_products(
        self,
        company_id: uuid.UUID | None = None,
        section: str | None = None,
        type_: str | None = None,
        category_id: uuid.UUID | None = None,
        brand_id: uuid.UUID | None = None,
        status: str | None = None,
        query: str | None = None,
        branch_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
        actor: Any = None,
    ) -> list[ProductListItem]:
        if not can_view_catalog(actor):
            raise ForbiddenError("Məhsullar siyahısına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            category_ids: list[uuid.UUID] | None = None
            if category_id:
                category_ids = await self.repo.get_category_subtree_ids(uow.session, category_id)

            products = await self.repo.list_products(
                uow.session,
                company_id=company_id,
                section=section,
                type_=type_,
                category_ids=category_ids,
                brand_id=brand_id,
                status=status,
                query=query,
                limit=limit,
                offset=offset,
            )

            # Anbar qalıqları portunu çağırırıq
            inv_port = get_inventory_port()
            all_variant_ids = [v.id for p in products for v in p.variants]
            stock_map = await inv_port.get_variants_stock_bulk(all_variant_ids, branch_id=branch_id)

            items: list[ProductListItem] = []
            for p in products:
                prices = [v.price_override for v in p.variants if v.price_override is not None]
                min_p = min(prices) if prices else None
                max_p = max(prices) if prices else None

                p_stock_on_hand = sum(
                    stock_map[v.id].on_hand for v in p.variants if v.id in stock_map
                )
                p_stock_available = sum(
                    stock_map[v.id].available for v in p.variants if v.id in stock_map
                )

                primary_img = next(
                    (img.thumbnail_url or img.url for img in p.images if img.is_primary), None
                )
                if not primary_img and p.images:
                    primary_img = p.images[0].thumbnail_url or p.images[0].url

                items.append(
                    ProductListItem(
                        id=p.id,
                        internal_code=p.internal_code,
                        name=p.name,
                        section=p.section,
                        type=p.type,
                        category_id=p.category_id,
                        brand_id=p.brand_id,
                        status=p.status,
                        is_sell_through=p.is_sell_through,
                        variants_count=len(p.variants),
                        min_price=min_p,
                        max_price=max_p,
                        total_stock_on_hand=p_stock_on_hand,
                        total_stock_available=p_stock_available,
                        primary_image_url=primary_img,
                        created_at=p.created_at,
                    )
                )
            return items

    async def get_product(
        self, product_id: uuid.UUID, branch_id: uuid.UUID | None = None, actor: Any = None
    ) -> ProductResponse:
        if not can_view_catalog(actor):
            raise ForbiddenError("Məhsul məlumatlarına baxış hüququnuz yoxdur.")

        allow_cost = can_view_cost(actor)

        async with UnitOfWork() as uow:
            p = await self.repo.get_product_by_id(uow.session, product_id, load_relations=True)
            if not p:
                raise NotFoundError("Məhsul tapılmadı.")

            # Kateqoriyanın default_min_stock dəyəri
            cat = await self.repo.get_category_by_id(uow.session, p.category_id)
            cat_min_stock = cat.default_min_stock if cat else None

            # Anbar qalığı portu
            inv_port = get_inventory_port()
            variant_ids = [v.id for v in p.variants]
            stock_map = await inv_port.get_variants_stock_bulk(variant_ids, branch_id=branch_id)

            variant_dtos: list[ProductVariantResponse] = []
            for v in p.variants:
                # Minimum stok iyerarxiyası: variant -> product -> category -> setting (5)
                eff_min = (
                    v.min_stock
                    if v.min_stock is not None
                    else (
                        p.min_stock_default
                        if p.min_stock_default is not None
                        else (cat_min_stock if cat_min_stock is not None else 5)
                    )
                )

                st = stock_map.get(v.id)
                cur_price = await self.repo.get_price_for_variant(
                    uow.session, v.id, branch_id=branch_id
                )

                variant_dtos.append(
                    ProductVariantResponse(
                        id=v.id,
                        product_id=v.product_id,
                        company_id=v.company_id,
                        sku=v.sku,
                        barcode=v.barcode,
                        size=v.size,
                        color=v.color,
                        other_attributes=v.other_attributes,
                        price=cur_price or v.price_override,
                        price_override=v.price_override,
                        cost_price=v.cost_price if allow_cost else None,
                        min_stock=v.min_stock,
                        effective_min_stock=eff_min,
                        status=v.status,
                        version=v.version,
                        stock_on_hand=st.on_hand if st else 0,
                        stock_available=st.available if st else 0,
                        stock_status=st.status if st else "out_of_stock",
                        created_at=v.created_at,
                        updated_at=v.updated_at,
                    )
                )

            image_dtos = [
                ProductImageResponse.model_validate(img) for img in p.images if not img.is_deleted
            ]

            return ProductResponse(
                id=p.id,
                company_id=p.company_id,
                internal_code=p.internal_code,
                name=p.name,
                description=p.description,
                section=p.section,
                type=p.type,
                category_id=p.category_id,
                subcategory_id=p.subcategory_id,
                brand_id=p.brand_id,
                unit_id=p.unit_id,
                tax_class_id=p.tax_class_id,
                status=p.status,
                is_sell_through=p.is_sell_through,
                min_stock_default=p.min_stock_default,
                attributes_schema=p.attributes_schema,
                version=p.version,
                variants=variant_dtos,
                images=image_dtos,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )

    async def create_product(
        self, data: ProductCreate, company_id: uuid.UUID, actor: Any = None
    ) -> ProductResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Məhsul yaratmaq hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)

        async with UnitOfWork() as uow:
            # 1. Daxili kod (internal_code) təyini
            code = data.internal_code
            if not code:
                # Nömrələnmə xidmətindən ardıcıl kod alırıq
                from app.modules.numbering.service import get_numbering_service

                num_svc = get_numbering_service()
                code = await num_svc.next("product", company_id=company_id, session=uow.session)
            else:
                code = code.strip().upper()

            existing_code = await self.repo.get_product_by_code(uow.session, code)
            if existing_code:
                raise ConflictError(f"'{code}' kodlu məhsul artıq mövcuddur.")

            # 2. Kateqoriya yoxlanışı
            cat = await self.repo.get_category_by_id(uow.session, data.category_id)
            if not cat:
                raise NotFoundError("Təyin olunmuş kateqoriya tapılmadı.")

            prod = Product(
                id=generate_uuid7(),
                company_id=company_id,
                internal_code=code,
                name=data.name.strip(),
                normalized_name=normalize_az_text(data.name),
                description=data.description.strip() if data.description else None,
                section=data.section.strip(),
                type=data.type.strip(),
                category_id=data.category_id,
                subcategory_id=data.subcategory_id,
                brand_id=data.brand_id,
                unit_id=data.unit_id,
                tax_class_id=data.tax_class_id,
                status="active",
                is_sell_through=False,
                min_stock_default=data.min_stock_default,
                attributes_schema=data.attributes_schema,
                created_by=actor_id,
                version=1,
                created_at=utc_now(),
            )
            created_prod = await self.repo.create_product(uow.session, prod)

            # 3. İlkin variantların yaradılması
            variants_to_create = list(data.initial_variants)
            # Tək variantlı məhsullar (məs: aksesuar, oyuncaq) üçün default variant
            if not variants_to_create and (
                data.type.lower() in ("aksesuar", "digər") or cat.level >= 3
            ):
                variants_to_create.append(
                    ProductVariantCreate(
                        sku=f"{code}-DEF",
                        size="STANDART",
                        color=None,
                        price_override=None,
                        cost_price=None,
                    )
                )

            brand_code = "GEN"
            if data.brand_id:
                b = await self.repo.get_brand_by_id(uow.session, data.brand_id)
                if b:
                    brand_code = b.code[:3].upper()

            for v_dto in variants_to_create:
                sku = v_dto.sku
                if not sku:
                    sku = self.suggest_sku(
                        brand_code=brand_code,
                        product_code=code,
                        size=v_dto.size,
                        color=v_dto.color,
                    )

                # Qlobal SKU unikallığı
                exist_sku = await self.repo.get_variant_by_sku(uow.session, sku)
                if exist_sku:
                    raise ConflictError(
                        f"'{sku}' SKU artıq başqa variant üçün qeydiyyatdan keçib.",
                        details={"conflicting_variant_id": str(exist_sku.id), "field": "sku"},
                    )

                # Barkod yoxlanışı
                barcode = v_dto.barcode.strip() if v_dto.barcode else None
                if barcode:
                    if not validate_ean13(barcode) and len(barcode) == 13:
                        raise BusinessRuleViolationError(
                            f"'{barcode}' EAN-13 yoxlama rəqəmi (checksum) yalnışdır."
                        )
                    exist_bc = await self.repo.get_variant_by_barcode(uow.session, barcode)
                    if exist_bc:
                        raise ConflictError(
                            f"'{barcode}' barkodu artıq başqa variant üçün qeydiyyatdan keçib.",
                            details={
                                "conflicting_variant_id": str(exist_bc.id),
                                "field": "barcode",
                            },
                        )

                attrs_hash = compute_attributes_hash(
                    v_dto.size, v_dto.color, v_dto.other_attributes
                )
                var = ProductVariant(
                    id=generate_uuid7(),
                    product_id=created_prod.id,
                    company_id=company_id,
                    sku=sku.strip().upper(),
                    barcode=barcode,
                    size=v_dto.size.strip().upper() if v_dto.size else None,
                    color=v_dto.color.strip() if v_dto.color else None,
                    other_attributes=v_dto.other_attributes,
                    attributes_hash=attrs_hash,
                    price_override=v_dto.price_override,
                    cost_price=v_dto.cost_price,
                    min_stock=v_dto.min_stock,
                    status="active",
                    version=1,
                    created_at=utc_now(),
                )
                created_var = await self.repo.create_variant(uow.session, var)

                # İlkin qiymət tarixçəsi
                if v_dto.price_override is not None:
                    ph = PriceHistory(
                        id=generate_uuid7(),
                        variant_id=created_var.id,
                        product_id=created_prod.id,
                        value=v_dto.price_override,
                        effective_from=utc_now(),
                        reason="Məhsul yaradılarkən ilkin qiymət",
                        source="initial",
                    )
                    await self.repo.add_price_history(uow.session, ph)

                # İlkin maya dəyəri tarixçəsi
                if v_dto.cost_price is not None:
                    ch = CostHistory(
                        id=generate_uuid7(),
                        variant_id=created_var.id,
                        product_id=created_prod.id,
                        value=v_dto.cost_price,
                        effective_from=utc_now(),
                        reason="Məhsul yaradılarkən ilkin maya dəyəri",
                        source="initial",
                    )
                    await self.repo.add_cost_history(uow.session, ch)

                await record_outbox_event(
                    uow.session,
                    VariantCreatedEvent(
                        variant_id=created_var.id,
                        product_id=created_prod.id,
                        sku=created_var.sku,
                        barcode=created_var.barcode,
                    ),
                )

            # Audit və Outbox
            await record_audit_event(
                session=uow.session,
                action="PRODUCT_CREATED",
                resource_type="products",
                resource_id=str(created_prod.id),
                actor_id=actor_id,
                diff={"internal_code": created_prod.internal_code, "name": created_prod.name},
            )
            await record_outbox_event(
                uow.session,
                ProductCreatedEvent(
                    product_id=created_prod.id,
                    internal_code=created_prod.internal_code,
                    name=created_prod.name,
                ),
            )
            await uow.commit()

            return await self.get_product(created_prod.id, actor=actor)

    async def update_product(
        self, product_id: uuid.UUID, data: ProductUpdate, actor: Any = None
    ) -> ProductResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Məhsulu redaktə etmək hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)

        async with UnitOfWork() as uow:
            prod = await self.repo.get_product_by_id(uow.session, product_id)
            if not prod:
                raise NotFoundError("Məhsul tapılmadı.")

            old_state = {
                "name": prod.name,
                "status": prod.status,
                "category_id": str(prod.category_id),
            }

            if data.name is not None:
                prod.name = data.name.strip()
            if data.description is not None:
                prod.description = data.description.strip()
            if data.section is not None:
                prod.section = data.section.strip()
            if data.type is not None:
                prod.type = data.type.strip()
            if data.category_id is not None:
                prod.category_id = data.category_id
            if data.subcategory_id is not None:
                prod.subcategory_id = data.subcategory_id
            if data.brand_id is not None:
                prod.brand_id = data.brand_id
            if data.unit_id is not None:
                prod.unit_id = data.unit_id
            if data.tax_class_id is not None:
                prod.tax_class_id = data.tax_class_id
            if data.min_stock_default is not None:
                prod.min_stock_default = data.min_stock_default
            if data.attributes_schema is not None:
                prod.attributes_schema = data.attributes_schema
            if data.status is not None:
                prod.status = data.status
            if data.is_sell_through is not None:
                prod.is_sell_through = data.is_sell_through

            updated = await self.repo.update_product(
                uow.session, prod, expected_version=data.version
            )

            new_state = {
                "name": updated.name,
                "status": updated.status,
                "category_id": str(updated.category_id),
            }

            await record_audit_event(
                session=uow.session,
                action="PRODUCT_UPDATED",
                resource_type="products",
                resource_id=str(updated.id),
                actor_id=actor_id,
                diff={"before": old_state, "after": new_state},
            )
            await record_outbox_event(
                uow.session,
                ProductUpdatedEvent(
                    product_id=updated.id,
                    internal_code=updated.internal_code,
                    diff={"before": old_state, "after": new_state},
                ),
            )
            await uow.commit()

            return await self.get_product(updated.id, actor=actor)

    async def discontinue_product(
        self, product_id: uuid.UUID, data: ProductDiscontinueRequest, actor: Any = None
    ) -> ProductResponse:
        """Məhsulu satışdan çıxarır (Yeni satınalmaları bloklayır, ancaq stok bitənə qədər satışa icazə verir)."""
        if not can_manage_catalog(actor):
            raise ForbiddenError("Məhsulu dövriyyədən çıxarmaq hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)

        async with UnitOfWork() as uow:
            prod = await self.repo.get_product_by_id(uow.session, product_id)
            if not prod:
                raise NotFoundError("Məhsul tapılmadı.")

            prod.status = "discontinued"
            prod.is_sell_through = data.is_sell_through
            updated = await self.repo.update_product(uow.session, prod)

            await record_audit_event(
                session=uow.session,
                action="PRODUCT_DISCONTINUED",
                resource_type="products",
                resource_id=str(updated.id),
                actor_id=actor_id,
                diff={"is_sell_through": data.is_sell_through, "reason": data.reason},
            )
            await record_outbox_event(
                uow.session,
                ProductDiscontinuedEvent(
                    product_id=updated.id,
                    internal_code=updated.internal_code,
                    is_sell_through=data.is_sell_through,
                ),
            )
            await uow.commit()

            return await self.get_product(updated.id, actor=actor)

    async def reactivate_product(self, product_id: uuid.UUID, actor: Any = None) -> ProductResponse:
        """Dayandırılmış məhsulu yenidən aktivləşdirir."""
        if not can_manage_catalog(actor):
            raise ForbiddenError("Məhsulu yenidən aktivləşdirmək hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)

        async with UnitOfWork() as uow:
            prod = await self.repo.get_product_by_id(uow.session, product_id)
            if not prod:
                raise NotFoundError("Məhsul tapılmadı.")

            prod.status = "active"
            prod.is_sell_through = False
            updated = await self.repo.update_product(uow.session, prod)

            await record_audit_event(
                session=uow.session,
                action="PRODUCT_REACTIVATED",
                resource_type="products",
                resource_id=str(updated.id),
                actor_id=actor_id,
            )
            await record_outbox_event(
                uow.session,
                ProductReactivatedEvent(product_id=updated.id, internal_code=updated.internal_code),
            )
            await uow.commit()

            return await self.get_product(updated.id, actor=actor)

    async def bulk_status_change(self, data: ProductBulkStatusRequest, actor: Any = None) -> int:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Kütləvi status dəyişikliyi hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)
        count = 0

        async with UnitOfWork() as uow:
            for pid in data.product_ids:
                p = await self.repo.get_product_by_id(uow.session, pid)
                if p:
                    p.status = data.new_status
                    await self.repo.update_product(uow.session, p)
                    count += 1

            await record_audit_event(
                session=uow.session,
                action="PRODUCT_BULK_STATUS_CHANGED",
                resource_type="products",
                resource_id=f"count:{count}",
                actor_id=actor_id,
                diff={"new_status": data.new_status, "count": count},
            )
            await uow.commit()
            return count

    async def bulk_category_change(
        self, data: ProductBulkCategoryRequest, actor: Any = None
    ) -> int:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Kütləvi kateqoriya dəyişikliyi hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)
        count = 0

        async with UnitOfWork() as uow:
            target_cat = await self.repo.get_category_by_id(uow.session, data.category_id)
            if not target_cat:
                raise NotFoundError("Hədəf kateqoriya tapılmadı.")

            for pid in data.product_ids:
                p = await self.repo.get_product_by_id(uow.session, pid)
                if p:
                    p.category_id = data.category_id
                    await self.repo.update_product(uow.session, p)
                    count += 1

            await record_audit_event(
                session=uow.session,
                action="PRODUCT_BULK_CATEGORY_CHANGED",
                resource_type="products",
                resource_id=f"count:{count}",
                actor_id=actor_id,
                diff={"target_category_id": str(data.category_id), "count": count},
            )
            await uow.commit()
            return count

    # --- Variantlar və Matris Generatoru ---

    def suggest_sku(
        self, brand_code: str, product_code: str, size: str | None, color: str | None
    ) -> str:
        """Konfiqurasiya edilə bilən şablon üzrə SKU təklifi formalaşdırır ({BRAND3}-{CODE}-{SIZE}-{COLOR})."""
        b_clean = re.sub(r"[^A-Za-z0-9]", "", brand_code)[:3].upper() or "GEN"
        p_clean = re.sub(r"[^A-Za-z0-9]", "", product_code).upper()
        s_clean = re.sub(r"[^A-Za-z0-9]", "", size or "").upper() or "STD"
        c_clean = re.sub(r"[^A-Za-z0-9]", "", color or "")[:3].upper() if color else "DEF"
        return f"{b_clean}-{p_clean}-{s_clean}-{c_clean}"

    async def generate_variant_matrix(
        self, product_id: uuid.UUID, data: VariantMatrixGenerateRequest, actor: Any = None
    ) -> VariantMatrixGenerateResponse:
        """Ölçü × Rəng matrisi əsasında avtomatik variant kombinasiyalarını generasiya edir."""
        if not can_manage_catalog(actor):
            raise ForbiddenError("Variant matrisi yaratmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            prod = await self.repo.get_product_by_id(uow.session, product_id, load_relations=True)
            if not prod:
                raise NotFoundError("Məhsul tapılmadı.")

            brand_code = "GEN"
            if prod.brand_id:
                b = await self.repo.get_brand_by_id(uow.session, prod.brand_id)
                if b:
                    brand_code = b.code[:3].upper()

            existing_hashes = {v.attributes_hash for v in prod.variants}
            existing_skus = {v.sku.lower() for v in prod.variants}

            items: list[VariantMatrixItemPreview] = []
            to_create_count = 0
            conflicts_count = 0

            # Şirkət daxili barkod generasiyası üçün sayğac
            seq_counter = 1000 + len(prod.variants)

            for size in data.sizes:
                for color in data.colors:
                    s_clean = size.strip().upper()
                    c_clean = color.strip()
                    attrs_hash = compute_attributes_hash(s_clean, c_clean, None)
                    sug_sku = self.suggest_sku(brand_code, prod.internal_code, s_clean, c_clean)

                    will_create = True
                    reason = None

                    if attrs_hash in existing_hashes:
                        will_create = False
                        reason = f"Bu məhsul üçün '{s_clean}' ölçü və '{c_clean}' rəngli variant artıq mövcuddur."
                    elif sug_sku.lower() in existing_skus:
                        will_create = False
                        reason = f"'{sug_sku}' SKU-su artıq təyin edilib."
                    else:
                        global_sku = await self.repo.get_variant_by_sku(uow.session, sug_sku)
                        if global_sku:
                            will_create = False
                            reason = f"'{sug_sku}' SKU-su sistemdə başqa məhsul tərəfindən istifadə olunur."

                    barcode = generate_ean13("200", seq_counter) if will_create else None
                    if will_create:
                        seq_counter += 1
                        to_create_count += 1
                    else:
                        conflicts_count += 1

                    items.append(
                        VariantMatrixItemPreview(
                            sku=sug_sku,
                            size=s_clean,
                            color=c_clean,
                            barcode=barcode,
                            price=data.default_price,
                            cost=data.default_cost,
                            will_create=will_create,
                            conflict_reason=reason,
                        )
                    )

            # Əgər dry_run=False olarsa, təsdiqlənmiş variantları bazaya yazırıq
            if not data.dry_run and to_create_count > 0:
                for item in items:
                    if not item.will_create:
                        continue
                    attrs_hash = compute_attributes_hash(item.size, item.color, None)
                    var = ProductVariant(
                        id=generate_uuid7(),
                        product_id=prod.id,
                        company_id=prod.company_id,
                        sku=item.sku,
                        barcode=item.barcode,
                        size=item.size,
                        color=item.color,
                        attributes_hash=attrs_hash,
                        price_override=item.price,
                        cost_price=item.cost,
                        status="active",
                        version=1,
                        created_at=utc_now(),
                    )
                    created_var = await self.repo.create_variant(uow.session, var)

                    if item.price is not None:
                        ph = PriceHistory(
                            id=generate_uuid7(),
                            variant_id=created_var.id,
                            product_id=prod.id,
                            value=item.price,
                            effective_from=utc_now(),
                            reason="Matris generasiyası ilkin qiymət",
                            source="matrix_generation",
                        )
                        await self.repo.add_price_history(uow.session, ph)

                    if item.cost is not None:
                        ch = CostHistory(
                            id=generate_uuid7(),
                            variant_id=created_var.id,
                            product_id=prod.id,
                            value=item.cost,
                            effective_from=utc_now(),
                            reason="Matris generasiyası ilkin maya dəyəri",
                            source="matrix_generation",
                        )
                        await self.repo.add_cost_history(uow.session, ch)

                    await record_outbox_event(
                        uow.session,
                        VariantCreatedEvent(
                            variant_id=created_var.id,
                            product_id=prod.id,
                            sku=created_var.sku,
                            barcode=created_var.barcode,
                        ),
                    )

                actor_id = getattr(actor, "id", None)
                await record_audit_event(
                    session=uow.session,
                    action="VARIANTS_MATRIX_COMMITTED",
                    resource_type="products",
                    resource_id=str(prod.id),
                    actor_id=actor_id,
                    diff={"created_variants_count": to_create_count},
                )
                await uow.commit()

            return VariantMatrixGenerateResponse(
                total_combinations=len(items),
                to_create=to_create_count,
                conflicts=conflicts_count,
                items=items,
            )

    async def create_variant(
        self, product_id: uuid.UUID, data: ProductVariantCreate, actor: Any = None
    ) -> ProductVariantResponse:
        """Məhsula birbaşa fərdi variant əlavə edir."""
        if not can_manage_catalog(actor):
            raise ForbiddenError("Variant yaratmaq hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)
        async with UnitOfWork() as uow:
            prod = await self.repo.get_product_by_id(uow.session, product_id, load_relations=True)
            if not prod:
                raise NotFoundError("Məhsul tapılmadı.")

            brand_code = "GEN"
            if prod.brand_id:
                b = await self.repo.get_brand_by_id(uow.session, prod.brand_id)
                if b:
                    brand_code = b.code[:3].upper()

            sku = data.sku
            if not sku:
                sku = self.suggest_sku(
                    brand_code=brand_code,
                    product_code=prod.internal_code,
                    size=data.size,
                    color=data.color,
                )

            # SKU unikallığı
            exist_sku = await self.repo.get_variant_by_sku(uow.session, sku)
            if exist_sku:
                raise ConflictError(
                    f"'{sku}' SKU artıq başqa variant üçün qeydiyyatdan keçib.",
                    details={"conflicting_variant_id": str(exist_sku.id), "field": "sku"},
                )

            # Barkod yoxlanışı
            barcode = data.barcode.strip() if data.barcode else None
            if barcode:
                if not validate_ean13(barcode) and len(barcode) == 13:
                    raise BusinessRuleViolationError(
                        f"'{barcode}' EAN-13 yoxlama rəqəmi yalnışdır."
                    )
                exist_bc = await self.repo.get_variant_by_barcode(uow.session, barcode)
                if exist_bc:
                    raise ConflictError(
                        f"'{barcode}' barkodu artıq başqa variant üçün qeydiyyatdan keçib.",
                        details={"conflicting_variant_id": str(exist_bc.id), "field": "barcode"},
                    )

            attrs_hash = compute_attributes_hash(data.size, data.color, data.other_attributes)
            var = ProductVariant(
                id=generate_uuid7(),
                product_id=prod.id,
                company_id=prod.company_id,
                sku=sku,
                barcode=barcode,
                size=data.size,
                color=data.color,
                other_attributes=data.other_attributes,
                attributes_hash=attrs_hash,
                price_override=data.price_override,
                cost_price=data.cost_price,
                min_stock=data.min_stock,
                status="active",
                version=1,
                created_at=utc_now(),
            )
            created_var = await self.repo.create_variant(uow.session, var)

            if data.price_override is not None:
                ph = PriceHistory(
                    id=generate_uuid7(),
                    variant_id=created_var.id,
                    product_id=prod.id,
                    value=data.price_override,
                    effective_from=utc_now(),
                    reason="Fərdi variant ilkin qiyməti",
                    source="manual",
                )
                await self.repo.add_price_history(uow.session, ph)

            if data.cost_price is not None:
                ch = CostHistory(
                    id=generate_uuid7(),
                    variant_id=created_var.id,
                    product_id=prod.id,
                    value=data.cost_price,
                    effective_from=utc_now(),
                    reason="Fərdi variant ilkin maya dəyəri",
                    source="manual",
                )
                await self.repo.add_cost_history(uow.session, ch)

            await record_outbox_event(
                uow.session,
                VariantCreatedEvent(
                    variant_id=created_var.id,
                    product_id=prod.id,
                    sku=created_var.sku,
                    barcode=created_var.barcode,
                ),
            )
            await record_audit_event(
                session=uow.session,
                action="VARIANT_CREATED",
                resource_type="product_variants",
                resource_id=str(created_var.id),
                actor_id=actor_id,
                diff={"sku": created_var.sku},
            )
            await uow.commit()

            can_cost = can_view_cost(actor)
            res = ProductVariantResponse.model_validate(created_var)
            if not can_cost:
                res.cost_price = None
                res.margin_percent = None
            return res

    async def update_variant(
        self, variant_id: uuid.UUID, data: ProductVariantUpdate, actor: Any = None
    ) -> ProductVariantResponse:
        """Fərdi variantı redaktə edir."""
        if not can_manage_catalog(actor):
            raise ForbiddenError("Variant redaktə etmək hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)
        async with UnitOfWork() as uow:
            v = await self.repo.get_variant_by_id(uow.session, variant_id)
            if not v:
                raise NotFoundError("Variant tapılmadı.")

            if data.version is not None and v.version != data.version:
                raise ConflictError(
                    "Variant başqa istifadəçi tərəfindən dəyişdirilib (versiya ziddiyyəti)."
                )

            diff: dict[str, Any] = {}
            if data.sku is not None and data.sku != v.sku:
                exist_sku = await self.repo.get_variant_by_sku(uow.session, data.sku)
                if exist_sku and exist_sku.id != v.id:
                    raise ConflictError(
                        f"'{data.sku}' SKU artıq başqa variant üçün qeydiyyatdan keçib."
                    )
                diff["sku"] = [v.sku, data.sku]
                v.sku = data.sku

            if data.barcode is not None and data.barcode != v.barcode:
                barcode = data.barcode.strip()
                if not validate_ean13(barcode) and len(barcode) == 13:
                    raise BusinessRuleViolationError(
                        f"'{barcode}' EAN-13 yoxlama rəqəmi yalnışdır."
                    )
                exist_bc = await self.repo.get_variant_by_barcode(uow.session, barcode)
                if exist_bc and exist_bc.id != v.id:
                    raise ConflictError(
                        f"'{barcode}' barkodu artıq başqa variant üçün qeydiyyatdan keçib."
                    )
                diff["barcode"] = [v.barcode, barcode]
                v.barcode = barcode

            if data.size is not None:
                diff["size"] = [v.size, data.size]
                v.size = data.size
            if data.color is not None:
                diff["color"] = [v.color, data.color]
                v.color = data.color
            if data.other_attributes is not None:
                diff["other_attributes"] = [v.other_attributes, data.other_attributes]
                v.other_attributes = data.other_attributes

            v.attributes_hash = compute_attributes_hash(v.size, v.color, v.other_attributes)

            if data.price_override is not None and data.price_override != v.price_override:
                diff["price_override"] = [str(v.price_override), str(data.price_override)]
                v.price_override = data.price_override
                ph = PriceHistory(
                    id=generate_uuid7(),
                    variant_id=v.id,
                    product_id=v.product_id,
                    value=data.price_override,
                    effective_from=utc_now(),
                    reason="Variant redaktəsi qiymət dəyişikliyi",
                    source="manual",
                )
                await self.repo.add_price_history(uow.session, ph)

            if data.cost_price is not None and data.cost_price != v.cost_price:
                diff["cost_price"] = [str(v.cost_price), str(data.cost_price)]
                v.cost_price = data.cost_price
                ch = CostHistory(
                    id=generate_uuid7(),
                    variant_id=v.id,
                    product_id=v.product_id,
                    value=data.cost_price,
                    effective_from=utc_now(),
                    reason="Variant redaktəsi maya dəyəri dəyişikliyi",
                    source="manual",
                )
                await self.repo.add_cost_history(uow.session, ch)

            if data.min_stock is not None:
                diff["min_stock"] = [v.min_stock, data.min_stock]
                v.min_stock = data.min_stock
            if data.status is not None:
                diff["status"] = [v.status, data.status]
                v.status = data.status

            v.version += 1
            v.updated_at = utc_now()
            updated_v = await self.repo.update_variant(uow.session, v)

            await record_outbox_event(
                uow.session,
                VariantUpdatedEvent(
                    variant_id=updated_v.id,
                    sku=updated_v.sku,
                    diff=diff,
                ),
            )
            await record_audit_event(
                session=uow.session,
                action="VARIANT_UPDATED",
                resource_type="product_variants",
                resource_id=str(updated_v.id),
                actor_id=actor_id,
                diff=diff,
            )
            await uow.commit()

            can_cost = can_view_cost(actor)
            res = ProductVariantResponse.model_validate(updated_v)
            if not can_cost:
                res.cost_price = None
                res.margin_percent = None
            return res

    async def validate_variant_uniqueness(
        self, data: VariantUniquenessCheckRequest
    ) -> VariantUniquenessCheckResponse:
        """SKU və Barkodun təkrarolunmazlığını asinxron forma validasiyası üçün öncədən yoxlayır."""
        async with UnitOfWork() as uow:
            is_sku_avail = True
            conf_sku_id: uuid.UUID | None = None
            sku_var = await self.repo.get_variant_by_sku(uow.session, data.sku)
            if sku_var and (
                data.exclude_variant_id is None or sku_var.id != data.exclude_variant_id
            ):
                is_sku_avail = False
                conf_sku_id = sku_var.id

            is_bc_avail = True
            conf_bc_id: uuid.UUID | None = None
            if data.barcode:
                bc_var = await self.repo.get_variant_by_barcode(uow.session, data.barcode)
                if bc_var and (
                    data.exclude_variant_id is None or bc_var.id != data.exclude_variant_id
                ):
                    is_bc_avail = False
                    conf_bc_id = bc_var.id

            return VariantUniquenessCheckResponse(
                is_sku_available=is_sku_avail,
                is_barcode_available=is_bc_avail,
                conflicting_sku_variant_id=conf_sku_id,
                conflicting_barcode_variant_id=conf_bc_id,
            )

    async def lookup_by_code(
        self, code: str, branch_id: uuid.UUID | None = None, actor: Any = None
    ) -> PosLookupResponse:
        """POS (Kassa) üçün sürətli indekslənmiş axtarış (Barkod və ya SKU)."""
        if not can_view_catalog(actor):
            raise ForbiddenError("Kataloq axtarışı hüququnuz yoxdur.")

        clean_code = code.strip()
        async with UnitOfWork() as uow:
            variant = await self.repo.lookup_by_code(uow.session, clean_code)
            if not variant:
                raise NotFoundError(f"'{clean_code}' kodlu məhsul və ya barkod tapılmadı.")

            prod = variant.product
            # Aktiv satış qiymətini təyin edirik
            eff_price = await self.repo.get_price_for_variant(
                uow.session, variant.id, branch_id=branch_id
            )
            final_price = eff_price or variant.price_override or Decimal("0.00")

            # Vergi sinfi
            tax_code = None
            if prod.tax_class_id:
                tc = await self.repo.get_tax_class_by_id(uow.session, prod.tax_class_id)
                if tc:
                    tax_code = tc.code

            # Anbar qalığı
            inv_port = get_inventory_port()
            st = await inv_port.get_variant_stock(variant.id, branch_id=branch_id)

            return PosLookupResponse(
                variant_id=variant.id,
                product_id=prod.id,
                internal_code=prod.internal_code,
                product_name=prod.name,
                sku=variant.sku,
                barcode=variant.barcode,
                size=variant.size,
                color=variant.color,
                effective_price=final_price,
                currency="AZN",
                tax_class=tax_code,
                stock_available=st.available,
                stock_status=st.status,
            )

    # --- Qiymət və Maya Dəyəri Tarixçəsi (Append-Only) ---

    async def update_variant_price(
        self,
        variant_id: uuid.UUID,
        data: PriceChangeRequest,
        actor: Any = None,
    ) -> PriceHistoryResponse:
        if not can_manage_price(actor):
            raise ForbiddenError("Qiymət dəyişikliyi hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)
        effective_time = data.effective_from or utc_now()

        async with UnitOfWork() as uow:
            variant = await self.repo.get_variant_by_id(uow.session, variant_id)
            if not variant:
                raise NotFoundError("Variant tapılmadı.")

            # Əvvəlki qiyməti bağlayırıq (Close previous period)
            await self.repo.close_active_price_period(
                uow.session,
                variant_id=variant_id,
                effective_from=effective_time,
                branch_id=data.branch_id,
            )

            old_price = float(variant.price_override) if variant.price_override else None
            new_price = data.price

            # Yeni dəyişməz qiymət qeydini əlavə edirik
            ph = PriceHistory(
                id=generate_uuid7(),
                variant_id=variant_id,
                product_id=variant.product_id,
                branch_id=data.branch_id,
                value=new_price,
                currency="AZN",
                effective_from=effective_time,
                effective_to=None,
                changed_by=actor_id,
                reason=data.reason,
                source="manual",
                created_at=utc_now(),
            )
            created_ph = await self.repo.add_price_history(uow.session, ph)

            # Variantın ümumi price_override sahəsini də yeniləyirik
            if data.branch_id is None:
                variant.price_override = new_price
                await self.repo.update_variant(uow.session, variant)

            await record_audit_event(
                session=uow.session,
                action="PRICE_CHANGED",
                resource_type="variants",
                resource_id=str(variant_id),
                actor_id=actor_id,
                diff={
                    "old_price": old_price,
                    "new_price": float(new_price),
                    "reason": data.reason,
                    "branch_id": str(data.branch_id) if data.branch_id else None,
                },
                severity="warning"
                if old_price and abs(float(new_price) - old_price) / old_price > 0.5
                else "info",
            )
            await record_outbox_event(
                uow.session,
                PriceChangedEvent(
                    variant_id=variant_id,
                    product_id=variant.product_id,
                    old_price=old_price,
                    new_price=float(new_price),
                    reason=data.reason,
                ),
            )
            await uow.commit()

            return PriceHistoryResponse.model_validate(created_ph)

    async def update_variant_cost(
        self,
        variant_id: uuid.UUID,
        data: CostChangeRequest,
        actor: Any = None,
    ) -> CostHistoryResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Maya dəyərini yeniləmək hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)
        effective_time = data.effective_from or utc_now()

        async with UnitOfWork() as uow:
            variant = await self.repo.get_variant_by_id(uow.session, variant_id)
            if not variant:
                raise NotFoundError("Variant tapılmadı.")

            await self.repo.close_active_cost_period(
                uow.session, variant_id=variant_id, effective_from=effective_time
            )

            old_cost = float(variant.cost_price) if variant.cost_price else None
            new_cost = data.cost

            ch = CostHistory(
                id=generate_uuid7(),
                variant_id=variant_id,
                product_id=variant.product_id,
                value=new_cost,
                currency="AZN",
                effective_from=effective_time,
                effective_to=None,
                changed_by=actor_id,
                reason=data.reason,
                source="manual",
                created_at=utc_now(),
            )
            created_ch = await self.repo.add_cost_history(uow.session, ch)

            variant.cost_price = new_cost
            await self.repo.update_variant(uow.session, variant)

            await record_audit_event(
                session=uow.session,
                action="COST_CHANGED",
                resource_type="variants",
                resource_id=str(variant_id),
                actor_id=actor_id,
                diff={"old_cost": old_cost, "new_cost": float(new_cost), "reason": data.reason},
            )
            await record_outbox_event(
                uow.session,
                CostChangedEvent(
                    variant_id=variant_id,
                    old_cost=old_cost,
                    new_cost=float(new_cost),
                    reason=data.reason,
                ),
            )
            await uow.commit()

            return CostHistoryResponse.model_validate(created_ch)

    async def list_price_history(
        self, variant_id: uuid.UUID, actor: Any = None
    ) -> list[PriceHistoryResponse]:
        if not can_view_catalog(actor):
            raise ForbiddenError("Qiymət tarixçəsinə baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            items = await self.repo.list_price_history(uow.session, variant_id)
            return [PriceHistoryResponse.model_validate(i) for i in items]

    async def list_cost_history(
        self, variant_id: uuid.UUID, actor: Any = None
    ) -> list[CostHistoryResponse]:
        if not can_view_cost(actor):
            raise ForbiddenError("Həssas maya dəyəri (cost) tarixçəsinə baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            items = await self.repo.list_cost_history(uow.session, variant_id)
            return [CostHistoryResponse.model_validate(i) for i in items]

    async def bulk_update_prices(
        self, data: BulkPriceUpdateRequest, actor: Any = None
    ) -> BulkPriceUpdateResponse:
        """Kütləvi qiymət dəyişikliyi (preview və ya icra)."""
        if not can_manage_price(actor):
            raise ForbiddenError("Kütləvi qiymət yeniləməsi hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)
        effective_time = data.effective_from or utc_now()
        preview_list: list[dict[str, Any]] = []

        async with UnitOfWork() as uow:
            for item in data.updates:
                v = await self.repo.get_variant_by_id(uow.session, item.variant_id)
                if not v:
                    continue
                old_p = float(v.price_override) if v.price_override else None
                new_p = float(item.new_price)
                diff_pct = (
                    round(((new_p - (old_p or new_p)) / (old_p or 1)) * 100, 2) if old_p else 0
                )

                preview_list.append(
                    {
                        "variant_id": str(v.id),
                        "sku": v.sku,
                        "old_price": old_p,
                        "new_price": new_p,
                        "diff_percent": diff_pct,
                    }
                )

                if not data.dry_run:
                    await self.repo.close_active_price_period(
                        uow.session, variant_id=v.id, effective_from=effective_time
                    )
                    ph = PriceHistory(
                        id=generate_uuid7(),
                        variant_id=v.id,
                        product_id=v.product_id,
                        value=item.new_price,
                        effective_from=effective_time,
                        reason=data.reason,
                        source="bulk_update",
                    )
                    await self.repo.add_price_history(uow.session, ph)
                    v.price_override = item.new_price
                    await self.repo.update_variant(uow.session, v)

            if not data.dry_run:
                await record_audit_event(
                    session=uow.session,
                    action="PRICES_BULK_UPDATED",
                    resource_type="prices",
                    resource_id=f"count:{len(preview_list)}",
                    actor_id=actor_id,
                    diff={"count": len(preview_list), "reason": data.reason},
                )
                await uow.commit()

            return BulkPriceUpdateResponse(
                total_items=len(preview_list),
                dry_run=data.dry_run,
                preview=preview_list,
            )

    # --- Şəkillər ---

    async def add_image(
        self,
        product_id: uuid.UUID,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        variant_id: uuid.UUID | None = None,
        is_primary: bool = False,
        actor: Any = None,
    ) -> ProductImageResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Məhsul şəkli yükləmək hüququnuz yoxdur.")

        # MIME və ölçü validasiyası
        if content_type.lower() not in ("image/jpeg", "image/png", "image/webp"):
            raise BusinessRuleViolationError(
                "Yalnız JPEG, PNG və WEBP formatlı şəkillərə icazə verilir."
            )

        if len(file_bytes) > 10 * 1024 * 1024:  # 10MB limit
            raise BusinessRuleViolationError("Şəkil faylının həcmi 10 MB-dan çox ola bilməz.")

        # Pillow ilə metadata təmizlənməsi (EXIF strip) və thumbnail generasiyası
        try:
            img = Image.open(io.BytesIO(file_bytes))
            # EXIF məlumatlarını təmizləmək üçün RGB təkrar yığırıq
            clean_img = Image.new(img.mode, img.size)
            clean_img.putdata(list(img.getdata()))

            # Thumbnail
            thumb = clean_img.copy()
            thumb.thumbnail((250, 250))
        except Exception as e:
            raise BusinessRuleViolationError(f"Şəkil faylı oxunmadı: {e}") from e

        # Local storage simulyasiyası (URL formalaşdırılması)
        file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
        file_key = f"products/{product_id}/{uuid.uuid4().hex}.{file_ext}"
        url = f"/static/uploads/{file_key}"
        thumb_url = f"/static/uploads/thumbs/{file_key}"

        async with UnitOfWork() as uow:
            prod = await self.repo.get_product_by_id(uow.session, product_id)
            if not prod:
                raise NotFoundError("Məhsul tapılmadı.")

            if is_primary:
                await self.repo.clear_primary_images(uow.session, product_id)

            image_row = ProductImage(
                id=generate_uuid7(),
                product_id=product_id,
                variant_id=variant_id,
                url=url,
                thumbnail_url=thumb_url,
                file_key=file_key,
                content_type=content_type,
                file_size=len(file_bytes),
                is_primary=is_primary,
                sort_order=0,
                created_at=utc_now(),
            )
            created = await self.repo.create_image(uow.session, image_row)
            await uow.commit()
            return ProductImageResponse.model_validate(created)

    async def reorder_images(
        self, product_id: uuid.UUID, image_ids: list[uuid.UUID], actor: Any = None
    ) -> list[ProductImageResponse]:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Şəkil ardıcıllığını dəyişmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            images = await self.repo.list_images(uow.session, product_id)
            img_map = {img.id: img for img in images}
            for order, img_id in enumerate(image_ids):
                if img_id in img_map:
                    img_map[img_id].sort_order = order
                    await self.repo.update_image(uow.session, img_map[img_id])
            await uow.commit()
            refreshed = await self.repo.list_images(uow.session, product_id)
            return [ProductImageResponse.model_validate(i) for i in refreshed]

    async def set_primary_image(
        self, product_id: uuid.UUID, image_id: uuid.UUID, actor: Any = None
    ) -> ProductImageResponse:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Əsas şəkli təyin etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            img = await self.repo.get_image_by_id(uow.session, image_id)
            if not img or img.product_id != product_id:
                raise NotFoundError("Şəkil tapılmadı.")

            await self.repo.clear_primary_images(uow.session, product_id)
            img.is_primary = True
            await self.repo.update_image(uow.session, img)
            await uow.commit()
            return ProductImageResponse.model_validate(img)

    async def delete_image(self, image_id: uuid.UUID, actor: Any = None) -> None:
        if not can_manage_catalog(actor):
            raise ForbiddenError("Şəkli silmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            img = await self.repo.get_image_by_id(uow.session, image_id)
            if not img:
                raise NotFoundError("Şəkil tapılmadı.")
            img.is_deleted = True
            await self.repo.update_image(uow.session, img)
            await uow.commit()

    # --- Etiket / Barkod PDF Renderi ---

    async def render_labels_pdf(self, data: LabelRenderRequest, actor: Any = None) -> bytes:
        """Termal və standart etiket printerləri üçün PDF sənədi formalaşdırır."""
        if not can_render_labels(actor):
            raise ForbiddenError("Etiket çapı hüququnuz yoxdur.")

        # Ölçülər: 58x40 mm və ya 40x25 mm
        if data.template_code == "40x25":
            page_w, page_h = 40 * mm, 25 * mm
        else:
            page_w, page_h = 58 * mm, 40 * mm

        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=(page_w, page_h))

        async with UnitOfWork() as uow:
            for item in data.items:
                var = await self.repo.get_variant_by_id(uow.session, item.variant_id)
                if not var:
                    continue
                prod = var.product

                cur_price = await self.repo.get_price_for_variant(uow.session, var.id)
                price_str = f"{cur_price or var.price_override or 0.00:.2f} ₼"
                bc_code = var.barcode or var.sku

                for _ in range(item.quantity):
                    pdf.setFont("Helvetica-Bold", 8)
                    # Mağaza adı və ya məhsul adı
                    pdf.drawCentredString(page_w / 2.0, page_h - 10, "BRAND HOUSE")

                    pdf.setFont("Helvetica", 7)
                    if data.show_name:
                        pdf.drawCentredString(page_w / 2.0, page_h - 18, prod.name[:25])

                    # Barkod rəsmi
                    try:
                        # 13 rəqəmdirsə EAN13, əks halda Code128
                        bc_type = "EAN13" if len(bc_code) == 13 and bc_code.isdigit() else "Code128"
                        drawing = createBarcodeDrawing(
                            bc_type, value=bc_code, width=page_w - 15, height=14 * mm
                        )
                        drawing.drawOn(pdf, 7.5, page_h - 32 * mm)
                    except Exception:
                        pdf.drawCentredString(page_w / 2.0, page_h - 26, f"[{bc_code}]")

                    # Qiymət və Ölçü/Rəng
                    if data.show_price:
                        pdf.setFont("Helvetica-Bold", 10)
                        pdf.drawCentredString(page_w / 2.0, 6 * mm, price_str)

                    pdf.setFont("Helvetica", 6)
                    attrs_txt = f"{var.size or ''} / {var.color or ''}".strip(" /")
                    if attrs_txt:
                        pdf.drawCentredString(page_w / 2.0, 2 * mm, attrs_txt)

                    pdf.showPage()

        pdf.save()
        return buffer.getvalue()

    # --- İdxal və İxrac (Import & Export) ---

    async def upload_import_file(
        self,
        filename: str,
        file_bytes: bytes,
        company_id: uuid.UUID,
        actor: Any = None,
    ) -> ImportUploadResponse:
        """İdxal üçün CSV və ya XLSX faylını qəbul edir və mərhələli tapşırıq (ImportJob) yaradır."""
        if not can_import_catalog(actor):
            raise ForbiddenError("Məhsul idxal etmək hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)
        file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if file_ext not in ("csv", "xlsx"):
            raise BusinessRuleViolationError("Yalnız CSV və XLSX formatlı fayllar qəbul olunur.")

        # Sətirləri oxuyuruq
        rows_data: list[dict[str, Any]] = []

        if file_ext == "csv":
            # BOM və kodlaşdırma aşkarlanması (UTF-8, UTF-8-SIG)
            try:
                decoded = file_bytes.decode("utf-8-sig")
            except UnicodeDecodeError:
                decoded = file_bytes.decode("cp1254", errors="replace")

            reader = csv.DictReader(io.StringIO(decoded))
            for r in reader:
                rows_data.append(dict(r))
        elif file_ext == "xlsx":
            import openpyxl

            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            sheet = wb.active
            if sheet:
                headers = [
                    str(cell.value).strip() if cell.value is not None else "" for cell in sheet[1]
                ]
                for row_idx in range(2, sheet.max_row + 1):
                    row_vals = [cell.value for cell in sheet[row_idx]]
                    if not any(row_vals):
                        continue
                    r_dict = {
                        headers[i]: row_vals[i] for i in range(min(len(headers), len(row_vals)))
                    }
                    rows_data.append(r_dict)

        job_id = generate_uuid7()
        job = ImportJob(
            id=job_id,
            company_id=company_id,
            filename=filename,
            file_type=file_ext,
            status="UPLOADED",
            mode="all_or_nothing",
            total_rows=len(rows_data),
            valid_rows=0,
            error_rows=0,
            committed_rows=0,
            created_by=actor_id,
            created_at=utc_now(),
        )

        async with UnitOfWork() as uow:
            await self.repo.create_import_job(uow.session, job)
            row_models: list[ImportRow] = []
            for idx, r_raw in enumerate(rows_data, start=1):
                row_models.append(
                    ImportRow(
                        id=generate_uuid7(),
                        job_id=job_id,
                        row_number=idx,
                        raw_data=r_raw,
                        status="PENDING",
                    )
                )
            await self.repo.create_import_rows(uow.session, row_models)
            await uow.commit()

        return ImportUploadResponse(
            job_id=job_id,
            filename=filename,
            file_type=file_ext,
            total_rows=len(rows_data),
            status="UPLOADED",
            message=f"{len(rows_data)} sətir uğurla qəbul edildi. Önizləmə üçün preview sorğusu göndərin.",
        )

    async def preview_import(self, job_id: uuid.UUID, actor: Any = None) -> ImportPreviewResponse:
        """İdxal sətirlərini validasiya edir və xəta hesabatını hazırlayır."""
        if not can_import_catalog(actor):
            raise ForbiddenError("İdxal hesabatına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            job = await self.repo.get_import_job(uow.session, job_id)
            if not job:
                raise NotFoundError("İdxal tapşırığı tapılmadı.")

            rows = await self.repo.list_import_rows(uow.session, job_id)
            seen_skus: set[str] = set()
            seen_barcodes: set[str] = set()
            valid_cnt = 0
            err_cnt = 0
            errors_list: list[dict[str, Any]] = []

            for r in rows:
                raw = r.raw_data
                row_errors = []
                name = raw.get("name") or raw.get("Məhsul adı") or raw.get("Ad")
                sku = raw.get("sku") or raw.get("SKU") or raw.get("Kod")
                barcode = raw.get("barcode") or raw.get("Barkod")
                price = raw.get("price") or raw.get("Qiymət")

                if not name:
                    row_errors.append("Məhsul adı (name) boş ola bilməz.")
                if not sku:
                    row_errors.append("SKU kodu boş ola bilməz.")
                else:
                    sku_clean = str(sku).strip().lower()
                    if sku_clean in seen_skus:
                        row_errors.append(f"Fayl daxilində təkrar SKU: '{sku}'.")
                    seen_skus.add(sku_clean)

                    db_sku = await self.repo.get_variant_by_sku(uow.session, str(sku).strip())
                    if db_sku:
                        row_errors.append(f"Bazada artıq bu SKU mövcuddur: '{sku}'.")

                if barcode:
                    bc_clean = str(barcode).strip()
                    if bc_clean in seen_barcodes:
                        row_errors.append(f"Fayl daxilində təkrar barkod: '{barcode}'.")
                    seen_barcodes.add(bc_clean)

                    if len(bc_clean) == 13 and bc_clean.isdigit() and not validate_ean13(bc_clean):
                        row_errors.append(f"Yalnış EAN-13 çeksum: '{barcode}'.")

                    db_bc = await self.repo.get_variant_by_barcode(uow.session, bc_clean)
                    if db_bc:
                        row_errors.append(f"Bazada artıq bu barkod mövcuddur: '{barcode}'.")

                if price:
                    try:
                        p_val = Decimal(str(price).replace(",", "."))
                        if p_val < 0:
                            row_errors.append("Qiymət mənfi ola bilməz.")
                    except Exception:
                        row_errors.append(f"Yalnış qiymət formatı: '{price}'.")

                if row_errors:
                    r.status = "ERROR"
                    r.error_message = "; ".join(row_errors)
                    err_cnt += 1
                    errors_list.append({"row": r.row_number, "errors": row_errors, "sku": sku})
                else:
                    r.status = "VALID"
                    r.error_message = None
                    valid_cnt += 1

            job.status = "VALIDATED"
            job.valid_rows = valid_cnt
            job.error_rows = err_cnt
            job.errors_summary = errors_list[:100]  # İlk 100 xəta
            await self.repo.update_import_job(uow.session, job)
            await uow.commit()

            return ImportPreviewResponse(
                job_id=job.id,
                total_rows=job.total_rows,
                valid_rows=valid_cnt,
                error_rows=err_cnt,
                status=job.status,
                errors=errors_list[:50],
            )

    async def commit_import(
        self, job_id: uuid.UUID, data: ImportCommitRequest, actor: Any = None
    ) -> ImportCommitResponse:
        """Doğrulanmış sətirləri bazaya məhsul və variant kimi yazır."""
        if not can_import_catalog(actor):
            raise ForbiddenError("İdxalı təsdiqləmək hüququnuz yoxdur.")

        actor_id = getattr(actor, "id", None)

        async with UnitOfWork() as uow:
            job = await self.repo.get_import_job(uow.session, job_id)
            if not job:
                raise NotFoundError("İdxal tapşırığı tapılmadı.")

            if data.mode == "all_or_nothing" and job.error_rows > 0:
                raise BusinessRuleViolationError(
                    f"İdxalda {job.error_rows} xətalı sətir aşkar edildi. 'all_or_nothing' rejimində xətalı "
                    "faylın icrasına icazə verilmir. Zəhmət olmasa xətaları düzəldin və ya 'valid_rows_only' rejimini seçin."
                )

            rows = await self.repo.list_import_rows(uow.session, job_id, status="VALID")
            committed = 0

            # Standart bölmə və növ üçün ilkin kateqoriya
            default_cats = await self.repo.list_categories(
                uow.session, company_id=job.company_id, level=3
            )
            fallback_cat_id = default_cats[0].id if default_cats else generate_uuid7()

            for r in rows:
                raw = r.raw_data
                name = str(raw.get("name") or raw.get("Məhsul adı") or raw.get("Ad")).strip()
                sku = str(raw.get("sku") or raw.get("SKU") or raw.get("Kod")).strip()
                barcode = (
                    str(raw.get("barcode") or raw.get("Barkod")).strip()
                    if raw.get("barcode") or raw.get("Barkod")
                    else None
                )
                price_str = raw.get("price") or raw.get("Qiymət")
                price = Decimal(str(price_str).replace(",", ".")) if price_str else None
                cost_str = raw.get("cost") or raw.get("Maya")
                cost = Decimal(str(cost_str).replace(",", ".")) if cost_str else None
                size = (
                    str(raw.get("size") or raw.get("Ölçü")).strip()
                    if raw.get("size") or raw.get("Ölçü")
                    else None
                )
                color = (
                    str(raw.get("color") or raw.get("Rəng")).strip()
                    if raw.get("color") or raw.get("Rəng")
                    else None
                )
                code = f"IMP-{uuid.uuid4().hex[:6].upper()}"

                prod = Product(
                    id=generate_uuid7(),
                    company_id=job.company_id,
                    internal_code=code,
                    name=name,
                    normalized_name=normalize_az_text(name),
                    section="Digər",
                    type="Geyim",
                    category_id=fallback_cat_id,
                    status="active",
                    created_by=actor_id,
                    version=1,
                    created_at=utc_now(),
                )
                await self.repo.create_product(uow.session, prod)

                attrs_hash = compute_attributes_hash(size, color, None)
                var = ProductVariant(
                    id=generate_uuid7(),
                    product_id=prod.id,
                    company_id=job.company_id,
                    sku=sku.upper(),
                    barcode=barcode,
                    size=size,
                    color=color,
                    attributes_hash=attrs_hash,
                    price_override=price,
                    cost_price=cost,
                    status="active",
                    version=1,
                    created_at=utc_now(),
                )
                await self.repo.create_variant(uow.session, var)

                r.status = "COMMITTED"
                committed += 1

            job.status = "COMMITTED"
            job.committed_rows = committed
            job.completed_at = utc_now()
            await self.repo.update_import_job(uow.session, job)

            await record_audit_event(
                session=uow.session,
                action="CATALOG_IMPORTED",
                resource_type="import_jobs",
                resource_id=str(job_id),
                actor_id=actor_id,
                diff={"mode": data.mode, "committed_rows": committed},
            )
            await uow.commit()

            return ImportCommitResponse(
                job_id=job.id,
                committed_rows=committed,
                status="COMMITTED",
                message=f"{committed} məhsul və variant uğurla sistemə daxil edildi.",
            )

    async def export_catalog(
        self, request: CatalogExportRequest, company_id: uuid.UUID, actor: Any = None
    ) -> tuple[str, bytes]:
        """Kataloqu CSV və ya XLSX faylı kimi ixrac edir."""
        if not can_export_catalog(actor):
            raise ForbiddenError("Kataloq məlumatlarını ixrac etmək hüququnuz yoxdur.")

        allow_cost = can_view_cost(actor)
        actor_id = getattr(actor, "id", None)

        async with UnitOfWork() as uow:
            products = await self.repo.list_products(
                uow.session,
                company_id=company_id,
                section=request.section,
                type_=request.type,
                brand_id=request.brand_id,
                status=request.status,
                limit=10000,
            )

            # Sütun başlıqları
            headers = [
                "Kod",
                "Məhsul adı",
                "Bölmə",
                "Növ",
                "SKU",
                "Barkod",
                "Ölçü",
                "Rəng",
                "Satış Qiyməti",
            ]
            if allow_cost:
                headers.append("Maya Dəyəri")

            rows_out = []
            for p in products:
                for v in p.variants:
                    row = [
                        p.internal_code,
                        p.name,
                        p.section,
                        p.type,
                        v.sku,
                        v.barcode or "",
                        v.size or "",
                        v.color or "",
                        str(v.price_override or 0.00),
                    ]
                    if allow_cost:
                        row.append(str(v.cost_price or 0.00))
                    rows_out.append(row)

            await record_audit_event(
                session=uow.session,
                action="CATALOG_EXPORTED",
                resource_type="catalog",
                resource_id=f"count:{len(rows_out)}",
                actor_id=actor_id,
                diff={"format": request.file_format, "total_rows": len(rows_out)},
            )
            await uow.commit()

        if request.file_format == "xlsx":
            import openpyxl

            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Kataloq"
            ws.append(headers)
            for r in rows_out:
                ws.append(r)
            out_buf = io.BytesIO()
            wb.save(out_buf)
            return (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                out_buf.getvalue(),
            )
        else:
            out_csv = io.StringIO()
            writer = csv.writer(out_csv)
            writer.writerow(headers)
            writer.writerows(rows_out)
            # UTF-8 BOM ilə qaytarırıq ki, Excel Azərbaycan hərflərini (ə, ç, ş, ğ, ö, ü, ı) düzgün göstərsin
            csv_bytes = "\ufeff" + out_csv.getvalue()
            return "text/csv; charset=utf-8", csv_bytes.encode("utf-8")

    # --- Köhnə Sayt Sinxronizasiyası (Scaffold) ---

    async def get_legacy_sync_status(self) -> dict[str, Any]:
        """Köhnə sayt ilə inteqrasiya vəziyyətini qaytarır (NOT_CONFIGURED)."""
        return {
            "system_name": "brendhouse_site",
            "status": "NOT_CONFIGURED",
            "message": "Köhnə sayt sinxronizasiyası konfiqurasiya edilməyib.",
            "last_synced_at": None,
        }


_catalog_service: CatalogService | None = None


def get_catalog_service() -> CatalogService:
    global _catalog_service
    if _catalog_service is None:
        _catalog_service = CatalogService()
    return _catalog_service
