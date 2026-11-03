# ADR-005: Maya Dəyərinin Hesablanması Metodologiyası (Costing Methodology: FIFO vs Moving Average)

## Status
Qəbul edildi (Accepted)

## Kontekst
Satılmış Malların Maya Dəyərinin (COGS - Cost of Goods Sold) dəqiq hesablanması Mənfəət və Zərər (P&L) hesabatı, vergi bəyannamələri və anbar qiymətləndirilməsi üçün əsas sütundur. İnflyasiya və müxtəlif partiyalardan tədarüklər zamanı maya dəyəri dəyişir.

## Qərar
1. Əsas maya dəyəri hesablama metodologiyası kimi **Hərəkətli Orta Dəyər (Moving Average Cost)** və ya partiya əsaslı **FIFO (First-In, First-Out)** metodologiyası seçilmişdir.
2. Hər bir anbar mədaxilində (`RECEIPT`) cari maya dəyəri və miqdar qeyd olunur.
3. Kassa satışı zamanı (`SALE`) sistem hər bir satış sətrinə satış anındakı dəqiq maya dəyərini `cogs_amount` olaraq snapshot şəklində yazır (`SaleLine.cogs_amount`).
4. Gələcəkdə maya dəyərinin dəyişməsi keçmiş satışların mənfəət tarixinə təsir göstərə bilməz (Immutable COGS Snapshot).

## Nəticələr
- **Müsbət**: İstənilən keçmiş tarix üçün sabit marja və mənfəət hesabatı; audit zamanı rəqəmlərin dəyişməməsi təminatı.
- **Mənfi**: Qaytarma zamanı ilkin satışın maya dəyərinin tapılması və geri qaytarılması tələb olunur (`reverse_for_return`).

