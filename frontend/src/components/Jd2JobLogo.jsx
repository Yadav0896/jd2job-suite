import React from 'react';

export default function Jd2JobLogo({ width = 36, height = 36, className = '' }) {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: 'drop-shadow(0 4px 8px rgba(145,47,86,0.25))' }}
    >
      <defs>
        {/* Brand gradient — berry */}
        <linearGradient id="brand-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#b03a6b" />
          <stop offset="100%" stopColor="#912f56" />
        </linearGradient>
        {/* Accent gradient — light berry */}
        <linearGradient id="accent-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e08aae" />
          <stop offset="100%" stopColor="#b03a6b" />
        </linearGradient>
        {/* Twilight mint */}
        <linearGradient id="twilight-grad" x1="0" y1="50" x2="100" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9fc7b8" />
          <stop offset="100%" stopColor="#eaf2ef" />
        </linearGradient>
      </defs>

      {/* Background rounded rectangle */}
      <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#brand-grad)" />

      {/* Spark / Lightning bolt — represents AI speed & intelligence */}
      <path 
        d="M 58 18 L 40 52 L 50 52 L 36 82 L 62 48 L 52 48 Z" 
        fill="#fff" 
        opacity="0.95"
      />

      {/* J — left accent line */}
      <path 
        d="M 22 28 L 22 62 C 22 68 27 72 33 72 C 39 72 44 68 44 62 L 44 52" 
        stroke="url(#twilight-grad)" 
        strokeWidth="6" 
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* Small dot accent */}
      <circle cx="68" cy="60" r="5" fill="url(#accent-grad)" opacity="0.8" />
      <circle cx="80" cy="70" r="3" fill="url(#twilight-grad)" opacity="0.6" />
    </svg>
  );
}
