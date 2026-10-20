import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef, lazy, Suspense } from 'react';
import {
  AppDatabase,
  Girl,
  Household,
  EducationalFollowUp,
  HealthFollowUp,
  FamilyFollowUp,
  HouseholdRentPayment,
  HouseholdExpense,
  HouseholdActivity,
} from './types';
import {
  getDatabase,
  saveDatabase,
  saveIncomingCloudSnapshot,
  addGirl,
  updateGirl,
  deleteGirl,
  addHousehold,
  updateHousehold,
  deleteHousehold,
  addEducationalFollowUp,
  deleteEducationalFollowUp,
  addHealthFollowUp,
  deleteHealthFollowUp,
  addFamilyFollowUp,
  deleteFamilyFollowUp,
  addRentPayment,
  deleteRentPayment,
  addExpense,
  updateExpense,
  deleteExpense,
  addHouseholdActivity,
  deleteHouseholdActivity,
  addEducationHistoryRecord,
  updateEducationHistoryRecord,
  STORAGE_WARNING_EVENT,
  STORAGE_RECOVERED_EVENT,
} from './utils/storage';
import {
  initFirestoreListeners,
  subscribeSyncStatus,
  getSyncStatus,
  SyncStatus,
} from './services/firestoreSync';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MessagingProvider } from './contexts/MessagingContext';
import { useVisualSettings, VisualSettingsProvider } from './contexts/VisualSettingsContext';
import { StaffLoginView } from './components/StaffLoginView';
import { ShineLogo } from './components/ShineLogo';

import { Header } from './components/Header';
import { UpdateAvailableBanner } from './components/Update/UpdateAvailableBanner';
import { markUnsavedChanges, clearUnsavedChanges } from './pwa/unsavedChanges';
import { Navigation, NavTab } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { detectIntelligenceSuggestions, findPotentialDuplicates, scanDataQuality } from './services/caseIntelligenceService';
import { ProgrammeId } from './data/programmes';
import type { QualityIssue } from './services/qualityRules';
import {
  triggerDataChangeNotification,
  checkAndTriggerFollowUpReminders,
} from './services/messagingService';
import { filterRestrictedCachedData, hasRestrictedCachedData } from './services/healthRecordAccess';
import { flushPendingOfflineSnapshots, recordOfflineChanges, isBrowserOnline, isConfirmedServerSnapshot } from './services/offlineSync';

import { ErrorBoundary } from './components/Error/ErrorBoundary';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { uploadPhotoAttachment } from './services/attachmentService';
import { PendingPhoto } from './components/Attachments/FormPhotoSection';
import { AttachmentTargetType } from './types';
import type { ActionType } from './components/QuickAddModal';
import { AppView, parseHash, buildHash, qualityTargetHash } from './routing/appRoutes';
import { AppViewSwitch } from './views/AppViewSwitch';
import { useAppModals } from './hooks/useAppModals';
import { AppModals } from './views/AppModals';
import { Skeleton } from './components/ui/Skeleton';

// Heavy views are split out of the first download so the dashboard and
// navigation load quickly on a weak connection. Each is fetched on first use.
const ManagementDashboard = lazy(() =>
  import('./components/ManagementDashboard').then((module) => ({ default: module.ManagementDashboard })));
const Reports = lazy(() =>
  import('./components/Reports').then((module) => ({ default: module.Reports })));
const ReportBuilder = lazy(() =>
  import('./components/Reports/ReportBuilder').then((module) => ({ default: module.ReportBuilder })));
const AIAssistantView = lazy(() =>
  import('./components/AIAssistant/AIAssistantView').then((module) => ({ default: module.AIAssistantView })));
const MessagingView = lazy(() =>
  import('./components/Messaging/MessagingView').then((module) => ({ default: module.MessagingView })));
const BudgetsAndWorkplansView = lazy(() =>
  import('./components/Planning/BudgetsAndWorkplansView').then((module) => ({ default: module.BudgetsAndWorkplansView })));
const PayrollDashboard = lazy(() =>
  import('./components/PayrollDashboard').then((module) => ({ default: module.PayrollDashboard })));
const ContractsDashboard = lazy(() =>
  import('./components/ContractsDashboard').then((module) => ({ default: module.ContractsDashboard })));
const CaseManagementView = lazy(() =>
  import('./components/CaseManagementView').then((module) => ({ default: module.CaseManagementView })));
const DataImportWizard = lazy(() =>
  import('./components/Import/DataImportWizard').then((module) => ({ default: module.DataImportWizard })));
const ContactsView = lazy(() =>
  import('./components/Contacts/ContactsView').then((module) => ({ default: module.ContactsView })));
const Phase5OperationsView = lazy(() =>
  import('./components/Intelligence/Phase5OperationsView').then((module) => ({ default: module.Phase5OperationsView })));
const ProgrammesView = lazy(() =>
  import('./components/Programmes/ProgrammesView').then((module) => ({ default: module.ProgrammesView })));
const StaffManagement = lazy(() =>
  import('./components/StaffManagement').then((module) => ({ default: module.StaffManagement })));

/** Lightweight placeholder shown while a split view is downloading. */
function ViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="w-48" label="Loading view" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        <div className="fx-skeleton h-28 rounded-2xl" />
        <div className="fx-skeleton h-28 rounded-2xl" />
        <div className="fx-skeleton h-28 rounded-2xl" />
      </div>
      <div className="fx-skeleton h-64 rounded-2xl" aria-hidden="true" />
    </div>
  );
}

function AppContent() {
  const { mobileViewMode, foundationLook, theme, glassEffect, animatedGlass } = useVisualSettings();
  const {
    currentUser,
    staffProfile,
    role,
    allStaff,
    loading,
    isSuspended,
    isRegisteredStaff,
    auditActor,
    isViewOnly,
    isAdmin,
    canViewHealthRecords,
    canEditHealthRecords,
    canViewCaseReviews,
    canViewSafeguarding,
    logout,
  } = useAuth();
  const [db, setDb] = useState<AppDatabase>(() => getDatabase());
  const [safeguardingCount, setSafeguardingCount] = useState<number>();
  const pendingOperationsReviewCount = useMemo(() => {
    const reviewDb = {
      ...db,
      healthFollowUps: canViewHealthRecords ? db.healthFollowUps : [],
      caseReviews: canViewCaseReviews ? db.caseReviews : [],
    };
    const savedSuggestions = reviewDb.intelligenceSuggestions || [];
    const pendingSuggestions = detectIntelligenceSuggestions(reviewDb).filter((suggestion) =>
      (savedSuggestions.find((saved) => saved.id === suggestion.id)?.reviewStatus || suggestion.reviewStatus) === 'suggested'
    ).length;
    const duplicateCount = findPotentialDuplicates(reviewDb).length;
    const qualityCount = scanDataQuality(reviewDb).filter((issue) => issue.type !== 'duplicate_candidate').length;
    return pendingSuggestions + duplicateCount + qualityCount;
  }, [db, canViewHealthRecords, canViewCaseReviews]);

  useEffect(() => {
    if (!currentUser || isSuspended || (!isAdmin && !canViewSafeguarding)) {
      setSafeguardingCount(undefined);
      return;
    }
    currentUser.getIdToken().then((token) => fetch('/api/safeguarding/count', {
      headers: { Authorization: `Bearer ${token}` },
    })).then((response) => response.ok ? response.json() : null)
      .then((result) => setSafeguardingCount(typeof result?.count === 'number' ? result.count : undefined))
      .catch((err) => {
        console.warn('Safeguarding count could not be loaded:', err);
        setSafeguardingCount(undefined);
      });
  }, [currentUser?.uid, isSuspended, isAdmin, canViewSafeguarding]);

  useLayoutEffect(() => {
    const access = { canViewHealthRecords, canViewCaseReviews, canViewSafeguarding };
    if (currentUser && hasRestrictedCachedData(db, access)) {
      const restrictedDb = filterRestrictedCachedData(db, access);
      saveDatabase(restrictedDb, false);
      setDb(restrictedDb);
    }
  }, [currentUser?.uid, canViewHealthRecords, canViewCaseReviews, canViewSafeguarding, db]);

  // Trigger follow-up reminders check automatically (with deduplication)
  useEffect(() => {
    if (!currentUser || isSuspended || !isRegisteredStaff || allStaff.length === 0) return;
    checkAndTriggerFollowUpReminders(db, allStaff, currentUser.uid).catch((err) => {
      console.warn('Follow-up reminder check failed:', err);
    });
  }, [currentUser?.uid, isSuspended, isRegisteredStaff, allStaff.length, db.educationalFollowUps.length, db.healthFollowUps.length, db.familyFollowUps.length]);

  // Initialize view from hash to preserve view across browser refreshes
  const initialRoute = parseHash();
  const [view, setView] = useState<AppView>(initialRoute.view);
  const [activeTab, setActiveTab] = useState<NavTab>(initialRoute.activeTab);
  const [previousImportLocation, setPreviousImportLocation] = useState<{ view: AppView; tab: NavTab; girlId?: string | null; houseId?: string | null }>({ view: 'dashboard', tab: 'dashboard' });
  const [importWizardKey, setImportWizardKey] = useState(0);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const sharedImportInputRef = useRef<HTMLInputElement>(null);

  // Selected entities for profiles & forms
  const [selectedGirlId, setSelectedGirlId] = useState<string | null>(
    initialRoute.girlId || null
  );
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(
    initialRoute.houseId || null
  );
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<ProgrammeId | null>(
    initialRoute.programmeId || null
  );
  const [programmePlanningRequest, setProgrammePlanningRequest] = useState<{
    requestId: number;
    type: 'budget' | 'workplan';
    programmeId: ProgrammeId;
  } | null>(null);
  const [qualityRecordFocus, setQualityRecordFocus] = useState(initialRoute.qualityTarget || null);
  const [editingGirl, setEditingGirl] = useState<Girl | null>(null);
  const [editingHouse, setEditingHouse] = useState<Household | null>(null);

  // AI Assistant focus contexts
  const [aiFocusGirlId, setAiFocusGirlId] = useState<string | undefined>();
  const [aiFocusHouseId, setAiFocusHouseId] = useState<string | undefined>();

  // Status filter pass-through (e.g. clicking "Completed" in dashboard)
  const [girlsStatusFilter, setGirlsStatusFilter] = useState<string | undefined>(undefined);

  // Modals state
  const {
    isSearchOpen, setIsSearchOpen,
    isDataModalOpen, setIsDataModalOpen,
    isQuickAddOpen, setIsQuickAddOpen,
  } = useAppModals();

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);

  // Firestore sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  // Surface local storage failures (for example a full quota) instead of
  // silently losing offline edits.
  useEffect(() => {
    const handleWarning = () => setStorageWarning(true);
    const handleRecovered = () => setStorageWarning(false);
    window.addEventListener(STORAGE_WARNING_EVENT, handleWarning);
    window.addEventListener(STORAGE_RECOVERED_EVENT, handleRecovered);
    return () => {
      window.removeEventListener(STORAGE_WARNING_EVENT, handleWarning);
      window.removeEventListener(STORAGE_RECOVERED_EVENT, handleRecovered);
    };
  }, []);

  // While a data-entry form is open the app is treated as holding unsaved
  // work, so a pending app update never reloads over it.
  const isFormView = view.startsWith('form-');
  useEffect(() => {
    if (isFormView) markUnsavedChanges();
    else clearUnsavedChanges();
    return () => clearUnsavedChanges();
  }, [isFormView]);

  // Real-time bidirectional Firebase Firestore persistence synchronization
  useEffect(() => {
    if (!currentUser || isSuspended) {
      return;
    }
    const unsub = initFirestoreListeners((cloudDb, meta) => {
      // Do not replace the live UI state or advance the baseline unless the
      // snapshot was durably saved on this device. saveIncomingCloudSnapshot
      // emits the persistent storage warning when local persistence fails.
      if (!saveIncomingCloudSnapshot(cloudDb, isConfirmedServerSnapshot(meta))) return;
      setDb(cloudDb);
    }, {
      uid: currentUser.uid,
      canViewTeamTasks: isAdmin || role === 'Manager',
      canReadHealthRecords: canViewHealthRecords,
      canReadCaseReviews: canViewCaseReviews,
      canReadImportSourceData: isAdmin || role === 'Manager',
      canReadManagementPlanning: isAdmin || role === 'Manager',
    });
    return () => unsub();
  }, [currentUser?.uid, isSuspended, isAdmin, role, canViewHealthRecords, canViewCaseReviews]);

  // On load, drain any queue left by a previous offline session. Without this a
  // phone that was closed while offline and reopened already-online would keep
  // the edits queued until the next connectivity change. The queue is only
  // flushed when online; conflicts are surfaced instead of overwritten.
  useEffect(() => {
    if (!currentUser || isSuspended) return;
    if (!isBrowserOnline()) return;
    void flushPendingOfflineSnapshots({
      actor: {
        uid: currentUser.uid,
        name: staffProfile?.fullName || currentUser.displayName || 'SHINE Staff',
        canReadImportSourceData: isAdmin || role === 'Manager',
        canWriteImportAuditMetadata: isAdmin,
      },
    });
  }, [currentUser?.uid, currentUser?.displayName, isSuspended, staffProfile?.fullName, isAdmin, role]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4000);
  };

  const notifyDataChange = (change: Omit<Parameters<typeof triggerDataChangeNotification>[0], 'actor' | 'allStaff' | 'currentDb'>) => {
    if (!currentUser) return;
    triggerDataChangeNotification({
      ...change,
      actor: { uid: currentUser.uid, name: staffProfile?.fullName || auditActor },
      allStaff,
      currentDb: db,
    }).catch((error) => console.warn('Could not dispatch data change notification:', error));
  };

  // Sync state when storage emits changes locally or across tabs
  const reloadData = useCallback(() => {
    setDb(getDatabase());
  }, []);

  useEffect(() => {
    const handleDbUpdated = () => {
      setDb(getDatabase());
    };
    window.addEventListener('shine_db_updated', handleDbUpdated);
    window.addEventListener('storage', handleDbUpdated);
    return () => {
      window.removeEventListener('shine_db_updated', handleDbUpdated);
      window.removeEventListener('storage', handleDbUpdated);
    };
  }, []);

  // Debounce expensive full-database diffing, but flush at lifecycle and
  // connectivity boundaries so a phone going offline or closing still queues edits.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flushLocalChanges = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      void recordOfflineChanges(db);
    };
    const handleConnectivityChange = () => {
      if (isBrowserOnline()) void flushPendingOfflineSnapshots({
        actor: currentUser ? {
          uid: currentUser.uid,
          name: staffProfile?.fullName || currentUser.displayName || 'SHINE Staff',
          canReadImportSourceData: isAdmin || role === 'Manager',
          canWriteImportAuditMetadata: isAdmin,
        } : undefined,
      });
      else flushLocalChanges();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushLocalChanges();
    };
    timer = setTimeout(flushLocalChanges, 1000);
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    window.addEventListener('pagehide', flushLocalChanges);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
      window.removeEventListener('pagehide', flushLocalChanges);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [db, currentUser, staffProfile?.fullName, isAdmin, role]);

  // Listen for browser Back/Forward navigation via hashchange
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHash();
      setView(route.view);
      setActiveTab(route.activeTab);
      setSelectedProgrammeId(route.programmeId || null);
      setQualityRecordFocus(route.qualityTarget || null);
      if (route.girlId) setSelectedGirlId(route.girlId);
      if (route.houseId) setSelectedHouseId(route.houseId);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Cohesive navigation helper that synchronizes state and URL hash
  const navigateTo = (
    newView: AppView,
    tab?: NavTab,
    girlId?: string | null,
    houseId?: string | null,
    programmeId?: ProgrammeId | null
  ) => {
    setView(newView);
    if (tab) setActiveTab(tab);
    if (girlId !== undefined) setSelectedGirlId(girlId);
    if (houseId !== undefined) setSelectedHouseId(houseId);
    if (newView !== 'programmes' || programmeId !== undefined) setSelectedProgrammeId(programmeId || null);

    let targetHash = buildHash(newView, girlId, houseId, programmeId);
    if (targetHash && window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openQualityRecord = (issue: QualityIssue) => {
    const target = issue.target;
    if (!target) return;
    const kind: 'budget-item' | 'workplan-item' | undefined = target.kind === 'budget-item'
      ? 'budget-item'
      : target.kind === 'workplan-item' || target.kind === 'indicator-result'
        ? 'workplan-item'
        : undefined;
    if (!kind) return;
    const idExists = kind === 'budget-item'
      ? (db.budgets || []).some((item) => item.id === target.id)
      : (db.workplans || []).some((item) => item.id === target.id);
    if (!idExists) return;
    const qualityTarget = { kind, id: target.id };
    setQualityRecordFocus(qualityTarget);
    navigateTo('planning', 'planning');
    const targetHash = qualityTargetHash(kind, target.id);
    if (window.location.hash !== targetHash) window.location.hash = targetHash;
  };

  const openProgramme = (id: ProgrammeId | null) => {
    navigateTo('programmes', 'programmes', undefined, undefined, id);
  };

  // Navigation tab switcher
  const handleSelectTab = (tab: NavTab) => {
    if (tab === 'import') {
      if (view !== 'import') {
        setPreviousImportLocation({ view, tab: activeTab, girlId: selectedGirlId, houseId: selectedHouseId });
      }
      setImportWizardKey((key) => key + 1);
      navigateTo('import', 'import');
      return;
    }
    if (tab === 'girls') {
      setGirlsStatusFilter(undefined);
    }
    if (tab === 'programmes') {
      openProgramme(null);
      return;
    }
    if (tab === 'messages') {
      navigateTo('messages', 'messages');
      return;
    }
    if (tab === 'staff') {
      if (!isAdmin) {
        showToast('Staff management is restricted to Administrators.');
        return;
      }
      navigateTo('staff', 'staff');
      return;
    }
    if (tab === 'ai-assistant') {
      navigateTo('ai-assistant', 'ai-assistant');
      return;
    }
    navigateTo(tab, tab);
  };

  const openImportFilePicker = () => sharedImportInputRef.current?.click();

  // Profile navigation
  const handleOpenGirlProfile = (girlId: string) => {
    navigateTo('girl-profile', 'girls', girlId);
  };

  const handleOpenHouseProfile = (houseId: string) => {
    navigateTo('house-profile', 'houses', undefined, houseId);
  };

  const handleAskAIAboutGirl = (girlId: string) => {
    setAiFocusGirlId(girlId);
    setAiFocusHouseId(undefined);
    navigateTo('ai-assistant', 'ai-assistant');
  };

  const handleAskAIAboutHouse = (houseId: string) => {
    setAiFocusHouseId(houseId);
    setAiFocusGirlId(undefined);
    navigateTo('ai-assistant', 'ai-assistant');
  };

  // Form Openers
  const handleStartRegisterGirl = () => {
    if (isViewOnly) {
      showToast('View-only accounts cannot register new girls.');
      return;
    }
    setEditingGirl(null);
    navigateTo('form-girl', 'girls');
  };

  const handleStartEditGirl = (girl: Girl) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot edit records.');
      return;
    }
    setEditingGirl(girl);
    setView('form-girl');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartAddHouse = () => {
    if (isViewOnly) {
      showToast('View-only accounts cannot add households.');
      return;
    }
    setEditingHouse(null);
    navigateTo('form-house', 'houses');
  };

  const handleStartEditHouse = (house: Household) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot edit households.');
      return;
    }
    setEditingHouse(house);
    setView('form-house');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartEduFollowUp = (girl: Girl) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot add follow-up records.');
      return;
    }
    setSelectedGirlId(girl.id);
    setView('form-edu');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartHealthFollowUp = (girl: Girl) => {
    if (!canEditHealthRecords) {
      showToast('Your account does not have permission to add health records.');
      return;
    }
    setSelectedGirlId(girl.id);
    setView('form-health');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartFamilyFollowUp = (girl: Girl) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot add family follow-ups.');
      return;
    }
    setSelectedGirlId(girl.id);
    setView('form-family');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartRentPayment = (house: Household) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot record rent payments.');
      return;
    }
    setSelectedHouseId(house.id);
    setView('form-rent');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartExpense = (house: Household) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot record expenses.');
      return;
    }
    setSelectedHouseId(house.id);
    setView('form-expense');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartActivity = (house?: Household) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot record activities.');
      return;
    }
    if (house) {
      setSelectedHouseId(house.id);
    } else if (db.households.length > 0) {
      setSelectedHouseId(db.households[0].id);
    }
    setView('form-activity');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Quick Action Handler
  const handleQuickAction = (action: ActionType, girl?: Girl, house?: Household) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot create records.');
      return;
    }
    switch (action) {
      case 'register-girl':
        handleStartRegisterGirl();
        break;
      case 'register-house':
        handleStartAddHouse();
        break;
      case 'add-edu':
        if (girl) handleStartEduFollowUp(girl);
        break;
      case 'add-health':
        if (girl) handleStartHealthFollowUp(girl);
        break;
      case 'add-family':
        if (girl) handleStartFamilyFollowUp(girl);
        break;
      case 'add-rent':
        if (house) handleStartRentPayment(house);
        break;
      case 'add-expense':
        if (house) handleStartExpense(house);
        break;
      case 'add-activity':
        handleStartActivity(house);
        break;
    }
  };

  // Helper to upload pending photos asynchronously in background
  const processPendingPhotos = (
    targetType: AttachmentTargetType,
    targetId: string,
    photos?: PendingPhoto[],
    onFirstSuccess?: (url: string) => void
  ) => {
    if (!photos || photos.length === 0 || !currentUser) return;
    const photosToUpload = photos;
    const unconfirmedCount = photos.filter((photo) => photo.file.type.startsWith('image/') && photo.consent !== true).length;
    showToast(`Uploading ${photosToUpload.length} attachment(s)...${unconfirmedCount ? ` ${unconfirmedCount} will be flagged for consent follow-up.` : ''}`);

    (async () => {
      let failedCount = 0;
      let uploadedCount = 0;
      let firstUploaded = false;
      for (let i = 0; i < photosToUpload.length; i++) {
        const p = photosToUpload[i];
        try {
          const res = await uploadPhotoAttachment({
            file: p.file,
            targetType,
            targetId,
            caption: p.caption,
            category: p.category || 'Supporting Document',
            date: p.date,
            consent: p.file.type.startsWith('image/') ? p.consent : undefined,
            allowUnconfirmedConsent: true,
            user: {
              uid: currentUser.uid,
              fullName: staffProfile?.fullName || currentUser.displayName || auditActor,
              email: currentUser.email || 'staff@shinerelieftrust.org',
              role: role || undefined,
            },
          });
          uploadedCount += 1;
          if (!firstUploaded && res.downloadUrl) {
            firstUploaded = true;
            if (onFirstSuccess) {
              onFirstSuccess(res.downloadUrl);
            }
          }
        } catch (err) {
          failedCount += 1;
          console.error(`Error uploading photo ${p.file.name}:`, err);
        }
      }
      if (uploadedCount > 0) {
        const relatedRecordType = targetType === 'householdActivity' ? 'activity' : targetType;
        notifyDataChange({
          type: 'attachment_added',
          entityId: targetId,
          entityTitle: `${targetType} ${targetId}`,
          detail: `${uploadedCount} photo or receipt attachment(s)`,
          relatedRecordType,
        });
      }
      showToast(failedCount
        ? `Uploaded ${photosToUpload.length - failedCount} attachment(s); ${failedCount} failed. Check the connection and retry.`
        : `Finished uploading ${photosToUpload.length} attachment(s).`);
    })();
  };

  // Form Save Handlers with Audit Tracking & Photo Processing
  const handleSaveGirl = (
    girlData: Omit<Girl, 'createdAt' | 'updatedAt'>,
    pendingPhotos?: PendingPhoto[]
  ): boolean => {
    if (isViewOnly) {
      showToast('View-only accounts cannot save changes.');
      return false;
    }
    try {
      let targetId = '';
      if (editingGirl) {
        targetId = editingGirl.id;
        const schoolChanged = editingGirl.school !== girlData.school || editingGirl.classLevel !== girlData.classLevel;
        if (schoolChanged) {
          const changeDate = new Date().toISOString().slice(0, 10);
          const currentEntries = (db.educationHistory || []).filter(
            (entry) => entry.girlId === editingGirl.id && entry.status === 'Current'
          );
          if (currentEntries.length > 0) {
            currentEntries.forEach((entry) => updateEducationHistoryRecord(entry.id, {
              status: 'Transferred',
              endDate: entry.endDate || changeDate,
              reasonForChange: entry.reasonForChange || 'School or class updated in girl profile',
            }, auditActor));
          } else if (editingGirl.school || editingGirl.classLevel) {
            addEducationHistoryRecord({
              girlId: editingGirl.id,
              academicYear: '',
              school: editingGirl.school,
              classLevel: editingGirl.classLevel,
              endDate: changeDate,
              status: 'Transferred',
              reasonForChange: 'School or class updated in girl profile',
              source: 'Girl profile before edit',
            }, auditActor);
          }
          addEducationHistoryRecord({
            girlId: editingGirl.id,
            academicYear: '',
            school: girlData.school,
            classLevel: girlData.classLevel,
            startDate: changeDate,
            status: 'Current',
            source: 'Girl profile update',
          }, auditActor);
        }
        updateGirl(editingGirl.id, girlData, auditActor);
        notifyDataChange({ type: 'record_updated', entityId: editingGirl.id, entityTitle: girlData.fullName, girlId: editingGirl.id, detail: 'girl profile' });
        showToast(`Saved on this phone. Profile updated for ${girlData.fullName}`);
        navigateTo('girl-profile', 'girls', editingGirl.id);
      } else {
        const newGirl = addGirl(girlData, auditActor);
        targetId = newGirl.id;
        showToast(`Saved on this phone. Successfully registered ${newGirl.fullName} (ID: ${newGirl.id})`);
        navigateTo('girl-profile', 'girls', newGirl.id);

        // Notify staff of new registration
        notifyDataChange({ type: 'new_girl', entityId: newGirl.id, entityTitle: newGirl.fullName, girlId: newGirl.id });
      }

      if (pendingPhotos && pendingPhotos.length > 0) {
        processPendingPhotos('girl', targetId, pendingPhotos, (url) => {
          if (!girlData.photoUrl) {
            updateGirl(targetId, { photoUrl: url }, auditActor);
            setDb(getDatabase());
          }
        });
      }
      return true;
    } catch (error) {
      showToast(`Girl profile save did not complete: ${error instanceof Error ? error.message : 'Check device storage and retry.'} If you changed school or class, review education history before retrying.`);
      return false;
    }
  };

  const handleSaveHouse = (
    houseData: Omit<Household, 'createdAt' | 'updatedAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot save changes.');
      return;
    }
    try {
      let targetId = '';
      if (editingHouse) {
        targetId = editingHouse.id;
        updateHousehold(editingHouse.id, houseData, auditActor);
        showToast(`House updated for ${houseData.name}`);
        navigateTo('house-profile', 'houses', undefined, editingHouse.id);
      } else {
        const newHouse = addHousehold(houseData, auditActor);
        targetId = newHouse.id;
        showToast(`Added household ${newHouse.name}`);
        navigateTo('house-profile', 'houses', undefined, newHouse.id);
      }
      notifyDataChange({ type: 'house_updated', entityId: targetId, entityTitle: houseData.name, houseId: targetId });

      if (pendingPhotos && pendingPhotos.length > 0) {
        processPendingPhotos('household', targetId, pendingPhotos, (url) => {
          if (!houseData.photoUrl) {
            updateHousehold(targetId, { photoUrl: url }, auditActor);
            setDb(getDatabase());
          }
        });
      }
    } catch (error) {
      showToast(`Household changes were not fully saved: ${error instanceof Error ? error.message : 'Check device storage and retry.'}`);
      return;
    }
  };

  const handleSaveEduFollowUp = (
    data: Omit<EducationalFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ): boolean => {
    if (isViewOnly) return false;
    try {
      const created = addEducationalFollowUp(data, auditActor);
      // Sync current school & class in girl profile if altered in follow up
      const girl = db.girls.find((g) => g.id === data.girlId);
      if (girl && (girl.school !== data.school || girl.classLevel !== data.classLevel)) {
        updateGirl(data.girlId, {
          school: data.school || girl.school,
          classLevel: data.classLevel || girl.classLevel,
        }, auditActor);
      }
      showToast('Saved on this phone. Educational follow-up recorded successfully.');
      if (pendingPhotos && pendingPhotos.length > 0) {
        processPendingPhotos('educationalFollowUp', created.id, pendingPhotos);
      }

      notifyDataChange({ type: 'edu_followup', entityId: created.id, entityTitle: girl?.fullName || 'SHINE Girl', girlId: data.girlId });

      navigateTo('girl-profile', 'girls', data.girlId);
      return true;
    } catch (error) {
      showToast(`Education follow-up save did not fully complete: ${error instanceof Error ? error.message : 'Check device storage and retry.'} Review the follow-up and school history before retrying.`);
      return false;
    }
  };

  const handleSaveHealthFollowUp = (
    data: Omit<HealthFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (!canEditHealthRecords) {
      showToast('Your account does not have permission to save health records.');
      return;
    }
    try {
      const created = addHealthFollowUp(data, auditActor);
      const girl = db.girls.find((g) => g.id === data.girlId);
      showToast('Health / medical visit recorded successfully.');
      if (pendingPhotos && pendingPhotos.length > 0) {
        processPendingPhotos('healthFollowUp', created.id, pendingPhotos);
      }

      notifyDataChange({ type: 'health_followup', entityId: created.id, entityTitle: girl?.fullName || 'SHINE Girl', girlId: data.girlId });

      navigateTo('girl-profile', 'girls', data.girlId);
    } catch (error) {
      showToast(`Health record was not fully saved: ${error instanceof Error ? error.message : 'Check device storage and retry.'} Refresh the record before trying again.`);
      return;
    }
  };

  const handleSaveFamilyFollowUp = (
    data: Omit<FamilyFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) return;
    try {
      const created = addFamilyFollowUp(data, auditActor);
      const girl = db.girls.find((item) => item.id === data.girlId);
      showToast('Family / guardian follow-up recorded successfully.');
      notifyDataChange({ type: 'family_followup', entityId: created.id, entityTitle: girl?.fullName || 'SHINE Girl', girlId: data.girlId });
      if (pendingPhotos && pendingPhotos.length > 0) {
        processPendingPhotos('familyFollowUp', created.id, pendingPhotos);
      }
      navigateTo('girl-profile', 'girls', data.girlId);
    } catch (error) {
      showToast(`Family follow-up was not fully saved: ${error instanceof Error ? error.message : 'Check device storage and retry.'} Refresh the record before trying again.`);
      return;
    }
  };

  const handleSaveRentPayment = (
    data: Omit<HouseholdRentPayment, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) return;
    try {
      const created = addRentPayment(data, auditActor);
      showToast('Rent payment record saved.');
      const household = db.households.find((item) => item.id === data.householdId);
      notifyDataChange({ type: 'rent_added', entityId: created.id, entityTitle: household?.name || 'Household', houseId: data.householdId });
      if (pendingPhotos && pendingPhotos.length > 0) {
        processPendingPhotos('rentPayment', created.id, pendingPhotos);
      }
      navigateTo('house-profile', 'houses', undefined, data.householdId);
    } catch (error) {
      showToast(`Rent payment was not fully saved: ${error instanceof Error ? error.message : 'Check device storage and retry.'} Refresh the record before trying again.`);
      return;
    }
  };

  const handleSaveExpense = (
    data: Omit<HouseholdExpense, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ): boolean => {
    if (isViewOnly) return false;
    let created: HouseholdExpense;
    try {
      created = addExpense(data, auditActor);
    } catch (error) {
      showToast(`Expense was not saved: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
      return false;
    }
    showToast('Saved on this phone. Household expense recorded.');
    const household = db.households.find((item) => item.id === data.householdId);
    notifyDataChange({ type: 'expense_added', entityId: created.id, entityTitle: household?.name || 'Household', houseId: data.householdId });
    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('expense', created.id, pendingPhotos);
    }
    navigateTo('house-profile', 'houses', undefined, data.householdId);
    return true;
  };

  const handleSaveActivity = (
    data: Omit<HouseholdActivity, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ): boolean => {
    if (isViewOnly) return false;
    try {
      const created = addHouseholdActivity(data, auditActor);
      showToast('Saved on this phone. Household group activity recorded.');
      const household = db.households.find((item) => item.id === data.householdId);
      notifyDataChange({ type: 'activity_added', entityId: created.id, entityTitle: household?.name || 'Household', houseId: data.householdId });
      if (pendingPhotos && pendingPhotos.length > 0) {
        processPendingPhotos('householdActivity', created.id, pendingPhotos);
      }
      navigateTo('house-profile', 'houses', undefined, data.householdId);
      return true;
    } catch (error) {
      showToast(`Household activity was not fully saved: ${error instanceof Error ? error.message : 'Check device storage and retry.'} Refresh the record before trying again.`);
      return false;
    }
  };

  // Deletion Handlers
  const handleDeleteGirl = (girlId: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete girl profiles.');
      return;
    }
    const girl = db.girls.find((g) => g.id === girlId);
    const confirmed = window.confirm(
      `Are you sure you want to delete profile for ${girl?.fullName || 'this girl'}?\nAll linked educational, health, and family follow-up records will also be deleted.`
    );
    if (confirmed) {
      try {
        if (!deleteGirl(girlId)) {
          showToast('Girl profile was not deleted on this device. Check the storage warning, then retry.');
          return;
        }
        showToast('Girl profile and follow-ups deleted.');
        navigateTo('girls', 'girls');
      } catch (error) {
        showToast(`Girl profile was not deleted: ${error instanceof Error ? error.message : 'Check device storage and retry.'}`);
      }
    }
  };

  const handleDeleteHousehold = (houseId: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete households.');
      return;
    }
    const house = db.households.find((h) => h.id === houseId);
    const confirmed = window.confirm(
      `Are you sure you want to delete household "${house?.name || 'this house'}"?\nResident girls will be preserved and marked unassigned.`
    );
    if (confirmed) {
      try {
        if (!deleteHousehold(houseId)) {
          showToast('Household was not deleted on this device. Check the storage warning, then retry.');
          return;
        }
        showToast('Household deleted.');
        navigateTo('houses', 'houses');
      } catch (error) {
        showToast(`Household was not deleted: ${error instanceof Error ? error.message : 'Check device storage and retry.'}`);
      }
    }
  };

  const handleDeleteFollowUp = (
    type: 'educational' | 'health' | 'family',
    id: string
  ) => {
    if (type === 'health' && !canEditHealthRecords) {
      showToast('Your account does not have permission to delete health records.');
      return;
    }
    if (isViewOnly) {
      showToast('View-only accounts cannot delete records.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this follow-up record?')) return;
    try {
      const deleted = type === 'educational'
        ? deleteEducationalFollowUp(id)
        : type === 'health'
          ? deleteHealthFollowUp(id)
          : deleteFamilyFollowUp(id);
      if (!deleted) {
        showToast('Follow-up was not deleted. Refresh the record and check the storage warning before retrying.');
        return;
      }
      showToast('Follow-up record removed.');
    } catch (error) {
      showToast(`Follow-up was not deleted: ${error instanceof Error ? error.message : 'Check device storage and retry.'}`);
    }
  };

  const handleDeleteRentPayment = (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete rent payments.');
      return;
    }
    if (!window.confirm('Delete this rent payment entry?')) return;
    try {
      if (!deleteRentPayment(id)) {
        showToast('Rent payment was not deleted. Refresh the record and check the storage warning before retrying.');
        return;
      }
      showToast('Rent payment record deleted.');
    } catch (error) {
      showToast(`Rent payment was not deleted: ${error instanceof Error ? error.message : 'Check device storage and retry.'}`);
    }
  };

  const handleDeleteExpense = (id: string) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot delete expenses.');
      return;
    }
    if (!window.confirm('Delete this expense entry?')) return;
    try {
      if (!deleteExpense(id)) {
        showToast('Expense was not deleted. It may no longer exist, or device storage may be unavailable. Refresh and retry.');
        return;
      }
      showToast('Expense entry deleted.');
    } catch (error) {
      showToast(`Expense was not deleted: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
    }
  };

  const handleMarkExpensePaid = (
    id: string,
    payment: Pick<HouseholdExpense, 'datePaid' | 'paymentMethod' | 'paymentReference'>,
  ) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot change payment status.');
      return;
    }
    const existing = db.expenses.find((expense) => expense.id === id);
    if (!existing) {
      showToast('This expense could not be found. Refresh and try again.');
      return;
    }
    if ((existing.paymentStatus || 'Paid') === 'Paid') {
      showToast('This expense is already marked as paid.');
      return;
    }
    try {
      if (!updateExpense(id, { ...payment, paymentStatus: 'Paid' }, auditActor)) {
        showToast('This expense could not be found. Refresh and try again.');
        return;
      }
      showToast('Payment recorded. The original expense has been updated.');
    } catch (error) {
      showToast(`Payment was not recorded: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
    }
  };

  const handleUpdateExpense = (
    id: string,
    changes: Partial<Omit<HouseholdExpense, 'id' | 'householdId' | 'createdAt'>>,
  ) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot edit expenses.');
      return;
    }
    try {
      if (!updateExpense(id, changes, auditActor)) {
        showToast('This expense could not be found. Refresh and try again.');
        return;
      }
      reloadData();
      showToast('Expense details updated and recorded in the audit history.');
    } catch (error) {
      showToast(`Expense was not updated: ${error instanceof Error ? error.message : 'device storage is unavailable. Free storage and retry.'}`);
    }
  };

  const handleDeleteActivity = (id: string) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot delete activities.');
      return;
    }
    if (!window.confirm('Delete this activity entry?')) return;
    try {
      if (!deleteHouseholdActivity(id)) {
        showToast('Activity was not deleted. Refresh the record and check the storage warning before retrying.');
        return;
      }
      showToast('Activity record deleted.');
    } catch (error) {
      showToast(`Activity was not deleted: ${error instanceof Error ? error.message : 'Check device storage and retry.'}`);
    }
  };

  // Lookup helpers for active profiles
  const currentGirl = selectedGirlId
    ? db.girls.find((g) => g.id === selectedGirlId)
    : null;
  const currentGirlHouse = currentGirl?.householdId
    ? db.households.find((h) => h.id === currentGirl.householdId)
    : undefined;
  const currentGirlEdu = selectedGirlId
    ? db.educationalFollowUps.filter((e) => e.girlId === selectedGirlId)
    : [];
  const currentGirlHealth = selectedGirlId
    ? db.healthFollowUps.filter((h) => h.girlId === selectedGirlId)
    : [];
  const currentGirlFamily = selectedGirlId
    ? db.familyFollowUps.filter((f) => f.girlId === selectedGirlId)
    : [];

  const currentHouse = selectedHouseId
    ? db.households.find((h) => h.id === selectedHouseId)
    : null;
  const currentHouseResidents = selectedHouseId
    ? db.girls.filter((g) => g.householdId === selectedHouseId)
    : [];
  const currentHouseRent = selectedHouseId
    ? db.rentPayments.filter((r) => r.householdId === selectedHouseId)
    : [];
  const currentHouseExpenses = selectedHouseId
    ? db.expenses.filter((e) => e.householdId === selectedHouseId)
    : [];
  const currentHouseActivities = selectedHouseId
    ? db.householdActivities.filter((a) => a.householdId === selectedHouseId)
    : [];

  // Authentication Loading Screen
  if (loading) {
    return (
      <div data-theme={theme} className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-white p-2 shadow-md border border-stone-200 flex items-center justify-center animate-pulse overflow-hidden">
            <ShineLogo variant="mark" className="h-full w-full" />
          </div>
          <div className="text-center">
            <h2 className="brand-title text-sm font-bold">SHINE Relief Trust Malawi</h2>
            <p className="text-xs text-stone-500 mt-0.5">Connecting to secure authentication...</p>
          </div>
        </div>
      </div>
    );
  }

  // Not signed in -> render Staff Login / Setup view
  if (!currentUser) {
    return <StaffLoginView />;
  }

  // Unregistered or Suspended Account Screen
  if (isSuspended || !isRegisteredStaff) {
    const isUnregistered = !isRegisteredStaff;
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-stone-200 shadow-xl text-center space-y-4">
          <div
            className={`w-14 h-14 ${
              isUnregistered ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'
            } rounded-2xl flex items-center justify-center mx-auto`}
          >
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-stone-900">
            {isUnregistered ? 'Staff Authorization Required' : 'Staff Account Suspended'}
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            {isUnregistered ? (
              <>
                You have authenticated as <strong className="text-stone-800">{currentUser?.email}</strong>, but your email has not yet been registered into the SHINE Relief Trust Staff Roster by an Administrator.
              </>
            ) : (
              'Your SHINE Relief Trust staff account has been deactivated or suspended by an Administrator.'
            )}
          </p>
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-[11px] text-stone-600 text-left space-y-1">
            <p className="font-semibold text-stone-800">Staff Access Policy:</p>
            <p className="leading-normal">
              Staff access to confidential case files and household records is strictly enforced through Firebase Authentication and Firestore Security Rules.
            </p>
            <p className="leading-normal pt-1">
              Please contact Hastings Zidana (<span className="text-teal-800 font-bold">hastingszidanamot@gmail.com</span>) to add your email and assign your authorized role (Administrator, Manager, Staff, or View Only).
            </p>
          </div>
          <button
            onClick={logout}
            className="w-full py-2.5 px-4 bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="app-shell"
      data-theme={theme}
      data-mobile-view={mobileViewMode}
      data-foundation-look={foundationLook}
      data-glass-effect={glassEffect}
      data-animated-glass={animatedGlass || glassEffect}
      className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans"
    >
      <input
        ref={sharedImportInputRef}
        type="file"
        accept=".docx,.xlsx,.xls"
        className="hidden"
        aria-label="Choose Word or Excel import file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) setPendingImportFile(file);
          event.currentTarget.value = '';
        }}
      />
      {/* Top Application Header */}
      <Header
        onNavigateDashboard={() => navigateTo('dashboard', 'dashboard')}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenDataModal={() => setIsDataModalOpen(true)}
        onNavigateStaff={() => navigateTo('staff', 'staff')}
        onOpenInbox={() => navigateTo('messages', 'messages')}
        onOpenRecord={(type, id) => {
          if (type === 'girl') {
            handleOpenGirlProfile(id);
          } else if (type === 'household') {
            handleOpenHouseProfile(id);
          } else if (type === 'educationalFollowUp' || type === 'healthFollowUp' || type === 'familyFollowUp') {
            const edu = db.educationalFollowUps.find((e) => e.id === id);
            const hlth = db.healthFollowUps.find((h) => h.id === id);
            const fam = db.familyFollowUps.find((f) => f.id === id);
            const gId = edu?.girlId || hlth?.girlId || fam?.girlId;
            if (gId) handleOpenGirlProfile(gId);
          } else if (type === 'rentPayment' || type === 'expense' || type === 'householdActivity') {
            const rent = db.rentPayments.find((r) => r.id === id);
            const exp = db.expenses.find((e) => e.id === id);
            const act = db.householdActivities.find((a) => a.id === id);
            const hId = rent?.householdId || exp?.householdId || act?.householdId;
            if (hId) handleOpenHouseProfile(hId);
          }
        }}
        onOpenNotificationSettings={() => navigateTo('messages', 'messages')}
        syncStatus={syncStatus}
        storageWarning={storageWarning}
      />

      {/* Main Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        girlsCount={db.girls.length}
        housesCount={db.households.length}
        pendingReviewCount={pendingOperationsReviewCount}
      />

      {/* Toast Notification Alert */}
      {toastMessage && (
        <div data-fx-toast role="status" aria-live="polite" aria-atomic="true" className="fixed bottom-18 md:bottom-6 right-6 z-50 fx-toast-enter">
          <div className="bg-teal-950 text-white px-4 py-3 rounded-xl shadow-2xl border border-teal-800 flex items-center gap-3 text-xs font-semibold max-w-md">
            <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* View-Only Indicator Banner */}
      {isViewOnly && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-center text-xs text-amber-900 font-semibold flex items-center justify-center gap-2">
          <span>You are logged in with <strong>View Only</strong> access. Record editing, deletions, and additions are disabled.</span>
        </div>
      )}

      {/* Local Storage Warning Banner */}
      {storageWarning && (
        <div
          className="bg-rose-100 border-b border-rose-300 px-4 py-2 text-center text-xs text-rose-900 font-semibold flex items-center justify-center gap-2"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>
            This phone is out of storage. Changes may not be saved offline. Connect to the internet to sync, then free space.
          </span>
        </div>
      )}

      {/* New version available */}
      <UpdateAvailableBanner />

      {/* Primary Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Keyed by view so a crash in one view clears when the user navigates. */}
        <ErrorBoundary key={view} label={view}>
          <Suspense fallback={<ViewSkeleton />}>
            <AppViewSwitch
              view={view}
              db={db}
              role={role}
              isAdmin={isAdmin}
              isViewOnly={isViewOnly}
              auditActor={auditActor}
              allStaff={allStaff}
              safeguardingCount={safeguardingCount}
              girlsStatusFilter={girlsStatusFilter}
              selectedProgrammeId={selectedProgrammeId}
              qualityRecordFocus={qualityRecordFocus}
              programmePlanningRequest={programmePlanningRequest}
              importWizardKey={importWizardKey}
              pendingImportFile={pendingImportFile}
              previousImportLocation={previousImportLocation}
              editingGirl={editingGirl}
              editingHouse={editingHouse}
              aiFocusGirlId={aiFocusGirlId}
              aiFocusHouseId={aiFocusHouseId}
              currentGirl={currentGirl}
              currentGirlHouse={currentGirlHouse}
              currentGirlEdu={currentGirlEdu}
              currentGirlHealth={currentGirlHealth}
              currentGirlFamily={currentGirlFamily}
              currentHouse={currentHouse}
              currentHouseResidents={currentHouseResidents}
              currentHouseRent={currentHouseRent}
              currentHouseExpenses={currentHouseExpenses}
              currentHouseActivities={currentHouseActivities}
              ManagementDashboard={ManagementDashboard}
              Reports={Reports}
              ReportBuilder={ReportBuilder}
              AIAssistantView={AIAssistantView}
              MessagingView={MessagingView}
              BudgetsAndWorkplansView={BudgetsAndWorkplansView}
              PayrollDashboard={PayrollDashboard}
              ContractsDashboard={ContractsDashboard}
              CaseManagementView={CaseManagementView}
              DataImportWizard={DataImportWizard}
              ContactsView={ContactsView}
              Phase5OperationsView={Phase5OperationsView}
              ProgrammesView={ProgrammesView}
              StaffManagement={StaffManagement}
              Dashboard={Dashboard}
              navigateTo={navigateTo}
              openProgramme={openProgramme}
              openQualityRecord={openQualityRecord}
              setGirlsStatusFilter={setGirlsStatusFilter}
              onOpenQuickAdd={() => setIsQuickAddOpen(true)}
              onInitialFileConsumed={() => setPendingImportFile(null)}
              onProgrammeCreateHandled={() => setProgrammePlanningRequest(null)}
              onCreateProgrammePlan={(type, programmeId) => setProgrammePlanningRequest({ requestId: Date.now(), type, programmeId })}
              handleOpenGirlProfile={handleOpenGirlProfile}
              handleOpenHouseProfile={handleOpenHouseProfile}
              handleStartRegisterGirl={handleStartRegisterGirl}
              handleStartAddHouse={handleStartAddHouse}
              handleStartRentPayment={handleStartRentPayment}
              handleStartExpense={handleStartExpense}
              handleStartActivity={handleStartActivity}
              handleStartEditGirl={handleStartEditGirl}
              handleStartEditHouse={handleStartEditHouse}
              handleStartEduFollowUp={handleStartEduFollowUp}
              handleStartHealthFollowUp={handleStartHealthFollowUp}
              handleStartFamilyFollowUp={handleStartFamilyFollowUp}
              handleAskAIAboutGirl={handleAskAIAboutGirl}
              handleAskAIAboutHouse={handleAskAIAboutHouse}
              handleDeleteGirl={handleDeleteGirl}
              handleDeleteHousehold={handleDeleteHousehold}
              handleDeleteFollowUp={handleDeleteFollowUp}
              handleDeleteRentPayment={handleDeleteRentPayment}
              handleDeleteExpense={handleDeleteExpense}
              handleMarkExpensePaid={handleMarkExpensePaid}
              handleUpdateExpense={handleUpdateExpense}
              handleDeleteActivity={handleDeleteActivity}
              handleSaveGirl={handleSaveGirl}
              handleSaveHouse={handleSaveHouse}
              handleSaveEduFollowUp={handleSaveEduFollowUp}
              handleSaveHealthFollowUp={handleSaveHealthFollowUp}
              handleSaveFamilyFollowUp={handleSaveFamilyFollowUp}
              handleSaveRentPayment={handleSaveRentPayment}
              handleSaveExpense={handleSaveExpense}
              handleSaveActivity={handleSaveActivity}
              reloadData={reloadData}
              notifyDataChange={notifyDataChange}
              showToast={showToast}
              openImportFilePicker={openImportFilePicker}
            />
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Global Modals */}
      <AppModals
        db={db}
        isSearchOpen={isSearchOpen}
        isDataModalOpen={isDataModalOpen}
        isQuickAddOpen={isQuickAddOpen}
        setIsSearchOpen={setIsSearchOpen}
        setIsDataModalOpen={setIsDataModalOpen}
        setIsQuickAddOpen={setIsQuickAddOpen}
        handleOpenGirlProfile={handleOpenGirlProfile}
        handleOpenHouseProfile={handleOpenHouseProfile}
        navigateTo={navigateTo}
        reloadData={reloadData}
        handleQuickAction={handleQuickAction}
        openProgramme={openProgramme}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <VisualSettingsProvider>
        <MessagingProvider>
          <AppContent />
        </MessagingProvider>
      </VisualSettingsProvider>
    </AuthProvider>
  );
}
