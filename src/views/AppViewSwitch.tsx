import type { ComponentType } from 'react';
import {
  AppDatabase,
  Girl,
  Household,
  HouseholdActivity,
  HouseholdExpense,
  HouseholdRentPayment,
  StaffRole,
} from '../types';
import { NavTab } from '../components/Navigation';
import { GirlsList } from '../components/GirlsList';
import { HouseholdsList } from '../components/HouseholdsList';
import { ActivitiesList } from '../components/ActivitiesList';
import { GirlProfile } from '../components/GirlProfile';
import { HouseholdProfile } from '../components/HouseholdProfile';
import { canAccessManagementDashboard } from '../services/managementAnalytics';
import type { QualityIssue } from '../services/qualityRules';
import { ProgrammeId } from '../data/programmes';
import { GirlForm } from '../components/Forms/GirlForm';
import { HouseholdForm } from '../components/Forms/HouseholdForm';
import { EducationalFollowUpForm } from '../components/Forms/EducationalFollowUpForm';
import { HealthFollowUpForm } from '../components/Forms/HealthFollowUpForm';
import { FamilyFollowUpForm } from '../components/Forms/FamilyFollowUpForm';
import { RentPaymentForm } from '../components/Forms/RentPaymentForm';
import { HouseholdExpenseForm } from '../components/Forms/HouseholdExpenseForm';
import { HouseholdActivityForm } from '../components/Forms/HouseholdActivityForm';
import { AppView } from '../routing/appRoutes';
import { AdministrationHub } from '../components/AdministrationHub';
import { InventoryView } from '../components/InventoryView';
import { AssetRegisterView } from '../components/AssetRegisterView';
import { DocumentsFilingView } from '../components/DocumentsFilingView';
import type { PendingPhoto } from '../components/Attachments/FormPhotoSection';

/**
 * The view switch: picks which screen to render for the active route.
 *
 * Extracted from App.tsx to keep that file focused on state and side effects.
 * The heavy views arrive as props (lazy components defined in App.tsx) so this
 * module never statically imports them and the first download stays small.
 */

type LazyView = ComponentType<any>;

export interface AppViewSwitchProps {
  view: AppView;
  db: AppDatabase;
  role: StaffRole | null;
  isAdmin: boolean;
  isViewOnly: boolean;
  auditActor: string;
  allStaff: AppDatabase extends { staff?: infer S } ? S : any[];
  safeguardingCount?: number;
  girlsStatusFilter?: string;
  selectedProgrammeId: ProgrammeId | null;
  qualityRecordFocus: { kind: 'budget-item' | 'workplan-item'; id: string } | null;
  programmePlanningRequest: { requestId: number; type: 'budget' | 'workplan'; programmeId: ProgrammeId } | null;
  importWizardKey: number;
  pendingImportFile: File | null;
  previousImportLocation: { view: AppView; tab: NavTab; girlId?: string | null; houseId?: string | null };
  editingGirl: Girl | null;
  editingHouse: Household | null;
  aiFocusGirlId?: string;
  aiFocusHouseId?: string;
  currentGirl: Girl | null | undefined;
  currentGirlHouse: Household | undefined;
  currentGirlEdu: AppDatabase['educationalFollowUps'];
  currentGirlHealth: AppDatabase['healthFollowUps'];
  currentGirlFamily: AppDatabase['familyFollowUps'];
  currentHouse: Household | null | undefined;
  currentHouseResidents: Girl[];
  currentHouseRent: HouseholdRentPayment[];
  currentHouseExpenses: HouseholdExpense[];
  currentHouseActivities: HouseholdActivity[];

  // Lazy view components.
  ManagementDashboard: LazyView;
  Reports: LazyView;
  ReportBuilder: LazyView;
  AIAssistantView: LazyView;
  MessagingView: LazyView;
  BudgetsAndWorkplansView: LazyView;
  PayrollDashboard: LazyView;
  ContractsDashboard: LazyView;
  CaseManagementView: LazyView;
  DataImportWizard: LazyView;
  ContactsView: LazyView;
  Phase5OperationsView: LazyView;
  ProgrammesView: LazyView;
  StaffManagement: LazyView;
  Dashboard: LazyView;

  // Navigation.
  navigateTo: (newView: AppView, tab?: NavTab, girlId?: string | null, houseId?: string | null, programmeId?: ProgrammeId | null) => void;
  openProgramme: (id: ProgrammeId | null) => void;
  openQualityRecord: (issue: QualityIssue) => void;
  setGirlsStatusFilter: (status?: string) => void;
  onOpenQuickAdd: () => void;
  onInitialFileConsumed: () => void;
  onProgrammeCreateHandled: () => void;
  onCreateProgrammePlan: (type: 'budget' | 'workplan', programmeId: ProgrammeId) => void;

  // Handlers.
  handleOpenGirlProfile: (girlId: string) => void;
  handleOpenHouseProfile: (houseId: string) => void;
  handleStartRegisterGirl: () => void;
  handleStartAddHouse: () => void;
  handleStartRentPayment: (house: Household) => void;
  handleStartExpense: (house: Household) => void;
  handleStartActivity: (house?: Household) => void;
  handleStartEditGirl: (girl: Girl) => void;
  handleStartEditHouse: (house: Household) => void;
  handleStartEduFollowUp: (girl: Girl) => void;
  handleStartHealthFollowUp: (girl: Girl) => void;
  handleStartFamilyFollowUp: (girl: Girl) => void;
  handleAskAIAboutGirl: (girlId: string) => void;
  handleAskAIAboutHouse: (houseId: string) => void;
  handleDeleteGirl: (girlId: string) => void;
  handleDeleteHousehold: (houseId: string) => void;
  handleDeleteFollowUp: (type: 'educational' | 'health' | 'family', id: string) => void;
  handleDeleteRentPayment: (id: string) => void;
  handleDeleteExpense: (id: string) => void;
  handleMarkExpensePaid: (id: string, payment: Pick<HouseholdExpense, 'datePaid' | 'paymentMethod' | 'paymentReference'>) => void;
  handleUpdateExpense: (id: string, changes: Partial<Omit<HouseholdExpense, 'id' | 'householdId' | 'createdAt'>>) => void;
  handleDeleteActivity: (id: string) => void;
  handleSaveGirl: (girlData: Omit<Girl, 'createdAt' | 'updatedAt'>, pendingPhotos?: PendingPhoto[]) => boolean;
  handleSaveHouse: (houseData: Omit<Household, 'createdAt' | 'updatedAt'>, pendingPhotos?: PendingPhoto[]) => void;
  handleSaveEduFollowUp: (data: Omit<AppDatabase['educationalFollowUps'][number], 'id' | 'createdAt'>, pendingPhotos?: PendingPhoto[]) => boolean;
  handleSaveHealthFollowUp: (data: Omit<AppDatabase['healthFollowUps'][number], 'id' | 'createdAt'>, pendingPhotos?: PendingPhoto[]) => void;
  handleSaveFamilyFollowUp: (data: Omit<AppDatabase['familyFollowUps'][number], 'id' | 'createdAt'>, pendingPhotos?: PendingPhoto[]) => void;
  handleSaveRentPayment: (data: Omit<HouseholdRentPayment, 'id' | 'createdAt'>, pendingPhotos?: PendingPhoto[]) => void;
  handleSaveExpense: (data: Omit<HouseholdExpense, 'id' | 'createdAt'>, pendingPhotos?: PendingPhoto[]) => boolean;
  handleSaveActivity: (data: Omit<HouseholdActivity, 'id' | 'createdAt'>, pendingPhotos?: PendingPhoto[]) => boolean;
  reloadData: () => void;
  notifyDataChange: (change: any) => void;
  showToast: (message: string) => void;
  openImportFilePicker: () => void;
}

export function AppViewSwitch(props: AppViewSwitchProps) {
  const {
    view, db, role, isAdmin, isViewOnly, auditActor, allStaff, safeguardingCount,
    girlsStatusFilter, selectedProgrammeId, qualityRecordFocus, programmePlanningRequest,
    importWizardKey, pendingImportFile, previousImportLocation, editingGirl, editingHouse,
    aiFocusGirlId, aiFocusHouseId, currentGirl, currentGirlHouse, currentGirlEdu,
    currentGirlHealth, currentGirlFamily, currentHouse, currentHouseResidents,
    currentHouseRent, currentHouseExpenses, currentHouseActivities,
    ManagementDashboard, Reports, ReportBuilder, AIAssistantView, MessagingView,
    BudgetsAndWorkplansView, PayrollDashboard, ContractsDashboard, CaseManagementView, DataImportWizard,
    ContactsView, Phase5OperationsView, ProgrammesView, StaffManagement, Dashboard,
    navigateTo, openProgramme, openQualityRecord, setGirlsStatusFilter, onOpenQuickAdd,
    onInitialFileConsumed, onProgrammeCreateHandled, onCreateProgrammePlan,
    handleOpenGirlProfile, handleOpenHouseProfile,
    handleStartRegisterGirl, handleStartAddHouse, handleStartRentPayment, handleStartExpense,
    handleStartActivity, handleStartEditGirl, handleStartEditHouse, handleStartEduFollowUp,
    handleStartHealthFollowUp, handleStartFamilyFollowUp, handleAskAIAboutGirl, handleAskAIAboutHouse,
    handleDeleteGirl, handleDeleteHousehold, handleDeleteFollowUp, handleDeleteRentPayment,
    handleDeleteExpense, handleMarkExpensePaid, handleUpdateExpense, handleDeleteActivity,
    handleSaveGirl, handleSaveHouse, handleSaveEduFollowUp, handleSaveHealthFollowUp,
    handleSaveFamilyFollowUp, handleSaveRentPayment, handleSaveExpense, handleSaveActivity,
    reloadData, notifyDataChange, showToast, openImportFilePicker,
  } = props;

  return (
    <>
      {/* VIEW 1: DASHBOARD */}
      {view === 'dashboard' && (
        <Dashboard
          db={db}
          onNavigateToGirl={handleOpenGirlProfile}
          onNavigateToHouse={handleOpenHouseProfile}
          onNavigateToGirlsList={(status?: string) => {
            setGirlsStatusFilter(status);
            navigateTo('girls', 'girls');
          }}
          onNavigateToHousesList={() => navigateTo('houses', 'houses')}
          onNavigateToReports={() => navigateTo('reports', 'reports')}
          onOpenSponsorReport={() => navigateTo('report-builder', 'reports')}
          onOpenQuickAdd={onOpenQuickAdd}
          onNavigateToCaseManagement={() => navigateTo('case-management', 'case-management')}
          onNavigateToProgramme={openProgramme}
          safeguardingCount={safeguardingCount}
        />
      )}

      {/* VIEW 2: GIRLS DIRECTORY */}
      {view === 'girls' && (
        <GirlsList
          girls={db.girls}
          households={db.households}
          db={db}
          initialStatusFilter={girlsStatusFilter}
          onSelectGirl={handleOpenGirlProfile}
          onRegisterGirl={handleStartRegisterGirl}
        />
      )}

      {/* VIEW 3: HOUSEHOLDS DIRECTORY */}
      {view === 'houses' && (
        <HouseholdsList
          households={db.households}
          girls={db.girls}
          db={db}
          onSelectHouse={handleOpenHouseProfile}
          onAddHouse={handleStartAddHouse}
          onAddRent={handleStartRentPayment}
          onAddExpense={handleStartExpense}
          onAddActivity={handleStartActivity}
        />
      )}

      {/* VIEW 4: GROUP ACTIVITIES */}
      {view === 'activities' && (
        <ActivitiesList
          activities={db.householdActivities}
          households={db.households}
          girls={db.girls}
          onSelectHouse={handleOpenHouseProfile}
          onAddActivity={() => handleStartActivity()}
        />
      )}

      {view === 'programmes' && (
        <ProgrammesView
          db={db}
          selectedProgrammeId={selectedProgrammeId}
          auditActor={auditActor}
          isViewOnly={isViewOnly}
          onOpenProgramme={openProgramme}
          onNavigateToGirls={() => navigateTo('girls', 'girls')}
          onNavigateToHouses={() => navigateTo('houses', 'houses')}
          onNavigateToOperations={() => navigateTo('operations', 'operations')}
          onRefresh={reloadData}
          onProgrammeLogAdded={(record: any, programmeName: string) => notifyDataChange({
            type: 'programme_record_added',
            entityId: record.id,
            entityTitle: `${programmeName}: ${record.description}`,
          })}
          onCreateProgrammePlan={(type: 'budget' | 'workplan', programmeId: ProgrammeId) => {
            onCreateProgrammePlan(type, programmeId);
            navigateTo('planning', 'planning');
          }}
        />
      )}

      {view === 'contacts' && (
        <ContactsView db={db} />
      )}

      {view === 'case-management' && (
        <CaseManagementView
          db={db}
          onRefresh={reloadData}
          onOpenGirl={handleOpenGirlProfile}
          onOpenHousehold={handleOpenHouseProfile}
        />
      )}

      {view === 'operations' && <Phase5OperationsView db={db} onRefresh={reloadData} onNavigateToProgramme={openProgramme} />}

      {view === 'administration' && <AdministrationHub db={db} onNavigate={(nextView) => navigateTo(nextView, nextView === 'staff' ? 'staff' : nextView === 'payroll' || nextView === 'contracts' ? 'payroll' : nextView === 'reports' ? 'reports' : nextView === 'import' ? 'import' : nextView === 'planning' ? 'planning' : nextView === 'inventory' ? 'administration' : 'operations')} />}

      {view === 'inventory' && <InventoryView items={db.inventoryItems || []} onRefresh={reloadData} />}
      {view === 'assets' && <AssetRegisterView assets={db.assets || []} onRefresh={reloadData} />}
      {view === 'documents' && (
        <DocumentsFilingView
          db={db}
          onOpenTarget={(targetType, targetId) => {
            if (targetType === 'girl') {
              handleOpenGirlProfile(targetId);
            } else if (targetType === 'household') {
              handleOpenHouseProfile(targetId);
            } else if (targetType === 'educationalFollowUp' || targetType === 'healthFollowUp' || targetType === 'familyFollowUp') {
              const girlId = db.educationalFollowUps.find((item) => item.id === targetId)?.girlId
                || db.healthFollowUps.find((item) => item.id === targetId)?.girlId
                || db.familyFollowUps.find((item) => item.id === targetId)?.girlId;
              if (girlId) handleOpenGirlProfile(girlId);
            } else if (targetType === 'rentPayment' || targetType === 'expense' || targetType === 'householdActivity') {
              const householdId = targetType === 'rentPayment'
                ? db.rentPayments.find((item) => item.id === targetId)?.householdId
                : targetType === 'expense'
                  ? db.expenses.find((item) => item.id === targetId)?.householdId
                  : db.householdActivities.find((item) => item.id === targetId)?.householdId;
              if (householdId) handleOpenHouseProfile(householdId);
            } else if (targetType === 'programme') {
              openProgramme(targetId as ProgrammeId);
            } else if (targetType === 'programmeLog') {
              const record = (db.programmeLogs || []).find((item) => item.id === targetId);
              if (record) openProgramme(record.programmeId as ProgrammeId);
            } else if (targetType === 'importBatch') {
              navigateTo('reports', 'reports');
            } else {
              showToast('No direct screen link is available for this attachment type yet.');
            }
          }}
        />
      )}



      {/* VIEW 5: REPORTS */}
      {view === 'reports' && (
        <Reports
          db={db}
          onSelectGirl={handleOpenGirlProfile}
          onSelectHouse={handleOpenHouseProfile}
          onOpenQualityRecord={openQualityRecord}
        />
      )}

      {view === 'report-builder' && (
        <ReportBuilder db={db} onClose={() => navigateTo('dashboard', 'dashboard')} onOpenQualityRecord={openQualityRecord} />
      )}

      {view === 'payroll' && (
        <PayrollDashboard db={db} onRefresh={reloadData} onNavigateToContracts={() => navigateTo('contracts', 'payroll')} />
      )}

      {view === 'contracts' && (
        <ContractsDashboard db={db} onRefresh={reloadData} onBackToPayroll={() => navigateTo('payroll', 'payroll')} />
      )}

      {/* VIEW: STAFF MANAGEMENT (ADMINISTRATORS ONLY) */}
      {view === 'staff' && (
        <StaffManagement />
      )}

      {/* VIEW: SHINE AI ASSISTANT */}
      {view === 'ai-assistant' && (
        <AIAssistantView
          db={db}
          initialGirlId={aiFocusGirlId}
          initialHouseId={aiFocusHouseId}
          onNavigateToGirl={handleOpenGirlProfile}
          onNavigateToHouse={handleOpenHouseProfile}
        />
      )}

      {/* VIEW: STAFF MESSAGING & NOTIFICATIONS HUB */}
      {view === 'messages' && (
        <MessagingView
          appDb={db}
          onOpenRecord={(type: string, id: string) => {
            if (type === 'girl') {
              handleOpenGirlProfile(id);
            } else if (type === 'household') {
              handleOpenHouseProfile(id);
            } else if (type === 'educationalFollowUp' || type === 'healthFollowUp' || type === 'familyFollowUp') {
              const edu = db.educationalFollowUps.find((e) => e.id === id);
              const hlth = db.healthFollowUps.find((h) => h.id === id);
              const fam = db.familyFollowUps.find((f) => f.id === id);
              const gId = edu?.girlId || hlth?.girlId || fam?.girlId;
              if (gId) handleOpenGirlProfile(gId);
            } else if (type === 'rentPayment' || type === 'expense' || type === 'householdActivity') {
              const rent = db.rentPayments.find((r) => r.id === id);
              const exp = db.expenses.find((e) => e.id === id);
              const act = db.householdActivities.find((a) => a.id === id);
              const hId = rent?.householdId || exp?.householdId || act?.householdId;
              if (hId) handleOpenHouseProfile(hId);
            } else if (type === 'programmeLog') {
              const record = (db.programmeLogs || []).find((item) => item.id === id);
              if (record) openProgramme(record.programmeId as ProgrammeId);
            } else if (type === 'programme') {
              openProgramme(id as ProgrammeId);
            } else if (type === 'importBatch') {
              navigateTo('reports', 'reports');
              window.location.hash = `#/reports?importAudit=${encodeURIComponent(id)}`;
            }
          }}
        />
      )}

      {/* VIEW: PLANNING (BUDGETS, WORKPLANS & FIELD SCHEDULES) */}
      {view === 'planning' && (
        <BudgetsAndWorkplansView
          db={db}
          onRefresh={reloadData}
          qualityRecordFocus={qualityRecordFocus}
          initialProgrammeCreate={programmePlanningRequest}
          onProgrammeCreateHandled={onProgrammeCreateHandled}
        />
      )}

      {view === 'management' && (canAccessManagementDashboard(isAdmin, role) ? (
        <ManagementDashboard
          db={db}
          staff={allStaff}
          onNavigateReports={() => navigateTo('reports', 'reports')}
          onOpenReportBuilder={() => navigateTo('report-builder', 'reports')}
        />
      ) : (
        <div className="rounded-xl border border-rose-200 bg-white p-8 text-center">
          <h1 className="text-lg font-bold text-stone-900">Management access restricted</h1>
          <p className="mt-2 text-sm text-stone-600">Only Administrators and Managers can view this dashboard.</p>
        </div>
      ))}

      {/* VIEW: DOCUMENT INGESTION WIZARD */}
      {view === 'import' && (
        <DataImportWizard
          key={importWizardKey}
          db={db}
          initialFile={pendingImportFile}
          onInitialFileConsumed={onInitialFileConsumed}
          onOpenFilePicker={openImportFilePicker}
          onImportComplete={(audit: any) => {
            notifyDataChange({ type: 'import_completed', entityId: audit.id, entityTitle: audit.fileName });
            reloadData();
            showToast('Data ingestion completed and saved to Firestore!');
          }}
          onCancel={() => {
            onInitialFileConsumed();
            navigateTo(previousImportLocation.view, previousImportLocation.tab, previousImportLocation.girlId, previousImportLocation.houseId);
          }}
        />
      )}

      {/* VIEW 6: GIRL PROFILE */}
      {view === 'girl-profile' && currentGirl && (
        <GirlProfile
          girl={currentGirl}
          household={currentGirlHouse}
          educationalFollowUps={currentGirlEdu}
          healthFollowUps={currentGirlHealth}
          familyFollowUps={currentGirlFamily}
          historicalRecords={db.historicalRecords?.filter((h) => h.girlId === currentGirl.id) || []}
          caseActions={(db.caseActions || []).filter((item) => item.girlId === currentGirl.id)}
          educationHistory={(db.educationHistory || []).filter((item) => item.girlId === currentGirl.id)}
          academicSupports={(db.academicSupports || []).filter((item) => item.girlId === currentGirl.id)}
          examinationRecords={(db.examinationRecords || []).filter((item) => item.girlId === currentGirl.id)}
          attendanceRecords={(db.attendanceRecords || []).filter((item) => item.girlId === currentGirl.id)}
          girlLeaves={(db.girlLeaves || []).filter((item) => item.girlId === currentGirl.id)}
          caseReviews={(db.caseReviews || []).filter((item) => item.girlId === currentGirl.id)}
          caseGoals={(db.caseGoals || []).filter((item) => item.girlId === currentGirl.id)}
          householdActivities={(db.householdActivities || []).filter((item) => item.householdId === currentGirl.householdId)}
          onBack={() => navigateTo('girls', 'girls')}
          onNavigateToHouse={handleOpenHouseProfile}
          onEditGirl={handleStartEditGirl}
          onDeleteGirl={handleDeleteGirl}
          onDeleteFollowUp={handleDeleteFollowUp}
          onAddEducationalFollowUp={handleStartEduFollowUp}
          onAddHealthFollowUp={handleStartHealthFollowUp}
          onAddFamilyFollowUp={handleStartFamilyFollowUp}
          onAskAI={handleAskAIAboutGirl}
        />
      )}

      {/* Fallback if girl not found */}
      {view === 'girl-profile' && !currentGirl && (
        <div className="bg-white p-8 rounded-xl border border-stone-200 text-center space-y-3">
          <h2 className="text-lg font-bold text-stone-800">Girl Profile Not Found</h2>
          <p className="text-xs text-stone-500">
            The requested girl record does not exist or has been removed.
          </p>
          <button
            onClick={() => navigateTo('girls', 'girls')}
            className="px-4 py-2 bg-teal-800 text-white text-xs font-bold rounded-lg"
          >
            Return to Girls Directory
          </button>
        </div>
      )}

      {/* VIEW 7: HOUSEHOLD PROFILE */}
      {view === 'house-profile' && currentHouse && (
        <HouseholdProfile
          household={currentHouse}
          residentGirls={currentHouseResidents}
          rentPayments={currentHouseRent}
          expenses={currentHouseExpenses}
          activities={currentHouseActivities}
          onBack={() => navigateTo('houses', 'houses')}
          onNavigateToGirl={handleOpenGirlProfile}
          onEditHousehold={handleStartEditHouse}
          onDeleteHousehold={handleDeleteHousehold}
          onDeleteRentPayment={handleDeleteRentPayment}
          onDeleteExpense={handleDeleteExpense}
          onMarkExpensePaid={handleMarkExpensePaid}
          onUpdateExpense={handleUpdateExpense}
          onDeleteActivity={handleDeleteActivity}
          onAddRentPayment={handleStartRentPayment}
          onAddExpense={handleStartExpense}
          onAddActivity={handleStartActivity}
          onAskAI={handleAskAIAboutHouse}
        />
      )}

      {/* Fallback if house not found */}
      {view === 'house-profile' && !currentHouse && (
        <div className="bg-white p-8 rounded-xl border border-stone-200 text-center space-y-3">
          <h2 className="text-lg font-bold text-stone-800">Household Not Found</h2>
          <p className="text-xs text-stone-500">
            The requested household record does not exist or has been removed.
          </p>
          <button
            onClick={() => navigateTo('houses', 'houses')}
            className="px-4 py-2 bg-teal-800 text-white text-xs font-bold rounded-lg"
          >
            Return to Households Directory
          </button>
        </div>
      )}

      {/* FORM 1: GIRL REGISTRATION / EDIT */}
      {view === 'form-girl' && (
        <div className="max-w-3xl mx-auto">
          <GirlForm
            initialData={editingGirl || undefined}
            existingGirls={db.girls}
            households={db.households}
            onSave={handleSaveGirl}
            onCancel={() => {
              if (editingGirl) {
                navigateTo('girl-profile', 'girls', editingGirl.id);
              } else {
                navigateTo('girls', 'girls');
              }
            }}
          />
        </div>
      )}

      {/* FORM 2: HOUSEHOLD REGISTRATION / EDIT */}
      {view === 'form-house' && (
        <div className="max-w-2xl mx-auto">
          <HouseholdForm
            initialData={editingHouse || undefined}
            existingHouses={db.households}
            onSave={handleSaveHouse}
            onCancel={() => {
              if (editingHouse) {
                navigateTo('house-profile', 'houses', undefined, editingHouse.id);
              } else {
                navigateTo('houses', 'houses');
              }
            }}
          />
        </div>
      )}

      {/* FORM 3: EDUCATIONAL FOLLOW-UP */}
      {view === 'form-edu' && currentGirl && (
        <div className="max-w-3xl mx-auto">
          <EducationalFollowUpForm
            girl={currentGirl}
            onSave={handleSaveEduFollowUp}
            onCancel={() => navigateTo('girl-profile', 'girls', currentGirl.id)}
          />
        </div>
      )}

      {/* FORM 4: HEALTH / MEDICAL FOLLOW-UP */}
      {view === 'form-health' && currentGirl && (
        <div className="max-w-3xl mx-auto">
          <HealthFollowUpForm
            girl={currentGirl}
            onSave={handleSaveHealthFollowUp}
            onCancel={() => navigateTo('girl-profile', 'girls', currentGirl.id)}
          />
        </div>
      )}

      {/* FORM 5: FAMILY FOLLOW-UP */}
      {view === 'form-family' && currentGirl && (
        <div className="max-w-3xl mx-auto">
          <FamilyFollowUpForm
            girl={currentGirl}
            onSave={handleSaveFamilyFollowUp}
            onCancel={() => navigateTo('girl-profile', 'girls', currentGirl.id)}
          />
        </div>
      )}

      {/* FORM 6: RENT PAYMENT */}
      {view === 'form-rent' && currentHouse && (
        <div className="max-w-2xl mx-auto">
          <RentPaymentForm
            household={currentHouse}
            onSave={handleSaveRentPayment}
            onCancel={() => navigateTo('house-profile', 'houses', undefined, currentHouse.id)}
          />
        </div>
      )}

      {/* FORM 7: HOUSEHOLD EXPENSE */}
      {view === 'form-expense' && currentHouse && (
        <div className="max-w-2xl mx-auto">
          <HouseholdExpenseForm
            household={currentHouse}
            onSave={handleSaveExpense}
            onCancel={() => navigateTo('house-profile', 'houses', undefined, currentHouse.id)}
          />
        </div>
      )}

      {/* FORM 8: HOUSEHOLD ACTIVITY */}
      {view === 'form-activity' && currentHouse && (
        <div className="max-w-3xl mx-auto">
          <HouseholdActivityForm
            household={currentHouse}
            houseGirls={currentHouseResidents}
            onSave={handleSaveActivity}
            onCancel={() => navigateTo('house-profile', 'houses', undefined, currentHouse.id)}
          />
        </div>
      )}
    </>
  );
}
