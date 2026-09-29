import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { AppDatabase, StaffRole } from '../types';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const credential = serviceAccountJson
  ? cert(JSON.parse(serviceAccountJson))
  : applicationDefault();

const adminApp = getApps().find((app) => app.name === '[DEFAULT]') || initializeApp({
  credential,
  projectId: firebaseConfig.projectId,
});

export const adminFirestore = getFirestore(
  adminApp,
  firebaseConfig.firestoreDatabaseId || '(default)'
);
export const adminStorageBucket = getStorage(adminApp).bucket(firebaseConfig.storageBucket);

export class AIRequestAuthError extends Error {
  constructor(message: string, public statusCode: 401 | 403) {
    super(message);
  }
}

export async function authenticateAIRequest(authorization?: string) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AIRequestAuthError('A Firebase sign-in token is required.', 401);
  }

  let decodedToken;
  try {
    decodedToken = await getAuth(adminApp).verifyIdToken(match[1]);
  } catch {
    throw new AIRequestAuthError('The Firebase sign-in token is invalid or expired.', 401);
  }

  const email = (decodedToken.email || '').toLowerCase();
  const isPrimaryAdmin = email === 'hastingszidanamot@gmail.com';
  const staffSnapshot = await adminFirestore.collection('staffUsers').doc(decodedToken.uid).get();
  const staffData = staffSnapshot.exists ? staffSnapshot.data() : undefined;

  if (!staffData && !isPrimaryAdmin) {
    throw new AIRequestAuthError('This account is not registered as SHINE staff.', 403);
  }
  if (staffData && staffData.status !== 'Active') {
    throw new AIRequestAuthError('This SHINE staff account is inactive or suspended.', 403);
  }
  if (staffData?.email && staffData.email.toLowerCase() !== email) {
    throw new AIRequestAuthError('The staff profile does not match the authenticated account.', 403);
  }

  const role = (staffData?.role || (isPrimaryAdmin ? 'Administrator' : null)) as StaffRole | null;
  if (!role || !['Administrator', 'Manager', 'Staff', 'View Only'].includes(role)) {
    throw new AIRequestAuthError('The staff profile has no valid SHINE role.', 403);
  }

  return {
    uid: decodedToken.uid,
    email,
    fullName: staffData?.fullName || decodedToken.name || email,
    role,
    status: 'Active',
    safeguardingPermissions: staffData?.safeguardingPermissions || {
      canView: false,
      canCreate: false,
      canEdit: false,
      canClose: false,
    },
    canViewHealthRecords: role === 'Administrator' || role === 'Manager' || staffData?.canViewHealthRecords === true,
    canEditHealthRecords: role === 'Administrator' || role === 'Manager' || staffData?.canEditHealthRecords === true,
    canViewCaseReviews: role === 'Administrator' || role === 'Manager' || staffData?.canViewCaseReviews === true,
  };
}

async function readRecords<T extends { id: string }>(collectionName: string): Promise<T[]> {
  const snapshot = await adminFirestore.collection(collectionName).get();
  return snapshot.docs.map((record: QueryDocumentSnapshot) => ({ ...record.data(), id: record.id }) as T);
}

export async function loadAIRecords(
  canViewHealthRecords: boolean,
  staffUid: string,
  canViewTeamTasks: boolean,
  canViewCaseReviews: boolean
): Promise<AppDatabase> {
  const [girls, households, educationalFollowUps, healthFollowUps, familyFollowUps,
    rentPayments, expenses, householdActivities, educationHistory, academicSupports,
    examinationRecords, attendanceRecords, girlLeaves, caseReviews, meetings, schedules,
    workplans, feedingProgramLogs, marketPrices] = await Promise.all([
    readRecords<AppDatabase['girls'][number]>('girls'),
    readRecords<AppDatabase['households'][number]>('households'),
    readRecords<AppDatabase['educationalFollowUps'][number]>('educationalFollowUps'),
    canViewHealthRecords
      ? readRecords<AppDatabase['healthFollowUps'][number]>('healthFollowUps')
      : Promise.resolve([]),
    readRecords<AppDatabase['familyFollowUps'][number]>('familyFollowUps'),
    readRecords<AppDatabase['rentPayments'][number]>('rentPayments'),
    readRecords<AppDatabase['expenses'][number]>('expenses'),
    readRecords<AppDatabase['householdActivities'][number]>('householdActivities'),
    readRecords<NonNullable<AppDatabase['educationHistory']>[number]>('educationHistory'),
    readRecords<NonNullable<AppDatabase['academicSupports']>[number]>('academicSupports'),
    readRecords<NonNullable<AppDatabase['examinationRecords']>[number]>('examinationRecords'),
    readRecords<NonNullable<AppDatabase['attendanceRecords']>[number]>('attendanceRecords'),
    readRecords<NonNullable<AppDatabase['girlLeaves']>[number]>('girlLeaves'),
    canViewCaseReviews
      ? readRecords<NonNullable<AppDatabase['caseReviews']>[number]>('caseReviews')
      : Promise.resolve([]),
    readRecords<NonNullable<AppDatabase['meetings']>[number]>('meetings'),
    readRecords<NonNullable<AppDatabase['schedules']>[number]>('schedules'),
    readRecords<NonNullable<AppDatabase['workplans']>[number]>('workplans'),
    readRecords<NonNullable<AppDatabase['feedingProgramLogs']>[number]>('feedingProgramLogs'),
    readRecords<NonNullable<AppDatabase['marketPrices']>[number]>('marketPrices'),
  ]);

  const caseActionQuery = adminFirestore.collection('caseActions');
  const caseActionSnapshot = canViewTeamTasks
    ? await caseActionQuery.get()
    : await caseActionQuery.where('assignedStaffId', '==', staffUid).get();
  const caseActions = caseActionSnapshot.docs.map((record: QueryDocumentSnapshot) => ({ ...record.data(), id: record.id })) as NonNullable<AppDatabase['caseActions']>;

  return {
    girls,
    households,
    educationalFollowUps,
    healthFollowUps,
    familyFollowUps,
    rentPayments,
    expenses,
    householdActivities,
    caseActions,
    educationHistory,
    academicSupports,
    examinationRecords,
    attendanceRecords,
    girlLeaves,
    caseReviews,
    meetings,
    schedules,
    workplans,
    feedingProgramLogs,
    marketPrices,
  };
}

export async function writeAIAudit(entry: Record<string, unknown>): Promise<void> {
  await adminFirestore.collection('aiAuditLogs').add({ ...entry, createdAt: new Date().toISOString() });
}

export async function getAISettings(): Promise<Record<string, any>> {
  const snapshot = await adminFirestore.collection('aiSettings').doc('default').get();
  return snapshot.exists ? snapshot.data() || {} : { enabled: true, speechToText: true, documentAnalysis: true, naturalLanguageSearch: true };
}

export async function writeSafeguardingAudit(entry: Record<string, unknown>): Promise<void> {
  await adminFirestore.collection('safeguardingAuditLogs').add({
    ...entry,
    timestamp: new Date().toISOString(),
  });
}

export async function notifyCaseAction(
  task: Record<string, any>,
  kind: 'assigned' | 'reassigned' | 'due_soon' | 'overdue',
  actorName: string
): Promise<boolean> {
  if (!task.assignedStaffId || task.status === 'Completed' || task.status === 'Cancelled') return false;
  const targetSnapshot = await adminFirestore.collection('staffUsers').doc(task.assignedStaffId).get();
  if (!targetSnapshot.exists || targetSnapshot.data()?.status !== 'Active') return false;

  const dueDate = task.dueDate || '';
  const safeTaskId = String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const notificationId = `case_action_${safeTaskId}_${kind}_${dueDate || 'na'}_${task.assignedStaffId}`;
  const notificationRef = adminFirestore.collection('staffNotifications').doc(notificationId);
  if ((await notificationRef.get()).exists) return false;

  const isAssignment = kind === 'assigned' || kind === 'reassigned';
  await notificationRef.create({
    id: notificationId,
    userId: task.assignedStaffId,
    type: isAssignment ? 'assignment' : 'followup_reminder',
    title: kind === 'overdue'
      ? 'Case action overdue'
      : kind === 'due_soon'
        ? 'Case action due soon'
        : kind === 'reassigned'
          ? 'Case action reassigned'
          : 'New case action assigned',
    message: isAssignment
      ? `${actorName} ${kind === 'reassigned' ? 'reassigned' : 'assigned'} “${task.title}” to you${dueDate ? ` (due ${dueDate})` : ''}.`
      : `“${task.title}” ${kind === 'overdue' ? 'is overdue' : 'is due within three days'}${dueDate ? ` (due ${dueDate})` : ''}.`,
    source: 'Case Actions',
    priority: task.priority === 'Urgent' || task.priority === 'High' || kind === 'overdue' ? 'urgent' : 'important',
    isRead: false,
    createdAt: new Date().toISOString(),
    createdBy: actorName,
    relatedRecordType: task.girlId ? 'girl' : task.householdId ? 'household' : undefined,
    relatedRecordId: task.girlId || task.householdId || task.id,
    relatedRecordTitle: task.title,
  });
  return true;
}