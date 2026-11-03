# Brand House Retail ERP — Təhlükəsizlik Təhdid Modeli (Threat Model)

Bu sənəd Brand House pərakəndə satış idarəetmə sisteminin (ERP) Microsoft STRIDE metodologiyasına uyğun hazırlanmış rəsmi təhlükəsizlik təhdid modelidir.

---

## 1. Etibarlılıq Sərhədləri və Arxitektura Zonaları (Trust Boundaries)

```
[İstifadəçi Brauzeri / POS Terminal / Mobil Tətbiq]
                     │
                     ▼ (İctimai Şəbəkə - TLS 1.3 / mTLS)
   ┌────────────────────────────────────────────────────────┐
   │ Zon 1: Kənar Təhlükəsizlik (Edge / Reverse Proxy)      │
   │ - Cloudflare / Nginx (DDoS, WAF, Rate Limiting)        │
   │ - Security Headers (HSTS, CSP, X-Frame-Options)        │
   └────────────────────────────────────────────────────────┘
                     │ (Daxili Şəbəkə / VPC)
                     ▼
   ┌────────────────────────────────────────────────────────┐
   │ Zon 2: Tətbiq Qatı (Modular Monolith Backend)          │
   │ - FastAPI App (Autentifikasiya, RBAC, Branch Scope)    │
   │ - Idempotency Manager, Audit Logging Middleware        │
   │ - PII Field-Level Encryption Engine                    │
   └────────────────────────────────────────────────────────┘
                     │ (VPC / Əlaqəli Şəbəkə)
                     ▼
   ┌────────────────────────────────────────────────────────┐
   │ Zon 3: Məlumat və Saxlanc Qatı                         │
   │ - PostgreSQL (Row-Level Security, Encrypted at Rest)   │
   │ - Redis (Keş, SSE pub/sub)                             │
   │ - Transactional Outbox (Asinxron Hadisələr)            │
   └────────────────────────────────────────────────────────┘
                     │ (Kənar Şəbəkə / TLS)
                     ▼
   ┌────────────────────────────────────────────────────────┐
   │ Zon 4: Kənar Sistemlər və İnteqrasiyalar               │
   │ - Bank / Ödəniş Gateway, Dövlət Fiskal Kassa (NKA)     │
   │ - SMS / E-poçt Provayderləri, 1C / Mühasibatlıq        │
   └────────────────────────────────────────────────────────┘
```

---

## 2. STRIDE Metodologiyası Üzrə Modul Analizi

| Təhdid Kateqoriyası | Təsvir və Tətbiqi | Qarşısının Alınması Mexanizmi (Mitigation) |
|---|---|---|
| **S - Spoofing** (Kimlik Saxtalaşdırması) | Təcavüzkarın başqa kassir, menecer və ya sistem adından sorğu göndərməsi. | - Qısamüddətli (15 dəqiqəlik) kriptoqrafik imzalanmış JWT access token.<br>- Token-lərdə HMAC-SHA256 əsaslı `kid` açar rotasiyası.<br>- Xarici vebhuklarda HMAC-SHA256 imza və 300s replay-window tələbi.<br>- 2FA (MFA) dəstəyi inzibati və maliyyə rolları üçün məcburidir. |
| **T - Tampering** (Məlumatın Dəyişdirilməsi) | Kassa satış qiymətinin frontend-də dəyişdirilməsi, stok hərəkətlərinin və ya audit loqlarının silinməsi. | - **Server-side pricing**: POS qiymətləndirməsi və endirimlər YALNIZ serverdə hesablanır (`PricingService.quote`). Frontend qiyməti qəbul edilmir.<br>- **Append-only Ledgers**: Maliyyə jurnalları, anbar hərəkətləri (`stock_movements`) və audit qeydləri `UPDATE` və ya `DELETE` oluna bilməz.<br>- **SHA-256 Hash Chain**: Audit loqları kriptoqrafik zəncirlə bağlanır. |
| **R - Repudiation** (İnkar Edilmə) | Kassirin endirim vurduğunu, kassadan nağd çıxardığını və ya əməkdaşın maaş dəyişdirdiyini inkar etməsi. | - Hər bir mutasiya edən sorğuda icraçı (`actor_id`), IP ünvanı, filial ID-si və dəqiq UTC vaxt qeydə alınır.<br>- Kritik əməliyyatlarda (menecer endirimi, kassa dərhal ləğvi) menecer təsdiq tokeni (`manager_approval_token`) tələb edilir və auditə tikilir. |
| **I - Information Disclosure** (Məlumat Sızması) | Müştəri PII məlumatlarının, əməkdaş maaşlarının və ya kart detallarının sızdırılması. | - Əməkdaş PII məlumatları (FİN, pasport, bank rekvizitləri, ünvan) app-level AES-256-GCM ilə şifrələnir (`app.core.security.encryption`).<br>- Kart nömrələri (PAN), CVV sistemdə heç vaxt saxlanılmır (PCI-DSS uyğunluğu).<br>- Şirkətlər və filiallar arası izolasiya (`branch_id` filtri). |
| **D - Denial of Service** (Xidmətdən İmtina) | Kassa sisteminin həddindən artıq sorğularla iflic edilməsi, N+1 sorğularla DB-nin kilidlənməsi. | - `RateLimiter` middleware (IP və istifadəçi səviyyəsində).<br>- Sorğu həcmi məhdudiyyəti (`RequestSizeLimitMiddleware` - max 10MB).<br>- Statement timeout (analitika üçün 30s, POS üçün 5s).<br>- N+1 sorğuların qarşısını alan `selectinload` və `joinedload` arxitekturası. |
| **E - Elevation of Privilege** (Səlahiyyət Artırma) | Kassirin admin endpoint-lərinə müraciət etməsi, özünə əlavə rol verməsi (IDOR). | - `RBAC` (Role-Based Access Control) və dənəvər icazə sistemi (`can_view_catalog`, `check_can_post_gl` və s.).<br>- `test_architecture_and_security_audit.py` testində 100% endpoint icazə təftişi.<br>- Self-escalation yoxlaması: Heç kim öz rolunu və ya hüquqlarını artıra bilməz. |

---

## 3. Pərakəndə Satışa Xas Sui-istifadə Halları (Retail Abuse Cases)

### 3.1. Endirim Sui-istifadəsi (Discount Abuse)
- **Hücum**: Kassir dostlarına və ya tanışlarına icazəsiz 20%-50% endirim tətbiq edir.
- **Müdafiə**: Kassirlər üçün maksimum 5% endirim limiti; 5%-dən yuxarı endirimlərdə mütləq filial menecerinin birdəfəlik `manager_token`-i tələb olunur (`PosPolicy.check_discount_allowed`). Hər endirim `quote_id` və səbəb kodu ilə audit olunur.

### 3.2. Saxta Mal Qaytarmaları (Fake Returns)
- **Hücum**: Kassir və ya müştəri alınmamış məhsul üçün qəbzsiz qaytarma tələb edir və ya 14 günlük qanuni müddət bitdikdən sonra nağd pul mənimsəyir.
- **Müdafiə**: Qaytarma mütləq ilkin satış sənədi (`sale_id`) ilə əlaqələndirilir. Qəbzsiz qaytarmalarda sistem filial rəhbərinin təsdiqini tələb edir (`returns.approve` hüququ). Qaytarılan mallar avtomatik maya dəyəri və loyallıq xallarının proporsional geri çıxılması (`REVERSE_EARN`) ilə icra edilir.

### 3.3. İnventar Silinməsi və Faktiki Oğurluq (Inventory Theft via Write-offs)
- **Hücum**: Anbardar məhsulları "qüsurlu" və ya "itmiş" göstərərək mənimsəyir.
- **Müdafiə**: Bütün inventar tənzimləmələri (`ADJUSTMENT_MINUS`, `DAMAGED`) SoD (Segregation of Duties) prinsipi ilə idarə olunur. Sayım sessiyaları (`CountSession`) dondurulmuş stokla aparılır və kənarlaşmalar yalnız mərkəzi menecer tərəfindən təsdiqlənir (`inventory.count.approve`).

### 3.4. Əməkhaqqı Manipulyasiyası (Payroll Manipulation)
- **Hücum**: HR mütəxəssisi işçinin maaş profilini gizlicə artırır və ya "ölü can" (fake işçi) əlavə edərək ödəniş çıxarır.
- **Müdafiə**: `salary_profiles` cədvəlində dəyişikliklər 4-göz (Four-Eyes Principle / SoD) prinsipi tələb edir: Hazırlayan (`hr.payroll.prepare`) ilə təsdiq edən (`hr.payroll.approve`) fərqli istifadəçilər olmalıdır. Bank çıxarış faylları şifrələnmiş qeydlərlə generasiya olunur.

### 3.5. Məlumatın Kütləvi Çıxarılması (Data Exfiltration via Reports)
- **Hücum**: Rəqibə müştəri bazasını və ya gəlir rəqəmlərini satmaq üçün analitika və ya müştəri bazasının ixracı (`Export CSV/Excel`).
- **Müdafiə**: Bütün kütləvi ixrac sorğuları (`crm.customer.export`, `reports.export`) xüsusi icazə tələb edir və dərhal kritik səviyyəli audit hadisəsi generasiya edir (`DATA_EXPORT_TRIGGERED`). İxrac fayllarında PII sahələri maskalanmış qalır.

