"""Mərkəzi KPI Reyestri (KPI Registry & Definitions).

Hər bir göstərici üçün:
- id: unikal identifikator
- az_label: Azərbaycan dilində rəsmi ad
- formula_text: riyazi/məntiqi düstur
- unit: ölçü vahidi (AZN, %, ədəd, gün, əmsal)
- source_tables: ilkin mənbə cədvəlləri
- caveats: məhdudiyyətlər, istisnalar və xüsusi hallar
- computable_fn: hesablama və çatışmayan girişlərin analizi funksiyası
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Any


class KPIState(str, Enum):
    COMPUTED = "COMPUTED"
    NO_DATA = "NO_DATA"
    NOT_COMPUTABLE = "NOT_COMPUTABLE"
    NOT_CONFIGURED = "NOT_CONFIGURED"


@dataclass(frozen=True)
class KPIDefinition:
    id: str
    az_label: str
    category: str
    formula_text: str
    unit: str
    source_tables: list[str]
    caveats: str
    required_permissions: list[str] = field(default_factory=list)


@dataclass
class KPIValueResult:
    definition_id: str
    state: KPIState
    value: Decimal | None
    unit: str
    missing_inputs: list[str] = field(default_factory=list)
    caveats: str = ""
    compare_value: Decimal | None = None
    delta: Decimal | None = None
    delta_percent: Decimal | None = None
    sparkline: list[Decimal] = field(default_factory=list)


KPI_REGISTRY: dict[str, KPIDefinition] = {
    # -----------------------------------------------------------------
    # SATIŞ VƏ GƏLİR METRİKALARI
    # -----------------------------------------------------------------
    "kpi_net_sales": KPIDefinition(
        id="kpi_net_sales",
        az_label="Xalis Satış Gəliri (Net Sales)",
        category="Sales",
        formula_text="Ümumi Satış - Qaytarmalar - Kassa və Promokod Endirimləri (ƏDV xaric)",
        unit="AZN",
        source_tables=["sales", "sale_lines", "sale_returns", "sale_return_lines"],
        caveats="Yalnız uğurla tamamlanmış (COMPLETED) satışlar nəzərə alınır. Vergi (ƏDV) daxil deyil.",
        required_permissions=["reports.view.sales"],
    ),
    "kpi_gross_sales": KPIDefinition(
        id="kpi_gross_sales",
        az_label="Ümumi Satış (Gross Sales)",
        category="Sales",
        formula_text="Σ (Sətir Sayı * Standart Satış Qiyməti)",
        unit="AZN",
        source_tables=["sales", "sale_lines"],
        caveats="Endirimlər və qaytarmalar çıxılmadan əvvəlki ilkin satış məbləğidir.",
        required_permissions=["reports.view.sales"],
    ),
    "kpi_gross_profit": KPIDefinition(
        id="kpi_gross_profit",
        az_label="Ümumi Mənfəət (Gross Profit)",
        category="Profitability",
        formula_text="Xalis Satış Gəliri - Satılan Malların Maya Dəyəri (COGS)",
        unit="AZN",
        source_tables=["sale_lines", "inventory_cost_states", "reporting_daily_sales_summary"],
        caveats="Satış anında qeydə alınmış maya dəyəri (cost snapshot) əsas götürülür. reports.profit.view hüququ tələb olunur.",
        required_permissions=["reports.profit.view", "reports.cost.view"],
    ),
    "kpi_net_profit": KPIDefinition(
        id="kpi_net_profit",
        az_label="Xalis Əməliyyat Mənfəəti (Net Profit)",
        category="Profitability",
        formula_text="Ümumi Mənfəət - Əməliyyat Xərcləri - Əmək Haqqı Xərcləri - Digər Xərclər",
        unit="AZN",
        source_tables=["sale_lines", "expenses", "payroll_runs", "reporting_expense_summary"],
        caveats="Əgər maya dəyəri və ya dövr xərcləri tam bağlanmayıbsa NOT_COMPUTABLE qaytarılır.",
        required_permissions=["reports.profit.view", "reports.view.finance"],
    ),
    "kpi_sales_growth": KPIDefinition(
        id="kpi_sales_growth",
        az_label="Satış Artımı Faizlə (Sales Growth %)",
        category="Sales",
        formula_text="((Cari Dövr Satışı - Müqayisə Dövrü Satışı) / Müqayisə Dövrü Satışı) * 100",
        unit="%",
        source_tables=["reporting_daily_sales_summary"],
        caveats="Müqayisə dövründə satış 0 olduqda riyazi olaraq bölünmə mümkün deyil, NOT_COMPUTABLE qaytarılır.",
        required_permissions=["reports.view.sales"],
    ),
    "kpi_aov": KPIDefinition(
        id="kpi_aov",
        az_label="Orta Çek Məbləği (Average Order Value - AOV)",
        category="Sales",
        formula_text="Xalis Satış / Tamamlanmış Qəbzlərin Sayı",
        unit="AZN",
        source_tables=["sales"],
        caveats="Qaytarma qəbzləri və ləğv edilmiş satışlar bu saya daxil edilmir.",
        required_permissions=["reports.view.sales"],
    ),
    "kpi_units_sold": KPIDefinition(
        id="kpi_units_sold",
        az_label="Satılmış Malların Xalis Sayı (Units Sold)",
        category="Sales",
        formula_text="Σ Satılan Malların Sayı - Σ Qaytarılan Malların Sayı",
        unit="ədəd",
        source_tables=["sale_lines", "sale_return_lines"],
        caveats="Dəst (bundle) tərkibindəki fərdi ədədlər deyil, sətir səviyyəsindəki fiziki ədədlər toplanır.",
        required_permissions=["reports.view.sales"],
    ),
    "kpi_return_rate": KPIDefinition(
        id="kpi_return_rate",
        az_label="Qaytarma Nisbəti (Return Rate)",
        category="Operations",
        formula_text="(Qaytarılan Məbləğ / Ümumi Satış Məbləği) * 100",
        unit="%",
        source_tables=["sale_returns", "sales"],
        caveats="Həm məbləğ, həm də ədəd nisbəti olaraq təqdim oluna bilər; standart olaraq xalis məbləğ nisbəti verilir.",
        required_permissions=["reports.view.sales"],
    ),
    "kpi_discount_cost": KPIDefinition(
        id="kpi_discount_cost",
        az_label="Verilmiş Cəmi Endirimlər (Discount Total)",
        category="Marketing",
        formula_text="Σ (Sətir Aksiya Endirimləri + Qəbz Endirimləri + Loyallıq Endirimləri)",
        unit="AZN",
        source_tables=["sales", "sale_lines"],
        caveats="Endirimin şirkət mənfəətinə vurduğu ümumi maliyyə təsirini ölçür.",
        required_permissions=["reports.view.sales"],
    ),

    # -----------------------------------------------------------------
    # ANBAR VƏ TƏCHİZAT METRİKALARI
    # -----------------------------------------------------------------
    "kpi_inventory_value": KPIDefinition(
        id="kpi_inventory_value",
        az_label="Anbar Qalığının Maya Dəyəri (Inventory Value)",
        category="Inventory",
        formula_text="Σ (Mövcud Say * Orta Çəkili Maya Dəyəri)",
        unit="AZN",
        source_tables=["stock_snapshots", "stock_balances", "inventory_cost_states"],
        caveats="Parametrlərdə seçilmiş dəyərləndirmə metodundan (WAC və ya FIFO) asılıdır. reports.cost.view tələb olunur.",
        required_permissions=["reports.cost.view", "reports.view.inventory"],
    ),
    "kpi_inventory_turnover": KPIDefinition(
        id="kpi_inventory_turnover",
        az_label="Anbar Dövriyyə Əmsalı (Inventory Turnover)",
        category="Inventory",
        formula_text="Dövr üzrə COGS / Dövr üzrə Orta Anbar Maya Dəyəri",
        unit="əmsal",
        source_tables=["reporting_daily_sales_summary", "stock_snapshots"],
        caveats="Orta anbar dəyəri 0 olduqda NOT_COMPUTABLE qaytarılır. İllikləşdirilmiş göstərici üçün dövr günlərinə proporsiya tətbiq olunur.",
        required_permissions=["reports.cost.view", "reports.view.inventory"],
    ),
    "kpi_days_of_inventory": KPIDefinition(
        id="kpi_days_of_inventory",
        az_label="Anbar Ehtiyatının Gün Sayı (Days of Inventory)",
        category="Inventory",
        formula_text="365 / Anbar Dövriyyə Əmsalı (və ya Mövcud Qalıq / Gündəlik Orta Satış Sürəti)",
        unit="gün",
        source_tables=["reporting_inventory_velocity"],
        caveats="Satış sürəti 0 olan 'ölü' mallar üçün gün sayı sonsuzdur (N/A kimi qeyd olunur).",
        required_permissions=["reports.view.inventory"],
    ),
    "kpi_supplier_liabilities": KPIDefinition(
        id="kpi_supplier_liabilities",
        az_label="Təchizatçılara Cari Borc (Supplier Payables)",
        category="Purchasing",
        formula_text="Σ (Təsdiqlənmiş Qaimələr) - Σ (Təchizatçı Ödənişləri)",
        unit="AZN",
        source_tables=["supplier_invoices", "supplier_payments"],
        caveats="Mübahisəli və ya qaralama qaimələr yekun borc qalığına daxil edilmir.",
        required_permissions=["reports.view.purchasing", "reports.view.finance"],
    ),

    # -----------------------------------------------------------------
    # KADR VƏ ƏMƏLİYYAT METRİKALARI
    # -----------------------------------------------------------------
    "kpi_headcount": KPIDefinition(
        id="kpi_headcount",
        az_label="Aktiv İşçi Sayı (Active Headcount)",
        category="HR",
        formula_text="Count(İşçilər WHERE status = 'ACTIVE')",
        unit="nəfər",
        source_tables=["hr_employees"],
        caveats="Məzuniyyətdə və ya fəaliyyəti dayandırılmış şəxslər daxil deyil.",
        required_permissions=["reports.view.hr"],
    ),
    "kpi_attendance_rate": KPIDefinition(
        id="kpi_attendance_rate",
        az_label="Davamiyyət İntizamı (Attendance Rate)",
        category="HR",
        formula_text="(Faktiki İş Saatları / Planlaşdırılmış Cədvəl Saatları) * 100",
        unit="%",
        source_tables=["hr_daily_attendance", "hr_schedule_assignments"],
        caveats="Təsdiqlənmiş məzuniyyətlər və icazələr üzrlü hesab edilir.",
        required_permissions=["reports.view.hr"],
    ),
    "kpi_cash_variance": KPIDefinition(
        id="kpi_cash_variance",
        az_label="Kassa Kənarlaşması (Cash Over / Short)",
        category="Operations",
        formula_text="Σ (Növbə Bağlanışında Faktiki Nağd - Sistemdə Hesablanmış Nəzəri Qalıq)",
        unit="AZN",
        source_tables=["pos_shifts"],
        caveats="Müsbət dəyər artıqlığı, mənfi dəyər isə kassa çatışmazlığını (shortage) göstərir.",
        required_permissions=["reports.view.finance"],
    ),
}


# =========================================================================
# DÜSTUR HESABLAMA VƏ ÇATIŞMAYAN GİRİŞLƏRİN ANALİZİ FUNKSİYALARI
# =========================================================================


def compute_kpi(
    definition_id: str,
    raw_data: dict[str, Any],
    _compare_data: dict[str, Any] | None = None,
) -> KPIValueResult:
    """Verilmiş xam verilənlər əsasında KPI-nı təhlükəsiz hesablayır.

    Əgər vacib komponentlər (məsələn maya dəyəri) yoxdursa, uydurma rəqəm qaytarmır,
    dəqiq NOT_COMPUTABLE statusu və çatışmayan girişlərin siyahısını təqdim edir.
    """
    definition = KPI_REGISTRY.get(definition_id)
    if not definition:
        return KPIValueResult(
            definition_id=definition_id,
            state=KPIState.NOT_CONFIGURED,
            value=None,
            unit="",
            missing_inputs=[f"Naməlum KPI: {definition_id}"],
        )

    # 1. Net Sales
    if definition_id == "kpi_net_sales":
        gross = raw_data.get("gross_sales")
        returns = raw_data.get("return_amount")
        discount = raw_data.get("discount_amount")
        if gross is None and returns is None and discount is None:
            return KPIValueResult(definition_id, KPIState.NO_DATA, None, definition.unit)
        missing: list[str] = []
        if gross is None:
            missing.append("Ümumi Satış (gross_sales)")
        if returns is None:
            missing.append("Qaytarılan məbləğ (return_amount)")
        if discount is None:
            missing.append("Endirim məbləği (discount_amount)")
        if missing:
            return KPIValueResult(
                definition_id,
                KPIState.NOT_COMPUTABLE,
                None,
                definition.unit,
                missing_inputs=missing,
                caveats=definition.caveats,
            )
        net = Decimal(str(gross)) - Decimal(str(returns)) - Decimal(str(discount))
        return KPIValueResult(definition_id, KPIState.COMPUTED, net.quantize(Decimal("0.01")), definition.unit)

    # 2. Gross Profit
    if definition_id == "kpi_gross_profit":
        net_sales = raw_data.get("net_sales")
        cogs = raw_data.get("cogs_amount")
        missing = []
        if net_sales is None:
            missing.append("Xalis Satış Məbləği (net_sales)")
        if cogs is None:
            missing.append("Satılan Malların Maya Dəyəri (cogs_amount)")
        if missing:
            return KPIValueResult(
                definition_id,
                KPIState.NOT_COMPUTABLE,
                None,
                definition.unit,
                missing_inputs=missing,
                caveats=definition.caveats,
            )
        gp = Decimal(str(net_sales)) - Decimal(str(cogs))
        return KPIValueResult(definition_id, KPIState.COMPUTED, gp.quantize(Decimal("0.01")), definition.unit)

    # 3. Net Profit
    if definition_id == "kpi_net_profit":
        net_sales = raw_data.get("net_sales")
        cogs = raw_data.get("cogs_amount")
        expenses = raw_data.get("operating_expenses")
        payroll = raw_data.get("payroll_expenses")
        missing = []
        if net_sales is None:
            missing.append("Xalis Satış Məbləği (net_sales)")
        if cogs is None:
            missing.append("Maya Dəyəri (cogs_amount)")
        if expenses is None:
            missing.append("Əməliyyat Xərcləri (operating_expenses)")
        if payroll is None:
            missing.append("Əmək Haqqı Xərcləri (payroll_expenses)")
        if missing:
            return KPIValueResult(
                definition_id,
                KPIState.NOT_COMPUTABLE,
                None,
                definition.unit,
                missing_inputs=missing,
                caveats=definition.caveats,
            )
        np_val = (
            Decimal(str(net_sales))
            - Decimal(str(cogs))
            - Decimal(str(expenses))
            - Decimal(str(payroll))
        )
        return KPIValueResult(definition_id, KPIState.COMPUTED, np_val.quantize(Decimal("0.01")), definition.unit)

    # 4. Sales Growth %
    if definition_id == "kpi_sales_growth":
        cur = raw_data.get("current_sales")
        prev = raw_data.get("compare_sales")
        if cur is None or prev is None:
            return KPIValueResult(
                definition_id,
                KPIState.NOT_COMPUTABLE,
                None,
                definition.unit,
                missing_inputs=["Cari dövr və ya müqayisə dövrü satışı tapılmadı"],
            )
        prev_dec = Decimal(str(prev))
        cur_dec = Decimal(str(cur))
        if prev_dec == Decimal("0.00"):
            return KPIValueResult(
                definition_id,
                KPIState.NOT_COMPUTABLE,
                None,
                definition.unit,
                missing_inputs=["Müqayisə dövrü satışı 0 AZN olduğu üçün bölünmə mümkün deyil"],
            )
        growth = ((cur_dec - prev_dec) / prev_dec) * Decimal("100.00")
        return KPIValueResult(
            definition_id,
            KPIState.COMPUTED,
            growth.quantize(Decimal("0.1")),
            definition.unit,
            compare_value=prev_dec,
            delta=cur_dec - prev_dec,
            delta_percent=growth.quantize(Decimal("0.1")),
        )

    # 5. Average Order Value (AOV)
    if definition_id == "kpi_aov":
        net_sales = raw_data.get("net_sales")
        orders = raw_data.get("transaction_count")
        if orders is None:
            orders = raw_data.get("order_count")
        if net_sales is None and orders is None:
            return KPIValueResult(definition_id, KPIState.NO_DATA, None, definition.unit)
        if net_sales is None or orders is None or int(orders) == 0:
            return KPIValueResult(
                definition_id,
                KPIState.NOT_COMPUTABLE,
                None,
                definition.unit,
                missing_inputs=["Sifarişlərin sayı (order_count) 0 və ya təyin edilməyib"],
            )
        aov = Decimal(str(net_sales)) / Decimal(str(orders))
        return KPIValueResult(definition_id, KPIState.COMPUTED, aov.quantize(Decimal("0.01")), definition.unit)

    # 6. Inventory Turnover
    if definition_id == "kpi_inventory_turnover":
        cogs = raw_data.get("cogs_amount")
        avg_inv = raw_data.get("avg_inventory_value")
        if cogs is None or avg_inv is None or Decimal(str(avg_inv)) == Decimal("0.00"):
            return KPIValueResult(
                definition_id,
                KPIState.NOT_COMPUTABLE,
                None,
                definition.unit,
                missing_inputs=["Orta anbar dəyəri 0 və ya təyin edilməyib"],
            )
        turnover = Decimal(str(cogs)) / Decimal(str(avg_inv))
        return KPIValueResult(definition_id, KPIState.COMPUTED, turnover.quantize(Decimal("0.01")), definition.unit)

    # Default direct metric fetch
    val = raw_data.get("value")
    if val is None:
        return KPIValueResult(definition_id, KPIState.NO_DATA, None, definition.unit)
    return KPIValueResult(definition_id, KPIState.COMPUTED, Decimal(str(val)), definition.unit)


def generate_kpi_registry_markdown() -> str:
    """Reyestrdəki bütün KPI-ların rəsmi sənədləşdirməsini (Markdown) generasiya edir."""
    lines: list[str] = [
        "# Brand House ERP — Əsas Performans Göstəriciləri (KPI) Reyestri",
        "",
        "Bu sənəd sistemdə istifadə olunan bütün maliyyə, satış, anbar və idarəetmə göstəricilərinin",
        "yeganə və yekun rəsmi həqiqət mənbəyidir. Bütün hesabat və idarə paneli (Dashboard) API-ləri",
        "hər rəqəmlə yanaşı müvafiq `definition_id` qaytarır.",
        "",
        "| ID | Göstərici (AZ) | Kateqoriya | Düstur | Vahid | Mənbə Cədvəllər | Məhdudiyyətlər (Caveats) |",
        "|---|---|---|---|---|---|---|",
    ]
    for kpi in KPI_REGISTRY.values():
        sources = ", ".join(f"`{s}`" for s in kpi.source_tables)
        lines.append(
            f"| `{kpi.id}` | **{kpi.az_label}** | {kpi.category} | `{kpi.formula_text}` | {kpi.unit} | {sources} | {kpi.caveats} |"
        )
    lines.append("")
    lines.append("## Hesablana Bilməyən vəziyyətlər (NOT_COMPUTABLE)")
    lines.append("Sistem heç bir halda təxmini və ya uydurma (placeholder) rəqəm qaytarmır:")
    lines.append("- Giriş göstəriciləri çatışmadıqda: `NOT_COMPUTABLE` statusu və çatışmayan dəyişənlərin siyahısı qaytarılır.")
    lines.append("- Tarix aralığında əməliyyat olmadıqda: `NO_DATA` statusu qaytarılır.")
    lines.append("- Bölən sıfır olduqda (Zero Division): bölünmə xətası baş vermir, `NOT_COMPUTABLE` bildirilir.")
    return "\n".join(lines)
