import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useApp } from '../context/AppContext';
import KeywordTracker from './KeywordTracker';

const QUESTION_WORDS = ['?', 'what', 'how', 'why', 'when', 'where', 'who',
  'which', 'describe', 'explain', 'tell me', 'walk me', 'give me', 'can you',
  'could you', 'would you', 'have you'];

function isQuestion(text) {
  const t = text.toLowerCase();
  return QUESTION_WORDS.some(w => t.includes(w));
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function SpeakerBubble({ item }) {
  const { state, dispatch } = useApp();
  const { platformMode } = state;
  const question = isQuestion(item.text);
  const isYou     = item.speaker === 'You';
  const isScreen  = item.speaker === 'Screen';
  const isCopilot = item.speaker === 'Copilot';

  const speakerColor = isScreen  ? 'var(--speaker-screen)'
                     : isYou     ? 'var(--speaker-you)'
                     : isCopilot ? 'var(--speaker-copilot)'
                     :             'var(--speaker-ivr)';

  const bubbleCls = isScreen  ? 'bubble screen'
                  : isYou     ? 'bubble you'
                  : isCopilot ? 'bubble copilot'
                  :             `bubble interviewer${question ? ' question' : ''}`;

  const rowCls = isYou    ? 'bubble-row you-row' 
               : isScreen ? 'bubble-row screen-row' 
               : isCopilot? 'bubble-row copilot-row'
               :            'bubble-row interviewer-row';

  const getSpeakerLabel = (speaker) => {
    if (speaker !== 'Interviewer') return speaker;
    if (platformMode === 'sales') return 'Prospect';
    if (platformMode === 'meeting') return 'Speaker';
    return 'Interviewer';
  };

  return (
    <div className={rowCls}>
      <div className="bubble-meta" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <span className="legend-dot" style={{ background: speakerColor }} />
        <span className="bubble-speaker" style={{ color: speakerColor }}>
          {getSpeakerLabel(item.speaker)}
        </span>
        <span className="bubble-time">{formatTime(item.timestamp)}</span>
        {question && !isYou && !isScreen && (
          <span className="bubble-question-tag">
            {platformMode === 'sales' ? 'Objection' : 'Question'}
          </span>
        )}
        
        {/* Ask AI Trigger Button */}
        {!isCopilot && (
          <button
            onClick={() => dispatch({ type: 'TRIGGER_CUSTOM_QUESTION', payload: item.text })}
            style={{
              marginLeft: 'auto',
              background: 'rgba(185, 63, 255, 0.15)',
              border: '1px solid rgba(185, 63, 255, 0.4)',
              color: '#d699ff',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
              fontFamily: 'system-ui, sans-serif'
            }}
            title="Force AI to analyze and answer this specific question"
            className="ask-ai-bubble-btn"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(185, 63, 255, 0.3)';
              e.currentTarget.style.borderColor = 'rgba(185, 63, 255, 0.7)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(185, 63, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(185, 63, 255, 0.4)';
              e.currentTarget.style.color = '#d699ff';
            }}
          >
            ❓ Ask AI
          </button>
        )}
      </div>
      <div className={bubbleCls}>
        {isCopilot ? (
          <div className="premium-markdown" style={{ fontSize: '0.9em' }}>
            <ReactMarkdown>{item.text}</ReactMarkdown>
          </div>
        ) : (
          item.text
        )}
      </div>
    </div>
  );
}

function EmptyState({ isRecording, resumeData, platformMode, jobDescription, assignmentDocs }) {
  if (platformMode === 'sales') {
    return (
      <div className="empty-state">
        <div className="empty-icon">💰</div>
        <div className="empty-title">No sales discussion yet</div>
        <div className="empty-desc">
          Start recording. The AI will monitor the discussion, highlight buying signals, and suggest objection handling options.
        </div>
        <div className="step-guide">
          <div className="step-item">
            <div className="step-num done">✓</div>
            <div className="step-text">
              <strong>Sales mode active</strong>. Prepare target pricing or competitor names.
            </div>
          </div>
          <div className="step-item">
            <div className={`step-num ${isRecording ? 'done' : ''}`}>
              {isRecording ? '✓' : '1'}
            </div>
            <div className="step-text">
              <strong>Click the start button</strong> below to begin your sales stream.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (platformMode === 'meeting') {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <div className="empty-title">No meeting audio yet</div>
        <div className="empty-desc">
          Start recording to track the agenda, capture action items, and detect technical or requirement gaps.
        </div>
        <div className="step-guide">
          <div className="step-item">
            <div className="step-num done">✓</div>
            <div className="step-text">
              <strong>Meeting mode active</strong>. Load your agenda context.
            </div>
          </div>
          <div className="step-item">
            <div className={`step-num ${isRecording ? 'done' : ''}`}>
              {isRecording ? '✓' : '1'}
            </div>
            <div className="step-text">
              <strong>Click the start button</strong> below to stream audio.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <div className="empty-icon">🎯</div>
      <div className="empty-title">Ready to start your interview</div>
      <div className="empty-desc">
        Follow these steps and the AI will give you real-time answers tailored to your resume and the job.
      </div>
      <div className="step-guide">
        <div className="step-item">
          <div className={`step-num ${resumeData ? 'done' : ''}`}>
            {resumeData ? '✓' : '1'}
          </div>
          <div className="step-text">
            <strong>Upload your resume</strong> — click 📄 Resume above
          </div>
        </div>
        <div className="step-item">
          <div className={`step-num ${jobDescription ? 'done' : ''}`}>
            {jobDescription ? '✓' : '2'}
          </div>
          <div className="step-text">
            <strong>Paste the job description</strong> — click 📋 JD above
          </div>
        </div>
        <div className="step-item">
          <div className={`step-num ${(assignmentDocs || []).length > 0 ? 'done' : ''}`}>
            {(assignmentDocs || []).length > 0 ? '✓' : '3'}
          </div>
          <div className="step-text">
            <strong>Upload assignments (optional)</strong> — click 📝 Assignments above
          </div>
        </div>
        <div className="step-item">
          <div className={`step-num ${isRecording ? 'done' : ''}`}>
            {isRecording ? '✓' : '4'}
          </div>
          <div className="step-text">
            <strong>Click the red record button</strong> below to start. AI listens and suggests answers instantly.
          </div>
        </div>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 16 }}>
        💡 Pro tip: The AI uses your resume + JD + assignments together. The more context, the better the answers.
      </p>
    </div>
  );
}

export default function TranscriptPanel() {
  const { state, dispatch } = useApp();
  const { transcripts, partialTranscript, questionDetected,
          latencyMetrics, resumeData, isRecording, platformMode } = state;

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, partialTranscript]);

  const isEmpty = transcripts.length === 0 && !partialTranscript;

  return (
    <>
      <div className="panel-header">
        <div className="panel-title-group">
          <span className="panel-title">Conversation</span>
          <span className="panel-subtitle">
            {platformMode === 'sales' ? "What's being said on the call"
             : platformMode === 'meeting' ? "What's being said in the meeting"
             : "What's being said in the interview"}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Speaker legend */}
          <div className="speaker-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ background: 'var(--speaker-ivr)' }} />
              {platformMode === 'sales' ? 'Prospect' : platformMode === 'meeting' ? 'Speaker' : 'Interviewer'}
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ background: 'var(--speaker-you)' }} />
              You
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ background: 'var(--speaker-copilot)' }} />
              Copilot
            </div>
          </div>
          {transcripts.length > 0 && (
            <button className="clear-btn" onClick={() => dispatch({ type: 'CLEAR_TRANSCRIPTS' })}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="panel-content" ref={scrollRef}>
        <KeywordTracker />
        {isEmpty ? (
          <EmptyState
            isRecording={isRecording}
            resumeData={resumeData}
            platformMode={platformMode}
            jobDescription={state.jobDescription}
            assignmentDocs={state.assignmentDocs}
          />
        ) : (
          <>
            {/* Question detected indicator */}
            {questionDetected && (
              <div className="question-banner">
                <span className="live-dot pulse" />
                {platformMode === 'sales' ? 'Objection detected — sourcing battlecard…' : 'Question detected — generating answer…'}
                {latencyMetrics.sttLatency > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    STT {(latencyMetrics.sttLatency * 1000).toFixed(0)} ms
                  </span>
                )}
              </div>
            )}

            {/* Final transcripts */}
            {transcripts.map((item, i) => (
              <SpeakerBubble key={i} item={item} />
            ))}

            {/* Live partial transcript */}
            {partialTranscript && (
              <div className="bubble-row">
                <div className="bubble-meta">
                  <span className="typing-dot" />
                  <span className="bubble-speaker" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Listening…
                  </span>
                </div>
                <div className="bubble partial">
                  {partialTranscript}
                  <span className="cursor-blink" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
