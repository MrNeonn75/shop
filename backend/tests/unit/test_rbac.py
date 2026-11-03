"""RBAC və Səlahiyyət İdarəetməsi Vahid Testləri (Unit Tests for RBAC).

Əhatə dairəsi:
1. `require_permission` icazə yoxlayıcı dependency-si.
2. `BranchScope` filial təcridi və sorğu filtrləməsi (CrossBranchAccessError).
3. Müvəqqəti icazələr (Temporary Grants) və effektiv icazələrin hesablanması.
4. Sonuncu administratorun qorunması (Last Admin Protection).
5. Vəzifələrin bölünməsi ziddiyyətləri (SoD Conflicts & Verification).
6. Həssas məlumatların maskalanması (Sensitive Field Masking).
"""

from __future__ import annotations

import types
from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    CrossBranchAccessError,
    ForbiddenError,
    LastAdminProtectionError,
    NotFoundError,
    SegregationOfDutiesError,
    UnauthenticatedError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.rbac.policies import (
    BranchScope,
    mask_sensitive_fields,
    require_permission,
    verify_segregation_of_duties,
)
from app.modules.rbac.schemas import (
    RoleCreate,
    RoleUpdate,
    TemporaryGrantCreate,
)
from app.modules.rbac.service import RbacService
from app.modules.users.models import User
from app.modules.users.schemas import UserCreate, UserStatusUpdate
from app.modules.users.service import UserService


@pytest.fixture
def rbac_service() -> RbacService:
    return RbacService()


@pytest.fixture
def user_service() -> UserService:
    return UserService()


@pytest.mark.asyncio
async def test_require_permission_dependency() -> None:
    """`require_permission` dependency-sinin icazə və autentifikasiya yoxlanışlarını təsdiqləyir."""
    check_pos = require_permission("pos.sale.create")

    # 1. Autentifikasiya olunmamış sorğu (user yoxdur)
    req_unauth = MagicMock()
    req_unauth.state = types.SimpleNamespace(user=None)
    with pytest.raises(UnauthenticatedError):
        await check_pos(req_unauth)

    # 2. Sistem administratoru (bütün icazələrə birbaşa çıxış)
    admin_user = types.SimpleNamespace(id=generate_uuid7(), roles=["system_admin"], permissions=[])
    req_admin = MagicMock()
    req_admin.state = types.SimpleNamespace(user=admin_user)
    res_admin = await check_pos(req_admin)
    assert res_admin == admin_user

    # 3. Lazımi icazəyə malik istifadəçi
    pos_user = types.SimpleNamespace(
        id=generate_uuid7(), roles=["cashier"], permissions=["pos.sale.create"]
    )
    req_pos = MagicMock()
    req_pos.state = types.SimpleNamespace(user=pos_user)
    res_pos = await check_pos(req_pos)
    assert res_pos == pos_user

    # 4. Lazımi icazəsi olmayan istifadəçi
    limited_user = types.SimpleNamespace(
        id=generate_uuid7(), roles=["cashier"], permissions=["pos.shift.close"]
    )
    req_limited = MagicMock()
    req_limited.state = types.SimpleNamespace(user=limited_user)
    with pytest.raises(ForbiddenError):
        await check_pos(req_limited)


def test_branch_scope_isolation() -> None:
    """`BranchScope` vasitəsilə filial məlumatlarının tam təcrid olunduğunu yoxlayır."""
    branch_1 = generate_uuid7()
    branch_2 = generate_uuid7()

    # Bütün filiallara icazəsi olan istifadəçi (system_admin və ya system.branches.all)
    global_scope = BranchScope(
        user_id=generate_uuid7(), is_all_branches=True, allowed_branch_ids=set()
    )
    assert global_scope.has_access_to(branch_1) is True
    assert global_scope.has_access_to(branch_2) is True
    global_scope.ensure_branch_access(branch_1)

    # Tək filiala icazəsi olan istifadəçi (Branch Manager / Cashier)
    local_scope = BranchScope(
        user_id=generate_uuid7(), is_all_branches=False, allowed_branch_ids={branch_1}
    )
    assert local_scope.has_access_to(branch_1) is True
    assert local_scope.has_access_to(branch_2) is False
    with pytest.raises(CrossBranchAccessError):
        local_scope.ensure_branch_access(branch_2)

    # SQLAlchemy sorğusuna filtr tətbiqi
    q = select(User)
    filtered_global = global_scope.filter_query(q, User.id)
    assert str(filtered_global) == str(q)

    filtered_local = local_scope.filter_query(q, User.id)
    assert "WHERE users.id IN" in str(filtered_local)


@pytest.mark.asyncio
async def test_temporary_grant_lifecycle_and_effective_permissions(
    rbac_service: RbacService, user_service: UserService
) -> None:
    """Müvəqqəti icazənin effektiv hüquqlara daxil olduğunu və ləğv edildikdə silindiyini yoxlayır."""
    await rbac_service.seed_catalog()

    user_dto = UserCreate(
        username="temp_grant_user",
        email="temp_grant@brandhouse.az",
        full_name="Temp Grant User",
        password="TempPassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(user_dto, actor=None)

    # İlkin effektiv icazələri yoxlayırıq (boşdur)
    eff1 = await rbac_service.get_effective_permissions(user.id)
    assert "finance.expense.view" not in eff1.permissions

    # 1 saatlıq müvəqqəti icazə veririk
    grant_dto = TemporaryGrantCreate(
        user_id=user.id,
        permission_key="finance.expense.view",
        expires_at=utc_now() + timedelta(hours=1),
        reason="Maliyyə auditi üçün müvəqqəti baxış icazəsi",
    )
    grant_resp = await rbac_service.create_temporary_grant(grant_dto, actor=None)
    assert grant_resp.is_active is True

    # Effektiv icazələrdə görünməlidir
    eff2 = await rbac_service.get_effective_permissions(user.id)
    assert "finance.expense.view" in eff2.permissions

    # Vaxtından əvvəl ləğv edirik
    await rbac_service.revoke_temporary_grant(grant_resp.id, actor=None)

    # İcazə artıq mövcud olmamalıdır
    eff3 = await rbac_service.get_effective_permissions(user.id)
    assert "finance.expense.view" not in eff3.permissions


@pytest.mark.asyncio
async def test_last_admin_protection(rbac_service: RbacService, user_service: UserService) -> None:
    """Sistemdəki yeganə aktiv sistem administratorunun silinməsi və ya rolunun alınmasının qarşısının alındığını yoxlayır."""
    await rbac_service.seed_catalog()

    # 1. İlk inzibatçını yaradırıq
    admin_dto = UserCreate(
        username="sole_admin",
        email="sole_admin@brandhouse.az",
        full_name="Sole Admin",
        password="AdminPassword123!",
        must_change_password=False,
    )
    admin_user, _ = await user_service.create_user(admin_dto, actor=None)

    async with UnitOfWork() as uow:
        admin_role = await rbac_service.repo.get_role_by_code(uow.session, "system_admin")
        cashier_role = await rbac_service.repo.get_role_by_code(uow.session, "cashier")
        assert admin_role is not None
        assert cashier_role is not None

    await rbac_service.assign_user_roles(admin_user.id, [admin_role.id], actor=None)

    # 2. Yeganə administratorun rolunu dəyişmək cəhdi (Last Admin Protection)
    with pytest.raises(LastAdminProtectionError):
        await rbac_service.assign_user_roles(admin_user.id, [cashier_role.id], actor=None)

    # 3. Yeganə administratoru dayandırmaq (suspend) cəhdi
    status_update = UserStatusUpdate(
        status="suspended", reason="Test dayandırma", version=admin_user.version
    )
    with pytest.raises(LastAdminProtectionError):
        await user_service.update_status(admin_user.id, status_update, actor=None)

    # 4. İkinci bir administrator yaradıldıqda isə birinci adminin rolunu dəyişmək mümkün olmalıdır
    second_admin_dto = UserCreate(
        username="second_admin",
        email="second_admin@brandhouse.az",
        full_name="Second Admin",
        password="AdminPassword123!",
        must_change_password=False,
    )
    second_admin, _ = await user_service.create_user(second_admin_dto, actor=None)
    await rbac_service.assign_user_roles(second_admin.id, [admin_role.id], actor=None)

    # İndi birinci adminin rolunu kassir etmək olar, çünki sistemdə ikinci aktiv admin var
    await rbac_service.assign_user_roles(admin_user.id, [cashier_role.id], actor=None)


def test_sod_conflict_checks_and_verification(rbac_service: RbacService) -> None:
    """Vəzifələrin bölünməsi (SoD) ziddiyyətlərinin düzgün aşkarlandığını təsdiqləyir."""
    # 1. Ziddiyyətli icazələr: maliyyə ödənişi yaratma və təsdiq etmə
    conflicting_perms = ["finance.payment.create", "finance.payment.approve", "pos.sale.create"]
    warnings = rbac_service.check_sod_conflicts(conflicting_perms)
    assert len(warnings) == 1
    assert "finance.payment.create" in warnings[0].pair
    assert "finance.payment.approve" in warnings[0].pair

    # 2. Təmiz icazələr
    clean_perms = ["pos.sale.create", "pos.shift.close", "inventory.stock.view"]
    assert len(rbac_service.check_sod_conflicts(clean_perms)) == 0

    # 3. İcraçı ilə sənəd yaradan eyni şəxs olduqda SoD xətası
    user_id = generate_uuid7()
    other_user_id = generate_uuid7()

    with pytest.raises(SegregationOfDutiesError):
        verify_segregation_of_duties(
            actor_id=user_id, document_creator_id=user_id, action="approve"
        )

    # Fərqli şəxslər olduqda xəta baş verməməlidir
    verify_segregation_of_duties(
        actor_id=user_id, document_creator_id=other_user_id, action="approve"
    )


def test_sensitive_field_masking() -> None:
    """Həssas maliyyə və şəxsi məlumatların maskalanmasını yoxlayır."""
    record = {
        "id": "emp-001",
        "name": "Əli Məmmədov",
        "salary": 1800.50,
        "net_salary": 1500.00,
        "passport_number": "AA1234567",
        "details": {
            "cost_price": 45.00,
            "margin": 25.0,
            "comment": "Məxfi qeyd",
        },
        "history": [
            {"date": "2026-01-01", "salary": 1600.00},
            {"date": "2026-06-01", "salary": 1800.50},
        ],
    }

    # Baxış hüququ olmayan üçün maskalama
    masked = mask_sensitive_fields(record, can_view_sensitive=False)
    assert masked["name"] == "Əli Məmmədov"
    assert masked["salary"] == "****"
    assert masked["net_salary"] == "****"
    assert masked["passport_number"] == "****"
    assert masked["details"]["cost_price"] == "****"
    assert masked["details"]["margin"] == "****"
    assert masked["details"]["comment"] == "Məxfi qeyd"
    assert masked["history"][0]["salary"] == "****"
    assert masked["history"][1]["salary"] == "****"

    # Baxış hüququ olan üçün orijinal dəyərlər qalır
    unmasked = mask_sensitive_fields(record, can_view_sensitive=True)
    assert unmasked["salary"] == 1800.50
    assert unmasked["details"]["cost_price"] == 45.00


@pytest.mark.asyncio
async def test_rbac_role_crud_errors_and_system_protection(
    rbac_service: RbacService, user_service: UserService
) -> None:
    """Rolların yaradılması xətaları, sistem rollarının silinmə qadağası və təsir təhlilini yoxlayır."""
    await rbac_service.seed_catalog()

    # 1. Artıq mövcud kodla rol yaratmaq -> ConflictError
    with pytest.raises(ConflictError, match="artıq mövcuddur"):
        await rbac_service.create_role(
            RoleCreate(
                code="system_admin",
                name="Duplicate Admin",
                description="Duplicate",
                permission_keys=[],
            )
        )

    # 2. Mövcud olmayan rolu oxumaq və ya yeniləmək -> NotFoundError
    ghost_id = generate_uuid7()
    with pytest.raises(NotFoundError):
        await rbac_service.get_role(ghost_id)
    with pytest.raises(NotFoundError):
        await rbac_service.update_role(
            ghost_id,
            RoleUpdate(name="New", description="New", permission_keys=[], version=1),
        )
    with pytest.raises(NotFoundError):
        await rbac_service.clone_role(ghost_id, "clone_ghost", "Clone Ghost")

    # 3. Sistem rolunu silməyə cəhd -> BusinessRuleViolationError
    async with UnitOfWork() as uow:
        sys_role = await rbac_service.repo.get_role_by_code(uow.session, "cashier")
        assert sys_role is not None
        cashier_id = sys_role.id

    with pytest.raises(BusinessRuleViolationError, match="Sistem tərəfindən təyin olunmuş"):
        await rbac_service.delete_role(cashier_id)

    # 4. Fərdi rol yaradırıq, istifadəçi təyin edirik və silməyə cəhd edirik -> BusinessRuleViolationError (aktiv istifadəçi var)
    custom_role, _ = await rbac_service.create_role(
        RoleCreate(
            code="custom_temp_role",
            name="Temporary Custom",
            description="Temp",
            permission_keys=["pos.sale.create"],
        )
    )
    user, _ = await user_service.create_user(
        UserCreate(
            username="temp_role_user",
            email="temp_role@brandhouse.az",
            full_name="Temp User",
            password="SecurePassword123!",
        ),
        actor=None,
    )
    await rbac_service.assign_user_roles(user.id, [custom_role.id], actor=None)

    with pytest.raises(BusinessRuleViolationError, match="aktiv istifadəçi təyin olunub"):
        await rbac_service.delete_role(custom_role.id)

    # Rol siyahısını yoxlayırıq
    all_roles = await rbac_service.list_roles()
    assert len(all_roles) >= 9
    custom_in_list = next(r for r in all_roles if r.id == custom_role.id)
    assert custom_in_list.active_users_count == 1
