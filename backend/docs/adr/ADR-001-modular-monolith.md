# ADR-001: Modulyar Monolit Arxitekturası (Modular Monolith)

## Status
Qəbul edildi (Accepted)

## Kontekst
Brand House pərakəndə satış şəbəkəsi 10 filial, mərkəzi anbar və e-ticarət platformasını əhatə edir. Sistem POS satışları, anbar hərəkətləri, maliyyə, təchizat, HR və analitikanı idarə etməlidir. Mikroservis arxitekturası erkən mərhələdə yüksək şəbəkə gecikmələri (network latency), paylanmış tranzaksiyaların mürəkkəbliyi (2PC / Saga) və DevOps xərcləri yaradır.

## Qərar
Sistem tək bir verilənlər bazası və tək bir kod bazası daxilində **Modulyar Monolit (Modular Monolith)** arxitekturası ilə qurulur:
1. Hər bir modul (`catalog`, `inventory`, `pos`, `finance`, `hr`, `marketing` və s.) öz daxili sxemlərinə, servislərinə və repository qatına malikdir.
2. Modullar arası birbaşa model və ya cədvəl idxalı qadağandır (`import-linter` müqavilələri ilə qorunur).
3. Modullar bir-biri ilə yalnız rəsmi servis interfeysləri (`Service Port`) və asinxron domen hadisələri (`Transactional Outbox`) vasitəsilə əlaqə qurur.

## Nəticələr
- **Müsbət**: Güclü tranzaksional bütövlük (ACID), sıfır paylanmış şəbəkə gecikməsi, sadələşdirilmiş test və yerləşdirmə prosesi.
- **Mənfi**: Gələcəkdə hər hansı modul ayrı mikroservisə ayrılmaq istəndikdə verilənlər bazası cədvəllərinin fiziki bölünməsi tələb olunacaq.

