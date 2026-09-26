import React, { useRef, useState, useEffect } from 'react';
import { AppDatabase } from '../types';
import { resetDatabaseToSeed, exportDatabaseJSON, importDatabaseJSON } from '../utils/storage';
import { syncEntireDatabaseToFirestore, getSyncStatus, subscribeSyncStatus, SyncStatus } from '../services/firestoreSync';
import { useAuth } from '../contexts/AuthContext';
import { Database, Download, Upload, RotateCcw, X, Check, AlertCircle, CloudCheck, RefreshCw, ShieldAlert } from 'lucide-react';

interface DataModalProps {
  db: AppDatabase;
  isOpen: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}

export const DataModal: React.FC<DataModalProps> = ({
  db,
  isOpen,
  onClose,
  onDataChanged,
}) => {
  const { isAdmin, isViewOnly } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());
  const [isPushingCloud, setIsPushingCloud] = useState(false);

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  if (!isOpen) return null;

  const handleDownloadJSON = async () => {
    try {
      const jsonStr = await exportDatabaseJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shine_relief_malawi_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setMessage({ text: 'Database records and attachment metadata exported. Media files remain in Firebase Storage.', type: 'success' });
    } catch (err) {
      setMessage({ text: 'Could not export database backup: ' + String(err), type: 'error' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
      setMessage({ text: 'Database restore is restricted to Administrators.', type: 'error' });
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const success = await importDatabaseJSON(content);
        if (success) {
          setMessage({ text: 'Database restored and synchronized to Cloud Firestore successfully!', type: 'success' });
          onDataChanged();
        } else {
          setMessage({ text: 'Failed to restore: Invalid backup file format.', type: 'error' });
        }
      } catch (err) {
        setMessage({ text: 'Error reading file: ' + String(err), type: 'error' });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleForceCloudSync = async () => {
    if (isViewOnly) {
      setMessage({ text: 'View-only staff cannot trigger cloud write.', type: 'error' });
      return;
    }
    try {
      setIsPushingCloud(true);
      await syncEntireDatabaseToFirestore(db);
      setMessage({ text: 'All local records successfully written to Google Firebase Firestore database.', type: 'success' });
    } catch (err) {
      setMessage({ text: 'Cloud sync encountered an error: ' + String(err), type: 'error' });
    } finally {
      setIsPushingCloud(false);
    }
  };

  const handleResetToSeed = async () => {
    if (!isAdmin) {
      setMessage({ text: 'Clearing records is strictly restricted to Administrators.', type: 'error' });
      return;
    }
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    try {
      await resetDatabaseToSeed();
      setConfirmReset(false);
      setMessage({ text: 'All data cleared from both Cloud Firestore and local storage.', type: 'success' });
      onDataChanged();
    } catch (err) {
      setMessage({ text: 'Could not clear all records: ' + String(err), type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-stone-200 overflow-hidden">
        <div className="bg-teal-950 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-base">Persistent Cloud Database & Backup</h2>
          </div>
          <button onClick={onClose} className="text-stone-300 hover:text-white p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {message && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {message.type === 'success' ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Cloud Database Architecture Status */}
          <div className="p-4 bg-teal-50/60 rounded-xl border border-teal-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-950 text-sm flex items-center gap-1.5">
                <CloudCheck className="w-4 h-4 text-teal-700" />
                Firebase Firestore Persistence
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  syncStatus === 'synced' || syncStatus === 'connected'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : syncStatus === 'saving'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-stone-200 text-stone-800'
                }`}
              >
                {syncStatus === 'synced' || syncStatus === 'connected'
                  ? 'Active / Synced'
                  : syncStatus === 'saving'
                  ? 'Writing to Cloud'
                  : syncStatus}
              </span>
            </div>
            <p className="text-stone-600 text-xs leading-relaxed">
              Every girl profile, household, educational note, medical visit, family log, rent payment, and expense is saved to a persistent Google Cloud Firestore database. Changes synchronize automatically across staff devices.
            </p>
            <div className="pt-1 flex gap-2">
              <button
                onClick={handleForceCloudSync}
                disabled={isPushingCloud}
                className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPushingCloud ? 'animate-spin' : ''}`} />
                <span>{isPushingCloud ? 'Syncing...' : 'Force Cloud Sync'}</span>
              </button>
            </div>
          </div>

          {/* Database stats summary */}
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
            <span className="font-bold text-stone-700 block text-sm">Collection Record Counts</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-stone-800 font-semibold">
              <div className="p-2 bg-white rounded border border-stone-200 text-center">
                <div className="text-base font-black text-teal-900">{db.girls.length}</div>
                <div className="text-[10px] text-stone-500 uppercase">Girls</div>
              </div>
              <div className="p-2 bg-white rounded border border-stone-200 text-center">
                <div className="text-base font-black text-teal-900">{db.households.length}</div>
                <div className="text-[10px] text-stone-500 uppercase">Houses</div>
              </div>
              <div className="p-2 bg-white rounded border border-stone-200 text-center">
                <div className="text-base font-black text-teal-900">
                  {db.educationalFollowUps.length + db.healthFollowUps.length + db.familyFollowUps.length}
                </div>
                <div className="text-[10px] text-stone-500 uppercase">Follow-Ups</div>
              </div>
              <div className="p-2 bg-white rounded border border-stone-200 text-center">
                <div className="text-base font-black text-teal-900">
                  {db.expenses.length + db.rentPayments.length + db.householdActivities.length}
                </div>
                <div className="text-[10px] text-stone-500 uppercase">House Ops</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            <button
              onClick={handleDownloadJSON}
              className="w-full p-2.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download Offline JSON Backup</span>
            </button>

            {isAdmin && (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-stone-300 transition-colors"
                >
                  <Upload className="w-4 h-4 text-stone-600" />
                  <span>Restore Database from Backup</span>
                </button>
              </div>
            )}

            {/* Clear Database button - Admin only */}
            {isAdmin && (
              <div className="pt-2 border-t border-stone-200">
                {confirmReset ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                    <p className="text-xs text-red-800 font-semibold">
                      Are you sure? This will delete all girl profiles, households, follow-ups, and financial logs from both Cloud Firestore and local storage.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleResetToSeed}
                        className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg"
                      >
                        Yes, Clear All Data
                      </button>
                      <button
                        onClick={() => setConfirmReset(false)}
                        className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-semibold rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="w-full p-2 text-stone-500 hover:text-red-700 hover:bg-red-50 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear All Database Records</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
