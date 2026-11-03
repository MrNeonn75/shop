"""ComplianceService — rule resolution, pack lifecycle, obligations, feature gates.

Law is DATA. This service never hardcodes legal rates; it reads rule packs.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import BAKU_TZ, get_business_day_bounds
from app.core.config import settings
from app.core.database import AsyncSessionLocal, utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    NotFoundError,
    ValidationError,
)
from app.core.ids import generate_uuid7
from app.modules.compliance.enums import (
    MANDATORY_DOMAINS,
    ComplianceEventType,
    DomainComplianceStatus,
    ObligationStatus,
    PackStatus,
    PackVersionStatus,
    RuleStatus,
    VerificationAction,
)
from app.modules.compliance.events import (
    publish_obligation_due,
    publish_pack_activated,
    publish_rules_changed,
    publish_rules_invalidated,
    serialize_model_snapshot,
)
from app.modules.compliance.feature_gates import (
    FEATURE_DOMAIN_MAP,
    enforce_feature_gate,
    rule_status_blocks_activation,
)
from app.modules.compliance.models import (
    ComplianceEvent,
    LegalRule,
    Obligation,
    RulePackVersion,
    RuleVerification,
)
from app.modules.compliance.policies import CompliancePolicy
from app.modules.compliance.repository import ComplianceRepository
from app.modules.compliance.schemas import (
    ActivatePackRequest,
    ComplianceBannerResponse,
    ComplianceStatusResponse,
    DomainStatusItem,
    ObligationCreate,
    ObligationUpdate,
    ProposeChangeRequest,
    RejectPackRequest,
    RuleSnapshotItem,
    RuleSnapshotResponse,
    VerifyPackRequest,
    VersionDiffResponse,
)


def _baku_midnight_boundary(at: datetime | date | None) -> datetime:
    """Resolve effective-date point at Asia/Baku midnight boundary → UTC."""
    if at is None:
        today = datetime.now(BAKU_TZ).date()
        start, _ = get_business_day_bounds(today)
        return start
    if isinstance(at, date) and not isinstance(at, datetime):
        start, _ = get_business_day_bounds(at)
        return start
    # datetime: use business day of that instant in Baku
    if at.tzinfo is None:
        at = at.replace(tzinfo=BAKU_TZ)
    baku_date = at.astimezone(BAKU_TZ).date()
    # If time is exactly midnight Baku, that day's start; else use the date's start
    # Effective-date resolution: rule is effective from midnight of effective_from's Baku day
    start, _ = get_business_day_bounds(baku_date)
    return start


def _stable_hash(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class ComplianceService:
    """Central compliance orchestration."""

    def __init__(self) -> None:
        self._rule_cache: dict[str, LegalRule | None] = {}

    def invalidate(self, domains: list[str] | None = None) -> None:
        """Clear in-memory rule cache (optionally scoped by domain prefix)."""
        if not domains:
            self._rule_cache.clear()
            return
        prefixes = tuple(f"{d}:" for d in domains)
        keys = [k for k in self._rule_cache if k.startswith(prefixes)]
        for k in keys:
            del self._rule_cache[k]

    def _cache_key(
        self, domain: str, key: str, at: datetime, branch: uuid.UUID | None
    ) -> str:
        branch_s = str(branch) if branch else "-"
        return f"{domain}:{key}:{at.isoformat()}:{branch_s}"

    async def get_rule(
        self,
        domain: str,
        key: str,
        at: datetime | date | None = None,
        branch: uuid.UUID | None = None,
        *,
        session: AsyncSession | None = None,
    ) -> LegalRule | None:
        """Effective-date resolution at midnight Asia/Baku boundary; cached."""
        point = _baku_midnight_boundary(at)
        cache_key = self._cache_key(domain, key, point, branch)
        if cache_key in self._rule_cache:
            return self._rule_cache[cache_key]

        owns_session = session is None
        if session is None:
            session = AsyncSessionLocal()

        try:
            repo = ComplianceRepository(session)
            rule = await repo.find_effective_rule(domain, key, point)
            self._rule_cache[cache_key] = rule
            return rule
        finally:
            if owns_session:
                await session.close()

    async def list_rules(
        self,
        session: AsyncSession,
        actor: Any,
        *,
        domain: str | None = None,
        rule_key: str | None = None,
        status: str | None = None,
        pack_version_id: uuid.UUID | None = None,
        at: datetime | None = None,
    ) -> list[LegalRule]:
        CompliancePolicy.check_rules_view(actor)
        point = _baku_midnight_boundary(at) if at else None
        repo = ComplianceRepository(session)
        rows = await repo.list_rules(
            domain=domain,
            rule_key=rule_key,
            status=status,
            pack_version_id=pack_version_id,
            at=point,
        )
        return list(rows)

    async def get_rule_by_id(
        self, session: AsyncSession, actor: Any, rule_id: uuid.UUID
    ) -> LegalRule:
        CompliancePolicy.check_rules_view(actor)
        repo = ComplianceRepository(session)
        rule = await repo.get_rule_by_id(rule_id)
        if rule is None:
            raise NotFoundError("Qayda tapılmadı.")
        return rule

    async def get_rule_history(
        self,
        session: AsyncSession,
        actor: Any,
        rule_id: uuid.UUID,
    ) -> list[LegalRule]:
        CompliancePolicy.check_rules_view(actor)
        repo = ComplianceRepository(session)
        rule = await repo.get_rule_by_id(rule_id)
        if rule is None:
            raise NotFoundError("Qayda tapılmadı.")
        history = await repo.get_rule_history(rule.rule_key, domain=rule.domain)
        return list(history)

    async def propose_change(
        self,
        session: AsyncSession,
        actor: Any,
        pack_id: uuid.UUID,
        request: ProposeChangeRequest,
    ) -> RulePackVersion:
        """Create a new DRAFT pack version with optional rule drafts."""
        CompliancePolicy.check_rules_edit(actor)
        repo = ComplianceRepository(session)
        pack = await repo.get_pack(pack_id)
        if pack is None:
            raise NotFoundError("Qayda paketi tapılmadı.")

        next_ver = await repo.get_latest_pack_version_number(pack_id) + 1
        actor_id = getattr(actor, "id", None)
        version = RulePackVersion(
            id=generate_uuid7(),
            pack_id=pack.id,
            version=next_ver,
            status=PackVersionStatus.DRAFT.value,
            effective_from=request.effective_from,
            banner_unverified=True,
            created_by=actor_id,
            created_at=utc_now(),
            notes=request.notes,
        )
        await repo.save_pack_version(version)

        for r in request.rules:
            rule_key = r.get("rule_key")
            title_az = r.get("title_az")
            if not rule_key or not title_az:
                raise ValidationError("Hər qayda üçün rule_key və title_az tələb olunur.")
            eff = r.get("effective_from") or request.effective_from or utc_now()
            if isinstance(eff, str):
                eff = datetime.fromisoformat(eff)
            if isinstance(eff, datetime) and eff.tzinfo is None:
                eff = eff.replace(tzinfo=UTC)
            rule = LegalRule(
                id=generate_uuid7(),
                rule_key=rule_key,
                jurisdiction=r.get("jurisdiction", "AZ"),
                domain=pack.domain,
                title_az=title_az,
                parameters=r.get("parameters") or {},
                parameters_schema=r.get("parameters_schema"),
                effective_from=eff,
                effective_to=r.get("effective_to"),
                legal_reference=r.get("legal_reference"),
                source_url=r.get("source_url"),
                source_type=r.get("source_type", "SECONDARY"),
                status=RuleStatus.UNVERIFIED.value,
                notes=r.get("notes"),
                version=int(r.get("version") or 1),
                pack_version_id=version.id,
                created_at=utc_now(),
                created_by=actor_id,
                editor_id=actor_id,
            )
            await repo.save_rule(rule)

        await self.log_event(
            session,
            event_type=ComplianceEventType.PACK_PROPOSED.value,
            domain=pack.domain,
            entity_type="rule_pack_version",
            entity_id=str(version.id),
            actor_id=actor_id,
            after={"version": next_ver, "pack_id": str(pack.id)},
        )
        await publish_rules_changed(
            session, domain=pack.domain, pack_version_id=version.id, reason="propose"
        )
        return version

    async def verify_pack(
        self,
        session: AsyncSession,
        actor: Any,
        version_id: uuid.UUID,
        request: VerifyPackRequest,
    ) -> RulePackVersion:
        CompliancePolicy.check_rules_verify(actor)
        return await self._verify_or_reject(
            session,
            actor,
            version_id,
            action=VerificationAction.VERIFY,
            verifier_name=request.verifier_name,
            verifier_role=request.verifier_role,
            evidence_file_id=request.evidence_file_id,
            evidence_notes=request.evidence_notes,
        )

    async def reject_pack(
        self,
        session: AsyncSession,
        actor: Any,
        version_id: uuid.UUID,
        request: RejectPackRequest,
    ) -> RulePackVersion:
        CompliancePolicy.check_rules_verify(actor)
        return await self._verify_or_reject(
            session,
            actor,
            version_id,
            action=VerificationAction.REJECT,
            verifier_name=request.verifier_name,
            verifier_role=request.verifier_role,
            evidence_file_id=request.evidence_file_id,
            evidence_notes=request.evidence_notes,
        )

    async def _verify_or_reject(
        self,
        session: AsyncSession,
        actor: Any,
        version_id: uuid.UUID,
        *,
        action: VerificationAction,
        verifier_name: str,
        verifier_role: str,
        evidence_file_id: uuid.UUID | None,
        evidence_notes: str,
    ) -> RulePackVersion:
        if not evidence_notes or len(evidence_notes.strip()) < 3:
            raise ValidationError("Yoxlama üçün evidence_notes məcburidir.")
        if evidence_file_id is None and len(evidence_notes.strip()) < 20:
            raise ValidationError(
                "Evidence faylı və ya ətraflı evidence_notes (ən azı 20 simvol) tələb olunur."
            )

        repo = ComplianceRepository(session)
        version = await repo.get_pack_version(version_id)
        if version is None:
            raise NotFoundError("Paket versiyası tapılmadı.")
        if version.status not in (
            PackVersionStatus.DRAFT.value,
            PackVersionStatus.PENDING_VERIFY.value,
            PackVersionStatus.VERIFIED.value,
        ):
            raise BusinessRuleViolationError(
                message=f"Versiya statusu yoxlamaya uyğun deyil: {version.status}",
                code="COMPLIANCE_INVALID_VERSION_STATUS",
            )

        verifier_id = getattr(actor, "id", None)
        editor_id = version.created_by
        # Also check rule editors
        for rule in version.rules or []:
            if rule.editor_id and verifier_id and rule.editor_id == verifier_id:
                raise BusinessRuleViolationError(
                    message="İki nəfər qaydası: yoxlayan redaktor ola bilməz (verifier ≠ editor).",
                    code="COMPLIANCE_TWO_PERSON_RULE",
                    details={"verifier_id": str(verifier_id), "editor_id": str(rule.editor_id)},
                )
        if verifier_id and editor_id and verifier_id == editor_id:
            roles = getattr(actor, "roles", []) or []
            if "system_admin" not in roles:
                raise BusinessRuleViolationError(
                    message="İki nəfər qaydası: yoxlayan redaktor ola bilməz (verifier ≠ editor).",
                    code="COMPLIANCE_TWO_PERSON_RULE",
                    details={"verifier_id": str(verifier_id), "editor_id": str(editor_id)},
                )

        verification = RuleVerification(
            id=generate_uuid7(),
            pack_version_id=version.id,
            action=action.value,
            verifier_id=verifier_id or generate_uuid7(),
            verifier_name=verifier_name,
            verifier_role=verifier_role,
            evidence_file_id=evidence_file_id,
            evidence_notes=evidence_notes,
            created_at=utc_now(),
        )
        await repo.save_verification(verification)

        pack = version.pack
        if action == VerificationAction.VERIFY:
            version.status = PackVersionStatus.VERIFIED.value
            for rule in version.rules or []:
                if rule.status != RuleStatus.DISPUTED.value:
                    rule.status = RuleStatus.VERIFIED.value
                    rule.verified_by_name = verifier_name
                    rule.verified_by_role = verifier_role
                    rule.verified_at = utc_now()
            event_type = ComplianceEventType.PACK_VERIFIED.value
        else:
            version.status = PackVersionStatus.REJECTED.value
            event_type = ComplianceEventType.PACK_REJECTED.value

        await repo.save_pack_version(version)
        await self.log_event(
            session,
            event_type=event_type,
            domain=pack.domain if pack else None,
            entity_type="rule_pack_version",
            entity_id=str(version.id),
            actor_id=verifier_id,
            after={"action": action.value, "status": version.status},
        )
        return version

    async def activate_pack(
        self,
        session: AsyncSession,
        actor: Any,
        version_id: uuid.UUID,
        request: ActivatePackRequest,
    ) -> RulePackVersion:
        CompliancePolicy.check_rules_activate(actor)
        repo = ComplianceRepository(session)
        version = await repo.get_pack_version(version_id)
        if version is None:
            raise NotFoundError("Paket versiyası tapılmadı.")

        pack = version.pack or await repo.get_pack(version.pack_id)
        if pack is None:
            raise NotFoundError("Qayda paketi tapılmadı.")

        rules = list(version.rules or [])
        disputed = [r.rule_key for r in rules if r.status == RuleStatus.DISPUTED.value]
        if disputed:
            raise BusinessRuleViolationError(
                message="DISPUTED qaydalar aktivləşdirməni həmişə bloklayır.",
                code="COMPLIANCE_RULES_DISPUTED",
                details={"disputed_rule_keys": disputed},
            )

        unverified = [r.rule_key for r in rules if r.status == RuleStatus.UNVERIFIED.value]
        banner = False
        if settings.is_production:
            if unverified or version.status not in (
                PackVersionStatus.VERIFIED.value,
                PackVersionStatus.ACTIVE.value,
            ):
                # In prod all rules must be VERIFIED
                bad = [
                    r.rule_key
                    for r in rules
                    if rule_status_blocks_activation(r.status, is_production=True)
                ]
                if bad or version.status != PackVersionStatus.VERIFIED.value:
                    raise BusinessRuleViolationError(
                        message=(
                            "İstehsalatda aktivləşdirmə üçün bütün qaydalar VERIFIED "
                            "olmalı və paket yoxlanmalıdır."
                        ),
                        code="COMPLIANCE_RULES_NOT_VERIFIED",
                        details={"missing_domains": [pack.domain], "unverified_rules": bad or unverified},
                    )
            banner = False
        else:
            # Non-prod: allow UNVERIFIED with banner
            banner = bool(unverified) or version.status != PackVersionStatus.VERIFIED.value
            if version.status == PackVersionStatus.REJECTED.value:
                raise BusinessRuleViolationError(
                    message="Rədd edilmiş versiya aktivləşdirilə bilməz.",
                    code="COMPLIANCE_INVALID_VERSION_STATUS",
                )

        effective_from = request.effective_from
        if effective_from.tzinfo is None:
            effective_from = effective_from.replace(tzinfo=BAKU_TZ).astimezone(UTC)
        # Normalize to Baku midnight boundary of that calendar day
        baku_day = effective_from.astimezone(BAKU_TZ).date()
        effective_from, _ = get_business_day_bounds(baku_day)

        # Supersede previous active version
        if pack.active_version_id and pack.active_version_id != version.id:
            prev = await repo.get_pack_version(pack.active_version_id)
            if prev is not None:
                prev.status = PackVersionStatus.SUPERSEDED.value
                prev.effective_to = effective_from
                await repo.save_pack_version(prev)
                for r in prev.rules or []:
                    if r.status == RuleStatus.VERIFIED.value:
                        r.status = RuleStatus.SUPERSEDED.value
                        if r.effective_to is None:
                            r.effective_to = effective_from

        version.status = PackVersionStatus.ACTIVE.value
        version.effective_from = effective_from
        version.banner_unverified = banner
        version.activated_at = utc_now()
        version.activated_by = getattr(actor, "id", None)
        version.snapshot_hash = _stable_hash(
            [
                {
                    "id": str(r.id),
                    "key": r.rule_key,
                    "params": r.parameters,
                    "status": r.status,
                    "version": r.version,
                }
                for r in rules
            ]
        )
        await repo.save_pack_version(version)

        pack.active_version_id = version.id
        pack.status = PackStatus.ACTIVE.value
        pack.updated_at = utc_now()
        await repo.save_pack(pack)

        self.invalidate([pack.domain])
        await publish_rules_invalidated(
            session, domains=[pack.domain], reason="pack_activated"
        )
        await publish_pack_activated(
            session,
            pack_id=pack.id,
            pack_version_id=version.id,
            domain=pack.domain,
            effective_from=effective_from,
            banner_unverified=banner,
            activated_by=getattr(actor, "id", None),
        )
        await publish_rules_changed(
            session,
            domain=pack.domain,
            pack_version_id=version.id,
            reason="activated",
        )
        await self.log_event(
            session,
            event_type=ComplianceEventType.PACK_ACTIVATED.value,
            domain=pack.domain,
            entity_type="rule_pack_version",
            entity_id=str(version.id),
            actor_id=getattr(actor, "id", None),
            after={
                "effective_from": effective_from.isoformat(),
                "banner_unverified": banner,
            },
        )
        return version

    async def diff_versions(
        self,
        session: AsyncSession,
        actor: Any,
        version_a_id: uuid.UUID,
        version_b_id: uuid.UUID,
    ) -> VersionDiffResponse:
        CompliancePolicy.check_rules_view(actor)
        repo = ComplianceRepository(session)
        a = await repo.get_pack_version(version_a_id)
        b = await repo.get_pack_version(version_b_id)
        if a is None or b is None:
            raise NotFoundError("Müqayisə üçün versiyalardan biri tapılmadı.")

        map_a = {r.rule_key: r for r in (a.rules or [])}
        map_b = {r.rule_key: r for r in (b.rules or [])}
        added = []
        removed = []
        changed = []
        for key, rb in map_b.items():
            if key not in map_a:
                added.append({"rule_key": key, "parameters": rb.parameters, "status": rb.status})
            else:
                ra = map_a[key]
                if ra.parameters != rb.parameters or ra.status != rb.status:
                    changed.append(
                        {
                            "rule_key": key,
                            "before": {"parameters": ra.parameters, "status": ra.status},
                            "after": {"parameters": rb.parameters, "status": rb.status},
                        }
                    )
        for key, ra in map_a.items():
            if key not in map_b:
                removed.append({"rule_key": key, "parameters": ra.parameters, "status": ra.status})

        return VersionDiffResponse(
            version_a_id=version_a_id,
            version_b_id=version_b_id,
            added=added,
            removed=removed,
            changed=changed,
        )

    async def _domain_statuses(
        self, session: AsyncSession
    ) -> dict[str, DomainComplianceStatus]:
        repo = ComplianceRepository(session)
        result: dict[str, DomainComplianceStatus] = {}
        for domain in MANDATORY_DOMAINS:
            pack = await repo.get_pack_by_domain(domain.value)
            if pack is None or pack.active_version_id is None:
                result[domain.value] = DomainComplianceStatus.MISSING
                continue
            version = await repo.get_pack_version(pack.active_version_id)
            if version is None:
                result[domain.value] = DomainComplianceStatus.MISSING
                continue
            rules = list(version.rules or [])
            if any(r.status == RuleStatus.DISPUTED.value for r in rules):
                result[domain.value] = DomainComplianceStatus.DISPUTED
            elif version.banner_unverified or any(
                r.status == RuleStatus.UNVERIFIED.value for r in rules
            ):
                result[domain.value] = DomainComplianceStatus.ACTIVE_UNVERIFIED
            else:
                result[domain.value] = DomainComplianceStatus.ACTIVE_VERIFIED
        return result

    async def get_compliance_status(
        self, session: AsyncSession, actor: Any | None = None
    ) -> ComplianceStatusResponse:
        if actor is not None:
            CompliancePolicy.check_rules_view(actor)
        statuses = await self._domain_statuses(session)
        repo = ComplianceRepository(session)
        domains: list[DomainStatusItem] = []
        critical = False
        for domain in MANDATORY_DOMAINS:
            st = statuses[domain.value]
            pack = await repo.get_pack_by_domain(domain.value)
            disputed_keys: list[str] = []
            banner = False
            vid = None
            if pack and pack.active_version_id:
                vid = pack.active_version_id
                ver = await repo.get_pack_version(vid)
                if ver:
                    banner = ver.banner_unverified
                    disputed_keys = [
                        r.rule_key
                        for r in (ver.rules or [])
                        if r.status == RuleStatus.DISPUTED.value
                    ]
            if settings.is_production and st in (
                DomainComplianceStatus.MISSING,
                DomainComplianceStatus.ACTIVE_UNVERIFIED,
                DomainComplianceStatus.DISPUTED,
            ):
                critical = True
            domains.append(
                DomainStatusItem(
                    domain=domain.value,
                    status=st.value,
                    pack_code=pack.code if pack else None,
                    pack_version_id=vid,
                    banner_unverified=banner,
                    disputed_rule_keys=disputed_keys,
                )
            )
        return ComplianceStatusResponse(
            environment=settings.APP_ENV,
            is_production=settings.is_production,
            domains=domains,
            critical=critical,
        )

    async def get_banner(self, session: AsyncSession) -> ComplianceBannerResponse:
        statuses = await self._domain_statuses(session)
        unverified = [
            d
            for d, s in statuses.items()
            if s
            in (
                DomainComplianceStatus.ACTIVE_UNVERIFIED,
                DomainComplianceStatus.MISSING,
                DomainComplianceStatus.DISPUTED,
            )
        ]
        show = bool(unverified) and not settings.is_production
        # Also show in production as critical warning if any issues
        if settings.is_production and unverified:
            show = True
        message = (
            "QEYD: Compliance qayda paketləri UNVERIFIED və ya çatışmır. "
            "Hüquqi uyğunluq iddiası YOXDUR. Mühasib/vəkil yoxlaması tələb olunur."
        )
        return ComplianceBannerResponse(
            show_banner=show,
            message_az=message,
            unverified_domains=unverified,
            environment=settings.APP_ENV,
        )

    async def ensure_feature_allowed(
        self, session: AsyncSession, feature: str
    ) -> dict[str, Any] | None:
        """Delegate to feature_gates; returns banner metadata when non-prod allow."""
        statuses = await self._domain_statuses(session)
        result = enforce_feature_gate(feature, statuses, raise_on_block=True)
        return result.banner

    # ------------------------------------------
    # Obligations
    # ------------------------------------------

    async def create_obligation(
        self, session: AsyncSession, actor: Any, data: ObligationCreate
    ) -> Obligation:
        CompliancePolicy.check_obligations_manage(actor)
        repo = ComplianceRepository(session)
        tpl = await repo.get_obligation_template(data.template_code)
        if tpl is None:
            # Allow free-form template codes with warning path — still create
            pass
        obligation = Obligation(
            id=generate_uuid7(),
            template_code=data.template_code,
            title_az=data.title_az,
            owner_user_id=data.owner_user_id,
            cadence=data.cadence,
            next_due=data.next_due,
            status=ObligationStatus.OPEN.value,
            company_id=data.company_id,
            meta=data.meta,
            created_at=utc_now(),
            updated_at=utc_now(),
            created_by=getattr(actor, "id", None),
        )
        await repo.save_obligation(obligation)
        await self.log_event(
            session,
            event_type=ComplianceEventType.OBLIGATION_CREATED.value,
            domain=None,
            entity_type="obligation",
            entity_id=str(obligation.id),
            actor_id=getattr(actor, "id", None),
            after={"template_code": data.template_code, "next_due": str(data.next_due)},
        )
        if data.next_due is not None:
            await publish_obligation_due(
                session,
                obligation_id=obligation.id,
                title_az=obligation.title_az,
                next_due=obligation.next_due,
                owner_user_id=obligation.owner_user_id,
            )
        return obligation

    async def update_obligation(
        self,
        session: AsyncSession,
        actor: Any,
        obligation_id: uuid.UUID,
        data: ObligationUpdate,
    ) -> Obligation:
        CompliancePolicy.check_obligations_manage(actor)
        repo = ComplianceRepository(session)
        obligation = await repo.get_obligation(obligation_id)
        if obligation is None:
            raise NotFoundError("Öhdəlik tapılmadı.")
        before = serialize_model_snapshot(
            obligation,
            ["title_az", "status", "next_due", "cadence", "owner_user_id"],
        )
        for field in ("title_az", "owner_user_id", "cadence", "next_due", "evidence_notes", "meta"):
            val = getattr(data, field)
            if val is not None:
                setattr(obligation, field, val)
        if data.status is not None:
            obligation.status = data.status
            if data.status == ObligationStatus.COMPLETED.value:
                obligation.completed_at = utc_now()
        obligation.updated_at = utc_now()
        await repo.save_obligation(obligation)
        await self.log_event(
            session,
            event_type=ComplianceEventType.OBLIGATION_UPDATED.value,
            domain=None,
            entity_type="obligation",
            entity_id=str(obligation.id),
            actor_id=getattr(actor, "id", None),
            before=before,
            after=serialize_model_snapshot(
                obligation,
                ["title_az", "status", "next_due", "cadence", "owner_user_id"],
            ),
        )
        return obligation

    async def list_obligations(
        self,
        session: AsyncSession,
        actor: Any,
        *,
        status: str | None = None,
        company_id: uuid.UUID | None = None,
    ) -> list[Obligation]:
        CompliancePolicy.check_obligations_manage(actor)
        repo = ComplianceRepository(session)
        return list(
            await repo.list_obligations(status=status, company_id=company_id)
        )

    async def get_obligation(
        self, session: AsyncSession, actor: Any, obligation_id: uuid.UUID
    ) -> Obligation:
        CompliancePolicy.check_obligations_manage(actor)
        repo = ComplianceRepository(session)
        row = await repo.get_obligation(obligation_id)
        if row is None:
            raise NotFoundError("Öhdəlik tapılmadı.")
        return row

    async def delete_obligation(
        self, session: AsyncSession, actor: Any, obligation_id: uuid.UUID
    ) -> None:
        CompliancePolicy.check_obligations_manage(actor)
        repo = ComplianceRepository(session)
        row = await repo.get_obligation(obligation_id)
        if row is None:
            raise NotFoundError("Öhdəlik tapılmadı.")
        row.status = ObligationStatus.CANCELLED.value
        row.updated_at = utc_now()
        await repo.save_obligation(row)

    # ------------------------------------------
    # Events / snapshots / export
    # ------------------------------------------

    async def log_event(
        self,
        session: AsyncSession,
        *,
        event_type: str,
        entity_type: str,
        entity_id: str,
        domain: str | None = None,
        actor_id: uuid.UUID | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
    ) -> ComplianceEvent:
        repo = ComplianceRepository(session)
        event = ComplianceEvent(
            id=generate_uuid7(),
            event_type=event_type,
            domain=domain,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_id=actor_id,
            before=before,
            after=after,
            created_at=utc_now(),
        )
        return await repo.append_event(event)

    async def build_rule_snapshot(
        self, session: AsyncSession, rule_ids: list[uuid.UUID]
    ) -> RuleSnapshotResponse:
        repo = ComplianceRepository(session)
        rules = await repo.list_rules_by_ids(rule_ids)
        items = [
            RuleSnapshotItem(
                rule_id=r.id,
                rule_key=r.rule_key,
                domain=r.domain,
                version=r.version,
                status=r.status,
                parameters=r.parameters,
                pack_version_id=r.pack_version_id,
                effective_from=r.effective_from,
                source_type=r.source_type,
            )
            for r in rules
        ]
        payload = [i.model_dump(mode="json") for i in items]
        return RuleSnapshotResponse(
            rules=items,
            snapshot_hash=_stable_hash(payload),
            captured_at=utc_now(),
        )

    async def export_register(
        self, session: AsyncSession, actor: Any, fmt: str = "csv"
    ) -> dict[str, str]:
        CompliancePolicy.check_export(actor)
        CompliancePolicy.check_register_view(actor)
        repo = ComplianceRepository(session)
        rules = await repo.list_rules(limit=5000)
        fmt = fmt.lower()
        if fmt not in ("csv", "pdf"):
            raise ValidationError("format csv|pdf olmalıdır.")

        disclaimer = (
            "DRAFT / INFORMATIONAL — accountant review required. "
            "UNVERIFIED secondary references may be present. Not a legal filing."
        )
        if fmt == "csv":
            lines = [
                "rule_id,domain,rule_key,status,source_type,source_url,effective_from,title_az"
            ]
            for r in rules:
                lines.append(
                    ",".join(
                        [
                            str(r.id),
                            r.domain,
                            r.rule_key,
                            r.status,
                            r.source_type,
                            (r.source_url or "").replace(",", " "),
                            r.effective_from.isoformat(),
                            (r.title_az or "").replace(",", " "),
                        ]
                    )
                )
            body = "\n".join(lines) + f"\n# {disclaimer}\n"
            return {
                "format": "csv",
                "content_type": "text/csv; charset=utf-8",
                "filename": "compliance_register.csv",
                "body": body,
                "disclaimer": disclaimer,
            }

        # Minimal PDF-like plain text placeholder (no heavy PDF lib inventing)
        body_lines = [
            "COMPLIANCE LEGAL REGISTER (DRAFT)",
            disclaimer,
            "",
        ]
        for r in rules:
            body_lines.append(
                f"- [{r.status}] {r.domain}/{r.rule_key} v{r.version} "
                f"from={r.effective_from.isoformat()} src={r.source_type}"
            )
        body = "\n".join(body_lines)
        return {
            "format": "pdf",
            "content_type": "application/pdf",
            "filename": "compliance_register.pdf",
            "body": body,  # callers may wrap; text placeholder until PDF renderer exists
            "disclaimer": disclaimer,
        }

    def known_features(self) -> list[str]:
        return list(FEATURE_DOMAIN_MAP.keys())


_compliance_service: ComplianceService | None = None


def get_compliance_service() -> ComplianceService:
    global _compliance_service
    if _compliance_service is None:
        _compliance_service = ComplianceService()
    return _compliance_service
