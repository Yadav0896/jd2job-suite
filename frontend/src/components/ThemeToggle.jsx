import React from 'react';
import { useApp } from '../context/AppContext';

export default function ThemeToggle() {
  const { state, dispatch } = useApp();

  const toggle = () => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    dispatch({ type: 'SET_THEME', payload: next });
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <button
      onClick={toggle}
      title={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '36px', height: '36px', borderRadius: '8px',
        border: '1px solid var(--border-medium)',
        background: 'var(--bg-surface)',
        cursor: 'pointer', fontSize: '0.95rem',
        color: 'var(--text-secondary)',
        transition: 'all 0.2s ease',
      }}
    >
      {state.theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
