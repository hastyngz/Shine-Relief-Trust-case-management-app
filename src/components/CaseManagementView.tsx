import React, { useState } from 'react';
import { AppDatabase } from '../types';
import { CaseActionsView } from './CaseActionsView';
import { CaseReviewsView } from './CaseReviewsView';
import { EducationRecordsView } from './EducationRecordsView';
import { ProgrammeRecordsView } from './ProgrammeRecordsView';
import { SafeguardingView } from './SafeguardingView';

interface CaseManagementViewProps {
  db: AppDatabase;
  onRefresh: () => void;
  onOpenGirl: (girlId: string) => void;
  onOpenHousehold: (householdId: string) => void;
}

const tabs = [
  ['actions', 'Actions'],
  ['education', 'Education'],
  ['attendance-leave', 'Attendance & Leave'],
  ['reviews', 'Case Reviews'],
  ['safeguarding', 'Safeguarding'],
] as const;

export const CaseManagementView: React.FC<CaseManagementViewProps> = ({ db, onRefresh, onOpenGirl, onOpenHousehold }) => {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>('actions');
  return (
    <div className="space-y-5 pb-12">
      <header>
        <h1 className="text-xl font-black text-stone-900">Case Management</h1>
        <p className="mt-1 text-xs text-stone-500">Move from identified needs to assigned work, recorded outcomes, and preserved history.</p>
      </header>
      <nav aria-label="Case management sections" className="overflow-x-auto border-b border-stone-200">
        <div className="flex min-w-max gap-1">
          {tabs.map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined} className={`px-3 py-2.5 text-xs font-bold ${activeTab === id ? 'border-b-2 border-teal-800 text-teal-950' : 'text-stone-500 hover:text-stone-900'}`}>{label}</button>)}
        </div>
      </nav>
      {activeTab === 'actions' && <CaseActionsView db={db} onRefresh={onRefresh} onOpenGirl={onOpenGirl} onOpenHousehold={onOpenHousehold} />}
      {activeTab === 'education' && <EducationRecordsView db={db} onRefresh={onRefresh} />}
      {activeTab === 'attendance-leave' && <ProgrammeRecordsView db={db} onRefresh={onRefresh} />}
      {activeTab === 'reviews' && <CaseReviewsView db={db} onRefresh={onRefresh} />}
      {activeTab === 'safeguarding' && <SafeguardingView girls={db.girls} />}
    </div>
  );
};