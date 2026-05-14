/**
 * CodeReviewBot - AI Code Review Service
 *
 * A service agent that provides code reviews via The Handshake.
 * This bot monitors for jobs, completes code reviews, and submits work.
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const HANDSHAKE_API = process.env.HANDSHAKE_API_URL || 'https://thehandshake.io';
const BOT_API_KEY = process.env.CODEREVIEW_BOT_KEY || process.env.HANDSHAKE_API_KEY;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Code Review System Prompt
 */
const CODE_REVIEW_PROMPT = `You are CodeReviewBot, an expert code reviewer. You provide thorough, actionable code reviews.

Your review should cover:
1. **Bugs & Errors**: Logic errors, off-by-one errors, null pointer issues
2. **Security**: SQL injection, XSS, authentication issues, secrets exposure
3. **Performance**: N+1 queries, unnecessary loops, memory leaks
4. **Best Practices**: DRY violations, naming conventions, code organization
5. **Maintainability**: Complex code that could be simplified, missing comments

Format your review as:
## Summary
[1-2 sentence overview]

## Critical Issues (Must Fix)
- [Issue with line number and explanation]

## Improvements (Should Fix)
- [Suggestion with explanation]

## Minor Suggestions (Nice to Have)
- [Small improvements]

## What's Good
- [Positive feedback]

Be constructive, specific, and helpful. Include line numbers when relevant.`;

/**
 * Perform code review using Claude
 */
async function reviewCode(code, context = '') {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: CODE_REVIEW_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Please review this code:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${code}\n\`\`\``
      }
    ]
  });

  return response.content[0].text;
}

/**
 * Check for pending jobs assigned to CodeReviewBot
 */
async function checkForJobs() {
  try {
    const response = await fetch(`${HANDSHAKE_API}/api/escrows`, {
      headers: {
        'Authorization': `Bearer ${BOT_API_KEY}`
      }
    });

    const data = await response.json();

    if (!data.success) {
      console.error('Failed to fetch escrows:', data.error);
      return [];
    }

    // Filter for jobs assigned to us that are LOCKED (waiting for work)
    const myJobs = data.escrows.filter(e =>
      e.worker_agent_id === 'CodeReviewBot' &&
      e.status === 'LOCKED'
    );

    return myJobs;

  } catch (err) {
    console.error('Error checking jobs:', err);
    return [];
  }
}

/**
 * Complete a code review job
 */
async function completeJob(escrow) {
  console.log(`📝 Starting code review for escrow ${escrow.id}`);

  try {
    // The job description should contain the code to review
    const code = escrow.job_description;

    // Perform the review
    console.log('🔍 Analyzing code...');
    const review = await reviewCode(code);

    console.log('✅ Review complete, submitting work...');

    // Submit the work
    const submitResponse = await fetch(`${HANDSHAKE_API}/api/escrows/${escrow.id}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BOT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        work_description: review
      })
    });

    const submitData = await submitResponse.json();

    if (submitData.success) {
      console.log(`✓ Work submitted for escrow ${escrow.id}`);

      // Auto-request verification
      console.log('🔍 Requesting verification...');
      const verifyResponse = await fetch(`${HANDSHAKE_API}/api/escrows/${escrow.id}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BOT_API_KEY}`
        }
      });

      const verifyData = await verifyResponse.json();
      console.log(`⚖️ Verification result: ${verifyData.verdict}`);

      return { success: true, review, verdict: verifyData.verdict };
    } else {
      console.error('Failed to submit work:', submitData.error);
      return { success: false, error: submitData.error };
    }

  } catch (err) {
    console.error('Error completing job:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Main loop - check for jobs and complete them
 */
async function runServiceLoop(intervalMs = 60000) {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🤖 CodeReviewBot - AI Code Review Service              ║
  ║                                                           ║
  ║   Listening for jobs on The Handshake...                 ║
  ║   Checking every ${intervalMs/1000} seconds                           ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);

  while (true) {
    try {
      const jobs = await checkForJobs();

      if (jobs.length > 0) {
        console.log(`📬 Found ${jobs.length} pending job(s)`);

        for (const job of jobs) {
          await completeJob(job);
        }
      } else {
        console.log(`[${new Date().toISOString()}] No pending jobs`);
      }

    } catch (err) {
      console.error('Error in service loop:', err);
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * One-shot review (for testing or direct use)
 */
async function singleReview(code, context) {
  const review = await reviewCode(code, context);
  console.log(review);
  return review;
}

// Export for use as module
module.exports = {
  reviewCode,
  checkForJobs,
  completeJob,
  runServiceLoop,
  singleReview
};

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--once') {
    // One-shot mode: review code from stdin or arg
    const code = args[1] || 'console.log("hello world")';
    singleReview(code).then(() => process.exit(0));
  } else {
    // Service mode: run continuously
    runServiceLoop();
  }
}
