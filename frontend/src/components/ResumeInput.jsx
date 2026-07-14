import { useState } from 'react';
import { useApp } from '../context/AppContext';
import DocumentUploader from './DocumentUploader';

const PLACEHOLDER = `Paste your resume here — plain text or JSON both work.

Example (plain text):
  John Doe | Software Engineer | 5 years experience
  Skills: React, Node.js, Python, AWS
  Experience: Senior Engineer at Acme Corp (2021–now) — led a team of 4, shipped payment system
  Education: B.Sc. Computer Science, MIT 2019

The AI will use this to personalise every answer to your background.`;

export default function ResumeInput() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState(() => {
    if (!state.resumeData) return '';
    if (typeof state.resumeData === 'string') return state.resumeData;
    return JSON.stringify(state.resumeData, null, 2);
  });
  const [error, setError] = useState(null);

  const handleClose = () => {
    dispatch({ type: 'TOGGLE_RESUME_MODAL' });
    setError(null);
  };

  const handleSave = () => {
    if (!input.trim()) {
      dispatch({ type: 'SET_RESUME_DATA', payload: null });
      dispatch({ type: 'TOGGLE_RESUME_MODAL' });
      return;
    }
    // Try JSON first; fall back to plain text
    try {
      const parsed = JSON.parse(input);
      dispatch({ type: 'SET_RESUME_DATA', payload: parsed });
    } catch {
      dispatch({ type: 'SET_RESUME_DATA', payload: input.trim() });
    }
    dispatch({ type: 'TOGGLE_RESUME_MODAL' });
    setError(null);
  };

  const handleClear = () => {
    setInput('');
    setError(null);
  };

  const isLoaded = !!state.resumeData;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal">

        <div className="modal-header">
          <div>
            <div className="modal-title">Your Resume</div>
            <div className="modal-subtitle">
              Used to personalise AI answers to your actual experience
            </div>
          </div>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body">

          <div className="resume-hint">
            <strong>Tip:</strong> Paste plain text, copy-pasted from your PDF, or structured JSON.
            The AI will extract the relevant details automatically.
          </div>

          {isLoaded && !input && (
            <div className="resume-has-data">
              <span>✓</span>
              <span>Resume already saved — edit below or clear to remove</span>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <DocumentUploader 
            onTextExtracted={(text, filename) => {
              setInput(prev => {
                const newContent = `\n\n--- Document: ${filename} ---\n${text}`;
                return prev ? prev + newContent : newContent.trim();
              });
              setError(null);
            }} 
          />

          <textarea
            className="resume-textarea"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            placeholder={PLACEHOLDER}
            spellCheck={false}
          />

          <div className="modal-btn-row">
            {isLoaded && (
              <button className="btn btn-danger" onClick={handleClear}>
                Remove Resume
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>
              {isLoaded ? 'Update Resume' : 'Save Resume'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
