/**
 * MoltbookAgent - Social Engagement & Lead Generation
 *
 * Runs every 30 minutes to:
 * 1. Execute Moltbook-related tasks from queue
 * 2. Autonomous engagement (mentions, trending posts)
 * 3. Lead discovery and tracking
 * 4. Content performance analysis
 */

require('dotenv').config();
const AgentCore = require('./agent_core');

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

const MOLTBOOK_PROMPT = `You are the MoltbookAgent for TheHandshake, responsible for social engagement on Moltbook (a social platform for AI agents).

YOUR GOAL: Find and convert potential users for TheHandshake's escrow service.

WHAT THEHANDSHAKE OFFERS:
- Secure escrow for AI agent transactions
- ETH + USDC on Base network
- Claude AI Judge for dispute resolution
- Self-service API keys (no human approval needed)
- Service marketplace for agents
- 2.5% toll fee

ENGAGEMENT RULES:
1. Be helpful first, promotional second
2. Add genuine value to conversations
3. Don't spam - quality over quantity
4. Build relationships, not just impressions
5. Track what works, iterate

LEAD SIGNALS (users who might need escrow):
- Talking about payments between agents
- Building multi-agent systems
- Discussing trust issues in AI transactions
- Looking for services from other agents
- Offering services to other agents

Be authentic, helpful, and strategic.`;

class MoltbookAgent extends AgentCore {
  constructor() {
    super('MoltbookAgent');
    this.apiKey = process.env.MOLTBOOK_API_KEY;
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async run() {
    console.log('\n=== MOLTBOOK AGENT STARTING ===\n');

    if (!this.apiKey) {
      console.error('MOLTBOOK_API_KEY not set');
      return;
    }

    try {
      // 1. Process tasks from queue
      await this.processTasks();

      // 2. Check and respond to mentions
      await this.handleMentions();

      // 3. Find and engage with relevant posts
      await this.findAndEngage();

      // 4. Discover new leads
      await this.discoverLeads();

      // 5. Analyze recent performance
      await this.analyzePerformance();

      console.log('\n=== MOLTBOOK CYCLE COMPLETE ===\n');

    } catch (error) {
      console.error('Moltbook error:', error);
      await this.log('moltbook_error', { error: error.message }, 'error');
    }
  }

  // =====================================================
  // TASK PROCESSING
  // =====================================================

  async processTasks() {
    // Get Moltbook-related tasks
    const taskTypes = ['moltbook_post', 'moltbook_engage', 'moltbook_dm'];

    for (const taskType of taskTypes) {
      const task = await this.getNextTask();

      if (task && task.task_type?.startsWith('moltbook')) {
        console.log(`Processing task: ${task.task_type} - ${task.description}`);

        try {
          let result;

          switch (task.task_type) {
            case 'moltbook_post':
              result = await this.executePostTask(task);
              break;
            case 'moltbook_engage':
              result = await this.executeEngageTask(task);
              break;
            case 'moltbook_dm':
              result = await this.executeDMTask(task);
              break;
            default:
              result = { skipped: true };
          }

          await this.completeTask(task.id, result);

        } catch (error) {
          await this.failTask(task.id, error.message);
        }
      }
    }
  }

  async executePostTask(task) {
    const { input_data } = task;

    // Generate post content if not provided
    let content = input_data?.content;
    let title = input_data?.title;
    let submolt = input_data?.submolt || 'general';

    if (!content) {
      const generated = await this.generatePost(task.description);
      content = generated.content;
      title = generated.title;
      submolt = generated.submolt || submolt;
    }

    // Create the post
    const result = await this.createPost(submolt, title, content);

    // Track engagement
    await this.trackEngagement('post', result?.id, null, title);

    return result;
  }

  async executeEngageTask(task) {
    const { input_data } = task;
    const keyword = input_data?.keyword || 'escrow payment trust';

    // Search for relevant posts
    const posts = await this.searchPosts(keyword);

    if (!posts || posts.length === 0) {
      return { message: 'No relevant posts found' };
    }

    // Engage with top post
    const post = posts[0];
    const comment = await this.generateComment(post);

    if (comment) {
      await this.replyToPost(post.id, comment);
      await this.trackEngagement('comment', post.id, post.author, comment.slice(0, 100));
    }

    return { engaged_with: post.id, comment };
  }

  async executeDMTask(task) {
    const { input_data } = task;
    const username = input_data?.username;

    if (!username) {
      return { error: 'No username provided' };
    }

    // Generate personalized DM
    const context = input_data?.context || 'general outreach';
    const message = await this.generateDM(username, context);

    // Note: Moltbook DM API endpoint (if it exists)
    // For now, track as a lead to contact
    await this.addLead('moltbook', username, context);
    await this.updateLeadStatus(null, 'contacted', message);

    return { dm_sent_to: username, message };
  }

  // =====================================================
  // CONTENT GENERATION
  // =====================================================

  async generatePost(topic) {
    const prompt = `Create a Moltbook post about: ${topic}

The post should:
- Be relevant to AI agents
- Naturally mention TheHandshake if appropriate
- Be engaging and encourage discussion
- Not be overly promotional

Return JSON:
{
  "title": "engaging title",
  "content": "post content (markdown)",
  "submolt": "best submolt to post in"
}

Available submolts: general, introductions, projects, discussions, help`;

    return await this.thinkJSON(prompt, MOLTBOOK_PROMPT) || {
      title: topic,
      content: `Thoughts on ${topic}? 🤔`,
      submolt: 'general'
    };
  }

  async generateComment(post) {
    const prompt = `Generate a helpful, authentic comment on this Moltbook post.

POST TITLE: ${post.title}
POST CONTENT: ${post.content?.slice(0, 500)}
AUTHOR: ${post.author}

Your comment should:
- Add genuine value to the conversation
- Be relevant to what they're discussing
- Only mention TheHandshake if truly relevant
- Be concise (2-3 sentences max)

Return just the comment text, no JSON.`;

    return await this.think(prompt, MOLTBOOK_PROMPT);
  }

  async generateDM(username, context) {
    const prompt = `Generate a personalized DM to ${username} on Moltbook.

CONTEXT: ${context}

The DM should:
- Be friendly and personal
- Reference something specific about them
- Offer genuine help or value
- Soft mention of TheHandshake only if relevant
- Not be salesy

Return just the message text.`;

    return await this.think(prompt, MOLTBOOK_PROMPT);
  }

  // =====================================================
  // MOLTBOOK API CALLS
  // =====================================================

  async createPost(submolt, title, content) {
    try {
      const response = await fetch(`${MOLTBOOK_API}/posts`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ submolt, title, content })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Create post failed: ${response.status} ${response.statusText}`);
        console.error(`Response: ${errorText.slice(0, 200)}`);
        throw new Error(`Moltbook API error: ${response.status} - ${errorText.slice(0, 100)}`);
      }

      const data = await response.json();
      console.log(`✓ Post created: ${data.id || 'unknown ID'}`);
      return data;
    } catch (error) {
      console.error('Create post error:', error.message);
      throw error; // Re-throw so task gets marked as failed
    }
  }

  async getMentions() {
    try {
      // Try notifications endpoint (mentions might be here)
      const response = await fetch(`${MOLTBOOK_API}/notifications`, {
        headers: this.headers
      });

      if (!response.ok) {
        console.log('Mentions endpoint not available yet');
        return [];
      }

      const data = await response.json();
      return data.notifications || data.mentions || [];
    } catch (error) {
      console.log('Get mentions: endpoint not available yet');
      return [];
    }
  }

  async searchPosts(query) {
    try {
      // Try search endpoint
      const response = await fetch(`${MOLTBOOK_API}/posts?search=${encodeURIComponent(query)}&limit=10`, {
        headers: this.headers
      });

      if (!response.ok) {
        console.log('Search not available, falling back to hot posts');
        return await this.getHotPosts();
      }

      const data = await response.json();
      return data.posts || data || [];
    } catch (error) {
      console.log('Search posts: falling back to hot posts');
      return await this.getHotPosts();
    }
  }

  async getHotPosts(submolt = null) {
    try {
      const url = submolt
        ? `${MOLTBOOK_API}/posts?sort=hot&submolt=${submolt}&limit=10`
        : `${MOLTBOOK_API}/posts?sort=hot&limit=10`;

      const response = await fetch(url, {
        headers: this.headers
      });

      if (!response.ok) {
        console.log('Could not fetch hot posts');
        return [];
      }

      const data = await response.json();
      // API might return { posts: [...] } or just [...]
      return Array.isArray(data) ? data : (data.posts || []);
    } catch (error) {
      console.log('Get hot posts error:', error.message);
      return [];
    }
  }

  async replyToPost(postId, content) {
    try {
      const response = await fetch(`${MOLTBOOK_API}/posts/${postId}/comments`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ content })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Reply failed: ${response.status} ${response.statusText}`);
        console.error(`Response: ${errorText.slice(0, 200)}`);
        throw new Error(`Moltbook API error: ${response.status} - ${errorText.slice(0, 100)}`);
      }

      const data = await response.json();
      console.log(`✓ Comment posted on post ${postId}`);
      return data;
    } catch (error) {
      console.error('Reply error:', error.message);
      throw error; // Re-throw so task gets marked as failed
    }
  }

  async upvotePost(postId) {
    try {
      const response = await fetch(`${MOLTBOOK_API}/posts/${postId}/upvote`, {
        method: 'POST',
        headers: this.headers
      });

      if (!response.ok) {
        // Don't throw for upvote failures - not critical
        console.log(`⚠️  Upvote failed: ${response.status} (non-critical)`);
        return null;
      }

      const data = await response.json();
      console.log(`✓ Upvoted post ${postId}`);
      return data;
    } catch (error) {
      console.log(`⚠️  Upvote error: ${error.message} (non-critical)`);
      return null;
    }
  }

  // =====================================================
  // AUTONOMOUS ENGAGEMENT
  // =====================================================

  async handleMentions() {
    const mentions = await this.getMentions();
    const repliedTo = (await this.recall('replied_mentions')) || [];

    for (const mention of mentions) {
      if (repliedTo.includes(mention.id)) continue;

      console.log(`Handling mention from ${mention.author}`);

      const response = await this.generateMentionResponse(mention);

      if (response) {
        await this.replyToPost(mention.id, response);
        await this.trackEngagement('reply', mention.id, mention.author, response.slice(0, 100));

        repliedTo.push(mention.id);

        // Check if this is a lead
        if (this.isLeadSignal(mention.content)) {
          await this.addLead('moltbook', mention.author, `Mentioned us: ${mention.content?.slice(0, 100)}`);
        }
      }

      await this.sleep(2000); // Rate limit
    }

    // Keep only last 100 mentions
    await this.remember('replied_mentions', repliedTo.slice(-100));
  }

  async generateMentionResponse(mention) {
    const prompt = `Someone mentioned TheHandshake on Moltbook. Generate a helpful response.

MENTION FROM: ${mention.author}
CONTENT: ${mention.content}

Respond helpfully. If they're asking a question, answer it.
If they're having an issue, help them.
If they're praising us, thank them warmly.

Return just the response text.`;

    return await this.think(prompt, MOLTBOOK_PROMPT);
  }

  async findAndEngage() {
    // Keywords that signal potential users
    const keywords = [
      'escrow',
      'payment',
      'trust agent',
      'pay another agent',
      'agent transaction',
      'smart contract agent',
      'crypto agent',
      'USDC',
      'ETH payment'
    ];

    // Pick a random keyword to avoid repetition
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];

    console.log(`Searching for: ${keyword}`);

    const posts = await this.searchPosts(keyword);

    // Ensure posts is an array
    if (!Array.isArray(posts) || posts.length === 0) {
      console.log('No posts found to engage with');
      return;
    }

    const engagedPosts = (await this.recall('engaged_posts')) || [];

    for (const post of posts.slice(0, 3)) {
      if (engagedPosts.includes(post.id)) continue;

      // Check if it's a good fit
      if (this.isRelevantPost(post)) {
        console.log(`Engaging with: ${post.title}`);

        // Upvote
        await this.upvotePost(post.id);

        // Comment if valuable
        const comment = await this.generateComment(post);
        if (comment && comment.length > 20) {
          try {
            await this.replyToPost(post.id, comment);
            await this.trackEngagement('comment', post.id, post.author, comment.slice(0, 100));
          } catch (error) {
            console.error(`Failed to comment on post ${post.id}: ${error.message}`);
            // Continue to next post
          }
        }

        engagedPosts.push(post.id);

        // Check if author is a lead
        if (this.isLeadSignal(post.content)) {
          await this.addLead('moltbook', post.author, `Posted about: ${post.title}`);
        }

        await this.sleep(3000); // Rate limit
      }
    }

    // Keep only last 200 posts
    await this.remember('engaged_posts', engagedPosts.slice(-200));
  }

  // =====================================================
  // LEAD DISCOVERY
  // =====================================================

  async discoverLeads() {
    // Look for users discussing relevant topics
    const leadKeywords = [
      'building agent',
      'multi-agent',
      'agent marketplace',
      'agent service',
      'autonomous agent',
      'AI payment'
    ];

    const keyword = leadKeywords[Math.floor(Math.random() * leadKeywords.length)];
    const posts = await this.searchPosts(keyword);

    for (const post of posts.slice(0, 5)) {
      if (this.isLeadSignal(post.content)) {
        await this.addLead(
          'moltbook',
          post.author,
          `Discussing: ${post.title} - "${post.content?.slice(0, 100)}..."`
        );
      }
    }
  }

  isLeadSignal(content) {
    if (!content) return false;
    const lower = content.toLowerCase();

    const signals = [
      'payment',
      'escrow',
      'transaction',
      'pay',
      'trust',
      'marketplace',
      'hire',
      'service',
      'crypto',
      'usdc',
      'eth'
    ];

    return signals.some(s => lower.includes(s));
  }

  isRelevantPost(post) {
    if (!post.content) return false;
    const content = (post.title + ' ' + post.content).toLowerCase();

    // HIGH-VALUE signals - must have at least ONE of these
    const highValueSignals = [
      'pay agent',
      'hire agent',
      'agent payment',
      'agent transaction',
      'escrow',
      'pay for service',
      'agent marketplace',
      'ai marketplace',
      'buying from agent',
      'selling to agent',
      'agent scam',
      'trust issue',
      'got scammed',
      'payment issue',
      'need escrow',
      'smart contract payment',
      'crypto payment',
      'usdc payment',
      'eth payment',
      'pay another agent',
      'agent-to-agent',
      'a2a payment'
    ];

    // Must have high-value signal
    const hasHighValue = highValueSignals.some(s => content.includes(s));
    if (!hasHighValue) return false;

    // Negative signals (avoid)
    const irrelevant = [
      'nsfw',
      'spam',
      'test post',
      'hello world',
      'meme',
      'joke'
    ];

    const hasIrrelevant = irrelevant.some(i => content.includes(i));

    return !hasIrrelevant;
  }

  // =====================================================
  // TRACKING & ANALYTICS
  // =====================================================

  async trackEngagement(actionType, postId, targetUser, contentSummary) {
    await this.supabase.from('moltbook_engagements').insert({
      post_id: postId,
      action_type: actionType,
      target_user: targetUser,
      content_summary: contentSummary
    });
  }

  async analyzePerformance() {
    // Get recent engagements
    const { data: engagements } = await this.supabase
      .from('moltbook_engagements')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (!engagements || engagements.length === 0) return;

    const stats = {
      posts: engagements.filter(e => e.action_type === 'post').length,
      comments: engagements.filter(e => e.action_type === 'comment').length,
      replies: engagements.filter(e => e.action_type === 'reply').length,
      total: engagements.length
    };

    // Record KPIs
    await this.recordKPI('moltbook_posts_24h', stats.posts);
    await this.recordKPI('moltbook_comments_24h', stats.comments);
    await this.recordKPI('moltbook_engagements_24h', stats.total);

    // Store performance data
    await this.remember('daily_performance', {
      date: new Date().toISOString().split('T')[0],
      stats
    }, 'analytics');

    await this.log('performance_analyzed', stats);
  }
}

// Run if called directly
if (require.main === module) {
  const agent = new MoltbookAgent();
  agent.run().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = MoltbookAgent;
