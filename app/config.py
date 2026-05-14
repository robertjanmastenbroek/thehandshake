"""Application configuration via pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/thehandshake"
    )

    # ── Stripe ────────────────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # ── Auth / JWT ────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production-to-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60 * 24  # 24 hours

    # ── Google OAuth ──────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # ── AI / Agents ──────────────────────────────────────────────────
    DEEPSEEK_API_KEY: str = ""

    # ── Analytics ────────────────────────────────────────────────────
    GA_ID: str = ""

    # ── App ──────────────────────────────────────────────────────────
    APP_URL: str = "http://localhost:8000"
    CRON_SECRET: str = ""
    ENVIRONMENT: str = "development"  # "development" | "staging" | "production"


settings = Settings()
