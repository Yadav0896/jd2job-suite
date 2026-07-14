import { useState } from 'react';
import { useApp } from '../context/AppContext';
import DocumentUploader from './DocumentUploader';
import { getSession } from '../services/supabaseClient';

const PLACEHOLDER = `Paste the Job Description here.

Including key requirements, responsibilities, and about the company helps the AI tailor its suggestions to what they are looking for.`;

export default function JobDescriptionInput() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState(() => {
    if (!state.jobDescription) return '';
    return state.jobDescription;
  });
  const [error, setError] = useState(null);

  const handleClose = () => {
    dispatch({ type: 'TOGGLE_JOB_DESCRIPTION_MODAL' });
    setError(null);
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSave = async () => {
    if (!input.trim()) {
      dispatch({ type: 'SET_JOB_DESCRIPTION', payload: null });
      dispatch({ type: 'SET_KEYWORDS', payload: [] });
      dispatch({ type: 'TOGGLE_JOB_DESCRIPTION_MODAL' });
      return;
    }

    setIsAnalyzing(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const session = await getSession();
      const token = session?.access_token || '';
      const response = await fetch(`${API_BASE}/api/deepseek/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'Extract up to 10 technical keywords (technologies, tools, or hard skills) from this Job Description. Return them as a simple comma-separated list. No other text.'
            },
            { role: 'user', content: input.slice(0, 20000) }
          ]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const keywords = data.choices[0].message.content
        .split(',')
        .map(kw => kw.trim())
        .filter(kw => kw.length > 0);

      dispatch({ type: 'SET_JOB_DESCRIPTION', payload: input.trim() });
      dispatch({ type: 'SET_KEYWORDS', payload: keywords });
      dispatch({ type: 'TOGGLE_JOB_DESCRIPTION_MODAL' });
    } catch (err) {
      console.error('Keyword extraction failed:', err);
      setError(`Failed to extract keywords. Error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setInput('');
    setError(null);
  };

  const isLoaded = !!state.jobDescription;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal">

        <div className="modal-header">
          <div>
            <div className="modal-title">Job Description</div>
            <div className="modal-subtitle">
              Used to match your experience with specific role requirements
            </div>
          </div>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body">

          <div className="resume-hint">
            <strong>Tip:</strong> Copy-paste the full job posting text.
            The AI will use this to highlight the most relevant parts of your background.
          </div>

          {isLoaded && !input && (
            <div className="resume-has-data">
              <span>✓</span>
              <span>Job description already saved</span>
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
                Remove JD
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>
              {isLoaded ? 'Update Context' : 'Save Context'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
