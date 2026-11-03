"""POS və Satışlar Modulu İnteqrasiya Testləri (POS & Sales Endpoints Integration Tests).

Bu test dəsti REST API vasitəsilə növbə açılışından kassa çıxışına, çək təkrar çapına
və növbə bağlanışına qədər bütün uç-uca (End-to-End) axını yoxlayır.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.policies import AuthenticatedUser
from app.modules.auth.tokens import create_access_token
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import BranchService
from app.modules.cash_registers.schemas import CashRegisterCreate
from app.modules.cash_registers.service import CashRegisterService
from app.modules.catalog.schemas import CategoryCreate, ProductCreate, ProductVariantCreate
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service
from app.modules.inventory.schemas import MovementDraft
from app.modules.inventory.service import InventoryService
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


async def create_api_user(
    role_code: str, allowed_branches: list[uuid.UUID] | None = None
) -> tuple[dict[str, str], uuid.UUID]:
    """Müəyyən rola malik istifadəçi yaradır və Authorization Bearer header və user_id qaytarır."""
    rbac_svc = RbacService()
    await rbac_svc.seed_catalog()

    user_svc = UserService()
    user_dto = UserCreate(
        username=f"api_{role_code}_{uuid.uuid4().hex[:6]}",
        email=f"api_{role_code}_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name=f"API {role_code.title()}",
        password="TestPassword123!",
        must_change_password=False,
    )
    user, _ = await user_svc.create_user(user_dto, actor=None)

    async with UnitOfWork() as uow:
        role = await rbac_svc.repo.get_role_by_code(uow.session, role_code)
        assert role is not None
        role_id = role.id

    await rbac_svc.assign_user_roles(user.id, [role_id], actor=None)

    token = create_access_token(
        user_id=user.id,
        session_id=generate_uuid7(),
        roles=[role_code],
    )
    return {"Authorization": f"Bearer {token}"}, user.id


@pytest.mark.asyncio
async def test_full_pos_sales_api_workflow(client: AsyncClient) -> None:
    """Tam POS Satış və Kassa API axını:
    1. Kataloq və Anbar hazırlığı
    2. POST /api/v1/pos/shifts -> Növbə açılışı
    3. POST /api/v1/pos/shifts/{id}/cash-movements -> Nağd pul mədaxili (CASH_IN)
    4. POST /api/v1/pos/lookup -> POS Məhsul axtarışı
    5. POST /api/v1/pos/quote -> Səbət qiymətləndirməsi
    6. POST /api/v1/pos/carts -> Səbəti dondurma (Suspend)
    7. POST /api/v1/pos/carts/{id}/recall -> Səbəti geri çağırma (Recall)
    8. POST /api/v1/pos/checkout -> 10 addımlı atomik çıxış (Idempotency-Key ilə)
    9. GET /api/v1/sales -> Satış axtarışı
    10. GET /api/v1/sales/{id} -> Satış təfərrüatları
    11. POST /api/v1/sales/{id}/reprint -> Çək təkrar çapı
    12. GET /api/v1/pos/shifts/{id}/x-report -> X-Hesabat
    13. POST /api/v1/pos/shifts/{id}/close -> Növbənin bağlanması və Z-Hesabat
    """
    company = await get_company_service().get_company()

    # Filial və Anbar yaradırıq
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Port Baku Filialı",
            address="Neftçilər pr. 153",
            phone="+994125550130",
        ),
    )

    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}",
            name="Port Baku Satış Anbarı",
            warehouse_type="branch",
            branch_id=branch.id,
        ),
    )

    admin_headers, admin_id = await create_api_user("system_admin")
    admin_actor = AuthenticatedUser(
        id=admin_id,
        username="admin_actor",
        email="admin_actor@brandhouse.az",
        full_name="Admin Actor",
        roles=["system_admin"],
        permissions=["catalog.product.manage", "registers.register.manage"],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )

    # Kassa aparatı yaradırıq
    reg_svc = CashRegisterService()
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id,
            default_warehouse_id=warehouse.id,
            code=f"REG-{uuid.uuid4().hex[:4].upper()}",
            name="Port Baku Kassa 1",
        ),
        actor=admin_actor,
    )

    # Kataloqda məhsul və variant yaradırıq
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(
            name=f"Parfüm-{uuid.uuid4().hex[:4]}",
            code=f"CAT-{uuid.uuid4().hex[:4].upper()}",
            level=1,
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    prod = await cat_svc.create_product(
        data=ProductCreate(
            name=f"Lüks Ətir {uuid.uuid4().hex[:4]}",
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            section="Uniseks",
            type="Parfüm",
            category_id=cat.id,
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    sku_code = f"SKU-{uuid.uuid4().hex[:8].upper()}"
    barcode = f"869{uuid.uuid4().hex[:9]}"
    variant = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku=sku_code,
            barcode=barcode,
            size="100ml",
            color="Şəffaf",
            price_override=Decimal("150.00"),
        ),
        actor=admin_actor,
    )

    # 20 ədəd stok mədaxil edirik (@ 80.00 AZN)
    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(
                variant_id=variant.id,
                to_warehouse_id=warehouse.id,
                quantity=20,
                movement_type="RECEIPT",
                reference_type="stock_document",
                unit_cost=Decimal("80.0000"),
            )
        ],
        actor=admin_actor,
    )

    # 1. Kassir istifadəçisi ilə daxil oluruq
    cashier_headers, cashier_id = await create_api_user("cashier", allowed_branches=[branch.id])

    # 2. Növbə açırıq (POST /api/v1/pos/shifts/open)
    open_resp = await client.post(
        "/api/v1/pos/shifts/open",
        json={
            "register_id": str(register.id),
            "opening_cash": "100.00",
        },
        headers=cashier_headers,
    )
    assert open_resp.status_code == 201, open_resp.text
    shift_data = open_resp.json()
    shift_id = shift_data["id"]
    assert shift_data["status"] == "OPEN"
    assert shift_data["opening_cash"] == "100.00"

    # 3. Nağd pul hərəkəti (POST /api/v1/pos/shifts/{id}/cash-movements) -> CASH_IN 50 AZN
    cm_resp = await client.post(
        f"/api/v1/pos/shifts/{shift_id}/cash-movements",
        json={
            "movement_type": "CASH_IN",
            "amount": "50.00",
            "reason_code": "FLOAT_ADD",
            "notes": "Xırda pul əlavəsi",
        },
        headers=cashier_headers,
    )
    assert cm_resp.status_code == 201, cm_resp.text
    assert cm_resp.json()["amount"] == "50.00"

    # 4. POS Sürətli Barkod Axtarışı (GET /api/v1/pos/lookup)
    lookup_resp = await client.get(
        "/api/v1/pos/lookup",
        params={
            "code": sku_code,
            "register_id": str(register.id),
        },
        headers=cashier_headers,
    )
    assert lookup_resp.status_code == 200, lookup_resp.text
    item_info = lookup_resp.json()
    assert item_info["sku"] == sku_code
    assert item_info["effective_price"] == "150.00"
    assert item_info["stock_available"] == 20

    # 5. Səbət Qiymətləndirməsi (POST /api/v1/pos/quote)
    quote_resp = await client.post(
        "/api/v1/pos/quote",
        json={
            "items": [{"variant_id": str(variant.id), "quantity": 2}],
            "branch_id": str(branch.id),
        },
        headers=cashier_headers,
    )
    assert quote_resp.status_code == 200, quote_resp.text
    quote_data = quote_resp.json()
    assert quote_data["grand_total"] == "300.00"

    # 6. Səbəti dondururuq (POST /api/v1/pos/carts/suspend)
    cart_resp = await client.post(
        "/api/v1/pos/carts/suspend",
        json={
            "shift_id": shift_id,
            "label": "Müştəri pul kisəsini maşında unudub",
            "lines": [{"variant_id": str(variant.id), "quantity": 2}],
        },
        headers=cashier_headers,
    )
    assert cart_resp.status_code == 201, cart_resp.text
    cart_id = cart_resp.json()["id"]

    # 7. Səbəti geri çağırırıq (POST /api/v1/pos/carts/{id}/recall)
    recall_resp = await client.post(
        f"/api/v1/pos/carts/{cart_id}/recall",
        headers=cashier_headers,
    )
    assert recall_resp.status_code == 200, recall_resp.text
    assert recall_resp.json()["quote"]["grand_total"] == "300.00"

    # 8. Satışı tamamlayırıq (POST /api/v1/pos/sales)
    idem_key = f"api-chk-{uuid.uuid4().hex}"
    checkout_resp = await client.post(
        "/api/v1/pos/sales",
        json={
            "shift_id": shift_id,
            "register_id": str(register.id),
            "items": [{"variant_id": str(variant.id), "quantity": 2}],
            "expected_grand_total": "300.00",
            "payments": [
                {
                    "tender_type": "cash",
                    "amount": "300.00",
                    "tendered_amount": "300.00",
                }
            ],
        },
        headers={**cashier_headers, "Idempotency-Key": idem_key},
    )
    assert checkout_resp.status_code == 201, checkout_resp.text
    receipt_data = checkout_resp.json()
    receipt_no = receipt_data["receipt_no"]
    sale_id = receipt_data["sale_id"]
    assert receipt_data["grand_total"] == "300.00"
    assert receipt_data["paid_amount"] == "300.00"

    # 9. Satışların siyahısı (GET /api/v1/sales)
    sales_list_resp = await client.get(
        "/api/v1/sales",
        params={"branch_id": str(branch.id), "status": "COMPLETED"},
        headers=cashier_headers,
    )
    assert sales_list_resp.status_code == 200, sales_list_resp.text
    sales_page = sales_list_resp.json()
    assert sales_page["total"] >= 1
    assert any(s["receipt_no"] == receipt_no for s in sales_page["items"])

    # 10. Satış təfərrüatı (GET /api/v1/sales/{id})
    sale_detail_resp = await client.get(
        f"/api/v1/sales/{sale_id}",
        headers=cashier_headers,
    )
    assert sale_detail_resp.status_code == 200, sale_detail_resp.text
    detail = sale_detail_resp.json()
    assert detail["receipt_no"] == receipt_no
    assert detail["grand_total"] == "300.00"
    # Kassir üçün maya dəyəri gizlədilməlidir (None)
    assert detail["cost_total"] is None

    # 11. Çəkin təkrar çapı (POST /api/v1/sales/{id}/reprint)
    reprint_resp = await client.post(
        f"/api/v1/sales/{sale_id}/reprint",
        json={"reason": "Müştəri qəbzin surətini tələb etdi"},
        headers=cashier_headers,
    )
    assert reprint_resp.status_code == 200, reprint_resp.text
    reprint_data = reprint_resp.json()
    assert reprint_data["reprint_number"] == 1
    assert "NÜSXƏ / DUPLICATE COPY" in reprint_data["html_receipt"]

    # 12. X-Hesabat (GET /api/v1/pos/shifts/{id}/x-report)
    x_resp = await client.get(
        f"/api/v1/pos/shifts/{shift_id}/x-report",
        headers=cashier_headers,
    )
    assert x_resp.status_code == 200, x_resp.text
    x_data = x_resp.json()
    # Gözlənilən nağd: 100 (float) + 50 (cash in) + 300 (cash sale) = 450 AZN
    assert x_data["expected_cash"] == "450.00"
    assert x_data["sales_count"] == 1

    # 13. Növbənin bağlanması (POST /api/v1/pos/shifts/{id}/close)
    close_resp = await client.post(
        f"/api/v1/pos/shifts/{shift_id}/close",
        json={
            "counted_cash": "450.00",
            "closing_notes": "Uğurlu gün sonu",
        },
        headers=cashier_headers,
    )
    assert close_resp.status_code == 200, close_resp.text
    z_data = close_resp.json()
    assert z_data["report_type"] == "Z_REPORT"
    assert z_data["variance"] == "0.00"
    assert z_data["sales_count"] == 1
