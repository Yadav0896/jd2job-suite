import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export default function ScreenPreview() {
  const { state, displayStreamRef } = useApp();
  const { answerReady } = state;
  const videoRef = useRef(null);
  const [active, setActive] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (answerReady) {
      setIsCollapsed(true);
    }
  }, [answerReady]);

  useEffect(() => {
    const checkStream = () => {
      const stream = displayStreamRef.current;
      const isStreamActive = stream && stream.active && stream.getVideoTracks().length > 0;
      if (isStreamActive !== active) {
        setActive(isStreamActive);
      }
    };

    checkStream();
    const intervalId = setInterval(checkStream, 1000);

    return () => clearInterval(intervalId);
  }, [active, displayStreamRef]);

  useEffect(() => {
    if (active && videoRef.current && displayStreamRef.current && !isCollapsed) {
      if (videoRef.current.srcObject !== displayStreamRef.current) {
        videoRef.current.srcObject = displayStreamRef.current;
      }
    }
  }, [active, displayStreamRef, isCollapsed]);

  if (!active) return null;

  return (
    <div className="screen-preview-card" style={{
      marginBottom: '16px',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: 'var(--bg-surface, #0d0d12)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      position: 'relative',
      borderLeft: '3px solid var(--accent, #0066ff)',
      transition: 'all 0.3s ease',
      flexShrink: 0
    }}>
      <div style={{
        padding: '8px 12px',
        background: 'rgba(13, 13, 18, 0.8)',
        backdropFilter: 'blur(8px)',
        borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
        color: 'var(--text-primary)',
        fontSize: '0.78rem',
        fontWeight: '600',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.9rem' }}>🖥️</span>
          <span>Live Shared Screen</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: '600',
              outline: 'none',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm, 4px)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
              WebkitAppRegion: 'no-drag'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
          >
            <span>{isCollapsed ? '➕ Expand' : '➖ Collapse'}</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>REC</span>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ff3333',
              boxShadow: '0 0 8px #ff3333',
              animation: 'livePulse 1.2s ease-in-out infinite'
            }} />
          </div>
        </div>
      </div>
      {!isCollapsed && (
        <div style={{ padding: '4px', background: '#000' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: 'auto',
              aspectRatio: '16/9',
              display: 'block',
              objectFit: 'contain',
              borderRadius: 'var(--radius-sm, 4px)',
              background: '#000'
            }}
          />
        </div>
      )}
    </div>
  );
}
