"""Unit testlər — Compliance qayda mühərriki, iki nəfər qaydası, effektiv tarixlər, snapshot və feature gates."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import BAKU_TZ
from app.core.config import settings
from app.core.errors import BusinessRuleViolationError, ValidationError
from app.core.ids import generate_uuid7
from app.modules.compliance.enums import (
    ComplianceDomain,
    DomainComplianceStatus,
    PackStatus,
    PackVersionStatus,
    RuleStatus,
)
from app.modules.compliance.feature_gates import (
    enforce_feature_gate,
)
from app.modules.compliance.models import (
    LegalRule,
    RulePack,
    RulePackVersion,
)
from app.modules.compliance.schemas import (
    ActivatePackRequest,
    ProposeChangeRequest,
    VerifyPackRequest,
)
from app.modules.compliance.seeds import seed_reference_rule_packs
from app.modules.compliance.service import (
    ComplianceService,
    _baku_midnight_boundary,
    _stable_hash,
)


class MockActor:
    def __init__(
        self,
        actor_id: uuid.UUID | None = None,
        roles: list[str] | None = None,
        permissions: list[str] | None = None,
    ) -> None:
        self.id = actor_id or generate_uuid7()
        self.roles = roles or []
        self.permissions = permissions or [
            "compliance.rules.view",
            "compliance.rules.edit",
            "compliance.rules.verify",
            "compliance.rules.activate",
            "compliance.obligations.manage",
            "compliance.privacy.manage",
            "compliance.register.view",
            "compliance.export",
            "compliance.fiscal.manage",
        ]


def test_baku_midnight_boundary_resolution() -> None:
    """Effektiv tarix Asia/Baku gecə yarısı sərhədinə (midnight boundary) normallaşdırılmalıdır."""
    # 2026-06-15 saat 14:30 Baku vaxtı
    baku_dt = datetime(2026, 6, 15, 14, 30, 0, tzinfo=BAKU_TZ)
    boundary_dt = _baku_midnight_boundary(baku_dt)

    # 15 İyun saat 00:00:00 Baku vaxtı = 14 İyun 20:00:00 UTC (UTC+4)
    expected_utc = datetime(2026, 6, 14, 20, 0, 0, tzinfo=UTC)
    assert boundary_dt == expected_utc

    # Date obyekti üçün yoxlama
    d = date(2026, 1, 1)
    boundary_d = _baku_midnight_boundary(d)
    # 1 Yanvar 00:00:00 Baku = 31 Dekabr 20:00:00 UTC
    assert boundary_d == datetime(2025, 12, 31, 20, 0, 0, tzinfo=UTC)


def test_stable_hash_consistency() -> None:
    data1 = {"b": 2, "a": [1, 2, 3]}
    data2 = {"a": [1, 2, 3], "b": 2}
    assert _stable_hash(data1) == _stable_hash(data2)


@pytest.mark.asyncio
async def test_seed_and_get_rule_cached(session: AsyncSession) -> None:
    """Toxumlanmış qaydanın get_rule vasitəsilə keşlənməsi və invalidasiyası."""
    svc = ComplianceService()
    await seed_reference_rule_packs(session)
    await session.commit()

    # Rule tapılmalıdır
    rule = await svc.get_rule(
        ComplianceDomain.TAX_VAT.value,
        "vat.standard_rate",
        at=datetime(2026, 1, 15, 12, 0, tzinfo=BAKU_TZ),
        session=session,
    )
    assert rule is not None
    assert rule.parameters["rate"] == 0.18

    # Keşdən oxunma
    cache_len_before = len(svc._rule_cache)
    assert cache_len_before >= 1

    # Invalidate domain
    svc.invalidate([ComplianceDomain.TAX_VAT.value])
    assert len(svc._rule_cache) == 0


@pytest.mark.asyncio
async def test_two_person_rule_enforcement(session: AsyncSession) -> None:
    """İki nəfər qaydası: editor == verifier olduqda təsdiq qadağandır."""
    svc = ComplianceService()
    editor_id = generate_uuid7()
    editor = MockActor(actor_id=editor_id)

    # Pack yaradılması
    pack = RulePack(
        id=generate_uuid7(),
        domain=ComplianceDomain.TAX_VAT.value,
        code="test_pack_vat",
        title_az="Test ƏDV Paketi",
        status=PackStatus.DRAFT.value,
    )
    session.add(pack)
    await session.flush()

    # Editor təklif edir
    req = ProposeChangeRequest(
        effective_from=datetime(2026, 7, 1, 0, 0, tzinfo=BAKU_TZ),
        notes="Yeni versiya təklifi",
        rules=[
            {
                "rule_key": "vat.special_test",
                "title_az": "Xüsusi ƏDV testi",
                "parameters": {"rate": 0.18},
                "legal_reference": {"act_name": "VM", "article": "173"},
            }
        ],
    )
    version = await svc.propose_change(session, editor, pack.id, req)
    await session.flush()

    assert version.created_by == editor_id
    assert version.status == PackVersionStatus.DRAFT.value

    # Eyni şəxs (editor) verify etməyə cəhd edir -> COMPLIANCE_TWO_PERSON_RULE xətası
    v_req = VerifyPackRequest(
        verifier_name="Həsən Mühasib",
        verifier_role="accountant",
        evidence_notes="Bu tamamilə rəsmi qanunvericiliyə uyğundur və yoxlanıldı.",
    )
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await svc.verify_pack(session, editor, version.id, v_req)
    assert exc_info.value.code == "COMPLIANCE_TWO_PERSON_RULE"

    # Müxtəlif şəxs (fərqli verifier) təsdiq edir -> uğurla tamamlanmalıdır
    verifier = MockActor(actor_id=generate_uuid7())
    verified_version = await svc.verify_pack(session, verifier, version.id, v_req)
    assert verified_version.status == PackVersionStatus.VERIFIED.value

    # Verifications qeydini yoxlayırıq
    from sqlalchemy import select

    from app.modules.compliance.models import RuleVerification
    res = await session.execute(
        select(RuleVerification).where(RuleVerification.pack_version_id == version.id)
    )
    v_rows = res.scalars().all()
    assert len(v_rows) == 1
    assert v_rows[0].verifier_name == "Həsən Mühasib"


@pytest.mark.asyncio
async def test_verification_requires_evidence_notes_or_file(session: AsyncSession) -> None:
    """Təsdiq üçün ən azı 20 simvol evidence_notes və ya evidence_file_id tələb olunur."""
    svc = ComplianceService()
    editor = MockActor()
    pack = RulePack(
        id=generate_uuid7(),
        domain=ComplianceDomain.TAX_VAT.value,
        code="test_pack_evidence",
        title_az="Test Evidence",
        status=PackStatus.DRAFT.value,
    )
    session.add(pack)
    await session.flush()

    req = ProposeChangeRequest(
        effective_from=datetime(2026, 7, 1, 0, 0, tzinfo=BAKU_TZ),
        rules=[{"rule_key": "k", "title_az": "T", "parameters": {}}],
    )
    version = await svc.propose_change(session, editor, pack.id, req)
    await session.flush()

    verifier = MockActor()
    # Çox qısa qeyd və fayl yoxdur -> ValidationError
    short_req = VerifyPackRequest(
        verifier_name="Əli Vəkil",
        verifier_role="lawyer",
        evidence_notes="qısa qeyd",
    )
    with pytest.raises(ValidationError):
        await svc.verify_pack(session, verifier, version.id, short_req)


@pytest.mark.asyncio
async def test_disputed_rules_block_activation(session: AsyncSession) -> None:
    """DISPUTED statuslu qaydalar həm istehsalatda, həm də qeyri-istehsalatda aktivləşdirməni bloklamalıdır."""
    svc = ComplianceService()
    admin = MockActor(roles=["system_admin"])

    pack = RulePack(
        id=generate_uuid7(),
        domain=ComplianceDomain.PAYROLL_SOCIAL.value,
        code="test_payroll_social",
        title_az="Sosial Paket",
        status=PackStatus.DRAFT.value,
    )
    session.add(pack)
    await session.flush()

    version = RulePackVersion(
        id=generate_uuid7(),
        pack_id=pack.id,
        version=1,
        status=PackVersionStatus.VERIFIED.value,
        created_by=generate_uuid7(),
    )
    session.add(version)
    await session.flush()

    disputed_rule = LegalRule(
        id=generate_uuid7(),
        rule_key="payroll.disputed_rate",
        jurisdiction="AZ",
        domain=pack.domain,
        title_az="Mübahisəli dərəcə",
        parameters={"rate": 0.22},
        effective_from=datetime(2026, 1, 1, tzinfo=UTC),
        status=RuleStatus.DISPUTED.value,
        pack_version_id=version.id,
    )
    session.add(disputed_rule)
    await session.flush()

    act_req = ActivatePackRequest(
        effective_from=datetime(2026, 1, 1, tzinfo=BAKU_TZ),
    )
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await svc.activate_pack(session, admin, version.id, act_req)

    assert exc_info.value.code == "COMPLIANCE_RULES_DISPUTED"
    details_dict = exc_info.value.details[0] if isinstance(exc_info.value.details, list) else exc_info.value.details
    assert "payroll.disputed_rate" in details_dict["disputed_rule_keys"]


@pytest.mark.asyncio
async def test_activation_supersedes_previous_version(session: AsyncSession) -> None:
    """Yeni versiyanın aktivləşdirilməsi köhnə aktiv versiyanı SUPERSEDED etməlidir."""
    svc = ComplianceService()
    admin = MockActor(roles=["system_admin"])

    pack = RulePack(
        id=generate_uuid7(),
        domain=ComplianceDomain.CONSUMER_RETURNS.value,
        code="test_returns_pack",
        title_az="Qaytarma Paketi",
        status=PackStatus.DRAFT.value,
    )
    session.add(pack)
    await session.flush()

    # V1 yaradılır və aktivləşdirilir
    v1 = RulePackVersion(
        id=generate_uuid7(),
        pack_id=pack.id,
        version=1,
        status=PackVersionStatus.VERIFIED.value,
        effective_from=datetime(2026, 1, 1, tzinfo=UTC),
        created_by=generate_uuid7(),
    )
    session.add(v1)
    await session.flush()
    r1 = LegalRule(
        id=generate_uuid7(),
        rule_key="returns.days",
        domain=pack.domain,
        title_az="Qaytarma günləri",
        parameters={"days": 14},
        effective_from=datetime(2026, 1, 1, tzinfo=UTC),
        status=RuleStatus.VERIFIED.value,
        pack_version_id=v1.id,
    )
    session.add(r1)
    await session.flush()

    await svc.activate_pack(
        session,
        admin,
        v1.id,
        ActivatePackRequest(effective_from=datetime(2026, 1, 1, tzinfo=BAKU_TZ)),
    )
    assert pack.active_version_id == v1.id
    assert v1.status == PackVersionStatus.ACTIVE.value

    # V2 yaradılır və aktivləşdirilir (məs. 2026-06-01-dən)
    v2 = RulePackVersion(
        id=generate_uuid7(),
        pack_id=pack.id,
        version=2,
        status=PackVersionStatus.VERIFIED.value,
        effective_from=datetime(2026, 6, 1, tzinfo=UTC),
        created_by=generate_uuid7(),
    )
    session.add(v2)
    await session.flush()
    r2 = LegalRule(
        id=generate_uuid7(),
        rule_key="returns.days",
        domain=pack.domain,
        title_az="Qaytarma günləri v2",
        parameters={"days": 30},
        effective_from=datetime(2026, 6, 1, tzinfo=UTC),
        status=RuleStatus.VERIFIED.value,
        pack_version_id=v2.id,
    )
    session.add(r2)
    await session.flush()

    await svc.activate_pack(
        session,
        admin,
        v2.id,
        ActivatePackRequest(effective_from=datetime(2026, 6, 1, tzinfo=BAKU_TZ)),
    )

    # V1 indi SUPERSEDED olmalıdır və effective_to təyin olunmalıdır
    assert v1.status == PackVersionStatus.SUPERSEDED.value
    assert v1.effective_to is not None
    assert r1.status == RuleStatus.SUPERSEDED.value

    # V2 aktivdir
    assert pack.active_version_id == v2.id
    assert v2.status == PackVersionStatus.ACTIVE.value


@pytest.mark.asyncio
async def test_diff_versions_shows_added_removed_and_changed(session: AsyncSession) -> None:
    """İki versiya arasındakı diff funksiyası əlavə/silinmiş/dəyişmiş qaydaları göstərməlidir."""
    svc = ComplianceService()
    admin = MockActor()
    pack = RulePack(
        id=generate_uuid7(),
        domain=ComplianceDomain.TAX_VAT.value,
        code="diff_test_pack",
        title_az="Diff Test",
        status=PackStatus.DRAFT.value,
    )
    session.add(pack)
    await session.flush()

    v1 = RulePackVersion(
        id=generate_uuid7(),
        pack_id=pack.id,
        version=1,
        status=PackVersionStatus.VERIFIED.value,
    )
    v2 = RulePackVersion(
        id=generate_uuid7(),
        pack_id=pack.id,
        version=2,
        status=PackVersionStatus.VERIFIED.value,
    )
    session.add_all([v1, v2])
    await session.flush()

    # v1 rules: rule_keep (unchanged), rule_change (changed), rule_remove (to be removed)
    session.add_all(
        [
            LegalRule(
                id=generate_uuid7(),
                rule_key="rule_keep",
                domain=pack.domain,
                title_az="Keep",
                parameters={"val": 10},
                status=RuleStatus.VERIFIED.value,
                effective_from=datetime(2026, 1, 1, tzinfo=UTC),
                pack_version_id=v1.id,
            ),
            LegalRule(
                id=generate_uuid7(),
                rule_key="rule_change",
                domain=pack.domain,
                title_az="Change",
                parameters={"val": 100},
                status=RuleStatus.VERIFIED.value,
                effective_from=datetime(2026, 1, 1, tzinfo=UTC),
                pack_version_id=v1.id,
            ),
            LegalRule(
                id=generate_uuid7(),
                rule_key="rule_remove",
                domain=pack.domain,
                title_az="Remove",
                parameters={"val": 999},
                status=RuleStatus.VERIFIED.value,
                effective_from=datetime(2026, 1, 1, tzinfo=UTC),
                pack_version_id=v1.id,
            ),
        ]
    )

    # v2 rules: rule_keep, rule_change (val=200), rule_new (added)
    session.add_all(
        [
            LegalRule(
                id=generate_uuid7(),
                rule_key="rule_keep",
                domain=pack.domain,
                title_az="Keep",
                parameters={"val": 10},
                status=RuleStatus.VERIFIED.value,
                effective_from=datetime(2026, 1, 1, tzinfo=UTC),
                pack_version_id=v2.id,
            ),
            LegalRule(
                id=generate_uuid7(),
                rule_key="rule_change",
                domain=pack.domain,
                title_az="Change",
                parameters={"val": 200},
                status=RuleStatus.VERIFIED.value,
                effective_from=datetime(2026, 1, 1, tzinfo=UTC),
                pack_version_id=v2.id,
            ),
            LegalRule(
                id=generate_uuid7(),
                rule_key="rule_new",
                domain=pack.domain,
                title_az="New",
                parameters={"val": 55},
                status=RuleStatus.VERIFIED.value,
                effective_from=datetime(2026, 1, 1, tzinfo=UTC),
                pack_version_id=v2.id,
            ),
        ]
    )
    await session.flush()

    diff = await svc.diff_versions(session, admin, v1.id, v2.id)
    assert len(diff.added) == 1
    assert diff.added[0]["rule_key"] == "rule_new"
    assert len(diff.removed) == 1
    assert diff.removed[0]["rule_key"] == "rule_remove"
    assert len(diff.changed) == 1
    assert diff.changed[0]["rule_key"] == "rule_change"
    assert diff.changed[0]["before"]["parameters"]["val"] == 100
    assert diff.changed[0]["after"]["parameters"]["val"] == 200


@pytest.mark.asyncio
async def test_rule_snapshot_reproducibility(session: AsyncSession) -> None:
    """Tarixi sənədlərin bərpası üçün qayda snapshotu və hash yoxlanışı."""
    svc = ComplianceService()
    r1_id = generate_uuid7()
    r2_id = generate_uuid7()
    r1 = LegalRule(
        id=r1_id,
        rule_key="vat.standard_rate",
        domain="tax_vat",
        title_az="ƏDV",
        parameters={"rate": 0.18},
        status=RuleStatus.VERIFIED.value,
        version=1,
        effective_from=datetime(2026, 1, 1, tzinfo=UTC),
    )
    r2 = LegalRule(
        id=r2_id,
        rule_key="fiscal.mandatory_fields",
        domain="fiscal_receipt",
        title_az="Fiskal sahələr",
        parameters={"fields": ["voen", "total"]},
        status=RuleStatus.VERIFIED.value,
        version=1,
        effective_from=datetime(2026, 1, 1, tzinfo=UTC),
    )
    session.add_all([r1, r2])
    await session.flush()

    snapshot = await svc.build_rule_snapshot(session, [r1_id, r2_id])
    assert len(snapshot.rules) == 2
    assert snapshot.snapshot_hash is not None

    # Təkrar çağırıldıqda eyni hash əldə edilməlidir
    snapshot2 = await svc.build_rule_snapshot(session, [r1_id, r2_id])
    assert snapshot.snapshot_hash == snapshot2.snapshot_hash


def test_production_feature_gate_rules(monkeypatch: pytest.MonkeyPatch) -> None:
    """Feature gate qaydaları: İstehsalatda UNVERIFIED bloklamalı, qeyri-istehsalatda bannerlə icazə verilməlidir."""
    # 1. Non-prod: UNVERIFIED icazəlidir, lakin banner göstərilməlidir
    monkeypatch.setattr(settings, "APP_ENV", "testing")
    statuses_non_prod = {
        ComplianceDomain.TAX_VAT.value: DomainComplianceStatus.ACTIVE_UNVERIFIED,
    }
    res_non_prod = enforce_feature_gate("tax_calculation", statuses_non_prod)
    assert res_non_prod.allowed is True
    assert res_non_prod.banner is not None
    assert res_non_prod.banner["show"] is True

    # 2. Prod: UNVERIFIED bloklamalıdır (COMPLIANCE_RULES_NOT_VERIFIED)
    monkeypatch.setattr(settings, "APP_ENV", "production")
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        enforce_feature_gate("tax_calculation", statuses_non_prod, raise_on_block=True)
    assert exc_info.value.code == "COMPLIANCE_RULES_NOT_VERIFIED"
    details_dict = exc_info.value.details[0] if isinstance(exc_info.value.details, list) else exc_info.value.details
    assert ComplianceDomain.TAX_VAT.value in details_dict["missing_domains"]

    # 3. DISPUTED həm prod, həm non-prod bloklamalıdır
    monkeypatch.setattr(settings, "APP_ENV", "testing")
    statuses_disputed = {
        ComplianceDomain.PAYROLL_TAX.value: DomainComplianceStatus.DISPUTED,
        ComplianceDomain.PAYROLL_SOCIAL.value: DomainComplianceStatus.ACTIVE_VERIFIED,
    }
    with pytest.raises(BusinessRuleViolationError) as exc_info_disp:
        enforce_feature_gate("payroll_finalization", statuses_disputed, raise_on_block=True)
    assert exc_info_disp.value.code == "COMPLIANCE_RULES_DISPUTED"

    # 4. MISSING istehsalatda bloklamalıdır (COMPLIANCE_RULES_NOT_VERIFIED)
    monkeypatch.setattr(settings, "APP_ENV", "production")
    statuses_missing = {
        ComplianceDomain.FISCAL_RECEIPT.value: DomainComplianceStatus.MISSING,
    }
    with pytest.raises(BusinessRuleViolationError) as exc_info_miss:
        enforce_feature_gate("fiscal_receipts", statuses_missing, raise_on_block=True)
    assert exc_info_miss.value.code == "COMPLIANCE_RULES_NOT_VERIFIED"
    miss_details = exc_info_miss.value.details[0] if isinstance(exc_info_miss.value.details, list) else exc_info_miss.value.details
    assert ComplianceDomain.FISCAL_RECEIPT.value in miss_details["missing_domains"]

    # Qeyri-istehsalatda isə MISSING banner ilə icazə verir
    monkeypatch.setattr(settings, "APP_ENV", "testing")
    res_missing_non_prod = enforce_feature_gate("fiscal_receipts", statuses_missing)
    assert res_missing_non_prod.allowed is True
    assert res_missing_non_prod.banner is not None
    assert ComplianceDomain.FISCAL_RECEIPT.value in res_missing_non_prod.banner["missing_domains"]

    # 5. VERIFIED tam icazə verir
    monkeypatch.setattr(settings, "APP_ENV", "production")
    statuses_verified = {
        ComplianceDomain.TAX_VAT.value: DomainComplianceStatus.ACTIVE_VERIFIED,
    }
    res_ok = enforce_feature_gate("tax_calculation", statuses_verified)
    assert res_ok.allowed is True
    assert res_ok.banner is None
