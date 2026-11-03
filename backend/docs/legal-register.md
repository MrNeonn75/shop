# Legal Register (Azərbaycan Respublikası Qanunvericilik Reyestri)

> [!WARNING]
> **HÜQUQİ XƏBƏRDARLIQ VƏ QEYD:**
> Bu sənəddə və sistemdə toxumlanmış (seeded) bütün qayda paketləri, faiz dərəcələri, hədlər və müddətlər ikinci dərəcəli (secondary) mənbələrdən toplanmış **İSTİNAD / REFERANS MƏLUMATLARIDIR** və statusları **UNVERIFIED** və ya **DISPUTED** olaraq qeyd edilmişdir.
> Sistem hüquqi və ya vergi məsləhəti vermir, avtomatik "hüquqa tam uyğunluq" iddiası irəli sürmür. İstehsalat mühitində (`ENV=production`) istifadədən öncə şirkətin səlahiyyətli mühasibi və hüquqşünası tərəfindən ilkin hüquqi aktlara (qanun, məcəllə, Nazirlər Kabineti qərarları) istinad edilərək yoxlanılmalı (**VERIFIED**) və iki nəfər qaydası ilə aktivləşdirilməlidir.

---

## 1. Əsas Prinsiplər

1. **Qanun KOD DEYİL, VERİLƏNLƏRDİR (Law is DATA):**
   Heç bir vergi dərəcəsi, DSMF faizi, minimum əməkhaqqı, iş vaxtı norması və ya qaytarma müddəti backend kodunda birbaşa (`hardcoded`) yazılmır. Bütün parametrlər versiyalanan, effektiv tarixləri olan qayda paketlərində (`rule_packs`, `rule_pack_versions`, `legal_rules`) saxlanılır. Qanunvericilik dəyişdikdə sistem kodu yenidən deploy edilmir, yalnız yeni qayda paketi versiyası təklif olunur və aktivləşdirilir.
2. **Asia/Baku Midnight Boundary (Effektiv Tarix Sərhədi):**
   Bütün hüquqi qüvvəyə minmə tarixləri (`effective_from`, `effective_to`) `Asia/Baku` vaxt zonası üzrə gecə yarısı (saat 00:00:00) sərhədi ilə hesablanır və UTC formatında saxlanılır.
3. **İki Nəfər Qaydası (Two-Person Verification Rule):**
   Qayda paketini redaktə edən / təklif edən istifadəçi (`editor_id`) həmin versiyanı təsdiq edə bilməz (`verifier ≠ editor`). Təsdiqləmə üçün sübut faylı (`evidence_file_id`) və ya ətraflı əsaslandırma qeydi (`evidence_notes` ≥ 20 simvol) tələb olunur.
4. **Mübahisəli Mənbələr (DISPUTED Rules):**
   Mənbələr arasında ziddiyyət olduqda (məsələn, icbari tibbi sığorta həddi 2,500 yoxsa 8,000 AZN), qayda `DISPUTED` kimi qeyd edilir və sistem heç bir dəyəri seçmir. Mübahisəli qayda həll edilməyənədək paket aktivləşdirilə bilməz.
5. **İstehsalat Qapıları (Production Feature Gates):**
   İstehsalatda (`ENV=production`) yoxlanmamış (`UNVERIFIED`) və ya mübahisəli (`DISPUTED`) paketlərlə fiskal çek vurulması, vergi hesablanması və əməkhaqqı yekunlaşdırılması bloklanır (`COMPLIANCE_RULES_NOT_VERIFIED`). Qeyri-istehsalat mühitlərində isə xəbərdarlıq banneri ilə icazə verilir.
6. **Dövlət Sistemlərinə Avtomatik Təqdimatın Olmaması:**
   Sistem dövlət sistemlərinə (İnternet Vergi İdarəsi, e-kassa operatorları, ƏMAS) avtomatik heç nə göndərmir. Bütün sənədlər mühasib üçün `DRAFT FOR ACCOUNTANT REVIEW` nişanı ilə hazırlanır.

---

## 2. Toxumlanmış Qayda Paketləri və Reyestr Cədvəli

Aşağıdakı cədvəldə sistemdə ilkin quraşdırılmış 9 hüquqi sahə üzrə istinad qaydaları təsvir olunub:

| Sahə (`domain`) | Qayda Açar Sözü (`rule_key`) | Başlıq (Az) | İlkin Parametrlər (JSON) | Hüquqi İstinad | Mənbə Növü | İlkin Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **tax_vat** | `vat.standard_rate` | ƏDV standart dərəcə | `{"rate": 0.18, "price_mode": "VAT_INCLUSIVE", "split_formula": "vat = gross * rate / (1 + rate)"}` | Vergi Məcəlləsi, maddə 173 | SECONDARY | `UNVERIFIED` |
| **tax_vat** | `vat.tax_classes` | Vergi sinifləri | `{"STANDARD": {"rate": 0.18}, "EXEMPT": {"rate": 0.0}, "ZERO": {"rate": 0.0}, "SIMPLIFIED_TAX_PAYER": {"regime_flag": true}}` | Vergi Məcəlləsi | SECONDARY | `UNVERIFIED` |
| **tax_vat** | `vat.turnover_threshold` | ƏDV qeydiyyat dövriyyə həddi | `{"annual_turnover_azn": 200000, "cashless_unregistered_coefficient": 0.5, "alert_percents": [80, 95, 100], "indicative_only": true}` | Vergi Məcəlləsi, maddə 155.1-1 | SECONDARY | `UNVERIFIED` |
| **fiscal_receipt** | `fiscal.mandatory_receipt_fields` | Fiskal qəbzin məcburi elementləri | `{"fields": ["taxpayer_name", "voen", "datetime", "outlet_name", "tax_office_registration_code", "address", "line_item_name", "unit", "quantity", "unit_price", "line_total", "vat_rate_or_simplified_rate", "vat_amount", "receipt_number_in_shift", "cash_register_make", "cash_register_serial", "fiscal_mode_mark", "qr_code", "amount_paid", "advance_amount", "change_returned", "outstanding_amount", "payment_form", "receipt_type", "control_mechanism_registration_no"]}` | Vergi Məcəlləsi, maddə 16.1.8 | SECONDARY | `UNVERIFIED` |
| **payroll_tax** | `payroll.minimum_wage` | Minimum aylıq əmək haqqı | `{"amount_azn": 400, "enforcement": "block_unless_part_time_proration"}` | AR Prezidentinin Sərəncamı / Qanunvericilik | SECONDARY | `UNVERIFIED` |
| **payroll_tax** | `payroll.income_tax.brackets_2026` | Gəlir vergisi mötərizələri (keçid 2026) | `{"brackets": [{"up_to": 2500, "rate": 0.03, "base": 0}, {"up_to": 8000, "rate": 0.10, "base": 75, "excess_over": 2500}, {"up_to": null, "rate": 0.14, "base": 625, "excess_over": 8000}], "transitional_until": "2026-12-31", "next_pack_required_before": "2027-01-01", "reminder_days_before": 60}` | Vergi Məcəlləsi (özəl qeyri-neft keçid cədvəli) | SECONDARY | `UNVERIFIED` |
| **payroll_social** | `payroll.dsmf.employee` | DSMF işçi töhfəsi | `{"brackets": [{"up_to": 200, "rate": 0.03}, {"up_to": null, "fixed": 6, "rate_above": 0.10, "excess_over": 200}]}` | Sosial sığorta haqqında Qanun | SECONDARY | `UNVERIFIED` |
| **payroll_social** | `payroll.dsmf.employer` | DSMF işəgötürən töhfəsi | `{"sources_conflict": true, "variants": [{"label": "variant_a_22pct_then_15", "brackets": [{"up_to": 200, "rate": 0.22}, {"up_to": null, "rate": 0.15, "excess_over": 200}], "reduced_above_8000_rate": 0.11}, {"label": "variant_b_flat_44", "note": "44 AZN on first 200"}, {"label": "variant_c_2_15", "note": "2%/15% structure"}], "no_default_activated": true}` | Ziddiyyətli ikincili mənbələr | SECONDARY | **`DISPUTED`** |
| **payroll_social** | `payroll.unemployment` | İşsizlikdən sığorta | `{"employee_rate": 0.005, "employer_rate": 0.005}` | İşsizlikdən sığorta haqqında Qanun | SECONDARY | `UNVERIFIED` |
| **payroll_social** | `payroll.medical_insurance` | İcbari tibbi sığorta | `{"employee_rate_below": 0.02, "employer_rate_below": 0.02, "employee_rate_above": 0.005, "employer_rate_above": 0.005, "threshold_variants_azn": [2500, 8000], "sources_conflict": true, "no_default_activated": true}` | Tibbi sığorta haqqında Qanun | SECONDARY | **`DISPUTED`** |
| **labor_time** | `labor.normal_working_time` | Normal iş vaxtı rejimləri | `{"max_hours_day": 8, "max_hours_week": 40, "six_day_max_hours_day": 7, "cumulative_shift_cap_hours": 12, "pre_holiday_shorten_hours": 1}` | Əmək Məcəlləsi (16 Yan 2026 dəyişiklikləri) | SECONDARY | `UNVERIFIED` |
| **labor_time** | `labor.night_work` | Gecə işi pəncərəsi | `{"start": "22:00", "end": "06:00", "supplement_rate": null}` | Əmək Məcəlləsi | SECONDARY | `UNVERIFIED` |
| **labor_time** | `labor.overtime` | Əlavə iş hədləri və əmsalı | `{"min_multiplier": 2.0, "limits_disputed": true, "reference_limits_unverified": {"max_hours_two_consecutive_days": 4, "max_hours_year": 120}, "consent_required": true, "enforcement": "warn"}` | Əmək Məcəlləsi, maddə 165 | SECONDARY | **`DISPUTED`** |
| **labor_time** | `labor.holiday_work_multiplier` | İstirahət/bayram günü əmsalı | `{"multiplier": 2.0}` | Əmək Məcəlləsi | SECONDARY | `UNVERIFIED` |
| **labor_time** | `labor.salary_payment_frequency` | Əməkhaqqı ödəniş tezliyi | `{"min_times_per_month": 2, "max_interval_days": 16, "enforcement": "warn"}` | Əmək Məcəlləsi | SECONDARY | `UNVERIFIED` |
| **labor_time** | `labor.production_calendar_2026_hint` | 2026 istehsalat təqvimi referansı | `{"working_days": 241, "working_hours": 1922, "week_type": "5-day-40h", "must_import_official_calendar": true}` | Nazirlər Kabineti istehsalat təqvimi | SECONDARY | `UNVERIFIED` |
| **labor_leave** | `labor.annual_leave.minimum` | Minimum əsas əmək məzuniyyəti | `{"calendar_days": 21}` | Əmək Məcəlləsi, maddə 114 | SECONDARY | `UNVERIFIED` |
| **labor_leave** | `labor.annual_leave.white_collar_ref` | İdarəetmə/mütəxəssis məzuniyyəti | `{"calendar_days": 30, "requires_job_category_mapping": true, "unverified": true}` | Əmək Məcəlləsi (kateqoriya bölgüsü) | SECONDARY | `UNVERIFIED` |
| **consumer_returns** | `returns.exchange_window_days` | Dəyişdirmə/qaytarma müddəti | `{"days": 14, "exclude_purchase_day": true, "count_calendar_days": true, "unused_and_labels_required": true, "proof_of_purchase_required": true}` | İstehlakçıların hüquqlarının müdafiəsi haqqında Qanun No. 1113 | SECONDARY | `UNVERIFIED` |
| **consumer_returns** | `returns.default_returnability` | Malların qaytarılma dərəcəsi | `{"footwear": "RETURNABLE", "clothing": "RETURNABLE", "non_returnable_list_source": "Cabinet Decision No. 114 — VERIFY"}` | Nazirlər Kabinetinin 114 saylı Qərarı | SECONDARY | `UNVERIFIED` |
| **personal_data** | `privacy.consent_required` | Yazılı razılıq və məlumat qorunması | `{"written_consent_required_unless_exception": true, "cross_border_requires_equivalent_or_consent": true, "system_registration_generally_required": true, "authority_unverified": true}` | Fərdi məlumatlar haqqında Qanun No. 998-IIIQ | SECONDARY | `UNVERIFIED` |
| **retention** | `retention.tax_archive_years` | Vergi sənədlərinin saxlanma müddəti | `{"years": 5, "entity_types": ["fiscal_receipt", "sale", "tax_invoice_ref"]}` | Vergi Məcəlləsi (arxiv tələbləri) | SECONDARY | `UNVERIFIED` |
| **retention** | `retention.accounting_law` | Mühasibat sənədləri saxlama | `{"status": "MISSING", "must_be_provided_by_accountant": true}` | Mühasibat uçotu haqqında Qanun | SECONDARY | **`MISSING`** |

---

## 3. Öhdəlik Şablonları (`ObligationTemplate`)

Sistem heç bir son icra tarixini (`deadline`) kodda saxlamır. Öhdəliklərin icra tezliyi (`cadence`) və dəqiq son tarixləri (`next_due`) şirkətin baş mühasibi tərəfindən daxil edilir:

1. `payroll_declaration_monthly`: Aylıq vahid bəyannamə / DSMF və gəlir vergisi ödənişləri (Aylıq).
2. `vat_return_payment`: ƏDV bəyannaməsi və ödənişi (ƏDV ödəyicisi olduğu təqdirdə, aylıq/rüblük).
3. `simplified_tax_return`: Sadələşdirilmiş vergi bəyannaməsi (Müvafiq vergi rejimi tətbiq edildikdə, rüblük).
4. `annual_profit_income_tax`: İllik mənfəət / gəlir vergisi hesabatı (İllik).
5. `ekassa_device_maintenance`: E-kassa cihaz qeydiyyatı, fiskal modul və texniki servis yoxlamaları (Dövri).
6. `personal_data_registration_review`: Fərdi məlumat informasiya sistemlərinin dövlət reyestrində qeydiyyatının illik nəzərdən keçirilməsi (İllik).
7. `rule_pack_review_quarterly`: Qanunvericilik dəyişikliklərinin və qayda paketlərinin rüblük auditi (Rüblük).
8. `transitional_rate_change_review`: 2026 keçid dərəcələrinin bitməsi (1 Yanvar 2027-dən əvvəl yeni paket qəbulu).
9. `minimum_wage_review`: İllik minimum əməkhaqqı dəyişikliklərinin yoxlanması.
10. `annual_production_calendar_import`: Yeni təqvim ili üzrə Nazirlər Kabinetinin rəsmi istehsalat təqviminin importu.
11. `retention_schedule_review`: Arxivləşdirmə və sənəd saxlama müddətlərinin illik təftişi.

---

## 4. Emal Əməliyyatları Reyestri (`data_processing_register`)

Fərdi Məlumatlar haqqında Qanunun tələblərinə uyğun olaraq sistemdə ilkin inventarizasiya edilmiş emal sahələri:
- **CRM və Müştəri Profilləri:** Ad, soyad, mobil nömrə (Razılıq əsasında; marketinq kanalları ayrıca təsdiqlənir; FİN CRM-də toplanmır).
- **Loyallıq Proqramı:** Ad, nömrə, bonus balı, alış tarixçəsi (Razılıq əsasında; OTP və ya yazılı ərizə).
- **Kadr və Əməkhaqqı (HR/Payroll):** Şəxsiyyət vəsiqəsi, bank hesabı, doğum tarixi, əmək müqaviləsi şərtləri (Əmək müqaviləsi və qanunvericilik tələbi əsasında; PII sütun səviyyəsində şifrələnir).
- **POS və Satış Qəbzləri:** Müştəri ödəniş forması, çek məlumatları (Maliyyə-vergi hesabatlılığı əsasında; 5 il saxlanılır).
- **Audit Qeydləri (`AuditLog`):** Sistemdə hərəkət edən istifadəçi İD-si, İP ünvanı, dəyişiklik jurnalı (Təhlükəsizlik və hüquqi öhdəlik əsasında).

---

## 5. Reyestrin İxracı və Tarixi Snapshot

Reyestr məlumatları istənilən vaxt API vasitəsilə ixrac edilə bilər:
- `GET /compliance/register/export?format=csv` (CSV formatında cədvəl, xəbərdarlıq qeydi ilə).
- `GET /compliance/register/export?format=pdf` (Mühasib/auditor təftişi üçün strukturlaşdırılmış mətn).

Hər bir maliyyə sənədi (satış fakturası, kassa çeki, əməkhaqqı cədvəli) tərtib olunduğu andakı qayda ID-lərini və snapshot heşini (`snapshot_hash`) saxlayır. Bu, gələcəkdə qanunvericilik dəyişsə belə, tarixi sənədlərin həmin günün hüquqi qaydaları ilə 100% bərpa olunmasını təmin edir.
