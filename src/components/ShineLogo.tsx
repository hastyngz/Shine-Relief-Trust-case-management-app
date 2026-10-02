import React from 'react';

interface ShineLogoProps {
  variant?: 'full' | 'mark';
  className?: string;
  alt?: string;
}

export const ShineLogo: React.FC<ShineLogoProps> = ({
  variant = 'full',
  className = '',
  alt = 'SHINE Relief Trust logo',
}) => {
  void variant;

  return (
    <img
      src="/new-shine-logo-transparent.png"
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );
};