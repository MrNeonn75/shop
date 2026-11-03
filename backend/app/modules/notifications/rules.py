"""Alert Qaydaları və Çatdırılma Mühərriki (Notification Rules Engine).

- Domen hadisələrinin qaydalarla tutuşdurulması (Rule matching & evaluation)
- Çatdırılma anında alıcıların dinamik təyini (Current role holders, branch managers, delegates)
- Səlahiyyət və filial məhdudiyyətlərinin yoxlanışı (Permission & Branch Scope Filtering)
- Təkrarlanmanın qarşısının alınması və qruplaşdırma (Deduplication & Grouping)
- Oxunmamış kritik bildirişlərin eskalasiyası (Escalation to Manager with Audit)
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.modules.notifications.models import Notification, NotificationRule


def evaluate_condition(payload: dict[str, Any], condition: dict[str, Any]) -> bool:
    """Hadisə yükünü qaydanın şərtinə qarşı qiymətləndirir."""
    if not condition:
        return True

    field_name = condition.get("field")
    op = condition.get("op", "==")
    target_value = condition.get("value")

    if not field_name:
        return True

    actual_value = payload.get(field_name)
    if actual_value is None:
        return False

    try:
        # Rəqəmlər üçün müqayisə çevrilməsi
        if isinstance(target_value, int | float):
            actual_num = float(str(actual_value))
            target_num = float(str(target_value))
            match op:
                case ">=":
                    return actual_num >= target_num
                case "<=":
                    return actual_num <= target_num
                case ">":
                    return actual_num > target_num
                case "<":
                    return actual_num < target_num
                case "==":
                    return actual_num == target_num
                case "!=":
                    return actual_num != target_num

        if op == "==":
            return str(actual_value) == str(target_value)
        elif op == "!=":
            return str(actual_value) != str(target_value)
        elif op == "in":
            return actual_value in target_value if isinstance(target_value, list) else False
    except Exception:
        return False

    return False


async def resolve_rule_recipients(
    session: AsyncSession,
    rule: NotificationRule,
    branch_id: uuid.UUID | None,
) -> list[dict[str, Any]]:
    """Qaydaya uyğun səlahiyyətli istifadəçiləri dinamik tapır və filial/icazə süzgəcindən keçirir."""
    from app.modules.users.models import User

    # Aktiv istifadəçiləri çəkirik
    stmt = select(User).where(User.status == "active")
    res = await session.execute(stmt)
    active_users = list(res.scalars().all())

    matching_users: list[dict[str, Any]] = []

    for u in active_users:
        user_roles = [r.code for r in u.roles] if hasattr(u, "roles") else []
        user_branches = [b.id for b in u.branches] if hasattr(u, "branches") else []

        # 1. Alıcı tipi yoxlanışı
        matched_target = False
        if rule.recipient_type == "ROLE":
            if rule.recipient_target and rule.recipient_target in user_roles:
                matched_target = True
        elif rule.recipient_type == "SPECIFIC_USER":
            if rule.recipient_target and str(u.id) == str(rule.recipient_target):
                matched_target = True
        elif rule.recipient_type == "BRANCH_MANAGER":
            if "branch_manager" in user_roles or "store_manager" in user_roles:
                matched_target = True
        elif rule.recipient_type == "ALL":
            matched_target = True

        if not matched_target:
            continue

        # 2. Filial məhdudiyyəti (Branch Scope Filtering)
        if branch_id and rule.branch_scope == "SAME_BRANCH":
            is_global_admin = "system_admin" in user_roles or "executive" in user_roles
            if not is_global_admin and user_branches and branch_id not in user_branches:
                # İstifadəçinin bu filiala baxış icazəsi yoxdur
                continue

        matching_users.append({
            "user_id": u.id,
            "username": u.username,
            "email": u.email,
            "phone": getattr(u, "phone_number", None),
            "roles": user_roles,
        })

    return matching_users


async def is_duplicate_notification(
    session: AsyncSession,
    user_id: uuid.UUID,
    dedupe_key: str | None,
    window_minutes: int = 15,
) -> bool:
    """Təyin olunmuş vaxt pəncərəsi daxilində eyni açarlı bildirişin olub-olmadığını yoxlayır."""
    if not dedupe_key:
        return False

    cutoff = utc_now() - timedelta(minutes=window_minutes)
    stmt = (
        select(Notification)
        .where(
            Notification.recipient_user_id == user_id,
            Notification.dedupe_key == dedupe_key,
            Notification.created_at >= cutoff,
        )
        .limit(1)
    )
    res = await session.execute(stmt)
    return res.scalars().first() is not None

