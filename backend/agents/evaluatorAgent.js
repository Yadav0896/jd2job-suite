const { createEvaluatorAgent } = require('../agentManager');
const { createMsg } = require('@agentscope-ai/agentscope/message');

/**
 * Evaluate a candidate's interview answer using DeepSeek V3.
 * Provides detailed, nuanced feedback with STAR analysis.
 */
async function evaluateAnswer({ question, userAnswer, resumeData, difficulty }) {
  const resumeContext = resumeData ? `\nCandidate's Resume:\n${resumeData}\n` : '';

  const sysPrompt = `You are an expert interview coach with 15 years of experience at top tech companies.
Provide honest, constructive, detailed feedback on interview answers.
${resumeContext}
Return ONLY valid JSON. No markdown outside JSON.`;

  const userPrompt = `Evaluate this interview answer at ${difficulty} difficulty:

Question: "${question}"
Answer: "${userAnswer}"

Return JSON in this exact format:
{
  "score": <1-10>,
  "feedback": "Overall summary of performance",
  "strengths": ["strength 1", "strength 2"],
  "suggestions": ["improvement 1", "improvement 2"],
  "starRating": {
    "S": "Situation — was it clearly set?",
    "T": "Task — was the task well defined?",
    "A": "Action — were actions specific and credible?",
    "R": "Result — was the outcome quantified?"
  },
  "idealAnswerElements": ["element 1", "element 2"],
  "keywords": ["keyword 1", "keyword 2"]
}`;

  const agent = createEvaluatorAgent(sysPrompt);
  const msg = createMsg({ role: 'user', name: 'user', content: userPrompt });
  const response = await agent.reply({ msgs: [msg] });

  const text = response.content?.[0]?.text || '';

  let parsed = {};
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : text;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const { jsonrepair } = require('jsonrepair');
      const repaired = jsonrepair(jsonText);
      parsed = JSON.parse(repaired);
    }
  } catch {
    parsed = { score: 5, feedback: text, strengths: [], suggestions: [] };
  }

  return {
    score: parsed.score || 5,
    feedback: parsed.feedback || '',
    strengths: parsed.strengths || [],
    suggestions: parsed.suggestions || [],
    starRating: parsed.starRating || null,
    idealAnswerElements: parsed.idealAnswerElements || [],
    keywords: parsed.keywords || []
  };
}

module.exports = { evaluateAnswer };
