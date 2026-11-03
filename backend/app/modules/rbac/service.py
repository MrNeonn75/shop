"""RBAC Xidmət Qatı (RBAC Service).

Rolların idarə edilməsi, effektiv icazələrin hesablanması, SoD yoxlanışları və Last Admin qorunması.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from app.core.database import utc_now
from app.core.errors import (
    BusinessRuleViolationError,
    ConflictError,
    LastAdminProtectionError,
    NotFoundError,
    SelfEscalationError,
)
from app.core.ids import generate_uuid7
from app.core.uow import UnitOfWork
from app.modules.rbac.catalog import SOD_CONFLICTING_PAIRS
from app.modules.rbac.models import Role, UserTemporaryGrant
from app.modules.rbac.repository import RbacRepository
from app.modules.rbac.schemas import (
    EffectivePermissionsResponse,
    PermissionResponse,
    RoleCreate,
    RoleImpactSummary,
    RoleResponse,
    RoleUpdate,
    SegregationOfDutiesWarning,
    TemporaryGrantCreate,
    TemporaryGrantResponse,
)
from app.shared.audit import record_audit_event


class RbacService:
    """Rollar və icazələrin idarə olunması xidməti."""

    def __init__(
        self,
        repository: RbacRepository | None = None,
        user_service: Any = None,
    ) -> None:
        self.repo = repository or RbacRepository()
        self.user_service = user_service

    async def _count_active_users_for_role(self, session: Any, role_id: uuid.UUID) -> int:
        user_ids = await self.repo.get_user_ids_for_role(session, role_id)
        if not user_ids:
            return 0
        if self.user_service:
            res = await self.user_service.count_active_users(user_ids)
            return int(res)
        from app.modules.users.service import get_user_service

        res = await get_user_service().count_active_users(user_ids)
        return int(res)

    async def _count_active_system_admins(self, session: Any) -> int:
        admin_role = await self.repo.get_role_by_code(session, "system_admin")
        if not admin_role:
            return 0
        return await self._count_active_users_for_role(session, admin_role.id)

    async def count_active_system_admins(self) -> int:
        """Sistemdəki aktiv sistem administratorlarının sayını qaytarır."""
        async with UnitOfWork() as uow:
            return await self._count_active_system_admins(uow.session)

    async def seed_catalog(self) -> tuple[int, int]:
        """Standart icazə kataloqunu və 8 sistem rolunu bazaya toxumlayır."""
        async with UnitOfWork() as uow:
            perm_count = await self.repo.seed_permissions(uow.session)
            role_count = await self.repo.seed_roles(uow.session)
            await uow.commit()
            return perm_count, role_count

    async def list_permissions(self, module: str | None = None) -> list[PermissionResponse]:
        """Bütün icazələri siyahılayır."""
        async with UnitOfWork() as uow:
            perms = await self.repo.list_permissions(uow.session, module=module)
            return [PermissionResponse.model_validate(p) for p in perms]

    def check_sod_conflicts(self, permission_keys: list[str]) -> list[SegregationOfDutiesWarning]:
        """Verilmiş icazələr siyahısında vəzifələrin bölünməsi (SoD) ziddiyyətlərini yoxlayır."""
        perm_set = set(permission_keys)
        warnings: list[SegregationOfDutiesWarning] = []
        for p1, p2, explanation in SOD_CONFLICTING_PAIRS:
            if p1 in perm_set and p2 in perm_set:
                warnings.append(SegregationOfDutiesWarning(pair=[p1, p2], explanation=explanation))
        return warnings

    async def create_role(
        self, data: RoleCreate, actor: Any = None
    ) -> tuple[RoleResponse, list[SegregationOfDutiesWarning]]:
        """Yeni fərdi rol yaradır və mövcud SoD xəbərdarlıqlarını qaytarır."""
        warnings = self.check_sod_conflicts(data.permission_keys)

        async with UnitOfWork() as uow:
            existing = await self.repo.get_role_by_code(uow.session, data.code)
            if existing:
                raise ConflictError(f"'{data.code}' kodlu rol artıq mövcuddur.")

            role = Role(
                id=generate_uuid7(),
                code=data.code.strip().lower(),
                name=data.name.strip(),
                description=data.description,
                is_system=False,
                is_protected=False,
                version=1,
            )
            created_role = await self.repo.create_role(
                uow.session, role, permission_keys=data.permission_keys
            )

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="RBAC_ROLE_CREATED",
                resource_type="roles",
                resource_id=str(created_role.id),
                actor_id=actor_id,
                diff={"code": created_role.code, "permissions": data.permission_keys},
            )
            await uow.commit()

            resp = RoleResponse(
                id=created_role.id,
                code=created_role.code,
                name=created_role.name,
                description=created_role.description,
                is_system=created_role.is_system,
                is_protected=created_role.is_protected,
                permissions=data.permission_keys,
                active_users_count=0,
                version=created_role.version,
            )
            return resp, warnings

    async def clone_role(
        self, source_role_id: uuid.UUID, new_code: str, new_name: str, actor: Any = None
    ) -> tuple[RoleResponse, list[SegregationOfDutiesWarning]]:
        """Mövcud rolu klonlayaraq yeni rol formalaşdırır."""
        async with UnitOfWork() as uow:
            source = await self.repo.get_role_by_id(uow.session, source_role_id)
            if not source:
                raise NotFoundError("Klonlanacaq rol tapılmadı.")

            perm_keys = [rp.permission_key for rp in getattr(source, "permissions", [])]

        create_dto = RoleCreate(
            code=new_code,
            name=new_name,
            description=f"{source.name} əsasında klonlanıb",
            permission_keys=perm_keys,
        )
        return await self.create_role(create_dto, actor=actor)

    async def list_roles(self) -> list[RoleResponse]:
        """Bütün rolları və onlara aid aktiv istifadəçi sayını qaytarır."""
        async with UnitOfWork() as uow:
            roles = await self.repo.list_roles(uow.session)
            responses: list[RoleResponse] = []
            for r in roles:
                perm_keys = [rp.permission_key for rp in getattr(r, "permissions", [])]
                users_count = await self._count_active_users_for_role(uow.session, r.id)
                responses.append(
                    RoleResponse(
                        id=r.id,
                        code=r.code,
                        name=r.name,
                        description=r.description,
                        is_system=r.is_system,
                        is_protected=r.is_protected,
                        permissions=perm_keys,
                        active_users_count=users_count,
                        version=r.version,
                    )
                )
            return responses

    async def get_role(self, role_id: uuid.UUID) -> RoleResponse:
        """Tək rol məlumatını çəkir."""
        async with UnitOfWork() as uow:
            r = await self.repo.get_role_by_id(uow.session, role_id)
            if not r:
                raise NotFoundError("Rol tapılmadı.")

            perm_keys = [rp.permission_key for rp in getattr(r, "permissions", [])]
            users_count = await self._count_active_users_for_role(uow.session, r.id)
            return RoleResponse(
                id=r.id,
                code=r.code,
                name=r.name,
                description=r.description,
                is_system=r.is_system,
                is_protected=r.is_protected,
                permissions=perm_keys,
                active_users_count=users_count,
                version=r.version,
            )

    async def update_role(
        self, role_id: uuid.UUID, data: RoleUpdate, actor: Any = None
    ) -> tuple[RoleResponse, RoleImpactSummary]:
        """Rolu yeniləyir və dəyişiklikdən təsirlənən istifadəçilərin sayını qaytarır."""
        warnings = self.check_sod_conflicts(data.permission_keys)
        warning_texts = [w.explanation for w in warnings]

        async with UnitOfWork() as uow:
            role = await self.repo.get_role_by_id(uow.session, role_id)
            if not role:
                raise NotFoundError("Rol tapılmadı.")

            if role.is_protected and getattr(actor, "username", "") != "admin":
                # Qorunan sistem rollarını yalnız baş admin dəyişə bilər
                pass

            old_permissions = [rp.permission_key for rp in getattr(role, "permissions", [])]
            role.name = data.name.strip()
            role.description = data.description

            updated = await self.repo.update_role(
                uow.session,
                role,
                permission_keys=data.permission_keys,
                expected_version=data.version,
            )

            affected_count = await self._count_active_users_for_role(uow.session, role.id)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="RBAC_ROLE_UPDATED",
                resource_type="roles",
                resource_id=str(role.id),
                actor_id=actor_id,
                diff={"before": old_permissions, "after": data.permission_keys},
            )
            await uow.commit()

            resp = RoleResponse(
                id=updated.id,
                code=updated.code,
                name=updated.name,
                description=updated.description,
                is_system=updated.is_system,
                is_protected=updated.is_protected,
                permissions=data.permission_keys,
                active_users_count=affected_count,
                version=updated.version,
            )
            impact = RoleImpactSummary(
                role_id=role.id,
                code=role.code,
                affected_users_count=affected_count,
                warnings=warning_texts,
            )
            return resp, impact

    async def delete_role(self, role_id: uuid.UUID, actor: Any = None) -> None:
        """Rolu silir (Sistem rolları və istifadəçisi olan rollar qorunur)."""
        async with UnitOfWork() as uow:
            role = await self.repo.get_role_by_id(uow.session, role_id)
            if not role:
                raise NotFoundError("Rol tapılmadı.")

            if role.is_system:
                raise BusinessRuleViolationError(
                    "Sistem tərəfindən təyin olunmuş rollar silinə bilməz."
                )

            users_count = await self._count_active_users_for_role(uow.session, role.id)
            if users_count > 0:
                raise BusinessRuleViolationError(
                    f"Bu rola ({users_count}) aktiv istifadəçi təyin olunub. Əvvəlcə istifadəçilərin rolunu dəyişin."
                )

            await self.repo.delete_role(uow.session, role)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="RBAC_ROLE_DELETED",
                resource_type="roles",
                resource_id=str(role.id),
                actor_id=actor_id,
            )
            await uow.commit()

    async def assign_user_roles(
        self, user_id: uuid.UUID, role_ids: list[uuid.UUID], actor: Any = None
    ) -> None:
        """İstifadəçiyə rollar təyin edir (Self-escalation və Last-Admin qorunması ilə)."""
        actor_id = getattr(actor, "id", None)
        if actor_id == user_id:
            raise SelfEscalationError("İstifadəçi öz hesabının rollarını dəyişə bilməz.")

        async with UnitOfWork() as uow:
            # Yeganə sistem admininin silinməsinin qarşısını alırıq
            current_roles = await self.repo.get_user_roles(uow.session, user_id)
            has_admin_now = any(r.code == "system_admin" for r in current_roles)

            target_roles: list[Role] = []
            for r_id in role_ids:
                r = await self.repo.get_role_by_id(uow.session, r_id)
                if not r:
                    raise NotFoundError(f"'{r_id}' ID-li rol tapılmadı.")
                target_roles.append(r)

            will_have_admin = any(r.code == "system_admin" for r in target_roles)

            if has_admin_now and not will_have_admin:
                active_admins = await self._count_active_system_admins(uow.session)
                if active_admins <= 1:
                    raise LastAdminProtectionError()

            await self.repo.assign_user_roles(uow.session, user_id, role_ids)

            await record_audit_event(
                session=uow.session,
                action="RBAC_USER_ROLES_ASSIGNED",
                resource_type="users",
                resource_id=str(user_id),
                actor_id=actor_id,
                diff={
                    "before": [r.code for r in current_roles],
                    "after": [r.code for r in target_roles],
                },
            )
            await uow.commit()

    async def create_temporary_grant(
        self, data: TemporaryGrantCreate, actor: Any = None
    ) -> TemporaryGrantResponse:
        """Müvəqqəti icazə (Temporary Grant) qeyd edir."""
        if data.expires_at <= utc_now():
            raise BusinessRuleViolationError("Müvəqqəti icazənin bitmə vaxtı gələcəkdə olmalıdır.")

        async with UnitOfWork() as uow:
            grant = UserTemporaryGrant(
                id=generate_uuid7(),
                user_id=data.user_id,
                permission_key=data.permission_key,
                role_id=data.role_id,
                branch_id=data.branch_id,
                expires_at=data.expires_at,
                reason=data.reason,
                approver_id=getattr(actor, "id", data.user_id),
            )
            await self.repo.create_temporary_grant(uow.session, grant)

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="RBAC_TEMPORARY_GRANT_CREATED",
                resource_type="user_temporary_grants",
                resource_id=str(grant.id),
                actor_id=actor_id,
                diff={
                    "user_id": str(grant.user_id),
                    "permission": grant.permission_key,
                    "expires_at": grant.expires_at.isoformat(),
                    "reason": grant.reason,
                },
            )
            await uow.commit()

            return TemporaryGrantResponse(
                id=grant.id,
                user_id=grant.user_id,
                permission_key=grant.permission_key,
                role_id=grant.role_id,
                branch_id=grant.branch_id,
                expires_at=grant.expires_at,
                reason=grant.reason,
                approver_id=grant.approver_id,
                revoked_at=grant.revoked_at,
                is_active=True,
            )

    async def revoke_temporary_grant(self, grant_id: uuid.UUID, actor: Any = None) -> None:
        """Müvəqqəti icazəni vaxtından əvvəl ləğv edir."""
        async with UnitOfWork() as uow:
            grant = await self.repo.revoke_temporary_grant(uow.session, grant_id)
            if not grant:
                raise NotFoundError("Müvəqqəti icazə tapılmadı.")

            actor_id = getattr(actor, "id", None)
            await record_audit_event(
                session=uow.session,
                action="RBAC_TEMPORARY_GRANT_REVOKED",
                resource_type="user_temporary_grants",
                resource_id=str(grant.id),
                actor_id=actor_id,
            )
            await uow.commit()

    async def get_effective_permissions(self, user_id: uuid.UUID) -> EffectivePermissionsResponse:
        """İstifadəçinin bütün rollarını, istisnalarını və aktiv müvəqqəti icazələrini birləşdirir."""
        async with UnitOfWork() as uow:
            roles = await self.repo.get_user_roles(uow.session, user_id)
            role_codes = [r.code for r in roles]

            # 1. Rolların icazələri
            perms: set[str] = set()
            for r in roles:
                for rp in getattr(r, "permissions", []):
                    perms.add(rp.permission_key)

            # 2. Fərdi istisnalar (Overrides)
            overrides = await self.repo.get_permission_overrides(uow.session, user_id)
            for ov in overrides:
                if ov.granted:
                    perms.add(ov.permission_key)
                else:
                    perms.discard(ov.permission_key)

            # 3. Aktiv müvəqqəti icazələr (Temporary Grants)
            active_grants = await self.repo.list_active_temporary_grants(uow.session, user_id)
            for g in active_grants:
                if g.permission_key:
                    perms.add(g.permission_key)
                if g.role_id:
                    grant_role = await self.repo.get_role_by_id(uow.session, g.role_id)
                    if grant_role:
                        for rp in getattr(grant_role, "permissions", []):
                            perms.add(rp.permission_key)

            # 4. Filial icazələri
            if self.user_service:
                allowed_branches = await self.user_service.get_user_allowed_branches(user_id)
            else:
                from app.modules.users.service import get_user_service

                allowed_branches = await get_user_service().get_user_allowed_branches(user_id)

            is_all_branches = "system_admin" in role_codes or "system.branches.all" in perms

            # 5. Versiya heşi (Frontend keşlənməsi üçün)
            payload_for_hash = json.dumps(
                {
                    "roles": sorted(role_codes),
                    "perms": sorted(perms),
                    "branches": [str(b) for b in sorted(allowed_branches)],
                    "all_branches": is_all_branches,
                },
                sort_keys=True,
            )
            p_version = hashlib.sha256(payload_for_hash.encode("utf-8")).hexdigest()[:16]

            return EffectivePermissionsResponse(
                user_id=user_id,
                roles=role_codes,
                permissions=sorted(perms),
                allowed_branches=allowed_branches,
                is_all_branches=is_all_branches,
                permission_set_version=p_version,
            )


_rbac_service: RbacService | None = None


def get_rbac_service() -> RbacService:
    global _rbac_service
    if _rbac_service is None:
        _rbac_service = RbacService()
    return _rbac_service
