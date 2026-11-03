"""Ping Modulu ORM Modeli."""

from __future__ import annotations

import uuid

from sqlalchemy import String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, BaseMixin


class PingLog(Base, BaseMixin):
    """Nümunə Ping qeydləri cədvəli."""

    __tablename__ = "ping_logs"

    message: Mapped[str] = mapped_column(String(255), nullable=False)
    client_ip: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
