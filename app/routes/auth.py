"""Google OAuth authentication routes for thehandshake.io.

Provides login, callback, and logout endpoints using Google Sign-In
(OpenID Connect).  On success a JWT is placed in a secure HTTP-only cookie
so that the rest of the app can identify the current user via
``get_current_user`` or the cookie helper in templates.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.database import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# ── JWT helpers ─────────────────────────────────────────────────────────

COOKIE_NAME = "handshake_token"


def _create_jwt(user_id: str) -> str:
    """Create a signed JWT for the given user id."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_EXPIRATION_MINUTES
    )
    to_encode = {
        "sub": user_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the JWT as an HTTP-only cookie."""
    max_age = settings.JWT_EXPIRATION_MINUTES * 60
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="lax",
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    """Remove the auth cookie."""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
    )


def decode_jwt(token: str) -> Optional[dict]:
    """Decode and validate a JWT. Returns the payload or ``None``."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None


# ── Dependency ─────────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """FastAPI dependency that looks up the current user from the JWT cookie.

    Returns ``None`` for unauthenticated requests instead of raising 401
    so that views can differentiate "logged out" from "forbidden".
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None

    payload = decode_jwt(token)
    if payload is None:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def require_user(
    current_user: Optional[User] = Depends(get_current_user),
) -> User:
    """FastAPI dependency that raises 401 if the user is not logged in."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user


# ── Routes ─────────────────────────────────────────────────────────────

@router.get("/login")
async def login(request: Request):
    """Redirect to Google OAuth consent screen."""
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        "?response_type=code"
        f"&client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={settings.APP_URL}/auth/callback"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
    )
    return RedirectResponse(url=google_auth_url)


@router.get("/callback")
async def callback(
    request: Request,
    code: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle the Google OAuth callback.

    Exchanges the authorization code for user info, creates or looks up
    the user in the database, issues a JWT, and redirects to the dashboard.
    """
    if error:
        logger.warning("Google OAuth error: %s", error)
        return RedirectResponse(url="/?error=oauth_denied")

    if not code:
        return RedirectResponse(url="/?error=missing_code")

    # Exchange the authorization code for an ID token via Google's token endpoint.
    # We use google-auth's id_token.verify_oauth2_token which can accept a
    # directly-received ID token (from the Google One Tap / JS flow).
    # For the server-side code flow we need to exchange the code first.
    import httpx

    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": f"{settings.APP_URL}/auth/callback",
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(token_url, data=data)
        token_data = token_resp.json()

    if "id_token" not in token_data:
        logger.error("Failed to exchange code: %s", token_data.get("error", "unknown"))
        return RedirectResponse(url="/?error=auth_failed")

    try:
        info = id_token.verify_oauth2_token(
            token_data["id_token"],
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        logger.error("Invalid ID token: %s", exc)
        return RedirectResponse(url="/?error=invalid_token")

    google_id = info.get("sub")
    email = info.get("email", "")
    name = info.get("name", email.split("@")[0] if email else "User")
    avatar = info.get("picture")

    if not google_id or not email:
        return RedirectResponse(url="/?error=missing_user_info")

    # Look up existing user or create new one
    result = await db.execute(
        select(User).where(
            (User.google_id == google_id) | (User.email == email)
        )
    )
    user = result.scalar_one_or_none()

    if user:
        # Update profile in case anything changed
        if user.display_name != name:
            user.display_name = name
        if avatar and user.avatar_url != avatar:
            user.avatar_url = avatar
        if not user.google_id:
            user.google_id = google_id
    else:
        user = User(
            google_id=google_id,
            email=email,
            display_name=name,
            avatar_url=avatar,
        )
        db.add(user)

    await db.flush()
    await db.refresh(user)

    # Issue JWT
    token = _create_jwt(str(user.id))

    response = RedirectResponse(url="/dashboard")
    _set_auth_cookie(response, token)
    return response


@router.get("/logout")
async def logout():
    """Clear the auth cookie and redirect home."""
    response = RedirectResponse(url="/")
    _clear_auth_cookie(response)
    return response


@router.get("/me")
async def me(current_user: Optional[User] = Depends(get_current_user)):
    """Return the current user's profile (for client-side checks)."""
    if not current_user:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "id": str(current_user.id),
        "email": current_user.email,
        "display_name": current_user.display_name,
        "avatar_url": current_user.avatar_url,
        "is_agent": current_user.is_agent,
    }
