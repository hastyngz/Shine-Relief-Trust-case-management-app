import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  PlusCircle,
  Database,
  CloudOff,
  RefreshCw,
  LogOut,
  KeyRound,
  ShieldCheck,
  Shield,
  Briefcase,
  Eye,
  User,
  ChevronDown,
  UserCheck,
  MessageSquare,
  Palette,
  Check,
  Smartphone,
  Waves,
} from 'lucide-react';
import { SyncStatus } from '../services/firestoreSync';
import { useAuth } from '../contexts/AuthContext';
import { themes, useVisualSettings } from '../contexts/VisualSettingsContext';
import { StaffRole } from '../types';
import { NotificationBellDropdown } from './Notifications/NotificationBellDropdown';

interface HeaderProps {
  onOpenQuickAdd: () => void;
  onOpenSearch: () => void;
  onOpenDataModal: () => void;
  onNavigateStaff?: () => void;
  onOpenInbox?: () => void;
  onOpenRecord?: (type: string, id: string) => void;
  onOpenNotificationSettings?: () => void;
  syncStatus?: SyncStatus;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenQuickAdd,
  onOpenSearch,
  onOpenDataModal,
  onNavigateStaff,
  onOpenInbox,
  onOpenRecord,
  onOpenNotificationSettings,
  syncStatus = 'synced',
}) => {
  const { staffProfile, currentUser, role, isAdmin, isViewOnly, logout, sendResetPassword } = useAuth();
  const { mobileView, setMobileView, theme, setTheme, animatedGlass, setAnimatedGlass } = useVisualSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [visualSettingsOpen, setVisualSettingsOpen] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visualSettingsRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (visualSettingsRef.current && !visualSettingsRef.current.contains(e.target as Node)) {
        setVisualSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePasswordReset = async () => {
    if (!currentUser?.email) return;
    try {
      await sendResetPassword(currentUser.email);
      setResetMessage('Reset instructions sent to your email!');
      setTimeout(() => setResetMessage(null), 4000);
    } catch (err: any) {
      setResetMessage('Could not send reset email.');
      setTimeout(() => setResetMessage(null), 4000);
    }
  };

  const renderRoleIcon = (userRole?: StaffRole | null) => {
    switch (userRole) {
      case 'Administrator':
        return <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />;
      case 'Manager':
        return <Shield className="w-3.5 h-3.5 text-sky-400" />;
      case 'Staff':
        return <Briefcase className="w-3.5 h-3.5 text-emerald-400" />;
      case 'View Only':
        return <Eye className="w-3.5 h-3.5 text-stone-400" />;
      default:
        return <User className="w-3.5 h-3.5 text-stone-400" />;
    }
  };

  const displayName = staffProfile?.fullName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Staff';

  return (
    <header id="app-header" className="bg-teal-950 text-white border-b border-teal-900 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white p-1 shadow-sm flex items-center justify-center shrink-0 border border-teal-800/80 overflow-hidden">
              <img
                src="/shine-logo.png"
                alt="SHINE Relief Trust Logo"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-tight text-white text-lg sm:text-xl">
                  SHINE <span className="text-amber-400 font-bold">Relief Trust</span>
                </span>
                <span className="hidden sm:inline-block text-[11px] font-semibold uppercase tracking-wider bg-teal-800 text-amber-300 px-2 py-0.5 rounded-full">
                  Malawi
                </span>
              </div>
              <p className="text-[11px] text-teal-200 hidden sm:block font-medium">
                Case Management & Household Monitoring System
              </p>
            </div>
          </div>

          {/* Quick Action Controls, Cloud Status & User Session */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Firestore Cloud Status Indicator */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                syncStatus === 'synced' || syncStatus === 'connected'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                  : syncStatus === 'saving'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                  : syncStatus === 'connecting'
                  ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
                  : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
              }`}
              title="Firebase Firestore Cloud Persistence Status"
            >
              {syncStatus === 'synced' || syncStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Cloud Synced</span>
                </>
              ) : syncStatus === 'saving' ? (
                <>
                  <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : syncStatus === 'connecting' ? (
                <>
                  <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3 h-3 text-rose-400" />
                  <span>Offline / Queued</span>
                </>
              )}
            </div>

            <button
              id="search-btn"
              onClick={onOpenSearch}
              className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-teal-900/80 hover:bg-teal-800 text-teal-100 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-teal-800 transition-colors"
              title="Search girls, houses, schools..."
            >
              <Search className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline">Search</span>
            </button>

            {/* Notification Bell Dropdown with Live Badge */}
            {onOpenInbox && (
              <NotificationBellDropdown
                onOpenInbox={onOpenInbox}
                onOpenRecord={onOpenRecord || (() => {})}
                onOpenSettings={onOpenNotificationSettings || onOpenInbox}
              />
            )}

            <button
              id="data-backup-btn"
              onClick={onOpenDataModal}
              className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-teal-900/80 hover:bg-teal-800 text-teal-100 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-teal-800 transition-colors"
              title="Backup, export, or restore database"
            >
              <Database className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline">Cloud & Data</span>
            </button>

            {!isViewOnly && (
              <button
                id="quick-add-btn"
                onClick={onOpenQuickAdd}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-teal-950 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Record New</span>
              </button>
            )}

            <div className="relative" ref={visualSettingsRef}>
              <button
                type="button"
                onClick={() => setVisualSettingsOpen((open) => !open)}
                aria-label="Open visual settings"
                aria-expanded={visualSettingsOpen}
                aria-controls="visual-settings-panel"
                title="App theme and mobile view"
                className="p-2 rounded-lg bg-teal-900/80 hover:bg-teal-800 text-white border border-teal-800 transition-colors"
              >
                <Palette className="w-4 h-4 text-amber-300" />
              </button>
              {visualSettingsOpen && (
                <section
                  id="visual-settings-panel"
                  aria-label="App theme and mobile view"
                  className="absolute right-0 top-full mt-2 w-[min(19rem,calc(100vw-1rem))] max-h-[min(75vh,36rem)] overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 text-stone-900 shadow-xl z-50"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-stone-500" />
                      <span className="text-sm font-semibold">Mobile view</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Mobile view"
                      aria-checked={mobileView}
                      onClick={() => setMobileView(!mobileView)}
                      data-enabled={mobileView}
                      className="visual-switch"
                    >
                      <span />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-stone-100 py-3">
                    <div className="flex items-center gap-2">
                      <Waves className="w-4 h-4 text-stone-500" />
                      <span className="text-sm font-semibold">Animated glass</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Animated glass"
                      aria-checked={animatedGlass}
                      onClick={() => setAnimatedGlass(!animatedGlass)}
                      data-enabled={animatedGlass}
                      className="visual-switch"
                    >
                      <span />
                    </button>
                  </div>
                  <h2 className="px-1 pb-2 pt-3 text-xs font-bold uppercase text-stone-500">App theme</h2>
                  <div className="space-y-1">
                    {themes.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setTheme(option.id)}
                        aria-pressed={theme === option.id}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                          theme === option.id ? 'bg-stone-100 font-bold ring-1 ring-stone-300' : 'hover:bg-stone-50'
                        }`}
                      >
                        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                          <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: option.primary }} />
                          <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: option.accent }} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.name}</span>
                        {theme === option.id && <Check className="h-4 w-4 shrink-0 text-stone-800" aria-label="Active theme" />}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* User Profile & Session Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl bg-teal-900/80 hover:bg-teal-800 border border-teal-800 text-left transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-400 text-teal-950 font-black flex items-center justify-center text-xs shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-bold text-white leading-tight truncate max-w-[120px]">
                    {displayName}
                  </div>
                  <div className="text-[10px] text-amber-300 font-medium flex items-center gap-1">
                    {renderRoleIcon(role)}
                    <span>{role || 'Staff'}</span>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-teal-300" />
              </button>

              {/* Dropdown Menu */}
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-stone-200 py-2 z-50 text-stone-900 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2.5 border-b border-stone-100">
                    <p className="text-xs font-bold text-stone-900 truncate">{displayName}</p>
                    <p className="text-[11px] text-stone-500 truncate">{currentUser?.email}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 text-teal-950 border border-teal-200">
                        {role || 'Staff'}
                      </span>
                      {staffProfile?.departmentOrTitle && (
                        <span className="text-[10px] text-stone-500 truncate">
                          • {staffProfile.departmentOrTitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {resetMessage && (
                    <div className="px-4 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50">
                      {resetMessage}
                    </div>
                  )}

                  <div className="py-1">
                    {onOpenInbox && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenInbox();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-teal-950 hover:bg-stone-50 flex items-center gap-2"
                      >
                        <MessageSquare className="w-4 h-4 text-teal-700" />
                        Staff Messages & Inbox
                      </button>
                    )}

                    {isAdmin && onNavigateStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onNavigateStaff();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-teal-950 hover:bg-stone-50 flex items-center gap-2"
                      >
                        <UserCheck className="w-4 h-4 text-amber-600" />
                        Staff Management
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      className="w-full px-4 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center gap-2"
                    >
                      <KeyRound className="w-4 h-4 text-stone-400" />
                      Reset My Password
                    </button>
                  </div>

                  <div className="pt-1 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-bold text-rose-700 hover:bg-rose-50 flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
