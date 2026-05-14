-- THE HANDSHAKE - Autonomous Agent System Schema
-- Run this in Supabase SQL Editor

-- ===========================================
-- Agent Memory (Long-term storage)
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  agent TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(key, agent)
);

CREATE INDEX IF NOT EXISTS idx_memory_agent ON agent_memory(agent);
CREATE INDEX IF NOT EXISTS idx_memory_category ON agent_memory(category);
CREATE INDEX IF NOT EXISTS idx_memory_key ON agent_memory(key);

-- ===========================================
-- Agent Task Queue
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_type TEXT NOT NULL,
  description TEXT NOT NULL,
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  assigned_agent TEXT,
  input_data JSONB DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON agent_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON agent_tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON agent_tasks(assigned_agent);

-- ===========================================
-- KPI Tracking
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_kpis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  previous_value NUMERIC,
  change_percent NUMERIC,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, metric)
);

CREATE INDEX IF NOT EXISTS idx_kpis_date ON agent_kpis(date);
CREATE INDEX IF NOT EXISTS idx_kpis_metric ON agent_kpis(metric);

-- ===========================================
-- Agent Execution Log
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT DEFAULT 'success',
  duration_ms INTEGER,
  input_summary TEXT,
  output_summary TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_agent ON agent_logs(agent);
CREATE INDEX IF NOT EXISTS idx_logs_action ON agent_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_created ON agent_logs(created_at);

-- ===========================================
-- Strategic Goals
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC DEFAULT 0,
  metric TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'failed', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the main goal
INSERT INTO agent_goals (name, description, target_value, current_value, metric, deadline)
VALUES (
  '$10k Monthly Revenue',
  'Reach $10,000 per month in toll fees from agent-to-agent transactions',
  10000,
  0,
  'monthly_revenue',
  NOW() + INTERVAL '4 months'
) ON CONFLICT DO NOTHING;

-- ===========================================
-- Moltbook Engagement Tracking
-- ===========================================
CREATE TABLE IF NOT EXISTS moltbook_engagements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id TEXT,
  action_type TEXT NOT NULL, -- post, comment, upvote, follow
  target_user TEXT,
  content_summary TEXT,
  engagement_score INTEGER DEFAULT 0, -- likes, replies received
  conversion BOOLEAN DEFAULT FALSE, -- did they sign up?
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moltbook_type ON moltbook_engagements(action_type);
CREATE INDEX IF NOT EXISTS idx_moltbook_conversion ON moltbook_engagements(conversion);

-- ===========================================
-- Leads Pipeline
-- ===========================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL, -- moltbook, github, twitter, reddit
  identifier TEXT NOT NULL, -- username or handle
  name TEXT,
  context TEXT, -- why they're a lead
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'engaged', 'converted', 'lost')),
  last_contacted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, identifier)
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

-- ===========================================
-- Helper Functions
-- ===========================================

-- Get next task for an agent
CREATE OR REPLACE FUNCTION get_next_task(agent_type TEXT)
RETURNS agent_tasks AS $$
DECLARE
  task agent_tasks;
BEGIN
  SELECT * INTO task
  FROM agent_tasks
  WHERE status = 'pending'
    AND (assigned_agent IS NULL OR assigned_agent = agent_type)
    AND (deadline IS NULL OR deadline > NOW())
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF task.id IS NOT NULL THEN
    UPDATE agent_tasks
    SET status = 'in_progress', started_at = NOW(), assigned_agent = agent_type
    WHERE id = task.id;
  END IF;

  RETURN task;
END;
$$ LANGUAGE plpgsql;

-- Update memory with timestamp
CREATE OR REPLACE FUNCTION upsert_memory(
  p_key TEXT,
  p_value JSONB,
  p_agent TEXT,
  p_category TEXT DEFAULT 'general'
)
RETURNS void AS $$
BEGIN
  INSERT INTO agent_memory (key, value, agent, category, updated_at)
  VALUES (p_key, p_value, p_agent, p_category, NOW())
  ON CONFLICT (key, agent)
  DO UPDATE SET value = p_value, updated_at = NOW(), category = p_category;
END;
$$ LANGUAGE plpgsql;

-- Record KPI with change tracking
CREATE OR REPLACE FUNCTION record_kpi(
  p_metric TEXT,
  p_value NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  prev_value NUMERIC;
  change NUMERIC;
BEGIN
  -- Get previous value
  SELECT value INTO prev_value
  FROM agent_kpis
  WHERE metric = p_metric
  ORDER BY date DESC
  LIMIT 1;

  -- Calculate change
  IF prev_value IS NOT NULL AND prev_value != 0 THEN
    change := ((p_value - prev_value) / prev_value) * 100;
  END IF;

  INSERT INTO agent_kpis (metric, value, previous_value, change_percent, notes)
  VALUES (p_metric, p_value, prev_value, change, p_notes)
  ON CONFLICT (date, metric)
  DO UPDATE SET value = p_value, previous_value = prev_value, change_percent = change, notes = p_notes;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE moltbook_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role full access" ON agent_memory FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON agent_tasks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON agent_kpis FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON agent_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON agent_goals FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON moltbook_engagements FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON leads FOR ALL USING (auth.role() = 'service_role');

SELECT 'Agent system schema created!' as status;
