import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

export default function InterviewerPreview() {
  const { state, displayStreamRef, dispatch } = useApp();
  const { showInterviewer, isGhostMode } = state;
  const videoRef = useRef(null);
  
  // Dragging State
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    if (showInterviewer && displayStreamRef.current && videoRef.current) {
      videoRef.current.srcObject = displayStreamRef.current;
    }
  }, [showInterviewer, displayStreamRef]);

  // Handle Dragging
  const handleMouseDown = (e) => {
    if (e.target.closest('.preview-close')) return;
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragStartPos.current.x;
      const newY = e.clientY - dragStartPos.current.y;
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position]);

  if (!showInterviewer) return null;

  return (
    <div 
      ref={containerRef}
      className={`interviewer-preview-container ${isGhostMode ? 'stealth' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'auto'
      }}
    >
      <div className="preview-header" onMouseDown={handleMouseDown} style={{ cursor: 'grab' }}>
        <span className="preview-dot" />
        <span className="preview-label">Live Preview</span>
        <button 
          className="preview-close" 
          onClick={() => dispatch({ type: 'SET_SHOW_INTERVIEWER', payload: false })}
        >
          ✕
        </button>
      </div>
      <div className="preview-content">
        {displayStreamRef.current ? (
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline 
            className="preview-video"
          />
        ) : (
          <div className="preview-placeholder">
            <div className="placeholder-icon">📷</div>
            <p>Start screen share to see interviewer</p>
          </div>
        )}
      </div>
    </div>
  );
}
