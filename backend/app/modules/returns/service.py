"""Qaytarmalar və Mübadilələr Əsas Xidmət Qatı (Returns Service).

1. Tək Tranzaksiyada Qaytarma İcrası (POST /returns).
2. Tək Tranzaksiyada Mübadilə İcrası (POST /returns/exchange).
3. Təsdiq Gözləyən Qaytarmaların İdarəsi (PENDING_APPROVAL -> Approve/Reject).
4. Çeksiz Qaytarma Qaydaları və Fırıldaqçılıq İndikatorları.
5. Sadiqlik Xallarının və Mağaza Kreditlərinin (Store Credit) Atomik Əməliyyatları.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Sequence
from contextlib import AsyncExitStack
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ManagerApprovalError,
    NotFoundError,
    ValidationError,
)
from app.core.ids import generate_uuid7
from app.core.money import round_money
from app.core.uow import UnitOfWork
from app.modules.cash_registers.service import get_cash_register_service
from app.modules.integrations.service import IntegrationService
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.numbering.service import NumberingService, get_numbering_service
from app.modules.pos.models import CashMovement, PosShift
from app.modules.pos.repository import PosRepository
from app.modules.pos.schemas import CartLineInput, SaleCheckoutRequest, TenderPaymentInput
from app.modules.pos.service import PosService
from app.modules.returns.events import (
    ExchangeCompletedEvent,
    ReturnApprovedEvent,
    ReturnCompletedEvent,
    ReturnFraudAlertEvent,
    ReturnRejectedEvent,
    StoreCreditIssuedEvent,
)
from app.modules.returns.loyalty import CrmLoyaltyService, DefaultCrmLoyaltyService
from app.modules.returns.models import (
    Refund,
    SaleLineReturnState,
    SaleReturn,
    SaleReturnLine,
    StoreCreditLedger,
)
from app.modules.returns.policies import ReturnsPolicy
from app.modules.returns.quote_service import ReturnsQuoteService
from app.modules.returns.repository import ReturnsRepository
from app.modules.returns.schemas import (
    CustomerReturnsHistoryResponse,
    ExchangeCreateRequest,
    FraudIndicatorItem,
    RefundMethodInput,
    ReturnApproveRequest,
    ReturnCreateRequest,
    ReturnDetailResponse,
    ReturnFilterParams,
    ReturnFraudIndicatorsResponse,
    ReturnQuoteRequest,
    ReturnQuoteResponse,
    ReturnReceiptPayload,
    ReturnRejectRequest,
    ReturnSummaryResponse,
    SaleReturnableInfoResponse,
    SaleReturnableLineResponse,
)
from app.modules.sales.models import Sale, SaleEvent
from app.modules.sales.repository import SalesRepository
from app.modules.settings.service import SettingsService
from app.shared.audit import record_audit_event
from app.shared.outbox import record_outbox_event

STANDARD_RETURN_REASONS = [
    {
        "code": "DEFECTIVE",
        "label": "Zay / Qüsurlu məhsul",
        "description": "İstehsalat və ya material qüsuru",
        "requires_notes": True,
    },
    {
        "code": "WRONG_SIZE",
        "label": "Ölçü uyğunsuzluğu",
        "description": "Razmer müştəriyə uyğun gəlmədi",
        "requires_notes": False,
    },
    {
        "code": "CHANGED_MIND",
        "label": "Müştəri fikrini dəyişdi",
        "description": "İstifadə edilməmiş malın könüllü qaytarılması",
        "requires_notes": False,
    },
    {
        "code": "NOT_AS_DESCRIBED",
        "label": "Təsvirə uyğun deyil",
        "description": "Rəng, model və ya funksiya fərqlidir",
        "requires_notes": True,
    },
    {
        "code": "DAMAGED_DELIVERY",
        "label": "Çatdırılmada zədələnib",
        "description": "Nəqliyyat zamanı qablaşdırma və ya mal xarab olub",
        "requires_notes": True,
    },
    {
        "code": "OTHER",
        "label": "Digər səbəb",
        "description": "Xüsusi qeyd tələb edən digər hallar",
        "requires_notes": True,
    },
]

_sale_line_locks: dict[uuid.UUID, asyncio.Lock] = {}
_sale_line_locks_mutex = asyncio.Lock()


async def _get_sale_line_lock(sale_line_id: uuid.UUID) -> asyncio.Lock:
    async with _sale_line_locks_mutex:
        if sale_line_id not in _sale_line_locks:
            _sale_line_locks[sale_line_id] = asyncio.Lock()
        return _sale_line_locks[sale_line_id]


class ReturnsService:
    """Qaytarma və mübadilə proseslərinin mərkəzi biznes mühərriki."""

    def __init__(
        self,
        repository: ReturnsRepository | None = None,
        quote_service: ReturnsQuoteService | None = None,
        inventory_service: InventoryService | None = None,
        numbering_service: NumberingService | None = None,
        settings_service: SettingsService | None = None,
        pos_service: PosService | None = None,
        loyalty_service: CrmLoyaltyService | None = None,
        integrations_service: IntegrationService | None = None,
        pos_repo: PosRepository | None = None,
        sales_repo: SalesRepository | None = None,
    ) -> None:
        self.repo = repository or ReturnsRepository()
        self.quote_svc = quote_service or ReturnsQuoteService(self.repo)
        self.inventory = inventory_service or InventoryService()
        self.numbering = numbering_service or get_numbering_service()
        self.settings = settings_service or SettingsService()
        self.pos_svc = pos_service or PosService()
        self.loyalty_svc = loyalty_service or DefaultCrmLoyaltyService()
        self.integrations = integrations_service or IntegrationService()
        self.pos_repo = pos_repo or PosRepository()
        self.sales_repo = sales_repo or SalesRepository()

    # --- 1. Qaytarma Önizləməsi (Quote) ---

    async def quote_return(
        self,
        company_id: uuid.UUID,
        request: ReturnQuoteRequest,
        actor: Any = None,
    ) -> ReturnQuoteResponse:
        """Qaytarma qiymətləndirməsi və qayda önizləməsi."""
        async with UnitOfWork() as uow:
            return await self.quote_svc.quote(
                session=uow.session,
                company_id=company_id,
                request=request,
                actor=actor,
            )

    # --- 2. Orijinal Satışın Qaytarıla Bilən Məlumatı ---

    async def get_sale_returnable_info(
        self,
        company_id: uuid.UUID,
        sale_id: uuid.UUID,
        actor: Any = None,
    ) -> SaleReturnableInfoResponse:
        """Satış üzrə sətir-sətir qaytarıla bilən qalıq sayları gətirir."""
        _ = actor
        async with UnitOfWork() as uow:
            sale = await self.repo.get_sale_by_id(uow.session, sale_id)
            if not sale or sale.company_id != company_id:
                raise NotFoundError(f"'{sale_id}' ID-li satış sənədi tapılmadı.")

            window_days = 14
            try:
                w_setting = await self.settings.get(
                    key="returns.window_days",
                    branch_id=sale.branch_id,
                    session=uow.session,
                )
                if w_setting and isinstance(w_setting.value, int | float):
                    window_days = int(w_setting.value)
            except Exception:
                pass

            now_date = utc_now().date()
            days_since = (now_date - sale.business_date).days
            within_window = days_since <= window_days

            lines_resp: list[SaleReturnableLineResponse] = []
            for s_line in sale.lines:
                state = await self.repo.get_or_create_return_state(uow.session, s_line)
                returnable = state.sold_qty - state.returned_qty - state.reserved_qty
                unit_paid = (
                    round_money(s_line.total_amount / Decimal(str(s_line.quantity)))
                    if s_line.quantity > 0
                    else Decimal("0.00")
                )
                lines_resp.append(
                    SaleReturnableLineResponse(
                        sale_line_id=s_line.id,
                        line_no=s_line.line_no,
                        variant_id=s_line.variant_id,
                        sku=s_line.sku,
                        product_name=s_line.product_name,
                        sold_quantity=state.sold_qty,
                        already_returned_quantity=state.returned_qty,
                        reserved_quantity=state.reserved_qty,
                        returnable_quantity=returnable,
                        unit_price=s_line.unit_price,
                        paid_per_unit=unit_paid,
                        tax_rate=s_line.tax_rate,
                    )
                )

            return SaleReturnableInfoResponse(
                sale_id=sale.id,
                receipt_no=sale.receipt_no,
                sale_date=sale.business_date,
                window_days=window_days,
                is_within_window=within_window,
                days_since_sale=days_since,
                lines=lines_resp,
            )

    # --- 3. Qaytarmanın Tamamlanması (POST /returns) ---

    async def create_return(
        self,
        company_id: uuid.UUID,
        request: ReturnCreateRequest,
        actor: Any,
        idempotency_key: str,
        session: AsyncSession | None = None,
        exchange_group_id: uuid.UUID | None = None,
    ) -> ReturnReceiptPayload | ReturnDetailResponse:
        """Tək tranzaksiyada 100% atomik qaytarma əməliyyatı."""
        line_ids = sorted(
            [
                item.original_sale_line_id
                for item in request.items
                if item.original_sale_line_id is not None
            ],
            key=lambda x: str(x),
        )
        locks = [await _get_sale_line_lock(lid) for lid in line_ids]
        res: ReturnReceiptPayload | ReturnDetailResponse | None = None
        async with AsyncExitStack() as stack:
            for lk in locks:
                await stack.enter_async_context(lk)
            res = await self._do_create_return(
                company_id=company_id,
                request=request,
                actor=actor,
                idempotency_key=idempotency_key,
                session=session,
                exchange_group_id=exchange_group_id,
            )
        assert res is not None
        return res

    async def _do_create_return(
        self,
        company_id: uuid.UUID,
        request: ReturnCreateRequest,
        actor: Any,
        idempotency_key: str,
        session: AsyncSession | None = None,
        exchange_group_id: uuid.UUID | None = None,
    ) -> ReturnReceiptPayload | ReturnDetailResponse:
        _ = idempotency_key
        async with UnitOfWork(session=session) as uow:
            # 1. Hüquq və icazələrin yoxlanışı
            ReturnsPolicy.check_can_create_return(actor)

            # 2. Növbə və Kassa Yoxlanışı
            shift = await self.pos_repo.get_shift_by_id(
                uow.session, request.shift_id, for_update=True
            )
            if not shift or shift.company_id != company_id:
                raise NotFoundError(f"'{request.shift_id}' ID-li kassa növbəsi tapılmadı.")
            if shift.status != "OPEN":
                raise BusinessRuleViolationError(
                    code="SHIFT_NOT_OPEN",
                    message=f"Kassa növbəsi açıq deyil (Status: {shift.status}). Qaytarma aparıla bilməz.",
                )
            if shift.register_id != request.register_id:
                raise BusinessRuleViolationError(
                    code="REGISTER_MISMATCH",
                    message="Kassa növbəsi ilə sorğudakı kassa aparatı uyğun gəlmir.",
                )

            reg_svc = get_cash_register_service()
            register = await reg_svc.get_register(
                request.register_id, actor=actor, session=uow.session
            )
            if not register:
                raise NotFoundError("Kassa aparatı tapılmadı.")

            # 3. Deterministik FOR UPDATE Kilidi: Orijinal satış sətirlərinin sayğacları
            sale_line_ids = [
                item.original_sale_line_id
                for item in request.items
                if item.original_sale_line_id is not None
            ]
            locked_states = await self.repo.lock_return_states(uow.session, sale_line_ids)

            # 4. Kalkulyasiya (ReturnsQuoteService)
            quote_req = ReturnQuoteRequest(
                original_sale_id=request.original_sale_id,
                branch_id=shift.branch_id,
                items=request.items,
                return_type=request.return_type,
                customer_id=request.customer_id,
            )
            quote = await self.quote_svc.quote(
                session=uow.session,
                company_id=company_id,
                request=quote_req,
                actor=actor,
            )

            # Məbləğ müqayisəsi (Müştəri gözləntisi ilə server hesabı)
            if quote.refund_total != request.expected_refund_total:
                raise BusinessRuleViolationError(
                    code="REFUND_AMOUNT_MISMATCH",
                    message=(
                        f"Qaytarma məbləği dəyişib! Müştəri gözləntisi: {request.expected_refund_total} AZN, "
                        f"Server hesabı: {quote.refund_total} AZN."
                    ),
                )

            # 5. Siyasət Yoxlanışları (Window, No-receipt, Rol limitləri)
            now_dt = utc_now()
            business_date = now_dt.date()

            sale: Sale | None = None
            if request.original_sale_id:
                sale = await self.repo.get_sale_by_id(uow.session, request.original_sale_id)

            window_days = 14
            try:
                w_s = await self.settings.get(
                    key="returns.window_days", branch_id=shift.branch_id, session=uow.session
                )
                if w_s and isinstance(w_s.value, int | float):
                    window_days = int(w_s.value)
            except Exception:
                pass

            if sale:
                ReturnsPolicy.check_return_window(
                    sale_date=sale.business_date,
                    business_date=business_date,
                    window_days=window_days,
                    actor=actor,
                    manager_token=request.manager_approval_token,
                    reason=request.override_window_reason,
                    branch_id=shift.branch_id,
                )
            else:
                # Çeksiz qaytarma
                no_rec_req_cust = True
                try:
                    nrc_s = await self.settings.get(
                        key="returns.no_receipt_requires_customer",
                        branch_id=shift.branch_id,
                        session=uow.session,
                    )
                    if nrc_s and isinstance(nrc_s.value, bool):
                        no_rec_req_cust = nrc_s.value
                except Exception:
                    pass

                ReturnsPolicy.check_no_receipt_allowed(
                    actor=actor,
                    manager_token=request.manager_approval_token,
                    customer_id=request.customer_id,
                    requires_customer=no_rec_req_cust,
                    branch_id=shift.branch_id,
                )

            # Rol üzrə geri ödəniş limitləri
            refund_limits = {"cashier": 50.0, "branch_manager": 500.0, "system_admin": 100000.0}
            try:
                rl_s = await self.settings.get(
                    key="returns.refund_limits",
                    branch_id=shift.branch_id,
                    session=uow.session,
                )
                if rl_s and isinstance(rl_s.value, dict):
                    refund_limits = rl_s.value
            except Exception:
                pass

            # Menecer təsdiqi tələb olunursa və token yoxdursa -> PENDING_APPROVAL axını
            approval_needed = False
            try:
                ReturnsPolicy.check_refund_limits(
                    actor=actor,
                    refund_total=quote.refund_total,
                    refund_limits=refund_limits,
                    manager_token=request.manager_approval_token,
                    branch_id=shift.branch_id,
                )
            except ManagerApprovalError:
                approval_needed = True

            if approval_needed:
                if request.save_as_pending_if_approval_needed:
                    # PENDING_APPROVAL statusunda saxlayırıq (Stok və kassa təsirləri dondurulur, rezervasiya edilir)
                    return await self._create_pending_approval_return(
                        uow=uow,
                        company_id=company_id,
                        shift=shift,
                        register=register,
                        request=request,
                        quote=quote,
                        locked_states=locked_states,
                        actor=actor,
                        business_date=business_date,
                        exchange_group_id=exchange_group_id,
                    )
                raise ManagerApprovalError(
                    f"Geri ödəniş məbləği ({quote.refund_total} AZN) limitinizi aşır. Menecer təsdiqi tələb olunur."
                )

            # Əgər menecer tokeni təqdim olunubsa, onu qeydə alırıq (Replay prevention)
            if request.manager_approval_token:
                await self.pos_svc._consume_manager_token(
                    session=uow.session,
                    token=request.manager_approval_token,
                    action="returns.refund"
                    if not quote.requires_manager_approval
                    else "returns.override_window",
                    used_by_id=actor.id,
                    branch_id=shift.branch_id,
                )

            # 6. Geri Ödəniş Metodlarının Yoxlanışı
            refund_methods = request.refund_methods
            if not refund_methods and quote.refund_total > Decimal("0.00"):
                # Default: Orijinal ödəniş növü və ya Nağd
                orig_tender = "cash"
                if sale and sale.payments:
                    orig_tender = sale.payments[0].tender_type
                refund_methods = [
                    RefundMethodInput(
                        tender_type=orig_tender,
                        amount=quote.refund_total,
                    )
                ]

            total_refund_methods_sum = sum((rm.amount for rm in refund_methods), Decimal("0.00"))
            if total_refund_methods_sum != quote.refund_total:
                raise ValidationError(
                    f"Geri ödəniş metodlarının cəmi ({total_refund_methods_sum} AZN) "
                    f"qaytarma məbləği ({quote.refund_total} AZN) ilə tam bərabər olmalıdır."
                )

            # Kassa qalığının hesablanması (Nağd qaytarmalar üçün)
            cash_refund_sum = sum(
                (rm.amount for rm in refund_methods if rm.tender_type == "cash"),
                Decimal("0.00"),
            )
            if cash_refund_sum > Decimal("0.00"):
                drawer_cash = await self._calculate_drawer_cash(uow.session, shift)
                ReturnsPolicy.check_cash_refund_allowed(
                    actor=actor,
                    shift_status=shift.status,
                    refund_amount=cash_refund_sum,
                    drawer_cash=drawer_cash,
                )

            # Kart qaytarmalarının yoxlanışı
            for rm in refund_methods:
                if rm.tender_type == "card":
                    provider_mode = "MOCK_LIVE"
                    try:
                        int_status = await self.integrations.get_integration(
                            "payment_provider", actor=actor
                        )
                        if int_status.status != "ACTIVE":
                            provider_mode = "NOT_CONFIGURED"
                    except Exception:
                        pass
                    allow_cash_fallback = False
                    ReturnsPolicy.check_card_refund_allowed(
                        actor, provider_mode, allow_cash_fallback
                    )

                elif rm.tender_type == "store_credit":
                    sc_enabled = True
                    try:
                        sc_s = await self.settings.get(
                            key="returns.store_credit_enabled",
                            branch_id=shift.branch_id,
                            session=uow.session,
                        )
                        if sc_s and isinstance(sc_s.value, bool):
                            sc_enabled = sc_s.value
                    except Exception:
                        pass
                    ReturnsPolicy.check_store_credit_allowed(request.customer_id, sc_enabled)

            # 7. Fasiləsiz Qaytarma Nömrəsinin Ayrılması (Tranzaksiya daxilində gapless)
            return_no = await self.numbering.next(
                document_type="return",
                company_id=company_id,
                branch_id=shift.branch_id,
                register_id=shift.register_id,
                session=uow.session,
                actor=actor,
            )

            # 8. Sənəd və Sətirlərinin Bazaya Yazılması
            sale_return = SaleReturn(
                id=generate_uuid7(),
                return_no=return_no,
                original_sale_id=request.original_sale_id,
                company_id=company_id,
                branch_id=shift.branch_id,
                register_id=shift.register_id,
                shift_id=shift.id,
                processed_by_id=actor.id,
                customer_id=request.customer_id,
                status="COMPLETED",
                return_type=request.return_type,
                subtotal=quote.subtotal,
                discount_reversal_total=quote.discount_reversal_total,
                tax_reversal_total=quote.tax_reversal_total,
                refund_total=quote.refund_total,
                cost_total=quote.cost_total,
                currency="AZN",
                refund_method_breakdown={rm.tender_type: str(rm.amount) for rm in refund_methods},
                reason_summary=request.reason_summary,
                approval_reference=request.manager_approval_token[:50]
                if request.manager_approval_token
                else None,
                approved_by_id=actor.id,
                approved_at=now_dt,
                exchange_group_id=exchange_group_id,
                reprint_count=0,
                business_date=business_date,
                correlation_id=str(uuid.uuid4()),
                version=1,
                created_at=now_dt,
            )
            created_return = await self.repo.create_return(uow.session, sale_return)

            created_lines: list[SaleReturnLine] = []
            movement_drafts: list[MovementDraft] = []

            for q_line in quote.items:
                ret_line = SaleReturnLine(
                    id=generate_uuid7(),
                    sale_return_id=created_return.id,
                    line_no=q_line.line_no,
                    original_sale_line_id=q_line.original_sale_line_id,
                    variant_id=q_line.variant_id,
                    product_id=None,
                    sku=q_line.sku,
                    product_name=q_line.product_name,
                    quantity=q_line.quantity,
                    reason_code=request.items[q_line.line_no - 1].reason_code,
                    condition=request.items[q_line.line_no - 1].condition,
                    unit_price=q_line.unit_price,
                    cost_price=q_line.cost_price,
                    gross_amount=q_line.gross_amount,
                    discount_amount=q_line.discount_amount,
                    tax_rate=q_line.tax_rate,
                    tax_amount=q_line.tax_amount,
                    refund_amount=q_line.refund_amount,
                    destination_warehouse_id=register.default_warehouse_id,
                    destination_status=q_line.destination_status,
                    notes=q_line.notes,
                    created_at=now_dt,
                )
                uow.session.add(ret_line)
                created_lines.append(ret_line)

                # Sayğac yenilənməsi: returned_qty artırılır
                if q_line.original_sale_line_id and q_line.original_sale_line_id in locked_states:
                    st = locked_states[q_line.original_sale_line_id]
                    st.returned_qty += q_line.quantity
                    st.version += 1

                # İnventar hərəkət layihəsi (SALE_RETURN)
                movement_drafts.append(
                    MovementDraft(
                        variant_id=q_line.variant_id,
                        quantity=q_line.quantity,
                        from_warehouse_id=None,
                        to_warehouse_id=register.default_warehouse_id,
                        from_status="available",
                        to_status=q_line.destination_status,
                        movement_type="SALE_RETURN",
                        reference_type="SALE_RETURN",
                        reference_id=created_return.id,
                        unit_cost=q_line.cost_price,
                    )
                )

            # 9. Geri Ödəniş Sətirləri (Refunds)
            created_refunds: list[Refund] = []
            for rm in refund_methods:
                ref_record = Refund(
                    id=generate_uuid7(),
                    sale_return_id=created_return.id,
                    tender_type=rm.tender_type,
                    amount=rm.amount,
                    provider_reference=rm.provider_confirmation_id
                    or ("****9999" if rm.tender_type == "card" else None),
                    status="COMPLETED",
                    approval_code=rm.approval_code,
                    created_at=now_dt,
                )
                uow.session.add(ref_record)
                created_refunds.append(ref_record)

                # Əgər nağddırsa kassa hərəkətini (CASH_OUT) yazırıq ki, növbə gözlənilən nağdı düzgün azalsın
                if rm.tender_type == "cash":
                    c_mov_no = await self.numbering.next(
                        document_type="cash_movement",
                        company_id=company_id,
                        branch_id=shift.branch_id,
                        register_id=register.id,
                        session=uow.session,
                        actor=actor,
                    )
                    c_mov = CashMovement(
                        id=generate_uuid7(),
                        movement_no=c_mov_no,
                        company_id=company_id,
                        shift_id=shift.id,
                        register_id=register.id,
                        movement_type="CASH_OUT",
                        amount=rm.amount,
                        reason_code="RETURN_REFUND",
                        notes=f"Qaytarma sənədi üzrə nağd ödəniş: {return_no}",
                        created_by_id=actor.id,
                        created_at=now_dt,
                    )
                    uow.session.add(c_mov)

                # Əgər mağaza kreditidirsə (Store Credit) jurnala yazırıq
                elif rm.tender_type == "store_credit" and request.customer_id:
                    current_bal = await self.repo.get_customer_store_credit_balance(
                        uow.session, company_id, request.customer_id
                    )
                    new_bal = current_bal + rm.amount
                    sc_entry = StoreCreditLedger(
                        id=generate_uuid7(),
                        customer_id=request.customer_id,
                        company_id=company_id,
                        entry_type="ISSUE",
                        amount=rm.amount,
                        reference_type="RETURN",
                        reference_id=created_return.id,
                        balance_after=new_bal,
                        notes=f"Qaytarma sənədi: {return_no}",
                        created_at=now_dt,
                    )
                    await self.repo.append_store_credit_entry(uow.session, sc_entry)

                    event_sc = StoreCreditIssuedEvent(
                        customer_id=request.customer_id,
                        amount=rm.amount,
                        return_id=created_return.id,
                        balance_after=new_bal,
                    )
                    await record_outbox_event(uow.session, event_sc)

            # 10. Stok Hərəkətlərinin (SALE_RETURN) İcrası
            if movement_drafts:
                await self.inventory.post(
                    session=uow.session,
                    company_id=company_id,
                    movements=movement_drafts,
                    user_id=actor.id,
                    correlation_id=created_return.correlation_id,
                    actor=actor,
                )

            # 11. Loyallıq Xallarının Tərs Hesablanması (CRM Stub)
            await self.loyalty_svc.process_return_loyalty(
                session=uow.session,
                company_id=company_id,
                customer_id=request.customer_id,
                sale=sale,
                return_id=created_return.id,
                refund_amount=quote.refund_total,
            )

            # 12. Orijinal Satış Statusunun Yenilənməsi
            if sale:
                all_returned = True
                for s_line in sale.lines:
                    line_state = locked_states.get(s_line.id)
                    if line_state is None:
                        line_state = await self.repo.get_or_create_return_state(uow.session, s_line)
                    if line_state.returned_qty < s_line.quantity:
                        all_returned = False
                        break
                sale.status = "RETURNED" if all_returned else "PARTIALLY_RETURNED"
                sale_event = SaleEvent(
                    id=generate_uuid7(),
                    sale_id=sale.id,
                    event_type="RETURN_LINKED",
                    actor_id=actor.id,
                    reason=f"Qaytarma sənədi bağlandı: {return_no}",
                    metadata_json={
                        "return_id": str(created_return.id),
                        "return_no": return_no,
                        "amount": str(quote.refund_total),
                    },
                    created_at=now_dt,
                )
                uow.session.add(sale_event)

            # 13. Audit və Outbox Hadisələri
            await record_audit_event(
                session=uow.session,
                action="RETURN_COMPLETED",
                resource_type="sale_returns",
                resource_id=str(created_return.id),
                actor_id=actor.id,
                diff={
                    "return_no": return_no,
                    "refund_total": str(quote.refund_total),
                    "original_sale_id": str(request.original_sale_id)
                    if request.original_sale_id
                    else None,
                },
            )

            event = ReturnCompletedEvent(
                return_id=created_return.id,
                return_no=return_no,
                original_sale_id=request.original_sale_id,
                branch_id=shift.branch_id,
                register_id=shift.register_id,
                shift_id=shift.id,
                cashier_id=actor.id,
                customer_id=request.customer_id,
                return_type=request.return_type,
                refund_total=quote.refund_total,
                cost_total=quote.cost_total,
                exchange_group_id=exchange_group_id,
            )
            await record_outbox_event(uow.session, event)
            if session is None:
                await uow.commit()
            else:
                await uow.session.flush()

            return self._build_return_receipt_payload(
                sale_return=created_return,
                lines=created_lines,
                refunds=created_refunds,
                original_receipt_no=sale.receipt_no if sale else None,
            )

    # --- 4. Təsdiq Gözləyən Qaytarmanın Saxlanması ---

    async def _create_pending_approval_return(
        self,
        uow: UnitOfWork,
        company_id: uuid.UUID,
        shift: PosShift,
        register: Any,
        request: ReturnCreateRequest,
        quote: ReturnQuoteResponse,
        locked_states: dict[uuid.UUID, SaleLineReturnState],
        actor: Any,
        business_date: date,
        exchange_group_id: uuid.UUID | None,
    ) -> ReturnDetailResponse:
        """Təsdiq gözləyən qaytarmanı bazaya yazır və sayğacda rezerv edir."""
        now_dt = utc_now()
        return_no = await self.numbering.next(
            document_type="return",
            company_id=company_id,
            branch_id=shift.branch_id,
            register_id=shift.register_id,
            session=uow.session,
            actor=actor,
        )

        sale_return = SaleReturn(
            id=generate_uuid7(),
            return_no=return_no,
            original_sale_id=request.original_sale_id,
            company_id=company_id,
            branch_id=shift.branch_id,
            register_id=shift.register_id,
            shift_id=shift.id,
            processed_by_id=actor.id,
            customer_id=request.customer_id,
            status="PENDING_APPROVAL",
            return_type=request.return_type,
            subtotal=quote.subtotal,
            discount_reversal_total=quote.discount_reversal_total,
            tax_reversal_total=quote.tax_reversal_total,
            refund_total=quote.refund_total,
            cost_total=quote.cost_total,
            currency="AZN",
            refund_method_breakdown={
                rm.tender_type: str(rm.amount) for rm in request.refund_methods
            },
            reason_summary=request.reason_summary,
            approval_reference=quote.approval_reason,
            exchange_group_id=exchange_group_id,
            reprint_count=0,
            business_date=business_date,
            correlation_id=str(uuid.uuid4()),
            version=1,
            created_at=now_dt,
        )
        created_return = await self.repo.create_return(uow.session, sale_return)

        for q_line in quote.items:
            ret_line = SaleReturnLine(
                id=generate_uuid7(),
                sale_return_id=created_return.id,
                line_no=q_line.line_no,
                original_sale_line_id=q_line.original_sale_line_id,
                variant_id=q_line.variant_id,
                sku=q_line.sku,
                product_name=q_line.product_name,
                quantity=q_line.quantity,
                reason_code=request.items[q_line.line_no - 1].reason_code,
                condition=request.items[q_line.line_no - 1].condition,
                unit_price=q_line.unit_price,
                cost_price=q_line.cost_price,
                gross_amount=q_line.gross_amount,
                discount_amount=q_line.discount_amount,
                tax_rate=q_line.tax_rate,
                tax_amount=q_line.tax_amount,
                refund_amount=q_line.refund_amount,
                destination_warehouse_id=register.default_warehouse_id,
                destination_status=q_line.destination_status,
                notes=q_line.notes,
                created_at=now_dt,
            )
            uow.session.add(ret_line)

            # Sayğacda rezervasiya edirik (reserved_qty)
            if q_line.original_sale_line_id and q_line.original_sale_line_id in locked_states:
                st = locked_states[q_line.original_sale_line_id]
                st.reserved_qty += q_line.quantity
                st.version += 1

        await uow.session.flush()
        full_ret = await self.repo.get_return_by_id(uow.session, created_return.id)
        assert full_ret is not None
        await uow.commit()
        return ReturnDetailResponse.model_validate(full_ret)

    # --- 5. Mübadilə (Exchange: Qaytarma + Yeni Satış) ---

    async def create_exchange(
        self,
        company_id: uuid.UUID,
        request: ExchangeCreateRequest,
        actor: Any,
        idempotency_key: str,
    ) -> dict[str, Any]:
        """Tək tranzaksiyada qaytarma və yeni satışın atomik birləşdirilməsi."""
        async with UnitOfWork() as uow:
            ReturnsPolicy.check_can_exchange(actor)

            exchange_group_id = generate_uuid7()

            # 1. Qaytarma Hissəsinin İcrası
            ret_req = ReturnCreateRequest(
                original_sale_id=request.original_sale_id,
                register_id=request.register_id,
                shift_id=request.shift_id,
                items=request.return_items,
                return_type="EXCHANGE",
                refund_methods=[],  # Mübadilədə xalis fərq üzrə hesablanacaq
                customer_id=request.customer_id,
                reason_summary=request.reason_summary,
                manager_approval_token=request.manager_approval_token,
                expected_refund_total=Decimal("0.00"),  # Aşağıda yenilənəcək
            )

            # Qaytarma qiymətləndirməsi
            ret_quote = await self.quote_svc.quote(
                session=uow.session,
                company_id=company_id,
                request=ReturnQuoteRequest(
                    original_sale_id=request.original_sale_id,
                    branch_id=request.register_id,  # register branch resolved later
                    items=request.return_items,
                    return_type="EXCHANGE",
                    customer_id=request.customer_id,
                ),
                actor=actor,
            )
            ret_req.expected_refund_total = ret_quote.refund_total

            # 2. Yeni Satış Hissəsinin Qiymətləndirilməsi (POS Pricing)
            shift = await self.pos_repo.get_shift_by_id(
                uow.session, request.shift_id, for_update=True
            )
            if not shift:
                raise NotFoundError("Kassa növbəsi tapılmadı.")

            new_cart_items = [
                CartLineInput(
                    variant_id=ex_line.variant_id,
                    quantity=ex_line.quantity,
                    discount_percent=ex_line.discount_percent,
                    discount_amount=ex_line.discount_amount,
                )
                for ex_line in request.new_sale_items
            ]
            sale_quote = await self.pos_svc.pricing.quote(
                session=uow.session,
                company_id=company_id,
                branch_id=shift.branch_id,
                items=new_cart_items,
                customer_id=request.customer_id,
                actor=actor,
            )

            # Xalis Fərq: Yeni Satış Yekun - Qaytarma Yekun
            net_difference = round_money(sale_quote.grand_total - ret_quote.refund_total)
            if net_difference != request.expected_net_difference:
                raise BusinessRuleViolationError(
                    code="EXCHANGE_DIFFERENCE_MISMATCH",
                    message=(
                        f"Mübadilə fərqi dəyişib! Gözlənilən: {request.expected_net_difference} AZN, "
                        f"Server hesabı: {net_difference} AZN."
                    ),
                )

            # Geri ödəniş / Əlavə ödəniş təyini
            if net_difference > Decimal("0.00"):
                # Müştəri əlavə ödəniş edir -> payment_methods yoxlanılır
                pay_sum = sum((pm.amount for pm in request.payment_methods), Decimal("0.00"))
                if pay_sum != net_difference:
                    raise ValidationError(
                        f"Əlavə ödəniləcək məbləğ ({net_difference} AZN) ilə ödəniş metodlarının cəmi ({pay_sum} AZN) uyğun gəlmir."
                    )
            elif net_difference < Decimal("0.00"):
                # Müştəriyə geri pul və ya store credit qaytarılır
                refund_diff = abs(net_difference)
                pay_sum = sum((pm.amount for pm in request.payment_methods), Decimal("0.00"))
                if pay_sum != refund_diff:
                    raise ValidationError(
                        f"Geri ödəniləcək fərq ({refund_diff} AZN) ilə seçilən metodların cəmi ({pay_sum} AZN) uyğun gəlmir."
                    )
                ret_req.refund_methods = request.payment_methods

            # 3. Qaytarmanı İcra Edirik (Eyni uow.session daxilində)
            return_payload = await self.create_return(
                company_id=company_id,
                request=ret_req,
                actor=actor,
                idempotency_key=f"ret-{idempotency_key}",
                session=uow.session,
                exchange_group_id=exchange_group_id,
            )

            # 4. Yeni Satışı İcra Edirik (Eyni uow.session daxilində)
            checkout_payments: list[TenderPaymentInput] = []
            if net_difference > Decimal("0.00"):
                # Real ödənişlər
                for pm in request.payment_methods:
                    checkout_payments.append(
                        TenderPaymentInput(
                            tender_type=pm.tender_type,
                            amount=pm.amount,
                            tendered_amount=pm.amount,
                            approval_code=pm.approval_code,
                            provider_confirmation_id=pm.provider_confirmation_id,
                        )
                    )
                # Qaytarılan malların dəyəri qədər daxili 'store_credit' təminatı
                checkout_payments.append(
                    TenderPaymentInput(
                        tender_type="store_credit",
                        amount=ret_quote.refund_total,
                        tendered_amount=ret_quote.refund_total,
                    )
                )
            elif net_difference < Decimal("0.00"):
                # Satış tamamilə qaytarılan malların dəyəri ilə ödənir
                checkout_payments.append(
                    TenderPaymentInput(
                        tender_type="store_credit",
                        amount=sale_quote.grand_total,
                        tendered_amount=sale_quote.grand_total,
                    )
                )
            else:
                # Neytral mübadilə (Ölçü/rəng dəyişimi, qiymət tam bərabərdir)
                checkout_payments.append(
                    TenderPaymentInput(
                        tender_type="store_credit",
                        amount=sale_quote.grand_total,
                        tendered_amount=sale_quote.grand_total,
                    )
                )

            checkout_req = SaleCheckoutRequest(
                register_id=request.register_id,
                shift_id=request.shift_id,
                items=new_cart_items,
                expected_grand_total=sale_quote.grand_total,
                payments=checkout_payments,
                customer_id=request.customer_id,
            )

            sale_payload = await self.pos_svc.checkout(
                company_id=company_id,
                request=checkout_req,
                actor=actor,
                idempotency_key=f"sale-{idempotency_key}",
                session=uow.session,
                exchange_group_id=exchange_group_id,
            )

            event = ExchangeCompletedEvent(
                exchange_group_id=exchange_group_id,
                return_id=getattr(return_payload, "return_id", exchange_group_id),
                sale_id=sale_payload.sale_id,
                net_difference=net_difference,
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return {
                "exchange_group_id": exchange_group_id,
                "net_difference": net_difference,
                "return_receipt": return_payload,
                "new_sale_receipt": sale_payload,
            }

    # --- 6. Təsdiq Gözləyən Qaytarmaların Təsdiqi və Rəddi ---

    async def approve_pending_return(
        self,
        company_id: uuid.UUID,
        return_id: uuid.UUID,
        actor: Any,
        request: ReturnApproveRequest,
    ) -> ReturnReceiptPayload:
        """PENDING_APPROVAL statuslu qaytarmanı təsdiqləyir və icra edir."""
        _ = request
        async with UnitOfWork() as uow:
            ReturnsPolicy.check_can_approve(actor)

            sale_return = await self.repo.get_return_by_id(uow.session, return_id)
            if not sale_return or sale_return.company_id != company_id:
                raise NotFoundError(f"'{return_id}' ID-li qaytarma sənədi tapılmadı.")
            if sale_return.status != "PENDING_APPROVAL":
                raise BusinessRuleViolationError(
                    code="RETURN_NOT_PENDING_APPROVAL",
                    message=f"Yalnız 'PENDING_APPROVAL' statuslu sənəd təsdiqlənə bilər (Cari status: {sale_return.status}).",
                )

            # Sətirlərin sayğaclarını kilidləyirik
            sale_line_ids = [
                s_line.original_sale_line_id
                for s_line in sale_return.lines
                if s_line.original_sale_line_id
            ]
            locked_states = await self.repo.lock_return_states(uow.session, sale_line_ids)

            # Rezervasiyanı qaytarmaya çeviririk (reserved_qty -> returned_qty)
            movement_drafts: list[MovementDraft] = []
            for line in sale_return.lines:
                if line.original_sale_line_id and line.original_sale_line_id in locked_states:
                    st = locked_states[line.original_sale_line_id]
                    if st.reserved_qty >= line.quantity:
                        st.reserved_qty -= line.quantity
                    st.returned_qty += line.quantity
                    st.version += 1

                movement_drafts.append(
                    MovementDraft(
                        variant_id=line.variant_id,
                        quantity=line.quantity,
                        from_warehouse_id=None,
                        to_warehouse_id=line.destination_warehouse_id,
                        from_status="available",
                        to_status=line.destination_status,
                        movement_type="SALE_RETURN",
                        reference_type="SALE_RETURN",
                        reference_id=sale_return.id,
                        unit_cost=line.cost_price,
                    )
                )

            # İnventar hərəkətləri
            if movement_drafts:
                await self.inventory.post(
                    session=uow.session,
                    company_id=company_id,
                    movements=movement_drafts,
                    user_id=actor.id,
                    correlation_id=sale_return.correlation_id,
                    actor=actor,
                )

            now_dt = utc_now()
            sale_return.status = "COMPLETED"
            sale_return.approved_by_id = actor.id
            sale_return.approved_at = now_dt
            sale_return.version += 1

            event_app = ReturnApprovedEvent(
                return_id=sale_return.id,
                return_no=sale_return.return_no,
                approver_id=actor.id,
                refund_total=sale_return.refund_total,
            )
            await record_outbox_event(uow.session, event_app)
            await uow.commit()

            return self._build_return_receipt_payload(
                sale_return, sale_return.lines, sale_return.refunds
            )

    async def reject_pending_return(
        self,
        company_id: uuid.UUID,
        return_id: uuid.UUID,
        actor: Any,
        request: ReturnRejectRequest,
    ) -> ReturnDetailResponse:
        """PENDING_APPROVAL statuslu qaytarmanı rədd edir və rezervasiyaları azad edir."""
        async with UnitOfWork() as uow:
            ReturnsPolicy.check_can_approve(actor)

            sale_return = await self.repo.get_return_by_id(uow.session, return_id)
            if not sale_return or sale_return.company_id != company_id:
                raise NotFoundError(f"'{return_id}' ID-li qaytarma sənədi tapılmadı.")
            if sale_return.status != "PENDING_APPROVAL":
                raise BusinessRuleViolationError(
                    code="RETURN_NOT_PENDING_APPROVAL",
                    message=f"Yalnız 'PENDING_APPROVAL' statuslu sənəd rədd edilə bilər (Cari status: {sale_return.status}).",
                )

            # Rezervasiyanı azad edirik
            sale_line_ids = [
                s_line.original_sale_line_id
                for s_line in sale_return.lines
                if s_line.original_sale_line_id
            ]
            locked_states = await self.repo.lock_return_states(uow.session, sale_line_ids)

            for line in sale_return.lines:
                if line.original_sale_line_id and line.original_sale_line_id in locked_states:
                    st = locked_states[line.original_sale_line_id]
                    if st.reserved_qty >= line.quantity:
                        st.reserved_qty -= line.quantity
                        st.version += 1

            sale_return.status = "REJECTED"
            sale_return.reason_summary = f"Rədd edildi: {request.reason}"
            sale_return.version += 1

            event = ReturnRejectedEvent(
                return_id=sale_return.id,
                return_no=sale_return.return_no,
                rejector_id=actor.id,
                reason=request.reason,
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return ReturnDetailResponse.model_validate(sale_return)

    # --- 7. Axtarış, Təkrar Çap və Müştəri Tarixçəsi ---

    async def get_return_by_id(
        self, company_id: uuid.UUID, return_id: uuid.UUID, actor: Any
    ) -> ReturnDetailResponse:
        """Qaytarma sənədinin detallarını gətirir."""
        _ = actor
        async with UnitOfWork() as uow:
            ret = await self.repo.get_return_by_id(uow.session, return_id)
            if not ret or ret.company_id != company_id:
                raise NotFoundError(f"'{return_id}' ID-li qaytarma sənədi tapılmadı.")
            return ReturnDetailResponse.model_validate(ret)

    async def search_returns(
        self, company_id: uuid.UUID, params: ReturnFilterParams, actor: Any
    ) -> dict[str, Any]:
        """Qaytarmaların çoxmeyarlı axtarışı."""
        _ = actor
        async with UnitOfWork() as uow:
            items, total = await self.repo.search_returns(uow.session, company_id, params)
            return {
                "items": [ReturnSummaryResponse.model_validate(r) for r in items],
                "total": total,
                "page": params.page,
                "page_size": params.page_size,
            }

    async def reprint_return_receipt(
        self, company_id: uuid.UUID, return_id: uuid.UUID, actor: Any
    ) -> ReturnReceiptPayload:
        """Qaytarma çekinin təkrar çap nüsxəsini (Audited Reprint) formalaşdırır."""
        async with UnitOfWork() as uow:
            ret = await self.repo.get_return_by_id(uow.session, return_id)
            if not ret or ret.company_id != company_id:
                raise NotFoundError(f"'{return_id}' ID-li qaytarma sənədi tapılmadı.")

            ret.reprint_count += 1
            await record_audit_event(
                session=uow.session,
                action="RETURN_RECEIPT_REPRINTED",
                resource_type="sale_returns",
                resource_id=str(ret.id),
                actor_id=actor.id,
                diff={"reprint_count": ret.reprint_count},
            )
            await uow.commit()

            return self._build_return_receipt_payload(
                sale_return=ret,
                lines=ret.lines,
                refunds=ret.refunds,
                is_reprint=True,
            )

    async def get_customer_returns_history(
        self, company_id: uuid.UUID, customer_id: uuid.UUID, actor: Any
    ) -> CustomerReturnsHistoryResponse:
        """Müştərinin qaytarma tarixçəsini və mağaza kredit balansını gətirir."""
        _ = actor
        async with UnitOfWork() as uow:
            returns = await self.repo.get_customer_returns(uow.session, company_id, customer_id)
            total_refunded = sum(
                (r.refund_total for r in returns if r.status == "COMPLETED"),
                Decimal("0.00"),
            )
            sc_balance = await self.repo.get_customer_store_credit_balance(
                uow.session, company_id, customer_id
            )

            return CustomerReturnsHistoryResponse(
                customer_id=customer_id,
                total_returns_count=len(returns),
                total_refunded_amount=round_money(total_refunded),
                store_credit_balance=round_money(sc_balance),
                returns=[ReturnSummaryResponse.model_validate(r) for r in returns],
            )

    # --- 8. Fırıldaqçılıq və Anomaliya İndikatorları ---

    async def get_fraud_indicators(
        self,
        company_id: uuid.UUID,
        branch_id: uuid.UUID,
        start_date: date,
        end_date: date,
        actor: Any,
    ) -> ReturnFraudIndicatorsResponse:
        """Qaytarmalar üzrə fırıldaqçılıq və risk indikatorlarını hesablayır."""
        _ = actor
        async with UnitOfWork() as uow:
            params = ReturnFilterParams(
                branch_id=branch_id,
                start_date=start_date,
                end_date=end_date,
                page_size=1000,
            )
            returns, total = await self.repo.search_returns(uow.session, company_id, params)

            total_refund = sum(
                (r.refund_total for r in returns if r.status == "COMPLETED"),
                Decimal("0.00"),
            )
            no_receipt_count = sum(1 for r in returns if r.original_sale_id is None)
            no_rec_ratio = (
                round_money(Decimal(str(no_receipt_count)) / Decimal(str(total)))
                if total > 0
                else Decimal("0.00")
            )

            alerts: list[FraudIndicatorItem] = []

            # İndikator 1: Çeksiz qaytarma nisbətinin yüksək olması (> 10%)
            if no_rec_ratio > Decimal("0.10"):
                alerts.append(
                    FraudIndicatorItem(
                        indicator="HIGH_NO_RECEIPT_RATIO",
                        entity_type="branch",
                        entity_id=str(branch_id),
                        threshold="10%",
                        actual_value=f"{round_money(no_rec_ratio * 100)}%",
                        explanation="Filial üzrə çeksiz qaytarmaların nisbəti icazə verilən 10% həddindən yüksəkdir.",
                        severity="HIGH",
                    )
                )

            # İndikator 2: Yüksək məbləğli qaytarmalar (> 500 AZN)
            for r in returns:
                if r.refund_total > Decimal("500.00"):
                    alerts.append(
                        FraudIndicatorItem(
                            indicator="HIGH_VALUE_RETURN",
                            entity_type="return",
                            entity_id=r.return_no,
                            threshold="500.00 AZN",
                            actual_value=f"{r.refund_total} AZN",
                            explanation=f"500 AZN-dən böyük qaytarma icra edilib (Kassir: {r.processed_by_id}).",
                            severity="MEDIUM",
                        )
                    )

            if alerts:
                event = ReturnFraudAlertEvent(
                    branch_id=branch_id,
                    indicator="RETURNS_FRAUD_ALERT",
                    details={"alert_count": len(alerts)},
                )
                await record_outbox_event(uow.session, event)
                await uow.commit()

            return ReturnFraudIndicatorsResponse(
                branch_id=branch_id,
                start_date=start_date,
                end_date=end_date,
                total_returns=total,
                total_refund_amount=round_money(total_refund),
                no_receipt_count=no_receipt_count,
                no_receipt_ratio=no_rec_ratio,
                alerts=alerts,
            )

    def get_return_reasons(self) -> list[dict[str, Any]]:
        """Standart qaytarma səbəbləri siyahısını qaytarır."""
        return STANDARD_RETURN_REASONS

    # --- Köməkçi Metodlar ---

    async def _calculate_drawer_cash(self, session: AsyncSession, shift: PosShift) -> Decimal:
        """Kassada cari gözlənilən nağd pul məbləğini hesablayır."""
        stmt = select(CashMovement).where(CashMovement.shift_id == shift.id)
        res = await session.execute(stmt)
        movements = res.scalars().all()

        cash_in = Decimal("0.00")
        cash_out = Decimal("0.00")
        drops = Decimal("0.00")
        for m in movements:
            if m.movement_type in ("CASH_IN", "FLOAT_ADJUST"):
                cash_in += m.amount
            elif m.movement_type == "CASH_OUT":
                cash_out += m.amount
            elif m.movement_type == "DROP":
                drops += m.amount

        # Satışlardan nağd ödənişlər (İlkin satışı tamamlanmış bütün sənədlər)
        stmt_sales = select(Sale).where(
            Sale.shift_id == shift.id,
            Sale.status.in_(("COMPLETED", "PARTIALLY_RETURNED", "RETURNED")),
        )
        sales_res = await session.execute(stmt_sales)
        cash_sales = Decimal("0.00")
        for s in sales_res.scalars().all():
            for p in getattr(s, "payments", []):
                if p.tender_type == "cash":
                    cash_sales += p.tendered_amount - p.change_amount

        return shift.opening_cash + cash_sales + cash_in - cash_out - drops

    def _build_return_receipt_payload(
        self,
        sale_return: SaleReturn,
        lines: Sequence[SaleReturnLine] | None = None,
        refunds: Sequence[Refund] | None = None,
        original_receipt_no: str | None = None,
        is_reprint: bool = False,
    ) -> ReturnReceiptPayload:
        """Çap şablonu və strukturlaşdırılmış qaytarma qəbzi formalaşdırır."""
        lines_src = lines if lines is not None else getattr(sale_return, "lines", [])
        refunds_src = refunds if refunds is not None else getattr(sale_return, "refunds", [])

        watermark = "*** TƏKRAR ÇAP / DUPLICATE ***\n" if is_reprint else ""
        esc_pos_lines = [
            "\x1b\x40",  # Initialize printer
            "\x1b\x61\x01",  # Center justify
            watermark,
            "BREND HOUSE MMC\n",
            "MALLARIN QAYTARILMASI ÇEKİ\n",
            f"Qaytarma №: {sale_return.return_no}\n",
            f"Orijinal Çek: {original_receipt_no or sale_return.original_sale_id or '-'}\n",
            f"Tarix: {sale_return.created_at.strftime('%Y-%m-%d %H:%M:%S')}\n",
            "\x1b\x61\x00",  # Left justify
            "------------------------------------------------\n",
            "Məhsul                     Say    Qiymət   Məbləğ\n",
            "------------------------------------------------\n",
        ]

        for line in lines_src:
            p_name = line.product_name[:24].ljust(24)
            qty = str(line.quantity).rjust(3)
            price = f"{line.unit_price:.2f}".rjust(8)
            total = f"{line.refund_amount:.2f}".rjust(8)
            esc_pos_lines.append(f"{p_name} {qty} {price} {total}\n")

        esc_pos_lines.extend(
            [
                "------------------------------------------------\n",
                "\x1b\x61\x02",  # Right justify
                f"CƏMİ GERİ ÖDƏNİŞ: {sale_return.refund_total:.2f} AZN\n",
            ]
        )

        for ref in refunds_src:
            esc_pos_lines.append(f"{ref.tender_type.upper()}: {ref.amount:.2f} AZN\n")

        esc_pos_lines.extend(
            [
                "\x1b\x61\x01",  # Center justify
                "Təşəkkür edirik!\n",
                "\x1d\x56\x41\x10",  # Cut paper
            ]
        )
        esc_pos_text = "".join(esc_pos_lines)

        items_html = "".join(
            [
                f"<tr><td>{line.product_name} ({line.sku})</td><td style='text-align:center'>{line.quantity}</td>"
                f"<td style='text-align:right'>{line.unit_price} AZN</td><td style='text-align:right'>{line.refund_amount} AZN</td></tr>"
                for line in lines_src
            ]
        )

        html_receipt = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Qaytarma Çeki - {sale_return.return_no}</title>
<style>
  body {{ font-family: monospace, sans-serif; font-size: 13px; max-width: 320px; margin: auto; padding: 10px; border: 1px dashed #666; }}
  .watermark {{ color: red; font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 8px; }}
  .header {{ text-align: center; margin-bottom: 12px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
  th, td {{ padding: 4px 0; border-bottom: 1px dotted #ccc; font-size: 12px; }}
  .totals {{ margin-top: 10px; text-align: right; }}
</style>
</head>
<body>
{'<div class="watermark">*** TƏKRAR ÇAP / DUPLICATE ***</div>' if is_reprint else ''}
<div class="header">
  <h3>BREND HOUSE MMC</h3>
  <p>Qaytarma Qəbzi</p>
  <p>№: <strong>{sale_return.return_no}</strong></p>
  <p>Tarix: {sale_return.created_at.strftime('%Y-%m-%d %H:%M')}</p>
</div>
<table>
  <thead><tr><th>Məhsul</th><th>Say</th><th>Qiymət</th><th>Məbləğ</th></tr></thead>
  <tbody>{items_html}</tbody>
</table>
<div class="totals">
  <p><strong>GERİ ÖDƏNİŞ: {sale_return.refund_total} AZN</strong></p>
</div>
</body>
</html>"""

        return ReturnReceiptPayload(
            return_id=sale_return.id,
            return_no=sale_return.return_no,
            original_receipt_no=original_receipt_no
            or (str(sale_return.original_sale_id) if sale_return.original_sale_id else None),
            business_date=sale_return.business_date,
            created_at=sale_return.created_at,
            cashier_id=sale_return.processed_by_id,
            branch_id=sale_return.branch_id,
            register_id=sale_return.register_id,
            refund_total=sale_return.refund_total,
            currency="AZN",
            is_reprint=is_reprint,
            reprint_watermark="TƏKRAR ÇAP / DUPLICATE" if is_reprint else None,
            esc_pos_text=esc_pos_text,
            html_receipt=html_receipt,
        )
