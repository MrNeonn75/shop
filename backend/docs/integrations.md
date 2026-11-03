# Kənar İnteqrasiyalar Çərçivəsi (Integrations Framework)

## 1. Giriş və Əsas Prinsiplər
Brand House ERP kənar xidmətlərlə (bank şlüzləri, SMS mərkəzləri, fiskal kassa aparatları, biometrik turniketlər, köhnə brendhouse.az saytı) əlaqəni vahid və təhlükəsiz şəkildə idarə edir.

### Əsas Prinsiplər:
1. **Heç vaxt feyk "ACTIVE" statusu verilmir:**
   İnteqrasiya yalnız uğurlu real `test-connection` verifikasiyasından sonra `ACTIVE` ola bilər. Tələb olunan parametrlər çatışmırsa, status birmənalı olaraq `NOT_CONFIGURED` qalır.
2. **Açarlar Yalnız Yazma-Tiplidir (Write-only):**
   Məxfi API açarları, şifrələr və sertifikatlar API cavablarında heç vaxt açıq qaytarılmır. Bütün rekvizitlər verilənlər bazasında AES-256 (Fernet zərf şifrələnməsi) ilə saxlanılır.
3. **Circuit Breaker (Qoruyucu Dövrə):**
   Xarici provayderdən ardıcıl 5 xəta alındıqda dövrə `OPEN` vəziyyətinə keçir və sistemi ləngitməmək üçün növbəti çağırışları dərhal rədd edir. 60 saniyəlik soyuma müddətindən sonra `HALF_OPEN` test sınağı aparılır.

---

## 2. Standart Rezerv Olunmuş İnteqrasiyalar Reyestri

| Açar (`key`) | Kateqoriya | Təsvir | Defolt Status |
| :--- | :--- | :--- | :--- |
| `payment_provider` | `payment` | Bank Kart Ödəniş Şlüzü (POS və E-ticarət) | NOT_CONFIGURED |
| `sms` | `sms` | SMS Bildiriş Xidməti (OTP və Müştəri Mesajları) | NOT_CONFIGURED |
| `email` | `email` | E-Poçt Göndəriş Xidməti (SMTP) | NOT_CONFIGURED |
| `whatsapp` | `messaging` | WhatsApp Business API Şablon Mesajları | NOT_CONFIGURED |
| `printer_service` | `hardware` | Fiskal və Şəbəkə ESC/POS Çap Xidməti | NOT_CONFIGURED |
| `attendance_devices` | `biometric` | Turniket və Biometrik Giriş-Çıxış Cihazları | NOT_CONFIGURED |
| `accounting_gl` | `accounting` | Mühasibatlıq / 1C Baş Kitabxana Sinxronizasiyası | NOT_CONFIGURED |
| `brendhouse_legacy_api`| `ecommerce` | Köhnə Brendhouse.az E-Ticarət Körpüsü | NOT_CONFIGURED |

---

## 3. Provayder-Agnostik Portlar və Adapterlər

Biznes modulları heç bir konkret xarici provayderdən asılı deyil, yalnız `app/modules/integrations/ports/` qovluğundakı mücərrəd interfeyslərlə işləyir:
- `PaymentGatewayPort`: `authorize()`, `capture()`, `refund()`, `void()`, `verify_credentials()`.
- `FiscalServicePort`: `print_fiscal_receipt()`, `generate_e_receipt()`, `get_fiscal_status()`.
- `SmsProviderPort`, `EmailProviderPort`, `WhatsAppProviderPort`: mesaj göndərişi və balans yoxlanışı.
- `PrinterServicePort`: xam ESC/POS bayt axını çapı.
- `AttendanceDevicePort`: biometrik cihazdan daxili qeydlərin oxunması.
- `AccountingPort`: Baş Kitabxana müxabirləşmələrinin ötürülməsi.
- `LegacyStorePort`: köhnə sistemlə kataloq və anbar qalıqları körpüsü.

---

## 4. Təhlükəsizlik və Əməliyyatlar

### 4.1. Rekvizitlərin Zərf Şifrələnməsi (Envelope Encryption)
- Məxfi açarlar `encrypt_integration_secrets` funksiyası ilə şifrələnərək `integrations.encrypted_secrets` sütununda saxlanılır.
- Açarlar dəyişdirildikdə `POST /api/v1/integrations/{key}/rotate-secrets` vasitəsilə rotasiya edilir.

### 4.2. Vebhukların İmzalanması (HMAC Signature Verification)
- Kənar sistemlərdən gələn bildiriş və status vebhukları HMAC-SHA256 ilə imzalanır.
- `X-Signature` və zaman damğası (`timestamp`) sabit zamanlı müqayisə ilə (`hmac.compare_digest`) yoxlanılır.

### 4.3. Sinxronizasiya Sessiyaları (Sync Engine)
- İnteqrasiya `ACTIVE` deyilsə, arxa plan sinxronizasiyasına icazə verilmir.
- `POST /api/v1/integrations/{key}/sync` vasitəsilə `is_dry_run=true` rejimində verilənlər bazasına təsir etmədən potensial kənarlaşmalar aşkarlanır.
- Xarici və daxili ID-lər `external_ref_mappings` cədvəlində saxlanılır.

