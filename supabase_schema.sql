-- THE HANDSHAKE - Supabase Schema
-- Run this in Supabase SQL Editor to set up all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- API Keys Table (Self-service registration)
-- ===========================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  agent_name TEXT NOT NULL,
  agent_email TEXT,
  agent_description TEXT,
  agent_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active', -- active, suspended, revoked
  usage_count INTEGER DEFAULT 0,
  total_volume NUMERIC DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_agent_name ON api_keys(agent_name);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- ===========================================
-- Services Table (Marketplace)
-- ===========================================
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_agent TEXT NOT NULL,
  service_name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_min NUMERIC NOT NULL,
  price_max NUMERIC,
  currency TEXT DEFAULT 'USDC',
  category TEXT DEFAULT 'general',
  capabilities TEXT[] DEFAULT '{}',
  endpoint_url TEXT,
  example_request JSONB,
  status TEXT DEFAULT 'active', -- active, paused, retired
  jobs_completed INTEGER DEFAULT 0,
  rating NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for marketplace queries
CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_agent);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_price ON services(price_min);

-- ===========================================
-- Escrows Table (Already exists, adding service_id)
-- ===========================================
-- If escrows table exists, add service_id column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'escrows') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'escrows' AND column_name = 'service_id') THEN
      ALTER TABLE escrows ADD COLUMN service_id UUID REFERENCES services(id);
    END IF;
  END IF;
END $$;

-- If escrows table doesn't exist, create it
CREATE TABLE IF NOT EXISTS escrows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_agent_id TEXT NOT NULL,
  worker_agent_id TEXT,
  job_description TEXT NOT NULL,
  amount_locked NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USDC',
  buyer_wallet TEXT,
  worker_wallet TEXT,
  toll_fee NUMERIC,
  worker_payout NUMERIC,
  status TEXT DEFAULT 'LOCKED',
  service_id UUID REFERENCES services(id),
  work_submitted TEXT,
  work_submitted_at TIMESTAMPTZ,
  judge_verdict TEXT,
  verified_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  payout_tx_hash TEXT,
  toll_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escrow indexes
CREATE INDEX IF NOT EXISTS idx_escrows_buyer ON escrows(buyer_agent_id);
CREATE INDEX IF NOT EXISTS idx_escrows_worker ON escrows(worker_agent_id);
CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status);
CREATE INDEX IF NOT EXISTS idx_escrows_service ON escrows(service_id);

-- ===========================================
-- Transaction Log (For analytics)
-- ===========================================
CREATE TABLE IF NOT EXISTS transaction_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  escrow_id UUID REFERENCES escrows(id),
  event_type TEXT NOT NULL, -- created, submitted, verified, paid, refunded
  agent_id TEXT,
  amount NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_log_escrow ON transaction_log(escrow_id);
CREATE INDEX IF NOT EXISTS idx_tx_log_event ON transaction_log(event_type);
CREATE INDEX IF NOT EXISTS idx_tx_log_agent ON transaction_log(agent_id);

-- ===========================================
-- Row Level Security (Optional but recommended)
-- ===========================================
-- Enable RLS on tables
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_log ENABLE ROW LEVEL SECURITY;

-- Policies: Service role has full access
CREATE POLICY "Service role full access on api_keys" ON api_keys
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on services" ON services
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on escrows" ON escrows
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on transaction_log" ON transaction_log
  FOR ALL USING (auth.role() = 'service_role');

-- ===========================================
-- Helper Functions
-- ===========================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS services_updated_at ON services;
CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS escrows_updated_at ON escrows;
CREATE TRIGGER escrows_updated_at
  BEFORE UPDATE ON escrows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- Seed Data: Register built-in services
-- ===========================================
INSERT INTO api_keys (key, agent_name, agent_description, status)
VALUES
  ('hsk_builtin_codereview', 'CodeReviewBot', 'Built-in code review service', 'active'),
  ('hsk_builtin_docgen', 'DocGenBot', 'Built-in documentation generator', 'active'),
  ('hsk_builtin_testwriter', 'TestWriterBot', 'Built-in test writer service', 'active')
ON CONFLICT (key) DO NOTHING;

INSERT INTO services (provider_agent, service_name, description, price_min, price_max, currency, category, capabilities)
VALUES
  ('CodeReviewBot', 'AI Code Review', 'Comprehensive code review with bug detection, security analysis, and improvement suggestions', 5, 20, 'USDC', 'development', ARRAY['code-review', 'security', 'best-practices']),
  ('DocGenBot', 'Documentation Generator', 'Generate comprehensive documentation from code including README, API docs, and inline comments', 2, 10, 'USDC', 'development', ARRAY['documentation', 'readme', 'api-docs']),
  ('TestWriterBot', 'Test Writer', 'Generate unit tests, integration tests, and test cases for your code', 5, 15, 'USDC', 'development', ARRAY['testing', 'unit-tests', 'integration-tests'])
ON CONFLICT DO NOTHING;

-- Done!
SELECT 'Schema created successfully!' as status;
