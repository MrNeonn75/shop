# Brand House ERP — Əsas Performans Göstəriciləri (KPI) Reyestri

Bu sənəd sistemdə istifadə olunan bütün maliyyə, satış, anbar və idarəetmə göstəricilərinin
yeganə və yekun rəsmi həqiqət mənbəyidir. Bütün hesabat və idarə paneli (Dashboard) API-ləri
hər rəqəmlə yanaşı müvafiq `definition_id` qaytarır.

| ID | Göstərici (AZ) | Kateqoriya | Düstur | Vahid | Mənbə Cədvəllər | Məhdudiyyətlər (Caveats) |
|---|---|---|---|---|---|---|
| `kpi_net_sales` | **Xalis Satış Gəliri (Net Sales)** | Sales | `Ümumi Satış - Qaytarmalar - Kassa və Promokod Endirimləri (ƏDV xaric)` | AZN | `sales`, `sale_lines`, `sale_returns`, `sale_return_lines` | Yalnız uğurla tamamlanmış (COMPLETED) satışlar nəzərə alınır. Vergi (ƏDV) daxil deyil. |
| `kpi_gross_sales` | **Ümumi Satış (Gross Sales)** | Sales | `Σ (Sətir Sayı * Standart Satış Qiyməti)` | AZN | `sales`, `sale_lines` | Endirimlər və qaytarmalar çıxılmadan əvvəlki ilkin satış məbləğidir. |
| `kpi_gross_profit` | **Ümumi Mənfəət (Gross Profit)** | Profitability | `Xalis Satış Gəliri - Satılan Malların Maya Dəyəri (COGS)` | AZN | `sale_lines`, `inventory_cost_states`, `reporting_daily_sales_summary` | Satış anında qeydə alınmış maya dəyəri (cost snapshot) əsas götürülür. reports.profit.view hüququ tələb olunur. |
| `kpi_net_profit` | **Xalis Əməliyyat Mənfəəti (Net Profit)** | Profitability | `Ümumi Mənfəət - Əməliyyat Xərcləri - Əmək Haqqı Xərcləri - Digər Xərclər` | AZN | `sale_lines`, `expenses`, `payroll_runs`, `reporting_expense_summary` | Əgər maya dəyəri və ya dövr xərcləri tam bağlanmayıbsa NOT_COMPUTABLE qaytarılır. |
| `kpi_sales_growth` | **Satış Artımı Faizlə (Sales Growth %)** | Sales | `((Cari Dövr Satışı - Müqayisə Dövrü Satışı) / Müqayisə Dövrü Satışı) * 100` | % | `reporting_daily_sales_summary` | Müqayisə dövründə satış 0 olduqda riyazi olaraq bölünmə mümkün deyil, NOT_COMPUTABLE qaytarılır. |
| `kpi_aov` | **Orta Çek Məbləği (Average Order Value - AOV)** | Sales | `Xalis Satış / Tamamlanmış Qəbzlərin Sayı` | AZN | `sales` | Qaytarma qəbzləri və ləğv edilmiş satışlar bu saya daxil edilmir. |
| `kpi_units_sold` | **Satılmış Malların Xalis Sayı (Units Sold)** | Sales | `Σ Satılan Malların Sayı - Σ Qaytarılan Malların Sayı` | ədəd | `sale_lines`, `sale_return_lines` | Dəst (bundle) tərkibindəki fərdi ədədlər deyil, sətir səviyyəsindəki fiziki ədədlər toplanır. |
| `kpi_return_rate` | **Qaytarma Nisbəti (Return Rate)** | Operations | `(Qaytarılan Məbləğ / Ümumi Satış Məbləği) * 100` | % | `sale_returns`, `sales` | Həm məbləğ, həm də ədəd nisbəti olaraq təqdim oluna bilər; standart olaraq xalis məbləğ nisbəti verilir. |
| `kpi_discount_cost` | **Verilmiş Cəmi Endirimlər (Discount Total)** | Marketing | `Σ (Sətir Aksiya Endirimləri + Qəbz Endirimləri + Loyallıq Endirimləri)` | AZN | `sales`, `sale_lines` | Endirimin şirkət mənfəətinə vurduğu ümumi maliyyə təsirini ölçür. |
| `kpi_inventory_value` | **Anbar Qalığının Maya Dəyəri (Inventory Value)** | Inventory | `Σ (Mövcud Say * Orta Çəkili Maya Dəyəri)` | AZN | `stock_snapshots`, `stock_balances`, `inventory_cost_states` | Parametrlərdə seçilmiş dəyərləndirmə metodundan (WAC və ya FIFO) asılıdır. reports.cost.view tələb olunur. |
| `kpi_inventory_turnover` | **Anbar Dövriyyə Əmsalı (Inventory Turnover)** | Inventory | `Dövr üzrə COGS / Dövr üzrə Orta Anbar Maya Dəyəri` | əmsal | `reporting_daily_sales_summary`, `stock_snapshots` | Orta anbar dəyəri 0 olduqda NOT_COMPUTABLE qaytarılır. İllikləşdirilmiş göstərici üçün dövr günlərinə proporsiya tətbiq olunur. |
| `kpi_days_of_inventory` | **Anbar Ehtiyatının Gün Sayı (Days of Inventory)** | Inventory | `365 / Anbar Dövriyyə Əmsalı (və ya Mövcud Qalıq / Gündəlik Orta Satış Sürəti)` | gün | `reporting_inventory_velocity` | Satış sürəti 0 olan 'ölü' mallar üçün gün sayı sonsuzdur (N/A kimi qeyd olunur). |
| `kpi_supplier_liabilities` | **Təchizatçılara Cari Borc (Supplier Payables)** | Purchasing | `Σ (Təsdiqlənmiş Qaimələr) - Σ (Təchizatçı Ödənişləri)` | AZN | `supplier_invoices`, `supplier_payments` | Mübahisəli və ya qaralama qaimələr yekun borc qalığına daxil edilmir. |
| `kpi_headcount` | **Aktiv İşçi Sayı (Active Headcount)** | HR | `Count(İşçilər WHERE status = 'ACTIVE')` | nəfər | `hr_employees` | Məzuniyyətdə və ya fəaliyyəti dayandırılmış şəxslər daxil deyil. |
| `kpi_attendance_rate` | **Davamiyyət İntizamı (Attendance Rate)** | HR | `(Faktiki İş Saatları / Planlaşdırılmış Cədvəl Saatları) * 100` | % | `hr_daily_attendance`, `hr_schedule_assignments` | Təsdiqlənmiş məzuniyyətlər və icazələr üzrlü hesab edilir. |
| `kpi_cash_variance` | **Kassa Kənarlaşması (Cash Over / Short)** | Operations | `Σ (Növbə Bağlanışında Faktiki Nağd - Sistemdə Hesablanmış Nəzəri Qalıq)` | AZN | `pos_shifts` | Müsbət dəyər artıqlığı, mənfi dəyər isə kassa çatışmazlığını (shortage) göstərir. |

## Hesablana Bilməyən vəziyyətlər (NOT_COMPUTABLE)
Sistem heç bir halda təxmini və ya uydurma (placeholder) rəqəm qaytarmır:
- Giriş göstəriciləri çatışmadıqda: `NOT_COMPUTABLE` statusu və çatışmayan dəyişənlərin siyahısı qaytarılır.
- Tarix aralığında əməliyyat olmadıqda: `NO_DATA` statusu qaytarılır.
- Bölən sıfır olduqda (Zero Division): bölünmə xətası baş vermir, `NOT_COMPUTABLE` bildirilir.