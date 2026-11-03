# İnventar və Filiallararası Transferlər Modulları Sənədləşməsi (Inventory & Transfers Documentation)

Bu sənəd **Brend House** ERP sisteminin stok uçotu, anbar jurnalı (stock ledger), qalıqların tranzaksional idarə edilməsi, anbar sənədləri, fiziki sayım (inventarizasiya) və filiallararası transferlər modulunun memarlıq və istismar qaydalarını izah edir.

---

## 1. Əsas Prinsiplər (Core Principles)

### 1.1. Stok Jurnalı — Yeganə Həqiqət Mənbəyi (Single Source of Truth)
- Sistemin stok uçotu `stock_movements` cədvəlində saxlanılan hərəkət jurnalına əsaslanır.
- **Dəyişməzlik (Append-Only):** Jurnal sətirləri heç vaxt redaktə olunmur (`UPDATE`) və silinmir (`DELETE`). PostgreSQL trigger və qaydaları vasitəsilə birbaşa dəyişikliklər qadağan edilir. Səhv hərəkətlərin düzəlişi yalnız kompensasiya edən yeni `REVERSAL` hərəkət yazısı ilə mümkündür.
- **Tranzaksion Bütövlük:** Qalıqlar (`stock_balances`) heç vaxt arxa fonda və ya sərbəst şəkildə dəyişmir. Balans dəyişikliyi yalnız və yalnız həmin hərəkəti qeydə alan hərəkət sətri ilə **eynı verilənlər bazası tranzaksiyasında (Unit of Work)** baş verir.

### 1.2. Mənfi Qalıq Siyasəti (Negative Stock Policy)
- Standart olaraq `inventory.negative_stock_policy = "FORBIDDEN"` (qadağandır).
- Mənfi qalıqla hərəkətin icrası yalnız aşağıdakı 3 şərtin **eyni anda** ödənildiyi xüsusi guarded axında mümkündür:
  1. `allow_negative=True` arqumenti ötürülüb;
  2. İstifadəçinin `inventory.negative.override` icazəsi var;
  3. Ən azı 5 simvoldan ibarət əsaslandırma səbəbi (`override_reason`) təqdim edilib.
- Bütün mənfi qalıq əməliyyatları audit jurnalında qeydə alınır və `NegativeStockOverrideEvent` hadisəsi ilə bildiriş sisteminə ötürülür.

### 1.3. Rəqabət Təhlükəsizliyi və Kilidləmə (Concurrency & Deadlock Prevention)
- Eyni vaxtda baş verən satış, daxilolma, silinmə və ya transfer əməliyyatları zamanı qarşılıqlı bloklanmaların (deadlock) qarşısını almaq üçün determenistik kilidləmə tətbiq olunur.
- Bütün təsirlənən balans sətirləri `(warehouse_id, variant_id, stock_status)` ardıcıllığı ilə nizamlanır və `SELECT ... FOR UPDATE` ilə kilidlənir.
- Mövcud olmayan balanslar əvvəlcə `INSERT ... ON CONFLICT DO NOTHING` ilə yaradılır və sonra nizamlı şəkildə kilidlənir.

---

## 2. Verilənlər Modeli (Data Model)

### 2.1. Stok Statusları (`StockStatus`)
- `available`: Satışa və ya transferə tam hazır mal.
- `damaged`: Zədələnmiş / qüsurlu mal.
- `quarantine`: Karantin və ya ekspertizada olan mal.

### 2.2. Hərəkət Növləri (`MovementType`)
| Növü | Mənbə Anbar | Təyinat Anbarı | İzahı |
| :--- | :--- | :--- | :--- |
| `RECEIPT` | `NULL` | Təyinat | Təchizatçıdan mədaxil |
| `ISSUE` | Mənbə | `NULL` | Daxili istifadə və ya silinmə |
| `TRANSFER_OUT` | Mənbə | Tranzit | Filialdan tranzit anbara yola salınma |
| `TRANSFER_IN` | Tranzit | Təyinat | Tranzit anbardan təyinat anbarına qəbul |
| `SALE` | Mənbə | `NULL` | POS kassa satışı |
| `SALE_RETURN` | `NULL` | Təyinat | POS müştəri qaytarması |
| `PURCHASE_RETURN` | Mənbə | `NULL` | Təchizatçıya geri qaytarma |
| `ADJUSTMENT_PLUS` | `NULL` | Təyinat | Manual inventar artımı |
| `ADJUSTMENT_MINUS` | Mənbə | `NULL` | Manual inventar azalması |
| `COUNT_VARIANCE` | Dəyişən | Dəyişən | Sayım nəticəsində kənarlaşmanın tənzimlənməsi |
| `DAMAGED` | Mənbə | Təyinat (`damaged`) | Yararsız malın qeydiyyatı |
| `LOST` | Mənbə | `NULL` | İtmiş malın silinməsi |
| `OPENING_BALANCE` | `NULL` | Təyinat | İlkin qalıq daxil edilməsi |
| `REVERSAL` | Əks | Əks | Əvvəlki hərəkətin ləğv edilməsi |

### 2.3. Rezervasiyalar (`StockReservations`)
- Satış sifarişləri və ya təsdiqlənmiş transferlər üçün fiziki anbar qalığı dəyişmədən mal rezerv edilir.
- `available = on_hand - active_reservations`.
- Əgər tələb olunan say `available` sayından çox olarsa, əməliyyat `InsufficientStockError` ilə rədd edilir.

---

## 3. Maya Dəyəri və Qiymətləndirmə (Costing & Valuation)

- **Orta Çəkili Maya Dəyəri (Weighted Average Cost):**
  - Mədaxil tipli hərəkətlərdə (`RECEIPT`, `OPENING_BALANCE`, `ADJUSTMENT_PLUS`) yeni maya dəyəri düsturu:
    $$\text{Yeni Dəyər} = \frac{(\text{Mövcud Qalıq} \times \text{Cari Maya Dəyəri}) + (\text{Mədaxil Sayı} \times \text{Mədaxil Qiyməti})}{\text{Mövcud Qalıq} + \text{Mədaxil Sayı}}$$
  - Bütün çıxış hərəkətlərində (`SALE`, `ISSUE`, `TRANSFER_OUT` və s.) həmin anın maya dəyəri dondurulur (`COGS Snapshot`).
- **Anbar Qiymətləndirmə Hesabatı (`GET /api/v1/inventory/valuation`):**
  - Bütün aktiv məhsul variantlarının qalıqları və orta çəkili maya dəyərlərinin hasili üzrə ümumi anbar dəyərini hesablayır.
- **Uyğunluq və Bərpa Aləti (Reconcile & Rebuild):**
  - `GET /api/v1/inventory/reconcile`: Cari balans cədvəli ilə hərəkət jurnalının cəmlərini müqayisə edir. Uyğunsuzluq (drift) aşkarlandıqda `InventoryDriftDetectedEvent` yaradır.
  - `POST /api/v1/inventory/rebuild`: Bütün balansları birbaşa jurnal sətirlərindən yenidən hesablayıb bərpa edir.

---

## 4. Fiziki Sayım və İnventarizasiya (Stocktaking / Physical Counts)

1. **Yaradılma (`DRAFT`):** Tam (`full`), kateqoriya (`category`) və ya xüsusi sahə üzrə sayım sessiyası yaradılır.
2. **Dondurma (`FROZEN` / `COUNTING`):**
   - Sayım başlanan anın hərəkət watermark-ı qeyd olunur (`watermark_movement_id`).
   - Mövcud anbar qalıqları snapshot kimi cədvələ yazılır.
   - Kör sayım (`blind_count=True`) olduqda işçilər gözlənilən sayı görmür.
3. **Skan və Daxiletmə (`record_count_entry`):**
   - Barkod skaneri və ya əl terminalı vasitəsilə sayılan mallar daxil edilir.
4. **Təsdiqləmə (`APPROVED`):**
   - Faktiki say və gözlənilən say arasındakı kənarlaşma hesablanır.
   - Əgər kənarlaşma rəhbər təsdiqi həddini aşırsa (`variance > 10 ədəd` və ya `dəyər > 500 AZN`), supervayzer təsdiqi tələb olunur.
   - Təsdiq anında avtomatik olaraq `adjustment` tipli anbar sənədi yaradılır və təsdiqlənərək anbar qalıqlarını faktiki saya bərabərləşdirir.

---

## 5. Filiallararası Transferlər (Inter-Branch Transfers)

### 5.1. Vəziyyət Maşını (State Machine)
```text
  [ DRAFT ]
      │ (submit)
      ▼
[ SUBMITTED ] ──── (reject) ───► [ REJECTED ]
      │ (approve)
      ▼
 [ APPROVED ] (Mallar mənbə anbarda rezerv edilir)
      │
      ├── (pick) ──► [ PICKING ]
      │                   │
      ▼ (dispatch)        ▼ (dispatch)
[ IN_TRANSIT ] (TRANSFER_OUT: Mənbə -> Tranzit)
      │
      ├── (cancel) ──► [ CANCELLED ] (Mallar tranzitdən mənbəyə geri qayıdır)
      │
      ▼ (receive)
 [ RECEIVED ] (TRANSFER_IN: Tranzit -> Təyinat)
```

### 5.2. Qismən Qəbul və Qüsurlu Mallar (Partial Receipts & Discrepancies)
- Mallar təyinat anbarında qəbul edilərkən çatışmayan (`missing_qty`) və zədələnmiş (`damaged_qty`) mallar ayrı-ayrılıqda qeyd olunur.
- Çatışmayan mallar üçün avtomatik olaraq `LOST` tipli hərəkət yaradılır.
- Zədələnmiş mallar təyinat anbarının `damaged` statusuna mədaxil edilir.
- Yerdə qalan qismən çatışmazlıqlar tam yekun qəbula qədər `IN_TRANSIT` vəziyyətində qalır.

### 5.3. SLA və Tranzit Nəzarəti (`GET /api/v1/transfers/in-transit/report`)
- Şirkət parametrlərində qeyd olunmuş SLA vaxtı (məsələn, 48 saat) aşıldıqda transfer gecikmiş (`is_delayed=True`) kimi qeyd edilir və hesabatda xüsusi xəbərdarlıqla əks olunur.

