import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { supabase, getUser, supabaseUrl, supabaseAnonKey } from '../services/supabaseClient';
import { getProfile } from '../services/supabaseService';

const AppContext = createContext(null);

// Publish the auth session for the browser extension (content-portal.js reads
// this key to connect the extension to the user's Jd2Job account).
function syncExtensionAuth(session) {
  try {
    if (session?.access_token && session?.user?.id) {
      localStorage.setItem('jd2job_extension_auth', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token || null,
        expires_at: session.expires_at || 0,
        supabaseUrl,
        anonKey: supabaseAnonKey,
        userId: session.user.id,
        email: session.user.email || null,
      }));
    } else {
      localStorage.removeItem('jd2job_extension_auth');
    }
  } catch {
    // localStorage unavailable (private mode etc.) — extension pairing just won't work
  }
}

const initialState = {
  // ── Auth ──
  isAuthenticated: false,
  authLoading: true, // true while checking session on mount
  user: null,        // { id, email, user_metadata: { name } }
  profile: null,     // Supabase profiles table row

  // ── Platform ──
  platformMode: 'interview', // 'interview' | 'sales' | 'meeting'
  sidebarCollapsed: false,
  credits: 10,

  transcripts: [],
  partialTranscript: '',
  currentAnswer: {
    answer: '',
    bulletPoints: [],
    hints: ''
  },
  partialAnswer: '',
  reasoningText: '',
  audioStatus: 'idle',
  resumeData: null,
  isThinking: false,
  isRecording: false,
  isMicOn: true,
  isSystemAudioOn: true,
  connectionStatus: {
    deepgram: 'disconnected',
    deepseek: 'disconnected'
  },
  showResumeModal: false,
  showSettingsModal: false,
  error: null,
  pipWindow: null, // Picture-in-Picture window reference
  latencyMetrics: {
    sttLatency: 0,
    llmLatency: 0,
    lastUpdate: null
  },
  questionDetected: false,
  answerReady: false,

  screenContext: null,
  isReadingScreen: false,
  jobDescription: null,
  showJobDescriptionModal: false,
  showAssignmentModal: false,
  isGhostMode: false,
  technicalKeywords: [],
  wpm: 0,
  answerMode: 'comprehensive',
  showInterviewer: false,
  manualTriggerCount: 0,
  interviewMode: 'realtime',
  interviewDifficulty: 'medium',

  llmProvider: (typeof window !== 'undefined' && localStorage.getItem('llmProvider')) || 'nvidia',
  llmModel: (typeof window !== 'undefined' && localStorage.getItem('llmModel')) || 'meta/llama-3.1-8b-instruct',
  selectedModel: (typeof window !== 'undefined' && localStorage.getItem('selectedModel')) || 'default',

  interviewType: '',
  prepQuestions: [],
  currentQuestionIndex: 0,
  isInterviewActive: false,
  interviewSetupComplete: false,
  prepAnswerFeedback: null,
  isReplayPlaying: false,
  aiSpeaking: false,
  aiEmotion: 'neutral',
  currentInterviewQuestion: '',
  avatarStyle: 'professional',
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme')) || 'dark',
  tonePreference: (typeof window !== 'undefined' && localStorage.getItem('tonePreference')) || 'confident', // 'confident' | 'technical' | 'concise'
  resumes: [], // Array of { id, title, content, active }
  assignmentDocs: [], // Array of { id, name, content } (uploaded assignments, max 3)
  companyEnrichment: null, // enriched company context object
  customTriggerQuestion: null,
  speedMode: typeof window !== 'undefined' && localStorage.getItem('speedMode') !== null ? localStorage.getItem('speedMode') === 'true' : true, // Speed-first mode
  speedMetrics: {
    totalLatency: 0,
    sttLatency: 0,
    llmLatency: 0,
    tokensPerSecond: 0
  },
  showTranscript: true, // Transcript visible by default
  stealthMode: typeof window !== 'undefined' && localStorage.getItem('stealthMode') === 'true',
  stealthClickThrough: false, // Electron click-through mode (ignores mouse events)
  showAnalyticsModal: false,
  prepAnalysis: null,


  // ── Conversation Memory (cross-question context) ──
  conversationMemory: {
    questionsAndAnswers: [], // [{ question, answer, timestamp }]
    userStatements: [], // [{ text, timestamp }] — what the candidate actually said
    keyFacts: [], // extracted facts: "Led team of 5", "Uses React at Stripe", etc.
    topicsCovered: [] // list of topics discussed
  }
};

function appReducer(state, action) {
  switch (action.type) {
    case 'ADD_TRANSCRIPT': {
      const { speaker, text, timestamp = Date.now() } = action.payload;
      let newTranscripts = [...state.transcripts];

      const lastIndex = newTranscripts.length - 1;
      const lastItem = lastIndex >= 0 ? newTranscripts[lastIndex] : null;

      // Group consecutive transcripts from the same speaker if within 6 seconds
      if (lastItem && lastItem.speaker === speaker && (timestamp - lastItem.timestamp) < 6000) {
        const needsSpace = /[.!?]$/.test(lastItem.text.trim());
        const separator = needsSpace ? ' ' : ' ';
        newTranscripts[lastIndex] = {
          ...lastItem,
          text: lastItem.text.trim() + separator + text.trim(),
          timestamp: timestamp // update timestamp to allow continuous merging
        };
      } else {
        newTranscripts.push({ speaker, text, timestamp });
      }

      if (newTranscripts.length > 50) {
        newTranscripts.shift();
      }

      // Keyword matching logic for USER
      let newKeywords = state.technicalKeywords;
      if (speaker === 'USER' && state.technicalKeywords.length > 0) {
        const lowerText = text.toLowerCase();
        newKeywords = state.technicalKeywords.map(kw => {
          if (!kw.matched && lowerText.includes(kw.word.toLowerCase())) {
            return { ...kw, matched: true };
          }
          return kw;
        });
      }

      return {
        ...state,
        transcripts: newTranscripts,
        technicalKeywords: newKeywords,
        error: null,
        questionDetected: false
      };
    }
    case 'SET_PARTIAL_TRANSCRIPT':
      return { ...state, partialTranscript: action.payload };
    case 'SET_PARTIAL_ANSWER':
      return { ...state, partialAnswer: action.payload, isThinking: true };
    case 'SET_REASONING':
      return { ...state, reasoningText: action.payload, isThinking: true };
    case 'CLEAR_REASONING':
      return { ...state, reasoningText: '' };
    case 'SET_ANSWER':
      return { ...state, currentAnswer: action.payload, isThinking: false, partialAnswer: '', answerReady: true };
    case 'SET_THINKING':
      return { ...state, isThinking: action.payload };
    case 'SET_AUDIO_STATUS':
      return { ...state, audioStatus: action.payload };
    case 'SET_RECORDING':
      return { ...state, isRecording: action.payload };
    case 'TOGGLE_MIC':
      return { ...state, isMicOn: !state.isMicOn };
    case 'TOGGLE_SYSTEM_AUDIO':
      return { ...state, isSystemAudioOn: !state.isSystemAudioOn };
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: { ...state.connectionStatus, ...action.payload } };
    case 'SET_RESUME_DATA':
      localStorage.setItem('resumeData', JSON.stringify(action.payload));
      return { ...state, resumeData: action.payload };
    case 'LOAD_RESUME_DATA':
      return { ...state, resumeData: action.payload };
    case 'SET_JOB_DESCRIPTION':
      localStorage.setItem('jobDescription', JSON.stringify(action.payload));
      return { ...state, jobDescription: action.payload };
    case 'LOAD_JOB_DESCRIPTION':
      return { ...state, jobDescription: action.payload };
    case 'TOGGLE_RESUME_MODAL':
      return { ...state, showResumeModal: !state.showResumeModal };
    case 'TOGGLE_JOB_DESCRIPTION_MODAL':
      return { ...state, showJobDescriptionModal: !state.showJobDescriptionModal };
    case 'TOGGLE_ASSIGNMENT_MODAL':
      return { ...state, showAssignmentModal: !state.showAssignmentModal };
    case 'TOGGLE_SETTINGS_MODAL':
      return { ...state, showSettingsModal: !state.showSettingsModal };
    case 'SET_PIP_WINDOW':
      return { ...state, pipWindow: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'CLEAR_TRANSCRIPTS':
      return { ...state, transcripts: [], partialTranscript: '', reasoningText: '', answerReady: false };
    case 'SET_LATENCY_METRICS':
      return { ...state, latencyMetrics: { ...state.latencyMetrics, ...action.payload, lastUpdate: Date.now() } };
    case 'SET_QUESTION_DETECTED':
      return { ...state, questionDetected: action.payload };

    case 'SET_SCREEN_CONTEXT':
      return { ...state, screenContext: action.payload };
    case 'SET_READING_SCREEN':
      return { ...state, isReadingScreen: action.payload };
    case 'TOGGLE_GHOST_MODE':
      return { ...state, isGhostMode: !state.isGhostMode };
    case 'SET_KEYWORDS':
      return { ...state, technicalKeywords: action.payload.map(w => ({ word: w, matched: false })) };
    case 'SET_WPM':
      return { ...state, wpm: action.payload };
    case 'SET_ANSWER_MODE':
      return { ...state, answerMode: action.payload };
    case 'SET_LLM_CONFIG':
      localStorage.setItem('llmProvider', action.payload.provider);
      localStorage.setItem('llmModel', action.payload.model);
      return { ...state, llmProvider: action.payload.provider, llmModel: action.payload.model };
    case 'SET_SELECTED_MODEL':
      localStorage.setItem('selectedModel', action.payload);
      return { ...state, selectedModel: action.payload };
    case 'TOGGLE_INTERVIEWER':
      return { ...state, manualTriggerCount: state.manualTriggerCount + 1 };
    case 'TRIGGER_MANUAL_ANSWER':
      return { ...state, manualTriggerCount: state.manualTriggerCount + 1 };
    case 'SET_SHOW_INTERVIEWER':
      return { ...state, showInterviewer: action.payload };
    case 'SET_INTERVIEW_MODE':
      return { ...state, interviewMode: action.payload };
    case 'SET_INTERVIEW_DIFFICULTY':
      return { ...state, interviewDifficulty: action.payload };
    case 'SET_INTERVIEW_TYPE':
      return { ...state, interviewType: action.payload };
    case 'SET_PREP_QUESTIONS':
      return { ...state, prepQuestions: action.payload };
    case 'SET_CURRENT_QUESTION_INDEX':
      return { ...state, currentQuestionIndex: action.payload };
    case 'SET_INTERVIEW_ACTIVE':
      return { ...state, isInterviewActive: action.payload };
    case 'SET_INTERVIEW_SETUP_COMPLETE':
      return { ...state, interviewSetupComplete: action.payload };
    case 'SET_PREP_ANSWER_FEEDBACK':
      return { ...state, prepAnswerFeedback: action.payload };
    case 'SET_REPLAY_PLAYING':
      return { ...state, isReplayPlaying: action.payload };
    case 'RESET_PREP_MODE':
      return {
        ...state,
        isInterviewActive: false,
        interviewSetupComplete: false,
        prepQuestions: [],
        currentQuestionIndex: 0,
        prepAnswerFeedback: null,
        transcripts: [],
        partialTranscript: '',
        currentAnswer: { answer: '', bulletPoints: [], hints: '' },
        partialAnswer: '',
        reasoningText: '',
        answerReady: false
      };
    // AI Interviewer dispatch cases
    case 'SET_AI_SPEAKING':
      return { ...state, aiSpeaking: action.payload };
    case 'SET_AI_EMOTION':
      return { ...state, aiEmotion: action.payload };
    case 'SET_CURRENT_INTERVIEW_QUESTION':
      return { ...state, currentInterviewQuestion: action.payload };
    case 'SET_AVATAR_STYLE':
      return { ...state, avatarStyle: action.payload };
    case 'TOGGLE_THEME': {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', nextTheme);
      return { ...state, theme: nextTheme };
    }
    case 'SET_THEME':
      localStorage.setItem('theme', action.payload);
      return { ...state, theme: action.payload };
    case 'TRIGGER_CUSTOM_QUESTION':
      return { ...state, customTriggerQuestion: action.payload };

    // ── Platform ──
    case 'SET_PLATFORM_MODE':
      return { ...state, platformMode: action.payload, answerMode: 'comprehensive' };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'SET_CREDITS':
      return { ...state, credits: action.payload };
    case 'DEDUCT_CREDIT':
      return { ...state, credits: Math.max(0, state.credits - 1) };
    case 'ADD_CREDITS':
      return { ...state, credits: state.credits + (action.payload || 1) };



    // ── Conversation Memory ──
    case 'ADD_QA_PAIR':
      return {
        ...state,
        conversationMemory: {
          ...state.conversationMemory,
          questionsAndAnswers: [
            ...state.conversationMemory.questionsAndAnswers,
            { question: action.payload.question, answer: action.payload.answer, timestamp: Date.now() }
          ],
          topicsCovered: [
            ...state.conversationMemory.topicsCovered,
            ...(action.payload.topics || [])
          ]
        }
      };
    case 'ADD_USER_STATEMENT':
      return {
        ...state,
        conversationMemory: {
          ...state.conversationMemory,
          userStatements: [
            ...state.conversationMemory.userStatements,
            { text: action.payload.text, timestamp: Date.now() }
          ]
        }
      };
    case 'UPDATE_KEY_FACTS':
      return {
        ...state,
        conversationMemory: {
          ...state.conversationMemory,
          keyFacts: action.payload // array of fact strings
        }
      };
    case 'RESET_CONVERSATION_MEMORY':
      return {
        ...state,
        conversationMemory: {
          questionsAndAnswers: [],
          userStatements: [],
          keyFacts: [],
          topicsCovered: []
        }
      };
    case 'TOGGLE_SPEED_MODE': {
      const nextSpeedMode = !state.speedMode;
      const nextSelectedModel = nextSpeedMode ? 'llama_fast' : 'default';
      localStorage.setItem('speedMode', String(nextSpeedMode));
      localStorage.setItem('selectedModel', nextSelectedModel);
      return { ...state, speedMode: nextSpeedMode, selectedModel: nextSelectedModel };
    }
    case 'SET_SPEED_METRICS':
      return { ...state, speedMetrics: { ...state.speedMetrics, ...action.payload } };
    case 'TOGGLE_TRANSCRIPT':
      return { ...state, showTranscript: !state.showTranscript };
    case 'TOGGLE_STEALTH_MODE': {
      const nextStealth = !state.stealthMode;
      localStorage.setItem('stealthMode', String(nextStealth));
      return { ...state, stealthMode: nextStealth };
    }
    case 'SET_STEALTH_CLICK_THROUGH':
      return { ...state, stealthClickThrough: action.payload };
    case 'TOGGLE_ANALYTICS_MODAL':
      return { ...state, showAnalyticsModal: action.payload !== undefined ? action.payload : !state.showAnalyticsModal };
    case 'SET_PREP_ANALYSIS':
      return { ...state, prepAnalysis: action.payload };
    case 'SET_TONE_PREFERENCE':
      localStorage.setItem('tonePreference', action.payload);
      return { ...state, tonePreference: action.payload };
    case 'SET_COMPANY_ENRICHMENT':
      return { ...state, companyEnrichment: action.payload };
    case 'ADD_ASSIGNMENT_DOC': {
      const existingDocs = state.assignmentDocs || [];
      if (existingDocs.length >= 3) return state; // max 3 assignments
      return {
        ...state,
        assignmentDocs: [...existingDocs, {
          id: Date.now().toString(),
          name: action.payload.name || 'Assignment',
          content: action.payload.content || '',
        }],
      };
    }
    case 'REMOVE_ASSIGNMENT_DOC':
      return {
        ...state,
        assignmentDocs: (state.assignmentDocs || []).filter(d => d.id !== action.payload),
      };
    case 'CLEAR_ASSIGNMENT_DOCS':
      return { ...state, assignmentDocs: [] };
    case 'SET_RESUMES':
      return { ...state, resumes: action.payload };
    case 'SET_ACTIVE_RESUME': {
      const resumes = state.resumes.map(r => ({
        ...r,
        active: r.id === action.payload
      }));
      const activeRes = resumes.find(r => r.id === action.payload);
      return {
        ...state,
        resumes,
        resumeData: activeRes ? activeRes.content : null
      };
    }

    // ── Auth ──
    case 'SET_AUTH':
      if (action.payload.user?.id) {
        localStorage.setItem('jd2job_user_id', action.payload.user.id);
      }
      return { ...state, isAuthenticated: true, authLoading: false, user: action.payload.user, profile: action.payload.profile };
    case 'SET_AUTH_LOADING':
      return { ...state, authLoading: action.payload };
    case 'CLEAR_AUTH':
      localStorage.removeItem('jd2job_user_id');
      syncExtensionAuth(null);
      return { ...state, isAuthenticated: false, user: null, profile: null, authLoading: false };
    case 'SET_PROFILE':
      return { ...state, profile: action.payload };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  if (typeof window !== 'undefined') window.__APP_DISPATCH__ = dispatch;
  const debounceTimerRef = useRef(null);
  const displayStreamRef = useRef(null); // Centralized display stream ref

  const debouncedDispatch = useCallback((callback, delay = 2000) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      callback();
      debounceTimerRef.current = null;
    }, delay);
  }, []);

  /* ── Auth: Check session on mount ─────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      try {
        // Timeout: if Supabase is slow, show as unauthenticated after 2s
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 2000)
        );
        
        const userPromise = getUser();
        const user = await Promise.race([userPromise, timeoutPromise]).catch(() => null);
        
        if (cancelled) return;
        
        if (user) {
          let profile = null;
          try {
            const profilePromise = getProfile(user.id);
            profile = await Promise.race([profilePromise, timeoutPromise]).catch(() => null);
          } catch {}

          // Publish session for the browser extension pairing
          try {
            const { data: { session } } = await supabase.auth.getSession();
            syncExtensionAuth(session);
          } catch {}

          dispatch({
            type: 'SET_AUTH',
            payload: { user, profile }
          });


        } else {
          dispatch({ type: 'SET_AUTH_LOADING', payload: false });
        }
      } catch {
        if (!cancelled) dispatch({ type: 'SET_AUTH_LOADING', payload: false });
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[Auth] Auth state change event fired: ${event}`);
      syncExtensionAuth(session);
      if (session?.user) {
        // Dispatch auth immediately so UI doesn't hang waiting for DB
        dispatch({ type: 'SET_AUTH', payload: { user: session.user, profile: null } });
        
        // Fetch profile in the background
        getProfile(session.user.id)
          .then(profile => {
            console.log('[Auth] Profile fetched in background:', profile);
            dispatch({ type: 'SET_PROFILE', payload: profile });
          })
          .catch(err => {
            console.error('[Auth] Error fetching profile in background:', err);
          });
      } else {
        dispatch({ type: 'CLEAR_AUTH' });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [dispatch]);

  useEffect(() => {
    const savedResume = localStorage.getItem('resumeData');
    if (savedResume) {
      try {
        const parsed = JSON.parse(savedResume);
        dispatch({ type: 'LOAD_RESUME_DATA', payload: parsed });
      } catch (e) {
        console.error('Failed to parse saved resume:', e);
      }
    }
    const savedJD = localStorage.getItem('jobDescription');
    if (savedJD) {
      try {
        const parsed = JSON.parse(savedJD);
        dispatch({ type: 'LOAD_JOB_DESCRIPTION', payload: parsed });
      } catch (e) {
        console.error('Failed to parse saved JD:', e);
      }
    }

    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel) {
      dispatch({ type: 'SET_SELECTED_MODEL', payload: savedModel });
    }

    if (process.env.NODE_ENV === 'development' || true) {
      window.dispatch = dispatch;
    }
  }, [dispatch]);



  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, debouncedDispatch, displayStreamRef }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export { AppContext };