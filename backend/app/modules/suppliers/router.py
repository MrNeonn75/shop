"""Təchizatçılar Modulu HTTP Marşrutları (Suppliers API Router)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, status

from app.modules.company.service import get_company_service
from app.modules.suppliers.policies import check_suppliers_permission
from app.modules.suppliers.schemas import (
    SupplierContactCreate,
    SupplierContactResponse,
    SupplierCreate,
    SupplierDocumentCreate,
    SupplierDocumentResponse,
    SupplierDuplicateCheckRequest,
    SupplierDuplicateCheckResponse,
    SupplierMergePreviewResponse,
    SupplierMergeRequest,
    SupplierMetricsResponse,
    SupplierProductCreate,
    SupplierProductResponse,
    SupplierResponse,
    SupplierStatementResponse,
    SupplierUpdate,
)
from app.modules.suppliers.service import SupplierService, get_supplier_service

router = APIRouter(prefix="/suppliers", tags=["Təchizatçılar (Suppliers)"])


def get_current_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


@router.post(
    "",
    response_model=SupplierResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Təchizatçı Qeydiyyatı",
)
async def create_supplier(
    data: SupplierCreate,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierResponse:
    check_suppliers_permission("suppliers.manage", actor)
    company = await get_company_service().get_company()
    supplier = await service.create_supplier(company.id, data, actor=actor)
    return await service.get_supplier(supplier.id, actor=actor)


@router.get(
    "",
    response_model=list[SupplierResponse],
    summary="Təchizatçıların Siyahısı",
)
async def list_suppliers(
    status: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> list[SupplierResponse]:
    check_suppliers_permission("suppliers.manage", actor)
    company = await get_company_service().get_company()
    items, _ = await service.list_suppliers(
        company_id=company.id,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
        actor=actor,
    )
    return items


@router.post(
    "/check-duplicates",
    response_model=SupplierDuplicateCheckResponse,
    summary="Təchizatçı Dublikat Yoxlanışı (VÖEN və ya Ad üzrə)",
)
async def check_duplicates(
    data: SupplierDuplicateCheckRequest,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierDuplicateCheckResponse:
    check_suppliers_permission("suppliers.manage", actor)
    company = await get_company_service().get_company()
    return await service.check_duplicates(company.id, name=data.name, tax_id=data.tax_id)


@router.post(
    "/merge/preview",
    response_model=SupplierMergePreviewResponse,
    summary="Təchizatçıları Birləşdirmədən Əvvəl İlkin Baxış",
)
async def merge_preview(
    source_supplier_id: uuid.UUID = Query(...),
    target_supplier_id: uuid.UUID = Query(...),
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierMergePreviewResponse:
    check_suppliers_permission("suppliers.manage", actor)
    return await service.merge_preview(source_supplier_id, target_supplier_id)


@router.post(
    "/merge",
    response_model=SupplierResponse,
    summary="İki Təchizatçının Birləşdirilməsi (Merge)",
)
async def merge_suppliers(
    data: SupplierMergeRequest,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierResponse:
    check_suppliers_permission("suppliers.manage", actor)
    target = await service.merge_suppliers(
        data.source_supplier_id, data.target_supplier_id, reason=data.reason, actor=actor
    )
    return await service.get_supplier(target.id, actor=actor)


@router.get(
    "/{supplier_id}",
    response_model=SupplierResponse,
    summary="Tək Təchizatçı Məlumatları",
)
async def get_supplier(
    supplier_id: uuid.UUID,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierResponse:
    check_suppliers_permission("suppliers.manage", actor)
    return await service.get_supplier(supplier_id, actor=actor)


@router.put(
    "/{supplier_id}",
    response_model=SupplierResponse,
    summary="Təchizatçı Məlumatlarının Yenilənməsi",
)
async def update_supplier(
    supplier_id: uuid.UUID,
    data: SupplierUpdate,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierResponse:
    check_suppliers_permission("suppliers.manage", actor)
    await service.update_supplier(supplier_id, data, actor=actor)
    return await service.get_supplier(supplier_id, actor=actor)


@router.get(
    "/{supplier_id}/statement",
    response_model=SupplierStatementResponse,
    summary="Təchizatçı Borc Çıxarışı və Yaş Kateqoriyaları (Aging Buckets)",
)
async def get_supplier_statement(
    supplier_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierStatementResponse:
    check_suppliers_permission("suppliers.manage", actor)
    return await service.get_statement(supplier_id, limit=limit, offset=offset, actor=actor)


@router.get(
    "/{supplier_id}/metrics",
    response_model=SupplierMetricsResponse,
    summary="Təchizatçı Performans və Keyfiyyət Metrikaları",
)
async def get_supplier_metrics(
    supplier_id: uuid.UUID,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierMetricsResponse:
    check_suppliers_permission("suppliers.manage", actor)
    return await service.get_metrics(supplier_id, actor=actor)


@router.post(
    "/{supplier_id}/contacts",
    response_model=SupplierContactResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Təchizatçıya Əlaqəli Şəxs Əlavə Etmə",
)
async def add_supplier_contact(
    supplier_id: uuid.UUID,
    data: SupplierContactCreate,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierContactResponse:
    check_suppliers_permission("suppliers.manage", actor)
    contact = await service.add_contact(supplier_id, data, actor=actor)
    return SupplierContactResponse.model_validate(contact)


@router.post(
    "/{supplier_id}/documents",
    response_model=SupplierDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Təchizatçıya Sənəd Əlavə Etmə",
)
async def add_supplier_document(
    supplier_id: uuid.UUID,
    data: SupplierDocumentCreate,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierDocumentResponse:
    check_suppliers_permission("suppliers.documents.manage", actor)
    doc = await service.add_document(supplier_id, data, actor=actor)
    return SupplierDocumentResponse.model_validate(doc)


@router.post(
    "/{supplier_id}/products",
    response_model=SupplierProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Təchizatçı Məhsul Əlaqəsi Yaradılması / Yenilənməsi",
)
async def upsert_supplier_product(
    supplier_id: uuid.UUID,
    data: SupplierProductCreate,
    service: SupplierService = Depends(get_supplier_service),
    actor: Any = Depends(get_current_actor),
) -> SupplierProductResponse:
    check_suppliers_permission("suppliers.manage", actor)
    item = await service.upsert_supplier_product(supplier_id, data, actor=actor)
    return SupplierProductResponse.model_validate(item)

