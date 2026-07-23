import React, { useState, useEffect } from 'react';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem('jd2job_cookies_accepted');
    if (!accepted) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem('jd2job_cookies_accepted', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 99998,
      background: 'var(--bg-card, rgba(34,26,44,0.95))',
      borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
      backdropFilter: 'blur(20px)',
      padding: '16px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '24px', flexWrap: 'wrap',
      boxShadow: '0 -8px 32px rgba(0,0,0,0.3)',
      animation: 'cookieSlideUp 0.4s ease',
    }}>
      <p style={{
        fontSize: '0.85rem', color: 'var(--text-secondary)',
        margin: 0, maxWidth: '600px', lineHeight: 1.6,
      }}>
        🍪 We use cookies to keep you signed in and improve your experience. By using Jd2Job, you agree to our{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('open-legal', { detail: 'privacy' })); }} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Privacy Policy</a>.
      </p>
      <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
        <button onClick={accept} style={{
          padding: '10px 24px', borderRadius: '10px',
          border: 'none', background: 'linear-gradient(135deg, #b03a6b, #912f56)',
          color: '#fff', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit',
          boxShadow: '0 4px 14px rgba(145,47,86,0.35)',
        }}>Accept</button>
      </div>
      <style>{`
        @keyframes cookieSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
