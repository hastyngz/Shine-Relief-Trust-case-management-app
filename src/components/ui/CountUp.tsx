import React, { useEffect, useRef, useState } from 'react';

export interface CountUpProps {
  value: number;
  /** Milliseconds for the first count from 0. Later changes use a shorter tween. */
  duration?: number;
  className?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Counts up to `value`. Screen readers always get the final number immediately
 * (the animated digits are hidden from them), and reduced motion skips the animation.
 */
export const CountUp: React.FC<CountUpProps> = ({ value, duration = 700, className }) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  const firstRun = useRef(true);

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = safeValue;
      setShown(safeValue);
      firstRun.current = false;
      return undefined;
    }
    const from = fromRef.current;
    const span = firstRun.current ? duration : Math.min(duration, 350);
    firstRun.current = false;
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const hasRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / span);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (safeValue - from) * eased);
      fromRef.current = next;
      setShown(next);
      if (progress < 1) {
        if (hasRaf) frame = window.requestAnimationFrame(tick);
        else timer = setTimeout(tick, 16);
      }
    };
    tick();
    return () => {
      if (frame && typeof window !== 'undefined') window.cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [safeValue, duration]);

  return (
    <span className={className}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{safeValue}</span>
    </span>
  );
};
