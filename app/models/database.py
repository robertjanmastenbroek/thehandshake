"""SQLAlchemy ORM models for thehandshake.io."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


# ── Helper ──────────────────────────────────────────────────────────────
def _new_uuid() -> UUID:
    return uuid.uuid4()


def _utcnow() -> datetime:
    return datetime.utcnow()


# ── User ────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    google_id = Column(String(255), unique=True, nullable=True)
    email = Column(String(320), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=False)
    avatar_url = Column(Text, nullable=True)

    # Stripe
    stripe_account_id = Column(String(255), nullable=True)
    stripe_connect_id = Column(String(255), nullable=True)

    # Flags
    is_agent = Column(Boolean, default=False, nullable=False)
    role = Column(String(50), default="user", nullable=False)  # user | admin

    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    agents = relationship("Agent", back_populates="owner")
    transactions = relationship(
        "Transaction", foreign_keys="Transaction.buyer_id", back_populates="buyer"
    )
    api_keys = relationship("ApiKey", back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.email}>"


# ── Agent ───────────────────────────────────────────────────────────────
class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    owner_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    slug = Column(String(255), unique=True, nullable=False, index=True)

    # Endpoints
    mcp_endpoint_url = Column(Text, nullable=True)
    a2a_endpoint_url = Column(Text, nullable=True)

    # Pricing (cents)
    price_per_call_cents = Column(Integer, default=0, nullable=False)  # x402 pay-per-call
    subscription_price_cents = Column(Integer, default=0, nullable=False)  # monthly

    # Metadata
    is_active = Column(Boolean, default=True, nullable=False)
    category = Column(String(100), nullable=True)
    tags = Column(Text, nullable=True)  # comma-separated
    rating = Column(Float, default=0.0, nullable=False)
    total_calls = Column(Integer, default=0, nullable=False)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    owner = relationship("User", back_populates="agents")
    transactions = relationship("Transaction", back_populates="agent")

    @property
    def tags_list(self) -> list[str]:
        return [t.strip() for t in (self.tags or "").split(",") if t.strip()]

    def __repr__(self) -> str:
        return f"<Agent {self.slug}>"


# ── Transaction ─────────────────────────────────────────────────────────
class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True
    )
    buyer_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    # Amounts (cents)
    amount_cents = Column(Integer, nullable=False)
    fee_cents = Column(Integer, default=0, nullable=False)
    platform_fee_cents = Column(Integer, default=0, nullable=False)

    # Stripe
    stripe_payment_intent_id = Column(String(255), nullable=True, unique=True)

    # Status / type
    status = Column(
        String(50), default="pending", nullable=False  # pending | completed | refunded
    )
    type = Column(
        String(50), default="one_time", nullable=False  # one_time | subscription | x402
    )

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    agent = relationship("Agent", back_populates="transactions")
    buyer = relationship("User", foreign_keys=[buyer_id], back_populates="transactions")

    def __repr__(self) -> str:
        return f"<Transaction {self.id} – {self.status}>"


# ── ApiKey ──────────────────────────────────────────────────────────────
class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    name = Column(String(255), nullable=False)
    key_hash = Column(String(255), nullable=False)
    key_prefix = Column(String(8), nullable=False)  # first 8 characters for display
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    last_used_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="api_keys")

    def __repr__(self) -> str:
        return f"<ApiKey {self.key_prefix}… ({self.name})>"
