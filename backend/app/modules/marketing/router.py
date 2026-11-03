"""Marketinq (Marketing) Modulu REST API Marşrutları."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Request, status

from app.core.errors import NotFoundError
from app.core.uow import UnitOfWork
from app.modules.marketing.schemas import (
    BulkPromoCodeGenerateRequest,
    CampaignCreate,
    CampaignResponse,
    MessageSendRequestCreate,
    MessageSendRequestResponse,
    MessageTemplateCreate,
    MessageTemplateResponse,
    PromoCodeCreate,
    PromoCodeResponse,
    PromotionRuleCreate,
    PromotionRuleResponse,
    SimulatorRequest,
    SimulatorResponse,
)
from app.modules.marketing.service import MarketingService

router = APIRouter(prefix="/marketing", tags=["Marketinq və Kampaniyalar (Marketing)"])


def get_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


# ==========================================
# 1. CAMPAIGNS
# ==========================================


@router.post(
    "/campaigns",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Marketinq Kampaniyası Yarat",
)
async def create_campaign(
    request: Request, data: CampaignCreate
) -> CampaignResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        camp = await service.create_campaign(data, actor=actor)
        return CampaignResponse.model_validate(camp)


@router.get(
    "/campaigns",
    response_model=list[CampaignResponse],
    summary="Kampaniyaların Siyahısı",
)
async def list_campaigns(
    request: Request,
    status_: str | None = Query(None, alias="status")
) -> list[CampaignResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        camps = await service.repo.list_campaigns(status_)
        return [CampaignResponse.model_validate(c) for c in camps]


@router.get(
    "/campaigns/{campaign_id}",
    response_model=CampaignResponse,
    summary="Kampaniya Təfərrüatları",
)
async def get_campaign(request: Request, campaign_id: uuid.UUID) -> CampaignResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        camp = await service.repo.get_campaign(campaign_id)
        if not camp:
            raise NotFoundError(f"Kampaniya tapılmadı: {campaign_id}")
        return CampaignResponse.model_validate(camp)


@router.post(
    "/campaigns/{campaign_id}/approve",
    response_model=CampaignResponse,
    summary="Kampaniyanı Təsdiq Et və Aktivləşdir (SoD)",
)
async def approve_campaign(
    request: Request, campaign_id: uuid.UUID
) -> CampaignResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        camp = await service.approve_campaign(campaign_id, actor=actor)
        return CampaignResponse.model_validate(camp)


@router.post(
    "/campaigns/{campaign_id}/pause",
    response_model=CampaignResponse,
    summary="Kampaniyanı Dayandır (Pause)",
)
async def pause_campaign(
    request: Request, campaign_id: uuid.UUID
) -> CampaignResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        camp = await service.pause_campaign(campaign_id, actor=actor)
        return CampaignResponse.model_validate(camp)


@router.get(
    "/campaigns/{campaign_id}/metrics",
    summary="Kampaniyanın Nəticələri və ROI Göstəriciləri",
)
async def get_campaign_metrics(request: Request, campaign_id: uuid.UUID) -> dict[str, Any]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        return await service.get_campaign_metrics(campaign_id)


# ==========================================
# 2. PROMOTION RULES & CONFLICTS
# ==========================================


@router.post(
    "/promotions",
    response_model=PromotionRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Aksiya / Endirim Qaydası Təyin Et",
)
async def create_promotion(
    request: Request, data: PromotionRuleCreate
) -> PromotionRuleResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        promo = await service.create_promotion(data, actor=actor)
        return PromotionRuleResponse.model_validate(promo)


@router.get(
    "/promotions/conflicts",
    summary="Aksiya Qaydaları Arasında Kəsişmə və Ziddiyyət Axtarışı",
)
async def detect_conflicts(request: Request) -> list[dict[str, Any]]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        return await service.detect_conflicts()


# ==========================================
# 3. PROMO CODES
# ==========================================


@router.post(
    "/promocodes",
    response_model=PromoCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tək Promokod Yarat",
)
async def create_promo_code(
    request: Request, data: PromoCodeCreate
) -> PromoCodeResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        pc = await service.create_promo_code(data, actor=actor)
        return PromoCodeResponse.model_validate(pc)


@router.post(
    "/promocodes/bulk",
    response_model=list[PromoCodeResponse],
    summary="Kütləvi Promokod Generasiyası (Collision-Safe)",
)
async def bulk_generate_promo_codes(
    request: Request, data: BulkPromoCodeGenerateRequest
) -> list[PromoCodeResponse]:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        codes = await service.bulk_generate_promo_codes(data, actor=actor)
        return [PromoCodeResponse.model_validate(c) for c in codes]


# ==========================================
# 4. SIMULATION
# ==========================================


@router.post(
    "/simulate",
    response_model=SimulatorResponse,
    summary="Aksiya və Endirim Mühərriki Simulyatoru",
)
async def simulate(
    request: Request, data: SimulatorRequest
) -> SimulatorResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        return await service.simulate(data, actor=actor)


# ==========================================
# 5. COMMUNICATIONS
# ==========================================


@router.post(
    "/communications/templates",
    response_model=MessageTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Bildiriş Şablonu Yarat",
)
async def create_message_template(
    request: Request, data: MessageTemplateCreate
) -> MessageTemplateResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        tmpl = await service.create_message_template(data, actor=actor)
        return MessageTemplateResponse.model_validate(tmpl)


@router.post(
    "/communications/send-requests",
    response_model=MessageSendRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Kütləvi Bildiriş Göndərişi Tərtib Et (Dry-Run / Consent Filter)",
)
async def prepare_send_request(
    request: Request, data: MessageSendRequestCreate
) -> MessageSendRequestResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = MarketingService(uow.session)
        req = await service.prepare_send_request(data, actor=actor)
        return MessageSendRequestResponse.model_validate(req)
