"""İstifadəçilər Modulu Repozitorisi (Users Repository).

Verilənlər bazası CRUD əməliyyatları və sorğuları.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.concurrency import verify_version
from app.core.database import utc_now
from app.core.ids import generate_uuid7
from app.core.pagination import FilterBarParams, paginate_query
from app.modules.users.models import PasswordHistory, User, UserBranchAccess


class UserRepository:
    """İstifadəçi cədvəli üzrə məlumat bazası əməliyyatları."""

    async def create(self, session: AsyncSession, user: User) -> User:
        session.add(user)
        await session.flush()
        return user

    async def get_by_id(self, session: AsyncSession, user_id: uuid.UUID) -> User | None:
        stmt = select(User).where(User.id == user_id, User.is_deleted.is_(False))
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_username(self, session: AsyncSession, username: str) -> User | None:
        clean = username.strip().lower()
        stmt = select(User).where(
            func.lower(User.username) == clean,
            User.is_deleted.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, session: AsyncSession, email: str) -> User | None:
        clean = email.strip().lower()
        stmt = select(User).where(
            func.lower(User.email) == clean,
            User.is_deleted.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_identifier(self, session: AsyncSession, identifier: str) -> User | None:
        """İstifadəçi adı və ya e-poçt üzrə istifadəçini tapır."""
        clean = identifier.strip().lower()
        stmt = select(User).where(
            or_(
                func.lower(User.username) == clean,
                func.lower(User.email) == clean,
            ),
            User.is_deleted.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_users(
        self,
        session: AsyncSession,
        params: FilterBarParams,
        branch_scope_ids: list[uuid.UUID] | None = None,
    ) -> tuple[list[User], int]:
        """Səhifələnmiş istifadəçi siyahısını qaytarır."""
        query = select(User).where(User.is_deleted.is_(False))

        if params.status:
            query = query.where(User.status == params.status)

        if params.q:
            pattern = f"%{params.q.strip().lower()}%"
            query = query.where(
                or_(
                    func.lower(User.username).like(pattern),
                    func.lower(User.email).like(pattern),
                    func.lower(User.full_name).like(pattern),
                )
            )

        if branch_scope_ids is not None:
            # Filial təcridi: Yalnız verilmiş filiallara çıxışı olan istifadəçilər
            query = query.join(UserBranchAccess, UserBranchAccess.user_id == User.id).where(
                UserBranchAccess.branch_id.in_(branch_scope_ids)
            )

        # Çeşidləmə
        sort_col: Any = User.created_at.desc()
        if params.sort:
            if params.sort.lstrip("-") == "username":
                sort_col = (
                    User.username.desc() if params.sort.startswith("-") else User.username.asc()
                )
            elif params.sort.lstrip("-") == "full_name":
                sort_col = (
                    User.full_name.desc() if params.sort.startswith("-") else User.full_name.asc()
                )
            elif params.sort.lstrip("-") == "status":
                sort_col = User.status.desc() if params.sort.startswith("-") else User.status.asc()

        query = query.order_by(sort_col)
        items, total = await paginate_query(
            session=session,
            query=query,
            page=params.page,
            page_size=params.page_size,
        )
        return [item for item in items if isinstance(item, User)], total

    async def update(self, session: AsyncSession, user: User, expected_version: int) -> User:
        """İstifadəçi məlumatlarını optimistik kilidləmə (version) ilə yeniləyir."""
        verify_version(user, expected_version)
        user.version += 1
        user.updated_at = utc_now()
        await session.flush()
        return user

    async def add_password_history(
        self, session: AsyncSession, user_id: uuid.UUID, password_hash: str
    ) -> PasswordHistory:
        """Köhnə şifrə heşini tarixçəyə əlavə edir."""
        history = PasswordHistory(
            id=generate_uuid7(),
            user_id=user_id,
            password_hash=password_hash,
            created_at=utc_now(),
        )
        session.add(history)
        await session.flush()
        return history

    async def get_recent_password_hashes(
        self, session: AsyncSession, user_id: uuid.UUID, limit: int = 5
    ) -> list[str]:
        """İstifadəçinin son N sayda şifrə heşini qaytarır."""
        stmt = (
            select(PasswordHistory.password_hash)
            .where(PasswordHistory.user_id == user_id)
            .order_by(PasswordHistory.created_at.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def set_branch_access(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        branch_ids: list[uuid.UUID],
        manage_branch_ids: list[uuid.UUID] | None = None,
    ) -> list[UserBranchAccess]:
        """İstifadəçinin filial icazələrini yenidən təyin edir."""
        manage_set = set(manage_branch_ids or [])
        # Əvvəlkiləri təmizləyirik
        await session.execute(delete(UserBranchAccess).where(UserBranchAccess.user_id == user_id))

        access_list: list[UserBranchAccess] = []
        for b_id in branch_ids:
            access = UserBranchAccess(
                id=generate_uuid7(),
                user_id=user_id,
                branch_id=b_id,
                can_manage=(b_id in manage_set),
                created_at=utc_now(),
            )
            session.add(access)
            access_list.append(access)

        await session.flush()
        return access_list

    async def get_branch_access(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> list[UserBranchAccess]:
        """İstifadəçinin filial çıxış siyahısını çəkir."""
        stmt = select(UserBranchAccess).where(UserBranchAccess.user_id == user_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def count_users_by_branch(self, session: AsyncSession, branch_id: uuid.UUID) -> int:
        """Filiala təyin olunmuş aktiv istifadəçilərin sayını qaytarır."""
        stmt = (
            select(func.count(UserBranchAccess.id))
            .join(User, User.id == UserBranchAccess.user_id)
            .where(
                UserBranchAccess.branch_id == branch_id,
                User.is_deleted.is_(False),
                User.status == "active",
            )
        )
        result = await session.execute(stmt)
        return int(result.scalar_one() or 0)
