# Brand House ERP — İcazələr və RBAC Səlahiyyət Matrisi (docs/permissions.md)

Bu sənəd Brand House ERP sistemində tətbiq olunan Rol Əsaslı Giriş Nəzarəti (RBAC), standart sistem rolları, 26 əsas icazə, Vəzifələrin Bölünməsi (Segregation of Duties - SoD), Filial Təcridi (Branch Scope) və Həssas Məlumatların Maskalanması mexanizmlərini sənədləşdirir.

---

## 1. Standart İcazələr Kataloqu (Permissions Catalog)

Sistemdəki bütün icazələr `module.resource.action` konvensiyasına uyğundur və 3 risk dərəcəsinə malikdir:
- **Normal:** Standart əməliyyat və ya məlumat baxışı.
- **Sensitive:** Maliyyə, anbar silinməsi, kassa ləğvi və ya əmək haqqı kimi həssas əməliyyatlar.
- **Critical:** İnzibati tənzimləmələr, maaşların yekunlaşdırılması və sistem konfiqurasiyası.

| Modul | İcazə Açar Sözü (`key`) | Təsviri | Risk Səviyyəsi | Standart Təyin Olunduğu Rollar |
| :--- | :--- | :--- | :--- | :--- |
| **POS** | `pos.sale.create` | Kassa satışı qeydiyyatı və çək çapı | `normal` | `system_admin`, `general_manager`, `branch_manager`, `cashier` |
| **POS** | `pos.sale.cancel` | Tamamlanmış kassa satışının ləğvi (Void) | `sensitive` | `system_admin`, `branch_manager` |
| **POS** | `pos.refund.create` | Müştəriyə pulun geri qaytarılması (Refund) | `sensitive` | `system_admin`, `branch_manager` |
| **POS** | `pos.discount.override` | Endirim limitlərinin aşılması və manual qiymət | `sensitive` | `system_admin`, `branch_manager`, `marketing_manager` |
| **POS** | `pos.shift.close` | Kassa növbəsinin bağlanması və Z-hesabat | `normal` | `system_admin`, `branch_manager`, `cashier` |
| **Inventory** | `inventory.stock.view` | Filial və mərkəzi anbar qalıqlarına baxış | `normal` | `system_admin`, `general_manager`, `branch_manager`, `cashier`, `warehouse_keeper`, `accountant`, `marketing_manager` |
| **Inventory** | `inventory.stock.adjust` | Anbar qalığına manual düzəliş edilməsi | `sensitive` | `system_admin`, `warehouse_keeper` |
| **Inventory** | `inventory.count.create` | Sayım aktının və inventarizasiyanın başlanması | `normal` | `system_admin`, `branch_manager`, `warehouse_keeper` |
| **Inventory** | `inventory.count.approve` | Sayım kənarlaşmalarının təsdiqlənməsi | `sensitive` | `system_admin`, `general_manager` |
| **Inventory** | `inventory.transfer.create`| Filiallararası mal transferinin göndərilməsi | `normal` | `system_admin`, `branch_manager`, `warehouse_keeper` |
| **Inventory** | `inventory.transfer.receive`| Daxil olan transfer mallarının qəbulu | `normal` | `system_admin`, `branch_manager`, `warehouse_keeper` |
| **Finance** | `finance.payment.create` | Mədaxil və məxaric ödəniş sənədinin yaradılması | `normal` | `system_admin`, `accountant` |
| **Finance** | `finance.payment.approve` | Maliyyə və bank ödənişlərinin təsdiqlənməsi | `sensitive` | `system_admin`, `general_manager` |
| **Finance** | `finance.expense.view` | Filial və baş ofis xərclərinə baxış | `normal` | `system_admin`, `general_manager`, `branch_manager`, `accountant` |
| **Finance** | `finance.expense.approve` | Xərc sifarişlərinin təsdiqlənməsi | `sensitive` | `system_admin`, `general_manager`, `accountant` |
| **HR** | `hr.employee.view` | İşçi heyəti və əlaqə məlumatlarına baxış | `normal` | `system_admin`, `general_manager`, `branch_manager`, `hr_manager` |
| **HR** | `hr.salary.view` | Həssas əmək haqqı və bonus cədvəlinə baxış | `sensitive` | `system_admin`, `general_manager`, `accountant`, `hr_manager` |
| **HR** | `hr.salary.finalize` | Maaşların yekunlaşdırılması və ödənişə göndərilməsi | `critical` | `system_admin`, `hr_manager` |
| **Users** | `users.user.view` | İstifadəçi profilləri və siyahısına baxış | `normal` | `system_admin`, `general_manager`, `hr_manager` |
| **Users** | `users.user.manage` | Yeni istifadəçi yaratma, redaktə və status | `sensitive` | `system_admin` |
| **RBAC** | `rbac.role.view` | Rollar və icazələr matrisinə baxış | `normal` | `system_admin`, `general_manager` |
| **RBAC** | `rbac.role.manage` | Rol yaradılması, icazə təyini və silinməsi | `critical` | `system_admin` |
| **Audit** | `audit.events.view` | Dəyişməz audit jurnalına və hadisələrə baxış | `sensitive` | `system_admin`, `general_manager` |
| **Audit** | `audit.events.export` | Audit jurnalının xarici fayla (CSV) ixracı | `sensitive` | `system_admin`, `general_manager` |
| **System** | `system.settings.view` | Sistem və təhlükəsizlik parametrlərinə baxış | `normal` | `system_admin`, `general_manager` |
| **System** | `system.settings.manage` | Sistem konfiqurasiyası və siyasətlərin idarəsi| `critical` | `system_admin` |
| **System** | `system.branches.all` | Bütün filialların məlumatlarına məhdudiyyətsiz çıxış| `sensitive` | `system_admin`, `general_manager`, `accountant`, `hr_manager`, `marketing_manager` |

---

## 2. Standart Sistem Rolları (System Roles)

Sistemdə 8 ədəd quraşdırılmış standart rol mövcuddur:
1. `system_admin` (Sistem Administratoru): Bütün sistem üzrə tam hüquqludur. Qorunan roldur (`is_protected=True`), silinə bilməz.
2. `general_manager` (Baş Menecer): Bütün filiallara nəzarət, hesabatlar və maliyyə/anbar təsdiqləri.
3. `branch_manager` (Filial Meneceri): Filial səviyyəsində kassa, anbar, xərc və heyətin idarə edilməsi.
4. `cashier` (Kassir): Kassa satışları və növbə bağlanması.
5. `warehouse_keeper` (Anbardar): Anbar qalıqlarına baxış, sayım, düzəliş və filiallararası transferlər.
6. `accountant` (Mühasib): Maliyyə sənədlərinin hazırlanması, xərclərə baxış və təsdiq.
7. `hr_manager` (HR Menecer): İşçi qeydiyyatı, əmək haqqı hesablanması və yekunlaşdırılması.
8. `marketing_manager` (Marketinq Meneceri): Endirimlərin tənzimlənməsi, kampaniyalar və anbar baxışı.

---

## 3. Vəzifələrin Bölünməsi (Segregation of Duties - SoD)

Daxili fırıldaqçılıq və səlahiyyətdən sui-istifadənin qarşısını almaq üçün sistemdə 4 kritik SoD ziddiyyət cütü təsdiqlənmişdir:
1. `finance.payment.create` ⚡ `finance.payment.approve`:
   - *Qayda:* Eyni şəxs həm ödənişi tərtib edib, həm də onu təsdiqləyə bilməz.
2. `inventory.stock.adjust` ⚡ `inventory.count.approve`:
   - *Qayda:* Eyni şəxs həm anbar qalığına əl ilə düzəliş edib, həm də inventarizasiya/sayım kənarlaşmasını təsdiq edə bilməz.
3. `pos.sale.create` ⚡ `pos.sale.cancel`:
   - *Qayda:* Kassir öz vurduğu satışı menecer təsdiqi olmadan təkbaşına ləğv edə bilməz.
4. `hr.salary.view` ⚡ `hr.salary.finalize`:
   - *Qayda:* Maaş cədvəlini yekunlaşdıran şəxs kənar nəzarətçi olmadan təkbaşına hərəkət edə bilməz.

Rol yaradılarkən və ya redaktə edilərkən SoD ziddiyyəti aşkar edilərsə, sistem `sod_warnings` qaytarır və təhlükəsizlik auditinə qeyd edir. Sənəd təsdiqləmə anında isə sənədi yaradan şəxs ilə təsdiq edən eyni şəxs olduqda `SegregationOfDutiesError` (HTTP 422) atılır.

---

## 4. Filial Təcridi və Çıxış Əhatəsi (Branch Scope Isolation)

Hər bir istifadəçinin sistemdə çıxış dairəsi vardır:
- İstifadəçinin `system.branches.all` icazəsi və ya `system_admin` rolu varsa, onun filial filtri aradan qaldırılır (`branch_scope_ids = None`).
- Əks halda istifadəçi yalnız ona `UserBranchAccess` cədvəlində icazə verilmiş filialların məlumatlarını görə bilər.
- `BranchScope` asılılığı istifadəçinin hüququ olmayan filiala sorğu göndərməsi cəhdini aşkar edərək HTTP 403 `CrossBranchAccessError` qaytarır.

---

## 5. Həssas Məlumatların Maskalanması (Sensitive Field Masking)

Məlumat təhlükəsizliyi prinsiplərinə (GDPR, ISO 27001) uyğun olaraq:
- Şəxsi PII (pasport nömrələri, sənəd seriyaları) və maliyyə dəyərləri (maya dəyəri, işçi maaşları) səlahiyyəti olmayan istifadəçilərə `****` şəklində maskalanaraq göndərilir.
- Məxfi heşlər (`password_hash`, `manager_pin_hash`, `pos_pin_hash`) heç vaxt API cavablarında qaytarılmır.

---

## 6. Sonuncu Administratorun Qorunması (Last Admin Protection)

Sistemin idarəetmədən çıxmasının (lockout) qarşısını almaq üçün:
- Sistemdəki sonuncu aktiv `system_admin` rolu daşıyıcısının rolu silinə, hesabı dayandırıla və ya kilidlənə bilməz.
- Belə cəhdlər zamanı `LastAdminProtectionError` atılır.

