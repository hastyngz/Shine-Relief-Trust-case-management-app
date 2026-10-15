import React from 'react';

export interface SkeletonProps {
  className?: string;
  lines?: number;
  label?: string;
}

/** Accessible, dependency-free shimmer placeholder for existing loading areas. */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', lines = 1, label = 'Loading' }) => {
  const lineCount = Math.max(1, Math.min(lines, 8));
  return (
  <div role="status" aria-label={label} className={`space-y-2 ${className}`.trim()}>
    {Array.from({ length: lineCount }, (_, index) => (
      <div
        key={index}
        aria-hidden="true"
        className="fx-skeleton h-4 w-full"
        style={{ width: index === lineCount - 1 && lineCount > 1 ? '72%' : '100%' }}
      />
    ))}
  </div>
  );
};
