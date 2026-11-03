"""POS Kassa Növbələri və Nağd Pul Əməliyyatları Vahid Testləri (Shift Unit Tests)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.core.errors import (
    BusinessRuleViolationError,
    ManagerApprovalError,
    TokenReuseDetectedError,
    ValidationError,
)
from app.core.ids import generate_uuid7
from app.modules.auth.policies import AuthenticatedUser
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import BranchService
from app.modules.cash_registers.schemas import CashRegisterCreate
from app.modules.cash_registers.service import CashRegisterService
from app.modules.company.service import get_company_service
from app.modules.pos.policies import PosPolicy
from app.modules.pos.schemas import (
    CashMovementCreate,
    ShiftCloseRequest,
    ShiftOpenRequest,
    ShiftReopenRequest,
)
from app.modules.pos.service import PosService
from app.modules.warehouses.schemas import WarehouseCreate
from app.modules.warehouses.service import WarehouseService


def get_admin_actor(branch_id: uuid.UUID | None = None) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="pos_admin",
        email="pos_admin@brandhouse.az",
        full_name="POS Administrator",
        roles=["system_admin", "branch_manager"],
        permissions=[
            "pos.shift.open",
            "pos.shift.close",
            "pos.shift.reopen",
            "pos.sale.create",
            "pos.sale.cancel",
            "pos.sale.reprint",
            "pos.discount.apply",
            "pos.discount.override",
            "pos.cash.in",
            "pos.cash.out",
            "pos.cart.suspend",
            "sales.view",
            "sales.cost.view",
            "system.branches.all",
        ],
        allowed_branches=[branch_id] if branch_id else [],
        session_id=uuid.uuid4(),
    )


def get_cashier_actor(branch_id: uuid.UUID) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=generate_uuid7(),
        username="cashier_1",
        email="cashier1@brandhouse.az",
        full_name="Kassir Aygün",
        roles=["cashier"],
        permissions=[
            "pos.shift.open",
            "pos.shift.close",
            "pos.sale.create",
            "pos.sale.reprint",
            "pos.discount.apply",
            "pos.cash.in",
            "pos.cash.out",
            "pos.cart.suspend",
            "sales.view",
        ],
        allowed_branches=[branch_id],
        session_id=uuid.uuid4(),
    )


async def create_branch_and_register(
    company_id: uuid.UUID,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Test üçün filial, anbar və kassa aparatı yaradır."""
    b_svc = BranchService()
    w_svc = WarehouseService()
    r_svc = CashRegisterService()

    b = await b_svc.create_branch(
        company_id=company_id,
        data=BranchCreate(
            code=f"B-{uuid.uuid4().hex[:4].upper()}",
            name="28 May Filialı",
            address="28 May küç. 45",
            phone="+994125550101",
        ),
    )

    w = await w_svc.create_warehouse(
        company_id=company_id,
        data=WarehouseCreate(
            code=f"W-{uuid.uuid4().hex[:4].upper()}",
            name="28 May Satış Anbarı",
            branch_id=b.id,
            warehouse_type="branch",
        ),
    )

    reg = await r_svc.create_register(
        company_id=company_id,
        data=CashRegisterCreate(
            branch_id=b.id,
            default_warehouse_id=w.id,
            code=f"REG-{uuid.uuid4().hex[:4].upper()}",
            name="Kassa-1",
        ),
    )

    return b.id, w.id, reg.id


@pytest.mark.asyncio
async def test_shift_open_success_and_single_open_constraint() -> None:
    """Növbənin açılması və bir kassada yalnız tək aktiv növbə məhdudiyyəti."""
    company = await get_company_service().get_company()
    branch_id, _, register_id = await create_branch_and_register(company.id)
    actor = get_admin_actor(branch_id)
    pos_service = PosService()

    # 1. Növbə açırıq (standart 100 AZN float ilə)
    shift_res = await pos_service.open_shift(
        request=ShiftOpenRequest(
            register_id=register_id,
            opening_cash=Decimal("100.00"),
            opening_denominations={"100": 1},
        ),
        company_id=company.id,
        actor=actor,
    )

    assert shift_res.id is not None
    assert shift_res.register_id == register_id
    assert shift_res.status == "OPEN"
    assert shift_res.opening_cash == Decimal("100.00")
    assert "SH-" in shift_res.shift_no

    # 2. Eyni kassa aparatında ikinci açıq növbə açmaq cəhdi rədd edilməlidir
    with pytest.raises(BusinessRuleViolationError) as exc:
        await pos_service.open_shift(
            request=ShiftOpenRequest(
                register_id=register_id,
                opening_cash=Decimal("100.00"),
            ),
            company_id=company.id,
            actor=actor,
        )
    assert exc.value.code == "SHIFT_ALREADY_OPEN"


@pytest.mark.asyncio
async def test_shift_open_float_mismatch_requires_reason() -> None:
    """İlkin qalıq gözlənilən məbləğdən fərqləndikdə səbəbin tələb olunması."""
    company = await get_company_service().get_company()
    branch_id, _, register_id = await create_branch_and_register(company.id)
    actor = get_admin_actor(branch_id)
    pos_service = PosService()

    # Səbəbsiz fərqli qalıq daxil edilməsi xəta verməlidir
    with pytest.raises(ValidationError):
        await pos_service.open_shift(
            request=ShiftOpenRequest(
                register_id=register_id,
                opening_cash=Decimal("150.00"),
                mismatch_reason=None,
            ),
            company_id=company.id,
            actor=actor,
        )

    # Səbəb göstərildikdə uğurla açılmalıdır
    shift_res = await pos_service.open_shift(
        request=ShiftOpenRequest(
            register_id=register_id,
            opening_cash=Decimal("150.00"),
            mismatch_reason="Dünənki növbədən əlavə qəpik təhvil verilib",
        ),
        company_id=company.id,
        actor=actor,
    )
    assert shift_res.opening_cash == Decimal("150.00")


@pytest.mark.asyncio
async def test_cash_movement_and_manager_threshold() -> None:
    """Kassaya nağd daxil/xaric və limitdən yuxarı menecer tokeni tələbi."""
    company = await get_company_service().get_company()
    branch_id, _, register_id = await create_branch_and_register(company.id)
    actor = get_admin_actor(branch_id)
    pos_service = PosService()

    shift = await pos_service.open_shift(
        request=ShiftOpenRequest(register_id=register_id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=actor,
    )

    # 1. Standart məbləğdə CASH_IN (limit 200 AZN-dən az)
    m1 = await pos_service.record_cash_movement(
        shift_id=shift.id,
        request=CashMovementCreate(
            movement_type="CASH_IN",
            amount=Decimal("50.00"),
            reason_code="FLOAT_TOPUP",
            notes="Xırda pul əlavəsi",
        ),
        actor=actor,
    )
    assert m1.movement_type == "CASH_IN"
    assert m1.amount == Decimal("50.00")

    # 2. Limitdən yuxarı (məs: 500 AZN) DROP əməliyyatı tokensiz rədd edilməlidir
    with pytest.raises(ManagerApprovalError):
        await pos_service.record_cash_movement(
            shift_id=shift.id,
            request=CashMovementCreate(
                movement_type="DROP",
                amount=Decimal("500.00"),
                reason_code="SAFE_DROP",
                manager_approval_token=None,
            ),
            actor=actor,
        )

    # 3. Menecer tokeni ilə DROP əməliyyatı uğurla tamamlanmalıdır
    token = PosPolicy.create_manager_approval_token(
        manager_id=actor.id,
        action="pos.cash.movement",
        branch_id=branch_id,
        max_amount=Decimal("1000.00"),
    )

    m2 = await pos_service.record_cash_movement(
        shift_id=shift.id,
        request=CashMovementCreate(
            movement_type="DROP",
            amount=Decimal("500.00"),
            reason_code="SAFE_DROP",
            manager_approval_token=token,
        ),
        actor=actor,
    )
    assert m2.movement_type == "DROP"
    assert m2.amount == Decimal("500.00")
    assert m2.approved_by_id == actor.id


@pytest.mark.asyncio
async def test_shift_close_math_and_z_report() -> None:
    """Növbə bağlanış riyaziyyatı: expected = opening + in - out - drops."""
    company = await get_company_service().get_company()
    branch_id, _, register_id = await create_branch_and_register(company.id)
    actor = get_admin_actor(branch_id)
    pos_service = PosService()

    shift = await pos_service.open_shift(
        request=ShiftOpenRequest(register_id=register_id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=actor,
    )

    # CASH_IN: +50 AZN
    await pos_service.record_cash_movement(
        shift_id=shift.id,
        request=CashMovementCreate(
            movement_type="CASH_IN",
            amount=Decimal("50.00"),
            reason_code="TOPUP",
        ),
        actor=actor,
    )

    # CASH_OUT: -20 AZN
    await pos_service.record_cash_movement(
        shift_id=shift.id,
        request=CashMovementCreate(
            movement_type="CASH_OUT",
            amount=Decimal("20.00"),
            reason_code="PETTY_EXPENSE",
        ),
        actor=actor,
    )

    # DROP: -30 AZN
    await pos_service.record_cash_movement(
        shift_id=shift.id,
        request=CashMovementCreate(
            movement_type="DROP",
            amount=Decimal("30.00"),
            reason_code="MIDDAY_DROP",
        ),
        actor=actor,
    )

    # Aralıq X-Hesabat
    x_rep = await pos_service.get_shift_x_report(shift_id=shift.id, actor=actor)
    # expected = 100 + 50 - 20 - 30 = 100 AZN
    assert x_rep.expected_cash == Decimal("100.00")
    assert x_rep.cash_in_total == Decimal("50.00")
    assert x_rep.cash_out_total == Decimal("20.00")
    assert x_rep.drops_total == Decimal("30.00")

    # Yekun Z-Hesabat ilə növbəni bağlayırıq (Dəqiq sayılan = 100 AZN)
    z_rep = await pos_service.close_shift(
        shift_id=shift.id,
        request=ShiftCloseRequest(
            counted_cash=Decimal("100.00"),
            closing_notes="Tam uyğun bağlandı",
        ),
        actor=actor,
    )
    assert z_rep.expected_cash == Decimal("100.00")
    assert z_rep.counted_cash == Decimal("100.00")
    assert z_rep.variance == Decimal("0.00")
    assert z_rep.report_type == "Z_REPORT"


@pytest.mark.asyncio
async def test_shift_close_variance_requires_manager_token() -> None:
    """Kassa fərqi dözümlülükdən (> 5 AZN) böyük olduqda izahat və menecer tokeni tələbi."""
    company = await get_company_service().get_company()
    branch_id, _, register_id = await create_branch_and_register(company.id)
    actor = get_admin_actor(branch_id)
    pos_service = PosService()

    shift = await pos_service.open_shift(
        request=ShiftOpenRequest(register_id=register_id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=actor,
    )

    # 1. 10 AZN kəsir var (Sayılmış: 90 AZN, Gözlənilən: 100 AZN). İzahat yoxdur -> Xəta
    with pytest.raises(ValidationError):
        await pos_service.close_shift(
            shift_id=shift.id,
            request=ShiftCloseRequest(
                counted_cash=Decimal("90.00"),
                variance_explanation=None,
            ),
            actor=actor,
        )

    # 2. İzahat var amma menecer tokeni yoxdur -> ManagerApprovalError
    with pytest.raises(ManagerApprovalError):
        await pos_service.close_shift(
            shift_id=shift.id,
            request=ShiftCloseRequest(
                counted_cash=Decimal("90.00"),
                variance_explanation="10 AZN kassa kəsiri aşkarlandı",
                manager_approval_token=None,
            ),
            actor=actor,
        )

    # 3. Menecer təsdiq tokeni ilə uğurla bağlanmalıdır
    token = PosPolicy.create_manager_approval_token(
        manager_id=actor.id,
        action="pos.shift.variance",
        branch_id=branch_id,
        max_amount=Decimal("50.00"),
    )

    z_rep = await pos_service.close_shift(
        shift_id=shift.id,
        request=ShiftCloseRequest(
            counted_cash=Decimal("90.00"),
            variance_explanation="10 AZN kassa kəsiri",
            manager_approval_token=token,
        ),
        actor=actor,
    )
    assert z_rep.variance == Decimal("-10.00")


@pytest.mark.asyncio
async def test_reopen_shift_and_lock_after_close() -> None:
    """Bağlanmış növbənin kilidlənməsi və təkrar açılması."""
    company = await get_company_service().get_company()
    branch_id, _, register_id = await create_branch_and_register(company.id)
    actor = get_admin_actor(branch_id)
    pos_service = PosService()

    shift = await pos_service.open_shift(
        request=ShiftOpenRequest(register_id=register_id, opening_cash=Decimal("100.00")),
        company_id=company.id,
        actor=actor,
    )
    await pos_service.close_shift(
        shift_id=shift.id,
        request=ShiftCloseRequest(counted_cash=Decimal("100.00")),
        actor=actor,
    )

    # Bağlanmış növbədə nağd hərəkət qadağandır
    with pytest.raises(BusinessRuleViolationError) as exc:
        await pos_service.record_cash_movement(
            shift_id=shift.id,
            request=CashMovementCreate(
                movement_type="CASH_IN",
                amount=Decimal("10.00"),
                reason_code="EXTRA",
            ),
            actor=actor,
        )
    assert exc.value.code == "SHIFT_NOT_OPEN"

    # Növbəni təkrar açırıq
    token = PosPolicy.create_manager_approval_token(
        manager_id=actor.id,
        action="pos.shift.reopen",
        branch_id=branch_id,
    )

    reopened = await pos_service.reopen_shift(
        shift_id=shift.id,
        request=ShiftReopenRequest(
            reason="Unudulmuş kassa qeydi üçün təkrar açıldı",
            manager_approval_token=token,
        ),
        actor=actor,
    )
    assert reopened.status == "OPEN"

    # Növbəni yenidən bağlayırıq
    await pos_service.close_shift(
        shift_id=shift.id,
        request=ShiftCloseRequest(counted_cash=Decimal("100.00")),
        actor=actor,
    )

    # Eyni tokenin təkrar istifadəsi rədd edilməlidir (Token replay prevention)
    with pytest.raises(TokenReuseDetectedError):
        await pos_service.reopen_shift(
            shift_id=shift.id,
            request=ShiftReopenRequest(
                reason="Təkrar istifadə cəhdi",
                manager_approval_token=token,
            ),
            actor=actor,
        )
