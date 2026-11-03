"""Satınalma və Təchizat Əməliyyatları Vahid Testləri (Purchasing Workflow Tests).

Purchase Request -> Approval -> Purchase Order -> Goods Receipt -> Supplier Invoice -> Payment
Partial deliveries, Three-Way Match, Landed Cost, Purchase Return, and Payables Aging.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import BusinessRuleViolationError
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.policies import AuthenticatedUser
from app.modules.catalog.models import ProductVariant
from app.modules.catalog.schemas import (
    CategoryCreate,
    ProductCreate,
    VariantMatrixGenerateRequest,
)
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service
from app.modules.inventory.models import StockStatus
from app.modules.inventory.service import InventoryService
from app.modules.purchasing.models import (
    GoodsReceiptStatus,
    PaymentStatus,
    PurchaseOrderStatus,
    PurchaseRequestStatus,
    SupplierInvoiceStatus,
)
from app.modules.purchasing.schemas import (
    GoodsReceiptCreate,
    GoodsReceiptLineCreate,
    PaymentAllocationCreate,
    PORevisionCreate,
    PurchaseOrderCreate,
    PurchaseOrderLineCreate,
    PurchaseRequestCreate,
    PurchaseRequestLineCreate,
    PurchaseReturnCreate,
    PurchaseReturnLineCreate,
    SupplierInvoiceCreate,
    SupplierInvoiceLineCreate,
    SupplierPaymentCreate,
)
from app.modules.purchasing.service import PurchasingService
from app.modules.suppliers.schemas import SupplierCreate
from app.modules.suppliers.service import SupplierService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_purchasing_admin() -> AuthenticatedUser:
    """Tam hüquqlu satınalma və anbar inzibatçısı."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="purchasing_admin",
        email="purchasing_admin@brandhouse.az",
        full_name="Satınalma Rəhbəri",
        roles=["system_admin", "procurement_manager", "finance_manager"],
        permissions=[
            "purchasing.request.create",
            "purchasing.request.approve",
            "purchasing.order.create",
            "purchasing.order.approve",
            "purchasing.order.send",
            "purchasing.order.cancel",
            "purchasing.receipt.confirm",
            "purchasing.receipt.reverse",
            "purchasing.invoice.approve",
            "purchasing.invoice.override_match",
            "purchasing.payment.create",
            "purchasing.payment.approve",
            "purchasing.cost.view",
            "suppliers.manage",
            "suppliers.bank.view",
            "inventory.ledger.view",
            "inventory.balance.view",
            "inventory.adjust",
            "catalog.product.manage",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


async def setup_purchasing_context() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID]:
    """Test üçün zəruri olan Şirkət, Anbar, Təchizatçı və Məhsul Variantını formalaşdırır."""
    company = await get_company_service().get_company()
    actor = get_purchasing_admin()

    # 1. Anbar
    wh_svc = WarehouseService()
    wh = await wh_svc.create_warehouse(
        WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}",
            name="Mərkəzi Qəbul Anbarı",
            warehouse_type="central",
        ),
        company_id=company.id,
        actor=actor,
    )

    # 2. Təchizatçı
    sup_svc = SupplierService()
    sup = await sup_svc.create_supplier(
        company.id,
        SupplierCreate(
            code=f"SUP-{uuid.uuid4().hex[:4].upper()}",
            name="Global Textile LTD",
            tax_id=f"99{uuid.uuid4().hex[:8]}",
            payment_terms_days=30,
            default_currency="AZN",
        ),
        actor=actor,
    )

    # 3. Kataloq və Variant
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        CategoryCreate(name="Kişi Köynəkləri", code=f"c_{uuid.uuid4().hex[:4]}", level=1),
        company_id=company.id,
        actor=actor,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"PO-PRD-{uuid.uuid4().hex[:4].upper()}",
            name="Premium Pambıq Köynək",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=actor,
    )
    await cat_svc.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["L"],
            colors=["Mavi"],
            dry_run=False,
            default_price=Decimal("80.00"),
            default_cost=Decimal("35.00"),
        ),
        actor=actor,
    )

    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(ProductVariant).where(ProductVariant.product_id == prod.id)
        )
        variant = res.scalars().first()
        assert variant is not None
        variant_id = variant.id

    return company.id, wh.id, sup.id, variant_id


@pytest.mark.asyncio
async def test_purchase_request_lifecycle_and_reorder_suggestions():
    """Satınalma sorğusu həyat dövrü (Draft -> Submit -> Auto-Approve) və təchizat təklifləri."""
    company_id, wh_id, sup_id, variant_id = await setup_purchasing_context()
    actor = get_purchasing_admin()
    svc = PurchasingService()

    # 1. PR yaradılması
    pr = await svc.create_request(
        company_id=company_id,
        data=PurchaseRequestCreate(
            requesting_warehouse_id=wh_id,
            needed_by=date.today() + timedelta(days=14),
            reason="Mövsümi ehtiyatların artırılması",
            lines=[
                PurchaseRequestLineCreate(
                    variant_id=variant_id,
                    requested_qty=50,
                    estimated_unit_price=Decimal("32.50"),
                    notes="İlkin partiya",
                )
            ],
        ),
        actor=actor,
    )
    assert pr.id is not None
    assert pr.status == PurchaseRequestStatus.DRAFT.value
    assert pr.total_estimated_amount == Decimal("1625.0000")

    # 2. Təsdiqə göndərilmə (qayda olmadığı üçün birbaşa APPROVED olur)
    submitted_pr = await svc.submit_request(pr.id, actor=actor)
    assert submitted_pr.status in (
        PurchaseRequestStatus.APPROVED.value,
        PurchaseRequestStatus.SUBMITTED.value,
    )

    # 3. Təchizat təklifləri alqoritmi
    suggestions = await svc.get_reorder_suggestions(
        company_id=company_id,
        warehouse_id=wh_id,
        actor=actor,
    )
    assert suggestions.warehouse_id == wh_id


@pytest.mark.asyncio
async def test_purchase_order_lifecycle_and_revisions():
    """Satınalma sifarişi (PO) yaradılması, dəqiq server hesablaması, təsdiqi və reviziyası."""
    company_id, wh_id, sup_id, variant_id = await setup_purchasing_context()
    actor = get_purchasing_admin()
    svc = PurchasingService()

    # 1. PO yaradılması (100 ədəd x 35.00 AZN, 10% endirim, 18% ƏDV)
    po = await svc.create_po(
        company_id=company_id,
        data=PurchaseOrderCreate(
            supplier_id=sup_id,
            delivery_warehouse_id=wh_id,
            expected_date=date.today() + timedelta(days=7),
            payment_terms_days=30,
            lines=[
                PurchaseOrderLineCreate(
                    variant_id=variant_id,
                    quantity=100,
                    unit_price=Decimal("35.0000"),
                    discount_percent=Decimal("10.00"),
                    tax_rate=Decimal("18.00"),
                    notes="Standart tədarük",
                )
            ],
        ),
        actor=actor,
    )
    assert po.id is not None
    assert po.status == PurchaseOrderStatus.DRAFT.value
    assert po.subtotal == Decimal("3500.0000")
    assert po.discount_total == Decimal("350.0000")
    # Base after discount = 3150.00, Tax (18%) = 567.00, Total = 3717.00
    assert po.tax_total == Decimal("567.0000")
    assert po.total_amount == Decimal("3717.0000")

    # 2. PO təsdiqi və Təchizatçıya göndərilməsi
    approved_po = await svc.approve_po(po.id, actor=actor)
    assert approved_po.status == PurchaseOrderStatus.APPROVED.value

    sent_po = await svc.send_po(approved_po.id, actor=actor)
    assert sent_po.status == PurchaseOrderStatus.SENT.value

    # 3. PO Reviziyası (miqdarın 120-yə artırılması)
    revised_po = await svc.create_po_revision(
        po.id,
        PORevisionCreate(
            reason="Müştəri tələbatının artması",
            lines=[
                PurchaseOrderLineCreate(
                    variant_id=variant_id,
                    quantity=120,
                    unit_price=Decimal("35.0000"),
                    discount_percent=Decimal("10.00"),
                    tax_rate=Decimal("18.00"),
                )
            ],
        ),
        actor=actor,
    )
    assert revised_po.lines[0].quantity == 120
    assert len(revised_po.revisions) == 1
    assert revised_po.revisions[0].previous_total == Decimal("3717.0000")
    assert revised_po.status == PurchaseOrderStatus.PENDING_APPROVAL.value

    # Yenidən təsdiq edirik
    approved_again = await svc.approve_po(revised_po.id, actor=actor)
    assert approved_again.status == PurchaseOrderStatus.APPROVED.value


@pytest.mark.asyncio
async def test_goods_receipt_inventory_posting_and_tolerance():
    """Malların qəbul aktı (GR): inventara atomik daxilolma, zədəli malların ayrılması və dözümlülük."""
    company_id, wh_id, sup_id, variant_id = await setup_purchasing_context()
    actor = get_purchasing_admin()
    svc = PurchasingService()
    inv_svc = InventoryService()

    # 100 ədədlik PO yaradırıq və göndəririk
    po = await svc.create_po(
        company_id=company_id,
        data=PurchaseOrderCreate(
            supplier_id=sup_id,
            delivery_warehouse_id=wh_id,
            expected_date=date.today() + timedelta(days=7),
            lines=[
                PurchaseOrderLineCreate(
                    variant_id=variant_id,
                    quantity=100,
                    unit_price=Decimal("30.0000"),
                )
            ],
        ),
        actor=actor,
    )
    po = await svc.approve_po(po.id, actor=actor)
    po_line = po.lines[0]

    # Tolerans aşımı testi: 100 sifariş edilib, 120 qəbul etməyə cəhd (tolerans 5% = max 105)
    with pytest.raises(BusinessRuleViolationError):
        await svc.create_receipt(
            company_id=company_id,
            data=GoodsReceiptCreate(
                supplier_id=sup_id,
                warehouse_id=wh_id,
                po_id=po.id,
                delivery_note_number=f"DN-{uuid.uuid4().hex[:6]}",
                lines=[
                    GoodsReceiptLineCreate(
                        po_line_id=po_line.id,
                        variant_id=variant_id,
                        received_qty=120,
                        unit_cost=Decimal("30.0000"),
                    )
                ],
            ),
            actor=actor,
        )

    # Düzgün Qəbul: 60 ədəd gəlib (55 yararlı, 5 zədələnmiş) - Hissə-hissə tədarük
    dn_num = f"DN-{uuid.uuid4().hex[:6]}"
    receipt = await svc.create_receipt(
        company_id=company_id,
        data=GoodsReceiptCreate(
            supplier_id=sup_id,
            warehouse_id=wh_id,
            po_id=po.id,
            delivery_note_number=dn_num,
            lines=[
                GoodsReceiptLineCreate(
                    po_line_id=po_line.id,
                    variant_id=variant_id,
                    received_qty=60,
                    damaged_qty=5,
                    rejected_qty=0,
                    unit_cost=Decimal("30.0000"),
                )
            ],
        ),
        actor=actor,
    )
    assert receipt.status == GoodsReceiptStatus.DRAFT.value

    # Təsdiqləmə (Confirm Receipt) - İnventar Ledger-ə atomik yazılır
    confirmed_receipt = await svc.confirm_receipt(receipt.id, actor=actor)
    assert confirmed_receipt.status == GoodsReceiptStatus.CONFIRMED.value

    # İnventar qalıqlarını yoxlayırıq:
    # 55 ədəd AVAILABLE, 5 ədəd DAMAGED olmalıdır
    bal_avail = await inv_svc.get_single_balance(
        warehouse_id=wh_id,
        variant_id=variant_id,
        stock_status=StockStatus.AVAILABLE.value,
    )
    assert bal_avail is not None
    assert bal_avail["on_hand"] == 55

    bal_damaged = await inv_svc.get_single_balance(
        warehouse_id=wh_id,
        variant_id=variant_id,
        stock_status=StockStatus.DAMAGED.value,
    )
    assert bal_damaged is not None
    assert bal_damaged["on_hand"] == 5

    # PO statusu PARTIALLY_RECEIVED olmalıdır
    po_after = await svc.get_po(po.id)
    assert po_after.status == PurchaseOrderStatus.PARTIALLY_RECEIVED.value
    assert po_after.lines[0].received_qty == 60
    assert po_after.lines[0].outstanding_qty == 40


@pytest.mark.asyncio
async def test_three_way_match_invoice_approval_and_supplier_ledger():
    """3-Tərəfli Uyğunlaşma (PO vs GR vs Invoice) və Təchizatçı Jurnalına Borcun Yazılması."""
    company_id, wh_id, sup_id, variant_id = await setup_purchasing_context()
    actor = get_purchasing_admin()
    svc = PurchasingService()
    sup_svc = SupplierService()

    # 1. PO və GR prosesi (50 ədəd x 40.00 AZN)
    po = await svc.create_po(
        company_id=company_id,
        data=PurchaseOrderCreate(
            supplier_id=sup_id,
            delivery_warehouse_id=wh_id,
            expected_date=date.today() + timedelta(days=7),
            lines=[
                PurchaseOrderLineCreate(
                    variant_id=variant_id,
                    quantity=50,
                    unit_price=Decimal("40.0000"),
                    tax_rate=Decimal("0.00"),
                )
            ],
        ),
        actor=actor,
    )
    po = await svc.approve_po(po.id, actor=actor)
    po_line = po.lines[0]

    gr = await svc.create_receipt(
        company_id=company_id,
        data=GoodsReceiptCreate(
            supplier_id=sup_id,
            warehouse_id=wh_id,
            po_id=po.id,
            delivery_note_number=f"DN-{uuid.uuid4().hex[:6]}",
            lines=[
                GoodsReceiptLineCreate(
                    po_line_id=po_line.id,
                    variant_id=variant_id,
                    received_qty=50,
                    unit_cost=Decimal("40.0000"),
                )
            ],
        ),
        actor=actor,
    )
    gr = await svc.confirm_receipt(gr.id, actor=actor)
    gr_line = gr.lines[0]

    # 2. Fakturanın daxil edilməsi: Tam uyğun gələn (50 ədəd x 40.00 = 2000 AZN)
    inv = await svc.create_invoice(
        company_id=company_id,
        data=SupplierInvoiceCreate(
            supplier_id=sup_id,
            supplier_invoice_number=f"INV-{uuid.uuid4().hex[:6]}",
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            po_id=po.id,
            receipt_id=gr.id,
            lines=[
                SupplierInvoiceLineCreate(
                    po_line_id=po_line.id,
                    receipt_line_id=gr_line.id,
                    variant_id=variant_id,
                    quantity=50,
                    unit_price=Decimal("40.0000"),
                    tax_rate=Decimal("0.00"),
                )
            ],
        ),
        actor=actor,
    )
    assert inv.match_status == "MATCHED"
    assert inv.status == SupplierInvoiceStatus.DRAFT.value

    # Təchizatçının cari borcu hələ 0-dır (faktura hələ təsdiqlənməyib)
    assert await sup_svc.get_current_balance(sup_id) == Decimal("0.0000")

    # 3. Fakturanın təsdiqi (Approve for Payment) -> Jurnala yazılır
    approved_inv = await svc.approve_invoice(inv.id, actor=actor)
    assert approved_inv.status == SupplierInvoiceStatus.APPROVED_FOR_PAYMENT.value

    # İndi təchizatçının borcu dəqiq 2000.00 AZN olmalıdır
    assert await sup_svc.get_current_balance(sup_id) == Decimal("2000.0000")


@pytest.mark.asyncio
async def test_purchase_return_and_supplier_credit_note():
    """Təchizatçıya mal qaytarılması (Purchase Return): Stokdan çıxarış və Kredit Notası."""
    company_id, wh_id, sup_id, variant_id = await setup_purchasing_context()
    actor = get_purchasing_admin()
    svc = PurchasingService()
    inv_svc = InventoryService()
    sup_svc = SupplierService()

    # Əvvəlcə 20 ədəd x 50.00 AZN mal qəbul edirik
    gr = await svc.create_receipt(
        company_id=company_id,
        data=GoodsReceiptCreate(
            supplier_id=sup_id,
            warehouse_id=wh_id,
            delivery_note_number=f"DN-{uuid.uuid4().hex[:6]}",
            lines=[
                GoodsReceiptLineCreate(
                    variant_id=variant_id,
                    received_qty=20,
                    unit_cost=Decimal("50.0000"),
                )
            ],
        ),
        actor=actor,
    )
    gr = await svc.confirm_receipt(gr.id, actor=actor)

    # Fakturasını təsdiq edirik (+1000 AZN borc yaranır)
    inv = await svc.create_invoice(
        company_id=company_id,
        data=SupplierInvoiceCreate(
            supplier_id=sup_id,
            supplier_invoice_number=f"INV-RET-{uuid.uuid4().hex[:6]}",
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            receipt_id=gr.id,
            lines=[
                SupplierInvoiceLineCreate(
                    variant_id=variant_id,
                    quantity=20,
                    unit_price=Decimal("50.0000"),
                )
            ],
        ),
        actor=actor,
    )
    await svc.approve_invoice(inv.id, actor=actor)
    assert await sup_svc.get_current_balance(sup_id) == Decimal("1000.0000")

    # İndi 5 ədəd qüsurlu malı təchizatçıya qaytarırıq (5 x 50 = 250 AZN)
    pr_return = await svc.create_purchase_return(
        company_id=company_id,
        data=PurchaseReturnCreate(
            receipt_id=gr.id,
            reason_code="DEFECTIVE",
            lines=[
                PurchaseReturnLineCreate(
                    variant_id=variant_id,
                    quantity=5,
                )
            ],
            notes="Tikiş qüsuru səbəbindən qaytarıldı",
        ),
        actor=actor,
    )
    assert pr_return.status == "CONFIRMED"
    assert pr_return.total_amount == Decimal("250.0000")

    # İnventarda qalıq 20 - 5 = 15 qalmalıdır
    avail = await inv_svc.get_single_balance(
        warehouse_id=wh_id,
        variant_id=variant_id,
        stock_status=StockStatus.AVAILABLE.value,
    )
    assert avail is not None
    assert avail["on_hand"] == 15

    # Təchizatçıya olan borc 1000 - 250 = 750 AZN-ə enməlidir (Kredit notası hesabına)
    assert await sup_svc.get_current_balance(sup_id) == Decimal("750.0000")


@pytest.mark.asyncio
async def test_supplier_payment_allocation_and_aging():
    """Təchizatçıya ödəniş, qaiməyə bölüşdürülməsi və Payables Aging hesabatı."""
    company_id, wh_id, sup_id, variant_id = await setup_purchasing_context()
    actor = get_purchasing_admin()
    svc = PurchasingService()
    sup_svc = SupplierService()

    # 1. İki qaimə yaradırıq: INV1 = 600 AZN (vaxtı keçmiş), INV2 = 400 AZN (cari)
    inv1 = await svc.create_invoice(
        company_id=company_id,
        data=SupplierInvoiceCreate(
            supplier_id=sup_id,
            supplier_invoice_number=f"INV-P1-{uuid.uuid4().hex[:6]}",
            invoice_date=date.today() - timedelta(days=40),
            due_date=date.today() - timedelta(days=10),  # 10 gün gecikib
            lines=[
                SupplierInvoiceLineCreate(
                    variant_id=variant_id,
                    quantity=6,
                    unit_price=Decimal("100.0000"),
                )
            ],
        ),
        actor=actor,
    )
    await svc.approve_invoice(inv1.id, actor=actor)

    inv2 = await svc.create_invoice(
        company_id=company_id,
        data=SupplierInvoiceCreate(
            supplier_id=sup_id,
            supplier_invoice_number=f"INV-P2-{uuid.uuid4().hex[:6]}",
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=20),  # cari
            lines=[
                SupplierInvoiceLineCreate(
                    variant_id=variant_id,
                    quantity=4,
                    unit_price=Decimal("100.0000"),
                )
            ],
        ),
        actor=actor,
    )
    await svc.approve_invoice(inv2.id, actor=actor)

    assert await sup_svc.get_current_balance(sup_id) == Decimal("1000.0000")

    # 2. Ödəniş edirik: 700 AZN (600 AZN INV1-in tam bağlanması, 100 AZN INV2-nin qismən bağlanması)
    payment = await svc.create_payment(
        company_id=company_id,
        data=SupplierPaymentCreate(
            supplier_id=sup_id,
            payment_method="bank_transfer",
            amount=Decimal("700.0000"),
            payment_date=date.today(),
            allocations=[
                PaymentAllocationCreate(invoice_id=inv1.id, allocated_amount=Decimal("600.0000")),
                PaymentAllocationCreate(invoice_id=inv2.id, allocated_amount=Decimal("100.0000")),
            ],
            notes="Bank köçürməsi ilə ödəniş",
        ),
        actor=actor,
    )
    assert payment.status == PaymentStatus.POSTED.value

    # Qalıq borc 1000 - 700 = 300 AZN qalmalıdır
    assert await sup_svc.get_current_balance(sup_id) == Decimal("300.0000")

    # Qaimə statusları: INV1 -> PAID, INV2 -> PARTIALLY_PAID
    inv1_after = await svc.get_invoice(inv1.id)
    assert inv1_after.status == SupplierInvoiceStatus.PAID.value

    inv2_after = await svc.get_invoice(inv2.id)
    assert inv2_after.status == SupplierInvoiceStatus.PARTIALLY_PAID.value
    assert inv2_after.paid_amount == Decimal("100.0000")

    # 3. Payables Aging hesabatı
    aging_rep = await svc.get_payables_aging(company_id=company_id, actor=actor)
    assert aging_rep.total_payables == Decimal("300.0000")
    # INV2-nin qalan 300 AZN-i cari dövrdədir
    assert aging_rep.aging.current == Decimal("300.0000")
    assert aging_rep.aging.days_1_30 == Decimal("0.0000")
