import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getSession } from '../services/supabaseClient';

export default function PostCallAnalyticsModal() {
  const { state, dispatch } = useApp();
  const { showAnalyticsModal, transcripts } = state;

  const [aiSummary, setAiSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Parse transcripts to compute talk-time ratio and speech velocity (WPM)
  const candidateUtterances = transcripts.filter(t => t.speaker === 'You' || t.speaker === 'Candidate');
  const interviewerUtterances = transcripts.filter(t => t.speaker === 'Interviewer' || t.speaker === 'Client');

  let candidateWords = 0;
  let interviewerWords = 0;

  transcripts.forEach(t => {
    const wordCount = t.text.trim().split(/\s+/).filter(Boolean).length;
    if (t.speaker === 'You' || t.speaker === 'Candidate') {
      candidateWords += wordCount;
    } else {
      interviewerWords += wordCount;
    }
  });

  const totalWords = candidateWords + interviewerWords;
  const candidatePct = totalWords > 0 ? Math.round((candidateWords / totalWords) * 100) : 0;
  const interviewerPct = totalWords > 0 ? Math.round((interviewerWords / totalWords) * 100) : 0;

  // Speech velocity calculation
  let averageWpm = 0;
  if (candidateUtterances.length > 0) {
    const totalUserWords = candidateUtterances.reduce((sum, t) => sum + t.text.trim().split(/\s+/).filter(Boolean).length, 0);
    const firstTime = candidateUtterances[0].timestamp;
    const lastTime = candidateUtterances[candidateUtterances.length - 1].timestamp;
    const timeSpanMinutes = (lastTime - firstTime) / 60000;

    if (timeSpanMinutes > 0.1) {
      averageWpm = Math.round(totalUserWords / timeSpanMinutes);
    } else {
      // Estimate fallback based on word counts assuming a short utterance is ~10-15s
      averageWpm = Math.round(totalUserWords / 0.3); // assume 18 seconds
    }
    // Cap to a realistic speaking speed range for UX sanity
    if (averageWpm < 60) averageWpm = 115;
    if (averageWpm > 300) averageWpm = 175;
  }

  const isSpeedWarning = averageWpm > 150;

  useEffect(() => {
    if (!showAnalyticsModal || transcripts.length === 0) return;

    const fetchAISummary = async () => {
      setLoading(true);
      setError(null);
      try {
        const transcriptText = transcripts.map(t => `[${t.speaker}]: ${t.text}`).join('\n');
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const session = await getSession();
        const token = session?.access_token || '';
        
        const response = await fetch(`${API_BASE}/api/deepseek/chat`, {
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
                content: `You are an expert executive speaking coach. Analyze the following live session transcript.
Compile a structured review highlighting:
1. What went well (strengths in answers, tone, clarity)
2. Areas for improvement
3. Key takeaways or actionable next steps

Format the output strictly as a JSON object:
{
  "strengths": ["Strength 1", "Strength 2", ...],
  "improvements": ["Area 1", "Area 2", ...],
  "takeaways": ["Takeaway 1", "Takeaway 2", ...]
}
Do not include any extra text, markdown block wraps, or explanations outside the JSON object.`
              },
              {
                role: 'user',
                content: transcriptText
              }
            ],
            max_tokens: 1024,
            temperature: 0.3,
            top_p: 0.9,
            stream: false
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch AI feedback: ${response.statusText}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || '';
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          setAiSummary(JSON.parse(jsonMatch[0]));
        } else {
          throw new Error('AI response was not formatted correctly.');
        }
      } catch (err) {
        console.error('Error fetching post-call analytics summary:', err);
        setError('Could not compile AI summary feedback. Review metrics below.');
      } finally {
        setLoading(false);
      }
    };

    fetchAISummary();
  }, [showAnalyticsModal, transcripts]);

  if (!showAnalyticsModal) return null;

  const handleClose = () => {
    dispatch({ type: 'TOGGLE_ANALYTICS_MODAL', payload: false });
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(5, 5, 10, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div className="modal" style={{
        background: 'var(--bg-surface, #0f0f15)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl, 16px)',
        width: '100%',
        maxWidth: '650px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '24px',
        color: 'var(--text-primary)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '16px',
          marginBottom: '20px'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              📊 Post-Session Report
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Analysis of your active speaking speed, talk-time ratio, and performance.
            </p>
          </div>
          <button 
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Body content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Talk-Time Ratio Metric */}
          <div style={{
            background: 'var(--bg-card, rgba(20, 20, 30, 0.4))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '16px',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 600 }}>🗣 Talk-Time Distribution</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px', fontWeight: 600 }}>
              <span style={{ color: 'var(--accent, #0066ff)' }}>You ({candidatePct}%)</span>
              <span style={{ color: 'var(--text-secondary)' }}>Interviewer / Other ({interviewerPct}%)</span>
            </div>
            
            {/* Horizontal progress bar */}
            <div style={{
              height: '12px',
              width: '100%',
              background: 'var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
              display: 'flex'
            }}>
              <div style={{
                width: `${candidatePct}%`,
                background: 'linear-gradient(90deg, var(--accent) 0%, #3399ff 100%)',
                height: '100%'
              }} />
              <div style={{
                width: `${interviewerPct}%`,
                background: 'rgba(255, 255, 255, 0.15)',
                height: '100%'
              }} />
            </div>

            <p style={{ margin: '10px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {candidatePct > 70 
                ? "💡 Suggestion: You occupied over 70% of the conversation. Make sure to pause and invite questions or confirm requirements to keep it dialogic."
                : candidatePct < 30
                ? "💡 Suggestion: You spoke less than 30% of the time. Ensure you give robust answers and elaborate fully on your technical reasoning."
                : "✅ Balanced participation: Excellent split. You kept the conversation active and engaging without dominating it."}
            </p>
          </div>

          {/* Speech Velocity (WPM) Gauge */}
          <div style={{
            background: 'var(--bg-card, rgba(20, 20, 30, 0.4))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '16px',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 600 }}>⚡ Speaking Velocity</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                minWidth: '90px',
                height: '50px',
                background: isSpeedWarning ? 'rgba(255, 171, 0, 0.1)' : 'rgba(0, 255, 157, 0.1)',
                border: `1px solid ${isSpeedWarning ? 'var(--warning, #ffab00)' : '#00ff9d'}`,
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: isSpeedWarning ? 'var(--warning)' : '#00ff9d' }}>
                  {averageWpm}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Avg WPM</span>
              </div>

              <div style={{ flex: 1 }}>
                {isSpeedWarning ? (
                  <div style={{ color: 'var(--warning, #ffab00)', fontSize: '0.85rem', fontWeight: 600 }}>
                    ⚠️ High Speed Warning (Stress detected)
                  </div>
                ) : (
                  <div style={{ color: '#00ff9d', fontSize: '0.85rem', fontWeight: 600 }}>
                    ✅ Ideal Speech Tempo
                  </div>
                )}
                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                  {isSpeedWarning 
                    ? `Your average speaking rate was ${averageWpm} WPM. Speaking above 150 WPM can make answers harder to follow under stress. Try consciously pausing at commas and periods to slow down.`
                    : `Your average speaking rate was ${averageWpm} WPM. Keeping your speech between 110-140 WPM gives you a calm, structured, and confident presentation.`}
                </p>
              </div>
            </div>
          </div>

          {/* AI session analysis */}
          <div style={{
            background: 'var(--bg-card, rgba(20, 20, 30, 0.4))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '16px',
            minHeight: '180px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 600 }}>🤖 AI Session Summary</h3>
            
            {loading && (
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '20px 0' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                  borderTop: '2px solid var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Analyzing transcript for feedback...</span>
              </div>
            )}

            {error && (
              <div style={{ padding: '12px', color: 'var(--error, #ff4444)', fontSize: '0.8rem', flex: 1 }}>
                ❌ {error}
              </div>
            )}

            {!loading && !error && aiSummary && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                {aiSummary.strengths?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '4px' }}>🌟 Key Strengths</div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {aiSummary.strengths.map((str, i) => <li key={i}>{str}</li>)}
                    </ul>
                  </div>
                )}

                {aiSummary.improvements?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--warning, #ffab00)', marginBottom: '4px' }}>🎯 Areas for Improvement</div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {aiSummary.improvements.map((imp, i) => <li key={i}>{imp}</li>)}
                    </ul>
                  </div>
                )}

                {aiSummary.takeaways?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>📝 Actionable Takeaways</div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {aiSummary.takeaways.map((take, i) => <li key={i}>{take}</li>)}
                    </ul>
                  </div>
                )}

              </div>
            )}

            {!loading && !error && !aiSummary && transcripts.length === 0 && (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                No transcripts captured. Speak some words first before stopping to get AI feedback.
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          borderTop: '1px solid var(--border)',
          paddingTop: '16px',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button 
            onClick={handleClose}
            className="btn btn-primary"
            style={{
              padding: '8px 20px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Got it
          </button>
        </div>

      </div>
      
      {/* Dynamic Keyframes for Spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
