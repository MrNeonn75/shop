# HR və Əmək Haqqı Sistemində Fərdi Məlumatların Qorunması (Privacy & Data Protection)

Bu sənəd Brend House ERP sistemində işçilərin fərdi məlumatlarının (PII - Personally Identifiable Information) qorunması, saxlanması, şifrələnməsi, maskalanması və arxivləşdirilməsi siyasətini müəyyən edir. Sistem Azərbaycan Respublikasının "Fərdi məlumatlar haqqında" Qanununun və beynəlxalq GDPR tələblərinin əsas prinsiplərinə uyğunlaşdırılmışdır.

---

## 1. Məlumatların Minimallaşdırılması (Data Minimization)

Sistem yalnız əmək münasibətlərinin rəsmiləşdirilməsi, qanunvericilik tələbləri, iş qrafiklərinin tərtibi və əmək haqqının hesablanması üçün zəruri olan məlumatları toplayır:
- Zəruri operativ məlumatlar: Ad, soyad, əlaqə vasitələri (iş/şəxsi telefon, e-poçt), vəzifə, filial, işə qəbul və çıxma tarixləri.
- Həssas fərdi məlumatlar (PII): Fərdi İdentifikasiya Nömrəsi (FİN / Şəxsiyyət vəsiqəsi seriyası), bank hesabı (IBAN), doğum tarixi, yaşayış ünvanı.
- Zərurət olmayan, izafi və ya diskriminativ xarakter daşıyan heç bir məlumat (məs. dini, siyasi, biometrik xam fayllar) sistemdə saxlanılmır.

---

## 2. Saxlama və Kolon Səviyyəsində Şifrələnmə (Column-Level Encryption at Rest)

Bütün yüksək həssaslıqlı fərdi məlumatlar əsas `hr_employees` cədvəlindən ayrılaraq xüsusi `hr_employee_sensitive_data` cədvəlində saxlanılır və **verilənlər bazasında şifrəli şəkildə** qorunur.

### 2.1 Şifrələnmə Arxitekturası
- **Alqoritm:** AES-128/256 CBC / HMAC-SHA256 (Fernet simmetrik şifrələmə standartı).
- **Modul:** `app.core.crypto` (`encrypt_pii`, `decrypt_pii`, `rotate_pii_ciphertext`).
- **Açar İdarəetməsi:**
  - Əsas şifrələmə açarı sistem mühiti dəyişənlərindən (`PII_ENCRYPTION_KEY`) əldə edilir.
  - Şifrələnmiş mətnin daxilində versiya prefiksi (`v1:...`) saxlanılır.
- **Açarların Dövri Dəyişdirilməsi (Key Rotation):**
  - Təhlükəsizlik qaydalarına uyğun olaraq köhnə açarlar `PII_ROTATION_KEYS` siyahısında saxlanılır.
  - Açarlar dəyişdirildikdə sistem köhnə açarla şifrlənmiş məlumatları oxuyub yeni açarla yenidən şifrələmə imkanına malikdir (`rotate_pii_ciphertext`).

### 2.2 Şifrələnən Sahələr
| Sahə Adı | Saxlanılan Sütun | Açıqlama |
|---|---|---|
| FİN / Pasport | `national_id_encrypted` | Şəxsiyyət vəsiqəsi FİN kodu və ya xarici pasport nömrəsi |
| Bank Hesabı / IBAN | `bank_account_iban_encrypted` | Əmək haqqı köçürmələri üçün rəsmi bank hesabı |
| Doğum Tarixi | `date_of_birth_encrypted` | Yaş və pensiya hesablamaları üçün tarix |
| Ev Ünvanı | `home_address_encrypted` | Rəsmi qeydiyyat və ya yaşayış ünvanı |

---

## 3. Maskalama və Açıqlama Nəzarəti (Masking & Privileged Reveal)

### 3.1 Defolt Maskalama
İşçilərin siyahısı (`GET /api/v1/hr/employees`), işçi təfərrüatları və ya ixrac hesabatları zamanı həssas məlumatlar heç vaxt açıq mətndə göndərilmir:
- Milli ID / FİN: `AZE*****123` (ilk 3 və son 3 simvol istisna olmaqla maskalanır).
- Bank Hesabı: `AZ** **** **** **** 4567` (yalnız son 4 rəqəm göstərilir).
- Doğum Tarixi və Ev Ünvanı: `[MASKALANMIŞDIR]`.

### 3.2 İcazəli Açıqlama (Privileged Unmask Endpoint)
Həssas məlumatların tam mətndə əldə edilməsi üçün xüsusi endpoint təyin edilmişdir:
- **Endpoint:** `GET /api/v1/hr/employees/{id}/sensitive`
- **Tələb olunan İcazə:** `hr.pii.view` (yalnız səlahiyyətli Kadrlar rəhbəri və ya Baş Mühasibə verilir).
- **Audit Qeydi:** Hər bir açıqlama sorğusu audit sistemində dərhal qeydə alınır:
  - Kim sorğu etdi (`actor_id`, `actor_username`),
  - Hansı işçinin məlumatı açıqlandı (`employee_id`),
  - Nə vaxt (`timestamp`),
  - Sorğu səbəbi / əsaslandırma (`audit_reason`).

### 3.3 İxrac Təhlükəsizliyi
Excel, CSV və ya PDF ixrac sənədlərində (bank köçürmə faylı istisna olmaqla) həssas PII sütunları daxil edilmir və ya maskalanmış formatda təqdim edilir.

---

## 4. Saxlama Müddəti və Anonimləşdirmə (Retention & Anonymization)

Əmək müqaviləsinə xitam verilmiş işçilərin məlumatları qanunvericiliklə müəyyən edilmiş müddətdən artıq saxlanıla bilməz.

### 4.1 Qanuni Saxlama Müddəti (Retention Period)
- İşdən çıxarılmış (`TERMINATED`) işçilərin məlumatlarının saxlanma müddəti sistem parametrlərində konfiqurasiya olunur (`hr.retention_period_days`, susmaya görə 1825 gün / 5 il).
- **Hüquqi Qadağa Bayrağı (`legal_hold_flag`):** Məhkəmə mübahisəsi, vergi yoxlaması və ya əmək müfəttişliyi araşdırması davam edən işçilərin profilinə `legal_hold_flag = True` qoyulur. Bu bayraq aktiv olduqda sistem heç bir halda avtomatik silmə və ya anonimləşdirmə aparmır.

### 4.2 Avtomatik Anonimləşdirmə İşi (`anonymize_retention_expired_employees_job`)
Arxa planda dövri olaraq (məs. hər bazar günü) icra olunan iş aşağıdakı ardıcıllığı yerinə yetirir:
1. `status == TERMINATED`, `termination_date <= now - retention_days` və `legal_hold_flag == False` olan işçilər müəyyən edilir.
2. İşçinin adı və soyadı `Anonimləşdirilmiş` sözü ilə əvəzlənir.
3. Əlaqə məlumatları (telefon, e-poçt, qeydiyyat ünvanı) silinir.
4. `hr_employee_sensitive_data` cədvəlindəki bütün şifrələnmiş qeydlər ləğv edilir.
5. İşçinin əvvəlki dövrlərə aid maliyyə və statistik məlumatları (əmək haqqı cədvəllərindəki anonim ID-lər və xərc cəmləri) vergi hesabatlılığı üçün saxlanılır, lakin şəxslə əlaqəsi bərpaedilməz şəkildə kəsilir.
6. Əməliyyat üzrə sistem audit loqu yazılır.

