/**
 * THE HANDSHAKE - Universal A2A Escrow Toll Booth
 * Main Express Server
 *
 * Where AI agents transact with trust.
 * "Point A to Point B" - From hope to verified payment.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { judgeWork } = require('./judge_logic');
const { executePayout } = require('./payout');

const app = express();
const PORT = process.env.PORT || 3000;

// ===========================================
// Supabase Client
// ===========================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ===========================================
// Middleware
// ===========================================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ===========================================
// Rate Limiting
// ===========================================
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const limit = rateLimits.get(ip);

  if (now > limit.resetAt) {
    limit.count = 1;
    limit.resetAt = now + RATE_LIMIT_WINDOW;
    return next();
  }

  if (limit.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. Try again later.'
    });
  }

  limit.count++;
  next();
};

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ===========================================
// API Key Authentication (Database-backed)
// ===========================================

/**
 * Middleware to verify API key from database
 * Agents must include: Authorization: Bearer <api_key>
 */
const requireApiKey = async (req, res, next) => {
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

  // Check legacy env-based key first (for backwards compatibility)
  if (process.env.HANDSHAKE_API_KEY && providedKey === process.env.HANDSHAKE_API_KEY) {
    req.agent = { agent_name: 'legacy_admin', is_admin: true };
    return next();
  }

  try {
    // Check if key exists and is active in database
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

    // Update usage stats (fire and forget)
    supabase
      .from('api_keys')
      .update({
        usage_count: data.usage_count + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('key', providedKey)
      .then(() => {});

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

// ===========================================
// API KEY MANAGEMENT ROUTES
// ===========================================

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
        '4. Browse services: GET /api/services'
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

    console.log(`🔑 New API key created for: ${agent_name}`);

  } catch (err) {
    console.error('Error creating API key:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/keys/usage
 * Check API key usage stats
 */
app.get('/api/keys/usage', requireApiKey, async (req, res) => {
  try {
    res.json({
      success: true,
      stats: {
        agent_name: req.agent.agent_name,
        created_at: req.agent.created_at,
        usage_count: req.agent.usage_count,
        total_volume: req.agent.total_volume,
        last_used_at: req.agent.last_used_at,
        status: req.agent.status
      }
    });
  } catch (err) {
    console.error('Error fetching usage:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================
// SERVICE REGISTRY ROUTES (Marketplace)
// ===========================================

/**
 * POST /api/services/register
 * Register a new service in the marketplace
 */
app.post('/api/services/register', rateLimit, requireApiKey, async (req, res) => {
  try {
    const {
      service_name,
      description,
      price_min,
      price_max,
      currency,
      category,
      capabilities,
      endpoint_url,
      example_request
    } = req.body;

    if (!service_name || !description || !price_min) {
      return res.status(400).json({
        success: false,
        error: 'Required: service_name, description, price_min'
      });
    }

    const { data, error } = await supabase
      .from('services')
      .insert({
        provider_agent: req.agent.agent_name,
        service_name,
        description,
        price_min: parseFloat(price_min),
        price_max: price_max ? parseFloat(price_max) : parseFloat(price_min),
        currency: currency || 'USDC',
        category: category || 'general',
        capabilities: capabilities || [],
        endpoint_url: endpoint_url || null,
        example_request: example_request || null,
        status: 'active',
        jobs_completed: 0,
        rating: null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      service: data,
      message: `Service "${service_name}" registered! Other agents can now find and hire you.`
    });

    console.log(`📦 New service registered: ${service_name} by ${req.agent.agent_name}`);

  } catch (err) {
    console.error('Error registering service:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/services
 * Browse available services (marketplace)
 */
app.get('/api/services', rateLimit, async (req, res) => {
  try {
    const { category, max_price, search } = req.query;

    let query = supabase
      .from('services')
      .select('*')
      .eq('status', 'active')
      .order('jobs_completed', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    if (max_price) {
      query = query.lte('price_min', parseFloat(max_price));
    }

    if (search) {
      query = query.or(`service_name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      services: data,
      count: data.length
    });

  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/services/:id/hire
 * Hire a service (creates escrow automatically)
 */
app.post('/api/services/:id/hire', rateLimit, requireApiKey, async (req, res) => {
  try {
    const serviceId = req.params.id;
    const { job_description, amount, worker_wallet } = req.body;

    // Get the service
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    // Get the service provider's wallet
    const { data: provider } = await supabase
      .from('api_keys')
      .select('agent_name')
      .eq('agent_name', service.provider_agent)
      .single();

    // Create escrow for this job
    const tollFee = parseFloat(amount) * (parseFloat(process.env.TOLL_FEE_PERCENT || 2.5) / 100);
    const workerPayout = parseFloat(amount) - tollFee;

    const { data: escrow, error: escrowError } = await supabase
      .from('escrows')
      .insert({
        buyer_agent_id: req.agent.agent_name,
        worker_agent_id: service.provider_agent,
        job_description: job_description || service.description,
        amount_locked: parseFloat(amount),
        currency: service.currency,
        buyer_wallet: req.body.buyer_wallet || null,
        worker_wallet: worker_wallet || null,
        toll_fee: tollFee,
        worker_payout: workerPayout,
        status: 'LOCKED',
        service_id: serviceId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (escrowError) throw escrowError;

    res.json({
      success: true,
      escrow: escrow,
      service: {
        name: service.service_name,
        provider: service.provider_agent
      },
      message: `Hired ${service.service_name}! Escrow created. Provider will be notified.`,
      next_steps: [
        '1. Provider completes work',
        '2. Provider submits: POST /api/escrows/' + escrow.id + '/submit',
        '3. Verify: POST /api/escrows/' + escrow.id + '/verify',
        '4. Payout: POST /api/escrows/' + escrow.id + '/payout'
      ]
    });

    console.log(`💼 ${req.agent.agent_name} hired ${service.service_name}`);

  } catch (err) {
    console.error('Error hiring service:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================
// ESCROW ROUTES
// ===========================================

/**
 * Health Check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'The Handshake',
    version: '2.0.0',
    features: ['escrow', 'ai-judge', 'self-service-keys', 'service-marketplace'],
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/escrows
 * Fetch all escrows (for dashboard)
 */
app.get('/api/escrows', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('escrows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, escrows: data });
  } catch (err) {
    console.error('Error fetching escrows:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/escrows/:id
 * Fetch single escrow by ID
 */
app.get('/api/escrows/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('escrows')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json({ success: true, escrow: data });
  } catch (err) {
    console.error('Error fetching escrow:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/escrows
 * Create a new escrow (Agent A locks funds)
 */
app.post('/api/escrows', rateLimit, requireApiKey, async (req, res) => {
  try {
    const {
      buyer_agent_id,
      worker_agent_id,
      job_description,
      amount_locked,
      currency,
      buyer_wallet,
      worker_wallet
    } = req.body;

    // Validate required fields
    if (!job_description || !amount_locked) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: job_description, amount_locked'
      });
    }

    const tollFee = parseFloat(amount_locked) * (parseFloat(process.env.TOLL_FEE_PERCENT || 2.5) / 100);
    const workerPayout = parseFloat(amount_locked) - tollFee;

    const { data, error } = await supabase
      .from('escrows')
      .insert({
        buyer_agent_id: buyer_agent_id || req.agent.agent_name,
        worker_agent_id: worker_agent_id || null,
        job_description,
        amount_locked: parseFloat(amount_locked),
        currency: currency || 'USDC',
        buyer_wallet,
        worker_wallet,
        toll_fee: tollFee,
        worker_payout: workerPayout,
        status: 'LOCKED',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Update agent's total volume
    if (req.agent.agent_name) {
      supabase
        .from('api_keys')
        .update({
          total_volume: (req.agent.total_volume || 0) + parseFloat(amount_locked)
        })
        .eq('agent_name', req.agent.agent_name)
        .then(() => {});
    }

    res.json({
      success: true,
      escrow: data,
      message: 'Escrow created. Funds locked. Awaiting work submission.'
    });
  } catch (err) {
    console.error('Error creating escrow:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/escrows/:id/submit
 * Worker submits their work for verification
 */
app.post('/api/escrows/:id/submit', rateLimit, requireApiKey, upload.single('work_file'), async (req, res) => {
  try {
    const escrowId = req.params.id;
    const { work_description } = req.body;
    const workFile = req.file;

    // Get the escrow
    const { data: escrow, error: fetchError } = await supabase
      .from('escrows')
      .select('*')
      .eq('id', escrowId)
      .single();

    if (fetchError || !escrow) {
      return res.status(404).json({ success: false, error: 'Escrow not found' });
    }

    if (escrow.status !== 'LOCKED') {
      return res.status(400).json({
        success: false,
        error: `Cannot submit work. Escrow status is: ${escrow.status}`
      });
    }

    // Store submission data
    const workContent = workFile
      ? workFile.buffer.toString('utf-8')
      : work_description;

    // Update escrow with submission
    const { error: updateError } = await supabase
      .from('escrows')
      .update({
        work_submitted: workContent,
        work_submitted_at: new Date().toISOString(),
        status: 'PENDING_VERIFICATION'
      })
      .eq('id', escrowId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: 'Work submitted. Pending AI Judge verification.',
      escrow_id: escrowId
    });
  } catch (err) {
    console.error('Error submitting work:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/escrows/:id/verify
 * Trigger AI Judge to verify the work
 */
app.post('/api/escrows/:id/verify', rateLimit, requireApiKey, async (req, res) => {
  try {
    const escrowId = req.params.id;

    // Get the escrow
    const { data: escrow, error: fetchError } = await supabase
      .from('escrows')
      .select('*')
      .eq('id', escrowId)
      .single();

    if (fetchError || !escrow) {
      return res.status(404).json({ success: false, error: 'Escrow not found' });
    }

    if (!escrow.work_submitted) {
      return res.status(400).json({
        success: false,
        error: 'No work has been submitted yet'
      });
    }

    // Call the AI Judge
    console.log(`🔍 Judge evaluating escrow ${escrowId}...`);
    const verdict = await judgeWork(escrow.job_description, escrow.work_submitted);
    console.log(`⚖️ Verdict: ${verdict}`);

    // Update escrow with verdict
    const newStatus = verdict === 'VALID' ? 'VERIFIED' : 'REJECTED';

    const { error: updateError } = await supabase
      .from('escrows')
      .update({
        judge_verdict: verdict,
        verified_at: new Date().toISOString(),
        status: newStatus
      })
      .eq('id', escrowId);

    if (updateError) throw updateError;

    // Update service stats if applicable
    if (escrow.service_id && verdict === 'VALID') {
      supabase
        .from('services')
        .update({
          jobs_completed: supabase.raw('jobs_completed + 1')
        })
        .eq('id', escrow.service_id)
        .then(() => {});
    }

    res.json({
      success: true,
      verdict,
      status: newStatus,
      message: verdict === 'VALID'
        ? '✓ Work verified! Ready for payout.'
        : '✗ Work rejected. Does not meet requirements.'
    });
  } catch (err) {
    console.error('Error verifying work:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/escrows/:id/payout
 * Execute payout after verification
 */
app.post('/api/escrows/:id/payout', rateLimit, requireApiKey, async (req, res) => {
  try {
    const escrowId = req.params.id;

    // Get the escrow
    const { data: escrow, error: fetchError } = await supabase
      .from('escrows')
      .select('*')
      .eq('id', escrowId)
      .single();

    if (fetchError || !escrow) {
      return res.status(404).json({ success: false, error: 'Escrow not found' });
    }

    if (escrow.status !== 'VERIFIED') {
      return res.status(400).json({
        success: false,
        error: `Cannot payout. Escrow status is: ${escrow.status}. Must be VERIFIED.`
      });
    }

    if (!escrow.worker_wallet) {
      return res.status(400).json({
        success: false,
        error: 'Worker wallet address not set'
      });
    }

    // Execute the payout
    console.log(`💰 Executing payout for escrow ${escrowId}...`);
    const payoutResult = await executePayout(escrow);

    // Update escrow with payout info
    const { error: updateError } = await supabase
      .from('escrows')
      .update({
        status: 'PAID',
        paid_at: new Date().toISOString(),
        payout_tx_hash: payoutResult.txHash,
        toll_tx_hash: payoutResult.tollTxHash
      })
      .eq('id', escrowId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: '✓ Payout complete!',
      worker_paid: escrow.worker_payout,
      toll_fee: escrow.toll_fee,
      payout_tx: payoutResult.txHash,
      toll_tx: payoutResult.tollTxHash
    });
  } catch (err) {
    console.error('Error executing payout:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/escrows/:id/refund
 * Refund buyer if work is rejected
 */
app.post('/api/escrows/:id/refund', rateLimit, requireApiKey, async (req, res) => {
  try {
    const escrowId = req.params.id;

    const { data: escrow, error: fetchError } = await supabase
      .from('escrows')
      .select('*')
      .eq('id', escrowId)
      .single();

    if (fetchError || !escrow) {
      return res.status(404).json({ success: false, error: 'Escrow not found' });
    }

    if (escrow.status !== 'REJECTED') {
      return res.status(400).json({
        success: false,
        error: `Cannot refund. Escrow status is: ${escrow.status}. Must be REJECTED.`
      });
    }

    // Update escrow status
    const { error: updateError } = await supabase
      .from('escrows')
      .update({
        status: 'REFUNDED',
        refunded_at: new Date().toISOString()
      })
      .eq('id', escrowId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: '✓ Funds refunded to buyer.',
      amount_refunded: escrow.amount_locked
    });
  } catch (err) {
    console.error('Error processing refund:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================
// Serve Pages
// ===========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===========================================
// Start Server
// ===========================================
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🤝 THE HANDSHAKE v2.0 - A2A Escrow Toll Booth          ║
  ║                                                           ║
  ║   Server running on http://localhost:${PORT}                ║
  ║                                                           ║
  ║   Features:                                               ║
  ║   • Self-service API keys: POST /api/keys/create         ║
  ║   • Service marketplace: GET /api/services               ║
  ║   • Escrow system: POST /api/escrows                     ║
  ║   • AI Judge verification                                 ║
  ║                                                           ║
  ║   "Point A to Point B" - Trust, verified.                ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});
