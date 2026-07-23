import React from 'react';

export default function EmptyState({ icon = '📭', title, description, action, actionLabel }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', textAlign: 'center', gap: '16px',
    }}>
      <div style={{ fontSize: '3rem', opacity: 0.5 }}>{icon}</div>
      {title && (
        <h3 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: '1.1rem', fontWeight: 700,
          color: 'var(--text-primary)', margin: 0,
        }}>{title}</h3>
      )}
      {description && (
        <p style={{
          fontSize: '0.85rem', color: 'var(--text-muted)',
          lineHeight: 1.6, maxWidth: '320px', margin: 0,
        }}>{description}</p>
      )}
      {action && (
        <button onClick={action} style={{
          marginTop: '8px', padding: '10px 22px', borderRadius: '10px',
          border: '1px solid var(--border-medium)',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)', cursor: 'pointer',
          fontWeight: 600, fontFamily: 'inherit', fontSize: '0.85rem',
        }}>{actionLabel || 'Get started'}</button>
      )}
    </div>
  );
}
