# Əməliyyat Təlimatı: Maliyyə Dövrünün Bağlanması (Month-End Close Runbook)

## 1. Məqsəd
Maliyyə ayının sonunda (hər təqvim ayının sonuncu günü saat 23:59 Asia/Baku) kitabların bağlanması, dövr kilidinin qoyulması və Mənfəət/Zərər (P&L) hesabatının dəqiqləşdirilməsi.

---

## 2. Bağlanış Önü Yoxlama Siyahısı (Pre-Close Checklist)

Baş mühasib `POST /finance/periods/{period}/close` çağırmazdan əvvəl sistem aşağıdakı şərtləri avtomatik yoxlayır:

1. **Açıq Kassa Növbəsi Yoxdur**: Bütün filial kassaları gün sonu Z-hesabatı ilə bağlanıb (`pos_shifts.status = 'CLOSED'`).
2. **Gözləyən Xərc Sənədi Yoxdur**: Bütün təqdim edilmiş xərclər ya təsdiqlənib, ya da rədd edilib (`status IN ('APPROVED', 'REJECTED')`).
3. **Maaş Hesablanması Tamamlanıb**: Cari ay üzrə payroll icrası `FINALIZED` vəziyyətindədir.
4. **Bank Üzləşməsi (Reconciliation)**: Bütün bank çıxarışları sənədlərlə uyğunlaşdırılıb.

---

## 3. Bağlanışın İcrası (Period Lock)

Səlahiyyət: `finance.period.close` (Segregation of Duties tələb olunur).
```python
# API Endpoint: POST /finance/periods/2026-10/close
# Dövrün statusu 'CLOSED' olur.
```

> [!CAUTION]
> Dövr bağlandıqdan sonra həmin dövrün tarixlərinə (`entry_date <= end_date`) heç bir yeni jurnal qeydi, xərc və ya düzəliş edilə bilməz (`409 PERIOD_CLOSED` xətası).

---

## 4. Dövrün Təcili Yenidən Açılması (Period Reopen)

Əgər audit və ya vergi düzəlişi tələb olunarsa:
1. Yalnız Baş Maliyyə Direktoru (CFO) və ya İnzibatçı tərəfindən `POST /finance/periods/{period}/reopen` icra edilə bilər.
2. Yazılı əsaslandırma (`reason`) məcburidir.
3. Kritik audit hadisəsi (`FINANCE_PERIOD_REOPENED`) generasiya edilir.
4. Düzəliş tamamlandıqdan sonra dövr dərhal yenidən bağlanmalıdır.

