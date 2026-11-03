# Əməliyyat Təlimatı: Təcili Giriş (Break-Glass Emergency Access Protocol)

## 1. Məqsəd
Sistem administratorlarının əlçatmaz olduğu kritik insidentlər (məsələn, kütləvi xidmət dayanması, bazanın bərpası, kiberhücum) zamanı qəza rejimində sistemə daxil olmaq üçün fövqəladə protokol.

---

## 2. Break-Glass Hesabının Xüsusiyyətləri
- İstifadəçi adı: `break_glass_admin`
- Saxlanma yeri: Şirkətin fiziki seyfində və xüsusi şifrələnmiş parol anbarında (HashiCorp Vault / 1Password Break-Glass Vault).
- Normal şəraitdə: Hesab deaktivdir (`is_active = False`).
- Aktivləşmə müddəti: Maksimum 4 saat (avtomatik deaktivasiya).

---

## 3. Aktivləşdirmə Proseduru

1. **İki Nəfərlik Təsdiq (Two-Person Rule)**:
   - Ən azı iki səlahiyyətli rəhbər (Texniki Direktor və Əməliyyat Direktoru) aktivləşdirməyə yazılı razılıq verir.
2. **Hesabın Aktivləşdirilməsi (CLI vasitəsilə)**:
   ```bash
   python -m scripts.emergency_unlock --user break_glass_admin --duration-hours 4 --ticket "INC-1092"
   ```
3. **Avtomatik Xəbərdarlıq**:
   - Hesab aktivləşdirilən anda təhlükəsizlik komandasına və rəhbərliyə SMS və E-poçt siqnalı göndərilir.
4. **Audit Qeydləri**:
   - `break_glass_admin` tərəfindən icra edilən hər bir HTTP sorğusu və verilənlər bazası əmri xüsusi prioritetlə audit zəncirinə tikilir.

---

## 4. İnsident Sonrası Post-Mortem
İnsident aradan qaldırıldıqdan dərhal sonra:
1. Hesabın şifrəsi rotasiya olunur.
2. Hesab deaktiv edilir.
3. 24 saat ərzində tam daxili təftiş hesabatı hazırlanır.

