"""Kataloq Modulu HTTP Marşrutları (Catalog API Router).

Frontend F4 spesifikasiyasına tam uyğun olaraq məhsul, variant matrisi, kateqoriya,
brend, qiymət/maya dəyəri, etiket çapı və idxal/ixrac endpoint-lərini təqdim edir.
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import Response as FastApiResponse

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
    ProductBulkCategoryRequest,
    ProductBulkStatusRequest,
    ProductCreate,
    ProductDiscontinueRequest,
    ProductImageReorderRequest,
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
    VariantUniquenessCheckRequest,
    VariantUniquenessCheckResponse,
)
from app.modules.catalog.service import CatalogService, get_catalog_service
from app.modules.company.service import get_company_service

router = APIRouter(prefix="/catalog", tags=["Kataloq və Məhsullar"])


def get_current_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


# --- Kateqoriyalar ---


@router.get("/categories", response_model=list[CategoryResponse], summary="Kateqoriyalar Siyahısı")
async def list_categories(
    parent_id: uuid.UUID | None = None,
    level: int | None = None,
    is_active: bool | None = None,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[CategoryResponse]:
    return await service.list_categories(
        parent_id=parent_id, level=level, is_active=is_active, actor=actor
    )


@router.get(
    "/categories/tree", response_model=list[CategoryResponse], summary="Kateqoriya İyerarxik Ağacı"
)
async def get_category_tree(
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[CategoryResponse]:
    return await service.get_category_tree(actor=actor)


@router.get("/categories/{category_id}", response_model=CategoryResponse, summary="Tək Kateqoriya")
async def get_category(
    category_id: uuid.UUID,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> CategoryResponse:
    return await service.get_category(category_id, actor=actor)


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Kateqoriya Yaratma",
)
async def create_category(
    data: CategoryCreate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> CategoryResponse:
    comp_svc = get_company_service()
    comp_id = await comp_svc.get_company_id()
    return await service.create_category(data, company_id=comp_id, actor=actor)


@router.put(
    "/categories/{category_id}", response_model=CategoryResponse, summary="Kateqoriyanı Yeniləmə"
)
async def update_category(
    category_id: uuid.UUID,
    data: CategoryUpdate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> CategoryResponse:
    return await service.update_category(category_id, data, actor=actor)


@router.post(
    "/categories/{category_id}/merge",
    response_model=CategoryResponse,
    summary="Kateqoriyaları Birləşdirmə",
)
async def merge_categories(
    category_id: uuid.UUID,
    data: CategoryMergeRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> CategoryResponse:
    return await service.merge_categories(category_id, data, actor=actor)


# --- Brendlər ---


@router.get("/brands", response_model=list[BrandResponse], summary="Brendlər Siyahısı")
async def list_brands(
    is_active: bool | None = None,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[BrandResponse]:
    return await service.list_brands(is_active=is_active, actor=actor)


@router.get("/brands/{brand_id}", response_model=BrandResponse, summary="Tək Brend")
async def get_brand(
    brand_id: uuid.UUID,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> BrandResponse:
    return await service.get_brand(brand_id, actor=actor)


@router.post(
    "/brands",
    response_model=BrandResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Brend Yaratma",
)
async def create_brand(
    data: BrandCreate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> BrandResponse:
    comp_svc = get_company_service()
    comp_id = await comp_svc.get_company_id()
    return await service.create_brand(data, company_id=comp_id, actor=actor)


@router.put("/brands/{brand_id}", response_model=BrandResponse, summary="Brendi Yeniləmə")
async def update_brand(
    brand_id: uuid.UUID,
    data: BrandUpdate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> BrandResponse:
    return await service.update_brand(brand_id, data, actor=actor)


# --- Ölçü Vahidləri və Vergi Sinifləri ---


@router.get(
    "/units-of-measure",
    response_model=list[UnitOfMeasureResponse],
    summary="Ölçü Vahidləri Siyahısı",
)
@router.get(
    "/units",
    response_model=list[UnitOfMeasureResponse],
    summary="Ölçü Vahidləri Siyahısı (Qısa Yol)",
)
async def list_units(
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[UnitOfMeasureResponse]:
    return await service.list_units(actor=actor)


@router.post(
    "/units-of-measure",
    response_model=UnitOfMeasureResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Ölçü Vahidi Yaratma",
)
@router.post(
    "/units",
    response_model=UnitOfMeasureResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Ölçü Vahidi Yaratma (Qısa Yol)",
)
async def create_unit(
    data: UnitOfMeasureCreate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> UnitOfMeasureResponse:
    return await service.create_unit(data, actor=actor)


@router.get(
    "/tax-classes", response_model=list[TaxClassResponse], summary="Vergi Sinifləri Siyahısı"
)
async def list_tax_classes(
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[TaxClassResponse]:
    return await service.list_tax_classes(actor=actor)


@router.post(
    "/tax-classes",
    response_model=TaxClassResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Vergi Sinfi Yaratma",
)
async def create_tax_class(
    data: TaxClassCreate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> TaxClassResponse:
    comp_svc = get_company_service()
    comp_id = await comp_svc.get_company_id()
    return await service.create_tax_class(data, company_id=comp_id, actor=actor)


# --- Atributlar ---


@router.get(
    "/attributes",
    response_model=list[ProductAttributeResponse],
    summary="Məhsul Atributları Siyahısı",
)
async def list_attributes(
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[ProductAttributeResponse]:
    return await service.list_attributes(actor=actor)


@router.post(
    "/attributes",
    response_model=ProductAttributeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Atribut Yaratma",
)
async def create_attribute(
    data: ProductAttributeCreate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductAttributeResponse:
    comp_svc = get_company_service()
    comp_id = await comp_svc.get_company_id()
    return await service.create_attribute(data, company_id=comp_id, actor=actor)


# --- Məhsullar (Products) ---


@router.get("/products", response_model=list[ProductListItem], summary="Məhsullar Siyahısı")
async def list_products(
    section: str | None = None,
    type: str | None = None,
    category_id: uuid.UUID | None = None,
    brand_id: uuid.UUID | None = None,
    status: str | None = None,
    q: str | None = None,
    branch_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[ProductListItem]:
    return await service.list_products(
        section=section,
        type_=type,
        category_id=category_id,
        brand_id=brand_id,
        status=status,
        query=q,
        branch_id=branch_id,
        limit=limit,
        offset=offset,
        actor=actor,
    )


@router.post(
    "/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Məhsul Yaratma",
)
async def create_product(
    data: ProductCreate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductResponse:
    comp_svc = get_company_service()
    comp_id = await comp_svc.get_company_id()
    return await service.create_product(data, company_id=comp_id, actor=actor)


@router.get(
    "/products/{product_id}", response_model=ProductResponse, summary="Tək Məhsul Təfərrüatları"
)
async def get_product(
    product_id: uuid.UUID,
    branch_id: uuid.UUID | None = None,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductResponse:
    return await service.get_product(product_id, branch_id=branch_id, actor=actor)


@router.put(
    "/products/{product_id}", response_model=ProductResponse, summary="Məhsulu Redaktə Etmə"
)
async def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductResponse:
    return await service.update_product(product_id, data, actor=actor)


@router.post(
    "/products/{product_id}/discontinue",
    response_model=ProductResponse,
    summary="Məhsulu Satışdan Çıxarma",
)
async def discontinue_product(
    product_id: uuid.UUID,
    data: ProductDiscontinueRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductResponse:
    return await service.discontinue_product(product_id, data, actor=actor)


@router.post(
    "/products/{product_id}/reactivate",
    response_model=ProductResponse,
    summary="Məhsulu Yenidən Aktivləşdirmə",
)
async def reactivate_product(
    product_id: uuid.UUID,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductResponse:
    return await service.reactivate_product(product_id, actor=actor)


@router.post("/products/bulk-status", summary="Kütləvi Status Dəyişikliyi")
async def bulk_status_change(
    data: ProductBulkStatusRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> dict[str, Any]:
    count = await service.bulk_status_change(data, actor=actor)
    return {"updated_count": count, "new_status": data.new_status}


@router.post("/products/bulk-category", summary="Kütləvi Kateqoriya Dəyişikliyi")
async def bulk_category_change(
    data: ProductBulkCategoryRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> dict[str, Any]:
    count = await service.bulk_category_change(data, actor=actor)
    return {"updated_count": count, "category_id": str(data.category_id)}


# --- Matris Variant Generatoru ---


@router.post(
    "/products/{product_id}/variants/generate",
    response_model=VariantMatrixGenerateResponse,
    summary="Ölçü x Rəng Matrisi Əsasında Variantlar Generasiyası",
)
async def generate_variant_matrix(
    product_id: uuid.UUID,
    data: VariantMatrixGenerateRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> VariantMatrixGenerateResponse:
    return await service.generate_variant_matrix(product_id, data, actor=actor)


@router.post(
    "/products/{product_id}/variants",
    response_model=ProductVariantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Məhsula Fərdi Variant Əlavə Etmə",
)
async def create_variant(
    product_id: uuid.UUID,
    data: ProductVariantCreate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductVariantResponse:
    return await service.create_variant(product_id, data, actor=actor)


@router.put(
    "/variants/{variant_id}",
    response_model=ProductVariantResponse,
    summary="Fərdi Variantı Redaktə Etmə",
)
async def update_variant(
    variant_id: uuid.UUID,
    data: ProductVariantUpdate,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductVariantResponse:
    return await service.update_variant(variant_id, data, actor=actor)


# --- Variantlar və Sürətli POS Axtarışı ---


@router.post(
    "/variants/validate-uniqueness",
    response_model=VariantUniquenessCheckResponse,
    summary="SKU/Barkod Unikallığı Yoxlanışı",
)
async def validate_variant_uniqueness(
    data: VariantUniquenessCheckRequest,
    actor: Any = Depends(get_current_actor),
    service: CatalogService = Depends(get_catalog_service),
) -> VariantUniquenessCheckResponse:
    _ = actor
    return await service.validate_variant_uniqueness(data)


@router.get(
    "/lookup", response_model=PosLookupResponse, summary="POS üçün Sürətli Barkod / SKU Axtarışı"
)
async def lookup_by_code(
    code: str = Query(..., min_length=1, description="Barkod və ya SKU"),
    branch_id: uuid.UUID | None = None,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> PosLookupResponse:
    return await service.lookup_by_code(code, branch_id=branch_id, actor=actor)


# --- Qiymət və Maya Dəyəri Tarixçəsi ---


@router.post(
    "/variants/{variant_id}/price",
    response_model=PriceHistoryResponse,
    summary="Satış Qiymətini Dəyişmə",
)
async def update_variant_price(
    variant_id: uuid.UUID,
    data: PriceChangeRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> PriceHistoryResponse:
    return await service.update_variant_price(variant_id, data, actor=actor)


@router.get(
    "/variants/{variant_id}/price-history",
    response_model=list[PriceHistoryResponse],
    summary="Qiymət Tarixçəsi",
)
async def list_price_history(
    variant_id: uuid.UUID,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[PriceHistoryResponse]:
    return await service.list_price_history(variant_id, actor=actor)


@router.post(
    "/variants/{variant_id}/cost",
    response_model=CostHistoryResponse,
    summary="Maya Dəyərini Dəyişmə",
)
async def update_variant_cost(
    variant_id: uuid.UUID,
    data: CostChangeRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> CostHistoryResponse:
    return await service.update_variant_cost(variant_id, data, actor=actor)


@router.get(
    "/variants/{variant_id}/cost-history",
    response_model=list[CostHistoryResponse],
    summary="Maya Dəyəri Tarixçəsi",
)
async def list_cost_history(
    variant_id: uuid.UUID,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[CostHistoryResponse]:
    return await service.list_cost_history(variant_id, actor=actor)


@router.post(
    "/prices/bulk-update",
    response_model=BulkPriceUpdateResponse,
    summary="Kütləvi Qiymət Dəyişikliyi",
)
async def bulk_update_prices(
    data: BulkPriceUpdateRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> BulkPriceUpdateResponse:
    return await service.bulk_update_prices(data, actor=actor)


# --- Şəkillər ---


@router.post(
    "/products/{product_id}/images",
    response_model=ProductImageResponse,
    summary="Məhsula Şəkil Yükləmə",
)
async def upload_image(
    product_id: uuid.UUID,
    file: UploadFile = File(...),
    variant_id: uuid.UUID | None = None,
    is_primary: bool = False,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductImageResponse:
    file_bytes = await file.read()
    return await service.add_image(
        product_id=product_id,
        file_bytes=file_bytes,
        filename=file.filename or "image.jpg",
        content_type=file.content_type or "image/jpeg",
        variant_id=variant_id,
        is_primary=is_primary,
        actor=actor,
    )


@router.put(
    "/products/{product_id}/images/reorder",
    response_model=list[ProductImageResponse],
    summary="Şəkillərin Ardıcıllığı",
)
async def reorder_images(
    product_id: uuid.UUID,
    data: ProductImageReorderRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> list[ProductImageResponse]:
    return await service.reorder_images(product_id, data.image_ids, actor=actor)


@router.put(
    "/products/{product_id}/images/{image_id}/primary",
    response_model=ProductImageResponse,
    summary="Əsas Şəkil Təyini",
)
async def set_primary_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ProductImageResponse:
    return await service.set_primary_image(product_id, image_id, actor=actor)


@router.delete(
    "/products/{product_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Şəkli Silmə",
)
async def delete_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> Response:
    _ = product_id
    await service.delete_image(image_id, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Etiket / Barkod PDF Renderi ---


@router.post("/labels/render", summary="Qiymət Kağızı və Barkod PDF Çapı")
async def render_labels(
    data: LabelRenderRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> FastApiResponse:
    pdf_bytes = await service.render_labels_pdf(data, actor=actor)
    return FastApiResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=labels.pdf"},
    )


# --- İdxal və İxrac ---


@router.post(
    "/import/upload", response_model=ImportUploadResponse, summary="İdxal Faylının Yüklənməsi"
)
async def upload_import_file(
    file: UploadFile = File(...),
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ImportUploadResponse:
    comp_svc = get_company_service()
    comp_id = await comp_svc.get_company_id()
    file_bytes = await file.read()
    return await service.upload_import_file(
        filename=file.filename or "import.csv",
        file_bytes=file_bytes,
        company_id=comp_id,
        actor=actor,
    )


@router.post(
    "/import/{job_id}/preview",
    response_model=ImportPreviewResponse,
    summary="İdxalın Yoxlanışı və Önizlənməsi",
)
async def preview_import(
    job_id: uuid.UUID,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ImportPreviewResponse:
    return await service.preview_import(job_id, actor=actor)


@router.post(
    "/import/{job_id}/commit",
    response_model=ImportCommitResponse,
    summary="İdxalın Təsdiqi və Bazaya Yazılması",
)
async def commit_import(
    job_id: uuid.UUID,
    data: ImportCommitRequest,
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> ImportCommitResponse:
    return await service.commit_import(job_id, data, actor=actor)


@router.get("/export", summary="Kataloqun İxracı (CSV / XLSX)")
async def export_catalog(
    section: str | None = None,
    type: str | None = None,
    brand_id: uuid.UUID | None = None,
    status: str | None = None,
    file_format: Literal["csv", "xlsx"] = "csv",
    service: CatalogService = Depends(get_catalog_service),
    actor: Any = Depends(get_current_actor),
) -> FastApiResponse:
    comp_svc = get_company_service()
    comp_id = await comp_svc.get_company_id()
    req = CatalogExportRequest(
        section=section, type=type, brand_id=brand_id, status=status, file_format=file_format
    )
    mime_type, file_content = await service.export_catalog(req, company_id=comp_id, actor=actor)
    ext = "xlsx" if file_format == "xlsx" else "csv"
    return FastApiResponse(
        content=file_content,
        media_type=mime_type,
        headers={"Content-Disposition": f"attachment; filename=catalog_export.{ext}"},
    )


# --- Köhnə Sayt Sinxronizasiyası (Scaffold) ---


@router.get("/legacy-sync/status", summary="Köhnə Sayt Sinxronizasiya Vəziyyəti")
async def legacy_sync_status(
    actor: Any = Depends(get_current_actor),
    service: CatalogService = Depends(get_catalog_service),
) -> dict[str, Any]:
    _ = actor
    return await service.get_legacy_sync_status()
