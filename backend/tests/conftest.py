"""Mərkəzi Pytest Konfiqurasiyası və Test Fixtures."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

import app.core.database as db_module

# Bütün modelləri import edirik
import app.core.idempotency
import app.modules.approvals.models
import app.modules.auth.models
import app.modules.branches.models
import app.modules.cash_registers.models
import app.modules.catalog.models
import app.modules.company.models
import app.modules.compliance.models
import app.modules.crm.models
import app.modules.finance.models
import app.modules.hr.models
import app.modules.integrations.models
import app.modules.inventory.models
import app.modules.loyalty.models
import app.modules.marketing.models
import app.modules.notifications.models
import app.modules.numbering.models
import app.modules.payroll.models
import app.modules.ping.models
import app.modules.pos.models
import app.modules.purchasing.models
import app.modules.rbac.models
import app.modules.returns.models
import app.modules.sales.models
import app.modules.sessions.models
import app.modules.settings.models
import app.modules.suppliers.models
import app.modules.transfers.models
import app.modules.users.models
import app.modules.warehouses.models
import app.shared.audit
import app.shared.backup_model
import app.shared.outbox  # noqa: F401
from app.core.clock import FrozenClock
from app.core.config import settings
from app.core.database import Base
from app.main import app as fastapi_app

# Test mühiti təyini
settings.APP_ENV = "testing"

# Test üçün Async In-Memory SQLite mühərriki
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestAsyncSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_test_db() -> AsyncGenerator[None, None]:
    """Hər test üçün cədvəlləri yaradır və təmizləyir."""
    orig_engine = db_module.engine
    orig_session_local = db_module.AsyncSessionLocal

    db_module.engine = test_engine
    db_module.AsyncSessionLocal = TestAsyncSessionLocal

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    db_module.engine = orig_engine
    db_module.AsyncSessionLocal = orig_session_local


@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    """Hər test üçün təmiz DB sessiyası."""
    async with TestAsyncSessionLocal() as sess:
        yield sess


@pytest_asyncio.fixture
async def db_session(session: AsyncSession) -> AsyncSession:
    """Session fixture üçün alternativ ad."""
    return session


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """FastAPI üçün asinxron HTTP test müştərisi."""

    # Dependency override
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestAsyncSessionLocal() as sess:
            yield sess

    fastapi_app.dependency_overrides[db_module.get_db_session] = override_get_db

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def frozen_clock() -> FrozenClock:
    """Zaman asılılıqlı testlər üçün dondurulmuş saat."""
    return FrozenClock(datetime(2026, 10, 19, 14, 30, 0, tzinfo=UTC))
