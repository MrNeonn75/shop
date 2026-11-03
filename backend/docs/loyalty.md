# Loyallıq Proqramı və Xal Jurnalı (Loyalty Engine & Ledger)

## 1. Giriş və Əsas Prinsiplər
Brend House Loyallıq Modulu müştəri sadiqliyini təşviq etmək, alış dövriyyəsinə əsaslanan dinamik səviyyələri idarə etmək və xalların şəffaf, dəyişdirilməz (immutable) uçotunu aparmaq üçün hazırlanmışdır.

* **Append-Only Jurnal (Ledger Invariant):** Balans birbaşa redaktə olunan sütun deyil; hər bir xal hərəkəti (qazanma, xərcləmə, ləğv, vaxtı bitmə) unikal jurnal qeydi (`loyalty_ledger`) yaradır.
* **Mənfi Olmayan Balans:** Müştərinin cari balansı heç bir halda 0-dan aşağı düşə bilməz (`available_points >= 0`). Bu qayda həm verilənlər bazası `CheckConstraint`, həm də xidmət səviyyəsində qorunur.
* **Yarış Vəziyyətindən Qorunma (Double-Spend Protection):** Kassa checkout tranzaksiyası daxilində müştəri xülasəsi (`loyalty_customer_summaries`) `SELECT ... FOR UPDATE` kilidi ilə bağlanır.
* **FIFO Partiya İdarəetməsi (First-In, First-Out):** Qazanılmış xallar müəyyən müddətə malik partiyalar şəklində (`remaining_lot_points`) qeydə alınır və xərcləmə zamanı ilk qazanılan partiyalardan ardıcıl silinir.

---

## 2. Müştəri Səviyyələri (Tiers) və Dövriyyə Pəncərəsi

Sistemdə standart olaraq 4 pilləli səviyyə modeli tətbiq edilir:

| Səviyyə | Tələb Olunan Dövriyyə (Son 365 gün) | Xal Qazanma Əmsalı (Multiplier) |
|---|---|---|
| **Bronze** | 0.00 AZN | 1.0x (Hər 1 AZN = 1 xal) |
| **Silver** | 500.00 AZN | 1.2x (Hər 1 AZN = 1.2 xal) |
| **Gold** | 2000.00 AZN | 1.5x (Hər 1 AZN = 1.5 xal) |
| **Platinum** | 5000.00 AZN | 2.0x (Hər 1 AZN = 2.0 xal) |

* Səviyyə dəyişdikdə `LoyaltyTierHistory` audit qeydi yaradılır və digər sistemlərin (bildiriş, CRM) məlumatlandırılması üçün `loyalty.tier_changed` Outbox hadisəsi buraxılır.

---

## 3. Əməliyyat Axınları

### 3.1. Kassa Alışı Zamanı Xal Qazanma (Earn)
1. Satışın xalis ödənilən məbləği (`grand_total`) müəyyən edilir.
2. Müştərinin cari səviyyəsinə uyğun vurma əmsalı tətbiq olunur.
3. `EARN` tipli jurnal qeydi yaradılır və `remaining_lot_points` həmin xal sayına bərabər təyin edilir.
4. Partiyanın bitmə tarixi cari vaxt + `lot_expiry_days` (standart 365 gün) kimi təyin olunur.
5. Müştərinin balansı və ümumi dövriyyəsi artırılır, səviyyə keçidi yoxlanılır.

### 3.2. Kassa Alışı Zamanı Xal Xərcləmə (Redeem)
1. **İlkin Baxış (`preview_redeem`):** Kassir xalları çıxmazdan əvvəl qaydaları yoxlayır:
   - Minimum xərcləmə həddi (məs. 100 xal).
   - Qəbzin maksimum xallarla ödənilə bilən hissəsi (məs. 50%).
   - Müştərinin kifayət qədər balansı olması.
2. **Atomik Çıxış (`redeem`):** Checkout zamanı `FOR UPDATE` kilidi alınır, ən qədim FIFO partiyalardan xallar silinir, `REDEEM` jurnal qeydi yaradılır və kassa ödənişinə `loyalty_points` tenderi kimi yazılır.

### 3.3. Qaytarma Zamanı Xalların Proporsional Ləğvi (Return Reversal)
1. Müştəri məhsulu qaytardıqda, qaytarılan məbləğə uyğun qazanılmış xallar geri tutulur (`REVERSE_EARN`).
2. Əgər müştəri artıq xalları xərcləyibsə və balansı tələb olunan məbləğdən azdırsa, yalnız mövcud qalıq silinir (balans heç vaxt mənfiyə düşmür).

### 3.4. Vaxtı Keçmiş Xalların Dondurulması (Expiry Job)
Gündəlik arxa fon cron işi `expires_at <= NOW()` olan və `remaining_lot_points > 0` qalan bütün partiyaları aşkar edir. Hər bir partiya üçün `remaining_lot_points = 0` edilir, `EXPIRE` növlü jurnal qeydi yazılır və müştərinin cari balansı azaldılır.

### 3.5. Mükafatlar Kataloqu (Rewards Catalog)
Müştərilər toplanmış xallarını xüsusi vauçerlərə dəyişdirə bilərlər. Mükafat dəyişdirildikdə unikal `RW-XXXX-XXXX` formatlı vauçer kodu generasiya olunur və mükafatın stok limiti azaldılır.

