"""Unit of Work (UoW) Tranzaksiya İdarəetməsi.

"One service call = one transaction" prinsipini təmin edir.
Uğurlu icrada avtomatik commit, hər hansı xəta zamanı isə avtomatik rollback həyata keçirir.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

import app.core.database as db_module


class UnitOfWork:
    """SQLAlchemy asinxron sessiyası üzərində UoW naxışı."""

    def __init__(self, session: AsyncSession | None = None) -> None:
        self._external_session = session is not None
        self._session = session

    @property
    def session(self) -> AsyncSession:
        if self._session is None:
            raise RuntimeError("UnitOfWork kontekstinə daxil olunmayıb.")
        return self._session

    async def __aenter__(self) -> UnitOfWork:
        if self._session is None:
            self._session = db_module.AsyncSessionLocal()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: Any,
    ) -> None:
        if self._session is None:
            return

        try:
            if exc_type is not None:
                if not self._external_session:
                    await self._session.rollback()
            else:
                if not self._external_session:
                    await self._session.commit()
        finally:
            if not self._external_session:
                await self._session.close()

    async def commit(self) -> None:
        """Açıq commit icrası."""
        if self._session:
            if not self._external_session:
                await self._session.commit()
            else:
                await self._session.flush()

    async def rollback(self) -> None:
        """Açıq rollback icrası."""
        if self._session:
            await self._session.rollback()


@asynccontextmanager
async def unit_of_work(session: AsyncSession | None = None) -> AsyncGenerator[UnitOfWork, None]:
    """Servislər üçün rahat context manager helper-i."""
    async with UnitOfWork(session=session) as uow:
        yield uow
