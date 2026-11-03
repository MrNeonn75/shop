"""Səhifələmə, Çeşidləmə və Filtrasiya Standartı (Pagination & Filtering).

Frontend FilterBar komponenti ilə tam uyğun parametrlər:
branch_id, date_from, date_to, q, status, page, page_size, sort.
SQL injection-dan qorunmaq üçün whitelist əsaslı çeşidləmə və filtrasiya tətbiq olunur.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Select, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError

T = TypeVar("T")


class FilterBarParams(BaseModel):
    """Frontend FilterBar ilə tam uyğun gələn sorğu parametrləri."""

    model_config = ConfigDict(extra="ignore")

    page: int = Field(default=1, ge=1, description="Səhifə nömrəsi")
    page_size: int = Field(
        default=20, ge=1, le=100, description="Hər səhifədəki element sayı (maks 100)"
    )
    branch_id: uuid.UUID | None = Field(default=None, description="Filial üzrə filtr")
    date_from: datetime | None = Field(default=None, description="Başlanğıc tarixi (UTC)")
    date_to: datetime | None = Field(default=None, description="Son tarix (UTC)")
    q: str | None = Field(default=None, description="Axtarış mətni")
    status: str | None = Field(default=None, description="Status üzrə filtr")
    sort: str | None = Field(
        default=None,
        description="Çeşidləmə: sütun:istiqamət (məs: created_at:desc və ya -created_at)",
    )

    def __init__(self, **data: Any) -> None:
        if "search" in data and "q" not in data:
            data["q"] = data.pop("search")
        if "sort_by" in data and "sort" not in data:
            sb = data.pop("sort_by")
            so = data.pop("sort_order", "asc")
            data["sort"] = f"{sb}:{so}"
        super().__init__(**data)

    @property
    def search(self) -> str | None:
        return self.q

    @property
    def sort_by(self) -> str | None:
        if self.sort and ":" in self.sort:
            return self.sort.split(":")[0]
        return self.sort

    @property
    def sort_order(self) -> str:
        if self.sort and ":" in self.sort:
            return self.sort.split(":")[1]
        return "asc"


class PaginatedResponse(BaseModel, Generic[T]):
    """Standart səhifələnmiş API cavab zərfi."""

    items: list[T]
    page: int
    page_size: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool

    @property
    def has_previous(self) -> bool:
        return self.has_prev

    @classmethod
    def create(
        cls,
        items: list[T],
        total: int,
        page: int,
        page_size: int,
    ) -> PaginatedResponse[T]:
        total_pages = math.ceil(total / page_size) if page_size > 0 else 1
        return cls(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )


def parse_sort_expression(
    sort_str: str | None,
    allowed_fields: dict[str, Any],
    default_sort: Any,
) -> list[Any]:
    """Çeşidləmə ifadəsini təhlil edir və yalnız whitelist-də olan sütunları tətbiq edir."""
    if not sort_str or not sort_str.strip():
        return [default_sort]

    clauses: list[Any] = []
    tokens = [t.strip() for t in sort_str.split(",") if t.strip()]

    for token in tokens:
        if token.startswith("-"):
            field_name = token[1:]
            direction = "desc"
        elif token.startswith("+"):
            field_name = token[1:]
            direction = "asc"
        elif ":" in token:
            parts = token.split(":")
            field_name = parts[0]
            direction = parts[1].lower()
        else:
            field_name = token
            direction = "asc"

        column = allowed_fields.get(field_name)
        if column is None:
            raise ValidationError(
                f"'{field_name}' sahəsi üzrə çeşidləməyə icazə verilmir. İcazəli sahələr: {', '.join(allowed_fields.keys())}"
            )

        if direction == "desc":
            clauses.append(desc(column))
        else:
            clauses.append(asc(column))

    return clauses if clauses else [default_sort]


async def paginate_query(
    session: AsyncSession,
    query: Select[Any],
    page: int,
    page_size: int,
) -> tuple[list[Any], int]:
    """SQLAlchemy sorğusuna COUNT və LIMIT/OFFSET tətbiq edərək səhifələməni icra edir."""
    # 1. Total count
    count_subquery = query.order_by(None).subquery()
    count_stmt: Select[Any] = select(func.count()).select_from(count_subquery)
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one_or_none() or 0

    if total == 0:
        return [], 0

    # 2. Səhifə qeydləri
    offset = (page - 1) * page_size
    paged_query = query.limit(page_size).offset(offset)
    result = await session.execute(paged_query)
    items = list(result.scalars().all())

    return items, total
