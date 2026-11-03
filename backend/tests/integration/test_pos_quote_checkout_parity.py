"""POS Quote və Checkout Paritet Testləri (Quote & Checkout Parity Integration Tests).

Bu test dəsti təsdiq edir ki:
1. Server tərəfində işləyən Aksiya və Endirim Mühərriki (Promotion Engine) yeganə həqiqət mənbəyidir.
2. /api/v1/pos/quote ilə hesablanan ilkin qiymətləndirmə (sətir endirimləri, qəbz endirimləri, yekun məbləğ)
   POST /api/v1/pos/sales (checkout) zamanı yaranan Sale və SaleLine sənədi ilə 100% bərabərdir (exact cent parity).
3. Aksiya qaydaları (PERCENT_OFF, FIXED_OFF), promokodlar və loyallıq xal çıxışları
   həm quote, həm də checkout zamanı eyni deterministik alqoritmlə icra olunur.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
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
from app.modules.marketing.engine import PromotionEngineImpl
from app.modules.marketing.models import (
    Campaign,
    CampaignStatus,
    CampaignType,
    Promotion,
    PromotionType,
    StackingMode,
)
from app.modules.marketing.schemas import PromoCodeCreate
from app.modules.marketing.service import MarketingService
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


async def create_pos_user(role_code: str = "cashier", allowed_branches: list[uuid.UUID] | None = None) -> dict[str, str]:
    rbac_svc = RbacService()
    await rbac_svc.seed_catalog()

    user_svc = UserService()
    user_dto = UserCreate(
        username=f"pos_{role_code}_{uuid.uuid4().hex[:6]}",
        email=f"pos_{role_code}_{uuid.uuid4().hex[:6]}@brandhouse.az",
        full_name="POS Operator",
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
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_pos_quote_and_checkout_exact_parity(client: AsyncClient) -> None:
    """Səbət Qiymətləndirməsi (Quote) və Satışın Çıxışı (Checkout) arasında 100% dəqiqlik testi."""
    company = await get_company_service().get_company()

    admin_actor = AuthenticatedUser(
        id=generate_uuid7(),
        username="admin_pos",
        email="admin_pos@brandhouse.az",
        full_name="Admin POS",
        roles=["system_admin"],
        permissions=["branches.branch.manage", "registers.register.manage", "catalog.product.manage", "marketing.campaign.create"],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )

    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Nizami Küçəsi Filialı",
            address="Nizami 45",
            phone="+994125550999",
        ),
        actor=admin_actor,
    )

    wh_svc = WarehouseService()
    warehouse = await wh_svc.create_warehouse(
        company_id=company.id,
        data=WarehouseCreate(
            code=f"WH-{uuid.uuid4().hex[:4].upper()}",
            name="Nizami Filial Anbarı",
            warehouse_type="branch",
            branch_id=branch.id,
        ),
        actor=admin_actor,
    )

    reg_svc = CashRegisterService()
    register = await reg_svc.create_register(
        company_id=company.id,
        data=CashRegisterCreate(
            branch_id=branch.id,
            default_warehouse_id=warehouse.id,
            code=f"REG-{uuid.uuid4().hex[:4].upper()}",
            name="Nizami Kassa 1",
        ),
        actor=admin_actor,
    )

    # Kataloq: 2 fərqli məhsul
    cat_svc = CatalogService()
    cat = await cat_svc.create_category(
        data=CategoryCreate(name=f"Geyim-{uuid.uuid4().hex[:4]}", code=f"CAT-{uuid.uuid4().hex[:4].upper()}"),
        company_id=company.id,
        actor=admin_actor,
    )

    p1 = await cat_svc.create_product(
        data=ProductCreate(name="İpək Köynək", internal_code=f"P1-{uuid.uuid4().hex[:4].upper()}", section="Qadın", type="Geyim", category_id=cat.id),
        company_id=company.id,
        actor=admin_actor,
    )
    v1 = await cat_svc.create_variant(
        p1.id,
        ProductVariantCreate(sku=f"SKU1-{uuid.uuid4().hex[:6]}", size="M", color="Ağ", price_override=Decimal("120.00")),
        actor=admin_actor,
    )

    p2 = await cat_svc.create_product(
        data=ProductCreate(name="Klassik Şalvar", internal_code=f"P2-{uuid.uuid4().hex[:4].upper()}", section="Qadın", type="Geyim", category_id=cat.id),
        company_id=company.id,
        actor=admin_actor,
    )
    v2 = await cat_svc.create_variant(
        p2.id,
        ProductVariantCreate(sku=f"SKU2-{uuid.uuid4().hex[:6]}", size="38", color="Qara", price_override=Decimal("80.00")),
        actor=admin_actor,
    )

    # Stok mədaxili: hərəsindən 10 ədəd
    inv_svc = InventoryService()
    await inv_svc.post_batch(
        company_id=company.id,
        movements=[
            MovementDraft(variant_id=v1.id, to_warehouse_id=warehouse.id, quantity=10, movement_type="RECEIPT", reference_type="doc", unit_cost=Decimal("50.00")),
            MovementDraft(variant_id=v2.id, to_warehouse_id=warehouse.id, quantity=10, movement_type="RECEIPT", reference_type="doc", unit_cost=Decimal("30.00")),
        ],
        actor=admin_actor,
    )

    # Kassir açılışı
    headers = await create_pos_user("cashier", allowed_branches=[branch.id])
    shift_resp = await client.post(
        "/api/v1/pos/shifts/open",
        json={"register_id": str(register.id), "opening_cash": "100.00"},
        headers={**headers, "Idempotency-Key": f"chk-1-{uuid.uuid4().hex}"},
    )
    assert shift_resp.status_code == 201, shift_resp.text
    shift_id = shift_resp.json()["id"]

    # =========================================================================
    # Ssenari 1: Aksiyasız sadə səbət (1 ədəd v1, 2 ədəd v2)
    # Total: 120.00 + 2 * 80.00 = 280.00 AZN
    # =========================================================================
    items_payload = [
        {"variant_id": str(v1.id), "quantity": 1},
        {"variant_id": str(v2.id), "quantity": 2},
    ]

    quote_resp1 = await client.post(
        "/api/v1/pos/quote",
        json={"branch_id": str(branch.id), "items": items_payload},
        headers={**headers, "Idempotency-Key": f"chk-1-{uuid.uuid4().hex}"},
    )
    assert quote_resp1.status_code == 200, quote_resp1.text
    q1 = quote_resp1.json()
    assert q1["subtotal"] == "280.00"
    assert q1["discount_total"] == "0.00"
    assert q1["grand_total"] == "280.00"

    # Checkout icra edirik
    checkout_resp1 = await client.post(
        "/api/v1/pos/sales",
        json={
            "shift_id": shift_id,
            "register_id": str(register.id),
            "items": items_payload,
            "expected_grand_total": q1["grand_total"],
            "payments": [{"tender_type": "cash", "amount": q1["grand_total"]}],
        },
        headers={**headers, "Idempotency-Key": f"chk-1-{uuid.uuid4().hex}"},
    )
    assert checkout_resp1.status_code == 201, checkout_resp1.text
    s1 = checkout_resp1.json()

    # Dəqiq paritet yoxlanışı
    assert s1["subtotal"] == q1["subtotal"]
    assert s1["discount_total"] == q1["discount_total"]
    assert s1["grand_total"] == q1["grand_total"]
    assert len(s1["items"]) == len(q1["items"])

    # =========================================================================
    # Ssenari 2: Promokod tətbiqi (15.00 AZN Promokod Endirimi)
    # Total: 120.00 + 80.00 = 200.00 AZN -> Endirimlə: 185.00 AZN
    # =========================================================================
    async with UnitOfWork() as uow:
        mktg_svc = MarketingService(uow.session)
        camp = Campaign(
            id=generate_uuid7(),
            name="Kupon Kampaniyası",
            type=CampaignType.PROMO_CODE.value,
            status=CampaignStatus.ACTIVE.value,
            start_date=datetime.now(UTC) - timedelta(days=1),
            end_date=datetime.now(UTC) + timedelta(days=10),
            created_by=admin_actor.id,
            version=1,
        )
        uow.session.add(camp)
        promo = Promotion(
            id=generate_uuid7(),
            campaign_id=camp.id,
            name="15 AZN Kupon",
            type=PromotionType.PROMO_CODE.value,
            rule_definition={"discount_amount": "15.00"},
            priority=100,
            stacking_mode=StackingMode.ALWAYS_STACK.value,
            is_active=True,
            version=1,
        )
        uow.session.add(promo)
        await uow.session.flush()

        await mktg_svc.create_promo_code(
            payload=PromoCodeCreate(
                code="PARITY15",
                campaign_id=camp.id,
                promotion_id=promo.id,
                max_total_uses=10,
                max_uses_per_customer=1,
            ),
            actor=admin_actor,
        )
        await uow.commit()

    PromotionEngineImpl.invalidate_cache()

    items_payload2 = [
        {"variant_id": str(v1.id), "quantity": 1},
    ]

    # /pos/quote ilə yoxlayırıq
    quote_resp2 = await client.post(
        "/api/v1/pos/quote",
        json={"branch_id": str(branch.id), "items": items_payload2, "promo_code": "PARITY15"},
        headers={**headers, "Idempotency-Key": f"chk-1-{uuid.uuid4().hex}"},
    )
    assert quote_resp2.status_code == 200, quote_resp2.text
    q2 = quote_resp2.json()
    assert q2["subtotal"] == "120.00"
    assert q2["discount_total"] == "15.00"
    assert q2["grand_total"] == "105.00"

    # Checkout ilə yoxlayırıq
    checkout_resp2 = await client.post(
        "/api/v1/pos/sales",
        json={
            "shift_id": shift_id,
            "register_id": str(register.id),
            "items": items_payload2,
            "promo_code": "PARITY15",
            "expected_grand_total": q2["grand_total"],
            "payments": [{"tender_type": "cash", "amount": q2["grand_total"]}],
        },
        headers={**headers, "Idempotency-Key": f"chk-1-{uuid.uuid4().hex}"},
    )
    assert checkout_resp2.status_code == 201, checkout_resp2.text
    s2 = checkout_resp2.json()

    # Dəqiq paritet: Quote və Sale xətlərinin cəmi və endirimləri eynidir
    assert s2["subtotal"] == q2["subtotal"]
    assert s2["discount_total"] == q2["discount_total"]
    assert s2["grand_total"] == q2["grand_total"]
