"""RBAC Modulu Repozitorisi (RBAC Repository)."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.concurrency import verify_version
from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.modules.rbac.catalog import PERMISSIONS_CATALOG, SYSTEM_ROLES_CATALOG
from app.modules.rbac.models import (
    Permission,
    Role,
    RolePermission,
    UserPermissionOverride,
    UserRole,
    UserTemporaryGrant,
)


class RbacRepository:
    """Rollar və icazələr üzrə DB əməliyyatları."""

    async def seed_permissions(self, session: AsyncSession) -> int:
        """Standart icazələr kataloqunu bazaya daxil edir (mövcud deyilsə)."""
        inserted_count = 0
        for item in PERMISSIONS_CATALOG:
            existing = await session.get(Permission, item["key"])
            if not existing:
                perm = Permission(
                    key=item["key"],
                    module=item["module"],
                    description=item["description"],
                    risk_level=item["risk_level"],
                    created_at=utc_now(),
                )
                session.add(perm)
                inserted_count += 1
            else:
                existing.description = item["description"]
                existing.risk_level = item["risk_level"]
        await session.flush()
        return inserted_count

    async def seed_roles(self, session: AsyncSession) -> int:
        """Standart 8 sistem rolunu bazaya daxil edir və icazələrini təyin edir (idempotent)."""
        inserted_or_updated = 0
        for item in SYSTEM_ROLES_CATALOG:
            stmt = select(Role).where(Role.code == item["code"])
            res = await session.execute(stmt)
            role = res.scalar_one_or_none()
            if not role:
                role = Role(
                    id=generate_uuid7(),
                    code=item["code"],
                    name=item["name"],
                    description=item["description"],
                    is_system=True,
                    is_protected=item["is_protected"],
                    version=1,
                    created_at=utc_now(),
                )
                session.add(role)
                await session.flush()
                inserted_or_updated += 1
            else:
                role.name = item["name"]
                role.description = item["description"]
                role.is_system = True
                role.is_protected = item["is_protected"]
                await session.flush()

            # İcazələrin sinxronizasiyası
            existing_perms_stmt = select(RolePermission.permission_key).where(
                RolePermission.role_id == role.id
            )
            existing_perms = set((await session.execute(existing_perms_stmt)).scalars().all())
            target_perms = set(item["permissions"])

            to_add = target_perms - existing_perms
            for perm_key in to_add:
                rp = RolePermission(role_id=role.id, permission_key=perm_key, created_at=utc_now())
                session.add(rp)

        await session.flush()
        return inserted_or_updated

    async def list_permissions(
        self, session: AsyncSession, module: str | None = None
    ) -> list[Permission]:
        stmt = select(Permission)
        if module:
            stmt = stmt.where(Permission.module == module)
        stmt = stmt.order_by(Permission.module, Permission.key)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def create_role(
        self, session: AsyncSession, role: Role, permission_keys: list[str]
    ) -> Role:
        session.add(role)
        await session.flush()

        for key in permission_keys:
            rp = RolePermission(role_id=role.id, permission_key=key, created_at=utc_now())
            session.add(rp)

        await session.flush()
        return role

    async def get_role_by_id(self, session: AsyncSession, role_id: uuid.UUID) -> Role | None:
        stmt = select(Role).where(Role.id == role_id, Role.is_deleted.is_(False))
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_role_by_code(self, session: AsyncSession, code: str) -> Role | None:
        stmt = select(Role).where(Role.code == code.strip().lower(), Role.is_deleted.is_(False))
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_roles(self, session: AsyncSession) -> list[Role]:
        stmt = select(Role).where(Role.is_deleted.is_(False)).order_by(Role.name)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def update_role(
        self,
        session: AsyncSession,
        role: Role,
        permission_keys: list[str],
        expected_version: int,
    ) -> Role:
        verify_version(role, expected_version)
        role.version += 1
        role.updated_at = utc_now()

        # Köhnə icazələri silib yenilərini yazırıq
        await session.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
        for key in permission_keys:
            rp = RolePermission(role_id=role.id, permission_key=key, created_at=utc_now())
            session.add(rp)

        await session.flush()
        return role

    async def delete_role(self, session: AsyncSession, role: Role) -> None:
        role.is_deleted = True
        role.updated_at = utc_now()
        await session.flush()

    async def get_user_ids_for_role(
        self, session: AsyncSession, role_id: uuid.UUID
    ) -> list[uuid.UUID]:
        """Bu rola təyin olunmuş istifadəçilərin ID siyahısını qaytarır."""
        stmt = select(UserRole.user_id).where(UserRole.role_id == role_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def assign_user_roles(
        self, session: AsyncSession, user_id: uuid.UUID, role_ids: list[uuid.UUID]
    ) -> None:
        """İstifadəçiyə rolları təyin edir."""
        await session.execute(delete(UserRole).where(UserRole.user_id == user_id))
        for r_id in role_ids:
            ur = UserRole(user_id=user_id, role_id=r_id, created_at=utc_now())
            session.add(ur)
        await session.flush()

    async def get_user_roles(self, session: AsyncSession, user_id: uuid.UUID) -> list[Role]:
        stmt = (
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id, Role.is_deleted.is_(False))
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def set_permission_override(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        permission_key: str,
        granted: bool,
    ) -> UserPermissionOverride:
        # Mövcuddursa yenilə, yoxdursa yarat
        stmt = select(UserPermissionOverride).where(
            UserPermissionOverride.user_id == user_id,
            UserPermissionOverride.permission_key == permission_key,
        )
        res = await session.execute(stmt)
        override = res.scalar_one_or_none()
        if override:
            override.granted = granted
        else:
            override = UserPermissionOverride(
                user_id=user_id,
                permission_key=permission_key,
                granted=granted,
                created_at=utc_now(),
            )
            session.add(override)
        await session.flush()
        return override

    async def get_permission_overrides(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> list[UserPermissionOverride]:
        stmt = select(UserPermissionOverride).where(UserPermissionOverride.user_id == user_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def create_temporary_grant(
        self, session: AsyncSession, grant: UserTemporaryGrant
    ) -> UserTemporaryGrant:
        session.add(grant)
        await session.flush()
        return grant

    async def list_active_temporary_grants(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> list[UserTemporaryGrant]:
        now = utc_now()
        stmt = select(UserTemporaryGrant).where(
            UserTemporaryGrant.user_id == user_id,
            UserTemporaryGrant.expires_at > now,
            UserTemporaryGrant.revoked_at.is_(None),
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def revoke_temporary_grant(
        self, session: AsyncSession, grant_id: uuid.UUID
    ) -> UserTemporaryGrant | None:
        stmt = select(UserTemporaryGrant).where(UserTemporaryGrant.id == grant_id)
        res = await session.execute(stmt)
        grant = res.scalar_one_or_none()
        if grant and not grant.revoked_at:
            grant.revoked_at = utc_now()
            await session.flush()
        return grant
