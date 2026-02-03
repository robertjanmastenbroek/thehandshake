/**
 * StrategistAgent - The Brain of the System
 *
 * Runs daily to:
 * 1. Review progress toward $10k/mo goal
 * 2. Analyze what's working / not working
 * 3. Create and prioritize tasks for other agents
 * 4. Adjust strategy based on results
 */

require('dotenv').config();
const AgentCore = require('./agent_core');

const STRATEGIST_PROMPT = `You are the Strategist Agent for TheHandshake, an AI-powered escrow platform for agent-to-agent transactions.

MISSION: Reach $10,000/month in revenue through toll fees (2.5% of transaction volume).

KEY METRICS TO OPTIMIZE:
1. API keys created (users)
2. Escrows created (transactions)
3. Transaction volume (dollars)
4. Moltbook engagement (awareness)
5. Service marketplace activity

CHANNELS:
- Moltbook: Social platform for AI agents (PRIMARY)
- GitHub: Code visibility, stars
- Twitter: Broader AI community
- Reddit: r/AutoGPT, r/LocalLLaMA, r/ClaudeAI

YOUR CAPABILITIES:
- Create tasks for executor agents
- Prioritize the task queue
- Store insights in memory
- Track and analyze KPIs

TASK TYPES YOU CAN CREATE:
- moltbook_post: Create a post on Moltbook
- moltbook_engage: Find and engage with relevant posts
- moltbook_dm: Direct message a potential user
- content_create: Create educational content
- outreach_github: Find and reach out to GitHub AI projects
- code_improvement: Improve TheHandshake codebase
- service_bot: Deploy a new service bot

Be strategic, data-driven, and action-oriented. Create specific, actionable tasks.`;

class StrategistAgent extends AgentCore {
  constructor() {
    super('StrategistAgent');
  }

  async run() {
    console.log('\n=== STRATEGIST AGENT STARTING ===\n');

    try {
      // 1. Gather current state
      const state = await this.gatherState();
      console.log('Current state:', JSON.stringify(state, null, 2));

      // 2. Analyze progress
      const analysis = await this.analyzeProgress(state);
      console.log('Analysis:', analysis);

      // 3. Create strategic tasks
      const tasks = await this.createStrategicTasks(state, analysis);
      console.log(`Created ${tasks.length} new tasks`);

      // 4. Prioritize existing queue
      await this.prioritizeTasks();

      // 5. Store insights
      await this.storeInsights(state, analysis);

      // 6. Log completion
      await this.log('strategy_cycle', {
        state_summary: {
          users: state.users,
          escrows: state.escrows,
          volume: state.volume,
          goal_progress: state.goalProgress
        },
        tasks_created: tasks.length
      });

      console.log('\n=== STRATEGIST CYCLE COMPLETE ===\n');

    } catch (error) {
      console.error('Strategist error:', error);
      await this.log('strategy_error', { error: error.message }, 'error');
    }
  }

  async gatherState() {
    // Get API stats from TheHandshake
    const handshakeUrl = process.env.HANDSHAKE_API_URL || 'https://thehandshake.io';

    // Get counts from Supabase directly
    const [apiKeys, escrows, services, kpis, goals, pendingTasks] = await Promise.all([
      this.supabase.from('api_keys').select('id', { count: 'exact' }),
      this.supabase.from('escrows').select('id, amount_locked, status', { count: 'exact' }),
      this.supabase.from('services').select('id', { count: 'exact' }),
      this.getAllKPIs(7),
      this.getGoals(),
      this.getPendingTasks()
    ]);

    // Calculate metrics
    const totalVolume = escrows.data?.reduce((sum, e) => sum + (e.amount_locked || 0), 0) || 0;
    const paidEscrows = escrows.data?.filter(e => e.status === 'PAID') || [];
    const tollRevenue = paidEscrows.reduce((sum, e) => sum + (e.amount_locked * 0.025), 0);

    // Get goal progress
    const mainGoal = goals.find(g => g.name === '$10k Monthly Revenue');
    const goalProgress = mainGoal ? (mainGoal.current_value / mainGoal.target_value) * 100 : 0;

    // Get recent Moltbook engagement
    const { data: recentEngagements } = await this.supabase
      .from('moltbook_engagements')
      .select('*')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    // Get lead stats
    const { data: leads } = await this.supabase
      .from('leads')
      .select('status')
      .order('created_at', { ascending: false });

    const leadStats = {
      new: leads?.filter(l => l.status === 'new').length || 0,
      contacted: leads?.filter(l => l.status === 'contacted').length || 0,
      converted: leads?.filter(l => l.status === 'converted').length || 0
    };

    return {
      users: apiKeys.count || 0,
      escrows: escrows.count || 0,
      services: services.count || 0,
      volume: totalVolume,
      revenue: tollRevenue,
      goalProgress,
      kpis,
      pendingTasks: pendingTasks.length,
      moltbookEngagements: recentEngagements?.length || 0,
      leadStats
    };
  }

  async analyzeProgress(state) {
    const prompt = `Analyze the current state and provide strategic recommendations.

CURRENT STATE:
- Users (API keys): ${state.users}
- Escrows created: ${state.escrows}
- Services registered: ${state.services}
- Transaction volume: $${state.volume.toFixed(2)}
- Revenue (toll fees): $${state.revenue.toFixed(2)}
- Goal progress: ${state.goalProgress.toFixed(1)}%
- Pending tasks: ${state.pendingTasks}
- Moltbook engagements (7d): ${state.moltbookEngagements}
- Leads: ${state.leadStats.new} new, ${state.leadStats.contacted} contacted, ${state.leadStats.converted} converted

Recent KPIs:
${state.kpis.map(k => `- ${k.metric}: ${k.value} (${k.change_percent ? k.change_percent.toFixed(1) + '%' : 'new'})`).join('\n')}

Provide analysis in JSON format:
{
  "health_score": 1-10,
  "key_bottleneck": "what's blocking growth",
  "top_opportunity": "biggest opportunity right now",
  "recommended_focus": "what to focus on this week",
  "specific_actions": ["action 1", "action 2", "action 3"]
}`;

    return await this.thinkJSON(prompt, STRATEGIST_PROMPT);
  }

  async createStrategicTasks(state, analysis) {
    if (!analysis) return [];

    const prompt = `Based on this analysis, create specific tasks for the executor agents.

ANALYSIS:
${JSON.stringify(analysis, null, 2)}

CURRENT STATE:
- Users: ${state.users}
- Pending tasks already: ${state.pendingTasks}
- Lead pipeline: ${state.leadStats.new} new leads to contact

Create 3-5 HIGH-IMPACT tasks. Each task should be:
- Specific and actionable
- Assigned to the right agent type
- Prioritized (1-10, 10 = highest)

Return JSON array:
[
  {
    "task_type": "moltbook_post|moltbook_engage|moltbook_dm|content_create|outreach_github|service_bot",
    "description": "specific task description",
    "priority": 1-10,
    "input_data": { any relevant context }
  }
]`;

    const tasks = await this.thinkJSON(prompt, STRATEGIST_PROMPT);

    if (!tasks || !Array.isArray(tasks)) return [];

    // Create tasks in database
    const createdTasks = [];
    for (const task of tasks) {
      const created = await this.createTask(
        task.task_type,
        task.description,
        {
          priority: task.priority,
          inputData: task.input_data || {}
        }
      );
      if (created) createdTasks.push(created);
    }

    return createdTasks;
  }

  async prioritizeTasks() {
    // Get all pending tasks
    const tasks = await this.getPendingTasks();

    if (tasks.length < 2) return;

    const prompt = `Prioritize these tasks by impact on reaching $10k/month revenue.

TASKS:
${tasks.map((t, i) => `${i + 1}. [${t.task_type}] ${t.description} (current priority: ${t.priority})`).join('\n')}

Return JSON array of task IDs in order of priority (highest impact first):
["id1", "id2", ...]`;

    const priorityOrder = await this.thinkJSON(prompt, STRATEGIST_PROMPT);

    if (!priorityOrder || !Array.isArray(priorityOrder)) return;

    // Update priorities
    for (let i = 0; i < priorityOrder.length; i++) {
      const taskId = priorityOrder[i];
      const newPriority = 10 - Math.floor((i / priorityOrder.length) * 5); // 10 to 5

      await this.supabase
        .from('agent_tasks')
        .update({ priority: newPriority })
        .eq('id', taskId);
    }

    console.log(`Reprioritized ${priorityOrder.length} tasks`);
  }

  async storeInsights(state, analysis) {
    // Store daily snapshot
    const today = new Date().toISOString().split('T')[0];

    await this.remember(`snapshot_${today}`, {
      state,
      analysis,
      timestamp: new Date().toISOString()
    }, 'snapshots');

    // Store latest analysis for other agents
    await this.remember('latest_strategy', {
      analysis,
      recommendedFocus: analysis?.recommended_focus,
      topOpportunity: analysis?.top_opportunity,
      updatedAt: new Date().toISOString()
    }, 'strategy');

    // Record KPIs
    await this.recordKPI('users', state.users);
    await this.recordKPI('escrows', state.escrows);
    await this.recordKPI('volume', state.volume);
    await this.recordKPI('revenue', state.revenue);
    await this.recordKPI('moltbook_engagements', state.moltbookEngagements);

    // Update goal progress
    await this.updateGoalProgress('$10k Monthly Revenue', state.revenue);
  }
}

// Run if called directly
if (require.main === module) {
  const agent = new StrategistAgent();
  agent.run().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = StrategistAgent;
