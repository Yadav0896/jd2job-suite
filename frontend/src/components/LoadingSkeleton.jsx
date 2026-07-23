import React from 'react';

export function Skeleton({ width, height = 16, borderRadius = 6, style }) {
  return (
    <div style={{
      width, height,
      borderRadius,
      background: 'var(--bg-surface, rgba(26,20,34,0.6))',
      border: '1px solid var(--border-light, rgba(255,255,255,0.04))',
      animation: 'skeletonShimmer 1.5s ease-in-out infinite',
      backgroundSize: '200% 100%',
      backgroundImage: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)',
      ...style,
    }} />
  );
}

export function TranscriptSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end',
          maxWidth: i % 2 === 0 ? '75%' : '60%',
        }}>
          <Skeleton width="60px" height={10} borderRadius={4} />
          <Skeleton width="100%" height={40} borderRadius={10} />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div style={{
      padding: 24, borderRadius: 16,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <Skeleton width="40%" height={22} />
      <Skeleton width="90%" height={14} />
      <Skeleton width="70%" height={14} />
      <Skeleton width="100%" height={48} borderRadius={12} style={{ marginTop: 8 }} />
    </div>
  );
}

export default Skeleton;
