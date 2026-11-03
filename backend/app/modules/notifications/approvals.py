"""Təsdiqləmələr Qutusu və Sayğac Aqreqasiyası (Approvals Inbox Service).

İstifadəçinin cari hüquq və filial səlahiyyətləri daxilində onun təsdiqini gözləyən
bütün sənədləri (Satınalma sorğuları, Transferlər, Xərclər, Məzuniyyətlər, Maaş cədvəlləri və s.)
vahid pəncərədə birləşdirir və UI sidebar nişanları (badge) üçün sayları təqdim edir.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.schemas import ApprovalsInboxItem, ApprovalsInboxSummary


class ApprovalsInboxService:
    """Təsdiq gözləyən əməliyyatların aqreqatoru."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_user_approvals_summary(self, actor: Any) -> ApprovalsInboxSummary:
        """İstifadəçinin rol və səlahiyyətlərinə uyğun gözləyən təsdiqləri toplayır."""
        user_roles = getattr(actor, "roles", [])
        user_permissions = getattr(actor, "permissions", [])

        counts_by_type: dict[str, int] = {
            "PURCHASE_REQUEST": 0,
            "PURCHASE_ORDER": 0,
            "TRANSFER": 0,
            "EXPENSE": 0,
            "LEAVE": 0,
            "PAYROLL": 0,
            "CAMPAIGN": 0,
        }
        items: list[ApprovalsInboxItem] = []

        # 1. Satınalma Sifarişləri (PO Approvals)
        if "purchasing.order.approve" in user_permissions or "system_admin" in user_roles:
            try:
                from app.modules.purchasing.models import PurchaseOrder

                po_stmt = select(PurchaseOrder).where(PurchaseOrder.status.in_(["PENDING_APPROVAL", "SUBMITTED"]))
                po_res = await self.session.execute(po_stmt)
                pos = list(po_res.scalars().all())
                counts_by_type["PURCHASE_ORDER"] = len(pos)
                for po in pos[:10]:
                    po_no = getattr(po, "po_no", getattr(po, "order_number", str(po.id)[:8]))
                    amount_val = str(getattr(po, "total_amount", getattr(po, "subtotal", "0.00")))
                    items.append(
                        ApprovalsInboxItem(
                            id=str(po.id),
                            type="PURCHASE_ORDER",
                            title=f"Satınalma Sifarişi: {po_no}",
                            requester_name=None,
                            amount=amount_val,
                            currency=getattr(po, "currency", "AZN"),
                            created_at=po.created_at.isoformat() if hasattr(po, "created_at") else "",
                            deep_link=f"/purchasing/orders/{po.id}",
                        )
                    )
            except Exception:
                pass

        # 2. Anbarlararası Transferlər (Transfer Approvals)
        if "transfers.approve" in user_permissions or "system_admin" in user_roles:
            try:
                from app.modules.transfers.models import StockTransfer

                tr_stmt = select(StockTransfer).where(StockTransfer.status.in_(["REQUESTED", "PENDING_APPROVAL"]))
                tr_res = await self.session.execute(tr_stmt)
                trs = list(tr_res.scalars().all())
                counts_by_type["TRANSFER"] = len(trs)
                for tr in trs[:10]:
                    tr_no = getattr(tr, "transfer_no", str(tr.id)[:8])
                    items.append(
                        ApprovalsInboxItem(
                            id=str(tr.id),
                            type="TRANSFER",
                            title=f"Transfer Təsdiqi: {tr_no}",
                            requester_name=None,
                            amount=None,
                            currency=None,
                            created_at=tr.created_at.isoformat() if hasattr(tr, "created_at") else "",
                            deep_link=f"/transfers/{tr.id}",
                        )
                    )
            except Exception:
                pass

        # 3. Maliyyə Xərcləri (Expense Approvals)
        if "finance.expense.approve" in user_permissions or "system_admin" in user_roles:
            try:
                from app.modules.finance.models import Expense

                exp_stmt = select(Expense).where(Expense.status == "PENDING_APPROVAL")
                exp_res = await self.session.execute(exp_stmt)
                exps = list(exp_res.scalars().all())
                counts_by_type["EXPENSE"] = len(exps)
                for exp in exps[:10]:
                    exp_title = getattr(exp, "expense_no", str(exp.id)[:8])
                    amount_val = str(getattr(exp, "gross_amount", getattr(exp, "net_amount", "0.00")))
                    items.append(
                        ApprovalsInboxItem(
                            id=str(exp.id),
                            type="EXPENSE",
                            title=f"Xərc Təsdiqi: {exp_title}",
                            requester_name=None,
                            amount=amount_val,
                            currency="AZN",
                            created_at=exp.created_at.isoformat() if hasattr(exp, "created_at") else "",
                            deep_link=f"/finance/expenses/{exp.id}",
                        )
                    )
            except Exception:
                pass

        # 4. Məzuniyyət Müraciətləri (Leave Approvals)
        if "hr.leave.approve" in user_permissions or "system_admin" in user_roles:
            try:
                from app.modules.hr.models import LeaveRequest

                leave_stmt = select(LeaveRequest).where(LeaveRequest.status == "PENDING")
                leave_res = await self.session.execute(leave_stmt)
                leaves = list(leave_res.scalars().all())
                counts_by_type["LEAVE"] = len(leaves)
                for lv in leaves[:10]:
                    items.append(
                        ApprovalsInboxItem(
                            id=str(lv.id),
                            type="LEAVE",
                            title=f"Məzuniyyət Sorğusu: {lv.leave_type}",
                            requester_name=None,
                            amount=f"{lv.days_count} gün",
                            currency=None,
                            created_at=lv.created_at.isoformat() if hasattr(lv, "created_at") else "",
                            deep_link=f"/hr/leaves/{lv.id}",
                        )
                    )
            except Exception:
                pass

        # 5. Maaş Cədvəli (Payroll Approvals)
        if "payroll.run.approve" in user_permissions or "system_admin" in user_roles:
            try:
                from app.modules.payroll.models import PayrollRun

                pr_stmt = select(PayrollRun).where(PayrollRun.status.in_(["CALCULATED", "PENDING_APPROVAL"]))
                pr_res = await self.session.execute(pr_stmt)
                runs = list(pr_res.scalars().all())
                counts_by_type["PAYROLL"] = len(runs)
                for r in runs[:5]:
                    items.append(
                        ApprovalsInboxItem(
                            id=str(r.id),
                            type="PAYROLL",
                            title=f"Maaş Cədvəli Təsdiqi: {r.run_no}",
                            requester_name=None,
                            amount=str(r.total_net),
                            currency="AZN",
                            created_at=r.created_at.isoformat() if hasattr(r, "created_at") else "",
                            deep_link=f"/payroll/runs/{r.id}",
                        )
                    )
            except Exception:
                pass

        total_pending = sum(counts_by_type.values())
        return ApprovalsInboxSummary(
            total_pending=total_pending,
            counts_by_type=counts_by_type,
            items=items,
        )
