"""Sazlamalar Çərçivəsi Vahid Testləri (Settings Framework Unit Tests)."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.core.database import utc_now
from app.core.errors import BusinessRuleViolationError
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.settings.schemas import (
    ReasonCodeCreate,
    ReasonCodeUpdate,
    SettingPreviewRequest,
    SettingRestoreRequest,
    SettingUpdateRequest,
)
from app.modules.settings.service import SettingsService


class MockActor:
    def __init__(self, roles: list[str], permissions: list[str] | None = None) -> None:
        self.id = generate_uuid7()
        self.roles = roles
        self.permissions = permissions or []


@pytest.mark.asyncio
async def test_settings_resolution_order_and_effective_dating() -> None:
    service = SettingsService()
    admin = MockActor(roles=["system_admin"])
    branch_id = generate_uuid7()

    key = "inventory_rules"

    # 1. İlkin dəyər - Reyestr standartı ("FORBIDDEN")
    res_default = await service.get(key, branch_id=branch_id, actor=admin)
    assert res_default.value["negative_stock_policy"] == "FORBIDDEN"
    assert res_default.source == "default_registry"

    # 2. Şirkət səviyyəli dəyər təyin edirik
    company_update = SettingUpdateRequest(
        value={"negative_stock_policy": "WARNING"},
        reason="Şirkət miqyasında xəbərdarlıq rejiminə keçid",
        version=1,
    )
    await service.update_setting(key, company_update, actor=admin)

    # Filial üçün yoxlayırıq - override olmadığı üçün şirkət dəyərini qaytarmalıdır
    res_company = await service.get(key, branch_id=branch_id, actor=admin)
    assert res_company.value["negative_stock_policy"] == "WARNING"
    assert res_company.source == "company_value"

    # 3. Filial override dəyəri təyin edirik
    branch_update = SettingUpdateRequest(
        branch_id=branch_id,
        value={"negative_stock_policy": "ALLOWED"},
        reason="Bu filial üçün mənfi stok icazəsi verildi",
        version=1,
    )
    await service.update_setting(key, branch_update, actor=admin)

    # İndi filial üçün mütləq override dəyəri ("ALLOWED") qayıtmalıdır
    res_branch = await service.get(key, branch_id=branch_id, actor=admin)
    assert res_branch.value["negative_stock_policy"] == "ALLOWED"
    assert res_branch.source == "branch_override"

    # Fərqli filial üçün isə hələ də şirkət dəyəri qüvvədə qalmalıdır (izolyasiya)
    other_branch_id = generate_uuid7()
    res_other = await service.get(key, branch_id=other_branch_id, actor=admin)
    assert res_other.value["negative_stock_policy"] == "WARNING"
    assert res_other.source == "company_value"

    # 4. Efektiv tarixçə (Effective Dating)
    future_time = utc_now() + timedelta(days=10)
    future_update = SettingUpdateRequest(
        value={"negative_stock_policy": "FORBIDDEN"},
        effective_from=future_time,
        reason="10 gündən sonra qadağa qüvvəyə minəcək",
        version=2,
    )
    await service.update_setting(key, future_update, actor=admin)

    # İndi soruşanda hələ gələcək tarix çatmadığı üçün cari şirkət dəyəri ("WARNING") aktiv olmalıdır
    res_now = await service.get(key, actor=admin)
    assert res_now.value["negative_stock_policy"] == "WARNING"

    # Gələcək tarix üçün soruşduqda isə ("FORBIDDEN") qayıtmalıdır
    res_future = await service.get(key, at=future_time + timedelta(seconds=1), actor=admin)
    assert res_future.value["negative_stock_policy"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_sensitive_setting_requires_reason() -> None:
    service = SettingsService()
    admin = MockActor(roles=["system_admin"])

    key = "security_policy"  # sensitivity: "critical", requires_reason: True

    # Səbəbsiz yeniləmə cəhdi BusinessRuleViolationError atmalıdır
    invalid_update = SettingUpdateRequest(
        value={"max_login_attempts": 3},
        reason=None,
        version=1,
    )
    with pytest.raises(BusinessRuleViolationError):
        await service.update_setting(key, invalid_update, actor=admin)

    # Qısa (mənasız) səbəb də rədd edilməlidir
    short_reason_update = SettingUpdateRequest(
        value={"max_login_attempts": 3},
        reason="ok",
        version=1,
    )
    with pytest.raises(BusinessRuleViolationError):
        await service.update_setting(key, short_reason_update, actor=admin)

    # Düzgün əsaslandırma ilə qəbul edilməlidir
    valid_update = SettingUpdateRequest(
        value={"max_login_attempts": 3},
        reason="Təhlükəsizlik auditinin tövsiyəsinə əsasən 5-dən 3-ə endirildi",
        version=1,
    )
    updated = await service.update_setting(key, valid_update, actor=admin)
    assert updated.value["max_login_attempts"] == 3


@pytest.mark.asyncio
async def test_setting_history_and_restore_and_preview() -> None:
    service = SettingsService()
    admin = MockActor(roles=["system_admin"])

    key = "receipt_template"

    # Dəyəri v1 edirik
    await service.update_setting(
        key,
        SettingUpdateRequest(
            value={"paper_width_mm": 58, "header_text": "BRAND HOUSE 1"},
            reason="İlkin printer sazlaması",
            version=1,
        ),
        actor=admin,
    )

    # Dəyəri v2 edirik
    await service.update_setting(
        key,
        SettingUpdateRequest(
            value={"paper_width_mm": 80, "header_text": "BRAND HOUSE 2"},
            reason="80mm printerlərə keçid",
            version=2,
        ),
        actor=admin,
    )

    # Tarixçəni yoxlayırıq
    history = await service.list_history(key, actor=admin)
    assert len(history) >= 2
    assert history[0].version == 2
    assert history[1].version == 1

    # v1-i bərpa edirik (Yeni versiya v3 kimi qeydə alınır)
    restored = await service.restore_version(
        key,
        SettingRestoreRequest(history_id=history[1].id, reason="Köhnə formata geri qayıdış"),
        actor=admin,
    )
    assert restored.version == 3
    assert restored.value["paper_width_mm"] == 58

    # Preview endpoint
    preview = await service.preview_setting(
        SettingPreviewRequest(
            key=key,
            new_value={"paper_width_mm": 80, "header_text": "BRAND HOUSE 3"},
        ),
        actor=admin,
    )
    assert preview.diff["before"]["paper_width_mm"] == 58
    assert preview.diff["after"]["paper_width_mm"] == 80


@pytest.mark.asyncio
async def test_reason_codes_crud_and_usage_guard() -> None:
    service = SettingsService()
    admin = MockActor(roles=["system_admin"])

    # 1. Yeni səbəb kodu yaratma
    create_dto = ReasonCodeCreate(
        category="returns",
        code="SIZE_MISMATCH",
        name_az="Ölçü uyğunsuzluğu",
        description="Müştəri geyindikdən sonra ölçünün dar olduğunu bildirdi",
    )
    rc = await service.create_reason_code(create_dto, actor=admin)
    assert rc.code == "SIZE_MISMATCH"
    assert rc.is_active is True

    # 2. Yeniləmə
    update_dto = ReasonCodeUpdate(name_az="Bədən ölçüsü uyğun gəlmir", version=rc.version)
    updated = await service.update_reason_code(rc.id, update_dto, actor=admin)
    assert updated.name_az == "Bədən ölçüsü uyğun gəlmir"

    # 3. İstifadə olunmayıbsa silinə bilər (usage_count == 0)
    # Lakin istifadə sayı artırıldıqda silinmə qadağan edilməlidir
    async with UnitOfWork() as uow:
        db_rc = await service.repo.get_by_id(uow.session, rc.id)
        assert db_rc is not None
        db_rc.usage_count = 5  # Əməliyyatda istifadə olunub
        await uow.commit()

    with pytest.raises(BusinessRuleViolationError):
        await service.delete_reason_code(rc.id, actor=admin)

    # Deaktivasiya edilə bilməlidir
    deact_dto = ReasonCodeUpdate(is_active=False, version=updated.version)
    deactivated = await service.update_reason_code(rc.id, deact_dto, actor=admin)
    assert deactivated.is_active is False
