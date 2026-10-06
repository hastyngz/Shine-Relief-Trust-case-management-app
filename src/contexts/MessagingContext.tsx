import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import {
  StaffConversation,
  StaffMessage,
  StaffNotification,
  StaffAnnouncement,
  UserNotificationPreferences,
  StaffUser,
  AppDatabase,
} from '../types';
import {
  subscribeToConversations,
  subscribeToMessages,
  subscribeToNotifications,
  subscribeToAnnouncements,
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
  startOrCreateDirectConversation,
  createGroupConversation,
  sendMessage,
  markConversationAsRead,
  archiveConversation as archiveConvService,
  unarchiveConversation as unarchiveConvService,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification as deleteNotifService,
  createAnnouncement as createAnnService,
  markAnnouncementRead as markAnnReadService,
  deleteAnnouncement as deleteAnnService,
  triggerDataChangeNotification,
  triggerAssignmentNotification,
  checkAndTriggerFollowUpReminders,
  requestPushNotificationPermission,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DataChangeType,
} from '../services/messagingService';

interface MessagingContextType {
  conversations: StaffConversation[];
  activeConversation: StaffConversation | null;
  activeMessages: StaffMessage[];
  notifications: StaffNotification[];
  announcements: StaffAnnouncement[];
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  totalUnreadCount: number;
  preferences: UserNotificationPreferences;
  loading: boolean;
  selectConversation: (conversation: StaffConversation | null) => void;
  sendDirectMessage: (
    recipient: StaffUser,
    text: string,
    relatedRecord?: {
      type: NonNullable<StaffMessage['relatedRecordType']>;
      id: string;
      title: string;
    }
  ) => Promise<StaffConversation>;
  sendGroupMessage: (
    title: string,
    participants: StaffUser[],
    text: string
  ) => Promise<StaffConversation>;
  replyToActiveConversation: (
    text: string,
    relatedRecord?: {
      type: NonNullable<StaffMessage['relatedRecordType']>;
      id: string;
      title: string;
    }
  ) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  archiveConversation: (conversationId: string) => Promise<void>;
  unarchiveConversation: (conversationId: string) => Promise<void>;
  postAnnouncement: (
    data: Omit<StaffAnnouncement, 'id' | 'createdAt' | 'readBy' | 'createdByUid' | 'createdByName'>
  ) => Promise<void>;
  markAnnouncementRead: (announcementId: string) => Promise<void>;
  deleteAnnouncement: (announcementId: string) => Promise<void>;
  updatePreferences: (prefs: UserNotificationPreferences) => Promise<void>;
  requestPushPermission: () => Promise<{ success: boolean; error?: string }>;
  notifyDataChange: (params: {
    type: DataChangeType;
    entityId: string;
    entityTitle: string;
    detail?: string;
    girlId?: string;
    houseId?: string;
    relatedRecordType?: StaffNotification['relatedRecordType'];
    currentDb: AppDatabase;
  }) => Promise<void>;
  notifyAssignment: (params: {
    assignedStaffUid: string;
    assignedStaffName: string;
    girlName: string;
    girlId: string;
    taskTitle: string;
    dueDate?: string;
  }) => Promise<void>;
  checkReminders: (db: AppDatabase) => Promise<number>;
}

const MessagingContext = createContext<MessagingContextType | null>(null);

export const MessagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, staffProfile, allStaff, isRegisteredStaff } = useAuth();

  const [conversations, setConversations] = useState<StaffConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<StaffConversation | null>(null);
  const [activeMessages, setActiveMessages] = useState<StaffMessage[]>([]);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [announcements, setAnnouncements] = useState<StaffAnnouncement[]>([]);
  const [preferences, setPreferences] = useState<UserNotificationPreferences>({
    userId: currentUser?.uid || '',
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });
  const [loading, setLoading] = useState(true);

  // Load preferences when authenticated
  useEffect(() => {
    if (currentUser?.uid && isRegisteredStaff) {
      getUserNotificationPreferences(currentUser.uid).then((p) => {
        setPreferences(p);
      });
    }
  }, [currentUser?.uid, isRegisteredStaff]);

  // Subscribe to Conversations in real time
  useEffect(() => {
    if (!currentUser?.uid || !isRegisteredStaff) {
      setConversations([]);
      return;
    }

    const unsub = subscribeToConversations(currentUser.uid, (list) => {
      setConversations(list);
      // Keep activeConversation in sync
      if (activeConversation) {
        const found = list.find((c) => c.id === activeConversation.id);
        if (found) {
          setActiveConversation(found);
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [currentUser?.uid, isRegisteredStaff, activeConversation?.id]);

  // Subscribe to Messages in active conversation
  useEffect(() => {
    if (!activeConversation?.id || !currentUser?.uid) {
      setActiveMessages([]);
      return;
    }

    // Mark as read in conversation metadata
    markConversationAsRead(activeConversation.id, currentUser.uid);

    const unsub = subscribeToMessages(activeConversation.id, (msgs) => {
      setActiveMessages(msgs);
    });

    return () => unsub();
  }, [activeConversation?.id, currentUser?.uid]);

  // Subscribe to Notifications in real time
  useEffect(() => {
    if (!currentUser?.uid || !isRegisteredStaff) {
      setNotifications([]);
      return;
    }

    const unsub = subscribeToNotifications(currentUser.uid, (list) => {
      setNotifications(list);
    });

    return () => unsub();
  }, [currentUser?.uid, isRegisteredStaff]);

  // Subscribe to Announcements in real time
  useEffect(() => {
    if (!currentUser?.uid || !isRegisteredStaff) {
      setAnnouncements([]);
      return;
    }

    const unsub = subscribeToAnnouncements((list) => {
      setAnnouncements(list);
    });

    return () => unsub();
  }, [currentUser?.uid, isRegisteredStaff]);

  // Calculate unread counts
  const unreadMessagesCount = useMemo(() => {
    if (!currentUser?.uid) return 0;
    return conversations.reduce((acc, conv) => {
      // Don't count archived
      if (conv.archivedBy?.includes(currentUser.uid)) return acc;
      return acc + (conv.unreadCounts?.[currentUser.uid] || 0);
    }, 0);
  }, [conversations, currentUser?.uid]);

  const unreadNotificationsCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  const totalUnreadCount = unreadMessagesCount + unreadNotificationsCount;

  // Active user details
  const currentActor = useMemo(() => {
    return {
      uid: currentUser?.uid || '',
      fullName: staffProfile?.fullName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Staff Member',
      role: staffProfile?.role || 'Staff',
      email: currentUser?.email || '',
    };
  }, [currentUser, staffProfile]);

  // Selection
  const selectConversation = useCallback((conversation: StaffConversation | null) => {
    setActiveConversation(conversation);
    if (conversation && currentUser?.uid) {
      markConversationAsRead(conversation.id, currentUser.uid);
    }
  }, [currentUser?.uid]);

  // Send Direct Message
  const sendDirectMessage = useCallback(
    async (
      recipient: StaffUser,
      text: string,
      relatedRecord?: {
        type: NonNullable<StaffMessage['relatedRecordType']>;
        id: string;
        title: string;
      }
    ) => {
      if (!currentActor.uid) throw new Error('Not authenticated');
      const conv = await startOrCreateDirectConversation(
        currentActor,
        {
          uid: recipient.uid,
          fullName: recipient.fullName,
          role: recipient.role,
          email: recipient.email,
        },
        text,
        relatedRecord
      );
      setActiveConversation(conv);
      return conv;
    },
    [currentActor]
  );

  // Send Group Message
  const sendGroupMessage = useCallback(
    async (title: string, participants: StaffUser[], text: string) => {
      if (!currentActor.uid) throw new Error('Not authenticated');
      const conv = await createGroupConversation(currentActor, title, participants, text);
      setActiveConversation(conv);
      return conv;
    },
    [currentActor]
  );

  // Reply in Active Conversation
  const replyToActiveConversation = useCallback(
    async (
      text: string,
      relatedRecord?: {
        type: NonNullable<StaffMessage['relatedRecordType']>;
        id: string;
        title: string;
      }
    ) => {
      if (!activeConversation || !currentActor.uid) return;
      const recipientUids = activeConversation.participants.filter((id) => id !== currentActor.uid);

      await sendMessage({
        conversationId: activeConversation.id,
        sender: currentActor,
        recipientUids,
        text,
        relatedRecord,
      });
    },
    [activeConversation, currentActor]
  );

  // Notification actions
  const markNotificationRead = useCallback(async (notificationId: string) => {
    await markNotificationAsRead(notificationId);
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    if (!currentUser?.uid) return;
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    await markAllNotificationsAsRead(currentUser.uid, unreadIds);
  }, [currentUser?.uid, notifications]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    await deleteNotifService(notificationId);
  }, []);

  // Conversation archive/unarchive
  const archiveConversation = useCallback(
    async (conversationId: string) => {
      if (!currentUser?.uid) return;
      await archiveConvService(conversationId, currentUser.uid);
      if (activeConversation?.id === conversationId) {
        setActiveConversation(null);
      }
    },
    [currentUser?.uid, activeConversation?.id]
  );

  const unarchiveConversation = useCallback(
    async (conversationId: string) => {
      if (!currentUser?.uid) return;
      await unarchiveConvService(conversationId, currentUser.uid);
    },
    [currentUser?.uid]
  );

  // Announcements
  const postAnnouncement = useCallback(
    async (data: Omit<StaffAnnouncement, 'id' | 'createdAt' | 'readBy' | 'createdByUid' | 'createdByName'>) => {
      if (!currentActor.uid) return;
      await createAnnService(
        {
          ...data,
          createdByUid: currentActor.uid,
          createdByName: currentActor.fullName,
        },
        currentActor,
        allStaff
      );
    },
    [currentActor, allStaff]
  );

  const markAnnouncementRead = useCallback(
    async (announcementId: string) => {
      if (!currentUser?.uid) return;
      await markAnnReadService(announcementId, currentUser.uid);
    },
    [currentUser?.uid]
  );

  const deleteAnnouncement = useCallback(async (announcementId: string) => {
    await deleteAnnService(announcementId);
  }, []);

  // Preferences & Push
  const updatePreferences = useCallback(
    async (newPrefs: UserNotificationPreferences) => {
      setPreferences(newPrefs);
      await saveUserNotificationPreferences(newPrefs);
    },
    []
  );

  const requestPushPermission = useCallback(async () => {
    if (!currentUser?.uid) return { success: false, error: 'Not logged in' };
    const res = await requestPushNotificationPermission(currentUser.uid);
    if (res.success) {
      setPreferences((prev) => ({ ...prev, pushEnabled: true }));
    }
    return res;
  }, [currentUser?.uid]);

  // Data Change Notifications
  const notifyDataChange = useCallback(
    async (params: {
      type: DataChangeType;
      entityId: string;
      entityTitle: string;
      detail?: string;
      girlId?: string;
      houseId?: string;
      relatedRecordType?: StaffNotification['relatedRecordType'];
      currentDb: AppDatabase;
    }) => {
      if (!currentActor.uid) return;
      await triggerDataChangeNotification({
        ...params,
        actor: { uid: currentActor.uid, name: currentActor.fullName },
        allStaff,
      });
    },
    [currentActor, allStaff]
  );

  // Assignment Notification
  const notifyAssignment = useCallback(
    async (params: {
      assignedStaffUid: string;
      assignedStaffName: string;
      girlName: string;
      girlId: string;
      taskTitle: string;
      dueDate?: string;
    }) => {
      await triggerAssignmentNotification({
        ...params,
        assignerName: currentActor.fullName,
      });
    },
    [currentActor.fullName]
  );

  // Follow-up reminders check
  const checkReminders = useCallback(
    async (db: AppDatabase) => {
      if (!currentUser?.uid || allStaff.length === 0) return 0;
      return await checkAndTriggerFollowUpReminders(db, allStaff, currentUser.uid);
    },
    [currentUser?.uid, allStaff]
  );

  return (
    <MessagingContext.Provider
      value={{
        conversations,
        activeConversation,
        activeMessages,
        notifications,
        announcements,
        unreadMessagesCount,
        unreadNotificationsCount,
        totalUnreadCount,
        preferences,
        loading,
        selectConversation,
        sendDirectMessage,
        sendGroupMessage,
        replyToActiveConversation,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotification,
        archiveConversation,
        unarchiveConversation,
        postAnnouncement,
        markAnnouncementRead,
        deleteAnnouncement,
        updatePreferences,
        requestPushPermission,
        notifyDataChange,
        notifyAssignment,
        checkReminders,
      }}
    >
      {children}
    </MessagingContext.Provider>
  );
};

export const useMessaging = (): MessagingContextType => {
  const context = useContext(MessagingContext);
  if (!context) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }
  return context;
};
