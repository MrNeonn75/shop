# İnsan Resursları (HR) və Əmək Haqqı (Payroll) Modulları

Bu sənəd Brend House ERP sisteminin **İnsan Resursları (HR)** və **Əmək Haqqı (Payroll)** modullarının arxitekturasını, domen modellərini, hesablaşma mühərrikini, təhlükəsizlik qaydalarını və REST API interfeyslərini təsvir edir.

---

## 1. Əsas Prinsiplər və Arxitektura

1. **Modulyar Monolit və İnteqrasiya Sərhədləri:**
   - `hr` modulu işçilərin qeydiyyatı, orqstrukturu, həssas PII məlumatlarının saxlanması, sənədlər, müqavilələr, iş qrafikləri (növbələr), faktiki davamiyyət (punch-in/out, kənarlaşmalar) və məzuniyyət balanslarını idarə edir.
   - `payroll` modulu işçilərin əmək haqqı profilləri, dövri qaydalar toplusu (`PayrollRuleSet`), əlavə/tutulmalar (`PayrollAdjustment`), aylıq maaş hesablama sənədləri (`PayrollRun`), maaş vərəqələri (`Payslip`), bank ödəniş faylları (CSV) və filial xərc bölüşdürmələrini (`PayrollBranchAllocation`) idarə edir.
   - Modullar birbaşa digər modulların verilənlər bazası cədvəllərini dəyişmir; asinxron inteqrasiya `transactional outbox` və domen hadisələri (`payroll.finalized`, `hr.employee_offboarded`) vasitəsilə təmin edilir.

2. **Dəyişməzlik və Audit İzləri (Immutability & Audit Trail):**
   - Təsdiq edilmiş və ödənilmiş maaş sənədləri (`PAID`) heç vaxt bazadan silinmir və ya redaktə olunmur. Hər hansı düzəliş kompensasiyaedici əks-qeyd sənədi (`REVERSED` / `reversal_of_run_id`) və ya növbəti dövrdə `PayrollAdjustment` vasitəsilə həyata keçirilir.
   - Məzuniyyət qalıqları birbaşa cədvəldə yenilənmir; balans **append-only** `leave_ledger` cədvəlindən derivasiya olunur (`ACCRUAL`, `USAGE`, `ADJUSTMENT`, `CARRYOVER`, `EXPIRY`, `PAYOUT`, `REVERSAL`).

3. **Məsuliyyətlərin Bölünməsi (Separation of Duties - SoD):**
   - Maaş hesablama sənədini tərtib edən (`prepared_by`) şəxs onu təsdiq edə bilməz (`approved_by`).
   - Heç bir istifadəçi özünün daxil olduğu maaş cədvəlini və ya öz məzuniyyət sorğusunu təsdiq edə bilməz (`applicant_id != approver_id`).
   - Təsdiq əməliyyatları üçün `payroll.run.approve` və `hr.leave.approve` xüsusi icazələri tələb olunur.

4. **Konfiqurasiya Edilən Vergi və Sosial Qaydalar:**
   - **XƏBƏRDARLIQ:** Qanunvericiliklə müəyyən edilən vergi dərəcələri, DSMF, İTS və işsizlik sığortası dərəcələri kodda sabit (hardcoded) yazılmır. Bütün dərəcələr, pilləli gəlir vergisi cədvəlləri və hədlər `payroll_rule_sets` konfiqurasiyası vasitəsilə daxil edilir. Sistemin ilkin göstəriciləri demo məqsədlidir və rəsmi Azərbaycan Respublikası Vergi Məcəlləsinə uyğunluğu yerli mühasib/vergi məsləhətçisi tərəfindən yoxlanılmalıdır.

---

## 2. İnsan Resursları (HR) Domeni

### 2.1 İşçilər və Orqstruktur
- **İşçi Qeydiyyatı (`Employee`):** `id`, `employee_no` (unikal nömrələmə), `first_name`, `last_name`, `email`, `phone`, `job_title`, `department_id`, `branch_id`, `manager_id`, `hire_date`, `status` (`ACTIVE`, `ON_LEAVE`, `SUSPENDED`, `TERMINATED`), `employment_type` (`FULL_TIME`, `PART_TIME`, `CONTRACTOR`, `INTERN`), `linked_user_id`.
- **Təyinat Tarixçəsi (`EmployeeAssignment`):** İşçinin filial, departament, vəzifə və menecer dəyişikliklərinin `valid_from` və `valid_to` qeydləri ilə audit jurnalı.
- **Departament və Vəzifə Ağacı (`Department`, `Position`):** Şirkətin iyerarxik strukturunu təmsil edən bölmələr.

### 2.2 Həssas Məlumatların Qorunması (PII)
- `EmployeeSensitiveData` cədvəlində saxlanılan milli şəxsiyyət vəsiqəsi / FİN (`national_id`), bank hesabı / IBAN (`bank_account_iban`), doğum tarixi (`date_of_birth`) və ev ünvanı (`home_address`) tətbiq səviyyəsində AES-256 (Fernet) alqoritmi ilə şifrələnir.
- Standart sorğularda məlumatlar maskalanmış şəkildə qaytarılır (məs. `AZE***456`, `AZ** **** 1234`).
- Məlumatların şifrəsiz əldə edilməsi yalnız `hr.pii.view` icazəsi və məqsəd əsaslandırması tələb edən xüsusi auditli `/sensitive` endpointi vasitəsilə mümkündür.

### 2.3 Əmək Müqavilələri və Sənədlər
- **Müqavilələr (`EmploymentContract`):** Müqavilə növü, sınaq müddətinin sonu (`probation_end_date`), qüvvədə olma müddəti (`start_date`, `end_date`), şərtlər referansı.
- **Sənədlər (`EmployeeDocument`):** İşçiyə aid pasport, tibbi arayış, sertifikatlar və sənədin bitmə tarixi (`expiry_date`).
- **Avtomatlaşdırılmış Xəbərdarlıqlar:** Gündəlik icra olunan arxa plan işi (`check_document_expiry_alerts_job`) bitməsinə 30, 14 və 7 gün qalmış sənədlər barədə sistem bildirişləri yaradır.

### 2.4 İşdən Azad Olunma (Offboarding)
- İşçinin statusu `TERMINATED` edilir, `termination_date` və səbəb qeyd olunur.
- İstifadəçi hesabı sistem tərəfindən dərhal dondurulur və ya təyin edilmiş son iş günündə bloklanır.
- Cari açıq və ya təsdiqlənməmiş maaş hesablama sənədləri olduqda işçinin arxivləşdirilməsi bloklanır.
- Qanuni saxlama müddəti bitdikdə (`anonymize_retention_expired_employees_job`) qeydlər anonimləşdirilir (`legal_hold_flag == False` şərti ilə).

### 2.5 Növbələr və İş Qrafikləri (Schedules)
- **Növbə Şablonları (`ShiftTemplate`):** Başlama/bitmə saatı, fasilə müddəti, gecə növbəsi (`crosses_midnight`).
- **Cədvəl Dövrləri (`SchedulePeriod`):** Filial üzrə həftəlik və ya aylıq qrafiklər (`DRAFT` → `PUBLISHED` → `LOCKED`).
- **Doğrulama Mühərriki (`ScheduleValidationEngine`):**
  - Eyni günə təkrarlanan növbə təyinatlarının qarşısının alınması.
  - Gündəlik maksimum iş saatı limitləri (məs. 12 saatdan çox təyinat xətası).
  - Növbələr arası minimum istirahət müddətinin (məs. minimum 11 saat) yoxlanılması.
  - Təsdiq olunmuş məzuniyyət günləri ilə üst-üstə düşmələrin aşkarlanması.
- **Növbə Dəyişdirmə (`ScheduleSwapRequest`):** İşçilər arasında növbələrin qarşılıqlı dəyişdirilməsi və menecer təsdiqi.

### 2.6 Davamiyyət və Tabel Uçotu (Attendance & Timesheets)
- **Faktiki Giriş-Çıxışlar (`AttendancePunch`):** Mənbə (`MANUAL`, `BIOMETRIC_DEVICE`, `MOBILE_APP`), vaxt və geolokasiya.
- **Gündəlik Deterministik Hesablama (`DailyAttendance`):**
  - Qrafiklə faktiki vaxt müqayisə edilir.
  - Güzəşt müddəti (`grace_period_minutes`), gecikmə (`late_minutes`), tez çıxma (`early_departure_minutes`), əlavə iş vaxtı (`overtime_minutes`) və qayıb (`ABSENT`) statusu deterministik hesablanır və qayda versiyası ilə saxlanılır.
- **Kənarlaşmalar Növbəsi və Düzəlişlər (`AttendanceCorrection`):**
  - Unudulmuş çıxış qeydləri və ya səhv vuruşlar menecer tərəfindən əsaslandırma ilə düzəldilir. Əsli silinmir; audit izi saxlanılır.
- **Aylıq Tabel (`Timesheet`):**
  - Ayın sonunda ümumi işlənmiş saatlar, əlavə iş saatları, gecikmə saatları və məzuniyyət günləri toplanır.
  - Vəziyyət maşını: `DRAFT` → `SUBMITTED` → `APPROVED` → `LOCKED`.
  - Kilidlənmiş tabel birbaşa əmək haqqı hesablamasına ötürülür.

### 2.7 Məzuniyyət Fondu (Leave Ledger)
- **Məzuniyyət Növləri (`LeaveType`):** Əsas ödənişli əmək məzuniyyəti, ödənişsiz məzuniyyət, təhsil məzuniyyəti, analıq məzuniyyəti.
- **Append-Only Qalıq Jurnalı (`LeaveLedgerEntry`):**
  - Əməliyyat növləri: `ACCRUAL` (illik/aylıq qazanılan günlər), `USAGE` (istifadə edilən məzuniyyət), `ADJUSTMENT` (düzəlişlər), `CARRYOVER` (növbəti ilə keçid), `EXPIRY` (vaxtı bitən günlər), `PAYOUT` (işdən çıxarkən kompensasiya ödənişi), `REVERSAL` (ləğv).
- **Məzuniyyət Sorğusu (`LeaveRequest`):** İşçi tərəfindən verilir, növbə qrafiki və qalıq yoxlanılır, menecer və HR tərəfindən təsdiqlənir.

---

## 3. Əmək Haqqı (Payroll) Domeni

### 3.1 Kompensasiya Modelləri və Əmək Haqqı Profilləri
Hər bir işçi üçün `SalaryProfile` müəyyən edilir (qüvvəyə minmə tarixi və versiyalaşma dəstəyi ilə):
1. **FIXED (Sabit Aylıq):** Aylıq müəyyən edilmiş baza maaş (`base_salary`). Tabeldəki faktiki iş günləri/saatları nisbətində kəsintilər və ya əlavələr tətbiq olunur.
2. **HOURLY (Saatbayat):** İşçinin təsdiq olunmuş tabel saatları üzrə `hourly_rate * total_hours` düsturu ilə hesablanır.
3. **MIXED (Qarışıq):** Sabit baza maaşı üstəgəl saatlıq və ya nəticəyə əsaslanan əlavə.
4. **COMMISSION_BONUS (Satış Komissiyası / Bonus):** POS və satış modullarının dövriyyə göstəricilərinə və ya daxil edilən bonus qeydlərinə əsaslanır.

### 3.2 Deterministik Hesablama Mühərriki (`PayrollCalculationEngine`)
Maaş hesablaması aşağıdakı qapalı və dəqiq ardıcıllıqla həyata keçirilir:
1. **Baza Məbləğin Hesablanması (Gross Base Pay):**
   - Sabit maaşlı işçilər üçün norma saatlara nisbət (`base_salary * actual_hours / standard_hours`).
   - Saatlıq işçilər üçün `hourly_rate * regular_hours`.
2. **Əlavə İş Vaxtı (Overtime Pay):**
   - `overtime_hours * hourly_rate * overtime_multiplier`.
3. **Dövri Düzəlişlər (`PayrollAdjustment`):**
   - Cari dövr üçün daxil edilmiş bonuslar, mükafatlar, maddi yardımlar (`BONUS`, `ALLOWANCE`) və intizam tənbeh kəsintiləri (`DEDUCTION`).
4. **Ümumi Hesablanmış Əmək Haqqı (Gross Total):**
   - `gross_total = gross_base + overtime_pay + bonuses + allowances - operational_deductions`.
5. **Konfiqurasiya Edilən Tutulmalar və Vergilər (Rule Set Calculations):**
   - **Gəlir Vergisi (Personal Income Tax):** Pilləli cədvəl üzrə (məs. 8000 AZN-dək 0%, artıq hissədən 14% və ya qeyri-neft/qaz sektoru qaydaları).
   - **Məcburi Dövlət Sosial Sığortası (İşçi DSMF - Employee Social Insurance):** Qayda dərəcəsi üzrə (məs. 200 AZN-dək 3%, artıq hissədən 10%).
   - **İşsizlikdən Sığorta (İşçi - Unemployment Insurance):** (məs. 0.5%).
   - **İcbari Tibbi Sığorta (İşçi İTS - Medical Insurance):** (məs. 8000 AZN-dək 2%, artıq hissədən 0.5%).
6. **Xalis Əmək Haqqı (Net Salary):**
   - `net_salary = gross_total - total_employee_taxes_and_deductions`.
7. **İşəgötürənin Xərcləri (Employer Contributions):**
   - İşəgötürən DSMF (məs. 22%), İşəgötürən İşsizlik (məs. 0.5%), İşəgötürən İTS (məs. 2%).
   - `total_company_cost = gross_total + employer_contributions`.
8. **Valyuta Yuvarlaqlaşdırması:**
   - Bütün hesablamalar `Decimal` tipində aparılır və `ROUND_HALF_UP` qaydası ilə 2 onluq işarəsinə yuvarlaqlaşdırılır.

### 3.3 Maaş Sənədinin Həyat Tsikli (`PayrollRun`)
```
[DRAFT] (Hesablamanın aparılması və ilkin baxış)
   │
   ▼
[REVIEWED] (Kadrlar və ya Baş Mühasib tərəfindən yoxlanış)
   │
   ▼
[APPROVED] (Rəhbərlik təsdiqi, SoD yoxlanışı: prepared_by != approved_by)
   │
   ▼
[PAID] (Bank köçürməsi və kassa ödənişlərinin tamamlanması)
   │
   ├──▶ Outbox Hadisəsi: `payroll.finalized`
   │      └── Maliyyə moduluna filial xərcləri və ödəniş faktları kimi ötürülür
   │
   ▼
[REVERSED] (Səhv aşkar edildikdə kompensasiyaedici əks-sənədin açılması)
```

### 3.4 Çap Formaları və İxrac (PDF & CSV)
- **Rəsmi Maaş Vərəqəsi (Payslip PDF):** ReportLab mühərriki vasitəsilə A4 formatında tərtib edilir. İşçinin rekvizitləri, hesablanmış baza məbləğ, əlavə iş vaxtı, tutulmuş bütün vergilər, xalis ödəniləcək məbləğ və bank rekvizitləri əks olunur.
- **Bank Ödəniş İxracı (Bank CSV):** Təsdiq edilmiş maaş sənədi əsasında bank sistemlərinə (məs. Paşa Bank, ABB, Kapital Bank) kütləvi əmək haqqı köçürməsi üçün UTF-8 formatlı CSV faylı formalaşdırılır.

### 3.5 Filial Xərc Bölgüsü (`PayrollBranchAllocation`)
Şirkət səviyyəsində işləyən və ya bir neçə filialda növbələrdə iştirak edən işçilərin əmək haqqı xərcləri filiallar üzrə proporsional bölünür:
- Ən böyük qalıq alqoritmi (**Largest-Remainder Method**) tətbiq edilir, nəticədə qəpik xətaları olmadan filial xərclərinin cəmi 100.00% dəqiqliklə ümumi məbləğə bərabər olur.

---

## 4. Maliyyə Modulu ilə İnteqrasiya

`payroll` modulu birbaşa maliyyə qeydləri yazmır. Maaş sənədi `PAID` statusuna keçdikdə transactional outbox mexanizmi ilə `payroll.finalized` hadisəsi qeydə alınır:
```json
{
  "event_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "event_type": "payroll.finalized",
  "occurred_at": "2026-10-22T10:00:00Z",
  "payload": {
    "payroll_run_id": "c1f19830-4e32-475c-897b-ea2f1839e992",
    "run_number": "PAY-202610-001",
    "period_year": 2026,
    "period_month": 10,
    "total_gross": "15400.00",
    "total_net": "12800.00",
    "total_employer_tax": "3388.00",
    "branch_allocations": [
      {"branch_id": "...", "allocated_cost": "9240.00"},
      {"branch_id": "...", "allocated_cost": "6160.00"}
    ]
  }
}
```
Maliyyə modulunun istehlakçısı (`PayrollFinalizedConsumer`) bu hadisəni idempotent şəkildə qəbul edərək filiallar üzrə əmək haqqı xərclərini və bank/kassa hesablarından çıxarışları qeyd edir.

---

## 5. REST API Xülasəsi

### HR Modulu (`/api/v1/hr`)
| Metod | Yol | Təsvir | Tələb Olunan İcazə |
|---|---|---|---|
| POST | `/departments` | Yeni departament yaratmaq | `hr.employee.manage` |
| GET | `/departments` | Departamentlərin siyahısı | `hr.employee.view` |
| POST | `/positions` | Yeni vəzifə yaratmaq | `hr.employee.manage` |
| GET | `/positions` | Vəzifələrin siyahısı | `hr.employee.view` |
| POST | `/employees` | Yeni işçi qeydiyyatı | `hr.employee.manage` |
| GET | `/employees` | İşçilərin siyahısı (maskalanmış) | `hr.employee.view` |
| GET | `/employees/{id}` | İşçi təfərrüatları | `hr.employee.view` |
| PATCH | `/employees/{id}` | İşçi məlumatlarını yeniləmək | `hr.employee.manage` |
| GET | `/employees/{id}/sensitive` | Həssas PII məlumatlarını göstərmək (auditli) | `hr.pii.view` |
| PATCH | `/employees/{id}/offboarding` | İşdən azad etmə (offboarding) | `hr.employee.manage` |
| POST | `/schedules/templates` | Növbə şablonu yaratmaq | `hr.schedule.manage` |
| GET | `/schedules/templates` | Növbə şablonlarının siyahısı | `hr.schedule.view` |
| POST | `/schedules/periods` | Qrafik dövrü açmaq | `hr.schedule.manage` |
| POST | `/schedules/assignments` | İşçilərə növbə təyin etmək | `hr.schedule.manage` |
| POST | `/schedules/validate` | Qrafik ziddiyyətlərini yoxlamaq | `hr.schedule.manage` |
| POST | `/schedules/periods/{id}/publish` | Qrafiki rəsmi elan etmək | `hr.schedule.manage` |
| GET | `/schedules/my-schedule` | İşçinin öz qrafiki (self-service) | İcazə tələb olunmur |
| POST | `/attendance/punches` | Giriş-çıxış qeyd etmək | `hr.attendance.manage` |
| GET | `/attendance/daily` | Gündəlik hesablanmış davamiyyət | `hr.attendance.view` |
| POST | `/attendance/daily/{id}/corrections` | Kənarlaşmaya düzəliş etmək | `hr.attendance.manage` |
| POST | `/attendance/timesheets/generate` | Aylıq tabel formalaşdırmaq | `hr.timesheet.manage` |
| GET | `/attendance/timesheets/{id}` | Tabel təfərrüatları | `hr.timesheet.view` |
| POST | `/attendance/timesheets/{id}/approve` | Tabeli təsdiqləmək | `hr.timesheet.approve` |
| POST | `/attendance/timesheets/{id}/lock` | Tabeli kilidləmək (maaş üçün) | `hr.timesheet.lock` |
| GET | `/leave/types` | Məzuniyyət növlərinin siyahısı | `hr.leave.view` |
| GET | `/leave/balances/{employee_id}` | Məzuniyyət qalığı (append-only) | `hr.leave.view` |
| POST | `/leave/requests` | Məzuniyyət sorğusu vermək | `hr.leave.manage` |
| POST | `/leave/requests/{id}/decision` | Məzuniyyəti təsdiq/imtina etmək | `hr.leave.approve` |

### Əmək Haqqı Modulu (`/api/v1/payroll`)
| Metod | Yol | Təsvir | Tələb Olunan İcazə |
|---|---|---|---|
| POST | `/profiles` | İşçiyə əmək haqqı profili təyin etmək | `payroll.profile.manage` |
| GET | `/profiles/{employee_id}` | İşçinin aktiv maaş profili | `payroll.profile.view` |
| POST | `/rule-sets` | Yeni qaydalar toplusu yaratmaq | `payroll.rules.manage` |
| GET | `/rule-sets/latest` | Son qüvvədə olan qaydalar | `payroll.rules.view` |
| POST | `/adjustments` | Mükafat və ya kəsinti daxil etmək | `payroll.adjustment.manage` |
| POST | `/runs` | Yeni maaş hesablama cədvəli açmaq | `payroll.run.create` |
| GET | `/runs` | Maaş sənədlərinin siyahısı | `payroll.run.view` |
| GET | `/runs/{id}` | Maaş sənədi və cəmi göstəricilər | `payroll.run.view` |
| POST | `/runs/{id}/calculate` | Dövri hesablamanı icra etmək | `payroll.run.create` |
| POST | `/runs/{id}/review` | Sənədi yoxlanışa keçirmək | `payroll.run.create` |
| POST | `/runs/{id}/approve` | Sənədi təsdiqləmək (SoD) | `payroll.run.approve` |
| POST | `/runs/{id}/pay` | Sənədi ödənildi qeyd etmək | `payroll.run.pay` |
| POST | `/runs/{id}/reversal` | Səhv sənədi kompensasiya etmək | `payroll.run.reverse` |
| GET | `/runs/{id}/bank-export` | Bank köçürmə CSV faylını almaq | `payroll.run.view` |
| GET | `/payslips/{id}` | Fərdi maaş vərəqəsi | `payroll.payslip.view` |
| GET | `/payslips/{id}/pdf` | Rəsmi A4 PDF formatında çap | `payroll.payslip.view` |
| GET | `/my-payslips` | İşçinin öz maaş vərəqələri (self-service) | İcazə tələb olunmur |

