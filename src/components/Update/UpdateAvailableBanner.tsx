import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  applyServiceWorkerUpdate,
  SW_UPDATE_AVAILABLE_EVENT,
  CHUNK_LOAD_FAILED_EVENT,
} from '../../pwa/registerServiceWorker';
import { hasUnsavedChanges, UNSAVED_CHANGES_EVENT } from '../../pwa/unsavedChanges';

/**
 * Prompt shown when a new version of the app has been deployed. It never
 * reloads on its own: if any view reports unsaved form data the prompt stays
 * put until the user has saved (or explicitly chooses to reload).
 */
export const UpdateAvailableBanner: React.FC = () => {
  const [available, setAvailable] = useState(false);
  const [unsaved, setUnsaved] = useState(hasUnsavedChanges);

  useEffect(() => {
    const onUpdate = () => setAvailable(true);
    const onUnsaved = () => setUnsaved(hasUnsavedChanges());
    window.addEventListener(SW_UPDATE_AVAILABLE_EVENT, onUpdate);
    window.addEventListener(CHUNK_LOAD_FAILED_EVENT, onUpdate);
    window.addEventListener(UNSAVED_CHANGES_EVENT, onUnsaved);
    return () => {
      window.removeEventListener(SW_UPDATE_AVAILABLE_EVENT, onUpdate);
      window.removeEventListener(CHUNK_LOAD_FAILED_EVENT, onUpdate);
      window.removeEventListener(UNSAVED_CHANGES_EVENT, onUnsaved);
    };
  }, []);

  if (!available) return null;

  return (
    <div
      className="bg-teal-950 text-white border-b border-teal-800 px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-center gap-3"
      role="status"
    >
      <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
      <span>
        {unsaved
          ? 'A new version is available. Save your form before reloading.'
          : 'A new version of SHINE is available.'}
      </span>
      <button
        type="button"
        onClick={() => {
          if (unsaved && !window.confirm('You have unsaved changes. Reload anyway and lose them?')) return;
          applyServiceWorkerUpdate();
        }}
        className="rounded-lg bg-amber-400 px-3 py-1 text-teal-950 font-bold hover:bg-amber-300"
      >
        Reload
      </button>
    </div>
  );
};
