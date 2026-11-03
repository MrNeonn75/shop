"""Sazlamalar Reyestri (Typed Settings Registry).

Bütün sistem parametrlərinin açarları, tipləri, standart dəyərləri, tətbiq dairəsi
(şirkət / filial / rol), həssaslıq səviyyəsi və əsaslandırma tələbi burada təyin olunur.
Qeyd: Heç bir hüquqi vergi dərəcəsi birbaşa koda daxil edilməyib, inzibatçı tərəfindən
təyin edilməli və Azərbaycan qanunvericiliyinə uyğunluğu təsdiqlənməlidir.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


@dataclass(frozen=True)
class SettingDefinition:
    """Tək bir parametr təyinatı."""

    key: str
    group: str
    type_name: str  # "dict", "list", "str", "int", "float", "bool"
    default_value: Any
    scope: Literal["company", "branch", "role"]
    sensitivity: Literal["normal", "sensitive", "critical"]
    description_az: str
    requires_reason: bool = False


SETTINGS_REGISTRY: dict[str, SettingDefinition] = {
    # 1. Valyuta və Yuvarlaqlaşdırma
    "currency_rounding": SettingDefinition(
        key="currency_rounding",
        group="finance",
        type_name="dict",
        default_value={
            "default_currency": "AZN",
            "rounding_mode": "ROUND_HALF_UP",
            "fraction_digits": 2,
            "display_symbol": "₼",
        },
        scope="company",
        sensitivity="sensitive",
        description_az="Əsas valyuta və maliyyə qəpik yuvarlaqlaşdırma qaydaları",
        requires_reason=True,
    ),
    # 2. Vergi Dərəcələri və Təsnifatı (Boş ilkin dəyər - inzibatçı təyin etməlidir)
    "tax_rates": SettingDefinition(
        key="tax_rates",
        group="tax",
        type_name="list",
        default_value=[],  # Boşdur. İnzibatçı tərəfindən AR Vergi Məcəlləsinə uyğun doldurulmalıdır.
        scope="company",
        sensitivity="critical",
        description_az=(
            "ƏDV və aksiz dərəcələri (İlkin olaraq boşdur. Tətbiq edilən dərəcələr "
            "Azərbaycan Respublikasının qüvvədə olan Vergi Məcəlləsinə uyğunlaşdırılmalıdır)."
        ),
        requires_reason=True,
    ),
    # 3. Ödəniş Metodları
    "payment_methods": SettingDefinition(
        key="payment_methods",
        group="pos",
        type_name="dict",
        default_value={
            "cash": {"enabled": True, "label_az": "Nağd", "account_ref": "ACC-CASH"},
            "card": {"enabled": True, "label_az": "Bank Kartı", "account_ref": "ACC-CARD"},
            "gift_card": {"enabled": False, "label_az": "Hədiyyə Kartı", "account_ref": None},
            "credit": {"enabled": False, "label_az": "Nisyə Satış", "account_ref": None},
        },
        scope="company",
        sensitivity="sensitive",
        description_az="Aktiv kassa ödəniş vasitələri və mühasibat hesablaşma xəritəsi",
        requires_reason=True,
    ),
    # 4. Rollar Üzrə Endirim Limitləri
    "discount_limits": SettingDefinition(
        key="discount_limits",
        group="pos",
        type_name="dict",
        default_value={
            "cashier": 5.0,
            "branch_manager": 20.0,
            "general_manager": 50.0,
            "system_admin": 100.0,
        },
        scope="company",
        sensitivity="sensitive",
        description_az="Vəzifələr üzrə satış zamanı tətbiq edilə bilən maksimal fərdi endirim faizi",
        requires_reason=True,
    ),
    # 5. Qaytarma və Müştəri Xidməti Qaydaları
    "return_rules": SettingDefinition(
        key="return_rules",
        group="pos",
        type_name="dict",
        default_value={
            "window_days": 14,
            "receipt_required": True,
            "manager_approval_threshold_azn": 500.0,
            "allow_without_receipt": False,
        },
        scope="company",
        sensitivity="sensitive",
        description_az="Məhsulun geri qaytarılma müddəti və təsdiq limitləri",
        requires_reason=True,
    ),
    # 6. İnventar və Anbar Qaydaları
    "inventory_rules": SettingDefinition(
        key="inventory_rules",
        group="inventory",
        type_name="dict",
        default_value={
            "negative_stock_policy": "FORBIDDEN",  # FORBIDDEN, WARNING, ALLOWED
            "cogs_method": "WEIGHTED_AVERAGE",  # WEIGHTED_AVERAGE, FIFO
            "valuation_display": True,
            "low_stock_threshold_default": 5,
        },
        scope="branch",  # Filial səviyyəsində override edilə bilər
        sensitivity="critical",
        description_az="Mənfi qalıq siyasəti və maya dəyərinin (COGS) hesablanma metodu",
        requires_reason=True,
    ),
    # 7. Sadiqlik (Loyalty) Proqramı Sazlamaları
    "loyalty_defaults": SettingDefinition(
        key="loyalty_defaults",
        group="marketing",
        type_name="dict",
        default_value={
            "points_earn_ratio": 0.01,  # Hər 1 AZN-ə 1 qəpik (1%)
            "points_redeem_ratio": 1.0,  # 1 bonus xal = 1 AZN
            "min_points_to_redeem": 100,
            "expiration_months": 12,
        },
        scope="company",
        sensitivity="normal",
        description_az="Bonus xalların toplanması və ödənişdə istifadə qaydaları",
        requires_reason=False,
    ),
    # 8. Təhlükəsizlik Siyasəti Parametrləri
    "security_policy": SettingDefinition(
        key="security_policy",
        group="security",
        type_name="dict",
        default_value={
            "max_login_attempts": 5,
            "lockout_duration_minutes": 15,
            "password_history_count": 5,
            "password_min_length": 8,
            "session_expire_days": 14,
            "require_2fa_for_admins": False,
        },
        scope="company",
        sensitivity="critical",
        description_az="Hesab bloklanması, şifrə mürəkkəbliyi və sessiya müddətləri",
        requires_reason=True,
    ),
    # 9. Bildiriş Kanalları Sazlamaları
    "notification_defaults": SettingDefinition(
        key="notification_defaults",
        group="notifications",
        type_name="dict",
        default_value={
            "sms_enabled": False,
            "email_enabled": False,
            "whatsapp_enabled": False,
            "notify_low_stock": True,
            "notify_manager_on_large_refund": True,
        },
        scope="company",
        sensitivity="normal",
        description_az="Avtomatik bildiriş kanalları və hadisə tətikləyiciləri",
        requires_reason=False,
    ),
    # 10. Çek Şablonu Konfiqurasiyası
    "receipt_template": SettingDefinition(
        key="receipt_template",
        group="pos",
        type_name="dict",
        default_value={
            "paper_width_mm": 80,  # 58 və ya 80
            "header_text": "BRAND HOUSE\nModa və Stil Mərkəzi",
            "footer_text": "Bizi seçdiyiniz üçün təşəkkür edirik!\nMalın dəyişdirilməsi 14 gün ərzində qəbzlə mümkündür.",
            "show_logo": True,
            "show_tax_id": True,
            "show_cashier_name": True,
            "show_barcode": True,
        },
        scope="branch",  # Filial səviyyəsində filial ünvanı üçün dəyişdirilə bilər
        sensitivity="normal",
        description_az="Termal kassa çeki formatı, eni və başlıq/sonluq mətnləri",
        requires_reason=False,
    ),
    # 11. İş Təqvimi və Bayramlar
    "business_calendar": SettingDefinition(
        key="business_calendar",
        group="hr",
        type_name="dict",
        default_value={
            "standard_workdays": [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
            ],
            "weekend_days": ["sunday"],
            "official_holidays": [],  # Tənzimlənə bilən, heç bir bayram koda basdırılmayıb
        },
        scope="company",
        sensitivity="normal",
        description_az="Həftəlik iş günləri və təsdiq olunmuş qeyri-iş günləri təqvimi",
        requires_reason=False,
    ),
    # 12. Fərdi Məlumatların Saxlanması (PII Retention) Siyasəti
    "retention_policies": SettingDefinition(
        key="retention_policies",
        group="security",
        type_name="dict",
        default_value={
            "pii_retention_days": 1095,  # 3 il
            "audit_log_retention_days": 1825,  # 5 il
            "inactive_customer_anonymize_days": 730,  # 2 il
        },
        scope="company",
        sensitivity="critical",
        description_az="Fərdi məlumatların və audit hadisələrinin arxivdə saxlanma müddəti",
        requires_reason=True,
    ),
    # 13. Satınalma və Qəbul Dözümlülük (Tolerances) Parametrləri
    "purchasing_tolerances": SettingDefinition(
        key="purchasing_tolerances",
        group="purchasing",
        type_name="dict",
        default_value={
            "over_receipt_tolerance_percent": 5.0,  # Sifarişdən artıq qəbul limiti (%)
            "price_variance_tolerance_percent": 2.0,  # 3-tərəfli uyğunluqda qiymət fərqi (%)
            "price_variance_tolerance_absolute": 5.0,  # Mütləq qiymət fərqi limiti (AZN)
            "quantity_variance_tolerance_percent": 0.0,  # Miqdar fərqi limiti (%)
        },
        scope="company",
        sensitivity="sensitive",
        description_az="Satınalma sifarişlərinin qəbulu və 3-tərəfli faktura uyğunlaşdırılması üçün dözümlülük hədləri",
        requires_reason=True,
    ),
    # 14. Satınalma İdarəetmə və Təsdiq Qaydaları
    "purchasing_rules": SettingDefinition(
        key="purchasing_rules",
        group="purchasing",
        type_name="dict",
        default_value={
            "payment_approval_threshold": 5000.0,  # Xüsusi təsdiq tələb edən ödəniş həddi
            "po_revision_approval_threshold_percent": 5.0,  # Düzəlişdə yenidən təsdiq faizi
            "three_way_match_strict": True,
        },
        scope="company",
        sensitivity="sensitive",
        description_az="Satınalma ödənişləri və sifariş reviziyaları üzrə limitlər",
        requires_reason=True,
    ),
    # 15. POS Kassa və Növbə Qaydaları
    "pos_rules": SettingDefinition(
        key="pos_rules",
        group="pos",
        type_name="dict",
        default_value={
            "expected_float_azn": 100.0,
            "over_short_tolerance_azn": 5.0,
            "max_cash_in_drawer_azn": 2000.0,
            "manager_approval_cash_movement_threshold": 200.0,
            "cart_auto_expire_hours": 24,
            "single_open_shift_per_cashier": True,
            "fiscal_service_mode": "NOT_CONFIGURED",
            "card_provider_mode": "NOT_CONFIGURED",
            "external_terminal_enabled": True,
            "fraud_void_rate_threshold": 0.10,
            "fraud_discount_rate_threshold": 0.20,
            "fraud_variance_threshold_azn": 20.0,
        },
        scope="branch",
        sensitivity="sensitive",
        description_az="Kassa növbələri, qalıq fərqi dözümlülüyü, avtomatik ləğv və fırıldaqçılıq hədləri",
        requires_reason=True,
    ),
    # 16. Maliyyə və Baş Mühasibat Kitabı (General Ledger & Finance Rules)
    "finance_rules": SettingDefinition(
        key="finance_rules",
        group="finance",
        type_name="dict",
        default_value={
            "gl_enabled": False,  # Baş kitab (GL) standart olaraq deaktivdir
            "credit_sales_enabled": False,  # Korporativ nisyə satışlar standart olaraq deaktivdir
            "cash_over_short_category_code": "EXP-OVER-SHORT",
            "reconciliation_tolerance_days": 3,
            "costing_method": "FIFO",  # Maya dəyəri metodu: FIFO və ya SPECIFIC
            "default_expense_approval_threshold": 500.0,
            "period_auto_lock_days": 5,
        },
        scope="company",
        sensitivity="critical",
        description_az="Maliyyə modulu, GL inteqrasiyası, nisyə satışlar və dövriyyə qaydaları",
        requires_reason=True,
    ),
}
