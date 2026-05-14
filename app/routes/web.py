"""Web (HTML / HTMX) page routes.

Uses the JWT-cookie ``get_current_user`` dependency from ``auth`` to
provide the authenticated user to every template.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.models.database import User
from app.routes.auth import get_current_user

router = APIRouter()

templates = Jinja2Templates(directory="app/templates")
templates.env.globals["now"] = lambda: datetime.now(timezone.utc)


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def landing_page(request: Request, user: User | None = Depends(get_current_user)):
    """Landing / marketing page."""
    return templates.TemplateResponse(
        request,
        "index.html",
        {"request": request, "user": user},
    )


@router.get("/agents", response_class=HTMLResponse, include_in_schema=False)
async def agent_directory(request: Request, user: User | None = Depends(get_current_user)):
    """Marketplace directory listing all active agents."""
    return templates.TemplateResponse(
        request,
        "agents.html",
        {"request": request, "user": user},
    )


@router.get("/agents/{slug}", response_class=HTMLResponse, include_in_schema=False)
async def agent_detail(request: Request, slug: str, user: User | None = Depends(get_current_user)):
    """Individual agent listing / detail page."""
    return templates.TemplateResponse(
        request,
        "agent_detail.html",
        {"request": request, "user": user, "slug": slug},
    )


@router.get("/dashboard", response_class=HTMLResponse, include_in_schema=False)
async def dashboard(request: Request, user: User | None = Depends(get_current_user)):
    """Agent owner dashboard (auth required in production)."""
    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {"request": request, "user": user},
    )
