"""Autentifikasiya Modulu ORM Modelləri (Auth Models).

Şifrə bərpa tokenləri və Menecer təsdiq tokenləri.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, BaseMixin


class PasswordResetToken(Base, BaseMixin):
    """Bir dəfəlik şifrə sıfırlama tokeni cədvəli."""

    __tablename__ = "password_reset_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        doc="SHA-256 ilə heşlənmiş bir dəfəlik token",
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Tokenin istifadə edildiyi vaxt (təkrar istifadə qadağandır)",
    )


class ManagerApprovalToken(Base, BaseMixin):
    """POS kassa və ya həssas əməliyyatların menecer tərəfindən təsdiq tokeni."""

    __tablename__ = "manager_approval_tokens"

    manager_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        doc="Təsdiqi verən menecerin ID-si",
    )
    requester_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        doc="Təsdiq tələb edən kassir və ya əməkdaş",
    )
    action_code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        doc="Təsdiq edilən əməliyyatın kodu (məs: pos.sale.cancel, pos.discount.override)",
    )
    resource_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        doc="Əməliyyatın aid olduğu sənəd/qəbz ID-si",
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        doc="Filial məhdudiyyəti",
    )
    reason: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        doc="Təsdiqin verilmə səbəbi və izahatı",
    )
    token_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Tokenin istifadə edildiyi vaxt",
    )
