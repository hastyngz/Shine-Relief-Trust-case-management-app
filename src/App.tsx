import React, { useState, useEffect, useCallback } from 'react';
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
  deleteExpense,
  addHouseholdActivity,
  deleteHouseholdActivity,
} from './utils/storage';
import {
  initFirestoreListeners,
  subscribeSyncStatus,
  getSyncStatus,
  SyncStatus,
} from './services/firestoreSync';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MessagingProvider } from './contexts/MessagingContext';
import { StaffLoginView } from './components/StaffLoginView';
import { StaffManagement } from './components/StaffManagement';

import { Header } from './components/Header';
import { Navigation, NavTab } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { GirlsList } from './components/GirlsList';
import { HouseholdsList } from './components/HouseholdsList';
import { ActivitiesList } from './components/ActivitiesList';
import { Reports } from './components/Reports';
import { GirlProfile } from './components/GirlProfile';
import { HouseholdProfile } from './components/HouseholdProfile';
import { AIAssistantView } from './components/AIAssistant/AIAssistantView';
import { MessagingView } from './components/Messaging/MessagingView';
import {
  triggerDataChangeNotification,
  checkAndTriggerFollowUpReminders,
} from './services/messagingService';

// Forms
import { GirlForm } from './components/Forms/GirlForm';
import { HouseholdForm } from './components/Forms/HouseholdForm';
import { EducationalFollowUpForm } from './components/Forms/EducationalFollowUpForm';
import { HealthFollowUpForm } from './components/Forms/HealthFollowUpForm';
import { FamilyFollowUpForm } from './components/Forms/FamilyFollowUpForm';
import { RentPaymentForm } from './components/Forms/RentPaymentForm';
import { HouseholdExpenseForm } from './components/Forms/HouseholdExpenseForm';
import { HouseholdActivityForm } from './components/Forms/HouseholdActivityForm';

// Modals
import { SearchModal } from './components/SearchModal';
import { DataModal } from './components/DataModal';
import { QuickAddModal, ActionType } from './components/QuickAddModal';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { uploadPhotoAttachment } from './services/attachmentService';
import { PendingPhoto } from './components/Attachments/FormPhotoSection';
import { AttachmentTargetType, StaffRole } from './types';

type AppView =
  | 'dashboard'
  | 'girls'
  | 'houses'
  | 'activities'
  | 'messages'
  | 'reports'
  | 'staff'
  | 'ai-assistant'
  | 'girl-profile'
  | 'house-profile'
  | 'form-girl'
  | 'form-house'
  | 'form-edu'
  | 'form-health'
  | 'form-family'
  | 'form-rent'
  | 'form-expense'
  | 'form-activity';

// Helper to parse route from URL hash
function parseHash(): {
  view: AppView;
  activeTab: NavTab;
  girlId?: string;
  houseId?: string;
} {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return { view: 'dashboard', activeTab: 'dashboard' };

  if (hash.startsWith('girl/')) {
    const girlId = hash.slice(5);
    return { view: 'girl-profile', activeTab: 'girls', girlId };
  }
  if (hash.startsWith('house/')) {
    const houseId = hash.slice(6);
    return { view: 'house-profile', activeTab: 'houses', houseId };
  }
  if (hash === 'girls') return { view: 'girls', activeTab: 'girls' };
  if (hash === 'houses') return { view: 'houses', activeTab: 'houses' };
  if (hash === 'activities') return { view: 'activities', activeTab: 'activities' };
  if (hash === 'messages' || hash === 'inbox') return { view: 'messages', activeTab: 'messages' };
  if (hash === 'reports') return { view: 'reports', activeTab: 'reports' };
  if (hash === 'staff' || hash === 'staff-management') return { view: 'staff', activeTab: 'staff' };
  if (hash === 'ai-assistant' || hash === 'ai') return { view: 'ai-assistant', activeTab: 'ai-assistant' };
  if (hash === 'register-girl') return { view: 'form-girl', activeTab: 'girls' };
  if (hash === 'add-house') return { view: 'form-house', activeTab: 'houses' };

  return { view: 'dashboard', activeTab: 'dashboard' };
}

function AppContent() {
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
    logout,
  } = useAuth();
  const [db, setDb] = useState<AppDatabase>(() => getDatabase());

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

  // Selected entities for profiles & forms
  const [selectedGirlId, setSelectedGirlId] = useState<string | null>(
    initialRoute.girlId || null
  );
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(
    initialRoute.houseId || null
  );
  const [editingGirl, setEditingGirl] = useState<Girl | null>(null);
  const [editingHouse, setEditingHouse] = useState<Household | null>(null);

  // AI Assistant focus contexts
  const [aiFocusGirlId, setAiFocusGirlId] = useState<string | undefined>();
  const [aiFocusHouseId, setAiFocusHouseId] = useState<string | undefined>();

  // Status filter pass-through (e.g. clicking "Completed" in dashboard)
  const [girlsStatusFilter, setGirlsStatusFilter] = useState<string | undefined>(undefined);

  // Modals state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Firestore sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  // Real-time bidirectional Firebase Firestore persistence synchronization
  useEffect(() => {
    if (!currentUser || isSuspended) {
      return;
    }

    const unsub = initFirestoreListeners((cloudDb) => {
      saveDatabase(cloudDb, false);
      setDb(cloudDb);
    });
    return () => unsub();
  }, [currentUser, isSuspended]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4000);
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

  // Listen for browser Back/Forward navigation via hashchange
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHash();
      setView(route.view);
      setActiveTab(route.activeTab);
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
    houseId?: string | null
  ) => {
    setView(newView);
    if (tab) setActiveTab(tab);
    if (girlId !== undefined) setSelectedGirlId(girlId);
    if (houseId !== undefined) setSelectedHouseId(houseId);

    let targetHash = '';
    switch (newView) {
      case 'dashboard':
        targetHash = '#/';
        break;
      case 'girls':
        targetHash = '#/girls';
        break;
      case 'girl-profile':
        targetHash = girlId ? `#/girl/${girlId}` : '#/girls';
        break;
      case 'houses':
        targetHash = '#/houses';
        break;
      case 'house-profile':
        targetHash = houseId ? `#/house/${houseId}` : '#/houses';
        break;
      case 'activities':
        targetHash = '#/activities';
        break;
      case 'messages':
        targetHash = '#/messages';
        break;
      case 'reports':
        targetHash = '#/reports';
        break;
      case 'staff':
        targetHash = '#/staff';
        break;
      case 'ai-assistant':
        targetHash = '#/ai-assistant';
        break;
      case 'form-girl':
        targetHash = '#/register-girl';
        break;
      case 'form-house':
        targetHash = '#/add-house';
        break;
      default:
        targetHash = '';
    }
    if (targetHash && window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigation tab switcher
  const handleSelectTab = (tab: NavTab) => {
    if (tab === 'girls') {
      setGirlsStatusFilter(undefined);
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
    if (isViewOnly) {
      showToast('View-only accounts cannot add health visits.');
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
    showToast(`Uploading ${photos.length} photo attachment(s)...`);

    (async () => {
      let firstUploadedUrl: string | null = null;
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        try {
          const res = await uploadPhotoAttachment({
            file: p.file,
            targetType,
            targetId,
            caption: p.caption,
            category: p.category || 'Supporting Document',
            date: p.date,
            user: {
              uid: currentUser.uid,
              fullName: staffProfile?.fullName || currentUser.displayName || auditActor,
              email: currentUser.email || 'staff@shinerelieftrust.org',
              role: role || undefined,
            },
          });
          if (i === 0 && res.downloadUrl) {
            firstUploadedUrl = res.downloadUrl;
            if (onFirstSuccess) {
              onFirstSuccess(res.downloadUrl);
            }
          }
        } catch (err) {
          console.error(`Error uploading photo ${p.file.name}:`, err);
        }
      }
      showToast(`Finished uploading ${photos.length} attachment(s).`);
    })();
  };

  // Form Save Handlers with Audit Tracking & Photo Processing
  const handleSaveGirl = (
    girlData: Omit<Girl, 'createdAt' | 'updatedAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot save changes.');
      return;
    }
    let targetId = '';
    if (editingGirl) {
      targetId = editingGirl.id;
      updateGirl(editingGirl.id, girlData, auditActor);
      showToast(`Profile updated for ${girlData.fullName}`);
      navigateTo('girl-profile', 'girls', editingGirl.id);
    } else {
      const newGirl = addGirl(girlData, auditActor);
      targetId = newGirl.id;
      showToast(`Successfully registered ${newGirl.fullName} (ID: ${newGirl.id})`);
      navigateTo('girl-profile', 'girls', newGirl.id);

      // Notify staff of new registration
      if (currentUser) {
        triggerDataChangeNotification({
          type: 'new_girl',
          actor: { uid: currentUser.uid, name: staffProfile?.fullName || auditActor },
          entityId: newGirl.id,
          entityTitle: newGirl.fullName,
          girlId: newGirl.id,
          allStaff,
          currentDb: db,
        }).catch((e) => console.warn('Could not dispatch notification:', e));
      }
    }

    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('girl', targetId, pendingPhotos, (url) => {
        if (!girlData.photoUrl) {
          updateGirl(targetId, { photoUrl: url }, auditActor);
          setDb(getDatabase());
        }
      });
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

    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('household', targetId, pendingPhotos, (url) => {
        if (!houseData.photoUrl) {
          updateHousehold(targetId, { photoUrl: url }, auditActor);
          setDb(getDatabase());
        }
      });
    }
  };

  const handleSaveEduFollowUp = (
    data: Omit<EducationalFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) return;
    const created = addEducationalFollowUp(data, auditActor);
    // Sync current school & class in girl profile if altered in follow up
    const girl = db.girls.find((g) => g.id === data.girlId);
    if (girl && (girl.school !== data.school || girl.classLevel !== data.classLevel)) {
      updateGirl(data.girlId, {
        school: data.school || girl.school,
        classLevel: data.classLevel || girl.classLevel,
      }, auditActor);
    }
    showToast('Educational follow-up recorded successfully.');
    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('educationalFollowUp', created.id, pendingPhotos);
    }

    if (currentUser) {
      triggerDataChangeNotification({
        type: 'edu_followup',
        actor: { uid: currentUser.uid, name: staffProfile?.fullName || auditActor },
        entityId: created.id,
        entityTitle: girl?.fullName || 'SHINE Girl',
        girlId: data.girlId,
        allStaff,
        currentDb: db,
      }).catch((e) => console.warn('Could not dispatch edu notification:', e));
    }

    navigateTo('girl-profile', 'girls', data.girlId);
  };

  const handleSaveHealthFollowUp = (
    data: Omit<HealthFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) return;
    const created = addHealthFollowUp(data, auditActor);
    const girl = db.girls.find((g) => g.id === data.girlId);
    showToast('Health / medical visit recorded successfully.');
    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('healthFollowUp', created.id, pendingPhotos);
    }

    if (currentUser) {
      triggerDataChangeNotification({
        type: 'health_followup',
        actor: { uid: currentUser.uid, name: staffProfile?.fullName || auditActor },
        entityId: created.id,
        entityTitle: girl?.fullName || 'SHINE Girl',
        girlId: data.girlId,
        allStaff,
        currentDb: db,
      }).catch((e) => console.warn('Could not dispatch health notification:', e));
    }

    navigateTo('girl-profile', 'girls', data.girlId);
  };

  const handleSaveFamilyFollowUp = (
    data: Omit<FamilyFollowUp, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) return;
    const created = addFamilyFollowUp(data, auditActor);
    showToast('Family / guardian follow-up recorded successfully.');
    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('familyFollowUp', created.id, pendingPhotos);
    }
    navigateTo('girl-profile', 'girls', data.girlId);
  };

  const handleSaveRentPayment = (
    data: Omit<HouseholdRentPayment, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) return;
    const created = addRentPayment(data, auditActor);
    showToast('Rent payment record saved.');
    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('rentPayment', created.id, pendingPhotos);
    }
    navigateTo('house-profile', 'houses', undefined, data.householdId);
  };

  const handleSaveExpense = (
    data: Omit<HouseholdExpense, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) return;
    const created = addExpense(data, auditActor);
    showToast('Household expense recorded.');
    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('expense', created.id, pendingPhotos);
    }
    navigateTo('house-profile', 'houses', undefined, data.householdId);
  };

  const handleSaveActivity = (
    data: Omit<HouseholdActivity, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => {
    if (isViewOnly) return;
    const created = addHouseholdActivity(data, auditActor);
    showToast('Household group activity recorded.');
    if (pendingPhotos && pendingPhotos.length > 0) {
      processPendingPhotos('householdActivity', created.id, pendingPhotos);
    }
    navigateTo('house-profile', 'houses', undefined, data.householdId);
  };

  // Deletion Handlers
  const handleDeleteGirl = (girlId: string) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot delete profiles.');
      return;
    }
    const girl = db.girls.find((g) => g.id === girlId);
    const confirmed = window.confirm(
      `Are you sure you want to delete profile for ${girl?.fullName || 'this girl'}?\nAll linked educational, health, and family follow-up records will also be deleted.`
    );
    if (confirmed) {
      deleteGirl(girlId);
      showToast('Girl profile and follow-ups deleted.');
      navigateTo('girls', 'girls');
    }
  };

  const handleDeleteHousehold = (houseId: string) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot delete households.');
      return;
    }
    const house = db.households.find((h) => h.id === houseId);
    const confirmed = window.confirm(
      `Are you sure you want to delete household "${house?.name || 'this house'}"?\nResident girls will be preserved and marked unassigned.`
    );
    if (confirmed) {
      deleteHousehold(houseId);
      showToast('Household deleted.');
      navigateTo('houses', 'houses');
    }
  };

  const handleDeleteFollowUp = (
    type: 'educational' | 'health' | 'family',
    id: string
  ) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot delete records.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this follow-up record?')) return;
    if (type === 'educational') deleteEducationalFollowUp(id);
    else if (type === 'health') deleteHealthFollowUp(id);
    else if (type === 'family') deleteFamilyFollowUp(id);
    showToast('Follow-up record removed.');
  };

  const handleDeleteRentPayment = (id: string) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot delete payments.');
      return;
    }
    if (!window.confirm('Delete this rent payment entry?')) return;
    deleteRentPayment(id);
    showToast('Rent payment record deleted.');
  };

  const handleDeleteExpense = (id: string) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot delete expenses.');
      return;
    }
    if (!window.confirm('Delete this expense entry?')) return;
    deleteExpense(id);
    showToast('Expense entry deleted.');
  };

  const handleDeleteActivity = (id: string) => {
    if (isViewOnly) {
      showToast('View-only accounts cannot delete activities.');
      return;
    }
    if (!window.confirm('Delete this activity entry?')) return;
    deleteHouseholdActivity(id);
    showToast('Activity record deleted.');
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
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-white p-2 shadow-md border border-stone-200 flex items-center justify-center animate-pulse overflow-hidden">
            <img
              src="/shine-logo.png"
              alt="SHINE Relief Trust Logo"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="text-center">
            <h2 className="text-sm font-bold text-stone-900">SHINE Relief Trust Malawi</h2>
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
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans">
      {/* Top Application Header */}
      <Header
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
      />

      {/* Main Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        girlsCount={db.girls.length}
        housesCount={db.households.length}
      />

      {/* Toast Notification Alert */}
      {toastMessage && (
        <div className="fixed bottom-18 md:bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
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

      {/* Primary Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* VIEW 1: DASHBOARD */}
        {view === 'dashboard' && (
          <Dashboard
            db={db}
            onNavigateToGirl={handleOpenGirlProfile}
            onNavigateToHouse={handleOpenHouseProfile}
            onNavigateToGirlsList={(status?: string) => {
              setGirlsStatusFilter(status);
              navigateTo('girls', 'girls');
            }}
            onNavigateToHousesList={() => navigateTo('houses', 'houses')}
            onNavigateToReports={() => navigateTo('reports', 'reports')}
            onOpenQuickAdd={() => setIsQuickAddOpen(true)}
          />
        )}

        {/* VIEW 2: GIRLS DIRECTORY */}
        {view === 'girls' && (
          <GirlsList
            girls={db.girls}
            households={db.households}
            db={db}
            initialStatusFilter={girlsStatusFilter}
            onSelectGirl={handleOpenGirlProfile}
            onRegisterGirl={handleStartRegisterGirl}
          />
        )}

        {/* VIEW 3: HOUSEHOLDS DIRECTORY */}
        {view === 'houses' && (
          <HouseholdsList
            households={db.households}
            girls={db.girls}
            db={db}
            onSelectHouse={handleOpenHouseProfile}
            onAddHouse={handleStartAddHouse}
            onAddRent={handleStartRentPayment}
            onAddExpense={handleStartExpense}
            onAddActivity={handleStartActivity}
          />
        )}

        {/* VIEW 4: GROUP ACTIVITIES */}
        {view === 'activities' && (
          <ActivitiesList
            activities={db.householdActivities}
            households={db.households}
            girls={db.girls}
            onSelectHouse={handleOpenHouseProfile}
            onAddActivity={() => handleStartActivity()}
          />
        )}

        {/* VIEW 5: REPORTS */}
        {view === 'reports' && (
          <Reports
            db={db}
            onSelectGirl={handleOpenGirlProfile}
            onSelectHouse={handleOpenHouseProfile}
          />
        )}

        {/* VIEW: STAFF MANAGEMENT (ADMINISTRATORS ONLY) */}
        {view === 'staff' && (
          <StaffManagement />
        )}

        {/* VIEW: SHINE AI ASSISTANT */}
        {view === 'ai-assistant' && (
          <AIAssistantView
            db={db}
            initialGirlId={aiFocusGirlId}
            initialHouseId={aiFocusHouseId}
            onNavigateToGirl={handleOpenGirlProfile}
            onNavigateToHouse={handleOpenHouseProfile}
          />
        )}

        {/* VIEW: STAFF MESSAGING & NOTIFICATIONS HUB */}
        {view === 'messages' && (
          <MessagingView
            appDb={db}
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
          />
        )}

        {/* VIEW 6: GIRL PROFILE */}
        {view === 'girl-profile' && currentGirl && (
          <GirlProfile
            girl={currentGirl}
            household={currentGirlHouse}
            educationalFollowUps={currentGirlEdu}
            healthFollowUps={currentGirlHealth}
            familyFollowUps={currentGirlFamily}
            onBack={() => navigateTo('girls', 'girls')}
            onNavigateToHouse={handleOpenHouseProfile}
            onEditGirl={handleStartEditGirl}
            onDeleteGirl={handleDeleteGirl}
            onDeleteFollowUp={handleDeleteFollowUp}
            onAddEducationalFollowUp={handleStartEduFollowUp}
            onAddHealthFollowUp={handleStartHealthFollowUp}
            onAddFamilyFollowUp={handleStartFamilyFollowUp}
            onAskAI={handleAskAIAboutGirl}
          />
        )}

        {/* Fallback if girl not found */}
        {view === 'girl-profile' && !currentGirl && (
          <div className="bg-white p-8 rounded-xl border border-stone-200 text-center space-y-3">
            <h2 className="text-lg font-bold text-stone-800">Girl Profile Not Found</h2>
            <p className="text-xs text-stone-500">
              The requested girl record does not exist or has been removed.
            </p>
            <button
              onClick={() => navigateTo('girls', 'girls')}
              className="px-4 py-2 bg-teal-800 text-white text-xs font-bold rounded-lg"
            >
              Return to Girls Directory
            </button>
          </div>
        )}

        {/* VIEW 7: HOUSEHOLD PROFILE */}
        {view === 'house-profile' && currentHouse && (
          <HouseholdProfile
            household={currentHouse}
            residentGirls={currentHouseResidents}
            rentPayments={currentHouseRent}
            expenses={currentHouseExpenses}
            activities={currentHouseActivities}
            onBack={() => navigateTo('houses', 'houses')}
            onNavigateToGirl={handleOpenGirlProfile}
            onEditHousehold={handleStartEditHouse}
            onDeleteHousehold={handleDeleteHousehold}
            onDeleteRentPayment={handleDeleteRentPayment}
            onDeleteExpense={handleDeleteExpense}
            onDeleteActivity={handleDeleteActivity}
            onAddRentPayment={handleStartRentPayment}
            onAddExpense={handleStartExpense}
            onAddActivity={handleStartActivity}
            onAskAI={handleAskAIAboutHouse}
          />
        )}

        {/* Fallback if house not found */}
        {view === 'house-profile' && !currentHouse && (
          <div className="bg-white p-8 rounded-xl border border-stone-200 text-center space-y-3">
            <h2 className="text-lg font-bold text-stone-800">Household Not Found</h2>
            <p className="text-xs text-stone-500">
              The requested household record does not exist or has been removed.
            </p>
            <button
              onClick={() => navigateTo('houses', 'houses')}
              className="px-4 py-2 bg-teal-800 text-white text-xs font-bold rounded-lg"
            >
              Return to Households Directory
            </button>
          </div>
        )}

        {/* FORM 1: GIRL REGISTRATION / EDIT */}
        {view === 'form-girl' && (
          <div className="max-w-3xl mx-auto">
            <GirlForm
              initialData={editingGirl || undefined}
              existingGirls={db.girls}
              households={db.households}
              onSave={handleSaveGirl}
              onCancel={() => {
                if (editingGirl) {
                  navigateTo('girl-profile', 'girls', editingGirl.id);
                } else {
                  navigateTo('girls', 'girls');
                }
              }}
            />
          </div>
        )}

        {/* FORM 2: HOUSEHOLD REGISTRATION / EDIT */}
        {view === 'form-house' && (
          <div className="max-w-2xl mx-auto">
            <HouseholdForm
              initialData={editingHouse || undefined}
              existingHouses={db.households}
              onSave={handleSaveHouse}
              onCancel={() => {
                if (editingHouse) {
                  navigateTo('house-profile', 'houses', undefined, editingHouse.id);
                } else {
                  navigateTo('houses', 'houses');
                }
              }}
            />
          </div>
        )}

        {/* FORM 3: EDUCATIONAL FOLLOW-UP */}
        {view === 'form-edu' && currentGirl && (
          <div className="max-w-3xl mx-auto">
            <EducationalFollowUpForm
              girl={currentGirl}
              onSave={handleSaveEduFollowUp}
              onCancel={() => navigateTo('girl-profile', 'girls', currentGirl.id)}
            />
          </div>
        )}

        {/* FORM 4: HEALTH / MEDICAL FOLLOW-UP */}
        {view === 'form-health' && currentGirl && (
          <div className="max-w-3xl mx-auto">
            <HealthFollowUpForm
              girl={currentGirl}
              onSave={handleSaveHealthFollowUp}
              onCancel={() => navigateTo('girl-profile', 'girls', currentGirl.id)}
            />
          </div>
        )}

        {/* FORM 5: FAMILY FOLLOW-UP */}
        {view === 'form-family' && currentGirl && (
          <div className="max-w-3xl mx-auto">
            <FamilyFollowUpForm
              girl={currentGirl}
              onSave={handleSaveFamilyFollowUp}
              onCancel={() => navigateTo('girl-profile', 'girls', currentGirl.id)}
            />
          </div>
        )}

        {/* FORM 6: RENT PAYMENT */}
        {view === 'form-rent' && currentHouse && (
          <div className="max-w-2xl mx-auto">
            <RentPaymentForm
              household={currentHouse}
              onSave={handleSaveRentPayment}
              onCancel={() => navigateTo('house-profile', 'houses', undefined, currentHouse.id)}
            />
          </div>
        )}

        {/* FORM 7: HOUSEHOLD EXPENSE */}
        {view === 'form-expense' && currentHouse && (
          <div className="max-w-2xl mx-auto">
            <HouseholdExpenseForm
              household={currentHouse}
              onSave={handleSaveExpense}
              onCancel={() => navigateTo('house-profile', 'houses', undefined, currentHouse.id)}
            />
          </div>
        )}

        {/* FORM 8: HOUSEHOLD ACTIVITY */}
        {view === 'form-activity' && currentHouse && (
          <div className="max-w-3xl mx-auto">
            <HouseholdActivityForm
              household={currentHouse}
              houseGirls={currentHouseResidents}
              onSave={handleSaveActivity}
              onCancel={() => navigateTo('house-profile', 'houses', undefined, currentHouse.id)}
            />
          </div>
        )}
      </main>

      {/* Global Modals */}
      <SearchModal
        db={db}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectGirl={handleOpenGirlProfile}
        onSelectHouse={handleOpenHouseProfile}
      />

      <DataModal
        db={db}
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
        onDataChanged={reloadData}
      />

      <QuickAddModal
        db={db}
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSelectAction={handleQuickAction}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MessagingProvider>
        <AppContent />
      </MessagingProvider>
    </AuthProvider>
  );
}
