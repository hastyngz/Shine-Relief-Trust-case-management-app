import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  query,
  where,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '../firebase';
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
  StaffUser,
} from '../types';

export type SyncStatus = 'connecting' | 'connected' | 'saving' | 'synced' | 'error';

let syncStatus: SyncStatus = 'connecting';
let syncStatusListeners: Array<(status: SyncStatus) => void> = [];

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncStatusListeners.push(listener);
  listener(syncStatus);
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== listener);
  };
}

function updateSyncStatus(newStatus: SyncStatus) {
  syncStatus = newStatus;
  syncStatusListeners.forEach((fn) => fn(newStatus));
}

// Clean undefined fields so Firestore doesn't reject them
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = sanitizeForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// Firestore collection names
export const COLLECTIONS = {
  GIRLS: 'girls',
  HOUSEHOLDS: 'households',
  EDU_FOLLOW_UPS: 'educationalFollowUps',
  HEALTH_FOLLOW_UPS: 'healthFollowUps',
  FAMILY_FOLLOW_UPS: 'familyFollowUps',
  RENT_PAYMENTS: 'rentPayments',
  EXPENSES: 'expenses',
  ACTIVITIES: 'householdActivities',
  STAFF_USERS: 'staffUsers',
  CONVERSATIONS: 'staffConversations',
  MESSAGES: 'staffMessages',
  NOTIFICATIONS: 'staffNotifications',
  ANNOUNCEMENTS: 'staffAnnouncements',
  PREFERENCES: 'userNotificationPreferences',
} as const;

// Staff User management methods
export async function persistStaffUserToFirestore(staff: StaffUser): Promise<void> {
  try {
    const ref = doc(firestore, COLLECTIONS.STAFF_USERS, staff.id);
    await setDoc(ref, sanitizeForFirestore(staff), { merge: true });
  } catch (err) {
    console.error('Firestore persistStaffUser error:', err);
    throw err;
  }
}

export async function getStaffUserDoc(uid: string): Promise<StaffUser | null> {
  try {
    const ref = doc(firestore, COLLECTIONS.STAFF_USERS, uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as StaffUser;
    }
    return null;
  } catch (err) {
    console.error('Firestore getStaffUserDoc error:', err);
    return null;
  }
}

export async function getStaffUserByEmail(email: string): Promise<StaffUser | null> {
  try {
    const cleanEmail = email.toLowerCase().trim();
    const q = query(
      collection(firestore, COLLECTIONS.STAFF_USERS),
      where('email', '==', cleanEmail),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as StaffUser;
    }
    return null;
  } catch (err) {
    console.warn('Firestore getStaffUserByEmail notice:', err);
    return null;
  }
}

export async function deleteStaffUserFromFirestore(staffId: string): Promise<void> {
  try {
    const ref = doc(firestore, COLLECTIONS.STAFF_USERS, staffId);
    await deleteDoc(ref);
  } catch (err) {
    console.error('Firestore deleteStaffUser error:', err);
    throw err;
  }
}

export function subscribeStaffUsers(onUpdated: (staffList: StaffUser[]) => void): () => void {
  const ref = collection(firestore, COLLECTIONS.STAFF_USERS);
  return onSnapshot(
    ref,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as StaffUser);
      onUpdated(list);
    },
    (error) => {
      console.error('Firestore staffUsers snapshot error:', error);
    }
  );
}

// Single-document Firestore persist methods
export async function persistGirlToFirestore(girl: Girl): Promise<void> {
  try {
    updateSyncStatus('saving');
    const ref = doc(firestore, COLLECTIONS.GIRLS, girl.id);
    await setDoc(ref, sanitizeForFirestore(girl), { merge: true });
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistGirl error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteGirlFromFirestore(
  girlId: string,
  linkedFollowUpIds: { edu: string[]; health: string[]; family: string[] }
): Promise<void> {
  try {
    updateSyncStatus('saving');
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, COLLECTIONS.GIRLS, girlId));

    linkedFollowUpIds.edu.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.EDU_FOLLOW_UPS, id));
    });
    linkedFollowUpIds.health.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.HEALTH_FOLLOW_UPS, id));
    });
    linkedFollowUpIds.family.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.FAMILY_FOLLOW_UPS, id));
    });

    await batch.commit();
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteGirl error:', err);
    updateSyncStatus('error');
  }
}

export async function persistHouseholdToFirestore(house: Household): Promise<void> {
  try {
    updateSyncStatus('saving');
    const ref = doc(firestore, COLLECTIONS.HOUSEHOLDS, house.id);
    await setDoc(ref, sanitizeForFirestore(house), { merge: true });
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistHousehold error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteHouseholdFromFirestore(
  houseId: string,
  affectedGirlIds: string[],
  linkedRecordIds: { rent: string[]; expense: string[]; activity: string[] }
): Promise<void> {
  try {
    updateSyncStatus('saving');
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, COLLECTIONS.HOUSEHOLDS, houseId));

    // Clear household assignment on resident girls
    affectedGirlIds.forEach((gId) => {
      batch.update(doc(firestore, COLLECTIONS.GIRLS, gId), {
        householdId: '',
        updatedAt: new Date().toISOString(),
      });
    });

    // Delete linked rent, expenses, activities
    linkedRecordIds.rent.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.RENT_PAYMENTS, id));
    });
    linkedRecordIds.expense.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.EXPENSES, id));
    });
    linkedRecordIds.activity.forEach((id) => {
      batch.delete(doc(firestore, COLLECTIONS.ACTIVITIES, id));
    });

    await batch.commit();
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteHousehold error:', err);
    updateSyncStatus('error');
  }
}

export async function persistEduFollowUpToFirestore(item: EducationalFollowUp): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.EDU_FOLLOW_UPS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistEduFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteEduFollowUpFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.EDU_FOLLOW_UPS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteEduFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function persistHealthFollowUpToFirestore(item: HealthFollowUp): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.HEALTH_FOLLOW_UPS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistHealthFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteHealthFollowUpFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.HEALTH_FOLLOW_UPS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteHealthFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function persistFamilyFollowUpToFirestore(item: FamilyFollowUp): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.FAMILY_FOLLOW_UPS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistFamilyFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteFamilyFollowUpFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.FAMILY_FOLLOW_UPS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteFamilyFollowUp error:', err);
    updateSyncStatus('error');
  }
}

export async function persistRentPaymentToFirestore(item: HouseholdRentPayment): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.RENT_PAYMENTS, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistRentPayment error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteRentPaymentFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.RENT_PAYMENTS, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteRentPayment error:', err);
    updateSyncStatus('error');
  }
}

export async function persistExpenseToFirestore(item: HouseholdExpense): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.EXPENSES, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistExpense error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteExpenseFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.EXPENSES, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteExpense error:', err);
    updateSyncStatus('error');
  }
}

export async function persistHouseholdActivityToFirestore(item: HouseholdActivity): Promise<void> {
  try {
    updateSyncStatus('saving');
    await setDoc(doc(firestore, COLLECTIONS.ACTIVITIES, item.id), sanitizeForFirestore(item));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore persistHouseholdActivity error:', err);
    updateSyncStatus('error');
  }
}

export async function deleteHouseholdActivityFromFirestore(id: string): Promise<void> {
  try {
    updateSyncStatus('saving');
    await deleteDoc(doc(firestore, COLLECTIONS.ACTIVITIES, id));
    updateSyncStatus('synced');
  } catch (err) {
    console.error('Firestore deleteHouseholdActivity error:', err);
    updateSyncStatus('error');
  }
}

// Bulk commit entire database into Firestore (e.g. for backup restore)
export async function syncEntireDatabaseToFirestore(db: AppDatabase): Promise<void> {
  try {
    updateSyncStatus('saving');

    // Helper for batch execution
    const commitInBatches = async (items: Array<{ ref: any; data: any }>) => {
      const BATCH_SIZE = 400;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(firestore);
        chunk.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
        await batch.commit();
      }
    };

    const operations: Array<{ ref: any; data: any }> = [];

    db.girls.forEach((g) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.GIRLS, g.id),
        data: sanitizeForFirestore(g),
      });
    });

    db.households.forEach((h) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.HOUSEHOLDS, h.id),
        data: sanitizeForFirestore(h),
      });
    });

    db.educationalFollowUps.forEach((e) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.EDU_FOLLOW_UPS, e.id),
        data: sanitizeForFirestore(e),
      });
    });

    db.healthFollowUps.forEach((hf) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.HEALTH_FOLLOW_UPS, hf.id),
        data: sanitizeForFirestore(hf),
      });
    });

    db.familyFollowUps.forEach((f) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.FAMILY_FOLLOW_UPS, f.id),
        data: sanitizeForFirestore(f),
      });
    });

    db.rentPayments.forEach((r) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.RENT_PAYMENTS, r.id),
        data: sanitizeForFirestore(r),
      });
    });

    db.expenses.forEach((ex) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.EXPENSES, ex.id),
        data: sanitizeForFirestore(ex),
      });
    });

    db.householdActivities.forEach((a) => {
      operations.push({
        ref: doc(firestore, COLLECTIONS.ACTIVITIES, a.id),
        data: sanitizeForFirestore(a),
      });
    });

    await commitInBatches(operations);
    updateSyncStatus('synced');
  } catch (err) {
    console.error('syncEntireDatabaseToFirestore error:', err);
    updateSyncStatus('error');
  }
}

// Clear all documents from Firestore collections
export async function clearAllFirestoreCollections(): Promise<void> {
  try {
    updateSyncStatus('saving');
    const collectionKeys = Object.values(COLLECTIONS);

    for (const colName of collectionKeys) {
      const snap = await getDocs(collection(firestore, colName));
      if (!snap.empty) {
        const batch = writeBatch(firestore);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    updateSyncStatus('synced');
  } catch (err) {
    console.error('clearAllFirestoreCollections error:', err);
    updateSyncStatus('error');
  }
}

// Global active unsubscribers
let activeUnsubscribers: Unsubscribe[] = [];

/**
 * Initializes real-time Firestore synchronization for all 8 collections.
 * Dispatches 'shine_db_updated' whenever Firestore records are loaded or changed.
 */
export function initFirestoreListeners(
  onDatabaseSynced: (updatedDb: AppDatabase) => void
): () => void {
  // Teardown previous listeners if any
  activeUnsubscribers.forEach((unsub) => unsub());
  activeUnsubscribers = [];

  updateSyncStatus('connecting');

  // In-memory builder updated by collection snapshots
  const liveState: AppDatabase = {
    girls: [],
    households: [],
    educationalFollowUps: [],
    healthFollowUps: [],
    familyFollowUps: [],
    rentPayments: [],
    expenses: [],
    householdActivities: [],
  };

  let initialLoadsCount = 0;
  const TOTAL_COLLECTIONS = 8;

  const notifyChange = () => {
    onDatabaseSynced({
      girls: [...liveState.girls],
      households: [...liveState.households],
      educationalFollowUps: [...liveState.educationalFollowUps],
      healthFollowUps: [...liveState.healthFollowUps],
      familyFollowUps: [...liveState.familyFollowUps],
      rentPayments: [...liveState.rentPayments],
      expenses: [...liveState.expenses],
      householdActivities: [...liveState.householdActivities],
    });
  };

  const handleCollection = <T>(
    colName: string,
    stateField: keyof AppDatabase
  ) => {
    const colRef = collection(firestore, colName);
    const unsub = onSnapshot(
      colRef,
      (snapshot) => {
        const records = snapshot.docs.map((d) => d.data() as T);
        (liveState[stateField] as unknown as T[]) = records;

        if (initialLoadsCount < TOTAL_COLLECTIONS) {
          initialLoadsCount += 1;
          if (initialLoadsCount === TOTAL_COLLECTIONS) {
            updateSyncStatus('synced');
          }
        } else {
          updateSyncStatus('synced');
        }

        notifyChange();
      },
      (error) => {
        console.error(`Firestore snapshot error for ${colName}:`, error);
        updateSyncStatus('error');
      }
    );
    activeUnsubscribers.push(unsub);
  };

  handleCollection<Girl>(COLLECTIONS.GIRLS, 'girls');
  handleCollection<Household>(COLLECTIONS.HOUSEHOLDS, 'households');
  handleCollection<EducationalFollowUp>(COLLECTIONS.EDU_FOLLOW_UPS, 'educationalFollowUps');
  handleCollection<HealthFollowUp>(COLLECTIONS.HEALTH_FOLLOW_UPS, 'healthFollowUps');
  handleCollection<FamilyFollowUp>(COLLECTIONS.FAMILY_FOLLOW_UPS, 'familyFollowUps');
  handleCollection<HouseholdRentPayment>(COLLECTIONS.RENT_PAYMENTS, 'rentPayments');
  handleCollection<HouseholdExpense>(COLLECTIONS.EXPENSES, 'expenses');
  handleCollection<HouseholdActivity>(COLLECTIONS.ACTIVITIES, 'householdActivities');

  return () => {
    activeUnsubscribers.forEach((unsub) => unsub());
    activeUnsubscribers = [];
  };
}
