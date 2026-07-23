import React, { useState, useEffect, useCallback } from 'react';

const STEPS = [
  {
    id: 'welcome',
    title: '👋 Welcome to Jd2Job',
    desc: 'Your AI interview copilot. It listens to your interviewer, transcribes in real-time, and gives you instant answers tailored to your resume and the job.',
    icon: '🚀',
  },
  {
    id: 'upload-resume',
    title: '📄 Step 1: Upload Your Resume',
    desc: 'Click the Resume button in the header and upload your resume (PDF, DOCX, or TXT). The AI uses your real experience to craft answers.',
    icon: '📄',
    target: 'header-btn:resume',
  },
  {
    id: 'add-jd',
    title: '📋 Step 2: Add Job Description',
    desc: 'Click the JD button in the header and paste the job description. This tells the AI exactly what the interviewer is looking for.',
    icon: '📋',
    target: 'header-btn:jd',
  },
  {
    id: 'upload-assignments',
    title: '📝 Step 3: Upload Assignments (Optional)',
    desc: 'If you submitted a take-home assignment, upload it here. The AI will reference your specific code and decisions in answers — impress the interviewer.',
    icon: '📝',
    target: 'header-btn:assignments',
  },
  {
    id: 'start-session',
    title: '🎙️ Step 4: Start Recording',
    desc: 'Click the red record button at the bottom. Grant microphone and screen sharing permissions when prompted. The AI starts listening immediately.',
    icon: '🎙️',
    target: 'record-btn',
  },
  {
    id: 'read-answers',
    title: '💡 Reading Answers',
    desc: 'When the interviewer asks a question, the AI generates a structured answer in the right panel. Read the bold key terms and bullet points — they\'re designed to be scanned while speaking naturally.',
    icon: '💡',
  },
  {
    id: 'done',
    title: '✅ You\'re Ready!',
    desc: 'That\'s it. Upload once, then let the AI handle the rest. Good luck with your interview!',
    icon: '🎉',
  },
];

export default function OnboardingTour({ onComplete }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: '30%', left: '50%' });

  useEffect(() => {
    // Auto-start after a short delay
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const s = STEPS[step];
    if (s?.target) {
      updatePosition(s.target);
    } else {
      setPos({ top: '35%', left: '50%' });
    }
  }, [step, visible]);

  const updatePosition = useCallback((targetClass) => {
    const el = document.querySelector(`.${targetClass}`)
      || document.querySelector(`[class*="${targetClass}"]`)
      || document.querySelector('.record-btn')
      || document.querySelector('.app-header');
    if (el) {
      const rect = el.getBoundingClientRect();
      setPos({
        top: `${rect.top + rect.height / 2}px`,
        left: `${rect.left + rect.width / 2}px`,
      });
    }
  }, []);

  const next = () => {
    if (step >= STEPS.length - 1) {
      setVisible(false);
      localStorage.setItem('jd2job_onboarding_done', 'true');
      onComplete?.();
    } else {
      setStep(s => s + 1);
    }
  };

  const skip = () => {
    setVisible(false);
    localStorage.setItem('jd2job_onboarding_done', 'true');
    onComplete?.();
  };

  const prev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  if (!visible) return null;

  const s = STEPS[step];

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(2px)',
        zIndex: 9999,
        transition: 'all 0.4s ease',
      }} onClick={skip} />

      {/* Card */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10000,
        background: 'var(--bg-card, #1e1b2e)',
        border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
        borderRadius: '20px',
        padding: '36px 40px',
        maxWidth: '440px',
        width: '90vw',
        boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        textAlign: 'center',
        animation: 'scaleInModal 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>{s.icon}</div>
        <h2 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: '1.35rem', fontWeight: 800,
          color: 'var(--text-primary, #f8fafc)',
          marginBottom: '10px', letterSpacing: '-0.01em',
        }}>{s.title}</h2>
        <p style={{
          fontSize: '0.9rem', color: 'var(--text-secondary, #e2e8f0)',
          lineHeight: 1.7, marginBottom: '28px',
        }}>{s.desc}</p>

        {/* Progress dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '8px',
          marginBottom: '24px',
        }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === step ? 'var(--accent, #e08aae)' : 'var(--border-medium, rgba(255,255,255,0.15))',
              transition: 'all 0.3s ease',
              transform: i === step ? 'scale(1.3)' : 'scale(1)',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {step > 0 && (
            <button onClick={prev} style={{
              padding: '10px 20px', borderRadius: '10px',
              border: '1px solid var(--border-medium)',
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer', fontWeight: 600,
              fontFamily: 'inherit',
            }}>← Back</button>
          )}
          <button onClick={next} style={{
            padding: '10px 28px', borderRadius: '10px',
            border: 'none',
            background: 'linear-gradient(135deg, #b03a6b, #912f56)',
            color: '#fff', cursor: 'pointer', fontWeight: 700,
            fontFamily: 'inherit',
            boxShadow: '0 4px 14px rgba(145,47,86,0.35)',
          }}>
            {step >= STEPS.length - 1 ? 'Get Started' : 'Next →'}
          </button>
        </div>

        {step < STEPS.length - 1 && (
          <button onClick={skip} style={{
            background: 'none', border: 'none',
            color: 'var(--text-muted, #94a3b8)',
            cursor: 'pointer', marginTop: '18px',
            fontSize: '0.8rem', fontWeight: 500,
            fontFamily: 'inherit',
          }}>Skip tour</button>
        )}
      </div>

      <style>{`
        @keyframes scaleInModal {
          from { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
          to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
