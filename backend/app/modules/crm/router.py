"""CRM Modulu REST API Marşrutları."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Request, status

from app.core.errors import NotFoundError
from app.core.uow import UnitOfWork
from app.modules.crm.models import ConsentPurpose
from app.modules.crm.schemas import (
    ConsentRecordCreate,
    ConsentRecordResponse,
    CustomerCreate,
    CustomerDetailResponse,
    CustomerMergePreviewResponse,
    CustomerMergeRequest,
    CustomerResponse,
    CustomerUpdate,
    PrivacyRequestCreate,
    PrivacyRequestResponse,
    QuickCustomerCreate,
    SegmentCreate,
    SegmentPreviewRequest,
    SegmentPreviewResponse,
    SegmentResponse,
)
from app.modules.crm.service import CrmService

router = APIRouter(prefix="/crm", tags=["Müştəri Münasibətləri (CRM)"])


def get_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


# ==========================================
# 1. CUSTOMERS
# ==========================================


@router.post(
    "/customers",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Müştəri Qeydiyyatı",
)
async def create_customer(
    request: Request, data: CustomerCreate
) -> CustomerResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        customer = await service.create_customer(data, actor=actor)
        return service.mask_customer_response(customer)


@router.post(
    "/customers/quick-create",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Kassada Sürətli Müştəri Qeydiyyatı (Ad + Tel)",
)
async def quick_create_customer(
    request: Request, data: QuickCustomerCreate
) -> CustomerResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        customer = await service.quick_create_customer(data, actor=actor)
        return service.mask_customer_response(customer)


@router.get(
    "/customers",
    response_model=list[CustomerResponse],
    summary="Müştərilərin Siyahısı (Maskalanmış)",
)
async def list_customers(
    request: Request,
    search: str | None = None,
    branch_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[CustomerResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        customers = await service.repo.list_customers(
            search=search, branch_id=branch_id, status_=status_, limit=limit, offset=offset
        )
        return [service.mask_customer_response(c) for c in customers]


@router.get(
    "/customers/{customer_id}",
    response_model=CustomerResponse,
    summary="Müştəri Profili (Maskalanmış)",
)
async def get_customer(request: Request, customer_id: uuid.UUID) -> CustomerResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        customer = await service.repo.get_customer(customer_id)
        if not customer or customer.is_tombstone:
            raise NotFoundError(f"Müştəri tapılmadı: {customer_id}")
        return service.mask_customer_response(customer)


@router.get(
    "/customers/{customer_id}/sensitive",
    response_model=CustomerDetailResponse,
    summary="Müştərinin Açıq PII Məlumatları (Auditli / crm.pii.view)",
)
async def get_customer_sensitive(
    request: Request, customer_id: uuid.UUID, reason: str = Query(..., min_length=5)
) -> CustomerDetailResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        return await service.get_customer_detail_unmasked(customer_id, actor, audit_reason=reason)


@router.patch(
    "/customers/{customer_id}",
    response_model=CustomerResponse,
    summary="Müştəri Məlumatlarını Yenilə",
)
async def update_customer(
    request: Request, customer_id: uuid.UUID, data: CustomerUpdate
) -> CustomerResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        customer = await service.update_customer(customer_id, data, actor=actor)
        return service.mask_customer_response(customer)


@router.get(
    "/customers/duplicates/search",
    response_model=list[CustomerResponse],
    summary="Təkrarlanan Müştərilərin Axtarışı",
)
async def search_duplicates(
    request: Request,
    phone: str | None = None,
    email: str | None = None,
    full_name: str | None = None,
) -> list[CustomerResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        dups = await service.repo.find_duplicates(phone=phone, email=email, full_name=full_name)
        return [service.mask_customer_response(c) for c in dups]


@router.post(
    "/customers/merge/preview",
    response_model=CustomerMergePreviewResponse,
    summary="Müştəri Birləşdirməsinin İlkin Baxışı",
)
async def preview_merge(
    request: Request,
    winner_id: uuid.UUID = Query(...), loser_id: uuid.UUID = Query(...)
) -> CustomerMergePreviewResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        return await service.preview_merge(winner_id, loser_id)


@router.post(
    "/customers/merge",
    response_model=CustomerResponse,
    summary="Təkrarlanan Müştəri Profillərini Birləşdir (SoD / Audit)",
)
async def merge_customers(
    request: Request, data: CustomerMergeRequest
) -> CustomerResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        return await service.merge_customers(data, actor=actor)


# ==========================================
# 2. CONSENT & PRIVACY
# ==========================================


@router.post(
    "/consents",
    response_model=ConsentRecordResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Müştəri Razılığını Qeydə Al",
)
async def record_consent(
    request: Request, data: ConsentRecordCreate
) -> ConsentRecordResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        rec = await service.record_consent(
            customer_id=data.customer_id,
            purpose=data.purpose,
            status=data.status,
            source=data.channel_source,
            policy_version=data.policy_version,
            actor=actor,
        )
        return ConsentRecordResponse.model_validate(rec)


@router.post(
    "/consents/opt-out",
    summary="Telefon Nömrəsi və ya STOP Açar Sözü ilə İmtina Et",
)
async def process_opt_out(
    request: Request,
    phone: str = Query(...), purpose: ConsentPurpose = Query(ConsentPurpose.MARKETING_SMS)
) -> dict[str, Any]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        success = await service.opt_out_by_phone(phone, purpose)
        return {"success": success, "phone": phone, "purpose": purpose.value}


@router.post(
    "/privacy/erasure",
    response_model=PrivacyRequestResponse,
    summary="Məlumatın Silinməsi və Anonimləşdirmə Sorğusu (GDPR)",
)
async def request_erasure(
    request: Request, data: PrivacyRequestCreate
) -> PrivacyRequestResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        req = await service.request_data_erasure(
            customer_id=data.customer_id,
            reason=data.reason or "İstifadəçi tələbi",
            actor=actor,
        )
        return PrivacyRequestResponse.model_validate(req)


# ==========================================
# 3. SEGMENTS
# ==========================================


@router.post(
    "/segments",
    response_model=SegmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Müştəri Seqmenti Yarat",
)
async def create_segment(
    request: Request, data: SegmentCreate
) -> SegmentResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        seg = await service.create_segment(data, actor=actor)
        return SegmentResponse.model_validate(seg)


@router.get(
    "/segments",
    response_model=list[SegmentResponse],
    summary="Müştəri Seqmentlərinin Siyahısı",
)
async def list_segments(request: Request) -> list[SegmentResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        segments = await service.repo.list_segments()
        return [SegmentResponse.model_validate(s) for s in segments]


@router.post(
    "/segments/preview",
    response_model=SegmentPreviewResponse,
    summary="Seqment Qaydasının İlkin Baxışı və Sayı",
)
async def preview_segment(
    request: Request, data: SegmentPreviewRequest
) -> SegmentPreviewResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        ids = await service.evaluate_rule_tree(data.rule_tree)
        # Nümunə kimi ilk 5 müştərini oxuyuruq
        sample: list[CustomerResponse] = []
        if ids:
            sample_custs = await service.repo.list_customers(limit=5)
            sample = [service.mask_customer_response(c) for c in sample_custs if c.id in ids][:5]
        return SegmentPreviewResponse(matched_count=len(ids), sample_customers=sample)


@router.post(
    "/segments/{segment_id}/refresh",
    summary="Seqment Üzvlüyünü Yenidən Hesabla (Snapshot)",
)
async def refresh_segment(request: Request, segment_id: uuid.UUID) -> dict[str, Any]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = CrmService(uow.session)
        count = await service.refresh_segment(segment_id)
        return {"segment_id": segment_id, "member_count": count}
