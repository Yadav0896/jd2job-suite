import React from 'react';

export default function ConfirmDialog({ 
  open, title, message, confirmLabel = 'Confirm', 
  cancelLabel = 'Cancel', danger = false,
  onConfirm, onCancel, loading = false,
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 420, width: '92vw', padding: '28px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>
          {danger ? '⚠️' : '🤔'}
        </div>
        <h3 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: '1.15rem', fontWeight: 700,
          color: 'var(--text-primary)', marginBottom: '8px',
        }}>{title}</h3>
        {message && (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onCancel} disabled={loading} style={{
            padding: '10px 24px', borderRadius: '10px',
            border: '1px solid var(--border-medium)',
            background: 'transparent', color: 'var(--text-secondary)',
            cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
          }}>{cancelLabel}</button>
          <button onClick={onConfirm} disabled={loading} style={{
            padding: '10px 24px', borderRadius: '10px',
            border: 'none',
            background: danger 
              ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
              : 'linear-gradient(135deg, #b03a6b, #912f56)',
            color: '#fff', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit',
            boxShadow: danger 
              ? '0 4px 14px rgba(239,68,68,0.35)' 
              : '0 4px 14px rgba(145,47,86,0.35)',
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
