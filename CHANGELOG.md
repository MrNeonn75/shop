# BRAND HOUSE ERP — Dəyişikliklər Jurnalı (Changelog)

Bütün əlamətdar yeniliklər, modul təkmilləşdirmələri və texniki təhlükəsizlik/performans optimizasiyaları bu sənəddə qeyd olunur.

---

## [Release Candidate 1.0.0] - 2026-10-12

### 🚀 Əsas Yeniliklər və Təkmilləşdirmələr

#### 1. Kod Keyfiyyəti və Tip Təhlükəsizliyi (Zero-Debt Baseline)
- **TypeScript Strict Check**: Bütün layihə boyu `tsc --noEmit` icra olundu və 0 xəta qeydə alındı. Bütün 3220+ modul tam tip təhlükəsizliyinə malikdir.
- **ESLint Zero-Error**: Bütün 86+ ESLint xətası aradan qaldırıldı. `@typescript-eslint/no-explicit-any` qaydası ilə bütün `any` tipləri konkret interfeys və modellərlə əvəzləndi.
- **Dizayn Tokenlərinin Qorunması**: `eslint.config.js` faylına `no-restricted-syntax` lint qaydası əlavə edildi:
  - İnline `style` xüsusiyyətlərində birbaşa hex rənglərin istifadəsi qadağan edildi.
  - Tailwind siniflərində ixtiyari `bg-[#...]`, `text-[#...]`, `border-[#...]` konstruksiyaları bloklandı. Bütün vizuallar mərkəzi `tokens.css` CSS dəyişənlərinə bağlandı.
- **Azərbaycan Əlifbası Orfoqrafik Formatlayıcıları**:
  - `src/shared/utils/formatters.ts` moduluna `toAzerbaijaniUpper` və `toAzerbaijaniLower` köməkçi funksiyaları əlavə edildi.
  - Standart JavaScript `.toUpperCase()` metodunun Azərbaycan "İ"/"i" və "I"/"ı" hərflərini səhv çevirməsi aradan qaldırıldı (`i` $\to$ `İ`, `ı` $\to$ `I`, `I` $\to$ `ı`, `İ` $\to$ `i`).

#### 2. Performans və Marşrut Səviyyəli Kod Bölünməsi (Code-Splitting)
- **İlk Yüklənmə Büdcəsi (Initial Shell Budget)**:
  - Hədəf: $\le 250$ KB gzip.
  - **Faktiki Nəticə**: `dist/assets/index.js` cəmi **38.14 KB gzip**, `vendor-react` cəmi **67.70 KB gzip**. Ümumi ilkin qabıq **105.84 KB gzip** təşkil edir və büdcə tələbini 2 dəfədən çox üstələyir.
- **Rollup Manual Chunking**:
  - `vendor-react`: `react`, `react-dom`, `react-router-dom`, `scheduler` (67.7 KB gzip).
  - `vendor-icons`: `lucide-react` (13.6 KB gzip).
  - `vendor-radix`: Radix UI atomik komponentləri (43.1 KB gzip).
  - `vendor-tanstack`: TanStack React Query və React Table (23.8 KB gzip).
  - `vendor-i18n`: i18next və react-i18next (16.3 KB gzip).
  - `vendor-charts`: Recharts və D3 vizuallaşdırma mühərriki (107.3 KB gzip, yalnız analitika səhifələrində tələb olunduqda yüklənir).
  - `vendor-utils`: Zod, Date-fns, Axios, Zustand (38.5 KB gzip).
  - `demo-seeds`: Bütün demo və mock adapter məlumatları (93.4 KB gzip) ayrı müstəqil çanka ayrıldı.
- **Route-level Lazy Loading**: Bütün 60+ sistem səhifəsi `React.lazy()` və `<Suspense fallback={<PageSkeleton />}>` ilə təchiz edildi.

#### 3. Əlçatanlıq (WCAG 2.1 AA) və Şəbəkə Davamlılığı
- **Skip-to-Content**: Ekran oxuyucular və klaviatura istifadəçiləri üçün birbaşa `#main-content` lövbərinə keçid verən gizli/fokuslanan link əlavə edildi.
- **Şəbəkə Monitorinqi (Offline Banner)**:
  - `useOnlineStatus` hook-u ilə internet bağlantısının kəsilməsi anında istifadəçiyə qlobal xəbərdarlıq zolağı təqdim olunur.
  - POS terminalında oflayn rejim zamanı yeni nağdsız tranzaksiya açılması bloklanır və lokal növbə statusu göstərilir.
- **Çıxış zamanı Saxlanılmamış Dəyişikliklər Qorunması**: `useUnsavedChanges` hook-u yaradıldı və mühüm formlarda səhifə tərk edildikdə istifadəçiyə təsdiq dialoqu çıxarılır.
- **Açıq Yönləndirmə (Open Redirect) Zəifliyinin Aradan Qaldırılması**: `LoginPage.tsx` daxilində `getSafeRedirectUrl` funksiyası ilə `redirect` parametrində daxili olmayan və zərərli URL-lər sanitizasiya edildi.
- **Çap Üslubları (Print Stylesheets)**:
  - Kassa çeki 80mm (`.receipt-80mm`) və 58mm (`.receipt-58mm`) termal printerlər üçün CSS `@media print` qaydaları optimallaşdırıldı.
  - Sənədlər, fakturalar və maaş vərəqələri üçün A4 çap standartları (`.printable-a4`, `.payslip-sheet`) tərtib edildi.

#### 4. API Kontrakt Testləri və i18n Bütövlüyü
- **Müstəqil Kontrakt Testləri (`test/contract.test.ts`)**:
  - `HttpBranchAdapter`, `HttpProductAdapter`, `HttpDashboardAdapter`, `HttpCatalogAdapter` sorğu və cavab zərfləri rəsmi backend REST modellərinə qarşı test edildi.
  - `Idempotency-Key` başlığının mutasiya sorğularında (`POST`, `PUT`, `DELETE`) avtomatik inyeksiyası yoxlanıldı.
  - 401, 404, 500 statuslarında səhvlərin Azərbaycan dilində istifadəçi yönümlü normallaşdırılması təsdiqləndi.
- **i18n Lüğətlərinin Tamlığı**:
  - Bütün Azərbaycan tərcümə faylları (`az/common.json`, `az/navigation.json`, `az/products.json`, `az/branches.json`, `az/auth.json`, `az/ui.json`, `az/pos.json`) yoxlanıldı, boş mətnlərin olmadığı təsdiqləndi.
  - İngilis (`en/common.json`) və Rus (`ru/common.json`) lüğətləri tamamlanaraq `az/common.json` ilə 100% açar pariteti təmin edildi.

#### 5. Test Əhatəsi İcmalı
- **Vitest Testləri**: **21 test faylı, 285 test — 100% UĞURLU (0 xəta)**.
  - Pul hesablamaları və tam ədəd Qəpik cəbri (`test/money.test.ts`)
  - Azərbaycan əlifbası formatlayıcıları (`test/formatters.test.ts`)
  - RBAC icazə matrisi və wildcard qaydaları (`test/permissions.test.ts`)
  - REST və HTTP adapter kontraktları (`test/contract.test.ts`, `test/adapters.test.ts`)
  - Dashboard KPI düsturları və filtr determinizmi (`test/kpi.test.ts`, `test/dashboardAdapter.test.ts`)
  - POS kassa, endirim və kassa təhvili (`test/pos.test.ts`)
  - Anbar jurnalı, mənfi stok qorunması və variant matrisi (`test/inventoryLedger.test.ts`)
  - Filiallararası transfer dövlət maşını (`test/transferStateMachine.test.ts`)
  - Satınalma və 3-tərəfli tutuşdurma (`test/purchasing.test.ts`)
  - Maliyyə, xərc təsdiqləri və hesablar (`test/finance.test.ts`)
  - HR, davamiyyət və maaş hesablama mühərriki (`test/hr.test.ts`)
  - Müştəri bazası və loyallıq balları (`test/crm.test.ts`)
  - Marketinq və aksiya qaydaları (`test/marketing.test.ts`)
  - Standart hesabatlar və hesabat qurucusu (`test/reports.test.ts`)
  - BI və icraçı analitika (`test/bi.test.ts`)
  - Təhlükəsizlik parametrləri və icazələrin təftişi (`test/admin-security-permissions.test.ts`)

---

## [Modullar F1–F14 İcmalı]

### [F14] Administrasiya, İcazələr, Audit & Təhlükəsizlik, Bildirişlər, Sistem Parametrləri
- İcazə kataloqu təftişçisi (`/admin/permissions-catalog`) həssas icazə nişanları ilə.
- İstifadəçi səlahiyyətləri təftiş səhifəsi (`/admin/access-review`) və qeyri-aktiv istifadəçi filtri.
- Müvəqqəti icazə verilməsi və əvəzetmə (delegasiya) mexanizmi.
- Rol redaktorunda Vəzifələrin Ayrılması (Segregation-of-Duties) ziddiyyət xəbərdarlıqları.
- POS menecer PİN kodunun idarə edilməsi (heç vaxt açıq saxlanılmır, bloklanma sayğacı ilə).
- İmmutabel audit jurnalı, hadisə korrelyasiya ID-si, dəyişiklikdən əvvəl/sonra sahə-səviyyəli JSON diff siyirməsi.
- Təhlükəsizlik hadisələri monitoru (`/admin/security-events`), sessiya ləğvləri, şübhəli kassa ləğvləri və böyük qaytarmalar.
- Şübhəli fəaliyyət paneli (`/admin/suspicious-activity`) kassirlərin ləğv/endirim anomaliyaları ilə.
- Bildiriş mərkəzi (`/notifications`), kateqoriya tənzimləmələri və kritik xəbərdarlıq qaydaları qurucusu (`/admin/alert-rules`).
- Sistem parametrləri (`/admin/settings`): Valyuta yuvarlaqlığı, ehtiyat nüsxə tezliyi, audit saxlama müddəti.

### [F13] Hesabatlar və BI Analitika
- Standart hesabatlar kataloqu (Satış, Anbar, Satınalma, Maliyyə, HR, Marketinq).
- Böyük hesabatların asinxron generasiyası, tərəqqi göstəricisi və hazır olduqda bildiriş göndərilməsi.
- Yüngül Hesabat Qurucusu (Report Builder): Məlumat dəstləri, ölçülər, göstəricilər, filtrlər və qruplaşdırma ilə server whitelist-i əsasında fərdiləşdirilmiş hesabatlar.
- İcraçı BI Panelləri: İllik/aylıq böyümə, filial reytinqi, inventar dövriyyə sürəti, passiv malların endirim namizədliyi, təkrar alış və RFM müştəri seqmentləri.

### [F11–F12] HR & Payroll, Marketinq & Kampaniyalar
- Əməkdaşlar kartotekası, vəzifələr, filial təyinatları.
- Davamiyyət, növbə qrafikləri və məzuniyyət balansı.
- Brutto-Netto əməkhaqqı hesablama mühərriki (AR Vergi Məcəlləsi və DSMF tutulmaları ilə).
- HR məxfilik jurnalı: Əməkhaqqı və fərdi məlumatların baxış tarixçəsi.
- Kampaniya və aksiya mühərriki: Faizli endirim, sabit məbləğ, BOGO, məhsul dəstləri, promo kodlar.

### [F8–F10] Satınalma, Təchizatçılar, CRM & Maliyyə
- Təchizat sifarişləri (PO), 3-tərəfli tutuşdurma (PO $\leftrightarrow$ Qəbul $\leftrightarrow$ Faktura).
- Təchizatçı borcları və ödəniş yaşlanması (aging).
- Müştəri 360° profili, loyallıq balları, alış tarixçəsi.
- Çoxvalyutalı kassa və bank hesabları, filiallararası hesablaşmalar, xərc təsdiq zənciri.
- Mühasibatlıq sərhədi (Accounting Boundary) və dövr qapanışı.

### [F4–F7] Kataloq, Anbar, POS Terminal & Transferlər
- Ölçü × Rəng 2D variant matrisi generatoru.
- Barkod generiyası (EAN-13, Code-128) və etiket çap formatları.
- Mənfi stok qadağası və imtiyazlı menecer icazəsi ilə override.
- İnventarizasiya sayım sessiyası və avtomatik korreksiya sənədləri.
- İlkin qalıq idxalı (Opening balance import protection — təkrar icazəsiz bloklanır).
- POS Sensor Terminal: Barkod skaneri, toxunma düymələri, qarışıq ödəniş (Nağd + Kart + Taksit), növbə təhvili və kassa kəsiri hesabatı.
- Filiallararası transfer dövlət maşını (Qaralama $\to$ Göndərildi $\to$ Yolda $\to$ Tam/Qismən Qəbul $\to$ Ləğv).

