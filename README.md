# BRAND HOUSE ERP — Frontend Platform

> Çoxfiliallı pərakəndə idarəetmə sistemi (Geyim, Ayaqqabı, Aksesuar; Bölmələr: Kişi, Qadın, Uşaq, Digər) üçün müasir, yüksək performanslı və genişləndirilə bilən frontend təməli, avtorizasiya və administrasiya infrastrukturu.

---

## 1. Texnoloji Yığın (Pinned Tech Stack & Versions)

Bütün asılılıqlar sabit (pinned) versiyalarda quraşdırılmışdır:

| Alət / Kitabxana | Versiya | Təyinatı |
| :--- | :--- | :--- |
| **React** | `18.3.1` | Əsas UI mühərriki (Strict Mode) |
| **TypeScript** | `5.6.3` | Tip təhlükəsizliyi (`strict: true`, no implicit any) |
| **Vite** | `5.4.9` | Ultra-sürətli qurucu və dev-server |
| **React Router** | `6.27.0` | Klient marşrutlaşdırması və ProtectedRoute qoruyucuları |
| **TanStack React Query** | `5.59.16` | Server vəziyyətinin idarə olunması və keşlənməsi |
| **Zustand** | `4.5.5` | UI, sessiya, təhlükəsizlik və qaralama vəziyyətləri |
| **React Hook Form** | `7.53.0` | Yüksək performanslı form idarəetməsi |
| **Zod** | `3.23.8` | Şema validasiyası və runtime mühit yoxlanışı |
| **Tailwind CSS** | `3.4.14` | Util-əsaslı stil sistemi (CSS dəyişənləri ilə) |
| **Radix UI Primitives** | `^1.1.x / ^2.1.x` | WCAG 2.1 AA əlçatan atomik komponentlər |
| **TanStack Table** | `8.20.5` | Sütun filtrləri, çeşidləmə, səhifələmə və sətir seçimi |
| **Recharts** | `2.13.0` | Analitik qrafiklər və vizuallaşdırma |
| **i18next / react-i18next** | `23.16.0 / 15.0.3` | Çoxdilli beynəlmiləlləşmə memarlığı |
| **Lucide React** | `0.453.0` | Vektor ikonlar paketi |
| **Vitest** | `2.1.9` | Vahid (unit) və inteqrasiya testləri (62 test) |
| **Playwright** | `1.48.2` | Ucdan-uca (E2E) inteqrasiya testləri |
| **ESLint** | `9.13.0` | Kod keyfiyyəti və standartlaşdırma (Flat Config) |
| **Prettier** | `3.3.3` | Avtomatik kod formatlaşdırılması |

---

## 2. Tətbiq Qabığı (App Shell) və Naviqasiya

Tətbiq qabığı 20 pərakəndə biznes modulunu 5 əsas kateqoriyada qruplaşdırır:

### Modul Qrupları:
1. **Əməliyyatlar (Operations)**:
   - POS Terminal (`/pos`) — `pos.terminal.access`
   - Satış və Qaytarılma (`/sales`) — `sales.orders.view`
   - Filial Transferləri (`/transfers`) — `inventory.transfer.view`
2. **Məhsul və Anbar (Inventory & Products)**:
   - Məhsul Kataloqu (`/products`) — `products.catalog.view`
   - Anbar Qalıqları (`/inventory`) — `inventory.stock.view`
   - Satınalma Sifarişləri (`/procurement`) — `procurement.orders.view`
   - Təchizatçılar (`/suppliers`) — `procurement.suppliers.view`
3. **Maliyyə (Finance)**:
   - Maliyyə və Kassa (`/finance`) — `finance.ledger.view`
   - Standart Hesabatlar (`/reports`) — `reports.standard.view`
   - BI Analitika (`/analytics`) — `reports.bi.view`
4. **İnsan və Müştəri (People & CRM)**:
   - Əməkdaşlar / HR (`/hr`) — `hr.employees.view`
   - Müştəri Bazası / CRM (`/crm`) — `crm.customers.view`
   - Marketinq və Kampaniyalar (`/marketing`) — `marketing.campaigns.view`
5. **Sistem və Administrasiya (System & Admin)**:
   - Şirkət Profili (`/admin/company`) — `admin.company.manage`
   - Filiallar (`/admin/branches`) — `admin.branches.view`
   - Anbarlar (`/admin/warehouses`) — `admin.warehouses.view`
   - İstifadəçilər (`/admin/users`) — `admin.users.view`
   - Rollar və İcazələr (`/admin/roles`) — `admin.roles.view`
   - Sənəd Nömrələnməsi (`/admin/numbering`) — `admin.document_numbering.manage`
   - Vergi Parametrləri (`/admin/tax`) — `admin.tax.manage`
   - İnteqrasiyalar (`/admin/integrations`) — `admin.integrations.manage`
   - Sistem Sağlamlığı & Backup (`/admin/system-health`) — `admin.system_health.view`
   - Audit Jurnalı (`/admin/audit`) — `admin.audit.view`

### Başlıq (Header) İmkanları:
- **Ctrl+K Qlobal Axtarış (Command Palette)**: Məhsullar (ad, SKU, barkod, brend), satış çekləri, müştərilər və sistem səhifələri arasında anlıq axtarış və klaviatura naviqasiyası.
- **Filial Seçici (Branch Switcher)**: İstifadəçinin hüququ çatan filialların siyahısı. "Bütün filiallar" (konsolidə) seçimi yalnız xüsusi səlahiyyətli rollara (`admin.branches.all` və ya `canAccessAllBranches`) təqdim olunur.
- **Bildirişlər Zəngi**: Oxunmamış bildirişlər və kritik stok/transfer xəbərdarlıqları paneli.
- **Dil Seçimi**: `AZ` (aktiv), `EN` və `RU` (qeyri-aktiv "Tezliklə" nişanı ilə).
- **Tema Keçidi**: CSS tokenləri ilə anlıq işıqlı/qaranlıq rejim keçidi.
- **İstifadəçi Menyusu**: Profil məlumatı, demo rol dəyişdiricisi, aktiv sessiyalar və çıxış.

---

## 3. Giriş (Auth) və Sessiya İdarəetməsi

1. **Giriş Səhifəsi (`/auth/login`)**:
   - İstifadəçi adı / email + şifrə
   - Şifrəni göstər / gizlət düyməsi
   - Blokada və Rate-limit qorunması: 4 ardıcıl yanlış cəhddən sonra 60 saniyəlik təhlükəsizlik blokadası
   - **6 Sınaq İstifadəçisi üçün 1-Klik Giriş Düymələri**:
     - *Sistem admini* (`admin` / `AdminPassword123!`)
     - *Baş menecer* (`manager` / `ManagerPassword123!`)
     - *Filial meneceri* (`branch_mgr` / `BranchPassword123!`)
     - *Kassir* (`cashier` / `CashierPassword123!`)
     - *Anbardar* (`anbar` / `AnbarPassword123!`)
     - *Mühasib* (`accountant` / `AccountantPassword123!`)
     *(Həmçinin bütün demo hesablara `Admin123!` universal şifrəsi ilə daxil olmaq olar).*
2. **Şifrənin Sıfırlanması Axını**:
   - `/auth/forgot-password`: Email sorğusu və dərhal sınaq keçidi simulyasiyası.
   - `/auth/reset-password`: Token parametrinin oxunması, 5-bəndlik real-vaxt şifrə gücü yoxlama siyahısı (uzunluq, böyük hərf, kiçik hərf, rəqəm, xüsusi simvol) və vizual qüvvət göstəricisi (Zəif / Orta / Güclü).
3. **Hərəkətsizlik Monitoru və Sessiya Bərpası**:
   - 15 dəqiqəlik hərəkətsizlikdən sonra avtomatik olaraq `SessionExpiredModal` pəncərəsi açılır.
   - **Form Qaralamalarının Qorunması**: Sessiya bitdikdə arxa fondakı daxil edilmiş form məlumatları itmir, şifrəni təkrar daxil etdikdə iş fasiləsiz davam edir.
4. **Aktiv Sessiyalar Səhifəsi (`/admin/sessions`)**:
   - Daxil olunmuş cihazların siyahısı (PC, Mobil, Zebra TC26 POS Terminal), IP ünvanı, məkan və son aktivlik tarixi.
   - Tək-tək sessiyanı və ya bütün digər sessiyaları sonlandırma imkanı (`ConfirmDialog` ilə).

---

## 4. RBAC İcazə Modeli və Şifrələmə Qaydaları

> **MÜHÜM TƏHLÜKƏSİZLİK QAYDASI**:
> Frontend-də aparılan bütün icazə yoxlanışları (naviqasiyanın gizlədilməsi, düymələrin qeyri-aktiv edilməsi, həssas sahələrin maskalanması) yalnız istifadəçi təcrübəsi (UX) üçündür. Əsl səlahiyyətləndirmə backend API serveri tərəfindən hər bir sorğuda avtoritativ şəkildə yoxlanılır.

### İcazə Formatı:
Format: `module.resource.action` (məsələn: `inventory.stock.adjust`, `pos.sale.cancel`, `hr.salary.view`).

### Dəstəklənən Wildcard Maskaları:
- `*` — Bütün hüquqlara tam icazə (Superadmin).
- `module.*` — Həmin modulun bütün alt hüquqları (məs: `admin.*`).
- `module.resource.*` — Resursun bütün əməliyyatları (məs: `inventory.stock.*`).

### İcazələrin Siyahısı (Tam Kataloq):

#### Əməliyyatlar (Operations):
- `pos.terminal.access` — POS kassa ekranına daxil olmaq
- `pos.sale.create` — Yeni satış çeki vurmaq
- `pos.sale.cancel` — Aktiv satışı və ya çeki ləğv etmək
- `pos.discount.apply` — Standartdan kənar endirim tətbiq etmək
- `sales.orders.view` — Bütün satış sifarişlərinin siyahısını görmək
- `sales.orders.create` — Topdan və ya pərakəndə satış sənədi açmaq
- `sales.refund.process` — Müştəri qaytarmalarını qəbul etmək
- `inventory.transfer.view` — Filiallararası yerdəyişmələri görmək
- `inventory.transfer.create` — Yeni anbar transfer sorğusu açmaq
- `inventory.transfer.approve` — Daxil olan transferi qəbul edib təsdiqləmək

#### Məhsul və Anbar (Inventory):
- `products.catalog.view` — Məhsul kartotekasını görmək
- `products.catalog.create` — Yeni SKU / məhsul əlavə etmək
- `products.catalog.edit` — Məhsul parametrlərini dəyişmək
- `products.catalog.delete` — Məhsulu kataloqdan silmək
- `products.cost_price.view` — Məhsulun alış / maya dəyərini görmək *(HƏSSAS)*
- `inventory.stock.view` — Anbar və vitrin qalıqlarını görmək
- `inventory.stock.adjust` — İnventarizasiya və qalıq korreksiyası
- `procurement.orders.view` — Təchizat sifarişlərini görmək
- `procurement.orders.create` — Yeni satınalma qaiməsi daxil etmək
- `procurement.suppliers.view` — Tərəfdaş şirkətlərin siyahısını görmək
- `procurement.suppliers.manage` — Yeni təchizatçı əlavə etmək / redaktə
- `procurement.supplier_price.view` — Müqavilə alış qiymətlərini görmək *(HƏSSAS)*

#### Maliyyə və Hesabatlar (Finance):
- `finance.ledger.view` — Kassa və hesab qalıqlarını görmək
- `finance.expense.view` — Filial və ofis xərclərini görmək
- `finance.expense.create` — Yeni xərc maddəsi daxil etmək
- `finance.expense.approve` — Böyük məbləğli ödənişləri təsdiqləmək
- `reports.standard.view` — Dövriyyə və satış hesabatları
- `reports.bi.view` — Qabaqcıl vizual qrafiklər və proqnozlar
- `reports.export` — Məlumatları Excel / CSV formatında yükləmək

#### İnsan və Müştəri (People):
- `hr.employees.view` — İşçi heyəti siyahısını görmək
- `hr.employees.manage` — İşə qəbul, vəzifə dəyişikliyi
- `hr.salary.view` — Maaş və bonusları görmək *(HƏSSAS)*
- `crm.customers.view` — Müştəri bazasını və loyallıq ballarını görmək
- `crm.customers.manage` — Müştəri kartı yaratmaq və düzəliş
- `marketing.campaigns.view` — Aksiya və endirimləri görmək
- `marketing.discounts.manage` — Endirim şərtlərini tənzimləmək

#### Sistem və Administrasiya (Admin):
- `admin.company.manage` — Şirkət rekvizitləri və rekvizit parametrləri
- `admin.branches.view` — Filial siyahısını görmək
- `admin.branches.manage` — Yeni filial açmaq / bağlamaq / redaktə
- `admin.branches.all` — "Bütün filiallar" konsolidasiya filtrini seçmək
- `admin.warehouses.view` — Anbar siyahısını görmək
- `admin.warehouses.manage` — Anbar yaratmaq və filial bağlamaq
- `admin.users.view` — İstifadəçi hesablarını görmək
- `admin.users.manage` — İstifadəçi yaratmaq, rol vermək, bloklamaq
- `admin.roles.view` — Rollar və icazələr matrisini görmək
- `admin.roles.manage` — Rolu redaktə etmək və ya kopyalamaq
- `admin.document_numbering.manage` — Prefiks, il və sayğac qaydalarını dəyişmək
- `admin.tax.manage` — Vergi dərəcələri və siniflərini tənzimləmək
- `admin.integrations.manage` — SMS, fiskal kassa, ASAN login, API açarları
- `admin.system_health.view` — Server sağlamlığı və ehtiyat nüsxə monitorinqi
- `admin.audit.view` — Sistemdəki bütün əməliyyatların tarixçəsi
- `admin.audit.export` — Audit qeydlərini CSV ixrac etmək
- `notifications.system.view` — Sistem bildirişlərini görmək və konfiqurasiya
- `settings.general.view` — Sistem parametrlərini görmək

### Həssas Sahələrin Maskalanması:
`<SensitiveField>` komponenti vasitəsilə icazəsi olmayan istifadəçilərə maya dəyəri və maaş məlumatları `*** ₼` kimi maskalanır və üzərinə gəldikdə əlçatanlıq izahatı verilir.

---

## 5. Administrasiya Modulu

- **Şirkət Profili (`/admin/company`)**: VÖEN (`1405829141`), rəsmi ünvan, bank rekvizitləri, loqo önbaxışı, əsas valyuta və saat qurşağı. Dəyişiklik edildikdə çirklənmə (dirty-state) xəbərdarlıq zolağı.
- **Filiallar (`/admin/branches`)**: Unikal kod, ad, ünvan, əlaqə, iş saatları (həftəiçi/həftəsonu), kassa sayı, bağlı anbarlar. Silinmə və qapadılma zamanı mütləq səbəb tələb edən `ConfirmDialog`.
- **Anbarlar (`/admin/warehouses`)**: Növlər (Mərkəzi anbar, Filial anbarı, Tranzit anbar), bağlı filial, sahə (m²).
- **İstifadəçilər (`/admin/users`)**: Rol təyinatı, filial səlahiyyətləri, bloklama/aktivləşdirmə, məcburi şifrə sıfırlama bildirişi.
- **Rollar və İcazələr (`/admin/roles`)**:
  - İnteraktiv İcazə Matrisi (kateqoriyalar üzrə filtrləmə və axtarış)
  - Rolu Kopyalama (Clone role)
  - Aktiv istifadəçisi olan rolu redaktə edərkən xəbərdarlıq bildirişi
  - **Yadda saxlamazdan əvvəl fərq (Pre-save Diff) modalı**: Əlavə edilən (`+`) və ləğv edilən (`-`) icazələrin təsdiq siyahısı.
- **Sənəd Nömrələnməsi (`/admin/numbering`)**: Çek, PO, Transfer, Faktura prefiksləri, filial kodu, il formatı və canlı önbaxış (`CK-28M-2026-000142`).
- **Vergi Parametrləri (`/admin/tax`)**: ƏDV (18%), Sadələşdirilmiş (2%), 0% İxrac və azad edilmiş vergi sinifləri. **AR Vergi Məcəlləsinə uyğun hüquqi xəbərdarlıq bəyanatı daxil edilmişdir.**
- **İnteqrasiyalar (`/admin/integrations`)**: SMS şlüzü, Fiskal Kassa, DVX e-Qaimə və Köhnə brendhouse.az API inteqrasiyası. Heç vaxt saxta aktiv status göstərilmir; konfiqurasiya yoxdursa "Konfiqurasiya olunmayıb" əks etdirilir.
- **Sistem Sağlamlığı & Backup (`/admin/system-health`)**: API gecikməsi (ms), PostgreSQL bağlantısı, RAM istifadəsi, uptime, ən son ehtiyat nüsxə tarixi və əl ilə backup başlatma.
- **Audit Jurnalı (`/admin/audit`)**: Bütün kritik hadisələr, filtrlər, CSV ixracı və hadisənin Əvvəlki/Sonrakı vəziyyətini göstərən **JSON Diff siyirməsi (Drawer)**.

---

## 6. Yeni İcazə və ya Rol Əlavə Etmə Bələdçisi (Extension Guide)

### 1. Yeni İcazə Əlavə Etmək:
`src/shared/utils/permissions.ts` faylında `ALL_PERMISSIONS` massivinə yeni icazə qeydini əlavə edin:
```ts
{
  code: 'loyalty.points.manual_adjust',
  name: 'Xallara Əl ilə Düzəliş',
  description: 'Müştərinin loyallıq xallarına əl ilə düzəliş etmək',
  category: 'people',
  isSensitive: true,
}
```
Və müvafiq rola (məsələn: `general_manager`) əlavə edin:
```ts
ROLE_DEFAULT_PERMISSIONS.general_manager.push('loyalty.points.manual_adjust');
```

### 2. Komponent və ya Sahəni İcazə ilə Qorumaq:
Komponent daxilində `<PermissionGate>` və ya `usePermission` istifadə edin:
```tsx
import { PermissionGate } from '@/components/ui';

<PermissionGate permission="loyalty.points.manual_adjust" fallback={<p>İcazəniz yoxdur</p>}>
  <Button onClick={adjustPoints}>Xallara Düzəliş Et</Button>
</PermissionGate>
```

Və ya həssas qiyməti maskalamaq üçün:
```tsx
<SensitiveField value="145.00 ₼" permission="products.cost_price.view" mask="*** ₼" />
```

### 3. Marşrutu (Route) Qorumaq:
`src/app/router/router.tsx` faylında:
```tsx
{
  path: 'loyalty',
  element: (
    <ProtectedRoute requiredPermission="loyalty.points.manual_adjust">
      <LoyaltyPage />
    </ProtectedRoute>
  ),
}
```

---

## 7. İdarəetmə Paneli (Dashboard & BI Analitika Sistemi)

İdarəetmə paneli real sorğu nöqtələri (adapters) üzərindən qidalanan, rol əsaslı fərdiləşdirilən icraçı və filial analitika moduludur:

### 1. KPI Reyestri (`src/features/dashboard/kpiDefinitions.ts`)
Hər bir göstərici dəqiq Azərbaycan dilində adı, riyazi düstur mətni, ölçü vahidi (`azn`, `percent`, `qty`, `ratio`), rəsmi məlumat mənbəyi və tooltip açıqlaması ilə qeydiyyata alınmışdır:
- **Xalis Satış (`totalSales`)**: Brutto Satış − Qaytarılmalar
- **Ümumi Mənfəət (`grossProfit`)**: Xalis Satış − COGS (Satılan Malların Maya Dəyəri; Çəkili Orta metodu ilə)
- **Xalis Mənfəət (`netProfit`)**: Ümumi Mənfəət − OPEX (Əməliyyat Xərcləri). Bütün xərc aktları tam olduqda hesablanır, əks halda səbəb göstərilməklə "Hesablanmayıb" vəziyyəti əks etdirilir.
- **Satış Artımı (`salesGrowth`)**: Müqayisə dövrünə nisbətən % dəyişimi
- **Orta Çek Məbləği (`averageOrderValue`)**: Xalis Satış / Çek Sayı
- **Satılan Məhsul Sayı (`unitsSold`)**: Satılmış ədədlər − qaytarılmış ədədlər
- **Qaytarılma Faizi (`returnRate`)**: (Qaytarılan Məbləğ / Brutto Satış) × 100
- **İnventar Dəyəri (`inventoryValue`)**: Mövcud qalıqların maya dəyəri üzrə cəmi
- **Stok Dövriyyəsi (`inventoryTurnover`)**: İllikləşdirilmiş COGS / Orta Stok Dəyəri
- **Təchizatçı Borcları (`supplierLiabilities`)**: Açıq kreditor borclarının balansı
- **Endirim Xərci (`discountCost`)**: Tətbiq edilmiş promo və aksiya güzəştləri

### 2. Yapışqan Filtr Paneli (Sticky FilterBar & URL Sync)
- **Filial**: İcazəsi olan istifadəçilər üçün "Bütün filiallar", məhdud hüquqlu rollar üçün isə yalnız öz filialı.
- **Tarix Presets**: `Bu gün`, `Dünən`, `7 gün`, `Bu ay`, `Keçən ay`, `Bu il`, `Xüsusi`.
- **Müqayisə**: Əvvəlki dövr, Keçən ilin eyni dövrü, Müqayisəsiz.
- **Avtomatik Yenilənmə**: 60 saniyəlik avtomatik taymer və əllə yeniləmə.

### 3. 11 Müstəqil Analitik Vidjet
Hər bir vidjet öz müstəqil TanStack Query sorğusuna, Skeleton yüklənmə vəziyyətinə, xəta təkrarına və CSV ixracına malikdir:
1. `SalesTrendWidget`: Saatlıq və ya günlük sahə/xətt qrafiki, müqayisə xətti və əlçatan cədvəl rejimi.
2. `SalesByBranchWidget`: Filiallar üzrə bar diaqramı və pay % reytinq cədvəli.
3. `SalesBySectionTypeWidget`: Kişi, Qadın, Uşaq, Digər və Geyim, Ayaqqabı, Aksesuar bölgüsü.
4. `TopSellingProductsWidget`: Top 10 məhsul və kateqoriya reytinqi.
5. `PaymentMethodsWidget`: Kart (POS), Nağd, Taksit (Birbank/Tamkart) və Qarışıq ödənişlər.
6. `LowStockAlertsWidget`: Kritik (0 qalıq) və azalan stok siqnalları, inventar keçidi.
7. `SlowMovingStockWidget`: Son 60+ gün satılmayan passiv mallar və dondurulmuş maya kapitalı.
8. `ExpenseTrendWidget`: İcarə, əməkhaqqı, kommunal, marketinq və loqistika xərclərinin payı.
9. `OpenOrdersTransfersWidget`: Gözləyən satınalma sifarişləri (PO) və yolda olan anbar transferləri.
10. `CashRegistersTodayWidget`: Aktiv kassalar, gözlənilən nağd və kassa kəsiri/fərqi.
11. `RecentActivityFeedWidget`: Böyük qaytarmalar, kassa ləğvləri, sayım aktları və limitdən artıq endirimlər.

### 4. Rol Əsaslı Görünüş Variantları
- **Sistem Admini / Baş Menecer**: Bütün 11 KPI və 11 vidjet.
- **Filial Meneceri**: Öz filialının satışları, azalan məhsullar, kassalar və lokal əməliyyatlar.
- **Kassir**: Yalnız növbə icmalı (Bugünkü satış, çek sayı, kassa balansı, ödəniş üsulları).
- **Anbardar**: Stok fokuslu (İnventar dəyəri, dövriyyə sürəti, kritik stoklar, hərəkətsiz mallar, transferlər).
- **Mühasib**: Maliyyə fokuslu (Maya dəyəri, ümumi və xalis mənfəət, xərclər, təchizatçı borcları, kassa kəsirləri).

---

## 8. Testlər və Keyfiyyət Təminatı

Layihədə 79 vahid testi və Playwright E2E testləri mövcuddur:

```bash
# Vitest testlərini icra etmək (8 test faylı, 79 test)
npm test

# ESLint kod keyfiyyətini yoxlamaq (0 xəta, 0 xəbərdarlıq)
npm run lint

# Production qurucusu və TypeScript tip yoxlanışı (3025 modul)
npm run build

# Playwright E2E testlərini icra etmək
npx playwright test
```

---

## 9. Fərziyyələr və Açıq Suallar (Assumptions & Open Questions)

1. **Brend Aksent Rəngi**:
   - `brendhouse.az` saytından endirilmiş rəsmi vektor SVG loqosunun daxilindəki rəng `#a47a68` idi. İlkin təlimata uyğun olaraq, rəsmi təsdiq verilənə qədər `--bh-accent` neytral `#111111` olaraq saxlanılır.
2. **Köhnə brendhouse.az API İnteqrasiyası**:
   - `BrendHouseLegacyAdapter` qovluğu toxunulmaz saxlanılıb və İnteqrasiyalar səhifəsində aşkar "Konfiqurasiya olunmayıb" statusu əks etdirir. API açarları və sənədlər daxil edildikdə qoşulacaq.
3. **Maliyyə Qəpik Dəqiqliyi**:
   - Bütün hesablamalar tam ədəd integer Qəpik formatında saxlanılır (`1 AZN = 100 Qəpik`).
4. **Vergi Məcəlləsi Uyğunluğu**:
   - Bütün vergi dərəcələri redaktə edilə biləndir və AR Vergi Məcəlləsinə istinad edən xüsusi hüquqi xəbərdarlıq paneli ilə təchiz olunub.
