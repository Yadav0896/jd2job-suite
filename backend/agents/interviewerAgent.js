const { createInterviewerAgent } = require('../agentManager');
const { createMsg } = require('@agentscope-ai/agentscope/message');

/**
 * Generates the next question using AgentScope.
 */
async function generateNextQuestion({
  interviewType,
  difficulty,
  resumeData,
  jobDescription,
  previousQuestions,
  questionNumber
}) {
  const difficultyPrompts = {
    easy: 'Ask fundamental questions appropriate for a junior to mid-level position. Focus on basic concepts and foundational knowledge.',
    medium: 'Ask standard interview questions appropriate for a mid-level position. Include practical scenarios and problem-solving.',
    hard: 'Ask advanced technical questions for senior/staff level. Include deep-dive scenarios, trade-offs, and architecture decisions.'
  };

  const typePrompt = interviewType?.toLowerCase().includes('behavioral')
    ? 'Ask behavioral interview questions using the STAR method.'
    : `Ask relevant ${interviewType} interview questions.`;

  const resumeContext = resumeData ? `\nCandidate's Resume:\n${resumeData}\n` : '';
  const jdContext = jobDescription ? `\nJob Description:\n${jobDescription}\n` : '';

  const sysPrompt = `You are an expert interviewer conducting a ${difficulty} interview session.
Your role: ${typePrompt}
Focus areas: ${difficultyPrompts[difficulty] || difficultyPrompts.medium}
${resumeContext}${jdContext}
IMPORTANT: Return valid JSON only, no markdown.`;

  const userPrompt = `Generate interview question #${questionNumber} for this ${interviewType} position at ${difficulty} difficulty level.
${previousQuestions?.length > 0 ? `\nPrevious questions asked:\n${previousQuestions.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}\n` : ''}
Return JSON in this exact format:
{
  "question": "The interview question",
  "category": "Technical|Behavioral|Problem Solving|System Design",
  "hints": ["hint 1", "hint 2"]
}`;

  const agent = createInterviewerAgent(sysPrompt);

  const msg = createMsg({
    role: 'user',
    name: 'user',
    content: userPrompt
  });

  const response = await agent.reply({ msgs: [msg] });
  
  // Extract text content from AgentScope response structure
  const textContent = response.content?.[0]?.text || '';

  // Parse JSON from text content
  let parsed = {};
  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : textContent;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const { jsonrepair } = require('jsonrepair');
      const repaired = jsonrepair(jsonText);
      parsed = JSON.parse(repaired);
    }
  } catch (err) {
    console.error('Failed to parse AgentScope JSON content:', textContent);
    parsed = { question: textContent, category: 'General', hints: [] };
  }

  return {
    question: parsed.question || textContent,
    category: parsed.category || 'General',
    hints: parsed.hints || []
  };
}

module.exports = {
  generateNextQuestion
};
