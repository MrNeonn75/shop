# Əməliyyat Təlimatı: Qeyri-müəyyən Ödənişlərin Həlli (Stuck Payment UNKNOWN Runbook)

## 1. Məqsəd
Kassa satışı zamanı kart terminalından və ya onlayn ödəniş şlüzündən timeout, rabitə qırılması və ya şəbəkə xətası səbəbilə statusu `UNKNOWN` qalan ödənişlərin maliyyə uyğunsuzluğu yaratmadan barışdırılması (Reconciliation).

---

## 2. Problem Ssenarisi
1. Kassir kart ödənişi tələb edir (məs: 150.00 AZN).
2. Müştəri kartı toxundurur, bank pulu çıxarır, lakin POS terminal ilə backend arasında əlaqə kəsilir.
3. Çek rəsmiləşdirilmir, ödəniş qeydi `UNKNOWN` vəziyyətində qalır.

---

## 3. Təhqiqat Addımları

### Addım 1: Əməliyyatın Bank Şlüzündə Yoxlanılması
Bank portalı və ya integrasiya yoxlama sorğusu ilə tranzaksiyanın RRN (Retrieval Reference Number) kodunu yoxlayın:
```bash
# Bank API sorğusu vasitəsilə status yoxlanışı:
GET /integrations/payments/status/{transaction_ref}
```

### Addım 2: Qərar Matrisi
- **Hal A: Pul bankdan çıxıb (APPROVED)**:
  - Kassada "Yarımçıq satışı tamamla" funksiyası çağırılır.
  - Ödəniş `CONFIRMED` edilir və qəbz çap edilir.
  - Maliyyə jurnalı və kassa qalığı balanslaşdırılır.
- **Hal B: Pul çıxmayıb və ya blokdan açılıb (REJECTED/VOIDED)**:
  - Satış ləğv edilir (`CANCELLED`).
  - Ayrılmış rezervasiyalar stoka qaytarılır.
  - Müştəriyə ödənişin təkrar icra edilməsi təklif olunur.

---

## 4. İkiqat Çıxarışın (Double-Charge) Qarşısının Alınması
- Bütün ödəniş sorğularında `Idempotency-Key` və unikal `pos_transaction_id` istifadə olunur.
- Bank şlüzünə eyni referansla təkrar sorğu göndərildikdə bank orijinal nəticəni qaytarır.

