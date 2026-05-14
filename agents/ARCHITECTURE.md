# TheHandshake Autonomous Agent System

## Overview

A self-sustaining AI agent system that works toward $10k/month revenue without human intervention.
Runs entirely on GitHub Actions + Supabase — no laptop required.

```
                    ┌─────────────────┐
                    │    MEMORY       │
                    │   (Supabase)    │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   STRATEGIST    │  │   EXECUTOR      │  │   ANALYST       │
│   AGENT         │──│   AGENTS        │──│   AGENT         │
│  (Creates tasks)│  │ (Completes work)│  │ (Measures KPIs) │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │   TASK QUEUE    │
                    │   (Supabase)    │
                    └─────────────────┘
```

## Agent Roles

### 1. Strategist Agent (runs daily)
- Reviews progress toward $10k/mo goal
- Creates new tasks based on what's working
- Adjusts strategy based on analytics
- Prioritizes task queue

### 2. Executor Agents (run every 30 min)
- **MoltbookAgent**: Social engagement, finding leads
- **OutreachAgent**: DMs, comments, relationship building
- **ContentAgent**: Creates posts, docs, examples
- **CodeReviewBot**: Completes paid code review jobs

### 3. Analyst Agent (runs daily)
- Tracks KPIs: users, escrows, volume, revenue
- Identifies what's working / not working
- Reports to Strategist with recommendations

## Data Flow

1. **Goal**: $10k/month revenue (stored in memory)
2. **Strategist** creates tasks → Task Queue
3. **Executors** pull tasks → Complete → Store results in Memory
4. **Analyst** measures results → Updates Memory
5. **Strategist** reviews → Adjusts strategy → Loop

## Memory Schema (Supabase)

### agent_memory
- key: string (unique identifier)
- value: jsonb (any data)
- agent: string (which agent owns this)
- created_at: timestamp
- updated_at: timestamp

### agent_tasks
- id: uuid
- task_type: string (moltbook, outreach, content, code_review)
- description: text
- priority: int (1-10)
- status: pending | in_progress | completed | failed
- assigned_agent: string
- result: jsonb
- created_at: timestamp
- completed_at: timestamp

### agent_kpis
- date: date
- metric: string
- value: numeric
- notes: text

## GitHub Actions Schedule

| Workflow | Schedule | Agent |
|----------|----------|-------|
| strategist.yml | 0 6 * * * (daily 6am) | Strategist |
| moltbook.yml | */30 * * * * (every 30 min) | Moltbook |
| outreach.yml | 0 */4 * * * (every 4 hours) | Outreach |
| analyst.yml | 0 22 * * * (daily 10pm) | Analyst |
| service_bots.yml | */5 * * * * (every 5 min) | CodeReview |

## Moltbook Opportunities

### Current State
- Introduction post live
- Basic engagement every 30 min

### Untapped Opportunities
1. **Find agents who need escrow** → DM them
2. **Comment on payment/trust discussions** → Be helpful
3. **Create educational content** → "How I made my AI agent pay another"
4. **Build relationships** → Upvote, follow, engage authentically
5. **Track what content performs** → Double down on winners
6. **Cross-reference with GitHub** → Find agents with repos, reach out

## Self-Improvement Loop

```
Week 1: Establish baseline metrics
        - Users registered
        - Escrows created
        - Transaction volume

Week 2: Analyze what worked
        - Which posts got engagement?
        - Which outreach converted?
        - What services were hired?

Week 3: Double down on winners
        - More of what worked
        - Less of what didn't
        - Test new hypotheses

Week 4: Scale
        - Increase posting frequency
        - Expand to new channels
        - Add more service bots
```

## Revenue Path

```
$0 → $100/mo:     First 3 paying users (Month 1)
$100 → $1k/mo:    10 active agents (Month 2)
$1k → $5k/mo:     Product-market fit (Month 3)
$5k → $10k/mo:    Scale what works (Month 4)
```

## Key Metrics to Track

1. **Awareness**: Moltbook followers, post impressions
2. **Interest**: API docs visits, GitHub stars
3. **Activation**: API keys created
4. **Revenue**: Transaction volume, toll fees collected
5. **Retention**: Repeat transactions per agent
