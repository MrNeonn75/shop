"""Təsdiqləmə Mühərriki Xidməti (Approval Service).

Bütün biznes modulları (Purchasing, Finance, HR) üçün sənədlərin təsdiqə göndərilməsi,
çoxpilləli təsdiq zəncirinin icrası, SoD və səlahiyyət yoxlamaları.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import BusinessRuleViolationError, NotFoundError
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.approvals.models import (
    ApprovalAction,
    ApprovalHistory,
    ApprovalRequest,
    ApprovalRule,
    ApprovalStatus,
    ApprovalStep,
)
from app.modules.approvals.policies import ApprovalPolicy
from app.modules.approvals.repository import ApprovalRepository
from app.modules.approvals.schemas import ApprovalDecisionRequest, ApprovalRuleCreate


class ApprovalService:
    """Təsdiqləmə mühərrikinin mərkəzi biznes xidməti."""

    async def create_rule(
        self,
        company_id: uuid.UUID,
        data: ApprovalRuleCreate,
        actor: Any = None,
    ) -> ApprovalRule:
        """Yeni təsdiqləmə qaydası yaradır."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = ApprovalRepository(uow.session)
            rule = ApprovalRule(
                id=generate_uuid7(),
                company_id=company_id,
                document_type=data.document_type.lower(),
                branch_id=data.branch_id,
                min_amount=data.min_amount,
                max_amount=data.max_amount,
                level=data.level,
                required_role=data.required_role,
                required_permission=data.required_permission,
                is_active=data.is_active,
                description=data.description,
            )
            created = await repo.create_rule(rule)
            await uow.commit()
            return created

    async def list_rules(
        self,
        company_id: uuid.UUID,
        document_type: str | None = None,
        is_active: bool | None = None,
    ) -> list[ApprovalRule]:
        """Təsdiqləmə qaydalarını qaytarır."""
        async with UnitOfWork() as uow:
            repo = ApprovalRepository(uow.session)
            return await repo.list_rules(
                company_id=company_id,
                document_type=document_type.lower() if document_type else None,
                is_active=is_active,
            )

    async def submit_for_approval(
        self,
        company_id: uuid.UUID,
        document_type: str,
        document_id: uuid.UUID,
        amount: Decimal,
        requester_id: uuid.UUID,
        branch_id: uuid.UUID | None = None,
        notes: str | None = None,
        session: AsyncSession | None = None,
        actor: Any = None,
    ) -> ApprovalRequest:
        """Sənədi təsdiq zəncirinə göndərir.

        Əgər qayda müəyyən edilməyibsə, sənəd avtomatik təsdiqlənmiş hesab edilir.
        """
        _ = actor
        doc_type = document_type.lower()

        async def _execute(sess: AsyncSession) -> ApprovalRequest:
            repo = ApprovalRepository(sess)
            rules = await repo.find_matching_rules(
                company_id=company_id,
                document_type=doc_type,
                amount=amount,
                branch_id=branch_id,
            )

            # Əgər bu sənəd üçün heç bir təsdiq qaydası tapılmadısa, dərhal təsdiqləyirik
            if not rules:
                req = ApprovalRequest(
                    id=generate_uuid7(),
                    company_id=company_id,
                    document_type=doc_type,
                    document_id=document_id,
                    requester_id=requester_id,
                    branch_id=branch_id,
                    amount=amount,
                    current_level=0,
                    total_levels=0,
                    status=ApprovalStatus.APPROVED.value,
                    notes=notes or "Qayda tapılmadı: avtomatik təsdiqləndi.",
                )
                req.history.append(
                    ApprovalHistory(
                        id=generate_uuid7(),
                        request_id=req.id,
                        action=ApprovalAction.APPROVED.value,
                        actor_id=requester_id,
                        level=0,
                        reason="Avtomatik təsdiq (qayda mövcud deyil)",
                    )
                )
                return await repo.create_request(req)

            # Çoxpilləli sorğunu formalaşdırırıq
            req = ApprovalRequest(
                id=generate_uuid7(),
                company_id=company_id,
                document_type=doc_type,
                document_id=document_id,
                requester_id=requester_id,
                branch_id=branch_id,
                amount=amount,
                current_level=rules[0].level,
                total_levels=len(rules),
                status=ApprovalStatus.PENDING.value,
                notes=notes,
            )

            for rule in rules:
                step = ApprovalStep(
                    id=generate_uuid7(),
                    request_id=req.id,
                    level=rule.level,
                    required_role=rule.required_role,
                    required_permission=rule.required_permission,
                    status=ApprovalStatus.PENDING.value,
                )
                req.steps.append(step)

            req.history.append(
                ApprovalHistory(
                    id=generate_uuid7(),
                    request_id=req.id,
                    action=ApprovalAction.SUBMITTED.value,
                    actor_id=requester_id,
                    level=req.current_level,
                    reason=notes or "Təsdiqə göndərildi",
                )
            )
            return await repo.create_request(req)

        if session is not None:
            return await _execute(session)

        async with UnitOfWork() as uow:
            res = await _execute(uow.session)
            await uow.commit()
            return res

    async def process_decision(
        self,
        request_id: uuid.UUID,
        data: ApprovalDecisionRequest,
        actor: Any,
        session: AsyncSession | None = None,
    ) -> ApprovalRequest:
        """Təsdiq, imtina və ya geri qaytarma qərarını emal edir."""

        async def _execute(sess: AsyncSession) -> ApprovalRequest:
            repo = ApprovalRepository(sess)
            req = await repo.get_request(request_id, with_relations=True)
            if not req:
                raise NotFoundError("Təsdiqləmə sorğusu tapılmadı.")

            if req.status != ApprovalStatus.PENDING.value:
                raise BusinessRuleViolationError(
                    f"Bu sorğu artıq yekunlaşdırılıb (Cari status: {req.status})."
                )

            # Cari aktiv pilləni tapırıq
            current_step = next((s for s in req.steps if s.level == req.current_level), None)
            if not current_step:
                raise BusinessRuleViolationError("Cari təsdiq pilləsi tapılmadı.")

            # 1. SoD yoxlanışı (Sorğunu yaradan özü təsdiq edə bilməz)
            ApprovalPolicy.validate_sod(req.requester_id, actor)

            # 2. Səlahiyyət yoxlanışı
            ApprovalPolicy.validate_approver_authority(
                current_step.required_role,
                current_step.required_permission,
                actor,
            )

            # 3. İmtina / Qaytarma səbəbi yoxlanışı
            ApprovalPolicy.validate_decision_reason(data.decision, data.reason)

            actor_id = getattr(actor, "id", None)
            now = utc_now()

            current_step.decided_by_id = actor_id
            current_step.delegated_from_user_id = data.delegated_from_user_id
            current_step.decision_reason = data.reason
            current_step.decided_at = now

            if data.decision == "REJECT":
                current_step.status = ApprovalStatus.REJECTED.value
                req.status = ApprovalStatus.REJECTED.value
                action = ApprovalAction.REJECTED.value

            elif data.decision == "RETURN":
                current_step.status = ApprovalStatus.RETURNED.value
                req.status = ApprovalStatus.RETURNED.value
                action = ApprovalAction.RETURNED.value

            elif data.decision == "APPROVE":
                current_step.status = ApprovalStatus.APPROVED.value
                action = ApprovalAction.APPROVED.value

                # Növbəti pillə varmı?
                remaining_steps = [s for s in req.steps if s.level > req.current_level]
                if remaining_steps:
                    req.current_level = min(s.level for s in remaining_steps)
                else:
                    # Bütün pillələr tamamlandı
                    req.status = ApprovalStatus.APPROVED.value
            else:
                raise BusinessRuleViolationError(f"Naməlum qərar növü: {data.decision}")

            req.history.append(
                ApprovalHistory(
                    id=generate_uuid7(),
                    request_id=req.id,
                    action=action,
                    actor_id=actor_id,
                    level=current_step.level,
                    reason=data.reason,
                )
            )

            loaded = await repo.get_request(req.id, with_relations=True)
            return loaded or req

        if session is not None:
            return await _execute(session)

        async with UnitOfWork() as uow:
            res = await _execute(uow.session)
            await uow.commit()
            return res

    async def get_request(self, request_id: uuid.UUID, actor: Any = None) -> ApprovalRequest:
        """Tək bir sorğunun statusunu və tarixçəsini qaytarır."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = ApprovalRepository(uow.session)
            req = await repo.get_request(request_id, with_relations=True)
            if not req:
                raise NotFoundError("Təsdiqləmə sorğusu tapılmadı.")
            return req

    async def get_by_document(
        self, company_id: uuid.UUID, document_type: str, document_id: uuid.UUID
    ) -> ApprovalRequest | None:
        """Sənədə aid son təsdiqləmə sorğusunu qaytarır."""
        async with UnitOfWork() as uow:
            repo = ApprovalRepository(uow.session)
            return await repo.get_by_document(
                company_id=company_id,
                document_type=document_type.lower(),
                document_id=document_id,
                with_relations=True,
            )

    async def list_pending_requests(
        self,
        company_id: uuid.UUID,
        document_type: str | None = None,
        branch_id: uuid.UUID | None = None,
        actor: Any = None,
    ) -> list[ApprovalRequest]:
        """Gözləmədə olan təsdiqləmə sorğularını qaytarır."""
        _ = actor
        async with UnitOfWork() as uow:
            repo = ApprovalRepository(uow.session)
            return await repo.list_pending_requests(
                company_id=company_id,
                document_type=document_type.lower() if document_type else None,
                branch_id=branch_id,
            )


_approval_service: ApprovalService | None = None


def get_approval_service() -> ApprovalService:
    global _approval_service
    if _approval_service is None:
        _approval_service = ApprovalService()
    return _approval_service
