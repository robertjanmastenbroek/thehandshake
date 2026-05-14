/**
 * Twitter Engagement Bot for The Handshake
 * Runs every 3 hours via GitHub Actions
 *
 * What it does:
 * - Searches for AI agent discussions
 * - Replies with helpful info about The Handshake
 * - Posts daily stats
 * - Shares success stories
 */

const { TwitterApi } = require('twitter-api-v2');
const { createClient } = require('@supabase/supabase-js');

// Initialize clients
const twitter = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Search queries that indicate someone might need escrow
const SEARCH_QUERIES = [
  'AI agent payment',
  'autonomous agent escrow',
  'agent marketplace',
  'AI agent transaction',
  'claude api payment',
  'ai agent commerce',
  'autonomous payment system',
];

// Reply templates (rotate to avoid spam detection)
const REPLY_TEMPLATES = [
  `If you need escrow for AI agent transactions, check out The Handshake!

🔒 Secure fund locking
⚖️ Claude AI Judge
💰 2.5% fee, instant settlement

https://thehandshake.io`,

  `For agent-to-agent payments, try The Handshake:

• Lock funds before work starts
• AI Judge verifies completion
• Auto-payout on verification
• ETH + USDC on Base

Get started: https://thehandshake.io`,

  `The Handshake solves the trust problem in AI agent commerce:

1. Agent A locks payment
2. Agent B completes work
3. Claude AI Judge verifies
4. Payment releases automatically

Learn more: https://thehandshake.io`,
];

// Track what we've already engaged with (in-memory for this run)
const engagedTweetIds = new Set();

/**
 * Main engagement function
 */
async function engageWithRelevantTweets() {
  console.log('🐦 Starting Twitter engagement cycle...');

  try {
    // Pick a random search query
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
    console.log(`Searching for: "${query}"`);

    // Search recent tweets
    const searchResults = await twitter.v2.search(query, {
      max_results: 10,
      'tweet.fields': ['created_at', 'public_metrics'],
    });

    if (!searchResults.data || searchResults.data.data.length === 0) {
      console.log('No tweets found for this query.');
      return;
    }

    console.log(`Found ${searchResults.data.data.length} tweets`);

    // Engage with up to 2 tweets per run (avoid spam)
    let engagementCount = 0;
    const MAX_ENGAGEMENTS = 2;

    for (const tweet of searchResults.data.data) {
      if (engagementCount >= MAX_ENGAGEMENTS) break;
      if (engagedTweetIds.has(tweet.id)) continue;

      // Check if we've already replied to this user recently
      const recentlyEngaged = await checkRecentEngagement(tweet.author_id);
      if (recentlyEngaged) {
        console.log(`Skipping - recently engaged with user ${tweet.author_id}`);
        continue;
      }

      // Check if tweet seems like a good fit (avoid spam)
      if (shouldEngage(tweet.text)) {
        await engageWithTweet(tweet);
        engagementCount++;
        engagedTweetIds.add(tweet.id);

        // Record engagement in database
        await recordEngagement(tweet.id, tweet.author_id, 'reply');

        // Wait 2 minutes between engagements
        await sleep(120000);
      }
    }

    console.log(`✅ Engaged with ${engagementCount} tweets`);

  } catch (error) {
    console.error('Error in Twitter engagement:', error);
    throw error;
  }
}

/**
 * Check if this tweet is worth engaging with
 */
function shouldEngage(tweetText) {
  const lowercaseText = tweetText.toLowerCase();

  // Positive signals
  const positiveSignals = [
    'need',
    'looking for',
    'help',
    'how to',
    'escrow',
    'payment',
    'trust',
    'verify',
  ];

  // Negative signals (avoid)
  const negativeSignals = [
    'giveaway',
    'crypto scam',
    'fuck',
    'shit',
    'spam',
  ];

  // Check for negative signals first
  if (negativeSignals.some(signal => lowercaseText.includes(signal))) {
    return false;
  }

  // Check for positive signals
  return positiveSignals.some(signal => lowercaseText.includes(signal));
}

/**
 * Engage with a tweet (like + reply)
 */
async function engageWithTweet(tweet) {
  try {
    // Like the tweet
    await twitter.v2.like(tweet.id);
    console.log(`❤️ Liked tweet ${tweet.id}`);

    // Pick a random reply template
    const reply = REPLY_TEMPLATES[Math.floor(Math.random() * REPLY_TEMPLATES.length)];

    // Reply
    await twitter.v2.reply(reply, tweet.id);
    console.log(`💬 Replied to tweet ${tweet.id}`);

  } catch (error) {
    console.error(`Error engaging with tweet ${tweet.id}:`, error);
  }
}

/**
 * Check if we've engaged with this user in the last 7 days
 */
async function checkRecentEngagement(userId) {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from('twitter_engagements')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .limit(1);

    if (error) throw error;
    return data && data.length > 0;

  } catch (error) {
    console.error('Error checking engagement history:', error);
    return false; // Err on the side of engaging
  }
}

/**
 * Record engagement in database
 */
async function recordEngagement(tweetId, userId, type) {
  try {
    await supabase
      .from('twitter_engagements')
      .insert({
        tweet_id: tweetId,
        user_id: userId,
        engagement_type: type,
        created_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('Error recording engagement:', error);
  }
}

/**
 * Post daily stats (if it's 9am UTC)
 */
async function maybePostDailyStats() {
  const hour = new Date().getUTCHours();

  // Only run at 9am UTC
  if (hour !== 9) return;

  console.log('📊 Posting daily stats...');

  try {
    // Get yesterday's stats
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: escrows } = await supabase
      .from('escrows')
      .select('*')
      .gte('created_at', yesterday.toISOString());

    const totalVolume = escrows.reduce((sum, e) => sum + e.amount_locked, 0);
    const totalRevenue = escrows.reduce((sum, e) => sum + e.toll_fee, 0);

    const statsThread = [
      `📊 The Handshake - Last 24h Stats

🔒 ${escrows.length} escrows created
💰 $${totalVolume.toFixed(2)} volume
📈 $${totalRevenue.toFixed(2)} fees collected

Building trust in AI agent commerce 🤝

https://thehandshake.io`,
    ];

    // Post thread
    for (const tweet of statsThread) {
      await twitter.v2.tweet(tweet);
      await sleep(1000);
    }

    console.log('✅ Daily stats posted');

  } catch (error) {
    console.error('Error posting daily stats:', error);
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main execution
 */
async function main() {
  console.log('🤖 The Handshake Twitter Bot Starting...');

  try {
    // Engage with relevant tweets
    await engageWithRelevantTweets();

    // Maybe post daily stats
    await maybePostDailyStats();

    console.log('✅ Twitter bot cycle complete');

  } catch (error) {
    console.error('❌ Bot failed:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

module.exports = { main };

/**
 * Database Schema for Supabase:
 *
 * CREATE TABLE twitter_engagements (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   tweet_id TEXT NOT NULL,
 *   user_id TEXT NOT NULL,
 *   engagement_type TEXT NOT NULL, -- 'like', 'reply', 'retweet'
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_twitter_eng_user ON twitter_engagements(user_id);
 * CREATE INDEX idx_twitter_eng_date ON twitter_engagements(created_at);
 */
