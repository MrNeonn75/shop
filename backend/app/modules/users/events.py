"""İstifadəçilər Modulu Domen Hadisələri (Users Domain Events)."""

from __future__ import annotations

import uuid

from app.shared.events import DomainEvent


class UserCreatedEvent(DomainEvent):
    """Yeni istifadəçi qeydiyyatdan keçdikdə yaranır."""

    def __init__(self, user_id: uuid.UUID, username: str, email: str, full_name: str) -> None:
        super().__init__(
            event_type="users.user.created",
            aggregate_type="user",
            aggregate_id=str(user_id),
            payload={
                "user_id": str(user_id),
                "username": username,
                "email": email,
                "full_name": full_name,
            },
        )


class UserStatusChangedEvent(DomainEvent):
    """İstifadəçi statusu dəyişdirildikdə (aktiv, dayandırılmış və s.) yaranır."""

    def __init__(
        self,
        user_id: uuid.UUID,
        old_status: str,
        new_status: str,
        reason: str | None = None,
    ) -> None:
        super().__init__(
            event_type="users.user.status_changed",
            aggregate_type="user",
            aggregate_id=str(user_id),
            payload={
                "user_id": str(user_id),
                "old_status": old_status,
                "new_status": new_status,
                "reason": reason,
            },
        )


class UserPasswordChangedEvent(DomainEvent):
    """İstifadəçi şifrəsini dəyişdikdə və ya sıfırlandıqda yaranır."""

    def __init__(self, user_id: uuid.UUID, forced: bool = False) -> None:
        super().__init__(
            event_type="users.user.password_changed",
            aggregate_type="user",
            aggregate_id=str(user_id),
            payload={
                "user_id": str(user_id),
                "forced": forced,
            },
        )
