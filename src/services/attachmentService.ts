import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import {
  PhotoAttachment,
  AttachmentTargetType,
  AttachmentCategory,
  StaffRole,
} from '../types';
import { compressImage } from '../utils/imageOptimizer';
import { sanitizeForFirestore, COLLECTIONS } from './firestoreSync';
import { deleteStoredFile, getStoredFile, getStoredFileDownloadUrl, uploadStoredFile } from './r2StorageClient';

export const ATTACHMENTS_COLLECTION = 'attachments';

async function withDownloadUrl(attachment: PhotoAttachment): Promise<PhotoAttachment> {
  try {
    return { ...attachment, downloadUrl: await getStoredFileDownloadUrl(attachment.storagePath) };
  } catch (error) {
    console.warn('Could not create secure attachment URL:', error);
    return { ...attachment, downloadUrl: '' };
  }
}

export async function archiveGeneratedReport(
  blob: Blob,
  ownerUid: string,
  reportId: string,
  fileName: string,
  fileType: 'docx' | 'xlsx' | 'pdf' | 'csv'
): Promise<string> {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `reports/${ownerUid}/${reportId}/${safeFileName}`;
  await uploadStoredFile(storagePath, blob, fileType === 'pdf' ? 'application/pdf' : fileType === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : fileType === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv', {
    'Owner-Uid': ownerUid,
    'Report-Id': reportId,
    'File-Type': fileType,
  });
  return storagePath;
}

export async function getArchivedReport(storagePath: string): Promise<Blob> {
  return getStoredFile(storagePath);
}

// Share only concurrent report-metadata requests. This is deliberately not
// a persistent cache: attachment permissions and records must be rechecked on
// later opens, and health-authorized and non-authorized results stay separate.
const reportAttachmentRequests = new Map<boolean, Promise<PhotoAttachment[]>>();

export function getReportAttachmentMetadata(canViewHealthRecords: boolean): Promise<PhotoAttachment[]> {
  const existing = reportAttachmentRequests.get(canViewHealthRecords);
  if (existing) return existing;

  const request = fetchReportAttachmentMetadata(canViewHealthRecords);
  reportAttachmentRequests.set(canViewHealthRecords, request);
  void request.finally(() => {
    if (reportAttachmentRequests.get(canViewHealthRecords) === request) {
      reportAttachmentRequests.delete(canViewHealthRecords);
    }
  }).catch(() => {
    // The caller handles the original failure; don't create an unhandled cleanup rejection.
  });
  return request;
}

async function fetchReportAttachmentMetadata(canViewHealthRecords: boolean): Promise<PhotoAttachment[]> {
  const targetTypes: AttachmentTargetType[] = [
    'girl', 'household', 'educationalFollowUp', 'familyFollowUp',
    'householdActivity', 'programme', 'programmeLog', 'importBatch', 'rentPayment', 'expense',
  ];
  if (canViewHealthRecords) targetTypes.push('healthFollowUp');
  // When the user can view health records, a single bounded `in` query can
  // retrieve all report-eligible target types. Without health permission, keep
  // the per-type queries because Firestore cannot combine `in` and `not-in`
  // in the same query; those queries exclude medical attachments at the server.
  const snapshots = canViewHealthRecords
    ? [await getDocs(query(
        collection(firestore, ATTACHMENTS_COLLECTION),
        where('targetType', 'in', targetTypes),
      ))]
    : await Promise.all(targetTypes.map((targetType) => getDocs(query(
        collection(firestore, ATTACHMENTS_COLLECTION),
        where('targetType', '==', targetType),
        where('category', 'not-in', ['Medical Document', 'Prescription']),
      ))));

  const attachments = snapshots.flatMap((snapshot) => snapshot.docs.map((document) => document.data() as PhotoAttachment))
    .filter((attachment) => canViewHealthRecords || (
      attachment.targetType !== 'healthFollowUp' &&
      attachment.category !== 'Medical Document' &&
      attachment.category !== 'Prescription'
    ))
    .sort((a, b) => b.date.localeCompare(a.date));
  return Promise.all(attachments.map(withDownloadUrl));
}

export async function getAuthorizedReportImage(
  attachment: PhotoAttachment,
  canViewHealthRecords: boolean
): Promise<Uint8Array> {
  if (!attachment.contentType.match(/^image\/(jpeg|png)$/i)) {
    throw new Error('Only JPEG and PNG attachments can be embedded in Word reports.');
  }
  if (!canViewHealthRecords && (
    attachment.targetType === 'healthFollowUp' ||
    attachment.category === 'Medical Document' ||
    attachment.category === 'Prescription'
  )) {
    throw new Error('Your account cannot include this health attachment in a report.');
  }

  const image = await getStoredFile(attachment.storagePath);
  return new Uint8Array(await image.arrayBuffer());
}

export async function getAllAttachmentMetadata(): Promise<PhotoAttachment[]> {
  const snapshot = await getDocs(collection(firestore, ATTACHMENTS_COLLECTION));
  return Promise.all(snapshot.docs.map((document) => withDownloadUrl(document.data() as PhotoAttachment)));
}

export interface UploadAttachmentParams {
  file: File;
  targetType: AttachmentTargetType;
  targetId: string;
  caption?: string;
  category: AttachmentCategory;
  date?: string; // YYYY-MM-DD
  consent?: boolean;
  allowUnconfirmedConsent?: boolean;
  user: {
    uid: string;
    fullName?: string;
    email: string;
    role?: StaffRole;
  };
  onProgress?: (percent: number) => void;
}

/**
 * Uploads an image or document to private Cloudflare R2 storage, compresses it on mobile,
 * and saves metadata securely in Firestore.
 */
export async function uploadPhotoAttachment(
  params: UploadAttachmentParams
): Promise<PhotoAttachment> {
  const { file, targetType, targetId, caption, category, date, consent, user } = params;
  if (file.type.startsWith('image/') && consent !== true && !params.allowUnconfirmedConsent) {
    throw new Error('Photo consent must be confirmed before uploading an image.');
  }

  // 1. Optimize/compress image for bandwidth & storage efficiency
  const optimizedFile = await compressImage(file, {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.82,
  });

  // 2. Generate unique attachment ID
  const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `attachments/${targetType}/${targetId}/${attachmentId}_${cleanName}`;

  // 3. Upload to private R2 storage. The server validates the target and user role.
  await uploadStoredFile(storagePath, optimizedFile, optimizedFile.type || 'image/jpeg', {
    'Target-Type': targetType,
    'Target-Id': targetId,
    Category: category,
  });

  // 5. Construct PhotoAttachment record
  const attachment: PhotoAttachment = {
    id: attachmentId,
    targetType,
    targetId,
    fileName: file.name,
    fileSize: optimizedFile.size,
    contentType: optimizedFile.type || 'image/jpeg',
    storagePath,
    downloadUrl: '',
    caption: caption?.trim() || undefined,
    ...(file.type.startsWith('image/') ? {
      consent: consent === true,
      ...(consent === true ? {
        consentCheckedAt: new Date().toISOString(),
        consentCheckedBy: user.fullName || user.email,
      } : {}),
    } : {}),
    category,
    date: date || new Date().toISOString().slice(0, 10),
    uploadedBy: {
      uid: user.uid,
      name: user.fullName || user.email.split('@')[0],
      email: user.email,
      role: user.role,
    },
    createdAt: new Date().toISOString(),
  };
  const downloadUrl = attachment.downloadUrl;

  // 6. Save metadata record to Firestore
  const firestoreDocRef = doc(firestore, ATTACHMENTS_COLLECTION, attachmentId);
  await setDoc(firestoreDocRef, sanitizeForFirestore(attachment));
  attachment.downloadUrl = await getStoredFileDownloadUrl(storagePath);

  // 7. If this is a primary profile photo, update the parent entity's photoUrl
  if (category === 'Profile Photo') {
    try {
      if (targetType === 'girl') {
        const girlRef = doc(firestore, COLLECTIONS.GIRLS, targetId);
        await updateDoc(girlRef, {
          photoUrl: downloadUrl,
          updatedAt: new Date().toISOString(),
        });
      } else if (targetType === 'household') {
        const houseRef = doc(firestore, COLLECTIONS.HOUSEHOLDS, targetId);
        await updateDoc(houseRef, {
          photoUrl: downloadUrl,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('Notice updating profile photoUrl on parent:', err);
    }
  }

  return attachment;
}

/**
 * Deletes an attachment from both R2 and Firestore.
 */
export async function deletePhotoAttachment(
  attachment: PhotoAttachment
): Promise<void> {
  // 1. Delete file from R2
  try {
    await deleteStoredFile(attachment.storagePath);
  } catch (err: any) {
    // If already missing from storage, proceed to delete Firestore metadata
    console.warn('Storage delete notice (file may not exist):', err.message || err);
  }

  // 2. Delete metadata doc from Firestore
  try {
    const docRef = doc(firestore, ATTACHMENTS_COLLECTION, attachment.id);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Firestore delete attachment metadata error:', err);
    throw err;
  }
}

/**
 * Subscribes in real-time to attachments for a specific entity or record.
 */
export function subscribeAttachmentsForTarget(
  targetType: AttachmentTargetType,
  targetId: string,
  onUpdate: (attachments: PhotoAttachment[]) => void
): () => void {
  try {
    const q = query(
      collection(firestore, ATTACHMENTS_COLLECTION),
      where('targetType', '==', targetType),
      where('targetId', '==', targetId)
    );

    return onSnapshot(
      q,
      async (snapshot) => {
        const list = await Promise.all(snapshot.docs.map((d) => withDownloadUrl(d.data() as PhotoAttachment)));
        // Sort descending by date / createdAt
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        onUpdate(list);
      },
      (err) => {
        console.warn('Attachments snapshot notice:', err.message);
        onUpdate([]);
      }
    );
  } catch (err) {
    console.warn('Error creating attachments subscription:', err);
    return () => {};
  }
}

/**
 * Subscribes in real-time to all attachments linked to a specific girl (profile, edu, health, family).
 */
// Firestore supports up to 30 values in an `in` query. Grouping target IDs
// reduces the number of simultaneous listeners on profiles with many linked
// follow-up records. This does not promise fewer billed document reads: every
// matching attachment is still returned, and each batch remains real-time.
const ATTACHMENT_TARGET_QUERY_BATCH_SIZE = 30;

function subscribeAttachmentsForTargets(
  targetIds: string[],
  onUpdate: (attachments: PhotoAttachment[]) => void,
  label: string,
): () => void {
  const uniqueTargetIds = Array.from(new Set(
    targetIds.filter((targetId) => typeof targetId === 'string' && targetId.trim().length > 0),
  ));
  if (uniqueTargetIds.length === 0) {
    onUpdate([]);
    return () => {};
  }

  const current = new Map<string, PhotoAttachment[]>(
    uniqueTargetIds.map((targetId) => [targetId, []]),
  );
  const emit = () => {
    const related = Array.from(current.values()).flat();
    related.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    onUpdate(related);
  };
  const colRef = collection(firestore, ATTACHMENTS_COLLECTION);
  const unsubscribers: Array<() => void> = [];

  for (let start = 0; start < uniqueTargetIds.length; start += ATTACHMENT_TARGET_QUERY_BATCH_SIZE) {
    const batchIds = uniqueTargetIds.slice(start, start + ATTACHMENT_TARGET_QUERY_BATCH_SIZE);
    let latestSnapshotVersion = 0;
    const unsubscribe = onSnapshot(
      query(colRef, where('targetId', 'in', batchIds)),
      async (snapshot) => {
        const snapshotVersion = ++latestSnapshotVersion;
        const attachments = await Promise.all(
          snapshot.docs.map((document) => withDownloadUrl(document.data() as PhotoAttachment)),
        );
        // URL lookups are asynchronous. Ignore an older snapshot if a newer one
        // arrived while its download URLs were being prepared.
        if (snapshotVersion !== latestSnapshotVersion) return;

        const grouped = new Map<string, PhotoAttachment[]>(
          batchIds.map((targetId) => [targetId, []]),
        );
        attachments.forEach((attachment) => {
          grouped.get(attachment.targetId)?.push(attachment);
        });
        grouped.forEach((items, targetId) => current.set(targetId, items));
        emit();
      },
      (err) => {
        console.warn(`${label} attachment subscription notice:`, err.message);
        batchIds.forEach((targetId) => current.set(targetId, []));
        emit();
      },
    );
    unsubscribers.push(unsubscribe);
  }

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

/**
 * Subscribes in real-time to all attachments linked to a specific girl (profile, edu, health, family).
 */
export function subscribeAllGirlAttachments(
  girlId: string,
  followUpIds: string[],
  onUpdate: (attachments: PhotoAttachment[]) => void
): () => void {
  try {
    return subscribeAttachmentsForTargets([girlId, ...followUpIds], onUpdate, 'Girl');
  } catch (err) {
    console.warn('Error in subscribeAllGirlAttachments:', err);
    return () => {};
  }
}

/**
 * Subscribes in real-time to all attachments linked to a household (profile, rent, expense, activities).
 */
export function subscribeAllHouseholdAttachments(
  householdId: string,
  linkedRecordIds: string[],
  onUpdate: (attachments: PhotoAttachment[]) => void
): () => void {
  try {
    return subscribeAttachmentsForTargets([householdId, ...linkedRecordIds], onUpdate, 'Household');
  } catch (err) {
    console.warn('Error in subscribeAllHouseholdAttachments:', err);
    return () => {};
  }
}

/**
 * Subscribes in real-time to all attachments linked to a household (profile, rent, expense, activities).
 */


/**
 * Role-based permission checks for attachments
 */
export function canUploadAttachment(role: StaffRole | null, isViewOnly: boolean): boolean {
  if (isViewOnly) return false;
  if (!role || role === 'View Only') return false;
  return true; // Admin, Manager, and Staff can upload
}

export function canDeleteAttachment(
  attachment: PhotoAttachment,
  currentUserUid: string,
  role: StaffRole | null,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (role === 'Manager') return true;
  // Staff can delete photos they uploaded
  if (role === 'Staff' && attachment.uploadedBy?.uid === currentUserUid) return true;
  return false;
}
