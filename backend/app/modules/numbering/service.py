"""Sənəd Nömrələnməsi Xidmət Qatı (Numbering Service).

Fasiləsiz (gapless) və yarış vəziyyətlərinə davamlı (concurrency-safe) nömrə təyini,
şablonların formatlaşdırılması və sıfırlanma (reset) qaydalarının icrası.
"""

from __future__ import annotations

import asyncio
import re
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.numbering.events import (
    NumberAllocatedEvent,
    NumberingSequenceCreatedEvent,
    NumberingSequenceUpdatedEvent,
)
from app.modules.numbering.models import AllocatedNumber, NumberingSequence
from app.modules.numbering.policies import can_manage_numbering, can_view_numbering
from app.modules.numbering.repository import NumberingRepository
from app.modules.numbering.schemas import (
    NumberingPreviewRequest,
    NumberingPreviewResponse,
    NumberingSequenceCreate,
    NumberingSequenceResponse,
    NumberingSequenceUpdate,
)
from app.shared.audit import record_audit_event
from app.shared.outbox import record_outbox_event

TOKEN_PATTERN_REGEX = re.compile(r"\{SEQ(?::(\d+))?\}")


_numbering_lock = asyncio.Lock()


class NumberingService:
    """Sənəd nömrələnməsi biznes xidməti."""

    def __init__(self, repository: NumberingRepository | None = None) -> None:
        self.repo = repository or NumberingRepository()
        self._lock = _numbering_lock

    @staticmethod
    def format_pattern(
        pattern: str,
        prefix: str,
        branch_code: str,
        register_code: str,
        seq_num: int,
        dt: datetime | None = None,
    ) -> str:
        """Şablonu dəyərlərlə əvəzləyərək yekun sənəd nömrəsini formalaşdırır."""
        now = dt or utc_now()
        out = pattern

        out = out.replace("{PREFIX}", prefix)
        out = out.replace("{BRANCH}", branch_code)
        out = out.replace("{REGISTER}", register_code)
        out = out.replace("{YYYY}", f"{now.year:04d}")
        out = out.replace("{YY}", f"{now.year % 100:02d}")
        out = out.replace("{MM}", f"{now.month:02d}")
        out = out.replace("{DD}", f"{now.day:02d}")

        # {SEQ:X} və ya {SEQ} əvəzlənməsi
        def _replace_seq(match: re.Match[str]) -> str:
            width_str = match.group(1)
            width = int(width_str) if width_str else 6
            return f"{seq_num:0{width}d}"

        out = TOKEN_PATTERN_REGEX.sub(_replace_seq, out)
        return out

    @staticmethod
    def should_reset(reset_rule: str, last_reset_date: date | None, current_date: date) -> bool:
        """Sıfırlanma qaydasına əsasən sayğacın sıfırlanmalı olub-olmadığını yoxlayır."""
        if reset_rule == "never":
            return False
        if last_reset_date is None:
            return False
        if reset_rule == "yearly":
            return last_reset_date.year != current_date.year
        if reset_rule == "monthly":
            return (last_reset_date.year, last_reset_date.month) != (
                current_date.year,
                current_date.month,
            )
        if reset_rule == "daily":
            return last_reset_date != current_date
        return False

    def preview_pattern(self, req: NumberingPreviewRequest) -> NumberingPreviewResponse:
        """Şablonun necə görünəcəyini önizləyir (verilənlər bazasına yazmadan)."""
        dt = req.sample_date or utc_now()
        preview = self.format_pattern(
            pattern=req.pattern,
            prefix=req.prefix,
            branch_code=req.branch_code,
            register_code=req.register_code,
            seq_num=req.sequence_number,
            dt=dt,
        )
        tokens = [
            t
            for t in [
                "{PREFIX}",
                "{BRANCH}",
                "{REGISTER}",
                "{YYYY}",
                "{YY}",
                "{MM}",
                "{DD}",
                "{SEQ}",
            ]
            if t in req.pattern or (t == "{SEQ}" and "{SEQ:" in req.pattern)
        ]
        return NumberingPreviewResponse(
            pattern=req.pattern,
            preview_number=preview,
            tokens_used=tokens,
        )

    async def list_sequences(
        self,
        company_id: uuid.UUID | None = None,
        document_type: str | None = None,
        scope: str | None = None,
        is_active: bool | None = None,
        actor: Any = None,
    ) -> list[NumberingSequenceResponse]:
        """Bütün ardıcıllıqları qaytarır."""
        if not can_view_numbering(actor):
            raise ForbiddenError("Nömrələnmə ardıcıllıqlarına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            seqs = await self.repo.list_sequences(
                session=uow.session,
                company_id=company_id,
                document_type=document_type,
                scope=scope,
                is_active=is_active,
            )
            return [self._to_response(s) for s in seqs]

    async def get_sequence(
        self, sequence_id: uuid.UUID, actor: Any = None
    ) -> NumberingSequenceResponse:
        """Tək ardıcıllığın təfərrüatlarını gətirir."""
        if not can_view_numbering(actor):
            raise ForbiddenError("Nömrələnmə ardıcıllığına baxış hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            seq = await self.repo.get_by_id(uow.session, sequence_id)
            if not seq:
                raise NotFoundError("Nömrələnmə ardıcıllığı tapılmadı.")
            return self._to_response(seq)

    async def create_sequence(
        self,
        data: NumberingSequenceCreate,
        company_id: uuid.UUID,
        actor: Any = None,
    ) -> NumberingSequenceResponse:
        """Yeni nömrələnmə ardıcıllığı yaradır."""
        if not can_manage_numbering(actor):
            raise ForbiddenError("Nömrələnmə ardıcıllığı yaratmaq hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            existing = await self.repo.find_matching_sequence(
                session=uow.session,
                company_id=company_id,
                document_type=data.document_type,
                branch_id=data.branch_id,
                register_id=data.register_id,
            )
            if existing and existing.scope == data.scope:
                raise ConflictError(
                    f"'{data.document_type}' sənədi üçün bu əhatə dairəsində ardıcıllıq artıq mövcuddur."
                )

            seq = NumberingSequence(
                id=generate_uuid7(),
                company_id=company_id,
                branch_id=data.branch_id,
                register_id=data.register_id,
                document_type=data.document_type.strip().lower(),
                name=data.name.strip(),
                prefix=data.prefix.strip().upper(),
                pattern=data.pattern.strip(),
                reset_rule=data.reset_rule,
                scope=data.scope,
                current_sequence=0,
                last_reset_date=None,
                is_gapless=data.is_gapless,
                is_active=True,
                version=1,
            )
            created = await self.repo.create(uow.session, seq)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="NUMBERING_SEQUENCE_CREATED",
                resource_type="numbering_sequences",
                resource_id=str(created.id),
                actor_id=actor_id,
                diff={"document_type": created.document_type, "pattern": created.pattern},
            )

            event = NumberingSequenceCreatedEvent(
                sequence_id=created.id,
                document_type=created.document_type,
                pattern=created.pattern,
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return self._to_response(created)

    async def update_sequence(
        self,
        sequence_id: uuid.UUID,
        data: NumberingSequenceUpdate,
        actor: Any = None,
    ) -> NumberingSequenceResponse:
        """Ardıcıllığı yeniləyir (şablon dəyişikliyi yalnız gələcək sənədlərə təsir edir)."""
        if not can_manage_numbering(actor):
            raise ForbiddenError("Nömrələnmə ardıcıllığını redaktə etmək hüququnuz yoxdur.")

        async with UnitOfWork() as uow:
            seq = await self.repo.get_by_id(uow.session, sequence_id)
            if not seq:
                raise NotFoundError("Nömrələnmə ardıcıllığı tapılmadı.")

            old_state = {
                "name": seq.name,
                "prefix": seq.prefix,
                "pattern": seq.pattern,
                "reset_rule": seq.reset_rule,
                "is_gapless": seq.is_gapless,
                "is_active": seq.is_active,
            }

            if data.name is not None:
                seq.name = data.name.strip()
            if data.prefix is not None:
                seq.prefix = data.prefix.strip().upper()
            if data.pattern is not None:
                seq.pattern = data.pattern.strip()
            if data.reset_rule is not None:
                seq.reset_rule = data.reset_rule
            if data.is_gapless is not None:
                seq.is_gapless = data.is_gapless
            if data.is_active is not None:
                seq.is_active = data.is_active

            updated = await self.repo.update(uow.session, seq, expected_version=data.version)

            new_state = {
                "name": updated.name,
                "prefix": updated.prefix,
                "pattern": updated.pattern,
                "reset_rule": updated.reset_rule,
                "is_gapless": updated.is_gapless,
                "is_active": updated.is_active,
            }

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="NUMBERING_SEQUENCE_UPDATED",
                resource_type="numbering_sequences",
                resource_id=str(updated.id),
                actor_id=actor_id,
                diff={"before": old_state, "after": new_state},
            )

            event = NumberingSequenceUpdatedEvent(
                sequence_id=updated.id,
                document_type=updated.document_type,
                diff={"before": old_state, "after": new_state},
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return self._to_response(updated)

    async def next(
        self,
        document_type: str,
        company_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
        register_id: uuid.UUID | None = None,
        session: AsyncSession | None = None,
        actor: Any = None,
    ) -> str:
        """Növbəti unikal və fasiləsiz (gapless) sənəd nömrəsini ayırır.

        Tranzaksiya daxilində `SELECT ... FOR UPDATE` ilə yarış vəziyyətlərinə davamlıdır.
        Əgər çağıran modul `session` arqumenti ötürərsə, nömrə həmin tranzaksiyada qeydə alınır;
        tranzaksiya rollback olarsa nömrə artımı da ləğv edilir (boşluq / gap qalmır).
        """
        async with self._lock:
            doc_type = document_type.strip().lower()

            if session is not None:
                return await self._allocate_in_session(
                    session=session,
                    document_type=doc_type,
                    company_id=company_id,
                    branch_id=branch_id,
                    register_id=register_id,
                    actor=actor,
                )

            async with UnitOfWork() as uow:
                num = await self._allocate_in_session(
                    session=uow.session,
                    document_type=doc_type,
                    company_id=company_id,
                    branch_id=branch_id,
                    register_id=register_id,
                    actor=actor,
                )
                await uow.commit()
                return num

    async def _allocate_in_session(
        self,
        session: AsyncSession,
        document_type: str,
        company_id: uuid.UUID | None,
        branch_id: uuid.UUID | None,
        register_id: uuid.UUID | None,
        actor: Any = None,
    ) -> str:
        """Verilən verilənlər bazası sessiyasında kilidləmə ilə nömrə ayırır."""
        # 1. Şirkət ID-si yoxdursa standart şirkəti tapırıq
        if not company_id:
            from app.modules.company.service import get_company_service

            company_svc = get_company_service()
            comp = await company_svc.get_company()
            company_id = comp.id

        # 2. Uyğun nömrələnmə ardıcıllığını tapırıq və FOR UPDATE ilə kilidləyirik
        seq = await self.repo.find_matching_sequence(
            session=session,
            company_id=company_id,
            document_type=document_type,
            branch_id=branch_id,
            register_id=register_id,
            for_update=True,
        )

        # Əgər hələ konfiqurasiya edilməyibsə, avtomatik standart ardıcıllıq yaradırıq
        if not seq:
            seq = await self._create_default_sequence(
                session=session,
                company_id=company_id,
                document_type=document_type,
                branch_id=branch_id,
                register_id=register_id,
            )

        now = utc_now()
        current_date = now.date()

        # 3. Sıfırlanma (Reset rule) yoxlanışı
        if self.should_reset(seq.reset_rule, seq.last_reset_date, current_date):
            seq.current_sequence = 0

        # 4. Sayğacı artırırıq
        seq.current_sequence += 1
        seq.last_reset_date = current_date
        seq.updated_at = now

        # 5. Filial və Kassa kodlarını əldə edirik
        branch_code = "MAIN"
        register_code = "REG01"

        if branch_id:
            from app.modules.branches.repository import BranchRepository

            branch_repo = BranchRepository()
            b = await branch_repo.get_by_id(session, branch_id)
            if b:
                branch_code = b.code

        if register_id:
            from app.modules.cash_registers.repository import CashRegisterRepository

            reg_repo = CashRegisterRepository()
            r = await reg_repo.get_by_id(session, register_id)
            if r:
                register_code = r.code

        # 6. Şablon üzrə nömrəni formalaşdırırıq
        number = self.format_pattern(
            pattern=seq.pattern,
            prefix=seq.prefix,
            branch_code=branch_code,
            register_code=register_code,
            seq_num=seq.current_sequence,
            dt=now,
        )

        # 7. Ayrılmış nömrəni qeydə alırıq (Unikal məhdudiyyət (document_type, number) qoruyur)
        allocated = AllocatedNumber(
            id=generate_uuid7(),
            company_id=company_id,
            document_type=document_type,
            number=number,
            sequence_id=seq.id,
            branch_id=branch_id,
            register_id=register_id,
            allocated_at=now,
            allocated_by=getattr(actor, "id", None),
        )
        await self.repo.record_allocated_number(session, allocated)

        # Hadisəni Outbox-a qeyd edirik
        event = NumberAllocatedEvent(
            document_type=document_type,
            number=number,
            sequence_id=seq.id,
            branch_id=branch_id,
            register_id=register_id,
        )
        await record_outbox_event(session, event)

        return number

    async def _create_default_sequence(
        self,
        session: AsyncSession,
        company_id: uuid.UUID,
        document_type: str,
        branch_id: uuid.UUID | None,
        register_id: uuid.UUID | None,
    ) -> NumberingSequence:
        """Standart qaydalar üzrə yeni ardıcıllıq generasiya edir."""
        prefix_map = {
            "receipt": "RCP",
            "return": "RET",
            "po": "PO",
            "purchase_order": "PO",
            "purchase_request": "PR",
            "goods_receipt": "GR",
            "supplier": "SUP",
            "supplier_invoice": "SINV",
            "supplier_payment": "SPMT",
            "purchase_return": "PRT",
            "supplier_credit_note": "SCN",
            "landed_cost": "LC",
            "transfer": "TRF",
            "adjustment": "ADJ",
            "stock_count": "SC",
            "stock_document": "DOC",
            "stock_movement": "MOV",
            "expense": "EXP",
            "payroll_run": "PAY",
            "invoice": "INV",
            "payment": "PMT",
            "shift": "SH",
            "cash_movement": "CM",
            "sale": "SL",
            "cart": "CRT",
            "journal_entry": "JE",
            "reconciliation": "REC",
            "other_income": "INC",
            "receivable_invoice": "REC-INV",
            "customer_payment": "CPMT",
        }
        prefix = prefix_map.get(document_type, document_type[:3].upper())
        is_gapless = document_type in ("receipt", "invoice", "payment", "sale", "return")
        pattern = (
            "{PREFIX}-{BRANCH}-{REGISTER}-{YYYY}{MM}-{SEQ:6}"
            if register_id or document_type in ("receipt", "return")
            else "{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}"
            if branch_id
            else "{PREFIX}-{YYYY}-{SEQ:6}"
        )
        scope = "register" if register_id else "branch" if branch_id else "company"

        seq = NumberingSequence(
            id=generate_uuid7(),
            company_id=company_id,
            branch_id=branch_id,
            register_id=register_id,
            document_type=document_type,
            name=f"Standart {document_type.upper()} Nömrələnməsi",
            prefix=prefix,
            pattern=pattern,
            reset_rule="never",
            scope=scope,
            current_sequence=0,
            last_reset_date=None,
            is_gapless=is_gapless,
            is_active=True,
            version=1,
        )
        return await self.repo.create(session, seq)

    def _to_response(self, seq: NumberingSequence) -> NumberingSequenceResponse:
        return NumberingSequenceResponse(
            id=seq.id,
            company_id=seq.company_id,
            branch_id=seq.branch_id,
            register_id=seq.register_id,
            document_type=seq.document_type,
            name=seq.name,
            prefix=seq.prefix,
            pattern=seq.pattern,
            reset_rule=seq.reset_rule,
            scope=seq.scope,
            current_sequence=seq.current_sequence,
            last_reset_date=seq.last_reset_date,
            is_gapless=seq.is_gapless,
            is_active=seq.is_active,
            version=seq.version,
            created_at=seq.created_at,
            updated_at=seq.updated_at,
        )


_numbering_service: NumberingService | None = None


def get_numbering_service() -> NumberingService:
    global _numbering_service
    if _numbering_service is None:
        _numbering_service = NumberingService()
    return _numbering_service
