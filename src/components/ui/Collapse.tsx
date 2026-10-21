import React from 'react';

export interface CollapseProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

/**
 * Smoothly opens and closes a section (grid-template-rows 0fr to 1fr). Closed
 * content is inert, so it cannot be tabbed into or read by screen readers.
 */
export const Collapse: React.FC<CollapseProps> = ({ open, children, className = '', id }) => (
  <div id={id} className={`fx-collapse ${className}`.trim()} data-open={open ? 'true' : 'false'} inert={!open}>
    <div>{children}</div>
  </div>
);
