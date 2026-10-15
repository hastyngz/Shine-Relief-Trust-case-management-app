import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Home,
  FileSpreadsheet,
  Sparkles,
  UserCheck,
  Bot,
  BadgeDollarSign,
  MessageSquare,
  CalendarRange,
  UploadCloud,
  ClipboardList,
  BarChart3,
  BrainCircuit,
  UserRound,
  Sprout,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMessaging } from '../contexts/MessagingContext';
import { useVisualSettings } from '../contexts/VisualSettingsContext';

export type NavTab =
  | 'dashboard'
  | 'girls'
  | 'houses'
  | 'activities'
  | 'programmes'
  | 'contacts'
  | 'messages'
  | 'planning'
  | 'import'
  | 'management'
  | 'reports'
  | 'payroll'
  | 'ai-assistant'
  | 'staff'
  | 'case-management'
  | 'operations';

interface NavigationProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  girlsCount: number;
  housesCount: number;
  pendingReviewCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  girlsCount,
  housesCount,
  pendingReviewCount,
}) => {
  const { isAdmin, role, allStaff } = useAuth();
  const { totalUnreadCount, unreadMessagesCount } = useMessaging();
  const { mobileViewMode } = useVisualSettings();
  const canViewManagement = isAdmin || role === 'Manager';

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    adminOnly?: boolean;
    isAi?: boolean;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'girls', label: 'SHINE Girls', icon: Users, count: girlsCount },
    { id: 'houses', label: 'Households', icon: Home, count: housesCount },
    { id: 'activities', label: 'Group Activities', icon: Sparkles },
    { id: 'programmes', label: 'Programmes', icon: Sprout },
    { id: 'contacts', label: 'Contacts', icon: UserRound },
    { id: 'case-management', label: 'Case Management', icon: ClipboardList },
    { id: 'operations', label: 'Operations', icon: BrainCircuit, count: pendingReviewCount > 0 ? pendingReviewCount : undefined },
    {
      id: 'messages',
      label: 'Messages',
      icon: MessageSquare,
      count: totalUnreadCount > 0 ? totalUnreadCount : undefined,
    },
    { id: 'planning', label: 'Budgets & Workplans', icon: CalendarRange },
    ...(canViewManagement ? [{ id: 'management' as NavTab, label: 'Management', icon: BarChart3 }] : []),
    { id: 'import', label: 'Document Ingestion', icon: UploadCloud },
    { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet },
    { id: 'payroll', label: 'Payroll', icon: BadgeDollarSign },
    { id: 'ai-assistant', label: 'SHINE AI Assistant', icon: Bot, isAi: true },
    ...(isAdmin
      ? [
          {
            id: 'staff' as NavTab,
            label: 'Staff Management',
            icon: UserCheck,
            count: allStaff.length,
            adminOnly: true,
          },
        ]
      : []),
  ];
  const mobileNavItems = navItems.filter((item) => item.id !== 'staff' && item.id !== 'messages');

  // Sunrise view: four main tabs plus a "More" sheet for everything else.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeMoreRef = useRef<HTMLButtonElement>(null);
  const sunriseMainIds: NavTab[] = ['dashboard', 'girls', 'houses', 'messages'];
  const sunriseMainLabels: Partial<Record<NavTab, string>> = {
    dashboard: 'Home',
    girls: 'Girls',
    houses: 'Houses',
    messages: 'Messages',
  };
  const sunriseMain = navItems.filter((item) => sunriseMainIds.includes(item.id));
  const sunriseMore = navItems.filter((item) => !sunriseMainIds.includes(item.id));
  const sunriseActiveIndex = sunriseMain.findIndex((item) => item.id === activeTab);
  const sunrisePillIndex = sunriseActiveIndex === -1 ? sunriseMain.length : sunriseActiveIndex;

  useEffect(() => {
    if (mobileViewMode !== 'sunrise') setMoreOpen(false);
  }, [mobileViewMode]);

  useEffect(() => {
    if (!moreOpen) return;
    closeMoreRef.current?.focus();
  }, [moreOpen]);

  const closeMore = () => {
    setMoreOpen(false);
    moreButtonRef.current?.focus();
  };

  const handleSheetKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeMore();
      return;
    }
    if (event.key !== 'Tab' || !sheetRef.current) return;
    const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {/* Desktop & Tablet Navigation */}
      <nav id="desktop-nav" aria-label="Primary navigation" className="hidden md:block bg-stone-100 border-b border-stone-200 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => onSelectTab(item.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-800 text-white shadow-xs'
                      : 'text-stone-700 hover:text-teal-900 hover:bg-stone-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-teal-900 text-amber-300' : 'bg-stone-300 text-stone-700'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                  {item.adminOnly && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1 bg-amber-400 text-teal-950 rounded-xs">
                      Admin
                    </span>
                  )}
                  {item.isAi && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 bg-amber-400 text-teal-950 rounded-full">
                      AI
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Sunrise view: 4 main tabs + More */}
      {mobileViewMode === 'sunrise' && (
        <>
          <nav
            id="mobile-bottom-nav"
            aria-label="Main"
            className="mobile-bottom-nav--sunrise md:hidden fixed bottom-0 left-0 right-0 z-40"
          >
            <span
              className="sunrise-nav-pill"
              aria-hidden="true"
              style={{ transform: `translateX(${sunrisePillIndex * 100}%)` }}
            />
            <div className="sunrise-nav-grid">
              {sunriseMain.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`mobile-nav-tab-${item.id}`}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onSelectTab(item.id)}
                    className={`sunrise-nav-item fx-press${isActive ? ' is-active' : ''}`}
                  >
                    <span className="sunrise-nav-icon">
                      <Icon className="h-6 w-6" />
                      {item.count !== undefined && item.count > 0 && item.id === 'messages' && (
                        <span className="sunrise-nav-badge">{item.count > 99 ? '99+' : item.count}</span>
                      )}
                    </span>
                    <span>{sunriseMainLabels[item.id] ?? item.label}</span>
                  </button>
                );
              })}
              <button
                ref={moreButtonRef}
                id="mobile-nav-more"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                aria-current={sunriseActiveIndex === -1 ? 'page' : undefined}
                onClick={() => setMoreOpen(true)}
                className={`sunrise-nav-item fx-press${sunriseActiveIndex === -1 ? ' is-active' : ''}`}
              >
                <span className="sunrise-nav-icon">
                  <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
                </span>
                <span>More</span>
              </button>
            </div>
          </nav>
          {moreOpen && (
            <div className="sunrise-sheet-layer md:hidden">
              <div className="sunrise-backdrop fx-backdrop-enter" onClick={closeMore} aria-hidden="true" />
              <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="More sections"
                onKeyDown={handleSheetKeyDown}
                className="sunrise-sheet fx-sheet-enter"
              >
                <div className="sunrise-sheet-handle" aria-hidden="true" />
                <div className="sunrise-sheet-head">
                  <h2>More</h2>
                  <button ref={closeMoreRef} type="button" aria-label="Close" onClick={closeMore} className="fx-press">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="sunrise-sheet-grid">
                  {sunriseMore.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => {
                          setMoreOpen(false);
                          onSelectTab(item.id);
                        }}
                        className={`sunrise-sheet-item fx-press${isActive ? ' is-active' : ''}`}
                      >
                        <Icon className="h-6 w-6" />
                        <span>{item.label}</span>
                        {item.count !== undefined && item.count > 0 && <span className="sunrise-sheet-count">{item.count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mobile Bottom Navigation Bar */}
      {mobileViewMode !== 'sunrise' && (
      <nav
        id="mobile-bottom-nav"
        className={`mobile-bottom-nav--${mobileViewMode} md:hidden fixed bottom-0 left-0 right-0 z-40 px-2 pt-2 shadow-lg`}
      >
        <div className={`mobile-bottom-nav-inner mobile-bottom-nav-inner--${mobileViewMode} flex items-center justify-between gap-1 max-w-xl mx-auto`}>
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`mobile-nav-tab-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`mobile-nav-button flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors relative ${
                  mobileViewMode === 'ios'
                    ? `flex-1 ${isActive ? 'text-white font-bold' : 'text-slate-400 hover:text-white'}`
                    : `min-w-[54px] shrink-0 px-2.5 ${isActive ? 'text-teal-900 font-bold' : 'text-stone-500 hover:text-stone-800'}`
                }`}
              >
                <div className={`relative ${mobileViewMode === 'ios' && isActive ? 'text-teal-300' : ''}`}>
                  <Icon className={mobileViewMode === 'ios' ? 'w-5 h-5' : `w-4.5 h-4.5 ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
                  {item.isAi && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
                  )}
                  {item.count !== undefined && item.count > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-0.5 bg-amber-400 text-teal-950 font-black text-[9px] rounded-full flex items-center justify-center">
                      {item.count > 99 ? '99+' : item.count}
                    </span>
                  )}
                </div>
                <span className={`leading-tight tracking-tight truncate ${mobileViewMode === 'ios' ? 'text-[9px] max-w-full' : 'text-[8.5px] mt-0.5 max-w-[62px]'}`}>
                  {item.id === 'girls'
                    ? 'Girls'
                    : item.id === 'houses'
                    ? 'Houses'
                    : item.id === 'activities'
                    ? 'Activities'
                    : item.id === 'case-management' && mobileViewMode === 'ios'
                    ? 'Cases'
                    : item.label === 'Reports & Export'
                    ? 'Reports'
                    : item.label === 'SHINE AI Assistant'
                    ? 'SHINE AI'
                    : item.label === 'Staff Management'
                    ? 'Staff'
                    : item.label === 'Messages'
                    ? 'Messages'
                    : item.label === 'Budgets & Workplans'
                    ? 'Planning'
                    : item.label === 'Document Ingestion'
                    ? 'Import'
                    : item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      )}
    </>
  );
};
