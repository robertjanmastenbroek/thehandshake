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
// API Key Authentication Middleware
// ===========================================
const HANDSHAKE_API_KEY = process.env.HANDSHAKE_API_KEY;

/**
 * Middleware to verify API key for sensitive operations
 * Agents must include: Authorization: Bearer <api_key>
 */
const requireApiKey = (req, res, next) => {
  // Skip auth if no API key is configured (development mode)
  if (!HANDSHAKE_API_KEY) {
    console.warn('⚠️  No HANDSHAKE_API_KEY set - running in open mode');
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing API key. Include: Authorization: Bearer <your_api_key>'
    });
  }

  const providedKey = authHeader.split(' ')[1];

  if (providedKey !== HANDSHAKE_API_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Invalid API key'
    });
  }

  next();
};

// Rate limiting helper (simple in-memory)
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
// API Routes
// ===========================================

/**
 * Health Check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'The Handshake',
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
 * PROTECTED: Requires API key
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
    if (!buyer_agent_id || !job_description || !amount_locked) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: buyer_agent_id, job_description, amount_locked'
      });
    }

    const tollFee = parseFloat(amount_locked) * (parseFloat(process.env.TOLL_FEE_PERCENT) / 100);
    const workerPayout = parseFloat(amount_locked) - tollFee;

    const { data, error } = await supabase
      .from('escrows')
      .insert({
        buyer_agent_id,
        worker_agent_id: worker_agent_id || null,
        job_description,
        amount_locked: parseFloat(amount_locked),
        currency: currency || 'ETH',
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
 * PROTECTED: Requires API key
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
 * PROTECTED: Requires API key
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
 * PROTECTED: Requires API key
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
 * PROTECTED: Requires API key
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
  ║   🤝 THE HANDSHAKE - A2A Escrow Toll Booth               ║
  ║                                                           ║
  ║   Server running on http://localhost:${PORT}                ║
  ║   Dashboard: http://localhost:${PORT}                       ║
  ║                                                           ║
  ║   "Point A to Point B" - Trust, verified.                ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});
