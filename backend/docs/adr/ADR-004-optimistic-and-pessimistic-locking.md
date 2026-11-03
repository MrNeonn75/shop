# ADR-004: Kilidlənmə Strategiyası: Deterministik Pessimistik və Optimistik Kilidlər (Locking Strategy)

## Status
Qəbul edildi (Accepted)

## Kontekst
Pik kassa saatlarında (məsələn, Qara Cümə və ya bayram endirimləri) eyni məhsul variantını eyni anda bir neçə kassir və ya onlayn alıcı almağa cəhd edə bilər. Qeyri-müəyyən sıralama deadlock-lara və mənfi qalıqlara səbəb ola bilər.

## Qərar
1. **İnventar və Stok Silinməsi**:
   - `SELECT ... FOR UPDATE` pessimistik kilidləmə tətbiq olunur.
   - Deadlock-ların qarşısını almaq üçün səbətdəki məhsul variantları mütləq **deterministik qaydada (`ORDER BY variant_id ASC`)** kilidlənir.
2. **Kataloq, Müqavilələr və Sənəd Redaktəsi**:
   - `version` sütunu əsasında **Optimistik Kilidləmə (Optimistic Concurrency Control - OCC)** tətbiq edilir (`WHERE id = :id AND version = :expected_version`).
   - Uyğunsuzluq zamanı `OptimisticLockError` (HTTP 409 Conflict) qaytarılır.
3. **Mənfi Stok Qadağası**:
   - Müvafiq filial parametrlərində mənfi stoka icazə verilmədiyi təqdirdə qalıq 0-dan aşağı düşə bilməz (`InsufficientStockError`).

## Nəticələr
- **Müsbət**: Sıfır deadlock, sıfır icazəsiz mənfi qalıq, konkurent kassalar arasında dəqiq yarış vəziyyəti (race condition) idarəçiliyi.
- **Mənfi**: Qaynar variantlar üzrə eyni vaxtda müraciətlər qısa müddətli gözləmə yaradır (p95 < 50ms).

