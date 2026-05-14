"""FastAPI application entry point for thehandshake.io."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import settings
from app.database import init_db, verify_db_connection

logger = logging.getLogger(__name__)


# ── Lifespan ────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("Starting thehandshake.io …")

    # Verify database connectivity
    db_ok = await verify_db_connection()
    if db_ok:
        logger.info("Database connection OK")
        await init_db()
        logger.info("Database tables ensured")
    else:
        logger.warning("Database not reachable — running without persistence")

    yield

    logger.info("Shutting down thehandshake.io …")


# ── App ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="thehandshake.io",
    description="Agent marketplace & execution platform",
    version="0.1.0",
    lifespan=lifespan,
)

# ── Middleware ──────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"],
)

# ── Static files ────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory="app/static"), name="static")

# ── Templates ───────────────────────────────────────────────────────────

templates = Jinja2Templates(directory="app/templates")

# ── Routers ─────────────────────────────────────────────────────────────

from app.routes import api_agents, api_payments, auth, web, webhooks  # noqa: E402

app.include_router(web.router)
app.include_router(auth.router)
app.include_router(api_agents.router)
app.include_router(api_payments.router)
app.include_router(webhooks.router)


# ── Root health check ───────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
