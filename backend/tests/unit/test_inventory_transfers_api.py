"""İnventar və Transferlər Modulları HTTP API Vahid Testləri (API & RBAC Tests)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.main import app as fastapi_app
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
from app.modules.inventory.router import get_current_actor as inv_get_current_actor
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.transfers.router import get_current_actor as tr_get_current_actor
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_api_admin_user() -> AuthenticatedUser:
    """Tam səlahiyyətli admin istifadəçi."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="api_inv_admin",
        email="api_inv_admin@brandhouse.az",
        full_name="İnventar API Admin",
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
            "inventory.count.freeze",
            "inventory.count.scan",
            "inventory.count.approve",
            "inventory.valuation.view",
            "inventory.reconcile",
            "transfers.manage",
            "transfers.approve",
            "transfers.dispatch",
            "transfers.receive",
            "transfers.cancel",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


def get_unauthorized_user() -> AuthenticatedUser:
    """Hüququ olmayan istifadəçi."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="no_rights_user",
        email="no_rights@brandhouse.az",
        full_name="Hüquqsuz İstifadəçi",
        roles=["cashier"],
        permissions=[],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


async def setup_api_test_data() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID]:
    """Test üçün zəruri şirkət, anbarlar və məhsul variantını yaradır."""
    company = await get_company_service().get_company()
    admin = get_api_admin_user()
    wh_svc = WarehouseService()

    wh_src = await wh_svc.create_warehouse(
        WarehouseCreate(
            code=f"API_SRC_{uuid.uuid4().hex[:6].upper()}",
            name="API Göndərən Anbar",
            warehouse_type="central",
        ),
        company_id=company.id,
        actor=admin,
    )
    wh_dst = await wh_svc.create_warehouse(
        WarehouseCreate(
            code=f"API_DST_{uuid.uuid4().hex[:6].upper()}",
            name="API Təyinat Anbarı",
            warehouse_type="branch",
        ),
        company_id=company.id,
        actor=admin,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        CategoryCreate(name="API Geyim", code=f"cat_{uuid.uuid4().hex[:6]}", level=1),
        company_id=company.id,
        actor=admin,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"API-PRD-{uuid.uuid4().hex[:6].upper()}",
            name="API Test Məhsulu",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=admin,
    )
    await cat_svc.generate_variant_matrix(
        prod.id,
        VariantMatrixGenerateRequest(
            sizes=["M"],
            colors=["Göy"],
            dry_run=False,
            default_price=Decimal("45.00"),
            default_cost=Decimal("20.00"),
        ),
        actor=admin,
    )

    async with UnitOfWork() as uow:
        from sqlalchemy import select

        res = await uow.session.execute(
            select(ProductVariant).where(ProductVariant.product_id == prod.id)
        )
        variant = res.scalars().first()
        assert variant is not None
        return company.id, wh_src.id, wh_dst.id, variant.id


@pytest.mark.asyncio
async def test_inventory_balances_and_ledger_api(client: AsyncClient) -> None:
    """Stok qalıqları və hərəkət jurnalı (ledger) API endpoint-lərinin testi."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_api_test_data()
    admin = get_api_admin_user()
    unauth = get_unauthorized_user()

    # 1. İlkin mədaxil edirik
    inv_service = InventoryService()
    await inv_service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=50,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=src_wh_id,
                to_status=StockStatus.AVAILABLE.value,
                reference_type="api_test_init",
            )
        ],
        actor=admin,
    )

    # 2. İcazəsiz istifadəçi balansı görmək istədikdə 403 almalıdır
    fastapi_app.dependency_overrides[inv_get_current_actor] = lambda: unauth
    resp = await client.get("/api/v1/inventory/balances")
    assert resp.status_code == 403

    # 3. İcazəli admin balansı görür
    fastapi_app.dependency_overrides[inv_get_current_actor] = lambda: admin
    resp = await client.get(
        "/api/v1/inventory/balances",
        params={"warehouse_id": str(src_wh_id), "variant_id": str(var_id)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["on_hand"] == 50
    assert data[0]["available"] == 50

    # 4. Hərəkət jurnalı (ledger) sorğusu
    resp_ledger = await client.get(
        "/api/v1/inventory/ledger",
        params={"warehouse_id": str(src_wh_id), "variant_id": str(var_id)},
    )
    assert resp_ledger.status_code == 200
    ledger_data = resp_ledger.json()
    assert len(ledger_data) >= 1
    assert ledger_data[0]["quantity"] == 50
    assert ledger_data[0]["movement_type"] == MovementType.RECEIPT.value

    # 5. Maya dəyəri və qiymətləndirmə hesabatı
    resp_val = await client.get("/api/v1/inventory/valuation")
    assert resp_val.status_code == 200
    val_data = resp_val.json()
    assert val_data["total_quantity"] >= 50

    # 6. Balans uyğunluq (reconciliation) hesabatı
    resp_rec = await client.get("/api/v1/inventory/reconcile")
    assert resp_rec.status_code == 200
    assert resp_rec.json()["is_consistent"] is True

    fastapi_app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_inventory_documents_and_counts_api(client: AsyncClient) -> None:
    """Anbar sənədləri və fiziki sayım sessiyaları API endpoint-lərinin testi."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_api_test_data()
    admin = get_api_admin_user()

    fastapi_app.dependency_overrides[inv_get_current_actor] = lambda: admin

    # 1. Anbar sənədi yaratma (ADJUSTMENT_PLUS)
    doc_payload = {
        "document_type": "ADJUSTMENT_PLUS",
        "warehouse_id": str(src_wh_id),
        "reason_code": "FOUND_STOCK",
        "notes": "API test artımı",
        "lines": [
            {
                "variant_id": str(var_id),
                "quantity": 15,
                "unit_cost": "20.0000",
                "target_status": "available",
            }
        ],
    }
    resp_create = await client.post("/api/v1/inventory/documents", json=doc_payload)
    assert resp_create.status_code == 201
    doc_id = resp_create.json()["id"]

    # 2. Sənədi təsdiqləmə (confirm)
    resp_confirm = await client.post(f"/api/v1/inventory/documents/{doc_id}/confirm")
    assert resp_confirm.status_code == 200, resp_confirm.json()
    assert resp_confirm.json()["status"].lower() == "confirmed"

    # 3. Fiziki sayım sessiyası yaratma (count session)
    count_payload = {
        "warehouse_id": str(src_wh_id),
        "count_scope": "full",
        "notes": "API illik sayım",
    }
    resp_cs = await client.post("/api/v1/inventory/counts", json=count_payload)
    assert resp_cs.status_code == 201
    cs_id = resp_cs.json()["id"]

    # Dondurma və başlama
    resp_freeze = await client.post(f"/api/v1/inventory/counts/{cs_id}/freeze")
    assert resp_freeze.status_code == 200
    assert resp_freeze.json()["status"].lower() in ["counting", "in_progress"]

    # Sayım daxil etmə (skan)
    scan_payload = {
        "variant_id": str(var_id),
        "counted_qty": 20,
        "device_id": "TERMINAL_01",
    }
    resp_scan = await client.post(f"/api/v1/inventory/counts/{cs_id}/entries", json=scan_payload)
    assert resp_scan.status_code == 201
    assert resp_scan.json()["counted_qty"] == 20

    # Sayımı təsdiqləmə (approve)
    appr_payload = {
        "reason_code": "ANNUAL_COUNT_DIFF",
        "notes": "Sayım təsdiqləndi",
    }
    resp_appr = await client.post(f"/api/v1/inventory/counts/{cs_id}/approve", json=appr_payload)
    assert resp_appr.status_code == 200
    assert resp_appr.json()["status"].lower() in ["approved", "completed"]

    fastapi_app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_transfers_api_workflow_and_rbac(client: AsyncClient) -> None:
    """Transferlər API marşrutlarının tam iş axını və RBAC hüquqlarının testi."""
    company_id, src_wh_id, dst_wh_id, var_id = await setup_api_test_data()
    admin = get_api_admin_user()
    unauth = get_unauthorized_user()

    # 1. İlkin qalıq veririk
    inv_service = InventoryService()
    await inv_service.post_batch(
        company_id=company_id,
        movements=[
            MovementDraft(
                variant_id=var_id,
                quantity=60,
                movement_type=MovementType.RECEIPT.value,
                to_warehouse_id=src_wh_id,
                to_status=StockStatus.AVAILABLE.value,
                reference_type="api_transfer_init",
            )
        ],
        actor=admin,
    )

    # 2. Hüquqsuz istifadəçi transfer yaratmaq istədikdə 403 almalıdır
    fastapi_app.dependency_overrides[tr_get_current_actor] = lambda: unauth
    transfer_payload = {
        "source_warehouse_id": str(src_wh_id),
        "destination_warehouse_id": str(dst_wh_id),
        "lines": [{"variant_id": str(var_id), "requested_qty": 25}],
        "notes": "Filiala transfer sifarişi",
    }
    resp_unauth = await client.post("/api/v1/transfers", json=transfer_payload)
    assert resp_unauth.status_code == 403

    # 3. Admin transfer yaradır (DRAFT)
    fastapi_app.dependency_overrides[tr_get_current_actor] = lambda: admin
    resp_tr = await client.post("/api/v1/transfers", json=transfer_payload)
    assert resp_tr.status_code == 201
    tr_data = resp_tr.json()
    transfer_id = tr_data["id"]
    line_id = tr_data["lines"][0]["id"]
    assert tr_data["status"] == "DRAFT"
    assert tr_data["total_requested_qty"] == 25

    # 4. Təsdiqə göndərmə (submit)
    resp_sub = await client.post(f"/api/v1/transfers/{transfer_id}/submit")
    assert resp_sub.status_code == 200
    assert resp_sub.json()["status"] == "SUBMITTED"

    # 5. Təsdiqləmə (approve)
    resp_app = await client.post(f"/api/v1/transfers/{transfer_id}/approve")
    assert resp_app.status_code == 200
    assert resp_app.json()["status"] == "APPROVED"

    # 6. Yığım qeydiyyatı (pick)
    pick_payload = {"lines": [{"line_id": line_id, "picked_qty": 25}]}
    resp_pick = await client.post(f"/api/v1/transfers/{transfer_id}/pick", json=pick_payload)
    assert resp_pick.status_code == 200
    assert resp_pick.json()["status"] == "PICKING"

    # 7. Yola salma (dispatch)
    dispatch_payload = {
        "shipping_method": "Ekspress Kuryer",
        "tracking_number": "TRK-007788",
        "vehicle_no": "10-ZZ-100",
        "driver_name": "Əli Əliyev",
    }
    resp_disp = await client.post(
        f"/api/v1/transfers/{transfer_id}/dispatch", json=dispatch_payload
    )
    assert resp_disp.status_code == 200
    assert resp_disp.json()["status"] == "IN_TRANSIT"

    # 8. Tranzit hesabatı (in-transit report)
    resp_rep = await client.get("/api/v1/transfers/in-transit/report")
    assert resp_rep.status_code == 200
    assert resp_rep.json()["total_in_transit_transfers"] >= 1

    # 9. Təyinat anbarında qəbul (receive - tam yekun)
    receive_payload = {
        "lines": [
            {
                "line_id": line_id,
                "received_qty": 25,
                "damaged_qty": 0,
                "missing_qty": 0,
            }
        ],
        "is_final": True,
        "notes": "API test tam qəbul",
    }
    resp_rec = await client.post(f"/api/v1/transfers/{transfer_id}/receive", json=receive_payload)
    assert resp_rec.status_code == 200
    assert resp_rec.json()["status"] == "RECEIVED"
    assert resp_rec.json()["total_received_qty"] == 25

    fastapi_app.dependency_overrides.clear()
