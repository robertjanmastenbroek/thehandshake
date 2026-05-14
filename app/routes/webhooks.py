"""Stripe webhook endpoints."""

import hashlib
import hmac
import logging

import stripe
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.models.database import Agent, Transaction, User

logger = logging.getLogger("webhooks")
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

stripe.api_key = settings.STRIPE_SECRET_KEY


async def _verify_stripe_signature(payload: bytes, sig_header: str) -> dict:
    """Verify and parse a Stripe webhook event."""
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        logger.warning("Invalid Stripe signature: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature") from exc
    return event


async def _handle_payment_succeeded(event: dict) -> None:
    """Handle ``payment_intent.succeeded``."""
    intent = event["data"]["object"]
    metadata = intent.get("metadata", {})

    agent_slug = metadata.get("agent_slug")
    amount_cents = intent.get("amount", 0)

    if not agent_slug:
        logger.warning("payment_intent.succeeded missing agent_slug in metadata")
        return

    async with async_session_factory() as db:
        result = await db.execute(
            select(Agent).where(Agent.slug == agent_slug)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            logger.warning("Agent %s not found for payment", agent_slug)
            return

        # Look up the real buyer from Stripe metadata
        buyer_id = metadata.get("buyer_id")
        buyer = None
        if buyer_id:
            buyer_result = await db.execute(
                select(User).where(User.id == buyer_id)
            )
            buyer = buyer_result.scalar_one_or_none()

        transaction = Transaction(
            agent_id=agent.id,
            buyer_id=buyer.id if buyer else agent.owner_id,
            amount_cents=amount_cents,
            fee_cents=int(amount_cents * 0.029) + 30,  # Stripe ~2.9% + $0.30
            platform_fee_cents=int(amount_cents * 0.05),  # 5% platform fee
            stripe_payment_intent_id=intent["id"],
            status="completed",
            type=metadata.get("type", "one_time"),
        )
        db.add(transaction)
        agent.total_calls += 1
        await db.commit()

    logger.info("Payment %s recorded for agent %s", intent["id"], agent_slug)


async def _handle_checkout_completed(event: dict) -> None:
    """Handle ``checkout.session.completed`` (subscriptions)."""
    session = event["data"]["object"]
    metadata = session.get("metadata", {})

    agent_slug = metadata.get("agent_slug")
    if not agent_slug:
        logger.warning("checkout.session.completed missing agent_slug")
        return

    async with async_session_factory() as db:
        result = await db.execute(
            select(Agent).where(Agent.slug == agent_slug)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            logger.warning("Agent %s not found for subscription", agent_slug)
            return

        buyer_id = metadata.get("buyer_id")
        buyer = None
        if buyer_id:
            buyer_result = await db.execute(
                select(User).where(User.id == buyer_id)
            )
            buyer = buyer_result.scalar_one_or_none()

        amount_cents = session.get("amount_total", 0)
        transaction = Transaction(
            agent_id=agent.id,
            buyer_id=buyer.id if buyer else agent.owner_id,
            amount_cents=amount_cents,
            fee_cents=int(amount_cents * 0.029) + 30,
            platform_fee_cents=int(amount_cents * 0.05),
            stripe_payment_intent_id=session.get("payment_intent") or session["id"],
            status="completed",
            type="subscription",
        )
        db.add(transaction)
        await db.commit()

    logger.info("Subscription checkout %s completed for agent %s", session["id"], agent_slug)


# ── Routes ─────────────────────────────────────────────────────────────

@router.post("/stripe")
async def stripe_webhook(request: Request):
    """Handle incoming Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    event = await _verify_stripe_signature(payload, sig_header)
    event_type = event.get("type", "")

    if event_type == "payment_intent.succeeded":
        await _handle_payment_succeeded(event)
    elif event_type == "checkout.session.completed":
        await _handle_checkout_completed(event)
    else:
        logger.info("Unhandled event type: %s", event_type)

    return {"received": True}


@router.post("/stripe/connect")
async def stripe_connect_webhook(request: Request):
    """Handle Stripe Connect webhook events (account onboarding etc.)."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    event = await _verify_stripe_signature(payload, sig_header)
    event_type = event.get("type", "")

    logger.info("Stripe Connect event: %s", event_type)

    if event_type == "account.updated":
        account = event["data"]["object"]
        async with async_session_factory() as db:
            result = await db.execute(
                select(User).where(User.stripe_connect_id == account["id"])
            )
            user = result.scalar_one_or_none()
            if user:
                user.is_agent = account.get("charges_enabled", False)
                await db.commit()

    return {"received": True}
