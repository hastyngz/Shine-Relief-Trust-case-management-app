import { AppDatabase, Girl, Household, StaffRole } from '../types';
import { SearchModal } from '../components/SearchModal';
import { DataModal } from '../components/DataModal';
import { QuickAddModal, ActionType } from '../components/QuickAddModal';
import { AppView } from '../routing/appRoutes';
import { ProgrammeId } from '../data/programmes';

/**
 * The app-level modals (search, data export/import and quick add). Extracted
 * from App.tsx; behaviour is unchanged.
 */

export interface AppModalsProps {
  db: AppDatabase;
  isSearchOpen: boolean;
  isDataModalOpen: boolean;
  isQuickAddOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  setIsDataModalOpen: (open: boolean) => void;
  setIsQuickAddOpen: (open: boolean) => void;
  handleOpenGirlProfile: (girlId: string) => void;
  handleOpenHouseProfile: (houseId: string) => void;
  navigateTo: (view: AppView, tab?: any, girlId?: string | null, houseId?: string | null, programmeId?: ProgrammeId | null) => void;
  reloadData: () => void;
  handleQuickAction: (action: ActionType, girl?: Girl, house?: Household) => void;
  openProgramme: (id: ProgrammeId | null) => void;
}

export function AppModals(props: AppModalsProps) {
  const {
    db, isSearchOpen, isDataModalOpen, isQuickAddOpen,
    setIsSearchOpen, setIsDataModalOpen, setIsQuickAddOpen,
    handleOpenGirlProfile, handleOpenHouseProfile, navigateTo, reloadData,
    handleQuickAction, openProgramme,
  } = props;

  return (
    <>
      <SearchModal
        db={db}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectGirl={handleOpenGirlProfile}
        onSelectHouse={handleOpenHouseProfile}
        onNavigateToCaseManagement={() => navigateTo('case-management', 'case-management')}
      />

      <DataModal
        db={db}
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
        onDataChanged={reloadData}
      />

      <QuickAddModal
        db={db}
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSelectAction={handleQuickAction}
        onOpenProgramme={openProgramme}
      />
    </>
  );
}
