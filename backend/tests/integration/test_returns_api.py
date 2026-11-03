"""Qaytarmalar və Mübadilələr REST API İnteqrasiya Testləri (Returns & Exchanges API End-to-End).

1. POST /api/v1/pos/shifts -> Növbə açılışı
2. POST /api/v1/pos/checkout -> Satış sənədinin yaradılması
3. GET /api/v1/sales/{id}/returnable -> Qaytarıla bilən qalıqların yoxlanışı
4. POST /api/v1/returns/quote -> Qaytarma kalkulyasiyası
5. POST /api/v1/returns -> Qaytarmanın tamamlanması (Idempotency-Key ilə)
6. GET /api/v1/returns -> Axtarış və süzgəclər
7. GET /api/v1/returns/{id} -> Detallar
8. POST /api/v1/returns/{id}/reprint -> Çek təkrar çapı
9. GET /api/v1/returns/reasons -> Səbəb kodları
10. GET /api/v1/returns/customer/{customer_id} -> Müştəri tarixçəsi
11. GET /api/v1/returns/fraud-indicators -> Fırıldaqçılıq analitikası
12. POST /api/v1/returns/exchange -> Mübadilə (Exchange) əməliyyatı
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


async def create_api_user(role_code: str) -> tuple[dict[str, str], uuid.UUID]:
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
async def test_full_returns_and_exchanges_api_workflow(client: AsyncClient) -> None:
    """Bütün qaytarma və mübadilə REST API axını."""
    company = await get_company_service().get_company()

    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Park Bulvar Filialı",
            address="Neftçilər pr. 78",
            phone="+994125550080",
        ),
    )

    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}", name="Anbar", branch_id=branch.id
        ),
    )

    admin_headers, admin_id = await create_api_user("system_admin")
    admin_actor = AuthenticatedUser(
        id=admin_id,
        username="admin_actor",
        email="admin_actor@brandhouse.az",
        full_name="Admin Actor",
        roles=["system_admin"],
        permissions=[],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )

    reg_svc = CashRegisterService()
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id, default_warehouse_id=warehouse.id, code="REG-PB1", name="Kassa PB"
        ),
        actor=admin_actor,
    )

    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name="Kurtka", code="CAT-K"), company_id=company.id, actor=admin_actor
    )
    prod = await cat_svc.create_product(
        data=ProductCreate(
            name="Dəri Kurtka",
            internal_code="PRD-JKT",
            category_id=cat.id,
            section="Kişi",
            type="Geyim",
        ),
        company_id=company.id,
        actor=admin_actor,
    )

    vM = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku="JKT-M", barcode="1001", size="M", price_override=Decimal("200.00")
        ),
        actor=admin_actor,
    )
    vL = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku="JKT-L", barcode="1002", size="L", price_override=Decimal("220.00")
        ),
        actor=admin_actor,
    )

    inv_svc = InventoryService()
    async with UnitOfWork() as uow:
        await inv_svc.post(
            session=uow.session,
            company_id=company.id,
            movements=[
                MovementDraft(
                    variant_id=vM.id,
                    quantity=10,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("100.0000"),
                ),
                MovementDraft(
                    variant_id=vL.id,
                    quantity=10,
                    from_warehouse_id=None,
                    to_warehouse_id=warehouse.id,
                    from_status="available",
                    to_status="available",
                    movement_type="RECEIPT",
                    reference_type="INIT",
                    unit_cost=Decimal("110.0000"),
                ),
            ],
            user_id=admin_actor.id,
            actor=admin_actor,
        )
        await uow.commit()

    customer_id = generate_uuid7()

    # 1. Növbə açırıq (500 AZN nağd)
    open_res = await client.post(
        "/api/v1/pos/shifts/open",
        json={
            "register_id": str(register.id),
            "opening_cash": "500.00",
            "mismatch_reason": "Səhər növbəsi qalığı",
        },
        headers=admin_headers,
    )
    assert open_res.status_code == 201
    shift_id = open_res.json()["id"]

    # 2. Satış icra edirik (1 ədəd JKT-M = 200 AZN nağd)
    checkout_res = await client.post(
        "/api/v1/pos/sales",
        headers={**admin_headers, "Idempotency-Key": f"api-sale-{uuid.uuid4().hex}"},
        json={
            "register_id": str(register.id),
            "shift_id": shift_id,
            "items": [{"variant_id": str(vM.id), "quantity": 1}],
            "expected_grand_total": "200.00",
            "payments": [{"tender_type": "cash", "amount": "200.00", "tendered_amount": "200.00"}],
            "customer_id": str(customer_id),
        },
    )
    assert checkout_res.status_code == 201
    sale_data = checkout_res.json()
    sale_id = sale_data["sale_id"]

    # 3. GET /sales/{id}/returnable
    returnable_res = await client.get(
        f"/api/v1/sales/{sale_id}/returnable",
        headers=admin_headers,
    )
    assert returnable_res.status_code == 200
    ret_info = returnable_res.json()
    assert ret_info["is_within_window"] is True
    assert ret_info["lines"][0]["returnable_quantity"] == 1
    sale_line_id = ret_info["lines"][0]["sale_line_id"]

    # 4. POST /returns/quote
    quote_res = await client.post(
        "/api/v1/returns/quote",
        headers=admin_headers,
        json={
            "original_sale_id": str(sale_id),
            "branch_id": str(branch.id),
            "items": [
                {
                    "original_sale_line_id": str(sale_line_id),
                    "variant_id": str(vM.id),
                    "quantity": 1,
                    "reason_code": "WRONG_SIZE",
                    "condition": "RESALABLE",
                }
            ],
            "return_type": "REFUND",
        },
    )
    assert quote_res.status_code == 200
    q_data = quote_res.json()
    assert Decimal(q_data["refund_total"]) == Decimal("200.00")

    # 5. POST /returns (Idempotency-Key ilə qaytarma tamamlanması)
    return_res = await client.post(
        "/api/v1/returns",
        headers={**admin_headers, "Idempotency-Key": f"api-ret-{uuid.uuid4().hex}"},
        json={
            "original_sale_id": str(sale_id),
            "register_id": str(register.id),
            "shift_id": shift_id,
            "items": [
                {
                    "original_sale_line_id": str(sale_line_id),
                    "variant_id": str(vM.id),
                    "quantity": 1,
                    "reason_code": "WRONG_SIZE",
                    "condition": "RESALABLE",
                }
            ],
            "return_type": "REFUND",
            "refund_methods": [{"tender_type": "cash", "amount": "200.00"}],
            "customer_id": str(customer_id),
            "expected_refund_total": "200.00",
        },
    )
    assert return_res.status_code == 201
    return_payload = return_res.json()
    return_id = return_payload["return_id"]
    assert Decimal(return_payload["refund_total"]) == Decimal("200.00")
    assert "MALLARIN QAYTARILMASI ÇEKİ" in return_payload["esc_pos_text"]

    # 6. GET /returns
    list_res = await client.get("/api/v1/returns", headers=admin_headers)
    assert list_res.status_code == 200
    assert list_res.json()["total"] >= 1

    # 7. GET /returns/{id}
    detail_res = await client.get(f"/api/v1/returns/{return_id}", headers=admin_headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["status"] == "COMPLETED"

    # 8. POST /returns/{id}/reprint
    reprint_res = await client.post(f"/api/v1/returns/{return_id}/reprint", headers=admin_headers)
    assert reprint_res.status_code == 200
    assert reprint_res.json()["is_reprint"] is True
    assert "TƏKRAR ÇAP" in reprint_res.json()["esc_pos_text"]

    # 9. GET /returns/reasons
    reasons_res = await client.get("/api/v1/returns/reasons", headers=admin_headers)
    assert reasons_res.status_code == 200
    assert len(reasons_res.json()) >= 4

    # 10. GET /returns/customer/{customer_id}
    cust_res = await client.get(f"/api/v1/returns/customer/{customer_id}", headers=admin_headers)
    assert cust_res.status_code == 200
    assert cust_res.json()["total_returns_count"] >= 1

    # 11. GET /returns/fraud-indicators
    fraud_res = await client.get(
        f"/api/v1/returns/fraud-indicators?branch_id={branch.id}&start_date=2026-01-01&end_date=2026-12-31",
        headers=admin_headers,
    )
    assert fraud_res.status_code == 200
    assert "total_returns" in fraud_res.json()

    # 12. POST /returns/exchange (Yeni satış + Mübadilə)
    # İkinci satış: JKT-M = 200 AZN
    checkout2_res = await client.post(
        "/api/v1/pos/sales",
        headers={**admin_headers, "Idempotency-Key": f"api-sale2-{uuid.uuid4().hex}"},
        json={
            "register_id": str(register.id),
            "shift_id": shift_id,
            "items": [{"variant_id": str(vM.id), "quantity": 1}],
            "expected_grand_total": "200.00",
            "payments": [{"tender_type": "cash", "amount": "200.00", "tendered_amount": "200.00"}],
            "customer_id": str(customer_id),
        },
    )
    assert checkout2_res.status_code == 201
    sale2_id = checkout2_res.json()["sale_id"]

    ret_info2 = await client.get(f"/api/v1/sales/{sale2_id}/returnable", headers=admin_headers)
    sale2_line_id = ret_info2.json()["lines"][0]["sale_line_id"]

    # JKT-M (200 AZN) qaytarılır, JKT-L (220 AZN) alınır -> Xalis fərq: +20 AZN əlavə ödəniş!
    exchange_res = await client.post(
        "/api/v1/returns/exchange",
        headers={**admin_headers, "Idempotency-Key": f"api-exch-{uuid.uuid4().hex}"},
        json={
            "original_sale_id": str(sale2_id),
            "register_id": str(register.id),
            "shift_id": shift_id,
            "return_items": [
                {
                    "original_sale_line_id": str(sale2_line_id),
                    "variant_id": str(vM.id),
                    "quantity": 1,
                    "reason_code": "WRONG_SIZE",
                    "condition": "RESALABLE",
                }
            ],
            "new_sale_items": [{"variant_id": str(vL.id), "quantity": 1}],
            "payment_methods": [{"tender_type": "cash", "amount": "20.00"}],
            "customer_id": str(customer_id),
            "expected_net_difference": "20.00",
        },
    )
    assert exchange_res.status_code == 201
    ex_body = exchange_res.json()
    assert Decimal(ex_body["net_difference"]) == Decimal("20.00")
    assert "exchange_group_id" in ex_body
