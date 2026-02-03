/**
 * THE HANDSHAKE - AI Judge Logic
 *
 * Uses Claude 3.5 Sonnet to verify if submitted work
 * meets the job description requirements.
 *
 * Returns: 'VALID' or 'INVALID' - Binary, no ambiguity.
 */

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * The Judge Prompt
 * Designed for clarity and binary decision-making.
 */
const JUDGE_SYSTEM_PROMPT = `You are THE JUDGE - an impartial AI arbiter for The Handshake escrow system.

Your role is to verify if submitted work meets the requirements specified in a job description.

RULES:
1. You must return ONLY one word: "VALID" or "INVALID"
2. Be fair but strict - the work must genuinely fulfill the requirements
3. Minor imperfections are acceptable if core requirements are met
4. Completely missing deliverables = INVALID
5. Partial work that doesn't meet the main objective = INVALID
6. Work that meets all stated requirements = VALID

You are the final word. Your verdict releases or holds funds.
Be just. Be precise. Be final.`;

/**
 * Judge the submitted work against job requirements
 * @param {string} jobDescription - What was requested
 * @param {string} submittedWork - What was delivered
 * @returns {Promise<'VALID'|'INVALID'>} - The verdict
 */
async function judgeWork(jobDescription, submittedWork) {
  try {
    const userPrompt = `## JOB DESCRIPTION (What was requested):
${jobDescription}

## SUBMITTED WORK (What was delivered):
${submittedWork}

## YOUR TASK:
Compare the submitted work against the job description requirements.
Does the work fulfill what was requested?

Respond with exactly one word: VALID or INVALID`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    // Extract the verdict
    const verdict = response.content[0].text.trim().toUpperCase();

    // Ensure we only return VALID or INVALID
    if (verdict === 'VALID' || verdict === 'INVALID') {
      return verdict;
    }

    // If somehow we get something else, be conservative
    console.warn(`Unexpected judge response: ${verdict}. Defaulting to INVALID.`);
    return 'INVALID';

  } catch (error) {
    console.error('Judge error:', error);
    throw new Error(`AI Judge failed: ${error.message}`);
  }
}

/**
 * Extended judge with reasoning (for debugging/auditing)
 * Returns verdict plus explanation
 */
async function judgeWorkWithReasoning(jobDescription, submittedWork) {
  try {
    const userPrompt = `## JOB DESCRIPTION (What was requested):
${jobDescription}

## SUBMITTED WORK (What was delivered):
${submittedWork}

## YOUR TASK:
1. First, analyze if the work meets the requirements
2. Then give your final verdict

Format your response as:
REASONING: [Your brief analysis]
VERDICT: [VALID or INVALID]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const responseText = response.content[0].text;

    // Parse the response
    const verdictMatch = responseText.match(/VERDICT:\s*(VALID|INVALID)/i);
    const reasoningMatch = responseText.match(/REASONING:\s*(.+?)(?=VERDICT:|$)/is);

    return {
      verdict: verdictMatch ? verdictMatch[1].toUpperCase() : 'INVALID',
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided'
    };

  } catch (error) {
    console.error('Judge error:', error);
    throw new Error(`AI Judge failed: ${error.message}`);
  }
}

module.exports = {
  judgeWork,
  judgeWorkWithReasoning
};
