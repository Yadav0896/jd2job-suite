import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import DocumentUploader from './DocumentUploader';

let _resumeIdCounter = Date.now();
function generateId() { return `resume-${++_resumeIdCounter}`; }

export default function ResumeManager() {
  const { state, dispatch } = useApp();
  const { resumes, showResumeModal } = state;
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [showForm, setShowForm] = useState(false);
  const textareaRef = useRef(null);

  const handleClose = () => dispatch({ type: 'TOGGLE_RESUME_MODAL' });

  const openNewForm = () => {
    setEditingId(null);
    setDraftTitle('');
    setDraftContent('');
    setShowForm(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const openEditForm = (resume) => {
    setEditingId(resume.id);
    setDraftTitle(resume.title);
    setDraftContent(resume.content);
    setShowForm(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const saveResume = () => {
    if (!draftContent.trim()) return;
    const title = draftTitle.trim() || 'Untitled Resume';

    if (editingId) {
      const updated = resumes.map(r =>
        r.id === editingId ? { ...r, title, content: draftContent.trim() } : r
      );
      dispatch({ type: 'SET_RESUMES', payload: updated });
      // Refresh active resume data if editing the active one
      if (resumes.find(r => r.id === editingId)?.active) {
        dispatch({ type: 'SET_RESUME_DATA', payload: draftContent.trim() });
      }
    } else {
      const isFirst = resumes.length === 0;
      const newResume = {
        id: generateId(),
        title,
        content: draftContent.trim(),
        active: isFirst,
      };
      const updated = [...resumes, newResume];
      dispatch({ type: 'SET_RESUMES', payload: updated });
      if (isFirst) {
        dispatch({ type: 'SET_RESUME_DATA', payload: draftContent.trim() });
      }
    }
    setShowForm(false);
    setDraftTitle('');
    setDraftContent('');
    setEditingId(null);
  };

  const deleteResume = (id) => {
    const wasActive = resumes.find(r => r.id === id)?.active;
    const updated = resumes.filter(r => r.id !== id);
    if (wasActive && updated.length > 0) {
      updated[0].active = true;
      dispatch({ type: 'SET_RESUME_DATA', payload: updated[0].content });
    } else if (!updated.length) {
      dispatch({ type: 'SET_RESUME_DATA', payload: null });
    }
    dispatch({ type: 'SET_RESUMES', payload: updated });
  };

  const setActive = (id) => {
    dispatch({ type: 'SET_ACTIVE_RESUME', payload: id });
  };

  const cancelForm = () => {
    setShowForm(false);
    setDraftTitle('');
    setDraftContent('');
    setEditingId(null);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal modal-3d" style={{ maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto' }}>

        <div className="modal-header">
          <div>
            <div className="modal-title">📄 Resume Library</div>
            <div className="modal-subtitle">
              Manage multiple resumes — select the active one before each session
            </div>
          </div>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body" style={{ gap: 14 }}>

          {/* Resume list */}
          {resumes.length === 0 && !showForm && (
            <div style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              border: '2px dashed var(--border)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No resumes saved</div>
              <div>Add your first resume to personalise AI answers</div>
            </div>
          )}

          {resumes.map((resume) => (
            <div
              key={resume.id}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: `2px solid ${resume.active ? 'var(--primary)' : 'var(--border)'}`,
                background: resume.active ? 'rgba(99,102,241,0.07)' : 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'all 0.18s',
              }}
            >
              <div
                onClick={() => setActive(resume.id)}
                style={{
                  width: 18, height: 18,
                  borderRadius: '50%',
                  border: `2px solid ${resume.active ? 'var(--primary)' : 'var(--border)'}`,
                  background: resume.active ? 'var(--primary)' : 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.18s',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: resume.active ? 'var(--primary)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {resume.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {resume.content.length} chars · {resume.active ? '✅ Active' : 'Click radio to activate'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => openEditForm(resume)}
                >Edit</button>
                <button
                  onClick={() => deleteResume(resume.id)}
                  style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', cursor: 'pointer' }}
                >✕</button>
              </div>
            </div>
          ))}

          {/* Add / Edit form */}
          {showForm && (
            <div style={{
              padding: 14,
              borderRadius: 'var(--radius-md)',
              border: '2px solid var(--primary)',
              background: 'rgba(99,102,241,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--primary)' }}>
                {editingId ? '✏️ Edit Resume' : '➕ New Resume'}
              </div>
              <input
                type="text"
                placeholder="Resume title (e.g. React Dev, Fullstack, Manager)"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
              <DocumentUploader
                onTextExtracted={(text, filename) => {
                  setDraftContent(prev => {
                    const newContent = `\n\n--- ${filename} ---\n${text}`;
                    return prev ? prev + newContent : newContent.trim();
                  });
                  if (!draftTitle.trim()) {
                    setDraftTitle(filename.replace(/\.[^.]+$/, ''));
                  }
                }}
              />
              <textarea
                ref={textareaRef}
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                placeholder="Paste resume text here (plain text or JSON)..."
                rows={8}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
              <div className="modal-btn-row">
                <button className="btn btn-ghost" onClick={cancelForm}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={saveResume}
                  disabled={!draftContent.trim()}
                >
                  {editingId ? 'Update' : 'Save Resume'}
                </button>
              </div>
            </div>
          )}

          {!showForm && (
            <button
              className="btn btn-ghost"
              onClick={openNewForm}
              style={{ width: '100%', padding: '10px', fontSize: '0.85rem', border: '1.5px dashed var(--border)' }}
            >
              ＋ Add New Resume
            </button>
          )}

          <div className="modal-btn-row" style={{ marginTop: 4 }}>
            <button className="btn btn-primary" onClick={handleClose}>Done</button>
          </div>

        </div>
      </div>
    </div>
  );
}
