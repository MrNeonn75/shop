# Əməliyyat Təlimatı: Verilənlər Bazası Miqrasiya Xətaları (Migration Failure Runbook)

## 1. Məqsəd
`alembic upgrade head` zamanı DDL kilidlənməsi, tiplərin uyğunsuzluğu və ya natamam icra baş verdikdə bazanı çirkli (dirty) vəziyyətdən çıxarmaq.

---

## 2. Xəta Simptomları
- `alembic upgrade` komandası `LockWaitTimeout` və ya `StatementTimeout` xətası ilə dayanır.
- `alembic_version` cədvəlində cari reviziya ilişib qalır.
- Tətbiq `UndefinedTable` və ya `UndefinedColumn` xətası verir.

---

## 3. Bərpa Addımları

### Addım 1: Kilidləyən Sessiyaların Tapılması və Dayandırılması
PostgreSQL-də miqrasiyanı bloklayan uzunömürlü tranzaksiyanı tapın:
```sql
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle' AND query NOT ILIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- Kilid yaradan prosesi ləğv edin:
SELECT pg_terminate_backend(<pid>);
```

### Addım 2: Cari Versiyanın Təyini
```bash
alembic current
```

### Addım 3: Əl ilə Düzəliş və Sinxronizasiya
Əgər DDL əməliyyatı yarımçıq qalıbsa:
1. Tranzaksional DDL (PostgreSQL) əksər hallarda avtomatik rollback edir.
2. Əgər `alembic_version` yenilənməyibsə, lakin obyekt artıq yaranıbsa:
   ```bash
   # Versiyanı məcburi qeyd etmək:
   alembic stamp <target_revision_id>
   ```
3. İndeks yaradılması zamanı (`CREATE INDEX CONCURRENTLY`) uğursuz olarsa, həmin indeks `INVALID` statusunda qalır:
   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS <invalid_index_name>;
   ```

### Addım 4: Tamlığın Yoxlanılması
```bash
erp verify
```

