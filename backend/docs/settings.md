# Parametrlər və Sazlamalar Çərçivəsi (Settings Framework)

BRAND HOUSE ERP sisteminin çevik biznes parametrləri, 3-pilləli iyerarxik qərarvermə mexanizmi və versiyalanmış dəyişiklik tarixçəsi üzərində qurulmuşdur.

---

## 1. Dəyərlərin Həlli Qaydası (3-Tier Resolution Order)

Hər hansı bir filial və ya istifadəçi kontekstində parametr sorğulandıqda dəyər aşağıdakı ardıcıllıqla müəyyən edilir:

```
[Filial Səviyyəli Dəyər (Branch Override)]
               ↓ (yoxdursa)
  [Şirkət Səviyyəli Dəyər (Company Value)]
               ↓ (yoxdursa)
   [Reyestr Standartı (Registry Default)]
```

1. **Filial Override (Filial Səviyyəsi):** Əgər parametr filial səviyyəsində dəyişdirilə biləndirsə (`scope="branch"`) və verilən filial üçün aktiv qeyd mövcuddursa, həmin filial dəyəri tətbiq edilir (`source="branch_override"`).
2. **Şirkət Dəyəri (Şirkət Səviyyəsi):** Filial üçün fərdi konfiqurasiya yoxdursa, mərkəzi şirkət miqyasında təsdiqlənmiş dəyər götürülür (`source="company_value"`).
3. **Reyestr Standartı (Kod Səviyyəsi):** Hələ bazada heç bir redaktə aparılmayıbsa, `SETTINGS_REGISTRY` tərəfindən müəyyən edilmiş ilkin etibarlı standart dəyər qaytarılır (`source="default_registry"`).

---

## 2. Qüvvəyə Minmə Tarixi (Effective Dating) və İmmutability

- Parametrlər bazada heç vaxt yerindəcə (`UPDATE`) əzilib silinmir.
- Hər bir dəyişiklik `setting_values` cədvəlində yeni bir sətir (`version + 1`) və `effective_from` zaman damğası ilə qeydə alınır.
- Gələcək tarixli dəyişikliklər təyin edilə bilər. Cari vaxt üçün sorğu göndərildikdə yalnız `effective_from <= NOW()` şərtinə cavab verən ən son versiya aktiv sayılır.
- Keçmiş versiyaya qayıtmaq üçün `POST /api/v1/settings/restore` istifadə olunur (keçmiş dəyər yeni bir versiya nömrəsi ilə əlavə edilir).

---

## 3. Həssaslıq və Biznes Əsaslandırması (Sensitivity & Reason)

- Parametrlər 3 həssaslıq səviyyəsinə bölünür: `normal`, `sensitive`, `critical`.
- `sensitive` və ya `critical` parametrlər yenilənərkən sorğu gövdəsində (`request body`) **məcburi olaraq ən azı 3 simvolluq `reason` (əsaslandırma)** qeyd olunmalıdır.
- Səbəbsiz və ya natamam göndərilən sorğular `BusinessRuleViolationError` xətası ilə dərhal rədd edilir.

---

## 4. Qeydiyyatdan Keçmiş 12 Standart Parametr Açarı

| Açar (`key`) | Qrup | Tip | Əhatə Dairəsi | Həssaslıq | Məcburi Səbəb? | Təsvir |
|---|---|---|---|---|---|---|
| `currency_rounding` | finance | dict | company | sensitive | Bəli | Əsas valyuta (AZN), qəpik yuvarlaqlaşdırma qaydası və kəsr dəqiqliyi. |
| `tax_rates` | tax | list | company | critical | Bəli | ƏDV və aksiz faizləri (**İlkin olaraq boşdur!**). |
| `payment_methods` | pos | dict | company | sensitive | Bəli | Kassa ödəniş vasitələri (nağd, kart, hədiyyə kartı, nisyə) və mühasibat hesabları. |
| `discount_limits` | pos | dict | company | sensitive | Bəli | Rollar üzrə maksimal fərdi endirim faizləri (Kassir: 5%, Müdir: 20%, Baş Admin: 100%). |
| `return_rules` | pos | dict | company | sensitive | Bəli | Geri qaytarma müddəti (14 gün), qəbz tələbi və menecer təsdiq limiti. |
| `inventory_rules` | inventory | dict | branch | critical | Bəli | Mənfi stok siyasəti (`FORBIDDEN`, `WARNING`, `ALLOWED`) və maya dəyəri (COGS) metodu (`WEIGHTED_AVERAGE`, `FIFO`). |
| `loyalty_defaults` | marketing | dict | company | normal | Xeyr | Bonus xalların toplanma əmsalı, istifadə nisbəti və xalların etibarlılıq müddəti. |
| `security_policy` | security | dict | company | critical | Bəli | Yanlış cəhdlər limiti, bloklanma müddəti, şifrə tarixçəsi və minimal uzunluq. |
| `notification_defaults` | notifications | dict | company | normal | Xeyr | SMS, E-poçt, WhatsApp bildiriş kanallarının aktivliyi və avto-xəbərdarlıqlar. |
| `receipt_template` | pos | dict | branch | normal | Xeyr | Termal printer çeki eni (58/80mm), başlıq və sonluq mətnləri, loqo və barkod göstəriciləri. |
| `business_calendar` | hr | dict | company | normal | Xeyr | Standart iş günləri, istirahət günləri və rəsmi bayramlar siyahısı. |
| `retention_policies` | security | dict | company | critical | Bəli | GDPR/Fərdi məlumatların (PII) və audit qeydlərinin arxivdə saxlanma müddətləri. |

> [!IMPORTANT]
> **Vergi Dərəcələri Haqqında Hüquqi Xəbərdarlıq (Legal Disclaimer):**
> Heç bir hüquqi vergi faizi koda basdırılmayıb (`hardcoded`). `tax_rates` parametri standart olaraq boş siyahı (`[]`) kimi təyin edilib. Sistem administratoru Azərbaycan Respublikasının qüvvədə olan Vergi Məcəlləsinə əsasən vergi faizlərini parametrlər bölməsindən daxil etməli və audit üçün təsdiqləməlidir.

---

## 5. Səbəb Kodları (Reason Codes)

Sistem əməliyyatlarında (qaytarma, silinmə, kassa məxaric/məxaric, qalıq düzəlişi) istifadə üçün səbəb kodları təsnif edilmişdir:
- **Kateqoriyalar:** `returns`, `adjustments`, `discounts`, `cash_in_out`, `voids`.
- **Silinmə Qorunması:** Əgər səbəb kodu hər hansı bir sənəddə istifadə olunubsa (`usage_count > 0`), onun silinməsi bloklanır. İnzibatçı onu yalnız deaktiv edə bilər (`is_active=False`).

