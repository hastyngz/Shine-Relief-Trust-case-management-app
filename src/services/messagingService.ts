import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import {
  COLLECTIONS,
  sanitizeForFirestore,
} from './firestoreSync';
import {
  StaffConversation,
  StaffMessage,
  StaffNotification,
  StaffAnnouncement,
  UserNotificationPreferences,
  StaffUser,
  AppDatabase,
  NotificationPriority,
  NotificationType,
} from '../types';

// Default preferences for a user
export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<UserNotificationPreferences, 'userId'> = {
  directMessages: true,
  caseAssignments: true,
  followUpReminders: true,
  dataChangeNotifications: true,
  administrativeAnnouncements: true,
  reminderTiming: {
    sevenDaysBefore: true,
    threeDaysBefore: true,
    oneDayBefore: true,
    onDueDate: true,
    afterOverdue: true,
  },
  pushEnabled: false,
  updatedAt: new Date().toISOString(),
};

// ----------------------------------------------------------------------
// Real-time Subscriptions
// ----------------------------------------------------------------------

/**
 * Listen to conversations where the authenticated user is a participant.
 */
export function subscribeToConversations(
  userUid: string,
  callback: (conversations: StaffConversation[]) => void
): Unsubscribe {
  if (!userUid) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(firestore, COLLECTIONS.CONVERSATIONS),
    where('participants', 'array-contains', userUid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: StaffConversation[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      // Sort in memory by lastMessageAt descending
      items.sort((a, b) => new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime());
      callback(items);
    },
    (err) => {
      console.warn('Real-time conversations listener warning:', err);
    }
  );
}

/**
 * Listen to messages within a specific conversation.
 */
export function subscribeToMessages(
  conversationId: string,
  callback: (messages: StaffMessage[]) => void
): Unsubscribe {
  if (!conversationId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(firestore, COLLECTIONS.MESSAGES),
    where('conversationId', '==', conversationId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: StaffMessage[] = [];
      snapshot.forEach((docSnap) => {
        msgs.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      // Sort chronologically ascending
      msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      callback(msgs);
    },
    (err) => {
      console.warn('Real-time messages listener warning:', err);
    }
  );
}

/**
 * Listen to notifications for a specific staff member.
 */
export function subscribeToNotifications(
  userUid: string,
  callback: (notifications: StaffNotification[]) => void
): Unsubscribe {
  if (!userUid) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(firestore, COLLECTIONS.NOTIFICATIONS),
    where('userId', '==', userUid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: StaffNotification[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      // Sort by createdAt descending
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(items);
    },
    (err) => {
      console.warn('Real-time notifications listener warning:', err);
    }
  );
}

/**
 * Listen to organizational staff announcements.
 */
export function subscribeToAnnouncements(
  callback: (announcements: StaffAnnouncement[]) => void
): Unsubscribe {
  const q = query(collection(firestore, COLLECTIONS.ANNOUNCEMENTS));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: StaffAnnouncement[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      // Sort by createdAt descending
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(items);
    },
    (err) => {
      console.warn('Real-time announcements listener warning:', err);
    }
  );
}

// ----------------------------------------------------------------------
// User Preferences
// ----------------------------------------------------------------------

export async function getUserNotificationPreferences(
  userId: string
): Promise<UserNotificationPreferences> {
  try {
    const snap = await getDoc(doc(firestore, COLLECTIONS.PREFERENCES, userId));
    if (snap.exists()) {
      return { userId, ...(snap.data() as any) };
    }
  } catch (err) {
    console.warn('Could not read user notification preferences:', err);
  }
  return {
    userId,
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  };
}

export async function notifyPayrollProcessors(params: {
  period: string;
  actorName: string;
  staff: StaffUser[];
  message: string;
}): Promise<void> {
  const processors = params.staff.filter((person) =>
    person.status === 'Active' &&
    (person.role === 'Administrator' || person.role === 'Manager') &&
    !!person.uid,
  );
  const recipients = await Promise.all(processors.map(async (person) => ({
    person,
    preferences: await getUserNotificationPreferences(person.uid),
  })));
  const now = new Date().toISOString();
  await Promise.all(recipients
    .filter(({ preferences }) => preferences.followUpReminders)
    .map(async ({ person }) => {
      const id = `notif_payroll_${params.period}_${person.uid}`;
      const notification: StaffNotification = {
        id,
        userId: person.uid,
        type: 'followup_reminder',
        title: `${params.period} payroll needs to be processed`,
        message: params.message.slice(0, 160),
        source: 'Payroll task',
        priority: 'important',
        isRead: false,
        createdAt: now,
        createdBy: params.actorName,
        relatedRecordTitle: `Payroll ${params.period}`,
      };
      await setDoc(doc(firestore, COLLECTIONS.NOTIFICATIONS, id), sanitizeForFirestore(notification));
    }));
}

export async function saveUserNotificationPreferences(
  prefs: UserNotificationPreferences
): Promise<void> {
  try {
    const ref = doc(firestore, COLLECTIONS.PREFERENCES, prefs.userId);
    await setDoc(
      ref,
      sanitizeForFirestore({
        ...prefs,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (err) {
    console.error('Error saving notification preferences:', err);
    throw err;
  }
}

// ----------------------------------------------------------------------
// Messaging Operations
// ----------------------------------------------------------------------

/**
 * Create or locate a 1-on-1 direct conversation between two staff members.
 */
export async function startOrCreateDirectConversation(
  sender: { uid: string; fullName: string; role: any; email: string },
  recipient: { uid: string; fullName: string; role: any; email: string },
  initialMessage?: string,
  relatedRecord?: StaffMessage['relatedRecordType'] extends undefined ? never : {
    type: NonNullable<StaffMessage['relatedRecordType']>;
    id: string;
    title: string;
  }
): Promise<StaffConversation> {
  // Deterministic 1-on-1 conversation ID sorted by UIDs
  const sortedUids = [sender.uid, recipient.uid].sort();
  const convId = `conv_${sortedUids[0]}_${sortedUids[1]}`;

  const convRef = doc(firestore, COLLECTIONS.CONVERSATIONS, convId);
  const convSnap = await getDoc(convRef);

  let conversation: StaffConversation;
  const now = new Date().toISOString();

  if (convSnap.exists()) {
    conversation = { id: convSnap.id, ...(convSnap.data() as any) };
  } else {
    conversation = {
      id: convId,
      type: 'direct',
      title: `${sender.fullName} & ${recipient.fullName}`,
      participants: [sender.uid, recipient.uid],
      participantDetails: [
        { uid: sender.uid, name: sender.fullName, role: sender.role, email: sender.email },
        { uid: recipient.uid, name: recipient.fullName, role: recipient.role, email: recipient.email },
      ],
      lastMessageText: initialMessage || 'Conversation started',
      lastMessageAt: now,
      lastMessageSenderId: sender.uid,
      lastMessageSenderName: sender.fullName,
      unreadCounts: {
        [sender.uid]: 0,
        [recipient.uid]: initialMessage ? 1 : 0,
      },
      archivedBy: [],
      createdAt: now,
      updatedAt: now,
      createdBy: sender.uid,
    };
    await setDoc(convRef, sanitizeForFirestore(conversation));
  }

  if (initialMessage && initialMessage.trim().length > 0) {
    await sendMessage({
      conversationId: convId,
      sender,
      recipientUids: [recipient.uid],
      text: initialMessage.trim(),
      relatedRecord,
      directRecipient: { uid: recipient.uid, name: recipient.fullName },
    });
  }

  return conversation;
}

/**
 * Create a group conversation.
 */
export async function createGroupConversation(
  creator: { uid: string; fullName: string; role: any; email: string },
  title: string,
  participants: StaffUser[],
  initialMessage?: string
): Promise<StaffConversation> {
  const convId = `conv_grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const allParticipants = [
    { uid: creator.uid, name: creator.fullName, role: creator.role, email: creator.email },
    ...participants
      .filter((p) => p.uid !== creator.uid)
      .map((p) => ({ uid: p.uid, name: p.fullName, role: p.role, email: p.email })),
  ];

  const uids = allParticipants.map((p) => p.uid);
  const unreadMap: Record<string, number> = {};
  uids.forEach((uid) => {
    unreadMap[uid] = uid === creator.uid ? 0 : initialMessage ? 1 : 0;
  });

  const conversation: StaffConversation = {
    id: convId,
    type: 'group',
    title: title || 'Staff Discussion',
    participants: uids,
    participantDetails: allParticipants,
    lastMessageText: initialMessage || 'Group created',
    lastMessageAt: now,
    lastMessageSenderId: creator.uid,
    lastMessageSenderName: creator.fullName,
    unreadCounts: unreadMap,
    archivedBy: [],
    createdAt: now,
    updatedAt: now,
    createdBy: creator.uid,
  };

  const convRef = doc(firestore, COLLECTIONS.CONVERSATIONS, convId);
  await setDoc(convRef, sanitizeForFirestore(conversation));

  if (initialMessage && initialMessage.trim().length > 0) {
    await sendMessage({
      conversationId: convId,
      sender: creator,
      recipientUids: uids.filter((uid) => uid !== creator.uid),
      text: initialMessage.trim(),
    });
  }

  return conversation;
}

/**
 * Send a message within a conversation.
 * Anti-impersonation: `senderId` is strictly bound to authenticated `sender.uid`.
 */
export async function sendMessage(params: {
  conversationId: string;
  sender: { uid: string; fullName: string; role?: any; email: string };
  recipientUids: string[];
  text: string;
  relatedRecord?: {
    type: NonNullable<StaffMessage['relatedRecordType']>;
    id: string;
    title: string;
  };
  directRecipient?: { uid: string; name: string };
}): Promise<StaffMessage> {
  const { conversationId, sender, recipientUids, text, relatedRecord, directRecipient } = params;
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // All targets authorized to view include sender + recipients
  const allParticipantUids = Array.from(new Set([sender.uid, ...recipientUids]));

  const message: StaffMessage = {
    id: msgId,
    conversationId,
    senderId: sender.uid, // Strictly bound to authenticated UID
    senderName: sender.fullName,
    senderEmail: sender.email,
    recipientId: directRecipient?.uid,
    recipientName: directRecipient?.name,
    recipientUids: allParticipantUids,
    text: text.trim(),
    createdAt: now,
    status: 'sent',
    readBy: [sender.uid],
    readAt: { [sender.uid]: now },
    ...(relatedRecord
      ? {
          relatedRecordType: relatedRecord.type,
          relatedRecordId: relatedRecord.id,
          relatedRecordTitle: relatedRecord.title,
        }
      : {}),
  };

  // Save the message
  await setDoc(doc(firestore, COLLECTIONS.MESSAGES, msgId), sanitizeForFirestore(message));

  // Update conversation lastMessage & increment unread counts for recipients
  try {
    const convRef = doc(firestore, COLLECTIONS.CONVERSATIONS, conversationId);
    const convSnap = await getDoc(convRef);
    if (convSnap.exists()) {
      const data = convSnap.data() as StaffConversation;
      const unread = { ...(data.unreadCounts || {}) };
      recipientUids.forEach((recipUid) => {
        unread[recipUid] = (unread[recipUid] || 0) + 1;
      });
      unread[sender.uid] = 0; // Sender is up to date

      await setDoc(
        convRef,
        sanitizeForFirestore({
          lastMessageText: text.trim().substring(0, 120),
          lastMessageAt: now,
          lastMessageSenderId: sender.uid,
          lastMessageSenderName: sender.fullName,
          unreadCounts: unread,
          updatedAt: now,
        }),
        { merge: true }
      );
    }
  } catch (err) {
    console.error('Error updating conversation metadata:', err);
  }

  // Create in-app notification for each recipient
  recipientUids.forEach(async (recipUid) => {
    try {
      const notifId = `notif_msg_${msgId}_${recipUid}`;
      const notif: StaffNotification = {
        id: notifId,
        userId: recipUid,
        type: 'direct_message',
        title: `Message from ${sender.fullName}`,
        message: text.trim().substring(0, 160),
        source: 'Staff Messaging',
        priority: 'normal',
        isRead: false,
        createdAt: now,
        createdBy: sender.fullName,
        conversationId,
        ...(relatedRecord
          ? {
              relatedRecordType: relatedRecord.type,
              relatedRecordId: relatedRecord.id,
              relatedRecordTitle: relatedRecord.title,
            }
          : {}),
      };
      await setDoc(doc(firestore, COLLECTIONS.NOTIFICATIONS, notifId), sanitizeForFirestore(notif));
    } catch (e) {
      console.warn('Failed to dispatch notification for message:', e);
    }
  });

  return message;
}

/**
 * Mark all messages in a conversation as read by the user.
 */
export async function markConversationAsRead(
  conversationId: string,
  userUid: string
): Promise<void> {
  try {
    const convRef = doc(firestore, COLLECTIONS.CONVERSATIONS, conversationId);
    const convSnap = await getDoc(convRef);
    if (convSnap.exists()) {
      const data = convSnap.data() as StaffConversation;
      const unread = { ...(data.unreadCounts || {}) };
      unread[userUid] = 0;
      await setDoc(convRef, { unreadCounts: unread }, { merge: true });
    }
  } catch (err) {
    console.warn('Could not reset conversation unread count:', err);
  }
}

/**
 * Archive a conversation for a specific user.
 */
export async function archiveConversation(
  conversationId: string,
  userUid: string
): Promise<void> {
  try {
    const convRef = doc(firestore, COLLECTIONS.CONVERSATIONS, conversationId);
    const convSnap = await getDoc(convRef);
    if (convSnap.exists()) {
      const current = (convSnap.data().archivedBy as string[]) || [];
      if (!current.includes(userUid)) {
        await setDoc(convRef, { archivedBy: [...current, userUid] }, { merge: true });
      }
    }
  } catch (err) {
    console.error('Error archiving conversation:', err);
  }
}

/**
 * Unarchive a conversation for a specific user.
 */
export async function unarchiveConversation(
  conversationId: string,
  userUid: string
): Promise<void> {
  try {
    const convRef = doc(firestore, COLLECTIONS.CONVERSATIONS, conversationId);
    const convSnap = await getDoc(convRef);
    if (convSnap.exists()) {
      const current = (convSnap.data().archivedBy as string[]) || [];
      await setDoc(
        convRef,
        { archivedBy: current.filter((id) => id !== userUid) },
        { merge: true }
      );
    }
  } catch (err) {
    console.error('Error unarchiving conversation:', err);
  }
}

// ----------------------------------------------------------------------
// Notification Management
// ----------------------------------------------------------------------

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const ref = doc(firestore, COLLECTIONS.NOTIFICATIONS, notificationId);
    await setDoc(
      ref,
      {
        isRead: true,
        readAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('Error marking notification as read:', err);
  }
}

export async function markAllNotificationsAsRead(
  userUid: string,
  notificationIds: string[]
): Promise<void> {
  if (!notificationIds || notificationIds.length === 0) return;
  try {
    const now = new Date().toISOString();
    const batch = writeBatch(firestore);
    notificationIds.forEach((id) => {
      const ref = doc(firestore, COLLECTIONS.NOTIFICATIONS, id);
      batch.set(ref, { isRead: true, readAt: now }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Error batch marking notifications as read:', err);
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(firestore, COLLECTIONS.NOTIFICATIONS, notificationId));
  } catch (err) {
    console.error('Error deleting notification:', err);
  }
}

// ----------------------------------------------------------------------
// Announcements (Administrator Broadcasts)
// ----------------------------------------------------------------------

export async function createAnnouncement(
  announcementData: Omit<StaffAnnouncement, 'id' | 'createdAt' | 'readBy'>,
  creator: { uid: string; fullName: string; role: any; email: string },
  allStaff: StaffUser[]
): Promise<void> {
  const annId = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // Determine target recipient UIDs
  let targetUids: string[] = [];
  if (announcementData.targetGroup === 'all') {
    targetUids = allStaff.filter((s) => s.status === 'Active').map((s) => s.uid);
  } else if (announcementData.targetGroup === 'managers') {
    targetUids = allStaff
      .filter((s) => s.status === 'Active' && (s.role === 'Manager' || s.role === 'Administrator'))
      .map((s) => s.uid);
  } else if (announcementData.targetGroup === 'staff') {
    targetUids = allStaff
      .filter((s) => s.status === 'Active' && s.role === 'Staff')
      .map((s) => s.uid);
  } else {
    targetUids = announcementData.targetUids || [];
  }

  const announcement: StaffAnnouncement = {
    ...announcementData,
    id: annId,
    targetUids,
    createdByUid: creator.uid,
    createdByName: creator.fullName,
    createdAt: now,
    readBy: [creator.uid],
  };

  // Save the announcement
  await setDoc(doc(firestore, COLLECTIONS.ANNOUNCEMENTS, annId), sanitizeForFirestore(announcement));

  // Push an in-app notification to all targeted staff
  const batch = writeBatch(firestore);
  targetUids
    .filter((uid) => uid !== creator.uid)
    .forEach((uid) => {
      const notifRef = doc(firestore, COLLECTIONS.NOTIFICATIONS, `notif_ann_${annId}_${uid}`);
      const notif: StaffNotification = {
        id: `notif_ann_${annId}_${uid}`,
        userId: uid,
        type: 'announcement',
        title: `Announcement: ${announcementData.title}`,
        message: announcementData.message.substring(0, 160),
        source: 'Executive Announcement',
        priority: announcementData.priority,
        isRead: false,
        createdAt: now,
        createdBy: creator.fullName,
      };
      batch.set(notifRef, sanitizeForFirestore(notif));
    });

  await batch.commit();
}

export async function markAnnouncementRead(
  announcementId: string,
  userUid: string
): Promise<void> {
  try {
    const ref = doc(firestore, COLLECTIONS.ANNOUNCEMENTS, announcementId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const readBy = (snap.data().readBy as string[]) || [];
      if (!readBy.includes(userUid)) {
        await setDoc(ref, { readBy: [...readBy, userUid] }, { merge: true });
      }
    }
  } catch (err) {
    console.warn('Error marking announcement read:', err);
  }
}

export async function deleteAnnouncement(announcementId: string): Promise<void> {
  try {
    await deleteDoc(doc(firestore, COLLECTIONS.ANNOUNCEMENTS, announcementId));
  } catch (err) {
    console.error('Error deleting announcement:', err);
  }
}

// ----------------------------------------------------------------------
// Data-Change Notifications (Rule 4 & 5: Do Not Spam, Role-Based Targeting)
// ----------------------------------------------------------------------

export type DataChangeType =
  | 'new_girl'
  | 'edu_followup'
  | 'health_followup'
  | 'family_followup'
  | 'house_updated'
  | 'rent_added'
  | 'expense_added'
  | 'activity_added'
  | 'record_updated';

export async function triggerDataChangeNotification(params: {
  type: DataChangeType;
  actor: { uid: string; name: string };
  entityId: string;
  entityTitle: string;
  detail?: string;
  girlId?: string;
  houseId?: string;
  allStaff: StaffUser[];
  currentDb: AppDatabase;
}): Promise<void> {
  const { type, actor, entityId, entityTitle, detail, girlId, houseId, allStaff } = params;
  const now = new Date().toISOString();

  let title = '';
  let message = '';
  let priority: NotificationPriority = 'normal';
  let targetRoles: string[] = ['Administrator', 'Manager'];
  let relatedRecordType: StaffNotification['relatedRecordType'] = 'girl';

  switch (type) {
    case 'new_girl':
      title = 'New SHINE Girl Registered';
      message = `${actor.name} registered ${entityTitle}.`;
      priority = 'important';
      targetRoles = ['Administrator', 'Manager', 'Staff'];
      relatedRecordType = 'girl';
      break;

    case 'edu_followup':
      title = 'New Educational Follow-up';
      message = `An educational follow-up was recorded for ${entityTitle} by ${actor.name}.`;
      priority = 'normal';
      targetRoles = ['Administrator', 'Manager'];
      relatedRecordType = 'educationalFollowUp';
      break;

    case 'health_followup':
      title = 'New Medical Follow-up';
      message = `A medical / clinic visit was recorded for ${entityTitle} by ${actor.name}.`;
      priority = 'important';
      targetRoles = ['Administrator', 'Manager'];
      relatedRecordType = 'healthFollowUp';
      break;

    case 'family_followup':
      title = 'New Family Follow-up';
      message = `A family / guardian follow-up was recorded for ${entityTitle} by ${actor.name}.`;
      priority = 'normal';
      targetRoles = ['Administrator', 'Manager'];
      relatedRecordType = 'familyFollowUp';
      break;

    case 'house_updated':
      title = 'Household Updated';
      message = `${entityTitle} was updated by ${actor.name}.`;
      priority = 'normal';
      targetRoles = ['Administrator', 'Manager'];
      relatedRecordType = 'household';
      break;

    case 'rent_added':
      title = 'Rent Record Added';
      message = `Rent payment information was recorded for ${entityTitle} by ${actor.name}.`;
      priority = 'important';
      targetRoles = ['Administrator', 'Manager'];
      relatedRecordType = 'rentPayment';
      break;

    case 'expense_added':
      title = 'Household Expense Added';
      message = `A new household expense was recorded for ${entityTitle} by ${actor.name}.`;
      priority = 'normal';
      targetRoles = ['Administrator', 'Manager'];
      relatedRecordType = 'expense';
      break;

    case 'activity_added':
      title = 'Group Activity Added';
      message = `A new group activity was recorded for ${entityTitle} by ${actor.name}.`;
      priority = 'normal';
      targetRoles = ['Administrator', 'Manager'];
      relatedRecordType = 'activity';
      break;

    case 'record_updated':
      title = 'Record Updated';
      message = `${actor.name} updated ${detail || 'record'} for ${entityTitle}.`;
      priority = 'normal';
      targetRoles = ['Administrator', 'Manager'];
      relatedRecordType = 'girl';
      break;
  }

  // Filter recipient staff: active, in target roles, NOT the actor themselves
  const recipients = allStaff.filter(
    (staff) =>
      staff.status === 'Active' &&
      staff.uid !== actor.uid &&
      targetRoles.includes(staff.role)
  );

  if (recipients.length === 0) return;

  const batch = writeBatch(firestore);
  recipients.forEach((staff) => {
    const notifId = `notif_dc_${type}_${entityId}_${staff.uid}_${Date.now()}`;
    const notifRef = doc(firestore, COLLECTIONS.NOTIFICATIONS, notifId);
    const notif: StaffNotification = {
      id: notifId,
      userId: staff.uid,
      type: 'data_change',
      title,
      message,
      source: 'SHINE Case Management',
      priority,
      isRead: false,
      createdAt: now,
      createdBy: actor.name,
      relatedRecordType,
      relatedRecordId: entityId,
      relatedRecordTitle: entityTitle,
    };
    batch.set(notifRef, sanitizeForFirestore(notif));
  });

  try {
    await batch.commit();
  } catch (err) {
    console.warn('Error saving data change notifications:', err);
  }
}

// ----------------------------------------------------------------------
// Assignment Notifications (Rule 6)
// ----------------------------------------------------------------------

export async function triggerAssignmentNotification(params: {
  assignedStaffUid: string;
  assignedStaffName: string;
  assignerName: string;
  girlName: string;
  girlId: string;
  taskTitle: string;
  dueDate?: string;
}): Promise<void> {
  const { assignedStaffUid, assignerName, girlName, girlId, taskTitle, dueDate } = params;
  const now = new Date().toISOString();
  const notifId = `notif_asgn_${girlId}_${assignedStaffUid}_${Date.now()}`;

  const notif: StaffNotification = {
    id: notifId,
    userId: assignedStaffUid,
    type: 'assignment',
    title: 'New Case Assignment',
    message: `${assignerName} assigned you to ${taskTitle} for ${girlName}${dueDate ? ` (Due: ${dueDate})` : ''}.`,
    source: 'Staff Assignment',
    priority: 'important',
    isRead: false,
    createdAt: now,
    createdBy: assignerName,
    relatedRecordType: 'girl',
    relatedRecordId: girlId,
    relatedRecordTitle: girlName,
  };

  try {
    await setDoc(doc(firestore, COLLECTIONS.NOTIFICATIONS, notifId), sanitizeForFirestore(notif));
  } catch (err) {
    console.warn('Error creating assignment notification:', err);
  }
}

// ----------------------------------------------------------------------
// Follow-Up Reminders (Rule 7: Deduplication, Configurable Timing)
// ----------------------------------------------------------------------

export async function checkAndTriggerFollowUpReminders(
  db: AppDatabase,
  allStaff: StaffUser[],
  currentActorUid?: string
): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  let generatedCount = 0;
  const girlsMap = new Map<string, string>();
  db.girls.forEach((g) => girlsMap.set(g.id, g.fullName));

  // Collect all follow-ups with scheduled nextFollowUpDate
  interface PendingCheck {
    id: string;
    girlId: string;
    girlName: string;
    typeLabel: string;
    recordType: StaffNotification['relatedRecordType'];
    targetDateStr: string;
    recordedBy?: string;
  }

  const list: PendingCheck[] = [];

  db.educationalFollowUps.forEach((item) => {
    if (item.nextFollowUpDate) {
      list.push({
        id: item.id,
        girlId: item.girlId,
        girlName: girlsMap.get(item.girlId) || 'SHINE Girl',
        typeLabel: 'Educational follow-up',
        recordType: 'educationalFollowUp',
        targetDateStr: item.nextFollowUpDate,
        recordedBy: item.recordedBy,
      });
    }
  });

  db.healthFollowUps.forEach((item) => {
    if (item.nextFollowUpDate) {
      list.push({
        id: item.id,
        girlId: item.girlId,
        girlName: girlsMap.get(item.girlId) || 'SHINE Girl',
        typeLabel: 'Medical / health follow-up',
        recordType: 'healthFollowUp',
        targetDateStr: item.nextFollowUpDate,
        recordedBy: item.recordedBy,
      });
    }
  });

  db.familyFollowUps.forEach((item) => {
    if (item.nextFollowUpDate) {
      list.push({
        id: item.id,
        girlId: item.girlId,
        girlName: girlsMap.get(item.girlId) || 'SHINE Girl',
        typeLabel: 'Family / guardian follow-up',
        recordType: 'familyFollowUp',
        targetDateStr: item.nextFollowUpDate,
        recordedBy: item.recordedBy,
      });
    }
  });

  // Target staff to receive reminders: Case workers and Managers
  const targetStaff = allStaff.filter(
    (s) => s.status === 'Active' && (s.role === 'Staff' || s.role === 'Manager' || s.role === 'Administrator')
  );

  if (targetStaff.length === 0) return 0;

  for (const item of list) {
    const targetDate = new Date(item.targetDateStr);
    targetDate.setHours(0, 0, 0, 0);

    // Difference in calendar days
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let timingKey: string | null = null;
    let title = '';
    let message = '';
    let priority: NotificationPriority = 'normal';

    if (diffDays === 7) {
      timingKey = '7d_before';
      title = 'Follow-up Due in 7 Days';
      message = `${item.typeLabel} for ${item.girlName} is scheduled in 1 week (${item.targetDateStr}).`;
      priority = 'normal';
    } else if (diffDays === 3) {
      timingKey = '3d_before';
      title = 'Follow-up Due in 3 Days';
      message = `${item.typeLabel} for ${item.girlName} is due in 3 days (${item.targetDateStr}).`;
      priority = 'normal';
    } else if (diffDays === 1) {
      timingKey = '1d_before';
      title = 'Follow-up Due Tomorrow';
      message = `${item.typeLabel} for ${item.girlName} is due tomorrow (${item.targetDateStr}).`;
      priority = 'important';
    } else if (diffDays === 0) {
      timingKey = 'due_today';
      title = 'Follow-up Due Today';
      message = `${item.typeLabel} for ${item.girlName} is due today!`;
      priority = 'important';
    } else if (diffDays < 0) {
      timingKey = `overdue_${todayStr}`;
      title = 'Follow-up Overdue';
      message = `${item.typeLabel} for ${item.girlName} is ${Math.abs(diffDays)} day(s) overdue (scheduled: ${item.targetDateStr}).`;
      priority = 'urgent';
    }

    if (timingKey) {
      // Deterministic notification ID ensures absolute deduplication in Firestore!
      for (const staff of targetStaff) {
        // If staff member recorded this follow-up, prioritize them, else notify manager/admin
        const isAuthor = item.recordedBy && staff.fullName.toLowerCase().includes(item.recordedBy.toLowerCase());
        const isManager = staff.role === 'Manager' || staff.role === 'Administrator';

        if (isAuthor || isManager) {
          const dedupId = `rem_${item.id}_${timingKey}_${staff.uid}`;
          const notifRef = doc(firestore, COLLECTIONS.NOTIFICATIONS, dedupId);

          try {
            // Check if already created
            const snap = await getDoc(notifRef);
            if (!snap.exists()) {
              const notif: StaffNotification = {
                id: dedupId,
                userId: staff.uid,
                type: 'followup_reminder',
                title,
                message,
                source: 'SHINE Follow-up Tracker',
                priority,
                isRead: false,
                createdAt: new Date().toISOString(),
                createdBy: 'SHINE Follow-up Scheduler',
                relatedRecordType: item.recordType,
                relatedRecordId: item.girlId,
                relatedRecordTitle: item.girlName,
              };
              await setDoc(notifRef, sanitizeForFirestore(notif));
              generatedCount++;
            }
          } catch (e) {
            // Silently continue
          }
        }
      }
    }
  }

  return generatedCount;
}

// ----------------------------------------------------------------------
// Web Push Notifications / FCM Registration
// ----------------------------------------------------------------------

export async function requestPushNotificationPermission(
  userUid: string
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { success: false, error: 'Push notifications are not supported in this browser.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // In web push environments, attempt FCM registration
      try {
        const { getMessaging, getToken } = await import('firebase/messaging');
        const { app } = await import('../firebase');
        const messaging = getMessaging(app);

        // Register service worker if available
        let swReg: ServiceWorkerRegistration | undefined;
        if ('serviceWorker' in navigator) {
          swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        }

        const token = await getToken(messaging, {
          serviceWorkerRegistration: swReg,
        });

        if (token) {
          // Store token in user preferences
          const prefs = await getUserNotificationPreferences(userUid);
          const currentTokens = prefs.fcmTokens || [];
          if (!currentTokens.includes(token)) {
            await saveUserNotificationPreferences({
              ...prefs,
              pushEnabled: true,
              fcmTokens: [...currentTokens, token],
            });
          }
        }
      } catch (fcmErr) {
        console.warn('FCM registration token could not be acquired (sandbox/iframe constraint):', fcmErr);
      }

      // Update local preference to enabled
      const prefs = await getUserNotificationPreferences(userUid);
      await saveUserNotificationPreferences({
        ...prefs,
        pushEnabled: true,
      });

      return { success: true };
    } else {
      return { success: false, error: 'Notification permission was denied.' };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to request notification permission.' };
  }
}
