"""POS Qiymət və Kalkulyasiya Mühərriki Vahid Testləri (Pricing & Quote Tests)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.core.errors import ManagerApprovalError
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.auth.policies import AuthenticatedUser
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import BranchService
from app.modules.catalog.models import TaxClass
from app.modules.catalog.schemas import CategoryCreate, ProductCreate, ProductVariantCreate
from app.modules.catalog.service import CatalogService
from app.modules.company.service import get_company_service
from app.modules.pos.policies import PosPolicy
from app.modules.pos.pricing import PricingService
from app.modules.pos.schemas import CartLineInput
from app.modules.settings.schemas import SettingUpdateRequest
from app.modules.settings.service import SettingsService


def get_actor_with_role(role: str, branch_id: uuid.UUID) -> AuthenticatedUser:
    perms = ["pos.discount.apply"]
    if role == "branch_manager":
        perms.append("pos.discount.override")
    return AuthenticatedUser(
        id=generate_uuid7(),
        username=f"user_{role}",
        email=f"{role}@brandhouse.az",
        full_name=f"İstifadəçi {role}",
        roles=[role],
        permissions=perms,
        allowed_branches=[branch_id],
        session_id=uuid.uuid4(),
    )


async def setup_catalog_item(
    company_id: uuid.UUID, price: Decimal, tax_rate_ref: str | None = None
) -> tuple[uuid.UUID, uuid.UUID]:
    """Test üçün məhsul və variant yaradır."""
    cat_svc = CatalogService()
    admin_actor = AuthenticatedUser(
        id=generate_uuid7(),
        username="cat_admin",
        email="cat_admin@brandhouse.az",
        full_name="Kataloq Admin",
        roles=["system_admin"],
        permissions=["catalog.product.manage", "catalog.price.manage"],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )

    # Kateqoriya
    cat = await cat_svc.create_category(
        data=CategoryCreate(
            name=f"Geyim-{uuid.uuid4().hex[:4]}",
            code=f"CAT-{uuid.uuid4().hex[:4].upper()}",
            level=1,
        ),
        company_id=company_id,
        actor=admin_actor,
    )

    tax_class_id = None
    if tax_rate_ref:
        async with UnitOfWork() as uow:
            tc = TaxClass(
                id=generate_uuid7(),
                company_id=company_id,
                code=f"TC-{uuid.uuid4().hex[:4].upper()}",
                name_az="Standart ƏDV",
                rate_ref=tax_rate_ref,
                is_active=True,
            )
            uow.session.add(tc)
            await uow.commit()
            tax_class_id = tc.id

    prod = await cat_svc.create_product(
        data=ProductCreate(
            name=f"Premium Köynək {uuid.uuid4().hex[:4]}",
            internal_code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
            section="Kişi",
            type="Geyim",
            category_id=cat.id,
            tax_class_id=tax_class_id,
        ),
        company_id=company_id,
        actor=admin_actor,
    )

    var = await cat_svc.create_variant(
        prod.id,
        ProductVariantCreate(
            sku=f"SKU-{uuid.uuid4().hex[:8].upper()}",
            barcode=None,
            size="L",
            color="Ağ",
            price_override=price,
        ),
        actor=admin_actor,
    )

    return prod.id, var.id


@pytest.mark.asyncio
async def test_quote_base_price_from_catalog() -> None:
    """Kataloqdan baza qiymətin düzgün oxunması və hesablanması."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Gənclik Filialı",
            address="Fətəli Xan Xoyski 12",
            phone="+994125550101",
        ),
    )

    _, variant_id = await setup_catalog_item(company.id, price=Decimal("49.90"))
    cashier = get_actor_with_role("cashier", branch.id)
    pricing = PricingService()

    async with UnitOfWork() as uow:
        quote = await pricing.quote(
            session=uow.session,
            company_id=company.id,
            branch_id=branch.id,
            items=[CartLineInput(variant_id=variant_id, quantity=2)],
            actor=cashier,
        )

    # 49.90 * 2 = 99.80 AZN
    assert quote.subtotal == Decimal("99.80")
    assert quote.discount_total == Decimal("0.00")
    assert quote.net_subtotal == Decimal("99.80")
    assert quote.tax_total == Decimal("0.00")
    assert quote.grand_total == Decimal("99.80")
    assert len(quote.items) == 1
    assert quote.items[0].unit_price == Decimal("49.90")
    assert quote.items[0].gross_amount == Decimal("99.80")


@pytest.mark.asyncio
async def test_quote_line_manual_discount_and_role_limits() -> None:
    """Kassir rolunun 5% limitinin yoxlanışı və menecer tokeni ilə aşılması."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Sahil Filialı",
            address="Nizami küç. 20",
            phone="+994125550102",
        ),
    )

    _, variant_id = await setup_catalog_item(company.id, price=Decimal("100.00"))
    cashier = get_actor_with_role("cashier", branch.id)
    pricing = PricingService()

    # 1. 5% endirim kassir üçün icazəlidir (100 * 0.05 = 5.00 AZN endirim)
    async with UnitOfWork() as uow:
        q1 = await pricing.quote(
            session=uow.session,
            company_id=company.id,
            branch_id=branch.id,
            items=[
                CartLineInput(variant_id=variant_id, quantity=1, discount_percent=Decimal("5.00"))
            ],
            actor=cashier,
        )
    assert q1.subtotal == Decimal("100.00")
    assert q1.discount_total == Decimal("5.00")
    assert q1.grand_total == Decimal("95.00")

    # 2. 10% endirim kassir üçün limitdən (5%) artıqdır və tokensiz rədd edilməlidir
    async with UnitOfWork() as uow:
        with pytest.raises(ManagerApprovalError):
            await pricing.quote(
                session=uow.session,
                company_id=company.id,
                branch_id=branch.id,
                items=[
                    CartLineInput(
                        variant_id=variant_id, quantity=1, discount_percent=Decimal("10.00")
                    )
                ],
                actor=cashier,
            )

    # 3. Menecer təsdiq tokeni ilə 10% endirim icazə verilməlidir
    token = PosPolicy.create_manager_approval_token(
        manager_id=uuid.uuid4(),
        action="pos.discount.override",
        branch_id=branch.id,
        max_amount=Decimal("15.00"),
    )

    async with UnitOfWork() as uow:
        q2 = await pricing.quote(
            session=uow.session,
            company_id=company.id,
            branch_id=branch.id,
            items=[
                CartLineInput(variant_id=variant_id, quantity=1, discount_percent=Decimal("10.00"))
            ],
            manager_approval_token=token,
            actor=cashier,
        )
    assert q2.discount_total == Decimal("10.00")
    assert q2.grand_total == Decimal("90.00")


@pytest.mark.asyncio
async def test_quote_receipt_discount_proportional_distribution() -> None:
    """Qəbz səviyyəli endirimin sətirlərə mütənasib bölünməsi və qalıq qəpiyin qorunması."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Nərimanov Filialı",
            address="Təbriz küç. 40",
            phone="+994125550103",
        ),
    )

    _, var1 = await setup_catalog_item(company.id, price=Decimal("60.00"))
    _, var2 = await setup_catalog_item(company.id, price=Decimal("40.00"))
    manager = get_actor_with_role("branch_manager", branch.id)
    pricing = PricingService()

    # Ümumi subtotal: 60 + 40 = 100 AZN. Qəbz endirimi: 10 AZN (10%).
    # Line 1 payı: 60 * 10% = 6.00 AZN
    # Line 2 payı: 40 * 10% = 4.00 AZN
    async with UnitOfWork() as uow:
        quote = await pricing.quote(
            session=uow.session,
            company_id=company.id,
            branch_id=branch.id,
            items=[
                CartLineInput(variant_id=var1, quantity=1),
                CartLineInput(variant_id=var2, quantity=1),
            ],
            receipt_discount_amount=Decimal("10.00"),
            actor=manager,
        )

    assert quote.subtotal == Decimal("100.00")
    assert quote.discount_total == Decimal("10.00")
    assert quote.grand_total == Decimal("90.00")
    assert quote.items[0].discount_amount == Decimal("6.00")
    assert quote.items[0].total_amount == Decimal("54.00")
    assert quote.items[1].discount_amount == Decimal("4.00")
    assert quote.items[1].total_amount == Decimal("36.00")
    assert quote.items[0].total_amount + quote.items[1].total_amount == quote.grand_total


@pytest.mark.asyncio
async def test_quote_with_tax_rate() -> None:
    """Vergi sinfi üzrə ƏDV hesablanması."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Elmlər Filialı",
            address="Z.Xəlilov küç. 15",
            phone="+994125550104",
        ),
    )

    # Settings-də tax_rates konfiqurasiya edirik (18%)
    admin_actor = AuthenticatedUser(
        id=generate_uuid7(),
        username="sys_admin",
        email="admin@brandhouse.az",
        full_name="Admin",
        roles=["system_admin"],
        permissions=["system.settings.manage"],
        allowed_branches=[],
        session_id=uuid.uuid4(),
    )
    settings_svc = SettingsService()
    await settings_svc.update_setting(
        key="tax_rates",
        data=SettingUpdateRequest(
            value=[{"code": "VAT_18", "rate": 18.0, "name_az": "Əsas ƏDV 18%"}],
            reason="18% ƏDV dərəcəsi təyin edildi",
        ),
        actor=admin_actor,
    )

    _, variant_id = await setup_catalog_item(
        company.id, price=Decimal("100.00"), tax_rate_ref="VAT_18"
    )
    manager = get_actor_with_role("branch_manager", branch.id)
    pricing = PricingService()

    async with UnitOfWork() as uow:
        quote = await pricing.quote(
            session=uow.session,
            company_id=company.id,
            branch_id=branch.id,
            items=[CartLineInput(variant_id=variant_id, quantity=1)],
            actor=manager,
        )

    # 100 AZN + 18% ƏDV = 118 AZN
    assert quote.subtotal == Decimal("100.00")
    assert quote.tax_total == Decimal("18.00")
    assert quote.grand_total == Decimal("118.00")
    assert quote.items[0].tax_rate == Decimal("18.00")
    assert quote.items[0].tax_amount == Decimal("18.00")
    assert quote.items[0].total_amount == Decimal("118.00")


@pytest.mark.asyncio
async def test_quote_penny_rounding_integrity() -> None:
    """Kəsrli qəpiklər və yuvarlaqlaşdırma dəqiqliyi (ROUND_HALF_UP)."""
    company = await get_company_service().get_company()
    b_svc = BranchService()
    branch = await b_svc.create_branch(
        company_id=company.id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="Xətai Filialı",
            address="Xocalı pr. 10",
            phone="+994125550105",
        ),
    )

    # 14.33 AZN qiymətli 3 ədəd = 42.99 AZN subtotal
    _, variant_id = await setup_catalog_item(company.id, price=Decimal("14.33"))
    cashier = get_actor_with_role("cashier", branch.id)
    pricing = PricingService()

    # 3% endirim: 42.99 * 0.03 = 1.2897 -> round_money = 1.29 AZN
    async with UnitOfWork() as uow:
        quote = await pricing.quote(
            session=uow.session,
            company_id=company.id,
            branch_id=branch.id,
            items=[
                CartLineInput(variant_id=variant_id, quantity=3, discount_percent=Decimal("3.00"))
            ],
            actor=cashier,
        )

    assert quote.subtotal == Decimal("42.99")
    assert quote.discount_total == Decimal("1.29")
    assert quote.grand_total == Decimal("41.70")
    # subtotal - discount_total + tax_total == grand_total
    assert quote.subtotal - quote.discount_total + quote.tax_total == quote.grand_total
