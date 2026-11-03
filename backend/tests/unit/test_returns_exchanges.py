"""Qaytarmalar Modulu: Mübadilə (Exchanges) Əməliyyatları Testləri (Returns & Exchanges).

1. Tək tranzaksiyada atomiklik: Yeni satışın stok çatışmazlığı qaytarma hissəsini də tam rollback edir.
2. Qiymət fərqi: Müştərinin əlavə ödəniş etməsi (Yeni > Qaytarma).
3. Qiymət fərqi: Müştəriyə geri pul/kredit ödənilməsi (Yeni < Qaytarma).
4. Neytral mübadilə (Ölçü/rəng dəyişimi, qiymət tam bərabərdir).
5. Əlaqəli sənədlər (exchange_group_id) və fərdi ləğvin bloklanması (EXCHANGE_PAIR_LOCKED).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import BusinessRuleViolationError, InsufficientStockError
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
from app.modules.pos.schemas import (
    CartLineInput,
    SaleCheckoutRequest,
    ShiftOpenRequest,
    TenderPaymentInput,
)
from app.modules.pos.service import PosService
from app.modules.returns.models import SaleReturn
from app.modules.returns.schemas import (
    ExchangeCreateRequest,
    ExchangeLineInput,
    ReturnLineInput,
)
from app.modules.returns.service import ReturnsService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


@pytest.mark.asyncio
async def test_returns_exchange_neutral_swap_and_pair_lock() -> None:
    """Neytral mübadilə (Ölçü dəyişimi, qiymətlər bərabərdir) və cütlüyün fərdi ləğvinin bloklanması."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code="B-EXCH",
            name="Filial Mübadilə",
            address="Bakı ş., 28 May",
            phone="+994125550060",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(code="WH-EXCH", name="Anbar", branch_id=branch.id),
    )
    admin = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="a@ex.az",
        full_name="Admin",
        roles=["system_admin"],
        permissions=[],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    reg_svc = CashRegisterService()
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-EX", name="Kassa"
        ),
        actor=admin,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Ayaqqabı", code="CAT-SH"), company_id=company.id, actor=admin
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="İdman Ayaqqabısı",
            internal_code="PRD-SNEAK",
            category_id=cat.id,
            section="Kişi",
            type="Ayaqqabı",
        ),
        company_id=company.id,
        actor=admin,
    )

    # 41 ölçü və 42 ölçü: hər ikisi 120.00 AZN
    var41 = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku="SNEAK-41", barcode="41001", size="41", price_override=Decimal("120.00")
        ),
        actor=admin,
    )
    var42 = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku="SNEAK-42", barcode="42002", size="42", price_override=Decimal("120.00")
        ),
        actor=admin,
    )

    inv_svc = InventoryService()
    async with UnitOfWork() as uow:
        await inv_svc.post(
            session=uow.session,
            company_id=company.id,
            movements=[
                MovementDraft(
                    variant_id=var41.id,
                    quantity=5,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("50.0000"),
                ),
                MovementDraft(
                    variant_id=var42.id,
                    quantity=5,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("50.0000"),
                ),
            ],
            user_id=admin.id,
            actor=admin,
        )
        await uow.commit()

    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_ex",
        email="c@ex.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=[
            "pos.shift.open",
            "pos.sale.create",
            "pos.sale.cancel",
            "returns.create",
            "returns.exchange",
            "returns.refund.cash",
        ],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(
            register_id=register.id,
            opening_cash=Decimal("200.00"),
            mismatch_reason="İlkin növbə qalığı",
        ),
        company_id=company.id,
        actor=cashier,
    )

    # İlkin olaraq 41 ölçü satılır
    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=var41.id, quantity=1)],
        expected_grand_total=Decimal("120.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash", amount=Decimal("120.00"), tendered_amount=Decimal("120.00")
            )
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-ex-{uuid.uuid4().hex}",
        actor=cashier,
    )

    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None
        sale_line = sale.lines[0]

    ret_svc = ReturnsService()

    # Mübadilə sorğusu: 41 ölçü qaytarılır, 42 ölçü verilir. Fərq: 0.00 AZN (Neytral)
    ex_req = ExchangeCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        return_items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=var41.id,
                quantity=1,
                reason_code="WRONG_SIZE",
            )
        ],
        new_sale_items=[ExchangeLineInput(variant_id=var42.id, quantity=1)],
        expected_net_difference=Decimal("0.00"),
    )
    res = await ret_svc.create_exchange(
        company_id=company.id,
        request=ex_req,
        actor=cashier,
        idempotency_key=f"exch-key-{uuid.uuid4().hex}",
    )

    exchange_group_id = res["exchange_group_id"]
    assert res["net_difference"] == Decimal("0.00")

    # Stokları yoxlayırıq:
    # 41 ölçü: 5 idi, 1 satıldı (4 qaldı), indi geri qayıtdı -> Yenidən 5 oldu!
    # 42 ölçü: 5 idi, indi 1 satıldı -> 4 qaldı!
    bal41 = await inv_svc.get_single_balance(warehouse.id, var41.id)
    bal42 = await inv_svc.get_single_balance(warehouse.id, var42.id)
    assert bal41 is not None and bal41["on_hand"] == 5
    assert bal42 is not None and bal42["on_hand"] == 4

    # İndi cütlüyün fərdi ləğvini yoxlayırıq:
    # Yeni satış sənədini tapırıq
    new_sale_receipt_no = res["new_sale_receipt"].receipt_no
    async with UnitOfWork() as uow:
        new_sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, new_sale_receipt_no)
        assert new_sale is not None
        assert new_sale.exchange_group_id == exchange_group_id

    # Kassir bu satışı təkbaşına cancel_sale ilə ləğv etməyə çalışır -> EXCHANGE_PAIR_LOCKED
    with pytest.raises(BusinessRuleViolationError) as exc_lock:
        await pos_svc.cancel_sale(
            sale_id=new_sale.id,
            reason="Mübadiləni təklikdə ləğv etməyə cəhd",
            manager_approval_token=None,
            actor=cashier,
        )
    assert exc_lock.value.code == "EXCHANGE_PAIR_LOCKED"


@pytest.mark.asyncio
async def test_returns_exchange_rollback_on_stock_failure() -> None:
    """Mübadilədə yeni məhsulun stoku çatışmadıqda bütün tranzaksiya (qaytarma daxil) rollback olur."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code="B-EXRB",
            name="Filial Rollback",
            address="Bakı ş., 28 May 2",
            phone="+994125550070",
        ),
    )
    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(code="WH-EXRB", name="Anbar", branch_id=branch.id),
    )
    admin = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin",
        email="a@rb.az",
        full_name="Admin",
        roles=["system_admin"],
        permissions=[],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    reg_svc = CashRegisterService()
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-RB", name="Kassa"
        ),
        actor=admin,
    )
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Rollback", code="CAT-RB"), company_id=company.id, actor=admin
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Məhsul RB",
            internal_code="PRD-RB",
            category_id=cat.id,
            section="Kişi",
            type="Geyim",
        ),
        company_id=company.id,
        actor=admin,
    )

    varA = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku="VAR-A", barcode="1111", size="A", price_override=Decimal("80.00")
        ),
        actor=admin,
    )
    # varB-nin stoku 0 olacaq (anbarda yoxdur!)
    varB = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku="VAR-B", barcode="2222", size="B", price_override=Decimal("80.00")
        ),
        actor=admin,
    )

    inv_svc = InventoryService()
    async with UnitOfWork() as uow:
        await inv_svc.post(
            session=uow.session,
            company_id=company.id,
            movements=[
                MovementDraft(
                    variant_id=varA.id,
                    quantity=2,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("30.0000"),
                )
            ],
            user_id=admin.id,
            actor=admin,
        )
        await uow.commit()

    cashier = AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_rb",
        email="c@rb.az",
        full_name="Kassir",
        roles=["cashier", "branch_manager"],
        permissions=[
            "pos.shift.open",
            "pos.sale.create",
            "pos.sale.cancel",
            "returns.create",
            "returns.exchange",
            "returns.refund.cash",
        ],
        allowed_branches=[branch.id],
        session_id=uuid.uuid4(),
    )
    pos_svc = PosService()
    shift = await pos_svc.open_shift(
        request=ShiftOpenRequest(register_id=register.id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=cashier,
    )

    checkout_req = SaleCheckoutRequest(
        register_id=register.id,
        shift_id=shift.id,
        items=[CartLineInput(variant_id=varA.id, quantity=1)],
        expected_grand_total=Decimal("80.00"),
        payments=[
            TenderPaymentInput(
                tender_type="cash", amount=Decimal("80.00"), tendered_amount=Decimal("80.00")
            )
        ],
    )
    receipt = await pos_svc.checkout(
        request=checkout_req,
        company_id=company.id,
        idempotency_key=f"sale-rb-{uuid.uuid4().hex}",
        actor=cashier,
    )

    async with UnitOfWork() as uow:
        sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert sale is not None
        sale_line = sale.lines[0]

    ret_svc = ReturnsService()

    # Mübadiləyə cəhd: varA qaytarılır, stokda olmayan varB tələb edilir!
    ex_req_fail = ExchangeCreateRequest(
        original_sale_id=sale.id,
        register_id=register.id,
        shift_id=shift.id,
        return_items=[
            ReturnLineInput(
                original_sale_line_id=sale_line.id,
                variant_id=varA.id,
                quantity=1,
                reason_code="CHANGED_MIND",
            )
        ],
        new_sale_items=[ExchangeLineInput(variant_id=varB.id, quantity=1)],
        expected_net_difference=Decimal("0.00"),
    )

    with pytest.raises(InsufficientStockError):
        await ret_svc.create_exchange(
            company_id=company.id,
            request=ex_req_fail,
            actor=cashier,
            idempotency_key=f"exch-fail-{uuid.uuid4().hex}",
        )

    # Rollback yoxlanışı: Heç bir qaytarma sənədi yaranmamalıdır, satış COMPLETED qalmalıdır
    async with UnitOfWork() as uow:
        stmt_ret = select(SaleReturn).where(SaleReturn.original_sale_id == sale.id)
        res_ret = await uow.session.execute(stmt_ret)
        assert res_ret.scalar_one_or_none() is None

        re_sale = await pos_svc.sales_repo.get_sale_by_receipt_no(uow.session, receipt.receipt_no)
        assert re_sale is not None
        assert re_sale.status == "COMPLETED"
