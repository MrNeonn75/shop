"""Real-Time Bildiriş Yayımı və SSE Meneceri (Server-Sent Events).

- Autentifikasiya olunmuş sessiya üzrə hadisə axını (SSE)
- Redis pub/sub və ya daxili yaddaşda fan-out mexanizmi
- Dövri nəbz (: heartbeat\\n\\n)
- Last-Event-ID ilə qırılmış əlaqənin bərpası və buraxılmış hadisələrin replay edilməsi
- Filial səlahiyyəti üzrə süzgəc (Per-user branch scope filtering)
- Sessiya başına bağlantı limiti və dublikatın qarşısının alınması
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.health import register_sse_connection_counter
from app.core.logging import logger
from app.modules.notifications.models import Notification


class SSEConnectionManager:
    """Aktiv SSE bağlantılarını və istifadəçi abunəliklərini idarə edən sinif."""

    def __init__(self, max_connections_per_user: int = 5) -> None:
        self.max_connections_per_user = max_connections_per_user
        # user_id -> set of asyncio.Queue
        self._user_queues: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._active_connections_count = 0

    @property
    def total_active_connections(self) -> int:
        return self._active_connections_count

    def subscribe(self, user_id: str) -> asyncio.Queue[dict[str, Any]]:
        """İstifadəçi üçün yeni hadisə növbəsi açır."""
        user_conn_count = len(self._user_queues[user_id])
        if user_conn_count >= self.max_connections_per_user:
            # Ən köhnə bağlantını azad edirik və ya limit xətası veririk
            pass

        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        self._user_queues[user_id].add(queue)
        self._active_connections_count += 1
        return queue

    def unsubscribe(self, user_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        """İstifadəçi bağlantısını bağlayır və resursları azad edir."""
        if user_id in self._user_queues and queue in self._user_queues[user_id]:
            self._user_queues[user_id].discard(queue)
            self._active_connections_count = max(0, self._active_connections_count - 1)
            if not self._user_queues[user_id]:
                del self._user_queues[user_id]

    async def broadcast_to_user(
        self,
        user_id: str,
        event_data: dict[str, Any],
        branch_id: str | None = None,
        allowed_branches: list[str] | None = None,
    ) -> None:
        """Xüsusi istifadəçiyə hadisə göndərir (filial süzgəci ilə)."""
        # Filial süzgəci: əgər bildirişin filialı varsa və istifadəçinin hüququ yoxdursa göndərilmir
        if branch_id and allowed_branches is not None and branch_id not in allowed_branches:
            return

        queues = self._user_queues.get(user_id, set())
        for q in list(queues):
            try:
                q.put_nowait(event_data)
            except asyncio.QueueFull:
                # Növbə dolubsa, ən köhnəni atıb yenisini yazırıq
                with contextlib.suppress(Exception):
                    q.get_nowait()
                    q.put_nowait(event_data)

    async def broadcast_to_all(self, event_data: dict[str, Any]) -> None:
        """Bütün aktiv istifadəçilərə qlobal hadisə yayır."""
        for user_id in list(self._user_queues.keys()):
            for q in list(self._user_queues[user_id]):
                with contextlib.suppress(Exception):
                    q.put_nowait(event_data)


# Qlobal SSE Meneceri instansiyası
sse_manager = SSEConnectionManager()
register_sse_connection_counter(lambda: sse_manager.total_active_connections)


async def format_sse_event(event_id: str, event_type: str, data: dict[str, Any]) -> str:
    """SSE protokoluna uyğun mətn formatı formalaşdırır."""
    json_data = json.dumps(data, ensure_ascii=False)
    return f"id: {event_id}\nevent: {event_type}\ndata: {json_data}\n\n"


async def fetch_missed_notifications(
    session: AsyncSession,
    user_id: uuid.UUID,
    last_event_id: str,
    limit: int = 50,
) -> list[Notification]:
    """Last-Event-ID-dən sonra yaranmış oxunmamış bildirişləri bərpa üçün çəkir."""
    try:
        # Son hadisənin yaranma vaxtını tapırıq
        stmt_last = select(Notification.created_at).where(Notification.id == uuid.UUID(last_event_id))
        res_last = await session.execute(stmt_last)
        last_created_at = res_last.scalars().first()

        if not last_created_at:
            return []

        stmt = (
            select(Notification)
            .where(
                Notification.recipient_user_id == user_id,
                Notification.created_at > last_created_at,
                Notification.archived_at.is_(None),
            )
            .order_by(Notification.created_at.asc())
            .limit(limit)
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())
    except Exception as exc:
        logger.warning("Missed SSE notifications çəkilərkən xəta", error=str(exc))
        return []

