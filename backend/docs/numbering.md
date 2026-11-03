# Sənəd Nömrələnməsi Çərçivəsi (Document Numbering Framework)

BRAND HOUSE ERP sistemində bütün maliyyə, kassa, anbar və satınalma sənədlərinin vahid, fasiləsiz (gapless) və yarış vəziyyətlərinə davamlı (concurrency-safe) nömrələnməsi `app.modules.numbering` modulu tərəfindən idarə olunur.

---

## 1. Şablon Tokenləri (Pattern Tokens)

Sənəd nömrələri inzibatçı tərəfindən konfiqurasiya edilə bilən şablonlar əsasında formalaşdırılır. Şablonda aşağıdakı dinamik tokenlərdən istifadə oluna bilər:

| Token | Təsvir | Nümunə Qiymət |
|---|---|---|
| `{PREFIX}` | Sənəd növü üçün təyin edilmiş prefiks | `RCP`, `PO`, `INV` |
| `{BRANCH}` | Sənədin aid olduğu filialın unikal kodu | `28MAY`, `GENCLIK`, `HQ` |
| `{REGISTER}` | Kassa aparatının unikal kodu (POS sənədləri üçün) | `REG01`, `POS-A` |
| `{YYYY}` | 4 rəqəmli cari il | `2026` |
| `{YY}` | 2 rəqəmli cari il | `26` |
| `{MM}` | 2 rəqəmli cari ay | `01` – `12` |
| `{DD}` | 2 rəqəmli cari gün | `01` – `31` |
| `{SEQ:N}` | $N$ rəqəmli sıfırla doldurulmuş (zero-padded) ardıcıl sayğac | `{SEQ:6}` -> `000042` |
| `{SEQ}` | Sıfırla doldurulmamış cari sayğac | `42` |

**Nümunə Şablon:**
`{PREFIX}-{BRANCH}-{REGISTER}-{YYYY}{MM}-{SEQ:6}`
**Nəticə:**
`RCP-28MAY-REG01-202610-000042`

---

## 2. Sıfırlanma Qaydaları (Reset Rules)

Sayğacın hansı dövrlərdə yenidən `1`-dən başlamasını tənzimləyir:

1. **`never` (Heç vaxt sıfırlanmır):** Sayğac fasiləsiz olaraq $1, 2, 3, \dots, N$ kimi artır.
2. **`yearly` (İllik sıfırlanma):** Hər yeni təqvim ilinin ilk günündə (`01 Yanvar`) sayğac `1`-ə sıfırlanır.
3. **`monthly` (Aylıq sıfırlanma):** Hər ayın 1-ci günündə sayğac `1`-ə sıfırlanır.
4. **`daily` (Gündəlik sıfırlanma):** Hər yeni iş günündə kassa növbəsi üçün sayğac `1`-dən başlayır.

---

## 3. Fasiləsizlik (Gapless) və Tranzaksiya Zəmanətləri

Maliyyə və fiskal hesabatlıq sənədlərində (çeklər, fakturalar, qaytarmalar) nömrə itkisinin (gap) baş verməməsi üçün:

1. **Sətir Səviyyəli Kilidləmə (`SELECT ... FOR UPDATE`):**
   - PostgreSQL verilənlər bazasında hər nömrə ayrılması zamanı `numbering_sequences` cədvəlindəki müvafiq ardıcıllıq sətri `FOR UPDATE` ilə kilidlənir.
   - Digər paralel sorğular həmin tranzaksiya commit və ya rollback olunana qədər növbədə gözləyir.
2. **Lokal İn-Process Asinxron Kilid (`asyncio.Lock`):**
   - Tək işçi prosesi daxilində və test mühitlərində (SQLite) paralel korutinlərin eyni anda eyni sayğacı oxumasının qarşısı tam alınır.
3. **Tranzaksiya Geri Çəkilməsi (Rollback Safety):**
   - Əgər çağıran modul `session` parametrini ötürərsə, nömrə həmin tranzaksiyada qeydə alınır.
   - Əməliyyat uğursuz olarsa və `ROLLBACK` baş verərsə, sayğac artımı bazada tətbiq edilmir və növbəti sorğu eyni nömrəni təhlükəsiz şəkildə əldə edir (boşluq / gap qalmır).
4. **Unikallıq Məhdudiyyəti (Composite Unique Constraint):**
   - `allocated_numbers` cədvəlində `(document_type, number)` üzrə unikal indeks mövcuddur. Hər hansı bir sənəd növü üzrə eyni nömrənin təkrar yaranması bazanın öz nüvəsi səviyyəsində fiziki olaraq qeyri-mümkündür.

---

## 4. Standart Sənəd Növləri (Seed Catalog)

Sistem ilkinləşdirildikdə aşağıdakı 11 nömrələnmə sxemi avtomatik yaradılır:

| Sənəd Növü (`document_type`) | Adı | Standart Prefiks | Şablon | Gapless? |
|---|---|---|---|---|
| `receipt` | Standart Kassa Qəbzləri | `RCP` | `{PREFIX}-{BRANCH}-{REGISTER}-{YYYY}{MM}-{SEQ:6}` | Bəli |
| `return` | Standart Qaytarma Qəbzləri | `RET` | `{PREFIX}-{BRANCH}-{REGISTER}-{YYYY}{MM}-{SEQ:6}` | Bəli |
| `po` | Satınalma Sifarişləri | `PO` | `{PREFIX}-{YYYY}-{SEQ:6}` | Xeyr |
| `goods_receipt` | Mal Mədaxil Qəbzləri | `GR` | `{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}` | Xeyr |
| `transfer` | Daxili Anbar Yerdəyişmələri | `TRF` | `{PREFIX}-{YYYY}{MM}-{SEQ:6}` | Xeyr |
| `adjustment` | Anbar Qalıq Düzəlişləri | `ADJ` | `{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}` | Xeyr |
| `stock_count` | İnventarizasiya Sənədləri | `SC` | `{PREFIX}-{BRANCH}-{YYYY}{MM}-{SEQ:6}` | Xeyr |
| `expense` | Kassa Məxaric Orderləri | `EXP` | `{PREFIX}-{YYYY}{MM}-{SEQ:6}` | Xeyr |
| `payroll_run` | Əməkhaqqı Cədvəlləri | `PAY` | `{PREFIX}-{YYYY}{MM}-{SEQ:6}` | Xeyr |
| `invoice` | Vergi Hesab-Fakturaları | `INV` | `{PREFIX}-{YYYY}-{SEQ:6}` | Bəli |
| `payment` | Ödəniş Sənədləri | `PMT` | `{PREFIX}-{YYYY}{MM}-{SEQ:6}` | Bəli |

