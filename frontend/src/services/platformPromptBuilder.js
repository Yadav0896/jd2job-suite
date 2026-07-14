/**
 * platformPromptBuilder - Shared LLM prompt dispatch for all three verticals.
 * Routes to the correct prompt builder based on platformMode.
 */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DEEPSEEK_URL = `${API_BASE}/api/deepseek/chat`;
const MODEL = 'deepseek-chat';

/* ── Conversational rules applied to ALL verticals ───────────────────── */
const CONVERSATIONAL_RULES = `
CRITICAL TONE & FORMAT RULES (HUMAN-LIKE CONVERSATIONAL FLOW):
- SPEAK LIKE A HUMAN DEV: Write exactly how a senior engineer explains concepts casually in a live interview or discussion. Keep the tone natural, professional, and conversational.
- ADAPTIVE DETAIL (DO NOT OVER-ANSWER OR UNDER-ANSWER):
  1. For simple greetings, audio checks, or brief transition statements (e.g. "Can you hear me?", "Tell me when you're ready", "Hello", "How is your day?"), keep the response to a single, warm conversational sentence. Do not generate technical points.
  2. For concise direct questions, write a 2-3 sentence answer.
  3. For complex technical or design questions, write a rich, multi-sentence technical explanation.
- NO REPETITIVE FILLERS: Do NOT overuse or repeat conversational fillers (like "Honestly", "To be honest", "To be fair", "In my experience") in every paragraph or response. Use varied, subtle transitions only when they naturally fit.
- USE CONTRACTIONS: Always use contractions (I'd, we'll, it's, don't, we're, shouldn't) to sound natural and relaxed.
- NO ROBOTIC/TEXTBOOK FORMULATION: Avoid dry definitions or explaining concepts like an encyclopedia. Instead of "React.memo is a performance optimization tool", say "I usually reach for React.memo to keep those heavy components from re-rendering for no reason."
- NO AI/TEXTBOOK PHRASES: Never use robotic phrases like "Certainly!", "Great question!", "To summarize", "In conclusion", "As an AI", "It is worth noting", "Firstly/Secondly/Finally".
- TELEPROMPTER SCRIPT FORMAT: Bold key phrases (like **virtualization** or **React.memo**) inside the answer so the candidate can scan it instantly while speaking, but keep the words flowing naturally.
- The "bulletPoints" field = 3-5 informal talking points or quick notes. Start each with a **bolded key term** followed by a colon and a quick, casual explanation.
- YOU MUST RETURN A VALID JSON OBJECT EXACTLY MATCHING THE SPECIFIED FORMAT.
`;

const CURRENT_WORLD_FACTS_2026 = `
IMPORTANT FACTUAL REFERENCE (YEAR 2026):
- Current Year: 2026
- Prime Minister of India: Narendra Modi
- President of India: Droupadi Murmu
- Chief Minister of Andhra Pradesh: N. Chandrababu Naidu (assumed office June 2024)
- Chief Minister of Karnataka: Siddaramaiah (assumed office May 2023)
- Chief Minister of Tamil Nadu: M. K. Stalin (assumed office May 2021)
- Chief Minister of Telangana: A. Revanth Reddy (assumed office Dec 2023)
- Chief Minister of Maharashtra: Eknath Shinde (since 2022) / Devendra Fadnavis
- Chief Minister of Kerala: Pinarayi Vijayan
- Chief Minister of Delhi: Atishi Marlena (since Sept 2024)
- Chief Minister of West Bengal: Mamata Banerjee
- Chief Minister of Uttar Pradesh: Yogi Adityanath
`;
/* ── Memory context builder ──────────────────────────────────────────────── */
function buildMemoryContext(conversationMemory, speedMode = false) {
  if (!conversationMemory) return '';
  
  const { questionsAndAnswers = [], userStatements = [], keyFacts = [] } = conversationMemory;
  
  if (questionsAndAnswers.length === 0) return '';
  
  // In speed mode, only include the last 2 Q&As (faster prompt = faster inference)
  const qasToInclude = speedMode ? questionsAndAnswers.slice(-2) : questionsAndAnswers;
  
  let memory = '\n── CONVERSATION MEMORY (Previous Q&A in this session) ──\n';
  memory += `The candidate has already answered ${qasToInclude.length} question(s).\n`;
  memory += 'IMPORTANT: Reference these previous answers when relevant. If the current question relates to something already discussed, connect your answer to their prior experience.\n\n';
  
  qasToInclude.forEach((qa, i) => {
    memory += `Q${i + 1}: "${qa.question?.substring(0, speedMode ? 60 : 100)}"\n`;
    memory += `A${i + 1}: "${qa.answer?.substring(0, speedMode ? 100 : 200)}"\n\n`;
  });
  
  if (keyFacts.length > 0 && !speedMode) {
    memory += 'KEY FACTS (from answers):\n';
    keyFacts.forEach(f => { memory += `  • ${f}\n`; });
    memory += '\n';
  }
  
  if (userStatements.length > 0 && !speedMode) {
    memory += 'RECENT USER STATEMENTS:\n';
    userStatements.slice(-2).forEach(s => { memory += `  • ${s.text?.substring(0, 200)}\n`; });
    memory += '\n';
  }
  
  memory += 'CROSS-REFERENCE RULE: If the current question touches on topics already discussed, explicitly connect your answer to what the candidate shared earlier.\n';
  
  return memory;
}

function buildTranscriptContext(transcripts, selectedModel) {
  if (!transcripts || transcripts.length === 0) return '';
  
  let context = '\n── RECENT TRANSCRIPT HISTORY (Back-and-forth conversation) ──\n';
  // Include last 5 utterances in fast mode, 20 in default mode
  const limit = selectedModel === 'llama_fast' ? -5 : -20;
  const recent = transcripts.slice(limit);
  recent.forEach(t => {
    context += `[${t.speaker}]: ${t.text}\n`;
  });
  return context + '\n';
}

/**
 * Build sales coaching prompt with pre-call research context.
 */
function buildSalesPrompt({ question, transcripts, salesConfig, salesState, conversationMemory, speedMode, selectedModel }) {
  const briefing = salesConfig?.briefingData || {};
  const methodology = salesConfig?.methodology || 'SPIN';

  const briefingContext = briefing?.companySummary
    ? `\nPRE-CALL RESEARCH:\nCompany: ${briefing.company || ''}\nOverview: ${briefing.companySummary || ''}\nIndustry: ${briefing.industry || ''}\nPain Points: ${(briefing.painPoints || []).join(', ')}\nPredicted Objections: ${(briefing.objections || []).map(o => o?.objection || o).join(', ')}\nDiscovery Questions: ${(briefing.discoveryQuestions || []).map(q => q?.question || q).join(', ')}`
    : '';

  return `You are an expert ${methodology} sales coach helping a rep in a live sales call.${CONVERSATIONAL_RULES}${buildMemoryContext(conversationMemory, speedMode)}${buildTranscriptContext(transcripts, selectedModel)}
${briefingContext}

Client: ${salesConfig?.clientName || ''}, ${salesConfig?.clientRole || ''} at ${salesConfig?.company || ''}
Deal Context: ${salesConfig?.dealContext || ''}
 
DETECTION RULES:
- If the prospect raises an objection, classify it and provide 3 response options: COUNTER, REFRAME, DEFER
- If the prospect shows buying intent, suggest the next action
- If a competitor is mentioned, provide differentiators
- If discussing pricing, provide negotiation tactics
 
OUTPUT FORMAT:
Return JSON:
{
  "detection": "OBJECTION" | "BUYING_SIGNAL" | "COMPETITOR" | "PRICING" | "QUESTION",
  "summary": "One line insight",
  "answer": "What to say — write this as 2-3 short conversational bullet points starting with a dash '-', as the rep would speak it aloud, with natural pacing",
  "options": ["Option 1", "Option 2", "Option 3"],
  "bulletPoints": ["Key point 1", "Key point 2"],
  "hints": ["Hint 1"]
}`;
}

/**
 * Build meeting intelligence prompt.
 */
function buildMeetingPrompt({ question, transcripts, meetingConfig, meetingState, conversationMemory, speedMode, selectedModel }) {
  const meetingType = meetingConfig?.meetingType || 'technical_review';
  const agenda = meetingConfig?.agenda || '';
  const projectContext = meetingConfig?.projectContext || '';

  return `You are an expert meeting facilitator and technical advisor in a ${meetingType} meeting.${CONVERSATIONAL_RULES}${buildMemoryContext(conversationMemory, speedMode)}${buildTranscriptContext(transcripts, selectedModel)}
${agenda ? `\nAGENDA: ${agenda}` : ''}
${projectContext ? `\nPROJECT CONTEXT: ${projectContext}` : ''}
 
DETECTION RULES:
- If discussing requirements, check against standard checklist (scalability, security, latency, cost, compliance) and flag gaps
- If a technical claim is made, validate against industry standards
- If a decision is being made, capture it with rationale
- If an action item emerges, extract it with suggested assignee
- If the conversation contradicts an earlier statement, flag it
 
OUTPUT FORMAT:
Return JSON:
{
  "detection": "REQUIREMENT_GAP" | "ACTION_ITEM" | "DECISION" | "CONTRADICTION" | "QUESTION_SUGGESTION",
  "summary": "One line insight",
  "answer": "Suggestion or action item — write this as 2-3 short conversational bullet points starting with a dash '-', as you would say it in the meeting, with natural pacing",
  "bulletPoints": ["Detail 1", "Detail 2"],
  "hints": ["Question to ask", "Risk to highlight"],
  "actionItem": { "text": "", "suggestedAssignee": "", "priority": "high|medium|low" }
}`;
}

/**
 * Build interview prompt.
 */
function buildInterviewPrompt({ question, transcripts, resumeData, jobDescription, conversationMemory, speedMode, selectedModel, tonePreference = 'confident', companyEnrichment = null }) {
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let resumeText = resumeData || '';
  if (typeof resumeText === 'object') resumeText = JSON.stringify(resumeText);
  resumeText = speedMode ? resumeText.substring(0, 2000) : resumeText.substring(0, 10000);

  let jdText = jobDescription || '';
  if (typeof jdText === 'object') jdText = JSON.stringify(jdText);
  jdText = speedMode ? jdText.substring(0, 2000) : jdText.substring(0, 10000);

  let toneInstruction = '';
  if (tonePreference === 'technical') {
    toneInstruction = '\nTONE INSTRUCTION: Speak with extreme technical depth, mentioning specific libraries, APIs, architectural patterns, and engineering trade-offs. Be precise and detail-oriented.\n';
  } else if (tonePreference === 'concise') {
    toneInstruction = '\nTONE INSTRUCTION: Speak with extreme brevity. Get straight to the point. Keep answers and bullet points ultra-short, simple, and direct. Avoid any conversational filler.\n';
  } else {
    toneInstruction = '\nTONE INSTRUCTION: Speak with confidence and assertiveness. Focus on framing achievements with high impact and leadership qualities. Do NOT repeat conversational fillers like "Honestly" or "In my experience" excessively.\n';
  }

  let companyContext = '';
  if (companyEnrichment) {
    companyContext = `\n── TARGET COMPANY CONTEXT ──\nTarget Company: ${companyEnrichment.companyName || ''}\nCompany Context/Stack details: ${JSON.stringify(companyEnrichment)}\nInclude these details/stack alignment in the response when answering.\n`;
  }

  return `You are a real-time interview coach. The candidate reads your output ON SCREEN while speaking live in an interview.
CURRENT DATE: ${currentDate}

${CURRENT_WORLD_FACTS_2026}

${CONVERSATIONAL_RULES}${buildMemoryContext(conversationMemory, speedMode)}${buildTranscriptContext(transcripts, selectedModel)}
${resumeText ? `CANDIDATE RESUME:\n${resumeText}` : ''}
${jdText ? `JOB DESCRIPTION:\n${jdText}` : ''}
${toneInstruction}
${companyContext}

OUTPUT STRUCTURE — FOLLOW EXACTLY:
1. "answer" = Spoken narrative structured as a natural, conversational response that directly answers what the interviewer is asking.
   - If the interviewer is checking audio, greeting, or making a passing/meta statement (e.g. "Can you hear me?", "Hello", "How is your day?", "I'm ready"), keep the answer to a single natural, warm conversational sentence. Do NOT list bullet points or technical points.
   - If the question is technical or design-oriented, write it as 2-4 conversational bullet points (each starting with a dash '-') so the candidate can read them smoothly.
2. "bulletPoints" = 3-5 scannable elaboration bullets detailing how to backup the answer. Keep them short, detailed, and clear.
3. "hints" = 2-3 raw keywords/concepts the candidate should mention while speaking.

RULES:
- INTERVIEWER EXPECTATIONS: Carefully analyze what the interviewer is asking and expecting. If they are expecting a brief answer, keep the "answer" field short. If they expect a detailed breakdown (e.g. system design or deep architectural trade-offs), match that depth fully.
- GENERAL & EXTERNAL QUESTIONS: If the interviewer asks a general knowledge, situational, or organizational question (e.g. "Who is your CM?", "Who is the CEO?", "What is the capital?", or current affairs), answer it directly and factually. Do NOT try to map it back to the candidate's technical resume or force a first-person coding story. Keep it conversational but accurate. Note that "CM" most commonly refers to "Chief Minister" (e.g. current CM of Karnataka is Siddaramaiah, who took office in May 2023; the year is now 2026) or "Configuration Manager" depending on conversational context. Ensure factual officeholders are up-to-date as of 2026.
- NO DICTIONARY DEFINITIONS: Always write from the first-person perspective ("What I usually do...", "In my past projects, I...", "Honestly, I'd recommend...") as if you are sharing personal experience, rather than writing a guide.
- For behavioral questions ("Tell me about a time..."), the answer = one strong opening line of the story. BulletPoints = S, T, A, R points.
- TYPO FIX: Voice transcription may mishear words (e.g. "drag" = "RAG"). Use context + resume to correct.
- Answer ALL parts if they ask multiple questions.
- Do NOT add any text before or after the JSON.

Respond ONLY with valid JSON:
{
  "answer": "A spoken narrative (either a concise, natural sentence OR conversational bullet points starting with a dash '-' if the question demands depth)",
  "bulletPoints": ["**Term 1**: detailed explanation", "**Term 2**: detailed explanation", "**Term 3**: detailed explanation"],
  "hints": ["keyword1", "keyword2", "keyword3"]
}`;
}

/**
 * Main streaming function — dispatches to correct prompt builder.
 */
export async function* streamPlatformAnswer({
  platformMode,
  question,
  transcripts = [],
  resumeData = null,
  jobDescription = null,
  salesConfig = null,
  salesState = null,
  meetingConfig = null,
  meetingState = null,
  conversationMemory = null,
  speedMode = false,
  llmProvider = 'nvidia',
  llmModel = 'meta/llama-3.1-8b-instruct',
  selectedModel = 'default',
  abortSignal = null,
  tonePreference = 'confident',
  companyEnrichment = null,
}) {
  let systemPrompt = '';
  let userPrompt = '';

  const truncatedQuestion = typeof question === 'string' ? question.substring(0, 4000) : '';

  switch (platformMode) {
    case 'sales':
      systemPrompt = buildSalesPrompt({ question: truncatedQuestion, transcripts, salesConfig, salesState, conversationMemory, speedMode });
      userPrompt = `Latest prospect statement/question: "${truncatedQuestion}"\n\nGenerate coaching suggestion now.`;
      break;
    case 'meeting':
      systemPrompt = buildMeetingPrompt({ question: truncatedQuestion, transcripts, meetingConfig, meetingState, conversationMemory, speedMode });
      userPrompt = `Latest discussion point: "${truncatedQuestion}"\n\nGenerate meeting intelligence now.`;
      break;
    default:
      systemPrompt = buildInterviewPrompt({ 
        question: truncatedQuestion, 
        transcripts, 
        resumeData, 
        jobDescription, 
        conversationMemory, 
        speedMode, 
        selectedModel,
        tonePreference,
        companyEnrichment
      });
      userPrompt = `INTERVIEW QUESTION: "${truncatedQuestion}"\nGenerate structured answer now.`;
      break;
  }

  const headers = { 'Content-Type': 'application/json' };
  try {
    const { getSession } = await import('./supabaseClient');
    const session = await getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch { /* auth header optional */ }

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

  const response = await fetchWithRetry(DEEPSEEK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: llmProvider,
      model: llmModel,
      selectedModel: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.4,
      top_p: 0.9,
      stream: true,
      ...(llmModel !== 'deepseek-reasoner' && { response_format: { type: 'json_object' } })
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`DeepSeek API error ${response.status}: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          yield { type: 'done', parsed: parsePlatformAnswer(fullText) };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content ?? '';
          if (token) {
            fullText += token;
            yield { type: 'token', token, fullText };
          }
        } catch { /* skip malformed JSON frames */ }
      }
    }

    yield { type: 'done', parsed: parsePlatformAnswer(fullText) };
  } catch (err) {
    if (err.name === 'AbortError') {
      yield { type: 'aborted' };
    } else {
      throw err;
    }
  }
}

function parsePlatformAnswer(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const rawJson = jsonMatch[0];
    try {
      // First try parsing directly (formatted JSON is valid whitespace)
      const parsed = JSON.parse(rawJson);
      return {
        answer: parsed.answer || '',
        bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
        hints: Array.isArray(parsed.hints) ? parsed.hints : [],
        detection: parsed.detection || '',
        summary: parsed.summary || '',
        options: parsed.options || [],
        actionItem: parsed.actionItem || null,
      };
    } catch (directError) {
      try {
        // Safe sanitization: replace literal newlines only inside string values
        let sanitizedJson = rawJson
          .replace(/(?<!\\)\n(?!([^"]*"[^"]*")*[^"]*$)/g, '\\n')
          .replace(/(?<!\\)\r(?!([^"]*"[^"]*")*[^"]*$)/g, '\\r')
          .replace(/(?<!\\)\t(?!([^"]*"[^"]*")*[^"]*$)/g, '\\t');
          
        const parsed = JSON.parse(sanitizedJson);
        return {
          answer: parsed.answer || '',
          bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
          hints: Array.isArray(parsed.hints) ? parsed.hints : [],
          detection: parsed.detection || '',
          summary: parsed.summary || '',
          options: parsed.options || [],
          actionItem: parsed.actionItem || null,
        };
      } catch (sanitizedError) {
        console.warn("JSON Parse failed for LLM output, using regex fallback.", sanitizedError);
      }
    }
  }

  // Robust Regex Fallback (extracts fields directly from raw text if JSON is malformed/incomplete/truncated)
  let fallbackAnswer = '';
  let bulletPoints = [];
  let hints = [];

  // Try extracting fields using regex first
  let answerMatch = text.match(/"answer"\s*:\s*"([\s\S]*?)"\s*(?:,|})/);
  if (answerMatch) {
    fallbackAnswer = answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  const bulletsMatch = text.match(/"bulletPoints"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (bulletsMatch) {
    const rawBullets = bulletsMatch[1].match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
    if (rawBullets) {
      bulletPoints = rawBullets.map(b => b.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n'));
    }
  }

  const hintsMatch = text.match(/"hints"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (hintsMatch) {
    const rawHints = hintsMatch[1].match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
    if (rawHints) {
      hints = rawHints.map(h => h.slice(1, -1).replace(/\\"/g, '"'));
    }
  }

  // If we could not extract anything using JSON-like regex, then treat the entire response as plain text
  if (!fallbackAnswer && bulletPoints.length === 0) {
    fallbackAnswer = text.trim();
  }

  // Parse bullet points from plain text if we don't have any yet
  if (bulletPoints.length === 0) {
    const lines = fallbackAnswer.split('\n');
    const cleanAnswerLines = [];
    const extractedBullets = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Match markdown bullets: - point, * point, • point, or numbered list e.g., 1. point
      const bulletMatch = trimmedLine.match(/^[-*•]\s*(.*)/) || trimmedLine.match(/^\d+\.\s*(.*)/);
      if (bulletMatch) {
        extractedBullets.push(bulletMatch[1].trim());
      } else {
        if (extractedBullets.length === 0) {
          cleanAnswerLines.push(line);
        } else if (trimmedLine !== '') {
          if (extractedBullets.length > 0) {
            extractedBullets[extractedBullets.length - 1] += ' ' + trimmedLine;
          }
        }
      }
    }
    
    if (extractedBullets.length > 0) {
      fallbackAnswer = cleanAnswerLines.join('\n').trim();
      bulletPoints = extractedBullets;
    }
  }

  return {
    answer: fallbackAnswer.trim(),
    bulletPoints,
    hints,
    detection: '',
  };
}
