# Brendhouse Köhnə Mağaza İnteqrasiyası və Ziddiyyət Qaydaları (Legacy Store Integration)

## 1. Məqsəd və Cari Vəziyyət
Brand House ERP yeni nəsil sistem kimi mövcud köhnə Brendhouse.az e-ticarət platforması ilə məlumat mübadiləsi aparmaq üçün xüsusi `brendhouse_legacy_api` adapterini təqdim edir.
Hazırkı mərhələdə adapter təhlükəsiz skelet (scaffold) kimi qurulub:
- `BrendhouseLegacyAdapter` konfiqurasiya edilməyibsə və ya `ACTIVE` deyilsə, bütün çağırışlar açıq şəkildə `NOT_CONFIGURED` vəziyyəti qaytarır.
- Heç bir məlumat uydurulmur və ya feyk sinxronizasiya icra edilmir.

---

## 2. Ziddiyyətlərin Həlli Qaydaları (Conflict Resolution Rules)

Yeni ERP sistemi ilə köhnə mağaza arasında məlumat ziddiyyəti yarandıqda aşağıdakı sərt qaydalar tətbiq olunur:

### 2.1. Anbar Qalıqları (Inventory & Stock Levels)
- **Həqiqət Mənbəyi (Single Source of Truth):** Yalnız yeni ERP Anbar modulu (`inventory_transactions` və `stock_levels`).
- **Qayda:** Köhnə sayt heç vaxt anbar qalığını birbaşa dəyişə bilməz. ERP dövri olaraq təsdiqlənmiş qalıqları köhnə sistemə yalnız biristiqamətli (One-Way Push: ERP $\to$ Legacy) ötürür.

### 2.2. Qiymətlər və Kampaniyalar (Pricing & Promotions)
- **Həqiqət Mənbəyi:** ERP Qiymət Cədvəlləri (`price_lists`) və Promosyon Mühərriki.
- **Qayda:** Satış və endirim qiymətləri yalnız ERP tərəfindən idarə olunur. Köhnə saytdakı fərqli qiymət uyğunsuzluqları aşkarlandıqda ERP qiyməti üstünlük təşkil edir.

### 2.3. Məhsul Kataloqu və Barkodlar (Catalog & SKUs)
- **Həqiqət Mənbəyi:** ERP Kataloq modulu (`products`, `variants`, `barcodes`).
- **Qayda:** İlkin miqrasiyada köhnə məhsul ID-ləri `external_ref_mappings` cədvəlində qeyd edilir. Yeni məhsulların yaradılması yalnız ERP vasitəsilə həyata keçirilir.

### 2.4. Müştərilər və Razılıqlar (Customers & Consent)
- **Həqiqət Mənbəyi:** ERP CRM modulu (`customers`, `consents`).
- **Qayda:** Əgər müştəri hər iki sistemdə mövcuddursa, telefon nömrəsi və ya FİN əsasında birləşdirmə (merge) aparılır. Marketinq razılığı (consent) yalnız təsdiq olunmuş və audit qeydi olan hallarda etibarlı sayılır.

---

## 3. Açıq Arxitektur Qərarlar (Open Decisions)

1. **Fiskal Elektron Çek Şlüzü:**
   - AR Dövlət Vergi Xidməti (DVX) yeni elektron kassa aparatları üçün birbaşa bulud protokolu və ya filial daxilində lokal agent tələb edə bilər.
   - Hal-hazırda `FiscalServicePort` interfeysi hazırdır, lakin vergi orqanının konkret aparat API protokolu təsdiqlənənə qədər defolt olaraq `UnconfiguredFiscalService` vasitəsilə `NOT_CONFIGURED` qaytarılır.
2. **Köhnə Sifarişlərin Ötürülməsi:**
   - Köhnə Brendhouse saytında yaranan onlayn sifarişlərin ERP-yə webhook və ya polling (hər 5 dəqiqədən bir) vasitəsilə daxil olması qərarı infrastruktur hazır olduqda `ACTIVE` statusuna keçiriləcəkdir.

