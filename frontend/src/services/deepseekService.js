/**
 * deepseekService - Streaming AI answer generation via DeepSeek API
 *
 * Uses Server-Sent Events (SSE) streaming so the answer appears
 * token-by-token in the UI, just like ChatGPT.
 *
 * Output is structured JSON:
 *   { answer, bulletPoints[], hints[] }
 *
 * Falls back to plain-text answer if JSON parsing fails.
 */
import { getSession } from './supabaseClient';


const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DEEPSEEK_URL = `${API_BASE}/api/deepseek/chat`;
const MODEL      = 'deepseek-chat';

/**
 * Stream an AI-generated interview answer.
 *
 * @param {object} params
 * @param {string} params.apiKey      - DeepSeek API key
 * @param {string} params.question    - The detected interview question
 * @param {Array}  params.transcripts - Recent transcript history for context
 * @param {any}    params.resumeData  - User's resume (string or object)
 *
 * @yields {{ type: 'token', token: string, fullText: string }}
 * @yields {{ type: 'done',  parsed: { answer, bulletPoints, hints } }}
 * @throws  Error if the API call fails
 */
async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status >= 400 && response.status < 500) {
        return response; // Client error, don't retry
      }
      if (i < retries - 1) {
        console.warn(`Transient API error (${response.status}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        return response;
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err; // Propagate aborts
      if (i < retries - 1) {
        console.warn(`Network error: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
}

export async function* streamAnswer({ question, transcripts = [], resumeData = null, jobDescription = null, conversationMemory = null }) {
  const truncatedQuestion = typeof question === 'string' ? question.substring(0, 4000) : '';
  const systemPrompt = buildSystemPrompt(resumeData, jobDescription, conversationMemory);
  const userPrompt   = buildUserPrompt(truncatedQuestion, transcripts);

  const session = await getSession();
  const token = session?.access_token || '';

  const response = await fetchWithRetry(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    body: JSON.stringify({
      model:       MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens:  1024,
      temperature: 0.4,
      top_p:       0.9,
      stream:      true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`DeepSeek API error ${response.status}: ${errText}`);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer    = '';
  let fullText  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // Hold the last incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') {
        yield { type: 'done', parsed: parseStructuredAnswer(fullText) };
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const token  = parsed.choices?.[0]?.delta?.content ?? '';
        if (token) {
          fullText += token;
          
          // Improved splitting logic:
          // 1. Everything between [REASONING] and [/REASONING] is reasoning
          // 2. If [/REASONING] is missing but [REASONING] exists, take everything 
          //    until the first '{' (start of JSON)
          let reasoning = '';
          let answerText = '';
          
          const startTag = '[REASONING]';
          const endTag   = '[/REASONING]';
          const startIdx = fullText.indexOf(startTag);
          const endIdx   = fullText.indexOf(endTag);
          
          if (startIdx !== -1) {
            if (endIdx !== -1) {
              reasoning = fullText.slice(startIdx + startTag.length, endIdx);
              answerText = fullText.slice(endIdx + endTag.length).trim();
            } else {
              // Still in reasoning or missed end tag
              const jsonStartIdx = fullText.indexOf('{', startIdx + startTag.length);
              if (jsonStartIdx !== -1) {
                // Heuristic: model started JSON without closing reasoning tag
                reasoning = fullText.slice(startIdx + startTag.length, jsonStartIdx);
                answerText = fullText.slice(jsonStartIdx);
              } else {
                reasoning = fullText.slice(startIdx + startTag.length);
              }
            }
          } else {
            // No reasoning tag found yet, might be direct JSON
            answerText = fullText;
          }
          
          yield { 
            type: 'token', 
            token, 
            fullText, 
            reasoning: reasoning.trim(),
            answerText: answerText.trim()
          };
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
  }

  // Emit done if the stream ends without a [DONE] sentinel
  yield { type: 'done', parsed: parseStructuredAnswer(fullText) };
}

/**
 * Parses tags like [REASONING]...[/REASONING] from a raw string.
 */
function extractTagContent(text, tag) {
  const startTag = `[${tag}]`;
  const endTag   = `[/${tag}]`;
  const startIdx = text.indexOf(startTag);
  const endIdx   = text.indexOf(endTag);
  if (startIdx === -1) return '';
  if (endIdx === -1) {
    // If it's a reasoning tag, don't let it swallow the JSON
    if (tag === 'REASONING') {
      const jsonStart = text.indexOf('{', startIdx + startTag.length);
      if (jsonStart !== -1) return text.slice(startIdx + startTag.length, jsonStart);
    }
    return text.slice(startIdx + startTag.length);
  }
  return text.slice(startIdx + startTag.length, endIdx);
}

/* ── Answer parsing ─────────────────────────────────────────────────────── */

/**
 * Parse the raw LLM response string into a structured answer object.
 * Extracts the first JSON block found; falls back to plain text.
 *
 * @param  {string} text - Full LLM response text
 * @returns {{ answer: string, bulletPoints: string[], hints: string[] }}
 */
export function parseStructuredAnswer(text) {
  // 1. Extract and strip reasoning if present
  const reasoning = extractTagContent(text, 'REASONING');
  const cleanText = text.replace(/\[REASONING\][\s\S]*?\[\/REASONING\]/g, '').trim();

  // 2. Look for JSON block
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const rawJson = jsonMatch[0];
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.answer || parsed.bulletPoints || parsed.hints) {
        return {
          answer:       parsed.answer       || '',
          bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
          hints:        Array.isArray(parsed.hints)        ? parsed.hints : [],
          reasoning:    reasoning,
        };
      }
    } catch {
      try {
        let sanitizedJson = rawJson
          .replace(/(?<!\\)\n(?!([^"]*"[^"]*")*[^"]*$)/g, '\\n')
          .replace(/(?<!\\)\r(?!([^"]*"[^"]*")*[^"]*$)/g, '\\r')
          .replace(/(?<!\\)\t(?!([^"]*"[^"]*")*[^"]*$)/g, '\\t');
        const parsed = JSON.parse(sanitizedJson);
        return {
          answer:       parsed.answer       || '',
          bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
          hints:        Array.isArray(parsed.hints)        ? parsed.hints : [],
          reasoning:    reasoning,
        };
      } catch (e) {
        console.warn("JSON Parse failed in deepseekService, using regex fallback.", e);
      }
    }
  }

  // Regex Fallback
  let fallbackAnswer = '';
  let bulletPoints = [];
  let hints = [];

  let answerMatch = cleanText.match(/"answer"\s*:\s*"([\s\S]*?)"\s*(?:,|})/);
  if (answerMatch) {
    fallbackAnswer = answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  const bulletsMatch = cleanText.match(/"bulletPoints"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (bulletsMatch) {
    const rawBullets = bulletsMatch[1].match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
    if (rawBullets) {
      bulletPoints = rawBullets.map(b => b.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n'));
    }
  }

  const hintsMatch = cleanText.match(/"hints"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (hintsMatch) {
    const rawHints = hintsMatch[1].match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
    if (rawHints) {
      hints = rawHints.map(h => h.slice(1, -1).replace(/\\"/g, '"'));
    }
  }

  if (!fallbackAnswer && bulletPoints.length === 0) {
    fallbackAnswer = cleanText.replace(/```json|```/g, '').trim();
  }

  if (bulletPoints.length === 0) {
    const lines = fallbackAnswer.split('\n');
    const extractedBullets = [];
    for (const line of lines) {
      const trimmedLine = line.trim();
      const bulletMatch = trimmedLine.match(/^[-*•]\s*(.*)/) || trimmedLine.match(/^\d+\.\s*(.*)/);
      if (bulletMatch) {
        extractedBullets.push(bulletMatch[1].trim());
      }
    }
    if (extractedBullets.length > 0) {
      bulletPoints = extractedBullets;
    }
  }

  return {
    answer:       fallbackAnswer,
    bulletPoints: bulletPoints,
    hints:        hints,
    reasoning:    reasoning,
  };
}

/* ── Prompt builders ────────────────────────────────────────────────────── */

function buildSystemPrompt(resumeData, jobDescription, conversationMemory) {
  let resumeText =
    resumeData == null ? '' :
    typeof resumeData === 'string' ? resumeData :
    JSON.stringify(resumeData, null, 2);
  resumeText = resumeText.substring(0, 10000);

  let jdText =
    jobDescription == null ? '' :
    typeof jobDescription === 'string' ? jobDescription :
    JSON.stringify(jobDescription, null, 2);
  jdText = jdText.substring(0, 10000);

  const contextSection = [
    resumeText ? `CANDIDATE RESUME:\n${resumeText}` : '',
    jdText ? `JOB DESCRIPTION:\n${jdText}` : ''
  ].filter(Boolean).join('\n\n');

  let memorySection = '';
  if (conversationMemory?.questionsAndAnswers?.length > 0) {
    memorySection = `\n── CONVERSATION MEMORY (Previous Q&A in this session) ──\n`;
    memorySection += `The candidate has already answered ${conversationMemory.questionsAndAnswers.length} question(s). IMPORTANT: Cross-reference previous answers when relevant to the current question.\n\n`;
    conversationMemory.questionsAndAnswers.forEach((qa, i) => {
      memorySection += `Q${i + 1}: "${qa.question?.substring(0, 100)}"\n`;
      memorySection += `A${i + 1}: "${qa.answer?.substring(0, 200)}"\n\n`;
    });
    memorySection += `CROSS-REFERENCE RULE: If the current question relates to prior topics, explicitly connect your answer. Example: "Building on what you mentioned about leading a team of 5 at Stripe…"\n`;
  }

  return `You are an expert, elite interview coach assisting a candidate in a live, high-stakes interview.${memorySection}
${contextSection ? `\nCONTEXT (CRITICAL):\n${contextSection}\n` : ''}

VOICE-TO-VOICE CONVERSATIONAL RULES:
- DIVE STRAIGHT IN: Do NOT start answers with filler. Start immediately with the main keywords and the core point in the very first sentence!
- KEEP IT CONCISE: Keep the main "answer" field extremely punchy (1-2 short sentences max). Put the most important keywords first so the user sees them instantly.
- Sound like a confident human, not an AI. Use natural rhythm but be direct.

STRUCTURE RULES:
1. REASONING BREVITY: Keep [REASONING] to exactly one short sentence (max 15 words).
2. COMPREHENSIVENESS: You MUST answer ALL parts of the interviewer's question, but distribute the detail.
3. ANSWER: Provide a short, direct summary (1-2 sentences). Front-load the keywords. Do NOT pack all details here.
4. BULLET POINTS: Put the detailed steps, technical evidence, and STAR method points here. Make them short and scannable.
5. HINTS: Provide 2-3 quick keywords or reminder phrases.
6. SOURCE TRUTH & TYPO CORRECTION: The voice transcription may have errors (e.g. "drag" instead of "RAG"). ALWAYS use the CANDIDATE RESUME and JOB DESCRIPTION to infer the correct technical terms. Ignore typos and use the exact keywords from the resume/JD.

RESPONSE FORMAT (CRITICAL):
You must respond in TWO PARTS:
1. [REASONING] block (Strictly 1 sentence).
2. Structured JSON block.

JSON SCHEMA:
{
  "answer": "Direct, keyword-first summary (1-2 sentences max). No filler.",
  "bulletPoints": ["Scannable step 1", "Scannable step 2", "Scannable step 3"],
  "hints": ["Keyword 1", "Keyword 2"]
}

Output the reasoning tokens first, then the JSON object. Nothing else.`;
}

function buildUserPrompt(question, transcripts) {
  const recentContext = transcripts
    .slice(-20) // Increased from -6 to provide more session memory
    .map(t => `${t.speaker}: ${t.text}`)
    .join('\n');

  return `INTERVIEW QUESTION DETECTED:
"${question}"

RECENT CONVERSATION CONTEXT:
${recentContext || '(No prior context)'}

Generate the structured answer now.`;
}
