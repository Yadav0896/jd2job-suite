import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

const ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
const COLORS = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: '#10b981' },
  error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#ef4444' },
  info: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' },
  warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 6000),
    info: (msg) => addToast(msg, 'info'),
    warning: (msg) => addToast(msg, 'warning', 5000),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast container */}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px',
        zIndex: 99999, display: 'flex', flexDirection: 'column',
        gap: '10px', maxWidth: '380px', width: 'auto',
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const color = COLORS[t.type];
          return (
            <div key={t.id} style={{
              background: color.bg,
              border: `1px solid ${color.border}`,
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              color: color.text,
              fontSize: '0.85rem', fontWeight: 500,
              lineHeight: 1.5,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              animation: 'toastSlideIn 0.3s ease',
              pointerEvents: 'auto',
            }}>
              <span style={{ flexShrink: 0, fontSize: '1rem' }}>{ICONS[t.type]}</span>
              <span style={{ flex: 1 }}>{t.message}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} style={{
                background: 'none', border: 'none', color: color.text, cursor: 'pointer',
                fontSize: '0.9rem', opacity: 0.6, padding: 0, lineHeight: 1,
                flexShrink: 0,
              }}>×</button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
