"""REFERENCE rule-pack seeds — ALL UNVERIFIED, secondary sources.

NON-NEGOTIABLE: These values are NOT legal advice and do NOT claim compliance.
They exist so accountants/lawyers can review, verify, or replace them.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.modules.compliance.enums import (
    ComplianceDomain,
    PackStatus,
    PackVersionStatus,
    RegisterReviewStatus,
    RuleStatus,
    SourceType,
)
from app.modules.compliance.models import (
    DataProcessingRegister,
    LegalRule,
    ObligationTemplate,
    RetentionRule,
    RulePack,
    RulePackVersion,
)

# Effective from: start of 2026 Asia/Baku = 2025-12-31 20:00:00 UTC
_EFFECTIVE_FROM = datetime(2025, 12, 31, 20, 0, 0, tzinfo=UTC)

_SECONDARY_PLACEHOLDER = "https://example.invalid/secondary-source-placeholder"
_DISCLAIMER_NOTE = (
    "UNVERIFIED REFERENCE from secondary sources. "
    "Must be verified by accountant/lawyer against official legal portal before production use. "
    "System does NOT claim legal compliance."
)


def _ref(act_name: str, number: str | None = None, article: str | None = None) -> dict[str, Any]:
    return {"act_name": act_name, "number": number, "article": article}


def _rule_spec(
    rule_key: str,
    title_az: str,
    parameters: dict[str, Any],
    *,
    legal_reference: dict[str, Any] | None = None,
    status: str = RuleStatus.UNVERIFIED.value,
    notes: str | None = None,
    parameters_schema: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "rule_key": rule_key,
        "title_az": title_az,
        "parameters": parameters,
        "parameters_schema": parameters_schema,
        "legal_reference": legal_reference,
        "status": status,
        "notes": notes or _DISCLAIMER_NOTE,
        "source_url": _SECONDARY_PLACEHOLDER,
        "source_type": SourceType.SECONDARY.value,
    }


# Domain → pack metadata + rule specs
REFERENCE_PACKS: list[dict[str, Any]] = [
    {
        "domain": ComplianceDomain.TAX_VAT.value,
        "code": "tax_vat_az_2026_ref",
        "title_az": "ƏDV və dövriyyə monitorinqi (referans 2026)",
        "description": "UNVERIFIED secondary reference — Tax Code art. 173 / 155.1-1",
        "sector": None,
        "rules": [
            _rule_spec(
                "vat.standard_rate",
                "ƏDV standart dərəcə",
                {
                    "rate": 0.18,
                    "price_mode": "VAT_INCLUSIVE",
                    "split_formula": "vat = gross * rate / (1 + rate)",
                },
                legal_reference=_ref("Vergi Məcəlləsi", article="173"),
            ),
            _rule_spec(
                "vat.tax_classes",
                "Vergi sinifləri",
                {
                    "STANDARD": {"rate": 0.18},
                    "EXEMPT": {"rate": 0.0},
                    "ZERO": {"rate": 0.0},
                    "SIMPLIFIED_TAX_PAYER": {"regime_flag": True},
                },
                legal_reference=_ref("Vergi Məcəlləsi"),
            ),
            _rule_spec(
                "vat.turnover_threshold",
                "ƏDV qeydiyyat dövriyyə həddi",
                {
                    "annual_turnover_azn": 200000,
                    "cashless_unregistered_coefficient": 0.5,
                    "alert_percents": [80, 95, 100],
                    "indicative_only": True,
                },
                legal_reference=_ref("Vergi Məcəlləsi", article="155.1-1"),
            ),
        ],
    },
    {
        "domain": ComplianceDomain.FISCAL_RECEIPT.value,
        "code": "fiscal_receipt_az_2026_ref",
        "title_az": "E-kassa / fiskal qəbz məzmunu (referans)",
        "description": "UNVERIFIED mandatory receipt elements — verify against STS rules",
        "sector": None,
        "rules": [
            _rule_spec(
                "fiscal.mandatory_receipt_fields",
                "Fiskal qəbzin məcburi elementləri",
                {
                    "fields": [
                        "taxpayer_name",
                        "voen",
                        "datetime",
                        "outlet_name",
                        "tax_office_registration_code",
                        "address",
                        "line_item_name",
                        "unit",
                        "quantity",
                        "unit_price",
                        "line_total",
                        "vat_rate_or_simplified_rate",
                        "vat_amount",
                        "receipt_number_in_shift",
                        "cash_register_make",
                        "cash_register_serial",
                        "fiscal_mode_mark",
                        "qr_code",
                        "amount_paid",
                        "advance_amount",
                        "change_returned",
                        "outstanding_amount",
                        "payment_form",
                        "receipt_type",
                        "control_mechanism_registration_no",
                    ]
                },
                legal_reference=_ref("Vergi Məcəlləsi", article="16.1.8"),
            ),
        ],
    },
    {
        "domain": ComplianceDomain.PAYROLL_TAX.value,
        "code": "payroll_tax_az_private_2026_ref",
        "title_az": "Fərdi gəlir vergisi — özəl qeyri-neft (referans 2026)",
        "description": "UNVERIFIED transitional 2026 schedule; do NOT seed 2027+",
        "sector": "private_non_oil",
        "rules": [
            _rule_spec(
                "payroll.minimum_wage",
                "Minimum aylıq əmək haqqı",
                {"amount_azn": 400, "enforcement": "block_unless_part_time_proration"},
                legal_reference=_ref("Minimum əmək haqqı — secondary"),
            ),
            _rule_spec(
                "payroll.income_tax.brackets_2026",
                "Gəlir vergisi mötərizələri (keçid 2026)",
                {
                    "brackets": [
                        {"up_to": 2500, "rate": 0.03, "base": 0},
                        {
                            "up_to": 8000,
                            "rate": 0.10,
                            "base": 75,
                            "excess_over": 2500,
                        },
                        {
                            "up_to": None,
                            "rate": 0.14,
                            "base": 625,
                            "excess_over": 8000,
                        },
                    ],
                    "transitional_until": "2026-12-31",
                    "next_pack_required_before": "2027-01-01",
                    "reminder_days_before": 60,
                },
                legal_reference=_ref("Vergi Məcəlləsi — transitional PIT"),
            ),
        ],
    },
    {
        "domain": ComplianceDomain.PAYROLL_SOCIAL.value,
        "code": "payroll_social_az_private_2026_ref",
        "title_az": "DSMF / işsizlik / icbari tibbi sığorta (referans)",
        "description": "UNVERIFIED; employer DSMF and medical threshold marked DISPUTED",
        "sector": "private_non_oil",
        "rules": [
            _rule_spec(
                "payroll.dsmf.employee",
                "DSMF işçi töhfəsi",
                {
                    "brackets": [
                        {"up_to": 200, "rate": 0.03},
                        {"up_to": None, "fixed": 6, "rate_above": 0.10, "excess_over": 200},
                    ]
                },
                legal_reference=_ref("DSMF / SSPF — secondary"),
            ),
            _rule_spec(
                "payroll.dsmf.employer",
                "DSMF işəgötürən töhfəsi — DISPUTED",
                {
                    "sources_conflict": True,
                    "variants": [
                        {
                            "label": "variant_a_22pct_then_15",
                            "brackets": [
                                {"up_to": 200, "rate": 0.22},
                                {"up_to": None, "rate": 0.15, "excess_over": 200},
                            ],
                            "reduced_above_8000_rate": 0.11,
                        },
                        {
                            "label": "variant_b_flat_44_on_first_200",
                            "note": "Some sources show 44 on first 200",
                        },
                        {
                            "label": "variant_c_2_15_structure",
                            "note": "Some sources show 2%/15% structure",
                        },
                    ],
                    "no_default_activated": True,
                },
                status=RuleStatus.DISPUTED.value,
                legal_reference=_ref("DSMF / SSPF — conflicting secondary sources"),
                notes=(
                    "DISPUTED: employer contribution structure conflicts across secondary sources. "
                    "System picks neither until verifier resolves. " + _DISCLAIMER_NOTE
                ),
            ),
            _rule_spec(
                "payroll.unemployment",
                "İşsizlik sığortası",
                {"employee_rate": 0.005, "employer_rate": 0.005},
                legal_reference=_ref("İşsizlik sığortası — secondary"),
            ),
            _rule_spec(
                "payroll.medical_insurance",
                "İcbari tibbi sığorta — DISPUTED threshold",
                {
                    "employee_rate_below": 0.02,
                    "employer_rate_below": 0.02,
                    "employee_rate_above": 0.005,
                    "employer_rate_above": 0.005,
                    "threshold_variants_azn": [2500, 8000],
                    "sources_conflict": True,
                    "no_default_activated": True,
                },
                status=RuleStatus.DISPUTED.value,
                legal_reference=_ref("İcbari tibbi sığorta — conflicting secondary"),
                notes=(
                    "DISPUTED: medical threshold reported as 2500 by some sources and 8000 by others. "
                    "No default activated. " + _DISCLAIMER_NOTE
                ),
            ),
        ],
    },
    {
        "domain": ComplianceDomain.LABOR_TIME.value,
        "code": "labor_time_az_2026_ref",
        "title_az": "İş vaxtı, əlavə iş, gecə (referans)",
        "description": "UNVERIFIED Labor Code amendments 16 Jan 2026 — verify articles",
        "sector": "private_non_oil",
        "rules": [
            _rule_spec(
                "labor.normal_working_time",
                "Normal iş vaxtı",
                {
                    "max_hours_day": 8,
                    "max_hours_week": 40,
                    "six_day_max_hours_day": 7,
                    "cumulative_shift_cap_hours": 12,
                    "pre_holiday_shorten_hours": 1,
                },
                legal_reference=_ref("Əmək Məcəlləsi"),
            ),
            _rule_spec(
                "labor.night_work",
                "Gecə işi pəncərəsi",
                {"start": "22:00", "end": "06:00", "supplement_rate": None},
                legal_reference=_ref("Əmək Məcəlləsi"),
            ),
            _rule_spec(
                "labor.overtime",
                "Əlavə iş — DISPUTED limits",
                {
                    "min_multiplier": 2.0,
                    "limits_disputed": True,
                    "reference_limits_unverified": {
                        "max_hours_two_consecutive_days": 4,
                        "max_hours_year": 120,
                    },
                    "consent_required": True,
                    "enforcement": "warn",
                },
                status=RuleStatus.DISPUTED.value,
                legal_reference=_ref("Əmək Məcəlləsi", article="165"),
            ),
            _rule_spec(
                "labor.holiday_work_multiplier",
                "Bayram/istirahət günü ödəniş əmsalı",
                {"multiplier": 2.0},
                legal_reference=_ref("Əmək Məcəlləsi"),
            ),
            _rule_spec(
                "labor.salary_payment_frequency",
                "Əmək haqqı ödəniş tezliyi",
                {
                    "min_times_per_month": 2,
                    "max_interval_days": 16,
                    "enforcement": "warn",
                },
                legal_reference=_ref("Əmək Məcəlləsi — secondary"),
            ),
            _rule_spec(
                "labor.production_calendar_2026_hint",
                "2026 istehsalat təqvimi referans (import tələb olunur)",
                {
                    "working_days": 241,
                    "working_hours": 1922,
                    "week_type": "5-day-40h",
                    "must_import_official_calendar": True,
                },
                legal_reference=_ref("Nazirlər Kabineti — illik təqvim"),
            ),
        ],
    },
    {
        "domain": ComplianceDomain.LABOR_LEAVE.value,
        "code": "labor_leave_az_2026_ref",
        "title_az": "Məzuniyyət hüquqları (referans)",
        "description": "UNVERIFIED leave minima — white-collar 30d needs classification mapping",
        "sector": "private_non_oil",
        "rules": [
            _rule_spec(
                "labor.annual_leave.minimum",
                "İllik məzuniyyətin minimumu",
                {"calendar_days": 21},
                legal_reference=_ref("Əmək Məcəlləsi", article="114"),
            ),
            _rule_spec(
                "labor.annual_leave.white_collar_ref",
                "İdarəetmə/mütəxəssis məzuniyyəti (referans)",
                {
                    "calendar_days": 30,
                    "requires_job_category_mapping": True,
                    "unverified": True,
                },
                legal_reference=_ref("Əmək Məcəlləsi — secondary classification"),
            ),
        ],
    },
    {
        "domain": ComplianceDomain.CONSUMER_RETURNS.value,
        "code": "consumer_returns_az_ref",
        "title_az": "İstehlakçı qaytarma/mübadilə (referans)",
        "description": "UNVERIFIED Law No. 1113 — 14-day exchange window",
        "sector": None,
        "rules": [
            _rule_spec(
                "returns.exchange_window_days",
                "Mübadilə pəncərəsi (alış günü sayılmır)",
                {
                    "days": 14,
                    "exclude_purchase_day": True,
                    "count_calendar_days": True,
                    "unused_and_labels_required": True,
                    "proof_of_purchase_required": True,
                },
                legal_reference=_ref(
                    'İstehlakçıların hüquqlarının müdafiəsi haqqında',
                    number="1113",
                ),
            ),
            _rule_spec(
                "returns.default_returnability",
                "Kateqoriya üzrə default returnability",
                {
                    "footwear": "RETURNABLE",
                    "clothing": "RETURNABLE",
                    "non_returnable_list_source": "Cabinet Decision No. 114 — VERIFY",
                },
                legal_reference=_ref("Nazirlər Kabineti", number="114"),
            ),
        ],
    },
    {
        "domain": ComplianceDomain.PERSONAL_DATA.value,
        "code": "personal_data_az_ref",
        "title_az": "Şəxsi məlumatların qorunması (referans)",
        "description": "UNVERIFIED Law No. 998-IIIQ — registration authority VERIFY",
        "sector": None,
        "rules": [
            _rule_spec(
                "privacy.consent_required",
                "Yazılı razılıq tələbi (əsas qayda)",
                {
                    "written_consent_required_unless_exception": True,
                    "cross_border_requires_equivalent_or_consent": True,
                    "system_registration_generally_required": True,
                    "authority_unverified": True,
                },
                legal_reference=_ref(
                    "Şəxsi məlumatlar haqqında",
                    number="998-IIIQ",
                ),
            ),
        ],
    },
    {
        "domain": ComplianceDomain.RETENTION.value,
        "code": "retention_az_ref",
        "title_az": "Sənəd saxlama müddətləri (referans)",
        "description": "Tax archive 5yr UNVERIFIED; accounting-law MISSING",
        "sector": None,
        "rules": [
            _rule_spec(
                "retention.tax_archive_years",
                "Vergi arxivi saxlama müddəti",
                {"years": 5, "entity_types": ["fiscal_receipt", "sale", "tax_invoice_ref"]},
                legal_reference=_ref("Vergi Məcəlləsi — archive — secondary"),
            ),
            _rule_spec(
                "retention.accounting_law",
                "Mühasibat uçotu saxlama — MISSING",
                {
                    "status": "MISSING",
                    "must_be_provided_by_accountant": True,
                },
                legal_reference=_ref("Mühasibat uçotu qanunu — not yet researched"),
                notes="MISSING research — accountant must supply verified retention periods.",
            ),
        ],
    },
]


OBLIGATION_TEMPLATES: list[dict[str, str | None]] = [
    {
        "code": "payroll_declaration_monthly",
        "title_az": "Aylıq əməkhaqqı bəyannaməsi / töhfə ödənişləri",
        "default_cadence_hint": "monthly",
        "description": "Accountant sets due dates — no deadline asserted by system.",
    },
    {
        "code": "vat_return_payment",
        "title_az": "ƏDV bəyannaməsi / ödəniş (ƏDV ödəyicisi olduqda)",
        "default_cadence_hint": "monthly_or_quarterly",
        "description": "Only if company is VAT payer — cadence is DATA.",
    },
    {
        "code": "simplified_tax_return",
        "title_az": "Sadələşdirilmiş vergi bəyannaməsi",
        "default_cadence_hint": "as_applicable",
        "description": "If applicable to company regime.",
    },
    {
        "code": "annual_profit_income_tax",
        "title_az": "İllik mənfəət / gəlir vergisi bəyannaməsi",
        "default_cadence_hint": "annual",
        "description": None,
    },
    {
        "code": "ekassa_device_maintenance",
        "title_az": "E-kassa cihaz qeydiyyatı / texniki yoxlama",
        "default_cadence_hint": "periodic",
        "description": None,
    },
    {
        "code": "personal_data_registration_review",
        "title_az": "Şəxsi məlumat IS qeydiyyatının nəzərdən keçirilməsi",
        "default_cadence_hint": "annual",
        "description": None,
    },
    {
        "code": "rule_pack_review_quarterly",
        "title_az": "Qayda paketlərinin rüblük nəzərdən keçirilməsi",
        "default_cadence_hint": "quarterly",
        "description": None,
    },
    {
        "code": "transitional_rate_change_review",
        "title_az": "Keçid dərəcə dəyişiklikləri (məs. 1 Yan 2027 əvvəli)",
        "default_cadence_hint": "event_driven",
        "description": "Reminder before transitional PIT changes — dates are DATA.",
    },
    {
        "code": "minimum_wage_review",
        "title_az": "Minimum əmək haqqının nəzərdən keçirilməsi",
        "default_cadence_hint": "on_change",
        "description": None,
    },
    {
        "code": "production_calendar_import",
        "title_az": "İllik istehsalat təqviminin idxalı",
        "default_cadence_hint": "annual",
        "description": None,
    },
    {
        "code": "retention_review",
        "title_az": "Saxlama müddətlərinin nəzərdən keçirilməsi",
        "default_cadence_hint": "annual",
        "description": None,
    },
]


PROCESSING_REGISTER_SEEDS: list[dict[str, Any]] = [
    {
        "system_module": "crm",
        "data_categories": ["name", "phone", "optional_birth_date", "optional_gender"],
        "purpose": "Customer relationship and loyalty enrolment",
        "legal_basis": "consent",
        "subjects": ["customers"],
        "retention": "REVIEW_REQUIRED",
        "cross_border": False,
    },
    {
        "system_module": "loyalty",
        "data_categories": ["name", "phone", "points_balance"],
        "purpose": "Loyalty program",
        "legal_basis": "consent",
        "subjects": ["customers"],
        "retention": "REVIEW_REQUIRED",
        "cross_border": False,
    },
    {
        "system_module": "hr_payroll",
        "data_categories": ["employee_identity", "salary", "bank_details", "attendance"],
        "purpose": "Employment and payroll",
        "legal_basis": "contract",
        "subjects": ["employees"],
        "retention": "REVIEW_REQUIRED",
        "cross_border": False,
    },
    {
        "system_module": "pos_receipts",
        "data_categories": ["sale_lines", "tenders", "fiscal_refs", "optional_customer_link"],
        "purpose": "Retail sales and fiscal records",
        "legal_basis": "legal_obligation",
        "subjects": ["customers", "cashiers"],
        "retention": "REVIEW_REQUIRED",
        "cross_border": False,
    },
    {
        "system_module": "audit_logs",
        "data_categories": ["actor_id", "action", "ip", "payload_meta"],
        "purpose": "Security and accountability",
        "legal_basis": "legal_obligation",
        "subjects": ["users"],
        "retention": "REVIEW_REQUIRED",
        "cross_border": False,
    },
    {
        "system_module": "notification_providers",
        "data_categories": ["phone", "email", "message_meta"],
        "purpose": "Transactional and marketing notifications",
        "legal_basis": "consent",
        "subjects": ["customers", "employees"],
        "retention": "REVIEW_REQUIRED",
        "cross_border": True,
    },
]


async def seed_reference_rule_packs(session: AsyncSession) -> dict[str, Any]:
    """Insert UNVERIFIED reference packs for all domains (idempotent by pack code)."""
    created_packs = 0
    created_rules = 0
    skipped_packs = 0

    for pack_def in REFERENCE_PACKS:
        existing = await session.execute(
            select(RulePack).where(RulePack.code == pack_def["code"])
        )
        if existing.scalar_one_or_none() is not None:
            skipped_packs += 1
            continue

        pack = RulePack(
            id=generate_uuid7(),
            domain=pack_def["domain"],
            code=pack_def["code"],
            title_az=pack_def["title_az"],
            description=pack_def.get("description"),
            sector=pack_def.get("sector"),
            status=PackStatus.DRAFT.value,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(pack)
        await session.flush()

        version = RulePackVersion(
            id=generate_uuid7(),
            pack_id=pack.id,
            version=1,
            status=PackVersionStatus.DRAFT.value,
            effective_from=_EFFECTIVE_FROM,
            banner_unverified=True,
            notes=_DISCLAIMER_NOTE,
            created_at=utc_now(),
        )
        session.add(version)
        await session.flush()

        for r in pack_def["rules"]:
            rule = LegalRule(
                id=generate_uuid7(),
                rule_key=r["rule_key"],
                jurisdiction="AZ",
                domain=pack_def["domain"],
                title_az=r["title_az"],
                parameters=r["parameters"],
                parameters_schema=r.get("parameters_schema"),
                effective_from=_EFFECTIVE_FROM,
                effective_to=None,
                legal_reference=r.get("legal_reference"),
                source_url=r.get("source_url", _SECONDARY_PLACEHOLDER),
                source_type=r.get("source_type", SourceType.SECONDARY.value),
                status=r.get("status", RuleStatus.UNVERIFIED.value),
                notes=r.get("notes", _DISCLAIMER_NOTE),
                version=1,
                pack_version_id=version.id,
                created_at=utc_now(),
            )
            session.add(rule)
            created_rules += 1

        created_packs += 1

    # Obligation templates
    templates_created = 0
    for t in OBLIGATION_TEMPLATES:
        exists = await session.execute(
            select(ObligationTemplate).where(ObligationTemplate.code == t["code"])
        )
        if exists.scalar_one_or_none() is not None:
            continue
        session.add(
            ObligationTemplate(
                id=generate_uuid7(),
                code=str(t["code"]),
                title_az=str(t["title_az"]),
                default_cadence_hint=t.get("default_cadence_hint"),
                description=t.get("description"),
                created_at=utc_now(),
            )
        )
        templates_created += 1

    # Processing register seeds
    proc_created = 0
    for p in PROCESSING_REGISTER_SEEDS:
        exists = await session.execute(
            select(DataProcessingRegister).where(
                DataProcessingRegister.system_module == p["system_module"]
            )
        )
        if exists.scalar_one_or_none() is not None:
            continue
        session.add(
            DataProcessingRegister(
                id=generate_uuid7(),
                system_module=p["system_module"],
                data_categories=p["data_categories"],
                purpose=p["purpose"],
                legal_basis=p["legal_basis"],
                subjects=p["subjects"],
                retention=p.get("retention"),
                cross_border=bool(p.get("cross_border", False)),
                review_status=RegisterReviewStatus.REVIEW_REQUIRED.value,
                created_at=utc_now(),
                updated_at=utc_now(),
            )
        )
        proc_created += 1

    # Retention rules seed (tax 5yr UNVERIFIED)
    ret_exists = await session.execute(
        select(RetentionRule).where(RetentionRule.entity_type == "fiscal_receipt")
    )
    retention_created = 0
    if ret_exists.scalar_one_or_none() is None:
        for entity, years, note in [
            ("fiscal_receipt", 5, "Tax Code archive 5 years — UNVERIFIED secondary"),
            ("sale", 5, "Tax Code archive 5 years — UNVERIFIED secondary"),
            ("tax_invoice_ref", 5, "Tax Code archive 5 years — UNVERIFIED secondary"),
            (
                "accounting_document",
                None,
                "Accounting-law retention MISSING — accountant must provide",
            ),
        ]:
            session.add(
                RetentionRule(
                    id=generate_uuid7(),
                    entity_type=entity,
                    retention_years=years,
                    action="FLAG",
                    legal_reference=_ref("Vergi Məcəlləsi / accounting law"),
                    source_url=_SECONDARY_PLACEHOLDER,
                    source_type=SourceType.SECONDARY.value,
                    status=RuleStatus.UNVERIFIED.value,
                    notes=note,
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
            )
            retention_created += 1

    await session.flush()
    return {
        "packs_created": created_packs,
        "packs_skipped": skipped_packs,
        "rules_created": created_rules,
        "templates_created": templates_created,
        "processing_register_created": proc_created,
        "retention_rules_created": retention_created,
        "disclaimer": _DISCLAIMER_NOTE,
    }
