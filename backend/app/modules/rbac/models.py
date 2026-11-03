"""RBAC və İcazələr Modulu ORM Modelləri (RBAC Models).

Rollar, icazələr, rol-icazə matrisi, istifadəçi overrides və müvəqqəti icazələr (Temporary Grants).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, BaseMixin, utc_now


class Permission(Base):
    """Sistemdə mövcud olan icazə kataloqu."""

    __tablename__ = "permissions"

    key: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        doc="Unikal icazə açarı (məs: inventory.stock.adjust)",
    )
    module: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Aid olduğu modul (pos, inventory, finance, users və s.)",
    )
    description: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="İcazənin Azərbaycan dilində aydın təsviri",
    )
    risk_level: Mapped[str] = mapped_column(
        String(20),
        default="normal",
        nullable=False,
        doc="Risk dərəcəsi: normal, sensitive, critical",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class Role(Base, BaseMixin):
    """Sistem rolları cədvəli."""

    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        doc="Rolun unikal proqram kodu (məs: system_admin, cashier)",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Rolun adı (Azərbaycan dilində)",
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Rolun təsviri və vəzifə öhdəlikləri",
    )
    is_system: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Sistem tərəfindən ilkin yaradılmış rol (silinməsi qadağandır)",
    )
    is_protected: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Qorunan rol (yalnız sistem admini dəyişə bilər)",
    )

    # Əlaqələr
    permissions: Mapped[list[RolePermission]] = relationship(
        "RolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class RolePermission(Base):
    """Rol və icazə arasındakı çoxlu-çoxluya (M2M) əlaqə."""

    __tablename__ = "role_permissions"

    role_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_key: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("permissions.key", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    role: Mapped[Role] = relationship("Role", back_populates="permissions")


class UserRole(Base):
    """İstifadəçi və rol arasındakı əlaqə."""

    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class UserPermissionOverride(Base):
    """Fərdi istifadəçi üçün xüsusi icazə istisnası (Allow və ya Deny)."""

    __tablename__ = "user_permission_overrides"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    permission_key: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("permissions.key", ondelete="CASCADE"),
        primary_key=True,
    )
    granted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        doc="True = xüsusi icazə verilib, False = rol icazəsi qadağan edilib (Deny)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class UserTemporaryGrant(Base, BaseMixin):
    """Müvəqqəti təyin edilmiş icazə və ya rol (Temporary Access Grant)."""

    __tablename__ = "user_temporary_grants"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    permission_key: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("permissions.key", ondelete="CASCADE"),
        nullable=True,
    )
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=True,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        doc="İcazənin məhdudlaşdırıldığı filial (None = bütün istifadəçi filialları)",
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        doc="İcazənin qüvvədən düşmə tarixi (UTC)",
    )
    reason: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        doc="Müvəqqəti icazənin verilmə səbəbi (məs: Məzuniyyət əvəzetməsi)",
    )
    approver_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        doc="İcazəni təsdiqləyən səlahiyyətli şəxs",
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="İcazə vaxtından əvvəl geri çağırılıbsa, çağırılma tarixi",
    )

    __table_args__ = (Index("ix_temp_grants_active", "user_id", "expires_at", "revoked_at"),)
