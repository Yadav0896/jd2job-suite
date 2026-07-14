import { useApp } from '../context/AppContext';

export default function KeywordTracker() {
  const { state } = useApp();
  const { technicalKeywords } = state;

  if (!technicalKeywords || technicalKeywords.length === 0) return null;

  return (
    <div className="keyword-tracker">
      {technicalKeywords.map((kw, idx) => (
        <div 
          key={idx} 
          className={`keyword-pill ${kw.matched ? 'matched' : ''}`}
          title={kw.matched ? 'Mentioned!' : 'Try to mention this technical skill'}
        >
          <span className="keyword-check">✓</span>
          {kw.word}
        </div>
      ))}
    </div>
  );
}
