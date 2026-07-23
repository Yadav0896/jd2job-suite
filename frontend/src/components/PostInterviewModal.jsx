import { useState, useEffect } from 'react';
import { getSession } from '../services/supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── STAR Score Badge ─────────────────────────────────────────────────────
function ScoreBadge({ label, score, color }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        border: `3px solid ${color}`,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 6px',
        fontSize: '1.2rem', fontWeight: 800, color,
      }}>{score}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function PostInterviewModal({ isOpen, onClose, transcripts, jd, resume }) {
  const [activeTab, setActiveTab] = useState('score');
  const [emailDraft, setEmailDraft] = useState('');
  const [scoreData, setScoreData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyStatus, setCopyStatus] = useState('Copy Draft');
  const [downloadNote, setDownloadNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab('score');
      generateAll();
    } else {
      setEmailDraft('');
      setScoreData(null);
    }
  }, [isOpen]);

  const generateAll = async () => {
    setIsGenerating(true);
    const fullTranscript = (transcripts || []).map(t => `${t.speaker}: ${t.text}`).join('\n');
    if (!fullTranscript.trim()) {
      setIsGenerating(false);
      setScoreData({ overall: 7, wpm: 8, star: 6, keywords: 7, summary: 'No transcript available for this session.' });
      return;
    }

    try {
      const session = await getSession();
      const token = session?.access_token || '';
      const headers = { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' };

      // Request scoring + email in one call to save time
      const scoringPrompt = `Analyze this interview conversation and return a JSON object.
TRANSCRIPT:
${fullTranscript.substring(0, 3000)}

JOB DESCRIPTION:
${(jd || 'N/A').substring(0, 800)}

Return ONLY valid JSON:
{
  "overall": <score 1-10>,
  "wpm": <speaking pace score 1-10, 10=perfect 130-160wpm>,
  "star": <STAR structure adherence 1-10>,
  "keywords": <relevant keyword usage 1-10>,
  "summary": "<2-3 sentence constructive feedback>",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["area 1", "area 2"],
  "thankYouEmail": "<full professional thank-you email text>"
}`;

      const res = await fetch(`${API_BASE}/api/deepseek/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a professional interview coach. Analyze interview transcripts and give structured feedback as JSON.' },
            { role: 'user', content: scoringPrompt }
          ],
          stream: false
        })
      });
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setScoreData({
          overall: parsed.overall || 7,
          wpm: parsed.wpm || 7,
          star: parsed.star || 7,
          keywords: parsed.keywords || 7,
          summary: parsed.summary || '',
          strengths: parsed.strengths || [],
          improvements: parsed.improvements || [],
        });
        setEmailDraft(parsed.thankYouEmail || '');
      }
    } catch (err) {
      console.error('Post-interview analysis failed:', err);
      setScoreData({ overall: 7, wpm: 7, star: 7, keywords: 7, summary: 'Analysis unavailable — API error.', strengths: [], improvements: [] });
      setEmailDraft('Unable to generate email draft. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadTranscript = () => {
    const filtered = (transcripts || []).filter(t => t.speaker === 'You' || t.speaker === 'Interviewer');
    if (!filtered.length) {
      setDownloadNote('⚠ No conversation recorded yet.');
      setTimeout(() => setDownloadNote(''), 3000);
      return;
    }
    const transcriptText = filtered.map(t => {
      const time = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${time}] ${t.speaker}: ${t.text}`;
    }).join('\n\n');
    const fileName = `interview-transcript-${Date.now()}.txt`;
    const blob = new Blob([`--- INTERVIEW TRANSCRIPT ---\nDate: ${new Date().toLocaleDateString()}\n\n` + transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.setAttribute('download', fileName); link.style.display = 'none';
    document.body.appendChild(link); link.click();
    setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); setDownloadNote(`✓ ${fileName}`); setTimeout(() => setDownloadNote(''), 5000); }, 100);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(emailDraft);
    setCopyStatus('✓ Copied!');
    setTimeout(() => setCopyStatus('Copy Draft'), 2000);
  };

  const scoreColor = (s) => {
    if (s >= 8) return '#10b981';
    if (s >= 6) return '#f59e0b';
    return '#ef4444';
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="post-interview-card modal-3d" style={{ maxWidth: 640, width: '94vw' }}>

        {/* Header */}
        <div className="panel-header" style={{ borderBottom: '1px solid var(--border)', padding: '20px' }}>
          <div className="panel-title-group">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              📊 Session Report
            </h2>
            <p className="panel-subtitle">Performance score + follow-up email</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {downloadNote && <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>{downloadNote}</span>}
            <button className="header-btn" onClick={handleDownloadTranscript}>📥 Transcript</button>
            <button className="clear-btn" onClick={onClose} style={{ padding: '8px 12px' }}>Close</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          {[{ id: 'score', label: '🏆 Performance Score' }, { id: 'email', label: '✉️ Follow-up Email' }].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '12px', border: 'none', background: 'none',
                color: activeTab === tab.id ? 'var(--accent, #e08aae)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '0.85rem', cursor: 'pointer',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent, #e08aae)' : '2px solid transparent',
                transition: 'all 0.18s',
              }}
            >{tab.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 320, maxHeight: 420 }}>
          {isGenerating ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div className="thinking-spinner" style={{ margin: '0 auto 20px' }} />
              <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Analysing your session…</p>
            </div>
          ) : activeTab === 'score' ? (
            <div style={{ padding: '24px 20px' }}>
              {scoreData && (
                <>
                  {/* Big Overall Score */}
                  <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      border: `4px solid ${scoreColor(scoreData.overall)}`,
                      background: `${scoreColor(scoreData.overall)}18`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 8px',
                      fontSize: '2rem', fontWeight: 900, color: scoreColor(scoreData.overall),
                    }}>{scoreData.overall}</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>Overall Score</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{scoreData.summary}</div>
                  </div>

                  {/* Sub-scores */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    <ScoreBadge label="Speaking Pace" score={scoreData.wpm} color={scoreColor(scoreData.wpm)} />
                    <ScoreBadge label="STAR Structure" score={scoreData.star} color={scoreColor(scoreData.star)} />
                    <ScoreBadge label="Keyword Usage" score={scoreData.keywords} color={scoreColor(scoreData.keywords)} />
                  </div>

                  {/* Strengths */}
                  {scoreData.strengths?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--success)', marginBottom: 6 }}>✅ Strengths</div>
                      {scoreData.strengths.map((s, i) => (
                        <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4, paddingLeft: 12, borderLeft: '2px solid var(--success)' }}>
                          {s}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Improvements */}
                  {scoreData.improvements?.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--warning, #f59e0b)', marginBottom: 6 }}>⚠️ Improve</div>
                      {scoreData.improvements.map((imp, i) => (
                        <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4, paddingLeft: 12, borderLeft: '2px solid var(--warning, #f59e0b)' }}>
                          {imp}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="email-draft-area" style={{ padding: 20, whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
              {emailDraft || 'No email generated yet.'}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {activeTab === 'email' && (
          <div style={{ padding: '16px 20px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '10px' }} onClick={handleCopy} disabled={isGenerating}>
              {copyStatus}
            </button>
            <button className="btn btn-ghost" style={{ padding: '10px 20px' }} onClick={generateAll}>
              🔄 Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
