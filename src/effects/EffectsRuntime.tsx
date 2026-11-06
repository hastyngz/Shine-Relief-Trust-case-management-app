import React, { useEffect, useRef, useState } from 'react';

/**
 * Mounted once from main.tsx. Adds app-wide polish that works in every view and
 * colour theme without touching individual screens:
 * - header shadow once the page has scrolled
 * - pull down at the top of the page to sync (nudges the existing reconnect sync)
 * - "Draft saved" chip when an edit is queued while offline
 * - "Report ready" card when a file download starts
 * - one-time sparks (window event "shine:celebrate")
 * Every effect is visual only and respects prefers-reduced-motion.
 */

export const CELEBRATE_EVENT = 'shine:celebrate';
export const FILE_READY_EVENT = 'shine:file-ready';

const PULL_TRIGGER = 70;
const PULL_MAX = 96;
const FILE_EXTENSIONS = /\.(docx|xlsx|pdf|csv|json|zip)$/i;

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isInsideScroller(target: EventTarget | null): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== document.body) {
    if (node.matches('[role="dialog"], [aria-modal="true"], textarea, input, select')) return true;
    if (node.scrollTop > 0) return true;
    node = node.parentElement;
  }
  return false;
}

export function celebrate(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT));
}

const EffectsRuntimeInner: React.FC = () => {
  const [pull, setPull] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [chipKey, setChipKey] = useState(0);
  const [file, setFile] = useState<{ name: string; kind: string } | null>(null);
  const [sparkKey, setSparkKey] = useState(0);
  const pullStart = useRef<{ y: number } | null>(null);
  const pullRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // Header shadow after scrolling.
  useEffect(() => {
    const update = () => {
      document.documentElement.dataset.scrolled = window.scrollY > 8 ? 'true' : 'false';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  // Pull down at the top of the page to sync.
  useEffect(() => {
    const onStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || event.touches.length !== 1 || isInsideScroller(event.target)) {
        pullStart.current = null;
        return;
      }
      pullStart.current = { y: event.touches[0].clientY };
    };
    const onMove = (event: TouchEvent) => {
      const start = pullStart.current;
      if (!start) return;
      const dy = event.touches[0].clientY - start.y;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const next = Math.min(PULL_MAX, dy * 0.6);
      pullRef.current = next;
      setPull(next);
    };
    const onEnd = () => {
      const reached = pullRef.current >= PULL_TRIGGER * 0.6;
      pullStart.current = null;
      pullRef.current = 0;
      setPull(0);
      if (!reached) return;
      setSyncing(true);
      // The app flushes its offline queue on "online"; this nudges that same sync.
      if (typeof navigator === 'undefined' || navigator.onLine) window.dispatchEvent(new Event('online'));
      later(() => setSyncing(false), 1200);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // "Draft saved" chip: an edit was queued while the phone is offline.
  useEffect(() => {
    const onQueue = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) setChipKey((key) => key + 1);
    };
    window.addEventListener('shine_offline_queue_updated', onQueue);
    return () => window.removeEventListener('shine_offline_queue_updated', onQueue);
  }, []);

  // "Report ready" card when a file download starts.
  useEffect(() => {
    const proto = typeof HTMLAnchorElement === 'undefined' ? undefined : HTMLAnchorElement.prototype;
    if (!proto) return undefined;
    const original = proto.click;
    proto.click = function patchedClick(this: HTMLAnchorElement) {
      try {
        const name = this.download;
        if (name && FILE_EXTENSIONS.test(name)) {
          window.dispatchEvent(new CustomEvent(FILE_READY_EVENT, { detail: { name } }));
        }
      } catch {
        // Never block a download because of a visual effect.
      }
      return original.call(this);
    };
    const onFile = (event: Event) => {
      const name = (event as CustomEvent<{ name: string }>).detail?.name;
      if (!name) return;
      setFile({ name, kind: /\.(docx|xlsx|pdf)$/i.test(name) ? 'Report ready' : 'Download ready' });
      later(() => setFile(null), 4500);
    };
    window.addEventListener(FILE_READY_EVENT, onFile);
    return () => {
      proto.click = original;
      window.removeEventListener(FILE_READY_EVENT, onFile);
    };
  }, []);

  // One short burst of sparks.
  useEffect(() => {
    const onCelebrate = () => {
      if (reducedMotion()) return;
      setSparkKey((key) => key + 1);
      later(() => setSparkKey(0), 900);
    };
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    return () => window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
  }, []);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const showPull = pull > 6 || syncing;

  return (
    <>
      {showPull && (
        <div
          className="fx-overlay-pull"
          role="status"
          aria-label={syncing ? 'Syncing' : 'Pull to sync'}
          style={{ transform: `translateY(${syncing ? 16 : Math.max(0, pull - 28)}px)` }}
        >
          <svg
            className={syncing ? 'fx-spinner' : undefined}
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            stroke="#ff7e1b"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
            style={syncing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
          >
            <circle cx="16" cy="16" r="6" fill="#ff7e1b" />
            <path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l3 3M22 22l3 3M25 7l-3 3M10 22l-3 3" />
          </svg>
        </div>
      )}
      {chipKey > 0 && (
        <span key={chipKey} className="fx-overlay-chip" role="status">
          Draft saved on this phone
        </span>
      )}
      {file && (
        <div className="fx-overlay-file" role="status">
          <span className="fx-success-pop inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path className="fx-tick" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{file.kind}</span>
            <span className="block truncate text-xs text-stone-600">{file.name}</span>
          </span>
        </div>
      )}
      {sparkKey > 0 && (
        <div key={sparkKey} className="fx-overlay-sparks" aria-hidden="true">
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <span key={angle} className="fx-spark" style={{ '--a': `${angle}deg` } as React.CSSProperties} />
          ))}
        </div>
      )}
    </>
  );
};

/** A crash in a visual effect must never take the app down: render nothing instead. */
class EffectsBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export const EffectsRuntime: React.FC = () => (
  <EffectsBoundary>
    <EffectsRuntimeInner />
  </EffectsBoundary>
);
