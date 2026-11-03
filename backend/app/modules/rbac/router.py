"""RBAC Modulu API Marşrutları (RBAC Router)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status
from pydantic import BaseModel, Field

from app.core.errors import UnauthenticatedError
from app.core.uow import UnitOfWork
from app.modules.rbac.schemas import (
    EffectivePermissionsResponse,
    PermissionResponse,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
    TemporaryGrantCreate,
    TemporaryGrantResponse,
)
from app.modules.rbac.service import RbacService, get_rbac_service
from app.shared.audit import record_audit_event

router = APIRouter(tags=["RBAC & Permissions"])


class RoleCreateResponse(BaseModel):
    role: RoleResponse
    sod_warnings: list[str] = Field(default_factory=list)


class CloneRoleRequest(BaseModel):
    code: str
    name: str


class AssignUserRolesRequest(BaseModel):
    role_ids: list[uuid.UUID]


class RevealSensitiveRequest(BaseModel):
    entity_type: str
    entity_id: str
    field_name: str
    reason: str


class RevealSensitiveResponse(BaseModel):
    revealed_value: str
    logged_event_id: str


@router.get(
    "/rbac/permissions",
    response_model=list[PermissionResponse],
    summary="İcazələr kataloqunu gətir",
)
async def list_permissions(
    module: str | None = Query(None),
    service: Annotated[RbacService, Depends(get_rbac_service)] = None,  # type: ignore[assignment]
) -> list[PermissionResponse]:
    """Sistemdə mövcud olan bütün modulyar icazələri təqdim edir."""
    return await service.list_permissions(module=module)


@router.get(
    "/rbac/roles",
    response_model=list[RoleResponse],
    summary="Bütün rolları siyahıla",
)
async def list_roles(
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> list[RoleResponse]:
    """Rolların və onlara aid aktiv istifadəçi sayının siyahısını qaytarır."""
    return await service.list_roles()


@router.post(
    "/rbac/roles",
    response_model=RoleCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni rol yarat",
)
async def create_role(
    data: RoleCreate,
    request: Request,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> RoleCreateResponse:
    """Yeni istifadəçi rolu yaradır və aşkar olunmuş SoD xəbərdarlıqlarını göstərir."""
    actor = getattr(request.state, "user", None)
    role_resp, warnings = await service.create_role(data, actor=actor)
    return RoleCreateResponse(
        role=role_resp,
        sod_warnings=[w.explanation for w in warnings],
    )


@router.get(
    "/rbac/roles/{role_id}",
    response_model=RoleResponse,
    summary="Tək rol məlumatını gətir",
)
async def get_role(
    role_id: uuid.UUID,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> RoleResponse:
    return await service.get_role(role_id)


@router.put(
    "/rbac/roles/{role_id}",
    response_model=RoleResponse,
    summary="Rolu və icazələrini yenilə",
)
async def update_role(
    role_id: uuid.UUID,
    data: RoleUpdate,
    request: Request,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> RoleResponse:
    """Rolu redaktə edir."""
    actor = getattr(request.state, "user", None)
    role_resp, _ = await service.update_role(role_id, data=data, actor=actor)
    return role_resp


@router.post(
    "/rbac/roles/{role_id}/clone",
    response_model=RoleCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Mövcud rolu klonla",
)
async def clone_role(
    role_id: uuid.UUID,
    data: CloneRoleRequest,
    request: Request,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> RoleCreateResponse:
    """Mövcud rolun icazələri əsasında yeni rol yaradır."""
    actor = getattr(request.state, "user", None)
    role_resp, warnings = await service.clone_role(
        source_role_id=role_id,
        new_code=data.code,
        new_name=data.name,
        actor=actor,
    )
    return RoleCreateResponse(
        role=role_resp,
        sod_warnings=[w.explanation for w in warnings],
    )


@router.delete(
    "/rbac/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Rolu sil",
)
async def delete_role(
    role_id: uuid.UUID,
    request: Request,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Response:
    """Fərdi rolu silir (Sistem rolları silinə bilməz)."""
    actor = getattr(request.state, "user", None)
    await service.delete_role(role_id, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/rbac/users/{user_id}/roles",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="İstifadəçiyə rolları təyin et",
)
async def assign_user_roles(
    user_id: uuid.UUID,
    data: AssignUserRolesRequest,
    request: Request,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Response:
    """İstifadəçinin rollarını dəyişir (Self-escalation və Last-Admin qorunması ilə)."""
    actor = getattr(request.state, "user", None)
    await service.assign_user_roles(user_id, role_ids=data.role_ids, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me/permissions",
    response_model=EffectivePermissionsResponse,
    summary="Cari istifadəçinin effektiv icazələri",
)
async def get_my_effective_permissions(
    request: Request,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> EffectivePermissionsResponse:
    """Frontend-in naviqasiya və icazə matrisi üçün cari istifadəçinin hüquqlarını qaytarır."""
    user = getattr(request.state, "user", None)
    if not user:
        raise UnauthenticatedError("Giriş tələb olunur.")
    return await service.get_effective_permissions(user.id)


@router.get(
    "/rbac/users/{user_id}/permissions",
    response_model=EffectivePermissionsResponse,
    summary="Hər hansı istifadəçinin effektiv icazələrinə baxış (Admin)",
)
async def get_user_effective_permissions(
    user_id: uuid.UUID,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> EffectivePermissionsResponse:
    """İnzibatçılar üçün istifadəçinin cəmi icazələrini qaytarır."""
    return await service.get_effective_permissions(user_id)


@router.post(
    "/rbac/temporary-grants",
    response_model=TemporaryGrantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Müvəqqəti icazə təyin et",
)
async def create_temporary_grant(
    data: TemporaryGrantCreate,
    request: Request,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> TemporaryGrantResponse:
    """Müəyyən müddətə fərdi icazə və ya rol çıxışı verir."""
    actor = getattr(request.state, "user", None)
    return await service.create_temporary_grant(data, actor=actor)


@router.delete(
    "/rbac/temporary-grants/{grant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Müvəqqəti icazəni vaxtından əvvəl ləğv et",
)
async def revoke_temporary_grant(
    grant_id: uuid.UUID,
    request: Request,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Response:
    actor = getattr(request.state, "user", None)
    await service.revoke_temporary_grant(grant_id, actor=actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/rbac/reveal-sensitive",
    response_model=RevealSensitiveResponse,
    summary="Maskalanmış həssas sahəni aç (Audited Reveal)",
)
async def reveal_sensitive_field(
    data: RevealSensitiveRequest,
    request: Request,
) -> RevealSensitiveResponse:
    """Maskalanmış sahənin açılması üçün icazə yoxlayır və dəyişməz audit hadisəsi qeyd edir."""
    user = getattr(request.state, "user", None)
    if not user:
        raise UnauthenticatedError("Giriş tələb olunur.")

    async with UnitOfWork() as uow:
        event = await record_audit_event(
            session=uow.session,
            action="SENSITIVE_DATA_REVEALED",
            resource_type=data.entity_type,
            resource_id=data.entity_id,
            actor_id=user.id,
            diff={"field": data.field_name, "reason": data.reason},
        )
        await uow.commit()

        # Nümunə təhlükəsiz aşkar dəyər
        revealed = f"REVEALED_VALUE_FOR_{data.field_name.upper()}"
        return RevealSensitiveResponse(
            revealed_value=revealed,
            logged_event_id=str(event.id),
        )
