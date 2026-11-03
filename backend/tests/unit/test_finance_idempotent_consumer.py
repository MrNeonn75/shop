"""Maliyyə Outbox İstehlakçısı və İdempotentlik Vahid Testləri (Idempotent Consumer Tests)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.modules.finance.consumer import FinanceOutboxConsumer
from app.modules.finance.models import OperationalPosting


@pytest.mark.asyncio
async def test_idempotent_consumer_replay_ten_times_creates_single_posting(db_session):
    """Hadisə 10 dəfə təkrar (replay) daxil olduqda sistemdə yalnız 1 əməliyyat faktı formalaşır."""
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    event_id = uuid.uuid4()

    consumer = FinanceOutboxConsumer(db_session)

    payload = {
        "company_id": str(company_id),
        "branch_id": str(branch_id),
        "sale_id": str(uuid.uuid4()),
        "subtotal": "300.0000",
        "tax_total": "54.0000",
        "grand_total": "354.0000",
        "cost_total": "180.0000",
        "sale_date": "2026-10-21",
    }

    # 1-ci dəfə hadisə emal olunur
    res1 = await consumer.consume_event(event_id, "sale.completed", payload, company_id)
    assert res1 is True

    # 10 dəfə təkrar çağırış (Replay 10x)
    for _ in range(10):
        res_replay = await consumer.consume_event(event_id, "sale.completed", payload, company_id)
        assert res_replay is True

    # Bazada SALE_RECOGNIZED faktlarının sayını yoxlayırıq: YALNIZ 1 OLMALIDIR!
    stmt = (
        select(func.count(OperationalPosting.id))
        .where(OperationalPosting.event_id == event_id)
        .where(OperationalPosting.event_type == "SALE_RECOGNIZED")
    )
    res = await db_session.execute(stmt)
    count = res.scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_consumer_handles_returns_and_cogs_reversal(db_session):
    """Qaytarma hadisəsi istehlak edildikdə mənfi gəlir faktı tanınır."""
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    event_id = uuid.uuid4()

    consumer = FinanceOutboxConsumer(db_session)

    payload = {
        "company_id": str(company_id),
        "branch_id": str(branch_id),
        "return_id": str(uuid.uuid4()),
        "refund_total": "118.0000",
        "tax_reversal_total": "18.0000",
        "resalable_cost_total": "60.0000",
        "occurred_at": "2026-10-21T12:00:00Z",
    }

    ok = await consumer.consume_event(event_id, "return.completed", payload, company_id)
    assert ok is True

    stmt = select(OperationalPosting).where(OperationalPosting.event_id == event_id)
    res = await db_session.execute(stmt)
    postings = list(res.scalars().all())
    assert len(postings) >= 1

    ret_posting = postings[0]
    assert ret_posting.event_type == "RETURN_RECOGNIZED"
    assert ret_posting.gross_amount == Decimal("-118.0000")
    assert ret_posting.net_amount == Decimal("-100.0000")


@pytest.mark.asyncio
async def test_consumer_handles_goods_receipt_invoice_payroll_and_shift(db_session):
    """Digər domen hadisələrinin (anbar qəbzi, təchizatçı qaiməsi, əməkhaqqı, kassa fərqi) istehlakı."""
    company_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    consumer = FinanceOutboxConsumer(db_session)

    # 1. Anbara mal mədaxili (goods_receipt.completed)
    gr_id = uuid.uuid4()
    ok_gr = await consumer.consume_event(
        gr_id,
        "goods_receipt.completed",
        {"company_id": str(company_id), "branch_id": str(branch_id), "total_amount": "1500.00"},
        company_id,
    )
    assert ok_gr is True

    # 2. Təchizatçı qaiməsinin təsdiqi (invoice.approved)
    inv_id = uuid.uuid4()
    ok_inv = await consumer.consume_event(
        inv_id,
        "invoice.approved",
        {"company_id": str(company_id), "branch_id": str(branch_id), "total_amount": "2000.00"},
        company_id,
    )
    assert ok_inv is True

    # 3. Əməkhaqqı yekunlaşması (payroll.finalized)
    pr_id = uuid.uuid4()
    ok_pr = await consumer.consume_event(
        pr_id,
        "payroll.finalized",
        {"company_id": str(company_id), "branch_id": str(branch_id), "total_net_salary": "5000.00"},
        company_id,
    )
    assert ok_pr is True

    # 4. Kassa növbəsinin bağlanması və kassa fərqi (shift.closed)
    shift_id = uuid.uuid4()
    ok_shift = await consumer.consume_event(
        shift_id,
        "shift.closed",
        {"company_id": str(company_id), "branch_id": str(branch_id), "variance": "-15.00"},
        company_id,
    )
    assert ok_shift is True

    # 5. Xəta baş verdikdə consumer False qaytarır və FAILED kimi qeydə alır
    from unittest.mock import AsyncMock
    bad_consumer = FinanceOutboxConsumer(db_session)
    bad_consumer.adapter = AsyncMock()
    bad_consumer.adapter.post.side_effect = RuntimeError("Simulated adapter failure")
    fail_res = await bad_consumer.consume_event(
        uuid.uuid4(),
        "sale.completed",
        {"company_id": str(company_id), "branch_id": str(branch_id), "total_amount": "100.00"},
        company_id,
    )
    assert fail_res is False

