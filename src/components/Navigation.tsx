import React from 'react';
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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMessaging } from '../contexts/MessagingContext';
import { useVisualSettings } from '../contexts/VisualSettingsContext';

export type NavTab =
  | 'dashboard'
  | 'girls'
  | 'houses'
  | 'activities'
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

  return (
    <>
      {/* Desktop & Tablet Top Navigation Bar */}
      <nav id="desktop-nav" className="hidden md:block bg-stone-100 border-b border-stone-200 overflow-x-auto">
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

      {/* Mobile Bottom Navigation Bar */}
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
    </>
  );
};
