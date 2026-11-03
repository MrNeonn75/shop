"""Maliyyə Hesabatları Xidməti (Finance Reports Service).

1. Mənfəət və Zərər Hesabatı (P&L): Gəlir, Maya dəyəri, Ümumi Mənfəət, OPEX (Accrual və Cash), Xalis Mənfəət.
   - Əgər maya dəyəri məlumatı natamamdırsa, hesabat NOT_COMPUTABLE statusu ilə çatışmayan səbəbləri qaytarır.
2. Pul Vəsaitlərinin Hərəkəti (Direct Cash Flow).
3. Gündəlik Kassa Hesabatı (Daily Cash Report).
4. Borcların Yaşlanma Analizi (Aging: Payables & Receivables).
5. Filiallararası Müqayisə (Branch Comparison).
6. Göstəricilərin İlkin Sənədlərə Açılışı (Drill-down queries).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.modules.finance.definitions import KPI_REGISTRY
from app.modules.finance.models import (
    AccountTransaction,
    Expense,
    OtherIncome,
)
from app.modules.finance.repository import FinanceRepository
from app.modules.finance.schemas import (
    AgingBucketItem,
    AgingReportResponse,
    CashFlowReportResponse,
    DailyCashReportResponse,
    MetricValuePayload,
    ProfitAndLossReportResponse,
    ReportDrillDownResponse,
)
from app.modules.returns.models import SaleReturn, SaleReturnLine
from app.modules.sales.models import Sale, SaleLine
from app.modules.settings.service import SettingsService
from app.modules.suppliers.models import SupplierLedgerDirection, SupplierLedgerEntry


class FinanceReportsService:
    """Maliyyə hesabatlarının hesablanması və analitikası."""

    def __init__(self, session: AsyncSession, settings_service: SettingsService | None = None) -> None:
        self.session = session
        self.repo = FinanceRepository(session)
        self.settings = settings_service or SettingsService()

    async def get_pnl_report(
        self,
        company_id: uuid.UUID,
        period: str,  # "YYYY-MM"
        branch_id: uuid.UUID | None = None,
    ) -> ProfitAndLossReportResponse:
        """Mənfəət və Zərər Hesabatı (Profit & Loss)."""
        year, month = map(int, period.split("-"))
        start_date = date(year, month, 1)
        end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

        # 1. Maya dəyəri metodunu parametrlərdən oxuyuruq
        setting = await self.settings.get("finance_rules", session=self.session)
        costing_method = "FIFO"
        if setting and isinstance(setting.value, dict):
            costing_method = setting.value.get("costing_method", "FIFO")
        method_label = f"Snapshot Specific Costing ({costing_method})"

        missing_inputs: list[str] = []

        # 2. Satışlar və Maya Dəyəri
        sales_stmt = (
            select(Sale)
            .where(
                and_(
                    Sale.company_id == company_id,
                    Sale.business_date >= start_date,
                    Sale.business_date < end_date,
                    Sale.status == "COMPLETED",
                )
            )
        )
        if branch_id is not None:
            sales_stmt = sales_stmt.where(Sale.branch_id == branch_id)

        sales_res = await self.session.execute(sales_stmt)
        sales = list(sales_res.scalars().all())

        gross_sales_net = Decimal("0.0000")
        total_cogs = Decimal("0.0000")

        sale_ids = [s.id for s in sales]
        if sale_ids:
            lines_stmt = select(SaleLine).where(SaleLine.sale_id.in_(sale_ids))
            lines_res = await self.session.execute(lines_stmt)
            lines = list(lines_res.scalars().all())

            for ln in lines:
                gross_sales_net += ln.total_amount  # Çek sətri xalis satış (vergidən əvvəl)
                if ln.cost_price is None or ln.cost_price <= Decimal("0.0000"):
                    missing_inputs.append(
                        f"Satış sətrində maya dəyəri snapshotu yoxdur (Sətir ID: {ln.id}, Məhsul: {ln.variant_id})"
                    )
                else:
                    total_cogs += ln.cost_price * Decimal(str(ln.quantity))

        # 3. Qaytarmalar və Maya Dəyəri Bərpası
        returns_stmt = (
            select(SaleReturn)
            .where(
                and_(
                    SaleReturn.company_id == company_id,
                    SaleReturn.business_date >= start_date,
                    SaleReturn.business_date < end_date,
                    SaleReturn.status == "COMPLETED",
                )
            )
        )
        if branch_id is not None:
            returns_stmt = returns_stmt.where(SaleReturn.branch_id == branch_id)

        returns_res = await self.session.execute(returns_stmt)
        returns = list(returns_res.scalars().all())

        return_sales_net = Decimal("0.0000")
        return_cogs_recovery = Decimal("0.0000")

        return_ids = [r.id for r in returns]
        if return_ids:
            ret_lines_stmt = select(SaleReturnLine).where(SaleReturnLine.sale_return_id.in_(return_ids))
            ret_lines_res = await self.session.execute(ret_lines_stmt)
            ret_lines = list(ret_lines_res.scalars().all())

            for rln in ret_lines:
                return_sales_net += rln.refund_amount
                # Yalnız RESALABLE mallar maya dəyərini anbara qaytarır
                if rln.condition == "RESALABLE" and rln.cost_price is not None:
                    return_cogs_recovery += rln.cost_price * Decimal(str(rln.quantity))

        # Xalis Gəlir və Xalis Maya Dəyəri
        net_revenue_val = max(Decimal("0.0000"), gross_sales_net - return_sales_net)
        net_cogs_val = max(Decimal("0.0000"), total_cogs - return_cogs_recovery)
        gross_profit_val = net_revenue_val - net_cogs_val

        gross_margin_pct = (
            (gross_profit_val / net_revenue_val * Decimal("100.00"))
            if net_revenue_val > Decimal("0.0000")
            else Decimal("0.0000")
        )

        # 4. Əməliyyat Xərcləri (Accrual vs Cash)
        expenses_stmt = select(Expense).where(
            and_(
                Expense.company_id == company_id,
                Expense.status == "PAID",
            )
        )
        if branch_id is not None:
            expenses_stmt = expenses_stmt.where(Expense.branch_id == branch_id)

        exp_res = await self.session.execute(expenses_stmt)
        all_paid_expenses = list(exp_res.scalars().all())

        opex_accrual_val = Decimal("0.0000")
        opex_cash_val = Decimal("0.0000")

        for exp in all_paid_expenses:
            if start_date <= exp.expense_date < end_date:
                opex_accrual_val += exp.net_amount
            if exp.paid_at and start_date <= exp.paid_at.date() < end_date:
                opex_cash_val += exp.net_amount

        # 5. Qeyri-satış Gəlirləri
        income_stmt = select(func.coalesce(func.sum(OtherIncome.amount), Decimal("0.0000"))).where(
            and_(
                OtherIncome.company_id == company_id,
                OtherIncome.income_date >= start_date,
                OtherIncome.income_date < end_date,
                OtherIncome.status == "PAID",
            )
        )
        if branch_id is not None:
            income_stmt = income_stmt.where(OtherIncome.branch_id == branch_id)
        inc_res = await self.session.execute(income_stmt)
        other_income_val = Decimal(str(inc_res.scalar_one_or_none() or "0.0000"))

        # Xalis Mənfəət
        net_profit_val = gross_profit_val - opex_accrual_val + other_income_val
        net_margin_pct = (
            (net_profit_val / net_revenue_val * Decimal("100.00"))
            if net_revenue_val > Decimal("0.0000")
            else Decimal("0.0000")
        )

        status = "COMPUTED"
        if missing_inputs:
            status = "NOT_COMPUTABLE"

        return ProfitAndLossReportResponse(
            period=period,
            branch_id=branch_id,
            costing_method_label=method_label,
            status=status,
            missing_inputs=missing_inputs,
            net_revenue=MetricValuePayload(
                definition_id="DEF-FIN-REV-001",
                name=KPI_REGISTRY["DEF-FIN-REV-001"].name_az,
                amount=net_revenue_val.quantize(Decimal("0.01")),
                drill_down_query=f"/api/v1/finance/reports/drill-down?metric=DEF-FIN-REV-001&period={period}",
            ),
            cogs=MetricValuePayload(
                definition_id="DEF-FIN-CGS-001",
                name=KPI_REGISTRY["DEF-FIN-CGS-001"].name_az,
                amount=net_cogs_val.quantize(Decimal("0.01")),
                drill_down_query=f"/api/v1/finance/reports/drill-down?metric=DEF-FIN-CGS-001&period={period}",
            ),
            gross_profit=MetricValuePayload(
                definition_id="DEF-FIN-GPR-001",
                name=KPI_REGISTRY["DEF-FIN-GPR-001"].name_az,
                amount=gross_profit_val.quantize(Decimal("0.01")),
                drill_down_query=f"/api/v1/finance/reports/drill-down?metric=DEF-FIN-GPR-001&period={period}",
            ),
            gross_margin_percent=gross_margin_pct.quantize(Decimal("0.01")),
            opex_accrual=MetricValuePayload(
                definition_id="DEF-FIN-OEX-001",
                name=KPI_REGISTRY["DEF-FIN-OEX-001"].name_az,
                amount=opex_accrual_val.quantize(Decimal("0.01")),
                drill_down_query=f"/api/v1/finance/reports/drill-down?metric=DEF-FIN-OEX-001&period={period}",
            ),
            opex_cash=MetricValuePayload(
                definition_id="DEF-FIN-OEX-002",
                name=KPI_REGISTRY["DEF-FIN-OEX-002"].name_az,
                amount=opex_cash_val.quantize(Decimal("0.01")),
                drill_down_query=f"/api/v1/finance/reports/drill-down?metric=DEF-FIN-OEX-002&period={period}",
            ),
            other_income=MetricValuePayload(
                definition_id="DEF-FIN-INC-001",
                name="Qeyri-satış gəlirləri",
                amount=other_income_val.quantize(Decimal("0.01")),
                drill_down_query=f"/api/v1/finance/reports/drill-down?metric=DEF-FIN-INC-001&period={period}",
            ),
            net_profit=MetricValuePayload(
                definition_id="DEF-FIN-NPR-001",
                name=KPI_REGISTRY["DEF-FIN-NPR-001"].name_az,
                amount=net_profit_val.quantize(Decimal("0.01")),
                drill_down_query=f"/api/v1/finance/reports/drill-down?metric=DEF-FIN-NPR-001&period={period}",
            ),
            net_margin_percent=net_margin_pct.quantize(Decimal("0.01")),
        )

    async def get_cash_flow_report(
        self,
        company_id: uuid.UUID,
        start_date: date,
        end_date: date,
        branch_id: uuid.UUID | None = None,
    ) -> CashFlowReportResponse:
        """Birbaşa Pul Vəsaitlərinin Hərəkəti Hesabatı (Direct Cash Flow)."""
        dt_start = datetime(start_date.year, start_date.month, start_date.day)
        dt_end = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)

        accounts = await self.repo.list_accounts(company_id=company_id, branch_id=branch_id)
        acc_map = {acc.id: acc for acc in accounts}
        acc_ids = list(acc_map.keys())

        inflows_by_tender: dict[str, Decimal] = {}
        outflows_by_category: dict[str, Decimal] = {}
        total_inflows = Decimal("0.0000")
        total_outflows = Decimal("0.0000")

        if acc_ids:
            stmt = select(AccountTransaction).where(
                and_(
                    AccountTransaction.account_id.in_(acc_ids),
                    AccountTransaction.occurred_at >= dt_start,
                    AccountTransaction.occurred_at <= dt_end,
                )
            )
            res = await self.session.execute(stmt)
            txs = list(res.scalars().all())

            for tx in txs:
                acc = acc_map.get(tx.account_id)
                tender_name = acc.sub_type if acc else "other"
                if tx.direction == "IN":
                    inflows_by_tender[tender_name] = (
                        inflows_by_tender.get(tender_name, Decimal("0.0000")) + tx.amount
                    )
                    total_inflows += tx.amount
                elif tx.direction == "OUT":
                    cat_name = tx.source_type
                    outflows_by_category[cat_name] = (
                        outflows_by_category.get(cat_name, Decimal("0.0000")) + tx.amount
                    )
                    total_outflows += tx.amount

        net_cf = total_inflows - total_outflows

        return CashFlowReportResponse(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            inflows_by_tender=inflows_by_tender,
            total_inflows=total_inflows.quantize(Decimal("0.01")),
            outflows_by_category=outflows_by_category,
            total_outflows=total_outflows.quantize(Decimal("0.01")),
            net_cash_flow=net_cf.quantize(Decimal("0.01")),
        )

    async def get_daily_cash_report(
        self,
        company_id: uuid.UUID,
        report_date: date,
        branch_id: uuid.UUID,
    ) -> DailyCashReportResponse:
        """Gündəlik Kassa Hesabatı (Daily Cash Summary)."""
        dt_start = datetime(report_date.year, report_date.month, report_date.day)
        dt_end = datetime(report_date.year, report_date.month, report_date.day, 23, 59, 59)

        # Kassa hesabları
        accounts = await self.repo.list_accounts(
            company_id=company_id, branch_id=branch_id, type_="cash"
        )
        acc_ids = [a.id for a in accounts]

        opening_cash = Decimal("0.0000")
        cash_sales = Decimal("0.0000")
        cash_returns = Decimal("0.0000")
        cash_in_movements = Decimal("0.0000")
        cash_out_movements = Decimal("0.0000")
        counted_cash = Decimal("0.0000")

        if acc_ids:
            # Açılış qalığı
            for aid in acc_ids:
                bal = await self.repo.get_derived_balance(aid, as_of=dt_start)
                opening_cash += bal

            # Gün ərzində əməliyyatlar
            stmt = select(AccountTransaction).where(
                and_(
                    AccountTransaction.account_id.in_(acc_ids),
                    AccountTransaction.occurred_at >= dt_start,
                    AccountTransaction.occurred_at <= dt_end,
                )
            )
            res = await self.session.execute(stmt)
            txs = list(res.scalars().all())

            for tx in txs:
                if tx.direction == "IN":
                    if tx.source_type == "sale":
                        cash_sales += tx.amount
                    else:
                        cash_in_movements += tx.amount
                elif tx.direction == "OUT":
                    if tx.source_type == "return":
                        cash_returns += tx.amount
                    else:
                        cash_out_movements += tx.amount

            # Cari qapanış qalığı
            for aid in acc_ids:
                bal = await self.repo.get_derived_balance(aid, as_of=dt_end)
                counted_cash += bal

        expected_closing = opening_cash + cash_sales + cash_in_movements - cash_returns - cash_out_movements
        variance = counted_cash - expected_closing

        return DailyCashReportResponse(
            date=report_date,
            branch_id=branch_id,
            opening_cash=opening_cash.quantize(Decimal("0.01")),
            cash_sales=cash_sales.quantize(Decimal("0.01")),
            cash_returns=cash_returns.quantize(Decimal("0.01")),
            cash_in_movements=cash_in_movements.quantize(Decimal("0.01")),
            cash_out_movements=cash_out_movements.quantize(Decimal("0.01")),
            expected_closing_cash=expected_closing.quantize(Decimal("0.01")),
            counted_cash=counted_cash.quantize(Decimal("0.01")),
            variance=variance.quantize(Decimal("0.01")),
            shifts_summary=[],
        )

    async def get_receivables_aging(
        self,
        company_id: uuid.UUID,
        as_of_date: date | None = None,
    ) -> AgingReportResponse:
        """Müştəri Nisyə Borclarının Yaşlanma Analizi (Customer Receivables Aging)."""
        as_of = as_of_date or utc_now().date()
        invoices = await self.repo.list_receivable_invoices(company_id=company_id)

        total_outstanding = Decimal("0.0000")
        due_soon = Decimal("0.0000")
        overdue = Decimal("0.0000")

        buckets_map = {
            "0-30": Decimal("0.0000"),
            "31-60": Decimal("0.0000"),
            "61-90": Decimal("0.0000"),
            "90+": Decimal("0.0000"),
        }

        records: list[dict[str, Any]] = []

        for inv in invoices:
            rem = inv.total_amount - inv.paid_amount
            if rem <= Decimal("0.0000"):
                continue

            total_outstanding += rem
            days_diff = (as_of - inv.due_date).days

            if days_diff < 0:
                # Hələ vaxtı çatmayıb
                if abs(days_diff) <= 7:
                    due_soon += rem
                buckets_map["0-30"] += rem
            else:
                # Vaxtı keçib (overdue)
                overdue += rem
                if days_diff <= 30:
                    buckets_map["0-30"] += rem
                elif days_diff <= 60:
                    buckets_map["31-60"] += rem
                elif days_diff <= 90:
                    buckets_map["61-90"] += rem
                else:
                    buckets_map["90+"] += rem

            records.append(
                {
                    "invoice_id": str(inv.id),
                    "invoice_no": inv.invoice_no,
                    "customer_id": str(inv.customer_id),
                    "due_date": str(inv.due_date),
                    "outstanding_amount": str(rem),
                    "days_overdue": max(0, days_diff),
                }
            )

        return AgingReportResponse(
            report_type="receivables",
            as_of_date=as_of,
            total_outstanding=total_outstanding.quantize(Decimal("0.01")),
            due_soon_amount=due_soon.quantize(Decimal("0.01")),
            overdue_amount=overdue.quantize(Decimal("0.01")),
            buckets=[AgingBucketItem(bucket_label=k, amount=v.quantize(Decimal("0.01"))) for k, v in buckets_map.items()],
            records=records,
        )

    async def get_payables_aging(
        self,
        company_id: uuid.UUID,
        as_of_date: date | None = None,
    ) -> AgingReportResponse:
        """Təchizatçı Borclarının Yaşlanma Analizi (Supplier Payables Aging Read-Model)."""
        as_of = as_of_date or utc_now().date()

        # supplier_ledger_entries cədvəlindən oxuyuruq
        stmt = (
            select(SupplierLedgerEntry)
            .where(SupplierLedgerEntry.company_id == company_id)
            .order_by(SupplierLedgerEntry.occurred_at.asc())
        )
        res = await self.session.execute(stmt)
        entries = list(res.scalars().all())

        # Təchizatçılar üzrə qalıqları və fakturaları hesablayırıq
        total_outstanding = Decimal("0.0000")
        due_soon = Decimal("0.0000")
        overdue = Decimal("0.0000")

        buckets_map = {
            "0-30": Decimal("0.0000"),
            "31-60": Decimal("0.0000"),
            "61-90": Decimal("0.0000"),
            "90+": Decimal("0.0000"),
        }

        records: list[dict[str, Any]] = []

        for e in entries:
            # Qaimələr borcu artırır
            if e.direction == SupplierLedgerDirection.CREDIT:
                due = e.due_date or e.occurred_at.date()
                amt = e.amount
                total_outstanding += amt

                days_diff = (as_of - due).days
                if days_diff < 0:
                    if abs(days_diff) <= 7:
                        due_soon += amt
                    buckets_map["0-30"] += amt
                else:
                    overdue += amt
                    if days_diff <= 30:
                        buckets_map["0-30"] += amt
                    elif days_diff <= 60:
                        buckets_map["31-60"] += amt
                    elif days_diff <= 90:
                        buckets_map["61-90"] += amt
                    else:
                        buckets_map["90+"] += amt

                records.append(
                    {
                        "entry_id": str(e.id),
                        "supplier_id": str(e.supplier_id),
                        "document_no": str(e.reference_id),
                        "due_date": str(due),
                        "amount": str(amt),
                        "days_overdue": max(0, days_diff),
                    }
                )
            elif e.direction == SupplierLedgerDirection.DEBIT:
                # Ödənişlər borcu azaldır
                total_outstanding -= e.amount

        total_outstanding = max(Decimal("0.0000"), total_outstanding)

        return AgingReportResponse(
            report_type="payables",
            as_of_date=as_of,
            total_outstanding=total_outstanding.quantize(Decimal("0.01")),
            due_soon_amount=due_soon.quantize(Decimal("0.01")),
            overdue_amount=overdue.quantize(Decimal("0.01")),
            buckets=[AgingBucketItem(bucket_label=k, amount=v.quantize(Decimal("0.01"))) for k, v in buckets_map.items()],
            records=records,
        )

    async def get_drill_down_transactions(
        self,
        company_id: uuid.UUID,
        metric_id: str,
        start_date: date,
        end_date: date,
        branch_id: uuid.UUID | None = None,
    ) -> ReportDrillDownResponse:
        """Göstəricinin təfərrüatlarına açılışı (Drill-down)."""
        definition = KPI_REGISTRY.get(metric_id)
        metric_name = definition.name_az if definition else metric_id

        dt_start = datetime(start_date.year, start_date.month, start_date.day)
        dt_end = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)

        records: list[dict[str, Any]] = []
        total_amt = Decimal("0.0000")

        if metric_id == "DEF-FIN-REV-001":  # Net Revenue
            stmt = select(Sale).where(
                and_(
                    Sale.company_id == company_id,
                    Sale.business_date >= start_date,
                    Sale.business_date <= end_date,
                    Sale.status == "COMPLETED",
                )
            )
            if branch_id is not None:
                stmt = stmt.where(Sale.branch_id == branch_id)
            res = await self.session.execute(stmt)
            for s in res.scalars().all():
                total_amt += s.subtotal
                records.append(
                    {
                        "id": str(s.id),
                        "receipt_no": s.receipt_no,
                        "date": str(s.business_date),
                        "amount": str(s.subtotal),
                        "tax": str(s.tax_total),
                        "grand_total": str(s.grand_total),
                    }
                )

        elif metric_id in ("DEF-FIN-CSH-001", "DEF-FIN-OEX-002"):  # Cash inflows or Cash OPEX
            direction = "IN" if metric_id == "DEF-FIN-CSH-001" else "OUT"
            stmt_tx = select(AccountTransaction).where(
                and_(
                    AccountTransaction.company_id == company_id,
                    AccountTransaction.direction == direction,
                    AccountTransaction.occurred_at >= dt_start,
                    AccountTransaction.occurred_at <= dt_end,
                )
            )
            res_tx = await self.session.execute(stmt_tx)
            for tx in res_tx.scalars().all():
                total_amt += tx.amount
                records.append(
                    {
                        "id": str(tx.id),
                        "account_id": str(tx.account_id),
                        "direction": tx.direction,
                        "amount": str(tx.amount),
                        "occurred_at": tx.occurred_at.isoformat(),
                        "source_type": tx.source_type,
                        "memo": tx.memo,
                    }
                )

        elif metric_id == "DEF-FIN-OEX-001":  # Accrual OPEX
            stmt_exp = select(Expense).where(
                and_(
                    Expense.company_id == company_id,
                    Expense.expense_date >= start_date,
                    Expense.expense_date <= end_date,
                    Expense.status == "PAID",
                )
            )
            if branch_id is not None:
                stmt_exp = stmt_exp.where(Expense.branch_id == branch_id)
            res_exp = await self.session.execute(stmt_exp)
            for exp in res_exp.scalars().all():
                total_amt += exp.net_amount
                records.append(
                    {
                        "id": str(exp.id),
                        "expense_no": exp.expense_no,
                        "expense_date": str(exp.expense_date),
                        "gross_amount": str(exp.gross_amount),
                        "tax_amount": str(exp.tax_amount),
                        "net_amount": str(exp.net_amount),
                        "description": exp.description,
                    }
                )

        return ReportDrillDownResponse(
            metric_id=metric_id,
            metric_name=metric_name,
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            total_amount=total_amt.quantize(Decimal("0.01")),
            record_count=len(records),
            records=records,
        )

