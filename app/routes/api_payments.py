"""Payment / checkout and transaction routes."""

import uuid
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.database import Agent, Transaction, User
from app.routes.auth import require_user

router = APIRouter(prefix="/api", tags=["payments"])

stripe.api_key = settings.STRIPE_SECRET_KEY


# ── Schemas ─────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    agent_slug: str
    success_url: str
    cancel_url: str


class SubscriptionCheckoutRequest(BaseModel):
    agent_slug: str
    success_url: str
    cancel_url: str


class ChargeRequest(BaseModel):
    amount_cents: int
    agent_slug: str


class TransactionOut(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    amount_cents: int
    status: str
    type: str
    created_at: str

    model_config = {"from_attributes": True}


# ── Routes ─────────────────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout(
    payload: CheckoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Create a Stripe PaymentIntent for a one-time agent purchase."""
    result = await db.execute(
        select(Agent).where(Agent.slug == payload.agent_slug, Agent.is_active.is_(True))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    amount = agent.price_per_call_cents or agent.subscription_price_cents or 999  # default $9.99
    if amount <= 0:
        amount = 999

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount,
            currency="usd",
            description=f"Handshake: access to agent '{agent.name}'",
            metadata={
                "agent_id": str(agent.id),
                "agent_slug": agent.slug,
                "buyer_id": str(current_user.id),
            },
        )
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    return {"client_secret": intent.client_secret, "amount_cents": amount}


@router.post("/checkout/subscription")
async def create_subscription_checkout(
    payload: SubscriptionCheckoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Create a Stripe Checkout Session for a recurring subscription."""
    result = await db.execute(
        select(Agent).where(Agent.slug == payload.agent_slug, Agent.is_active.is_(True))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    price_cents = (
        agent.subscription_price_cents
        if agent.subscription_price_cents > 0
        else 1999
    )

    try:
        checkout_session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": agent.name,
                            "description": agent.description,
                        },
                        "unit_amount": price_cents,
                        "recurring": {"interval": "month"},
                    },
                    "quantity": 1,
                }
            ],
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
            metadata={
                "agent_id": str(agent.id),
                "agent_slug": agent.slug,
                "buyer_id": str(current_user.id),
            },
        )
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    return {"checkout_url": checkout_session.url, "session_id": checkout_session.id}


@router.post("/agents/{slug}/charge")
async def charge_x402(
    slug: str,
    payload: ChargeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Minimal charge for x402 per-request payments."""
    result = await db.execute(
        select(Agent).where(Agent.slug == slug, Agent.is_active.is_(True))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if payload.amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")

    try:
        intent = stripe.PaymentIntent.create(
            amount=payload.amount_cents,
            currency="usd",
            description=f"x402 call to '{agent.name}'",
            metadata={
                "agent_id": str(agent.id),
                "agent_slug": agent.slug,
                "buyer_id": str(current_user.id),
                "type": "x402",
            },
        )
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    return {"client_secret": intent.client_secret, "amount_cents": payload.amount_cents}


@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """List the current user's transactions."""
    result = await db.execute(
        select(Transaction)
        .where(
            (Transaction.buyer_id == current_user.id)
            | (Transaction.agent.has(Agent.owner_id == current_user.id))
        )
        .order_by(Transaction.created_at.desc())
        .limit(50)
    )
    transactions = result.scalars().all()
    return [
        TransactionOut(
            id=t.id,
            agent_id=t.agent_id,
            amount_cents=t.amount_cents,
            status=t.status,
            type=t.type,
            created_at=t.created_at.isoformat(),
        )
        for t in transactions
    ]
