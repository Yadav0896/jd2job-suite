import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import ScreenPreview from './ScreenPreview';

import ReactMarkdown from 'react-markdown';

export default function AnswerPanel() {
    const { state, dispatch } = useApp();
  const { currentAnswer, partialAnswer, reasoningText, isThinking, answerReady, latencyMetrics, answerMode, prepAnalysis } = state;
  const [copied, setCopied] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const contentRef = useRef(null);

  const modes = [
    { 
      id: 'comprehensive', 
      label: 'All', 
      icon: (
        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      )
    },
    { 
      id: 'points', 
      label: 'Points', 
      icon: (
        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )
    },
    { 
      id: 'narrative', 
      label: 'Narrative', 
      icon: (
        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    },
    { 
      id: 'hints', 
      label: 'Hints', 
      icon: (
        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    },
  ];

  useEffect(() => {
    if (contentRef.current) {
      const timer = setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [partialAnswer, currentAnswer, answerReady]);

  const handleCopy = async () => {
    let textToCopy = '';
    
    if (answerMode === 'comprehensive' || answerMode === 'narrative') {
      textToCopy += currentAnswer.answer + '\n\n';
    }
    if ((answerMode === 'comprehensive' || answerMode === 'points') && currentAnswer.bulletPoints?.length) {
      textToCopy += 'Key Points:\n' + currentAnswer.bulletPoints.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\n';
    }
    if ((answerMode === 'comprehensive' || answerMode === 'hints') && currentAnswer.hints?.length) {
      textToCopy += 'Quick Hints:\n' + currentAnswer.hints.map(h => `• ${h}`).join('\n');
    }

    try {
      await navigator.clipboard.writeText(textToCopy.trim() || currentAnswer.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const hasAnswer = currentAnswer.answer
    || currentAnswer.bulletPoints?.length
    || currentAnswer.hints?.length;

  return (
    <>
      <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="panel-title-group" style={{ WebkitAppRegion: 'drag', flex: 1 }}>
            <span className="panel-title">AI Suggestions</span>
            <span className="panel-subtitle">Tailored for you</span>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', WebkitAppRegion: 'no-drag' }}>
            {navigator.userAgent.toLowerCase().includes('electron') && (
              <button 
                className="copy-btn" 
                style={{ backgroundColor: 'rgba(255, 68, 68, 0.2)', color: '#ff4444', borderColor: '#ff4444' }}
                onClick={() => { if (window.require) window.require('electron').ipcRenderer.send('close-app'); }}
              >
                ✖ Close App
              </button>
            )}
            {answerReady && hasAnswer && (
              <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
                {copied ? '✓ Copied' : '📋 Copy view'}
              </button>
            )}
          </div>
        </div>

        <div className="answer-mode-tabs">
          {modes.map(mode => (
            <button
              key={mode.id}
              className={`mode-pill ${answerMode === mode.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_ANSWER_MODE', payload: mode.id })}
            >
              <span className="mode-icon">{mode.icon}</span>
              <span className="mode-label">{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-content" ref={contentRef}>
        
        {/* Screen Share Live Preview */}
        <ScreenPreview />


        
        {/* Real-time reasoning stream */}
        {reasoningText && (
          <div className="reasoning-card">
            <div className="reasoning-label">
              <svg style={{ width: '14px', height: '14px', display: 'inline-block', verticalAlign: 'middle' }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span style={{ marginLeft: '6px', verticalAlign: 'middle' }}>AI Reasoning</span>
            </div>
            <div className="reasoning-text">
              {reasoningText}
              {!answerReady && !partialAnswer && <span className="cursor-blink" />}
            </div>
          </div>
        )}

        {/* Thinking spinner */}
        {isThinking && !partialAnswer && (
          <div className="thinking-card">
            <div className="thinking-spinner" />
            <div className="thinking-content">
              <div className="thinking-title">Generating answer…</div>
              <div className="thinking-subtitle">Analyzing context and your background</div>
            </div>
          </div>
        )}

        {/* Streaming partial answer */}
        {partialAnswer && !answerReady && (
          <div className="streaming-card">
            <div className="streaming-label">
              <span className="live-dot pulse" style={{ background: 'var(--accent)' }} />
              Generating
            </div>
            {partialAnswer}
            <span className="cursor-blink" />
          </div>
        )}

        {/* Answer ready */}
        {answerReady && hasAnswer && (
          <>
            <div className="answer-ready-bar">
              <span>✓</span>
              <span>Answer optimized for your {answerMode} view</span>
              {latencyMetrics.llmLatency > 0 && (
                <span className="latency">
                  {latencyMetrics.llmLatency.toFixed(1)}s
                </span>
              )}
            </div>

            <div className="answer-card">

              {(answerMode === 'comprehensive' || answerMode === 'narrative') && currentAnswer.answer && (
                <div className="answer-section">
                  <div className="answer-section-label">Summary</div>
                  <div className="premium-markdown">
                    <ReactMarkdown>{currentAnswer.answer}</ReactMarkdown>
                  </div>
                </div>
              )}

              {(answerMode === 'comprehensive' || answerMode === 'points') && currentAnswer.bulletPoints?.length > 0 && (
                <div className="answer-section">
                  <div className="answer-section-label">Key Points</div>
                  <div className="bullet-list">
                    {currentAnswer.bulletPoints.map((pt, i) => (
                      <div key={i} className={`bullet-item ${/^[STAR]:/.test(pt) ? 'is-star' : ''}`}>
                        {/^[STAR]:/.test(pt) ? (
                          <>
                            <span className={`star-letter ${pt[0].toLowerCase()}`}>{pt[0]}</span>
                            <span><ReactMarkdown>{pt.slice(2).trim()}</ReactMarkdown></span>
                          </>
                        ) : (
                          <>
                            <span className="bullet-num">{i + 1}</span>
                            <span><ReactMarkdown>{pt}</ReactMarkdown></span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(answerMode === 'comprehensive' || answerMode === 'hints') && currentAnswer.hints?.length > 0 && (
                <div className="answer-section">
                  <div className="answer-section-label">Quick Hints</div>
                  <div className="hints-wrap">
                    {currentAnswer.hints.map((hint, i) => (
                      <span key={i} className="hint-chip">{hint}</span>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </>
        )}

        {/* Empty state */}
        {!isThinking && !partialAnswer && !hasAnswer && (
          <div className="empty-state" style={{ width: '100%' }}>
            {prepAnalysis ? (
              <div className="prep-analysis-container" style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                marginBottom: '20px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '8px'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>🎯</span>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Role Prep Insights</h3>
                </div>

                {prepAnalysis.gaps?.length > 0 && (
                  <div style={{
                    background: 'rgba(255, 171, 0, 0.05)',
                    borderLeft: '3px solid var(--warning, #ffab00)',
                    padding: '12px',
                    borderRadius: '0 var(--radius-md) var(--radius-md) 0'
                  }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--warning, #ffab00)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⚠️ Estimated Resume Gaps vs JD
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {prepAnalysis.gaps.map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {prepAnalysis.questions?.length > 0 && (
                  <div style={{
                    background: 'rgba(0, 102, 255, 0.05)',
                    borderLeft: '3px solid var(--accent)',
                    padding: '12px',
                    borderRadius: '0 var(--radius-md) var(--radius-md) 0'
                  }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      💡 Predicted Interview Questions
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {prepAnalysis.questions.map((q, i) => (
                        <li key={i} style={{ fontStyle: 'italic' }}>"{q}"</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="empty-icon">💡</div>
                <div className="empty-title">Waiting for a question</div>
                <div className="empty-desc">
                  When the interviewer asks a question, AI-generated talking points
                  will appear here in real time.
                </div>
              </>
            )}

            <button 
              className="force-answer-btn"
              onClick={() => dispatch({ type: 'TRIGGER_MANUAL_ANSWER' })}
              style={{
                margin: '12px 0 20px 0',
                padding: '12px 24px',
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0, 102, 255, 0.3)',
                width: '100%',
                justifyContent: 'center'
              }}
            >
              <span>⚡</span> Force AI Answer
            </button>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              width: '100%', maxWidth: 260
            }}>
              {[
                { icon: '🎯', text: 'Answers are tailored to your resume' },
                { icon: '⚡', text: 'Streams as the AI generates — no waiting' },
                { icon: '📋', text: 'Copy the full answer with one click' },
              ].map(({ icon, text }) => (
                <div key={text} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Manual Input Footer */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-main)',
        display: 'flex',
        gap: '8px',
        borderBottomLeftRadius: 'var(--radius-lg)',
        borderBottomRightRadius: 'var(--radius-lg)'
      }}>
        <input 
          type="text" 
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && manualInput.trim()) {
              const text = manualInput.trim();
              dispatch({
                type: 'ADD_TRANSCRIPT',
                payload: {
                  speaker: 'interviewer',
                  text: text,
                  timestamp: Date.now()
                }
              });
              dispatch({
                type: 'TRIGGER_CUSTOM_QUESTION',
                payload: text
              });
              setManualInput('');
            }
          }}
          placeholder="Type a manual question..." 
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            outline: 'none',
            WebkitAppRegion: 'no-drag'
          }}
        />
        <button 
          onClick={() => {
            if (manualInput.trim()) {
              const text = manualInput.trim();
              dispatch({
                type: 'ADD_TRANSCRIPT',
                payload: {
                  speaker: 'interviewer',
                  text: text,
                  timestamp: Date.now()
                }
              });
              dispatch({
                type: 'TRIGGER_CUSTOM_QUESTION',
                payload: text
              });
              setManualInput('');
            }
          }}
          className="hero-primary-btn"
          style={{ padding: '8px 16px', fontSize: '0.9rem', WebkitAppRegion: 'no-drag' }}
        >
          Ask AI
        </button>
      </div>
    </>
  );
}
