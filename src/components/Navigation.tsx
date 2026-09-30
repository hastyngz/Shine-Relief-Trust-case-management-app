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
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  girlsCount,
  housesCount,
}) => {
  const { isAdmin, role, allStaff } = useAuth();
  const { totalUnreadCount, unreadMessagesCount } = useMessaging();
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
    { id: 'operations', label: 'Operations & Intelligence', icon: BrainCircuit },
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
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-40 px-2 py-1 shadow-lg overflow-x-auto flex gap-1 justify-start"
      >
        <div className="flex items-center gap-1 min-w-max mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`mobile-nav-tab-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-lg transition-colors relative min-w-[54px] ${
                  isActive ? 'text-teal-900 font-bold' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <div className={`p-1 rounded-lg relative ${isActive ? 'bg-teal-100 text-teal-900' : ''}`}>
                  <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
                  {item.isAi && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
                  )}
                  {item.count !== undefined && item.count > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-0.5 bg-amber-400 text-teal-950 font-black text-[9px] rounded-full flex items-center justify-center">
                      {item.count > 99 ? '99+' : item.count}
                    </span>
                  )}
                </div>
                <span className="text-[8.5px] leading-tight mt-0.5 tracking-tight truncate max-w-[62px]">
                  {item.label === 'SHINE Girls'
                    ? 'Girls'
                    : item.label === 'Households'
                    ? 'Houses'
                    : item.label === 'Reports & Export'
                    ? 'Reports'
                    : item.label === 'SHINE AI Assistant'
                    ? 'SHINE AI'
                    : item.label === 'Staff Management'
                    ? 'Staff'
                    : item.label === 'Group Activities'
                    ? 'Activities'
                    : item.label === 'Messages'
                    ? 'Messages'
                    : item.label === 'Contacts'
                    ? 'Contacts'
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
