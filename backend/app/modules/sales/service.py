"""Satışlar Modulu Biznes Xidməti (Sales Service).

Satış qeydlərinin axtarışı, təfərrüatların əldə edilməsi (maya dəyəri hüququ ilə),
çəkin təkrar çapı (ESC/POS və HTML formatları ilə) və satışın ləğvi tarixçəsi.
"""

from __future__ import annotations

import base64
import uuid
from decimal import Decimal
from typing import Any

from app.core.database import utc_now
from app.core.errors import NotFoundError, ValidationError
from app.core.money import round_money
from app.core.uow import UnitOfWork
from app.modules.sales.models import Sale, SaleEvent
from app.modules.sales.policies import (
    can_view_sale_costs,
    check_reprint_sale_permission,
    check_view_sales_permission,
)
from app.modules.sales.repository import SalesRepository
from app.modules.sales.schemas import (
    ReprintResponse,
    SaleDetailResponse,
    SaleEventResponse,
    SaleFilterParams,
    SaleLineResponse,
    SaleListResponse,
    SalePaymentResponse,
    SaleSummaryResponse,
)


class SalesService:
    """Satış idarəetmə və arxiv xidməti."""

    def __init__(self, repository: SalesRepository | None = None) -> None:
        self.repo = repository or SalesRepository()

    async def search_sales(
        self,
        filters: SaleFilterParams,
        company_id: uuid.UUID | None = None,
        actor: Any = None,
    ) -> SaleListResponse:
        """Satış qeydlərinin çoxmeyarlı axtarışı və siyahılanması."""
        check_view_sales_permission(actor)
        has_cost_view = can_view_sale_costs(actor)

        offset = (filters.page - 1) * filters.page_size
        async with UnitOfWork() as uow:
            sales, total = await self.repo.search_sales(
                session=uow.session,
                company_id=company_id,
                branch_id=filters.branch_id,
                register_id=filters.register_id,
                shift_id=filters.shift_id,
                cashier_id=filters.cashier_id,
                customer_id=filters.customer_id,
                status=filters.status,
                tender_type=filters.tender_type,
                start_date=filters.start_date,
                end_date=filters.end_date,
                query=filters.query,
                min_amount=filters.min_amount,
                max_amount=filters.max_amount,
                offset=offset,
                limit=filters.page_size,
            )

            items = [self._to_summary_response(s, has_cost_view) for s in sales]
            total_pages = (total + filters.page_size - 1) // filters.page_size if total > 0 else 0

            return SaleListResponse(
                items=items,
                total=total,
                page=filters.page,
                page_size=filters.page_size,
                total_pages=total_pages,
            )

    async def get_sale_by_id(self, sale_id: uuid.UUID, actor: Any = None) -> SaleDetailResponse:
        """ID üzrə satışın detallı məlumatlarını gətirir."""
        check_view_sales_permission(actor)
        has_cost_view = can_view_sale_costs(actor)

        async with UnitOfWork() as uow:
            sale = await self.repo.get_sale_by_id(uow.session, sale_id)
            if not sale:
                raise NotFoundError(f"'{sale_id}' ID-li satış qeydi tapılmadı.")
            return self._to_detail_response(sale, has_cost_view)

    async def get_sale_by_receipt_no(
        self, receipt_no: str, actor: Any = None
    ) -> SaleDetailResponse:
        """Çək nömrəsi və ya barkod üzrə axtarış."""
        check_view_sales_permission(actor)
        has_cost_view = can_view_sale_costs(actor)

        async with UnitOfWork() as uow:
            sale = await self.repo.get_sale_by_receipt_no(uow.session, receipt_no)
            if not sale:
                raise NotFoundError(f"'{receipt_no}' nömrəli kassa çeki tapılmadı.")
            return self._to_detail_response(sale, has_cost_view)

    async def reprint_receipt(
        self, sale_id: uuid.UUID, reason: str, actor: Any = None
    ) -> ReprintResponse:
        """Kassa çəkinin təkrar çap edilməsi (Audit hadisəsi qeyd olunur və surət nişanı qoyulur)."""
        check_reprint_sale_permission(actor)

        clean_reason = (reason or "").strip()
        if not clean_reason:
            raise ValidationError("Təkrar çap üçün əsaslandırılmış səbəb mütləq göstərilməlidir.")

        async with UnitOfWork() as uow:
            sale = await self.repo.get_sale_by_id(uow.session, sale_id)
            if not sale:
                raise NotFoundError(f"'{sale_id}' ID-li satış qeydi tapılmadı.")

            now = utc_now()
            sale.reprint_count += 1
            actor_id = getattr(actor, "id", None)

            event = SaleEvent(
                id=uuid.uuid4(),
                sale_id=sale.id,
                event_type="REPRINTED",
                actor_id=actor_id,
                reason=reason.strip(),
                metadata_json={
                    "reprint_number": sale.reprint_count,
                    "reprinted_at": now.isoformat(),
                },
                created_at=now,
            )
            await self.repo.add_sale_event(uow.session, event)
            await uow.commit()

            # ESC/POS baytları və HTML formatında qəbz generasiyası
            esc_pos_bytes = self._generate_esc_pos_reprint(sale)
            html_receipt = self._generate_html_reprint(sale)

            return ReprintResponse(
                sale_id=sale.id,
                receipt_no=sale.receipt_no,
                reprint_number=sale.reprint_count,
                reprinted_at=now,
                is_copy=True,
                esc_pos_bytes_base64=base64.b64encode(esc_pos_bytes).decode("ascii"),
                html_receipt=html_receipt,
                receipt_data={
                    "receipt_no": sale.receipt_no,
                    "reprint_number": sale.reprint_count,
                    "business_date": sale.business_date.isoformat(),
                    "grand_total": str(sale.grand_total),
                    "items_count": len(sale.lines),
                },
            )

    # --- Köməkçi Formatlaşdırma və Qorunma Funksiyaları ---

    def _to_summary_response(self, sale: Sale, has_cost_view: bool) -> SaleSummaryResponse:
        cost_total = sale.cost_total if has_cost_view else None
        margin_amount = None
        margin_percent = None

        if has_cost_view and sale.cost_total is not None:
            margin_amount = round_money(sale.grand_total - sale.cost_total)
            if sale.grand_total > Decimal("0.00"):
                margin_percent = round_money((margin_amount / sale.grand_total) * Decimal("100.00"))

        return SaleSummaryResponse(
            id=sale.id,
            receipt_no=sale.receipt_no,
            branch_id=sale.branch_id,
            register_id=sale.register_id,
            shift_id=sale.shift_id,
            cashier_id=sale.cashier_id,
            customer_id=sale.customer_id,
            status=sale.status,
            subtotal=sale.subtotal,
            discount_total=sale.discount_total,
            tax_total=sale.tax_total,
            grand_total=sale.grand_total,
            paid_amount=sale.paid_amount,
            change_amount=sale.change_amount,
            cost_total=cost_total,
            margin_amount=margin_amount,
            margin_percent=margin_percent,
            currency=sale.currency,
            business_date=sale.business_date,
            created_at=sale.created_at,
            reprint_count=sale.reprint_count,
        )

    def _to_detail_response(self, sale: Sale, has_cost_view: bool) -> SaleDetailResponse:
        summary = self._to_summary_response(sale, has_cost_view)

        lines: list[SaleLineResponse] = []
        for s_line in sale.lines:
            c_price = s_line.cost_price if has_cost_view else None
            m_amount = None
            if has_cost_view and s_line.cost_price is not None:
                m_amount = round_money(s_line.total_amount - (s_line.cost_price * s_line.quantity))

            lines.append(
                SaleLineResponse(
                    id=s_line.id,
                    line_no=s_line.line_no,
                    variant_id=s_line.variant_id,
                    product_id=s_line.product_id,
                    sku=s_line.sku,
                    barcode=s_line.barcode,
                    product_name=s_line.product_name,
                    quantity=s_line.quantity,
                    unit_price=s_line.unit_price,
                    cost_price=c_price,
                    gross_amount=s_line.gross_amount,
                    discount_amount=s_line.discount_amount,
                    tax_rate=s_line.tax_rate,
                    tax_amount=s_line.tax_amount,
                    total_amount=s_line.total_amount,
                    margin_amount=m_amount,
                )
            )

        payments = [
            SalePaymentResponse(
                id=p.id,
                tender_type=p.tender_type,
                amount=p.amount,
                tendered_amount=p.tendered_amount,
                change_amount=p.change_amount,
                provider_confirmation_id=p.provider_confirmation_id,
                approval_code=p.approval_code,
                masked_reference=p.masked_reference,
                created_at=p.created_at,
            )
            for p in sale.payments
        ]

        events = [
            SaleEventResponse(
                id=e.id,
                event_type=e.event_type,
                actor_id=e.actor_id,
                reason=e.reason,
                metadata_json=e.metadata_json,
                created_at=e.created_at,
            )
            for e in sale.events
        ]

        return SaleDetailResponse(
            **summary.model_dump(),
            breakdown=sale.breakdown,
            payment_summary=sale.payment_summary,
            cancelled_at=sale.cancelled_at,
            cancelled_by_id=sale.cancelled_by_id,
            cancellation_reason=sale.cancellation_reason,
            lines=lines,
            payments=payments,
            events=events,
        )

    def _generate_esc_pos_reprint(self, sale: Sale) -> bytes:
        """Termal printer üçün ESC/POS əmrlər massivi formalaşdırır (NÜSXƏ işarəsi ilə)."""
        ESC = b"\x1b"
        GS = b"\x1d"

        buf = bytearray()
        buf.extend(ESC + b"@")  # Initialize printer
        buf.extend(ESC + b"a\x01")  # Center alignment
        buf.extend(ESC + b"E\x01")  # Bold ON
        buf.extend(b"*** NUSXE / DUPLICATE COPY ***\n")
        buf.extend(f"Tekrar Cap #{sale.reprint_count}\n".encode())
        buf.extend(ESC + b"E\x00")  # Bold OFF
        buf.extend(b"BRAND HOUSE\n")
        buf.extend(f"Cek: {sale.receipt_no}\n".encode())
        buf.extend(f"Tarix: {sale.business_date.isoformat()}\n".encode())
        buf.extend(b"--------------------------------\n")
        buf.extend(ESC + b"a\x00")  # Left alignment

        for line in sale.lines:
            buf.extend(f"{line.product_name}\n".encode())
            buf.extend(
                f"  {line.quantity} x {line.unit_price} AZN = {line.total_amount} AZN\n".encode()
            )

        buf.extend(b"--------------------------------\n")
        buf.extend(ESC + b"a\x02")  # Right alignment
        buf.extend(ESC + b"E\x01")  # Bold ON
        buf.extend(f"YEKUN: {sale.grand_total} AZN\n".encode())
        buf.extend(ESC + b"E\x00")  # Bold OFF
        buf.extend(f"Odenilib: {sale.paid_amount} AZN\n".encode())
        if sale.change_amount > Decimal("0.00"):
            buf.extend(f"Qaliq: {sale.change_amount} AZN\n".encode())

        buf.extend(ESC + b"a\x01")  # Center
        buf.extend(b"\n*** MALIN QAYTARILMASI UCUN ETIBARSIZDIR ***\n")
        buf.extend(b"\n\n\n")
        buf.extend(GS + b"V\x41\x00")  # Cut paper

        return bytes(buf)

    def _generate_html_reprint(self, sale: Sale) -> str:
        """HTML / PDF formatında çap şablonu formalaşdırır."""
        items_html = "".join(
            [
                f"<tr><td>{s_line.product_name} ({s_line.sku})</td><td style='text-align:center'>{s_line.quantity}</td>"
                f"<td style='text-align:right'>{s_line.unit_price} AZN</td><td style='text-align:right'>{s_line.total_amount} AZN</td></tr>"
                for s_line in sale.lines
            ]
        )

        return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Çek Nüsxəsi - {sale.receipt_no}</title>
<style>
  body {{ font-family: monospace, sans-serif; font-size: 13px; max-width: 320px; margin: auto; padding: 10px; border: 1px dashed #666; }}
  .watermark {{ color: red; font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 8px; }}
  .header {{ text-align: center; margin-bottom: 12px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
  th, td {{ padding: 4px 0; border-bottom: 1px dotted #ccc; font-size: 12px; }}
  .totals {{ margin-top: 10px; text-align: right; }}
  .footer {{ text-align: center; font-size: 11px; margin-top: 16px; color: #555; }}
</style>
</head>
<body>
  <div class="watermark">*** NÜSXƏ / DUPLICATE COPY ***</div>
  <div class="header">
    <strong>BRAND HOUSE</strong><br>
    Çek №: <strong>{sale.receipt_no}</strong><br>
    Təkrar çap №: {sale.reprint_count}<br>
    Tarix: {sale.business_date.isoformat()}
  </div>
  <table>
    <thead><tr><th>Məhsul</th><th>Say</th><th>Qiymət</th><th>Məbləğ</th></tr></thead>
    <tbody>{items_html}</tbody>
  </table>
  <div class="totals">
    <div>Cəmi: <strong>{sale.subtotal} AZN</strong></div>
    <div>Endirim: <strong>-{sale.discount_total} AZN</strong></div>
    <div>ƏDV: <strong>{sale.tax_total} AZN</strong></div>
    <div style="font-size: 15px; margin-top: 4px;"><strong>YEKUN: {sale.grand_total} AZN</strong></div>
    <div>Ödənilib: {sale.paid_amount} AZN</div>
    <div>Qalıq: {sale.change_amount} AZN</div>
  </div>
  <div class="footer">
    Malın geri qaytarılması üçün yalnız orijinal qəbz tələb olunur.<br>
    Bizi seçdiyiniz üçün təşəkkür edirik!
  </div>
</body>
</html>"""


def get_sales_service() -> SalesService:
    return SalesService()
