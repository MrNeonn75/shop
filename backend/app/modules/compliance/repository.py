"""Compliance repository — CRUD helpers for rules, packs, obligations, registers."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.compliance.models import (
    CalendarYear,
    CompanyTaxProfile,
    ComplianceEvent,
    ConsentFormVersion,
    DataProcessingRegister,
    EQaimaReconciliation,
    LegalHold,
    LegalRule,
    Obligation,
    ObligationTemplate,
    PersonalDataSystemRegistration,
    RetentionRule,
    RulePack,
    RulePackVersion,
    RuleVerification,
    TransferRegister,
    TurnoverMonitorSnapshot,
)


class ComplianceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------
    # Legal rules
    # ------------------------------------------

    async def get_rule_by_id(self, rule_id: uuid.UUID) -> LegalRule | None:
        stmt = select(LegalRule).where(LegalRule.id == rule_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_rules(
        self,
        *,
        domain: str | None = None,
        rule_key: str | None = None,
        status: str | None = None,
        pack_version_id: uuid.UUID | None = None,
        at: datetime | None = None,
        limit: int = 500,
    ) -> Sequence[LegalRule]:
        stmt = select(LegalRule)
        if domain:
            stmt = stmt.where(LegalRule.domain == domain)
        if rule_key:
            stmt = stmt.where(LegalRule.rule_key == rule_key)
        if status:
            stmt = stmt.where(LegalRule.status == status)
        if pack_version_id:
            stmt = stmt.where(LegalRule.pack_version_id == pack_version_id)
        if at is not None:
            stmt = stmt.where(
                LegalRule.effective_from <= at,
                or_(LegalRule.effective_to.is_(None), LegalRule.effective_to > at),
            )
        stmt = stmt.order_by(
            LegalRule.domain, LegalRule.rule_key, LegalRule.effective_from.desc()
        ).limit(limit)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def find_effective_rule(
        self,
        domain: str,
        rule_key: str,
        at: datetime,
        *,
        jurisdiction: str = "AZ",
    ) -> LegalRule | None:
        """Latest effective rule at `at` (prefer ACTIVE pack version rules when tied)."""
        stmt = (
            select(LegalRule)
            .where(
                LegalRule.domain == domain,
                LegalRule.rule_key == rule_key,
                LegalRule.jurisdiction == jurisdiction,
                LegalRule.effective_from <= at,
                or_(LegalRule.effective_to.is_(None), LegalRule.effective_to > at),
            )
            .order_by(LegalRule.effective_from.desc(), LegalRule.version.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_rule_history(
        self, rule_key: str, *, domain: str | None = None
    ) -> Sequence[LegalRule]:
        stmt = select(LegalRule).where(LegalRule.rule_key == rule_key)
        if domain:
            stmt = stmt.where(LegalRule.domain == domain)
        stmt = stmt.order_by(LegalRule.version.asc(), LegalRule.effective_from.asc())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_rule(self, rule: LegalRule) -> LegalRule:
        self.session.add(rule)
        await self.session.flush()
        return rule

    async def list_rules_by_ids(self, rule_ids: Sequence[uuid.UUID]) -> Sequence[LegalRule]:
        if not rule_ids:
            return []
        stmt = select(LegalRule).where(LegalRule.id.in_(list(rule_ids)))
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # ------------------------------------------
    # Packs & versions
    # ------------------------------------------

    async def get_pack(self, pack_id: uuid.UUID) -> RulePack | None:
        stmt = (
            select(RulePack)
            .options(selectinload(RulePack.versions))
            .where(RulePack.id == pack_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_pack_by_code(self, code: str) -> RulePack | None:
        stmt = select(RulePack).where(RulePack.code == code)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_pack_by_domain(self, domain: str) -> RulePack | None:
        stmt = (
            select(RulePack)
            .where(RulePack.domain == domain)
            .order_by(RulePack.created_at.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_packs(self) -> Sequence[RulePack]:
        stmt = select(RulePack).order_by(RulePack.domain)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_pack(self, pack: RulePack) -> RulePack:
        self.session.add(pack)
        await self.session.flush()
        return pack

    async def get_pack_version(self, version_id: uuid.UUID) -> RulePackVersion | None:
        stmt = (
            select(RulePackVersion)
            .options(
                selectinload(RulePackVersion.rules),
                selectinload(RulePackVersion.verifications),
                selectinload(RulePackVersion.pack),
            )
            .where(RulePackVersion.id == version_id)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_latest_pack_version_number(self, pack_id: uuid.UUID) -> int:
        stmt = (
            select(RulePackVersion.version)
            .where(RulePackVersion.pack_id == pack_id)
            .order_by(RulePackVersion.version.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        val = res.scalar_one_or_none()
        return int(val or 0)

    async def save_pack_version(self, version: RulePackVersion) -> RulePackVersion:
        self.session.add(version)
        await self.session.flush()
        return version

    async def save_verification(self, verification: RuleVerification) -> RuleVerification:
        self.session.add(verification)
        await self.session.flush()
        return verification

    async def get_active_pack_version_for_domain(
        self, domain: str
    ) -> RulePackVersion | None:
        pack = await self.get_pack_by_domain(domain)
        if pack is None or pack.active_version_id is None:
            return None
        return await self.get_pack_version(pack.active_version_id)

    # ------------------------------------------
    # Obligations
    # ------------------------------------------

    async def get_obligation(self, obligation_id: uuid.UUID) -> Obligation | None:
        stmt = select(Obligation).where(Obligation.id == obligation_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_obligations(
        self,
        *,
        status: str | None = None,
        company_id: uuid.UUID | None = None,
        owner_user_id: uuid.UUID | None = None,
    ) -> Sequence[Obligation]:
        stmt = select(Obligation)
        if status:
            stmt = stmt.where(Obligation.status == status)
        if company_id:
            stmt = stmt.where(Obligation.company_id == company_id)
        if owner_user_id:
            stmt = stmt.where(Obligation.owner_user_id == owner_user_id)
        stmt = stmt.order_by(Obligation.next_due.asc().nulls_last())
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_obligation(self, obligation: Obligation) -> Obligation:
        self.session.add(obligation)
        await self.session.flush()
        return obligation

    async def list_obligation_templates(self) -> Sequence[ObligationTemplate]:
        stmt = select(ObligationTemplate).order_by(ObligationTemplate.code)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def get_obligation_template(self, code: str) -> ObligationTemplate | None:
        stmt = select(ObligationTemplate).where(ObligationTemplate.code == code)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def save_obligation_template(
        self, template: ObligationTemplate
    ) -> ObligationTemplate:
        self.session.add(template)
        await self.session.flush()
        return template

    # ------------------------------------------
    # Events (append-only)
    # ------------------------------------------

    async def append_event(self, event: ComplianceEvent) -> ComplianceEvent:
        self.session.add(event)
        await self.session.flush()
        return event

    async def list_events(
        self,
        *,
        domain: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        limit: int = 200,
    ) -> Sequence[ComplianceEvent]:
        stmt = select(ComplianceEvent)
        if domain:
            stmt = stmt.where(ComplianceEvent.domain == domain)
        if entity_type:
            stmt = stmt.where(ComplianceEvent.entity_type == entity_type)
        if entity_id:
            stmt = stmt.where(ComplianceEvent.entity_id == entity_id)
        stmt = stmt.order_by(ComplianceEvent.created_at.desc()).limit(limit)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # ------------------------------------------
    # Registers
    # ------------------------------------------

    async def list_processing_register(self) -> Sequence[DataProcessingRegister]:
        stmt = select(DataProcessingRegister).order_by(DataProcessingRegister.system_module)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_processing_entry(
        self, entry: DataProcessingRegister
    ) -> DataProcessingRegister:
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def list_transfer_register(self) -> Sequence[TransferRegister]:
        stmt = select(TransferRegister).order_by(TransferRegister.processor_name)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_transfer_entry(self, entry: TransferRegister) -> TransferRegister:
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def get_pd_registration(
        self, company_id: uuid.UUID | None = None
    ) -> PersonalDataSystemRegistration | None:
        stmt = select(PersonalDataSystemRegistration)
        if company_id:
            stmt = stmt.where(PersonalDataSystemRegistration.company_id == company_id)
        stmt = stmt.order_by(PersonalDataSystemRegistration.created_at.desc()).limit(1)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def save_pd_registration(
        self, row: PersonalDataSystemRegistration
    ) -> PersonalDataSystemRegistration:
        self.session.add(row)
        await self.session.flush()
        return row

    # ------------------------------------------
    # Calendar / retention / holds / tax
    # ------------------------------------------

    async def get_calendar_year(self, year: int) -> CalendarYear | None:
        stmt = select(CalendarYear).where(CalendarYear.year == year)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def save_calendar_year(self, row: CalendarYear) -> CalendarYear:
        self.session.add(row)
        await self.session.flush()
        return row

    async def list_retention_rules(self) -> Sequence[RetentionRule]:
        stmt = select(RetentionRule).order_by(RetentionRule.entity_type)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def save_retention_rule(self, rule: RetentionRule) -> RetentionRule:
        self.session.add(rule)
        await self.session.flush()
        return rule

    async def find_active_legal_hold(
        self, entity_type: str, entity_id: str
    ) -> LegalHold | None:
        stmt = select(LegalHold).where(
            LegalHold.entity_type == entity_type,
            LegalHold.entity_id == entity_id,
            LegalHold.released_at.is_(None),
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def save_legal_hold(self, hold: LegalHold) -> LegalHold:
        self.session.add(hold)
        await self.session.flush()
        return hold

    async def get_active_tax_profile(
        self, company_id: uuid.UUID, at: datetime
    ) -> CompanyTaxProfile | None:
        stmt = (
            select(CompanyTaxProfile)
            .where(
                CompanyTaxProfile.company_id == company_id,
                CompanyTaxProfile.effective_from <= at,
                or_(
                    CompanyTaxProfile.effective_to.is_(None),
                    CompanyTaxProfile.effective_to > at,
                ),
            )
            .order_by(CompanyTaxProfile.effective_from.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def save_tax_profile(self, profile: CompanyTaxProfile) -> CompanyTaxProfile:
        self.session.add(profile)
        await self.session.flush()
        return profile

    async def save_eqaima(self, row: EQaimaReconciliation) -> EQaimaReconciliation:
        self.session.add(row)
        await self.session.flush()
        return row

    async def save_turnover_snapshot(
        self, snap: TurnoverMonitorSnapshot
    ) -> TurnoverMonitorSnapshot:
        self.session.add(snap)
        await self.session.flush()
        return snap

    async def save_consent_form(self, form: ConsentFormVersion) -> ConsentFormVersion:
        self.session.add(form)
        await self.session.flush()
        return form

    async def list_consent_forms(
        self, purpose: str | None = None
    ) -> Sequence[ConsentFormVersion]:
        stmt = select(ConsentFormVersion)
        if purpose:
            stmt = stmt.where(ConsentFormVersion.purpose == purpose)
        stmt = stmt.order_by(
            ConsentFormVersion.purpose, ConsentFormVersion.version.desc()
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()
