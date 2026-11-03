"""Brand House ERP — Hesabat Çərçivəsi, Siyasətlər və Konstruktor Testləri."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, ValidationError
from app.modules.reporting.builder import ReportBuilderCompiler
from app.modules.reporting.engine import ReportEngine
from app.modules.reporting.exports import ReportExporter
from app.modules.reporting.policies import ReportingPolicy
from app.modules.reporting.report_registry import REPORT_REGISTRY, ReportColumn
from app.modules.reporting.schemas import (
    BuilderFilter,
    BuilderQuerySpec,
    BuilderSaveSpec,
    SavedReportPresetCreate,
    ScheduledReportCreate,
)
from app.modules.reporting.service import ReportingService


class MockActor:
    def __init__(
        self,
        permissions: list[str],
        roles: list[str] | None = None,
        branch_scope: list[uuid.UUID] | None = None,
    ) -> None:
        self.id = uuid.uuid4()
        self.permissions = set(permissions)
        self.roles = set(roles or [])
        self.allowed_branches = branch_scope


def test_report_registry_completeness_61_reports() -> None:
    """Sistemdə tələb olunan bütün 61 hesabatın metadatasının tamlığı."""
    assert len(REPORT_REGISTRY) >= 61
    for r_id, r_def in REPORT_REGISTRY.items():
        assert r_def.id == r_id
        assert r_def.az_title
        assert r_def.module
        assert len(r_def.columns) > 0
        for col in r_def.columns:
            assert col.key
            assert col.az_label
            assert col.type


def test_reporting_policy_column_masking() -> None:
    """Maya dəyəri və mənfəət hüququ olmayan istifadəçilərə sütunların maskalanması."""
    # Kassir istifadəçi: yalnız reports.view.sales icazəsi var
    cashier = MockActor(permissions=["reports.view.sales"])
    sales_rep = REPORT_REGISTRY["sales_daily"]

    keys = ReportingPolicy.get_visible_column_keys(cashier, sales_rep)
    assert "report_date" in keys
    assert "net_sales" in keys
    # Maya dəyəri və mənfəət sütunları olmamalıdır
    assert "cogs_amount" not in keys
    assert "gross_profit" not in keys

    # Maliyyə meneceri: cost və profit icazələri var
    fin_manager = MockActor(
        permissions=["reports.view.sales", "reports.cost.view", "reports.profit.view"]
    )
    fin_keys = ReportingPolicy.get_visible_column_keys(fin_manager, sales_rep)
    assert "cogs_amount" in fin_keys
    assert "gross_profit" in fin_keys


def test_reporting_policy_sanitize_rows() -> None:
    """Sətirlərdən icazəsiz sahələrin server tərəfində tam silinməsi."""
    visible = {"report_date", "net_sales"}
    raw_rows = [
        {
            "report_date": "2026-10-22",
            "net_sales": Decimal("100.00"),
            "cogs_amount": Decimal("60.00"),
            "gross_profit": Decimal("40.00"),
        }
    ]
    sanitized = ReportingPolicy.sanitize_rows(raw_rows, visible)
    assert len(sanitized) == 1
    row = sanitized[0]
    assert "report_date" in row
    assert "net_sales" in row
    assert "cogs_amount" not in row
    assert "gross_profit" not in row


def test_safe_report_builder_valid_query() -> None:
    """Konstruktor: Etibarlı semantik ölçü və metrikaların tərtibi."""
    admin = MockActor(permissions=["reports.builder.use", "reports.cost.view"])
    spec = BuilderQuerySpec(
        dataset="sales_lines",
        dimensions=["branch_name", "sale_date"],
        measures=["quantity", "net_total"],
        filters=[BuilderFilter(field="quantity", operator="gt", value=1)],
    )
    dims, measures = ReportBuilderCompiler.compile_and_execute(spec, admin)
    assert dims == ["branch_name", "sale_date"]
    assert measures == ["quantity", "net_total"]


def test_safe_report_builder_prevents_sql_injection_and_invalid_fields() -> None:
    """Konstruktor: Whitelist-də olmayan naməlum və ya zərərli sahələrin rədd edilməsi."""
    admin = MockActor(permissions=["reports.builder.use"])

    # 1. Mövcud olmayan sahə
    spec_invalid = BuilderQuerySpec(
        dataset="sales_lines",
        dimensions=["unknown_field_123"],
        measures=["net_total"],
    )
    with pytest.raises(ValidationError, match="naməlum sahə"):
        ReportBuilderCompiler.compile_and_execute(spec_invalid, admin)

    # 2. SQL injection cəhdi
    spec_injection = BuilderQuerySpec(
        dataset="sales_lines",
        dimensions=["branch_name; DROP TABLE users; --"],
        measures=["net_total"],
    )
    with pytest.raises(ValidationError, match="naməlum sahə"):
        ReportBuilderCompiler.compile_and_execute(spec_injection, admin)

    # 3. İcazə tələb edən sahə (maya dəyəri) icazəsiz istifadəçi üçün
    user_no_cost = MockActor(permissions=["reports.builder.use"])
    spec_cost = BuilderQuerySpec(
        dataset="sales_lines",
        dimensions=["branch_name"],
        measures=["cogs_amount"],
    )
    with pytest.raises(ForbiddenError, match="baxış hüququnuz yoxdur"):
        ReportBuilderCompiler.compile_and_execute(spec_cost, user_no_cost)


def test_report_exporter_csv_utf8_bom() -> None:
    """CSV ixracı zamanı UTF-8 BOM və başlıqların düzgün generasiyası."""
    cols = [
        ReportColumn(key="name", az_label="Ad və Soyad", type="string"),
        ReportColumn(key="sales", az_label="Satış Məbləği", type="decimal"),
    ]
    rows = [
        {"name": "Əli Əliyev", "sales": Decimal("250.50")},
        {"name": "Vüsal Şahverdiyev", "sales": Decimal("100.00")},
    ]
    csv_bytes = ReportExporter.to_csv("Nümunə Hesabat", cols, rows)
    # UTF-8 BOM yoxlanışı (0xEF, 0xBB, 0xBF)
    assert csv_bytes.startswith(b"\xef\xbb\xbf")
    decoded = csv_bytes.decode("utf-8-sig")
    assert "Ad və Soyad" in decoded
    assert "Satış Məbləği" in decoded
    assert "Əli Əliyev" in decoded
    assert "Vüsal Şahverdiyev" in decoded


def test_report_exporter_xlsx_generation() -> None:
    """XLSX formatında hesabat generasiyası."""
    cols = [
        ReportColumn(key="product", az_label="Məhsul", type="string"),
        ReportColumn(key="qty", az_label="Say", type="number"),
    ]
    rows = [{"product": "Köynək", "qty": 5}]
    xlsx_bytes = ReportExporter.to_xlsx("Məhsul Hesabatı", cols, rows)
    assert len(xlsx_bytes) > 0
    # ZIP/XLSX başlığı: PK\x03\x04
    assert xlsx_bytes.startswith(b"PK\x03\x04")


def test_report_exporter_pdf_generation() -> None:
    """PDF formatında rəsmi A4 hesabat generasiyası."""
    cols = [
        ReportColumn(key="title", az_label="Göstərici", type="string"),
        ReportColumn(key="val", az_label="Dəyər", type="string"),
    ]
    rows = [{"title": "Gəlir", "val": "5000 AZN"}]
    pdf_bytes = ReportExporter.to_pdf("Rəsmi Maliyyə Hesabatı", cols, rows)
    assert len(pdf_bytes) > 0
    # PDF başlığı: %PDF-
    assert pdf_bytes.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_report_engine_execution_and_caching(session: AsyncSession) -> None:
    """ReportEngine vasitəsilə hesabatların icrası, KPI generasiyası və keşləmə."""
    ReportEngine.invalidate_cache()
    admin = MockActor(
        permissions=[
            "reports.view.sales",
            "reports.cost.view",
            "reports.profit.view",
            "reports.view.inventory",
            "reports.view.hr",
            "reports.view.crm",
            "reports.view.marketing",
        ]
    )

    # 1. Satış hesabatı
    sales_rep = await ReportEngine.run_report(
        session=session,
        report_id="sales_daily",
        filters={"date_from": "2026-10-01", "date_to": "2026-10-31"},
        page=1,
        page_size=50,
        actor=admin,
    )
    assert sales_rep.report_id == "sales_daily"
    assert sales_rep.data_as_of is not None
    assert isinstance(sales_rep.rows, list)
    assert isinstance(sales_rep.summary_kpis, list)

    # 2. Keşdən oxuma (ikinci dəfə eyni filtrlər)
    cached_rep = await ReportEngine.run_report(
        session=session,
        report_id="sales_daily",
        filters={"date_from": "2026-10-01", "date_to": "2026-10-31"},
        page=1,
        page_size=50,
        actor=admin,
    )
    assert cached_rep.report_id == "sales_daily"

    # 3. Anbar hesabatı
    inv_rep = await ReportEngine.run_report(
        session=session,
        report_id="inventory_current_stock",
        filters={},
        page=1,
        page_size=50,
        actor=admin,
    )
    assert inv_rep.report_id == "inventory_current_stock"
    assert isinstance(inv_rep.rows, list)

    # 4. Kadr hesabatı
    hr_rep = await ReportEngine.run_report(
        session=session,
        report_id="hr_headcount",
        filters={},
        page=1,
        page_size=50,
        actor=admin,
    )
    assert hr_rep.report_id == "hr_headcount"
    assert len(hr_rep.rows) >= 1

    # 5. Ümumi fallback hesabatı (CRM)
    crm_rep = await ReportEngine.run_report(
        session=session,
        report_id="crm_customer_retention",
        filters={},
        page=1,
        page_size=50,
        actor=admin,
    )
    assert crm_rep.report_id == "crm_customer_retention"
    assert len(crm_rep.rows) >= 1


@pytest.mark.asyncio
async def test_reporting_service_presets_and_schedules_crud(session: AsyncSession) -> None:
    """Hesabat presetləri, avtomatik çatdırılma və konstruktor şablonları idarəetməsi."""
    admin = MockActor(
        permissions=[
            "reports.view.sales",
            "reports.schedule.manage",
            "reports.builder.use",
            "reports.builder.share",
        ]
    )
    service = ReportingService(session)

    # 1. Preset yaratmaq, siyahılamaq və silmək
    p_create = SavedReportPresetCreate(
        name="Test Şablon",
        filters={"branch_id": str(uuid.uuid4())},
        is_shared=False,
    )
    preset = await service.create_preset("sales_daily", p_create, actor=admin)
    assert preset.name == "Test Şablon"

    presets = await service.list_presets(actor=admin, report_id="sales_daily")
    assert len(presets) >= 1

    deleted = await service.delete_preset(preset.id, actor=admin)
    assert deleted is True

    # 2. Schedule yaratmaq və siyahılamaq
    s_create = ScheduledReportCreate(
        name="Həftəlik Satış",
        cron_expression="0 10 * * 1",
        channel="EMAIL",
        destination="manager@brandhouse.az",
        filters={},
    )
    sched = await service.create_schedule("sales_daily", s_create, actor=admin)
    assert sched.name == "Həftəlik Satış"

    schedules = await service.list_schedules(actor=admin)
    assert len(schedules) >= 1

    # 3. Builder şablonu yadda saxlamaq və siyahılamaq
    b_spec = BuilderSaveSpec(
        name="Filial Satışları Xülasəsi",
        dataset="sales_lines",
        spec=BuilderQuerySpec(
            dataset="sales_lines",
            dimensions=["branch_name"],
            measures=["net_total"],
        ),
        is_shared=True,
    )
    saved_spec = await service.save_builder_spec(b_spec, actor=admin)
    assert saved_spec.name == "Filial Satışları Xülasəsi"

    specs = await service.list_builder_specs(actor=admin)
    assert len(specs) >= 1
