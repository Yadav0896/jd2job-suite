import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getSession } from '../services/supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const LOCAL_SESSIONS_KEY = 'jd2job_local_sessions';

function loadLocalSessions() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessionLocally(sessionData) {
  try {
    const sessions = loadLocalSessions();
    // Avoid duplicates
    const idx = sessions.findIndex(s => s.id === sessionData.id);
    if (idx >= 0) sessions[idx] = sessionData;
    else sessions.unshift(sessionData);
    // Cap at 50 sessions
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions.slice(0, 50)));
  } catch { /* localStorage full/unavailable */ }
}

function formatDate(ts) {
  try { return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return ts || 'Unknown'; }
}

function ScorePill({ score }) {
  const color = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444';
  if (!score) return null;
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 99,
      background: `${color}18`, border: `1px solid ${color}`,
      color, fontSize: '0.72rem', fontWeight: 700,
    }}>{score}/10</span>
  );
}

export default function SessionArchive({ onClose }) {
  const { state } = useApp();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await getSession();
      const token = session?.access_token;
      const userId = state.user?.id;
      
      if (userId) {
        try {
          const res = await fetch(`${API_BASE}/api/supabase/sessions/${userId}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
              setSessions(data);
              setLoading(false);
              return;
            }
          }
        } catch { /* Supabase unavailable — fall through to local */ }
      }

      // Fallback: load from localStorage
      const localSessions = loadLocalSessions();
      setSessions(localSessions);
      if (localSessions.length === 0) setError('No saved sessions found. Transcripts are saved locally.');
    } catch (e) {
      // Last resort: localStorage
      const localSessions = loadLocalSessions();
      setSessions(localSessions);
      if (localSessions.length === 0) setError('No saved sessions found.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-3d" style={{ maxWidth: 680, width: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', padding: '18px 20px' }}>
          <div>
            <div className="modal-title">📂 Session Archive</div>
            <div className="modal-subtitle">Past interview sessions and their transcripts</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="header-btn" onClick={loadSessions}>↻ Refresh</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sessions List */}
          <div style={{
            width: 240, flexShrink: 0, overflowY: 'auto',
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-surface)',
          }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="thinking-spinner" style={{ margin: '0 auto 12px' }} />
                Loading…
              </div>
            ) : error ? (
              <div style={{ padding: 16, fontSize: '0.8rem', color: 'var(--error, #ef4444)' }}>
                {error}
              </div>
            ) : sessions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
                No sessions yet
              </div>
            ) : sessions.map(s => (
              <div
                key={s.id}
                onClick={() => setSelected(s)}
                style={{
                  padding: '12px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selected?.id === s.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                  borderLeft: selected?.id === s.id ? '3px solid var(--primary)' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {s.mode || 'Interview'} Session
                  </div>
                  {s.score && <ScorePill score={s.score} />}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                  {formatDate(s.created_at)}
                </div>
                {s.duration_minutes && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
                    ⏱ {s.duration_minutes} min
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Session Detail */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {!selected ? (
              <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👈</div>
                Select a session to view its transcript and details
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {selected.mode || 'Interview'} — {formatDate(selected.created_at)}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    {selected.score && <ScorePill score={selected.score} />}
                    {selected.duration_minutes && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>⏱ {selected.duration_minutes} min</span>}
                    {selected.questions_answered != null && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>❓ {selected.questions_answered} Q&As</span>}
                  </div>
                </div>

                {/* Summary */}
                {selected.summary && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)',
                    fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6,
                  }}>
                    {selected.summary}
                  </div>
                )}

                {/* Transcript */}
                {selected.transcript && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Transcript
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(Array.isArray(selected.transcript) ? selected.transcript : []).map((t, i) => (
                        <div key={i} style={{
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-md)',
                          background: t.speaker === 'You' ? 'rgba(99,102,241,0.08)' : 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          fontSize: '0.8rem',
                        }}>
                          <span style={{ fontWeight: 700, color: t.speaker === 'You' ? 'var(--primary)' : 'var(--text-muted)', marginRight: 8 }}>
                            {t.speaker}:
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{t.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!selected.transcript && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '12px 0' }}>
                    No transcript saved for this session.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
