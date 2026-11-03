# BRAND HOUSE ERP — Təməl Konvensiyalar (Core Conventions)

> Bu sənəd Brand House ERP sistemində kodlaşdırma, verilənlər bazası təsvirləri, xəta idarəetməsi, maliyyə riyaziyyatı və təhlükəsizlik üzrə məcburi konvensiyaları müəyyən edir.

---

## 1. Verilənlər Bazası və Adlandırma Qaydaları (Database Naming)

PostgreSQL bazasında bütün obyektlər üçün standart SQLAlchemy `naming_convention` tətbiq edilir:

| Obyekt Növü | Format Şablonu | Nümunə |
| :--- | :--- | :--- |
| **Cədvəl Adları** | `snake_case`, cəm formada | `products`, `sales_orders`, `inventory_items` |
| **Sütun Adları** | `snake_case`, tək formada | `unit_price`, `branch_id`, `created_at` |
| **İndekslər** | `ix_%(column_0_label)s` | `ix_products_sku`, `ix_sales_orders_branch_id` |
| **Unikal Məhdudiyyət** | `uq_%(table_name)s_%(column_0_name)s` | `uq_users_email`, `uq_products_barcode` |
| **Yoxlama Məhdudiyyəti** | `ck_%(table_name)s_%(constraint_name)s`| `ck_money_positive_amount`, `ck_shifts_closed_after_opened` |
| **Xarici Açar (FK)** | `fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s` | `fk_orders_customer_id_customers` |
| **Əsas Açar (PK)** | `pk_%(table_name)s` | `pk_products`, `pk_audit_events` |

### Əsas Sütunlar (BaseMixin):
Hər bir cədvəl aşağıdakı baza sütunlarını ehtiva edir:
- `id: UUID`: UUIDv7 formatında, B-tree indekslərində zaman sıralaması ilə saxlanılır.
- `created_at: DateTime(timezone=True)`: Həmişə UTC zamanı ilə yazılır.
- `updated_at: DateTime(timezone=True)`: Hər yenilənmədə UTC ilə yenilənir.
- `created_by: UUID | None`: Əməliyyatı icra edən istifadəçi identifikatoru.
- `updated_by: UUID | None`: Son dəyişikliyi edən istifadəçi identifikatoru.
- `version: int`: Optimistic Concurrency üçün 1-dən başlayan tam ədəd.
- `is_deleted: bool`: Yalnız master data (məhsullar, filiallar, təchizatçılar) üçün soft-delete. **Maliyyə və satış tranzaksiyalarında heç vaxt silinmə tətbiq olunmur.**

---

## 2. Maliyyə və Kəmiyyət Qaydaları (Money & Quantities)

### Pul (Money Value Object):
1. **Verilənlər Bazası:** `NUMERIC(14,2)` — 12 rəqəm tam, 2 rəqəm qəpik (maksimum: `999,999,999,999.99 AZN`).
2. **Python Tipi:** `Decimal`. **FLOAT VƏ YA DOUBLE QƏTİYYƏN QADAĞANDIR.**
3. **Valyuta Təhlükəsizliyi:** Pul dəyərləri `Money(amount=Decimal("120.50"), currency="AZN")` obyektində saxlanılır. Fərqli valyutalar arasında birbaşa toplama/çıxma `CurrencyMismatchError` atır.
4. **Yuvarlaqlaşdırma:** `ROUND_HALF_UP` qaydası tətbiq olunur.
5. **Qəpik İtkisinin Qarşısının Alınması (Largest Remainder Allocation):**
   Ümumi endirim və ya vergi məbləğləri çek sətirləri arasında bölünərkən qəpik itkisi olmamalıdır (`sum(allocated_parts) == total_amount`).

### Kəmiyyətlər (Quantities):
Pərakəndə satışda (geyim, ayaqqabı, aksesuarlar) ədədlə olan məhsullar tam ədəd (`int`) kimi saxlanılır. Gələcək parça və ya çəki məhsulları üçün konfiqurasiya edilə bilən dəqiqlik strukturu saxlanılır.

---

## 3. Vahid API Xəta Zərfi (Error Envelope)

Bütün xəta cavabları vahid strukturda qaytarılır:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Daxil edilən məlumatlarda uyğunsuzluq var",
    "details": [
      {
        "field": "amount",
        "message": "Məbləğ sıfırdan böyük olmalıdır",
        "type": "value_error"
      }
    ],
    "correlation_id": "018f9e61-7e8c-71b3-a3d2-4e6f9d45e123"
  }
}
```

### Xəta Kodları Kataloqu:
| Xəta Kodu | HTTP Status | İzahı |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | `422` | Daxil edilən sorğu parametr və ya body məlumatlarında uyğunsuzluq |
| `UNAUTHENTICATED` | `401` | Giriş edilməyib və ya sessiya tokeni etibarsızdır |
| `FORBIDDEN` | `403` | Əməliyyat üçün icazə və ya filial hüququ çatmır |
| `NOT_FOUND` | `404` | Axtarılan resurs tapılmadı |
| `CONFLICT` | `409` | Unikal sahə toqquşması və ya vəziyyət uyğunsuzluğu |
| `VERSION_CONFLICT` | `409` | Optimistic locking uyğunsuzluğu (başqa istifadəçi sənədi yeniləyib) |
| `IDEMPOTENCY_IN_FLIGHT`| `409` | Eyni açarla başqa bir sorğu hazırda icra olunur (Retry-After) |
| `IDEMPOTENCY_PAYLOAD_MISMATCH`| `422 / 409` | Eyni Idempotency-Key ilə fərqli payload göndərilib |
| `RATE_LIMITED` | `429` | Həddindən artıq çox sorğu göndərilib |
| `BUSINESS_RULE_VIOLATION` | `422` | Biznes qaydası pozuntusu (məs. kassa bağlıdır, qalıq çatmır) |
| `INTERNAL_SERVER_ERROR` | `500` | Gözlənilməz server xətası (müştəriyə stack trace verilmir) |

---

## 4. İdempotentlik Qaydaları (Idempotency)

Maliyyə, satış, kassa və ödəniş əməliyyatlarında şəbəkə kəsilmələri zamanı təkrar çəkilmələrin qarşısını almaq üçün `Idempotency-Key` HTTP başlığı tətbiq edilir:

1. **İlkin Sorğu:** Açar bazada `idempotency_keys` cədvəlində `IN_PROGRESS` statusu ilə qeyd edilir, sorğu icra olunur, cavab statusu və body-si bazaya yazılır və status `COMPLETED` edilir.
2. **Eyni Açar + Eyni Payload:** Əgər eyni açarla eyni sorğu təkrar gələrsə, biznes məntiqi təkrar icra olunmur; saxlanılmış əvvəlki cavab `X-Idempotent-Replay: true` başlığı ilə dərhal qaytarılır.
3. **Eyni Açar + Fərqli Payload:** `422 Unprocessable Entity` qaytarılır (`"Eyni açar fərqli sorğu üçün istifadə edilə bilməz"`).
4. **Paralel Sorğular (In-flight):** Eyni anda daxil olan dublikat sorğuya `409 Conflict` və `Retry-After: 2` başlığı qaytarılır.
5. **Saxlanma Müddəti (TTL):** Açarlar 24 saat qüvvədə qalır və dövri işçi tərəfindən təmizlənir.

---

## 5. Səhifələmə, Filtrasiya və Çeşidləmə (Pagination)

Frontend `FilterBar` komponenti ilə 100% uyğun parametrlər:
- `branch_id: UUID | None`: Filial üzrə filtrasiya.
- `date_from: datetime | None`, `date_to: datetime | None`: Tarix aralığı.
- `q: str | None`: Axtarış açar sözü.
- `status: str | None`: Vəziyyət filtri.
- `page: int = 1`, `page_size: int = 20`: Standart səhifələmə.
- `sort: str | None`: Məsələn: `created_at:desc` və ya `-created_at`.
- **Təhlükəsizlik:** Sütun adları birbaşa SQL-ə ötürülmür; yalnız repozitoriyada təsdiqlənmiş (whitelist) sütunlara çeşidləmə tətbiq olunur.

---

## 6. Zaman və Saat Qurşağı Konvensiyası (Time & Timezone)

1. **Daxili və Baza Yaddaşı:** Sistem daxilində və PostgreSQL-də bütün zaman damğaları **UTC** olaraq saxlanılır (`timezone=True`).
2. **Biznes Saat Qurşağı:** Azərbaycan üzrə rəsmi biznes saat qurşağı `Asia/Baku` (UTC+4)-dür.
3. **İnyeksiya Edilə Bilən Saat (Clock):** Testlərdə zamanı dondurmaq və gələcəyə çəkmək üçün `Clock` protokolu (`SystemClock` və `FrozenClock`) istifadə olunur. `datetime.now()` birbaşa çağırılmır.

---

## 7. İnteqrasiya Statusları və "NOT CONFIGURED" Obyekti

Kənar xidmətlər (Ödəniş qapısı, SMS/Email provayderi, Fiskal printer, Brendhouse.az API) üçün konfiqurasiya yoxdursa, heç vaxt uğurlu imitasiya göstərilmir. `/api/v1/integrations/status` endpoint-i vasitəsilə aydın vəziyyət obyekti qaytarılır:
```json
{
  "payment_provider": {
    "status": "NOT CONFIGURED",
    "configured": false,
    "provider": null,
    "missing_keys": ["PAYMENT_PROVIDER_API_KEY", "PAYMENT_PROVIDER_MERCHANT_ID"]
  }
}
```

