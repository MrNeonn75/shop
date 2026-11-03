"""Autentifikasiya Siyasət və Dependency Qatı (Auth Policies & Dependencies).

JWT tokeni oxuyaraq cari autentifikasiya olunmuş istifadəçini (`request.state.user`) müəyyən edir.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import AccountSuspendedError, UnauthenticatedError
from app.modules.auth.tokens import decode_access_token
from app.modules.rbac.service import get_rbac_service
from app.modules.users.service import get_user_service

security_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser:
    """Request kontekstində saxlanılan istifadəçi obyekti."""

    def __init__(
        self,
        id: uuid.UUID,
        username: str,
        email: str,
        full_name: str,
        roles: list[str],
        permissions: list[str],
        allowed_branches: list[uuid.UUID],
        session_id: uuid.UUID,
    ) -> None:
        self.id = id
        self.username = username
        self.email = email
        self.full_name = full_name
        self.roles = roles
        self.permissions = permissions
        self.allowed_branches = allowed_branches
        self.session_id = session_id


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
) -> AuthenticatedUser:
    """HTTP Authorization: Bearer <token> başlığından istifadəçini çıxarır."""
    if not credentials or not credentials.credentials:
        raise UnauthenticatedError("Giriş tələb olunur.")

    payload = decode_access_token(credentials.credentials)
    user_id = uuid.UUID(payload["sub"])
    session_id = uuid.UUID(payload["session_id"])

    user_service = get_user_service()
    user_resp = await user_service.get_user_by_id(user_id)

    if user_resp.status == "suspended":
        raise AccountSuspendedError()

    rbac_service = get_rbac_service()
    eff = await rbac_service.get_effective_permissions(user_id)

    auth_user = AuthenticatedUser(
        id=user_resp.id,
        username=user_resp.username,
        email=user_resp.email,
        full_name=user_resp.full_name,
        roles=eff.roles,
        permissions=eff.permissions,
        allowed_branches=eff.allowed_branches,
        session_id=session_id,
    )

    request.state.user = auth_user
    request.state.session_id = session_id
    request.state.branch_scope_ids = eff.allowed_branches
    return auth_user
