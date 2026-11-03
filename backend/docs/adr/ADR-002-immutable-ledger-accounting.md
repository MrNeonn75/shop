# ADR-002: Dəyişdirilməz Mühasibat və İnventar Kitabları (Immutable Ledgers)

## Status
Qəbul edildi (Accepted)

## Kontekst
Pərakəndə satış və maliyyə əməliyyatlarında qalıqların yerində dəyişdirilməsi (`UPDATE balances SET quantity = quantity - 1`) audit zəncirini pozur, kassa kəsirlərinin və manipulyasiyaların aşkarlanmasını qeyri-mümkün edir.

## Qərar
1. İnventar hərəkətləri (`stock_movements`), maliyyə jurnalları (`journal_entries`, `journal_lines`), audit loqları (`audit_trail`) və loyallıq əməliyyatları (`loyalty_ledger`) **Append-Only (Yalnız Əlavə Olunan)** cədvəllərdir.
2. Bu cədvəllərdə `UPDATE` və `DELETE` əməliyyatları proqram səviyyəsində qəti qadağandır və verilənlər bazası trigger-ləri ilə qorunur.
3. Hər hansı səhv əməliyyatın düzəlişi yalnız **Əks Qeyd / Reversal** (`movement_type = 'REVERSAL'`, mənfi və ya tərs qeyd) ilə icra edilə bilər.
4. `stock_balances` və `financial_accounts.balance` sürətli oxunuş üçün keş (materialized view) rolunu oynayır və hər an `erp verify` vasitəsilə lecerlərdən yenidən hesablana bilir.

## Nəticələr
- **Müsbət**: 100% audit dəqiqliyi, maliyyə və vergi təftişlərinə tam hazırlıq, heç vaxt itməyən əməliyyat tarixi.
- **Mənfi**: Disk sahəsinin daha sürətli böyüməsi (illik partisiya planı ilə idarə olunur).

