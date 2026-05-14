"""Agent CRUD and execution API routes."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.database import Agent, Transaction, User
from app.routes.auth import get_current_user, require_user

router = APIRouter(prefix="/api/agents", tags=["agents"])


# ── Schemas ─────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    slug: str
    mcp_endpoint_url: Optional[str] = None
    a2a_endpoint_url: Optional[str] = None
    price_per_call_cents: int = 0
    subscription_price_cents: int = 0
    category: Optional[str] = None
    tags: Optional[str] = None  # comma-separated


class AgentOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    slug: str
    mcp_endpoint_url: Optional[str]
    a2a_endpoint_url: Optional[str]
    price_per_call_cents: int
    subscription_price_cents: int
    is_active: bool
    category: Optional[str]
    tags: Optional[str]
    rating: float
    total_calls: int
    owner_id: uuid.UUID

    model_config = {"from_attributes": True}


class ExecuteRequest(BaseModel):
    input: dict
    api_key: Optional[str] = None


class ExecuteResponse(BaseModel):
    result: dict
    agent_slug: str


# ── Routes ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[AgentOut])
async def list_agents(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List active agents with optional search and category filters."""
    query = select(Agent).where(Agent.is_active.is_(True))

    if search:
        like = f"%{search}%"
        query = query.where(
            Agent.name.ilike(like) | Agent.description.ilike(like)
        )
    if category:
        query = query.where(Agent.category == category)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()  # type: ignore[arg-type]

    query = (
        query.order_by(Agent.rating.desc(), Agent.total_calls.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    agents = result.scalars().all()
    return [AgentOut.model_validate(a) for a in agents]


@router.get("/{slug}", response_model=AgentOut)
async def get_agent(slug: str, db: AsyncSession = Depends(get_db)):
    """Get a single agent by its slug."""
    result = await db.execute(
        select(Agent).where(Agent.slug == slug, Agent.is_active.is_(True))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentOut.model_validate(agent)


@router.post("", response_model=AgentOut, status_code=201)
async def register_agent(
    payload: AgentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Register or update an agent for the authenticated user."""
    existing = await db.execute(
        select(Agent).where(Agent.slug == payload.slug)
    )
    agent = existing.scalar_one_or_none()

    if agent:
        # Only the owner can update
        if agent.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="You do not own this agent")
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(agent, field, value)
    else:
        agent = Agent(
            owner_id=current_user.id,
            **payload.model_dump(),
        )
        db.add(agent)

    await db.flush()
    await db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.post("/{slug}/execute", response_model=ExecuteResponse)
async def execute_agent(
    slug: str,
    payload: ExecuteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Execute an agent by proxying to its MCP or A2A endpoint.

    Records the execution against the authenticated user if available.
    In production this calls the remote endpoint and returns the result.
    """
    result = await db.execute(
        select(Agent).where(Agent.slug == slug, Agent.is_active.is_(True))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Stub: in production this would make an httpx call to the agent's endpoint.
    # For now we echo back the input as a placeholder.
    agent.total_calls += 1  # no-op in stub; persisted via commit in real flow

    return ExecuteResponse(
        result={"echo": payload.input, "note": "Agent execution stub - implement real proxy"},
        agent_slug=slug,
    )
