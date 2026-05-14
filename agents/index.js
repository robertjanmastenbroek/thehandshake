/**
 * TheHandshake Autonomous Agent System
 *
 * A self-sustaining AI agent system that works toward $10k/month revenue
 * without human intervention. Runs on GitHub Actions + Supabase.
 */

const AgentCore = require('./agent_core');
const StrategistAgent = require('./strategist_agent');
const MoltbookAgent = require('./moltbook_agent');
const AnalystAgent = require('./analyst_agent');

module.exports = {
  AgentCore,
  StrategistAgent,
  MoltbookAgent,
  AnalystAgent
};

// Quick CLI interface
if (require.main === module) {
  const agent = process.argv[2];

  const agents = {
    strategist: StrategistAgent,
    moltbook: MoltbookAgent,
    analyst: AnalystAgent
  };

  if (!agent || !agents[agent]) {
    console.log(`
Usage: node agents/index.js <agent>

Available agents:
  strategist  - Creates and prioritizes tasks (run daily)
  moltbook    - Moltbook engagement (run every 30 min)
  analyst     - KPI tracking and analysis (run daily)

Example:
  node agents/index.js strategist
    `);
    process.exit(0);
  }

  const AgentClass = agents[agent];
  const instance = new AgentClass();
  instance.run().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
