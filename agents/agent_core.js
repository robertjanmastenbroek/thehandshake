/**
 * AgentCore - Base class for all autonomous agents
 *
 * Provides:
 * - Memory (persistent storage via Supabase)
 * - Task queue integration
 * - Logging
 * - LLM calls via Claude
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

class AgentCore {
  constructor(agentName, options = {}) {
    this.name = agentName;
    this.options = options;

    // Initialize Supabase
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Initialize Claude
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    this.startTime = Date.now();
  }

  // =====================================================
  // MEMORY OPERATIONS
  // =====================================================

  async remember(key, value, category = 'general') {
    const { error } = await this.supabase.rpc('upsert_memory', {
      p_key: key,
      p_value: value,
      p_agent: this.name,
      p_category: category
    });

    if (error) {
      console.error(`[${this.name}] Memory write error:`, error);
      // Fallback to direct insert
      await this.supabase
        .from('agent_memory')
        .upsert({
          key,
          value,
          agent: this.name,
          category,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key,agent' });
    }
  }

  async recall(key) {
    const { data, error } = await this.supabase
      .from('agent_memory')
      .select('value')
      .eq('key', key)
      .eq('agent', this.name)
      .single();

    if (error) return null;
    return data?.value;
  }

  async recallAll(category = null) {
    let query = this.supabase
      .from('agent_memory')
      .select('key, value, category, updated_at')
      .eq('agent', this.name);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) return [];
    return data;
  }

  async forget(key) {
    await this.supabase
      .from('agent_memory')
      .delete()
      .eq('key', key)
      .eq('agent', this.name);
  }

  // =====================================================
  // TASK QUEUE OPERATIONS
  // =====================================================

  async createTask(taskType, description, options = {}) {
    const { data, error } = await this.supabase
      .from('agent_tasks')
      .insert({
        task_type: taskType,
        description,
        priority: options.priority || 5,
        assigned_agent: options.assignedAgent || null,
        input_data: options.inputData || {},
        deadline: options.deadline || null
      })
      .select()
      .single();

    if (error) {
      console.error(`[${this.name}] Task creation error:`, error);
      return null;
    }

    this.log('create_task', { taskType, description });
    return data;
  }

  async getNextTask() {
    const { data, error } = await this.supabase.rpc('get_next_task', {
      agent_type: this.name
    });

    if (error || !data?.id) return null;
    return data;
  }

  async completeTask(taskId, result) {
    await this.supabase
      .from('agent_tasks')
      .update({
        status: 'completed',
        result,
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId);

    this.log('complete_task', { taskId });
  }

  async failTask(taskId, errorMessage) {
    const { data: task } = await this.supabase
      .from('agent_tasks')
      .select('retry_count, max_retries')
      .eq('id', taskId)
      .single();

    if (task && task.retry_count < task.max_retries) {
      // Retry later
      await this.supabase
        .from('agent_tasks')
        .update({
          status: 'pending',
          retry_count: task.retry_count + 1,
          error_message: errorMessage
        })
        .eq('id', taskId);
    } else {
      // Mark as failed
      await this.supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId);
    }

    this.log('fail_task', { taskId, errorMessage });
  }

  async getPendingTasks(taskType = null) {
    let query = this.supabase
      .from('agent_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (taskType) {
      query = query.eq('task_type', taskType);
    }

    const { data } = await query;
    return data || [];
  }

  // =====================================================
  // KPI TRACKING
  // =====================================================

  async recordKPI(metric, value, notes = null) {
    await this.supabase.rpc('record_kpi', {
      p_metric: metric,
      p_value: value,
      p_notes: notes
    }).catch(() => {
      // Fallback to direct insert
      this.supabase
        .from('agent_kpis')
        .upsert({
          date: new Date().toISOString().split('T')[0],
          metric,
          value,
          notes
        }, { onConflict: 'date,metric' });
    });
  }

  async getKPI(metric, days = 7) {
    const { data } = await this.supabase
      .from('agent_kpis')
      .select('*')
      .eq('metric', metric)
      .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false });

    return data || [];
  }

  async getAllKPIs(days = 7) {
    const { data } = await this.supabase
      .from('agent_kpis')
      .select('*')
      .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false });

    return data || [];
  }

  // =====================================================
  // GOAL TRACKING
  // =====================================================

  async getGoals() {
    const { data } = await this.supabase
      .from('agent_goals')
      .select('*')
      .eq('status', 'active');

    return data || [];
  }

  async updateGoalProgress(goalName, currentValue) {
    await this.supabase
      .from('agent_goals')
      .update({
        current_value: currentValue,
        updated_at: new Date().toISOString()
      })
      .eq('name', goalName);
  }

  // =====================================================
  // LEADS MANAGEMENT
  // =====================================================

  async addLead(source, identifier, context, name = null) {
    const { data, error } = await this.supabase
      .from('leads')
      .upsert({
        source,
        identifier,
        context,
        name,
        updated_at: new Date().toISOString()
      }, { onConflict: 'source,identifier' })
      .select()
      .single();

    if (!error) {
      this.log('add_lead', { source, identifier });
    }

    return data;
  }

  async getLeads(status = 'new', limit = 10) {
    const { data } = await this.supabase
      .from('leads')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    return data || [];
  }

  async updateLeadStatus(leadId, status, notes = null) {
    await this.supabase
      .from('leads')
      .update({
        status,
        notes: notes ? notes : undefined,
        last_contacted_at: status === 'contacted' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
  }

  // =====================================================
  // LOGGING
  // =====================================================

  async log(action, metadata = {}, status = 'success') {
    const duration = Date.now() - this.startTime;

    await this.supabase
      .from('agent_logs')
      .insert({
        agent: this.name,
        action,
        status,
        duration_ms: duration,
        metadata
      });

    console.log(`[${this.name}] ${action}:`, JSON.stringify(metadata).slice(0, 200));
  }

  // =====================================================
  // LLM CALLS
  // =====================================================

  async think(prompt, systemPrompt = null, options = {}) {
    const messages = [{ role: 'user', content: prompt }];

    const response = await this.anthropic.messages.create({
      model: options.model || 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 2000,
      system: systemPrompt || `You are ${this.name}, an autonomous AI agent working toward a goal. Be concise and action-oriented.`,
      messages
    });

    return response.content[0].text;
  }

  async thinkJSON(prompt, systemPrompt = null, options = {}) {
    const jsonPrompt = prompt + '\n\nRespond with valid JSON only, no explanation.';

    const response = await this.think(jsonPrompt, systemPrompt, options);

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (e) {
      console.error(`[${this.name}] JSON parse error:`, e.message);
      return null;
    }
  }

  // =====================================================
  // UTILITY
  // =====================================================

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run() {
    throw new Error('Subclasses must implement run()');
  }
}

module.exports = AgentCore;
