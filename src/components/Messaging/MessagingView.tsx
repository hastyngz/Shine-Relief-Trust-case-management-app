import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Plus,
  Users,
  Search,
  Check,
  CheckCheck,
  Bell,
  Clock,
  Sparkles,
  AlertCircle,
  Megaphone,
  Trash2,
  Archive,
  ArrowLeft,
  Settings,
  Paperclip,
  ExternalLink,
  Shield,
  ShieldAlert,
  Calendar,
  X,
  User,
  RefreshCw,
  BellRing,
  BellOff,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessaging } from '../../contexts/MessagingContext';
import {
  StaffConversation,
  StaffMessage,
  StaffNotification,
  StaffAnnouncement,
  StaffUser,
  AppDatabase,
  NotificationPriority,
} from '../../types';

interface MessagingViewProps {
  appDb: AppDatabase;
  onOpenRecord: (type: string, id: string) => void;
  initialTab?: 'messages' | 'inbox' | 'announcements' | 'settings';
}

export const MessagingView: React.FC<MessagingViewProps> = ({
  appDb,
  onOpenRecord,
  initialTab = 'messages',
}) => {
  const { currentUser, staffProfile, allStaff, isAdmin } = useAuth();
  const {
    conversations,
    activeConversation,
    activeMessages,
    notifications,
    announcements,
    unreadMessagesCount,
    unreadNotificationsCount,
    preferences,
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
    checkReminders,
  } = useMessaging();

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'messages' | 'inbox' | 'announcements' | 'settings'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'data_change' | 'assignment' | 'reminder'>('all');
  const [showArchived, setShowArchived] = useState(false);

  // Message composer state
  const [replyText, setReplyText] = useState('');
  const [selectedCaseRef, setSelectedCaseRef] = useState<{
    type: NonNullable<StaffMessage['relatedRecordType']>;
    id: string;
    title: string;
  } | null>(null);
  const [showCasePicker, setShowCasePicker] = useState(false);

  // New Message Modal
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const [newMsgType, setNewMsgType] = useState<'direct' | 'group'>('direct');
  const [selectedRecipientUid, setSelectedRecipientUid] = useState<string>('');
  const [selectedGroupMemberUids, setSelectedGroupMemberUids] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [newMsgContent, setNewMsgContent] = useState('');
  const [newMsgCaseRef, setNewMsgCaseRef] = useState<{
    type: NonNullable<StaffMessage['relatedRecordType']>;
    id: string;
    title: string;
  } | null>(null);

  // Announcement Modal (Admin only)
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annPriority, setAnnPriority] = useState<NotificationPriority>('normal');
  const [annTargetGroup, setAnnTargetGroup] = useState<'all' | 'managers' | 'staff'>('all');

  // Push notification state
  const [pushStatusMsg, setPushStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isCheckingReminders, setIsCheckingReminders] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of message thread
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!currentUser?.uid) return [];
    return conversations.filter((c) => {
      const isArchived = c.archivedBy?.includes(currentUser.uid);
      if (showArchived ? !isArchived : isArchived) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = c.title?.toLowerCase().includes(q);
      const matchLastMsg = c.lastMessageText?.toLowerCase().includes(q);
      const matchParticipant = c.participantDetails?.some((p) => p.name.toLowerCase().includes(q));
      return matchTitle || matchLastMsg || matchParticipant;
    });
  }, [conversations, currentUser?.uid, showArchived, searchQuery]);

  // Filter notifications for Inbox tab
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      if (inboxFilter === 'unread' && notif.isRead) return false;
      if (inboxFilter === 'data_change' && notif.type !== 'data_change') return false;
      if (inboxFilter === 'assignment' && notif.type !== 'assignment') return false;
      if (inboxFilter === 'reminder' && notif.type !== 'followup_reminder') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        notif.title.toLowerCase().includes(q) ||
        notif.message.toLowerCase().includes(q) ||
        notif.source.toLowerCase().includes(q) ||
        notif.relatedRecordTitle?.toLowerCase().includes(q)
      );
    });
  }, [notifications, inboxFilter, searchQuery]);

  // Active staff members excluding current user
  const activeStaffList = useMemo(() => {
    return allStaff.filter((s) => s.status === 'Active' && s.uid !== currentUser?.uid);
  }, [allStaff, currentUser?.uid]);

  // Handle Send Reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    try {
      await replyToActiveConversation(replyText.trim(), selectedCaseRef || undefined);
      setReplyText('');
      setSelectedCaseRef(null);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Handle Create New Message / Conversation
  const handleCreateNewMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgContent.trim()) return;

    try {
      if (newMsgType === 'direct') {
        const recip = allStaff.find((s) => s.uid === selectedRecipientUid);
        if (!recip) return;
        await sendDirectMessage(recip, newMsgContent.trim(), newMsgCaseRef || undefined);
      } else {
        const members = allStaff.filter((s) => selectedGroupMemberUids.includes(s.uid));
        if (members.length === 0) return;
        await sendGroupMessage(
          groupTitle || 'Staff Group',
          members,
          newMsgContent.trim()
        );
      }

      // Reset
      setIsNewMessageModalOpen(false);
      setNewMsgContent('');
      setSelectedRecipientUid('');
      setSelectedGroupMemberUids([]);
      setGroupTitle('');
      setNewMsgCaseRef(null);
      setActiveTab('messages');
    } catch (err) {
      console.error('Error starting conversation:', err);
    }
  };

  // Handle Post Announcement
  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) return;

    try {
      await postAnnouncement({
        title: annTitle.trim(),
        message: annMessage.trim(),
        priority: annPriority,
        targetGroup: annTargetGroup,
      });

      setIsAnnouncementModalOpen(false);
      setAnnTitle('');
      setAnnMessage('');
      setAnnPriority('normal');
      setActiveTab('announcements');
    } catch (err) {
      console.error('Error posting announcement:', err);
    }
  };

  // Trigger manual reminder scan
  const handleRunReminders = async () => {
    setIsCheckingReminders(true);
    try {
      const count = await checkReminders(appDb);
      setPushStatusMsg({
        type: 'success',
        text: count > 0 ? `Triggered ${count} pending follow-up reminder(s).` : 'All follow-up schedules are up-to-date.',
      });
    } catch (err) {
      setPushStatusMsg({ type: 'error', text: 'Failed to scan reminders.' });
    } finally {
      setIsCheckingReminders(false);
    }
  };

  // Format timestamp
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-stone-100 overflow-hidden">
      {/* Top Banner & Tab Navigation */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 shrink-0 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-800 text-amber-400 flex items-center justify-center shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-stone-900 leading-tight">
                Staff Messaging & Notifications
              </h1>
              <p className="text-xs text-stone-500">
                Secure internal communications and real-time case alerts
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="new-staff-message-btn"
              type="button"
              onClick={() => setIsNewMessageModalOpen(true)}
              className="px-3.5 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Message</span>
            </button>

            {isAdmin && (
              <button
                id="new-announcement-btn"
                type="button"
                onClick={() => setIsAnnouncementModalOpen(true)}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-teal-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Megaphone className="w-4 h-4" />
                <span>Broadcast Announcement</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`p-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
              }`}
              title="Notification Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Preferences</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto flex items-center gap-2 mt-3 border-t border-stone-100 pt-3 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('messages')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'messages'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Direct & Group Messages</span>
            {unreadMessagesCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-teal-950">
                {unreadMessagesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'inbox'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>System Inbox & Alerts</span>
            {unreadNotificationsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-teal-950">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('announcements')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'announcements'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            <span>Announcements</span>
            {announcements.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-stone-300 text-stone-800">
                {announcements.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden max-w-7xl w-full mx-auto p-2 sm:p-4">
        {/* ========================================== */}
        {/* TAB 1: MESSAGES (Chat Interface)          */}
        {/* ========================================== */}
        {activeTab === 'messages' && (
          <div className="h-full bg-white rounded-2xl border border-stone-200 shadow-sm flex overflow-hidden">
            {/* Conversation List Sidebar */}
            <div
              className={`w-full md:w-80 lg:w-96 border-r border-stone-200 flex flex-col bg-stone-50/50 ${
                activeConversation ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Search & Filter Header */}
              <div className="p-3 border-b border-stone-200 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-500 px-1">
                  <span>{filteredConversations.length} conversation(s)</span>
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className="text-teal-700 hover:text-teal-900 font-semibold"
                  >
                    {showArchived ? 'View Active' : 'View Archived'}
                  </button>
                </div>
              </div>

              {/* Conversation Items */}
              <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center text-stone-500 space-y-2">
                    <MessageSquare className="w-8 h-8 text-stone-300 mx-auto stroke-1" />
                    <p className="text-xs font-semibold text-stone-700">No conversations</p>
                    <p className="text-[11px] text-stone-600">
                      Start a direct message with a staff member or create a group discussion.
                    </p>
                    <button
                      onClick={() => setIsNewMessageModalOpen(true)}
                      className="mt-2 px-3 py-1.5 bg-teal-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Start Chat</span>
                    </button>
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isSelected = activeConversation?.id === conv.id;
                    const unread = conv.unreadCounts?.[currentUser?.uid || ''] || 0;
                    const otherParticipants = conv.participantDetails?.filter(
                      (p) => p.uid !== currentUser?.uid
                    );
                    const displayTitle =
                      conv.type === 'direct'
                        ? otherParticipants?.[0]?.name || conv.title || 'Staff Member'
                        : conv.title || 'Group Chat';

                    return (
                      <div
                        key={conv.id}
                        id={`conv-item-${conv.id}`}
                        onClick={() => selectConversation(conv)}
                        className={`p-3 cursor-pointer transition-colors flex items-start gap-3 ${
                          isSelected
                            ? 'bg-teal-50/80 border-l-4 border-l-teal-700'
                            : unread > 0
                            ? 'bg-amber-50/50 hover:bg-amber-100/50 border-l-4 border-l-amber-500'
                            : 'hover:bg-stone-100/80'
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            conv.type === 'group'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-teal-100 text-teal-800'
                          }`}
                        >
                          {conv.type === 'group' ? (
                            <Users className="w-4 h-4" />
                          ) : (
                            displayTitle.charAt(0).toUpperCase()
                          )}
                        </div>

                        {/* Summary */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3
                              className={`text-xs truncate ${
                                unread > 0 ? 'font-bold text-stone-900' : 'font-semibold text-stone-800'
                              }`}
                            >
                              {displayTitle}
                            </h3>
                            <span className="text-[10px] text-stone-600 shrink-0">
                              {formatTime(conv.lastMessageAt || conv.createdAt)}
                            </span>
                          </div>

                          <p
                            className={`text-[11px] truncate mt-0.5 ${
                              unread > 0 ? 'font-semibold text-stone-800' : 'text-stone-500'
                            }`}
                          >
                            {conv.lastMessageSenderName && (
                              <span className="text-stone-700 font-medium">
                                {conv.lastMessageSenderId === currentUser?.uid
                                  ? 'You: '
                                  : `${conv.lastMessageSenderName.split(' ')[0]}: `}
                              </span>
                            )}
                            {conv.lastMessageText || 'No messages yet'}
                          </p>
                        </div>

                        {/* Unread Pill */}
                        {unread > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-teal-950 shrink-0">
                            {unread}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Message Thread View */}
            <div
              className={`flex-1 flex flex-col bg-white ${
                !activeConversation ? 'hidden md:flex' : 'flex'
              }`}
            >
              {activeConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3.5 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => selectConversation(null)}
                        className="md:hidden p-1.5 rounded-lg text-stone-600 hover:bg-stone-200 transition-colors"
                        title="Back to list"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>

                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                          activeConversation.type === 'group'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {activeConversation.type === 'group' ? (
                          <Users className="w-4 h-4" />
                        ) : (
                          activeConversation.title?.charAt(0).toUpperCase() || 'S'
                        )}
                      </div>

                      <div>
                        <h2 className="text-xs font-bold text-stone-900 leading-tight">
                          {activeConversation.title || 'Conversation'}
                        </h2>
                        <div className="text-[11px] text-stone-500 flex items-center gap-1.5 flex-wrap">
                          {activeConversation.participantDetails?.map((p) => (
                            <span
                              key={p.uid}
                              className="inline-block bg-white px-1.5 py-0.2 rounded border border-stone-200 text-[10px]"
                            >
                              {p.name} ({p.role})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Thread Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          if (activeConversation.archivedBy?.includes(currentUser?.uid || '')) {
                            unarchiveConversation(activeConversation.id);
                          } else {
                            archiveConversation(activeConversation.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-200 transition-colors"
                        title={
                          activeConversation.archivedBy?.includes(currentUser?.uid || '')
                            ? 'Unarchive conversation'
                            : 'Archive conversation'
                        }
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Messages Bubble Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50/30">
                    {activeMessages.length === 0 ? (
                      <div className="text-center text-stone-400 py-12 text-xs">
                        No messages in this conversation yet. Send the first message below.
                      </div>
                    ) : (
                      activeMessages.map((msg) => {
                        const isMe = msg.senderId === currentUser?.uid;

                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                          >
                            {/* Sender Info for incoming messages */}
                            {!isMe && (
                              <div className="text-[11px] font-semibold text-stone-600 mb-1 ml-1 flex items-center gap-1">
                                <span>{msg.senderName}</span>
                              </div>
                            )}

                            {/* Bubble Container */}
                            <div
                              className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 shadow-xs ${
                                isMe
                                  ? 'bg-teal-800 text-white rounded-br-xs'
                                  : 'bg-white text-stone-800 border border-stone-200 rounded-bl-xs'
                              }`}
                            >
                              {/* Attached Case Reference Tag */}
                              {msg.relatedRecordType && msg.relatedRecordTitle && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenRecord(msg.relatedRecordType!, msg.relatedRecordId || '')
                                  }
                                  className={`mb-2 w-full text-left p-1.5 rounded-lg text-[11px] font-medium flex items-center justify-between gap-1 transition-opacity ${
                                    isMe
                                      ? 'bg-teal-900/60 text-teal-100 hover:bg-teal-900'
                                      : 'bg-teal-50 text-teal-900 hover:bg-teal-100 border border-teal-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <Paperclip className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                      Case: {msg.relatedRecordTitle}
                                    </span>
                                  </div>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </button>
                              )}

                              {/* Message Text */}
                              <p className="text-xs whitespace-pre-wrap break-words leading-relaxed">
                                {msg.text}
                              </p>

                              {/* Footer timestamp & delivery status */}
                              <div
                                className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                                  isMe ? 'text-teal-200' : 'text-stone-400'
                                }`}
                              >
                                <span>{formatTime(msg.createdAt)}</span>
                                {isMe && (
                                  <span>
                                    {msg.readBy && msg.readBy.length > 1 ? (
                                      <CheckCheck className="w-3 h-3 text-amber-300" />
                                    ) : (
                                      <Check className="w-3 h-3" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply Composer Form */}
                  <form
                    onSubmit={handleSendReply}
                    className="p-3 border-t border-stone-200 bg-white"
                  >
                    {/* Selected Case Reference Badge */}
                    {selectedCaseRef && (
                      <div className="mb-2 flex items-center justify-between bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg text-xs text-teal-800">
                        <div className="flex items-center gap-1.5 truncate">
                          <Paperclip className="w-3.5 h-3.5 text-teal-600" />
                          <span className="font-semibold truncate">
                            Attached Case: {selectedCaseRef.title}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedCaseRef(null)}
                          className="text-stone-400 hover:text-stone-700 ml-2"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-end gap-2">
                      {/* Attach Case Reference Button */}
                      <button
                        type="button"
                        onClick={() => setShowCasePicker(!showCasePicker)}
                        className={`p-2.5 rounded-xl border transition-colors ${
                          selectedCaseRef
                            ? 'bg-teal-100 text-teal-800 border-teal-300'
                            : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                        title="Attach Girl or Household Case Reference"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>

                      {/* Text Input */}
                      <div className="flex-1 relative">
                        <textarea
                          id="chat-message-input"
                          rows={2}
                          placeholder="Type your message to staff (Press Enter to send)..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendReply(e);
                            }
                          }}
                          className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700 resize-none"
                        />
                        <div className="text-[10px] text-stone-600 px-1 mt-0.5 flex justify-between">
                          <span>
                            Sending as{' '}
                            <strong>
                              {staffProfile?.fullName || currentUser?.email}
                            </strong>
                          </span>
                          <span>Shift+Enter for newline</span>
                        </div>
                      </div>

                      {/* Send Button */}
                      <button
                        id="chat-send-btn"
                        type="submit"
                        disabled={!replyText.trim()}
                        className="px-4 py-2.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 h-[42px]"
                      >
                        <Send className="w-4 h-4" />
                        <span className="hidden sm:inline">Send</span>
                      </button>
                    </div>

                    {/* Case Reference Quick Picker Dropdown */}
                    {showCasePicker && (
                      <div className="mt-2 p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-700">Attach Case Reference:</span>
                          <button
                            type="button"
                            onClick={() => setShowCasePicker(false)}
                            className="text-stone-400 hover:text-stone-700"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto divide-y divide-stone-100">
                          {appDb.girls.slice(0, 12).map((girl) => (
                            <button
                              key={girl.id}
                              type="button"
                              onClick={() => {
                                setSelectedCaseRef({
                                  type: 'girl',
                                  id: girl.id,
                                  title: `${girl.fullName} (${girl.id})`,
                                });
                                setShowCasePicker(false);
                              }}
                              className="w-full text-left p-1.5 hover:bg-white rounded-lg flex items-center justify-between text-stone-700 transition-colors"
                            >
                              <span className="font-medium">
                                {girl.fullName} ({girl.id})
                              </span>
                              <span className="text-[10px] text-stone-400">Girl</span>
                            </button>
                          ))}
                          {appDb.households.map((house) => (
                            <button
                              key={house.id}
                              type="button"
                              onClick={() => {
                                setSelectedCaseRef({
                                  type: 'household',
                                  id: house.id,
                                  title: `${house.name} (${house.id})`,
                                });
                                setShowCasePicker(false);
                              }}
                              className="w-full text-left p-1.5 hover:bg-white rounded-lg flex items-center justify-between text-stone-700 transition-colors"
                            >
                              <span className="font-medium">
                                {house.name} ({house.id})
                              </span>
                              <span className="text-[10px] text-stone-400">Household</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-stone-500">
                  <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-800 flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 stroke-1" />
                  </div>
                  <h3 className="text-sm font-bold text-stone-800 mb-1">
                    Select a Conversation
                  </h3>
                  <p className="text-xs text-stone-500 max-w-sm mb-4">
                    Select a staff member from the left list to view thread history, or start a new private message.
                  </p>
                  <button
                    onClick={() => setIsNewMessageModalOpen(true)}
                    className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Staff Message</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: SYSTEM INBOX & ALERTS              */}
        {/* ========================================== */}
        {activeTab === 'inbox' && (
          <div className="h-full bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col overflow-hidden">
            {/* Inbox Filter Toolbar */}
            <div className="p-3.5 border-b border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-x-auto text-xs">
                {(
                  [
                    { id: 'all', label: 'All Alerts' },
                    { id: 'unread', label: 'Unread' },
                    { id: 'reminder', label: 'Follow-up Reminders' },
                    { id: 'assignment', label: 'Assignments' },
                    { id: 'data_change', label: 'Case Updates' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setInboxFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                      inboxFilter === tab.id
                        ? 'bg-teal-800 text-white shadow-xs'
                        : 'bg-white text-stone-600 hover:bg-stone-200 border border-stone-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => markAllNotificationsRead()}
                  disabled={unreadNotificationsCount === 0}
                  className="px-3 py-1.5 text-xs font-semibold text-teal-800 hover:text-teal-950 disabled:opacity-40 flex items-center gap-1.5 border border-teal-200 rounded-lg bg-teal-50/50 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark All Read</span>
                </button>
                <button
                  onClick={handleRunReminders}
                  disabled={isCheckingReminders}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-700 hover:text-stone-900 border border-stone-300 rounded-lg bg-white flex items-center gap-1.5 transition-colors"
                  title="Scan database for follow-up reminders"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingReminders ? 'animate-spin' : ''}`} />
                  <span>Check Reminders</span>
                </button>
              </div>
            </div>

            {pushStatusMsg && (
              <div
                className={`px-4 py-2 text-xs flex items-center justify-between ${
                  pushStatusMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-100'
                    : 'bg-rose-50 text-rose-800 border-b border-rose-100'
                }`}
              >
                <span>{pushStatusMsg.text}</span>
                <button onClick={() => setPushStatusMsg(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
              {filteredNotifications.length === 0 ? (
                <div className="p-12 text-center text-stone-400 space-y-2">
                  <Bell className="w-10 h-10 mx-auto stroke-1 text-stone-300" />
                  <p className="text-sm font-semibold text-stone-700">No alerts found</p>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    {inboxFilter === 'unread'
                      ? 'You are all caught up! No unread notifications.'
                      : 'Real-time case assignments, follow-up reminders, and updates will be listed here.'}
                  </p>
                </div>
              ) : (
                filteredNotifications.map((notif) => {
                  const isUrgent = notif.priority === 'urgent';
                  return (
                    <div
                      key={notif.id}
                      className={`p-4 transition-colors flex items-start gap-3.5 group ${
                        notif.isRead
                          ? 'bg-white hover:bg-stone-50'
                          : isUrgent
                          ? 'bg-rose-50/60 hover:bg-rose-100/60 border-l-4 border-l-rose-500'
                          : 'bg-amber-50/60 hover:bg-amber-100/60 border-l-4 border-l-amber-500'
                      }`}
                    >
                      {/* Icon */}
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          notif.type === 'followup_reminder'
                            ? isUrgent
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-800'
                            : notif.type === 'assignment'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {notif.type === 'followup_reminder' ? (
                          <Clock className="w-4 h-4" />
                        ) : notif.type === 'assignment' ? (
                          <Sparkles className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3
                            className={`text-xs ${
                              notif.isRead
                                ? 'font-semibold text-stone-800'
                                : 'font-bold text-stone-900'
                            }`}
                          >
                            {notif.title}
                          </h3>
                          <span className="text-[10px] text-stone-400 shrink-0">
                            {formatTime(notif.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                          {notif.message}
                        </p>

                        <div className="flex items-center gap-3 mt-2 text-[11px]">
                          <span className="text-stone-400 font-medium">{notif.source}</span>

                          {/* Deep Link to Related Case */}
                          {notif.relatedRecordType && notif.relatedRecordId && (
                            <button
                              type="button"
                              onClick={() => {
                                markNotificationRead(notif.id);
                                onOpenRecord(notif.relatedRecordType!, notif.relatedRecordId!);
                              }}
                              className="text-teal-700 font-bold hover:text-teal-900 flex items-center gap-1 hover:underline"
                            >
                              <span>Open Record: {notif.relatedRecordTitle || 'View Case'}</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!notif.isRead && (
                          <button
                            type="button"
                            onClick={() => markNotificationRead(notif.id)}
                            className="p-1.5 text-stone-400 hover:text-teal-700 hover:bg-stone-100 rounded-lg transition-colors"
                            title="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteNotification(notif.id)}
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-stone-100 rounded-lg transition-colors"
                          title="Delete notification"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: ANNOUNCEMENTS                       */}
        {/* ========================================== */}
        {activeTab === 'announcements' && (
          <div className="h-full bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-stone-200 bg-stone-50/50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  SHINE Organization Announcements
                </h2>
                <p className="text-xs text-stone-500">
                  Direct executive communications from Leadership and Administration
                </p>
              </div>

              {isAdmin && (
                <button
                  onClick={() => setIsAnnouncementModalOpen(true)}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-teal-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Announcement</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {announcements.length === 0 ? (
                <div className="p-12 text-center text-stone-400 space-y-2">
                  <Megaphone className="w-10 h-10 mx-auto stroke-1 text-stone-300" />
                  <p className="text-sm font-semibold text-stone-700">No active announcements</p>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    Organizational notices and program directives published by administrators will be displayed here.
                  </p>
                </div>
              ) : (
                announcements.map((ann) => {
                  const isRead = ann.readBy?.includes(currentUser?.uid || '');
                  return (
                    <div
                      key={ann.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        ann.priority === 'urgent'
                          ? 'bg-rose-50/60 border-rose-300 shadow-xs'
                          : ann.priority === 'important'
                          ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                          : 'bg-stone-50/70 border-stone-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              ann.priority === 'urgent'
                                ? 'bg-rose-600 text-white'
                                : ann.priority === 'important'
                                ? 'bg-amber-500 text-teal-950'
                                : 'bg-stone-200 text-stone-700'
                            }`}
                          >
                            {ann.priority}
                          </span>
                          <span className="text-[11px] text-stone-500 font-medium">
                            Target: {ann.targetGroup.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-stone-400">
                            {formatTime(ann.createdAt)}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => deleteAnnouncement(ann.id)}
                              className="text-stone-400 hover:text-rose-600 p-1"
                              title="Delete announcement"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-stone-900 mb-2">{ann.title}</h3>
                      <p className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed mb-4">
                        {ann.message}
                      </p>

                      <div className="flex items-center justify-between text-xs pt-3 border-t border-stone-200/60">
                        <span className="text-stone-500 font-medium">
                          Published by: <strong>{ann.createdByName}</strong>
                        </span>

                        {!isRead ? (
                          <button
                            onClick={() => markAnnouncementRead(ann.id)}
                            className="px-3 py-1 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            <span>Acknowledge</span>
                          </button>
                        ) : (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px]">
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>Acknowledged</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: NOTIFICATION SETTINGS              */}
        {/* ========================================== */}
        {activeTab === 'settings' && (
          <div className="h-full bg-white rounded-2xl border border-stone-200 shadow-sm p-6 overflow-y-auto max-w-3xl mx-auto">
            <div className="border-b border-stone-200 pb-4 mb-6">
              <h2 className="text-base font-bold text-stone-900">
                Staff Notification Preferences
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Customize which case alerts, reminders, and messages you receive on this device.
              </p>
            </div>

            {/* Web Push Banner */}
            <div className="mb-6 p-4 rounded-xl bg-teal-50 border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-teal-800 text-amber-400 flex items-center justify-center shrink-0">
                  {preferences.pushEnabled ? (
                    <BellRing className="w-5 h-5" />
                  ) : (
                    <BellOff className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-teal-950">
                    Browser Push Notifications
                  </h3>
                  <p className="text-[11px] text-teal-800 mt-0.5">
                    {preferences.pushEnabled
                      ? 'Push notifications are currently enabled for this browser/device.'
                      : 'Enable browser push notifications to receive instant alerts when away from the tab.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const res = await requestPushPermission();
                  if (res.success) {
                    setPushStatusMsg({ type: 'success', text: 'Push notifications enabled successfully!' });
                  } else {
                    setPushStatusMsg({ type: 'error', text: res.error || 'Permission not granted.' });
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shadow-xs ${
                  preferences.pushEnabled
                    ? 'bg-white text-teal-900 border border-teal-300 hover:bg-teal-100'
                    : 'bg-teal-800 text-white hover:bg-teal-900'
                }`}
              >
                {preferences.pushEnabled ? 'Refresh Permission' : 'Enable Web Push'}
              </button>
            </div>

            {/* Notification Categories */}
            <div className="space-y-4 mb-8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Alert Categories
              </h3>

              {(
                [
                  {
                    key: 'directMessages',
                    label: 'Direct & Group Messages',
                    desc: 'Notify when another staff member sends you a message.',
                  },
                  {
                    key: 'caseAssignments',
                    label: 'Case & Follow-up Assignments',
                    desc: 'Notify when a girl or case task is assigned to you.',
                  },
                  {
                    key: 'followUpReminders',
                    label: 'Follow-up Due & Overdue Reminders',
                    desc: 'Automated reminders for educational, medical, and family follow-ups.',
                  },
                  {
                    key: 'dataChangeNotifications',
                    label: 'Case Data Updates',
                    desc: 'Important changes recorded on cases you manage or are assigned to.',
                  },
                  {
                    key: 'administrativeAnnouncements',
                    label: 'Administrative Announcements',
                    desc: 'Broadcast notifications sent by SHINE leadership and managers.',
                  },
                ] as const
              ).map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-stone-200 bg-stone-50/50"
                >
                  <div className="pr-4">
                    <h4 className="text-xs font-bold text-stone-800">{item.label}</h4>
                    <p className="text-[11px] text-stone-500 mt-0.5">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!preferences[item.key]}
                    onChange={(e) =>
                      updatePreferences({
                        ...preferences,
                        [item.key]: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-teal-800 rounded border-stone-300 focus:ring-teal-700 cursor-pointer"
                  />
                </div>
              ))}
            </div>

            {/* Configurable Reminder Timing (Rule 7) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Follow-Up Reminder Schedule
              </h3>
              <p className="text-xs text-stone-600 mb-2">
                Choose when you want the system to alert you regarding scheduled follow-up dates:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {(
                  [
                    { key: 'sevenDaysBefore', label: '7 Days Before Due Date' },
                    { key: 'threeDaysBefore', label: '3 Days Before Due Date' },
                    { key: 'oneDayBefore', label: '1 Day Before Due Date' },
                    { key: 'onDueDate', label: 'On the Due Date' },
                    { key: 'afterOverdue', label: 'When Overdue' },
                  ] as const
                ).map((timing) => (
                  <label
                    key={timing.key}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer hover:bg-stone-100 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={!!preferences.reminderTiming?.[timing.key]}
                      onChange={(e) =>
                        updatePreferences({
                          ...preferences,
                          reminderTiming: {
                            ...preferences.reminderTiming,
                            [timing.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 text-teal-800 rounded border-stone-300 focus:ring-teal-700"
                    />
                    <span className="font-semibold text-stone-800">{timing.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* MODAL: NEW MESSAGE / CONVERSATION         */}
      {/* ========================================== */}
      {isNewMessageModalOpen && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden">
            <div className="bg-teal-950 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold">New Staff Message</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewMessageModalOpen(false)}
                className="text-teal-200 hover:text-white p-1 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewMessage} className="p-5 space-y-4">
              {/* Type Switcher */}
              <div className="flex gap-2 p-1 bg-stone-100 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setNewMsgType('direct')}
                  className={`flex-1 py-1.5 font-bold rounded-lg transition-all ${
                    newMsgType === 'direct'
                      ? 'bg-white text-teal-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Direct 1-on-1 Message
                </button>
                <button
                  type="button"
                  onClick={() => setNewMsgType('group')}
                  className={`flex-1 py-1.5 font-bold rounded-lg transition-all ${
                    newMsgType === 'group'
                      ? 'bg-white text-teal-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Group Discussion
                </button>
              </div>

              {/* Direct Recipient Selector */}
              {newMsgType === 'direct' ? (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Select Staff Member:
                  </label>
                  <select
                    id="new-msg-recipient-select"
                    value={selectedRecipientUid}
                    onChange={(e) => setSelectedRecipientUid(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="">-- Choose Staff Recipient --</option>
                    {activeStaffList.map((staff) => (
                      <option key={staff.uid} value={staff.uid}>
                        {staff.fullName} ({staff.role} - {staff.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                /* Group Chat Members Selector */
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Group Title:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Case Review Committee, Health Team"
                      value={groupTitle}
                      onChange={(e) => setGroupTitle(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-stone-700">
                        Select Participants:
                      </label>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedGroupMemberUids(activeStaffList.map((s) => s.uid))
                          }
                          className="text-[11px] text-teal-700 font-semibold hover:underline"
                        >
                          Select All Active Staff
                        </button>
                      )}
                    </div>

                    <div className="max-h-36 overflow-y-auto border border-stone-200 rounded-xl p-2 bg-stone-50 space-y-1">
                      {activeStaffList.map((staff) => {
                        const isChecked = selectedGroupMemberUids.includes(staff.uid);
                        return (
                          <label
                            key={staff.uid}
                            className="flex items-center gap-2 p-1.5 hover:bg-white rounded-lg cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedGroupMemberUids([...selectedGroupMemberUids, staff.uid]);
                                } else {
                                  setSelectedGroupMemberUids(
                                    selectedGroupMemberUids.filter((id) => id !== staff.uid)
                                  );
                                }
                              }}
                              className="w-4 h-4 text-teal-800 rounded border-stone-300 focus:ring-teal-700"
                            />
                            <span className="font-semibold text-stone-800">
                              {staff.fullName}
                            </span>
                            <span className="text-stone-400 text-[11px]">({staff.role})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Case Attachment Option */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Attach Case Record (Optional):
                </label>
                <select
                  value={newMsgCaseRef?.id || ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      setNewMsgCaseRef(null);
                      return;
                    }
                    const girl = appDb.girls.find((g) => g.id === id);
                    if (girl) {
                      setNewMsgCaseRef({
                        type: 'girl',
                        id: girl.id,
                        title: `${girl.fullName} (${girl.id})`,
                      });
                    } else {
                      const house = appDb.households.find((h) => h.id === id);
                      if (house) {
                        setNewMsgCaseRef({
                          type: 'household',
                          id: house.id,
                          title: `${house.name} (${house.id})`,
                        });
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  <option value="">-- No Case Attachment --</option>
                  <optgroup label="SHINE Girls">
                    {appDb.girls.map((girl) => (
                      <option key={girl.id} value={girl.id}>
                        {girl.fullName} ({girl.id})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Households">
                    {appDb.households.map((house) => (
                      <option key={house.id} value={house.id}>
                        {house.name} ({house.id})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Initial Message */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Message:
                </label>
                <textarea
                  id="new-msg-text"
                  rows={3}
                  placeholder="Write your message here..."
                  value={newMsgContent}
                  onChange={(e) => setNewMsgContent(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700 resize-none"
                />
              </div>

              {/* Security Banner: Anti-Impersonation Notice */}
              <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-[11px] text-stone-600 flex items-center gap-2">
                <Shield className="w-4 h-4 text-teal-800 shrink-0" />
                <span>
                  Authenticated as <strong>{staffProfile?.fullName}</strong>. Sender identity is verified server-side.
                </span>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsNewMessageModalOpen(false)}
                  className="px-4 py-2 border border-stone-300 text-stone-700 rounded-xl text-xs font-semibold hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    !newMsgContent.trim() ||
                    (newMsgType === 'direct' && !selectedRecipientUid) ||
                    (newMsgType === 'group' && selectedGroupMemberUids.length === 0)
                  }
                  className="px-5 py-2 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Message</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: BROADCAST ANNOUNCEMENT (Admin Only) */}
      {/* ========================================== */}
      {isAnnouncementModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden">
            <div className="bg-amber-500 text-teal-950 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5" />
                <h3 className="text-sm font-black">Broadcast Staff Announcement</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAnnouncementModalOpen(false)}
                className="text-teal-950 hover:bg-amber-600/30 p-1 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePostAnnouncement} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Announcement Headline:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mandatory Staff Training or Program Update"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Target Group:
                  </label>
                  <select
                    value={annTargetGroup}
                    onChange={(e) => setAnnTargetGroup(e.target.value as any)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="all">All SHINE Staff</option>
                    <option value="managers">Managers Only</option>
                    <option value="staff">Case Workers / Staff Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Priority:
                  </label>
                  <select
                    value={annPriority}
                    onChange={(e) => setAnnPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Announcement Body:
                </label>
                <textarea
                  rows={4}
                  placeholder="Provide detailed instructions, dates, requirements, or operational changes..."
                  value={annMessage}
                  onChange={(e) => setAnnMessage(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700 resize-none"
                />
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  This broadcast will appear in the announcements tab and send in-app alerts to all target staff.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsAnnouncementModalOpen(false)}
                  className="px-4 py-2 border border-stone-300 text-stone-700 rounded-xl text-xs font-semibold hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!annTitle.trim() || !annMessage.trim()}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-teal-950 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>Publish Announcement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
