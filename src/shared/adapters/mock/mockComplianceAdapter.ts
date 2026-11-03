import { ComplianceRepository } from '../types';
import {
  ComplianceStatusSummary,
  ComplianceBannerResponse,
  LegalRule,
  RulePack,
  RulePackVersion,
  VersionDiff,
  Obligation,
  OpenLegalQuestion,
  FiscalStatus,
  TurnoverMonitorData,
  DataProcessingRegisterEntry,
  TransferRegisterEntry,
  PersonalDataSystemRegistration,
  DsarRequest,
  RetentionRuleItem,
  LegalHoldItem,
  ConsentRecord,
  InspectionPackResponse,
  ProductionCalendarYear,
  ProposeChangeRequest,
  VerifyPackRequest,
  ActivatePackRequest,
  VerifierRole,
} from '../../../features/compliance/types';

export class MockComplianceAdapter implements ComplianceRepository {
  private isProduction = false;

  private rules: LegalRule[] = [
    {
      id: 'rule-vat-std',
      ruleKey: 'vat.standard_rate',
      jurisdiction: 'AZ',
      domain: 'tax_vat',
      titleAz: 'ƏDV standart dərəcə (DEMO)',
      parameters: {
        rate: 0.18,
        price_mode: 'VAT_INCLUSIVE',
        split_formula: 'vat = gross * rate / (1 + rate)',
        rounding: 'HALF_UP',
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Vergi Məcəlləsi', article: '173' },
      sourceUrl: 'https://e-qanun.az/framework/46948',
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      notes: 'UNVERIFIED referans. Mühasib tərəfindən ilkin qanunvericiliklə yoxlanmalıdır.',
      version: 1,
      packVersionId: 'ver-vat-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-vat-classes',
      ruleKey: 'vat.tax_classes',
      jurisdiction: 'AZ',
      domain: 'tax_vat',
      titleAz: 'Vergi sinifləri və azadolmalar (DEMO)',
      parameters: {
        STANDARD: { rate: 0.18, labelAz: 'Standart ƏDV (18%)' },
        EXEMPT: { rate: 0.0, labelAz: 'ƏDV-dən azad' },
        ZERO: { rate: 0.0, labelAz: 'Sıfır dərəcəli ƏDV' },
        SIMPLIFIED_TAX_PAYER: { regime_flag: true, labelAz: 'Sadələşdirilmiş vergi' },
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Vergi Məcəlləsi', article: '164, 165' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-vat-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-vat-threshold',
      ruleKey: 'vat.turnover_threshold',
      jurisdiction: 'AZ',
      domain: 'tax_vat',
      titleAz: 'ƏDV qeydiyyat dövriyyə həddi (DEMO)',
      parameters: {
        annual_turnover_azn: 200000,
        cashless_unregistered_coefficient: 0.5,
        alert_percents: [80, 95, 100],
        indicative_only: true,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Vergi Məcəlləsi', article: '155.1-1' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-vat-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-fisc-mandatory',
      ruleKey: 'fiscal.mandatory_receipt_fields',
      jurisdiction: 'AZ',
      domain: 'fiscal_receipt',
      titleAz: 'Fiskal qəbzin 25 məcburi elementi (DEMO)',
      parameters: {
        fields: [
          'taxpayer_name',
          'voen',
          'datetime',
          'outlet_name',
          'tax_office_registration_code',
          'address',
          'line_item_name',
          'unit',
          'quantity',
          'unit_price',
          'line_total',
          'vat_rate_or_simplified_rate',
          'vat_amount',
          'receipt_number_in_shift',
          'cash_register_make',
          'cash_register_serial',
          'fiscal_mode_mark',
          'qr_code',
          'amount_paid',
          'advance_amount',
          'change_returned',
          'outstanding_amount',
          'payment_form',
          'receipt_type',
          'control_mechanism_registration_no',
        ],
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Vergi Məcəlləsi', article: '16.1.8' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-fisc-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-pay-minwage',
      ruleKey: 'payroll.minimum_wage',
      jurisdiction: 'AZ',
      domain: 'payroll_tax',
      titleAz: 'Minimum aylıq əmək haqqı (DEMO)',
      parameters: {
        amount_azn: 400,
        enforcement: 'block_unless_part_time_proration',
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'AR Prezidentinin Sərəncamı' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-ptax-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-pay-brackets-2026',
      ruleKey: 'payroll.income_tax.brackets_2026',
      jurisdiction: 'AZ',
      domain: 'payroll_tax',
      titleAz: 'Gəlir vergisi keçid cədvəli 2026 (DEMO)',
      parameters: {
        brackets: [
          { up_to: 2500, rate: 0.03, base: 0, excess_over: 0 },
          { up_to: 8000, rate: 0.1, base: 75, excess_over: 2500 },
          { up_to: null, rate: 0.14, base: 625, excess_over: 8000 },
        ],
        transitional_until: '2026-12-31',
        next_pack_required_before: '2027-01-01',
        reminder_days_before: 60,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Vergi Məcəlləsi — Keçid müddəaları' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-ptax-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-soc-dsmf-emp',
      ruleKey: 'payroll.dsmf.employee',
      jurisdiction: 'AZ',
      domain: 'payroll_social',
      titleAz: 'DSMF işçi töhfəsi (DEMO)',
      parameters: {
        brackets: [
          { up_to: 200, rate: 0.03 },
          { up_to: null, fixed: 6, rate_above: 0.1, excess_over: 200 },
        ],
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Sosial sığorta haqqında Qanun' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-psoc-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-soc-dsmf-empr',
      ruleKey: 'payroll.dsmf.employer',
      jurisdiction: 'AZ',
      domain: 'payroll_social',
      titleAz: 'DSMF işəgötürən töhfəsi — MÜBAHİSƏLİ (DEMO)',
      parameters: {
        sources_conflict: true,
        variants: [
          { label: 'Variant A (22% / 15% / 11%)', details: 'İlk 200 üçün 22%, 8000-dək 15%, yuxarı 11%' },
          { label: 'Variant B (Sabit 44 AZN)', details: 'İlk 200 üçün sabit 44 AZN' },
        ],
        no_default_activated: true,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Ziddiyyətli ikincili mənbələr' },
      sourceType: 'SECONDARY',
      status: 'DISPUTED',
      notes: 'Ziddiyyətli mənbələr: Verifier tərəfindən həll edilmədən aktivləşdirilə bilməz.',
      version: 1,
      packVersionId: 'ver-psoc-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-soc-medical',
      ruleKey: 'payroll.medical_insurance',
      jurisdiction: 'AZ',
      domain: 'payroll_social',
      titleAz: 'İcbari tibbi sığorta — MÜBAHİSƏLİ HƏDD (DEMO)',
      parameters: {
        employee_rate_below: 0.02,
        employer_rate_below: 0.02,
        employee_rate_above: 0.005,
        employer_rate_above: 0.005,
        threshold_variants_azn: [2500, 8000],
        sources_conflict: true,
        no_default_activated: true,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Tibbi sığorta haqqında Qanun' },
      sourceType: 'SECONDARY',
      status: 'DISPUTED',
      notes: 'Hədd 2500 yoxsa 8000 AZN: mənbələr ziddiyyətlidir.',
      version: 1,
      packVersionId: 'ver-psoc-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-lab-hours',
      ruleKey: 'labor.normal_working_time',
      jurisdiction: 'AZ',
      domain: 'labor_time',
      titleAz: 'İş vaxtı rejimləri və normaları (DEMO)',
      parameters: {
        max_hours_day: 8,
        max_hours_week: 40,
        six_day_max_hours_day: 7,
        cumulative_shift_cap_hours: 12,
        pre_holiday_shorten_hours: 1,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Əmək Məcəlləsi (16 Yanvar 2026 dəyişikliyi)' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-ltime-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-lab-night',
      ruleKey: 'labor.night_work',
      jurisdiction: 'AZ',
      domain: 'labor_time',
      titleAz: 'Gecə işi pəncərəsi (DEMO)',
      parameters: {
        start: '22:00',
        end: '06:00',
        supplement_rate: null,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Əmək Məcəlləsi' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-ltime-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-lab-overtime',
      ruleKey: 'labor.overtime',
      jurisdiction: 'AZ',
      domain: 'labor_time',
      titleAz: 'Əlavə iş vaxtı hədləri və əmsalı (DEMO)',
      parameters: {
        min_multiplier: 2.0,
        limits_disputed: true,
        reference_limits_unverified: {
          max_hours_two_consecutive_days: 4,
          max_hours_year: 120,
        },
        consent_required: true,
        enforcement: 'warn',
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Əmək Məcəlləsi', article: '165' },
      sourceType: 'SECONDARY',
      status: 'DISPUTED',
      version: 1,
      packVersionId: 'ver-ltime-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-leave-min',
      ruleKey: 'labor.annual_leave.minimum',
      jurisdiction: 'AZ',
      domain: 'labor_leave',
      titleAz: 'Minimum əsas əmək məzuniyyəti (DEMO)',
      parameters: {
        calendar_days: 21,
        white_collar_calendar_days: 30,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Əmək Məcəlləsi', article: '114' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-leave-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-ret-window',
      ruleKey: 'returns.exchange_window_days',
      jurisdiction: 'AZ',
      domain: 'consumer_returns',
      titleAz: '14 günlük qaytarma/mübadilə pəncərəsi (DEMO)',
      parameters: {
        days: 14,
        exclude_purchase_day: true,
        count_calendar_days: true,
        unused_and_labels_required: true,
        proof_of_purchase_required: true,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'İstehlakçıların hüquqlarının müdafiəsi haqqında Qanun', number: '1113' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-returns-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-ret-exclusions',
      ruleKey: 'returns.default_returnability',
      jurisdiction: 'AZ',
      domain: 'consumer_returns',
      titleAz: 'Qaytarılmayan mallar siyahısı və qaydası (DEMO)',
      parameters: {
        footwear: 'RETURNABLE',
        clothing: 'RETURNABLE',
        non_returnable_categories: ['underwear', 'hosiery', 'perfumery', 'cosmetics'],
        legal_source: 'Nazirlər Kabinetinin 114 saylı Qərarı',
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Nazirlər Kabinetinin Qərarı', number: '114' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-returns-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-priv-consent',
      ruleKey: 'privacy.consent_required',
      jurisdiction: 'AZ',
      domain: 'personal_data',
      titleAz: 'Yazılı razılıq və məlumat qorunması tələbi (DEMO)',
      parameters: {
        written_consent_required_unless_exception: true,
        cross_border_requires_equivalent_or_consent: true,
        system_registration_generally_required: true,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Fərdi məlumatlar haqqında Qanun', number: '998-IIIQ' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-priv-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-ret-tax-years',
      ruleKey: 'retention.tax_archive_years',
      jurisdiction: 'AZ',
      domain: 'retention',
      titleAz: 'Vergi sənədlərinin saxlanma müddəti (DEMO)',
      parameters: {
        years: 5,
        entity_types: ['fiscal_receipt', 'sale', 'tax_invoice_ref'],
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Vergi Məcəlləsi (Arxiv tələbləri)' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      version: 1,
      packVersionId: 'ver-ret-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
    {
      id: 'rule-ret-acc-missing',
      ruleKey: 'retention.accounting_law',
      jurisdiction: 'AZ',
      domain: 'retention',
      titleAz: 'Mühasibat uçotu saxlama — TƏDQİQAT ÇATIŞMIR (DEMO)',
      parameters: {
        status: 'MISSING',
        must_be_provided_by_accountant: true,
      },
      effectiveFrom: '2026-01-01T00:00:00+04:00',
      legalReference: { actName: 'Mühasibat uçotu haqqında Qanun' },
      sourceType: 'SECONDARY',
      status: 'UNVERIFIED',
      notes: 'MISSING: Mühasibatlıq sənəd saxlama müddətlərini təqdim etməlidir.',
      version: 1,
      packVersionId: 'ver-ret-1',
      createdAt: '2026-01-01T00:00:00Z',
      editorId: 'usr-editor-1',
      isDemo: true,
    },
  ];

  private packs: any[] = [
    {
      id: 'pack-tax-vat',
      domain: 'vat',
      code: 'tax_vat_az_2026_ref',
      title: 'ƏDV və dövriyyə monitorinqi (DEMO)',
      titleAz: 'ƏDV və dövriyyə monitorinqi (DEMO)',
      jurisdiction: 'AZ',
      status: 'UNVERIFIED',
      activeVersionId: 'ver-vat-1',
      legalReference: 'AR Vergi Məcəlləsi, Maddə 152, 173',
      sourceType: 'SECONDARY',
      sourceUrl: 'https://e-qanun.az/framework/46948',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-vat-1',
          packId: 'pack-tax-vat',
          version: 1,
          status: 'UNVERIFIED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { rate: 0.18, price_mode: 'VAT_INCLUSIVE', turnover_threshold_azn: 200000, cashless_coefficient: 0.5 },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'pack-fiscal',
      domain: 'fiscal',
      code: 'fiscal_receipt_az_2026_ref',
      title: 'E-kassa və fiskal qəbz elementləri (DEMO)',
      titleAz: 'E-kassa və fiskal qəbz elementləri (DEMO)',
      jurisdiction: 'AZ',
      status: 'UNVERIFIED',
      activeVersionId: 'ver-fisc-1',
      legalReference: 'AR Vergi Məcəlləsi, Maddə 50; NK Qərarı No. 242',
      sourceType: 'SECONDARY',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-fisc-1',
          packId: 'pack-fiscal',
          version: 1,
          status: 'UNVERIFIED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { mandatory_elements_count: 25, qr_required: true, offline_hours_limit: 72 },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'pack-ptax',
      domain: 'payroll_tax',
      code: 'payroll_tax_az_private_2026_ref',
      title: 'Fərdi gəlir vergisi və minimum əməkhaqqı (DEMO)',
      titleAz: 'Fərdi gəlir vergisi və minimum əməkhaqqı (DEMO)',
      jurisdiction: 'AZ',
      status: 'UNVERIFIED',
      activeVersionId: 'ver-ptax-1',
      legalReference: 'AR Vergi Məcəlləsi, Maddə 101, 102',
      sourceType: 'SECONDARY',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-ptax-1',
          packId: 'pack-ptax',
          version: 1,
          status: 'UNVERIFIED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { minimum_wage_azn: 400, private_sector_exempt_threshold_azn: 8000, rate_above_threshold: 0.14 },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'pack-psoc',
      domain: 'social_insurance',
      code: 'payroll_social_az_private_2026_ref',
      title: 'DSMF, İcbari Tibbi və İşsizlik sığortası (DEMO)',
      titleAz: 'DSMF, İcbari Tibbi və İşsizlik sığortası (DEMO)',
      jurisdiction: 'AZ',
      status: 'UNVERIFIED',
      activeVersionId: 'ver-psoc-1',
      legalReference: 'Sosial sığorta haqqında AR Qanunu, Maddə 14; Tibbi sığorta M. 15',
      sourceType: 'SECONDARY',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-psoc-1',
          packId: 'pack-psoc',
          version: 1,
          status: 'UNVERIFIED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { dsmf_employee_tier1: 0.03, dsmf_employee_tier2: 0.10, dsmf_employer_tier1: 0.22, dsmf_employer_tier2: 0.15 },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'pack-ltime',
      domain: 'work_time',
      code: 'labor_time_az_2026_ref',
      title: 'İş vaxtı, gecə işi və əlavə iş rejimləri (DEMO)',
      titleAz: 'İş vaxtı, gecə işi və əlavə iş rejimləri (DEMO)',
      jurisdiction: 'AZ',
      status: 'UNVERIFIED',
      activeVersionId: 'ver-ltime-1',
      legalReference: 'AR Əmək Məcəlləsi, Maddə 89, 90, 108',
      sourceType: 'SECONDARY',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-ltime-1',
          packId: 'pack-ltime',
          version: 1,
          status: 'UNVERIFIED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { weekly_standard_hours: 40, daily_limit_5day: 8, daily_limit_6day: 7, night_start: '22:00', night_end: '06:00' },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'pack-leave',
      domain: 'leave',
      code: 'labor_leave_az_2026_ref',
      title: 'Əsas və əlavə məzuniyyət normaları (DEMO)',
      titleAz: 'Əsas və əlavə məzuniyyət normaları (DEMO)',
      jurisdiction: 'AZ',
      status: 'UNVERIFIED',
      activeVersionId: 'ver-leave-1',
      legalReference: 'AR Əmək Məcəlləsi, Maddə 113, 114, 115',
      sourceType: 'SECONDARY',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-leave-1',
          packId: 'pack-leave',
          version: 1,
          status: 'UNVERIFIED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { standard_leave_days: 21, white_collar_days: 30 },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'pack-cons',
      domain: 'consumer_rights',
      code: 'consumer_protection_az_ref',
      title: 'Məhsul qaytarılması və 14 günlük müddət (DEMO)',
      titleAz: 'Məhsul qaytarılması və 14 günlük müddət (DEMO)',
      jurisdiction: 'AZ',
      status: 'DISPUTED',
      activeVersionId: 'ver-cons-1',
      legalReference: 'İstehlakçıların hüquqlarının müdafiəsi haqqında Qanun, Maddə 15; NK Qərarı No. 114',
      sourceType: 'SECONDARY',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-cons-1',
          packId: 'pack-cons',
          version: 1,
          status: 'DISPUTED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { return_window_days: 14, purchase_day_included: false, excluded_categories: ['underwear', 'hosiery', 'jewelry', 'hygiene'] },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'pack-priv',
      domain: 'personal_data',
      code: 'privacy_personal_data_az_ref',
      title: 'Fərdi məlumatlar və transsərhəd ötürülmə (DEMO)',
      titleAz: 'Fərdi məlumatlar və transsərhəd ötürülmə (DEMO)',
      jurisdiction: 'AZ',
      status: 'UNVERIFIED',
      activeVersionId: 'ver-priv-1',
      legalReference: 'Fərdi məlumatlar haqqında AR Qanunu, Maddə 8, 9, 13',
      sourceType: 'SECONDARY',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-priv-1',
          packId: 'pack-priv',
          version: 1,
          status: 'UNVERIFIED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { consent_required: true, cross_border_safeguards_mandatory: true, dsar_sla_days: 30 },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'pack-ret',
      domain: 'retention',
      code: 'retention_az_ref',
      title: 'Sənəd saxlama müddətləri və arxiv (DEMO)',
      titleAz: 'Sənəd saxlama müddətləri və arxiv (DEMO)',
      jurisdiction: 'AZ',
      status: 'UNVERIFIED',
      activeVersionId: 'ver-ret-1',
      legalReference: 'Vergi Məcəlləsi (Arxiv tələbləri); Milli Arxiv Fondu haqqında Qanun',
      sourceType: 'SECONDARY',
      version: 1,
      author: 'usr-editor-1',
      versions: [
        {
          id: 'ver-ret-1',
          packId: 'pack-ret',
          version: 1,
          status: 'UNVERIFIED',
          author: 'usr-editor-1',
          createdBy: 'usr-editor-1',
          createdAt: '2026-01-01T00:00:00Z',
          bannerUnverified: true,
          parameters: { tax_archive_years: 5, payroll_archive_years: 75 },
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      isDemo: true,
    },
  ];

  private obligations: Obligation[] = [
    {
      id: 'ob-1',
      templateCode: 'payroll_declaration_monthly',
      titleAz: 'Aylıq vahid bəyannamə və DSMF ödənişi (DEMO)',
      ownerUserId: 'usr-accountant-1',
      ownerName: 'Vüqar Məmmədov (Baş Mühasib)',
      cadence: 'monthly',
      nextDue: '2026-11-20',
      status: 'OPEN',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'ob-2',
      templateCode: 'vat_return_payment',
      titleAz: 'Aylıq ƏDV bəyannaməsi və büdcəyə ödəniş (DEMO)',
      ownerUserId: 'usr-accountant-1',
      ownerName: 'Vüqar Məmmədov (Baş Mühasib)',
      cadence: 'monthly',
      nextDue: '2026-11-20',
      status: 'OPEN',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'ob-3',
      templateCode: 'ekassa_device_maintenance',
      titleAz: 'E-Kassa cihazlarının texniki profilaktikası və Z-hesabat auditi (DEMO)',
      ownerUserId: 'usr-admin-1',
      ownerName: 'Elmir Qasımov (İT İnzibatçı)',
      cadence: 'monthly',
      nextDue: '2026-11-15',
      status: 'IN_PROGRESS',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'ob-4',
      templateCode: 'rule_pack_review_quarterly',
      titleAz: 'Qanunvericilik qayda paketlərinin rüblük təftişi (DEMO)',
      ownerUserId: 'usr-lawyer-1',
      ownerName: 'Leyla Rüstəmova (Korporativ Hüquqşünas)',
      cadence: 'quarterly',
      nextDue: '2026-12-15',
      status: 'OPEN',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      isDemo: true,
    },
    {
      id: 'ob-5',
      templateCode: 'transitional_rate_change_review',
      titleAz: '2027 keçid dərəcələri ərəfəsində yeni paket hazırlığı (DEMO)',
      ownerUserId: 'usr-accountant-1',
      ownerName: 'Vüqar Məmmədov (Baş Mühasib)',
      cadence: 'annual',
      nextDue: '2026-11-01',
      status: 'OVERDUE',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      isDemo: true,
    },
  ];

  private openLegalQuestions: OpenLegalQuestion[] = [
    {
      id: 1,
      questionNumber: 1,
      titleAz: 'Şirkətin vergi rejimi və ƏDV dövriyyə həddi mexanizmi',
      legalReference: 'Vergi Məcəlləsi, maddə 155.1-1 və 218',
      descriptionAz: 'Şirkət ƏDV ödəyicisidirmi? 200,000 AZN həddi hesablanarkən nağdsız satışlar üçün 0.5 əmsalı necə tətbiq edilir?',
      impactOnErp: 'Turnover monitor alqoritmi və kassa çeklərində ƏDV/Sadələşdirilmiş vergi rejiminin seçimi.',
      status: 'PENDING_LEGAL',
      assignee: 'Vüqar Məmmədov (Baş Mühasib)',
      notes: 'Hazırda 200,000 AZN həddi üçün 0.5 əmsalı indikativ rejimdə izlənilir.',
      isDemo: true,
    },
    {
      id: 2,
      questionNumber: 2,
      titleAz: 'Fiskal çekin məcburi elementləri və akkreditə olunmuş e-kassa operatoru',
      legalReference: 'Vergi Məcəlləsi, maddə 16.1.8',
      descriptionAz: 'Rəsmi seçilmiş e-kassa provayderi hansıdır və internet kəsildikdə oflayn rejim qaydaları nədən ibarətdir?',
      impactOnErp: 'FiscalService real adapterinin inteqrasiyası və 25 elementin validasiyası.',
      status: 'PENDING_LEGAL',
      assignee: 'Elmir Qasımov (İT İnzibatçı)',
      notes: 'Tender mərhələsindədir; adapter NOT_CONFIGURED olaraq qalır.',
      isDemo: true,
    },
    {
      id: 3,
      questionNumber: 3,
      titleAz: 'Gəlir vergisi, DSMF və İcbari Sığorta dərəcələri (2026 keçid dövrü)',
      legalReference: 'Vergi Məcəlləsi, Sosial Sığorta və Tibbi Sığorta Qanunları',
      descriptionAz: 'İcbari tibbi sığortada 2% həddi 2,500 yoxsa 8,000 AZN-dir? İşəgötürənin DSMF dərəcə strukturu dəqiq necədir?',
      impactOnErp: 'Əməkhaqqı cədvəlinin hesablanması və yekunlaşdırılması (payroll finalization).',
      status: 'PENDING_LEGAL',
      assignee: 'Leyla Rüstəmova (Hüquqşünas)',
      notes: 'Qayda paketində DISPUTED kimi nişanlanıb, həll olunana qədər istehsalatda yekunlaşdırma bloklanır.',
      isDemo: true,
    },
    {
      id: 4,
      questionNumber: 4,
      titleAz: 'Əlavə iş (Overtime) hədləri, gecə/bayram işi və 30 günlük məzuniyyət vəzifələri',
      legalReference: 'Əmək Məcəlləsi (16 Yanvar 2026 dəyişikliyi)',
      descriptionAz: 'İllik 120 saat limiti şirkətdə tətbiq olunurmu? 30 günlük məzuniyyət hansı vəzifə kateqoriyalarına şamil edilir?',
      impactOnErp: 'İş qrafiki xəbərdarlıqları və məzuniyyət hüququ kalkulyatoru.',
      status: 'PENDING_LEGAL',
      assignee: 'Günel Tağıyeva (HR Menecer)',
      notes: 'Vəzifə təsnifatı cədvəli hazırlanmalıdır.',
      isDemo: true,
    },
    {
      id: 5,
      questionNumber: 5,
      titleAz: 'Əmək müqavilələrinin dövlət sistemində qeydiyyatı (ƏMAS)',
      legalReference: 'Əmək Məcəlləsi, maddə 7',
      descriptionAz: 'Kadr qəbulunun qüvvəyə minməsi üçün ƏMAS bildiriş nömrəsinin əl ilə daxil edilməsi tələb olunurmu?',
      impactOnErp: 'İşçi profilinin aktivləşdirilməsi və kadr tarixçəsi.',
      status: 'RESOLVED',
      assignee: 'Günel Tağıyeva (HR Menecer)',
      notes: 'ƏMAS bildiriş nömrəsi daxil edilmədən işçi ACTIVE edilmir.',
      isDemo: true,
    },
    {
      id: 6,
      questionNumber: 6,
      titleAz: 'Qaytarılmayan mallar siyahısı və qüsurlu mal iddia müddətləri',
      legalReference: 'İstehlakçıların hüquqlarının müdafiəsi haqqında Qanun No. 1113 və NK Qərarı No. 114',
      descriptionAz: 'Parfümeriya və alt geyimlərinin qaytarılmaması və qüsurlu mal ekspertiza proseduru.',
      impactOnErp: 'POS qaytarma pəncərəsi və imtina səbəbləri seçimi.',
      status: 'RESOLVED',
      assignee: 'Leyla Rüstəmova (Hüquqşünas)',
      notes: '114 saylı qərara əsasən alt geyimi və corablar NON_RETURNABLE_BY_LAW kimi sistemə işlənib.',
      isDemo: true,
    },
    {
      id: 7,
      questionNumber: 7,
      titleAz: 'Fərdi məlumat sistemlərinin dövlət reyestri qeydiyyatı və transsərhəd ötürmə',
      legalReference: 'Fərdi məlumatlar haqqında Qanun No. 998-IIIQ',
      descriptionAz: 'Şirkətin İS qeydiyyatı varmı? Xarici bulud və SMS təminatçıları üçün transsərhəd razılıq necə toplanır?',
      impactOnErp: 'Xarici inteqrasiyaların aktivləşdirilməsi bloklanır.',
      status: 'PENDING_LEGAL',
      assignee: 'Elmir Qasımov (İT İnzibatçı)',
      notes: 'Fərdi məlumat İS reyestri statusu NOT_ASSESSED olaraq qalır.',
      isDemo: true,
    },
    {
      id: 8,
      questionNumber: 8,
      titleAz: 'Mühasibat və vergi sənədlərinin saxlama müddətləri',
      legalReference: 'Vergi Məcəlləsi və Mühasibat uçotu haqqında Qanun',
      descriptionAz: 'İlkin sənədlər üçün 5 illik vergi arxivi ilə yanaşı əlavə daxili arxiv müddəti nəzərdə tutulurmu?',
      impactOnErp: 'Retention jurnalı və Legal Hold silinmə qadağası.',
      status: 'PENDING_LEGAL',
      assignee: 'Vüqar Məmmədov (Baş Mühasib)',
      notes: 'Qayda paketində retention.accounting_law MISSING statusundadır.',
      isDemo: true,
    },
    {
      id: 9,
      questionNumber: 9,
      titleAz: 'Hədiyyə kartları, bonus xalları və avans ödənişlərinin fiskal uçotu',
      legalReference: 'DVX fiskal qəbz təlimatları',
      descriptionAz: 'Hədiyyə kartı satılanda avans çeki çıxarılmalıdırmı, yoxsa mal təqdim ediləndə?',
      impactOnErp: 'Kassa ödəniş formaları: Bonus və Hədiyyə kartı tenderləri.',
      status: 'RESOLVED',
      assignee: 'Vüqar Məmmədov (Baş Mühasib)',
      notes: 'Hədiyyə kartı və bonus xalları qəbzdə ayrıca tender kimi qeyd olunur.',
      isDemo: true,
    },
  ];

  private fiscalStatus: FiscalStatus = {
    mode: 'REQUIRED',
    status: 'ACTIVE',
    state: 'COMPLETED',
    operatorName: 'Dövlət Vergi Xidməti E-Kassa Şlüzü (NBA Technologies)',
    deviceSerial: 'EK-AZ-2026-98124',
    lastZReportAt: '2026-11-02T22:00:00+04:00',
    activeShiftOpen: true,
    shiftSalesTotal: 1845.5,
    fiscalSalesTotal: 1845.5,
    driftAlert: false,
    isDemo: true,
  };

  private turnoverMonitor: TurnoverMonitorData = {
    calendarYearTurnover: 142500.0,
    rolling12mTurnover: 158200.0,
    threshold: 200000.0,
    currentTurnover: 190000.0,
    adjustedTurnover: 142500.0,
    cashlessCoefficient: 0.5,
    percentage: 71,
    coefficientApplied: 0.5,
    cashlessTurnover: 95000.0,
    cashTurnover: 95000.0,
    percentOfThreshold: 71.25,
    alertLevel: 'NORMAL',
    asOf: '2026-11-03',
    isDraft: true,
    isDemo: true,
  };

  private dataProcessingRegister: DataProcessingRegisterEntry[] = [
    {
      id: 'dpr-1',
      systemModule: 'CRM & Loyallıq',
      dataCategories: ['Ad, soyad', 'Mobil nömrə', 'Alış tarixçəsi', 'Bonus balı'],
      purpose: 'Müştəri loyallıq proqramının icrası və endirimlərin tətbiqi',
      legalBasis: 'Razılıq (Fərdi Məlumatlar Qanunu, m. 8)',
      subjects: ['Pərakəndə alıcılar'],
      retention: 'Müştəri hesabı ləğv edilənədək və ya 3 il hərəkətsiz qaldıqda',
      storageLocation: 'Lokal server (Bakı, Azərbaycan)',
      crossBorder: false,
      securityMeasures: 'Sütun səviyyəli şifrələmə, audit jurnalı',
      owner: 'Marketinq Şöbəsi',
      reviewStatus: 'VERIFIED',
      updatedAt: '2026-10-15T10:00:00Z',
    },
    {
      id: 'dpr-2',
      systemModule: 'Kadr və Əməkhaqqı (HR/Payroll)',
      dataCategories: ['FİN', 'Pasport rekvizitləri', 'Bank hesabı', 'Əməkhaqqı məbləği', 'Ünvan'],
      purpose: 'Əmək müqaviləsi və vergi/sosial qanunvericilik öhdəliklərinin icrası',
      legalBasis: 'Hüquqi öhdəlik / Müqavilənin icrası (Əmək Məcəlləsi)',
      subjects: ['Şirkət işçiləri'],
      retention: 'Xitamdan sonra 5 il (Vergi Məcəlləsi arxivi)',
      storageLocation: 'Təhlükəsiz baza (Bakı, Azərbaycan)',
      crossBorder: false,
      securityMeasures: 'AES-256 app-level şifrələmə, PII maskalama (hr.pii.view)',
      owner: 'İnsan Resursları Şöbəsi',
      reviewStatus: 'VERIFIED',
      updatedAt: '2026-10-20T14:30:00Z',
    },
    {
      id: 'dpr-3',
      systemModule: 'POS və Kassa Əməliyyatları',
      dataCategories: ['Bank kartı son 4 rəqəmi', 'Fiskal çek rekvizitləri', 'Ödəniş forması'],
      purpose: 'Pərakəndə hesablaşmaların qeydiyyatı və fiskal kassa hesabatlılığı',
      legalBasis: 'Qanuni öhdəlik (Vergi Məcəlləsi, m. 16.1.8)',
      subjects: ['Alıcılar'],
      retention: '5 il (Fiskal arxiv)',
      storageLocation: 'Fiskal kassa yaddaşı və lokal DB',
      crossBorder: false,
      securityMeasures: 'Tam PCI-DSS kart məlumatı saxlanmır, yalnız son 4 rəqəm',
      owner: 'Maliyyə və Kassa Şöbəsi',
      reviewStatus: 'VERIFIED',
      updatedAt: '2026-10-22T09:15:00Z',
    },
  ];

  private transferRegister: TransferRegisterEntry[] = [
    {
      id: 'tr-1',
      processorName: 'Twilio Inc. (SMS Gateway)',
      country: 'ABŞ / İrlandiya (Aİ)',
      purpose: 'Loyallıq OTP təsdiqi və SMS bildirişlərin çatdırılması',
      safeguards: 'Standard Contractual Clauses (SCC) və DPA',
      consentCoverage: true,
      status: 'VERIFIED',
      notes: 'Müştəri razılıq formasında transsərhəd ötürmə qeyd olunub.',
      updatedAt: '2026-10-18T11:00:00Z',
    },
    {
      id: 'tr-2',
      processorName: 'Amazon Web Services EMEA SARL (Cloud Backup)',
      country: 'Frankfurt, Almaniya (Aİ)',
      purpose: 'Şifrələnmiş ehtiyat nüsxələrin (encrypted backup) saxlanılması',
      safeguards: 'AES-256 müştəri açarlı şifrələmə, ISO 27001 sertifikatı',
      consentCoverage: true,
      status: 'REVIEW_REQUIRED',
      notes: 'İstehsalat mühitində aktivləşdirmə hüquqşünas təsdiqinədək bloklanır.',
      updatedAt: '2026-10-25T16:00:00Z',
    },
  ];

  private personalDataRegistration: PersonalDataSystemRegistration = {
    id: 'pdsr-1',
    status: 'NOT_ASSESSED',
    referenceNumber: undefined,
    authority: 'RİNN yanında Fərdi Məlumatların Mühafizəsi üzrə Səlahiyyətli Orqan',
    notes: 'Qeydiyyat statusu qiymətləndirilməyib. İstehsalatda xəbərdarlıq çıxarır.',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  private dsarRequests: DsarRequest[] = [
    {
      id: 'dsar-1',
      requestNumber: 'DSAR-2026-001',
      subjectName: 'Rəşad Quliyev',
      subjectType: 'customer',
      contact: '+994 50 211 44 55',
      requestType: 'ERASURE',
      status: 'COMPLETED',
      slaDeadline: '2026-11-10T00:00:00Z',
      conflictResolvedToAnonymization: true,
      outcomeNotes: 'Müştərinin 3 illik vergi sənədləri olduğuna görə tam silmə deyil, PII anonimləşdirməsi tətbiq edildi.',
      createdAt: '2026-10-28T12:00:00Z',
    },
    {
      id: 'dsar-2',
      requestNumber: 'DSAR-2026-002',
      subjectName: 'Aytən Məmmədli',
      subjectType: 'customer',
      contact: '+994 55 333 22 11',
      requestType: 'ACCESS',
      status: 'PROCESSING',
      slaDeadline: '2026-11-15T00:00:00Z',
      conflictResolvedToAnonymization: false,
      outcomeNotes: 'Məlumatların nüsxəsi hazırlanır.',
      createdAt: '2026-11-01T09:30:00Z',
    },
  ];

  private retentionRules: RetentionRuleItem[] = [
    {
      id: 'ret-1',
      entityType: 'fiscal_receipt',
      retentionYears: 5,
      action: 'ARCHIVE',
      status: 'UNVERIFIED',
      legalReference: 'Vergi Məcəlləsi (Arxiv tələbi)',
      notes: 'Fiskal kassa çekləri 5 il silinə bilməz.',
    },
    {
      id: 'ret-2',
      entityType: 'sale',
      retentionYears: 5,
      action: 'ARCHIVE',
      status: 'UNVERIFIED',
      legalReference: 'Vergi Məcəlləsi',
      notes: 'Satış qaimələri və fakturaları 5 il saxlanmalıdır.',
    },
    {
      id: 'ret-3',
      entityType: 'customer_consent',
      retentionYears: 3,
      action: 'FLAG',
      status: 'UNVERIFIED',
      legalReference: 'Fərdi məlumatlar haqqında Qanun',
      notes: 'Razılıq sübutları münasibət bitdikdən sonra 3 il saxlanılır.',
    },
  ];

  private legalHolds: LegalHoldItem[] = [
    {
      id: 'hold-1',
      entityType: 'sale',
      entityId: 'sale-2026-8812',
      reason: '2 saylı Vergilər İdarəsi tərəfindən kameral yoxlama tələbi',
      heldByName: 'Vüqar Məmmədov (Baş Mühasib)',
      heldAt: '2026-10-29T11:00:00Z',
      active: true,
    },
  ];

  private consentRecords: ConsentRecord[] = [
    {
      id: 'cs-1',
      subjectId: 'cust-101',
      subjectType: 'customer',
      subjectName: 'Teymur Əliyev',
      formVersionId: 'form-az-v1',
      consentTextHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      purposes: {
        loyalty: true,
        smsMarketing: true,
        emailMarketing: false,
        profiling: false,
        crossBorderTransfer: true,
      },
      captureMethod: 'checkbox_otp',
      capturedByName: 'Kassir K-01',
      capturedAt: '2026-10-25T14:20:00Z',
      verified: true,
      historyTimeline: [
        { date: '2026-10-25T14:20:00Z', action: 'Razılıq OTP ilə təsdiqləndi', actor: 'Teymur Əliyev' },
      ],
      isDemo: true,
    },
  ];

  // -------------------------------------------------------------
  // REPOSITORY METHODS
  // -------------------------------------------------------------


  setProductionMode(isProd: boolean): void {
    this.isProduction = isProd;
  }

  async checkFeatureGate(feature: string): Promise<{ allowed: boolean; warning?: string; blockingDomain?: string; requiredRole?: string }> {
    if (!this.isProduction) {
      return {
        allowed: true,
        warning: 'Qeyri-istehsalat rejimində UNVERIFIED hüquqi qaydalar xəbərdarlıqla istifadə olunur',
      };
    }

    if (feature === 'payroll_finalization') {
      const payrollUnverified = this.rules.some((r) => (r.domain === 'payroll_tax' || r.domain === 'social_insurance') && r.status !== 'VERIFIED');
      if (payrollUnverified) {
        return {
          allowed: false,
          blockingDomain: 'payroll_tax',
          requiredRole: 'ACCOUNTANT',
        };
      }
    }

    if (feature === 'fiscal_receipts') {
      const fiscalUnverified = this.rules.some((r) => (r.domain === 'fiscal' || r.domain === 'fiscal_receipt') && r.status !== 'VERIFIED');
      if (fiscalUnverified) {
        return {
          allowed: false,
          blockingDomain: 'fiscal',
          requiredRole: 'ACCOUNTANT',
        };
      }
    }

    return { allowed: true };
  }

  async getRulePacks(): Promise<RulePack[]> {
    return this.getPacks();
  }

  async getBannerStatus(): Promise<ComplianceBannerResponse> {
    return this.getBanner();
  }

  async getPersonalDataSystemRegistration(): Promise<PersonalDataSystemRegistration> {
    return this.getPersonalDataRegistration();
  }

  async recordConsent(record: any): Promise<ConsentRecord> {
    const cs = await this.saveConsentRecord({
      subjectId: record.subjectId,
      subjectType: record.subjectType === 'CUSTOMER' ? 'customer' : 'employee',
      subjectName: record.subjectName || 'Müştəri',
      captureMethod: record.method === 'OTP' ? 'checkbox_otp' : record.method === 'PAPER_SCAN' ? 'paper_scan' : 'e_signature',
      purposes: {
        loyalty: (record.purposes || []).includes('loyalty'),
        smsMarketing: (record.purposes || []).includes('marketing'),
        emailMarketing: (record.purposes || []).includes('marketing'),
        profiling: (record.purposes || []).includes('profiling'),
        crossBorderTransfer: (record.purposes || []).includes('cross_border'),
      },
      evidenceFileId: record.evidenceReference,
    });
    return {
      ...cs,
      purposes: record.purposes,
      auditHash: 'sha256-audit-' + Date.now(),
      recordedAt: new Date().toISOString(),
    } as any;
  }

  async verifyPack(packId: string, req: VerifyPackRequest): Promise<any> {
    const pack = this.packs.find((p) => p.id === packId);
    if (!pack) throw new Error('Paket tapılmadı');

    // Two-person rule check:
    const latestVersion = (pack.versions && pack.versions[pack.versions.length - 1]);
    const author = latestVersion?.createdBy || (pack as any).author || 'usr-editor-1';
    if (author && req.verifierName && req.verifierName.trim().toLowerCase() === author.trim().toLowerCase()) {
      throw new Error('İki şəxs qaydası pozuldu: Qaydanı təklif və ya redaktə edən şəxs özü onu təsdiqləyə bilməz (verifier ≠ editor).');
    }

    if (!req.evidenceNotes || req.evidenceNotes.trim().length < 20) {
      throw new Error('Sübut qeydləri ən azı 20 simvol olmalıdır.');
    }

    (pack as any).status = 'VERIFIED';
    (pack as any).verifiedBy = { name: req.verifierName, role: req.verifierRole };
    (pack as any).verifiedAt = new Date().toISOString();

    if (latestVersion) {
      latestVersion.status = 'VERIFIED';
      latestVersion.bannerUnverified = false;
    }

    this.rules
      .filter((r) => r.domain === pack.domain)
      .forEach((r) => {
        if (r.status !== 'DISPUTED') {
          r.status = 'VERIFIED';
          r.verifiedByName = req.verifierName;
          r.verifiedByRole = req.verifierRole;
          r.verifiedAt = new Date().toISOString();
        }
      });

    return pack;
  }

  async activatePack(packId: string, req: ActivatePackRequest): Promise<any> {
    const pack = this.packs.find((p) => p.id === packId);
    if (!pack) throw new Error('Paket tapılmadı');

    (pack as any).status = 'VERIFIED';
    (pack as any).effectiveFrom = req.effectiveFrom;
    return pack;
  }

  async proposeChange(packId: string, req: any): Promise<any> {
    return this.proposePackVersion(packId, {
      effectiveFrom: new Date().toISOString(),
      notes: req.changeNotes,
      rules: [],
    });
  }

  async completeObligation(id: string, notes?: string): Promise<any> {
    return this.updateObligation(id, {
      status: 'COMPLETED',
      evidenceNotes: notes || 'Hesabat icra edildi və təsdiqləndi',
      completedAt: new Date().toISOString(),
    });
  }

  async getStatusSummary(): Promise<ComplianceStatusSummary> {
    const domainStatuses = this.packs.map((p) => {
      const isDisputed = this.rules.some((r) => r.domain === p.domain && r.status === 'DISPUTED');
      const isUnverified = this.rules.some((r) => r.domain === p.domain && r.status === 'UNVERIFIED');

      let st: any = 'ACTIVE-VERIFIED';
      if (isDisputed) st = 'DISPUTED';
      else if (isUnverified) st = 'ACTIVE-UNVERIFIED';

      return {
        domain: p.domain,
        status: st,
        packCode: p.code,
        packVersionId: p.activeVersionId,
        bannerUnverified: isUnverified,
        disputedRuleKeys: this.rules.filter((r) => r.domain === p.domain && r.status === 'DISPUTED').map((r) => r.ruleKey),
        lastVerifiedAt: '2026-10-20T10:00:00Z',
        verifiedByName: 'Vüqar Məmmədov (Baş Mühasib)',
      };
    });

    const hasCritical = domainStatuses.some((d) => d.status === 'DISPUTED' || d.status === 'MISSING');

    return {
      environment: this.isProduction ? 'production' : 'development (DEMO)',
      isProduction: this.isProduction,
      domains: domainStatuses,
      totalRulePacks: this.packs.length,
      unverifiedCount: this.packs.filter((p) => p.status === 'UNVERIFIED').length,
      disputedCount: this.packs.filter((p) => p.status === 'DISPUTED').length,
      critical: this.isProduction && hasCritical,
      isDemo: true,
    } as any;
  }

  async getBanner(): Promise<ComplianceBannerResponse> {
    const unverified = this.rules.filter((r) => r.status === 'UNVERIFIED' || r.status === 'DISPUTED').map((r) => r.domain);
    const uniqueDomains = Array.from(new Set(unverified));

    return {
      showBanner: uniqueDomains.length > 0,
      messageAz: 'QEYD: Bəzi compliance qayda paketləri UNVERIFIED və ya mübahisəlidir (DEMO). Hüquqi uyğunluq iddiası YOXDUR. Baş mühasib/vəkil təsdiqi tələb olunur.',
      unverifiedDomains: uniqueDomains,
      unverifiedCount: this.packs.filter((p) => p.status === 'UNVERIFIED').length,
      disputedCount: this.packs.filter((p) => p.status === 'DISPUTED').length,
      environment: this.isProduction ? 'production' : 'development (DEMO)',
      isDemo: true,
    } as any;
  }

  async getRules(params?: { domain?: string; status?: string; ruleKey?: string }): Promise<LegalRule[]> {
    let res = [...this.rules];
    if (params?.domain) res = res.filter((r) => r.domain === params.domain);
    if (params?.status) res = res.filter((r) => r.status === params.status);
    if (params?.ruleKey) res = res.filter((r) => r.ruleKey.toLowerCase().includes(params.ruleKey!.toLowerCase()));
    return res;
  }

  async getRuleById(id: string): Promise<LegalRule | null> {
    return this.rules.find((r) => r.id === id) || null;
  }

  async getRuleHistory(id: string): Promise<LegalRule[]> {
    const target = this.rules.find((r) => r.id === id);
    if (!target) return [];
    return this.rules.filter((r) => r.ruleKey === target.ruleKey);
  }

  async getPacks(): Promise<RulePack[]> {
    return this.packs;
  }

  async proposePackVersion(packId: string, req: ProposeChangeRequest): Promise<RulePackVersion> {
    const pack = this.packs.find((p) => p.id === packId);
    if (!pack) throw new Error('Paket tapılmadı');

    const newVerId = `ver-${Date.now()}`;
    const newVersion: RulePackVersion = {
      id: newVerId,
      packId,
      version: (pack.versions?.length || 1) + 1,
      status: 'DRAFT',
      effectiveFrom: req.effectiveFrom,
      bannerUnverified: true,
      createdBy: 'current-user-id',
      createdAt: new Date().toISOString(),
      notes: req.notes,
      isDemo: true,
    };

    req.rules.forEach((r, idx) => {
      this.rules.push({
        id: `rule-prop-${Date.now()}-${idx}`,
        ruleKey: r.ruleKey,
        jurisdiction: 'AZ',
        domain: pack.domain,
        titleAz: r.titleAz,
        parameters: r.parameters,
        effectiveFrom: req.effectiveFrom,
        legalReference: r.legalReference,
        sourceUrl: r.sourceUrl,
        sourceType: r.sourceType || 'SECONDARY',
        status: 'UNVERIFIED',
        version: newVersion.version,
        packVersionId: newVerId,
        createdAt: new Date().toISOString(),
        editorId: 'current-user-id',
        isDemo: true,
      });
    });

    if (!pack.versions) pack.versions = [];
    pack.versions.push(newVersion);
    return newVersion;
  }

  async verifyPackVersion(versionId: string, req: VerifyPackRequest): Promise<RulePackVersion> {
    const version = this.packs.flatMap((p) => p.versions || []).find((v) => v.id === versionId);
    if (!version) throw new Error('Versiya tapılmadı');

    // Two-person rule enforcement:
    if (version.createdBy === 'current-user-id') {
      throw new Error('İki nəfər qaydası: Redaktor öz təklif etdiyi versiyanı yoxlaya/təsdiqləyə bilməz (verifier ≠ editor).');
    }
    if (!req.evidenceNotes || req.evidenceNotes.trim().length < 20) {
      throw new Error('Sübut qeydləri ən azı 20 simvol olmalıdır.');
    }

    version.status = 'VERIFIED';
    version.bannerUnverified = false;

    // Mark rules verified unless disputed
    this.rules
      .filter((r) => r.packVersionId === versionId)
      .forEach((r) => {
        if (r.status !== 'DISPUTED') {
          r.status = 'VERIFIED';
          r.verifiedByName = req.verifierName;
          r.verifiedByRole = req.verifierRole;
          r.verifiedAt = new Date().toISOString();
        }
      });

    return version;
  }

  async rejectPackVersion(versionId: string, _req: { verifierName: string; verifierRole: VerifierRole; evidenceNotes: string }): Promise<RulePackVersion> {
    const version = this.packs.flatMap((p) => p.versions || []).find((v) => v.id === versionId);
    if (!version) throw new Error('Versiya tapılmadı');
    version.status = 'REJECTED';
    return version;
  }

  async activatePackVersion(versionId: string, req: ActivatePackRequest): Promise<RulePackVersion> {
    let targetPack: RulePack | undefined;
    let targetVersion: RulePackVersion | undefined;

    for (const p of this.packs) {
      const v = (p.versions || []).find((ver: any) => ver.id === versionId);
      if (v) {
        targetPack = p;
        targetVersion = v;
        break;
      }
    }

    if (!targetPack || !targetVersion) throw new Error('Versiya tapılmadı');

    // DISPUTED check
    const hasDisputed = this.rules.some((r) => r.packVersionId === versionId && r.status === 'DISPUTED');
    if (hasDisputed) {
      throw new Error('Mübahisəli (DISPUTED) qaydalar olan paket aktivləşdirilə bilməz. Əvvəlcə həll edilməlidir.');
    }

    targetVersion.status = 'ACTIVE';
    targetVersion.activatedAt = new Date().toISOString();
    targetVersion.effectiveFrom = req.effectiveFrom;
    targetPack.activeVersionId = targetVersion.id;

    return targetVersion;
  }

  async diffPackVersions(versionAId: string, versionBId: string): Promise<VersionDiff> {
    const rulesA = this.rules.filter((r) => r.packVersionId === versionAId);
    const rulesB = this.rules.filter((r) => r.packVersionId === versionBId);

    const mapA = new Map(rulesA.map((r) => [r.ruleKey, r]));
    const mapB = new Map(rulesB.map((r) => [r.ruleKey, r]));

    const added: any[] = [];
    const removed: any[] = [];
    const changed: any[] = [];

    mapB.forEach((rb, key) => {
      const ra = mapA.get(key);
      if (!ra) {
        added.push({ ruleKey: key, parameters: rb.parameters, status: rb.status });
      } else if (JSON.stringify(ra.parameters) !== JSON.stringify(rb.parameters) || ra.status !== rb.status) {
        changed.push({
          ruleKey: key,
          before: { parameters: ra.parameters, status: ra.status },
          after: { parameters: rb.parameters, status: rb.status },
        });
      }
    });

    mapA.forEach((ra, key) => {
      if (!mapB.has(key)) {
        removed.push({ ruleKey: key, parameters: ra.parameters, status: ra.status });
      }
    });

    return {
      versionAId,
      versionBId,
      added,
      removed,
      changed,
    };
  }

  async exportRegister(format: 'csv' | 'pdf'): Promise<{ filename: string; body: string; disclaimer: string }> {
    const disclaimer = 'DRAFT FOR ACCOUNTANT REVIEW — Sistem hüquqi məsləhət deyil, dəstək verir. Qaydalar rəsmi mənbələrlə yoxlanmalıdır.';
    if (format === 'csv') {
      const lines = ['rule_key,domain,title_az,status,effective_from,legal_reference'];
      this.rules.forEach((r) => {
        lines.push(`${r.ruleKey},${r.domain},"${r.titleAz}",${r.status},${r.effectiveFrom},"${r.legalReference?.actName || ''}"`);
      });
      return {
        filename: 'compliance_register.csv',
        body: lines.join('\n') + `\n# ${disclaimer}`,
        disclaimer,
      };
    }
    return {
      filename: 'compliance_register.pdf',
      body: `HÜQUQİ REYESTR VƏ QAYDALAR HESABATI (DRAFT)\n${disclaimer}\n\nQaydaların sayı: ${this.rules.length}`,
      disclaimer,
    };
  }

  // -------------------------------------------------------------
  // OBLIGATIONS
  // -------------------------------------------------------------

  async getObligations(status?: string): Promise<Obligation[]> {
    if (!status) return this.obligations;
    return this.obligations.filter((o) => o.status === status);
  }

  async createObligation(req: Partial<Obligation>): Promise<Obligation> {
    const newOb: Obligation = {
      id: `ob-${Date.now()}`,
      templateCode: req.templateCode || 'custom_duty',
      titleAz: req.titleAz || 'Yeni Öhdəlik (DEMO)',
      ownerUserId: req.ownerUserId || 'usr-1',
      ownerName: req.ownerName || 'Təyin edilən şəxs',
      cadence: req.cadence || 'monthly',
      nextDue: req.nextDue || new Date().toISOString().slice(0, 10),
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };
    this.obligations.push(newOb);
    return newOb;
  }

  async updateObligation(id: string, req: Partial<Obligation>): Promise<Obligation> {
    const ob = this.obligations.find((o) => o.id === id);
    if (!ob) throw new Error('Öhdəlik tapılmadı');
    Object.assign(ob, req, { updatedAt: new Date().toISOString() });
    if (req.status === 'COMPLETED' && !ob.completedAt) {
      ob.completedAt = new Date().toISOString();
    }
    return ob;
  }

  async deleteObligation(id: string): Promise<boolean> {
    const idx = this.obligations.findIndex((o) => o.id === id);
    if (idx >= 0) {
      this.obligations[idx].status = 'CANCELLED';
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------
  // OPEN LEGAL QUESTIONS
  // -------------------------------------------------------------

  async getOpenLegalQuestions(): Promise<OpenLegalQuestion[]> {
    return this.openLegalQuestions;
  }

  async updateLegalQuestion(
    id: number,
    req: { assignee?: string; notes?: string; status?: 'PENDING_LEGAL' | 'RESOLVED' }
  ): Promise<OpenLegalQuestion> {
    const q = this.openLegalQuestions.find((item) => item.id === id);
    if (!q) throw new Error('Sual tapılmadı');
    if (req.assignee) q.assignee = req.assignee;
    if (req.notes) q.resolutionNotes = req.notes;
    if (req.status) q.status = req.status;
    return q;
  }

  // -------------------------------------------------------------
  // FISCAL & TURNOVER
  // -------------------------------------------------------------

  async getFiscalStatus(): Promise<FiscalStatus> {
    return this.fiscalStatus;
  }

  async reconcileFiscal(): Promise<{ reconciled: boolean; matchedCount: number; driftFound: boolean; details: string }> {
    return {
      reconciled: true,
      matchedCount: 42,
      driftFound: false,
      details: 'Kassa aparatı və ERP satış cəmləri 100% uzlaşdı (1845.50 ₼). İkiqat çek və ya itmiş qeyd aşkarlanmadı.',
    };
  }

  async getTurnoverMonitor(): Promise<TurnoverMonitorData> {
    return this.turnoverMonitor;
  }

  // -------------------------------------------------------------
  // PRIVACY & RETENTION
  // -------------------------------------------------------------

  async getDataProcessingRegister(): Promise<DataProcessingRegisterEntry[]> {
    return this.dataProcessingRegister;
  }

  async getTransferRegister(): Promise<TransferRegisterEntry[]> {
    return this.transferRegister;
  }

  async updateTransferRegister(id: string, req: Partial<TransferRegisterEntry>): Promise<TransferRegisterEntry> {
    const tr = this.transferRegister.find((t) => t.id === id);
    if (!tr) throw new Error('Transfer qeydi tapılmadı');
    Object.assign(tr, req, { updatedAt: new Date().toISOString() });
    return tr;
  }

  async getPersonalDataRegistration(): Promise<PersonalDataSystemRegistration> {
    return this.personalDataRegistration;
  }

  async getDsarRequests(): Promise<DsarRequest[]> {
    return this.dsarRequests;
  }

  async updateDsarRequest(id: string, req: Partial<DsarRequest>): Promise<DsarRequest> {
    const r = this.dsarRequests.find((d) => d.id === id);
    if (!r) throw new Error('DSAR müraciəti tapılmadı');
    Object.assign(r, req);
    return r;
  }

  async getRetentionRules(): Promise<RetentionRuleItem[]> {
    return this.retentionRules;
  }

  async getLegalHolds(): Promise<LegalHoldItem[]> {
    return this.legalHolds;
  }

  async createLegalHold(req: { entityType: string; entityId: string; reason: string; heldByName: string }): Promise<LegalHoldItem> {
    const newHold: LegalHoldItem = {
      id: `hold-${Date.now()}`,
      entityType: req.entityType,
      entityId: req.entityId,
      reason: req.reason,
      heldByName: req.heldByName,
      heldAt: new Date().toISOString(),
      active: true,
    };
    this.legalHolds.push(newHold);
    return newHold;
  }

  async releaseLegalHold(id: string, releasedByName: string): Promise<LegalHoldItem> {
    const h = this.legalHolds.find((item) => item.id === id);
    if (!h) throw new Error('Legal hold tapılmadı');
    h.active = false;
    h.releasedAt = new Date().toISOString();
    h.releasedByName = releasedByName;
    return h;
  }

  async getConsentRecords(subjectId?: string): Promise<ConsentRecord[]> {
    if (!subjectId) return this.consentRecords;
    return this.consentRecords.filter((c) => c.subjectId === subjectId);
  }

  async saveConsentRecord(record: Partial<ConsentRecord>): Promise<ConsentRecord> {
    const newRecord: ConsentRecord = {
      id: `cs-${Date.now()}`,
      subjectId: record.subjectId || 'cust-new',
      subjectType: record.subjectType || 'customer',
      subjectName: record.subjectName || 'Naməlum Şəxs',
      formVersionId: record.formVersionId || 'form-az-v1',
      consentTextHash: 'hash-' + Date.now(),
      purposes: record.purposes || {
        loyalty: true,
        smsMarketing: false,
        emailMarketing: false,
        profiling: false,
        crossBorderTransfer: false,
      },
      captureMethod: record.captureMethod || 'checkbox_otp',
      evidenceFileId: record.evidenceFileId,
      capturedByName: record.capturedByName || 'Cari İstifadəçi',
      capturedAt: new Date().toISOString(),
      verified: true,
      historyTimeline: [
        { date: new Date().toISOString(), action: 'Razılıq qeydə alındı', actor: record.capturedByName || 'Cari İstifadəçi' },
      ],
      isDemo: true,
    };
    this.consentRecords.push(newRecord);
    return newRecord;
  }

  async generateInspectionPack(periodFrom: string = '2026-01-01', periodTo: string = '2026-12-31'): Promise<InspectionPackResponse> {
    const basePack = {
      packId: `insp-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      periodFrom,
      periodTo,
      sha256Hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      integrityHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      manifest: {
        rulesCount: this.rules.length,
        domains: this.packs.map((p) => p.domain),
        generatedBy: 'BRAND_HOUSE_COMPLIANCE_ENGINE',
      },
      summary: {
        fiscalReconciliationStatus: '100% Uyğun (Kassa vs ERP)',
        vatTotalPayable: 25650.0,
        payrollContributionsTotal: 18450.0,
        returnsProcessedCount: 14,
        consentsRegisteredCount: this.consentRecords.length,
      },
      isDraft: true,
      downloadUrl: '/api/v1/compliance/inspection-pack/bundle.zip',
    };
    return basePack;
  }

  async getProductionCalendar(year: number): Promise<ProductionCalendarYear> {
    return {
      year,
      workingDays: 241,
      workingHours: 1922,
      status: 'VERIFIED',
      sourceRef: 'Nazirlər Kabinetinin 2026-cı il İstehsalat Təqvimi Qərarı',
      days: {
        holidays: ['2026-01-01', '2026-01-02', '2026-01-20', '2026-03-20', '2026-03-21', '2026-03-22', '2026-03-23', '2026-03-24'],
        shortened: ['2026-03-19', '2026-12-30'],
        transferred: [],
      },
    };
  }

  async importProductionCalendar(data: Partial<ProductionCalendarYear>): Promise<ProductionCalendarYear> {
    return {
      year: data.year || 2026,
      workingDays: data.workingDays || 241,
      workingHours: data.workingHours || 1922,
      status: 'VERIFIED',
      sourceRef: data.sourceRef || 'İdxal edilmiş rəsmi təqvim',
      days: data.days || { holidays: [], shortened: [], transferred: [] },
    };
  }
}
