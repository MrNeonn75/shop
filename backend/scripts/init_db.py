"""Production DB bootstrap and schema initialization.

Builds the complete schema from SQLAlchemy models and seeds essential
foundations, reference data, and demo catalog/users.
"""

from __future__ import annotations

import asyncio
import importlib
import pkgutil
import sys

from sqlalchemy.ext.asyncio import create_async_engine

import app
import app.main  # noqa: F401
from app.core.config import settings
from app.core.database import Base


def import_all_models() -> None:
    for mod in pkgutil.walk_packages(app.__path__, "app."):
        if mod.name.endswith(("models", "model", "audit", "outbox", "idempotency")):
            try:
                importlib.import_module(mod.name)
            except Exception as e:
                print(f"Warning importing {mod.name}: {e}", file=sys.stderr)


async def main() -> None:
    print("Bootstrapping database schema...")
    import_all_models()
    
    engine_kwargs = {}
    if "sqlite" in settings.DATABASE_URL:
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    else:
        engine_kwargs.update({
            "pool_pre_ping": True,
        })
        
    engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print(f"Schema ready: {len(Base.metadata.tables)} tables in metadata.")

    # Seed master foundations & reference data
    try:
        from scripts.seed import seed_master_foundations, seed_reference_data, seed_demo_data
        print("Seeding master foundations...")
        await seed_master_foundations()
        print("Seeding reference data (roles, permissions, compliance)...")
        await seed_reference_data()
        print("Database bootstrap successfully completed!")
    except Exception as exc:
        print(f"Warning during seed: {exc}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())

