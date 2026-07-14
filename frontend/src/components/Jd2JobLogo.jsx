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
      style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }}
    >
      <defs>
        {/* Document Gradient */}
        <linearGradient id="doc-grad" x1="15" y1="30" x2="45" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>

        {/* Briefcase Gradient */}
        <linearGradient id="case-grad" x1="55" y1="35" x2="85" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>

        {/* Arrow Gradient */}
        <linearGradient id="arrow-grad" x1="15" y1="75" x2="60" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      {/* 1. Document Icon (Left) */}
      <g className="logo-doc">
        {/* Main page sheet */}
        <path 
          d="M 22 28 H 36 L 44 36 V 67 C 44 70 42 72 39 72 H 22 C 19 72 17 70 17 67 V 33 C 17 30 19 28 22 28 Z" 
          fill="url(#doc-grad)" 
        />
        {/* Folded corner */}
        <path 
          d="M 36 28 V 36 H 44 Z" 
          fill="#1e40af" 
          opacity="0.9"
        />
      </g>

      {/* 2. Briefcase Icon (Right) */}
      <g className="logo-case">
        {/* Briefcase handle */}
        <path 
          d="M 64 38 V 34 C 64 32.5 65.5 31 67 31 H 73 C 74.5 31 76 32.5 76 34 V 38" 
          stroke="url(#case-grad)" 
          strokeWidth="3.5" 
          fill="none" 
          strokeLinecap="round"
        />
        {/* Briefcase body */}
        <path 
          d="M 54 41 C 54 39 55.5 38 57.5 38 H 82.5 C 84.5 38 86 39 86 41 V 66 C 86 68 84.5 69 82.5 69 H 57.5 C 55.5 69 54 68 54 66 Z" 
          fill="url(#case-grad)" 
        />
        {/* Metal buckle latch details */}
        <rect x="67" y="44" width="6" height="5" rx="1" fill="#cbd5e1" />
        <rect x="69" y="49" width="2" height="4" rx="0.5" fill="#94a3b8" />
      </g>

      {/* 3. Swooping Action Arrow (Center) */}
      <path 
        d="M 18 73 C 28 85, 46 81, 52 57 L 47 56 L 56 36 L 66 52 L 61 51 C 56 71, 35 77, 18 73 Z" 
        fill="url(#arrow-grad)" 
      />
    </svg>
  );
}
