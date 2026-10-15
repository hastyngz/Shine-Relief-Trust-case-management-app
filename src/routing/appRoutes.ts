import { NavTab } from '../components/Navigation';
import { LEGACY_PROGRAMMES, PROGRAMMES, ProgrammeId } from '../data/programmes';

/**
 * Hash-based routing for the app. Kept separate from App.tsx so the route
 * parsing/building logic can be reasoned about (and tested) on its own.
 */

export type AppView =
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
  | 'report-builder'
  | 'payroll'
  | 'contracts'
  | 'staff'
  | 'ai-assistant'
  | 'case-management'
  | 'operations'
  | 'administration'
  | 'documents'
  | 'inventory'
  | 'assets'
  | 'girl-profile'
  | 'house-profile'
  | 'form-girl'
  | 'form-house'
  | 'form-edu'
  | 'form-health'
  | 'form-family'
  | 'form-rent'
  | 'form-expense'
  | 'form-activity';

export interface AppRoute {
  view: AppView;
  activeTab: NavTab;
  girlId?: string;
  houseId?: string;
  programmeId?: ProgrammeId | null;
  qualityTarget?: { kind: 'budget-item' | 'workplan-item'; id: string };
}

export function parseHash(): AppRoute {
  const [hash, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  if (!hash) return { view: 'dashboard', activeTab: 'dashboard' };
  if (hash === 'planning') {
    const params = new URLSearchParams(query);
    const kind = params.get('qualityKind');
    const id = params.get('qualityId');
    const qualityTarget: { kind: 'budget-item' | 'workplan-item'; id: string } | undefined =
      id && (kind === 'budget-item' || kind === 'workplan-item')
        ? { kind, id }
      : undefined;
    return { view: 'planning', activeTab: 'planning', qualityTarget };
  }

  if (hash === 'programmes' || hash.startsWith('programmes/')) {
    const routeId = hash.slice('programmes/'.length);
    const programmeId = routeId && [...PROGRAMMES, ...LEGACY_PROGRAMMES].some((programme) => programme.id === routeId)
      ? routeId as ProgrammeId
      : null;
    return { view: 'programmes', activeTab: 'programmes', programmeId };
  }

  if (hash.startsWith('girl/')) {
    const girlId = hash.slice(5);
    return { view: 'girl-profile', activeTab: 'girls', girlId };
  }
  if (hash.startsWith('house/')) {
    const houseId = hash.slice(6);
    return { view: 'house-profile', activeTab: 'houses', houseId };
  }
  if (hash === 'girls') return { view: 'girls', activeTab: 'girls' };
  if (hash === 'houses') return { view: 'houses', activeTab: 'houses' };
  if (hash === 'activities') return { view: 'activities', activeTab: 'activities' };
  if (hash === 'contacts') return { view: 'contacts', activeTab: 'contacts' };
  if (hash === 'case-management') return { view: 'case-management', activeTab: 'case-management' };
  if (hash === 'operations' || hash === 'intelligence' || hash === 'calendar') return { view: 'operations', activeTab: 'operations' };
  if (hash === 'administration' || hash === 'admin-operations') return { view: 'administration', activeTab: 'administration' };
  if (hash === 'documents' || hash === 'document-index') return { view: 'documents', activeTab: 'administration' };
  if (hash === 'inventory' || hash === 'inventory-stores') return { view: 'inventory', activeTab: 'administration' };
  if (hash === 'assets' || hash === 'asset-register') return { view: 'assets', activeTab: 'administration' };
  if (hash === 'messages' || hash === 'inbox') return { view: 'messages', activeTab: 'messages' };
  if (hash === 'planning' || hash === 'budgets' || hash === 'workplans') return { view: 'planning', activeTab: 'planning' };
  if (hash === 'management' || hash === 'executive-overview') return { view: 'management', activeTab: 'management' };
  if (hash === 'import' || hash === 'ingestion') return { view: 'import', activeTab: 'import' };
  if (hash === 'reports') return { view: 'reports', activeTab: 'reports' };
  if (hash === 'report-builder') return { view: 'report-builder', activeTab: 'reports' };
  if (hash === 'payroll') return { view: 'payroll', activeTab: 'payroll' };
  if (hash === 'contracts') return { view: 'contracts', activeTab: 'payroll' };
  if (hash === 'staff' || hash === 'staff-management') return { view: 'staff', activeTab: 'staff' };
  if (hash === 'ai-assistant' || hash === 'ai') return { view: 'ai-assistant', activeTab: 'ai-assistant' };
  if (hash === 'register-girl') return { view: 'form-girl', activeTab: 'girls' };
  if (hash === 'add-house') return { view: 'form-house', activeTab: 'houses' };

  return { view: 'dashboard', activeTab: 'dashboard' };
}

export function buildHash(newView: AppView, girlId?: string | null, houseId?: string | null, programmeId?: ProgrammeId | null): string {
  switch (newView) {
    case 'dashboard':
      return '#/';
    case 'girls':
      return '#/girls';
    case 'girl-profile':
      return girlId ? `#/girl/${girlId}` : '#/girls';
    case 'houses':
      return '#/houses';
    case 'house-profile':
      return houseId ? `#/house/${houseId}` : '#/houses';
    case 'activities':
      return '#/activities';
    case 'programmes':
      return programmeId ? `#/programmes/${programmeId}` : '#/programmes';
    case 'contacts':
      return '#/contacts';
    case 'case-management':
      return '#/case-management';
    case 'administration':
      return '#/administration';
    case 'documents':
      return '#/documents';
    case 'inventory':
      return '#/inventory';
    case 'assets':
      return '#/assets';
    case 'messages':
      return '#/messages';
    case 'planning':
      return '#/planning';
    case 'management':
      return '#/management';
    case 'import':
      return '#/import';
    case 'reports':
      return '#/reports';
    case 'report-builder':
      return '#/report-builder';
    case 'payroll':
      return '#/payroll';
    case 'contracts':
      return '#/contracts';
    case 'staff':
      return '#/staff';
    case 'ai-assistant':
      return '#/ai-assistant';
    case 'form-girl':
      return '#/register-girl';
    case 'form-house':
      return '#/add-house';
    default:
      return '';
  }
}

export function qualityTargetHash(kind: 'budget-item' | 'workplan-item', id: string): string {
  return `#/planning?qualityKind=${kind}&qualityId=${encodeURIComponent(id)}`;
}
