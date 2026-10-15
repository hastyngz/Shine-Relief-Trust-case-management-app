import React from 'react';
import { AlertTriangle, Check, LoaderCircle, Save } from 'lucide-react';

export type SaveButtonStatus = 'idle' | 'saving' | 'done' | 'error';

export interface SaveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  status?: SaveButtonStatus;
  idleLabel?: string;
  savingLabel?: string;
  doneLabel?: string;
}

/** Visual-only save feedback. Parent owns save timing and error handling. */
export const SaveButton: React.FC<SaveButtonProps> = ({
  status = 'idle',
  idleLabel = 'Save',
  savingLabel = 'Saving…',
  doneLabel = 'Saved',
  className = '',
  disabled,
  children,
  ...props
}) => {
  const label = status === 'saving' ? savingLabel : status === 'done' ? doneLabel : status === 'error' ? 'Try again' : idleLabel;
  return (
    <button
      {...props}
      type={props.type || 'submit'}
      disabled={disabled || status === 'saving'}
      aria-busy={status === 'saving'}
      data-save-state={status}
      className={`fx-press min-h-11 inline-flex items-center justify-center gap-2 ${className}`.trim()}
    >
      {status === 'saving' ? <LoaderCircle aria-hidden="true" className="fx-spinner h-4 w-4" /> :
       status === 'done' ? <span className="fx-success-pop inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white"><Check aria-hidden="true" className="fx-tick h-4 w-4" /></span> :
       status === 'error' ? <AlertTriangle aria-hidden="true" className="h-4 w-4 text-red-700" /> : <Save aria-hidden="true" className="h-4 w-4" />}
      <span aria-live="polite" aria-atomic="true">{status === 'idle' ? (children ?? label) : label}</span>
    </button>
  );
};
