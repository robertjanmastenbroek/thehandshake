"""Async PostgreSQL connection via SQLAlchemy 2.0 + asyncpg."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# ── Engine ─────────────────────────────────────────────────────────────
connect_args: dict = {}
if settings.ENVIRONMENT != "development":
    # Railway Postgres requires SSL in production/staging
    connect_args["ssl"] = "require"

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.ENVIRONMENT == "development"),
    connect_args=connect_args,
    pool_size=10,
    max_overflow=20,
)

# ── Session factory ────────────────────────────────────────────────────
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Declarative base ───────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Dependency ─────────────────────────────────────────────────────────
async def get_db() -> AsyncSession:  # type: ignore[misc]
    """FastAPI dependency that yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Startup helper ─────────────────────────────────────────────────────
async def init_db() -> None:
    """Create all tables defined on ``Base.metadata``."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def verify_db_connection() -> bool:
    """Return ``True`` if the database can be reached."""
    try:
        async with engine.connect() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
        return True
    except Exception:
        return False
