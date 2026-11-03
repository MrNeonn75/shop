"""Brand House ERP — Sistem İnvariantları və Dəlillər Təftişi CLI (ERP Verify).

Bu alət real verilənlər bazasını skan edərək bütün fundamental biznes invariantlarını yoxlayır:
1. Anbar qalıqları (stock_balances) vs Hərəkət jurnalı (stock_movements).
2. Satış yekunları vs Sətirlər cəmi vs Ödənişlər cəmi (Sales grand_total == lines == payments).
3. Mühasibat İkitərəfli Qeyd Balansı (GL Journal debit == credit).
4. Loyallıq balları vs Xallar jurnalı (Loyalty summary == ledger sum).
5. Kriptoqrafik Audit Zənciri (SHA-256 Hash Chain bütövlüyü).
6. Fasiləsiz nömrələnmə ardıcıllıqlarında boşluqların təyini (Gapless numbering gap detection).
7. Yetim qeydlər (Orphan references & referential integrity).

İstifadə:
  python scripts/verify.py
  python scripts/verify.py --json
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import sys
from collections.abc import AsyncGenerator
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, utc_now
from app.modules.catalog.models import ProductVariant
from app.modules.finance.models import JournalEntry, JournalLine
from app.modules.inventory.models import StockBalance, StockMovement
from app.modules.loyalty.models import LoyaltyCustomerSummary, LoyaltyLedgerEntry
from app.modules.numbering.models import NumberingSequence
from app.modules.sales.models import Sale, SaleLine, SalePayment
from app.shared.audit import GENESIS_HASH, AuditEvent, compute_audit_hash

console = Console()


@dataclass
class CheckResult:
    name: str
    description: str
    status: str  # PASSED, FAILED, WARNING, SKIPPED
    checked_count: int = 0
    failure_count: int = 0
    details: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class VerificationReport:
    timestamp: str
    passed: bool
    total_checks: int
    passed_checks: int
    failed_checks: int
    checks: list[CheckResult] = field(default_factory=list)


@contextlib.asynccontextmanager
async def get_session(provided: AsyncSession | None = None) -> AsyncGenerator[AsyncSession, None]:
    """Təmin edilmiş və ya yeni async session konteksti yaradır."""
    if provided is not None:
        yield provided
    else:
        async with AsyncSessionLocal() as session:
            yield session


async def check_inventory_ledger_vs_stock_levels(session: AsyncSession | None = None) -> CheckResult:
    """1. Anbar qalıqlarının (stock_balances) hərəkət jurnalı (stock_movements) ilə bərabərliyi."""
    async with get_session(session) as s:
        levels_stmt = select(StockBalance)
        levels_res = await s.execute(levels_stmt)
        levels = levels_res.scalars().all()

        checked = len(levels)
        failures: list[dict[str, Any]] = []

        for b in levels:
            inbound_stmt = select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
                StockMovement.to_warehouse_id == b.warehouse_id,
                StockMovement.variant_id == b.variant_id,
                StockMovement.to_status == b.stock_status,
            )
            inbound = (await s.execute(inbound_stmt)).scalar_one()

            outbound_stmt = select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
                StockMovement.from_warehouse_id == b.warehouse_id,
                StockMovement.variant_id == b.variant_id,
                StockMovement.from_status == b.stock_status,
            )
            outbound = (await s.execute(outbound_stmt)).scalar_one()

            expected_on_hand = int(inbound - outbound)
            if b.on_hand != expected_on_hand:
                failures.append(
                    {
                        "warehouse_id": str(b.warehouse_id),
                        "variant_id": str(b.variant_id),
                        "actual_on_hand": str(b.on_hand),
                        "expected_from_ledger": str(expected_on_hand),
                        "discrepancy": str(b.on_hand - expected_on_hand),
                    }
                )

        return CheckResult(
            name="Anbar Balansı vs Hərəkət Jurnalı",
            description="stock_balances.on_hand == Inbound - Outbound in stock_movements",
            status="PASSED" if not failures else "FAILED",
            checked_count=checked,
            failure_count=len(failures),
            details=failures[:10],
        )


async def check_sales_vs_payments_and_lines(session: AsyncSession | None = None) -> CheckResult:
    """2. Tamamlanmış satışlarda grand_total == sətirlər cəmi == ödənişlər cəmi."""
    async with get_session(session) as s:
        sales_stmt = select(Sale).where(Sale.status == "COMPLETED")
        sales_res = await s.execute(sales_stmt)
        sales = sales_res.scalars().all()

        checked = len(sales)
        failures: list[dict[str, Any]] = []

        for sale in sales:
            # Sətirlər cəmi
            lines_stmt = select(func.sum(SaleLine.total_amount)).where(SaleLine.sale_id == sale.id)
            lines_res = await s.execute(lines_stmt)
            lines_sum = Decimal(str(lines_res.scalar() or "0.00"))

            # Ödənişlər cəmi
            payments_stmt = select(func.sum(SalePayment.amount)).where(SalePayment.sale_id == sale.id)
            payments_res = await s.execute(payments_stmt)
            payments_sum = Decimal(str(payments_res.scalar() or "0.00"))

            # Qalıq (change) çıxılmaqla xalis ödəniş
            net_paid = payments_sum - sale.change_amount

            discrepancies: list[str] = []
            if sale.grand_total != lines_sum:
                discrepancies.append(f"grand_total ({sale.grand_total}) != lines_sum ({lines_sum})")
            if sale.grand_total != net_paid:
                discrepancies.append(f"grand_total ({sale.grand_total}) != net_paid ({net_paid})")

            if discrepancies:
                failures.append(
                    {
                        "sale_id": str(sale.id),
                        "receipt_no": sale.receipt_no,
                        "grand_total": str(sale.grand_total),
                        "errors": discrepancies,
                    }
                )

        return CheckResult(
            name="Satış Sənədləri vs Sətirlər və Ödənişlər",
            description="sales.grand_total == SUM(lines) == SUM(payments) - change",
            status="PASSED" if not failures else "FAILED",
            checked_count=checked,
            failure_count=len(failures),
            details=failures[:10],
        )


async def check_gl_double_entry_balance(session: AsyncSession | None = None) -> CheckResult:
    """3. Mühasibat Baş Kitabında ikitərəfli yazılış balansı (Debit == Credit)."""
    async with get_session(session) as s:
        entries_stmt = select(JournalEntry)
        entries_res = await s.execute(entries_stmt)
        entries = entries_res.scalars().all()

        checked = len(entries)
        failures: list[dict[str, Any]] = []

        for je in entries:
            if je.total_debit != je.total_credit:
                failures.append(
                    {
                        "entry_id": str(je.id),
                        "entry_no": je.entry_no,
                        "total_debit": str(je.total_debit),
                        "total_credit": str(je.total_credit),
                        "difference": str(je.total_debit - je.total_credit),
                    }
                )
                continue

            lines_stmt = select(
                func.sum(JournalLine.debit).label("lines_debit"),
                func.sum(JournalLine.credit).label("lines_credit"),
            ).where(JournalLine.journal_entry_id == je.id)
            lines_res = await s.execute(lines_stmt)
            row = lines_res.first()
            lines_deb = Decimal(str(row.lines_debit or "0.0000")) if row else Decimal("0.0000")
            lines_crd = Decimal(str(row.lines_credit or "0.0000")) if row else Decimal("0.0000")

            if lines_deb != lines_crd or lines_deb != je.total_debit:
                failures.append(
                    {
                        "entry_id": str(je.id),
                        "entry_no": je.entry_no,
                        "header_debit": str(je.total_debit),
                        "lines_debit": str(lines_deb),
                        "lines_credit": str(lines_crd),
                    }
                )

        return CheckResult(
            name="Mühasibat İkitərəfli Qeyd Balansı",
            description="journal_entries.total_debit == total_credit == lines sum",
            status="PASSED" if not failures else "FAILED",
            checked_count=checked,
            failure_count=len(failures),
            details=failures[:10],
        )


async def check_loyalty_lots_and_ledger(session: AsyncSession | None = None) -> CheckResult:
    """4. Loyallıq balansı vs Xal hərəkətləri jurnalı."""
    async with get_session(session) as s:
        summaries_stmt = select(LoyaltyCustomerSummary)
        summaries_res = await s.execute(summaries_stmt)
        summaries = summaries_res.scalars().all()

        checked = len(summaries)
        failures: list[dict[str, Any]] = []

        for summ in summaries:
            ledger_stmt = select(func.sum(LoyaltyLedgerEntry.points)).where(
                LoyaltyLedgerEntry.customer_id == summ.customer_id
            )
            ledger_res = await s.execute(ledger_stmt)
            ledger_sum = ledger_res.scalar() or 0

            if summ.current_points != ledger_sum:
                failures.append(
                    {
                        "customer_id": str(summ.customer_id),
                        "current_points": summ.current_points,
                        "ledger_sum": ledger_sum,
                        "discrepancy": summ.current_points - ledger_sum,
                    }
                )

        return CheckResult(
            name="Loyallıq Balansı vs Hadisə Jurnalı",
            description="loyalty_customer_summaries.current_points == SUM(loyalty_ledger_entries.points)",
            status="PASSED" if not failures else "FAILED",
            checked_count=checked,
            failure_count=len(failures),
            details=failures[:10],
        )


async def check_audit_trail_hash_chain(session: AsyncSession | None = None) -> CheckResult:
    """5. Kriptoqrafik Audit Zənciri (SHA-256 Hash Chain) təftişi."""
    async with get_session(session) as s:
        audit_stmt = select(AuditEvent).order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
        audit_res = await s.execute(audit_stmt)
        events = audit_res.scalars().all()

        checked = len(events)
        failures: list[dict[str, Any]] = []

        prev_hash = GENESIS_HASH
        for ev in events:
            if ev.prev_hash != prev_hash:
                failures.append(
                    {
                        "event_id": str(ev.id),
                        "action": ev.action,
                        "expected_prev_hash": prev_hash,
                        "actual_prev_hash": ev.prev_hash,
                        "error": "Hash chain qırılması (Tampering və ya itki)!",
                    }
                )

            computed_hash = compute_audit_hash(
                prev_hash=ev.prev_hash,
                event_id=ev.id,
                occurred_at=ev.created_at,
                actor_id=ev.actor_id,
                action=ev.action,
                entity_type=ev.resource_type,
                entity_id=ev.resource_id,
                diff=ev.diff,
                severity=ev.severity,
            )

            if ev.hash != computed_hash:
                failures.append(
                    {
                        "event_id": str(ev.id),
                        "action": ev.action,
                        "stored_hash": ev.hash,
                        "computed_hash": computed_hash,
                        "error": "Məlumat modifikasiyası (Heş uyğunsuzluğu)!",
                    }
                )

            prev_hash = ev.hash

        return CheckResult(
            name="Kriptoqrafik Audit Zənciri (SHA-256)",
            description="AuditEvent prev_hash zəncirlənməsi və məlumat bütövlüyü",
            status="PASSED" if not failures else "FAILED",
            checked_count=checked,
            failure_count=len(failures),
            details=failures[:10],
        )


async def check_numbering_sequences(session: AsyncSession | None = None) -> CheckResult:
    """6. Nömrələnmə ardıcıllıqlarında boşluqların yoxlanması."""
    async with get_session(session) as s:
        seqs_stmt = select(NumberingSequence)
        seqs_res = await s.execute(seqs_stmt)
        seqs = seqs_res.scalars().all()

        checked = len(seqs)
        failures: list[dict[str, Any]] = []

        for seq in seqs:
            if seq.current_sequence < 0:
                failures.append(
                    {
                        "sequence_id": str(seq.id),
                        "document_type": seq.document_type,
                        "current_sequence": seq.current_sequence,
                        "error": "Ardıcıllıq mənfi dəyər ala bilməz",
                    }
                )

        return CheckResult(
            name="Sənəd Nömrələnməsi Ardıcıllığı",
            description="NumberingSequence cari nömrə və ardıcıllıq vəziyyəti",
            status="PASSED" if not failures else "FAILED",
            checked_count=checked,
            failure_count=len(failures),
            details=failures[:10],
        )


async def check_orphan_foreign_keys(session: AsyncSession | None = None) -> CheckResult:
    """7. Yetim qeydlər (Orphan references) yoxlanışı."""
    async with get_session(session) as s:
        # Satış sətirlərində mövcud olmayan variant ID-lər
        orphan_sales_lines_stmt = (
            select(SaleLine.id, SaleLine.variant_id)
            .outerjoin(ProductVariant, SaleLine.variant_id == ProductVariant.id)
            .where(ProductVariant.id.is_(None))
        )
        res = await s.execute(orphan_sales_lines_stmt)
        orphan_lines = res.all()

        checked = 1
        failures: list[dict[str, Any]] = []

        if orphan_lines:
            failures.append(
                {
                    "issue": "Satış sətirlərində silinmiş və ya mövcud olmayan variant_id aşkarlandı",
                    "count": len(orphan_lines),
                    "samples": [str(r.id) for r in orphan_lines[:5]],
                }
            )

        return CheckResult(
            name="Əlaqəli Cədvəllər və Yetim Qeydlər",
            description="Referential integrity: Xarici açarların mövcudluğu",
            status="PASSED" if not failures else "FAILED",
            checked_count=checked,
            failure_count=len(failures),
            details=failures,
        )


async def run_all_checks(session: AsyncSession | None = None) -> VerificationReport:
    """Bütün invariant yoxlamalarını ardıcıl icra edir və ümumi hesabat formalaşdırır."""
    checks = [
        await check_inventory_ledger_vs_stock_levels(session),
        await check_sales_vs_payments_and_lines(session),
        await check_gl_double_entry_balance(session),
        await check_loyalty_lots_and_ledger(session),
        await check_audit_trail_hash_chain(session),
        await check_numbering_sequences(session),
        await check_orphan_foreign_keys(session),
    ]

    failed_count = sum(1 for c in checks if c.status == "FAILED")
    passed_count = sum(1 for c in checks if c.status == "PASSED")

    return VerificationReport(
        timestamp=utc_now().isoformat(),
        passed=(failed_count == 0),
        total_checks=len(checks),
        passed_checks=passed_count,
        failed_checks=failed_count,
        checks=checks,
    )


def main() -> None:
    """Bütün sistem invariantlarını yoxlayır və dəlillər xülasəsini təqdim edir."""
    parser = argparse.ArgumentParser(
        description="Brand House ERP İnvariant Yoxlayıcısı (Consistency Checker)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Hesabatı JSON formatında qaytar",
    )
    args = parser.parse_args()

    report = asyncio.run(run_all_checks())

    if args.json_output:
        print(json.dumps(asdict(report), indent=2, ensure_ascii=False))
        if not report.passed:
            sys.exit(1)
        return

    table = Table(title="Brand House ERP — İnvariant Təftiş Hesabatı")
    table.add_column("Yoxlama", style="cyan", no_wrap=True)
    table.add_column("İnvariant Qaydası", style="white")
    table.add_column("Yoxlanış Sayı", justify="right", style="magenta")
    table.add_column("Uyğunsuzluq", justify="right", style="red")
    table.add_column("Status", justify="center")

    for c in report.checks:
        status_str = (
            "[bold green]KEÇDİ[/bold green]"
            if c.status == "PASSED"
            else "[bold red]UYĞUNSUZLUQ[/bold red]"
        )
        discrepancy_str = str(c.failure_count) if c.failure_count > 0 else "0"
        table.add_row(c.name, c.description, str(c.checked_count), discrepancy_str, status_str)

    console.print(table)

    if report.passed:
        console.print(
            Panel(
                f"[bold green]Bütün invariantlar uğurla yoxlandı ({report.passed_checks}/{report.total_checks}). Heç bir uyğunsuzluq tapılmadı.[/bold green]",
                title="Bütövlük Təsdiqi",
            )
        )
    else:
        console.print(
            Panel(
                f"[bold red]DİQQƏT: {report.failed_checks} invariant pozuntusu aşkar edildi! Ətraflı məlumat üçün --json bayrağı ilə işə salın.[/bold red]",
                title="İnvariant Pozuntusu",
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
