# BRAND HOUSE ERP — Sistem Memarlığı (System Architecture)

> Brand House ERP — geyim, ayaqqabı və aksesuarların çoxfiliallı pərakəndə satışı üzrə ixtisaslaşmış müəssisə idarəetmə sistemidir. Bu sənəd sistemin backend memarlıq prinsiplərini, laylararası asılılıq qaydalarını və hadisə əsaslı inteqrasiya modelini ətraflı izah edir.

---

## 1. Memarlıq Stili: Modulyar Monolit (Modular Monolith)

Sistem mikroxidmətlər deyil, **Modulyar Monolit** prinsipləri əsasında dizayn edilmişdir:
- **Tək Kod Bazası və Baza:** Bütün modullar vahid repozitoriyada saxlanılır və eyni PostgreSQL verilənlər bazasını paylaşır.
- **Sərt Sərhədlər (Strict Boundaries):** Hər bir biznes domeni müstəqil modul kimi formalaşır və digər modulların daxili strukturlarına birbaşa daxil ola bilməz.
- **Paylanmış Tranzaksiya Yoxdur:** Mikroxidmətlərdəki mürəkkəb iki fazalı kommit (2PC) və ya xətalı paylanmış SAGA problemləri aradan qaldırılır; bütün əlaqəli əməliyyatlar PostgreSQL-in yerli ACID tranzaksiyalarında icra olunur.

---

## 2. Qovluq və Fayl Strukturu

```text
backend/
├── app/
│   ├── core/                        # Tətbiqin qlobal, biznesdən asılı olmayan təməl infrastrukturu
│   │   ├── config.py                # Konfiqurasiya və ətraf mühit (.env)
│   │   ├── database.py              # Asinxron DB sessiyası və Base model
│   │   ├── ids.py                   # UUIDv7 identifikator generatoru
│   │   ├── money.py                 # Money dəyər tipi və kəmiyyət qaydaları
│   │   ├── clock.py                 # İnyeksiya edilə bilən Saat (UTC & Asia/Baku)
│   │   ├── errors.py                # Vahid xəta zərfi və xəta kataloqu
│   │   ├── localization.py          # Mesajlar kataloqu (Azərbaycan dili defolt)
│   │   ├── pagination.py            # FilterBar uyğun çeşidləmə, filtrasiya və səhifələmə
│   │   ├── idempotency.py           # Idempotency-Key asılılığı və saxlanması
│   │   ├── concurrency.py           # Row-level kilidləmə və deadlock-dan qorunma
│   │   ├── uow.py                   # Unit of Work tranzaksiya meneceri
│   │   ├── logging.py               # structlog və PII/parol təmizləyici
│   │   ├── security.py              # Argon2id parol heşləməsi
│   │   ├── middleware.py            # Correlation-ID, Rate Limiting, Təhlükəsizlik başlıqları
│   │   ├── telemetry.py             # OpenTelemetry və Sentry hook-ları
│   │   └── health.py                # /health/live, /health/ready, /health/details
│   ├── shared/                      # Modullararası paylaşılan infrastruktur və müqavilələr
│   │   ├── events.py                # Daxili domen hadisələri şini (Event Bus)
│   │   ├── outbox.py                # Transactional Outbox modeli və meneceri
│   │   ├── audit.py                 # İmmutable Audit hadisələri skeleti
│   │   └── integrations.py          # İnteqrasiya statusları və "NOT CONFIGURED" zərfləri
│   ├── modules/                     # Biznes modulları (Hər modul müstəqildir)
│   │   └── <module_name>/
│   │       ├── router.py            # FastAPI API endpoint-ləri (/api/v1/<module>)
│   │       ├── schemas.py           # Pydantic v2 DTO sorğu və cavab modelləri
│   │       ├── models.py            # SQLAlchemy 2.0 ORM cədvəl modelləri
│   │       ├── service.py           # Əsas biznes məntiqi və Unit-of-Work koordinasiyası
│   │       ├── repository.py        # Verilənlər bazası CRUD və sorğuları
│   │       ├── policies.py          # İcazə, filial və təhlükəsizlik qaydaları
│   │       ├── events.py            # Modula məxsus domen hadisələri
│   │       └── tests/               # Modulun vahid və inteqrasiya testləri
│   ├── worker.py                    # ARQ asinxron işçi və vaxtaşırı tapşırıqlar
│   └── main.py                      # Tətbiqin giriş nöqtəsi və marşrut qeydiyyatı
├── migrations/                      # Alembic verilənlər bazası miqrasiyaları
├── docs/                            # Layihə sənədləşməsi (stack, architecture, conventions, runbook)
├── scripts/                         # İnzibati skriptlər (seed, backup, restore)
└── tests/                           # Ümumi təməl və infrastruktur testləri
```

---

## 3. Asılılıq Qaydaları (Dependency Rules)

Sistemdə sərt qatlaşdırma və birtərəfli asılılıq prinsipi qorunur:

```text
Router (HTTP / Serialization)
       │
       ▼
Service (Biznes Məntiqi, Validasiya, UoW, Hadisələr)
       │
       ▼
Repository (Məlumat Əlçatanlığı, SQL Sorğuları)
       │
       ▼
Model (SQLAlchemy Cədvəl Təsvirləri)
```

### Əsas Qaydalar:
1. **Daxili Qatlaşdırma:** `router` yalnız `service`-ə müraciət edir. `service` `repository`-dən istifadə edir. `router` heç vaxt birbaşa `repository` və ya `model`-lə işləyə bilməz.
2. **Modullararası Əlaqə:** 
   - Bir modul başqa modulun `models.py` və ya `repository.py` fayllarını **QƏTİYYƏN İMPORT EDƏ BİLMƏZ**.
   - Modullar bir-biri ilə yalnız **Xidmət İnterfeysləri (Service Interfaces)** və ya **Domen Hadisələri (Domain Events)** vasitəsilə əlaqə saxlayır.
   - Bu qaydalar CI mərhələsində `import-linter` müqavilələri ilə avtomatik yoxlanılır.

---

## 4. Domen Hadisələri və Transactional Outbox Naxışı

Biznes hadisələri baş verdikdə (məsələn, satış tamamlandıqda, anbar qalığı kritik həddə düşdükdə):
1. **İki Mərhələli Hadisə Yayımı:**
   - **Sinxron (In-Process):** Eyni proses daxilində dərhal cavab verməli olan dinləyicilər üçün asinxron Event Bus (`app/shared/events.py`).
   - **Dayanıqlı (Transactional Outbox):** Uğursuzluqlara qarşı mütləq icra olunmalı hadisələr (bildiriş göndərişi, kənar sistemlərə sinxronizasiya, analitik hesabat yenilənməsi) üçün `outbox_events` cədvəli.
2. **Transactional Outbox Əməliyyat Sxemi:**
   - Biznes dəyişikliyi (məsələn, çekin yaradılması) və outbox qeydi **eyni verilənlər bazası tranzaksiyasında** kommit olunur.
   - Əgər tranzaksiya uğursuz olarsa, outbox hadisəsi də bazaya yazılmır (heç bir "fantom" hadisə yaranmır).
   - Arxa planda işləyən `ARQ` işçisi `outbox_events` cədvəlindən gözləyən hadisələri götürür, emal edir və uğurlu olduqda `PROCESSED` statusuna keçirir.
   - Xəta baş verdikdə eksponensial geriçəkilmə (exponential backoff) ilə təkrar cəhd edilir.

---

## 5. Tranzaksiya İdarəetməsi (Unit of Work)

Hər bir servis çağırışı vahid tranzaksiya sərhədi təşkil edir:
```python
async with unit_of_work() as uow:
    # 1. Məlumatı oxu və ya kilidlə
    item = await repo.get_for_update(uow.session, item_id)
    # 2. Biznes qaydalarını yoxla və dəyiş
    item.adjust_stock(quantity)
    # 3. Outbox hadisəsini qeyd et
    await outbox.record(uow.session, event)
    # 4. Blokdan çıxışda avtomatik COMMIT icra olunur;
    #    Hər hansı istisna baş verdikdə avtomatik ROLLBACK olunur.
```

