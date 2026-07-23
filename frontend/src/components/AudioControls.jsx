import { useRef, useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  DeepgramTranscriber,
  getMicStream,
  getDisplayStream,
  getAudioOnlyStream,
} from '../services/deepgramService';
import { streamPlatformAnswer } from '../services/platformPromptBuilder';
import { captureFrameAndExtract } from '../services/screenReader';
import {
  createSession,
  endSession,
  saveTranscript as saveTranscriptToDB,
  saveAnswer as saveAnswerToDB,
  getProfile,
  deductCredits,
} from '../services/supabaseService';

const isElectron = navigator.userAgent.toLowerCase().includes('electron');

/* ── Question detection ─────────────────────────────────────────────────── */
function isQuestion(text) {
  if (!text || !text.trim()) return false;
  return text.trim().split(' ').length > 1;
}

/* ── Sales signal detection ─────────────────────────────────────────────── */
function isSalesTrigger(text) {
  if (!text.trim()) return false;
  const low = text.toLowerCase();
  const triggers = [
    'pricing', 'cost', 'budget', 'expensive', 'cheap',
    'competitor', 'alternative', 'other option', 'compare',
    'not sure', 'concern', 'worried', 'risk', 'problem',
    'timeline', 'deadline', 'urgency', 'when can',
    'decision', 'approve', 'legal', 'security', 'compliance',
    'how does', 'what about', 'demo', 'trial', 'pilot',
    'objection', 'maybe', 'think about', 'call back'
  ];
  return triggers.some(t => low.includes(t)) && text.split(' ').length > 2;
}

/* ── Meeting trigger detection ──────────────────────────────────────────── */
function isMeetingTrigger(text) {
  if (!text.trim()) return false;
  return text.split(' ').length > 4;
}

/* ── Platform-aware trigger ─────────────────────────────────────────────── */
function shouldTrigger(text, platformMode) {
  if (!text || text.trim().split(' ').length <= 2) return false;
  return true;
}

/* ── Technical Dictionary & Echo Suppression ────────────────────────────── */
function correctTechnicalTerms(text) {
  if (!text) return "";
  let corrected = text;
  const replacements = [
    { regex: /\bnext\s+jazz\b/gi, replacement: "Next.js" },
    { regex: /\bnextjs\b/gi, replacement: "Next.js" },
    { regex: /\bnode\s+js\b/gi, replacement: "Node.js" },
    { regex: /\breact\s+js\b/gi, replacement: "React" },
    { regex: /\bcooper\s+netty\b/gi, replacement: "Kubernetes" },
    { regex: /\bcooper\s+netis\b/gi, replacement: "Kubernetes" },
    { regex: /\bchat\s+gpt\b/gi, replacement: "ChatGPT" },
    { regex: /\bsupa\s+base\b/gi, replacement: "Supabase" },
    { regex: /\bdrag\b/gi, replacement: "RAG" },
    { regex: /\bhoops\b/gi, replacement: "Hooks" }
  ];
  replacements.forEach(({ regex, replacement }) => {
    corrected = corrected.replace(regex, replacement);
  });
  return corrected;
}

function isEchoDuplicate(text, speaker, transcripts) {
  if (!text) return false;
  const cleanText = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  if (cleanText.length < 4) return false; // skip short fillers like "yes", "no"
  
  const now = Date.now();
  const oppositeSpeaker = speaker === 'You' ? 'Interviewer' : 'You';
  
  const recentMatches = (transcripts || [])
    .filter(t => t.speaker === oppositeSpeaker && (now - t.timestamp) < 3000);
    
  for (const match of recentMatches) {
    const cleanMatch = match.text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    if (cleanMatch.includes(cleanText) || cleanText.includes(cleanMatch)) {
      console.log(`[AudioControls] Suppressing echo duplicate for ${speaker}: "${text}" matched "${match.text}"`);
      return true;
    }
  }
  return false;
}

/* ── Component ──────────────────────────────────────────────────────────── */
export default function AudioControls() {
  const { state, dispatch, displayStreamRef } = useApp();
  const {
    isRecording, isMicOn, isSystemAudioOn, audioStatus,
    connectionStatus, error, isThinking, latencyMetrics,
    apiKeys, isReadingScreen, jobDescription, manualTriggerCount
  } = state;

  const platformMode = state.platformMode;
  const salesConfig = state.salesConfig;
  const meetingConfig = state.meetingConfig;

  const [volume, setVolume] = useState(0);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [isStarting, setIsStarting] = useState(false);

  // ── Backend Health Check ────────────────────────────────────────────────
  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) setBackendStatus('online');
        else setBackendStatus('offline');
      } catch (err) {
        setBackendStatus('offline');
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  /* ── Refs (stable across re-renders) ─────────────────────────────────── */
  const micTranscriberRef    = useRef(null);
  const sysTranscriberRef    = useRef(null);
  const mixedStreamRef       = useRef(null); // Mixed audio stream
  const isGeneratingRef      = useRef(false);
  const sessionIdRef         = useRef(null); // Current Supabase session ID
  const canvasRef            = useRef(null); // Real-time volume canvas visualizer

  // Mirror volatile state into refs so closures always see current values
  const apiKeysRef           = useRef(apiKeys);
  const transcriptsRef       = useRef(state.transcripts);
  const resumeDataRef        = useRef(state.resumeData);
  const jobDescriptionRef    = useRef(state.jobDescription);
  const conversationMemoryRef = useRef(state.conversationMemory);
  
  const questionBufferRef    = useRef([]); // Buffers interviewer speech
  const triggerTimeoutRef    = useRef(null); // For debouncing the AI trigger
  const abortControllerRef   = useRef(null); // Cancel stale LLM calls
  const progressiveTimerRef  = useRef(null); // Progressive trigger timer
  const lastTriggeredQuestionRef = useRef(''); // Tracks last question triggered
  const sessionLimitTimerRef = useRef(null); // 40-minute session duration timer
  const limitMinutesRef      = useRef(40); // Dynamically set based on plan (10 min trial, 40 min paid)

  useEffect(() => { apiKeysRef.current      = apiKeys;           }, [apiKeys]);
  useEffect(() => { transcriptsRef.current  = state.transcripts; }, [state.transcripts]);
  useEffect(() => { resumeDataRef.current   = state.resumeData;  }, [state.resumeData]);
  useEffect(() => { jobDescriptionRef.current = state.jobDescription; }, [state.jobDescription]);
  useEffect(() => { conversationMemoryRef.current = state.conversationMemory; }, [state.conversationMemory]);

  // Handle real-time volume visualization
  useEffect(() => {
    let rafId;
    const updateVolume = () => {
      if (micTranscriberRef.current) {
        setVolume(micTranscriberRef.current.getVolume());
      } else {
        setVolume(0);
      }
      rafId = requestAnimationFrame(updateVolume);
    };
    if (isRecording) {
      updateVolume();
    } else {
      setVolume(0);
    }
    return () => cancelAnimationFrame(rafId);
  }, [isRecording]);

  // Real-time glowing frequency bar canvas visualizer loop
  useEffect(() => {
    if (!isRecording) return;
    
    let rafId;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);

      let dataArray = new Uint8Array(0);
      if (micTranscriberRef.current?.analyser) {
        const analyser = micTranscriberRef.current.analyser;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
      }

      const barWidth = 3;
      const gap = 2;
      const numBars = Math.floor(width / (barWidth + gap));
      
      for (let i = 0; i < numBars; i++) {
        // Safe read from array, default to very small baseline
        const value = dataArray[i] || 0;
        const percent = value / 255;
        // Map heights with a gentle baseline so visualizer feels alive
        const barHeight = Math.max(3, percent * height * 0.9);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#34d399'); // Light emerald
        gradient.addColorStop(1, '#10b981'); // Emerald green

        ctx.fillStyle = gradient;
        ctx.beginPath();
        // Support rounded visualizer bars with fallback for older browsers
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barWidth, barHeight, 1.5);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }
      
      rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [isRecording]);

  // Sync mic track enabled state with isMicOn
  useEffect(() => {
    if (micTranscriberRef.current?.stream) {
      micTranscriberRef.current.stream.getAudioTracks().forEach(t => {
        t.enabled = isMicOn;
        console.log(`Mic track ${t.label} enabled: ${t.enabled}`);
      });
    }
  }, [isMicOn, isRecording]);

  /* ── DeepSeek answer generation (abort-aware, speed-first) ──────────────── */
  const triggerDeepseekAnswer = useCallback(async (question, signal) => {
    if (!question.trim()) return;
    
    // Skip duplicate calls for the exact same aggregated question
    if (lastTriggeredQuestionRef.current === question.trim()) {
      console.log('[AudioControls] Question already triggered, skipping duplicate call:', question);
      return;
    }
    lastTriggeredQuestionRef.current = question.trim();

    // Cancel any in-flight call
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const combinedSignal = signal 
      ? AbortSignal.any?.([signal, controller.signal]) ?? controller.signal
      : controller.signal;
    
    const llmStart = performance.now();
    const sttStart = llmStart; // Track full pipeline latency

    dispatch({ type: 'SET_THINKING',          payload: true });
    dispatch({ type: 'SET_QUESTION_DETECTED', payload: true });
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: { deepseek: 'connected' } });
    dispatch({ type: 'SET_SPEED_METRICS',     payload: { totalLatency: 0, sttLatency: 0, llmLatency: 0 } });

    try {
      // Check if aborted before starting
      if (combinedSignal.aborted) throw new DOMException('Aborted', 'AbortError');

      if (backendStatus === 'offline') {
        // Run mock fallback streaming!
        console.log('[AudioControls] Backend offline: initiating offline smart fallback.');
        
        let answerText = "Here's my take on this — let me walk you through it. First, acknowledge the core technical problem, then I'd lay out a structured 3-part action plan, and finally highlight the quantifiable developer impact.";
        let bulletPoints = ["Acknowledge the core technical context", "Present a structured 3-part plan", "State quantifiable developer impact"];
        let hints = ["Structure with STAR framework", "Use clear, concise sentences"];

        const qLower = question.toLowerCase();
        if (qLower.includes("yourself") || qLower.includes("introduction") || qLower.includes("intro")) {
          answerText = "Thanks for having me! So, I'm a frontend developer with about 5 years under my belt, and I really specialize in building highly responsive React applications. Actually, a highlight from my recent work — I led the development of Stripe's new dashboard, and we managed to achieve a 30% speedup in render times, which was pretty exciting.";
          bulletPoints = ["5+ years React experience", "Led Stripe dashboard development", "Specialist in app performance & UX"];
          hints = ["Structure with STAR or chronologically", "Highlight impact (30% speedup)"];
        } else if (qLower.includes("performance") || qLower.includes("10,000") || qLower.includes("optimize") || qLower.includes("lagging")) {
          answerText = "Great question. So, when you're dealing with 10,000 items — the main culprit is usually DOM node count and unnecessary virtual DOM diffing, right? Here's what I'd do: First, I'd implement list virtualization using something like `react-window` so we're only rendering what's actually in the viewport. Then I'd wrap individual items in `React.memo` and use `useMemo` for any heavy sorting or filtering. That combo usually solves it.";
          bulletPoints = ["Use list virtualization (react-window)", "Wrap individual items in React.memo", "Avoid inline event handlers in list items"];
          hints = ["Mention virtual DOM diffing cost", "Explain prop equality check"];
        } else if (qLower.includes("state") || qLower.includes("redux") || qLower.includes("context") || qLower.includes("zustand")) {
          answerText = "I've worked across all three, and honestly, it really depends on the use case. For global but low-frequency stuff — themes, auth, that kind of thing — React Context works great, super simple. But for complex, massive data flows where you need devtools and predictability, Redux is still solid. That said, lately I've been reaching for Zustand more — it's lightweight, no boilerplate, and honestly has better performance for most modern apps.";
          bulletPoints = ["Use React Context for low-frequency updates", "Use Zustand for lightweight atomic state", "Use Redux for highly complex workflows"];
          hints = ["Compare re-render performance", "Explain boilerplate overhead"];
        } else if (qLower.includes("conflict") || qLower.includes("disagreement") || qLower.includes("team")) {
          answerText = "Yeah, I've been there! So we had this situation where a teammate was pushing for CSS-in-JS, and I was advocating for CSS Modules. Rather than going back and forth, I just said — let's benchmark it. I set up a Lighthouse comparison, and it turned out CSS Modules was about 40% faster in time-to-interactive. Seeing the data, we both agreed. No ego, just metrics.";
          bulletPoints = ["Disagreement on styling frameworks", "Set up interactive performance benchmark", "Collaboratively aligned using concrete data"];
          hints = ["Emphasize data over opinion", "Maintain respect and professional alignment"];
        } else if (qLower.includes("real-time") || qLower.includes("collaborative") || qLower.includes("docs")) {
          answerText = "Alright, so for real-time collaboration like Google Docs — from the frontend side, I'd start with a WebSocket connection for bi-directional sync. The interesting part is conflict resolution. I'd lean toward Operational Transformation or CRDTs to make sure concurrent edits don't clash. On the client, I'd debounce state sync pretty aggressively to keep the network happy. The key is making it feel instant to the user.";
          bulletPoints = ["Establish bidirectional WebSockets", "Implement CRDT or OT for conflict resolution", "Debounce and queue user input events"];
          hints = ["Explain latency mitigation techniques", "Compare OT vs CRDT"];
        } else if (qLower.includes("questions") || qLower.includes("do you have")) {
          answerText = "Yes, definitely! I'd love to know — what's the biggest engineering challenge the team is tackling right now? And how do you measure engineering success and developer velocity here? Those would really help me understand where I could contribute.";
          bulletPoints = ["Inquire about active engineering hurdles", "Ask how success/velocity is measured", "Showcase passion for contributing to high-quality codebases"];
          hints = ["Ask open-ended and thoughtful questions", "Express enthusiasm for the team's mission"];
        }

        dispatch({ type: 'SET_PARTIAL_ANSWER', payload: answerText });
        
        // Show structured answers immediately with a brief 300ms transition delay
        setTimeout(() => {
          const llmLatency = 0.3;
          dispatch({ type: 'SET_LATENCY_METRICS', payload: { llmLatency } });
          dispatch({ 
            type: 'SET_ANSWER', 
            payload: {
              answer: answerText,
              bulletPoints,
              hints: hints.join('\n')
            }
          });
          
          // Conversation memory for offline path
          dispatch({ 
            type: 'ADD_QA_PAIR', 
            payload: { question, answer: answerText, topics: bulletPoints }
          });
          
          dispatch({ type: 'SET_THINKING', payload: false });
          dispatch({ type: 'SET_CONNECTION_STATUS', payload: { deepseek: 'connecting' } });
          isGeneratingRef.current = false;
        }, 300);

        return; 
      }

      const gen = streamPlatformAnswer({
        platformMode,
        question,
        transcripts: transcriptsRef.current,
        resumeData: resumeDataRef.current,
        jobDescription: jobDescriptionRef.current,
        salesConfig,
        salesState: state.salesState,
        meetingConfig,
        meetingState: state.meetingState,
        conversationMemory: conversationMemoryRef.current,
        speedMode: state.speedMode,
        answerMode: state.answerMode,
        llmProvider: state.llmProvider,
        llmModel: state.llmModel,
        selectedModel: state.selectedModel,
        abortSignal: combinedSignal,
        tonePreference: state.tonePreference,
        companyEnrichment: state.companyEnrichment,
        assignmentDocs: state.assignmentDocs,
      });

      let lastDispatchTime = 0;
      for await (const chunk of gen) {
        if (combinedSignal.aborted) break;
        if (chunk.type === 'token') {
          if (chunk.token) {
            const now = performance.now();
            if (now - lastDispatchTime > 30) {
              let cleanText = chunk.fullText
                .replace(/^\{\s*(?:"answer"\s*:\s*")?/, '')
                .replace(/^"bulletPoints"\s*:\s*\[\s*"/, '- ')
                .replace(/",\s*"bulletPoints"\s*:\s*\[\s*"/g, '\n\n- ')
                .replace(/",\s*"/g, '\n- ')
                .replace(/",\s*"hints".*$/s, '')
                .replace(/\\n/g, '\n')
                .replace(/\\"/g, '"');
                
              dispatch({ type: 'SET_PARTIAL_ANSWER', payload: cleanText });
              lastDispatchTime = now;
            }
          }
        } else if (chunk.type === 'aborted') {
          // Stale call cancelled — don't dispatch, don't error
          console.log('[AudioControls] LLM call aborted (new speech arrived)');
          return;
        } else if (chunk.type === 'done') {
          if (combinedSignal.aborted) break;
          
          const llmLatency = (performance.now() - llmStart) / 1000;
          const totalLatency = (performance.now() - sttStart) / 1000;
          dispatch({ type: 'SET_LATENCY_METRICS', payload: { llmLatency } });
          dispatch({ type: 'SET_SPEED_METRICS',   payload: { llmLatency, totalLatency } });
          
          const parsed = chunk.parsed || {};
          dispatch({ type: 'SET_ANSWER', payload: parsed });

          // Save answer to DB
          if (sessionIdRef.current && parsed.answer) {
            saveAnswerToDB({
              sessionId: sessionIdRef.current,
              question,
              answer: parsed.answer,
              bulletPoints: parsed.bulletPoints || [],
              hints: Array.isArray(parsed.hints) ? parsed.hints : (parsed.hints ? [parsed.hints] : []),
              detection: parsed.detection || '',
              options: parsed.options || [],
              actionItem: parsed.actionItem || null,
              latencyMs: Math.round(llmLatency * 1000),
            }).catch(() => {});
          }
          
          // Sales-specific dispatches
          if (platformMode === 'sales') {
            if (parsed.detection === 'OBJECTION' && parsed.summary) {
              dispatch({ type: 'ADD_OBJECTION', payload: { text: question, response: parsed.summary, handled: false } });
            }
            if (parsed.detection === 'BUYING_SIGNAL' && parsed.summary) {
              dispatch({ type: 'ADD_BUYING_SIGNAL', payload: parsed.summary });
            }
          }
          
          // Meeting-specific dispatches
          if (platformMode === 'meeting') {
            if (parsed.actionItem?.text) {
              dispatch({ type: 'ADD_ACTION_ITEM', payload: parsed.actionItem });
            }
            if (parsed.detection === 'DECISION' && parsed.summary) {
              dispatch({ type: 'ADD_DECISION', payload: { text: parsed.summary, timestamp: Date.now() } });
            }
            if (parsed.detection === 'REQUIREMENT_GAP' && parsed.summary) {
              dispatch({ type: 'ADD_MEETING_GAP', payload: parsed.summary });
            }
            if (parsed.detection === 'CONTRADICTION' && parsed.summary) {
              dispatch({ type: 'ADD_CONTRADICTION', payload: parsed.summary });
            }
            if (parsed.detection === 'QUESTION_SUGGESTION' && parsed.summary) {
              dispatch({ type: 'ADD_MEETING_SUGGESTION', payload: parsed.summary });
            }
          }
          
          // Log AI's answer into history
          if (parsed.answer) {
            let richText = parsed.answer;
            if (parsed.bulletPoints && parsed.bulletPoints.length > 0) {
              richText += '\n\n**Key Points:**\n' + parsed.bulletPoints.map(pt => `- ${pt}`).join('\n');
            }
            dispatch({ 
              type: 'ADD_TRANSCRIPT', 
              payload: { speaker: 'Copilot', text: richText, timestamp: Date.now() } 
            });
            
            // ── Conversation Memory: Store Q&A for cross-question context ──
            dispatch({ 
              type: 'ADD_QA_PAIR', 
              payload: { 
                question: question, 
                answer: parsed.answer,
                topics: parsed.bulletPoints?.slice(0, 5) || []
              }
            });
            
            // Also capture any recent user statements for memory
            const recentUserStatements = transcriptsRef.current
              .filter(t => t.speaker === 'You' || t.speaker === 'Candidate')
              .slice(-3)
              .map(t => t.text);
            
            if (recentUserStatements.length > 0) {
              dispatch({
                type: 'ADD_USER_STATEMENT',
                payload: { text: recentUserStatements.join(' ') }
              });
            }
          }
          
          dispatch({ type: 'SET_CONNECTION_STATUS', payload: { deepseek: 'connecting' } });
        }
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        // Stale call cancelled — silently ignore
        console.log('[AudioControls] Aborted LLM call');
      } else {
        dispatch({ type: 'SET_ERROR',   payload: `AI error: ${err.message}` });
      }
      dispatch({ type: 'SET_THINKING', payload: false });
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { deepseek: 'connecting' } });
    } finally {
      if (abortControllerRef.current?.signal === combinedSignal) {
        abortControllerRef.current = null;
      }
    }
  }, [dispatch, backendStatus,
      platformMode, salesConfig, meetingConfig,
      state.salesState, state.meetingState, state.speedMode, state.answerMode,
      state.llmProvider, state.llmModel, state.selectedModel,
      state.tonePreference, state.companyEnrichment, state.customPrompt,
      state.assignmentDocs,
  ]);

  // Listener for Manual Trigger (button click from AnswerPanel)
  useEffect(() => {
    if (manualTriggerCount > 0) {
      const fullUtterance = questionBufferRef.current.join(' ');
      if (fullUtterance.trim().length > 5) {
        console.log('[AudioControls] Manual Override Triggered.');
        triggerDeepseekAnswer(fullUtterance);
        questionBufferRef.current = []; // Clear after use
      } else {
        // If buffer is empty, try using recent transcripts instead
        const recent = transcriptsRef.current
          .filter(tr => tr.speaker === 'Interviewer')
          .slice(-3)
          .map(tr => tr.text)
          .join(' ');
        
        if (recent.trim()) {
          console.log('[AudioControls] Manual Override using transcript history.');
          triggerDeepseekAnswer(recent);
        } else {
          dispatch({ type: 'SET_ERROR', payload: 'Nothing to analyze yet. Please wait for the interviewer to speak.' });
        }
      }
    }
  }, [manualTriggerCount, triggerDeepseekAnswer, dispatch]);

  // Listener for Specific Text Question Trigger
  useEffect(() => {
    if (state.customTriggerQuestion) {
      let question = state.customTriggerQuestion;
      dispatch({ type: 'TRIGGER_CUSTOM_QUESTION', payload: null }); 
      // Handle shortcut sentinel: use the most recent transcript text
      if (question.startsWith('__SHORTCUT_')) {
        const recentInterviewer = [...(transcriptsRef.current || [])]
          .reverse()
          .find(t => t.speaker !== 'You');
        question = recentInterviewer?.text || question;
      }
      triggerDeepseekAnswer(question);
    }
  }, [state.customTriggerQuestion, triggerDeepseekAnswer, dispatch]);

  // True Progressive Trigger: Fires while the interviewer is still speaking!
  const handleInterviewerPartialSpeech = useCallback((text) => {
    if (!state.speedMode || !text.trim() || text.trim().length < 15) return;
    
    if (progressiveTimerRef.current) clearTimeout(progressiveTimerRef.current);
    progressiveTimerRef.current = setTimeout(() => {
      // Combine finalized buffer with current mid-sentence text
      const partialContext = [...questionBufferRef.current, text].join(' ');
      if (partialContext.trim().length > 15) {
        triggerDeepseekAnswer(partialContext);
      }
    }, 250); // Small debounce so we don't overwhelm the API
  }, [state.speedMode, triggerDeepseekAnswer]);

  // Unified trigger with buffering (called on final sentences)
  const handleInterviewerSpeech = useCallback((text) => {
    if (!text.trim()) return;

    // Add to current buffer
    questionBufferRef.current.push(text);



    // Clear existing final trigger timeout
    if (triggerTimeoutRef.current) clearTimeout(triggerTimeoutRef.current);

    // Wait for silence before doing final generation
    triggerTimeoutRef.current = setTimeout(() => {
      const fullUtterance = questionBufferRef.current.join(' ');
      questionBufferRef.current = []; // Clear buffer for next turn

      if (shouldTrigger(fullUtterance, platformMode)) {
        console.log('[AudioControls] ' + platformMode + ' trigger: speech detected and actionable.');
        triggerDeepseekAnswer(fullUtterance);
      } else {
        console.log('[AudioControls] ' + platformMode + ' trigger: speech detected but not actionable.');
      }
      
      // Reset duplicate check after triggering so the next turn starts clean
      lastTriggeredQuestionRef.current = '';
    }, state.speedMode ? 250 : 1500); // Ultra-fast 250ms silence threshold in speed mode
  }, [triggerDeepseekAnswer, platformMode, state.speedMode]);

  /* ── Stop everything ─────────────────────────────────────────────────── */
  const stopEverything = useCallback(() => {
    micTranscriberRef.current?.stop();
    micTranscriberRef.current = null;
    sysTranscriberRef.current?.stop();
    sysTranscriberRef.current = null;
    displayStreamRef.current?.getTracks().forEach(t => t.stop());
    displayStreamRef.current = null;
    mixedStreamRef.current?.getTracks().forEach(t => t.stop());
    mixedStreamRef.current = null;

    if (sessionLimitTimerRef.current) {
      clearTimeout(sessionLimitTimerRef.current);
      sessionLimitTimerRef.current = null;
    }

    if (sessionIdRef.current) {
      endSession(sessionIdRef.current).catch(() => {});
      sessionIdRef.current = null;
    }

    dispatch({ type: 'SET_RECORDING',         payload: false });
    dispatch({ type: 'SET_AUDIO_STATUS',      payload: 'idle' });
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: { deepgram: 'disconnected', deepseek: 'disconnected' } });
    dispatch({ type: 'SET_PARTIAL_TRANSCRIPT', payload: '' });

    // Open Analytics Modal if transcripts were recorded
    if (transcriptsRef.current && transcriptsRef.current.length > 0) {
      dispatch({ type: 'TOGGLE_ANALYTICS_MODAL', payload: true });
    }
  }, [dispatch]);

  /* ── System Audio Helper ──────────────────────────────────────────────── */
  const startSystemAudio = useCallback(async () => {
    try {
      const displayStream = await getDisplayStream();
      displayStreamRef.current = displayStream;

      // If user stops screen share from the browser bar, stop the transcriber
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        sysTranscriberRef.current?.stop();
        sysTranscriberRef.current = null;
        displayStreamRef.current  = null;
        dispatch({ type: 'SET_ERROR', payload: 'Screen share ended — interviewer audio paused.' });
      });

      const sysAudioStream = getAudioOnlyStream(displayStream);

      if (!sysAudioStream) {
        dispatch({
          type:    'SET_ERROR',
          payload: '⚠ No audio detected from the screen share. In the share dialog, check "Share audio" to capture the interviewer.',
        });
      } else {
        const sysTranscriber = new DeepgramTranscriber({
          forceSpeakerLabel: 'Interviewer',
          onPartial: (text) => {
            const correctedText = correctTechnicalTerms(text);
            handleInterviewerPartialSpeech(correctedText);
          }, 
          onFinal:   (text) => {
            if (!text.trim()) return;
            if (isEchoDuplicate(text, 'Interviewer', transcriptsRef.current)) return;
            const correctedText = correctTechnicalTerms(text);
            dispatch({ type: 'ADD_TRANSCRIPT', payload: { speaker: 'Interviewer', text: correctedText, timestamp: Date.now() } });
            if (sessionIdRef.current) {
              saveTranscriptToDB({ sessionId: sessionIdRef.current, speaker: 'Interviewer', text: correctedText }).catch(() => {});
            }
            handleInterviewerSpeech(correctedText);
          },
          onStatus: () => {},
          onError:  (msg) => console.warn('[SysAudio]', msg),
        });
        await sysTranscriber.start(sysAudioStream);
        sysTranscriberRef.current = sysTranscriber;
        console.log('[AudioControls] System audio transcriber started');
      }
    } catch (err) {
      console.warn('[AudioControls] Screen share cancelled or failed:', err.message);
      dispatch({
        type:    'SET_ERROR',
        payload: 'System audio not shared — recording your mic only. Click Audio button to retry.',
      });
    }
  }, [dispatch, handleInterviewerSpeech]);

  /* ── Record toggle ────────────────────────────────────────────────────── */
  const handleRecordToggle = async () => {
    if (isRecording) {
      stopEverything();
      return;
    }

    setIsStarting(true);
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'RESET_CONVERSATION_MEMORY' }); // Fresh session, fresh memory

    // ── Check and Deduct Credits / Unlimited Plan (Optimized to 1 API call) ──
    if (state.user?.id) {
      try {
        console.log('[AudioControls] Checking and deducting credits...');
        const isDevMode = import.meta.env.DEV;
        let profile;
        
        if (isDevMode) {
          // Dev mode: fetch profile without deducting any credits
          profile = await getProfile(state.user.id);
          console.log('[AudioControls] Dev mode: credit check bypassed, credits remaining:', profile.credits);
        } else {
          // Prod mode: deduct 1 credit
          profile = await deductCredits(state.user.id, 1);
        }
        
        dispatch({ type: 'SET_CREDITS', payload: profile.credits });
        
        // Trial users get 10 minutes limit, paid users get 40 minutes limit
        if (profile.plan_type === 'trial' || (!profile.plan_type && profile.credits <= 1)) {
          limitMinutesRef.current = 10;
        } else {
          limitMinutesRef.current = 40;
        }
      } catch (err) {
        console.error('[AudioControls] Credit check failed:', err);
        if (import.meta.env.DEV) {
          console.warn('[AudioControls] Dev mode bypass: ignoring credit error for testing.');
          limitMinutesRef.current = 40; // Default to 40m for local testing
        } else {
          dispatch({ type: 'SET_ERROR', payload: `Credit check failed: ${err.message}` });
          setIsStarting(false);
          return;
        }
      }
    }

    // displayStream is shared between session creation and mic setup
    let displayStream = null;
    let micStream = null;
    let sessionPromise = Promise.resolve(null);

    // ── Create Supabase session & request streams in parallel ──
    try {
      console.log('[AudioControls] Initializing streams & database session in parallel...');
      
      if (state.user?.id) {
        sessionPromise = createSession({
          userId: state.user.id,
          platformMode,
          resumeData: resumeDataRef.current,
          jobDescription: jobDescriptionRef.current,
          salesConfig,
          meetingConfig,
        }).catch(err => {
          console.warn('[AudioControls] Failed to create session in DB:', err.message);
          return null;
        });
      }

      // ── Step 1: System Audio Prompt (Highest gesture sensitivity) ──────────
      if (isSystemAudioOn) {
        try {
          console.log('[AudioControls] Requesting getDisplayMedia...');
          displayStream = await getDisplayStream();
          console.log('[AudioControls] getDisplayMedia SUCCESS');
        } catch (err) {
          console.warn('[AudioControls] getDisplayMedia FAILED/CANCELLED:', err.name, err.message);
          // Smart Auto-Detection: fallback to mic-only with a gentle warning
          dispatch({
            type: 'SET_ERROR',
            payload: isElectron
              ? `ℹ️ System audio capture failed. Recording mic only. Make sure Zoom/Meet is running first.`
              : `ℹ️ System audio not shared — recording mic only. To capture interviewer audio: click "Share a Tab" → pick your call tab → enable "Share tab audio".`,
          });
          // Auto-dismiss the warning after 6s
          setTimeout(() => dispatch({ type: 'SET_ERROR', payload: null }), 6000);
        }
      }

      // ── Step 2: Microphone Prompt ──────────────────────────────────────────
      console.log('[AudioControls] Requesting getUserMedia (mic)...');
      try {
        micStream = await getMicStream();
        console.log('[AudioControls] getUserMedia SUCCESS');
      } catch (err) {
        console.error('[AudioControls] getUserMedia FAILED:', err.name, err.message);
        dispatch({ type: 'SET_ERROR', payload: `Microphone access required: ${err.message}` });
        // Clean up display stream if mic failed
        displayStream?.getTracks().forEach(t => t.stop());
        setIsStarting(false);
        return;
      }

      // Wait for the Supabase session promise to resolve
      const session = await sessionPromise;
      if (session) {
        sessionIdRef.current = session.id;
      }
    } catch (err) {
      console.error('[AudioControls] Critical failure in stream acquisition / session startup:', err);
      dispatch({ type: 'SET_ERROR', payload: `Device setup failed: ${err.message}` });
      displayStream?.getTracks().forEach(t => t.stop());
      micStream?.getTracks().forEach(t => t.stop());
      setIsStarting(false);
      return;
    }

    // ── Step 3: Start UI state ──
    try {
      dispatch({ type: 'SET_RECORDING',         payload: true });
      dispatch({ type: 'SET_AUDIO_STATUS',      payload: 'capturing' });
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { deepgram: 'connecting', deepseek: 'disconnected' } });

      // Start session limit timer dynamically based on plan limits
      if (sessionLimitTimerRef.current) clearTimeout(sessionLimitTimerRef.current);
      sessionLimitTimerRef.current = setTimeout(() => {
        console.log(`[AudioControls] ${limitMinutesRef.current}-minute limit reached. Stopping.`);
        stopEverything();
        dispatch({ type: 'SET_ERROR', payload: `Call ended automatically: Max ${limitMinutesRef.current}-minute limit per session reached.` });
      }, limitMinutesRef.current * 60 * 1000);

      // ── Step 4: Start Mic Transcriber ──
      const micTranscriber = new DeepgramTranscriber({
        forceSpeakerLabel: 'You',
        onPartial: (text) => dispatch({ type: 'SET_PARTIAL_TRANSCRIPT', payload: text }),
        onFinal:   (text) => {
          if (!text.trim()) return;
          if (isEchoDuplicate(text, 'You', transcriptsRef.current)) return;
          const correctedText = correctTechnicalTerms(text);
          dispatch({ type: 'SET_PARTIAL_TRANSCRIPT', payload: '' });
          dispatch({ type: 'ADD_TRANSCRIPT', payload: { speaker: 'You', text: correctedText, timestamp: Date.now() } });
          if (sessionIdRef.current) {
            saveTranscriptToDB({ sessionId: sessionIdRef.current, speaker: 'You', text: correctedText }).catch(() => {});
          }
          
          // --- Speech Rate (WPM) Calculation ---
          const now = Date.now();
          const lastMinute = now - 60000;
          const userTranscripts = [...(transcriptsRef.current || []), { speaker: 'You', text, timestamp: now }]
            .filter(t => t.speaker === 'You' && t.timestamp > lastMinute);
          
          const totalWords = userTranscripts.reduce((sum, t) => sum + t.text.trim().split(/\s+/).length, 0);
          dispatch({ type: 'SET_WPM', payload: totalWords });
        },
        onStatus: (status) => {
          dispatch({ type: 'SET_CONNECTION_STATUS', payload: { deepgram: status } });
        },
        onError: (msg) => {
          console.error('[MicAudio]', msg);
          dispatch({ type: 'SET_ERROR', payload: `Mic error: ${msg}` });
        }
      });

      await micTranscriber.start(micStream);
      micTranscriberRef.current = micTranscriber;
      console.log('[AudioControls] Microphone transcriber started');

      // ── Step 5: Start System Audio Transcriber ──
      if (displayStream) {
        displayStreamRef.current = displayStream;
        
        displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          console.log('[AudioControls] Display stream track ended by user');
          sysTranscriberRef.current?.stop();
          sysTranscriberRef.current = null;
          displayStreamRef.current  = null;
          dispatch({ type: 'SET_ERROR', payload: 'Screen share ended.' });
        });

        const sysAudioStream = getAudioOnlyStream(displayStream);

        if (!sysAudioStream) {
          dispatch({
            type:    'SET_ERROR',
            payload: '⚠ No audio detected from the screen share. In the share dialog, check "Share audio" to capture the interviewer.',
          });
        } else {
          const sysTranscriber = new DeepgramTranscriber({
            forceSpeakerLabel: 'Interviewer',
            onPartial: (text) => {
              dispatch({ type: 'SET_PARTIAL_TRANSCRIPT', payload: text });
              handleInterviewerPartialSpeech(text);
            },
            onFinal: (text) => {
              if (!text.trim()) return;
              if (isEchoDuplicate(text, 'Interviewer', transcriptsRef.current)) return;
              const correctedText = correctTechnicalTerms(text);
              dispatch({ type: 'SET_PARTIAL_TRANSCRIPT', payload: '' });
              dispatch({ type: 'ADD_TRANSCRIPT', payload: { speaker: 'Interviewer', text: correctedText, timestamp: Date.now() } });
              if (sessionIdRef.current) {
                saveTranscriptToDB({ sessionId: sessionIdRef.current, speaker: 'Interviewer', text: correctedText }).catch(() => {});
              }
              handleInterviewerSpeech(correctedText);
            },
            onStatus: () => {},
            onError: (msg) => console.warn('[SysAudio] Error:', msg),
          });
          await sysTranscriber.start(sysAudioStream);
          sysTranscriberRef.current = sysTranscriber;
          console.log('[AudioControls] System audio streaming started');
        }
      } else if (isSystemAudioOn) {
        dispatch({ 
          type: 'SET_ERROR', 
          payload: 'System audio not found. On Mac, check "Share audio" and select a "Tab" or "Entire Screen".' 
        });
      }

      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { deepseek: 'connecting' } });

    } catch (err) {
      console.error('[AudioControls] Critical failure in handleRecordToggle:', err);
      dispatch({ type: 'SET_ERROR', payload: `Start failed: ${err.message}` });
      stopEverything();
    } finally {
      setIsStarting(false);
    }
  };

  /* ── Screen read ──────────────────────────────────────────────────────── */
  const handleReadScreen = async () => {
    if (isReadingScreen) return;

    dispatch({ type: 'SET_READING_SCREEN', payload: true });
    dispatch({ type: 'SET_ERROR',          payload: null });

    try {
      // Use the active display stream's video track if we have one
      const videoTrack = displayStreamRef.current?.getVideoTracks()?.[0] ?? null;
      const { text, screenshotUrl } = await captureFrameAndExtract(null, videoTrack);

      dispatch({ type: 'SET_SCREEN_CONTEXT', payload: { text, screenshotUrl } });

      if (text) {
        dispatch({
          type:    'ADD_TRANSCRIPT',
          payload: { speaker: 'Screen', text, timestamp: Date.now() },
        });
        if (isQuestion(text) && !isGeneratingRef.current) {
          triggerDeepseekAnswer(text);
        }
      } else {
        dispatch({ type: 'SET_ERROR', payload: 'No question detected on screen. Make sure the question is clearly visible.' });
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    } finally {
      dispatch({ type: 'SET_READING_SCREEN', payload: false });
    }
  };

  /* ── UI helpers ───────────────────────────────────────────────────────── */
  const recordBtnCls =
    isThinking  ? 'record-btn thinking'  :
    isRecording ? 'record-btn recording' :
    'record-btn idle';

  const statusPill =
    isThinking  ? { cls: 'thinking',  label: 'AI Thinking'  } :
    isRecording ? { cls: 'recording', label: 'Recording'    } :
    audioStatus === 'processing' ? { cls: 'processing', label: 'Processing' } :
    null;

  const latencyColor = (s) => s > 0 ? (s < 1 ? 'fast' : 'slow') : '';

  const screenBtnTitle =
    !isRecording     ? 'Capture screen and extract the question shown on it' :
    displayStreamRef.current ? 'Capture current screen frame and extract question' :
    'Capture screen and extract the question (will prompt for screen share)';

  return (
    <div className="audio-controls">

      {/* ── Left: main controls ──────────────────────────────────────────── */}
      <div className="controls-left">
        {/* Backend Status Dot */}
        <div 
          className='status-dot-container' 
          title={backendStatus === 'online' ? 'Backend Proxy: Online' : 'Backend Proxy: Offline'}
        >
          <div className={`status-dot ${backendStatus}`} />
          <span className='status-text'>{backendStatus.toUpperCase()}</span>
        </div>

        {/* Record / Stop */}
        <div className="record-btn-wrap">
          <button
            className={recordBtnCls}
            onClick={handleRecordToggle}
            title={isRecording ? 'Stop session' : 'Start session — will request mic + screen share'}
          >
            {isStarting || isThinking
              ? <div className="thinking-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              : isRecording
                ? <div className="record-icon-stop" />
                : <div className="record-icon-circle" />
            }
          </button>
          <span className={`btn-label ${isRecording ? 'recording' : ''}`}>
            {isStarting ? 'Starting...' : isRecording ? 'Stop' : 'Start'}
          </span>
        </div>

        <div className="controls-divider" />

        {/* Mic toggle */}
        <div className="toggle-wrap">
          <button
            className={`toggle-btn ${isMicOn ? 'on' : 'off'}`}
            onClick={() => dispatch({ type: 'TOGGLE_MIC' })}
            title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicOn ? '🎤' : '🔇'}
          </button>
          <span className={`btn-label ${isMicOn ? 'active' : ''}`}>Mic</span>
        </div>

        {/* System audio toggle */}
        <div className="toggle-wrap">
          <button
            className={`toggle-btn ${isSystemAudioOn ? 'on' : 'off'}`}
            onClick={() => {
              if (isRecording && !isSystemAudioOn && !displayStreamRef.current) {
                // If special case: user is recording and wants to enable system audio NOW
                dispatch({ type: 'TOGGLE_SYSTEM_AUDIO' });
                startSystemAudio();
              } else if (isRecording && isSystemAudioOn && !displayStreamRef.current) {
                // User already has bit on but missing stream (cancelled earlier) - retry
                startSystemAudio();
              } else {
                dispatch({ type: 'TOGGLE_SYSTEM_AUDIO' });
              }
            }}
            title={isSystemAudioOn
              ? 'Disable screen share (interviewer audio won\'t be captured)'
              : 'Enable screen share to capture the interviewer\'s audio from Zoom/Meet'}
          >
            {isSystemAudioOn ? '🔊' : '🔈'}
          </button>
          <span className={`btn-label ${isSystemAudioOn ? 'active' : ''}`}>Audio</span>
        </div>

        <div className="controls-divider" />

        {/* Speed mode toggle */}
        <div className="toggle-wrap speed-toggle-wrap">
          <button
            className={`toggle-btn ${state.speedMode ? 'on' : 'off'}`}
            onClick={() => dispatch({ type: 'TOGGLE_SPEED_MODE' })}
            title={state.speedMode ? 'Speed Mode ON — instant AI responses' : 'Speed Mode OFF — thorough answers'}
          >
            {state.speedMode ? '⚡' : '🐢'}
          </button>
          <span className={`btn-label ${state.speedMode ? 'active' : ''}`}>Speed</span>
        </div>

        {/* Transcript toggle */}
        <div className="toggle-wrap">
          <button
            className={`toggle-btn ${state.showTranscript ? 'on' : 'off'}`}
            onClick={() => dispatch({ type: 'TOGGLE_TRANSCRIPT' })}
            title={state.showTranscript ? 'Hide transcript' : 'Show transcript'}
          >
            {state.showTranscript ? '📝' : '📝'}
          </button>
          <span className={`btn-label ${state.showTranscript ? 'active' : ''}`}>Trans.</span>
        </div>

        {/* Read screen */}
        <div className="toggle-wrap">
          <button
            className={`toggle-btn screen-btn ${isReadingScreen ? 'on' : 'off'}`}
            onClick={handleReadScreen}
            disabled={isReadingScreen}
            title={screenBtnTitle}
          >
            {isReadingScreen ? '⏳' : '🖥️'}
          </button>
          <span className="btn-label">Screen</span>
        </div>

      </div>

      {/* ── Center: status ───────────────────────────────────────────────── */}
      <div className="controls-center">
        {statusPill && (
          <div className={`status-pill ${statusPill.cls}`}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'currentColor', display: 'inline-block',
              animation: 'livePulse 1.2s ease-in-out infinite',
            }} />
            {statusPill.label}
          </div>
        )}

        {/* Real-time volume canvas visualizer while recording */}
        {isRecording && !isThinking && (
          <div className="volume-bars" style={{ padding: '0 8px' }}>
            <canvas 
              ref={canvasRef} 
              width="110" 
              height="28" 
              style={{ 
                display: 'block', 
                background: 'transparent',
                borderRadius: '6px'
              }} 
            />
          </div>
        )}

        {/* Latency metrics */}
        {latencyMetrics.lastUpdate && (latencyMetrics.sttLatency > 0 || latencyMetrics.llmLatency > 0) && (
          <div style={{ display: 'flex', gap: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {latencyMetrics.sttLatency > 0 && (
              <span>
                STT <span className={`latency-badge ${latencyColor(latencyMetrics.sttLatency)}`}>
                  {latencyMetrics.sttLatency.toFixed(1)}s
                </span>
              </span>
            )}
            {latencyMetrics.llmLatency > 0 && (
              <span>
                AI <span className={`latency-badge ${latencyColor(latencyMetrics.llmLatency)}`}>
                  {latencyMetrics.llmLatency.toFixed(1)}s
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Right: connection status ──────────────────────────────────────── */}
      <div className="controls-right">
        <div className="connection-group">
          <div className="conn-item" title="Audio Stream Status">
            <span className={`conn-dot ${connectionStatus.deepgram}`} />
            {connectionStatus.deepgram === 'connected' && latencyMetrics.sttLatency > 0 && (
              <span className={`latency-badge ${latencyColor(latencyMetrics.sttLatency)}`}>
                {(latencyMetrics.sttLatency * 1000).toFixed(0)}ms
              </span>
            )}
          </div>
          <div className="conn-item" title="AI Intelligence Status">
            <span className={`conn-dot ${connectionStatus.deepseek}`} />
            {connectionStatus.deepseek === 'connected' && latencyMetrics.llmLatency > 0 && (
              <span className={`latency-badge ${latencyColor(latencyMetrics.llmLatency)}`}>
                {latencyMetrics.llmLatency.toFixed(1)}s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="error-toast" onClick={() => dispatch({ type: 'CLEAR_ERROR' })}>
          ⚠ {error} <span style={{ opacity: 0.6, marginLeft: 8, fontSize: '0.7rem' }}>click to dismiss</span>
        </div>
      )}
    </div>
  );
}
