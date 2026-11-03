"""Brand House ERP — Biznes İntellekti (BI), Anomaliyalar və Proqnozlaşdırma Testləri."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.bi_service import BusinessIntelligenceService
from app.modules.analytics.dashboard import DashboardService
from app.modules.analytics.models import ChartAnnotation, SalesTarget, TargetStatus
from app.modules.analytics.repository import AnalyticsRepository
from app.modules.analytics.schemas import DashboardCompareMode


class MockAdmin:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.company_id = uuid.uuid4()
        self.permissions = {
            "bi.view",
            "bi.targets.manage",
            "dashboard.view.executive",
            "dashboard.view.branch",
            "reports.cost.view",
            "reports.profit.view",
            "system.branches.all",
        }
        self.roles = {"system_admin"}
        self.allowed_branches = None


class MockCashier:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.company_id = uuid.uuid4()
        self.permissions = {
            "bi.view",
            "dashboard.view.cashier",
            "dashboard.view.executive",
        }
        self.roles = {"cashier"}
        self.allowed_branches = None


@pytest.mark.asyncio
async def test_sales_targets_lifecycle(session: AsyncSession) -> None:
    """Satış hədəflərinin yaradılması və təsdiqlənməsi (DRAFT -> APPROVED)."""
    repo = AnalyticsRepository(session)
    admin = MockAdmin()

    target = SalesTarget(
        company_id=admin.company_id,
        year=2026,
        month=10,
        target_amount=Decimal("150000.00"),
        status=TargetStatus.DRAFT.value,
        created_by=admin.id,
    )
    created = await repo.create_sales_target(target)
    assert created.status == TargetStatus.DRAFT.value
    assert created.target_amount == Decimal("150000.00")

    # Təsdiqlənmə
    created.status = TargetStatus.APPROVED.value
    created.approved_by = admin.id
    await session.flush()

    fetched = await repo.get_sales_target(created.id)
    assert fetched is not None
    assert fetched.status == TargetStatus.APPROVED.value
    assert fetched.approved_by == admin.id


@pytest.mark.asyncio
async def test_bi_inventory_intelligence(session: AsyncSession) -> None:
    """Anbar intellekti: Sifariş tövsiyəsi və endirim (markdown) namizədləri."""
    bi = BusinessIntelligenceService(session)
    admin = MockAdmin()

    res = await bi.get_inventory_intelligence(actor=admin)
    assert res.data_as_of is not None
    assert isinstance(res.reorder_suggestions, list)
    assert isinstance(res.markdown_candidates, list)


@pytest.mark.asyncio
async def test_bi_customer_intelligence(session: AsyncSession) -> None:
    """Müştəri analitikası: RFM seqmentləri, səbət assosiasiyası və itirilmə riski."""
    bi = BusinessIntelligenceService(session)
    admin = MockAdmin()

    res = await bi.get_customer_intelligence(actor=admin)
    assert res.data_as_of is not None
    assert len(res.rfm_segments) > 0
    # RFM kateqoriyaları yoxlanılır
    segment_names = [s.segment_name for s in res.rfm_segments]
    assert "Çempionlar (VIP)" in segment_names
    assert "Passiv / Risk Altında" in segment_names
    assert len(res.basket_rules) > 0
    assert isinstance(res.churn_risk_list, list)


@pytest.mark.asyncio
async def test_bi_profitability_leakage(session: AsyncSession) -> None:
    """Gəlirlilik və sızma analitikası."""
    bi = BusinessIntelligenceService(session)
    admin = MockAdmin()

    res = await bi.get_profitability_analytics(
        _date_from=date(2026, 10, 1), _date_to=date(2026, 10, 31), actor=admin
    )
    assert res.gross_margin_percent is not None
    assert res.gross_margin_percent == Decimal("41.8")
    assert res.discount_leakage_amount > Decimal("0.00")
    assert res.return_cost_amount > Decimal("0.00")


@pytest.mark.asyncio
async def test_bi_anomaly_detection_rules(session: AsyncSession) -> None:
    """Qaydalar əsasında anomaliyaların aşkarlanması (Anomalies)."""
    bi = BusinessIntelligenceService(session)
    admin = MockAdmin()

    anomalies = await bi.detect_anomalies(actor=admin)
    assert len(anomalies) > 0
    rule_codes = [a.rule_code for a in anomalies]
    assert "RULE_DISCOUNT_SPIKE" in rule_codes
    assert "RULE_CASH_VARIANCE" in rule_codes


@pytest.mark.asyncio
async def test_bi_forecasting_with_mae_mape_metrics(session: AsyncSession) -> None:
    """Hərəkətli orta və mövsümlülük proqnozu və MAE / MAPE xəta metrikləri."""
    bi = BusinessIntelligenceService(session)

    res = bi.compute_sales_forecast(horizon_days=7)
    assert len(res.points) == 7
    assert res.mae >= Decimal("0.00")
    assert res.mape >= Decimal("0.00")
    assert res.method == "Moving Average"


@pytest.mark.asyncio
async def test_bi_targets_vs_actuals(session: AsyncSession) -> None:
    """Hədəflər və faktiki icra analitikası (Targets vs Actuals)."""
    bi = BusinessIntelligenceService(session)
    admin = MockAdmin()
    perf = await bi.get_performance_analytics(year=2026, month=10, actor=admin)
    assert perf.data_as_of is not None
    assert isinstance(perf.branch_ranking, list)
    assert isinstance(perf.targets_vs_actuals, list)
    assert perf.overall_growth_percent is not None


@pytest.mark.asyncio
async def test_dashboard_service_executive_and_branch(session: AsyncSession) -> None:
    """DashboardService tam aqreqasiyası, keşləmə və hüquq məhdudiyyətləri."""
    DashboardService.invalidate_cache()
    admin = MockAdmin()
    cashier = MockCashier()

    # 1. Rəhbərlik görünüşü (Bütün KPI-lar, maya dəyəri və mənfəət daxil)
    dash_admin = await DashboardService.get_dashboard(
        session=session,
        branch_ids=[],
        date_from=date(2026, 10, 1),
        date_to=date(2026, 10, 31),
        compare=DashboardCompareMode.PREV_PERIOD,
        actor=admin,
    )
    assert dash_admin.data_as_of is not None
    assert len(dash_admin.kpis) >= 6
    kpi_ids = [k.definition_id for k in dash_admin.kpis]
    assert "kpi_gross_profit" in kpi_ids
    assert "kpi_inventory_value" in kpi_ids
    assert "sales_trend" in dash_admin.widgets
    assert "payment_mix" in dash_admin.widgets

    # 2. Kassir görünüşü (Maya dəyəri və mənfəət KPI-ları gizlədilir)
    dash_cashier = await DashboardService.get_dashboard(
        session=session,
        branch_ids=[],
        date_from=None,
        date_to=None,
        compare=DashboardCompareMode.PREV_PERIOD,
        actor=cashier,
    )
    c_kpi_ids = [k.definition_id for k in dash_cashier.kpis]
    assert "kpi_gross_profit" not in c_kpi_ids
    assert "kpi_net_profit" not in c_kpi_ids
    assert "kpi_inventory_value" not in c_kpi_ids


@pytest.mark.asyncio
async def test_chart_annotations_crud(session: AsyncSession) -> None:
    """Qrafik annotasiyalarının yaradılması və filtrasiyası."""
    repo = AnalyticsRepository(session)
    admin = MockAdmin()

    annot = ChartAnnotation(
        company_id=admin.company_id,
        created_by=admin.id,
        series_name="sales_trend",
        annotation_date=date(2026, 10, 15),
        note="Mövsüm Sonu Endirimi Başladı",
        category="MARKETING",
    )
    created = await repo.create_annotation(annot)
    assert created.id is not None
    assert created.note == "Mövsüm Sonu Endirimi Başladı"

    fetched = await repo.list_annotations(series_name="sales_trend")
    assert len(fetched) >= 1
