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

  const [mode, setMode] = useState(isRecoveryMode ? 'reset' : 'login'); // 'login' | 'signup' | 'forgot' | 'reset'
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
    console.log(`[Auth] Starting auth action. Mode: ${mode}, Email: ${email}`);

    try {
      if (mode === 'signup') {
        const refId = localStorage.getItem('referred_by') || undefined;
        console.log('[Auth] Calling signUp...');
        const { data, error: signUpError } = await signUp(email, password, { 
          name, 
          referred_by: refId 
        });
        console.log('[Auth] signUp response received:', { data, error: signUpError });
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
        console.log('[Auth] Calling resetPasswordForEmail...');
        const { error: resetError } = await resetPasswordForEmail(email);
        console.log('[Auth] resetPasswordForEmail response:', { error: resetError });
        if (resetError) throw resetError;
        setSuccessMsg('Password reset link sent! Check your inbox.');
      } else if (mode === 'reset') {
        console.log('[Auth] Calling updateUserPassword...');
        const { error: updateError } = await updateUserPassword(newPassword);
        console.log('[Auth] updateUserPassword response:', { error: updateError });
        if (updateError) throw updateError;
        setSuccessMsg('Password updated! You can now log in.');
        setMode('login');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        console.log('[Auth] Calling signIn...');
        const { data, error: signInError } = await signIn(email, password);
        console.log('[Auth] signIn response received:', { data, error: signInError });
        if (signInError) throw signInError;
        console.log('[Auth] signIn success, triggering onAuthenticated callback.');
        onAuthenticated();
      }
    } catch (err) {
      console.error('[Auth] Error caught in handleSubmit:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      console.log('[Auth] Finished handleSubmit. Setting loading to false.');
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
    <div className="auth-root" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(circle at 10% 20%, rgb(18, 18, 24) 0%, rgb(9, 9, 12) 90.2%)',
      padding: '24px'
    }}>
      {/* Background blobs */}
      <div className="auth-blob auth-blob-tl" style={{
        position: 'absolute',
        width: '300px',
        height: '300px',
        background: 'rgba(99, 102, 241, 0.15)',
        filter: 'blur(80px)',
        top: '10%',
        left: '10%',
        borderRadius: '50%'
      }} />
      <div className="auth-blob auth-blob-br" style={{
        position: 'absolute',
        width: '350px',
        height: '350px',
        background: 'rgba(236, 72, 153, 0.1)',
        filter: 'blur(100px)',
        bottom: '10%',
        right: '10%',
        borderRadius: '50%'
      }} />

      <div className="auth-card" style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        padding: '40px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1
      }}>
        <div className="auth-logo" style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <Jd2JobLogo width={64} height={64} />
        </div>
        <h1 className="auth-title" style={{ fontSize: '2rem', fontWeight: '800', color: '#fff', marginBottom: '8px' }}>Jd2Job</h1>
        <p className="auth-subtitle" style={{ color: 'var(--text-secondary, #94a3b8)', marginBottom: '32px' }}>
          {mode === 'login' && 'Sign in to access your dashboard'}
          {mode === 'signup' && 'Create your account to get started'}
          {mode === 'forgot' && 'Reset your password'}
          {mode === 'reset' && 'Create a new secure password'}
        </p>

        {/* Messages */}
        {error && (
          <div className="auth-error" style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '24px',
            fontSize: '0.85rem'
          }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div className="auth-success" style={{
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: '#22c55e',
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '24px',
            fontSize: '0.85rem'
          }}>
            {successMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {mode === 'signup' && (
            <div className="auth-field" style={{ textAlign: 'left' }}>
              <label className="auth-label" style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Name</label>
              <input
                type="text"
                className="auth-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {mode !== 'reset' && (
            <div className="auth-field" style={{ textAlign: 'left' }}>
              <label className="auth-label" style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Email</label>
              <input
                type="email"
                className="auth-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {mode !== 'forgot' && mode !== 'reset' && (
            <div className="auth-field" style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="auth-label" style={{ color: '#fff', fontSize: '0.85rem', display: 'block' }}>Password</label>
                {mode === 'login' && (
                  <button type="button" onClick={() => { setMode('forgot'); setError(null); }} style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary, #6366f1)',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}>
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {mode === 'reset' && (
            <div className="auth-field" style={{ textAlign: 'left' }}>
              <label className="auth-label" style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>New Password</label>
              <input
                type="password"
                className="auth-input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  outline: 'none'
                }}
              />
            </div>
          )}

          <button
            type="submit"
            className="auth-btn auth-btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1 0%, #a855f7 100%))',
              color: '#fff',
              fontWeight: '600',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Send Reset Link' : 'Update Password'}
          </button>
        </form>



        {/* Switch mode */}
        <p className="auth-switch" style={{ marginTop: '32px', fontSize: '0.85rem', color: '#64748b' }}>
          {mode === 'login' && (
            <>
              Don't have an account?{' '}
              <button type="button" onClick={() => { setMode('signup'); setError(null); }} style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary, #6366f1)',
                fontWeight: '600',
                cursor: 'pointer',
                padding: 0
              }}>
                Sign up
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(null); }} style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary, #6366f1)',
                fontWeight: '600',
                cursor: 'pointer',
                padding: 0
              }}>
                Sign in
              </button>
            </>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" onClick={() => { setMode('login'); setError(null); }} style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary, #6366f1)',
              fontWeight: '600',
              cursor: 'pointer',
              padding: 0
            }}>
              Back to Sign In
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
