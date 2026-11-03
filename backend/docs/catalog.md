# BRAND HOUSE ERP — Kataloq Modulu Spesifikasiyası (Catalog Module)

> **Modul:** `app.modules.catalog`  
> **Versiya:** 1.0.0  
> **Frontend Uyğunluğu:** F4 (Məhsul siyahısı, matris, kateqoriyalar, brendlər, etiket çapı, idxal/ixrac)

---

## 1. İcmal və Biznes Məqsədi

Kataloq modulu BRAND HOUSE pərakəndə satış şəbəkəsinin mərkəzi məhsul reyestrini təşkil edir. Modul geyim, ayaqqabı və aksesuarların çoxölçülü variant matrisini (Ölçü × Rəng), iyerarxik kateqoriya ağacını, dəyişməz qiymət/maya dəyəri tarixçəsini, termal etiket çapını və mərhələli idxal/ixrac boru kəmərini təmin edir.

---

## 2. Verilənlər Modeli və Cədvəl Strukturu

Modul 17 ədəd SQLAlchemy modelindən ibarətdir:

1. **`categories`**:
   - `id` (UUIDv7), `company_id`, `parent_id`, `name`, `code`, `level` (1..4), `path` (materialized path: `parent/child`), `sort_order`, `is_active`, `redirect_category_id` (birləşdirmə zamanı yönləndirmə).
   - **Təhlükəsizlik:** Dövri asılılıqların (cycle) qarşısının alınması və aktiv məhsulu olan kateqoriyanın deaktiv edilməsinin bloklanması.
2. **`brands`**:
   - `id`, `company_id`, `name` (unikal, case-insensitive), `code`, `logo_url`, `is_active`.
3. **`units_of_measure`**:
   - `id`, `code` (məs: `eded`, `metr`, `cut`), `name_az`, `precision`, `is_active`.
4. **`tax_classes`**:
   - `id`, `company_id`, `code` (məs: `EDV_18`, `EDV_0`), `name_az`, `rate_ref` (tənzimləmələrdəki açara istinad; faiz dərəcəsi birbaşa hardcode edilmir).
5. **`product_attributes` və `product_attribute_values`**:
   - `Ölçü`, `Rəng`, `Üslub`, `Model` və xüsusi istifadəçi atributları.
6. **`products`** (Valideyn / Üslub səviyyəsi):
   - `id`, `company_id`, `internal_code` (unikal), `name`, `normalized_name` (Azərbaycan dili üçün xüsusi hərf və vurğu normallaşdırılması: ə->e, ı->i, ö->o, ü->u, ç->c, ş->s, ğ->g), `section` (Kişi/Qadın/Uşaq/Digər), `type` (Geyim/Ayaqqabı/Aksesuar), `category_id`, `subcategory_id`, `brand_id`, `unit_id`, `tax_class_id`, `status` (`active`, `discontinued`, `draft`), `is_sell_through`, `min_stock_default`, `version`.
7. **`product_variants`** (Satıla bilən vahid səviyyəsi):
   - `id`, `product_id`, `sku` (qlobal unikal, case-insensitive), `barcode` (unikal EAN-13 və ya Code128), `size`, `color`, `other_attributes` (JSONB), `attributes_hash` (unikal kombinasiya `MD5(size|color|sorted_json)`), `price_override`, `cost_price`, `min_stock`, `status`, `version`.
8. **`product_images`**:
   - S3/yerli fayl saxlanması abstraksiyası, MIME yoxlaması, EXIF metadata təmizlənməsi, thumbnail generasiyası, `is_primary` və `sort_order`.
9. **`price_lists` və `price_list_items`**:
   - Filial və ya müştəri qrupu üzrə xüsusi qiymət siyahıları.
10. **`price_history` və `cost_history`** (APPEND-ONLY Dəyişməz Tarixçə):
    - Satış qiyməti və maya dəyərinin hər bir dəyişikliyi `effective_from` və `effective_to` ilə qeydə alınır. Əvvəlki dövr avtomatik bağlanır.
11. **`import_jobs` və `import_rows`**:
    - CSV/XLSX fayllarının mərhələli (staged) təhlili, validasiyası və `all_or_nothing` və ya `valid_rows_only` rejimində tranzaksional icrası.
12. **`external_refs`**:
    - Köhnə sayt (1C / OpenCart / WooCommerce və s.) sinxronizasiyası üçün xarici ID xəritələnməsi.

---

## 3. Əsas Biznes Qaydaları və Xüsusiyyətlər

### 3.1. Variant Matris Generatoru (Size × Color Grid)
- Seçilmiş ölçülər və rənglər əsasında cədvəl hasilini hesablayır.
- `dry_run=True` rejimində önizləmə verir, mövcud kombinasiyalar və ya SKU toqquşmaları haqqında xəbərdarlıq edir.
- SKU şablonu: `{BRAND3}-{PRODUCT_CODE}-{SIZE}-{COLOR}`.
- Barkod generasiyası: `200` şirkətdaxili prefiksi ilə avtomatik ardıcıl sayğac və EAN-13 checksum hesablanması.

### 3.2. Dəyişməz Qiymət və Maya Dəyəri Tarixçəsi
- Qiymət və maya dəyəri heç vaxt yerindəcə (in-place) yenilənmir; həmişə `price_history` və `cost_history` cədvəllərinə yeni sətr əlavə olunur.
- Əgər aktiv dövr varsa, onun `effective_to` tarixi yeni qiymətin `effective_from` tarixinə bərabər edilir.
- `lookup_by_code` metodu POS (kassa) üçün filialın xüsusi qiymət siyahısını və ya baza qiymətini təyin edir.

### 3.3. Maya Dəyərinin Məxfiliyi (Cost Masking)
- `catalog.cost.view` icazəsi olmayan hər hansı bir istifadəçi (kassir, anbardar və s.) məhsul, variant və ya POS məlumatlarını sorğuladıqda `cost_price: None` və `margin_percent: None` qaytarılır.

### 3.4. Azərbaycan Əlifbasına Uyğun Axtarış
- `normalize_az_text()` funksiyası ilə `ə, ı, ö, ü, ç, ş, ğ, İ` hərfləri standart ASCII formasına çevrilərək məhsulun `normalized_name` sahəsində indekslənir. Axtarış həm orijinal həriflərlə, həm də latın hərfləri ilə dəqiq nəticə verir.

### 3.5. Termal və Standart Etiket Çapı (PDF)
- ReportLab vasitəsilə vektor formatında PDF generasiyası:
  1. `58x40` mm (Standart termal barkod printeri)
  2. `40x25` mm (Kompakt zərgərlik/aksesuar etiketi)
  3. `a4_sheet` (A4 formatlı yapışqanlı etiket vərəqi — 3 sütun × 8 sətir = 24 etiket)
- EAN-13 və Code128 formatlı vizual ştrixkodlar vektor dəqiqliyi ilə render edilir.

### 3.6. Mərhələli İdxal və İxrac (Import/Export Pipeline)
- CSV (UTF-8, UTF-8 with BOM, CP1254) və XLSX fayllarını dəstəkləyir.
- 3 mərhələli boru kəməri:
  1. `POST /catalog/import/upload`: Fayl parse edilir və `import_rows` cədvəlinə yazılır.
  2. `POST /catalog/import/{job_id}/preview`: Hər bir sətrin SKU, barkod, kateqoriya, qiymət validasiyası aparılır və xəta siyahısı formalaşır.
  3. `POST /catalog/import/{job_id}/commit`: İdxal `all_or_nothing` və ya `valid_rows_only` rejimində tranzaksional tətbiq olunur.

---

## 4. API Endpoint-ləri Xülasəsi

| Metod | Yol | Açıqlama |
|---|---|---|
| `GET` | `/catalog/categories` | Kateqoriyalar siyahısı / ağacı |
| `POST` | `/catalog/categories` | Yeni kateqoriya yaratma |
| `POST` | `/catalog/categories/{id}/merge` | Kateqoriyaların birləşdirilməsi |
| `GET` | `/catalog/brands` | Brendlər siyahısı |
| `POST` | `/catalog/brands` | Yeni brend yaratma |
| `GET` | `/catalog/units-of-measure` | Ölçü vahidləri siyahısı |
| `GET` | `/catalog/tax-classes` | Vergi sinifləri siyahısı |
| `GET` | `/catalog/attributes` | Məhsul atributları və dəyərləri |
| `GET` | `/catalog/products` | Məhsullar siyahısı (filtrasiya və axtarış) |
| `POST` | `/catalog/products` | Yeni məhsul yaratma |
| `GET` | `/catalog/products/{id}` | Tək məhsul detalları |
| `PUT` | `/catalog/products/{id}` | Məhsulu redaktə etmə (optimistik kilid) |
| `POST` | `/catalog/products/{id}/discontinue` | Satışdan çıxarma |
| `POST` | `/catalog/products/{id}/reactivate` | Yenidən aktivləşdirmə |
| `POST` | `/catalog/products/{id}/variants` | Fərdi variant əlavə etmə |
| `PUT` | `/catalog/variants/{id}` | Fərdi variantı redaktə etmə |
| `POST` | `/catalog/products/{id}/variants/generate` | Ölçü × Rəng matrisi generatoru |
| `POST` | `/catalog/variants/validate-uniqueness` | SKU/Barkod unikallığının asinxron yoxlanışı |
| `GET` | `/catalog/lookup` | POS üçün sürətli barkod/SKU axtarışı |
| `POST` | `/catalog/variants/{id}/price` | Satış qiymətini dəyişmə |
| `GET` | `/catalog/variants/{id}/price-history` | Satış qiyməti tarixçəsi |
| `POST` | `/catalog/variants/{id}/cost` | Maya dəyərini dəyişmə |
| `GET` | `/catalog/variants/{id}/cost-history` | Maya dəyəri tarixçəsi |
| `POST` | `/catalog/prices/bulk-update` | Kütləvi qiymət dəyişikliyi (faiz/məbləğ) |
| `POST` | `/catalog/labels/render` | Barkod və qiymət kağızı PDF renderi |
| `POST` | `/catalog/import/upload` | İdxal faylının yüklənməsi |
| `POST` | `/catalog/import/{id}/preview` | İdxalın önizlənməsi və validasiyası |
| `POST` | `/catalog/import/{id}/commit` | İdxalın təsdiqi və bazaya yazılması |
| `GET` | `/catalog/export` | Kataloqun ixracı (CSV və ya XLSX) |

---

## 5. İcazələr (RBAC)

- `catalog.product.view`: Məhsul kataloquna və qiymətlərə baxış (kassirlər, menecerlər).
- `catalog.product.manage`: Məhsul, variant və kateqoriyaların yaradılması və redaktəsi.
- `catalog.cost.view`: Maya dəyəri və marja məlumatlarına baxış (yalnız administrator və rəhbərlik).
- `catalog.price.manage`: Satış qiymətlərinin dəyişdirilməsi və kütləvi qiymət yenilənməsi.
- `catalog.import`: CSV/XLSX faylları ilə kütləvi məhsul idxalı.
- `catalog.export`: Kataloqun CSV/XLSX formatında çıxarılması.
- `catalog.labels`: Termal və standart barkod etiketlərinin çapı.

