# Açıq Hüquqi və Vergi Sualları (Baş Mühasib və Vəkil Tərəfindən Cavablandırılmalıdır)

> [!IMPORTANT]
> **HÜQUQİ VƏ VERGİ TƏFTİŞİ VƏRƏQƏSİ:**
> Bu sənəddə Brand House ERP sisteminin Azərbaycan qanunvericiliyinə tam uyğun sazlanması üçün şirkətin **baş mühasibi** və **korporativ hüquqşünası** tərəfindən rəsmi şəkildə cavablandırılmalı və qərar verilməli olan 9 əsas məsələ toplanmışdır.
> Sistem heç bir cavabı kod daxilində uydurmur və ya fərz etmir. Hər bir qərar müvafiq qayda paketinə daxil edilərək təsdiqlənir.

---

## 1. Şirkətin Vergi Rejimi və ƏDV Dövriyyə Həddi Mexanizmi

- **Kontekst və Hüquqi Mənbə:** Vergi Məcəlləsinin 155-ci və 218-ci maddələri. Pərakəndə ticarət subyektləri dövriyyədən asılı olaraq ƏDV ödəyicisi və ya sadələşdirilmiş vergi ödəyicisi ola bilər. 155.1-1-ci maddəyə əsasən, pərakəndə ticarət sahəsində qeydiyyatda olmayan şəxslərə nağdsız qaydada (POS-terminal) edilən satışlar üzrə dövriyyə 0.5 əmsalı ilə hesablanır.
- **Sistemə Təsiri:** `CompanyTaxProfile` (vergi rejimi) və `turnover_monitor` read-modeli. Dövriyyə monitoru 80%, 95% və 100% həddə çatdıqda bildiriş çıxarır.
- **Tələb olunan qərar:**
  1. Şirkət hal-hazırda rəsmi ƏDV ödəyicisidirmi, yoxsa sadələşdirilmiş vergi rejimindədir?
  2. 200,000 AZN illik dövriyyə limiti hesablanarkən təqvim ili, yoxsa ardıcıl 12 aylıq dövriyyə əsas götürülməlidir?
  3. Nağdsız pərakəndə satışlar üçün 0.5 əmsalı hazırkı vergi qaydalarına əsasən şirkətə şamil olunurmu?

---

## 2. Fiskal Çekin Məcburi Elementləri və E-Kassa Operatorunun Seçimi

- **Kontekst və Hüquqi Mənbə:** Vergi Məcəlləsinin 16.1.8-ci maddəsi və Dövlət Vergi Xidmətinin Yeni Nəsil E-Kassa Tələbləri. Çekdə QR-kod, VÖEN, nəzarət-mexanizmi qeydiyyat nömrəsi, məhsul kodları və vergi dərəcələri əks olunmalıdır.
- **Sistemə Təsiri:** `FiscalServicePort`, `SaleFiscalState` və `fiscal.mandatory_receipt_fields`.
- **Tələb olunan qərar:**
  1. Şirkət tərəfindən hansı rəsmi e-kassa operatoru və cihaz modeli (məsələn: NBA Technologies, Caspos, SmartKassa və s.) seçilib?
  2. Operatorun rəsmi inteqrasiya protokolu və sənədləri (API / SDK) hansılardır?
  3. Kassa cihazı və ya operator serveri müvəqqəti əlçatmaz olduqda (internet kəsildikdə) dövlət tərəfindən icazə verilən fövqəladə rejim qaydaları mövcuddurmu?

---

## 3. Gəlir Vergisi, DSMF və İcbari Sığorta Dərəcələri (2026/2027 Keçid Dövrü)

- **Kontekst və Hüquqi Mənbə:** Vergi Məcəlləsinə edilmiş dəyişikliklər (özəl qeyri-neft/qaz sektoru üzrə güzəştli keçid dövrü), "Sosial sığorta haqqında" Qanun və "Tibbi sığorta haqqında" Qanun.
- **Mübahisəli Məqamlar (`DISPUTED`):**
  - **İcbari Tibbi Sığorta (İTS):** İkincili mənbələrin bir hissəsi 2%-lik dərəcənin 2,500 AZN-ə qədər, digər hissəsi isə 8,000 AZN-ə qədər olan hissəyə tətbiq edildiyini göstərir.
  - **İşəgötürənin DSMF Töhfəsi:** İlk 200 AZN üçün 22% (bəzi mənbələrdə 44 AZN sabit) və 200-dən yuxarı 15%, 8,000-dən yuxarı isə 11% azaldılmış dərəcə ziddiyyətli şərh edilir.
  - **2027 Keçidi:** 2026-cı il üçün tətbiq olunan güzəştli gəlir vergisi (3%/10%/14%) 31 Dekabr 2026-da başa çatır.
- **Tələb olunan qərar:**
  1. Gəlir vergisi hesablanarkən vergitutma bazası necə formalaşır: Brutto məbləğdən ilk növbədə sosial və sığorta haqları çıxılırmı?
  2. İcbari tibbi sığortada 2% dərəcənin yuxarı həddi dəqiq olaraq 2,500 AZN-dir, yoxsa 8,000 AZN?
  3. İşəgötürənin DSMF töhfəsi üçün təsdiqlənmiş dəqiq cədvəl hansıdır?

---

## 4. İş Vaxtı, Əlavə İş (Overtime), Gecə/Bayram Ödənişləri və Məzuniyyət

- **Kontekst və Hüquqi Mənbə:** Əmək Məcəlləsi (xüsusilə 16 Yanvar 2026-cı il qüvvəyə minmiş dəyişikliklər) və Nazirlər Kabinetinin İstehsalat Təqvimi.
- **Mübahisəli Məqamlar (`DISPUTED`):** Əlavə iş saatlarının illik limiti (120 saat və ardıcıl 2 gün üçün 4 saat) və işçinin yazılı razılığının rəsmiləşdirilməsi qaydası.
- **Tələb olunan qərar:**
  1. Şirkətin mağazalarında 5 günlük (8 saat), yoxsa 6 günlük (7 saat) iş həftəsi tətbiq edilir? Cəmlənmiş iş vaxtı uçotunda növbə müddəti necə tənzimlənir?
  2. Gecə işi (22:00–06:00) üçün qanunvericiliklə müəyyən edilmiş əlavə ödəniş əmsalı və ya sabit məbləğ nə qədərdir?
  3. İdarəetmə və mütəxəssis heyəti üçün 30 günlük əsas əmək məzuniyyəti hansı vəzifələrə şamil olunur (vəzifə təsnifatı siyahısı)?
  4. Əməkhaqqının ödənilməsi tezliyi: Ayda ən azı iki dəfə (avans və yekun haqq) qaydası hansı tarixlərdə icra ediləcək?

---

## 5. Əmək Müqavilələrinin Dövlət Sistemində Qeydiyyatı (ƏMAS)

- **Kontekst və Hüquqi Mənbə:** Əmək Məcəlləsinin 7-ci maddəsi. Əmək müqaviləsinin bağlanması, dəyişdirilməsi və xitamı Əmək və Əhalinin Sosial Müdafiəsi Nazirliyinin ƏMAS (Mərkəzləşdirilmiş Elektron İnformasiya Sistemi) portalında bildiriş qeydiyyatından keçdikdən sonra hüquqi qüvvəyə minir.
- **Sistemə Təsiri:** `employee_contracts` və kadr statusu keçidləri.
- **Tələb olunan qərar:**
  1. ƏMAS inteqrasiyası qurulana qədər kadr işə qəbulunun ERP daxilində təsdiqi üçün ƏMAS bildiriş nömrəsinin əl ilə daxil edilməsi məcburi edilsinmi?
  2. Əmək müqaviləsinə xitam verildikdə istifadə edilməmiş məzuniyyət günlərinin kompensasiyası necə hesablanmalıdır (orta aylıq əməkhaqqı qaydası)?

---

## 6. İstehlakçı Qaytarmaları və Dəyişdirilməsi Qaydaları

- **Kontekst və Hüquqi Mənbə:** "İstehlakçıların hüquqlarının müdafiəsi haqqında" Qanun No. 1113 və Nazirlər Kabinetinin 114 saylı Qərarı (Dəyişdirilməli və ya qaytarılmalı olmayan malların siyahısı).
- **Tələb olunan qərar:**
  1. Nazirlər Kabinetinin 114 saylı qərarı üzrə mağazanın satdığı hansı kateqoriyalar (məsələn, alt paltarları, corab məmulatları, parfümeriya) "qaytarılması qanunla qadağan edilən" kimi qeyd edilməlidir?
  2. Geyim və ayaqqabı məhsulları üçün 14 günlük mübadilə müddəti şirkət tərəfindən daha geniş (məs. 30 gün) təyin ediləcəkmi?
  3. Qüsurlu mal (DEFECT) üzrə ekspertiza və pulun geri qaytarılması üçün daxili SLA (müddət) neçə gün müəyyən edilir?
  4. Qəbzsiz qaytarma zamanı elektron qəbzin axtarışı (telefon nömrəsi, kart rekvizitləri) hansı təsdiq proseduru ilə aparılacaq?

---

## 7. Fərdi Məlumatların Qorunması, Reyestr Qeydiyyatı və Transsərhəd Ötürmə

- **Kontekst və Hüquqi Mənbə:** "Fərdi məlumatlar haqqında" Qanun No. 998-IIIQ. Fərdi məlumat informasiya sistemlərinin səlahiyyətli dövlət orqanında (Rəqəmsal İnkişaf və Nəqliyyat Nazirliyi yanında müvafiq xidmət) dövlət qeydiyyatı, fərdi məlumatların transsərhəd ötürülməsi qaydaları.
- **Tələb olunan qərar:**
  1. Şirkətin müştəri və kadr informasiya sistemi rəsmi dövlət reyestrində qeydiyyatdan keçirilibmi, yoxsa qanuni istisna (məsələn, yalnız əmək müqaviləsi məqsədilə emal) tətbiq olunur?
  2. SMS provayderi, bulud serverləri və ya analitika sistemləri Azərbaycan Respublikasının hüdudlarından kənarda yerləşirmi? Transsərhəd ötürmə üçün müştərinin xüsusi razılığı formaya əlavə edilsinmi?
  3. Loyallıq proqramına qoşularkən OTP vasitəsilə elektron razılıq hüquqi baxımdan yazılı razılığa bərabər tutulacaqmı?

---

## 8. Sənəd Saxlama (Retention) Müddətləri və Mühasibat Standartları

- **Kontekst və Hüquqi Mənbə:** Vergi Məcəlləsi (vergi sənədlərinin 5 il saxlanması tələbi), "Mühasibat uçotu haqqında" Qanun və Milli Mühasibat Uçotu Standartları (MMUS / İFRS).
- **Mübahisəli Məqamlar (`MISSING`):** Mühasibat sənədlərinin, ilkin kassa mədaxil/məxaric orderlərinin və kadr sənədlərinin arxiv müddəti ilkin qayda paketində `MISSING` olaraq qeyd edilib.
- **Tələb olunan qərar:**
  1. Şirkətin uçot siyasətində kassa çekləri, fakturalar və əməkhaqqı cədvəlləri üçün arxiv müddəti dəqiq neçə il müəyyən edilir?
  2. Məhkəmə və ya vergi yoxlaması ilə əlaqədar sənədlərə hüquqi saxlama (`LegalHold`) qoyulduqda silinmənin qadağan edilməsi müddəti necə tənzimlənir?

---

## 9. Hədiyyə Kartları, Bonus Xalları və Beh (Avans) Fiskalizasiyası

- **Kontekst və Hüquqi Mənbə:** Vergi orqanlarının hədiyyə kartları və avans ödənişləri üzrə fiskal təlimatları.
- **Tələb olunan qərar:**
  1. Hədiyyə kartı satışı zamanı dərhal fiskal avans çeki çıxarılmalıdırmı, yoxsa kartla faktiki mal alındıqda yekun fiskal çek vurulur?
  2. Loyallıq bonus xalları ilə ödəniş edildikdə bu məbləğ kassa çekində ayrıca "Bonus ödənişi" kimi göstərilir, yoxsa xalis qiymətdən endirim kimi hesablanır?
  3. Qabaqcadan beh (avans) qəbul edilərkən çekin növü necə qeyd olunmalıdır (`ADVANCE`)?
