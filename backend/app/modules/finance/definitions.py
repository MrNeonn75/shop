"""Maliyyə Göstəriciləri və KPI Reyestri (Financial KPI Definitions).

Bu modul sistem daxilində hesablanan hər bir maliyyə metrikinin dəqiq iqtisadi tərifini,
düsturunu, mənbə sənədlərini və qanuni qeydlərini müəyyən edir.
Hər bir hesabat rəqəmi burada təyin olunmuş `definition_id` kodunu daşıyır.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class FinancialMetricDefinition:
    """Tək bir maliyyə metrikinin rəsmi tərifi."""

    definition_id: str
    name_az: str
    name_en: str
    category: Literal["revenue", "cash", "cogs", "profit", "expense", "receivable", "payable"]
    formula: str
    description_az: str
    source_documents: list[str]
    accounting_standard_notes: str
    drill_down_endpoint: str


KPI_REGISTRY: dict[str, FinancialMetricDefinition] = {
    # 1. Gəlir (Revenue)
    "DEF-FIN-REV-001": FinancialMetricDefinition(
        definition_id="DEF-FIN-REV-001",
        name_az="Xalis Satış Gəliri (Net Revenue)",
        name_en="Net Sales Revenue",
        category="revenue",
        formula="Gross Merchandise Sales (excl. Tax) - Returns (excl. Tax) - Sales Discounts/Promotions",
        description_az=(
            "Müştərilərə təhvil verilmiş və çeki vurulmuş mallardan qazanılan xalis iqtisadi dəyər. "
            "Vergilər (ƏDV/aksiz) və qaytarmalar xaric edilir. "
            "DİQQƏT: Nağd daxilolma gəlir DEYİLDİR! Nisyə satış pul alınmasa belə satış anında gəlir kimi tanınır."
        ),
        source_documents=["sales", "sale_lines", "sale_returns", "sale_return_lines"],
        accounting_standard_notes="IFRS 15 / MMUS Gəlirlərin tanınması prinsipi əsasında formalaşır.",
        drill_down_endpoint="/api/v1/finance/reports/drill-down?metric=DEF-FIN-REV-001",
    ),
    # 2. Nağd Daxilolma (Cash Received)
    "DEF-FIN-CSH-001": FinancialMetricDefinition(
        definition_id="DEF-FIN-CSH-001",
        name_az="Faktiki Nağd və Qeyri-Nağd Daxilolma (Cash Received)",
        name_en="Cash & Tender Inflow",
        category="cash",
        formula="sum(account_transactions WHERE direction = 'IN')",
        description_az=(
            "Müəyyən dövr ərzində şirkətin kassa, bank və klirinq hesablarına daxil olmuş real pul vəsaiti. "
            "Bura kassa satışından daxil olan nağd pul, POS kart ödənişləri, nisyə müştərilərin borc ödənişləri "
            "və qeyri-satış gəlirləri daxildir. Daxilolma heç vaxt avtomatik gəlir sayılmır."
        ),
        source_documents=["account_transactions", "sale_payments", "customer_payments", "other_incomes"],
        accounting_standard_notes="Birbaşa Pul Vəsaitlərinin Hərəkəti (Direct Cash Flow) prinsipinə uyğundur.",
        drill_down_endpoint="/api/v1/finance/reports/drill-down?metric=DEF-FIN-CSH-001",
    ),
    # 3. Satılmış Malların Maya Dəyəri (COGS)
    "DEF-FIN-CGS-001": FinancialMetricDefinition(
        definition_id="DEF-FIN-CGS-001",
        name_az="Satılmış Malların Maya Dəyəri (COGS)",
        name_en="Cost of Goods Sold",
        category="cogs",
        formula="sum(sold_qty * cost_price_snapshot) - sum(returned_resalable_qty * cost_price_snapshot)",
        description_az=(
            "Dövr ərzində satılmış məhsulların anbar alış maya dəyəri. Satış anında hər bir satış sətrində "
            "saxlanılan dəyişməz maya dəyəri snapshotu (FIFO / Specific identification) əsasında hesablanır. "
            "Yararlı vəziyyətdə (RESALABLE) geri qaytarılan məhsulların maya dəyəri COGS-dən çıxılır."
        ),
        source_documents=["sale_lines", "sale_return_lines", "stock_movements"],
        accounting_standard_notes="IAS 2 / MMUS Ehtiyatların maya dəyərinin silinməsi qaydası.",
        drill_down_endpoint="/api/v1/finance/reports/drill-down?metric=DEF-FIN-CGS-001",
    ),
    # 4. Ümumi Mənfəət (Gross Profit)
    "DEF-FIN-GPR-001": FinancialMetricDefinition(
        definition_id="DEF-FIN-GPR-001",
        name_az="Ümumi Mənfəət (Gross Profit)",
        name_en="Gross Profit",
        category="profit",
        formula="Net Revenue (DEF-FIN-REV-001) - COGS (DEF-FIN-CGS-001)",
        description_az=(
            "Məhsul satışından əldə olunan xalis gəlir ilə malların maya dəyəri arasındakı fərq. "
            "Əməliyyat xərcləri çıxılmadan əvvəlki ticarət marjasını göstərir."
        ),
        source_documents=["sales", "sale_returns", "sale_lines"],
        accounting_standard_notes="Maliyyə Nəticələri Haqqında Hesabatın (P&L) ilkin mərhələsi.",
        drill_down_endpoint="/api/v1/finance/reports/drill-down?metric=DEF-FIN-GPR-001",
    ),
    # 5. Əməliyyat Xərcləri - Hesablama Metodu (Operating Expenses - Accrual)
    "DEF-FIN-OEX-001": FinancialMetricDefinition(
        definition_id="DEF-FIN-OEX-001",
        name_az="Əməliyyat Xərcləri - Hesablama Metodu (OPEX Accrual)",
        name_en="Operating Expenses (Accrual)",
        category="expense",
        formula="sum(expenses.net_amount WHERE expense_date IN period AND status = 'PAID')",
        description_az=(
            "Dövr ərzində yaranmış (faktura və ya xərc tarixi dövrə aid olan) əməliyyat xərcləri: "
            "icarə, kommunal, əmək haqqı, marketinq, təmir və digər xərclər. "
            "Ödənişin nə vaxt edilməsindən asılı olmayaraq yaranma tarixinə əsasən tanınır."
        ),
        source_documents=["expenses", "expense_allocations"],
        accounting_standard_notes="Hesablama prinsipi (Accrual basis of accounting) üzrə tanınma.",
        drill_down_endpoint="/api/v1/finance/reports/drill-down?metric=DEF-FIN-OEX-001",
    ),
    # 6. Əməliyyat Xərcləri - Kassa Metodu (Operating Expenses - Cash)
    "DEF-FIN-OEX-002": FinancialMetricDefinition(
        definition_id="DEF-FIN-OEX-002",
        name_az="Əməliyyat Xərcləri - Kassa Metodu (OPEX Cash)",
        name_en="Operating Expenses (Cash Disbursed)",
        category="expense",
        formula="sum(expenses.net_amount WHERE paid_at IN period AND status = 'PAID')",
        description_az=(
            "Dövr ərzində faktiki olaraq kassa və ya bank hesabından ödənilmiş xərclər toplusu. "
            "Pul vəsaitlərinin hərəkəti təhlili üçün istifadə olunur."
        ),
        source_documents=["expenses", "account_transactions"],
        accounting_standard_notes="Kassa metodu (Cash basis of accounting) üzrə xərclərin çıxarışı.",
        drill_down_endpoint="/api/v1/finance/reports/drill-down?metric=DEF-FIN-OEX-002",
    ),
    # 7. Xalis Mənfəət (Net Profit)
    "DEF-FIN-NPR-001": FinancialMetricDefinition(
        definition_id="DEF-FIN-NPR-001",
        name_az="Xalis Əməliyyat Mənfəəti (Net Profit)",
        name_en="Net Operating Profit",
        category="profit",
        formula="Gross Profit (DEF-FIN-GPR-001) - OPEX Accrual (DEF-FIN-OEX-001) + Other Income - Other Costs",
        description_az=(
            "Bütün ticarət gəlirlərindən maya dəyəri və əməliyyat xərcləri çıxıldıqdan sonra qalan "
            "yekun xalis mənfəət. Əgər maya dəyəri natamam olarsa, sistem bu rəqəmi hesablamaqdan imtina edir "
            "və statusu NOT_COMPUTABLE kimi qeyd edir."
        ),
        source_documents=["sales", "sale_lines", "sale_returns", "expenses", "other_incomes"],
        accounting_standard_notes="Həssas maliyyə göstəricisi (Gated by finance.profit.view).",
        drill_down_endpoint="/api/v1/finance/reports/drill-down?metric=DEF-FIN-NPR-001",
    ),
}

