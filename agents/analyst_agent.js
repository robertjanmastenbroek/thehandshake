/**
 * AnalystAgent - KPI Tracking & Recommendations
 *
 * Runs daily to:
 * 1. Collect and record all KPIs
 * 2. Analyze trends
 * 3. Identify what's working / not working
 * 4. Generate recommendations for Strategist
 */

require('dotenv').config();
const AgentCore = require('./agent_core');

const ANALYST_PROMPT = `You are the Analyst Agent for TheHandshake. Your job is to track metrics, identify trends, and make data-driven recommendations.

KEY METRICS:
- Users (API keys created)
- Escrows (transactions)
- Volume ($ transacted)
- Revenue (toll fees = 2.5% of volume)
- Moltbook engagement (posts, comments, conversions)
- Lead pipeline (new, contacted, converted)

GOAL: $10,000/month revenue

Be analytical, precise, and actionable in your insights.`;

class AnalystAgent extends AgentCore {
  constructor() {
    super('AnalystAgent');
  }

  async run() {
    console.log('\n=== ANALYST AGENT STARTING ===\n');

    try {
      // 1. Collect metrics
      const metrics = await this.collectMetrics();
      console.log('Metrics collected:', Object.keys(metrics).length);

      // 2. Record KPIs
      await this.recordAllKPIs(metrics);

      // 3. Analyze trends
      const trends = await this.analyzeTrends();
      console.log('Trends analyzed');

      // 4. Generate insights
      const insights = await this.generateInsights(metrics, trends);
      console.log('Insights:', insights);

      // 5. Store report
      await this.storeReport(metrics, trends, insights);

      // 6. Alert on anomalies
      await this.checkAnomalies(metrics, trends);

      await this.log('analysis_complete', {
        metrics_count: Object.keys(metrics).length,
        insights_count: insights?.recommendations?.length || 0
      });

      console.log('\n=== ANALYST CYCLE COMPLETE ===\n');

    } catch (error) {
      console.error('Analyst error:', error);
      await this.log('analyst_error', { error: error.message }, 'error');
    }
  }

  async collectMetrics() {
    const metrics = {};

    // API Keys (Users)
    const { count: apiKeys } = await this.supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true });
    metrics.users = apiKeys || 0;

    // New users today
    const { count: newUsers } = await this.supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().split('T')[0]);
    metrics.new_users_today = newUsers || 0;

    // Escrows
    const { data: escrows } = await this.supabase
      .from('escrows')
      .select('id, amount_locked, toll_fee, status, created_at');

    metrics.total_escrows = escrows?.length || 0;
    metrics.escrows_today = escrows?.filter(e =>
      e.created_at >= new Date().toISOString().split('T')[0]
    ).length || 0;

    // Volume & Revenue
    metrics.total_volume = escrows?.reduce((sum, e) => sum + (e.amount_locked || 0), 0) || 0;
    const paidEscrows = escrows?.filter(e => e.status === 'PAID') || [];
    metrics.total_revenue = paidEscrows.reduce((sum, e) => sum + (e.toll_fee || 0), 0);

    // Services
    const { count: services } = await this.supabase
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    metrics.services = services || 0;

    // Moltbook engagements (last 24h)
    const { count: engagements } = await this.supabase
      .from('moltbook_engagements')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    metrics.moltbook_engagements_24h = engagements || 0;

    // Leads
    const { data: leads } = await this.supabase
      .from('leads')
      .select('status');

    metrics.leads_new = leads?.filter(l => l.status === 'new').length || 0;
    metrics.leads_contacted = leads?.filter(l => l.status === 'contacted').length || 0;
    metrics.leads_converted = leads?.filter(l => l.status === 'converted').length || 0;
    metrics.leads_total = leads?.length || 0;

    // Conversion rate
    metrics.lead_conversion_rate = metrics.leads_total > 0
      ? ((metrics.leads_converted / metrics.leads_total) * 100).toFixed(1)
      : 0;

    // Tasks
    const { data: tasks } = await this.supabase
      .from('agent_tasks')
      .select('status');

    metrics.tasks_pending = tasks?.filter(t => t.status === 'pending').length || 0;
    metrics.tasks_completed = tasks?.filter(t => t.status === 'completed').length || 0;
    metrics.tasks_failed = tasks?.filter(t => t.status === 'failed').length || 0;

    // Goal progress
    const goalTarget = 10000;
    metrics.goal_progress_percent = ((metrics.total_revenue / goalTarget) * 100).toFixed(2);

    return metrics;
  }

  async recordAllKPIs(metrics) {
    const kpis = [
      ['users', metrics.users],
      ['new_users_today', metrics.new_users_today],
      ['total_escrows', metrics.total_escrows],
      ['escrows_today', metrics.escrows_today],
      ['total_volume', metrics.total_volume],
      ['total_revenue', metrics.total_revenue],
      ['services', metrics.services],
      ['moltbook_engagements_24h', metrics.moltbook_engagements_24h],
      ['leads_new', metrics.leads_new],
      ['leads_converted', metrics.leads_converted],
      ['lead_conversion_rate', parseFloat(metrics.lead_conversion_rate) || 0],
      ['tasks_pending', metrics.tasks_pending],
      ['tasks_completed', metrics.tasks_completed],
      ['goal_progress_percent', parseFloat(metrics.goal_progress_percent) || 0]
    ];

    for (const [metric, value] of kpis) {
      await this.recordKPI(metric, value);
    }

    console.log(`Recorded ${kpis.length} KPIs`);
  }

  async analyzeTrends() {
    // Get last 7 days of KPIs
    const { data: kpis } = await this.supabase
      .from('agent_kpis')
      .select('*')
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (!kpis || kpis.length === 0) {
      return { message: 'Insufficient data for trend analysis' };
    }

    // Group by metric
    const byMetric = {};
    for (const kpi of kpis) {
      if (!byMetric[kpi.metric]) {
        byMetric[kpi.metric] = [];
      }
      byMetric[kpi.metric].push({ date: kpi.date, value: kpi.value });
    }

    // Calculate trends
    const trends = {};
    for (const [metric, values] of Object.entries(byMetric)) {
      if (values.length < 2) continue;

      const first = values[0].value;
      const last = values[values.length - 1].value;
      const change = first > 0 ? ((last - first) / first) * 100 : 0;

      trends[metric] = {
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
        change_percent: change.toFixed(1),
        values: values.slice(-7)
      };
    }

    return trends;
  }

  async generateInsights(metrics, trends) {
    const prompt = `Analyze these metrics and trends, then provide actionable insights.

CURRENT METRICS:
${Object.entries(metrics).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

TRENDS (7 days):
${Object.entries(trends).map(([k, v]) =>
  typeof v === 'object' && v.direction
    ? `- ${k}: ${v.direction} ${v.change_percent}%`
    : `- ${k}: ${JSON.stringify(v)}`
).join('\n')}

GOAL: $10,000/month revenue (currently at ${metrics.goal_progress_percent}%)

Provide insights in JSON:
{
  "health_score": 1-10,
  "top_performing": "what metric is doing best",
  "needs_attention": "what metric needs improvement",
  "bottleneck": "main thing blocking growth",
  "recommendations": [
    "specific action 1",
    "specific action 2",
    "specific action 3"
  ],
  "forecast": "brief prediction for next week"
}`;

    return await this.thinkJSON(prompt, ANALYST_PROMPT);
  }

  async storeReport(metrics, trends, insights) {
    const today = new Date().toISOString().split('T')[0];

    const report = {
      date: today,
      metrics,
      trends,
      insights,
      generated_at: new Date().toISOString()
    };

    // Store in memory
    await this.remember(`daily_report_${today}`, report, 'reports');
    await this.remember('latest_report', report, 'reports');

    // Also store for Strategist to access
    await this.supabase
      .from('agent_memory')
      .upsert({
        key: 'analyst_insights',
        value: insights,
        agent: 'StrategistAgent',
        category: 'analyst_data',
        updated_at: new Date().toISOString()
      }, { onConflict: 'key,agent' });
  }

  async checkAnomalies(metrics, trends) {
    const anomalies = [];

    // Check for significant drops
    for (const [metric, trend] of Object.entries(trends)) {
      if (typeof trend === 'object' && trend.change_percent) {
        const change = parseFloat(trend.change_percent);
        if (change < -20) {
          anomalies.push({
            metric,
            type: 'significant_drop',
            change: `${change}%`
          });
        }
      }
    }

    // Check for zero activity
    if (metrics.new_users_today === 0 && metrics.users > 0) {
      anomalies.push({
        metric: 'new_users_today',
        type: 'zero_activity',
        message: 'No new users today'
      });
    }

    if (anomalies.length > 0) {
      await this.remember('anomalies', anomalies, 'alerts');
      console.log('⚠️ Anomalies detected:', anomalies);

      // Create high-priority task for Strategist
      await this.createTask(
        'review_anomaly',
        `Anomalies detected: ${anomalies.map(a => a.metric).join(', ')}`,
        { priority: 9, inputData: { anomalies } }
      );
    }

    return anomalies;
  }
}

// Run if called directly
if (require.main === module) {
  const agent = new AnalystAgent();
  agent.run().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = AnalystAgent;
