import React, { useRef, useState } from 'react';

export interface SwipeRowProps {
  children: React.ReactNode;
  /** Label of the revealed action button, for example "Complete". */
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}

const REVEAL = 96;
const OPEN_AT = 48;

/**
 * Swipe a row left to reveal one action button. The swipe only reveals the
 * action; it is never run by the swipe itself, so nothing happens by accident.
 * Keep the normal buttons inside the row as the keyboard alternative.
 */
export const SwipeRow: React.FC<SwipeRowProps> = ({ children, actionLabel, onAction, disabled = false }) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; base: number; pointerId: number } | null>(null);
  const movedRef = useRef(false);

  if (disabled) return <>{children}</>;

  const isOpen = offset <= -OPEN_AT;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startRef.current = { x: event.clientX, y: event.clientY, base: offset, pointerId: event.pointerId };
    movedRef.current = false;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!movedRef.current) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      movedRef.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setOffset(Math.max(-REVEAL, Math.min(0, start.base + dx)));
  };

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    startRef.current = null;
    if (!movedRef.current) return;
    setDragging(false);
    setOffset((current) => (current <= -OPEN_AT ? -REVEAL : 0));
  };

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    // A drag must not also click the buttons under the finger.
    if (movedRef.current) {
      event.stopPropagation();
      event.preventDefault();
      movedRef.current = false;
    }
  };

  return (
    <div className="fx-swipe">
      <div className="fx-swipe-action" style={{ visibility: offset === 0 ? 'hidden' : 'visible' }}>
        <button
          type="button"
          tabIndex={isOpen ? 0 : -1}
          aria-hidden={isOpen ? undefined : true}
          onClick={() => {
            setOffset(0);
            onAction();
          }}
          className="fx-press min-h-11 min-w-20 rounded-lg px-3 text-sm font-bold text-white"
        >
          {actionLabel}
        </button>
      </div>
      <div
        className="fx-swipe-content"
        data-dragging={dragging ? 'true' : 'false'}
        data-moved={offset === 0 ? 'false' : 'true'}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
};
