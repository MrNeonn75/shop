"""POS (Kassa) Əsas Xidmət Qatı (POS Service).

1. Kassa Növbələrinin İdarəsi (Açılış, Bağlanış Z-Hesabat, Təkrar Açılış, X-Hesabat).
2. Nağd Pul Əməliyyatları (CASH_IN, CASH_OUT, DROP).
3. POS Sürətli Kataloq Axtarışı (< 30 ms hədəfli).
4. Saxlanılmış Səbətlər (Suspend / Recall).
5. Tək Tranzaksiyada 10 Addımlı Atomik Çıxış (Atomic Checkout).
6. Eyni Növbədə Satışın Ləğvi (Sale Void Reversal).
7. Nəzarət və Fırıldaqçılıq İndikatorları (Fraud Metrics).
"""

from __future__ import annotations

import uuid
import zoneinfo
from collections.abc import Sequence
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ForbiddenError,
    ManagerApprovalError,
    NotFoundError,
    TokenReuseDetectedError,
    ValidationError,
)
from app.core.ids import generate_uuid7
from app.core.money import round_money
from app.core.uow import UnitOfWork
from app.modules.cash_registers.service import get_cash_register_service
from app.modules.catalog.service import CatalogService
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.numbering.service import NumberingService
from app.modules.pos.events import (
    CartSuspendedEvent,
    CashMovementRecordedEvent,
    FraudAlertDetectedEvent,
    SaleCancelledEvent,
    SaleCompletedEvent,
    ShiftClosedEvent,
    ShiftOpenedEvent,
)
from app.modules.pos.models import (
    CashMovement,
    PaymentAttempt,
    PosCart,
    PosShift,
    UsedApprovalToken,
)
from app.modules.pos.policies import PosPolicy
from app.modules.pos.pricing import PricingService
from app.modules.pos.repository import PosRepository
from app.modules.pos.schemas import (
    CartLineInput,
    CartRecallResponse,
    CartSummaryResponse,
    CartSuspendRequest,
    CashierFraudMetric,
    CashMovementCreate,
    CashMovementResponse,
    FraudIndicatorsResponse,
    PosCatalogLookupResponse,
    ReceiptItemResponse,
    ReceiptPayloadResponse,
    SaleCheckoutRequest,
    ShiftCloseRequest,
    ShiftOpenRequest,
    ShiftReopenRequest,
    ShiftResponse,
    XReportResponse,
    ZReportResponse,
)
from app.modules.sales.models import Sale, SaleEvent, SaleLine, SalePayment
from app.modules.sales.repository import SalesRepository
from app.modules.sales.schemas import SaleDetailResponse
from app.modules.settings.service import SettingsService
from app.shared.audit import record_audit_event
from app.shared.outbox import record_outbox_event

BAKU_TZ = zoneinfo.ZoneInfo("Asia/Baku")


class PosService:
    """POS və Kassa Əməliyyatlarının Mərkəzi Biznes Xidməti."""

    def __init__(
        self,
        pos_repository: PosRepository | None = None,
        sales_repository: SalesRepository | None = None,
        pricing_service: PricingService | None = None,
        inventory_service: InventoryService | None = None,
        numbering_service: NumberingService | None = None,
        settings_service: SettingsService | None = None,
    ) -> None:
        self.repo = pos_repository or PosRepository()
        self.sales_repo = sales_repository or SalesRepository()
        self.pricing = pricing_service or PricingService()
        self.inventory = inventory_service or InventoryService()
        self.numbering = numbering_service or NumberingService()
        self.settings = settings_service or SettingsService()

    # =========================================================================
    # 1. KASSA NÖVBƏLƏRİ (SHIFTS)
    # =========================================================================

    async def open_shift(
        self,
        request: ShiftOpenRequest,
        company_id: uuid.UUID,
        actor: Any,
    ) -> ShiftResponse:
        """Yeni kassa növbəsi açır."""
        reg_service = get_cash_register_service()
        register = await reg_service.get_register(request.register_id, actor=actor)
        if not register:
            raise NotFoundError(f"'{request.register_id}' ID-li kassa aparatı tapılmadı.")

        async with UnitOfWork() as uow:
            # Filial və ya şirkət tənzimləmələrini oxuyuruq
            pos_rules: dict[str, Any] = {
                "expected_float_azn": 100.0,
                "single_open_shift_per_cashier": True,
            }
            try:
                setting = await self.settings.get(key="pos_rules", branch_id=register.branch_id)
                if setting and isinstance(setting.value, dict):
                    pos_rules.update(setting.value)
            except Exception:
                pass

            expected_float = Decimal(str(pos_rules.get("expected_float_azn", 100.0)))
            single_shift_cashier = bool(pos_rules.get("single_open_shift_per_cashier", True))

            # Aktiv növbə yoxlanışı
            existing_reg_shift = await self.repo.get_active_shift_by_register(
                uow.session, request.register_id, for_update=True
            )
            existing_cashier_shift = None
            if single_shift_cashier and getattr(actor, "id", None):
                existing_cashier_shift = await self.repo.get_active_shift_by_cashier(
                    uow.session, actor.id
                )

            PosPolicy.check_shift_open_allowed(
                actor=actor,
                register_branch_id=register.branch_id,
                register_status=register.status,
                opening_cash=request.opening_cash,
                expected_float=expected_float,
                mismatch_reason=request.mismatch_reason,
                has_active_shift_on_register=existing_reg_shift is not None,
                has_active_shift_for_cashier=existing_cashier_shift is not None,
            )

            # Növbə nömrəsi ayırırıq
            shift_no = await self.numbering.next(
                document_type="shift",
                company_id=company_id,
                branch_id=register.branch_id,
                register_id=register.id,
                session=uow.session,
                actor=actor,
            )

            now = utc_now()
            shift = PosShift(
                id=generate_uuid7(),
                shift_no=shift_no,
                company_id=company_id,
                branch_id=register.branch_id,
                register_id=register.id,
                cashier_id=actor.id,
                opened_at=now,
                closed_at=None,
                opening_cash=request.opening_cash,
                opening_denominations=request.opening_denominations,
                status="OPEN",
                expected_cash_by_tender={"cash": str(request.opening_cash)},
                counted_cash_by_tender=None,
                closing_denominations=None,
                variance=None,
                version=1,
            )
            created = await self.repo.create_shift(uow.session, shift)

            # Audit və Outbox
            await record_audit_event(
                session=uow.session,
                action="POS_SHIFT_OPENED",
                resource_type="pos_shifts",
                resource_id=str(created.id),
                actor_id=actor.id,
                diff={
                    "shift_no": created.shift_no,
                    "register_id": str(created.register_id),
                    "opening_cash": str(created.opening_cash),
                },
            )

            event = ShiftOpenedEvent(
                shift_id=created.id,
                shift_no=created.shift_no,
                register_id=created.register_id,
                branch_id=created.branch_id,
                cashier_id=created.cashier_id,
                opening_cash=created.opening_cash,
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return ShiftResponse.model_validate(created)

    async def close_shift(
        self,
        shift_id: uuid.UUID,
        request: ShiftCloseRequest,
        actor: Any,
    ) -> ZReportResponse:
        """Kassa növbəsini bağlayır və Z-hesabat formalaşdırır."""
        async with UnitOfWork() as uow:
            shift = await self.repo.get_shift_by_id(uow.session, shift_id, for_update=True)
            if not shift:
                raise NotFoundError(f"'{shift_id}' ID-li kassa növbəsi tapılmadı.")

            # Tənzimləmələri oxuyuruq
            pos_rules: dict[str, Any] = {"over_short_tolerance_azn": 5.0}
            try:
                setting = await self.settings.get(key="pos_rules", branch_id=shift.branch_id)
                if setting and isinstance(setting.value, dict):
                    pos_rules.update(setting.value)
            except Exception:
                pass

            tolerance = Decimal(str(pos_rules.get("over_short_tolerance_azn", 5.0)))

            # Növbə ərzindəki satışları və hərəkətləri hesablayırıq
            sales = await self.sales_repo.get_sales_by_shift(uow.session, shift.id)
            movements = await self.repo.list_cash_movements_by_shift(uow.session, shift.id)

            cash_sales = Decimal("0.00")
            card_sales = Decimal("0.00")
            other_sales = Decimal("0.00")
            gross_sales = Decimal("0.00")
            total_discount = Decimal("0.00")
            total_tax = Decimal("0.00")
            net_sales = Decimal("0.00")
            completed_sales_count = 0

            for s in sales:
                if s.status != "CANCELLED":
                    completed_sales_count += 1
                    gross_sales += s.subtotal
                    total_discount += s.discount_total
                    total_tax += s.tax_total
                    net_sales += s.grand_total

                    for p in s.payments:
                        if p.tender_type == "cash":
                            cash_sales += p.amount
                        elif p.tender_type in ("card", "external_terminal"):
                            card_sales += p.amount
                        else:
                            other_sales += p.amount

            cash_in_total = Decimal("0.00")
            cash_out_total = Decimal("0.00")
            drops_total = Decimal("0.00")

            for m in movements:
                if m.movement_type in ("CASH_IN", "FLOAT_ADJUST"):
                    cash_in_total += m.amount
                elif m.movement_type == "CASH_OUT":
                    cash_out_total += m.amount
                elif m.movement_type == "DROP":
                    drops_total += m.amount

            # Gözlənilən nağd pul məbləği
            expected_cash = (
                shift.opening_cash + cash_sales + cash_in_total - cash_out_total - drops_total
            )
            variance = request.counted_cash - expected_cash

            # Siyasət yoxlanışı
            PosPolicy.check_shift_close_allowed(
                actor=actor,
                shift_status=shift.status,
                variance=variance,
                tolerance=tolerance,
                explanation=request.variance_explanation,
                manager_token=request.manager_approval_token,
                branch_id=shift.branch_id,
            )

            # Əgər menecer tokeni istifadə olunubsa, qeydə alırıq
            if request.manager_approval_token:
                await self._consume_manager_token(
                    session=uow.session,
                    token=request.manager_approval_token,
                    action="pos.shift.variance",
                    used_by_id=actor.id,
                    branch_id=shift.branch_id,
                )

            now = utc_now()
            shift.status = "CLOSED"
            shift.closed_at = now
            shift.variance = variance
            shift.closing_notes = request.closing_notes or request.variance_explanation
            shift.closing_denominations = request.closing_denominations
            shift.closing_approver_id = getattr(actor, "id", None)
            shift.expected_cash_by_tender = {
                "cash": str(expected_cash),
                "card": str(card_sales),
                "other": str(other_sales),
            }
            shift.counted_cash_by_tender = (
                {k: str(v) for k, v in request.counted_cash_by_tender.items()}
                if request.counted_cash_by_tender
                else {"cash": str(request.counted_cash)}
            )
            shift.version += 1

            # Audit və Outbox
            await record_audit_event(
                session=uow.session,
                action="POS_SHIFT_CLOSED",
                resource_type="pos_shifts",
                resource_id=str(shift.id),
                actor_id=actor.id,
                diff={
                    "shift_no": shift.shift_no,
                    "expected_cash": str(expected_cash),
                    "counted_cash": str(request.counted_cash),
                    "variance": str(variance),
                },
            )

            event = ShiftClosedEvent(
                shift_id=shift.id,
                shift_no=shift.shift_no,
                register_id=shift.register_id,
                branch_id=shift.branch_id,
                cashier_id=shift.cashier_id,
                expected_cash=expected_cash,
                counted_cash=request.counted_cash,
                variance=variance,
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return ZReportResponse(
                report_type="Z_REPORT",
                shift_no=shift.shift_no,
                register_code=str(shift.register_id)[:8],
                cashier_name=getattr(actor, "full_name", str(shift.cashier_id)),
                opened_at=shift.opened_at,
                generated_at=now,
                closed_at=now,
                opening_cash=shift.opening_cash,
                sales_count=completed_sales_count,
                gross_sales=gross_sales,
                discount_total=total_discount,
                tax_total=total_tax,
                net_sales=net_sales,
                cash_in_total=cash_in_total,
                cash_out_total=cash_out_total,
                drops_total=drops_total,
                expected_cash=expected_cash,
                counted_cash=request.counted_cash,
                variance=variance,
                tender_breakdown={
                    "cash": cash_sales,
                    "card": card_sales,
                    "other": other_sales,
                },
                closing_notes=shift.closing_notes,
            )

    async def reopen_shift(
        self,
        shift_id: uuid.UUID,
        request: ShiftReopenRequest,
        actor: Any,
    ) -> ShiftResponse:
        """Bağlanmış kassa növbəsini təkrar açır (audited)."""
        async with UnitOfWork() as uow:
            shift = await self.repo.get_shift_by_id(uow.session, shift_id, for_update=True)
            if not shift:
                raise NotFoundError(f"'{shift_id}' ID-li kassa növbəsi tapılmadı.")

            # Kassa aparatında hazırda başqa aktiv növbə olmamalıdır
            active_shift = await self.repo.get_active_shift_by_register(
                uow.session, shift.register_id
            )
            if active_shift and active_shift.id != shift.id:
                raise BusinessRuleViolationError(
                    code="ANOTHER_SHIFT_ACTIVE",
                    message="Bu kassa aparatında artıq başqa bir aktiv növbə var. Eyni anda iki növbə açıq ola bilməz.",
                )

            PosPolicy.check_shift_reopen_allowed(
                actor=actor,
                shift_status=shift.status,
                reason=request.reason,
                manager_token=request.manager_approval_token,
                branch_id=shift.branch_id,
            )

            if request.manager_approval_token:
                await self._consume_manager_token(
                    session=uow.session,
                    token=request.manager_approval_token,
                    action="pos.shift.reopen",
                    used_by_id=actor.id,
                    branch_id=shift.branch_id,
                )

            now = utc_now()
            shift.status = "OPEN"
            shift.closed_at = None
            shift.reopened_at = now
            shift.reopened_by_id = getattr(actor, "id", None)
            shift.reopen_reason = request.reason.strip()
            shift.variance = None
            shift.version += 1

            await record_audit_event(
                session=uow.session,
                action="POS_SHIFT_REOPENED",
                resource_type="pos_shifts",
                resource_id=str(shift.id),
                actor_id=actor.id,
                diff={"reason": request.reason},
            )
            await uow.commit()

            return ShiftResponse.model_validate(shift)

    async def get_shift_x_report(self, shift_id: uuid.UUID, actor: Any) -> XReportResponse:
        """Aktiv növbə üçün aralıq X-Hesabat qaytarır."""
        async with UnitOfWork() as uow:
            shift = await self.repo.get_shift_by_id(uow.session, shift_id)
            if not shift:
                raise NotFoundError(f"'{shift_id}' ID-li kassa növbəsi tapılmadı.")

            sales = await self.sales_repo.get_sales_by_shift(uow.session, shift.id)
            movements = await self.repo.list_cash_movements_by_shift(uow.session, shift.id)

            cash_sales = Decimal("0.00")
            card_sales = Decimal("0.00")
            other_sales = Decimal("0.00")
            gross_sales = Decimal("0.00")
            total_discount = Decimal("0.00")
            total_tax = Decimal("0.00")
            net_sales = Decimal("0.00")
            completed_sales_count = 0

            for s in sales:
                if s.status != "CANCELLED":
                    completed_sales_count += 1
                    gross_sales += s.subtotal
                    total_discount += s.discount_total
                    total_tax += s.tax_total
                    net_sales += s.grand_total

                    for p in s.payments:
                        if p.tender_type == "cash":
                            cash_sales += p.amount
                        elif p.tender_type in ("card", "external_terminal"):
                            card_sales += p.amount
                        else:
                            other_sales += p.amount

            cash_in_total = sum(
                (m.amount for m in movements if m.movement_type in ("CASH_IN", "FLOAT_ADJUST")),
                start=Decimal("0.00"),
            )
            cash_out_total = sum(
                (m.amount for m in movements if m.movement_type == "CASH_OUT"),
                start=Decimal("0.00"),
            )
            drops_total = sum(
                (m.amount for m in movements if m.movement_type == "DROP"),
                start=Decimal("0.00"),
            )

            expected_cash = (
                shift.opening_cash + cash_sales + cash_in_total - cash_out_total - drops_total
            )

            return XReportResponse(
                report_type="X_REPORT",
                shift_no=shift.shift_no,
                register_code=str(shift.register_id)[:8],
                cashier_name=getattr(actor, "full_name", str(shift.cashier_id)),
                opened_at=shift.opened_at,
                generated_at=utc_now(),
                opening_cash=shift.opening_cash,
                sales_count=completed_sales_count,
                gross_sales=gross_sales,
                discount_total=total_discount,
                tax_total=total_tax,
                net_sales=net_sales,
                cash_in_total=cash_in_total,
                cash_out_total=cash_out_total,
                drops_total=drops_total,
                expected_cash=expected_cash,
                tender_breakdown={
                    "cash": cash_sales,
                    "card": card_sales,
                    "other": other_sales,
                },
            )

    # =========================================================================
    # 2. NAĞD PUL HƏRƏKƏTLƏRİ (CASH MOVEMENTS)
    # =========================================================================

    async def record_cash_movement(
        self,
        shift_id: uuid.UUID,
        request: CashMovementCreate,
        actor: Any,
    ) -> CashMovementResponse:
        """Kassaya nağd vəsait daxil və ya xaric edir (CASH_IN, CASH_OUT, DROP)."""
        async with UnitOfWork() as uow:
            shift = await self.repo.get_shift_by_id(uow.session, shift_id, for_update=True)
            if not shift:
                raise NotFoundError(f"'{shift_id}' ID-li kassa növbəsi tapılmadı.")
            if shift.status != "OPEN":
                raise BusinessRuleViolationError(
                    code="SHIFT_NOT_OPEN",
                    message="Yalnız 'OPEN' statuslu növbədə nağd vəsait hərəkəti qeydə alına bilər.",
                )

            # Tənzimləmələri oxuyuruq
            threshold = Decimal("200.00")
            try:
                setting = await self.settings.get(key="pos_rules", branch_id=shift.branch_id)
                if setting and isinstance(setting.value, dict):
                    threshold = Decimal(
                        str(setting.value.get("manager_approval_cash_movement_threshold", 200.0))
                    )
            except Exception:
                pass

            PosPolicy.check_cash_movement_allowed(
                actor=actor,
                movement_type=request.movement_type,
                amount=request.amount,
                approval_threshold=threshold,
                manager_token=request.manager_approval_token,
                branch_id=shift.branch_id,
            )

            # Token varsa təkrar istifadənin qarşısını alırıq
            approved_by_id = None
            if request.manager_approval_token:
                payload = await self._consume_manager_token(
                    session=uow.session,
                    token=request.manager_approval_token,
                    action="pos.cash.movement",
                    used_by_id=actor.id,
                    branch_id=shift.branch_id,
                )
                approved_by_id = uuid.UUID(payload["sub"])

            movement_no = await self.numbering.next(
                document_type="cash_movement",
                company_id=shift.company_id,
                branch_id=shift.branch_id,
                register_id=shift.register_id,
                session=uow.session,
                actor=actor,
            )

            movement = CashMovement(
                id=generate_uuid7(),
                movement_no=movement_no,
                company_id=shift.company_id,
                shift_id=shift.id,
                register_id=shift.register_id,
                movement_type=request.movement_type,
                amount=request.amount,
                reason_code=request.reason_code,
                notes=request.notes,
                attachment_url=request.attachment_url,
                manager_approval_token=request.manager_approval_token,
                approved_by_id=approved_by_id,
                created_by_id=actor.id,
                created_at=utc_now(),
            )
            created = await self.repo.create_cash_movement(uow.session, movement)

            event = CashMovementRecordedEvent(
                movement_id=created.id,
                movement_no=created.movement_no,
                shift_id=shift.id,
                register_id=shift.register_id,
                movement_type=created.movement_type,
                amount=created.amount,
                reason_code=created.reason_code,
                created_by_id=actor.id,
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return CashMovementResponse.model_validate(created)

    # =========================================================================
    # 3. POS SÜRƏTLİ KATALOQ AXTARIŞI (< 30 ms)
    # =========================================================================

    async def lookup_catalog_item(
        self,
        code: str,
        register_id: uuid.UUID,
        actor: Any,
    ) -> PosCatalogLookupResponse:
        """POS üçün barkod və ya SKU üzrə sürətli axtarış və anbar qalığı."""
        clean_code = code.strip()
        reg_service = get_cash_register_service()
        register = await reg_service.get_register(register_id, actor=actor)
        if not register:
            raise NotFoundError(f"'{register_id}' ID-li kassa aparatı tapılmadı.")

        cat_svc = CatalogService()
        lookup_res = await cat_svc.lookup_by_code(
            clean_code, branch_id=register.branch_id, actor=actor
        )

        # Standart satış anbarında mövcud qalığı yoxlayırıq
        bal_info = await self.inventory.get_single_balance(
            warehouse_id=register.default_warehouse_id,
            variant_id=lookup_res.variant_id,
            stock_status="available",
        )
        on_hand = bal_info["available"] if bal_info else 0
        stock_status = "in_stock" if on_hand > 0 else "out_of_stock"

        return PosCatalogLookupResponse(
            variant_id=lookup_res.variant_id,
            product_id=lookup_res.product_id,
            internal_code=lookup_res.internal_code,
            product_name=lookup_res.product_name,
            sku=lookup_res.sku,
            barcode=lookup_res.barcode,
            size=lookup_res.size,
            color=lookup_res.color,
            effective_price=lookup_res.effective_price,
            currency="AZN",
            tax_class=lookup_res.tax_class,
            stock_available=on_hand,
            stock_status=stock_status,
            promotions_preview=[],
        )

    # =========================================================================
    # 4. SAXLANILMIŞ SƏBƏTLƏR (SUSPEND / RECALL)
    # =========================================================================

    async def suspend_cart(
        self,
        request: CartSuspendRequest,
        company_id: uuid.UUID,
        actor: Any,
    ) -> CartSummaryResponse:
        """Cari səbəti müvəqqəti saxlayır (Suspend)."""
        async with UnitOfWork() as uow:
            shift = await self.repo.get_shift_by_id(uow.session, request.shift_id)
            if not shift or shift.status != "OPEN":
                raise BusinessRuleViolationError(
                    code="SHIFT_NOT_OPEN",
                    message="Səbət yalnız 'OPEN' statuslu növbədə saxlanıla bilər.",
                )

            # Auto-expire saatını oxuyuruq
            expire_hours = 24
            try:
                setting = await self.settings.get(key="pos_rules", branch_id=shift.branch_id)
                if setting and isinstance(setting.value, dict):
                    expire_hours = int(setting.value.get("cart_auto_expire_hours", 24))
            except Exception:
                pass

            now = utc_now()
            expires_at = now + timedelta(hours=expire_hours)

            cart_no = await self.numbering.next(
                document_type="cart",
                company_id=company_id,
                branch_id=shift.branch_id,
                register_id=shift.register_id,
                session=uow.session,
                actor=actor,
            )

            cart = PosCart(
                id=generate_uuid7(),
                company_id=company_id,
                branch_id=shift.branch_id,
                shift_id=shift.id,
                cart_no=cart_no,
                label=request.label.strip(),
                customer_id=request.customer_id,
                status="SUSPENDED",
                lines=[c_line.model_dump(mode="json") for c_line in request.lines],
                suspended_at=now,
                recalled_at=None,
                expires_at=expires_at,
                created_by_id=actor.id,
            )
            created = await self.repo.create_cart(uow.session, cart)

            event = CartSuspendedEvent(
                cart_id=created.id,
                cart_no=created.cart_no,
                branch_id=created.branch_id,
                shift_id=created.shift_id,
                label=created.label,
                line_count=len(request.lines),
            )
            await record_outbox_event(uow.session, event)
            await uow.commit()

            return CartSummaryResponse(
                id=created.id,
                cart_no=created.cart_no,
                shift_id=created.shift_id,
                label=created.label,
                status=created.status,
                line_count=len(request.lines),
                suspended_at=created.suspended_at,
                expires_at=created.expires_at,
            )

    async def list_suspended_carts(
        self, branch_id: uuid.UUID, actor: Any
    ) -> list[CartSummaryResponse]:
        """Filial üzrə aktiv saxlanılmış səbətləri gətirir."""
        _ = actor
        async with UnitOfWork() as uow:
            carts = await self.repo.list_active_carts(uow.session, branch_id)
            now = utc_now()
            res = []
            for c in carts:
                # Əgər vaxtı bitibsə statusu EXPIRED edirik
                if now > c.expires_at:
                    c.status = "EXPIRED"
                else:
                    res.append(
                        CartSummaryResponse(
                            id=c.id,
                            cart_no=c.cart_no,
                            shift_id=c.shift_id,
                            label=c.label,
                            status=c.status,
                            line_count=len(c.lines),
                            suspended_at=c.suspended_at,
                            expires_at=c.expires_at,
                        )
                    )
            await uow.commit()
            return res

    async def recall_cart(self, cart_id: uuid.UUID, actor: Any) -> CartRecallResponse:
        """Saxlanılmış səbəti geri çağırır və cari qiymətlərlə yenidən kalkulyasiya edir."""
        async with UnitOfWork() as uow:
            cart = await self.repo.get_cart_by_id(uow.session, cart_id)
            if not cart:
                raise NotFoundError(f"'{cart_id}' ID-li səbət tapılmadı.")

            now = utc_now()
            expires_at = cart.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=zoneinfo.ZoneInfo("UTC"))
            if now > expires_at or cart.status != "SUSPENDED":
                cart.status = "EXPIRED"
                await uow.commit()
                raise BusinessRuleViolationError(
                    code="CART_EXPIRED_OR_INACTIVE",
                    message="Saxlanılmış səbətin etibarlılıq müddəti bitib və ya artıq istifadə olunub.",
                )

            # Sətirləri Pydantic CartLineInput formatına çeviririk
            items = [CartLineInput(**raw_line) for raw_line in cart.lines]
            quote = await self.pricing.quote(
                session=uow.session,
                company_id=cart.company_id,
                branch_id=cart.branch_id,
                items=items,
                customer_id=cart.customer_id,
                actor=actor,
            )

            cart.status = "RECALLED"
            cart.recalled_at = now
            await uow.commit()

            return CartRecallResponse(
                id=cart.id,
                cart_no=cart.cart_no,
                label=cart.label,
                customer_id=cart.customer_id,
                lines=items,
                quote=quote,
            )

    # =========================================================================
    # 5. ATOMİK ÇIXIŞ / SATIŞ TAMAMLAMA (CHECKOUT - 10 ADDIM)
    # =========================================================================

    async def checkout(
        self,
        request: SaleCheckoutRequest,
        company_id: uuid.UUID,
        idempotency_key: str,
        actor: Any,
        correlation_id: str | None = None,
        session: AsyncSession | None = None,
        exchange_group_id: uuid.UUID | None = None,
    ) -> ReceiptPayloadResponse:
        """Bütün çıxış əməliyyatını tək verilənlər bazası tranzaksiyasında atomik icra edir.

        10 Dəqiq Addım:
        1. Növbə və icazələrin yoxlanışı
        2. Qiymətin serverdə təkrar hesablanması və yoxlanışı (PRICE_CHANGED)
        3. Ödənişlərin tam və düzgün olmasının yoxlanışı
        4. Sadiqlik (Loyalty) xallarının rezervasiyası / debeti
        5. Fasiləsiz çək nömrəsinin ayrılması (tranzaksiya daxilində)
        6. Satış, sətirlər və ödənişlərin qeydiyyatı
        7. İnventar hərəkətlərinin (SALE) icrası və deterministik kilidlənmə
        8. Maya dəyəri (COGS snapshot) qeydiyyatı
        9. Outbox hadisələrinin yazılması
        10. Tranzaksiya commit və qəbz cavabı.
        """
        async with UnitOfWork(session=session) as uow:
            # --- Idempotency Yoxlanışı (Replay / Mismatch / Conflict) ---
            existing_payment_attempt = await self.repo.get_payment_attempt_by_idempotency_key(
                uow.session, company_id, idempotency_key
            )
            if existing_payment_attempt and existing_payment_attempt.status == "CAPTURED":
                # Əvvəl tamamlanmış satışın cavabını tapıb təkrar qaytarırıq (Replay)
                existing_sale = await self.sales_repo.get_sale_by_receipt_no(
                    uow.session, existing_payment_attempt.provider_transaction_id or ""
                )
                if existing_sale:
                    return self._build_receipt_payload(existing_sale)

            # ADDIM 1: Növbə və kassa yoxlanışı
            shift = await self.repo.get_shift_by_id(uow.session, request.shift_id, for_update=True)
            if not shift:
                raise NotFoundError(f"'{request.shift_id}' ID-li kassa növbəsi tapılmadı.")
            if shift.status != "OPEN":
                raise BusinessRuleViolationError(
                    code="SHIFT_NOT_OPEN",
                    message=f"Kassa növbəsi açıq deyil (Status: {shift.status}). Satış icra edilə bilməz.",
                )
            if shift.register_id != request.register_id:
                raise BusinessRuleViolationError(
                    code="REGISTER_MISMATCH",
                    message="Növbənin kassa aparatı sorğudakı aparatla uyğun gəlmir.",
                )

            # İstifadəçi hüquq yoxlanışı
            roles = getattr(actor, "roles", []) or []
            perms = getattr(actor, "permissions", []) or []
            if "system_admin" not in roles and "pos.sale.create" not in perms:
                raise ForbiddenError("Kassa satışı aparmaq hüququnuz yoxdur (pos.sale.create).")

            # Filial və kassa aparatı məlumatları
            reg_service = get_cash_register_service()
            register = await reg_service.get_register(
                request.register_id, actor=actor, session=uow.session
            )
            if not register:
                raise NotFoundError("Kassa aparatı tapılmadı.")

            # ADDIM 2: Server-authoritative Qiymət Kalkulyasiyası
            quote = await self.pricing.quote(
                session=uow.session,
                company_id=company_id,
                branch_id=shift.branch_id,
                items=request.items,
                customer_id=request.customer_id,
                receipt_discount_percent=request.receipt_discount_percent,
                receipt_discount_amount=request.receipt_discount_amount,
                manager_approval_token=request.manager_approval_token,
                actor=actor,
                promo_code=getattr(request, "promo_code", None),
            )

            # Müştərinin gözlədiyi məbləğlə server kalkulyasiyasının müqayisəsi
            if quote.grand_total != request.expected_grand_total:
                raise BusinessRuleViolationError(
                    code="PRICE_CHANGED",
                    message=(
                        f"Qiymət və ya endirim dəyişib! Müştəri gözləntisi: {request.expected_grand_total} AZN, "
                        f"Server hesabı: {quote.grand_total} AZN."
                    ),
                    details=[quote.model_dump(mode="json")],
                )

            # ADDIM 3: Ödənişlərin Yoxlanışı
            pos_rules: dict[str, Any] = {
                "card_provider_mode": "NOT_CONFIGURED",
                "external_terminal_enabled": True,
            }
            try:
                setting = await self.settings.get(
                    key="pos_rules", branch_id=shift.branch_id, session=uow.session
                )
                if setting and isinstance(setting.value, dict):
                    pos_rules.update(setting.value)
            except Exception:
                pass

            total_paid = Decimal("0.00")
            total_change = Decimal("0.00")
            payment_records_data: list[dict[str, Any]] = []

            for p in request.payments:
                p_amt = p.amount
                p_tendered = p.tendered_amount if p.tendered_amount is not None else p_amt
                p_change = Decimal("0.00")

                if p.tender_type == "cash":
                    if p_tendered < p_amt:
                        raise ValidationError(
                            "Nağd ödənişdə təqdim edilən məbləğ ödəniş məbləğindən az ola bilməz."
                        )
                    p_change = p_tendered - p_amt
                    total_change += p_change
                else:
                    if p_tendered != p_amt:
                        raise ValidationError(
                            "Nağdsız ödənişlərdə qalıq (change) qaytarılması mümkün deyil."
                        )

                # Kart təhlükəsizlik yoxlanışı
                PosPolicy.check_card_payment_allowed(
                    tender_type=p.tender_type,
                    provider_mode=str(pos_rules.get("card_provider_mode", "NOT_CONFIGURED")),
                    external_terminal_enabled=bool(
                        pos_rules.get("external_terminal_enabled", True)
                    ),
                    approval_code=p.approval_code,
                    provider_confirmation_id=p.provider_confirmation_id,
                )

                total_paid += p_amt
                payment_records_data.append(
                    {
                        "tender_type": p.tender_type,
                        "amount": str(p_amt),
                        "tendered_amount": str(p_tendered),
                        "change_amount": str(p_change),
                        "provider_confirmation_id": p.provider_confirmation_id,
                        "approval_code": p.approval_code,
                        "masked_reference": p.masked_reference,
                    }
                )

            if total_paid != quote.grand_total:
                raise ValidationError(
                    f"Ödənilən ümumi məbləğ ({total_paid} AZN) yekun çek məbləğinə ({quote.grand_total} AZN) bərabər deyil."
                )

            # ADDIM 4: Sadiqlik (Loyalty Points) Yoxlanışı (B11 stub)
            if request.loyalty_points_to_redeem and request.loyalty_points_to_redeem > 0:
                # Gələcək CRM modulu ilə rezervasiya inteqrasiyası
                pass

            # ADDIM 5: Fasiləsiz Çək Nömrəsinin Ayrılması (Tranzaksiya daxilində gapless)
            receipt_no = await self.numbering.next(
                document_type="receipt",
                company_id=company_id,
                branch_id=shift.branch_id,
                register_id=shift.register_id,
                session=uow.session,
                actor=actor,
            )

            # Biznes günü (Asia/Baku vaxtı ilə)
            now = utc_now()
            business_date = now.astimezone(BAKU_TZ).date()

            # ADDIM 6: Satış Sənədi və Sətirlərinin Yaradılması
            sale = Sale(
                id=generate_uuid7(),
                receipt_no=receipt_no,
                company_id=company_id,
                branch_id=shift.branch_id,
                register_id=shift.register_id,
                shift_id=shift.id,
                cashier_id=actor.id,
                customer_id=request.customer_id,
                status="COMPLETED",
                subtotal=quote.subtotal,
                discount_total=quote.discount_total,
                tax_total=quote.tax_total,
                grand_total=quote.grand_total,
                paid_amount=total_paid,
                change_amount=total_change,
                cost_total=Decimal("0.00"),  # Addım 8-də doldurulacaq
                currency="AZN",
                breakdown=quote.model_dump(mode="json"),
                payment_summary=payment_records_data,
                reprint_count=0,
                business_date=business_date,
                correlation_id=correlation_id,
                exchange_group_id=exchange_group_id,
                version=1,
                created_at=now,
            )
            created_sale = await self.sales_repo.create_sale(uow.session, sale)

            # Loyallıq və Promokod inteqrasiyası (Tranzaksiya daxilində atomik)
            if request.loyalty_points_to_redeem and request.loyalty_points_to_redeem > 0 and request.customer_id:
                from app.modules.loyalty.service import LoyaltyService
                loyalty_service = LoyaltyService(uow.session)
                await loyalty_service.redeem(
                    session=uow.session,
                    customer_id=request.customer_id,
                    points_to_redeem=request.loyalty_points_to_redeem,
                    sale_id=created_sale.id,
                    at_time=now,
                )

            if getattr(request, "promo_code", None) and str(request.promo_code).strip():
                from app.modules.marketing.service import MarketingService
                mkt_service = MarketingService(uow.session)
                await mkt_service.redeem_promo_code(
                    session=uow.session,
                    code_str=str(request.promo_code).strip(),
                    sale_id=created_sale.id,
                    customer_id=request.customer_id,
                    discount_amount=quote.discount_total,
                    at_time=now,
                )

            if request.customer_id:
                from app.modules.crm.service import CrmService
                from app.modules.loyalty.service import LoyaltyService
                loyalty_service = LoyaltyService(uow.session)
                await loyalty_service.earn(
                    session=uow.session,
                    customer_id=request.customer_id,
                    sale_id=created_sale.id,
                    eligible_amount=created_sale.grand_total,
                    at_time=now,
                )
                crm_service = CrmService(uow.session)
                await crm_service.update_aggregates_from_sale(
                    customer_id=request.customer_id,
                    sale_amount=created_sale.grand_total,
                    sale_date=now,
                )

            sale_lines: list[SaleLine] = []
            for idx, item in enumerate(quote.items, start=1):
                sl = SaleLine(
                    id=generate_uuid7(),
                    sale_id=created_sale.id,
                    line_no=idx,
                    variant_id=item.variant_id,
                    product_id=item.product_id,
                    sku=item.sku,
                    barcode=None,
                    product_name=item.product_name,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    cost_price=Decimal("0.0000"),  # Addım 8-də doldurulacaq
                    gross_amount=item.gross_amount,
                    discount_amount=item.discount_amount,
                    tax_class_id=item.tax_class_id,
                    tax_rate=item.tax_rate,
                    tax_amount=item.tax_amount,
                    total_amount=item.total_amount,
                    promotion_info={"sources": item.discount_sources},
                    created_at=now,
                )
                uow.session.add(sl)
                sale_lines.append(sl)

            for pr in payment_records_data:
                sp = SalePayment(
                    id=generate_uuid7(),
                    sale_id=created_sale.id,
                    tender_type=pr["tender_type"],
                    amount=Decimal(pr["amount"]),
                    tendered_amount=Decimal(pr["tendered_amount"])
                    if pr.get("tendered_amount") is not None
                    else None,
                    change_amount=Decimal(pr["change_amount"])
                    if pr.get("change_amount") is not None
                    else None,
                    provider_confirmation_id=pr["provider_confirmation_id"],
                    approval_code=pr["approval_code"],
                    masked_reference=pr["masked_reference"],
                    created_at=now,
                )
                uow.session.add(sp)

            init_event = SaleEvent(
                id=generate_uuid7(),
                sale_id=created_sale.id,
                event_type="CREATED",
                actor_id=actor.id,
                reason="POS Kassa Satışı",
                metadata_json={"receipt_no": receipt_no, "total": str(quote.grand_total)},
                created_at=now,
            )
            await self.sales_repo.add_sale_event(uow.session, init_event)
            await uow.session.flush()

            # ADDIM 7: İnventar Hərəkətlərinin (SALE) Qeydiyyatı (FOR UPDATE Kilidlənmə)
            movement_drafts = [
                MovementDraft(
                    variant_id=s_item.variant_id,
                    quantity=s_item.quantity,
                    from_warehouse_id=register.default_warehouse_id,
                    to_warehouse_id=None,
                    from_status="available",
                    to_status="available",
                    movement_type="SALE",
                    reference_type="SALE",
                    reference_id=created_sale.id,
                    unit_cost=Decimal("0.0000"),
                )
                for s_item in sale_lines
            ]
            movements = await self.inventory.post(
                session=uow.session,
                company_id=company_id,
                movements=movement_drafts,
                user_id=actor.id,
                correlation_id=correlation_id,
                actor=actor,
            )

            # ADDIM 8: Maya Dəyəri (COGS snapshot) Qeydiyyatı
            total_cogs = Decimal("0.00")
            for mov, s_line in zip(movements, sale_lines, strict=False):
                s_line.cost_price = mov.unit_cost
                total_cogs += round_money(mov.unit_cost * s_line.quantity)

            created_sale.cost_total = total_cogs

            # Ödəniş cəhdini qeyd edirik (idempotency replay üçün)
            attempt = PaymentAttempt(
                id=generate_uuid7(),
                company_id=company_id,
                register_id=register.id,
                shift_id=shift.id,
                idempotency_key=idempotency_key,
                tender_type=request.payments[0].tender_type,
                amount=quote.grand_total,
                currency="AZN",
                status="CAPTURED",
                provider_id=str(pos_rules.get("card_provider_mode", "NOT_CONFIGURED")),
                provider_transaction_id=receipt_no,
                authorization_code=request.payments[0].approval_code,
                masked_card=request.payments[0].masked_reference,
                created_at=now,
            )
            await self.repo.create_payment_attempt(uow.session, attempt)

            # Əgər menecer endirim tokeni istifadə edilibsə
            if request.manager_approval_token:
                await self._consume_manager_token(
                    session=uow.session,
                    token=request.manager_approval_token,
                    action="pos.discount.override",
                    used_by_id=actor.id,
                    branch_id=shift.branch_id,
                )

            # ADDIM 9: Outbox Hadisəsinin Qeydiyyatı
            sale_event = SaleCompletedEvent(
                sale_id=created_sale.id,
                receipt_no=created_sale.receipt_no,
                company_id=company_id,
                branch_id=shift.branch_id,
                register_id=shift.register_id,
                shift_id=shift.id,
                cashier_id=actor.id,
                customer_id=request.customer_id,
                grand_total=created_sale.grand_total,
                paid_amount=created_sale.paid_amount,
                change_amount=created_sale.change_amount,
                payment_tenders=[p.tender_type for p in request.payments],
                items_count=len(sale_lines),
            )
            await record_outbox_event(uow.session, sale_event)

            # ADDIM 10: Tranzaksiya Commit və Çək Cavabı
            if session is None:
                await uow.commit()
            else:
                await uow.session.flush()

            return self._build_receipt_payload(
                created_sale, lines=sale_lines, payments=payment_records_data
            )

    # =========================================================================
    # 6. EYNİ NÖVBƏDƏ SATIŞIN LƏĞVİ (SALE CANCEL / VOID REVERSAL)
    # =========================================================================

    async def cancel_sale(
        self,
        sale_id: uuid.UUID,
        reason: str,
        manager_approval_token: str | None,
        actor: Any,
    ) -> SaleDetailResponse:
        """Eyni növbədə tamamlanmış satışı ləğv edir (Kompensasiya hərəkətləri ilə stoku bərpa edir)."""
        roles = getattr(actor, "roles", []) or []
        perms = getattr(actor, "permissions", []) or []

        has_cancel_perm = "system_admin" in roles or "pos.sale.cancel" in perms
        if not has_cancel_perm and not manager_approval_token:
            raise ForbiddenError(
                "Satışı ləğv etmək hüququnuz yoxdur (pos.sale.cancel tələb olunur)."
            )

        async with UnitOfWork() as uow:
            sale = await self.sales_repo.get_sale_by_id(uow.session, sale_id)
            if not sale:
                raise NotFoundError(f"'{sale_id}' ID-li satış tapılmadı.")
            if sale.status == "CANCELLED":
                raise BusinessRuleViolationError(
                    code="SALE_ALREADY_CANCELLED",
                    message="Bu satış artıq ləğv edilib.",
                )
            if sale.status in ("RETURNED", "PARTIALLY_RETURNED"):
                raise BusinessRuleViolationError(
                    code="SALE_ALREADY_RETURNED",
                    message="Qaytarılmış və ya qismən qaytarılmış satış birbaşa ləğv edilə bilməz.",
                )
            if sale.exchange_group_id is not None:
                raise BusinessRuleViolationError(
                    code="EXCHANGE_PAIR_LOCKED",
                    message="Mübadilə (Exchange) əməliyyatına bağlı satış sənədi fərdi qaydada ləğv edilə bilməz. Cütlük birlikdə ləğv edilməlidir.",
                )

            # Növbə hələ də AÇIQ olmalıdır
            shift = await self.repo.get_shift_by_id(uow.session, sale.shift_id, for_update=True)
            if not shift or shift.status != "OPEN":
                raise BusinessRuleViolationError(
                    code="SHIFT_CLOSED_CANCELLATION_FORBIDDEN",
                    message="Kassa növbəsi artıq bağlanıb! Yalnız açıq növbədə satış ləğv edilə bilər. Qaytarma prosedurundan istifadə edin.",
                )

            # Kassir öz vurduğu satışı menecer təsdiqi olmadan təkbaşına ləğv edə bilməz (SoD)
            if "system_admin" not in roles and not manager_approval_token:
                raise ManagerApprovalError(
                    "Kassa satışının ləğvi üçün menecer təsdiq tokeni tələb olunur."
                )

            if manager_approval_token:
                await self._consume_manager_token(
                    session=uow.session,
                    token=manager_approval_token,
                    action="pos.sale.cancel",
                    used_by_id=actor.id,
                    branch_id=sale.branch_id,
                )

            # Kassa aparatını tapırıq
            reg_service = get_cash_register_service()
            try:
                register = await reg_service.get_register(sale.register_id, actor=actor)
                default_wh_id = register.default_warehouse_id
            except Exception:
                default_wh_id = shift.branch_id

            # İnventar kompensasiya hərəkətləri (SALE_RETURN / REVERSAL)
            reversal_drafts = [
                MovementDraft(
                    variant_id=s_item.variant_id,
                    quantity=s_item.quantity,
                    from_warehouse_id=None,
                    to_warehouse_id=default_wh_id,
                    from_status="available",
                    to_status="available",
                    movement_type="SALE_RETURN",
                    reference_type="SALE_CANCEL",
                    reference_id=sale.id,
                    unit_cost=s_item.cost_price,
                )
                for s_item in sale.lines
            ]
            await self.inventory.post(
                session=uow.session,
                company_id=sale.company_id,
                movements=reversal_drafts,
                user_id=actor.id,
                actor=actor,
            )

            # Satışın statusunu CANCELLED edirik
            cancelled_sale = await self.sales_repo.cancel_sale(
                session=uow.session,
                sale=sale,
                cancelled_by_id=actor.id,
                reason=reason.strip(),
            )

            # Hadisə və Outbox
            cancel_event = SaleEvent(
                id=generate_uuid7(),
                sale_id=sale.id,
                event_type="CANCELLED",
                actor_id=actor.id,
                reason=reason.strip(),
                metadata_json={"receipt_no": sale.receipt_no, "total": str(sale.grand_total)},
                created_at=utc_now(),
            )
            await self.sales_repo.add_sale_event(uow.session, cancel_event)

            outbox_ev = SaleCancelledEvent(
                sale_id=sale.id,
                receipt_no=sale.receipt_no,
                company_id=sale.company_id,
                branch_id=sale.branch_id,
                register_id=sale.register_id,
                shift_id=sale.shift_id,
                cancelled_by_id=actor.id,
                reason=reason.strip(),
                grand_total=sale.grand_total,
            )
            await record_outbox_event(uow.session, outbox_ev)
            await uow.commit()

            return SaleDetailResponse(
                id=cancelled_sale.id,
                receipt_no=cancelled_sale.receipt_no,
                branch_id=cancelled_sale.branch_id,
                register_id=cancelled_sale.register_id,
                shift_id=cancelled_sale.shift_id,
                cashier_id=cancelled_sale.cashier_id,
                customer_id=cancelled_sale.customer_id,
                status=cancelled_sale.status,
                subtotal=cancelled_sale.subtotal,
                discount_total=cancelled_sale.discount_total,
                tax_total=cancelled_sale.tax_total,
                grand_total=cancelled_sale.grand_total,
                paid_amount=cancelled_sale.paid_amount,
                change_amount=cancelled_sale.change_amount,
                cost_total=None,
                margin_amount=None,
                margin_percent=None,
                currency=cancelled_sale.currency,
                business_date=cancelled_sale.business_date,
                created_at=cancelled_sale.created_at,
                reprint_count=cancelled_sale.reprint_count,
                cancelled_at=cancelled_sale.cancelled_at,
                cancelled_by_id=cancelled_sale.cancelled_by_id,
                cancellation_reason=cancelled_sale.cancellation_reason,
            )

    # =========================================================================
    # 7. NƏZARƏT VƏ FIRILDAQÇILIQ İNDİKATORLARI (FRAUD METRICS)
    # =========================================================================

    async def get_fraud_indicators(
        self,
        branch_id: uuid.UUID,
        start_date: date,
        end_date: date,
        actor: Any,
    ) -> FraudIndicatorsResponse:
        """Kassirlər və növbələr üzrə risk və anomaliya göstəricilərini təhlil edir."""
        _ = actor
        async with UnitOfWork() as uow:
            # Hədləri oxuyuruq
            void_thresh = Decimal("0.10")  # 10%
            disc_thresh = Decimal("0.20")  # 20%
            var_thresh = Decimal("20.00")  # 20 AZN

            sales, _ = await self.sales_repo.search_sales(
                session=uow.session,
                branch_id=branch_id,
                start_date=start_date,
                end_date=end_date,
                limit=5000,
            )

            # Kassir üzrə qruplaşdırma
            cashier_stats: dict[uuid.UUID, dict[str, Any]] = {}
            for s in sales:
                cid = s.cashier_id
                if cid not in cashier_stats:
                    cashier_stats[cid] = {
                        "total_sales": 0,
                        "cancelled_sales": 0,
                        "total_gross": Decimal("0.00"),
                        "total_discount": Decimal("0.00"),
                        "discount_count": 0,
                    }
                cashier_stats[cid]["total_sales"] += 1
                if s.status == "CANCELLED":
                    cashier_stats[cid]["cancelled_sales"] += 1
                cashier_stats[cid]["total_gross"] += s.subtotal
                if s.discount_total > Decimal("0.00"):
                    cashier_stats[cid]["discount_count"] += 1
                    cashier_stats[cid]["total_discount"] += s.discount_total

            # Növbələrin kassa fərqlərini oxuyuruq
            shifts = await self.repo.list_shifts(
                session=uow.session,
                branch_id=branch_id,
                limit=1000,
            )
            cashier_shifts_variance: dict[uuid.UUID, Decimal] = {}
            for sh in shifts:
                if sh.variance is not None:
                    cid = sh.cashier_id
                    cashier_shifts_variance[cid] = (
                        cashier_shifts_variance.get(cid, Decimal("0.00")) + sh.variance
                    )

            anomalies = 0
            metrics: list[CashierFraudMetric] = []

            for cid, stat in cashier_stats.items():
                t_sales = stat["total_sales"]
                c_sales = stat["cancelled_sales"]
                void_rate = (
                    round_money(Decimal(str(c_sales)) / Decimal(str(t_sales)))
                    if t_sales > 0
                    else Decimal("0.00")
                )

                avg_disc_rate = Decimal("0.00")
                if stat["total_gross"] > Decimal("0.00"):
                    avg_disc_rate = round_money(stat["total_discount"] / stat["total_gross"])

                net_var = cashier_shifts_variance.get(cid, Decimal("0.00"))
                reasons: list[str] = []

                if void_rate > void_thresh:
                    reasons.append(
                        f"Yüksək satış ləğvi faizi ({void_rate * 100}% > {void_thresh * 100}%)"
                    )
                if avg_disc_rate > disc_thresh:
                    reasons.append(
                        f"Yüksək endirim faizi ({avg_disc_rate * 100}% > {disc_thresh * 100}%)"
                    )
                if abs(net_var) > var_thresh:
                    reasons.append(f"Böyük kassa kənarlaşması ({net_var} AZN > {var_thresh} AZN)")

                is_flagged = len(reasons) > 0
                if is_flagged:
                    anomalies += 1
                    # Outbox xəbərdarlıq hadisəsi qeyd edirik
                    alert_ev = FraudAlertDetectedEvent(
                        branch_id=branch_id,
                        register_id=None,
                        shift_id=None,
                        cashier_id=cid,
                        indicator_type="ANOMALY_DETECTED",
                        threshold_value=void_thresh,
                        observed_value=void_rate,
                        message="; ".join(reasons),
                    )
                    await record_outbox_event(uow.session, alert_ev)

                metrics.append(
                    CashierFraudMetric(
                        cashier_id=cid,
                        cashier_name=f"Kassir-{str(cid)[:6]}",
                        total_sales=t_sales,
                        cancelled_sales=c_sales,
                        void_rate=void_rate,
                        discount_count=stat["discount_count"],
                        avg_discount_rate=avg_disc_rate,
                        cash_movements_count=0,
                        net_cash_variance=net_var,
                        is_flagged=is_flagged,
                        flag_reasons=reasons,
                    )
                )

            await uow.commit()

            return FraudIndicatorsResponse(
                branch_id=branch_id,
                period_start=start_date,
                period_end=end_date,
                anomalies_detected=anomalies,
                cashier_metrics=metrics,
            )

    # --- Köməkçi Metodlar ---

    async def _consume_manager_token(
        self,
        session: AsyncSession,
        token: str,
        action: str,
        used_by_id: uuid.UUID,
        branch_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Menecer təsdiq tokenini yoxlayır və bazada istifadə edilmiş kimi qeyd edir (Replay prevention)."""
        payload = PosPolicy.verify_manager_approval_token(
            token=token,
            required_action=action,
            branch_id=branch_id,
        )
        jti = payload["jti"]
        if await self.repo.is_approval_token_used(session, jti):
            raise TokenReuseDetectedError(
                "Bu menecer təsdiq tokeni artıq istifadə edilib və təkrar tətbiq oluna bilməz."
            )

        used = UsedApprovalToken(
            id=generate_uuid7(),
            jti=jti,
            action=action,
            manager_id=uuid.UUID(payload["sub"]),
            used_by_id=used_by_id,
            used_at=utc_now(),
        )
        await self.repo.record_used_approval_token(session, used)
        return payload

    def _build_receipt_payload(
        self,
        sale: Sale,
        lines: Sequence[SaleLine] | None = None,
        payments: Sequence[dict[str, Any] | SalePayment] | None = None,
    ) -> ReceiptPayloadResponse:
        """Çıxış cavabı üçün qəbz strukturunu formalaşdırır."""
        lines_source = lines if lines is not None else getattr(sale, "lines", [])
        items = [
            ReceiptItemResponse(
                line_no=r_line.line_no,
                sku=r_line.sku,
                name=r_line.product_name,
                quantity=r_line.quantity,
                unit_price=r_line.unit_price,
                discount_amount=r_line.discount_amount,
                tax_rate=r_line.tax_rate,
                total_amount=r_line.total_amount,
            )
            for r_line in lines_source
        ]

        raw_payments = payments if payments is not None else getattr(sale, "payments", [])
        payment_items: list[dict[str, Any]] = []
        for p in raw_payments:
            if isinstance(p, dict):
                payment_items.append(p)
            else:
                payment_items.append(
                    {
                        "tender_type": p.tender_type,
                        "amount": str(p.amount),
                        "tendered_amount": str(p.tendered_amount),
                        "change_amount": str(p.change_amount),
                        "approval_code": p.approval_code,
                        "masked_reference": p.masked_reference,
                    }
                )

        # QR kod məlumatı (Çək nömrəsi, tarix və yekun məbləğ)
        qr_data = f"BH|{sale.receipt_no}|{sale.business_date.isoformat()}|{sale.grand_total}|AZN"

        return ReceiptPayloadResponse(
            sale_id=sale.id,
            receipt_no=sale.receipt_no,
            business_date=sale.business_date,
            created_at=sale.created_at,
            branch_id=sale.branch_id,
            register_id=sale.register_id,
            cashier_id=sale.cashier_id,
            subtotal=sale.subtotal,
            discount_total=sale.discount_total,
            tax_total=sale.tax_total,
            grand_total=sale.grand_total,
            paid_amount=sale.paid_amount,
            change_amount=sale.change_amount,
            currency=sale.currency,
            payments=payment_items,
            items=items,
            qr_code_data=qr_data,
            fiscal_status="NOT_CONFIGURED",
            fiscal_doc_id=None,
        )


def get_pos_service() -> PosService:
    return PosService()
