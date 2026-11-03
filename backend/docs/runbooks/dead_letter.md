# Əməliyyat Təlimatı: Outbox Dead-Letter Hadisələrinin Həlli (Dead-Letter Handling Runbook)

## 1. Məqsəd
Transactional Outbox mühərrikində maksimum təkrar cəhd sayına (məsələn, 5 cəhd) çatan və `DEAD` statusuna keçən kritik hadisələrin təhqiqatı və təkrar icrası.

---

## 2. Monitorinq və Siqnal
- Metrik: `outbox_dead_letter_count > 0`
- Xəbərdarlıq dərəcəsi: **CRITICAL / P1**
- Hadisə nümunələri: `sale.completed`, `inventory.transfer_completed`, `payroll.finalized`.

---

## 3. Təhqiqat Proseduru

### Addım 1: Dead-Letter Hadisələrinin İnventarizasiyası
İnzibati API və ya birbaşa DB sorğusu ilə ölü hadisələri çıxarın:
```sql
SELECT id, event_type, aggregate_type, aggregate_id, attempts, last_error, occurred_at
FROM outbox_events
WHERE status = 'DEAD'
ORDER BY occurred_at DESC
LIMIT 20;
```

### Addım 2: Xətanın Kök Səbəbinin (RCA) Analizi
`last_error` sahəsində qeyd olunan istisna növünü təyin edin:
- `ConnectionError` / `Timeout`: Xarici inteqrasiya (bank, SMS, 1C) müvəqqəti sönüb.
- `ValidationError` / `SchemaError`: Hadisə payload-ı istehlakçı sxeminə uyğun gəlmir.
- `ConflictError`: İstehlakçı tərəfdə idempotency və ya unikal açar toqquşması.

---

## 4. Təkrar İcra (Replay) Əməliyyatları

### Seçim A: Tək Hadisənin Təkrar İcrası (Single Event Replay)
Xarici servis bərpa olunduqdan sonra:
```python
from app.core.uow import UnitOfWork
from app.shared.outbox import replay_dead_letter_event
import uuid

async with UnitOfWork() as uow:
    await replay_dead_letter_event(uow.session, event_id=uuid.UUID("<event_id>"))
    await uow.commit()
```

### Seçim B: Kütləvi Təkrar İcra (Bulk Replay by Type & Time Window)
Müəyyən dövr üzrə bütün ölü hadisələrin yenidən növbəyə qaytarılması:
```python
from app.core.uow import UnitOfWork
from app.shared.outbox import bulk_replay_dead_letter_events
from datetime import datetime

async with UnitOfWork() as uow:
    count = await bulk_replay_dead_letter_events(
        uow.session,
        event_type="sale.completed",
        from_time=datetime(2026, 10, 20),
    )
    await uow.commit()
    print(f"{count} hadisə yenidən PENDING statusuna qaytarıldı.")
```

### Addım 5: Audit Qeydiyyatı
Bütün dead-letter müdaxilələri audit jurnalına qeyd olunur (`OUTBOX_DEAD_LETTER_REPLAY`).

