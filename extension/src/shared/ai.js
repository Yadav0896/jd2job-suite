// Shared AI helpers — Jd2Job backend first, user's own DeepSeek key as fallback.
/* global chrome, safeJSONParse, jd2jobTailorResume, jd2jobGenerateAnswer */
/* exported callDeepSeek, callDeepSeekJSON, aiTailorResume, aiGenerateAnswer, sanitizeJSON */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// ── Backend-first AI call (uses Jd2Job credits, no personal key needed) ─────
async function callDeepSeek(messages, options = {}) {
  // Try backend first (tracks credits, uses shared API keys)
  try {
    const data = await jd2jobFetch('/deepseek/chat', {
      method: 'POST',
      body: {
        model: options.model || 'deepseek-chat',
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 4096,
        stream: false,
      }
    });
    if (data?.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    if (data?.content) return data.content;
  } catch (backendErr) {
    console.warn('[Jd2Job] Backend call failed, trying own key:', backendErr.message);
  }

  // Fallback: user's own DeepSeek key
  const { apiKey } = await chrome.storage.sync.get(['apiKey']);
  if (!apiKey) {
    throw new Error('Not connected: sign into jd2job.com, or add your own DeepSeek API key in Settings.');
  }

  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: options.model || 'deepseek-chat', messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 4096
    })
  });

  if (!res.ok) { const err = await res.text(); throw new Error(`DeepSeek error (${res.status}): ${err}`); }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callDeepSeekJSON(messages, options = {}) {
  const content = await callDeepSeek(messages, { ...options, temperature: options.temperature ?? 0.1 });
  const parsed = safeJSONParse(content);
  if (parsed === null) {
    throw new Error('AI response was not valid JSON');
  }
  return parsed;
}

// ── Backend-first AI routing ────────────────────────────────────────────────
// Prefer the Jd2Job API (server-side keys, credits). If the account isn't
// connected but the user has their own DeepSeek key, fall back to direct calls.

async function aiTailorResume({ baseResumeText, jobDescription, jobTitle, companyName }) {
  try {
    const result = await jd2jobTailorResume({ baseResumeText, jobDescription, jobTitle, companyName });
    return { ...result, source: 'jd2job' };
  } catch (backendErr) {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);
    if (!apiKey) throw backendErr;
    console.warn('[Jd2Job] Backend resume failed, using own DeepSeek key:', backendErr.message);

    const content = await callDeepSeekJSON([
      {
        role: 'system',
        content: `You are an elite resume writer and ATS expert. Tailor the resume to the job description without inventing experience, employers, degrees, or metrics. Return ONLY valid JSON: { "resumeText": "...", "keywords": ["..."], "atsScore": 0 }`
      },
      {
        role: 'user',
        content: `JOB TITLE: ${jobTitle || ''}\nCOMPANY: ${companyName || ''}\nJOB DESCRIPTION:\n${jobDescription}\n\nBASE RESUME:\n${baseResumeText}`
      }
    ], { temperature: 0.3, maxTokens: 4500 });

    return {
      resumeText: content.resumeText || '',
      keywords: content.keywords || [],
      missingKeywords: content.missingKeywords || [],
      atsScore: content.atsScore ?? null,
      changesSummary: content.changesSummary || '',
      source: 'own-key'
    };
  }
}

async function aiGenerateAnswer({ question, fieldType, baseResumeText }) {
  try {
    const result = await jd2jobGenerateAnswer({ question, fieldType, baseResumeText });
    return result.answer;
  } catch (backendErr) {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);
    if (!apiKey) throw backendErr;
    console.warn('[Jd2Job] Backend answer failed, using own DeepSeek key:', backendErr.message);

    const lengthHint = fieldType === 'textarea'
      ? 'Answer in 2-4 concise sentences (under 60 words).'
      : 'Answer in a few words or one short line.';
    return callDeepSeek([
      {
        role: 'system',
        content: `You answer job-application form questions strictly grounded in the candidate's resume. ${lengthHint} Never invent experience or metrics. Return only the answer text.`
      },
      { role: 'user', content: `RESUME:\n${baseResumeText}\n\nQUESTION:\n${question}` }
    ], { temperature: 0.3, maxTokens: 400 });
  }
}
