"""Sənəd Nömrələnməsi və Paralellik (Concurrency) Testləri."""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime

import pytest

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.company.service import CompanyService
from app.modules.numbering.schemas import (
    NumberingPreviewRequest,
    NumberingSequenceCreate,
)
from app.modules.numbering.service import NumberingService


class MockActor:
    def __init__(self, roles: list[str], permissions: list[str] | None = None) -> None:
        self.id = generate_uuid7()
        self.roles = roles
        self.permissions = permissions or []


@pytest.mark.asyncio
async def test_numbering_format_and_preview_tokens() -> None:
    service = NumberingService()

    # 1. Formatlaşdırma funksiyası
    formatted = service.format_pattern(
        pattern="{PREFIX}-{BRANCH}-{REGISTER}-{YYYY}{MM}-{SEQ:6}",
        prefix="RCP",
        branch_code="28MAY",
        register_code="REG01",
        seq_num=42,
        dt=datetime(2026, 10, 19, 12, 0, 0),
    )
    assert formatted == "RCP-28MAY-REG01-202610-000042"

    # 2. Önizlənmə (Preview)
    req = NumberingPreviewRequest(
        pattern="{PREFIX}-{BRANCH}-{YYYY}-{SEQ:4}",
        prefix="INV",
        branch_code="HQ",
        sequence_number=7,
        sample_date=datetime(2026, 1, 1),
    )
    preview = service.preview_pattern(req)
    assert preview.preview_number == "INV-HQ-2026-0007"
    assert "{PREFIX}" in preview.tokens_used
    assert "{BRANCH}" in preview.tokens_used


@pytest.mark.asyncio
async def test_numbering_reset_rules() -> None:
    service = NumberingService()

    # Never
    assert service.should_reset("never", date(2025, 1, 1), date(2026, 1, 1)) is False

    # Yearly
    assert service.should_reset("yearly", date(2025, 12, 31), date(2026, 1, 1)) is True
    assert service.should_reset("yearly", date(2026, 5, 1), date(2026, 6, 1)) is False

    # Monthly
    assert service.should_reset("monthly", date(2026, 1, 31), date(2026, 2, 1)) is True
    assert service.should_reset("monthly", date(2026, 2, 10), date(2026, 2, 15)) is False

    # Daily
    assert service.should_reset("daily", date(2026, 10, 18), date(2026, 10, 19)) is True
    assert service.should_reset("daily", date(2026, 10, 19), date(2026, 10, 19)) is False


@pytest.mark.asyncio
async def test_numbering_gapless_rollback_leaves_no_gap() -> None:
    """Tranzaksiya rollback edildikdə fasiləsiz (gapless) qəbzlərdə nömrə itkisinin olmaması."""
    comp_svc = CompanyService()
    company = await comp_svc.get_company()

    service = NumberingService()
    admin = MockActor(roles=["system_admin"])

    # Xüsusi qəbz ardıcıllığı
    seq_dto = NumberingSequenceCreate(
        document_type="tax_receipt_test",
        name="Test Fiskal Qəbzlər",
        prefix="FRCP",
        pattern="{PREFIX}-{SEQ:6}",
        is_gapless=True,
    )
    await service.create_sequence(seq_dto, company_id=company.id, actor=admin)

    # 1. Uğurlu ilk nömrə ayrılması
    num1 = await service.next("tax_receipt_test", company_id=company.id, actor=admin)
    assert num1 == "FRCP-000001"

    # 2. Tranzaksiya daxilində nömrə ayrılır, lakin tranzaksiya ləğv edilir (Rollback)
    try:
        async with UnitOfWork() as uow:
            num_aborted = await service.next(
                "tax_receipt_test",
                company_id=company.id,
                session=uow.session,
                actor=admin,
            )
            assert num_aborted == "FRCP-000002"
            # Qəsdən xəta atırıq və tranzaksiyanı commit etmirik
            raise RuntimeError("Kassa xətası: Çap baş tutmadı!")
    except RuntimeError:
        pass

    # 3. Növbəti qanuni sorğu gəlir - Nömrə itkisi olmadan yenidən 000002 verilməlidir!
    num2 = await service.next("tax_receipt_test", company_id=company.id, actor=admin)
    assert num2 == "FRCP-000002"

    num3 = await service.next("tax_receipt_test", company_id=company.id, actor=admin)
    assert num3 == "FRCP-000003"


@pytest.mark.asyncio
async def test_numbering_concurrency_hammer_200_allocations() -> None:
    """200 paralel sorğu ilə yarış vəziyyətinin sınanması:

    - Heç bir təkrar (duplicate) nömrə olmamalıdır.
    - Bütün nömrələr fasiləsiz 1-dən 200-ə qədər ardıcıl olmalıdır.
    """
    comp_svc = CompanyService()
    company = await comp_svc.get_company()

    service = NumberingService()
    admin = MockActor(roles=["system_admin"])

    doc_type = f"stress_test_{uuid.uuid4().hex[:6]}"
    seq_dto = NumberingSequenceCreate(
        document_type=doc_type,
        name="Paralel Stress Test",
        prefix="STR",
        pattern="{PREFIX}-{SEQ:6}",
        is_gapless=True,
    )
    await service.create_sequence(seq_dto, company_id=company.id, actor=admin)

    total_requests = 200

    # 200 paralel sorğu başladırıq
    tasks = [
        service.next(doc_type, company_id=company.id, actor=admin) for _ in range(total_requests)
    ]
    results = await asyncio.gather(*tasks)

    # 1. 200 ədəd nəticə qayıtmalıdır
    assert len(results) == total_requests

    # 2. Təkrar nömrə (duplicate) OLMAMALIDIR
    unique_results = set(results)
    assert len(unique_results) == total_requests

    # 3. Bütün nömrələr 1-dən 200-ə qədər fasiləsiz (gapless) olmalıdır
    sequence_numbers = sorted(int(r.split("-")[1]) for r in results)
    expected_sequences = list(range(1, total_requests + 1))
    assert sequence_numbers == expected_sequences
