# Brand House Retail ERP — Məlum Məhdudiyyətlər (Known Limitations)

Bu sənəd sistemin Release Candidate (v1.0.0-rc1) mərhələsində mövcud olan məlum texniki və əməliyyat məhdudiyyətlərini dürüst və şəffaf şəkildə sənədləşdirir.

---

## 1. Oflayn Kassa Satışı (Offline POS Mode)
- **Cari Vəziyyət**: Backend sistemi server-tərəfli qiymətləndirmə və dəqiq fasiləsiz çek nömrələməsi (`numbering.next`) tələb etdiyi üçün kassaların daimi lokal/mərkəzi şəbəkə bağlantısı (LAN/WAN) olması fərz edilir.
- **Məhdudiyyət**: Kassa terminalının interneti/şəbəkəsi tamamilə kəsildikdə yeni çek vura bilməz (tam oflayn kassa sinxronizasiyası v1 əhatəsində deyil).
- **Həll Yolu (Mitigation)**: Filiallarda ehtiyat 4G/LTE router xətlərinin təmin edilməsi tövsiyə olunur.

---

## 2. Dövlət Fiskal Kassa Aparatı (NKA İnteqrasiyası)
- **Cari Vəziyyət**: `FiscalPrinterPort` interfeysi və qəbz modeli tam hazırdır. Lakin fiziki fiskal aparat istehsalçısı (məs: Sunmi, Datecs, NBA) müştəri tərəfindən seçilmədiyi üçün sistem standart olaraq `UnconfiguredFiscalPrinter` rejimindədir (`NOT_CONFIGURED`).
- **Tələb**: Go-live öncəsi seçilən fiskal aparatın drayver adapteri aktivləşdirilməlidir.

---

## 3. Bank Ödəniş Gateway Kommersiya Provayderi
- **Cari Vəziyyət**: `PaymentGatewayPort` və kart ödəniş axını hazırdır. İstehsalat bankı (məs: Kapital Bank, Paşa Bank, ABB) ilə kommersiya müqaviləsi və real `merchant_id` təqdim edilməyənədək ödəniş şlüzü quraşdırılmamış status qaytarır.

---

## 4. 1C / Köhnə Sistemlərlə İnteqrasiya
- **Cari Vəziyyət**: `LegacyAccountingPort` interfeysi və məlumat miqrasiya alətləri (`scripts/data_migration.py`) yaradılıb. Müştərinin mövcud 1C verilənlər bazası strukturu və şəbəkə topologiyası müəyyənləşdikdən sonra birbaşa konnektor quraşdırılacaqdır.

---

## 5. Baş Mühasibat Kitabı (General Ledger) Xüsusiyyət Bayrağı (Feature Flag)
- **Cari Vəziyyət**: İkiqat qeydiyyatlı mühasibat uçotu (GL) tam şəkildə proqramlaşdırılıb, lakin kiçik pərakəndə filialların əməliyyat sadəliyi üçün ilkin olaraq `finance.gl.enabled = False` sazlaması ilə təqdim edilir. Baş mühasib istədiyi an bu funksiyanı şirkət səviyyəsində aktivləşdirə bilər.

