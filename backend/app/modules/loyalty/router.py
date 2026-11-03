"""Loyallıq (Loyalty) Modulu REST API Marşrutları."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Request, status

from app.core.uow import UnitOfWork
from app.modules.loyalty.schemas import (
    LoyaltyCustomerSummaryResponse,
    LoyaltyLedgerEntryResponse,
    LoyaltyManualAdjustmentRequest,
    LoyaltyProgramCreate,
    LoyaltyProgramResponse,
    LoyaltyRedeemPreviewRequest,
    LoyaltyRedeemPreviewResponse,
    LoyaltyRewardCreate,
    LoyaltyRewardRedemptionResponse,
    LoyaltyRewardResponse,
)
from app.modules.loyalty.service import LoyaltyService

router = APIRouter(prefix="/loyalty", tags=["Loyallıq və Xallar (Loyalty)"])


def get_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


@router.post(
    "/programs",
    response_model=LoyaltyProgramResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Loyallıq Proqramı Yarat",
)
async def create_program(
    request: Request, data: LoyaltyProgramCreate
) -> LoyaltyProgramResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        prog = await service.create_program(data, actor=actor)
        return LoyaltyProgramResponse.model_validate(prog)


@router.get(
    "/programs/active",
    response_model=LoyaltyProgramResponse,
    summary="Cari Aktiv Loyallıq Proqramı",
)
async def get_active_program(request: Request) -> LoyaltyProgramResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        prog = await service.get_or_create_default_program()
        return LoyaltyProgramResponse.model_validate(prog)


@router.get(
    "/customers/{customer_id}",
    response_model=LoyaltyCustomerSummaryResponse,
    summary="Müştərinin Loyallıq Balansı və Səviyyəsi",
)
async def get_customer_summary(request: Request, customer_id: uuid.UUID) -> LoyaltyCustomerSummaryResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        summary = await service.repo.get_or_create_summary(customer_id)
        return LoyaltyCustomerSummaryResponse.model_validate(summary)


@router.get(
    "/customers/{customer_id}/ledger",
    response_model=list[LoyaltyLedgerEntryResponse],
    summary="Müştərinin Loyallıq Əməliyyatları Tarixçəsi (Ledger)",
)
async def get_customer_ledger(
    request: Request,
    customer_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[LoyaltyLedgerEntryResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        entries = await service.repo.list_ledger_entries(customer_id, limit=limit, offset=offset)
        return [LoyaltyLedgerEntryResponse.model_validate(e) for e in entries]


@router.post(
    "/redeem/preview",
    response_model=LoyaltyRedeemPreviewResponse,
    summary="Kassada Xal Xərcləməsinin İlkin Baxışı və Hesablanması",
)
async def preview_redeem(
    request: Request, data: LoyaltyRedeemPreviewRequest
) -> LoyaltyRedeemPreviewResponse:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        return await service.preview_redeem(
            customer_id=data.customer_id,
            points_to_redeem=data.points_to_redeem,
            receipt_subtotal=data.receipt_subtotal,
        )


@router.post(
    "/adjustments",
    response_model=LoyaltyLedgerEntryResponse,
    summary="Xalların Manual Tənzimlənməsi (Korreksiya / SoD)",
)
async def adjust_points(
    request: Request, data: LoyaltyManualAdjustmentRequest
) -> LoyaltyLedgerEntryResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        entry = await service.adjust_points(data, actor=actor)
        return LoyaltyLedgerEntryResponse.model_validate(entry)


@router.post(
    "/rewards",
    response_model=LoyaltyRewardResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Mükafat Yarat (Rewards Catalog)",
)
async def create_reward(
    request: Request, data: LoyaltyRewardCreate
) -> LoyaltyRewardResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        rew = await service.create_reward(data, actor=actor)
        return LoyaltyRewardResponse.model_validate(rew)


@router.get(
    "/rewards",
    response_model=list[LoyaltyRewardResponse],
    summary="Aktiv Mükafatlar Kataloqu",
)
async def list_rewards(request: Request, active_only: bool = True) -> list[LoyaltyRewardResponse]:
    _ = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        rewards = await service.repo.list_rewards(active_only=active_only)
        return [LoyaltyRewardResponse.model_validate(r) for r in rewards]


@router.post(
    "/rewards/{reward_id}/redeem",
    response_model=LoyaltyRewardRedemptionResponse,
    summary="Xalları Mükafat Vauçerinə Dəyişdir",
)
async def redeem_reward(
    request: Request, reward_id: uuid.UUID, customer_id: uuid.UUID = Query(...)
) -> LoyaltyRewardRedemptionResponse:
    actor = get_actor(request)
    async with UnitOfWork() as uow:
        service = LoyaltyService(uow.session)
        redemption = await service.redeem_reward(customer_id, reward_id, actor=actor)
        return LoyaltyRewardRedemptionResponse.model_validate(redemption)

