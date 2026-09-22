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
} from '../types';
import { INITIAL_DATABASE } from '../data/seedData';
import {
  persistGirlToFirestore,
  deleteGirlFromFirestore,
  persistHouseholdToFirestore,
  deleteHouseholdFromFirestore,
  persistEduFollowUpToFirestore,
  deleteEduFollowUpFromFirestore,
  persistHealthFollowUpToFirestore,
  deleteHealthFollowUpFromFirestore,
  persistFamilyFollowUpToFirestore,
  deleteFamilyFollowUpFromFirestore,
  persistRentPaymentToFirestore,
  deleteRentPaymentFromFirestore,
  persistExpenseToFirestore,
  deleteExpenseFromFirestore,
  persistHouseholdActivityToFirestore,
  deleteHouseholdActivityFromFirestore,
  clearAllFirestoreCollections,
  syncEntireDatabaseToFirestore,
} from '../services/firestoreSync';

const STORAGE_KEY = 'shine_relief_trust_prod_v1';
const LEGACY_STORAGE_KEY = 'shine_relief_trust_db_v1';

export function getDatabase(): AppDatabase {
  if (typeof window === 'undefined') return INITIAL_DATABASE;
  try {
    // Purge any old demo key from previous test sessions
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveDatabase(INITIAL_DATABASE, false);
      return INITIAL_DATABASE;
    }
    const parsed = JSON.parse(raw);
    return {
      girls: parsed.girls || [],
      households: parsed.households || [],
      educationalFollowUps: parsed.educationalFollowUps || [],
      healthFollowUps: parsed.healthFollowUps || [],
      familyFollowUps: parsed.familyFollowUps || [],
      rentPayments: parsed.rentPayments || [],
      expenses: parsed.expenses || [],
      householdActivities: parsed.householdActivities || [],
    };
  } catch (error) {
    console.error('Error reading database from localStorage:', error);
    return INITIAL_DATABASE;
  }
}

export function saveDatabase(db: AppDatabase, dispatchEvent: boolean = true): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    if (dispatchEvent) {
      window.dispatchEvent(new Event('shine_db_updated'));
    }
  } catch (error) {
    console.error('Error saving database to localStorage:', error);
  }
}

export function clearAllDatabase(): AppDatabase {
  saveDatabase(INITIAL_DATABASE);
  // Asynchronously wipe all documents across Firestore collections
  clearAllFirestoreCollections().catch((err) =>
    console.error('Error clearing Firestore database:', err)
  );
  return INITIAL_DATABASE;
}

export const resetDatabaseToDefault = clearAllDatabase;
export const resetDatabaseToSeed = clearAllDatabase;

export function exportDatabaseJSON(): string {
  const db = getDatabase();
  return JSON.stringify(db, null, 2);
}

export function importDatabaseJSON(rawJson: string): boolean {
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed.girls) || !Array.isArray(parsed.households)) {
      return false;
    }
    const validatedDb: AppDatabase = {
      girls: parsed.girls,
      households: parsed.households,
      educationalFollowUps: Array.isArray(parsed.educationalFollowUps) ? parsed.educationalFollowUps : [],
      healthFollowUps: Array.isArray(parsed.healthFollowUps) ? parsed.healthFollowUps : [],
      familyFollowUps: Array.isArray(parsed.familyFollowUps) ? parsed.familyFollowUps : [],
      rentPayments: Array.isArray(parsed.rentPayments) ? parsed.rentPayments : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      householdActivities: Array.isArray(parsed.householdActivities) ? parsed.householdActivities : [],
    };
    saveDatabase(validatedDb);
    // Asynchronously synchronize imported records to Firestore
    syncEntireDatabaseToFirestore(validatedDb).catch((err) =>
      console.error('Error syncing imported data to Firestore:', err)
    );
    return true;
  } catch (err) {
    console.error('Failed to parse database backup:', err);
    return false;
  }
}

// ID Generators
export function generateGirlId(currentGirls: Girl[]): string {
  const existingNumbers = currentGirls
    .map((g) => {
      const match = g.id.match(/SG-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const max = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const next = max + 1;
  return `SG-${next.toString().padStart(3, '0')}`;
}

export function generateHouseholdId(currentHouses: Household[]): string {
  const existingNumbers = currentHouses
    .map((h) => {
      const match = h.id.match(/SH-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const max = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const next = max + 1;
  return `SH-${next.toString().padStart(2, '0')}`;
}

export function generateFollowUpId(prefix: string): string {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${timestamp}${random}`;
}

// Entity operations with automatic Firebase Firestore cloud persistence
export function addGirl(
  girl: Omit<Girl, 'createdAt' | 'updatedAt'>,
  auditActor?: string
): Girl {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newGirl: Girl = {
    ...girl,
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || girl.createdBy || 'SHINE Staff',
    updatedBy: auditActor || girl.updatedBy || 'SHINE Staff',
  };
  db.girls.unshift(newGirl);
  saveDatabase(db);
  // Persist directly to Cloud Firestore
  persistGirlToFirestore(newGirl).catch((err) =>
    console.error('Failed to persist girl to Firestore:', err)
  );
  return newGirl;
}

export function updateGirl(
  id: string,
  updates: Partial<Girl>,
  auditActor?: string
): Girl | null {
  const db = getDatabase();
  const index = db.girls.findIndex((g) => g.id === id);
  if (index === -1) return null;
  const updated: Girl = {
    ...db.girls[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || updates.updatedBy || db.girls[index].updatedBy || 'SHINE Staff',
  };
  db.girls[index] = updated;
  saveDatabase(db);
  // Persist update to Cloud Firestore
  persistGirlToFirestore(updated).catch((err) =>
    console.error('Failed to update girl in Firestore:', err)
  );
  return updated;
}

export function deleteGirl(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.girls.length;
  // Collect linked follow-up IDs for cloud deletion
  const linkedEdu = db.educationalFollowUps.filter((e) => e.girlId === id).map((e) => e.id);
  const linkedHealth = db.healthFollowUps.filter((h) => h.girlId === id).map((h) => h.id);
  const linkedFamily = db.familyFollowUps.filter((f) => f.girlId === id).map((f) => f.id);

  db.girls = db.girls.filter((g) => g.id !== id);
  db.educationalFollowUps = db.educationalFollowUps.filter((e) => e.girlId !== id);
  db.healthFollowUps = db.healthFollowUps.filter((h) => h.girlId !== id);
  db.familyFollowUps = db.familyFollowUps.filter((f) => f.girlId !== id);
  saveDatabase(db);

  // Delete from Cloud Firestore
  deleteGirlFromFirestore(id, { edu: linkedEdu, health: linkedHealth, family: linkedFamily }).catch(
    (err) => console.error('Failed to delete girl from Firestore:', err)
  );
  return db.girls.length < initialLength;
}

export function addHousehold(
  household: Omit<Household, 'createdAt' | 'updatedAt'>,
  auditActor?: string
): Household {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newHouse: Household = {
    ...household,
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || household.createdBy || 'SHINE Staff',
    updatedBy: auditActor || household.updatedBy || 'SHINE Staff',
  };
  db.households.unshift(newHouse);
  saveDatabase(db);
  // Persist directly to Cloud Firestore
  persistHouseholdToFirestore(newHouse).catch((err) =>
    console.error('Failed to persist household to Firestore:', err)
  );
  return newHouse;
}

export function updateHousehold(
  id: string,
  updates: Partial<Household>,
  auditActor?: string
): Household | null {
  const db = getDatabase();
  const index = db.households.findIndex((h) => h.id === id);
  if (index === -1) return null;
  const updated: Household = {
    ...db.households[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: auditActor || updates.updatedBy || db.households[index].updatedBy || 'SHINE Staff',
  };
  db.households[index] = updated;
  saveDatabase(db);
  // Persist update to Cloud Firestore
  persistHouseholdToFirestore(updated).catch((err) =>
    console.error('Failed to update household in Firestore:', err)
  );
  return updated;
}

export function deleteHousehold(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.households.length;
  // Collect affected girls and linked financial/activity logs
  const affectedGirlIds = db.girls.filter((g) => g.householdId === id).map((g) => g.id);
  const linkedRent = db.rentPayments.filter((r) => r.householdId === id).map((r) => r.id);
  const linkedExpense = db.expenses.filter((e) => e.householdId === id).map((e) => e.id);
  const linkedActivity = db.householdActivities.filter((a) => a.householdId === id).map((a) => a.id);

  db.households = db.households.filter((h) => h.id !== id);
  db.girls = db.girls.map((g) => (g.householdId === id ? { ...g, householdId: '' } : g));
  db.rentPayments = db.rentPayments.filter((r) => r.householdId !== id);
  db.expenses = db.expenses.filter((e) => e.householdId !== id);
  db.householdActivities = db.householdActivities.filter((a) => a.householdId !== id);
  saveDatabase(db);

  // Delete from Cloud Firestore
  deleteHouseholdFromFirestore(id, affectedGirlIds, {
    rent: linkedRent,
    expense: linkedExpense,
    activity: linkedActivity,
  }).catch((err) => console.error('Failed to delete household from Firestore:', err));

  return db.households.length < initialLength;
}

export function deleteEducationalFollowUp(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.educationalFollowUps.length;
  db.educationalFollowUps = db.educationalFollowUps.filter((e) => e.id !== id);
  saveDatabase(db);
  deleteEduFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete educational follow-up from Firestore:', err)
  );
  return db.educationalFollowUps.length < initialLength;
}

export function deleteHealthFollowUp(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.healthFollowUps.length;
  db.healthFollowUps = db.healthFollowUps.filter((h) => h.id !== id);
  saveDatabase(db);
  deleteHealthFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete health follow-up from Firestore:', err)
  );
  return db.healthFollowUps.length < initialLength;
}

export function deleteFamilyFollowUp(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.familyFollowUps.length;
  db.familyFollowUps = db.familyFollowUps.filter((f) => f.id !== id);
  saveDatabase(db);
  deleteFamilyFollowUpFromFirestore(id).catch((err) =>
    console.error('Failed to delete family follow-up from Firestore:', err)
  );
  return db.familyFollowUps.length < initialLength;
}

export function deleteRentPayment(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.rentPayments.length;
  db.rentPayments = db.rentPayments.filter((r) => r.id !== id);
  saveDatabase(db);
  deleteRentPaymentFromFirestore(id).catch((err) =>
    console.error('Failed to delete rent payment from Firestore:', err)
  );
  return db.rentPayments.length < initialLength;
}

export function deleteExpense(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.expenses.length;
  db.expenses = db.expenses.filter((e) => e.id !== id);
  saveDatabase(db);
  deleteExpenseFromFirestore(id).catch((err) =>
    console.error('Failed to delete expense from Firestore:', err)
  );
  return db.expenses.length < initialLength;
}

export function deleteHouseholdActivity(id: string): boolean {
  const db = getDatabase();
  const initialLength = db.householdActivities.length;
  db.householdActivities = db.householdActivities.filter((a) => a.id !== id);
  saveDatabase(db);
  deleteHouseholdActivityFromFirestore(id).catch((err) =>
    console.error('Failed to delete household activity from Firestore:', err)
  );
  return db.householdActivities.length < initialLength;
}

export function addEducationalFollowUp(
  item: Omit<EducationalFollowUp, 'id' | 'createdAt'>,
  auditActor?: string
): EducationalFollowUp {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: EducationalFollowUp = {
    ...item,
    id: generateFollowUpId('EDU'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
    recordedBy: item.recordedBy || auditActor || 'SHINE Staff',
  };
  db.educationalFollowUps.unshift(newItem);
  saveDatabase(db);
  persistEduFollowUpToFirestore(newItem).catch((err) =>
    console.error('Failed to persist educational follow-up to Firestore:', err)
  );
  return newItem;
}

export function addHealthFollowUp(
  item: Omit<HealthFollowUp, 'id' | 'createdAt'>,
  auditActor?: string
): HealthFollowUp {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: HealthFollowUp = {
    ...item,
    id: generateFollowUpId('HLT'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
    recordedBy: item.recordedBy || auditActor || 'SHINE Staff',
  };
  db.healthFollowUps.unshift(newItem);
  saveDatabase(db);
  persistHealthFollowUpToFirestore(newItem).catch((err) =>
    console.error('Failed to persist health follow-up to Firestore:', err)
  );
  return newItem;
}

export function addFamilyFollowUp(
  item: Omit<FamilyFollowUp, 'id' | 'createdAt'>,
  auditActor?: string
): FamilyFollowUp {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: FamilyFollowUp = {
    ...item,
    id: generateFollowUpId('FAM'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
    recordedBy: item.recordedBy || auditActor || 'SHINE Staff',
  };
  db.familyFollowUps.unshift(newItem);
  saveDatabase(db);
  persistFamilyFollowUpToFirestore(newItem).catch((err) =>
    console.error('Failed to persist family follow-up to Firestore:', err)
  );
  return newItem;
}

export function addRentPayment(
  item: Omit<HouseholdRentPayment, 'id' | 'createdAt'>,
  auditActor?: string
): HouseholdRentPayment {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: HouseholdRentPayment = {
    ...item,
    id: generateFollowUpId('RNT'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
  };
  db.rentPayments.unshift(newItem);
  saveDatabase(db);
  persistRentPaymentToFirestore(newItem).catch((err) =>
    console.error('Failed to persist rent payment to Firestore:', err)
  );
  return newItem;
}

export function addExpense(
  item: Omit<HouseholdExpense, 'id' | 'createdAt'>,
  auditActor?: string
): HouseholdExpense {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: HouseholdExpense = {
    ...item,
    id: generateFollowUpId('EXP'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
  };
  db.expenses.unshift(newItem);
  saveDatabase(db);
  persistExpenseToFirestore(newItem).catch((err) =>
    console.error('Failed to persist expense to Firestore:', err)
  );
  return newItem;
}

export function addHouseholdActivity(
  item: Omit<HouseholdActivity, 'id' | 'createdAt'>,
  auditActor?: string
): HouseholdActivity {
  const db = getDatabase();
  const now = new Date().toISOString();
  const newItem: HouseholdActivity = {
    ...item,
    id: generateFollowUpId('ACT'),
    createdAt: now,
    updatedAt: now,
    createdBy: auditActor || item.createdBy || 'SHINE Staff',
    updatedBy: auditActor || item.updatedBy || 'SHINE Staff',
    recordedBy: item.recordedBy || auditActor || 'SHINE Staff',
  };
  db.householdActivities.unshift(newItem);
  saveDatabase(db);
  persistHouseholdActivityToFirestore(newItem).catch((err) =>
    console.error('Failed to persist household activity to Firestore:', err)
  );
  return newItem;
}
