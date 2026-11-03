# BRAND HOUSE ERP — Əməliyyat və İstismar Təlimatı (Runbook)

> Bu sənəd Brand House ERP backend sisteminin quraşdırılması, işə salınması, miqrasiyaların idarə edilməsi, ehtiyat nüsxələnmə (backup/restore) və monitorinq qaydalarını əhatə edir.

---

## 1. Layihənin İşə Salınması

### 1.1. Docker Compose ilə (İstehsalata Yaxın Mühit)
Bütün infrastruktur (PostgreSQL 16, Redis 7, FastAPI API serveri və ARQ işçisi) bir əmrlə işə düşür:
```bash
# Servisləri ayağa qaldırın
docker compose up -d --build

# Logları izləyin
docker compose logs -f api worker
```
- **API Sənədləşməsi (Swagger):** `http://localhost:8000/docs`
- **OpenAPI Sxemi:** `http://localhost:8000/openapi.json`
- **Liveness Zərbəsi:** `http://localhost:8000/health/live`
- **Readiness Zərbəsi:** `http://localhost:8000/health/ready`

### 1.2. Lokal Mühitdə `uv` ilə İnkişaf (Development)
```bash
# 1. Asılılıqları quraşdırın
uv pip install -e ".[dev]"

# 2. Ətraf mühit faylını köçürün və zəruri dəyişiklikləri edin
cp .env.example .env

# 3. Verilənlər bazası miqrasiyalarını tətbiq edin
alembic upgrade head

# 4. Təməl məlumatları toxumlayın (Seed)
python scripts/seed.py reference

# 5. API serverini başladın
uvicorn app.main:app --reload --port 8000

# 6. ARQ işçisini paralel terminalda başladın
python -m arq app.worker.WorkerSettings
```

---

## 2. Verilənlər Bazası Miqrasiyaları (Alembic)

Bütün şema dəyişiklikləri Alembic vasitəsilə idarə olunur və **geriyədönüş (downgrade)** funksiyasına malik olmalıdır.

```bash
# Yeni miqrasiya faylı yaratmaq (avtomatik təhlil ilə)
alembic revision --autogenerate -m "add_table_name"

# Ən son versiyaya qədər yeniləmək (Upgrade)
alembic upgrade head

# Ən son miqrasiyanı geri qaytarmaq (Downgrade - 1 pillə)
alembic downgrade -1

# Mövcud miqrasiya tarixçəsini görmək
alembic history --verbose

# Baza hazırda hansı miqrasiya versiyasındadır?
alembic current
```

---

## 3. Verilənlər Bazasının Ehtiyat Nüsxələnməsi və Bərpası (Backup & Restore)

Sistemdə ehtiyat nüsxələrin qeydiyyatı üçün `backup_status` cədvəli yaradılıb.

### 3.1. Ehtiyat Nüsxə Alınması (Backup)
`scripts/backup.py` skripti PostgreSQL-in `pg_dump` alətini çağıraraq sıxılmış formatda nüsxə çıxarır, SHA-256 nəzarət məbləğini (checksum) hesablayır və nəticəni `backup_status` cədvəlində qeyd edir:
```bash
python scripts/backup.py --type full --destination ./backups
```

### 3.2. Bərpa Əməliyyatı (Restore)
Bərpa prosesi öncə nüsxə faylının SHA-256 bütövlüyünü yoxlayır, sonra bazaya bərpa edir:
```bash
python scripts/restore.py --file ./backups/backup_20261019_120000.dump --verify-only
python scripts/restore.py --file ./backups/backup_20261019_120000.dump --execute
```

---

## 4. Sağlamlıq və Diaqnostika (Health Probes)

| Endpoint | Giriş Səviyyəsi | Yoxladığı Komponentlər |
| :--- | :--- | :--- |
| `/health/live` | Hər kəsə açıq | Prosesin diri olması (Kubernetes Liveness Probe üçün) |
| `/health/ready` | Hər kəsə açıq | DB bağlantısı (`SELECT 1`), Redis bağlantısı, Miqrasiyaların aktual olması, İşçi ürək döyüntüsü (Kubernetes Readiness) |
| `/health/details` | Qorunan (Admin) | ARQ növbəsinin dərinliyi, son backup statusu, xarici inteqrasiya vəziyyətləri |
| `/api/v1/integrations/status` | Qorunan (Admin) | Bütün xarici xidmətlərin (Ödəniş, SMS, Fiskal printer) konfiqurasiya vəziyyəti |

---

## 5. İnsidentlərin İdarə Edilməsi və Qəza Bərpası

1. **DB Əlçatan Deyil:** `/health/ready` avtomatik olaraq 503 qaytarır və yükpaylayıcı (Load Balancer) həmin API instansiyasını trafikdən çıxarır.
2. **Optimistic Lock Çoxluğu (409 Conflict):** Eyni anda iki operator eyni sənədi redaktə edir. İstifadəçiyə frontend-də fərqlər (diff) göstərilir və məlumatları yeniləməsi təklif edilir.
3. **Outbox Hadisələri Yığılır:** Əgər `outbox_events` cədvəlində `PENDING` hadisələrin sayı kəskin artarsa, ARQ işçilərinin sayını (worker concurrency) artırın:
   ```bash
   python -m arq app.worker.WorkerSettings --burst
   ```

