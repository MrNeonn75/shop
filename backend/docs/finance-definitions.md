# Maliyyə Tərifləri və Göstəricilər Reyestri (Financial Definitions & KPI Registry)

## 1. Giriş və Əsas Fəlsəfə (Introduction & Core Philosophy)

`finance` modulu Brend House pərakəndə satış şəbəkəsinin əməliyyat maliyyə nəzarətini və mühasibat inteqrasiyasını təmin edir. Pərakəndə ticarətdə ən çox rast gəlinən maliyyə xətalarının qarşısını almaq üçün sistemdə **Gəlir (Revenue)** ilə **Faktiki Nağd Daxilolma (Cash Received)** anlayışları bir-birindən qəti və birmənalı şəkildə ayrılmışdır.

> [!IMPORTANT]
> **Nağd daxilolma gəlir DEYİLDİR! (Cash received is NOT revenue).**
> - Müştəri nisyə (borcla) mal aldıqda gəlir satış anında tanınır, lakin şirkətə heç bir nağd pul daxil olmur.
> - Müştəri keçmiş borcunu kassaya ödədikdə kassa qalığı artır (Cash In), lakin bu dövrdə heç bir yeni gəlir yaranmır (yalnız Debitor Borc azalır).
> - Kassaya qoyulan ilkin qalıq (float) və ya hesablararası köçürmə pul daxilolması yaradır, lakin qətiyyən gəlir sayılmır.

---

## 2. Maliyyə Göstəricilərinin Standart Tərifləri (KPI Registry)

Aşağıdakı cədvəldə Brend House ERP sistemində istifadə olunan bütün rəsmi maliyyə göstəriciləri, onların unikal identifikatorları (`definition_id`), iqtisadi tərifləri və hesablanma düsturları təqdim olunur:

| KPI Kodu (`definition_id`) | Göstəricinin Adı | İqtisadi Tərifi və Hesablanma Qaydası | Mənbə Sənədlər | Standart İstinadı |
|---|---|---|---|---|
| **`DEF-FIN-REV-001`** | **Xalis Satış Gəliri (Net Revenue)** | Çeki vurulmuş və təhvil verilmiş malların xalis dəyəri (ƏDV və digər vergilər çıxılmaqla), tətbiq olunmuş endirimlər və geri qaytarmaların xalis məbləği çıxılır.<br>$$\text{Net Revenue} = \text{Gross Sales (excl. Tax)} - \text{Returns (excl. Tax)} - \text{Discounts}$$ | `sales`, `sale_lines`, `sale_returns` | IFRS 15 / MMUS (Müştərilərlə müqavilələr üzrə gəlirlər) |
| **`DEF-FIN-CSH-001`** | **Faktiki Daxilolma (Cash & Tender Inflow)** | Dövr ərzində kassa, bank və kart klirinq hesablarına daxil olmuş bütün real vəsaitlər (Nağd satışlar + Borc ödənişləri + Qeyri-satış gəlirləri).<br>$$\text{Cash Inflow} = \sum_{\text{direction} = \text{IN}} \text{account\_transactions}$$ | `account_transactions`, `sale_payments`, `customer_payments` | IAS 7 / MMUS (Birbaşa Pul Vəsaitlərinin Hərəkəti) |
| **`DEF-FIN-CGS-001`** | **Satılmış Malların Maya Dəyəri (COGS)** | Satılmış məhsulların anbar alış maya dəyəri. Satış anında sətirdə qeydə alınan dəyişməz maya dəyəri snapshotu əsasında hesablanır. Yararlı (RESALABLE) qaytarmalar çıxılır.<br>$$\text{COGS} = \sum(\text{sold\_qty} \times \text{cost\_price}) - \sum(\text{return\_qty} \times \text{cost\_price})$$ | `sale_lines`, `sale_return_lines`, `stock_movements` | IAS 2 / MMUS (Ehtiyatlar) |
| **`DEF-FIN-GPR-001`** | **Ümumi Mənfəət (Gross Profit)** | Satışdan əldə olunan xalis gəlir ilə malların maya dəyəri arasındakı fərq.<br>$$\text{Gross Profit} = \text{Net Revenue} - \text{COGS}$$ | `sales`, `sale_lines` | Maliyyə Nəticələri Hesabatı (P&L) |
| **`DEF-FIN-OEX-001`** | **Əməliyyat Xərcləri - Hesablama Metodu (OPEX Accrual)** | Faktura və ya xərc tarixinə əsasən dövrə aid olan təsdiqlənmiş əməliyyat xərcləri (İcarə, kommunal, əmək haqqı, marketinq, təmir və s.). Ödəniş tarixindən asılı deyil. | `expenses`, `expense_allocations` | Hesablama Prinsipi (Accrual Basis) |
| **`DEF-FIN-OEX-002`** | **Əməliyyat Xərcləri - Kassa Metodu (OPEX Cash)** | Dövr ərzində kassa və ya bank hesabından faktiki olaraq ödənilmiş vəsaitlər məbləği. | `expenses`, `account_transactions` | Kassa Prinsipi (Cash Basis) |
| **`DEF-FIN-NPR-001`** | **Xalis Əməliyyat Mənfəəti (Net Profit)** | Bütün ticarət gəlirlərindən maya dəyəri, əməliyyat xərcləri çıxıldıqdan və qeyri-satış gəlirləri əlavə edildikdən sonra qalan son mənfəət.<br>$$\text{Net Profit} = \text{Gross Profit} - \text{OPEX (Accrual)} + \text{Other Income}$$ | `sales`, `expenses`, `other_incomes` | Həssas Metrik (`finance.profit.view`) |

---

## 3. Natamam Maya Dəyəri və `NOT_COMPUTABLE` Siyasəti

Əgər satış dövründə hər hansı bir məhsulun alış maya dəyəri təyin edilməyibsə (`cost_price is None` və ya `0.00 AZN`) və ya sistemdə hələ bağlanmamış anbar inventarizasiyası/sayımı varsa, sistem saxta və ya təhrif olunmuş mənfəət rəqəmi nümayiş etdirmir:

- Hesabat statusu: **`NOT_COMPUTABLE`**
- İstifadəçiyə dərhal çatışmayan girişlərin (`missing_inputs`) detallı siyahısı təqdim olunur (məsələn: *"Satış sətrində maya dəyəri snapshotu yoxdur: Sətir ID 4a8e..., Variant: Ayaqqabı Nike Air Max"*).
- Beləliklə, idarə heyəti və mühasibatlıq yanlış marja əsasında qərar qəbul etməkdən qorunur.

---

## 4. Azərbaycan Vergi və Fiskal Hesabatlıq Qaydaları (Açıq Sual və Xəbərdarlıq)

> [!WARNING]
> **Hüquqi Xəbərdarlıq və Açıq Sual:**
> Sistemdə heç bir hüquqi vergi dərəcəsi (ƏDV 18%, sadələşdirilmiş vergi, ödəmə mənbəyində vergi və s.) birbaşa kodda sərt şəkildə yazılmayıb (**hardcoded deyil**). Bütün vergi sinifləri və dərəcələri yalnız `settings` modulundan qüvvəyə minmə tarixi (`effective_date`) ilə idarə olunur.
> 
> Azərbaycan Respublikasının Vergi Məcəlləsinə, elektron qaimə-faktura (e-qaimə) tələblərinə, ictimai iaşə və ya pərakəndə ticarətdə tətbiq olunan xüsusi vergi rejimlərinə tam uyğunluq iddia edilmir. Bu modulun canlı mühitdə istifadəsi üçün **yerli sertifikatlaşdırılmış baş mühasib və vergi məsləhətçisinin rəsmi rəyi və parametrləri təsdiqləməsi zəruridir**.

