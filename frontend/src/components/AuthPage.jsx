import { useState } from 'react';
import { signIn, signUp, signInWithOAuth, resetPasswordForEmail, updateUserPassword } from '../services/supabaseClient';
import Jd2JobLogo from './Jd2JobLogo';

export default function AuthPage({ onAuthenticated }) {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const isRecoveryMode = urlParams.get('view') === 'reset-password' || hashParams.get('type') === 'recovery';

  // Save referral parameter
  const refParam = urlParams.get('ref');
  if (refParam) {
    localStorage.setItem('referred_by', refParam);
  }

  const [mode, setMode] = useState(isRecoveryMode ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (mode === 'forgot') {
      if (!email.trim()) { setError('Email required'); return false; }
      return true;
    }
    if (mode === 'reset') {
      if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return false; }
      return true;
    }
    if (!email.trim()) { setError('Email required'); return false; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return false; }
    if (mode === 'signup' && !name.trim()) { setError('Name required'); return false; }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (mode === 'signup') {
        const refId = localStorage.getItem('referred_by') || undefined;
        const { data, error: signUpError } = await signUp(email, password, { 
          name, 
          referred_by: refId 
        });
        if (signUpError) {
          if (signUpError.message?.includes('already registered')) {
            setError('Account exists. Please sign in.');
            setMode('login');
          } else {
            throw signUpError;
          }
        } else {
          setSuccessMsg('Check your email for a confirmation link. You can also sign in below.');
          setMode('login');
        }
      } else if (mode === 'forgot') {
        const { error: resetError } = await resetPasswordForEmail(email);
        if (resetError) throw resetError;
        setSuccessMsg('Password reset link sent! Check your inbox.');
      } else if (mode === 'reset') {
        const { error: updateError } = await updateUserPassword(newPassword);
        if (updateError) throw updateError;
        setSuccessMsg('Password updated! You can now log in.');
        setMode('login');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const { data, error: signInError } = await signIn(email, password);
        if (signInError) throw signInError;
        onAuthenticated();
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithOAuth('google');
    } catch (err) {
      const msg = err.message || 'Google sign-in failed';
      setError(msg.includes('not enabled')
        ? 'Google sign-in is not configured yet. Use email/password or enable Google in Supabase settings.'
        : msg);
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-bg-grain" />
      <div className="auth-blob auth-blob-tl" />
      <div className="auth-blob auth-blob-br" />
      <div className="auth-blob auth-blob-cr" />

      <div className="auth-card">
        <a href="/" className="auth-back-link" aria-label="Back to home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5m6-6l-6 6 6 6" />
          </svg>
          <span>Back</span>
        </a>

        <div className="auth-logo">
          <Jd2JobLogo width={56} height={56} />
        </div>
        <h1 className="auth-title">Jd2Job</h1>
        <p className="auth-subtitle">
          {mode === 'login' && 'Sign in to access your dashboard'}
          {mode === 'signup' && 'Create your account to get started'}
          {mode === 'forgot' && 'Reset your password'}
          {mode === 'reset' && 'Create a new secure password'}
        </p>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {successMsg && <div className="auth-alert auth-alert-success">{successMsg}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="auth-field">
              <label className="auth-label">Full name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                required
                autoComplete="name"
              />
            </div>
          )}

          {mode !== 'reset' && (
            <div className="auth-field">
              <label className="auth-label">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                autoComplete="email"
              />
            </div>
          )}

          {mode !== 'forgot' && mode !== 'reset' && (
            <div className="auth-field">
              <div className="auth-field-head">
                <label className="auth-label">Password</label>
                {mode === 'login' && (
                  <button type="button" onClick={() => { setMode('forgot'); setError(null); }} className="auth-link">
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          )}

          {mode === 'reset' && (
            <div className="auth-field">
              <label className="auth-label">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Send Reset Link' : 'Update Password'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button type="button" onClick={handleGoogle} className="auth-btn auth-btn-outline" disabled={loading}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p className="auth-switch">
          {mode === 'login' && (
            <>Don&apos;t have an account? {' '}<button type="button" onClick={() => { setMode('signup'); setError(null); }}>Sign up</button></>
          )}
          {mode === 'signup' && (
            <>Already have an account? {' '}<button type="button" onClick={() => { setMode('login'); setError(null); }}>Sign in</button></>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" onClick={() => { setMode('login'); setError(null); }}>← Back to sign in</button>
          )}
        </p>
      </div>

      <style>{`
        .auth-root {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--bg-primary, #100c16);
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .auth-bg-grain {
          position: fixed;
          inset: 0;
          background-image: radial-gradient(circle at 25% 25%, var(--accent-light, rgba(224,138,174,.08)) 0%, transparent 50%);
          pointer-events: none;
        }
        .auth-blob {
          position: fixed;
          border-radius: 50%;
          filter: blur(90px);
          pointer-events: none;
          opacity: 0.5;
        }
        .auth-blob-tl {
          width: 360px; height: 360px;
          background: var(--berry, #912f56);
          top: -5%; left: -8%;
          opacity: 0.12;
        }
        .auth-blob-br {
          width: 400px; height: 400px;
          background: var(--holo-purple, #8b5cf6);
          bottom: -8%; right: -10%;
          opacity: 0.08;
        }
        .auth-blob-cr {
          width: 220px; height: 220px;
          background: var(--holo-accent, #9fc7b8);
          top: 35%; right: 15%;
          opacity: 0.06;
        }
        .auth-card {
          background: var(--bg-card, rgba(34,26,44,.55));
          border: 1px solid var(--glass-border, rgba(255,255,255,.08));
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-radius: 24px;
          padding: 40px 36px 36px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 24px 48px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04);
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .auth-back-link {
          position: absolute;
          top: 20px; left: 24px;
          display: flex; align-items: center; gap: 5px;
          font-size: .78rem; font-weight: 600;
          color: var(--text-muted, #94a3b8);
          text-decoration: none;
          transition: color .2s;
        }
        .auth-back-link:hover { color: var(--text-primary, #f8fafc); }
        .auth-logo { margin-bottom: 14px; }
        .auth-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.8rem; font-weight: 800;
          letter-spacing: -.02em;
          background: linear-gradient(135deg, var(--holo-primary, #e08aae) 0%, var(--holo-purple, #8b5cf6) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 6px;
        }
        .auth-subtitle { font-size: .88rem; color: var(--text-muted, #94a3b8); margin-bottom: 28px; line-height: 1.5; }
        .auth-alert {
          width: 100%; padding: 12px 16px; border-radius: 12px; margin-bottom: 20px;
          font-size: .85rem; font-weight: 500; line-height: 1.5;
        }
        .auth-alert-error {
          background: var(--error-light, rgba(239,68,68,.12));
          border: 1px solid rgba(239,68,68,.25);
          color: var(--error, #ef4444);
        }
        .auth-alert-success {
          background: var(--success-light, rgba(16,185,129,.12));
          border: 1px solid rgba(16,185,129,.25);
          color: var(--success, #10b981);
        }
        .auth-form { width: 100%; display: flex; flex-direction: column; gap: 18px; }
        .auth-field { width: 100%; text-align: left; }
        .auth-field-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .auth-label {
          font-family: 'JetBrains Mono', monospace; font-size: .72rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: .04em;
          color: var(--text-secondary, #e2e8f0);
          display: block; margin-bottom: 6px;
        }
        .auth-field input {
          width: 100%; padding: 13px 16px; border-radius: 12px;
          border: 1px solid var(--border-medium, rgba(255,255,255,.12));
          background: var(--bg-input, #171221);
          color: var(--text-primary, #f8fafc);
          font-size: .9rem; font-family: inherit;
          outline: none; transition: all .25s ease;
        }
        .auth-field input::placeholder { color: var(--text-placeholder, #475569); }
        .auth-field input:focus {
          border-color: var(--border-focus, #e08aae);
          box-shadow: 0 0 0 3px var(--accent-light, rgba(224,138,174,.12));
          background: var(--bg-surface, rgba(26,20,34,.6));
        }
        .auth-link { background: none; border: none; color: var(--accent, #e08aae); font-size: .78rem; font-weight: 600; cursor: pointer; padding: 0; transition: color .2s; }
        .auth-link:hover { color: var(--accent-hover, #b03a6b); }
        .auth-btn {
          width: 100%; padding: 14px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #b03a6b 0%, #912f56 100%);
          color: #fff; font-weight: 700; font-size: .92rem;
          cursor: pointer; transition: all .25s ease;
          box-shadow: 0 4px 14px rgba(145,47,86,.3);
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .auth-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(145,47,86,.45);
          filter: brightness(1.08);
        }
        .auth-btn:disabled { opacity: .55; cursor: not-allowed; }
        .auth-btn-outline {
          background: transparent !important;
          border: 1px solid var(--border-medium, rgba(255,255,255,.12)) !important;
          color: var(--text-primary, #f8fafc) !important;
          box-shadow: none !important;
          font-weight: 600;
        }
        .auth-btn-outline:hover:not(:disabled) {
          background: var(--bg-hover, rgba(145,47,86,.08)) !important;
          border-color: var(--border-focus, #e08aae) !important;
        }
        .auth-divider {
          width: 100%; display: flex; align-items: center; gap: 14px;
          margin: 22px 0;
        }
        .auth-divider::before, .auth-divider::after {
          content: ''; flex: 1; height: 1px;
          background: var(--border, rgba(255,255,255,.06));
        }
        .auth-divider span {
          font-size: .72rem; color: var(--text-muted, #94a3b8);
          text-transform: uppercase; letter-spacing: .05em;
          font-weight: 600;
        }
        .auth-switch {
          margin-top: 28px; font-size: .85rem; color: var(--text-muted, #94a3b8);
        }
        .auth-switch button {
          background: none; border: none; color: var(--accent, #e08aae);
          font-weight: 700; cursor: pointer; padding: 0; font-size: .85rem;
          transition: color .2s;
        }
        .auth-switch button:hover { color: var(--accent-hover, #b03a6b); }
      `}</style>
    </div>
  );
}
