# BRAND HOUSE ERP — Məlum Məhdudiyyətlər və İnteqrasiya Tələbləri (Known Limitations)

Bu sənəd sistemin cari Release Candidate mərhələsindəki texniki xüsusiyyətlərini, xarici asılılıqlarını və backend inteqrasiyası üçün tələb olunan konfiqurasiyaları təsvir edir.

---

## 1. Məlumat Adapterləri və İnteqrasiya Rejimləri (`VITE_DATA_SOURCE`)

Sistem 3 müxtəlif adapter mühitini dəstəkləyir (`.env` vasitəsilə tənzimlənir):

1. **`mock` Rejimi (Standart Nümayiş Rejimi)**:
   - Bütün məlumatlar `src/shared/adapters/mock/` daxilindəki deterministik demo toxumlarından (seeds) oxunur.
   - Hər bir obyekt `isDemo: true` nişanı ilə təchiz olunub.
   - Başlıqda aydın **"DEMO MƏLUMAT"** nişanı göstərilir. Heç vaxt saxta rəqəmlər istehsalat (production) məlumatı kimi təqdim edilmir.
2. **`http` Rejimi (Canlı REST Backend)**:
   - Sorğular `VITE_API_BASE_URL` (standart: `/api/v1`) ünvanına yönləndirilir.
   - Əsas modullar (`HttpBranchAdapter`, `HttpProductAdapter`, `HttpDashboardAdapter`, `HttpCatalogAdapter`) tam HTTP kontraktı ilə işləyir.
   - Hələ backend tərəfində tam hazır olmayan yardımçı modullar üçün adapterlər daxili ehtiyat mexanizminə malikdir.
3. **`legacy` Rejimi (Köhnə brendhouse.az İnteqrasiyası)**:
   - Köhnə sistemin API sənədləri və server parametrləri təqdim edilənə qədər `BrendHouseLegacyAdapter` aşkar `UnconfiguredLegacyAdapterError` xətası atır və İnteqrasiyalar səhifəsində "Konfiqurasiya olunmayıb" statusunu göstərir.

---

## 2. Xarici Avadanlıq və İnteqrasiya Şlüzləri

### Fiskal Kassa və POS Çapı
- POS kassa ekranı standart 80mm və 58mm termal kassa printerləri üçün `@media print` CSS qaydaları ilə tam təchiz olunub.
- Fiziki kassa aparatlarına (ASAN İmza, NBA Technologies, CAS kassa) birbaşa RS-232 / USB / LAN əmrlərinin göndərilməsi üçün lokal `POS Hardware Bridge` xidmətinin və ya kassa drayverinin quraşdırılması tələb olunur. Drayver olmadıqda brauzerin standart çap dialoqu işə düşür.

### SMS və E-poçt Bildirişləri
- Sistem parametrlərində SMS şlüzü (məsələn: Azercell / Bakcell / Nar SMS Gateway) və SMTP serveri konfiqurasiya edilməyənə qədər, SMS və e-poçt bildirişləri "Konfiqurasiya olunmayıb" statusunda qalır. Sistem daxili (in-app) bildirişlər isə WebSocket/polling vasitəsilə dərhal aktivdir.

### Bank POS Terminalı (Ödəniş Kartları)
- Nağdsız ödənişlər zamanı terminal inteqrasiyası (SmartPOS / Ingenico / Verifone) proqram təminatı səviyyəsində simulyasiya edilir və əllə təsdiq tələb edir. Birbaşa ECR (Electronic Cash Register) protokolu üçün bankın rəsmi drayveri tələb olunur.

---

## 3. Təhlükəsizlik və Sessiya İdarəetməsi

- **Tokenlərin Saxlanması**:
  - Təhlükəsizlik tələblərinə uyğun olaraq, heç bir autentifikasiya tokeni (Bearer JWT) `localStorage` və ya `sessionStorage`-də saxlanılmır. Bütün avtorizasiya yalnız Zustand yaddaşında (RAM) saxlanılır.
  - Canlı istehsalat mühitində brauzer yeniləndikdə sessiyanın saxlanması üçün backend-in `httpOnly` təhlükəsiz kuki (cookie) əsaslı `/auth/refresh` endpoint-i tələb olunur.
- **2FA (İki Faktorlu Autentifikasiya)**:
  - TOTP (Google Authenticator) QR kod generasiyası backend təhlükəsizlik açarı və bərpa kodları təqdim etdikdə aktivləşir; əks halda parametrlər səhifəsində aydın "Dəstəklənmir" vəziyyəti əks etdirilir.

---

## 4. Valyuta və Hesablamalar

- **Tam Ədəd Qəpik Cəbri**:
  - Bütün maliyyə və pul hesablamaları `toQapik()` köməkçisi ilə tam ədəd Qəpik formatında (1 AZN = 100 Qəpik) aparılır. Sistem daxilində heç bir IEEE-754 üzən nöqtəli (floating-point) yuvarlaqlaşdırma xətasına icazə verilmir.
- **Valyuta Məzənnələri**:
  - Əsas valyuta Azərbaycan Manatıdır (AZN). Çoxvalyutalı xarici satınalmalar (USD, EUR, TRY) üçün gündəlik AR Mərkəzi Bankı (CBAR) məzənnələrinin backend tərəfindən sinxronizasiyası nəzərdə tutulub.

---

## 5. Çoxdillilik (i18n)

- Əsas və standart sistem dili **Azərbaycan dilidir (`az`)**. Bütün hüquqi bəyanatlar, xəta mesajları və KPI izahatları Azərbaycan dilində hazırlanmışdır.
- İngilis (`en`) və Rus (`ru`) dillərinin əsas ortaq lüğəti (`common.json`) 100% açar pariteti ilə hazırdır. Geniş modul-səviyyəli tərcümələr sonrakı beynəlxalq versiyalara planlaşdırılmışdır.

