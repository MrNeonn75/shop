"""İnventar İdarəetmə və Balans Bərpası CLI Aləti (Inventory CLI).

Stok balanslarının jurnaldan (Ledger) yenidən hesablanması, uyğunluq (drift) yoxlanışı
və dövri qalıq snapshot-larının generasiyası.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date
from decimal import Decimal

import typer
from rich.console import Console
from rich.table import Table

from app.core.database import AsyncSessionLocal, utc_now
from app.core.ids import generate_uuid7
from app.modules.company.service import get_company_service
from app.modules.inventory.models import StockSnapshot
from app.modules.inventory.repository import InventoryRepository
from app.modules.inventory.service import get_inventory_service

cli = typer.Typer(help="Brand House İnventar və Balans Bərpası CLI Aləti")
console = Console()


async def _run_reconcile(
    warehouse_id: uuid.UUID | None = None,
    variant_id: uuid.UUID | None = None,
) -> None:
    company = await get_company_service().get_company()
    service = get_inventory_service()

    console.print(f"[bold cyan]Balans uyğunluq yoxlanışı başladılır...[/bold cyan] (Şirkət: {company.name})")
    report = await service.reconcile_balances(
        company_id=company.id,
        warehouse_id=warehouse_id,
        variant_id=variant_id,
    )

    if report.status == "OK":
        console.print("[bold green]Təbriklər! Heç bir uyğunsuzluq (drift) aşkar edilmədi. Qalıqlar tam dəqiqdir.[/bold green]")
        return

    console.print(f"[bold red]DİQQƏT: {report.drifts_count} ədəd uyğunsuzluq aşkarlandı![/bold red]")
    table = Table(title="Aşkarlanan Uyğunsuzluqlar (Drifts)")
    table.add_column("Anbar ID", style="cyan")
    table.add_column("Variant ID", style="magenta")
    table.add_column("Status", style="yellow")
    table.add_column("Balans Cədvəli", justify="right")
    table.add_column("Ledger Hesablanan", justify="right")
    table.add_column("Fərq (Drift)", justify="right", style="bold red")

    for d in report.drifts:
        table.add_row(
            str(d.warehouse_id),
            str(d.variant_id),
            d.stock_status,
            str(d.balance_on_hand),
            str(d.ledger_calculated_on_hand),
            str(d.drift),
        )
    console.print(table)


@cli.command("reconcile")
def reconcile(
    warehouse_id: uuid.UUID | None = typer.Option(None, help="Filtr üçün anbar ID-si"),
    variant_id: uuid.UUID | None = typer.Option(None, help="Filtr üçün məhsul variantı ID-si"),
) -> None:
    """Stok balansları ilə Ledger hərəkətləri arasındakı uyğunluğu yoxlayır."""
    asyncio.run(_run_reconcile(warehouse_id, variant_id))


async def _run_rebuild(
    warehouse_id: uuid.UUID | None = None,
    variant_id: uuid.UUID | None = None,
) -> None:
    company = await get_company_service().get_company()
    service = get_inventory_service()

    console.print("[bold yellow]Balansların Ledger əsasında bərpası başladılır...[/bold yellow]")
    res = await service.rebuild_balances(
        company_id=company.id,
        warehouse_id=warehouse_id,
        variant_id=variant_id,
    )
    console.print(f"[bold green]{res.message}[/bold green]")


@cli.command("rebuild-balances")
def rebuild_balances(
    warehouse_id: uuid.UUID | None = typer.Option(None, help="Filtr üçün anbar ID-si"),
    variant_id: uuid.UUID | None = typer.Option(None, help="Filtr üçün məhsul variantı ID-si"),
) -> None:
    """Bütün stok balanslarını sıfırdan Ledger jurnalındakı hərəkətlərlə bərpa edir."""
    asyncio.run(_run_rebuild(warehouse_id, variant_id))


async def _run_snapshot(
    warehouse_id: uuid.UUID | None = None,
    snapshot_date: date | None = None,
) -> None:
    company = await get_company_service().get_company()
    target_date = snapshot_date or utc_now().date()

    console.print(f"[bold cyan]Tarixi qalıq snapshot-ı götürülür... Tarix: {target_date}[/bold cyan]")
    async with AsyncSessionLocal() as session:
        repo = InventoryRepository(session)
        balances = await repo.list_balances(
            company_id=company.id,
            warehouse_id=warehouse_id,
            limit=50000,
        )

        created_count = 0
        for b in balances:
            snap = StockSnapshot(
                id=generate_uuid7(),
                company_id=company.id,
                warehouse_id=b["warehouse_id"],
                variant_id=b["variant_id"],
                stock_status=b["stock_status"],
                snapshot_date=target_date,
                quantity=b["on_hand"],
                unit_cost=Decimal("0.0000"),
                total_value=Decimal("0.0000"),
            )
            session.add(snap)
            created_count += 1

        await session.commit()
        console.print(f"[bold green]{created_count} qalıq qeydi snapshot olaraq saxlanıldı.[/bold green]")


@cli.command("snapshot")
def snapshot(
    warehouse_id: uuid.UUID | None = typer.Option(None, help="Filtr üçün anbar ID-si"),
) -> None:
    """Cari balansların dövri snapshot-ını yaradır."""
    asyncio.run(_run_snapshot(warehouse_id))


if __name__ == "__main__":
    cli()

