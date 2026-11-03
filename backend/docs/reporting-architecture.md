# Brand House ERP — Hesabatlılıq və Analitika Arxitekturası

## 1. Giriş və Əsas Prinsiplər
Brand House ERP hesabatlılıq və analitika alt-sistemi Modular Monolith prinsiplərinə tam uyğun olaraq aşağıdakı əsas qaydalar üzərində qurulmuşdur:

1. **Həqiqi Məlumatlara Əsaslanma:** Sistem heç bir halda uydurma və ya təxmini (placeholder) rəqəm qaytarmır. Əgər göstərici üçün zəruri girişlər yoxdursa, dəqiq statuslar qaytarılır:
   - `NO_DATA`: Tarix intervalında heç bir əməliyyat baş verməyib.
   - `NOT_COMPUTABLE`: Göstərici riyazi olaraq hesablana bilmir (məsələn, maya dəyəri snapshot-ı yoxdur və ya bölən 0-dır). Cavabda `missing_inputs` massivi verilir.
   - `NOT_CONFIGURED`: Xarici inteqrasiya və ya sistem parametri qurulmayıb.
2. **Yeganə KPI Reyestri:** Hər bir göstəricinin tək bir ID-si, düsturu, azərbaycan dilində etiketi və mənbə cədvəlləri reyestrdə (`kpi_registry.py`) qeydiyyatdadır. API cavabları hər rəqəmin yanında `definition_id` qaytarır.
3. **Maliyyə Dəqiqliyi və Saat Qurşağı:** Bütün pul məbləğləri `Decimal(14, 2)` (və ya Maya dəyərində `Decimal(18, 4)`) saxlanılır və hesablanır. Biznes günü sərhədləri `Asia/Baku` (UTC+4) saat qurşağı ilə müəyyən edilir.
4. **Tranzaksional Yoldan Təcrid:** Hesabat sorğuları heç bir halda POS satışı və ya stok hərəkəti tranzaksiyalarını kilidləmir (Row-level lock və ya cədvəl kilidi yaratmır).

---

## 2. Oxu Modelləri (Read Models & Summary Tables)
Hesabatların p95 < 500 ms sürəti ilə icra olunmasını təmin etmək üçün hadisə-əsaslı (event-driven) xülasə cədvəlləri yaradılmışdır:

| Cədvəl Adı | Əhatə Etdiyi Sahə | Əsas Qruplaşdırma Ölçüləri |
|---|---|---|
| `reporting_daily_sales_summary` | Gündəlik Satış və Ödənişlər | `report_date`, `branch_id`, `cashier_id`, `register_id`, `tender_type` |
| `reporting_daily_sales_by_variant` | Məhsul və Çeşid Satışları | `report_date`, `branch_id`, `variant_id`, `category_id`, `brand_id` |
| `reporting_daily_returns_summary` | Qaytarmalar və Geri Ödənişlər | `report_date`, `branch_id`, `cashier_id`, `return_reason` |
| `reporting_inventory_velocity` | Stok Satış Sürəti (7/28/56 gün) | `variant_id`, `warehouse_id` |
| `reporting_purchasing_summary` | Satınalma və Təchizat Borcları | `report_date`, `branch_id`, `supplier_id` |
| `reporting_expense_summary` | Əməliyyat Xərcləri | `report_date`, `branch_id`, `expense_category` |
| `reporting_payroll_summary` | Əmək Haqqı Xərcləri | `period_year`, `period_month`, `department_id`, `branch_id` |
| `reporting_campaign_attribution_summary` | Kampaniya və Aksiya Təsirləri | `report_date`, `campaign_id`, `promotion_id` |
| `reporting_loyalty_activity_summary` | Loyallıq Xal Dövriyyəsi | `report_date`, `branch_id` |
| `reporting_customer_metrics` | Müştəri Seqmentasiyası və RFM | `customer_id` |

### Yenilənmə və Drift İdarəetməsi (Refresh & Reconciliation)
1. **İnkremental Hadisə İstehlakı:** Outbox vasitəsilə yayımlanan `sale.completed`, `return.completed` və digər hadisələr `app/worker.py` tərəfindən oxunaraq müvafiq günün xülasə cədvəlinə əlavə edilir. Hər yeniləmədə `source_version` artırılır.
2. **Gecəlik Uzlaşdırma (Nightly Reconciliation):** Hər gecə saat 02:30-da ARQ worker `reconcile_reporting_summaries_job` tapşırığını icra edir. Ötən günün tranzaksional qəbzləri ilə xülasə cədvəli tutuşdurulur; fərq 0.01 AZN-dən çox olduqda sistem drift xəbərdarlığı qeydə alır.
3. **Məlumatın Təravəti (`data_as_of`):** Bütün hesabat və idarə paneli cavabları `data_as_of` ISO 8601 UTC vaxt damğasını qaytarır.

---

## 3. Hesabat Sistemi və Təhlükəsiz İcra Mexanizmi
Sistem 7 funksional modul üzrə 61 hazır hesabat şablonunu dəstəkləyir:
- **Satış (Sales):** Günlər, filiallar, kassirlər, ödəniş metodları, saatlıq trafik, çek detalları.
- **Anbar (Inventory):** Cari qalıqlar, maya dəyəri qiymətləndirilməsi, kritik qalıqlar, tükənmiş mallar, stok yaşlanması.
- **Satınalma (Purchasing):** Sifarişlər, qəbullar, təchizatçı borcları, qiymət dəyişiklikləri.
- **Maliyyə (Finance):** Gəlir-Xərc (P&L), pul vəsaitlərinin hərəkəti, ƏDV xülasəsi.
- **İnsan Resursları (HR):** Davamiyyət, gecikmələr, məzuniyyətlər, əmək haqqı fondu.
- **Marketinq və CRM (Marketing & CRM):** Kampaniya gəlirliliyi, RFM müştəri bölgüsü, loyallıq xalları.
- **Əməliyyat və Audit (Operations & Audit):** Kassa kənarlaşmaları, qiymət dəyişiklikləri, qeydlər jurnalı.

### Sütun Səviyyəsində Məxfilik və Maskalanma
- İstifadəçinin rolu və icazələri sorğu anında yoxlanılır (`ReportingPolicy`).
- `reports.cost.view` icazəsi olmayan istifadəçilərə maya dəyəri (`unit_cost`, `cogs_amount`) sütunları maskalanır və ya silinir.
- `reports.profit.view` icazəsi olmayan istifadəçilərə mənfəət və marja faizləri (`gross_profit`, `margin_percent`) təqdim edilmir.
- Filial menecerləri yalnız öz təhkim olunduqları filialların məlumatlarını görə bilirlər (`branch_scope_ids`).

---

## 4. Təhlükəsiz Hesabat Konstruktoru (Safe Report Builder)
Klient tərəfindən heç bir sərbəst SQL və ya cədvəl birləşdirməsi qəbul edilmir. Sorğular serverdə əvvəlcədən təyin edilmiş 5 semantik dataset üzərində ciddi whitelist ilə icra olunur:
1. `sales_lines` (Satış sətirləri)
2. `stock_movements` (Stok hərəkətləri)
3. `purchase_lines` (Satınalma sətirləri)
4. `expenses` (Əməliyyat xərcləri)
5. `customer_aggregates` (Müştəri aqreqasiyaları)

Konstruktor SQL injection riskini sıfıra endirmək üçün SQLAlchemy Core parametrik ifadələrinə tərtib olunur və filial filtrləri avtomatik yeridilir.

---

## 5. İxracat (Export) İcra Mexanizmi
Hesabatlar üç formatda ixrac edilə bilər:
- **CSV:** `utf-8-sig` (UTF-8 BOM) formatında, Excel proqramında Azərbaycan şriftlərinin (ə, ö, ğ, ı, ş, ç) düzgün açılmasını təmin edir.
- **XLSX:** `openpyxl` kitabxanası ilə zərif başlıq üslubları, cədvəl xətləri və avtomatik sütun genişlikləri ilə formalaşdırılır.
- **PDF:** `reportlab` mühərriki vasitəsilə səhifələnmiş rəsmi A4 landşaft sənədi olaraq generasiya edilir.

Bütün ixrac əməliyyatları audit jurnalında qeydə alınır (`report.exported`).

