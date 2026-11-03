"""Satınalma, Təchizatçılar və Təsdiqləmə Modulları HTTP API Vahid Testləri (API & RBAC Tests)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.main import app as fastapi_app
from app.modules.approvals.router import get_current_actor as appr_get_current_actor
from app.modules.auth.policies import AuthenticatedUser
from app.modules.catalog.models import ProductVariant
from app.modules.catalog.schemas import (
    CategoryCreate,
    ProductCreate,
    VariantMatrixGenerateRequest,
)
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service
from app.modules.purchasing.router import get_current_actor as pur_get_current_actor
from app.modules.suppliers.router import get_current_actor as sup_get_current_actor
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_api_admin_user() -> AuthenticatedUser:
    """Tam səlahiyyətli admin istifadəçi."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="purchasing_api_admin",
        email="pur_api_admin@brandhouse.az",
        full_name="Satınalma API Rəhbəri",
        roles=["system_admin", "general_manager"],
        permissions=[
            "suppliers.manage",
            "suppliers.bank.view",
            "suppliers.documents.manage",
            "approvals.rule.manage",
            "approvals.decide",
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
            "inventory.ledger.view",
            "inventory.balance.view",
            "inventory.adjust",
            "catalog.product.manage",
        ],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


def get_unauthorized_user() -> AuthenticatedUser:
    """Hüququ olmayan sıravi istifadəçi."""
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="guest_staff",
        email="guest_staff@brandhouse.az",
        full_name="Səlahiyyətsiz Əməkdaş",
        roles=["cashier"],
        permissions=[],
        allowed_branches=[],
        session_id=generate_uuid7(),
    )


async def setup_api_test_fixtures() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Test üçün zəruri olan Şirkət, Anbar və Məhsul Variantını formalaşdırır."""
    company = await get_company_service().get_company()
    admin = get_api_admin_user()

    wh_svc = WarehouseService()
    wh = await wh_svc.create_warehouse(
        WarehouseCreate(
            code=f"WH-API-{uuid.uuid4().hex[:4].upper()}",
            name="API Test Qəbul Anbarı",
            warehouse_type="central",
        ),
        company_id=company.id,
        actor=admin,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        CategoryCreate(name="API Kataloq", code=f"c_{uuid.uuid4().hex[:4]}", level=1),
        company_id=company.id,
        actor=admin,
    )
    prod = await cat_svc.create_product(
        ProductCreate(
            internal_code=f"API-P-{uuid.uuid4().hex[:4].upper()}",
            name="API Köynək",
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
            colors=["Ağ"],
            dry_run=False,
            default_price=Decimal("50.00"),
            default_cost=Decimal("25.00"),
        ),
        actor=admin,
    )

    from sqlalchemy import select

    from app.core.uow import UnitOfWork

    async with UnitOfWork() as uow:
        res = await uow.session.execute(
            select(ProductVariant).where(ProductVariant.product_id == prod.id)
        )
        variant = res.scalars().first()
        assert variant is not None
        variant_id = variant.id

    return company.id, wh.id, variant_id


@pytest.mark.asyncio
async def test_suppliers_api_and_rbac(client: AsyncClient) -> None:
    """Təchizatçılar modulu HTTP API və RBAC hüquqlarının testi."""
    admin = get_api_admin_user()
    unauth = get_unauthorized_user()

    # 1. İcazəsiz istifadəçi 403 almalıdır
    fastapi_app.dependency_overrides[sup_get_current_actor] = lambda: unauth
    resp_unauth = await client.post(
        "/api/v1/suppliers",
        json={"code": "SUP-TEST", "name": "Test Təchizatçı"},
    )
    assert resp_unauth.status_code == 403

    # 2. İcazəli istifadəçi təchizatçı yaradır (201 Created)
    fastapi_app.dependency_overrides[sup_get_current_actor] = lambda: admin
    tax_num = f"99{uuid.uuid4().hex[:8]}"
    create_payload = {
        "code": f"SUP-API-{uuid.uuid4().hex[:4].upper()}",
        "name": "Baku Textile ASC",
        "tax_id": tax_num,
        "payment_terms_days": 30,
        "payment_method": "bank_transfer",
        "default_currency": "AZN",
        "bank_details": {"iban": "AZ21NABZ01350100000000123456", "bank_name": "ABB"},
    }
    resp_create = await client.post("/api/v1/suppliers", json=create_payload)
    assert resp_create.status_code == 201
    sup_data = resp_create.json()
    supplier_id = sup_data["id"]
    assert sup_data["name"] == "Baku Textile ASC"

    # 3. Təchizatçı siyahısı və tək təchizatçı məlumatı
    resp_list = await client.get("/api/v1/suppliers")
    assert resp_list.status_code == 200
    assert len(resp_list.json()) >= 1

    resp_get = await client.get(f"/api/v1/suppliers/{supplier_id}")
    assert resp_get.status_code == 200
    assert resp_get.json()["id"] == supplier_id

    # 4. Kontakt əlavə etmə
    resp_contact = await client.post(
        f"/api/v1/suppliers/{supplier_id}/contacts",
        json={
            "name": "Rəşad Quliyev",
            "role": "Satış Direktoru",
            "email": "rashad@textile.az",
            "phone": "+994509998877",
            "is_primary": True,
        },
    )
    assert resp_contact.status_code == 201
    assert resp_contact.json()["name"] == "Rəşad Quliyev"

    # 5. Dublikat yoxlanışı
    resp_dup = await client.post(
        "/api/v1/suppliers/check-duplicates",
        json={"name": "Baku Textile MMC", "tax_id": tax_num},
    )
    assert resp_dup.status_code == 200
    assert resp_dup.json()["has_duplicate"] is True

    fastapi_app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_approvals_api_and_rbac(client: AsyncClient) -> None:
    """Təsdiqləmə Mühərriki HTTP API və RBAC hüquqlarının testi."""
    admin = get_api_admin_user()
    unauth = get_unauthorized_user()

    # 1. İcazəsiz istifadəçi qayda yarada bilməz (403)
    fastapi_app.dependency_overrides[appr_get_current_actor] = lambda: unauth
    resp_unauth = await client.post(
        "/api/v1/approvals/rules",
        json={"document_type": "purchase_order", "min_amount": 1000.0, "level": 1},
    )
    assert resp_unauth.status_code == 403

    # 2. İcazəli istifadəçi qayda yaradır (201 Created)
    fastapi_app.dependency_overrides[appr_get_current_actor] = lambda: admin
    doc_t = f"api_po_{uuid.uuid4().hex[:4]}"
    resp_rule = await client.post(
        "/api/v1/approvals/rules",
        json={
            "document_type": doc_t,
            "min_amount": 500.0,
            "level": 1,
            "required_role": "procurement_manager",
            "description": "API Test PO Təsdiq Qaydası",
        },
    )
    assert resp_rule.status_code == 201
    assert resp_rule.json()["document_type"] == doc_t

    # 3. Qaydaların siyahılanması
    resp_rules = await client.get(f"/api/v1/approvals/rules?document_type={doc_t}")
    assert resp_rules.status_code == 200
    assert len(resp_rules.json()) == 1

    fastapi_app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_purchasing_full_api_workflow(client: AsyncClient) -> None:
    """Satınalma tam HTTP axını: PR -> PO -> Qəbul (GR) -> Qaimə (Invoice) -> Ödəniş (Payment)."""
    company_id, wh_id, variant_id = await setup_api_test_fixtures()
    admin = get_api_admin_user()
    unauth = get_unauthorized_user()

    fastapi_app.dependency_overrides[pur_get_current_actor] = lambda: admin
    fastapi_app.dependency_overrides[sup_get_current_actor] = lambda: admin

    # 1. Təchizatçı yaradırıq
    resp_sup = await client.post(
        "/api/v1/suppliers",
        json={
            "code": f"SUP-FLW-{uuid.uuid4().hex[:4].upper()}",
            "name": "Flow Garment MMC",
            "payment_terms_days": 30,
        },
    )
    assert resp_sup.status_code == 201
    supplier_id = resp_sup.json()["id"]

    # 2. Satınalma Sorğusu (PR)
    resp_pr = await client.post(
        "/api/v1/purchasing/requests",
        json={
            "requesting_warehouse_id": str(wh_id),
            "needed_by": str(date.today() + timedelta(days=14)),
            "reason": "Test PR",
            "lines": [
                {
                    "variant_id": str(variant_id),
                    "requested_qty": 40,
                    "estimated_unit_price": 25.0,
                }
            ],
        },
    )
    assert resp_pr.status_code == 201
    pr_id = resp_pr.json()["id"]

    # 3. Satınalma Sifarişi (PO)
    resp_po = await client.post(
        "/api/v1/purchasing/orders",
        json={
            "supplier_id": supplier_id,
            "delivery_warehouse_id": str(wh_id),
            "purchase_request_id": pr_id,
            "expected_date": str(date.today() + timedelta(days=7)),
            "lines": [
                {
                    "variant_id": str(variant_id),
                    "quantity": 40,
                    "unit_price": 25.0,
                    "tax_rate": 0.0,
                }
            ],
        },
    )
    assert resp_po.status_code == 201
    po_data = resp_po.json()
    po_id = po_data["id"]
    po_line_id = po_data["lines"][0]["id"]

    # PO təsdiqi
    resp_po_appr = await client.post(f"/api/v1/purchasing/orders/{po_id}/approve")
    assert resp_po_appr.status_code == 200
    assert resp_po_appr.json()["status"] == "APPROVED"

    # 4. Malların Qəbul Aktı (GR)
    resp_gr = await client.post(
        "/api/v1/purchasing/receipts",
        json={
            "supplier_id": supplier_id,
            "warehouse_id": str(wh_id),
            "po_id": po_id,
            "delivery_note_number": f"DN-API-{uuid.uuid4().hex[:6]}",
            "lines": [
                {
                    "po_line_id": po_line_id,
                    "variant_id": str(variant_id),
                    "received_qty": 40,
                    "damaged_qty": 0,
                    "rejected_qty": 0,
                    "unit_cost": 25.0,
                }
            ],
        },
    )
    assert resp_gr.status_code == 201
    gr_data = resp_gr.json()
    gr_id = gr_data["id"]
    gr_line_id = gr_data["lines"][0]["id"]

    # Qəbul aktını təsdiq edirik (Idempotency-Key ilə)
    resp_gr_conf = await client.post(
        f"/api/v1/purchasing/receipts/{gr_id}/confirm",
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert resp_gr_conf.status_code == 200
    assert resp_gr_conf.json()["status"] == "CONFIRMED"

    # 5. Qaimə (Supplier Invoice)
    resp_inv = await client.post(
        "/api/v1/purchasing/invoices",
        json={
            "supplier_id": supplier_id,
            "supplier_invoice_number": f"INV-API-{uuid.uuid4().hex[:6]}",
            "invoice_date": str(date.today()),
            "due_date": str(date.today() + timedelta(days=30)),
            "po_id": po_id,
            "receipt_id": gr_id,
            "lines": [
                {
                    "po_line_id": po_line_id,
                    "receipt_line_id": gr_line_id,
                    "variant_id": str(variant_id),
                    "quantity": 40,
                    "unit_price": 25.0,
                    "tax_rate": 0.0,
                }
            ],
        },
    )
    assert resp_inv.status_code == 201
    inv_id = resp_inv.json()["id"]

    # Qaiməni təsdiqləyirik (+1000 AZN borc yaranır)
    resp_inv_appr = await client.post(f"/api/v1/purchasing/invoices/{inv_id}/approve")
    assert resp_inv_appr.status_code == 200
    assert resp_inv_appr.json()["status"] == "APPROVED_FOR_PAYMENT"

    # 6. Ödəniş (Supplier Payment)
    resp_pmt = await client.post(
        "/api/v1/purchasing/payments",
        json={
            "supplier_id": supplier_id,
            "payment_method": "bank_transfer",
            "amount": 1000.0,
            "payment_date": str(date.today()),
            "allocations": [{"invoice_id": inv_id, "allocated_amount": 1000.0}],
            "notes": "API Tam Ödəniş",
        },
    )
    assert resp_pmt.status_code == 201
    assert resp_pmt.json()["status"] == "POSTED"

    # 7. Borcların Yaşlanması (Payables Aging)
    resp_aging = await client.get("/api/v1/purchasing/payables/aging")
    assert resp_aging.status_code == 200
    assert resp_aging.json()["total_payables"] == "0.0000"

    # 8. RBAC yoxlanışı: Hüquqsuz istifadəçi sorğu yarada bilməz (403)
    fastapi_app.dependency_overrides[pur_get_current_actor] = lambda: unauth
    resp_pur_unauth = await client.post(
        "/api/v1/purchasing/requests",
        json={
            "requesting_warehouse_id": str(wh_id),
            "needed_by": str(date.today() + timedelta(days=14)),
            "reason": "Unauthorized test",
            "lines": [
                {
                    "variant_id": str(variant_id),
                    "requested_qty": 5,
                    "estimated_unit_price": 20.0,
                }
            ],
        },
    )
    assert resp_pur_unauth.status_code == 403

    fastapi_app.dependency_overrides.clear()
