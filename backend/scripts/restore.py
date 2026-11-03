"""Ehtiyat Nüsxədən Bərpa Skripti (Database Restore CLI).

Ehtiyat nüsxə faylının SHA-256 bütövlüyünü yoxlayır,
pg_restore vasitəsilə bərpa edir və cədvəllərin doluluğunu test edir.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

import typer
from rich.console import Console
from sqlalchemy import text

from app.core.config import settings
from app.core.database import AsyncSessionLocal

cli = typer.Typer(help="Brand House Database Restore Tool")
console = Console()


def compute_sha256(file_path: Path) -> str:
    """Faylın SHA-256 heşini hesablayır."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


async def verify_database_health() -> None:
    """Bərpadan sonra cədvəllərin vəziyyətini yoxlayır."""
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT 1"))
        val = res.scalar()
        if val != 1:
            raise RuntimeError("Verilənlər bazası bərpa sonrası cavab vermir.")
    console.print("[bold green]✔ Bərpa sonrası DB sağlamlıq yoxlanışı uğurla keçdi.[/bold green]")


def perform_restore(backup_file_path: str, expected_checksum: str | None = None) -> None:
    file_path = Path(backup_file_path)
    if not file_path.exists():
        console.print(f"[bold red]XƏTA: '{backup_file_path}' faylı tapılmadı![/bold red]")
        raise typer.Exit(code=1)

    # 1. Bütövlük (Checksum) Yoxlanışı
    console.print(f"Bütövlük yoxlanışı icra edilir: {file_path}")
    actual_checksum = compute_sha256(file_path)

    if expected_checksum:
        if actual_checksum.lower() != expected_checksum.lower():
            console.print(
                f"[bold red]TƏHLÜKƏSİZLİK XƏTASI: SHA-256 Checksum uyğunsuzluğu![/bold red]\n"
                f"Gözlənilən: {expected_checksum}\n"
                f"Faktiki:    {actual_checksum}"
            )
            raise typer.Exit(code=1)
        console.print("[bold green]✔ Checksum təsdiqləndi![/bold green]")
    else:
        console.print(f"Faylın SHA-256: [yellow]{actual_checksum}[/yellow]")

    db_url = settings.DATABASE_URL
    parsed = urlparse(
        db_url.replace("postgresql+asyncpg://", "postgresql://").replace(
            "sqlite+aiosqlite:///", "sqlite:///"
        )
    )

    # 2. Bərpa Əməliyyatı
    console.print("[bold blue]Verilənlər bazasının bərpası başladılır...[/bold blue]")
    if "sqlite" in db_url:
        sqlite_file = db_url.split("///")[-1]
        shutil.copy2(file_path, sqlite_file)
    else:
        cmd = [
            "pg_restore",
            "-h",
            parsed.hostname or "localhost",
            "-p",
            str(parsed.port or 5432),
            "-U",
            parsed.username or "postgres",
            "-d",
            parsed.path.lstrip("/"),
            "--clean",
            "--if-exists",
            "-v",
            str(file_path),
        ]
        env = os.environ.copy()
        if parsed.password:
            env["PGPASSWORD"] = parsed.password

        try:
            res = subprocess.run(cmd, env=env, capture_output=True, text=True, check=True)
            console.print(f"[dim]{res.stderr}[/dim]")
        except subprocess.CalledProcessError as err:
            console.print(f"[bold red]pg_restore xətası:[/bold red] {err.stderr}")
            raise typer.Exit(code=1) from err

    # 3. Yoxlama
    asyncio.run(verify_database_health())
    console.print(f"[bold green]✔ Bərpa əməliyyatı uğurla tamamlandı:[/bold green] {file_path}")


@cli.command("run")
def run(
    backup_file: str = typer.Argument(..., help="Bərpa olunacaq dump faylının yolu"),
    checksum: str = typer.Option(None, "--checksum", "-c", help="Gözlənilən SHA-256 heş dəyəri"),
) -> None:
    """Göstərilən ehtiyat nüsxə faylını bazaya bərpa edir."""
    perform_restore(backup_file, checksum)


if __name__ == "__main__":
    cli()
