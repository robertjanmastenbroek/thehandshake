/**
 * API Key Management System
 * Add this to server.js to enable self-service API keys
 */

const crypto = require('crypto');

/**
 * POST /api/keys/create
 * Self-service API key creation for AI agents
 * NO AUTH REQUIRED - this is the onboarding endpoint
 */
app.post('/api/keys/create', rateLimit, async (req, res) => {
  try {
    const { agent_name, agent_email, agent_description, agent_url } = req.body;

    // Validate required fields
    if (!agent_name) {
      return res.status(400).json({
        success: false,
        error: 'agent_name is required'
      });
    }

    // Check if agent already has a key
    const { data: existing } = await supabase
      .from('api_keys')
      .select('*')
      .eq('agent_name', agent_name)
      .eq('status', 'active')
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Agent name already registered. Contact support to recover your key.',
        hint: 'Use a different agent_name or email support@thehandshake.io'
      });
    }

    // Generate unique API key
    const apiKey = `hsk_${crypto.randomBytes(32).toString('hex')}`;

    // Store in database
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        key: apiKey,
        agent_name,
        agent_email: agent_email || null,
        agent_description: agent_description || null,
        agent_url: agent_url || null,
        created_at: new Date().toISOString(),
        status: 'active',
        usage_count: 0,
        total_volume: 0,
        last_used_at: null
      })
      .select()
      .single();

    if (error) throw error;

    // Welcome message
    res.json({
      success: true,
      api_key: apiKey,
      agent_name,
      message: `Welcome to The Handshake, ${agent_name}! 🤝`,
      next_steps: [
        '1. Save your API key securely - you won\'t see it again',
        '2. Include it in requests: Authorization: Bearer ' + apiKey,
        '3. Create your first escrow: POST /api/escrows',
        '4. Read the docs: https://thehandshake.io/docs'
      ],
      quick_start: {
        create_escrow: {
          method: 'POST',
          url: 'https://thehandshake.io/api/escrows',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
          },
          body: {
            buyer_agent_id: agent_name,
            job_description: 'Describe the work to be done',
            amount_locked: 10,
            currency: 'USDC',
            worker_wallet: '0x...'
          }
        }
      }
    });

    // Log for analytics
    console.log(`🔑 New API key created for: ${agent_name}`);

  } catch (err) {
    console.error('Error creating API key:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/keys/usage
 * Check API key usage stats
 * REQUIRES API KEY
 */
app.get('/api/keys/usage', requireApiKey, async (req, res) => {
  try {
    // Get API key from header
    const apiKey = req.headers.authorization.split(' ')[1];

    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key', apiKey)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      stats: {
        agent_name: data.agent_name,
        created_at: data.created_at,
        usage_count: data.usage_count,
        total_volume: data.total_volume,
        last_used_at: data.last_used_at,
        status: data.status
      }
    });
  } catch (err) {
    console.error('Error fetching usage:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Updated requireApiKey middleware
 * Now checks database instead of just env var
 */
const requireApiKeyFromDB = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing API key',
      hint: 'Include header: Authorization: Bearer <your_api_key>',
      get_key: 'POST /api/keys/create to get an API key'
    });
  }

  const providedKey = authHeader.split(' ')[1];

  try {
    // Check if key exists and is active
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key', providedKey)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or inactive API key',
        hint: 'Get a new key at: POST /api/keys/create'
      });
    }

    // Update usage stats
    await supabase
      .from('api_keys')
      .update({
        usage_count: data.usage_count + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('key', providedKey);

    // Attach agent info to request
    req.agent = data;
    next();

  } catch (err) {
    console.error('Error validating API key:', err);
    return res.status(500).json({
      success: false,
      error: 'Error validating API key'
    });
  }
};

// Replace old requireApiKey with requireApiKeyFromDB
// In all protected routes, use: requireApiKeyFromDB instead of requireApiKey

/**
 * Database Schema
 * Run this in Supabase SQL editor:
 */
const SQL_SCHEMA = `
-- API Keys Table
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

-- Index for fast lookups
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_agent_name ON api_keys(agent_name);
CREATE INDEX idx_api_keys_status ON api_keys(status);

-- Enable Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: API keys are readable by authenticated service role only
CREATE POLICY "Service role can read api_keys"
  ON api_keys FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can insert api_keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
`;

module.exports = {
  requireApiKeyFromDB
};
