# Mühasibat İnteqrasiya Sərhədi və İkitərəfli Baş Kitab Sənədi (Accounting Integration & General Ledger)

## 1. Memarlıq və İnteqrasiya Portu (Architecture & Port Design)

Brend House ERP daxilində maliyyə əməliyyatları ilə mühasibat uçotu sistemi **Hexagonal Architecture (Ports and Adapters)** prinsipi ilə ayrılmışdır:

```
[ Domain Events (Outbox) ]
            │
            ▼
[ FinanceOutboxConsumer ]
            │
            ▼
┌───────────────────────────────┐
│        AccountingPort         │
│  (post(event: AccountingEvent)│
└───────────────────────────────┘
            │
            ├──► [ OperationalLedgerAdapter ]  (Default: Standart operativ idarəetmə uçotu)
            └──► [ GeneralLedgerAdapter ]      (Optional: İkitərəfli balanslaşdırılmış Baş Kitab)
```

### 1.1 `AccountingPort` İnterfeysi
`AccountingPort` bütün maliyyə faktlarını qəbul edən vahid müqavilədir:
```python
class AccountingPort(ABC):
    @abstractmethod
    async def post(self, event: AccountingEvent) -> PostingResult: ...
```

### 1.2 `AccountingEvent` Standart Hadisə Zərfi
Hər bir hadisə dəqiq maliyyə bölgüsünü daşıyır:
- `event_id`: UUID (Outbox hadisəsinin unikal identifikatoru)
- `company_id`: Şirkət identifikatoru
- `branch_id`: Filial (şirkət səviyyəli əməliyyatlarda None)
- `event_type`: Hadisənin növü (`SALE_RECOGNIZED`, `RETURN_RECOGNIZED`, `COGS_RECOGNIZED`, `INVENTORY_RECEIVED`, `SUPPLIER_INVOICE_APPROVED`, `SUPPLIER_PAYMENT`, `EXPENSE_PAID`, `PAYROLL_POSTED`, `CASH_VARIANCE`, `BANK_FEE`, `ADJUSTMENT`)
- `business_date`: Əməliyyatın aid olduğu biznes günü (Asia/Baku)
- `net_amount`: Xalis məbləğ (vergisiz)
- `tax_amount`: Vergi məbləği (ƏDV)
- `cost_amount`: Maya dəyəri
- `gross_amount`: Yekun məbləğ
- `source_type` & `source_id`: İlkin sənədin növü və ID-si (Məs: `sale:4a8e...`)

---

## 2. Adapterlər (Adapters)

### 2.1 Standart Əməliyyat Adapteri (`OperationalLedgerAdapter` - Default)
- **Təyinatı:** İkitərəfli mühasibat olmadan bütün gəlir, xərc, kassa və maya dəyəri faktlarını `operational_postings` cədvəlində qeydə alır.
- **Xüsusiyyətləri:**
  - İdempotent işləyir: `processed_events` cədvəlində yoxlayır, dublikat hadisələri təkrar icra etmir.
  - Maliyyə dövrü yoxlanışı: Əgər hadisənin tarixi `CLOSED` statuslu maliyyə dövrünə düşərsə, əməliyyat rədd edilir (`409 PERIOD_CLOSED`) və `dead_letter_postings` cədvəlinə audit üçün yazılır.

### 2.2 İkitərəfli Baş Kitab Adapteri (`GeneralLedgerAdapter` - Optional)
- **Təyinatı:** `finance.gl.enabled = True` olduqda ikitərəfli mühasibat uçotunun Baş Kitabını (General Ledger) formalaşdırır.
- **Sərt Qaydalar:**
  - **Sərt Balans (Strict Balance):** Hər bir jurnal qeydində $\sum \text{Debet} == \sum \text{Kredit}$ olmalıdır. Əks halda verilənlər bazası `chk_journal_entry_balanced` constraint-i əməliyyatı ləğv edir.
  - **Dəyişməzlik (Immutability):** Final jurnal qeydləri heç vaxt silinmir və redaktə olunmur. Düzəlişlər yalnız tərs kompensasiya qeydləri (Reversal Entries) ilə aparılır.
  - **Standart Mühasibat Müxabirləşmələri:**
    - Satış: Debet Kassa/Debitorlar (Gross) = Kredit Satış Gəliri (Net) + Kredit Hesablanmış ƏDV (Tax)
    - Maya dəyəri: Debet Satılmış Malların Maya Dəyəri (COGS) = Kredit Mallar/Ehtiyatlar (Inventory)
    - Xərc ödənişi: Debet Müvafiq Xərc Hesabı (Gross) = Kredit Kassa/Bank (Gross)

---

## 3. Xarici Mühasibat Sistemləri ilə İnteqrasiya (1C / SAP / Logo)

Brend House ERP-nin xarici mühasibat proqramlarına (məsələn, 1C:Enterprise və ya SAP) inteqrasiyası aşağıdakı müqavilələrlə təmin olunur:

1. **Jurnal Qeydləri və Mizan İxracı (Trial Balance & Journal Entries Export):**
   - `GET /api/v1/finance/gl/trial-balance?period=YYYY-MM`
   - `GET /api/v1/finance/reports/drill-down?metric_id=...`
2. **Bank Çıxarışları İnteqrasiyası (Bank Statement Reconciliation):**
   - CSV çıxarışlarının mərhələli qəbulu: `Parse` → `Dry-run` → `Commit & Auto-match` → `Manual Match`.
3. **Maliyyə Dövrü Nəzarəti (Period Closing Checklist):**
   - `GET /api/v1/finance/periods/{period}/checklist`:
     - Bağlanmamış kassa növbələri (`unclosed_shifts_count`)
     - Gözləyən təsdiqlər (`pending_approvals_count`)
     - Tamamlanmamış bank və kassa üzləşmələri (`unreconciled_sessions_count`)
     - Eşləşməmiş bank çıxarışı sətirləri (`unmatched_bank_lines_count`)
   - Yalnız bütün yoxlamalar uğurla keçdikdə (`can_close: true`) dövr bağlana bilər.

