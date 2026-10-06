import {
  ref,
  uploadBytes,
  getDownloadURL,
  getBlob,
  deleteObject,
} from 'firebase/storage';
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
import { storage, firestore } from '../firebase';
import {
  PhotoAttachment,
  AttachmentTargetType,
  AttachmentCategory,
  StaffRole,
} from '../types';
import { compressImage } from '../utils/imageOptimizer';
import { sanitizeForFirestore, COLLECTIONS } from './firestoreSync';

export const ATTACHMENTS_COLLECTION = 'attachments';

export async function archiveGeneratedReport(
  blob: Blob,
  ownerUid: string,
  reportId: string,
  fileName: string,
  fileType: 'docx' | 'xlsx' | 'pdf' | 'csv'
): Promise<string> {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `reports/${ownerUid}/${reportId}/${safeFileName}`;
  await uploadBytes(ref(storage, storagePath), blob, {
    contentType: fileType === 'pdf' ? 'application/pdf' : fileType === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : fileType === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv',
    customMetadata: { ownerUid, reportId, fileType },
  });
  return storagePath;
}

export async function getArchivedReport(storagePath: string): Promise<Blob> {
  return getBlob(ref(storage, storagePath), 50 * 1024 * 1024);
}

export async function getReportAttachmentMetadata(canViewHealthRecords: boolean): Promise<PhotoAttachment[]> {
  const targetTypes: AttachmentTargetType[] = [
    'girl', 'household', 'educationalFollowUp', 'familyFollowUp',
    'householdActivity', 'programme', 'programmeLog', 'importBatch', 'rentPayment', 'expense',
  ];
  if (canViewHealthRecords) targetTypes.push('healthFollowUp');
  const snapshots = await Promise.all(targetTypes.map((targetType) => {
    const constraints = [
      where('targetType', '==', targetType),
      ...(!canViewHealthRecords ? [where('category', 'not-in', ['Medical Document', 'Prescription'])] : []),
    ];
    return getDocs(query(collection(firestore, ATTACHMENTS_COLLECTION), ...constraints));
  }));

  return snapshots.flatMap((snapshot) => snapshot.docs.map((document) => document.data() as PhotoAttachment))
    .filter((attachment) => canViewHealthRecords || (
      attachment.targetType !== 'healthFollowUp' &&
      attachment.category !== 'Medical Document' &&
      attachment.category !== 'Prescription'
    ))
    .sort((a, b) => b.date.localeCompare(a.date));
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

  const image = await getBlob(ref(storage, attachment.storagePath), 15 * 1024 * 1024);
  return new Uint8Array(await image.arrayBuffer());
}

export async function getAllAttachmentMetadata(): Promise<PhotoAttachment[]> {
  const snapshot = await getDocs(collection(firestore, ATTACHMENTS_COLLECTION));
  return snapshot.docs.map((document) => document.data() as PhotoAttachment);
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
 * Uploads an image or document to Firebase Storage, compresses it on mobile,
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

  // 3. Upload to Firebase Storage
  const storageRef = ref(storage, storagePath);
  const metadata = {
    contentType: optimizedFile.type || 'image/jpeg',
    customMetadata: {
      targetType,
      targetId,
      uploadedByUid: user.uid,
      uploadedByEmail: user.email,
      category,
    },
  };

  await uploadBytes(storageRef, optimizedFile, metadata);

  // 4. Retrieve secure download URL
  const downloadUrl = await getDownloadURL(storageRef);

  // 5. Construct PhotoAttachment record
  const attachment: PhotoAttachment = {
    id: attachmentId,
    targetType,
    targetId,
    fileName: file.name,
    fileSize: optimizedFile.size,
    contentType: optimizedFile.type || 'image/jpeg',
    storagePath,
    downloadUrl,
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

  // 6. Save metadata record to Firestore
  const firestoreDocRef = doc(firestore, ATTACHMENTS_COLLECTION, attachmentId);
  await setDoc(firestoreDocRef, sanitizeForFirestore(attachment));

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
 * Deletes an attachment from both Firebase Storage and Firestore.
 */
export async function deletePhotoAttachment(
  attachment: PhotoAttachment
): Promise<void> {
  // 1. Delete file from Firebase Storage
  try {
    const storageRef = ref(storage, attachment.storagePath);
    await deleteObject(storageRef);
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
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as PhotoAttachment);
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
export function subscribeAllGirlAttachments(
  girlId: string,
  followUpIds: string[],
  onUpdate: (attachments: PhotoAttachment[]) => void
): () => void {
  try {
    const colRef = collection(firestore, ATTACHMENTS_COLLECTION);
    const current = new Map<string, PhotoAttachment[]>();
    const emit = () => {
      const related = Array.from(current.values()).flat();
      related.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(related);
    };
    const unsubscribers = Array.from(new Set([girlId, ...followUpIds])).map((targetId) =>
      onSnapshot(
        query(colRef, where('targetId', '==', targetId)),
        (snapshot) => {
          current.set(targetId, snapshot.docs.map((document) => document.data() as PhotoAttachment));
          emit();
        },
        (err) => {
          console.warn('Girl attachment subscription notice:', err.message);
          current.set(targetId, []);
          emit();
        }
      )
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
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
    const colRef = collection(firestore, ATTACHMENTS_COLLECTION);
    const current = new Map<string, PhotoAttachment[]>();
    const emit = () => {
      const related = Array.from(current.values()).flat();
      related.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(related);
    };
    const unsubscribers = Array.from(new Set([householdId, ...linkedRecordIds])).map((targetId) =>
      onSnapshot(
        query(colRef, where('targetId', '==', targetId)),
        (snapshot) => {
          current.set(targetId, snapshot.docs.map((document) => document.data() as PhotoAttachment));
          emit();
        },
        (err) => {
          console.warn('Household attachment subscription notice:', err.message);
          current.set(targetId, []);
          emit();
        }
      )
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  } catch (err) {
    console.warn('Error in subscribeAllHouseholdAttachments:', err);
    return () => {};
  }
}

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
