"""Mərkəzləşdirilmiş Mesaj və Lokalizasiya Kataloqu.

Bütün xəta və bildiriş mesajları bu kataloqdan oxunur.
Defolt dil: Azərbaycan dili (az). Genişləndirilə bilən en və ru dəstəyi.
"""

from __future__ import annotations

MESSAGES: dict[str, dict[str, str]] = {
    "VALIDATION_ERROR": {
        "az": "Daxil edilən məlumatlarda uyğunsuzluq var.",
        "en": "The provided data failed validation.",
        "ru": "Введенные данные не прошли валидацию.",
    },
    "UNAUTHENTICATED": {
        "az": "Giriş tələb olunur. Sessiya tapılmadı və ya bitib.",
        "en": "Authentication required. Session is invalid or expired.",
        "ru": "Требуется аутентификация. Сессия недействительна или истекла.",
    },
    "FORBIDDEN": {
        "az": "Bu əməliyyatı icra etmək üçün icazəniz yoxdur.",
        "en": "You do not have permission to perform this action.",
        "ru": "У вас нет прав для выполнения этого действия.",
    },
    "NOT_FOUND": {
        "az": "Axtarılan resurs tapılmadı.",
        "en": "The requested resource was not found.",
        "ru": "Запрашиваемый ресурс не найден.",
    },
    "CONFLICT": {
        "az": "Məlumat bazasında konflikt baş verdi.",
        "en": "A state conflict occurred in the database.",
        "ru": "Произошел конфликт состояния в базе данных.",
    },
    "VERSION_CONFLICT": {
        "az": "Məlumat başqa istifadəçi tərəfindən yenilənib. Zəhmət olmasa səhifəni yeniləyin.",
        "en": "The record was updated by another user. Please refresh.",
        "ru": "Запись была обновлена другим пользователем. Пожалуйста, обновите страницу.",
    },
    "IDEMPOTENCY_IN_FLIGHT": {
        "az": "Eyni açarla başqa bir sorğu hazırda icra olunur. Zəhmət olmasa bir az gözləyin.",
        "en": "Another request with the same idempotency key is currently in progress.",
        "ru": "Другой запрос с таким же ключом идемпотентности уже выполняется.",
    },
    "IDEMPOTENCY_PAYLOAD_MISMATCH": {
        "az": "Eyni Idempotency-Key fərqli sorğu məzmunu üçün istifadə edilə bilməz.",
        "en": "The same idempotency key cannot be reused with a different payload.",
        "ru": "Один и тот же ключ идемпотентности не может использоваться с другим содержимым.",
    },
    "RATE_LIMITED": {
        "az": "Həddindən artıq çox sorğu göndərildi. Zəhmət olmasa gözləyin.",
        "en": "Too many requests. Please try again later.",
        "ru": "Слишком много запросов. Пожалуйста, повторите позже.",
    },
    "BUSINESS_RULE_VIOLATION": {
        "az": "Biznes qaydası pozuldu.",
        "en": "Business rule violation occurred.",
        "ru": "Нарушено бизнес-правило.",
    },
    "INTERNAL_SERVER_ERROR": {
        "az": "Gözlənilməz daxili server xətası baş verdi.",
        "en": "An unexpected internal server error occurred.",
        "ru": "Произошла непредвиденная внутренняя ошибка сервера.",
    },
    "INTEGRATION_NOT_CONFIGURED": {
        "az": "Tələb olunan xarici inteqrasiya sistemi konfiqurasiya edilməyib.",
        "en": "The required external integration is not configured.",
        "ru": "Требуемая внешняя интеграция не настроена.",
    },
    "INVALID_CREDENTIALS": {
        "az": "İstifadəçi adı və ya şifrə yanlışdır.",
        "en": "Invalid username or password.",
        "ru": "Неверное имя пользователя или пароль.",
    },
    "ACCOUNT_LOCKED": {
        "az": "Hesab ardıcıl uğursuz cəhdlərə görə müvəqqəti bloklanıb.",
        "en": "Account is temporarily locked due to failed login attempts.",
        "ru": "Учетная запись временно заблокирована из-за неудачных попыток входа.",
    },
    "ACCOUNT_SUSPENDED": {
        "az": "Hesab dayandırılıb. Zəhmət olmasa administratorla əlaqə saxlayın.",
        "en": "Account has been suspended. Please contact administrator.",
        "ru": "Учетная запись приостановлена. Пожалуйста, обратитесь к администратору.",
    },
    "ACCOUNT_NOT_ACTIVE": {
        "az": "Hesab aktiv deyil.",
        "en": "Account is not active.",
        "ru": "Учетная запись не активна.",
    },
    "MUST_CHANGE_PASSWORD": {
        "az": "Davam etmək üçün ilkin şifrənizi dəyişməlisiniz.",
        "en": "You must change your password to continue.",
        "ru": "Вы должны сменить пароль для продолжения.",
    },
    "PASSWORD_POLICY_VIOLATION": {
        "az": "Şifrə təhlükəsizlik siyasətinə uyğun deyil (uzunluq, böyük/kiçik hərf, rəqəm, simvol).",
        "en": "Password does not meet security policy requirements.",
        "ru": "Пароль не соответствует требованиям политики безопасности.",
    },
    "PASSWORD_IN_HISTORY": {
        "az": "Son istifadə edilmiş şifrələrdən birini təkrar istifadə edə bilməzsiniz.",
        "en": "You cannot reuse any of your recently used passwords.",
        "ru": "Вы не можете повторно использовать один из недавних паролей.",
    },
    "TOKEN_EXPIRED": {
        "az": "Doğrulama tokeninin vaxtı bitib.",
        "en": "The validation token has expired.",
        "ru": "Срок действия токена истек.",
    },
    "TOKEN_INVALID": {
        "az": "Doğrulama tokeni etibarsızdır.",
        "en": "The validation token is invalid.",
        "ru": "Недействительный токен валидации.",
    },
    "TOKEN_REUSE_DETECTED": {
        "az": "Köhnə sessiya tokeni istifadəsi aşkarlandı. Bütün aktiv sessiyalar dayandırıldı.",
        "en": "Token reuse detected. All active sessions have been revoked.",
        "ru": "Обнаружено повторное использование токена. Все сессии отозваны.",
    },
    "TWO_FACTOR_REQUIRED": {
        "az": "Girişi tamamlamaq üçün 2FA birdəfəlik təsdiq kodu tələb olunur.",
        "en": "Two-factor authentication code required to complete login.",
        "ru": "Для завершения входа требуется код двухфакторной аутентификации.",
    },
    "TWO_FACTOR_INVALID": {
        "az": "2FA birdəfəlik təsdiq kodu yanlışdır.",
        "en": "Invalid two-factor authentication code.",
        "ru": "Неверный код двухфакторной аутентификации.",
    },
    "TWO_FACTOR_NOT_ENABLED": {
        "az": "İki mərhələli təsdiqləmə (2FA) bu sistemdə aktivləşdirilməyib.",
        "en": "Two-factor authentication is not enabled on this system.",
        "ru": "Двухфакторная аутентификация не включена в этой системе.",
    },
    "MANAGER_PIN_INVALID": {
        "az": "Menecer PIN kodu yanlışdır və ya səlahiyyət çatışmır.",
        "en": "Invalid manager PIN or insufficient permissions.",
        "ru": "Неверный PIN-код менеджера или недостаточно прав.",
    },
    "MANAGER_APPROVAL_REQUIRED": {
        "az": "Bu əməliyyat üçün menecer təsdiq kodu tələb olunur.",
        "en": "Manager approval token required for this action.",
        "ru": "Для этого действия требуется подтверждение менеджера.",
    },
    "MANAGER_APPROVAL_EXPIRED": {
        "az": "Menecer təsdiq tokeninin müddəti bitib və ya artıq istifadə olunub.",
        "en": "Manager approval token is expired or has already been used.",
        "ru": "Токен подтверждения менеджера истек или уже использован.",
    },
    "LAST_ADMIN_PROTECTION": {
        "az": "Sistemdəki yeganə aktiv sistem administratorunu silmək və ya bloklamaq olmaz.",
        "en": "Cannot remove or deactivate the last system administrator.",
        "ru": "Невозможно удалить или деактивировать последнего системного администратора.",
    },
    "SEGREGATION_OF_DUTIES_CONFLICT": {
        "az": "Vəzifələrin bölünməsi qaydası: Eyni sənədi yaradan və təsdiq edən eyni şəxs ola bilməz.",
        "en": "Segregation of duties: The same user cannot create and approve this document.",
        "ru": "Разделение обязанностей: один пользователь не может создавать и утверждать документ.",
    },
    "CROSS_BRANCH_ACCESS_DENIED": {
        "az": "Təyin olunmamış filialın məlumatlarına müraciət qadağandır.",
        "en": "Access to unauthorized branch is denied.",
        "ru": "Доступ к неавторизованному филиалу запрещен.",
    },
    "AUDIT_IMMUTABLE_ERROR": {
        "az": "Audit hadisələrinin dəyişdirilməsi və ya silinməsi qəti qadağandır (İmmutable Audit).",
        "en": "Audit events cannot be modified or deleted.",
        "ru": "События аудита неизменяемы и не могут быть удалены.",
    },
    "SELF_ESCALATION_DENIED": {
        "az": "İstifadəçi öz səlahiyyətlərini və ya rollarını artıra bilməz.",
        "en": "Users cannot escalate their own permissions or roles.",
        "ru": "Пользователи не могут повышать свои собственные привилегии.",
    },
    "INSUFFICIENT_STOCK": {
        "az": "Tələb olunan miqdarda sərbəst stok qalığı yoxdur.",
        "en": "Insufficient available stock.",
        "ru": "Недостаточно доступного остатка товара.",
    },
    "STOCK_LEDGER_IMMUTABLE": {
        "az": "Stok hərəkətləri jurnalı dəyişdirilə və ya silinə bilməz. Düzəlişlər üçün kompensasiya sənədi tərtib edilməlidir.",
        "en": "Stock movements ledger is immutable and cannot be updated or deleted.",
        "ru": "Журнал движений склада неизменяем. Для исправления создайте компенсирующий документ.",
    },
    "NEGATIVE_STOCK_FORBIDDEN": {
        "az": "Mənfi stok qalığına icazə verilmir. Xüsusi icazə və səbəb qeyd edilməlidir.",
        "en": "Negative stock is forbidden without explicit permission and reason.",
        "ru": "Отрицательный остаток запрещен без специального разрешения и причины.",
    },
    "TRANSFER_INVALID_TRANSITION": {
        "az": "Transferin cari statusundan tələb olunan mərhələyə keçid mümkün deyil.",
        "en": "Invalid transfer state transition.",
        "ru": "Недопустимый переход статуса перемещения.",
    },
    "COUNT_SESSION_CLOSED": {
        "az": "Sayım sessiyası qapalı və ya təsdiqlənmişdir, əlavə sayım qəbul edilmir.",
        "en": "Count session is closed or already approved.",
        "ru": "Сессия подсчета закрыта или уже утверждена.",
    },
}


def get_message(
    key: str,
    locale: str | None = None,
    lang: str | None = None,
    **kwargs: str | int | float,
) -> str:
    """Açar sözə və dilə uyğun lokallaşdırılmış mesajı qaytarır."""
    selected = locale or lang or "az"
    loc = selected.lower()
    if loc not in ("az", "en", "ru"):
        loc = "az"

    translations = MESSAGES.get(key)
    if not translations:
        return key

    msg = translations.get(loc) or translations.get("az") or key
    if kwargs:
        try:
            return msg.format(**kwargs)
        except Exception:
            return msg
    return msg
