import React from 'react';

/** The SHINE sun for empty states. It rises once and then stays still. */
export const EmptySun: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`fx-sunrise inline-flex ${className}`.trim()} aria-hidden="true">
    <svg width="56" height="56" viewBox="0 0 32 32" fill="none" stroke="#ff7e1b" strokeWidth="2" strokeLinecap="round">
      <circle cx="16" cy="16" r="6" fill="#ff7e1b" />
      <path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l3 3M22 22l3 3M25 7l-3 3M10 22l-3 3" />
    </svg>
  </span>
);
