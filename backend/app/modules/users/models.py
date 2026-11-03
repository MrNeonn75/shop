"""İstifadəçilər Modulu ORM Modelləri (Users Models).

İstifadəçi hesabları, filial icazələri və parol tarixçəsi cədvəlləri.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base, BaseMixin

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class User(Base, BaseMixin):
    """Sistem istifadəçisi cədvəli."""

    __tablename__ = "users"

    employee_ref: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        index=True,
        doc="Kadrlar (HR) modulu ilə gələcək inteqrasiya üçün unikal işçi referansı",
    )
    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        doc="Giriş üçün unikal istifadəçi adı (kiçik hərflərlə)",
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
        doc="Unikal e-poçt ünvanı",
    )
    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="İstifadəçinin tam adı və soyadı",
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="Argon2id ilə heşlənmiş parol",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        nullable=False,
        index=True,
        doc="Hesab statusu: active, suspended, pending, locked",
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="İlkin girişdə şifrənin dəyişdirilməsi tələbi",
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Son uğurlu giriş vaxtı (UTC)",
    )
    failed_login_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        doc="Ardıcıl uğursuz giriş cəhdlərinin sayı",
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Hesabın bloklanma müddətinin sonu (UTC)",
    )
    manager_pin_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="POS kassa təsdiqləri üçün menecer PIN heşi (Argon2id)",
    )
    pos_pin_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="POS kassa sürətli girişi üçün kassir PIN heşi",
    )
    preferred_language: Mapped[str] = mapped_column(
        String(10),
        default="az",
        nullable=False,
        doc="İstifadəçi interfeys dili (az, en, ru)",
    )
    totp_secret: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="İki mərhələli təsdiqləmə (TOTP) üçün Base32 açar",
    )
    totp_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="2FA aktivləşdirilibmi",
    )
    recovery_codes_hash: Mapped[list[str] | None] = mapped_column(
        JSONBType,
        nullable=True,
        doc="2FA üçün heşlənmiş ehtiyat bərpa kodları",
    )

    # Əlaqələr
    branch_accesses: Mapped[list[UserBranchAccess]] = relationship(
        "UserBranchAccess",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    password_histories: Mapped[list[PasswordHistory]] = relationship(
        "PasswordHistory",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_users_username_lower", "username"),
        Index("ix_users_email_lower", "email"),
    )


class PasswordHistory(Base, BaseMixin):
    """İstifadəçinin əvvəlki şifrələrinin tarixçəsi (təkrar istifadənin qarşısının alınması)."""

    __tablename__ = "password_history"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    user: Mapped[User] = relationship("User", back_populates="password_histories")


class UserBranchAccess(Base, BaseMixin):
    """İstifadəçinin filial üzrə səlahiyyət əhatəsi (Branch Scope)."""

    __tablename__ = "user_branch_access"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
        doc="İcazə verilən filialın ID-si",
    )
    can_manage: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="İstifadəçi bu filialda menecer səlahiyyətinə malikdirmi",
    )

    user: Mapped[User] = relationship("User", back_populates="branch_accesses")

    __table_args__ = (Index("ix_user_branch_unique", "user_id", "branch_id", unique=True),)
