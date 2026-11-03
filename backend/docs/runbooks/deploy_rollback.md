# Əməliyyat Təlimatı: İstehsalata Yerləşdirmə və Geri Qaytarma (Deploy & Rollback Runbook)

## 1. Məqsəd və Prinsiplər
Bu təlimat Brand House ERP backend sisteminin sıfır dayanma vaxtı (Zero-Downtime Deployment) ilə istehsalata buraxılması və kritik nasazlıq zamanı təhlükəsiz geri qaytarılması (Rollback) qaydalarını müəyyən edir.

---

## 2. Sıfır Dayanma Vaxtı ilə Yerləşdirmə (Zero-Downtime Deploy)

### Addım 1: Pre-flight Yoxlamaları
```bash
# 1. CI/CD statusunu yoxlayın (Bütün testlər və linternlər yaşıl olmalıdır)
# 2. İnvariant yoxlayıcını işə salın
erp verify

# 3. Bazanın son ehtiyat nüsxəsini təsdiqləyin
python scripts/restore_test.py
```

### Addım 2: Məlumat Bazasının İrəli Miqrasiyası (Expand Phase)
Sistem **Expand/Contract** miqrasiya modelinə riayət edir. Sütunların silinməsi və ya adının dəyişdirilməsi YALNIZ iki reliz arasında həyata keçirilir.
```bash
# Kilidlənmələrin qarşısını almaq üçün lock_timeout sazlaması ilə miqrasiya
alembic upgrade head
```

### Addım 3: Rolling Restart (Tətbiq Konteynerləri)
```bash
# Konteynerlərin ardıcıl yenilənməsi
docker compose up -d --no-deps --build app
# və ya Kubernetes mühitində:
kubectl rollout restart deployment/brand-house-backend
kubectl rollout status deployment/brand-house-backend
```

### Addım 4: Post-deployment Yoxlaması
```bash
# Sağlamlıq marşrutu yoxlanışı
curl -f http://localhost:8000/health
curl -f http://localhost:8000/health/ready
```

---

## 3. Təcili Geri Qaytarma Proseduru (Emergency Rollback)

Əgər relizdən sonra kritik xətalar (HTTP 500 artımı > 1%, kassa checkout uğursuzluğu) baş verərsə:

1. **Dərhal Əvvəlki İmajı Aktivləşdirin:**
   ```bash
   # Əvvəlki stabil teqə qayıdış
   docker compose down app
   docker compose up -d app:previous_stable_tag
   ```
2. **Miqrasiyanın Geri Qaytarılması (Yalnız zərurət olduqda):**
   ```bash
   # Əgər cari reliz yeni sxem yaratmışdısa:
   alembic downgrade -1
   ```
3. **Məlumat Tamlığının Yoxlanılması:**
   ```bash
   erp verify
   ```
4. **İnsident Qeydiyyatı:**
   - Hadisənin səbəbini və təsirə məruz qalan kassa çeklərini qeyd edin.

