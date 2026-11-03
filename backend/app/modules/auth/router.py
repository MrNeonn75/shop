"""Autentifikasiya Modulu API Marşrutları (Auth Router).

Giriş, 2FA, Refresh Token rotasiyası, şifrə bərpası və menecer təsdiqləri endpoint-ləri.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Depends, Request, Response, status

from app.core.config import settings
from app.core.errors import UnauthenticatedError
from app.modules.auth.policies import AuthenticatedUser, get_current_user
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    ManagerApproveRequest,
    ManagerApproveResponse,
    RefreshTokenRequest,
    ResetPasswordRequest,
    TwoFactorDisableRequest,
    TwoFactorEnrollResponse,
    TwoFactorLoginRequest,
    TwoFactorVerifyRequest,
)
from app.modules.auth.service import AuthService, get_auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

REFRESH_COOKIE_NAME = "bh_refresh_token"


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """HttpOnly, Secure və SameSite xassələri ilə Refresh Token kukisini yazır."""
    max_age = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=max_age,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Refresh Token kukisini təmizləyir."""
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/api/v1/auth")


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="İstifadəçi adı və şifrə ilə sistemə daxil ol",
)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> LoginResponse:
    """İstifadəçi girişi. Uğurlu olduqda Access Token qaytarır və Refresh Token kukisini təyin edir."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    login_resp, raw_refresh = await service.login(data, ip_address=ip, user_agent=ua)
    if raw_refresh:
        _set_refresh_cookie(response, raw_refresh)
    return login_resp


@router.post(
    "/2fa/login",
    response_model=LoginResponse,
    summary="2FA təsdiq kodu ilə girişi tamamla",
)
async def login_2fa(
    data: TwoFactorLoginRequest,
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> LoginResponse:
    """İlkin girişdən sonra 2FA birdəfəlik kodu (və ya bərpa kodu) ilə tam daxil olmaq."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    login_resp, raw_refresh = await service.complete_2fa_login(
        temp_token=data.temp_token,
        code=data.code,
        ip_address=ip,
        user_agent=ua,
    )
    _set_refresh_cookie(response, raw_refresh)
    return login_resp


@router.post(
    "/refresh",
    summary="Access tokeni yenilə (Refresh Token rotasiyası ilə)",
)
async def refresh_tokens(
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None = None,
    cookie_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
    service: Annotated[AuthService, Depends(get_auth_service)] = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Kuki və ya gövdədən Refresh Token oxuyur, rotasiya edir və yeni Access Token qaytarır."""
    raw_token = cookie_token or (body.refresh_token if body else None)
    if not raw_token:
        raise UnauthenticatedError("Refresh token təqdim edilməyib.")

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    access_token, new_refresh, expires_in = await service.refresh_tokens(
        raw_refresh_token=raw_token,
        ip_address=ip,
        user_agent=ua,
    )
    _set_refresh_cookie(response, new_refresh)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expires_in,
    }


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cari sessiyadan çıxış et",
)
async def logout(
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> Response:
    """Cari sessiyanı bağlayır və Refresh Token kukisini silir."""
    session_id = getattr(request.state, "session_id", None)
    if session_id:
        await service.session_service.revoke_session(session_id)
    _clear_refresh_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Bütün cihazlardan çıxış et",
)
async def logout_all(
    response: Response,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> Response:
    """İstifadəçinin bütün cihazlardakı aktiv sessiyalarını ləğv edir."""
    await service.session_service.revoke_all_user_sessions(user.id, actor=user)
    _clear_refresh_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/forgot-password",
    summary="Şifrə sıfırlama təlimatı istə",
)
async def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict[str, str]:
    """İstifadəçi üçün şifrə bərpa linki yaradır (Generic cavab)."""
    ip = request.client.host if request.client else None
    await service.forgot_password(email=data.email, ip_address=ip)
    return {
        "message": "Əgər daxil etdiyiniz e-poçt ünvanı sistemdə mövcuddursa, şifrə bərpa təlimatı göndərildi."
    }


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Şifrəni birdəfəlik token ilə sıfırla",
)
async def reset_password(
    data: ResetPasswordRequest,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> Response:
    """Tokeni yoxlayaraq yeni şifrə təyin edir."""
    await service.reset_password(token=data.token, new_password=data.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/2fa/enroll",
    response_model=TwoFactorEnrollResponse,
    summary="2FA quraşdırmasını başlat (QR və bərpa kodları)",
)
async def enroll_2fa(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> TwoFactorEnrollResponse:
    """İstifadəçi üçün TOTP açarı və 8 ədəd birdəfəlik bərpa kodu generasiya edir."""
    return await service.enroll_2fa(user.id)


@router.post(
    "/2fa/verify",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="2FA kodunu yoxla və aktivləşdir",
)
async def verify_2fa(
    data: TwoFactorVerifyRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> Response:
    """Authenticator tətbiqindən daxil edilən kodu təsdiqləyərək 2FA-nı aktiv edir."""
    await service.verify_2fa(user.id, code=data.code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/2fa/disable",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="2FA-nı söndür",
)
async def disable_2fa(
    data: TwoFactorDisableRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> Response:
    """Şifrəni yoxlayaraq 2FA-nı deaktiv edir."""
    await service.disable_2fa(user.id, password=data.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/approve",
    response_model=ManagerApproveResponse,
    summary="Menecer təsdiq tokeni yarat (POS/Həssas əməliyyat)",
)
async def manager_approve(
    data: ManagerApproveRequest,
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> ManagerApproveResponse:
    """Menecer PIN kodunu və hüququnu yoxlayaraq qısamüddətli birdəfəlik təsdiq tokeni verir."""
    requester = getattr(request.state, "user", None)
    requester_id = getattr(requester, "id", None)
    return await service.create_manager_approval(data, requester_id=requester_id)
