import { useApp } from '../context/AppContext';

export default function KeywordTracker() {
  const { state } = useApp();
  const { technicalKeywords } = state;

  if (!technicalKeywords || technicalKeywords.length === 0) return null;

  return (
    <div className="keyword-tracker">
      {technicalKeywords.map((kw, idx) => {
        // Normalize: support both {word, matched} objects and plain strings
        const word = typeof kw === 'string' ? kw : kw.word;
        const matched = typeof kw === 'string' ? false : kw.matched;
        return (
          <div 
            key={idx} 
            className={`keyword-pill ${matched ? 'matched' : ''}`}
            title={matched ? 'Mentioned!' : 'Try to mention this technical skill'}
          >
            <span className="keyword-check">✓</span>
            {word}
          </div>
        );
      })}
    </div>
  );
}
