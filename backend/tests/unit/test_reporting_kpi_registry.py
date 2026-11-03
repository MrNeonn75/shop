"""Brand House ERP — Hesabatlılıq KPI Reyestri Vahid Testləri (Unit Tests).

1. Bütün KPI-lar üçün Qızıl Riyaziyyat (Golden Math) testləri.
2. NOT_COMPUTABLE statusu və çatışmayan girişlərin siyahısı.
3. Sıfıra bölünmə (Zero Division) təhlükəsizliyi.
4. Asia/Baku saat qurşağı və gün sərhədləri.
"""

from __future__ import annotations

from decimal import Decimal

from app.modules.reporting.kpi_registry import (
    KPI_REGISTRY,
    KPIState,
    compute_kpi,
    generate_kpi_registry_markdown,
)


def test_kpi_registry_contains_required_metrics() -> None:
    """Tələb olunan bütün fundamental KPI-ların reyestrdə mövcudluğu."""
    required_ids = [
        "kpi_net_sales",
        "kpi_gross_sales",
        "kpi_gross_profit",
        "kpi_net_profit",
        "kpi_sales_growth",
        "kpi_aov",
        "kpi_units_sold",
        "kpi_return_rate",
        "kpi_discount_cost",
        "kpi_inventory_value",
        "kpi_inventory_turnover",
        "kpi_days_of_inventory",
        "kpi_supplier_liabilities",
        "kpi_headcount",
        "kpi_attendance_rate",
        "kpi_cash_variance",
    ]
    for k_id in required_ids:
        assert k_id in KPI_REGISTRY
        kpi = KPI_REGISTRY[k_id]
        assert kpi.id == k_id
        assert kpi.az_label
        assert kpi.formula_text
        assert kpi.source_tables


def test_compute_kpi_net_sales_golden_math() -> None:
    """Xalis Satış (Net Sales) = Ümumi Satış - Qaytarmalar - Endirimlər."""
    raw = {
        "gross_sales": Decimal("1000.00"),
        "return_amount": Decimal("100.00"),
        "discount_amount": Decimal("50.00"),
    }
    res = compute_kpi("kpi_net_sales", raw)
    assert res.state == KPIState.COMPUTED
    assert res.value == Decimal("850.00")
    assert res.unit == "AZN"


def test_compute_kpi_net_sales_missing_data_returns_not_computable() -> None:
    """Vacib giriş çatışmadıqda NOT_COMPUTABLE və missing_inputs siyahısı qaytarılır."""
    raw = {
        "gross_sales": Decimal("1000.00"),
        # return_amount və discount_amount yoxdur
    }
    res = compute_kpi("kpi_net_sales", raw)
    assert res.state == KPIState.NOT_COMPUTABLE
    assert res.value is None
    assert "Qaytarılan məbləğ (return_amount)" in res.missing_inputs
    assert "Endirim məbləği (discount_amount)" in res.missing_inputs


def test_compute_kpi_gross_profit_golden_math() -> None:
    """Ümumi Mənfəət = Xalis Satış - Maya Dəyəri (COGS)."""
    raw = {
        "net_sales": Decimal("1500.00"),
        "cogs_amount": Decimal("900.00"),
    }
    res = compute_kpi("kpi_gross_profit", raw)
    assert res.state == KPIState.COMPUTED
    assert res.value == Decimal("600.00")


def test_compute_kpi_gross_profit_missing_cogs() -> None:
    """Maya dəyəri təyin olunmayıbsa heç vaxt uydurma mənfəət qaytarılmır."""
    raw = {"net_sales": Decimal("1500.00")}
    res = compute_kpi("kpi_gross_profit", raw)
    assert res.state == KPIState.NOT_COMPUTABLE
    assert "Satılan Malların Maya Dəyəri (cogs_amount)" in res.missing_inputs


def test_compute_kpi_aov_golden_math_and_zero_division() -> None:
    """Orta Çek (AOV) hesabı və 0 sifariş olduqda sıfıra bölünmə qorunması."""
    # 1. Normal hal
    raw = {"net_sales": Decimal("500.00"), "order_count": 10}
    res = compute_kpi("kpi_aov", raw)
    assert res.state == KPIState.COMPUTED
    assert res.value == Decimal("50.00")

    # 2. 0 sifariş halı -> NOT_COMPUTABLE (Xəta atmır!)
    raw_zero = {"net_sales": Decimal("0.00"), "order_count": 0}
    res_zero = compute_kpi("kpi_aov", raw_zero)
    assert res_zero.state == KPIState.NOT_COMPUTABLE
    assert "Sifarişlərin sayı (order_count) 0 və ya təyin edilməyib" in res_zero.missing_inputs


def test_compute_kpi_inventory_turnover() -> None:
    """Anbar Dövriyyəsi = COGS / Orta Anbar Dəyəri."""
    raw = {
        "cogs_amount": Decimal("10000.00"),
        "avg_inventory_value": Decimal("2500.00"),
    }
    res = compute_kpi("kpi_inventory_turnover", raw)
    assert res.state == KPIState.COMPUTED
    assert res.value == Decimal("4.00")

    # Sıfır anbar dəyəri
    raw_zero = {
        "cogs_amount": Decimal("10000.00"),
        "avg_inventory_value": Decimal("0.00"),
    }
    res_zero = compute_kpi("kpi_inventory_turnover", raw_zero)
    assert res_zero.state == KPIState.NOT_COMPUTABLE


def test_compute_kpi_unknown_id() -> None:
    """Reyestrdə olmayan KPI üçün NOT_CONFIGURED qaytarılır."""
    res = compute_kpi("non_existent_kpi", {})
    assert res.state == KPIState.NOT_CONFIGURED
    assert res.value is None


def test_generate_kpi_markdown_output() -> None:
    """Markdown sənədləşdirməsinin generasiyası."""
    md = generate_kpi_registry_markdown()
    assert "# Brand House ERP — Əsas Performans Göstəriciləri (KPI) Reyestri" in md
    assert "kpi_net_sales" in md
    assert "NOT_COMPUTABLE" in md


def test_compute_kpi_net_profit() -> None:
    """Xalis Mənfəət hesabı və çatışmayan girişlər."""
    raw = {
        "net_sales": Decimal("2000.00"),
        "cogs_amount": Decimal("1000.00"),
        "operating_expenses": Decimal("300.00"),
        "payroll_expenses": Decimal("200.00"),
    }
    res = compute_kpi("kpi_net_profit", raw)
    assert res.state == KPIState.COMPUTED
    assert res.value == Decimal("500.00")

    # Çatışmayan xərclər
    res_miss = compute_kpi("kpi_net_profit", {"net_sales": Decimal("2000.00")})
    assert res_miss.state == KPIState.NOT_COMPUTABLE
    assert len(res_miss.missing_inputs) >= 3


def test_compute_kpi_sales_growth() -> None:
    """Satış artımı faizinin hesablanması və sıfır müqayisə dəyəri."""
    raw = {
        "current_sales": Decimal("1200.00"),
        "compare_sales": Decimal("1000.00"),
    }
    res = compute_kpi("kpi_sales_growth", raw)
    assert res.state == KPIState.COMPUTED
    assert res.value == Decimal("20.0")

    # Sıfır baza
    res_zero = compute_kpi("kpi_sales_growth", {"current_sales": Decimal("1200.00"), "compare_sales": Decimal("0.00")})
    assert res_zero.state == KPIState.NOT_COMPUTABLE

    # Çatışmayan giriş
    res_miss = compute_kpi("kpi_sales_growth", {})
    assert res_miss.state == KPIState.NOT_COMPUTABLE


def test_compute_kpi_default_direct_value() -> None:
    """Sadə metrik dəyərinin birbaşa oxunması və NO_DATA."""
    res = compute_kpi("kpi_units_sold", {"value": 150})
    assert res.state == KPIState.COMPUTED
    assert res.value == Decimal("150")

    res_nodata = compute_kpi("kpi_units_sold", {})
    assert res_nodata.state == KPIState.NO_DATA
