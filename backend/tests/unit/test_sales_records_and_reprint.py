"""Satış Sənədləri, Filtrləmə, Çap Təkrarı və Ləğv Vahid Testləri (Sales & Reprint Tests).

Bu test dəsti F7/B7 tələblərinə uyğun olaraq aşağıdakı əsas funksionallıqları yoxlayır:
1. Çoxölçülü axtarış və filtrləmə (Tarix, filial, kassa, kassir, ödəniş vasitəsi, status, məbləğ).
2. Maya dəyəri və marja məxfiliyi (sales.cost.view icazəsi olmadıqda sahələrin gizlədilməsi/None olması).
3. Çək təkrar çapı (Reprint): Məcburi səbəb, reprint_count sayğacının artması, SaleEvent qeydi, "NÜSXƏ / DUPLICATE COPY" su nişanı, ESC/POS və HTML formatı.
4. Eyni növbədə satışın ləğvi (Void Reversal): Stokun anbara qaytarılması (SALE_RETURN), statusun CANCELLED olması, SoD (kassir üçün menecer tokeni tələbi), bağlanmış növbədə ləğvin qadağan edilməsi.
5. Fırıldaqçılıq (Fraud) risk indikatorları aqreqasiyası.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import (
    BusinessRuleViolationError,
    ForbiddenError,
    ValidationError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.policies import AuthenticatedUser
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import BranchService
from app.modules.cash_registers.schemas import CashRegisterCreate
from app.modules.cash_registers.service import CashRegisterService
from app.modules.catalog.schemas import CategoryCreate, ProductCreate, ProductVariantCreate
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.pos.policies import PosPolicy
from app.modules.pos.schemas import (
    CartLineInput,
    SaleCheckoutRequest,
    ShiftCloseRequest,
    ShiftOpenRequest,
    TenderPaymentInput,
)
from app.modules.pos.service import PosService
from app.modules.sales.models import SaleEvent
from app.modules.sales.schemas import SaleFilterParams
from app.modules.sales.service import SalesService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_user_with_perms(
    role: str, perms: list[str], branch_id: uuid.UUID | None = None
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=f"user_{role}_{uuid.uuid4().hex[:4]}",
        email=f"{role}_{uuid.uuid4().hex[:4]}@brandhouse.az",
        full_name=f"İstifadəçi {role.title()}",
        roles=[role],
        permissions=perms,
        allowed_branches=[branch_id] if branch_id else [],
        session_id=uuid.uuid4(),
    )


async def setup_sales_fixture() -> dict:
    """Satış testləri üçün hazır POS infrastrukturu və tamamlanmış satış sənədi yaradır."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Park Bulvar Filialı",
            address="Neftçilər pr. 78",
            phone="+994125550120",
        ),
    )

    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}",
            name="Park Bulvar Anbarı",
            warehouse_type="branch",
            branch_id=branch.id,
        ),
    )

    reg_svc = CashRegisterService()
    admin_actor = get_user_with_perms(
        "system_admin", ["registers.register.manage", "catalog.product.manage"]
    )
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id,
            default_warehouse_id=warehouse.id,
            code=f"REG-{uuid.uuid4().hex[:4].upper()}",
            name="Kassa 1",
        ),
        actor=admin_actor,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(
            name=f"Aksesuar-{uuid.uuid4().hex[:4]}",
            code=f"CAT-{uuid.uuid4().hex[:4].upper()}",
            level=1,
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    prod = await cat_svc.create_product(
        data=ProductCreate(
            name=f"Dəri Kəmər {uuid.uuid4().hex[:4]}",
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            section="Uniseks",
            type="Aksesuar",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    variant = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku=f"SKU-{uuid.uuid4().hex[:8].upper()}",
            barcode=f"476{uuid.uuid4().hex[:9]}",
            size="M",
            color="Qəhvəyi",
            price_override=Decimal("60.00"),
        ),
        actor=admin_actor,
    )

    # 10 ədəd stok mədaxili (@ 25.00 AZN maya dəyəri ilə)
    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(
                variant_id=variant.id,
                to_warehouse_id=warehouse.id,
                quantity=10,
                movement_type="RECEIPT",
                reference_type="stock_document",
                unit_cost=Decimal("25.0000"),
            )
        ],
        actor=admin_actor,
    )

    # Kassir növbə açır və satış icra edir: 1 ədəd x 60.00 AZN
    cashier = get_user_with_perms(
        "cashier",
        ["pos.shift.open", "pos.shift.close", "pos.sale.create", "pos.sale.reprint", "sales.view"],
        branch.id,
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=cashier,
    )

    receipt = await pos_svc.checkout(
        request=SaleCheckoutRequest(
            shift_id=shift.id,
            register_id=register.id,
            items=[CartLineInput(variant_id=variant.id, quantity=1)],
            expected_grand_total=Decimal("60.00"),
            payments=[TenderPaymentInput(tender_type="cash", amount=Decimal("60.00"))],
        ),
        company_id=company.id,
        idempotency_key=f"chk-{uuid.uuid4().hex}",
        actor=cashier,
    )

    return {
        "company": company,
        "branch": branch,
        "warehouse": warehouse,
        "register": register,
        "variant": variant,
        "cashier": cashier,
        "shift": shift,
        "receipt": receipt,
        "admin_actor": admin_actor,
    }


@pytest.mark.asyncio
async def test_sales_multi_filter_search() -> None:
    """Satışların çoxmeyarlı axtarışı və filtrlənməsi."""
    fixture = await setup_sales_fixture()
    branch = fixture["branch"]
    register = fixture["register"]
    cashier = fixture["cashier"]
    receipt = fixture["receipt"]

    sales_svc = SalesService()

    # 1. Filial və kassa üzrə axtarış
    res = await sales_svc.search_sales(
        filters=SaleFilterParams(branch_id=branch.id, register_id=register.id),
        actor=cashier,
    )
    assert res.total >= 1
    assert any(s.receipt_no == receipt.receipt_no for s in res.items)

    # 2. Qəbz nömrəsi üzrə dəqiq axtarış
    by_receipt = await sales_svc.get_sale_by_receipt_no(receipt.receipt_no, actor=cashier)
    assert by_receipt.id == receipt.sale_id
    assert by_receipt.grand_total == Decimal("60.00")

    # 3. Status üzrə filter
    completed_sales = await sales_svc.search_sales(
        filters=SaleFilterParams(status="COMPLETED"),
        actor=cashier,
    )
    assert any(s.receipt_no == receipt.receipt_no for s in completed_sales.items)

    cancelled_sales = await sales_svc.search_sales(
        filters=SaleFilterParams(status="CANCELLED"),
        actor=cashier,
    )
    assert not any(s.receipt_no == receipt.receipt_no for s in cancelled_sales.items)


@pytest.mark.asyncio
async def test_sales_cost_and_margin_permission_gating() -> None:
    """Maya dəyəri və marja məlumatlarının icazəyə görə gizlədilməsi (sales.cost.view)."""
    fixture = await setup_sales_fixture()
    branch = fixture["branch"]
    receipt = fixture["receipt"]

    sales_svc = SalesService()

    # 1. Kassir (sales.cost.view YOXDUR): Maya dəyəri və marja sahələri None qaytarılmalıdır
    cashier_no_cost = get_user_with_perms("cashier", ["sales.view"], branch.id)
    sale_resp = await sales_svc.get_sale_by_id(receipt.sale_id, actor=cashier_no_cost)
    assert sale_resp.cost_total is None
    assert sale_resp.margin_amount is None
    assert sale_resp.lines[0].cost_price is None

    # 2. Menecer / Admin (sales.cost.view VAR): Real maya dəyəri və marja görünməlidir
    manager_with_cost = get_user_with_perms(
        "branch_manager", ["sales.view", "sales.cost.view"], branch.id
    )
    sale_resp_mgr = await sales_svc.get_sale_by_id(receipt.sale_id, actor=manager_with_cost)
    assert sale_resp_mgr.cost_total == Decimal("25.00")
    # Marja = 60.00 - 25.00 = 35.00 AZN
    assert sale_resp_mgr.margin_amount == Decimal("35.00")
    assert sale_resp_mgr.lines[0].cost_price == Decimal("25.0000")


@pytest.mark.asyncio
async def test_sales_receipt_reprint_workflow() -> None:
    """Çək təkrar çapı (Reprint): Səbəb tələbi, sayğac artımı, SaleEvent qeydiyyatı və NÜSXƏ su nişanı."""
    fixture = await setup_sales_fixture()
    branch = fixture["branch"]
    receipt = fixture["receipt"]
    cashier = fixture["cashier"]

    sales_svc = SalesService()

    # 1. Səbəbsiz təkrar çap qadağandır
    with pytest.raises(ValidationError):
        await sales_svc.reprint_receipt(
            sale_id=receipt.sale_id,
            reason="   ",  # Boş səbəb
            actor=cashier,
        )

    # 2. İcazəsiz təkrar çap qadağandır (pos.sale.reprint hüququ olmayan istifadəçi)
    unauthorized_user = get_user_with_perms("guest", ["sales.view"], branch.id)
    with pytest.raises(ForbiddenError):
        await sales_svc.reprint_receipt(
            sale_id=receipt.sale_id,
            reason="Müştəri qəbzi itirib",
            actor=unauthorized_user,
        )

    # 3. Uğurlu təkrar çap
    reprint_res = await sales_svc.reprint_receipt(
        sale_id=receipt.sale_id,
        reason="Müştəri kağız nüsxə istədi",
        actor=cashier,
    )

    assert reprint_res.reprint_number == 1
    assert "NÜSXƏ / DUPLICATE COPY" in reprint_res.html_receipt
    assert reprint_res.receipt_no == receipt.receipt_no
    assert len(reprint_res.esc_pos_bytes_base64) > 0

    # 4. İkinci dəfə təkrar çap -> reprint_count == 2
    reprint_res2 = await sales_svc.reprint_receipt(
        sale_id=receipt.sale_id,
        reason="Mühasibatlıq üçün əlavə nüsxə",
        actor=cashier,
    )
    assert reprint_res2.reprint_number == 2

    # 5. Verilənlər bazasında SaleEvent qeydlərinin yoxlanışı
    async with UnitOfWork() as uow:
        events_stmt = (
            select(SaleEvent)
            .where(
                SaleEvent.sale_id == receipt.sale_id,
                SaleEvent.event_type == "REPRINTED",
            )
            .order_by(SaleEvent.created_at.asc())
        )
        events = (await uow.session.execute(events_stmt)).scalars().all()
        assert len(events) == 2
        assert events[0].reason == "Müştəri kağız nüsxə istədi"
        assert events[1].reason == "Mühasibatlıq üçün əlavə nüsxə"


@pytest.mark.asyncio
async def test_pos_same_shift_sale_cancel_and_stock_reversal() -> None:
    """Eyni növbədə satışın ləğvi (Void): Stokun geri qaytarılması və menecer tokeni tələbi."""
    fixture = await setup_sales_fixture()
    branch = fixture["branch"]
    warehouse = fixture["warehouse"]
    variant = fixture["variant"]
    receipt = fixture["receipt"]

    inv_svc = InventoryService()
    pos_svc = PosService()

    # Satışdan dərhal sonra stok: 10 idi, 1 satıldı -> 9 qalıb
    bal_before = await inv_svc.get_single_balance(warehouse.id, variant.id)
    assert bal_before is not None
    assert bal_before["on_hand"] == 9

    # Kassir birbaşa ləğv etməyə çalışır (pos.sale.cancel icazəsi yoxdur və menecer tokeni təqdim etməyib)
    cashier_no_cancel = get_user_with_perms("cashier", ["pos.sale.create"], branch.id)
    with pytest.raises(ForbiddenError):
        await pos_svc.cancel_sale(
            sale_id=receipt.sale_id,
            reason="Müştəri fikrindən daşındı",
            manager_approval_token=None,
            actor=cashier_no_cancel,
        )

    # Filial meneceri təsdiq tokeni yaradır (pos.sale.cancel üçün)
    mgr = get_user_with_perms("branch_manager", ["pos.sale.cancel"], branch.id)
    token = PosPolicy.create_manager_approval_token(
        manager_id=mgr.id,
        action="pos.sale.cancel",
        branch_id=branch.id,
    )

    # Kassir menecer tokeni ilə satışı ləğv edir
    cancelled_sale = await pos_svc.cancel_sale(
        sale_id=receipt.sale_id,
        reason="Müştəri dərhal kassadan ayrılmadan qaytardı",
        manager_approval_token=token,
        actor=cashier_no_cancel,
    )

    assert cancelled_sale.status == "CANCELLED"
    assert cancelled_sale.cancellation_reason == "Müştəri dərhal kassadan ayrılmadan qaytardı"

    # Stok dərhal kompensasiya hərəkəti ilə bərpa olunmalıdır: 9 + 1 = 10
    bal_after = await inv_svc.get_single_balance(warehouse.id, variant.id)
    assert bal_after is not None
    assert bal_after["on_hand"] == 10

    # Tokenin təkrar istifadəsi (Replay) qadağan edilməlidir
    with pytest.raises(BusinessRuleViolationError):
        await pos_svc.cancel_sale(
            sale_id=receipt.sale_id,
            reason="Yenidən ləğv cəhdi",
            manager_approval_token=token,
            actor=cashier_no_cancel,
        )


@pytest.mark.asyncio
async def test_pos_cancel_rejected_after_shift_close() -> None:
    """Növbə bağlandıqdan sonra kassa ləğvi qadağandır (yalnız qaytarış - RETURN sənədi tələb olunur)."""
    fixture = await setup_sales_fixture()
    branch = fixture["branch"]
    receipt = fixture["receipt"]
    shift = fixture["shift"]
    cashier = fixture["cashier"]

    pos_svc = PosService()

    # Növbəni bağlayırıq (60 AZN nağd satış + 100 AZN float = 160 AZN)
    close_req = ShiftCloseRequest(
        counted_cash=Decimal("160.00"),
        closing_notes="Günün sonu",
    )
    await pos_svc.close_shift(shift.id, close_req, actor=cashier)

    # İndi ləğv etməyə cəhd edirik
    mgr = get_user_with_perms("branch_manager", ["pos.sale.cancel"], branch.id)
    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await pos_svc.cancel_sale(
            sale_id=receipt.sale_id,
            reason="Bağlanmış növbədə ləğv cəhdi",
            manager_approval_token=None,
            actor=mgr,
        )

    assert exc_info.value.code == "SHIFT_CLOSED_CANCELLATION_FORBIDDEN"


@pytest.mark.asyncio
async def test_pos_cashier_fraud_indicators() -> None:
    """Kassirlər üzrə risk və anomaliya göstəricilərinin aqreqasiyası (Void faizi, endirim faizi, kassa kəsiri)."""
    fixture = await setup_sales_fixture()
    branch = fixture["branch"]
    cashier = fixture["cashier"]

    pos_svc = PosService()

    today = fixture["receipt"].business_date
    indicators = await pos_svc.get_fraud_indicators(
        branch_id=branch.id,
        start_date=today,
        end_date=today,
        actor=cashier,
    )

    assert indicators.branch_id == branch.id
    assert indicators.period_start == today
    assert indicators.period_end == today
    assert isinstance(indicators.cashier_metrics, list)
    assert len(indicators.cashier_metrics) >= 1
    m = indicators.cashier_metrics[0]
    assert m.cashier_id == cashier.id
    assert m.total_sales >= 1
    assert m.cancelled_sales == 0
