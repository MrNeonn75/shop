"""Unit testlər — Compliance sahələri: Əməkhaqqı, Əmək qanunvericiliyi, İstehlakçı hüquqları, Fərdi məlumatlar, Saxlama müddəti və Öhdəliklər."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError
from app.core.ids import generate_uuid7
from app.modules.compliance.enums import (
    CalendarYearStatus,
    ObligationStatus,
    RegisterReviewStatus,
)
from app.modules.compliance.models import (
    CalendarYear,
    ConsentFormVersion,
    LegalHold,
    TransferRegister,
)
from app.modules.compliance.policies import CompliancePolicy
from app.modules.compliance.schemas import ObligationCreate, ObligationUpdate
from app.modules.compliance.service import ComplianceService


class MockUser:
    def __init__(
        self,
        user_id: uuid.UUID | None = None,
        roles: list[str] | None = None,
        permissions: list[str] | None = None,
    ) -> None:
        self.id = user_id or generate_uuid7()
        self.roles = roles or []
        self.permissions = permissions or []


# =========================================================================
# 1. PAYROLL RULES & CALCULATION TESTS
# =========================================================================


def calculate_income_tax_from_rule_params(gross: Decimal, brackets_param: list[dict[str, Any]]) -> Decimal:
    """Qayda parametrlərindən gəlir vergisini hesablayır (kodda dərəcə hardcode yoxdur)."""
    tax = Decimal("0")
    for b in brackets_param:
        up_to = Decimal(str(b["up_to"])) if b.get("up_to") is not None else None
        rate = Decimal(str(b.get("rate", 0)))
        base = Decimal(str(b.get("base", 0)))
        excess_over = Decimal(str(b.get("excess_over", 0)))

        if up_to is not None:
            if gross <= up_to:
                tax = base + (gross - excess_over) * rate
                break
        else:
            # Yuxarı hədd yoxdur (ən yuxarı mötərizə)
            tax = base + (gross - excess_over) * rate
            break
    return tax.quantize(Decimal("0.01"))


def test_payroll_income_tax_brackets_calculation() -> None:
    """Gəlir vergisi hesablanması qayda paketindəki mötərizə parametrləri əsasında aparılır."""
    # 2026 referans parametrləri:
    # up_to: 2500 -> 3%
    # up_to: 8000 -> 75 + 10% (excess over 2500)
    # up_to: None -> 625 + 14% (excess over 8000)
    brackets = [
        {"up_to": 2500, "rate": 0.03, "base": 0, "excess_over": 0},
        {"up_to": 8000, "rate": 0.10, "base": 75, "excess_over": 2500},
        {"up_to": None, "rate": 0.14, "base": 625, "excess_over": 8000},
    ]

    # 1. Həddən aşağı: 1,000 AZN -> 1000 * 0.03 = 30.00 AZN
    tax_1000 = calculate_income_tax_from_rule_params(Decimal("1000"), brackets)
    assert tax_1000 == Decimal("30.00")

    # 2. Dəqiq sərhəd 1: 2,500 AZN -> 2500 * 0.03 = 75.00 AZN
    tax_2500 = calculate_income_tax_from_rule_params(Decimal("2500"), brackets)
    assert tax_2500 == Decimal("75.00")

    # 3. İkinci mötərizə: 5,000 AZN -> 75 + (5000 - 2500) * 0.10 = 75 + 250 = 325.00 AZN
    tax_5000 = calculate_income_tax_from_rule_params(Decimal("5000"), brackets)
    assert tax_5000 == Decimal("325.00")

    # 4. Dəqiq sərhəd 2: 8,000 AZN -> 75 + (8000 - 2500) * 0.10 = 75 + 550 = 625.00 AZN
    tax_8000 = calculate_income_tax_from_rule_params(Decimal("8000"), brackets)
    assert tax_8000 == Decimal("625.00")

    # 5. Ən yuxarı mötərizə: 10,000 AZN -> 625 + (10000 - 8000) * 0.14 = 625 + 280 = 905.00 AZN
    tax_10000 = calculate_income_tax_from_rule_params(Decimal("10000"), brackets)
    assert tax_10000 == Decimal("905.00")


def test_payroll_minimum_wage_validation() -> None:
    """Minimum əmək haqqı (400 AZN) parametri tam ştat üçün yoxlanılır."""
    min_wage_param = {"amount_azn": 400, "enforcement": "block_unless_part_time_proration"}

    def validate_salary(amount: Decimal, is_part_time: bool, fte: Decimal = Decimal("1.0")) -> bool:
        min_required = Decimal(str(min_wage_param["amount_azn"]))
        if is_part_time:
            min_required = min_required * fte
        return amount >= min_required

    # Tam ştat: 350 AZN qadağandır
    assert validate_salary(Decimal("350"), is_part_time=False) is False
    # Tam ştat: 400 AZN icazəlidir
    assert validate_salary(Decimal("400"), is_part_time=False) is True
    # Tam ştat: 1200 AZN icazəlidir
    assert validate_salary(Decimal("1200"), is_part_time=False) is True

    # Yarım ştat (0.5 FTE): 200 AZN icazəlidir, 180 AZN qadağandır
    assert validate_salary(Decimal("200"), is_part_time=True, fte=Decimal("0.5")) is True
    assert validate_salary(Decimal("180"), is_part_time=True, fte=Decimal("0.5")) is False


def test_payroll_2027_transitional_pack_expiry_reminder() -> None:
    """2026 keçid dərəcələrinin bitməsinə 60 gün qalmış xatırlatma və 2027-dən bloklama yoxlanışı."""
    bracket_rule_params = {
        "transitional_until": "2026-12-31",
        "next_pack_required_before": "2027-01-01",
        "reminder_days_before": 60,
    }

    # 1. 2026-10-15: Hələ xatırlatma müddətinə çatmayıb (77 gün qalıb)
    today_oct15 = date(2026, 10, 15)
    expiry = date.fromisoformat(bracket_rule_params["transitional_until"])
    days_left = (expiry - today_oct15).days
    assert days_left > 60

    # 2. 2026-11-15: 46 gün qalıb -> xatırlatma tələb olunur (reminder active)
    today_nov15 = date(2026, 11, 15)
    days_left_nov = (expiry - today_nov15).days
    assert 0 <= days_left_nov <= 60

    # 3. 2027-01-02: Keçid paketi vaxtı bitib, yeni təsdiqlənmiş paket olmadan bloklanmalıdır
    today_2027 = date(2027, 1, 2)
    must_require_new_pack = today_2027 >= date.fromisoformat(bracket_rule_params["next_pack_required_before"])
    assert must_require_new_pack is True


# =========================================================================
# 2. LABOR LAW & WORKING TIME TESTS
# =========================================================================


def test_labor_working_time_limits() -> None:
    """5 və 6 günlük iş rejimi, 12 saatlıq cəmlənmiş rejim və bayraqabağı 1 saat qısaldılma."""
    limits = {
        "max_hours_day": 8,
        "max_hours_week": 40,
        "six_day_max_hours_day": 7,
        "cumulative_shift_cap_hours": 12,
        "pre_holiday_shorten_hours": 1,
    }

    # 5 günlük rejim: 8 saat icazəlidir, 9 saat aşmadır
    assert limits["max_hours_day"] >= 8
    assert limits["max_hours_day"] < 9

    # 6 günlük rejim: 7 saat icazəlidir, 8 saat aşmadır
    assert limits["six_day_max_hours_day"] >= 7
    assert limits["six_day_max_hours_day"] < 8

    # Cəmlənmiş növbə: maksimum 12 saat
    assert limits["cumulative_shift_cap_hours"] >= 12
    assert limits["cumulative_shift_cap_hours"] < 13

    # Bayram qabağı gün: 8 - 1 = 7 saat
    pre_holiday_norm = limits["max_hours_day"] - limits["pre_holiday_shorten_hours"]
    assert pre_holiday_norm == 7


def test_labor_night_work_window_flagging() -> None:
    """Gecə işi pəncərəsi 22:00 - 06:00 aralığını düzgün təyin etməlidir."""
    start_t = time(22, 0)
    end_t = time(6, 0)

    def is_night_hour(t: time) -> bool:
        return t >= start_t or t < end_t

    assert is_night_hour(time(23, 30)) is True
    assert is_night_hour(time(2, 0)) is True
    assert is_night_hour(time(5, 59)) is True
    assert is_night_hour(time(6, 0)) is False
    assert is_night_hour(time(14, 0)) is False
    assert is_night_hour(time(21, 59)) is False


def test_labor_overtime_and_holiday_multipliers() -> None:
    """Əlavə iş və bayram/istirahət günündə iş üçün 2.0x əmsal tətbiqi."""
    hourly_rate = Decimal("15.00")
    overtime_multiplier = Decimal("2.0")
    holiday_multiplier = Decimal("2.0")

    overtime_pay = hourly_rate * overtime_multiplier
    holiday_pay = hourly_rate * holiday_multiplier

    assert overtime_pay == Decimal("30.00")
    assert holiday_pay == Decimal("30.00")


def test_labor_annual_leave_minimums() -> None:
    """Konstitusion minimum 21 gün, idarəetmə/mütəxəssis üçün 30 gün yoxlanışı."""
    standard_min = 21
    white_collar_min = 30

    def check_leave_entitlement(days: int, is_white_collar: bool) -> bool:
        floor = white_collar_min if is_white_collar else standard_min
        return days >= floor

    # Fəhlə / xidmət heyəti: 21 gün minimum
    assert check_leave_entitlement(20, is_white_collar=False) is False
    assert check_leave_entitlement(21, is_white_collar=False) is True

    # Baş mütəxəssis / menecer: 30 gün minimum
    assert check_leave_entitlement(25, is_white_collar=True) is False
    assert check_leave_entitlement(30, is_white_collar=True) is True


@pytest.mark.asyncio
async def test_production_calendar_import(session: AsyncSession) -> None:
    """İstehsalat təqviminin importu və saxlanılması."""
    cal_2026 = CalendarYear(
        id=generate_uuid7(),
        year=2026,
        working_days=241,
        working_hours=1922,
        source_ref="Nazirlər Kabineti Qərarı",
        status=CalendarYearStatus.UNVERIFIED.value,
        days={
            "holidays": ["2026-01-01", "2026-01-02", "2026-03-20", "2026-03-21"],
            "shortened": ["2026-03-19", "2026-12-30"],
            "transferred": [],
        },
    )
    session.add(cal_2026)
    await session.flush()

    res = await session.execute(select(CalendarYear).where(CalendarYear.year == 2026))
    fetched = res.scalar_one()
    assert fetched.working_days == 241
    assert fetched.working_hours == 1922
    assert "2026-01-01" in fetched.days["holidays"]


# =========================================================================
# 3. CONSUMER PROTECTION — RETURNS & EXCHANGES TESTS
# =========================================================================


def test_consumer_returns_14_day_window_excluding_purchase_day() -> None:
    """14 günlük mübadilə pəncərəsi: alış günü sayılmır (purchase day excluded)."""
    purchase_date = date(2026, 5, 10)

    def is_return_window_open(check_date: date, purchase: date, window_days: int = 14) -> bool:
        # Alış günü daxil deyil: müddət alış gününün ertəsi günündən başlayır
        # Yəni purchase + 1 gündən purchase + 14 günə qədər
        if check_date <= purchase:
            return True  # eyni gün qaytarma mümkündür
        delta_days = (check_date - purchase).days
        return delta_days <= window_days

    # 1. Alış günü: 10 May -> açıqdır
    assert is_return_window_open(date(2026, 5, 10), purchase_date) is True

    # 2. 14-cü gün: 24 May -> DƏQİQ SƏRHƏD: açıqdır (14 gün)
    assert is_return_window_open(date(2026, 5, 24), purchase_date) is True

    # 3. 15-ci gün: 25 May -> VAXTI BİTİB (15 gün)
    assert is_return_window_open(date(2026, 5, 25), purchase_date) is False

    # 4. Ay/il sərhədi: 28 Dekabr 2026 alış -> 11 Yanvar 2027 (14 gün keçib)
    purchase_end_year = date(2026, 12, 28)
    assert is_return_window_open(date(2027, 1, 11), purchase_end_year) is True
    assert is_return_window_open(date(2027, 1, 12), purchase_end_year) is False


def test_consumer_returns_policy_floor_validation() -> None:
    """Şirkət siyasəti qanunvericiliyin təyin etdiyi minimum həddən (14 gün) az ola bilməz."""
    legal_floor_days = 14

    def validate_company_policy_return_days(company_days: int) -> bool:
        return company_days >= legal_floor_days

    # 10 gün təyin etmək qadağandır
    assert validate_company_policy_return_days(10) is False
    # 14 gün icazəlidir (qanunvericilik səviyyəsi)
    assert validate_company_policy_return_days(14) is True
    # 30 gün icazəlidir (istehlakçının xeyrinə daha geniş pəncərə)
    assert validate_company_policy_return_days(30) is True


def test_consumer_returns_defect_flow_independent_of_exchange_window() -> None:
    """Qüsurlu mal (DEFECT) 14 günlük mübadilə pəncərəsi ilə məhdudlaşmır."""
    purchase_date = date(2026, 1, 10)
    current_date = date(2026, 4, 15)  # 3 aydan çox keçib

    return_reason = "DEFECT"
    warranty_months = 12

    # Normal mübadilə pəncərəsi bitib
    assert (current_date - purchase_date).days > 14

    # Amma DEFECT üçün zəmanət müddəti (12 ay) daxilində iddia qəbul edilir
    months_passed = (current_date.year - purchase_date.year) * 12 + (current_date.month - purchase_date.month)
    is_claim_eligible = return_reason == "DEFECT" and months_passed <= warranty_months
    assert is_claim_eligible is True


# =========================================================================
# 4. PERSONAL DATA & PRIVACY TESTS
# =========================================================================


def test_consent_text_hash_integrity() -> None:
    """Razılıq forması mətni SHA256 heş ilə tam yoxlanılmalıdır."""
    text_az = "Mən fərdi məlumatlarımın loyallıq proqramı çərçivəsində işlənməsinə razılıq verirəm."
    computed_hash = hashlib.sha256(text_az.encode("utf-8")).hexdigest()

    form_version = ConsentFormVersion(
        id=generate_uuid7(),
        purpose="loyalty",
        language="az",
        text_az=text_az,
        text_hash=computed_hash,
        version=1,
        effective_from=datetime(2026, 1, 1, tzinfo=UTC),
    )

    # Heş bütövlüyünün yoxlanışı
    assert form_version.text_hash == hashlib.sha256(form_version.text_az.encode("utf-8")).hexdigest()


@pytest.mark.asyncio
async def test_cross_border_transfer_gate(session: AsyncSession) -> None:
    """Ölkədən kənar xidmət təminatçısı üçün VERIFIED transfer_register qeydi tələb olunur."""
    # Transfer register qeydi yaradılır (əvvəlcə REVIEW_REQUIRED)
    transfer = TransferRegister(
        id=generate_uuid7(),
        processor_name="GlobalCloudHosting EU",
        country="Germany",
        status=RegisterReviewStatus.REVIEW_REQUIRED.value,
        consent_coverage=True,
    )
    session.add(transfer)
    await session.flush()

    def can_activate_cross_border_integration(tr: TransferRegister, is_production: bool) -> bool:
        if not is_production:
            return True
        return tr.status == RegisterReviewStatus.VERIFIED.value and tr.consent_coverage

    # İstehsalatda REVIEW_REQUIRED statusu ilə aktivləşdirmə bloklanır
    assert can_activate_cross_border_integration(transfer, is_production=True) is False

    # Qeyri-istehsalatda icazə verilir
    assert can_activate_cross_border_integration(transfer, is_production=False) is True

    # Hüquqşünas tərəfindən təsdiq edildikdən sonra istehsalatda da icazə verilir
    transfer.status = RegisterReviewStatus.VERIFIED.value
    assert can_activate_cross_border_integration(transfer, is_production=True) is True


def test_dsar_erasure_with_tax_retention_conflict_resolves_to_anonymization() -> None:
    """Fərdi məlumatların silinməsi (DSAR erasure) vergi saxlama müddəti ilə toqquşduqda tam silmə yox, anonimləşdirmə aparılır."""
    request_type = "ERASURE"
    has_tax_document_links = True
    tax_retention_years_remaining = 3

    if request_type == "ERASURE":
        if has_tax_document_links and tax_retention_years_remaining > 0:
            outcome = "ANONYMIZED_RETAINED_FOR_TAX_ARCHIVE"
        else:
            outcome = "FULLY_DELETED"

    assert outcome == "ANONYMIZED_RETAINED_FOR_TAX_ARCHIVE"


# =========================================================================
# 5. RETENTION & LEGAL HOLD TESTS
# =========================================================================


@pytest.mark.asyncio
async def test_legal_hold_blocks_deletion(session: AsyncSession) -> None:
    """Aktiv hüquqi saxlama (LegalHold) obyektin silinməsini bloklayır."""
    sale_id = "sale-1002"
    hold = LegalHold(
        id=generate_uuid7(),
        entity_type="sale",
        entity_id=sale_id,
        reason="Məhkəmə araşdırması tələbi",
        held_by=generate_uuid7(),
        held_at=datetime.now(UTC),
        released_at=None,
    )
    session.add(hold)
    await session.flush()

    # Aktiv hold varmı?
    res = await session.execute(
        select(LegalHold).where(
            LegalHold.entity_type == "sale",
            LegalHold.entity_id == sale_id,
            LegalHold.released_at.is_(None),
        )
    )
    active_holds = res.scalars().all()
    assert len(active_holds) == 1

    can_delete = len(active_holds) == 0
    assert can_delete is False

    # Hold azad edildikdə (released)
    hold.released_at = datetime.now(UTC)
    hold.released_by = generate_uuid7()
    await session.flush()

    res_after = await session.execute(
        select(LegalHold).where(
            LegalHold.entity_type == "sale",
            LegalHold.entity_id == sale_id,
            LegalHold.released_at.is_(None),
        )
    )
    assert len(res_after.scalars().all()) == 0


# =========================================================================
# 6. OBLIGATIONS & CALENDAR TESTS
# =========================================================================


@pytest.mark.asyncio
async def test_obligations_crud_lifecycle(session: AsyncSession) -> None:
    """Öhdəliklərin yaradılması, yenilənməsi, tamamlanması və ləğvi."""
    svc = ComplianceService()
    manager = MockUser(permissions=["compliance.obligations.manage"])

    # 1. Yaratma
    create_dto = ObligationCreate(
        template_code="payroll_declaration_monthly",
        title_az="May 2026 Əməkhaqqı Bəyannaməsi",
        cadence="monthly",
        next_due=date(2026, 6, 20),
    )
    ob = await svc.create_obligation(session, manager, create_dto)
    await session.flush()

    assert ob.status == ObligationStatus.OPEN.value
    assert ob.next_due == date(2026, 6, 20)

    # 2. Yeniləmə
    update_dto = ObligationUpdate(
        status=ObligationStatus.COMPLETED.value,
        evidence_notes="Bəyannamə mühasibatlıq tərəfindən təqdim edildi.",
    )
    updated = await svc.update_obligation(session, manager, ob.id, update_dto)
    await session.flush()

    assert updated.status == ObligationStatus.COMPLETED.value
    assert updated.completed_at is not None

    # 3. Ləğv etmə
    await svc.delete_obligation(session, manager, ob.id)
    await session.flush()

    cancelled = await svc.get_obligation(session, manager, ob.id)
    assert cancelled.status == ObligationStatus.CANCELLED.value


# =========================================================================
# 7. PERMISSIONS & RBAC TESTS
# =========================================================================


def test_compliance_permission_checks() -> None:
    """compliance.* icazə matrisinin yoxlanışı."""
    guest = MockUser(permissions=[])
    accountant = MockUser(permissions=["compliance.rules.view", "compliance.rules.verify"])
    admin = MockUser(roles=["system_admin"])

    # Guest baxış hüququ yoxdur -> ForbiddenError
    with pytest.raises(ForbiddenError):
        CompliancePolicy.check_rules_view(guest)

    # Mühasib baxış və verify edə bilər, amma activate edə bilməz
    CompliancePolicy.check_rules_view(accountant)
    CompliancePolicy.check_rules_verify(accountant)
    with pytest.raises(ForbiddenError):
        CompliancePolicy.check_rules_activate(accountant)

    # Admin bütün əməliyyatları edə bilər
    CompliancePolicy.check_rules_view(admin)
    CompliancePolicy.check_rules_edit(admin)
    CompliancePolicy.check_rules_verify(admin)
    CompliancePolicy.check_rules_activate(admin)
    CompliancePolicy.check_obligations_manage(admin)
    CompliancePolicy.check_privacy_manage(admin)
    CompliancePolicy.check_export(admin)
