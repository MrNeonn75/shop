"""Təsdiqləmə Mühərriki HTTP Marşrutları (Approvals API Router)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request, status

from app.core.errors import ForbiddenError
from app.modules.approvals.schemas import (
    ApprovalDecisionRequest,
    ApprovalRequestResponse,
    ApprovalRuleCreate,
    ApprovalRuleResponse,
)
from app.modules.approvals.service import ApprovalService, get_approval_service
from app.modules.company.service import get_company_service

router = APIRouter(prefix="/approvals", tags=["Təsdiqləmə Mühərriki (Approvals)"])


def get_current_actor(request: Request) -> Any:
    return getattr(request.state, "user", None)


def check_approvals_permission(permission: str, actor: Any | None) -> None:
    if actor is None:
        raise ForbiddenError("Autentifikasiya tələb olunur.")
    is_superuser = getattr(actor, "is_superuser", False) or getattr(actor, "is_admin", False)
    if is_superuser:
        return
    roles = set(getattr(actor, "roles", []) or [])
    if "system_admin" in roles or "general_manager" in roles:
        return
    perms = set(getattr(actor, "permissions", []) or [])
    if permission not in perms:
        raise ForbiddenError(f"Bu əməliyyat üçün '{permission}' icazəsi tələb olunur.")


@router.post(
    "/rules",
    response_model=ApprovalRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni Təsdiqləmə Qaydası Yaratma",
)
async def create_approval_rule(
    data: ApprovalRuleCreate,
    service: ApprovalService = Depends(get_approval_service),
    actor: Any = Depends(get_current_actor),
) -> ApprovalRuleResponse:
    check_approvals_permission("approvals.rule.manage", actor)
    company = await get_company_service().get_company()
    rule = await service.create_rule(company.id, data, actor=actor)
    return ApprovalRuleResponse.model_validate(rule)


@router.get(
    "/rules",
    response_model=list[ApprovalRuleResponse],
    summary="Təsdiqləmə Qaydalarının Siyahısı",
)
async def list_approval_rules(
    document_type: str | None = None,
    is_active: bool | None = None,
    service: ApprovalService = Depends(get_approval_service),
    actor: Any = Depends(get_current_actor),
) -> list[ApprovalRuleResponse]:
    check_approvals_permission("approvals.rule.manage", actor)
    company = await get_company_service().get_company()
    rules = await service.list_rules(company.id, document_type=document_type, is_active=is_active)
    return [ApprovalRuleResponse.model_validate(r) for r in rules]


@router.get(
    "/pending",
    response_model=list[ApprovalRequestResponse],
    summary="Təsdiq Gözləyən Sorğuların Siyahısı",
)
async def list_pending_requests(
    document_type: str | None = None,
    branch_id: uuid.UUID | None = None,
    service: ApprovalService = Depends(get_approval_service),
    actor: Any = Depends(get_current_actor),
) -> list[ApprovalRequestResponse]:
    check_approvals_permission("approvals.decide", actor)
    company = await get_company_service().get_company()
    requests = await service.list_pending_requests(
        company.id, document_type=document_type, branch_id=branch_id, actor=actor
    )
    return [ApprovalRequestResponse.model_validate(r) for r in requests]


@router.get(
    "/{request_id}",
    response_model=ApprovalRequestResponse,
    summary="Təsdiqləmə Sorğusunun Təfərrüatları",
)
async def get_approval_request(
    request_id: uuid.UUID,
    service: ApprovalService = Depends(get_approval_service),
    actor: Any = Depends(get_current_actor),
) -> ApprovalRequestResponse:
    check_approvals_permission("approvals.decide", actor)
    req = await service.get_request(request_id, actor=actor)
    return ApprovalRequestResponse.model_validate(req)


@router.post(
    "/{request_id}/decide",
    response_model=ApprovalRequestResponse,
    summary="Sorğu Üzrə Qərar Vermə (Təsdiq, İmtina və ya Qaytarma)",
)
async def decide_approval_request(
    request_id: uuid.UUID,
    data: ApprovalDecisionRequest,
    service: ApprovalService = Depends(get_approval_service),
    actor: Any = Depends(get_current_actor),
) -> ApprovalRequestResponse:
    check_approvals_permission("approvals.decide", actor)
    res = await service.process_decision(request_id, data, actor=actor)
    return ApprovalRequestResponse.model_validate(res)
