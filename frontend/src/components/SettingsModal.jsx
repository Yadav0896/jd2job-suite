import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getSession } from '../services/supabaseClient';
import ModelSelector from './ModelSelector';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function CompanyEnrichmentWidget() {
  const { state, dispatch } = useApp();
  const [companyInput, setCompanyInput] = useState(state.companyEnrichment?.companyName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEnrichment = async () => {
    if (!companyInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const session = await getSession();
      const headers = session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {};
      const res = await fetch(`${API_BASE}/api/company-enrichment?name=${encodeURIComponent(companyInput.trim())}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch company data');
      const data = await res.json();
      dispatch({ type: 'SET_COMPANY_ENRICHMENT', payload: data });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const clearEnrichment = () => {
    setCompanyInput('');
    dispatch({ type: 'SET_COMPANY_ENRICHMENT', payload: null });
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="e.g. Google, Stripe, Flipkart..."
          value={companyInput}
          onChange={e => setCompanyInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchEnrichment()}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
        <button
          className="btn btn-primary"
          onClick={fetchEnrichment}
          disabled={loading || !companyInput.trim()}
          style={{ padding: '8px 14px', fontSize: '0.8rem', minWidth: 80 }}
        >
          {loading ? '...' : '🔍 Enrich'}
        </button>
      </div>
      {error && <div style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: 6 }}>{error}</div>}
      {state.companyEnrichment && !loading && (
        <div style={{
          marginTop: 10,
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.3)',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--success)', marginBottom: 4 }}>✅ {state.companyEnrichment.companyName}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {state.companyEnrichment.summary?.substring(0, 180)}...
          </div>
          <button
            onClick={clearEnrichment}
            style={{ marginTop: 8, fontSize: '0.72rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >Clear</button>
        </div>
      )}
    </div>
  );
}

const isElectron = navigator.userAgent.toLowerCase().includes('electron');

export default function SettingsModal() {
  const { state, dispatch } = useApp();
  const { isMicOn, isSystemAudioOn, theme, pipWindow } = state;

  const handleClose = () => dispatch({ type: 'TOGGLE_SETTINGS_MODAL' });

  const togglePiP = async () => {
    if (!('documentPictureInPicture' in window)) return;
    try {
      if (pipWindow) {
        pipWindow.close();
        return;
      }
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 380,
        height: 600,
      });
      
      // Copy stylesheets
      [...document.styleSheets].forEach((styleSheet) => {
        try {
          const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
          const style = document.createElement('style');
          style.textContent = cssRules;
          pip.document.head.appendChild(style);
        } catch (e) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleSheet.href;
          pip.document.head.appendChild(link);
        }
      });
      
      const appContainer = document.querySelector('.panel-right');
      if (appContainer) {
        pip.document.body.appendChild(appContainer);
      }
      
      const overrideStyle = document.createElement('style');
      overrideStyle.textContent = `
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          overflow: hidden !important;
        }
        body .panel-right,
        body.app-container .panel-right,
        body.app-container.stealth-layout-active .panel-right {
          width: 100vw !important;
          max-width: none !important;
          height: 100vh !important;
          border-radius: 0 !important;
          border: none !important;
          box-shadow: none !important;
          margin: 0 !important;
          background: transparent !important;
          backdrop-filter: none !important;
        }
      `;
      pip.document.head.appendChild(overrideStyle);
      pip.document.body.className = 'app-container stealth-layout-active';
      pip.addEventListener('pagehide', () => {
        const mainArea = document.querySelector('.main-area');
        if (mainArea && appContainer) {
          mainArea.appendChild(appContainer);
        }
        // Force state update
        dispatch({ type: 'SET_PIP_WINDOW', payload: null });
      });
      dispatch({ type: 'SET_PIP_WINDOW', payload: pip });
    } catch (e) {
      console.error('Failed to open PiP window', e);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal modal-3d" style={{ maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>

        <div className="modal-header">
          <div>
            <div className="modal-title">Settings</div>
            <div className="modal-subtitle">Configure your session preferences</div>
          </div>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body" style={{ gap: '16px' }}>

          {/* Audio Inputs */}
          <div className="modal-section">
            <div className="modal-section-title">🎙️ Audio Inputs</div>
            <div className="modal-section-subtitle">Active audio capture channels</div>

            <div className="audio-setting-row" style={{ marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>Microphone</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Captures your voice during the session</div>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isMicOn ? 'var(--success)' : 'var(--text-muted)' }}>
                {isMicOn ? '● On' : '○ Off'}
              </span>
            </div>

            <div className="audio-setting-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>System Audio</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Captures Zoom, Meet, or Teams audio</div>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isSystemAudioOn ? 'var(--success)' : 'var(--text-muted)' }}>
                {isSystemAudioOn ? '● On' : '○ Off'}
              </span>
            </div>
          </div>

          {/* AI Model Configuration */}
          <div className="modal-section">
            <div className="modal-section-title">🧠 AI Model Config</div>
            <div className="modal-section-subtitle">Choose the model provider and speed</div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Model Provider & Speed Profile</label>
              <select 
                className="header-btn" 
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                value={`${state.llmProvider}:${state.llmModel}`}
                onChange={(e) => {
                  const [provider, ...modelParts] = e.target.value.split(':');
                  const model = modelParts.join(':');
                  dispatch({ type: 'SET_LLM_CONFIG', payload: { provider, model } });
                }}
              >
                <optgroup label="Nvidia NIM (Ultra-Fast)">
                  <option value="nvidia:meta/llama-3.1-8b-instruct">⚡ Llama 3.1 8B (Fastest)</option>
                  <option value="nvidia:meta/llama-3.1-70b-instruct">🚀 Llama 3.1 70B (Balanced)</option>
                  <option value="nvidia:mistralai/mixtral-8x22b-instruct-v0.1">🌀 Mixtral 8x22B (Fast)</option>
                </optgroup>
                <optgroup label="DeepSeek (Slower, Smart)">
                  <option value="deepseek:deepseek-chat">🧠 DeepSeek V3 (Chat)</option>
                  <option value="deepseek:deepseek-reasoner">🤔 DeepSeek R1 (Reasoner)</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Prompt Profile</label>
              <ModelSelector />
            </div>
          </div>

          {/* 🎭 Tone & Persona Control */}
          <div className="modal-section">
            <div className="modal-section-title">🎭 AI Tone & Persona</div>
            <div className="modal-section-subtitle">Set how the AI styles your spoken answers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {[
                { id: 'confident', label: '💪 Confident & Assertive', desc: 'Strong openers, leadership framing, high-impact verbs' },
                { id: 'technical', label: '🔬 Detail-Oriented & Technical', desc: 'Specific APIs, libraries, trade-offs, architectural depth' },
                { id: 'concise', label: '🎯 Simple & Concise', desc: 'Straight to the point, minimal filler, easy to read live' },
              ].map(({ id, label, desc }) => (
                <div
                  key={id}
                  onClick={() => dispatch({ type: 'SET_TONE_PREFERENCE', payload: id })}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${state.tonePreference === id ? 'var(--primary)' : 'var(--border)'}`,
                    background: state.tonePreference === id ? 'rgba(99,102,241,0.12)' : 'var(--bg-card)',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: state.tonePreference === id ? 'var(--primary)' : 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 🏢 Company Context Enrichment */}
          <div className="modal-section">
            <div className="modal-section-title">🏢 Target Company</div>
            <div className="modal-section-subtitle">AI will weave company details into your answers</div>
            <CompanyEnrichmentWidget />
          </div>

          {/* Interface & Preferences */}
          <div className="modal-section">
            <div className="modal-section-title">🖥️ Interface & View</div>
            <div className="modal-section-subtitle">Stealth mode, color themes, and overlays</div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              <button 
                className={`ghost-toggle-btn ${state.isGhostMode ? 'active' : ''}`} 
                onClick={() => dispatch({ type: 'TOGGLE_GHOST_MODE' })}
                style={{ flex: '1 1 45%', padding: '8px 12px' }}
              >
                {state.isGhostMode ? '👁 Normal Mode' : '👁 Ghost Overlay'}
              </button>

              <button 
                className={`ghost-toggle-btn ${state.stealthMode || pipWindow ? 'active' : ''}`} 
                onClick={() => {
                  if ('documentPictureInPicture' in window) {
                    togglePiP();
                  } else {
                    dispatch({ type: 'TOGGLE_STEALTH_MODE' });
                  }
                }}
                style={{ flex: '1 1 45%', padding: '8px 12px' }}
              >
                {state.stealthMode || pipWindow ? '🕶 Full Window' : '🕶 Stealth View'}
              </button>

              <button 
                className="header-btn" 
                onClick={() => dispatch({ type: 'TOGGLE_THEME' })}
                style={{ flex: '1 1 100%', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
              >
                {theme === 'dark' ? '☀ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
              </button>
            </div>
          </div>

          {/* About */}
          <div className="modal-section" style={{ marginBottom: 0 }}>
            <div className="modal-section-title">ℹ️ About</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '2rem' }}>🎙️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Jd2Job v2.0.0</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>
                  Real-time AI coaching and suggestion stream for job interviews.
                  Powered by Advanced AI.
                </div>
              </div>
            </div>
          </div>

          <div className="modal-btn-row" style={{ marginTop: 4 }}>
            <button className="btn btn-primary" onClick={handleClose}>Done</button>
          </div>

        </div>
      </div>
    </div>
  );
}
