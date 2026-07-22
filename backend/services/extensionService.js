/**
 * extensionService — AI operations for the Jd2Job Chrome extension.
 *
 * All LLM calls happen server-side so users never need their own API keys.
 * DeepSeek is the primary provider; NVIDIA NIM and Groq are fallbacks.
 */

const fetch = require('node-fetch');

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_JD_LENGTH = 12000;
const MAX_RESUME_LENGTH = 15000;

/**
 * Call an LLM and return the raw text content. Tries providers in order.
 */
async function callLLM(messages, { temperature = 0.3, maxTokens = 4000 } = {}) {
  const providers = [];

  if (process.env.DEEPSEEK_API_KEY) {
    providers.push({
      url: DEEPSEEK_CHAT_URL,
      key: process.env.DEEPSEEK_API_KEY,
      model: 'deepseek-chat',
    });
  }
  if (process.env.NVIDIA_API_KEY) {
    providers.push({
      url: NVIDIA_CHAT_URL,
      key: process.env.NVIDIA_API_KEY,
      model: 'meta/llama-3.3-70b-instruct',
    });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({
      url: GROQ_CHAT_URL,
      key: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
    });
  }

  if (providers.length === 0) {
    throw new Error('No LLM provider API key configured on the server');
  }

  let lastError = null;
  for (const p of providers) {
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${p.key}`,
        },
        body: JSON.stringify({ model: p.model, messages, temperature, max_tokens: maxTokens }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        lastError = new Error(`LLM provider error (${res.status}): ${errText.slice(0, 300)}`);
        console.error('[ExtensionService] Provider failed, trying next:', lastError.message);
        continue;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error('LLM returned empty content');
        continue;
      }
      return content;
    } catch (err) {
      lastError = err;
      console.error('[ExtensionService] Provider threw, trying next:', err.message);
    }
  }

  throw lastError || new Error('All LLM providers failed');
}

/**
 * Call an LLM expecting a JSON object back. Strips markdown fences,
 * extracts the first {...} block, and repairs malformed JSON if needed.
 */
async function callLLMJson(messages, options = {}) {
  const content = await callLLM(messages, { temperature: 0.2, ...options });

  const cleaned = content.replace(/```json|```/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : cleaned;

  try {
    return JSON.parse(jsonText);
  } catch {
    try {
      const { jsonrepair } = require('jsonrepair');
      return JSON.parse(jsonrepair(jsonText));
    } catch (err) {
      console.error('[ExtensionService] JSON parse failed. Raw LLM output:', content.slice(0, 500));
      throw new Error('AI response was not valid JSON');
    }
  }
}

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

/**
 * Generate a JD-tailored, ATS-optimized resume from the user's base resume.
 * Returns { resumeText, keywords, missingKeywords, atsScore, changesSummary }.
 */
async function tailorResume({ baseResumeText, jobDescription, jobTitle, companyName }) {
  if (!baseResumeText || !jobDescription) {
    throw new Error('baseResumeText and jobDescription are required');
  }

  const systemPrompt = `You are an elite resume writer and ATS optimization expert.
You tailor resumes to specific job descriptions. You NEVER invent experience, employers, degrees, or metrics the candidate does not have — you only reframe, reorder, and re-keyword what exists.
You return ONLY valid JSON. No markdown fences, no commentary, no explanation.`;

  const userPrompt = `Tailor this resume for the role below.

TARGET ROLE: ${jobTitle || 'Not specified'}${companyName ? ` at ${companyName}` : ''}

JOB DESCRIPTION:
${truncate(jobDescription, MAX_JD_LENGTH)}

CANDIDATE'S BASE RESUME:
${truncate(baseResumeText, MAX_RESUME_LENGTH)}

Rules for the tailored resume:
- Plain text, ATS-safe (no tables, no columns, no graphics, no headers/footers).
- Structure: Name & contact line → Professional Summary (2-3 sentences, tailored) → Skills (grouped, JD keywords first) → Work Experience (reverse-chronological, bullet points starting with action verbs, quantified where the base resume quantifies) → Education → Certifications (if present).
- Mirror the job description's exact terminology where the candidate genuinely has that skill.
- Keep every employer, title, date, and degree from the base resume unchanged.
- Do not fabricate anything.

Return JSON in this exact format:
{
  "resumeText": "the complete tailored resume as plain text",
  "keywords": ["jd keyword incorporated 1", "keyword 2"],
  "missingKeywords": ["jd keyword the candidate lacks 1"],
  "atsScore": <integer 0-100 estimating keyword match>,
  "changesSummary": "one sentence describing what was tailored"
}`;

  const result = await callLLMJson([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 4500 });

  if (!result.resumeText || typeof result.resumeText !== 'string') {
    throw new Error('AI did not return resume text');
  }

  return {
    resumeText: result.resumeText,
    keywords: Array.isArray(result.keywords) ? result.keywords : [],
    missingKeywords: Array.isArray(result.missingKeywords) ? result.missingKeywords : [],
    atsScore: Number.isFinite(result.atsScore) ? Math.min(100, Math.max(0, result.atsScore)) : null,
    changesSummary: typeof result.changesSummary === 'string' ? result.changesSummary : '',
  };
}

/**
 * Generate a short, form-ready answer to an application question,
 * grounded in the candidate's resume.
 */
async function generateAnswer({ question, fieldType, baseResumeText }) {
  if (!question) {
    throw new Error('question is required');
  }

  const lengthHint = fieldType === 'textarea'
    ? 'Answer in 2-4 concise sentences (under 60 words).'
    : 'Answer in a few words or one short line — this is a short form field.';

  const systemPrompt = `You answer job-application form questions on behalf of a candidate, strictly grounded in their resume.
${lengthHint}
Never invent experience, employers, degrees, certifications, or metrics.
If the question cannot be answered from the resume, give the most reasonable generic professional answer.
Return ONLY valid JSON: { "answer": "..." }`;

  const userPrompt = `CANDIDATE'S RESUME:
${truncate(baseResumeText, MAX_RESUME_LENGTH)}

APPLICATION QUESTION:
${truncate(question, 1000)}

Return JSON: { "answer": "..." }`;

  const result = await callLLMJson([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 500 });

  const answer = (result.answer || '').toString().trim();
  if (!answer) throw new Error('AI did not return an answer');
  return { answer };
}

module.exports = { tailorResume, generateAnswer };
