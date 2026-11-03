"""İstifadəçilər Modulu Vahid Testləri (Unit Tests for users module).

Əhatə dairəsi:
- İstifadəçi yaradılması (unikal ad və e-poçt yoxlanışı, siyasət validasiyası).
- Profil yenilənməsi, təkrarlanan e-poçt xətası (ConflictError).
- Status dəyişikliyi (aktivləşdirmə, dayandırma, özünü dayandırma qadağası).
- Şifrə dəyişməsi (cari şifrə yoxlanışı, tarixçə məhdudiyyəti).
- POS və Menecer PIN kodları (format validasiyası, heşlənmə və verifikasiya).
- Giriş uğursuzluğu, hesabı kilidləmə və kilidin avtomatik açılması.
- Filial çıxış icazələrinin təyini.
- Aktiv istifadəçilərin sayılması.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.core.database import utc_now
from app.core.errors import (
    ConflictError,
    InvalidCredentialsError,
    LastAdminProtectionError,
    NotFoundError,
    PasswordInHistoryError,
    SelfEscalationError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.rbac.service import RbacService
from app.modules.users.schemas import (
    UserBranchAssignment,
    UserCreate,
    UserStatusUpdate,
    UserUpdate,
)
from app.modules.users.service import UserService


@pytest.fixture
def user_service() -> UserService:
    return UserService()


@pytest.fixture
def rbac_service() -> RbacService:
    return RbacService()


@pytest.mark.asyncio
async def test_user_creation_and_duplicates(user_service: UserService) -> None:
    """İstifadəçi yaradılması və təkrarlanan ad/e-poçt xətalarını yoxlayır."""
    dto = UserCreate(
        username="unit_user_dup",
        email="unit_user_dup@brandhouse.az",
        full_name="Duplicate Test User",
        password="SecurePassword123!",
        must_change_password=False,
    )
    user, _ = await user_service.create_user(dto, actor=None)
    assert user.id is not None
    assert user.username == "unit_user_dup"

    # Eyni istifadəçi adı ilə təkrar yaradılma
    with pytest.raises(ConflictError, match="qeydiyyatdan keçib"):
        await user_service.create_user(
            UserCreate(
                username="unit_user_dup",
                email="another@brandhouse.az",
                full_name="Other User",
                password="SecurePassword123!",
            ),
            actor=None,
        )

    # Eyni e-poçt ilə təkrar yaradılma
    with pytest.raises(ConflictError, match="artıq istifadə olunur"):
        await user_service.create_user(
            UserCreate(
                username="another_user",
                email="unit_user_dup@brandhouse.az",
                full_name="Other User",
                password="SecurePassword123!",
            ),
            actor=None,
        )


@pytest.mark.asyncio
async def test_user_update_and_email_conflict(user_service: UserService) -> None:
    """Profil yenilənməsi və təkrarlanan e-poçt konfliktini yoxlayır."""
    u1, _ = await user_service.create_user(
        UserCreate(
            username="update_u1",
            email="update_u1@brandhouse.az",
            full_name="User 1",
            password="SecurePassword123!",
        ),
        actor=None,
    )
    u2, _ = await user_service.create_user(
        UserCreate(
            username="update_u2",
            email="update_u2@brandhouse.az",
            full_name="User 2",
            password="SecurePassword123!",
        ),
        actor=None,
    )

    # u1 məlumatlarını uğurla yeniləyir
    updated = await user_service.update_user(
        u1.id,
        UserUpdate(
            full_name="Updated User 1",
            email="new_u1@brandhouse.az",
            preferred_language="en",
            version=u1.version,
        ),
        actor=None,
    )
    assert updated.full_name == "Updated User 1"
    assert updated.email == "new_u1@brandhouse.az"
    assert updated.preferred_language == "en"

    # u1 email-ini u2-nin email-i etməyə çalışır -> ConflictError
    with pytest.raises(ConflictError, match="artıq başqa istifadəçidə"):
        await user_service.update_user(
            u1.id,
            UserUpdate(email="update_u2@brandhouse.az", version=updated.version),
            actor=None,
        )

    # Mövcud olmayan istifadəçi
    with pytest.raises(NotFoundError):
        await user_service.update_user(
            generate_uuid7(),
            UserUpdate(full_name="Ghost", version=1),
            actor=None,
        )


@pytest.mark.asyncio
async def test_user_status_and_self_escalation(
    user_service: UserService, rbac_service: RbacService
) -> None:
    """Status dəyişikliyi, özünü dayandırma qadağası və son admin qorunmasını yoxlayır."""
    await rbac_service.seed_catalog()
    admin_user, _ = await user_service.create_user(
        UserCreate(
            username="single_admin",
            email="single_admin@brandhouse.az",
            full_name="Single Admin",
            password="SecurePassword123!",
        ),
        actor=None,
    )
    async with UnitOfWork() as uow:
        role = await rbac_service.repo.get_role_by_code(uow.session, "system_admin")
        assert role is not None
        await rbac_service.repo.assign_user_roles(uow.session, admin_user.id, [role.id])
        await uow.commit()

    # İstifadəçinin öz hesabını dayandırmaq cəhdi
    actor = type(
        "Actor",
        (),
        {
            "id": admin_user.id,
            "roles": ["system_admin"],
            "permissions": ["users.user.manage"],
        },
    )()
    with pytest.raises(SelfEscalationError, match="öz hesabını dayandıra bilməz"):
        await user_service.update_status(
            admin_user.id,
            UserStatusUpdate(status="suspended", version=admin_user.version),
            actor=actor,
        )

    # Başqa admin olmadan tək admini başqa aktyorla dayandırmaq cəhdi -> LastAdminProtectionError
    other_actor = type(
        "Actor",
        (),
        {
            "id": generate_uuid7(),
            "roles": ["system_admin"],
            "permissions": ["users.user.manage"],
        },
    )()
    with pytest.raises(LastAdminProtectionError):
        await user_service.update_status(
            admin_user.id,
            UserStatusUpdate(status="suspended", version=admin_user.version),
            actor=other_actor,
        )


@pytest.mark.asyncio
async def test_user_password_change_and_history(user_service: UserService) -> None:
    """Şifrə dəyişməsi, yanlış cari şifrə və şifrə tarixçəsi qadağasını yoxlayır."""
    user, _ = await user_service.create_user(
        UserCreate(
            username="pwd_history_user",
            email="pwd_history@brandhouse.az",
            full_name="Password History User",
            password="OldPassword123!",
        ),
        actor=None,
    )

    # Yanlış cari şifrə
    with pytest.raises(InvalidCredentialsError):
        await user_service.change_password(user.id, "WrongPassword123!", "NewPassword123!")

    # Uğurlu şifrə dəyişməsi
    await user_service.change_password(user.id, "OldPassword123!", "NewPassword123!")

    # Eyni köhnə şifrəni təkrar təyin etmək cəhdi -> PasswordInHistoryError
    with pytest.raises(PasswordInHistoryError):
        await user_service.change_password(user.id, "NewPassword123!", "NewPassword123!")


@pytest.mark.asyncio
async def test_pins_validation_and_verification(user_service: UserService) -> None:
    """POS və Menecer PIN kodlarının validasiyası və doğrulanmasını yoxlayır."""
    user, _ = await user_service.create_user(
        UserCreate(
            username="pin_test_user",
            email="pin_test@brandhouse.az",
            full_name="Pin Test User",
            password="SecurePassword123!",
        ),
        actor=None,
    )

    # 1. Menecer PIN xətaları və uğurlu təyini
    with pytest.raises(ValueError, match="4-8 rəqəmdən"):
        await user_service.set_manager_pin(user.id, "12", actor=None)
    with pytest.raises(ValueError, match="4-8 rəqəmdən"):
        await user_service.set_manager_pin(user.id, "abcd", actor=None)

    await user_service.set_manager_pin(user.id, "9876", actor=None)
    assert await user_service.verify_manager_pin(user.id, "9876") is True
    assert await user_service.verify_manager_pin(user.id, "0000") is False

    # 2. POS PIN xətaları və uğurlu təyini
    with pytest.raises(ValueError, match="4-8 rəqəmdən"):
        await user_service.set_pos_pin(user.id, "123", actor=None)

    await user_service.set_pos_pin(user.id, "4321", actor=None)
    assert await user_service.verify_pos_pin(user.id, "4321") is True
    assert await user_service.verify_pos_pin(user.id, "9999") is False


@pytest.mark.asyncio
async def test_login_failure_lockout_and_unlock(user_service: UserService) -> None:
    """Ardıcıl uğursuz girişlər, hesabın kilidlənməsi və vaxt bitdikdə açılmasını yoxlayır."""
    user, _ = await user_service.create_user(
        UserCreate(
            username="lockout_user",
            email="lockout_user@brandhouse.az",
            full_name="Lockout User",
            password="SecurePassword123!",
        ),
        actor=None,
    )

    # 4 uğursuz cəhd
    for _ in range(4):
        count, is_locked, _ = await user_service.record_login_failure(user.id)
        assert is_locked is False

    # 5-ci uğursuz cəhd -> hesab kilidlənir
    count, is_locked, retry_after = await user_service.record_login_failure(user.id)
    assert is_locked is True
    assert count == 5
    assert retry_after > 0

    # Hələ vaxtı çatmayıb, açılmamalıdır
    unlocked = await user_service.unlock_user_if_expired(user.id)
    assert unlocked is False

    # Kilid vaxtını süni olaraq keçmişə çəkirik
    async with UnitOfWork() as uow:
        db_user = await user_service.repo.get_by_id(uow.session, user.id)
        assert db_user is not None
        db_user.locked_until = utc_now() - timedelta(minutes=1)
        await user_service.repo.update(uow.session, db_user, expected_version=db_user.version)
        await uow.commit()

    # İndi açılmalıdır
    unlocked_after = await user_service.unlock_user_if_expired(user.id)
    assert unlocked_after is True

    # Uğurlu giriş
    await user_service.record_login_success(user.id)
    auth_rec = await user_service.get_user_auth_record_by_id(user.id)
    assert auth_rec is not None
    assert auth_rec.failed_login_count == 0


@pytest.mark.asyncio
async def test_branches_assignment_and_active_users_count(user_service: UserService) -> None:
    """Filial icazələrinin təyini və aktiv istifadəçilərin sayılmasını yoxlayır."""
    u1, _ = await user_service.create_user(
        UserCreate(
            username="branch_u1",
            email="branch_u1@brandhouse.az",
            full_name="Branch User 1",
            password="SecurePassword123!",
        ),
        actor=None,
    )
    b1 = generate_uuid7()
    b2 = generate_uuid7()

    # Filial təyini
    assigned = await user_service.assign_branches(
        u1.id,
        UserBranchAssignment(branch_ids=[b1, b2], manage_branch_ids=[b1]),
        actor=None,
    )
    assert len(assigned) == 2
    assert b1 in assigned and b2 in assigned

    allowed = await user_service.get_user_allowed_branches(u1.id)
    assert len(allowed) == 2

    # count_active_users
    active_count = await user_service.count_active_users([u1.id, generate_uuid7()])
    assert active_count == 1
    assert await user_service.count_active_users([]) == 0

    # force_password_reset
    await user_service.force_password_reset(u1.id, actor=None)
    refreshed = await user_service.get_user_by_id(u1.id)
    assert refreshed.must_change_password is True

    # reset_password_with_token
    await user_service.reset_password_with_token(u1.id, "BrandNewPassword123!")
    refreshed2 = await user_service.get_user_by_id(u1.id)
    assert refreshed2.must_change_password is False
