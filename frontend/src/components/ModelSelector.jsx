import React from 'react';
import { useApp } from '../context/AppContext';

export default function ModelSelector() {
  const { state, dispatch } = useApp();
  const { selectedModel } = state;

  const handleChange = (e) => {
    const model = e.target.value;
    dispatch({ type: 'SET_SELECTED_MODEL', payload: model });
    
    // Automatically turn speed mode ON if they pick the ultra-fast Llama,
    // and OFF if they pick default, to keep user experience intuitive.
    if (model === 'llama_fast' && !state.speedMode) {
      dispatch({ type: 'TOGGLE_SPEED_MODE' });
    } else if (model === 'default' && state.speedMode) {
      dispatch({ type: 'TOGGLE_SPEED_MODE' });
    }
  };

  return (
    <div className="model-selector-wrapper">
      <style>{`
        .model-selector-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .model-select-dropdown {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--text-primary, #ffffff);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          outline: none;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .model-select-dropdown:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.25);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15), 0 0 0 2px rgba(99, 102, 241, 0.2);
          transform: translateY(-1px);
        }

        .model-select-dropdown:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
        }

        .model-select-dropdown option {
          background: #18181b;
          color: #ffffff;
        }

        .fast-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-radius: 9999px;
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
          animation: badge-pulse 2s infinite ease-in-out;
        }

        @keyframes badge-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.95;
          }
          50% {
            transform: scale(1.03);
            opacity: 1;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5);
          }
        }
      `}</style>
      
      <select
        className="model-select-dropdown"
        value={selectedModel}
        onChange={handleChange}
        aria-label="Select AI Model Speed"
      >
        <option value="default">🧠 Default Model (Comprehensive)</option>
        <option value="llama_fast">⚡ Llama 3.1 8B (Sub-Second Fast)</option>
      </select>

      {selectedModel === 'llama_fast' && (
        <span className="fast-badge">FAST</span>
      )}
    </div>
  );
}
