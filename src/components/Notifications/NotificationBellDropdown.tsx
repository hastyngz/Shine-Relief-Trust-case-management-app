import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  Clock,
  Sparkles,
  Megaphone,
  Trash2,
  Settings,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { useMessaging } from '../../contexts/MessagingContext';
import { StaffNotification } from '../../types';

interface NotificationBellDropdownProps {
  onOpenInbox: () => void;
  onOpenRecord: (type: string, id: string) => void;
  onOpenSettings: () => void;
}

export const NotificationBellDropdown: React.FC<NotificationBellDropdownProps> = ({
  onOpenInbox,
  onOpenRecord,
  onOpenSettings,
}) => {
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
  } = useMessaging();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'messages' | 'reminders'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filtered notifications
  const filteredNotifications = notifications.filter((notif) => {
    if (filter === 'unread') return !notif.isRead;
    if (filter === 'messages') return notif.type === 'direct_message';
    if (filter === 'reminders') return notif.type === 'followup_reminder';
    return true;
  });

  const getNotificationIcon = (type: StaffNotification['type'], priority: string) => {
    switch (type) {
      case 'direct_message':
        return <MessageSquare className="w-4 h-4 text-teal-600" />;
      case 'announcement':
        return <Megaphone className="w-4 h-4 text-amber-600" />;
      case 'followup_reminder':
        return <Clock className={`w-4 h-4 ${priority === 'urgent' ? 'text-rose-600' : 'text-amber-600'}`} />;
      case 'assignment':
        return <Sparkles className="w-4 h-4 text-emerald-600" />;
      case 'data_change':
        return <AlertCircle className="w-4 h-4 text-sky-600" />;
      default:
        return <Bell className="w-4 h-4 text-stone-600" />;
    }
  };

  const handleNotificationClick = async (notif: StaffNotification) => {
    if (!notif.isRead) {
      await markNotificationRead(notif.id);
    }
    if (notif.relatedRecordType && notif.relatedRecordId) {
      setIsOpen(false);
      onOpenRecord(notif.relatedRecordType, notif.relatedRecordId);
    } else if (notif.type === 'direct_message' || notif.conversationId) {
      setIsOpen(false);
      onOpenInbox();
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        id="notification-bell-btn"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 sm:px-3 sm:py-1.5 rounded-lg bg-teal-900/80 hover:bg-teal-800 text-teal-100 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-teal-800 transition-colors"
        title="Notifications & Alerts"
        aria-label="Staff Notifications"
      >
        <Bell className="w-4 h-4 text-amber-400" />
        <span className="hidden md:inline">Alerts</span>

        {unreadNotificationsCount > 0 && (
          <span
            id="notification-unread-badge"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-amber-400 text-teal-950 font-black text-[10px] rounded-full flex items-center justify-center shadow-md animate-pulse"
          >
            {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          id="notification-dropdown-panel"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-stone-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="bg-teal-950 text-white p-3.5 border-b border-teal-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Notifications
              </h3>
              {unreadNotificationsCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-teal-950">
                  {unreadNotificationsCount} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadNotificationsCount > 0 && (
                <button
                  onClick={() => markAllNotificationsRead()}
                  className="text-[11px] text-teal-200 hover:text-white flex items-center gap-1 px-2 py-1 rounded-md hover:bg-teal-900 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mark read</span>
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="p-1 text-teal-300 hover:text-white hover:bg-teal-900 rounded-md transition-colors"
                title="Notification Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="p-2 bg-stone-50 border-b border-stone-200 flex gap-1 overflow-x-auto text-[11px]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'unread', label: 'Unread' },
                { id: 'messages', label: 'Messages' },
                { id: 'reminders', label: 'Reminders' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-full font-semibold transition-all whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-teal-800 text-white shadow-xs'
                    : 'bg-white text-stone-600 hover:bg-stone-200 border border-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-stone-100">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-stone-500 space-y-1">
                <Bell className="w-8 h-8 text-stone-300 mx-auto stroke-1" />
                <p className="text-xs font-semibold text-stone-700">No notifications found</p>
                <p className="text-[11px] text-stone-600">
                  {filter === 'unread'
                    ? 'All current notifications are marked as read.'
                    : 'System notifications and case reminders will appear here.'}
                </p>
              </div>
            ) : (
              filteredNotifications.slice(0, 15).map((notif) => {
                const isUrgent = notif.priority === 'urgent';
                return (
                  <div
                    key={notif.id}
                    id={`notif-item-${notif.id}`}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3 transition-colors cursor-pointer flex gap-3 items-start group ${
                      notif.isRead
                        ? 'bg-white hover:bg-stone-50'
                        : isUrgent
                        ? 'bg-rose-50/70 hover:bg-rose-100/70 border-l-4 border-l-rose-500'
                        : 'bg-amber-50/60 hover:bg-amber-100/60 border-l-4 border-l-amber-500'
                    }`}
                  >
                    {/* Category Icon */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        notif.isRead
                          ? 'bg-stone-100 text-stone-600'
                          : isUrgent
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {getNotificationIcon(notif.type, notif.priority)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4
                          className={`text-xs truncate ${
                            notif.isRead ? 'font-semibold text-stone-800' : 'font-bold text-stone-900'
                          }`}
                        >
                          {notif.title}
                        </h4>
                        <span className="text-[10px] text-stone-600 shrink-0 font-medium">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 line-clamp-2 mt-0.5 leading-snug">
                        {notif.message}
                      </p>

                      {/* Source tag & Deep-link Indicator */}
                      <div className="flex items-center justify-between mt-1 text-[10px]">
                        <span className="text-stone-600 font-medium">{notif.source}</span>
                        {notif.relatedRecordType && notif.relatedRecordTitle && (
                          <span className="text-teal-700 font-semibold flex items-center gap-0.5 group-hover:underline">
                            <span>{notif.relatedRecordTitle}</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dismiss Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      className="text-stone-400 hover:text-rose-600 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Dismiss notification"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-stone-100 border-t border-stone-200 flex items-center justify-between text-xs">
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenInbox();
              }}
              className="text-teal-800 font-bold hover:text-teal-950 flex items-center gap-1 transition-colors text-[11px]"
            >
              <span>Open Staff Messages & Inbox</span>
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenSettings();
              }}
              className="text-stone-500 hover:text-stone-800 text-[11px] font-medium"
            >
              Preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
