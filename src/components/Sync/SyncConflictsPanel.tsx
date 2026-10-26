import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, HardDrive, RefreshCw, X } from 'lucide-react';
import { SyncConflict, SyncConflictResolution } from '../../types';
import {
  flushPendingOfflineSnapshots,
  readSyncConflicts,
  refreshPendingOfflineSnapshotCount,
  resolveSyncConflict,
  SYNC_CONFLICTS_UPDATED_EVENT,
} from '../../services/offlineSync';
import { appendSyncConflictAudit } from '../../services/firestoreSync';
import { estimateStorage } from '../../services/offlineSyncDb';
import { useAuth } from '../../contexts/AuthContext';
import { getActiveWorkspaceUid } from '../../services/accountWorkspace';

interface SyncConflictsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** When the storage banner is showing, surface storage use in the panel too. */
  storageWarning?: boolean;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

function friendlyCollection(collection: string): string {
  return collection
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}

export const SyncConflictsPanel: React.FC<SyncConflictsPanelProps> = ({ isOpen, onClose, storageWarning }) => {
  const { currentUser, staffProfile, auditActor, role, isAdmin } = useAuth();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictLoadFailed, setConflictLoadFailed] = useState(false);

  const actor = {
    uid: currentUser?.uid || 'unknown',
    name: staffProfile?.fullName || auditActor || currentUser?.email || 'SHINE staff',
    canReadImportSourceData: isAdmin || role === 'Manager',
    canWriteImportAuditMetadata: isAdmin,
  };

  const refresh = useCallback(async () => {
    const uid = currentUser?.uid;
    if (!uid || getActiveWorkspaceUid() !== uid) {
      setConflicts([]);
      setQueuedCount(0);
      setConflictLoadFailed(true);
      setMessage('Sync conflict status is unavailable until your signed-in workspace is ready.');
      return;
    }
    try {
      const [nextConflicts, nextCount, estimate] = await Promise.all([
        readSyncConflicts(),
        refreshPendingOfflineSnapshotCount(),
        estimateStorage(),
      ]);
      if (currentUser?.uid !== uid || getActiveWorkspaceUid() !== uid) return;
      setConflicts(nextConflicts);
      setQueuedCount(nextCount);
      setStorage(estimate);
      setConflictLoadFailed(false);
    } catch {
      setConflictLoadFailed(true);
      setMessage('Could not read saved sync conflicts. They have not been cleared. Check device storage and retry.');
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    const handler = () => { void refresh(); };
    window.addEventListener(SYNC_CONFLICTS_UPDATED_EVENT, handler);
    window.addEventListener('shine_offline_queue_updated', handler);
    return () => {
      window.removeEventListener(SYNC_CONFLICTS_UPDATED_EVENT, handler);
      window.removeEventListener('shine_offline_queue_updated', handler);
    };
  }, [isOpen, refresh]);

  const handleResolve = async (conflict: SyncConflict, resolution: SyncConflictResolution) => {
    if (!currentUser || conflict.ownerUid !== currentUser.uid) {
      setMessage('This conflict has no verified owner and cannot be resolved from this account. Its data has been preserved.');
      return;
    }
    setBusyId(conflict.id);
    setMessage(null);
    try {
      const resolved = await resolveSyncConflict(conflict.id, resolution, actor);
      if (!resolved) {
        setMessage('Could not verify ownership of this conflict. It has been preserved for recovery.');
        return;
      }
      try {
        await appendSyncConflictAudit({
          action: 'conflict_resolved',
          resolution,
          collection: conflict.collection,
          recordId: conflict.recordId,
          userId: actor.uid,
          userName: actor.name,
          timestamp: new Date().toISOString(),
          localUpdatedAt: conflict.localData?.updatedAt ?? conflict.baseUpdatedAt,
          serverUpdatedAt: conflict.serverUpdatedAt,
          serverUpdatedBy: conflict.serverUpdatedBy,
        });
      } catch {
        console.warn('Conflict was resolved locally but its audit event could not be saved.');
      }
      if (resolution === 'keep-mine') {
        const result = await flushPendingOfflineSnapshots({ actor });
        setMessage(result.applied > 0 ? 'Your version was saved.' : 'Saved locally; it will sync when online.');
      } else {
        setMessage('The other staff member\u2019s version was kept.');
      }
      await refresh();
    } catch (error) {
      console.error('Could not resolve sync conflict:', error);
      setMessage('Could not resolve this conflict. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;
  const visibleConflicts = currentUser ? conflicts.filter((conflict) => conflict.ownerUid === currentUser.uid) : [];
  const hasUnverifiedConflicts = conflicts.some((conflict) => conflict.ownerUid !== currentUser?.uid);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Sync conflicts">
      <section className="mt-8 w-full max-w-2xl rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <CloudOff className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-bold text-stone-900">Sync conflicts</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close sync conflicts" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-stone-600">
            <span className="inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-teal-700" /> {queuedCount} queued change{queuedCount === 1 ? '' : 's'}</span>
            {storage && (
              <span className={`inline-flex items-center gap-1.5 ${storageWarning ? 'text-rose-700' : ''}`}>
                <HardDrive className="h-3.5 w-3.5" /> Storage used: {formatBytes(storage.usage)} of {formatBytes(storage.quota)}
              </span>
            )}
          </div>

          {message && (
            <p className="rounded-lg bg-teal-50 px-3 py-2 text-[11px] font-semibold text-teal-900">{message}</p>
          )}

          {conflictLoadFailed ? (
            <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-4 text-xs text-amber-950">
              The saved conflict list could not be verified. No conflicts have been cleared; retry after checking device storage.
            </p>
          ) : hasUnverifiedConflicts ? (
            <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-4 text-xs text-amber-950">
              Some saved conflict records have no verified owner. Their details are hidden and the records are preserved for recovery.
            </p>
          ) : visibleConflicts.length === 0 ? (
            <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-6 text-center text-xs text-stone-600">
              No sync conflicts. Edits from this phone have been applied without overwriting newer work.
            </p>
          ) : (
            <ul className="space-y-3">
              {visibleConflicts.map((conflict) => {
                const localUpdatedAt = conflict.localData?.updatedAt ?? conflict.baseUpdatedAt;
                const isDelete = conflict.localOperation === 'delete';
                return (
                  <li key={conflict.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-stone-900">
                          {friendlyCollection(conflict.collection)} · <span className="font-mono">{conflict.recordId}</span>
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-stone-700">
                          Changed on another device
                          {conflict.serverUpdatedBy ? ` by ${conflict.serverUpdatedBy}` : ''}
                          {conflict.serverUpdatedAt ? ` on ${new Date(conflict.serverUpdatedAt).toLocaleString()}` : ''}.
                          Your change{isDelete ? ' (deletion)' : ''} was made
                          {localUpdatedAt ? ` on ${new Date(localUpdatedAt).toLocaleString()}` : ' on this phone'}.
                        </p>
                        {(!currentUser || conflict.ownerUid !== currentUser.uid) && (
                          <p className="mt-2 text-[11px] font-semibold text-amber-900">
                            Owner not verified. This conflict is preserved and cannot be resolved in this session.
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyId === conflict.id || !currentUser || conflict.ownerUid !== currentUser.uid}
                            onClick={() => handleResolve(conflict, 'keep-mine')}
                            className="rounded-lg bg-teal-800 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                          >
                            Keep mine
                          </button>
                          <button
                            type="button"
                            disabled={busyId === conflict.id || !currentUser || conflict.ownerUid !== currentUser.uid}
                            onClick={() => handleResolve(conflict, 'keep-theirs')}
                            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                          >
                            Keep theirs
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
