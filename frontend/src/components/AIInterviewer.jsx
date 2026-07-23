import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { DeepgramVoiceAgent } from '../services/deepgramAgentService';
import { getSession } from '../services/supabaseClient';
import './AIInterviewer.css';

export default function AIInterviewer({ 
  onSpeechEnd, 
  useVoiceAgent: useVoiceAgentProp,
  apiKey,
  voiceModel = 'aura-2-asteria-en',
  llmModel = 'gpt-4o-mini',
  onTranscript,
  onAgentStart,
  onAgentEnd
}) {
  const { state, dispatch } = useApp();

  // Setup options
  const [role, setRole] = useState('Software Engineer');
  const [type, setType] = useState('Technical');
  const [difficulty, setDifficulty] = useState('medium');
  const [mode, setMode] = useState('conversational'); // 'conversational' (speech-to-speech) vs 'step'
  const [isSetupActive, setIsSetupActive] = useState(true);

  // Conversational mode states
  const [messages, setMessages] = useState([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [overallEvaluation, setOverallEvaluation] = useState(null);

  // Step mode states
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbacks, setFeedbacks] = useState({});
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [userAnswers, setUserAnswers] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);

  // Voice agent states
  const agentRef = useRef(null);
  const [localIsConnected, setLocalIsConnected] = useState(false);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const [localIsListening, setLocalIsListening] = useState(false);
  const [localTranscript, setLocalTranscript] = useState('');
  const [agentText, setAgentText] = useState('');
  const [agentError, setAgentError] = useState(null);
  const [micVolume, setMicVolume] = useState(0);
  const [typeText, setTypeText] = useState('');

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const chatEndRef = useRef(null);

  // Auto-scroll chat log
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, agentText, localTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (agentRef.current) {
        agentRef.current.disconnect();
        agentRef.current = null;
      }
    };
  }, []);

  // Initialize continuous voice agent (Speech-to-Speech)
  const initSpeechToSpeechAgent = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.disconnect();
      agentRef.current = null;
    }

    const systemPrompt = `You are a warm, human interviewer on a live voice call, conducting a ${difficulty} ${type} interview for a ${role} position.
Candidate's Resume: ${state.resumeData || 'Not provided'}
Job Description: ${state.jobDescription || 'Not provided'}

How to behave:
1. Talk like a real person on a call — short, natural turns. Never more than 2 sentences before letting the candidate speak.
2. Ask exactly ONE question at a time, then stop and listen. Keep questions under 25 words.
3. React to each answer in a few natural words ("Nice, that scaling point lands.", "Got it, makes sense.") then move on.
4. Cover exactly 5 questions total, increasing in depth, then wrap up warmly and say goodbye.
5. Never output markdown, bullet lists, emojis, or stage directions — only words that can be spoken aloud.`;

    const agent = new DeepgramVoiceAgent({
      apiKey: apiKey || 'proxy-key',
      systemPrompt,
      greeting: `Hi, great to meet you! I'll be interviewing you for the ${role} position today. Let's dive right in — can you tell me a little about yourself?`,
      llmModel,
      ttsModel: voiceModel,
      onTranscript: (text, isFinal) => {
        setLocalTranscript(text);
        if (isFinal) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.sender === 'user') {
              // Append to existing user message
              return [...prev.slice(0, -1), { sender: 'user', text: last.text + ' ' + text }];
            }
            return [...prev, { sender: 'user', text }];
          });
          setLocalTranscript('');
        }
      },
      onAgentResponse: (text) => {
        setAgentText(text);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.sender === 'agent') {
            return [...prev.slice(0, -1), { sender: 'agent', text: last.text + ' ' + text }];
          }
          return [...prev, { sender: 'agent', text }];
        });
        setAgentText('');
      },
      onSpeakingChanged: (speaking) => {
        setLocalIsSpeaking(speaking);
        dispatch({ type: 'SET_AI_SPEAKING', payload: speaking });
      },
      onListeningChanged: (listening) => {
        setLocalIsListening(listening);
      },
      onConnected: () => {
        setLocalIsConnected(true);
        setAgentError(null);
        setIsSessionActive(true);
      },
      onDisconnected: () => {
        setLocalIsConnected(false);
        setIsSessionActive(false);
      },
      onError: (err) => {
        console.error('Voice Agent error:', err);
        setAgentError(err.message || err);
      },
      onVolumeChanged: (vol) => {
        setMicVolume(vol);
      }
    });

    agentRef.current = agent;
    agent.connect().then(connected => {
      if (connected) {
        // Wait for manual start click
        setIsVoiceActive(false);
      }
    });
  }, [apiKey, llmModel, voiceModel, role, type, difficulty, state.resumeData, state.jobDescription, dispatch]);

  // Initialize step voice agent (Step-by-Step)
  const initStepVoiceAgent = useCallback((firstQuestionText) => {
    if (agentRef.current) {
      agentRef.current.disconnect();
      agentRef.current = null;
    }

    const agent = new DeepgramVoiceAgent({
      apiKey: apiKey || 'proxy-key',
      systemPrompt: `You are a professional interviewer on a live voice call. You already asked: "${firstQuestionText}". Listen to the candidate's answer, give ONE short sentence of natural feedback, then invite them to click Next. Keep every turn under 2 sentences. Only speak words that can be said aloud — no markdown, lists, or emojis.`,
      greeting: firstQuestionText,
      llmModel,
      ttsModel: voiceModel,
      onTranscript: (text, isFinal) => {
        setLocalTranscript(text);
        if (isFinal) {
          setUserAnswers(prev => ({ ...prev, [currentIndex]: (prev[currentIndex] || '') + ' ' + text }));
        }
      },
      onAgentResponse: (text) => {
        setAgentText(text);
      },
      onSpeakingChanged: (speaking) => {
        setLocalIsSpeaking(speaking);
        dispatch({ type: 'SET_AI_SPEAKING', payload: speaking });
      },
      onListeningChanged: (listening) => {
        setLocalIsListening(listening);
      },
      onConnected: () => {
        setLocalIsConnected(true);
        setAgentError(null);
      },
      onDisconnected: () => {
        setLocalIsConnected(false);
      },
      onError: (err) => {
        console.error('Voice Agent error:', err);
        setAgentError(err.message || err);
      },
      onVolumeChanged: (vol) => {
        setMicVolume(vol);
      }
    });

    agentRef.current = agent;
    agent.connect().then(connected => {
      if (connected) {
        agent.startConversation();
      }
    });
  }, [apiKey, llmModel, voiceModel, currentIndex, dispatch]);

  // Fetch a question from backend (for Step-by-Step mode)
  const fetchQuestion = async (num, prevQs) => {
    setIsLoadingQuestion(true);
    setAgentError(null);
    try {
      const session = await getSession();
      const token = session?.access_token || '';

      const res = await fetch(`${API_BASE}/api/interview/next-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          interviewType: `${role} (${type})`,
          difficulty,
          resumeData: state.resumeData || '',
          jobDescription: state.jobDescription || '',
          previousQuestions: prevQs,
          questionNumber: num
        })
      });

      if (!res.ok) throw new Error('Failed to generate question');
      const data = await res.json();
      return data;
    } catch (err) {
      console.error(err);
      setAgentError('Failed to retrieve question. Please retry.');
      return null;
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  // Start interview session
  const handleStartSession = async () => {
    setIsSetupActive(false);
    setOverallEvaluation(null);
    setMessages([]);
    
    if (mode === 'conversational') {
      initSpeechToSpeechAgent();
    } else {
      const firstQ = await fetchQuestion(1, []);
      if (firstQ) {
        const newQ = { text: firstQ.question, category: firstQ.category, hints: firstQ.hints };
        setQuestions([newQ]);
        setCurrentIndex(0);
        initStepVoiceAgent(newQ.text);
      } else {
        setIsSetupActive(true);
      }
    }
  };

  // Evaluate conversational session
  const handleEvaluateConversationalSession = async () => {
    if (agentRef.current) {
      agentRef.current.disconnect();
      agentRef.current = null;
    }

    if (messages.length < 2) {
      setIsSetupActive(true);
      return;
    }

    setIsEvaluating(true);
    try {
      const session = await getSession();
      const token = session?.access_token || '';

      // Prepare conversation history transcript
      const transcriptText = messages.map(m => `${m.sender === 'agent' ? 'Interviewer' : 'Candidate'}: ${m.text}`).join('\n');

      const res = await fetch(`${API_BASE}/api/deepseek/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are an expert interview evaluator. Grade the candidate's performance in the following conversation transcript.
Provide a detailed evaluation and return JSON in this exact format:
{
  "score": <overall score out of 10>,
  "feedback": "Overall performance summary",
  "strengths": ["strength 1", "strength 2"],
  "suggestions": ["improvement 1", "improvement 2"]
}`
            },
            {
              role: 'user',
              content: `TRANSCRIPT:\n${transcriptText}`
            }
          ]
        })
      });

      if (!res.ok) throw new Error('Evaluation failed');
      const data = await res.json();
      
      let parsed = {};
      try {
        const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match ? match[0] : data.choices[0].message.content);
      } catch {
        parsed = { score: 7, feedback: data.choices[0].message.content, strengths: [], suggestions: [] };
      }

      setOverallEvaluation(parsed);
    } catch (err) {
      console.error(err);
      setAgentError('Could not evaluate conversation. Please retry.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Evaluate single step answer
  const handleEvaluateAnswer = async () => {
    const currentQ = questions[currentIndex];
    const answer = userAnswers[currentIndex] || '';
    if (!answer.trim()) return;

    setIsEvaluating(true);
    try {
      const session = await getSession();
      const token = session?.access_token || '';

      const res = await fetch(`${API_BASE}/api/interview/evaluate-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          question: currentQ.text,
          userAnswer: answer,
          resumeData: state.resumeData || '',
          difficulty
        })
      });

      if (!res.ok) throw new Error('Failed to evaluate answer');
      const evaluation = await res.json();
      setFeedbacks(prev => ({ ...prev, [currentIndex]: evaluation }));
      setShowFeedback(true);

      if (agentRef.current) {
        agentRef.current.stopConversation();
      }
    } catch (err) {
      console.error(err);
      setAgentError('Could not evaluate answer. Please try again.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Move to next step question
  const handleNextQuestion = async () => {
    setShowFeedback(false);
    setLocalTranscript('');
    setAgentText('');
    const nextNum = currentIndex + 2;

    if (nextNum <= 5) {
      const nextQData = await fetchQuestion(nextNum, questions);
      if (nextQData) {
        const nextQ = { text: nextQData.question, category: nextQData.category, hints: nextQData.hints };
        setQuestions(prev => [...prev, nextQ]);
        setCurrentIndex(prev => prev + 1);
        initStepVoiceAgent(nextQ.text);
      }
    } else {
      setCurrentIndex(5);
    }
  };

  const toggleMute = () => {
    if (agentRef.current) {
      if (isMuted) {
        // Unmute
        agentRef.current.setupAudio().then(() => setIsMuted(false));
      } else {
        // Mute by disconnecting local microphone input track
        if (agentRef.current.processor) {
          try { agentRef.current.processor.disconnect(); } catch {}
          agentRef.current.processor = null;
        }
        if (agentRef.current.mediaStream) {
          agentRef.current.mediaStream.getTracks().forEach(t => t.stop());
          agentRef.current.mediaStream = null;
        }
        setIsMuted(true);
      }
    }
  };

  const toggleVoiceStream = () => {
    if (agentRef.current) {
      if (isVoiceActive) {
        agentRef.current.stopConversation();
        setIsVoiceActive(false);
      } else {
        agentRef.current.startConversation().then(started => {
          if (started) setIsVoiceActive(true);
        });
      }
    }
  };

  const handleSendText = () => {
    if (!typeText.trim()) return;
    if (agentRef.current) {
      agentRef.current.injectUserMessage(typeText);
      setMessages(prev => [...prev, { sender: 'user', text: typeText }]);
      setTypeText('');
    }
  };

  // Visualizer class based on state
  const getOrbClass = () => {
    if (isLoadingQuestion || isEvaluating) return 'orb-container thinking';
    if (localIsSpeaking) return 'orb-container speaking';
    if (localIsConnected && isVoiceActive) return 'orb-container listening';
    return 'orb-container';
  };

  const getStatusLabel = () => {
    if (isLoadingQuestion) return 'Generating...';
    if (isEvaluating) return 'Analyzing...';
    if (localIsSpeaking) return 'AI Speaking';
    if (localIsListening || (localIsConnected && isVoiceActive)) return 'Listening...';
    if (localIsConnected) return 'Ready - Click Start';
    return 'Offline';
  };

  // 1. Setup Mode
  if (isSetupActive) {
    return (
      <div className="ai-interviewer-wrapper">
        <div className="setup-card">
          <h2 className="setup-title">Configure Mock Practice</h2>
          <p className="setup-subtitle">Choose options to calibrate the AI interviewer tailored to your background.</p>

          <div className="setup-grid">
            <div className="setup-group">
              <label className="setup-label">Target Role</label>
              <input 
                type="text" 
                value={role} 
                onChange={(e) => setRole(e.target.value)} 
                className="setup-input"
                placeholder="e.g. Frontend React Developer"
              />
            </div>

            <div className="setup-group">
              <label className="setup-label">Interview Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="setup-select">
                <option value="Technical">Technical (Coding & Architecture)</option>
                <option value="Behavioral">Behavioral (STAR Method)</option>
                <option value="System Design">System Design</option>
              </select>
            </div>

            <div className="setup-group">
              <label className="setup-label">Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="setup-select">
                <option value="easy">Junior</option>
                <option value="medium">Mid-Level</option>
                <option value="hard">Senior / Staff</option>
              </select>
            </div>

            <div className="setup-group">
              <label className="setup-label">Practice Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="setup-select">
                <option value="conversational">🎙️ Speech-to-Speech (Human Style)</option>
                <option value="step">🖱️ Step-by-Step Practice</option>
              </select>
            </div>
          </div>

          <button onClick={handleStartSession} className="start-btn">
            🚀 Initialize AI Interviewer
          </button>
        </div>
      </div>
    );
  }

  // 2. Continuous mode finished / evaluated state
  if (mode === 'conversational' && overallEvaluation) {
    return (
      <div className="ai-interviewer-wrapper">
          <div className="setup-card" style={{ textAlign: 'center' }}>
          <h2 className="setup-title" style={{ fontSize: '2rem' }}>Practice Completed!</h2>
          <p className="setup-subtitle" style={{ textAlign: 'center' }}>Overall score and insights from your Speech-to-Speech session.</p>

          <div style={{ margin: '32px 0' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: 900, background: 'linear-gradient(135deg, var(--holo-primary, #e08aae), var(--berry, #912f56))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{overallEvaluation.score} / 10</div>
            <div style={{ color: 'var(--text-secondary, #e2e8f0)', fontSize: '1rem', fontWeight: 700 }}>Overall Score</div>
          </div>

          <div className="feedback-box" style={{ textAlign: 'left', marginBottom: '24px' }}>
            <p style={{ margin: 0, fontSize: '.95rem', color: 'var(--text-secondary, #e2e8f0)', lineHeight: '1.6' }}>
              {overallEvaluation.feedback}
            </p>

            <div className="feedback-grid">
              <div className="feedback-metric">
                <strong style={{ color: 'var(--accent, #e08aae)', display: 'block', marginBottom: '6px' }}>Key Strengths</strong>
                <ul style={{ margin: 0, paddingLeft: '14px', color: 'var(--text-secondary, #e2e8f0)' }}>
                  {overallEvaluation.strengths?.map((s, idx) => <li key={idx}>{s}</li>)}
                </ul>
              </div>

              <div className="feedback-metric">
                <strong style={{ color: 'var(--error, #ef4444)', display: 'block', marginBottom: '6px' }}>Suggested Improvements</strong>
                <ul style={{ margin: 0, paddingLeft: '14px', color: 'var(--text-secondary, #e2e8f0)' }}>
                  {overallEvaluation.suggestions?.map((s, idx) => <li key={idx}>{s}</li>)}
                </ul>
              </div>
            </div>
          </div>

          <button onClick={() => setIsSetupActive(true)} className="start-btn" style={{ background: 'var(--bg-surface, rgba(26,20,34,.6))', border: '1px solid var(--border-medium, rgba(255,255,255,.12))', color: 'var(--text-primary, #f8fafc)' }}>
            Practice Again
          </button>
        </div>
      </div>
    );
  }

  // 3. Step mode completed state
  if (mode === 'step' && currentIndex === 5) {
    const totalScore = Object.values(feedbacks).reduce((acc, f) => acc + (f.score || 0), 0);
    const avgScore = (totalScore / 5).toFixed(1);

    return (
      <div className="ai-interviewer-wrapper">
        <div className="setup-card" style={{ textAlign: 'center' }}>
          <h2 className="setup-title" style={{ fontSize: '2rem' }}>Session Completed!</h2>
          <p className="setup-subtitle" style={{ textAlign: 'center' }}>Aggregated metrics and recommendations from Jd2Job AI Coach.</p>

          <div style={{ margin: '32px 0' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: 900, background: 'linear-gradient(135deg, var(--holo-primary, #e08aae), var(--berry, #912f56))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{avgScore} / 10</div>
            <div style={{ color: 'var(--text-secondary, #e2e8f0)', fontSize: '1rem', fontWeight: 700 }}>Average Session Score</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '24px 0', textAlign: 'left' }}>
            <h3 style={{ color: 'var(--text-primary, #f8fafc)', fontSize: '1.1rem', borderBottom: '1px solid var(--border-light, rgba(255,255,255,.04))', paddingBottom: '8px' }}>
              Feedback Insights
            </h3>
            {Object.entries(feedbacks).map(([idx, feedback]) => (
              <div key={idx} style={{ background: 'var(--bg-surface, rgba(26,20,34,.6))', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-light, rgba(255,255,255,.04))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--accent, #e08aae)' }}>Question {parseInt(idx) + 1}</strong>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-primary, #f8fafc)' }}>{feedback.score}/10</span>
                </div>
                <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--text-secondary, #e2e8f0)' }}>{feedback.feedback}</p>
              </div>
            ))}
          </div>

          <button onClick={() => setIsSetupActive(true)} className="start-btn" style={{ background: 'var(--bg-surface, rgba(26,20,34,.6))', border: '1px solid var(--border-medium, rgba(255,255,255,.12))', color: 'var(--text-primary, #f8fafc)' }}>
            Practice Again
          </button>
        </div>
      </div>
    );
  }

  // 4. Conversational Speech-to-Speech active session rendering
  if (mode === 'conversational') {
    return (
        <div className="ai-interviewer-wrapper">
        <div className="session-layout">
          {/* Left Column: Visualizer Orb */}
          <div className="visualizer-card">
            <div className={getOrbClass()}>
              <div className="orb-ring orb-ring-1"></div>
              <div className="orb-ring orb-ring-2"></div>
              <div className="orb-ring orb-ring-3"></div>
              <div className="orb-core"></div>
            </div>
            
            {/* Real-time volume waveform animation */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '32px', margin: '8px 0' }}>
              {[...Array(9)].map((_, idx) => {
                const scale = micVolume > 5 ? (Math.sin(idx + micVolume) * 0.4 + 0.6) : 0.15;
                const barHeight = Math.max(4, Math.floor(scale * (10 + (micVolume * 0.35))));
                const color = localIsSpeaking ? '#f472b6' : '#4ade80';
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      width: '4px', 
                      height: `${barHeight}px`, 
                      background: color, 
                      borderRadius: '2px', 
                      transition: 'height 0.1s ease',
                      opacity: localIsConnected ? 0.95 : 0.35,
                      boxShadow: localIsConnected ? `0 0 6px ${color}` : 'none'
                    }} 
                  />
                );
              })}
            </div>

            <div className={`status-indicator ${localIsSpeaking ? 'speaking' : localIsListening ? 'listening' : isEvaluating ? 'thinking' : 'ready'}`}>
              {getStatusLabel()}
            </div>
          </div>

          {/* Right Column: Continuous Conversation Log */}
          <div className="main-session-card" style={{ height: '450px', display: 'flex', flexDirection: 'column' }}>
            <div className="question-header">
              <span className="question-index">🎙️ Conversational Speech Session</span>
              <span style={{ fontSize: '.78rem', background: 'var(--accent-light, rgba(224,138,174,.1))', color: 'var(--accent, #e08aae)', padding: '3px 10px', borderRadius: '8px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.02em' }}>
                Continuous S2S
              </span>
            </div>

            {/* Rolling Chat Log */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted, #94a3b8)', padding: '40px 0', fontSize: '.9rem' }}>
                  Connecting voice line... Speak naturally when the visualizer turns green.
                </div>
              )}
              {messages.map((m, idx) => (
                <div 
                   key={idx} 
                   style={{ 
                     alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                     maxWidth: '80%',
                     background: m.sender === 'user' ? 'var(--accent-light, rgba(224,138,174,.12))' : 'var(--bg-surface, rgba(26,20,34,.6))',
                     border: m.sender === 'user' ? '1px solid var(--glass-border, rgba(255,255,255,.12))' : '1px solid var(--border-light, rgba(255,255,255,.04))',
                     borderRadius: m.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                     padding: '12px 16px',
                     fontSize: '.9rem',
                     lineHeight: '1.5',
                     color: 'var(--text-primary, #f8fafc)'
                   }}
                >
                  <strong style={{ display: 'block', fontSize: '.72rem', color: m.sender === 'user' ? 'var(--accent, #e08aae)' : 'var(--text-muted, #94a3b8)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.04em', fontFamily: 'JetBrains Mono, monospace' }}>
                    {m.sender === 'user' ? 'You' : 'Interviewer'}
                  </strong>
                  {m.text}
                </div>
              ))}
              
              {/* Live interim transcript display */}
              {localTranscript && (
                <div style={{ alignSelf: 'flex-end', maxWidth: '80%', opacity: .65, background: 'var(--bg-surface, rgba(26,20,34,.6))', padding: '12px 16px', borderRadius: '12px', fontSize: '.9rem', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                  {localTranscript}
                </div>
              )}
              {agentText && (
                <div style={{ alignSelf: 'flex-start', maxWidth: '80%', opacity: .8, background: 'var(--bg-surface, rgba(26,20,34,.6))', padding: '12px 16px', borderRadius: '12px', fontSize: '.9rem', color: 'var(--text-secondary, #e2e8f0)' }}>
                  {agentText}
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Fallback Text Input (Accessibility) */}
            <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-input, #171221)', border: '1px solid var(--border-light, rgba(255,255,255,.05))', borderRadius: '10px', padding: '8px 12px', marginBottom: '12px' }}>
              <input 
                type="text" 
                value={typeText} 
                onChange={(e) => setTypeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
                placeholder="Type answer here instead of speaking..."
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary, #f8fafc)', outline: 'none', fontSize: '.9rem' }}
              />
              <button 
                onClick={handleSendText} 
                className="action-btn primary" 
                style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                disabled={!typeText.trim()}
              >
                Send ➜
              </button>
            </div>

            {/* Audio Controls */}
            <div className="action-row" style={{ borderTop: '1px solid var(--border-light, rgba(255,255,255,.04))', paddingTop: '16px' }}>
              <button 
                onClick={toggleVoiceStream} 
                className="action-btn"
                style={{ background: isVoiceActive ? 'var(--error, #ef4444)' : 'var(--success, #10b981)', borderColor: 'transparent', color: '#fff', fontWeight: 'bold' }}
              >
                {isVoiceActive ? '🛑 Pause Interview' : '🎙️ Start Interview'}
              </button>
              <button onClick={toggleMute} className={`action-btn ${isMuted ? 'primary' : ''}`}>
                {isMuted ? '🎙️ Unmute Mic' : '🔇 Mute Mic'}
              </button>
              <button 
                onClick={handleEvaluateConversationalSession} 
                className="action-btn primary"
                disabled={isEvaluating}
              >
                {isEvaluating ? 'Evaluating...' : '🏁 Hang Up & Grade'}
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // 5. Step-by-Step mode rendering
  const currentQ = questions[currentIndex];
  const currentFeedback = feedbacks[currentIndex];

  return (
    <div className="ai-interviewer-wrapper">
      <div className="session-layout">
        
        {/* Left Column: Visualizer Orb */}
        <div className="visualizer-card">
          <div className={getOrbClass()}>
            <div className="orb-ring orb-ring-1"></div>
            <div className="orb-ring orb-ring-2"></div>
            <div className="orb-ring orb-ring-3"></div>
            <div className="orb-core"></div>
          </div>
          <div className={`status-indicator ${localIsSpeaking ? 'speaking' : localIsListening ? 'listening' : isLoadingQuestion || isEvaluating ? 'thinking' : 'ready'}`}>
            {getStatusLabel()}
          </div>
        </div>

        {/* Right Column: Question Content */}
        <div className="main-session-card">
          {currentQ ? (
            <>
              <div className="question-header">
                <span className="question-index">Question {currentIndex + 1} of 5</span>
                <span style={{ fontSize: '.78rem', background: 'var(--accent-light, rgba(224,138,174,.1))', color: 'var(--accent, #e08aae)', padding: '3px 10px', borderRadius: '8px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.02em' }}>
                  {currentQ.category}
                </span>
              </div>

              <div className="question-text-display">
                {agentError ? (
                  <span style={{ color: 'var(--status-error)' }}>{agentError}</span>
                ) : (
                  agentText || currentQ.text
                )}
              </div>

              {currentQ.hints?.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {currentQ.hints.map((hint, idx) => (
                    <span key={idx} style={{ fontSize: '.78rem', color: 'var(--text-muted, #94a3b8)', background: 'var(--bg-surface, rgba(26,20,34,.6))', border: '1px solid var(--border-light, rgba(255,255,255,.04))', padding: '5px 12px', borderRadius: '8px' }}>
                      💡 {hint}
                    </span>
                  ))}
                </div>
              )}

              <div className="live-transcript-box">
                <div style={{ fontSize: '.72rem', color: 'var(--text-secondary, #e2e8f0)', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 'bold', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.04em' }}>
                  Your Answer:
                </div>
                <textarea 
                  value={userAnswers[currentIndex] || ''} 
                  onChange={(e) => setUserAnswers(prev => ({ ...prev, [currentIndex]: e.target.value }))}
                  placeholder={localIsListening ? "Speak now... (listening)" : "Your transcript will appear here, or you can type directly."}
                  style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary, #f8fafc)', outline: 'none', resize: 'none', fontSize: '.85rem', fontFamily: "'JetBrains Mono', monospace" }}
                  rows={3}
                />
              </div>

              <div className="action-row">
                {!showFeedback ? (
                  <button 
                    onClick={handleEvaluateAnswer} 
                    disabled={isEvaluating || !(userAnswers[currentIndex]?.trim())}
                    className="action-btn primary"
                  >
                    {isEvaluating ? 'Evaluating...' : 'Grade & Get Feedback'}
                  </button>
                ) : (
                  <button onClick={handleNextQuestion} className="action-btn primary">
                    {currentIndex === 4 ? 'Complete Practice' : 'Next Question ➜'}
                  </button>
                )}
                {localIsConnected && !localIsListening && !localIsSpeaking && !showFeedback && (
                  <button onClick={() => agentRef.current?.startConversation()} className="action-btn">
                    🎙️ Restart Microphone
                  </button>
                )}
              </div>

              {showFeedback && currentFeedback && (
                <div className="feedback-box">
                  <div className="feedback-head">
                    <span style={{ fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>Evaluation Result</span>
                    <span className="feedback-score">{currentFeedback.score} / 10</span>
                  </div>

                  <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--text-secondary, #e2e8f0)', lineHeight: '1.6' }}>
                    {currentFeedback.feedback}
                  </p>

                  <div className="feedback-grid">
                    <div className="feedback-metric">
                      <strong style={{ color: 'var(--accent, #e08aae)', display: 'block', marginBottom: '4px' }}>Strengths</strong>
                      <ul style={{ margin: 0, paddingLeft: '14px', color: 'var(--text-secondary, #e2e8f0)' }}>
                        {currentFeedback.strengths?.map((s, idx) => <li key={idx}>{s}</li>)}
                      </ul>
                    </div>

                    <div className="feedback-metric">
                      <strong style={{ color: 'var(--error, #ef4444)', display: 'block', marginBottom: '4px' }}>Improvements</strong>
                      <ul style={{ margin: 0, paddingLeft: '14px', color: 'var(--text-secondary, #e2e8f0)' }}>
                        {currentFeedback.suggestions?.map((s, idx) => <li key={idx}>{s}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '40px 0' }}>
              <div className="thinking-spinner" style={{ width: 40, height: 40 }} />
              <div style={{ color: 'var(--text-secondary, #e2e8f0)', fontSize: '.9rem' }}>Preparing your custom interview questions...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}