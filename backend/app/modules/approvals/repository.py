"""Təsdiqləmə Mühərriki Repozitorisi (Approval Repository)."""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.approvals.models import (
    ApprovalHistory,
    ApprovalRequest,
    ApprovalRule,
)


class ApprovalRepository:
    """Təsdiqləmə qaydaları və sorğuları üzrə verilənlər bazası əməliyyatları."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_rule(self, rule: ApprovalRule) -> ApprovalRule:
        self.session.add(rule)
        await self.session.flush()
        return rule

    async def list_rules(
        self,
        company_id: uuid.UUID,
        document_type: str | None = None,
        is_active: bool | None = None,
    ) -> list[ApprovalRule]:
        stmt = select(ApprovalRule).where(ApprovalRule.company_id == company_id)
        if document_type:
            stmt = stmt.where(ApprovalRule.document_type == document_type)
        if is_active is not None:
            stmt = stmt.where(ApprovalRule.is_active == is_active)
        stmt = stmt.order_by(ApprovalRule.document_type, ApprovalRule.level)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def find_matching_rules(
        self,
        company_id: uuid.UUID,
        document_type: str,
        amount: Decimal,
        branch_id: uuid.UUID | None = None,
    ) -> list[ApprovalRule]:
        """Verilən sənəd növü, məbləğ və filial üçün tətbiq ediləcək bütün pillə qaydalarını tapır."""
        branch_cond = (
            or_(ApprovalRule.branch_id == branch_id, ApprovalRule.branch_id.is_(None))
            if branch_id
            else ApprovalRule.branch_id.is_(None)
        )

        amount_cond = and_(
            ApprovalRule.min_amount <= amount,
            or_(ApprovalRule.max_amount >= amount, ApprovalRule.max_amount.is_(None)),
        )

        stmt = (
            select(ApprovalRule)
            .where(
                ApprovalRule.company_id == company_id,
                ApprovalRule.document_type == document_type,
                ApprovalRule.is_active.is_(True),
                branch_cond,
                amount_cond,
            )
            .order_by(ApprovalRule.level.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_request(self, request: ApprovalRequest) -> ApprovalRequest:
        self.session.add(request)
        await self.session.flush()
        return request

    async def get_request(
        self, request_id: uuid.UUID, with_relations: bool = True
    ) -> ApprovalRequest | None:
        stmt = select(ApprovalRequest).where(ApprovalRequest.id == request_id)
        if with_relations:
            stmt = stmt.options(
                selectinload(ApprovalRequest.steps),
                selectinload(ApprovalRequest.history),
            )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_document(
        self,
        company_id: uuid.UUID,
        document_type: str,
        document_id: uuid.UUID,
        with_relations: bool = True,
    ) -> ApprovalRequest | None:
        stmt = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.company_id == company_id,
                ApprovalRequest.document_type == document_type,
                ApprovalRequest.document_id == document_id,
            )
            .order_by(ApprovalRequest.created_at.desc())
        )
        if with_relations:
            stmt = stmt.options(
                selectinload(ApprovalRequest.steps),
                selectinload(ApprovalRequest.history),
            )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_pending_requests(
        self,
        company_id: uuid.UUID,
        document_type: str | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> list[ApprovalRequest]:
        stmt = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.company_id == company_id,
                ApprovalRequest.status == "PENDING",
            )
            .options(
                selectinload(ApprovalRequest.steps),
                selectinload(ApprovalRequest.history),
            )
        )
        if document_type:
            stmt = stmt.where(ApprovalRequest.document_type == document_type)
        if branch_id:
            stmt = stmt.where(
                or_(ApprovalRequest.branch_id == branch_id, ApprovalRequest.branch_id.is_(None))
            )
        stmt = stmt.order_by(ApprovalRequest.created_at.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def add_history(self, history: ApprovalHistory) -> None:
        self.session.add(history)
        await self.session.flush()
