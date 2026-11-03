"""Anbarlararası və Filiallararası Transferlər Vahid Testləri (Transfers Workflow)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.errors import TransferInvalidTransitionError
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
from app.modules.inventory.models import MovementType, StockStatus
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.transfers.models import TransferStatus
from app.modules.transfers.schemas import (
    TransferCreate,
    TransferDispatchRequest,
    TransferLineCreate,
    TransferPickLine,
    TransferPickRequest,
    TransferReceiveLine,
    TransferReceiveRequest,
)
from app.modules.transfers.service import TransfersService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService
from app.shared.outbox import OutboxEvent


def get_transfer_admin() -> AuthenticatedUser:
    """Tam hüquqlu transfer meneceri / admin istifadəçisi."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="transfer_admin",
        email="transfer_admin@brandhouse.az",
        full_name="Transfer Meneceri",
        roles=["system_admin", "general_manager"],
        permissions=[
            "inventory.ledger.view",
            "inventory.balance.view",
            "inventory.adjust",
            "inventory.negative.override",
            "inventory.documents.manage",
            "inventory.documents.confirm",
            "inventory.documents.reverse",
            "inventory.count.manage",
            "inventory.valuation.view",
            "transfers.manage",
            "transfers.approve",
            "transfers.dispatch",
            "transfers.receive",
            "transfers.cancel",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


async def setup_transfer_test_data() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID]:
    """Test üçün zəruri olan Şirkət, Göndərən Anbar, Təyinat Anbarı və Məhsul Variantını yaradır."""
    company = await get_company_service().get_company()
    actor = get_transfer_admin()
    wh_svc = WarehouseService()

    # Göndərən anbar
    src_wh = await wh_svc.create_warehouse(
        WarehouseCreate(
            code=f"SRC_{uuid.uuid4().hex[:6].upper()}",
            name="Mərkəzi Göndərən Anbar",
            warehouse_type="central",
        ),
        company_id=company.id,
        actor=actor,
    )

    # Təyinat anbarı
    dst_wh = await wh_svc.create_warehouse(
        WarehouseCreate(
            code=f"DST_{uuid.uuid4().hex[:6].upper()}",
            name="Filial Qəbul Anbarı",
            warehouse_type="branch",
        ),
        company_id=company.id,
        actor=actor,
    )

    # Kataloq və variant
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        CategoryCreate(name="Kişi Geyimləri", code=f"cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=company.id,
        actor=actor,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"TR-PRD-{uuid.uuid4().hex[:6].upper()}",
            name="Mövsümi Kurtka",
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
            sizes=["XL"],
            colors=["Qara"],
            dry_run=False,
            default_price=Decimal("120.00"),
            default_cost=Decimal("60.00"),
        ),
        actor=actor,
    )

    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(ProductVariant).where(ProductVariant.product_id == prod.id)
        )
        variant = res.scalars().first()
        assert variant is not None
        return company.id, src_wh.id, dst_wh.id, variant.id


@pytest.mark.asyncio
async def test_transfer_full_lifecycle_and_ledger_movements() -> None:
    """Transferin tam dövriyyəsi: DRAFT -> SUBMITTED -> APPROVED -> PICKING -> IN_TRANSIT -> RECEIVED."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_transfer_test_data()
    inv_service = InventoryService()
    tr_service = TransfersService()
    actor = get_transfer_admin()

    # 1. Göndərən anbara 100 ədəd ilkin mədaxil edirik
    await inv_service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=100,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=src_wh_id,
                to_status=StockStatus.AVAILABLE.value,
                reference_type="test_receipt",
                notes="İlkin stok",
            )
        ],
        actor=actor,
    )

    # 2. Transfer yaradırıq (DRAFT) - 20 ədəd
    create_dto = TransferCreate(
        source_warehouse_id=src_wh_id,
        destination_warehouse_id=dst_wh_id,
        lines=[TransferLineCreate(variant_id=var_id, requested_qty=20, notes="Təcili transfer")],
        notes="28 May filialı üçün sifariş",
    )
    transfer = await tr_service.create_transfer(company_id=company_id, data=create_dto, actor=actor)
    assert transfer.status == TransferStatus.DRAFT.value
    assert transfer.total_requested_qty == 20
    assert len(transfer.lines) == 1
    transfer_line_id = transfer.lines[0].id

    # 3. Təsdiqə göndəririk (SUBMITTED)
    transfer = await tr_service.submit_transfer(transfer.id, actor=actor)
    assert transfer.status == TransferStatus.SUBMITTED.value

    # 4. Təsdiqləyirik (APPROVED) -> Rezervasiya yaranmalıdır
    transfer = await tr_service.approve_transfer(transfer.id, actor=actor)
    assert transfer.status == TransferStatus.APPROVED.value

    # Yoxlayırıq: Göndərən anbarda 20 ədəd rezervdədir, əlçatan 80 olmalıdır
    bal_src = await inv_service.get_single_balance(src_wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal_src["on_hand"] == 100
    assert bal_src["reserved"] == 20
    assert bal_src["available"] == 80

    # 5. Yığım qeydiyyatı (PICKING)
    transfer = await tr_service.pick_transfer(
        transfer.id,
        TransferPickRequest(lines=[TransferPickLine(line_id=transfer_line_id, picked_qty=20)]),
        actor=actor,
    )
    assert transfer.status == TransferStatus.PICKING.value
    assert transfer.total_picked_qty == 20

    # 6. Yola salma (IN_TRANSIT / TRANSFER_OUT)
    transfer = await tr_service.dispatch_transfer(
        transfer.id,
        TransferDispatchRequest(
            shipping_method="Kuryer",
            tracking_number="TRK-99012",
            vehicle_no="99-AA-001",
            driver_name="Kənan Rzayev",
        ),
        actor=actor,
    )
    assert transfer.status == TransferStatus.IN_TRANSIT.value
    assert transfer.total_dispatched_qty == 20

    # Göndərən anbar qalığı 80 olmalı, rezervasiya 0 olmalıdır
    bal_src = await inv_service.get_single_balance(src_wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal_src["on_hand"] == 80
    assert bal_src["reserved"] == 0
    assert bal_src["available"] == 80

    # Tranzit anbar qalığı 20 olmalıdır
    bal_transit = await inv_service.get_single_balance(
        transfer.in_transit_warehouse_id, var_id, StockStatus.AVAILABLE.value
    )
    assert bal_transit["on_hand"] == 20

    # Outbox hadisəsini yoxlayırıq
    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(OutboxEvent).where(
                OutboxEvent.event_type == "transfer.dispatched",
                OutboxEvent.aggregate_id == str(transfer.id),
            )
        )
        assert res.scalars().first() is not None

    # 7. Qəbul etmə (RECEIVED / TRANSFER_IN) - yekun qəbul
    transfer = await tr_service.receive_transfer(
        transfer.id,
        TransferReceiveRequest(
            lines=[
                TransferReceiveLine(
                    line_id=transfer_line_id,
                    received_qty=20,
                    damaged_qty=0,
                    missing_qty=0,
                )
            ],
            is_final=True,
            notes="Hamısı tam və saz qəbul edildi",
        ),
        actor=actor,
    )
    assert transfer.status == TransferStatus.RECEIVED.value
    assert transfer.total_received_qty == 20

    # Tranzit anbar qalığı 0 olmalıdır
    bal_transit = await inv_service.get_single_balance(
        transfer.in_transit_warehouse_id, var_id, StockStatus.AVAILABLE.value
    )
    assert bal_transit["on_hand"] == 0

    # Təyinat anbar qalığı 20 olmalıdır
    bal_dst = await inv_service.get_single_balance(dst_wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal_dst["on_hand"] == 20
    assert bal_dst["available"] == 20

    # Qəbul outbox hadisəsini yoxlayırıq
    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(OutboxEvent).where(
                OutboxEvent.event_type == "transfer.received",
                OutboxEvent.aggregate_id == str(transfer.id),
            )
        )
        assert res.scalars().first() is not None


@pytest.mark.asyncio
async def test_transfer_partial_receipt_and_damaged_goods() -> None:
    """Hissə-hissə qəbul, zədəli və çatışmayan malların idarə edilməsi."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_transfer_test_data()
    inv_service = InventoryService()
    tr_service = TransfersService()
    actor = get_transfer_admin()

    # 50 ədəd ilkin mədaxil
    await inv_service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=50,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=src_wh_id,
                to_status=StockStatus.AVAILABLE.value,
                reference_type="test_receipt",
            )
        ],
        actor=actor,
    )

    # 30 ədəd transfer yaradılır, təsdiqlənir və yola salınır
    transfer = await tr_service.create_transfer(
        company_id=company_id,
        data=TransferCreate(
            source_warehouse_id=src_wh_id,
            destination_warehouse_id=dst_wh_id,
            lines=[TransferLineCreate(variant_id=var_id, requested_qty=30)],
        ),
        actor=actor,
    )
    await tr_service.submit_transfer(transfer.id, actor=actor)
    await tr_service.approve_transfer(transfer.id, actor=actor)
    transfer = await tr_service.dispatch_transfer(
        transfer.id, TransferDispatchRequest(), actor=actor
    )
    assert transfer.status == TransferStatus.IN_TRANSIT.value

    line_id = transfer.lines[0].id

    # Hissə-hissə qəbul: 10 ədəd saz, 5 ədəd zədəli, 2 ədəd çatışmır (is_final=False)
    transfer = await tr_service.receive_transfer(
        transfer.id,
        TransferReceiveRequest(
            lines=[
                TransferReceiveLine(
                    line_id=line_id,
                    received_qty=10,
                    damaged_qty=5,
                    missing_qty=2,
                    notes="5 ədəd qutusu cırıqdır",
                )
            ],
            is_final=False,
            notes="1-ci hissəvi qəbul",
        ),
        actor=actor,
    )
    assert transfer.status == TransferStatus.PARTIALLY_RECEIVED.value
    assert transfer.total_received_qty == 10

    # Təyinat anbarında 'available' = 10, 'damaged' = 5 olmalıdır
    bal_dst_avail = await inv_service.get_single_balance(
        dst_wh_id, var_id, StockStatus.AVAILABLE.value
    )
    assert bal_dst_avail["on_hand"] == 10

    bal_dst_dmg = await inv_service.get_single_balance(dst_wh_id, var_id, StockStatus.DAMAGED.value)
    assert bal_dst_dmg["on_hand"] == 5

    # Tranzit anbarında qalan mal: 30 - 10 (qəbul) - 5 (zədəli qəbul) = 15 ədəd
    bal_transit = await inv_service.get_single_balance(
        transfer.in_transit_warehouse_id, var_id, StockStatus.AVAILABLE.value
    )
    assert bal_transit["on_hand"] == 15

    # Discrepancy outbox hadisəsini yoxlayırıq
    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(OutboxEvent).where(
                OutboxEvent.event_type == "transfer.discrepancy",
                OutboxEvent.aggregate_id == str(transfer.id),
            )
        )
        assert res.scalars().first() is not None


@pytest.mark.asyncio
async def test_transfer_cancellation_before_dispatch_releases_reservation() -> None:
    """Yola salınmamış transferin ləğvi zamanı rezervasiyanın tam azad edilməsi."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_transfer_test_data()
    inv_service = InventoryService()
    tr_service = TransfersService()
    actor = get_transfer_admin()

    # 40 ədəd ilkin mədaxil
    await inv_service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=40,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=src_wh_id,
                to_status=StockStatus.AVAILABLE.value,
                reference_type="test_receipt",
            )
        ],
        actor=actor,
    )

    transfer = await tr_service.create_transfer(
        company_id=company_id,
        data=TransferCreate(
            source_warehouse_id=src_wh_id,
            destination_warehouse_id=dst_wh_id,
            lines=[TransferLineCreate(variant_id=var_id, requested_qty=15)],
        ),
        actor=actor,
    )
    await tr_service.submit_transfer(transfer.id, actor=actor)
    await tr_service.approve_transfer(transfer.id, actor=actor)

    # 15 ədəd rezervdə olmalıdır
    bal_before = await inv_service.get_single_balance(
        src_wh_id, var_id, StockStatus.AVAILABLE.value
    )
    assert bal_before["reserved"] == 15
    assert bal_before["available"] == 25

    # Transferi ləğv edirik
    cancelled = await tr_service.cancel_transfer(
        transfer.id,
        reason="Müştəri sifarişi ləğv etdi",
        actor=actor,
    )
    assert cancelled.status == TransferStatus.CANCELLED.value

    # Rezervasiya azad olunmalıdır, əlçatan yenidən 40 olmalıdır
    bal_after = await inv_service.get_single_balance(src_wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal_after["reserved"] == 0
    assert bal_after["available"] == 40


@pytest.mark.asyncio
async def test_transfer_cancellation_while_in_transit_returns_stock_to_source() -> None:
    """Yolda olan transferin ləğvi zamanı kompensasiya hərəkətləri ilə malların mənbə anbarına qayıtması."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_transfer_test_data()
    inv_service = InventoryService()
    tr_service = TransfersService()
    actor = get_transfer_admin()

    # 50 ədəd ilkin mədaxil
    await inv_service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=50,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=src_wh_id,
                to_status=StockStatus.AVAILABLE.value,
                reference_type="test_receipt",
            )
        ],
        actor=actor,
    )

    transfer = await tr_service.create_transfer(
        company_id=company_id,
        data=TransferCreate(
            source_warehouse_id=src_wh_id,
            destination_warehouse_id=dst_wh_id,
            lines=[TransferLineCreate(variant_id=var_id, requested_qty=25)],
        ),
        actor=actor,
    )
    await tr_service.submit_transfer(transfer.id, actor=actor)
    await tr_service.approve_transfer(transfer.id, actor=actor)
    transfer = await tr_service.dispatch_transfer(
        transfer.id, TransferDispatchRequest(), actor=actor
    )
    assert transfer.status == TransferStatus.IN_TRANSIT.value

    # Göndərəndə 25 qalıb, tranzitdə 25 var
    bal_src = await inv_service.get_single_balance(src_wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal_src["on_hand"] == 25
    bal_transit = await inv_service.get_single_balance(
        transfer.in_transit_warehouse_id, var_id, StockStatus.AVAILABLE.value
    )
    assert bal_transit["on_hand"] == 25

    # Yolda ləğv edirik
    cancelled = await tr_service.cancel_transfer(
        transfer.id,
        reason="Nəqliyyat nasazlığı səbəbindən geri qaytarıldı",
        actor=actor,
    )
    assert cancelled.status == TransferStatus.CANCELLED.value

    # Mallar mənbə anbarına geri qayıtmalıdır (50 ədəd), tranzit isə 0 olmalıdır
    bal_src = await inv_service.get_single_balance(src_wh_id, var_id, StockStatus.AVAILABLE.value)
    assert bal_src["on_hand"] == 50
    bal_transit = await inv_service.get_single_balance(
        transfer.in_transit_warehouse_id, var_id, StockStatus.AVAILABLE.value
    )
    assert bal_transit["on_hand"] == 0


@pytest.mark.asyncio
async def test_transfer_in_transit_report_and_sla_monitoring() -> None:
    """Tranzit monitorinqi və SLA gecikmə hesabatının testi."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_transfer_test_data()
    inv_service = InventoryService()
    tr_service = TransfersService()
    actor = get_transfer_admin()

    # 30 ədəd mədaxil
    await inv_service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=30,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=src_wh_id,
                to_status=StockStatus.AVAILABLE.value,
                reference_type="test_receipt",
            )
        ],
        actor=actor,
    )

    transfer = await tr_service.create_transfer(
        company_id=company_id,
        data=TransferCreate(
            source_warehouse_id=src_wh_id,
            destination_warehouse_id=dst_wh_id,
            lines=[TransferLineCreate(variant_id=var_id, requested_qty=10)],
        ),
        actor=actor,
    )
    await tr_service.submit_transfer(transfer.id, actor=actor)
    await tr_service.approve_transfer(transfer.id, actor=actor)
    await tr_service.dispatch_transfer(transfer.id, TransferDispatchRequest(), actor=actor)

    # SLA hesabatını alırıq
    report = await tr_service.get_in_transit_report(company_id=company_id, actor=actor)
    assert report.total_in_transit_transfers >= 1
    assert report.total_items_in_transit >= 10
    assert any(t.transfer_id == transfer.id for t in report.transfers)


@pytest.mark.asyncio
async def test_invalid_transfer_state_transitions_fail() -> None:
    """Yolverilməz status keçidləri xəta verməlidir."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_transfer_test_data()
    tr_service = TransfersService()
    actor = get_transfer_admin()

    transfer = await tr_service.create_transfer(
        company_id=company_id,
        data=TransferCreate(
            source_warehouse_id=src_wh_id,
            destination_warehouse_id=dst_wh_id,
            lines=[TransferLineCreate(variant_id=var_id, requested_qty=5)],
        ),
        actor=actor,
    )

    # DRAFT vəziyyətində birbaşa dispatch etmək cəhdi xəta verməlidir
    with pytest.raises(TransferInvalidTransitionError):
        await tr_service.dispatch_transfer(transfer.id, TransferDispatchRequest(), actor=actor)
