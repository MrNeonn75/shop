# Hadisə Şini və Transactional Outbox Arxitekturası (Event Backbone)

## 1. Giriş və Prinsiplər
Brand House ERP paylanmış və dayanıqlı memarlıq prinsipi olaraq **Transactional Outbox Pattern**-dən istifadə edir.
Bütün vacib biznes hadisələri (satışlar, geri qaytarmalar, anbar hərəkətləri, maaş təsdiqləri və s.) birbaşa biznes tranzaksiyası daxilində eyni verilənlər bazası cədvəlinə (`outbox_events`) yazılır. Bu, paylanmış tranzaksiyaların itməsinin (dual-write problem) qarşısını 100% alır.

### Əsas Tələblər:
1. **Zəmanətli Çatdırılma (At-least-once Delivery):** Heç bir hadisə itmir. Arxa plan işçisi uğursuzluq olduqda eksponensial gecikmə ilə hadisələri təkrar icra edir.
2. **İdempotensiya (Consumer Idempotency):** İstehlakçılar `processed_events` cədvəli vasitəsilə eyni hadisəni yalnız 1 dəfə emal edir (`(event_id, consumer)` unikallığı).
3. **Müstəqil Çatdırılma İzləməsi:** `event_deliveries` cədvəli hər bir fərdi istehlakçının statusunu (`PENDING`, `DONE`, `FAILED`, `DEAD`) ayrıca qeydə alır.
4. **Sxem Reyestri və Geriyə Uyğunluq:** Bütün hadisələr `app/shared/event_registry.py` daxilində qeydiyyatdan keçir və yoxlanılır. Yeni versiyalarda mövcud tələb olunan sahələrin silinməsi qadağandır.

---

## 2. Verilənlər Modeli

### `outbox_events` Cədvəli
| Sütun | Tip | Təsvir |
| :--- | :--- | :--- |
| `id` | UUIDv7 | Unikal zaman sıralı identifikasiya |
| `event_type` | VARCHAR(100) | Hadisə tipi (məs: `sale.completed`, `stock.low`) |
| `version` | INTEGER | Hadisə sxeminin versiyası (Defolt: 1) |
| `aggregate_type` | VARCHAR(100) | Aqreqat növü (`sale`, `variant`, `transfer`) |
| `aggregate_id` | VARCHAR(100) | Aqreqatın unikal ID-si |
| `payload` | JSONB / JSON | Sxem üzrə doğrulanmış hadisə məlumatı |
| `correlation_id` | VARCHAR(64) | Tranzaksiyanın izləmə ID-si |
| `causation_id` | VARCHAR(64) | Hadisəyə səbəb olmuş əvvəlki hadisə ID-si |
| `status` | VARCHAR(30) | `PENDING`, `PROCESSING`, `DONE`, `FAILED`, `DEAD` |
| `attempts` | INTEGER | İcra cəhdlərinin sayı |
| `next_attempt_at` | TIMESTAMPTZ | Növbəti cəhdin vaxtı (Backoff + Jitter) |
| `locked_by` | VARCHAR(100) | Hadisəni bloklamış işçinin identifikatoru |
| `locked_until` | TIMESTAMPTZ | Bloklamanın bitmə vaxtı (Lease lock) |
| `last_error` | TEXT | Son xəta mətni |
| `processed_at` | TIMESTAMPTZ | Uğurla tamamlanma vaxtı |

---

## 3. İcra Mexanizmi (Dispatcher Worker)

1. **Paket Çəkilməsi (Batch Claim):**
   - **PostgreSQL:** `SELECT ... FOR UPDATE SKIP LOCKED` istifadə olunur. Çoxsaylı worker prosesləri eyni vaxtda işlədikdə bir-birini bloklamır.
   - **SQLite / Test Mühiti:** `locked_until` və `locked_by` əsasında optimist icarə kilidi (Lease locking) tətbiq olunur.
2. **Eksponensial Gözləmə və Jitter (Backoff with Jitter):**
   - `delay = (base_delay ** attempts) + uniform(0.1, 1.0)`
   - Bu yanaşma kənar sistem xətası zamanı serveri eyni anda gələn təkrar sorğu selindən (thundering herd problem) qoruyur.
3. **Dead-Letter Növbəsi və Xəbərdarlıq:**
   - 5 uğursuz cəhddən sonra hadisə avtomatik olaraq `DEAD` statusuna keçir və təhlükəsizlik/inzibati alert yaradılır.
4. **İnzibati Replay Aləti:**
   - `POST /api/v1/integrations/dead-letter/{event_id}/replay`
   - `POST /api/v1/integrations/dead-letter/bulk-replay`
   - Bütün replay əməliyyatları audit jurnalına (`audit_events`) yazılır.

---

## 4. Hadisə Kataloqu (Event Catalog)

| Hadisə Tipi | İstehsalçı Modul | İstehlakçılar | Məqsəd |
| :--- | :--- | :--- | :--- |
| `sale.completed` | `pos`, `sales` | `finance`, `crm`, `reporting`, `notifications` | Satışın qeydi, gəlir müxabirləşməsi, müştəri xərcləri |
| `return.completed` | `returns` | `finance`, `crm`, `reporting`, `notifications` | Geri qaytarma məbləğləri, anbar mədaxili |
| `stock.changed` | `inventory` | `reporting`, `analytics` | Maya dəyəri və anbar qalığı yeniləməsi |
| `stock.low` | `inventory` | `notifications` | Anbar menecerinə kritik qalıq xəbərdarlığı |
| `stock.out` | `inventory` | `notifications`, `purchasing` | Malın tükənməsi bildirişi |
| `transfer.dispatched` | `transfers` | `notifications` | Yola salınmış transfer bildirişi |
| `transfer.received` | `transfers` | `finance`, `inventory` | Təhvil alma və kənarlaşma qeydi |
| `purchase.order_approved` | `purchasing` | `notifications`, `finance` | Satınalma sifarişinin təsdiqi |
| `payroll.finalized` | `payroll` | `finance`, `notifications` | Maaş xərclərinin Baş Kitaba ötürülməsi |
| `shift.closed` | `pos` | `finance`, `reporting` | Kassa növbəsinin bağlanması və Z-hesabat |
| `security.audit_alert` | `audit` | `notifications` | Şübhəli fəaliyyət xəbərdarlığı |
| `integration.status_changed` | `integrations` | `notifications`, `audit` | Kənar provayder status dəyişimi |
| `backup.completed` | `core` | `notifications`, `health` | Backup tamamlanması monitorinqi |

---

## 5. Real-Time SSE Axını (Server-Sent Events)

- Endpoint: `GET /api/v1/notifications/stream`
- **Protokol:** HTTP EventSource.
- **Dövri Nəbz (Heartbeat):** Hər 15 saniyədən bir `: heartbeat\n\n` şərhi göndərilərək şəbəkə proxy-lərinin (məs: Nginx, Cloudflare) bağlantını kəsməsinin qarşısı alınır.
- **Qırılmış Əlaqənin Bərpası:** Müştəri `Last-Event-ID` başlığı ilə qoşulduqda, əlaqə qırıldığı müddətdə yaranmış bütün bildirişlər arxivdən tapılaraq xronoloji ardıcıllıqla yenidən çatdırılır.
- **Filial Səlahiyyəti:** İstifadəçi yalnız ona icazə verilən filiallara aid bildirişləri alır.

