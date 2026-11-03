# Brand House Retail ERP — Verilənlər Bazasının Sazlanması və Məhsuldarlıq Bələdçisi (Database Tuning & Capacity Guide)

Bu sənəd Brand House PostgreSQL verilənlər bazasının yüksək yüklənmə (High-Throughput Retail POS) şəraitində optimal işləməsi üçün texniki sazlama parametrlərini, PgBouncer konfiqurasiyasını, autovacuum qaydalarını və cədvəl bölmələnməsi (partitioning) planını əhatə edir.

---

## 1. PostgreSQL İstehsalat Parametrləri (16 vCPU, 32GB RAM Nümunəsi)

```ini
# Yaddaş sazlamaları
shared_buffers = 8GB                  # RAM-ın 25%-i
work_mem = 32MB                       # Hər bir sorting/hash əməliyyatı üçün
maintenance_work_mem = 1GB            # İndeks qurulması və VACUUM üçün
effective_cache_size = 24GB           # OS və DB keşinin cəmi (RAM-ın 75%-i)

# Tranzaksiya loqu və WAL
wal_level = replica
max_wal_size = 16GB
min_wal_size = 2GB
checkpoint_completion_target = 0.9    # I/O piklərini hamarlaşdırmaq üçün
checkpoint_timeout = 15min

# Sorğu icra büdcəsi və təhlükəsizlik
statement_timeout = 30000             # 30 saniyə (analitika daxil maksimum icazə)
lock_timeout = 5000                   # 5 saniyə (kassa bloklanmalarının qarşısını alır)
idle_in_transaction_session_timeout = 60000 # 60 saniyə açıq qalan tranzaksiyaları kəsir
```

---

## 2. PgBouncer Qoşulma Hovuzu (Connection Pooling)

İstehsalat mühitində tətbiq mütləq `PgBouncer` (Transaction Pooling rejimində) arxasında işləməlidir:

```ini
[databases]
brend_house_prod = host=127.0.0.1 port=5432 dbname=brend_house_prod pool_size=50

[pgbouncer]
pool_mode = transaction
max_client_conn = 2000
default_pool_size = 50
reserve_pool_size = 10
reserve_pool_timeout = 5.0
server_idle_timeout = 600
```

> [!WARNING]
> **Transaction Pooling Uyğunluq Qaydası:**
> - `pool_mode = transaction` rejimində `SET SESSION`, sessiya səviyyəli advisory locks və ya named prepared statements istifadə edilməməlidir.
> - SQLAlchemy `AsyncEngine` sazlamasında `prepared_statement_cache_size=0` və ya asyncpg parametrli sorğulardan istifadə təmin edilmişdir (`statement_cache_size=0`).

---

## 3. Qaynar Cədvəllər Üzrə Autovacuum Sazlanması (Hot Tables Tuning)

Retail sistemində bəzi cədvəllər (məsələn, `outbox_events`, `stock_balances`, `pos_shifts`) saniyədə yüzlərlə `INSERT` və `UPDATE` qəbul edir. Bloat (ölü sətirlərin yığılması) qarşısını almaq üçün bu cədvəllərə aqressiv autovacuum tətbiq olunur:

```sql
-- Outbox cədvəli daimi təmizlənməlidir (dead tuples dərhal silinməlidir)
ALTER TABLE outbox_events SET (
    autovacuum_vacuum_scale_factor = 0.02,  -- 2% dəyişiklikdə dərhal vakuum başlasın
    autovacuum_vacuum_threshold = 500,
    autovacuum_vacuum_cost_delay = 2
);

-- Stok qalıqları cədvəli
ALTER TABLE stock_balances SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 200
);

-- Audit cədvəli append-only olduğu üçün yalnız analyze tez-tez aparılır
ALTER TABLE audit_trail SET (
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_analyze_threshold = 500
);
```

---

## 4. Bölmələnmə (Partitioning) Planı və Ehtiyat Miqrasiya

Bazada aşağıdakı cədvəllər həcm həddinə çatdıqda (10 milyon sətir və ya 20GB) **PostgreSQL Declarative Partitioning** rejiminə keçirilir:

1. **`outbox_events`**: `RANGE (occurred_at)` — Aylıq bölmələr (`outbox_events_2026_10`, `outbox_events_2026_11`). Köhnə uğurla emal edilmiş aylar arxivləşdirilir (`archive_processed_events`).
2. **`audit_trail`**: `RANGE (created_at)` — Rüblük bölmələr (`audit_trail_2026_q4`). Hüquqi tələblərə uyğun 5 illik saxlanma dövründən sonra read-only arxivə çıxarılır.
3. **`stock_movements`**: `RANGE (created_at)` — İllik bölmələr (`stock_movements_2026`). İllik inventar bağlanışından sonra arxiv cədvəlinə çevrilir.
4. **`daily_sales_summary`**: `RANGE (summary_date)` — İllik bölmələr.

---

## 5. Tutum və Həcm Modeli (Capacity Model - 3 İllik Proyeksiya)

| Göstərici | Gündəlik Göstərici | İllik Göstərici (10 Filial) | 3 İllik Yığılmış Həcm |
|---|---|---|---|
| Satış Çekləri (POS Sales) | 3,000 çek/gün | ~1.1 milyon çek | ~3.3 milyon çek (~2.5 GB) |
| Satış Sətirləri (Sale Lines) | 9,000 sətir/gün | ~3.3 milyon sətir | ~10 milyon sətir (~5 GB) |
| İnventar Hərəkətləri | 15,000 hərəkət/gün | ~5.5 milyon hərəkət | ~16.5 milyon sətir (~12 GB) |
| Outbox Hadisələri | 25,000 hadisə/gün | ~9.1 milyon hadisə | Təmizlənmə ilə sabit ~1 GB |
| Audit Loqları | 30,000 loq/gün | ~11 milyon qeyd | ~33 milyon qeyd (~18 GB) |
| **Ümumi Disk Sahəsi Tələbi** | - | **~25 GB / il** | **~80-100 GB (İndekslərlə)** |

> [!TIP]
> 3 illik fəaliyyət üçün 250 GB NVMe SSD diski həm cari əməliyyat həcmini, həm də ehtiyat nüsxələri və pik yüklənmələri tam təmin edir.

