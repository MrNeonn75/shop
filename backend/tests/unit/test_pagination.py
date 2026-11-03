"""Səhifələmə və Filtrləmə Testləri (Pagination & FilterBar).

Frontend FilterBar uyğunluğu və metadata hesablamaları.
"""

from __future__ import annotations

from app.core.pagination import FilterBarParams, PaginatedResponse


def test_paginated_response_metadata_calculation() -> None:
    # 95 element, hər səhifədə 20 element -> 5 səhifə
    resp = PaginatedResponse.create(
        items=["item1", "item2"],
        total=95,
        page=2,
        page_size=20,
    )

    assert resp.total == 95
    assert resp.page == 2
    assert resp.page_size == 20
    assert resp.total_pages == 5
    assert resp.has_previous is True
    assert resp.has_next is True


def test_paginated_response_first_and_last_page() -> None:
    first_page = PaginatedResponse.create(items=[], total=10, page=1, page_size=10)
    assert first_page.has_previous is False
    assert first_page.has_next is False
    assert first_page.total_pages == 1

    last_page = PaginatedResponse.create(items=[], total=25, page=3, page_size=10)
    assert last_page.has_previous is True
    assert last_page.has_next is False
    assert last_page.total_pages == 3


def test_filter_bar_params() -> None:
    params = FilterBarParams(
        page=1,
        page_size=50,
        search="köynək",
        sort_by="price",
        sort_order="asc",
    )
    assert params.page == 1
    assert params.page_size == 50
    assert params.search == "köynək"
    assert params.sort_by == "price"
    assert params.sort_order == "asc"


def test_parse_sort_expression_valid() -> None:
    from sqlalchemy import Column, Integer

    from app.core.pagination import parse_sort_expression

    dummy_col_created = Column("created_at", Integer)
    dummy_col_price = Column("price", Integer)

    whitelist = {
        "created_at": dummy_col_created,
        "price": dummy_col_price,
    }

    # Default sort
    clauses = parse_sort_expression(None, whitelist, dummy_col_created.desc())
    assert len(clauses) == 1

    # Asc and Desc tokens
    clauses2 = parse_sort_expression("-price, +created_at", whitelist, dummy_col_created.desc())
    assert len(clauses2) == 2


def test_parse_sort_expression_disallowed_field_raises_validation_error() -> None:
    import pytest
    from sqlalchemy import Column, Integer

    from app.core.errors import ValidationError
    from app.core.pagination import parse_sort_expression

    col = Column("id", Integer)
    whitelist = {"id": col}

    with pytest.raises(ValidationError):
        parse_sort_expression("dangerous_sql_injection", whitelist, col)
