# ADR-003: Tranzaksional Outbox və Asinxron Hadisə Arxitekturası (Transactional Outbox Pattern)

## Status
Qəbul edildi (Accepted)

## Kontekst
Biznes əməliyyatı (məsələn, kassa satışı) zamanı xarici sistemlərə (SMS provayderi, fiskal kassa, analitika mühərriki) birbaşa sinxron HTTP sorğusu göndərmək Dual-Write problemini yaradır: Tranzaksiya bazada uğurla commit oluna bilər, lakin xarici HTTP zəngi uğursuz olar və ya əksinə.

## Qərar
1. Əsas biznes tranzaksiyaları heç vaxt kənar şəbəkə zənglərini gözləmir.
2. Bütün domen hadisələri biznes məlumatları ilə eyni ACID tranzaksiyası daxilində `outbox_events` cədvəlinə yazılır.
3. Arxa fonda işləyən asinxron dispetçer (`fetch_and_claim_outbox_batch` ilə `SELECT ... FOR UPDATE SKIP LOCKED`) hadisələri iddia edir və istehlakçılara çatdırır.
4. Çatdırılma uğursuz olduqda eksponensial backoff və jitter ilə təkrar cəhdlər edilir; limit bitdikdə hadisə `DEAD` statusuna keçirilir.

## Nəticələr
- **Müsbət**: At-least-once çatdırılma zəmanəti, kassa checkout əməliyyatının xarici şəbəkə xətalarından 100% müstəqil olması.
- **Mənfi**: İstehlakçıların mütləq idempotent olması tələb olunur (`is_event_processed_by_consumer`).

