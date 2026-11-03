# Bildirişlər və Xəbərdarlıqlar Sistemi (Notifications Architecture)

## 1. Giriş və Əsas Prinsiplər
Brand House ERP bildiriş sistemi daxili əməliyyat xəbərdarlıqlarını (az qalıq, gözləyən təsdiqlər, şübhəli girişlər, kassa qeyri-dəqiqlikləri) istifadəçilərə vaxtında və etibarlı şəkildə çatdırmaq üçün layihələndirilib.

### Əsas Prinsiplər:
1. **Şəffaflıq və Yalandan Göndərişin Qadağan Edilməsi:**
   Kənar rabitə provayderi (SMS, E-poçt, WhatsApp, Push) konfiqurasiya edilməyibsə və ya `ACTIVE` deyilsə, sistem heç vaxt göndəriş simulyasiyası etmir. Jurnalda dərhal və açıq şəkildə `SKIPPED_NOT_CONFIGURED` statusu qeydə alınır.
2. **Biznes Əməliyyatlarının Bloklanmaması:**
   Satış, kassa və ya anbar tranzaksiyaları heç vaxt kənar bildiriş göndərişinin nəticəsini gözləmir. Bütün çatdırılmalar Transactional Outbox vasitəsilə tamamilə asinxron icra olunur.
3. **Şablon Təhlükəsizliyi (Template Injection Defense):**
   Bütün şablon dəyişənləri `html.escape` vasitəsilə sanitarizasiya olunur. Şablonlarda ixtiyari kod icrası (arbitrary code execution) qətiyyən mümkün deyil.
4. **Məxfilik və PII Mühafizəsi:**
   Bildiriş jurnallarında telefon nömrələri və e-poçt ünvanları maskalanmış şəkildə (`+99450***12`, `e***n@brandhouse.az`) qeyd edilir.

---

## 2. Bildiriş Kanalları

| Kanal | Status | Təsvir |
| :--- | :--- | :--- |
| `IN_APP` | Həmişə Aktiv | Sistem daxili `notifications` feed-i və canlı SSE axını. |
| `EMAIL` | Şərti Aktiv | SMTP host və göndərən e-poçt təyin edildikdə işləyir. |
| `SMS` | Şərti Aktiv | SMS provayderi və API açarı təsdiq edildikdə işləyir. |
| `WHATSAPP` | Şərti Aktiv | WhatsApp Business API təsdiq edildikdə işləyir. |
| `PUSH` | Şərti Aktiv | WebPush / Firebase Cloud Messaging (FCM) provayderi aktiv olduqda işləyir. |

---

## 3. Dinamik Alert Qaydaları Mühərriki (Rule Engine)

Alert qaydaları (`NotificationRule`) vasitəsilə administratorlar hansı hadisələrin kimə və necə çatdırılacağını təyin edir:
- **Şərt Qiymətləndirilməsi (`condition`):** JSON əsaslı şərtlər (məs: `{"field": "grand_total", "op": ">=", "value": 1000}`).
- **Alıcıların Dinamik Təyini (`recipient_type`):**
  - `ROLE`: Həmin rola malik aktiv istifadəçilər (məs: `inventory_manager`, `branch_manager`).
  - `BRANCH_MANAGER`: Hadisənin baş verdiyi filialın meneceri.
  - `SPECIFIC_USER`: Xüsusi təyin edilmiş istifadəçi ID-si.
- **Filial Səlahiyyəti Süzgəci (`branch_scope`):** İstifadəçi yalnız onun `allowed_branches` siyahısına aid olan filialların bildirişlərini ala bilər.
- **Dublikatın Qarşısının Alınması (Deduplication):** 15 dəqiqə ərzində eyni `dedupe_key`-ə malik hadisələr təkrarlanmır.
- **Sakit Saatlar (Quiet Hours):** İstifadəçi fərdi parametrlərində sakit saatlar (məs: 22:00 - 08:00) təyin edibsə, qeyri-kritik bildirişlər `SKIPPED_QUIET_HOURS` statusu ilə saxlanılır.
- **Eskalasiya Siyasəti:** Əgər `critical` dərəcəli bildiriş `escalate_after_minutes` ərzində oxunmazsa, avtomatik olaraq rəhbər rola (`escalation_role`) eskalasiya bildirişi yaradılır.

---

## 4. Təsdiqləmələr Qutusu (Approvals Inbox)

- Endpoint: `GET /api/v1/notifications/approvals-inbox`
- İstifadəçinin cari hüquqları çərçivəsində təsdiqini gözləyən bütün sənədlər toplanır:
  1. Satınalma sorğuları və sifarişləri (`PURCHASE_REQUEST`, `PURCHASE_ORDER`)
  2. Anbarlararası transferlər (`TRANSFER`)
  3. Maliyyə xərcləri (`EXPENSE`)
  4. İşçi məzuniyyətləri (`LEAVE`)
  5. Maaş cədvəlləri (`PAYROLL`)
- Cavab formatı UI sol yan menyusunda (sidebar) qırmızı nişan (badge) sayğaclarını avtomatik qidalandırır.

