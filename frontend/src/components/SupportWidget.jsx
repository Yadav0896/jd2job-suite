import React, { useState } from 'react';

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    
    // Fallback: open mailto if no backend
    const subject = encodeURIComponent('Jd2Job Support Request');
    const body = encodeURIComponent(`From: ${name}\nEmail: ${email}\n\n${message}`);
    window.open(`mailto:hello@jd2job.com?subject=${subject}&body=${body}`, '_blank');
    
    setSent(true);
    setLoading(false);
    setTimeout(() => { setSent(false); setOpen(false); setMessage(''); }, 3000);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        title="Contact support"
        style={{
          position: 'fixed', bottom: '24px', left: '24px',
          zIndex: 9999,
          width: '50px', height: '50px',
          borderRadius: '50%',
          border: '1px solid var(--glass-border)',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(16px)',
          cursor: 'pointer', fontSize: '1.3rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s ease',
          color: 'var(--text-primary)',
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        💬
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '88px', left: '24px',
          zIndex: 9999, width: '340px',
          background: 'var(--bg-card)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          animation: 'slideUp 0.3s ease',
        }}>
          <div style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.1rem' }}>💬</span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Support</span>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: '1.1rem',
            }}>×</button>
          </div>

          <div style={{ padding: '18px' }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--success)' }}>
                ✅ Message sent! We'll reply within 24 hours.
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Questions? Issues? We reply within a day, usually faster.
                </p>
                <input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="email"
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={inputStyle}
                />
                <textarea
                  placeholder="How can we help?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  required
                  style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }}
                />
                <button type="submit" disabled={loading} style={{
                  padding: '12px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #b03a6b, #912f56)',
                  color: '#fff', fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.85rem',
                  boxShadow: '0 4px 14px rgba(145,47,86,0.3)',
                  opacity: loading ? 0.6 : 1,
                }}>
                  {loading ? 'Sending...' : 'Send message'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}

const inputStyle = {
  padding: '10px 14px', borderRadius: '8px',
  border: '1px solid var(--border-medium)',
  background: 'var(--bg-input)', color: 'var(--text-primary)',
  fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit',
};
