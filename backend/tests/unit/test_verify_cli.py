"""İnvariant Yoxlayıcısı (scripts/verify.py) Vahid Testləri."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.modules.inventory.models import StockBalance, StockMovement
from app.modules.sales.models import Sale, SaleLine, SalePayment
from app.shared.audit import GENESIS_HASH, AuditEvent, compute_audit_hash
from scripts.verify import (
    check_audit_trail_hash_chain,
    check_inventory_ledger_vs_stock_levels,
    check_sales_vs_payments_and_lines,
    run_all_checks,
)


@pytest.mark.asyncio
async def test_verify_all_checks_structure_on_clean_state(db_session: AsyncSession) -> None:
    """Təmiz bazada bütün 7 invariant yoxlaması xətasız icra olunur və keçir."""
    report = await run_all_checks(db_session)
    assert report.total_checks == 7
    assert report.failed_checks == 0
    assert report.passed is True


@pytest.mark.asyncio
async def test_verify_detects_inventory_ledger_drift(db_session: AsyncSession) -> None:
    """Anbar qalığı ilə hərəkət jurnalı arasında uyğunsuzluq olduqda deteksiya edilir."""
    cid = uuid.uuid4()
    wid = uuid.uuid4()
    vid = uuid.uuid4()

    # 1. 10 ədədlik mədaxil hərəkət jurnalı qeydi
    movement = StockMovement(
        id=uuid.uuid4(),
        movement_no="MOV-TEST-001",
        company_id=cid,
        from_warehouse_id=None,
        to_warehouse_id=wid,
        variant_id=vid,
        movement_type="RECEIPT",
        from_status=None,
        to_status="available",
        quantity=10,
        reference_type="stock_document",
        reference_id=uuid.uuid4(),
        occurred_at=utc_now(),
        posted_at=utc_now(),
    )
    db_session.add(movement)

    # 2. Qalıq cədvəlində isə 8 ədəd yazılır (2 ədədlik kəsir / uyğunsuzluq)
    balance = StockBalance(
        id=uuid.uuid4(),
        company_id=cid,
        warehouse_id=wid,
        variant_id=vid,
        stock_status="available",
        on_hand=8,  # Discrepancy!
        allow_negative=False,
        updated_at=utc_now(),
    )
    db_session.add(balance)
    await db_session.commit()

    # Yoxlayırıq
    res = await check_inventory_ledger_vs_stock_levels(db_session)
    assert res.status == "FAILED"
    assert res.failure_count >= 1
    sample = next(
        d for d in res.details if d["warehouse_id"] == str(wid) and d["variant_id"] == str(vid)
    )
    assert sample["actual_on_hand"] == "8"
    assert sample["expected_from_ledger"] == "10"
    assert sample["discrepancy"] == "-2"


@pytest.mark.asyncio
async def test_verify_detects_sales_vs_payments_mismatch(db_session: AsyncSession) -> None:
    """Satış çeki məbləği ilə ödənişlər cəmi fərqli olduqda deteksiya edilir."""
    cid = uuid.uuid4()
    bid = uuid.uuid4()
    rid = uuid.uuid4()
    sid = uuid.uuid4()
    cashier_id = uuid.uuid4()
    sale_id = uuid.uuid4()
    vid = uuid.uuid4()

    # Satış: grand_total = 100.00 AZN
    sale = Sale(
        id=sale_id,
        receipt_no=f"REC-{uuid.uuid4().hex[:8].upper()}",
        company_id=cid,
        branch_id=bid,
        register_id=rid,
        shift_id=sid,
        cashier_id=cashier_id,
        business_date=utc_now().date(),
        correlation_id="corr-test",
        status="COMPLETED",
        subtotal=Decimal("100.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("18.00"),
        grand_total=Decimal("100.00"),
        paid_amount=Decimal("100.00"),
        change_amount=Decimal("0.00"),
        cost_total=Decimal("60.00"),
        currency="AZN",
    )
    db_session.add(sale)

    # Sətir: 100.00
    line = SaleLine(
        id=uuid.uuid4(),
        sale_id=sale_id,
        line_no=1,
        variant_id=vid,
        product_id=cid,
        sku="TEST-SKU",
        product_name="Test Product",
        quantity=1,
        unit_price=Decimal("100.00"),
        gross_amount=Decimal("100.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        total_amount=Decimal("100.00"),
    )
    db_session.add(line)

    # Ödəniş: 90.00 (10 kəsir!)
    payment = SalePayment(
        id=uuid.uuid4(),
        sale_id=sale_id,
        tender_type="cash",
        amount=Decimal("90.00"),
        tendered_amount=Decimal("90.00"),
        change_amount=Decimal("0.00"),
    )
    db_session.add(payment)
    await db_session.commit()

    res = await check_sales_vs_payments_and_lines(db_session)
    assert res.status == "FAILED"
    assert res.failure_count >= 1
    sample = next(d for d in res.details if d["sale_id"] == str(sale_id))
    assert any("grand_total" in err for err in sample["errors"])


@pytest.mark.asyncio
async def test_verify_detects_audit_hash_chain_tampering(db_session: AsyncSession) -> None:
    """Audit qeydində məlumat dəyişdirildikdə və ya zəncir qırıldıqda deteksiya edilir."""
    ev_id = uuid.uuid4()
    now = utc_now()
    valid_hash = compute_audit_hash(
        prev_hash=GENESIS_HASH,
        event_id=ev_id,
        occurred_at=now,
        actor_id=None,
        action="USER_CREATED",
        entity_type="users",
        entity_id="123",
        diff={"username": "alice"},
        severity="info",
    )

    tampered_event = AuditEvent(
        id=ev_id,
        created_at=now,
        actor_id=None,
        action="USER_CREATED",
        resource_type="users",
        resource_id="123",
        diff={"username": "alice"},
        severity="info",
        prev_hash="BAD_PREV_HASH" + "0" * 51,  # Qırılmış zəncir!
        hash=valid_hash,
        correlation_id="corr-1",
    )
    db_session.add(tampered_event)
    await db_session.commit()

    res = await check_audit_trail_hash_chain(db_session)
    assert res.status == "FAILED"
    assert res.failure_count >= 1
    sample = next(d for d in res.details if d["event_id"] == str(ev_id))
    assert "Hash chain qırılması" in sample["error"] or "Heş uyğunsuzluğu" in sample["error"]
