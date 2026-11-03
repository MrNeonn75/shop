# BRAND HOUSE ERP — Texnoloji Yığın (Technology Stack & Decisions)

> Bu sənəd Brand House ERP sisteminin backend təməli üçün seçilmiş bütün texnoloji komponentləri, onların sabitləşdirilmiş (pinned) versiyalarını və hər bir seçim üçün memarlıq əsaslandırmalarını sənədləşdirir.

---

## 1. Pinned Versiyalar Cədvəli

| Kateqoriya | Alət / Kitabxana | Sabit Versiya | Təyinatı |
| :--- | :--- | :--- | :--- |
| **İcra Mühiti** | **Python** | `3.12.x` | Müasir tipləndirmə (PEP 695 type alias, generics), performans və asinxron təkmilləşdirmələr |
| **API Freymvorku** | **FastAPI** | `0.115.4` | Yüksək performanslı asinxron REST API, avtomatik OpenAPI/Swagger generasiyası |
| **ASGI Server (Dev)** | **Uvicorn** | `0.32.0` | Asinxron inkişaf serveri (auto-reload, standard worker) |
| **Proses Meneceri (Prod)**| **Gunicorn** | `23.0.0` | Production mühitində UvicornWorker ilə çoxnüvəli proses idarəetməsi |
| **Sxem & Validasiya** | **Pydantic** | `2.9.2` | Vahid məlumat validasiyası, camelCase serialization və tip təhlükəsizliyi |
| **Konfiqurasiya** | **pydantic-settings** | `2.6.0` | Ətraf mühit dəyişənlərinin (.env) tip təhlükəsiz validasiyası və startup yoxlanışı |
| **ORM** | **SQLAlchemy** | `2.0.36` | Tip-təhlükəsiz `Mapped[...]` asinxron ORM, Unit-of-Work, Core query builder |
| **DB Driver** | **asyncpg** | `0.30.0` | PostgreSQL üçün ən sürətli və etibarlı native asinxron driver |
| **Miqrasiyalar** | **Alembic** | `1.13.3` | Verilənlər bazası şeması miqrasiyaları, avtomatik generasiya və geriyədönüş |
| **Əsas Verilənlər Bazası**| **PostgreSQL** | `16-alpine` | Əməliyyat bazası (ACID, row-level locking, JSONB, UUIDv7 dəstəyi) |
| **Keş & Kilid Meneceri** | **Redis** | `7.4-alpine` | Rate limiting, paylanmış kilidlər (distributed lock), qısaömürlü keş |
| **Redis Müştərisi** | **redis-py** | `5.1.1` | Native asinxron Redis müştərisi (`redis.asyncio`) |
| **Arxa Plan İşləri** | **ARQ** | `0.26.1` | Asinxron iş növbəsi (Job broker) və vaxtaşırı tapşırıqlar (Scheduler) |
| **Struktur Loglama** | **structlog** | `24.4.0` | Konfiqurasiya edilə bilən JSON loglar, PII/kart/şifrə təmizləməsi |
| **Şifrələmə / Hashing** | **argon2-cffi** | `23.1.0` | OWASP tərəfindən tövsiyə olunan ən təhlükəsiz parol heşləmə alqoritmi (Argon2id) |
| **CLI Alətləri** | **Typer** | `0.12.5` | Məlumat bazası toxumlanması (seed), backup və inzibati skriptlər |
| **Test Freymvorku** | **pytest** | `8.3.3` | Test icra mühiti |
| **Asinxron Testlər** | **pytest-asyncio** | `0.24.0` | Asinxron fixture və test funksiyalarının idarəsi |
| **HTTP Test Müştərisi** | **httpx** | `0.27.2` | FastAPI tətbiqinin ASGI transport ilə inteqrasiya testləri |
| **Xassə Əsaslı Test** | **hypothesis** | `6.115.3` | Maliyyə hesablamaları, pul yuvarlaqlaşdırması və idempotency property testləri |
| **Model Fabriki** | **polyfactory** | `2.16.2` | Pydantic v2 və SQLAlchemy üçün tip-təhlükəsiz mock məlumat fabriki |
| **Konteyner Testləri** | **testcontainers** | `4.8.2` | CI mühitində real müvəqqəti PostgreSQL konteyneri ilə inteqrasiya testləri |
| **Linter & Formatter** | **Ruff** | `0.7.0` | Ultra-sürətli Rust əsaslı linter və kod formatlayıcı (Flake8, Black, isort əvəzi) |
| **Statik Tip Yoxlayıcı** | **mypy** | `1.13.0` | `--strict` rejimində tam statik tip təhlili |
| **Memarlıq Linteri** | **import-linter** | `2.1` | Modullararası asılılıq qaydalarının (dependency contracts) CI-da təftişi |
| **Təhlükəsizlik Skanı** | **pip-audit** | `2.7.3` | Asılılıqlardakı məlum zəifliklərin (CVE) avtomatik auditi |

---

## 2. Memarlıq Seçimlərinin Əsaslandırılması (Rationale)

### 2.1. Niyə Celery yox, ARQ?
Tələblərdə Celery və ya ARQ seçilməsi və əsaslandırılması tələb olunmuşdur:
1. **Async-Native Uyğunluq:** Brand House ERP backend-i tamamilə Python 3.12 `asyncio` və asinxron SQLAlchemy 2.0 / `asyncpg` üzərində qurulub. Celery tarixi olaraq sinxron arxitekturaya malikdir; asinxron kodla işləyərkən event loop idarəetməsi, gevent/eventlet monkey-patching və ya `async_to_sync` wrapper-lər tələb edir ki, bu da asyncpg bağlantı hovuzlarında (connection pool) qırılmalara və deadlock-lara səbəb olur.
2. **ARQ-ın Üstünlükləri:**
   - ARQ birbaşa `asyncio` və Redis üzərində qurulub.
   - FastAPI və SQLAlchemy ilə eyni asinxron sessiyaları təbii şəkildə paylaşır.
   - Transactional Outbox hadisələrinin emalı, e-poçt/SMS göndərişi və dövri hesabat generasiyası üçün olduqca yüngüldür (Celery-nin ağır Kombu/Billiard asılılıqlarına ehtiyac yoxdur).
   - Quraşdırılmış `cron()` dəstəyi ilə kənar Celery Beat instansiyası olmadan vaxtaşırı tapşırıqları icra edir.

### 2.2. Niyə UUIDv7?
1. **İndeks Səmərəliliyi (B-Tree Locality):** Klassik UUIDv4 tam təsadüfi paylandığı üçün verilənlər bazasının B-Tree indekslərində ciddi parçalanmaya (fragmentation) və disk I/O gecikməsinə səbəb olur.
2. **Xronoloji Sıralanma:** UUIDv7 ilk 48 bitində millisaniyə dəqiqlikli zaman damğasını saxlayır (RFC 9562). Bu, sətirlərin daxil edilmə ardıcıllığı ilə indekslənməsini təmin edir və avtomatik artan BIGSERIAL kimi sıralama üstünlüyü verir, eyni zamanda paylanmış sistemlərdə qlobal unikal qalır.

### 2.3. Niyə Python Decimal və `NUMERIC(14,2)`?
1. **İkiqat Dəqiqlikli Üzən Nöqtə (Float) Qadağası:** Kompüter arxitekturasında IEEE 754 üzən nöqtəli ədədlər (float/double) binar kəsrləri dəqiq ifadə edə bilmir (məsələn: `0.1 + 0.2 = 0.30000000000000004`). Maliyyə sistemində bir qəpiklik fərq belə audit və balans uyğunsuzluğu yaradır.
2. **Bankir və Kommersiya Yuvarlaqlaşdırması:** Sistemdə `ROUND_HALF_UP` qaydası tətbiq olunur və vergi/endirim paylanmasında Penny/Qəpik itkisinin qarşısını alan paylama alqoritmi (Largest Remainder) reallaşdırılır.

### 2.4. Niyə structlog?
1. **Strukturlaşdırılmış JSON:** Müasir bulud və mikro-xidmət mühitlərində log aqreqatorları (ELK, Loki, Datadog) JSON formatını birbaşa indeksləyir.
2. **PII və Kart Məlumatlarının Avtomatik Maskalanması:** `structlog` prosessoru vasitəsilə sorğu/cavab loglarında parollar, tokenlər və kart nömrələri (Luhn uyğunluğu) avtomatik maskalanır.
3. **Correlation ID İnteqrasiyası:** Hər bir HTTP sorğusu üçün generasiya olunan `X-Correlation-ID` avtomatik olaraq bütün log sətirlərinə və verilənlər bazası Outbox hadisələrinə bağlanır.

