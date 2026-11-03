"""İnventar Modulu HTTP Marşrutları (Inventory API Router).

Stok qalıqları, jurnalı (ledger), anbar sənədləri (documents),
fiziki sayım (counts), maya dəyəri hesabatı və balans uyğunluq (reconcile) endpoint-ləri.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, status

from app.core.errors import NotFoundError
from app.modules.company.service import get_company_service
from app.modules.inventory.policies import check_inventory_permission
from app.modules.inventory.schemas import (
    BatchPostRequest,
    BatchPostResponse,
    CountEntryCreate,
    CountEntryResponse,
    CountSessionApproveRequest,
    CountSessionCreate,
    CountSessionResponse,
    RebuildBalancesRequest,
    RebuildBalancesResponse,
    ReconciliationReportResponse,
    StockBalanceResponse,
    StockDocumentCreate,
    StockDocumentResponse,
    StockDocumentReverseRequest,
    StockMovementResponse,
    StockValuationReportResponse,
    VariantStockDetailResponse,
)
from app.modules.inventory.service import InventoryService, get_inventory_service

router = APIRouter(prefix="/inventory", tags=["İnventar və Stok İdarəetməsi"])


def get_current_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


# --- 1. Stok Qalıqları (Balances) ---


@router.get(
    "/balances",
    response_model=list[StockBalanceResponse],
    summary="Stok Qalıqları Siyahısı",
)
async def list_balances(
    warehouse_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None,
    variant_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    stock_status: str | None = None,
    low_stock_only: bool = False,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> list[StockBalanceResponse]:
    check_inventory_permission("inventory.balance.view", actor)
    company = await get_company_service().get_company()
    rows = await service.list_balances(
        company_id=company.id,
        warehouse_id=warehouse_id,
        branch_id=branch_id,
        variant_id=variant_id,
        category_id=category_id,
        stock_status=stock_status,
        low_stock_only=low_stock_only,
        search=search,
        limit=limit,
        offset=offset,
    )
    return [StockBalanceResponse(**r) for r in rows]


@router.get(
    "/balances/{warehouse_id}/{variant_id}",
    response_model=StockBalanceResponse,
    summary="Anbar və Variant üzrə Tək Qalıq",
)
async def get_single_balance(
    warehouse_id: uuid.UUID,
    variant_id: uuid.UUID,
    stock_status: str = "available",
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> StockBalanceResponse:
    check_inventory_permission("inventory.balance.view", actor)
    bal = await service.get_single_balance(warehouse_id, variant_id, stock_status)
    if not bal:
        raise NotFoundError("Göstərilən anbar və variant üzrə qalıq qeydi tapılmadı.")
    return StockBalanceResponse(**bal)


@router.get(
    "/variants/{variant_id}",
    response_model=VariantStockDetailResponse,
    summary="Məhsul Variantının Bütün Anbarlar üzrə Cəmi",
)
async def get_variant_stock_overview(
    variant_id: uuid.UUID,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> VariantStockDetailResponse:
    check_inventory_permission("inventory.balance.view", actor)
    res = await service.get_variant_stock_overview(variant_id)
    return VariantStockDetailResponse(
        variant_id=res["variant_id"],
        total_on_hand=res["total_on_hand"],
        total_reserved=res["total_reserved"],
        total_available=res["total_available"],
        balances=[StockBalanceResponse(**b) for b in res["balances"]],
    )


# --- 2. Stok Hərəkətləri Jurnalı (Ledger) ---


@router.get(
    "/ledger",
    response_model=list[StockMovementResponse],
    summary="Stok Hərəkətləri Jurnalı (Ledger)",
)
async def list_ledger(
    warehouse_id: uuid.UUID | None = None,
    variant_id: uuid.UUID | None = None,
    movement_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> list[StockMovementResponse]:
    check_inventory_permission("inventory.ledger.view", actor)
    company = await get_company_service().get_company()
    items = await service.list_ledger(
        company_id=company.id,
        warehouse_id=warehouse_id,
        variant_id=variant_id,
        movement_type=movement_type,
        date_from=date_from,
        date_to=date_to,
        reference_type=reference_type,
        reference_id=reference_id,
        limit=limit,
        offset=offset,
    )
    return [StockMovementResponse.model_validate(m) for m in items]


@router.post(
    "/post",
    response_model=BatchPostResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Toplu Stok Hərəkəti Qeydiyyatı (Posting Engine)",
)
async def post_movements(
    data: BatchPostRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> BatchPostResponse:
    check_inventory_permission("inventory.adjust", actor)
    company = await get_company_service().get_company()
    movements = await service.post_batch(
        company_id=company.id,
        movements=data.movements,
        user_id=getattr(actor, "id", None),
        idempotency_key=idempotency_key or data.idempotency_key,
        allow_negative_override=data.allow_negative_override,
        override_reason=data.override_reason,
        actor=actor,
    )

    total_qty = sum(m.quantity for m in movements)
    total_cost = sum(m.total_cost for m in movements)

    return BatchPostResponse(
        posted_movements=[StockMovementResponse.model_validate(m) for m in movements],
        total_quantity=total_qty,
        total_cost=total_cost,
    )


# --- 3. Anbar Sənədləri (Documents) ---


@router.post(
    "/documents",
    response_model=StockDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Anbar Sənədi Yaratma (Draft)",
)
async def create_document(
    data: StockDocumentCreate,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> StockDocumentResponse:
    check_inventory_permission("inventory.documents.manage", actor)
    company = await get_company_service().get_company()
    doc = await service.create_document(company.id, data, actor=actor)
    return StockDocumentResponse.model_validate(doc)


@router.get(
    "/documents",
    response_model=list[StockDocumentResponse],
    summary="Anbar Sənədləri Siyahısı",
)
async def list_documents(
    warehouse_id: uuid.UUID | None = None,
    document_type: str | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> list[StockDocumentResponse]:
    check_inventory_permission("inventory.documents.manage", actor)
    company = await get_company_service().get_company()
    items = await service.list_documents(
        company_id=company.id,
        warehouse_id=warehouse_id,
        document_type=document_type,
        status=status,
        limit=limit,
        offset=offset,
    )
    return [StockDocumentResponse.model_validate(d) for d in items]


@router.get(
    "/documents/{document_id}",
    response_model=StockDocumentResponse,
    summary="Tək Anbar Sənədi",
)
async def get_document(
    document_id: uuid.UUID,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> StockDocumentResponse:
    check_inventory_permission("inventory.documents.manage", actor)
    doc = await service.get_document(document_id)
    if not doc:
        raise NotFoundError("Anbar sənədi tapılmadı.")
    return StockDocumentResponse.model_validate(doc)


@router.post(
    "/documents/{document_id}/confirm",
    response_model=StockDocumentResponse,
    summary="Anbar Sənədini Təsdiq Etmə (Commit to Ledger)",
)
async def confirm_document(
    document_id: uuid.UUID,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> StockDocumentResponse:
    check_inventory_permission("inventory.documents.confirm", actor)
    doc = await service.confirm_document(document_id, actor=actor)
    return StockDocumentResponse.model_validate(doc)


@router.post(
    "/documents/{document_id}/reverse",
    response_model=StockDocumentResponse,
    summary="Təsdiqlənmiş Sənədi Ləğv Etmə (Reversal)",
)
async def reverse_document(
    document_id: uuid.UUID,
    data: StockDocumentReverseRequest,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> StockDocumentResponse:
    check_inventory_permission("inventory.documents.reverse", actor)
    doc = await service.reverse_document(
        document_id=document_id,
        reason_code=data.reason_code,
        reason_text=data.reason_text,
        actor=actor,
    )
    return StockDocumentResponse.model_validate(doc)


# --- 4. Fiziki İnventarizasiya və Sayım (Counts) ---


@router.post(
    "/counts",
    response_model=CountSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Fiziki Sayım Sessiyası Yaratma",
)
async def create_count_session(
    data: CountSessionCreate,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> CountSessionResponse:
    check_inventory_permission("inventory.count.manage", actor)
    company = await get_company_service().get_company()
    cs = await service.create_count_session(company.id, data, actor=actor)
    return CountSessionResponse.model_validate(cs)


@router.get(
    "/counts",
    response_model=list[CountSessionResponse],
    summary="Fiziki Sayım Sessiyaları Siyahısı",
)
async def list_count_sessions(
    warehouse_id: uuid.UUID | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> list[CountSessionResponse]:
    check_inventory_permission("inventory.count.manage", actor)
    company = await get_company_service().get_company()
    items = await service.list_count_sessions(
        company_id=company.id,
        warehouse_id=warehouse_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    return [CountSessionResponse.model_validate(cs) for cs in items]


@router.get(
    "/counts/{session_id}",
    response_model=CountSessionResponse,
    summary="Tək Fiziki Sayım Sessiyası Detalları",
)
async def get_count_session(
    session_id: uuid.UUID,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> CountSessionResponse:
    check_inventory_permission("inventory.count.manage", actor)
    cs = await service.get_count_session(session_id)
    if not cs:
        raise NotFoundError("Sayım sessiyası tapılmadı.")
    return CountSessionResponse.model_validate(cs)


@router.post(
    "/counts/{session_id}/start",
    response_model=CountSessionResponse,
    summary="Sayımı Başlatma və Qalıqları Dondurma (Freeze Watermark)",
)
@router.post(
    "/counts/{session_id}/freeze",
    response_model=CountSessionResponse,
    summary="Sayımı Başlatma və Dondurma (Alias)",
    include_in_schema=False,
)
async def start_and_freeze_count(
    session_id: uuid.UUID,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> CountSessionResponse:
    check_inventory_permission("inventory.count.freeze", actor)
    cs = await service.freeze_and_start_count(session_id, actor=actor)
    return CountSessionResponse.model_validate(cs)


@router.post(
    "/counts/{session_id}/entries",
    response_model=CountEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Fiziki Sayım Daxiletməsi (Barkod Scan)",
)
async def record_count_entry(
    session_id: uuid.UUID,
    data: CountEntryCreate,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> CountEntryResponse:
    check_inventory_permission("inventory.count.scan", actor)
    entry = await service.record_count_entry(session_id, data, actor=actor)
    return CountEntryResponse.model_validate(entry)


@router.post(
    "/counts/{session_id}/approve",
    response_model=CountSessionResponse,
    summary="Sayımı Təsdiqləmə və Kənarlaşma Sənədi Tərtib Etmə",
)
async def approve_count_session(
    session_id: uuid.UUID,
    data: CountSessionApproveRequest,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> CountSessionResponse:
    check_inventory_permission("inventory.count.approve", actor)
    cs = await service.approve_count_session(
        session_id=session_id,
        reason_code=data.reason_code,
        notes=data.notes,
        actor=actor,
    )
    return CountSessionResponse.model_validate(cs)


# --- 5. Maya Dəyəri və Qiymətləndirmə (Valuation) ---


@router.get(
    "/valuation",
    response_model=StockValuationReportResponse,
    summary="Anbar Stok Qiymətləndirmə Hesabatı (Weighted-Average Cost)",
)
async def get_valuation_report(
    warehouse_id: uuid.UUID | None = None,
    as_of_date: date | None = None,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> StockValuationReportResponse:
    check_inventory_permission("inventory.valuation.view", actor)
    company = await get_company_service().get_company()
    return await service.get_valuation_report(company.id, warehouse_id, as_of_date)


# --- 6. Uyğunluq və Bərpa (Reconciliation & Rebuild) ---


@router.get(
    "/reconcile",
    response_model=ReconciliationReportResponse,
    summary="Balans və Ledger Uyğunluq Yoxlaması (GET Sorğusu)",
)
@router.post(
    "/reconcile",
    response_model=ReconciliationReportResponse,
    summary="Balans və Ledger Uyğunluq (Drift) Yoxlaması",
)
async def reconcile_balances(
    warehouse_id: uuid.UUID | None = None,
    variant_id: uuid.UUID | None = None,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> ReconciliationReportResponse:
    check_inventory_permission("inventory.reconcile", actor)
    company = await get_company_service().get_company()
    return await service.reconcile_balances(company.id, warehouse_id, variant_id)


@router.post(
    "/rebuild",
    response_model=RebuildBalancesResponse,
    summary="Balansları Ledger-dən Sıfırdan Bərpa Etmə",
)
async def rebuild_balances(
    data: RebuildBalancesRequest,
    service: InventoryService = Depends(get_inventory_service),
    actor: Any = Depends(get_current_actor),
) -> RebuildBalancesResponse:
    check_inventory_permission("inventory.reconcile", actor)
    company = await get_company_service().get_company()
    return await service.rebuild_balances(company.id, data.warehouse_id, data.variant_id)
