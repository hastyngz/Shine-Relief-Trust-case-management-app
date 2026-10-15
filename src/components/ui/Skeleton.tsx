import React from 'react';

export interface SkeletonProps {
  className?: string;
  lines?: number;
  label?: string;
}

/** Accessible, dependency-free shimmer placeholder for existing loading areas. */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', lines = 1, label = 'Loading' }) => (
  <div role="status" aria-label={label} className={`space-y-2 ${className}`.trim()}>
    {Array.from({ length: Math.max(1, Math.min(lines, 8)) }, (_, index) => (
      <div
        key={index}
        aria-hidden="true"
        className="fx-skeleton h-4 w-full"
        style={{ width: index === lines - 1 && lines > 1 ? '72%' : '100%' }}
      />
    ))}
  </div>
);
