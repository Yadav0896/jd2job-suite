import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Tilt3D from './Tilt3D';
import Jd2JobLogo from './Jd2JobLogo';

const ASSISTANTS = [
  {
    id: 'interview',
    title: 'Interview Assistant',
    emoji: '🎯',
    tagline: 'Land your dream job',
    desc: 'Real-time AI coaching during live interviews. Get instant, STAR-structured answers tailored to your resume and the job description.',
    features: [
      'Real-time answer suggestions',
      'Resume & JD requirement matching',
      'STAR method structural guidance',
      'Post-interview thank-you generator',
    ],
    badge: 'Job Seekers',
    accentStart: '#b03a6b',
    accentEnd: '#912f56',
    taglineColor: '#e08aae',
    iconBg: 'rgba(145,47,86,0.12)',
    checkColor: '#e08aae',
    btnGradient: 'linear-gradient(135deg, #b03a6b, #912f56)',
    hoverBorder: 'rgba(145,47,86,0.35)',
    hoverShadow: '0 24px 64px rgba(145,47,86,0.18)',
    glowBg: 'rgba(145,47,86,0.05)',
    actionText: 'Launch Interview Assistant',
  },
  {
    id: 'jd2job',
    title: 'Jd2Job',
    emoji: '💼',
    tagline: 'Auto-Apply Analytics',
    desc: 'Track and manage jobs applied via the Jd2Job Chrome extension. View tailored resumes, application timelines, and success metrics.',
    features: [
      'Automatic sync with Jd2Job Extension',
      'Track tailored resumes & JDs',
      'Visual application analytics dashboard',
      'Daily/weekly application speed tracking',
    ],
    badge: 'Extensions',
    accentStart: '#10b981',
    accentEnd: '#059669',
    taglineColor: '#10b981',
    iconBg: 'rgba(16,185,129,0.10)',
    checkColor: '#10b981',
    btnGradient: 'linear-gradient(135deg, #10b981, #059669)',
    hoverBorder: 'rgba(16,185,129,0.35)',
    hoverShadow: '0 24px 64px rgba(16,185,129,0.18)',
    glowBg: 'rgba(16,185,129,0.04)',
    actionText: 'Launch Jd2Job',
  },
  {
    id: 'mock',
    title: 'Mock Interview',
    emoji: '🤖',
    tagline: 'Interactive Practice',
    desc: 'Simulate realistic behavioral & technical rounds. Get scored on your STAR structure, keywords, and pacing with a friendly conversational agent.',
    features: [
      'Interactive voice conversation',
      'Realistic behavioral/technical questions',
      'STT response analysis & scoring',
      'Immediate constructive feedback',
    ],
    badge: 'Interview Prep',
    accentStart: '#a855f7',
    accentEnd: '#7c3aed',
    taglineColor: '#a855f7',
    iconBg: 'rgba(168,85,247,0.10)',
    checkColor: '#a855f7',
    btnGradient: 'linear-gradient(135deg, #a855f7, #7c3aed)',
    hoverBorder: 'rgba(168,85,247,0.35)',
    hoverShadow: '0 24px 64px rgba(168,85,247,0.18)',
    glowBg: 'rgba(168,85,247,0.04)',
    actionText: 'Launch Mock Interview',
  }
];

export default function WorkspaceSelector({ onSelect }) {
  const { state } = useApp();
  const { credits } = state;
  const [hovered, setHovered] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [guideTab, setGuideTab] = useState('extension');

  const visibleAssistants = ASSISTANTS;

  return (
    <div className="wsp-root wsp-root-3d">
      {/* ── Background blobs with 3D depth ────────────── */}
      <div className="wsp-blob wsp-blob-tl" />
      <div className="wsp-blob wsp-blob-tr" />
      <div className="wsp-blob wsp-blob-bl" />

      {/* ── Nav ──────────────────────────────────────────── */}
      <nav className="wsp-nav">
        <div className="wsp-nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Jd2JobLogo width={24} height={24} />
          <span className="wsp-nav-name">Jd2Job</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => setShowGuide(true)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s'
            }}
          >
            📖 User Guide
          </button>
          {credits > 0 && (
            <div className="wsp-credits">
              <svg style={{ width: '12px', height: '12px', display: 'inline-block', verticalAlign: 'middle', marginRight: '4px', color: '#f59e0b' }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>{credits} credits</span>
            </div>
          )}
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="wsp-hero">
        <div className="wsp-pill">✦ Powered by Advanced AI</div>
        <h1 className="wsp-h1">
          Choose Your<br />
          <span className="wsp-h1-grad">Intelligent Assistant</span>
        </h1>
        <p className="wsp-sub">
          Pick the mode that matches your session and get instant AI support
          tailored to your conversation.
        </p>
      </section>

      {/* ── Cards with 3D tilt ──────────────────────────── */}
      <div className="wsp-grid wsp-grid-3d">
        {visibleAssistants.map((a, idx) => {
          const isHovered = hovered === a.id;
          return (
            <Tilt3D key={a.id} tiltMax={12} scale={1.03} className="wsp-card-tilt">
              <div
                className="wsp-card wsp-card-3d"
                style={{
                  animationDelay: `${idx * 80}ms`,
                  borderColor: isHovered ? a.hoverBorder : undefined,
                  boxShadow: isHovered ? a.hoverShadow : undefined,
                  background: isHovered
                    ? `linear-gradient(180deg, white 0%, ${a.glowBg.replace('0.04', '0.07')} 100%)`
                    : 'white',
                }}
                onMouseEnter={() => setHovered(a.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(a.id)}
              >
              {/* Gradient accent top */}
              <div
                className="wsp-card-accent"
                style={{ background: `linear-gradient(90deg, ${a.accentStart}, ${a.accentEnd})` }}
              />

              <div className="wsp-card-body">
                {/* Header */}
                <div className="wsp-card-head">
                  <div
                    className="wsp-icon-box"
                    style={{ background: a.iconBg }}
                  >
                    {a.id === 'interview' ? (
                      <svg style={{ width: '22px', height: '22px', color: a.accentStart }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    ) : a.id === 'mock' ? (
                      <svg style={{ width: '22px', height: '22px', color: a.accentStart }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    ) : (
                      <svg style={{ width: '22px', height: '22px', color: a.accentStart }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <span className="wsp-badge">{a.badge}</span>
                </div>

                {/* Title */}
                <h2 className="wsp-title">{a.title}</h2>
                <div className="wsp-tagline" style={{ color: a.taglineColor }}>
                  {a.tagline}
                </div>

                {/* Description */}
                <p className="wsp-desc">{a.desc}</p>

                {/* Divider */}
                <div className="wsp-divider" />

                {/* Features */}
                <ul className="wsp-features">
                  {a.features.map((f, i) => (
                    <li key={i} className="wsp-feature">
                      <span style={{ color: a.checkColor }} className="wsp-chk">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  className="wsp-cta"
                  style={{ background: a.btnGradient }}
                >
                  {a.actionText}
                  <span
                    className="wsp-arrow"
                    style={{ transform: isHovered ? 'translateX(5px)' : 'translateX(0)' }}
                  >
                    →
                  </span>
                </button>
              </div>
              </div>
            </Tilt3D>
          );
        })}
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="wsp-footer">
        🔒 All sessions are private. Audio is processed securely and never stored.
      </footer>

      {/* ── User Guide Modal ────────────────────────────── */}
      {showGuide && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            background: '#12121a',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#161622'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>📖 User Onboarding Guide</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Learn how to set up and master your AI Interview Suite</p>
              </div>
              <button 
                onClick={() => setShowGuide(false)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#94a3b8', 
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
              >
                ✕
              </button>
            </div>

            {/* Guide Tabs */}
            <div style={{
              display: 'flex',
              background: '#14141e',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {['extension', 'interview', 'ghost'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setGuideTab(tab)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    border: 'none',
                    background: 'none',
                    color: guideTab === tab ? '#10b981' : '#94a3b8',
                    fontWeight: guideTab === tab ? 700 : 500,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    borderBottom: guideTab === tab ? '2px solid #10b981' : '2px solid transparent',
                    transition: 'all 0.18s'
                  }}
                >
                  {tab === 'extension' && '💼 Job Tracker Sync'}
                  {tab === 'interview' && '🎯 Live Assistant'}
                  {tab === 'ghost' && '👁️ Stealth Ghost Mode'}
                </button>
              ))}
            </div>

            {/* Content Body */}
            <div style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              background: '#09090d',
              color: '#cbd5e1',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {guideTab === 'extension' && (
                <div>
                  <h4 style={{ color: '#f8fafc', marginTop: 0, marginBottom: '12px', fontSize: '0.95rem' }}>💼 Syncing LinkedIn Applications Automatically</h4>
                  <p>Never manually track your job applications again. Sync all your data in real-time:</p>
                  <ol style={{ paddingLeft: '20px', margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>Open the <strong>Jd2Job</strong> workspace and click <strong>Copy User ID</strong> from the top bar.</li>
                    <li>Install the companion <strong>Jd2Job Chrome Extension</strong> from your browser settings.</li>
                    <li>Paste your copied User ID into the extension popup window.</li>
                    <li>Click <strong>Start</strong> in the extension. As you apply to jobs on LinkedIn, the extension automatically extracts the job title, company, custom tailored resume, and recruiter's profile details.</li>
                    <li>Your applications appear instantly in this dashboard!</li>
                  </ol>
                  <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', padding: '12px', fontSize: '0.8rem', color: '#10b981' }}>
                    💡 <strong>Tip:</strong> Click the <strong>Outreach</strong> button next to any synced job in your dashboard to generate a custom-tailored recruiter email and draft it with one click!
                  </div>
                </div>
              )}

              {guideTab === 'interview' && (
                <div>
                  <h4 style={{ color: '#f8fafc', marginTop: 0, marginBottom: '12px', fontSize: '0.95rem' }}>🎯 Master the Real-Time Interview Assistant</h4>
                  <p>Let the AI listen to your interview questions and guide you live:</p>
                  <ol style={{ paddingLeft: '20px', margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>Launch the <strong>Interview Assistant</strong> from the home selector.</li>
                    <li>Paste the Target Job Description and upload your resume. This allows the AI to tailor suggestions to your exact background.</li>
                    <li>Click <strong>Start Session</strong>. When prompted by the browser to share your screen, select the tab or screen where your meeting is taking place, and <strong>make sure to check "Share system audio"</strong>.</li>
                    <li>The AI will automatically transcribe when the interviewer speaks and structure instant recommendation lists using the professional <strong>STAR method (Situation, Task, Action, Result)</strong>.</li>
                  </ol>
                </div>
              )}

              {guideTab === 'ghost' && (
                <div>
                  <h4 style={{ color: '#f8fafc', marginTop: 0, marginBottom: '12px', fontSize: '0.95rem' }}>👁️ Stealth Ghost Mode (Eye Contact Calibration)</h4>
                  <p>Read your notes and answers naturally during video calls without looking away:</p>
                  <ol style={{ paddingLeft: '20px', margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>Activate <strong>Ghost Mode</strong> from the top controls bar of your live session workspace.</li>
                    <li>This will make the assistant overlay translucent, showing the video call behind it.</li>
                    <li>Drag the floating suggestions panel directly under your laptop's camera lens.</li>
                    <li>Read your bulleted points and STAR suggestions naturally; the interviewer will see you looking directly into the camera.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: '#161622'
            }}>
              <button 
                onClick={() => setShowGuide(false)}
                style={{ 
                  background: '#10b981', 
                  color: '#fff', 
                  border: 'none', 
                  borderRadius: '8px',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                Got It, Let's Go!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
