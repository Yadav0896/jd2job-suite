const path = require('path');
const { OpenAIChatModel, DeepSeekChatModel } = require('@agentscope-ai/agentscope/model');
const { Agent } = require('@agentscope-ai/agentscope/agent');

let fastModelInstance = null;    // llama-3.1-8b  → real-time interview Q&A
let deepModelInstance = null;    // deepseek-chat  → research, briefings, evaluation

// ── Helper: apply NIM tool-stripping patch to OpenAI-compatible clients ────
function _patchClient(model) {
  const client = model.client;
  if (!client) return; // DeepSeekChatModel uses fetch directly — no patch needed
  const origCreate = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = function (params) {
    const clean = { ...params };
    if (!clean.tools || clean.tools.length === 0 ||
        (clean.tools.length === 1 && clean.tools[0].function?.name === 'Skill')) {
      delete clean.tools;
      delete clean.tool_choice;
    }
    return origCreate(clean);
  };
}

// ── Fast model: DeepSeek Chat (for interview Q&A) ──────────
function getFastModel() {
  if (!fastModelInstance) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) console.warn('⚠️  DEEPSEEK_API_KEY not set.');

    fastModelInstance = new DeepSeekChatModel({
      modelName: 'deepseek-chat',
      apiKey: apiKey || 'dummy-key',
      stream: false,
      maxRetries: 1
    });
  }
  return fastModelInstance;
}

// ── Deep model: DeepSeek V3 (for research, briefings, evaluation, ~3-5s) ───
function getDeepModel() {
  if (!deepModelInstance) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) console.warn('⚠️  DEEPSEEK_API_KEY not set. Research tasks will fail.');

    deepModelInstance = new DeepSeekChatModel({
      modelName: 'deepseek-chat',  // DeepSeek V3
      apiKey: apiKey || 'dummy-key',
      stream: false,
      maxRetries: 1
    });
  }
  return deepModelInstance;
}

// ── Agent factories ────────────────────────────────────────────────────────

/** Real-time Interviewer — uses fast 8B model */
function createInterviewerAgent(sysPrompt) {
  return new Agent({
    name: 'InterviewerAgent',
    sysPrompt,
    model: getFastModel()
  });
}

/** Research agent for sales briefings, JD analysis, meeting summaries — DeepSeek V3 */
function createResearchAgent(sysPrompt) {
  return new Agent({
    name: 'ResearchAgent',
    sysPrompt,
    model: getDeepModel()
  });
}

/** Answer evaluator — uses DeepSeek for deep, nuanced feedback */
function createEvaluatorAgent(sysPrompt) {
  return new Agent({
    name: 'EvaluatorAgent',
    sysPrompt,
    model: getDeepModel()
  });
}

module.exports = {
  getFastModel,
  getDeepModel,
  createInterviewerAgent,
  createResearchAgent,
  createEvaluatorAgent
};
