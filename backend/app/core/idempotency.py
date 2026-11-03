"""İdempotentlik Təməli (Idempotency Management).

POST və digər dəyişdirici sorğularda 'Idempotency-Key' başlığının yoxlanması,
cavabların keşlənməsi və təkrar icraların qarşısının alınması.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Header, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint, Uuid, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.config import settings
from app.core.database import Base, BaseMixin, utc_now
from app.core.errors import IdempotencyConflictError, ValidationError

JSONBType = JSONB().with_variant(JSON(), "sqlite")  # type: ignore[no-untyped-call]


class IdempotencyRecord(Base, BaseMixin):
    """Verilənlər bazasında saxlanılan Idempotency qeydi."""

    __tablename__ = "idempotency_keys"

    key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(255), nullable=False, doc="Məs: POST:/api/v1/sales")
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)

    request_hash: Mapped[str] = mapped_column(String(64), nullable=False, doc="SHA-256 body hash")
    status: Mapped[str] = mapped_column(
        String(30),
        default="IN_PROGRESS",
        nullable=False,
        doc="IN_PROGRESS | COMPLETED | FAILED",
    )

    response_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_headers: Mapped[dict[str, Any] | None] = mapped_column(JSONBType, nullable=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("key", "scope", "user_id", name="uq_idempotency_keys_key_scope_user"),
        Index("ix_idempotency_keys_expires_at", "expires_at"),
    )


def compute_request_hash(body_bytes: bytes) -> str:
    """Sorğu body-sinin SHA-256 heşini hesablayır."""
    try:
        # JSON-u normallaşdırılmış şəkildə heşləyirik (açar sıralaması ilə)
        parsed = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        canonical_str = json.dumps(parsed, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()
    except Exception:
        return hashlib.sha256(body_bytes).hexdigest()


class IdempotencyContext:
    """Tək bir sorğunun idempotentlik axınını idarə edən kontekst obyekti."""

    def __init__(
        self,
        session: AsyncSession,
        key: str,
        scope: str,
        request_hash: str,
        user_id: uuid.UUID | None = None,
    ) -> None:
        self.session = session
        self.key = key
        self.scope = scope
        self.request_hash = request_hash
        self.user_id = user_id
        self.record: IdempotencyRecord | None = None

    async def check_or_start(self) -> Response | None:
        """Qeydi yoxlayır; əgər mövcuddursa replay və ya xəta qaytarır, yoxdursa IN_PROGRESS yaradır."""
        stmt = select(IdempotencyRecord).where(
            IdempotencyRecord.key == self.key,
            IdempotencyRecord.scope == self.scope,
            IdempotencyRecord.user_id == self.user_id,
        )
        res = await self.session.execute(stmt)
        self.record = res.scalars().first()

        now = utc_now()

        if self.record:
            # Müddəti bitibsə təmizləyib yenisini yaradırıq
            exp = self.record.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=UTC)
            if exp <= now:
                await self.session.delete(self.record)
                await self.session.flush()
                self.record = None
            elif self.record.status == "IN_PROGRESS":
                raise IdempotencyConflictError(
                    code="IDEMPOTENCY_IN_FLIGHT",
                    retry_after=2,
                )
            elif self.record.status == "COMPLETED":
                if self.record.request_hash != self.request_hash:
                    raise ValidationError(
                        message="Eyni Idempotency-Key fərqli sorğu məzmunu üçün istifadə edilə bilməz."
                    )
                # Saxlanmış cavabı Replay edirik
                headers = dict(self.record.response_headers or {})
                headers["X-Idempotent-Replay"] = "true"
                return JSONResponse(
                    status_code=self.record.response_status_code or 200,
                    content=json.loads(self.record.response_body or "{}"),
                    headers=headers,
                )

        # Yeni IN_PROGRESS qeydi açırıq
        self.record = IdempotencyRecord(
            key=self.key,
            scope=self.scope,
            user_id=self.user_id,
            request_hash=self.request_hash,
            status="IN_PROGRESS",
            expires_at=now + timedelta(seconds=settings.IDEMPOTENCY_TTL_SECONDS),
        )
        self.session.add(self.record)
        await self.session.commit()
        await self.session.refresh(self.record)
        return None

    async def complete(
        self, status_code: int, body: Any, headers: dict[str, str] | None = None
    ) -> None:
        """Uğurlu icradan sonra cavabı yadda saxlayır."""
        if not self.record:
            return

        body_str = json.dumps(body) if not isinstance(body, str) else body
        self.record.status = "COMPLETED"
        self.record.response_status_code = status_code
        self.record.response_body = body_str
        self.record.response_headers = headers or {}
        await self.session.commit()

    async def fail(self) -> None:
        """Xəta baş verdikdə qeydi FAILED edir ki, təkrar cəhd oluna bilsin."""
        if self.record:
            self.record.status = "FAILED"
            await self.session.commit()


async def get_idempotency_context(
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> IdempotencyContext | None:
    """FastAPI endpoints üçün IdempotencyContext dependency."""
    if not idempotency_key:
        return None

    import app.core.database as db_module

    body_bytes = await request.body()
    request_hash = compute_request_hash(body_bytes)
    scope = f"{request.method}:{request.url.path}"
    user_id = getattr(request.state, "user_id", None)

    # Idempotency qeydləri üçün ayrıca sessiya istifadə edirik ki, əsas tranzaksiyadan asılı olmadan commit/rollback edə bilsin
    session = db_module.AsyncSessionLocal()
    return IdempotencyContext(
        session=session,
        key=idempotency_key,
        scope=scope,
        request_hash=request_hash,
        user_id=user_id,
    )
