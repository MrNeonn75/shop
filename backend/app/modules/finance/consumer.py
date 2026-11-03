"""Maliyyə Outbox Hadisə İstehlakçısı (Finance Outbox Consumer).

Transactional Outbox-dan çıxan domen hadisələrini (sale.completed, return.completed,
goods_receipt.completed, invoice.approved, payroll.finalized, shift.closed) dinləyir,
idempotent olaraq AccountingPort-a (Operational və ya GL) ötürür.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.logging import logger
from app.modules.finance.operational_adapter import OperationalLedgerAdapter
from app.modules.finance.port import AccountingEvent
from app.modules.finance.repository import FinanceRepository


class FinanceOutboxConsumer:
    """Outbox hadisələrini idempotent şəkildə emal edən maliyyə istehlakçısı."""

    CONSUMER_NAME = "finance_domain_consumer"

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = FinanceRepository(session)
        self.adapter = OperationalLedgerAdapter(session)

    async def consume_event(
        self,
        event_id: uuid.UUID,
        event_type: str,
        payload: dict[str, Any],
        company_id: uuid.UUID | None = None,
    ) -> bool:
        """Tək bir domen hadisəsini idempotent şəkildə emal edir."""
        # 1. İdempotentlik yoxlanışı (processed_events cədvəli)
        if await self.repo.is_event_processed(event_id, self.CONSUMER_NAME):
            logger.info("Maliyyə istehlakçısı: Hadisə artıq emal olunub (Skipped)", event_id=str(event_id))
            return True

        comp_id = company_id or uuid.UUID(payload.get("company_id", "00000000-0000-0000-0000-000000000001"))
        branch_id_str = payload.get("branch_id")
        branch_id = uuid.UUID(branch_id_str) if branch_id_str else None

        dt_str = payload.get("business_date") or payload.get("occurred_at") or payload.get("sale_date")
        b_date = date.fromisoformat(str(dt_str)[:10]) if dt_str else utc_now().date()

        try:
            # 2. Hadisə tipinə görə mühasibat hadisələrinin formalaşdırılması
            if event_type in ("sale.completed", "sale_completed"):
                subtotal = Decimal(str(payload.get("subtotal", "0.0000")))
                tax_total = Decimal(str(payload.get("tax_total", "0.0000")))
                grand_total = Decimal(str(payload.get("grand_total", "0.0000")))
                cost_total = Decimal(str(payload.get("cost_total", "0.0000")))
                sale_id_str = payload.get("sale_id")
                sale_id = uuid.UUID(sale_id_str) if sale_id_str else None

                # Gəlir tanınması
                await self.adapter.post(
                    AccountingEvent(
                        event_id=event_id,
                        event_type="SALE_RECOGNIZED",
                        company_id=comp_id,
                        branch_id=branch_id,
                        business_date=b_date,
                        gross_amount=grand_total,
                        net_amount=subtotal,
                        tax_amount=tax_total,
                        cost_amount=cost_total,
                        source_type="sale",
                        source_id=sale_id,
                        details=payload,
                    )
                )

                # Maya dəyəri tanınması
                if cost_total > Decimal("0.0000"):
                    await self.adapter.post(
                        AccountingEvent(
                            event_id=uuid.uuid5(event_id, "cogs"),
                            event_type="COGS_RECOGNIZED",
                            company_id=comp_id,
                            branch_id=branch_id,
                            business_date=b_date,
                            cost_amount=cost_total,
                            source_type="sale_cogs",
                            source_id=sale_id,
                            details=payload,
                        )
                    )

            elif event_type in ("return.completed", "return_completed"):
                refund_total = Decimal(str(payload.get("refund_total", "0.0000")))
                tax_reversal = Decimal(str(payload.get("tax_reversal_total", "0.0000")))
                net_refund = refund_total - tax_reversal
                resalable_cost = Decimal(str(payload.get("resalable_cost_total", "0.0000")))
                return_id_str = payload.get("return_id")
                return_id = uuid.UUID(return_id_str) if return_id_str else None

                # Mənfi gəlir tanınması
                await self.adapter.post(
                    AccountingEvent(
                        event_id=event_id,
                        event_type="RETURN_RECOGNIZED",
                        company_id=comp_id,
                        branch_id=branch_id,
                        business_date=b_date,
                        gross_amount=-refund_total,
                        net_amount=-net_refund,
                        tax_amount=-tax_reversal,
                        cost_amount=-resalable_cost,
                        source_type="return",
                        source_id=return_id,
                        details=payload,
                    )
                )

            elif event_type in ("goods_receipt.completed", "inventory.received"):
                total_val = Decimal(str(payload.get("total_amount", "0.0000")))
                await self.adapter.post(
                    AccountingEvent(
                        event_id=event_id,
                        event_type="INVENTORY_RECEIVED",
                        company_id=comp_id,
                        branch_id=branch_id,
                        business_date=b_date,
                        cost_amount=total_val,
                        gross_amount=total_val,
                        source_type="goods_receipt",
                        details=payload,
                    )
                )

            elif event_type in ("supplier_invoice.approved", "invoice.approved"):
                inv_total = Decimal(str(payload.get("total_amount", "0.0000")))
                await self.adapter.post(
                    AccountingEvent(
                        event_id=event_id,
                        event_type="SUPPLIER_INVOICE_APPROVED",
                        company_id=comp_id,
                        branch_id=branch_id,
                        business_date=b_date,
                        gross_amount=inv_total,
                        source_type="supplier_invoice",
                        details=payload,
                    )
                )

            elif event_type in ("payroll.finalized", "payroll_finalized"):
                payroll_total = Decimal(str(payload.get("total_net_salary", payload.get("total_amount", "0.0000"))))
                await self.adapter.post(
                    AccountingEvent(
                        event_id=event_id,
                        event_type="PAYROLL_POSTED",
                        company_id=comp_id,
                        branch_id=branch_id,
                        business_date=b_date,
                        gross_amount=payroll_total,
                        source_type="payroll",
                        details=payload,
                    )
                )

            elif event_type in ("shift.closed", "shift_closed"):
                variance = Decimal(str(payload.get("variance", "0.0000")))
                if variance != Decimal("0.0000"):
                    await self.adapter.post(
                        AccountingEvent(
                            event_id=event_id,
                            event_type="CASH_VARIANCE",
                            company_id=comp_id,
                            branch_id=branch_id,
                            business_date=b_date,
                            gross_amount=variance,
                            source_type="shift_variance",
                            details=payload,
                        )
                    )

            # 3. İdempotent qeydiyyat
            await self.repo.mark_event_processed(event_id, self.CONSUMER_NAME, "PROCESSED")
            await self.session.commit()
            return True

        except Exception as exc:
            await self.repo.mark_event_processed(
                event_id, self.CONSUMER_NAME, "FAILED", error_message=str(exc)
            )
            await self.session.commit()
            logger.error("Maliyyə istehlakçısı hadisə emalında xəta", event_id=str(event_id), error=str(exc))
            return False

