import type { ProgrammeId } from './data/programmes';

export type GirlStatus = 'Active' | 'On Holiday' | 'Completed' | 'Left SHINE';

export type HouseStatus = 'Active' | 'Not in use' | 'Closed';

export type ContactType = 'Home visit' | 'Phone call' | 'Family meeting' | 'Other';

export type RentPaymentStatus = 'Paid' | 'Partially paid' | 'Not paid';

export type ExpenseCategory =
  | 'Groceries'
  | 'Food'
  | 'Household supplies'
  | 'Utilities'
  | 'Rent'
  | 'Repairs'
  | 'Clothing/social support'
  | 'Other';

export type HouseholdActivityType =
  | 'Rent payment'
  | 'Groceries'
  | 'Utilities'
  | 'Household supplies'
  | 'Repairs/maintenance'
  | 'Household meeting'
  | 'Group activity'
  | 'Business / Entrepreneurship'
  | 'Sports'
  | 'Agriculture'
  | 'House visit'
  | 'Other';

export interface GuardianInfo {
  name: string;
  relationship: string;
  phone: string;
  villageOrLocation: string;
  situationNotes: string;
}

export type StaffRole = 'Administrator' | 'Manager' | 'Staff' | 'View Only';

export type StaffStatus = 'Active' | 'Suspended';

export type EmployeeCategory = 'Ground Worker/Gardener' | 'Other Staff';
export type ContractStatus = 'Active' | 'Expiring Soon' | 'Expired' | 'Renewed' | 'Completed' | 'Terminated' | 'Resigned';
export type EmploymentStatus = 'Active' | 'On Leave' | 'Completed' | 'Terminated' | 'Resigned';
export type SalaryFrequency = 'Monthly' | 'Weekly' | 'Daily' | 'Annual';

export interface EmploymentPeriod {
  id: string;
  startDate: string;
  endDate?: string;
  contractType?: string;
  duration?: string;
  renewalInformation?: string;
  status: ContractStatus;
}

export interface SalaryHistoryRecord {
  id: string;
  employeeId: string;
  effectiveDate: string;
  salaryAmount: number;
  salaryFrequency: SalaryFrequency;
  previousSalary?: number;
  reasonForChange: string;
  recordedBy: string;
  recordedDate: string;
  notes?: string;
  auditMetadata: {
    createdAt: string;
    createdByUid: string;
    updatedAt?: string;
    updatedByUid?: string;
  };
  employmentPeriodId?: string;
}

export interface SafeguardingPermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canClose: boolean;
}

export interface StaffUser {
  id: string; // document id / uid
  uid: string;
  email: string;
  fullName: string;
  role: StaffRole;
  status: StaffStatus;
  departmentOrTitle?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastLoginAt?: string;
  safeguardingPermissions?: SafeguardingPermissions;
  canViewHealthRecords?: boolean;
  canEditHealthRecords?: boolean;
  canViewCaseReviews?: boolean;
  canEditCaseReviews?: boolean;
  employeeCategory?: EmployeeCategory;
  position?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractType?: string;
  contractDuration?: string;
  contractStatus?: ContractStatus;
  renewalInformation?: string;
  employmentStatus?: EmploymentStatus;
  originalContractStartDate?: string;
  employmentPeriods?: EmploymentPeriod[];
}

export interface Girl {
  id: string; // e.g. "SG-001"
  fullName: string;
  dateOfBirth: string;
  gender: string;
  dateAdmitted: string;
  school: string;
  classLevel: string; // e.g. "Standard 7", "Form 2"
  householdId: string; // linked to Household.id
  status: GirlStatus;
  guardianInfo: GuardianInfo;
  notes?: string;
  photoUrl?: string; // Optional primary profile portrait
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface Household {
  id: string; // e.g. "SH-01"
  name: string;
  location: string;
  monthlyRentCost: number; // MWK
  houseMum: string;
  houseMumPhone?: string;
  status: HouseStatus;
  notes?: string;
  photoUrl?: string; // Optional household photo
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface EducationalFollowUp {
  id: string;
  girlId: string;
  date: string;
  school: string;
  classLevel: string;
  academicIssue: string; // Area of concern
  problemsExperienced: string; // Detailed text
  subjectsNeedingSupport: string; // E.g., "Mathematics, Biology"
  supportProvided: string; // E.g. "Peer tutoring arranged, bought textbooks"
  progressOutcome: string;
  furtherActionRequired: boolean;
  recommendations: string;
  nextFollowUpDate?: string;
  recordedBy?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface HealthFollowUp {
  id: string;
  girlId: string;
  date: string;
  reasonForVisit: string;
  healthIssueComplaint: string; // Detailed complaint
  medicalFacility: string; // e.g., "Zomba Central Hospital"
  healthProfessional?: string;
  treatmentProvided: string; // Medication, dosage, labs
  medication?: string;
  referral?: string;
  notes?: string;
  outcome: string;
  furtherActionRequired: boolean;
  recommendations: string;
  nextFollowUpDate?: string;
  recordedBy?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export type CaseActionPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type CaseActionStatus = 'Open' | 'In Progress' | 'Completed' | 'Overdue' | 'Cancelled';
export type CaseActionSourceType =
  | 'educationalFollowUp'
  | 'healthFollowUp'
  | 'familyFollowUp'
  | 'householdActivity'
  | 'rentPayment'
  | 'expense'
  | 'safeguarding'
  | 'manual';

export interface CaseAction {
  id: string;
  title: string;
  description: string;
  girlId?: string;
  householdId?: string;
  personId?: string;
  assignedStaffId: string;
  assignedStaffName: string;
  sourceType: CaseActionSourceType;
  sourceId?: string;
  priority: CaseActionPriority;
  status: CaseActionStatus;
  dueDate: string;
  completedAt?: string;
  completionNotes?: string;
  createdBy: string;
  createdByUid: string;
  updatedBy: string;
  updatedByUid: string;
  createdAt: string;
  updatedAt: string;
}

export type SafeguardingCategory =
  | 'Protection concern'
  | 'Incident'
  | 'Disclosure'
  | 'Risk concern'
  | 'Referral'
  | 'Intervention'
  | 'Follow-up'
  | 'Other';
export type SafeguardingRiskLevel = 'Low' | 'Medium' | 'High' | 'Urgent';
export type SafeguardingCaseStatus =
  | 'Open'
  | 'Under Review'
  | 'Action Required'
  | 'Referred'
  | 'Monitoring'
  | 'Resolved'
  | 'Closed';

export interface SafeguardingCase {
  id: string;
  girlId: string;
  dateReported: string;
  incidentDate?: string;
  category: SafeguardingCategory;
  description: string;
  immediateConcern: string;
  riskLevel: SafeguardingRiskLevel;
  actionTaken: string;
  referralMade: boolean;
  referredTo?: string;
  responsibleStaffId: string;
  responsibleStaffName: string;
  followUpDate?: string;
  outcome?: string;
  status: SafeguardingCaseStatus;
  authorizedStaffUids: string[];
  createdBy: string;
  createdByUid: string;
  createdAt: string;
  updatedBy: string;
  updatedByUid: string;
  updatedAt: string;
}

export interface SafeguardingAuditEvent {
  id: string;
  userId: string;
  userName: string;
  timestamp: string;
  action: 'read' | 'create' | 'update' | 'close';
  recordId: string;
}

export type EducationHistoryStatus = 'Current' | 'Completed' | 'Transferred' | 'Other';

export interface EducationHistoryRecord {
  id: string;
  girlId: string;
  academicYear: string;
  school: string;
  classLevel: string;
  startDate?: string;
  endDate?: string;
  status: EducationHistoryStatus;
  reasonForChange?: string;
  notes?: string;
  source?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AcademicSupportRecord {
  id: string;
  girlId: string;
  subject: string;
  areaOfConcern: string;
  problemIdentified: string;
  supportProvided: string;
  responsiblePerson?: string;
  date: string;
  outcome?: string;
  furtherActionRequired: boolean;
  nextFollowUpDate?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ExaminationRecord {
  id: string;
  girlId: string;
  examinationType: string;
  examinationYear: string;
  subjects?: Array<{ subject: string; result?: string }>;
  overallOutcome?: string;
  supportRequired?: string;
  notes?: string;
  sourceDocument?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Excused' | 'Late';

export interface AttendanceRecord {
  id: string;
  activityId?: string;
  activityName: string;
  activityType: string;
  location?: string;
  date: string;
  girlId: string;
  status: AttendanceStatus;
  notes?: string;
  recordedBy: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export type LeaveType = 'On Holiday' | 'Medical Leave' | 'Family Leave' | 'School Leave' | 'Temporarily Away' | 'Other';
export type GirlLeaveStatus = 'Active' | 'Returned' | 'Cancelled';

export interface GirlLeaveRecord {
  id: string;
  girlId: string;
  leaveType: LeaveType;
  startDate: string;
  expectedReturnDate: string;
  actualReturnDate?: string;
  reason: string;
  approvedBy: string;
  notes?: string;
  status: GirlLeaveStatus;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export type ProgrammeLogType = 'Production' | 'Sale' | 'Expense' | 'Input' | 'Distribution' | 'Family support' | 'Activity' | 'Note';

export interface ProgrammeLogRecord {
  id: string;
  programmeId: string;
  date: string;
  entryType: ProgrammeLogType;
  description: string;
  quantity?: number;
  unit?: string;
  amountMWK?: number;
  beneficiaries?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CaseReview {
  id: string;
  girlId: string;
  reviewDate: string;
  currentSituation?: string;
  education?: string;
  health?: string;
  family?: string;
  household?: string;
  progress?: string;
  challenges?: string;
  supportRequired?: string;
  actionPlan?: string;
  nextReviewDate?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface FamilyFollowUp {
  id: string;
  girlId: string;
  date: string;
  contactType: ContactType;
  familySituation: string; // Detailed text
  challengesOrConcerns: string;
  supportProvided: string;
  furtherActionRequired: boolean;
  recommendations: string;
  nextFollowUpDate?: string;
  recordedBy?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface HouseholdRentPayment {
  id: string;
  householdId: string;
  datePaid: string;
  monthCovered: string; // E.g. "September 2026"
  amountPaid: number; // MWK
  paymentStatus: RentPaymentStatus;
  receiptNumber?: string;
  notes: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  budgetId?: string;
  budgetLineId?: string;
  financialYear?: string;
  programme?: string;
  budgetCategory?: string;
}

export interface HouseholdExpense {
  id: string;
  householdId: string;
  date: string;
  category: ExpenseCategory;
  itemDescription: string;
  quantity: string;
  unitCost: number; // MWK
  totalCost: number; // MWK
  supplier?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  budgetId?: string;
  budgetLineId?: string;
  financialYear?: string;
  programme?: string;
  budgetCategory?: string;
  subcategory?: string;
  girlId?: string;
  activityId?: string;
}

export interface HouseholdActivity {
  id: string;
  householdId: string;
  date: string;
  activityName: string;
  activityType: HouseholdActivityType;
  activityCategory?: string;
  location?: string;
  participantCount?: number;
  participatingGirlIds?: string[];
  description: string;
  outcome: string;
  challenges: string;
  supportProvided: string;
  recommendations: string;
  furtherActionRequired: boolean;
  nextFollowUpDate?: string;
  recordedBy?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export type AttachmentTargetType =
  | 'girl'
  | 'household'
  | 'educationalFollowUp'
  | 'healthFollowUp'
  | 'familyFollowUp'
  | 'householdActivity'
  | 'rentPayment'
  | 'expense';

export type AttachmentCategory =
  | 'Profile Photo'
  | 'School Document'
  | 'Report Card'
  | 'Medical Document'
  | 'Prescription'
  | 'Household Condition'
  | 'Repairs & Maintenance'
  | 'Group Activity'
  | 'Family Visit'
  | 'Receipt'
  | 'Supporting Document'
  | 'Other';

export interface PhotoAttachment {
  id: string; // unique ID e.g. att_...
  targetType: AttachmentTargetType;
  targetId: string; // ID of girl, household, followUp, etc.
  fileName: string;
  fileSize: number; // in bytes
  contentType: string; // e.g. 'image/jpeg'
  storagePath: string; // path in Firebase Storage
  downloadUrl: string; // secure download URL
  caption?: string;
  consent?: boolean;
  consentCheckedAt?: string;
  consentCheckedBy?: string;
  category: AttachmentCategory;
  date: string; // YYYY-MM-DD
  uploadedBy: {
    uid: string;
    name: string;
    email: string;
    role?: StaffRole;
  };
  createdAt: string; // ISO string
}

// --------------------------------------------------
// 1. BUDGET MANAGEMENT TYPES
// --------------------------------------------------
export type BudgetPeriodType = 'monthly' | 'quarterly' | 'annual' | 'project';

export type BudgetCategory =
  | 'Staff'
  | 'Staff/payroll'
  | 'Gratuity'
  | 'Food'
  | 'Groceries'
  | 'Household supplies'
  | 'Utilities'
  | 'Health/medical'
  | 'Clothing/social support'
  | 'Repairs/maintenance'
  | 'Training'
  | 'Group activities'
  | 'Programme activities'
  | 'Equipment'
  | 'Education'
  | 'Medical'
  | 'Transport'
  | 'Rent'
  | 'Utilities'
  | 'Household supplies'
  | 'Clothing/social support'
  | 'Maintenance'
  | 'Activities'
  | 'Administration'
  | 'Other';

export type AnnualBudgetStatus = 'Draft' | 'Submitted' | 'Approved' | 'Active' | 'Closed';

export interface AnnualBudgetPlan {
  id: string;
  financialYear: string;
  title: string;
  programme: string;
  description?: string;
  status: AnnualBudgetStatus;
  approvedAmount: number;
  approvalDate?: string;
  approvedBy?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface BudgetItem {
  id: string;
  programmeId?: ProgrammeId;
  budgetId?: string;
  financialYear?: string;
  month?: number;
  period: string; // e.g., "2026-09", "2026-Q3", "Annual 2026", "Project SHINE 2026"
  periodType: BudgetPeriodType;
  programme: string; // e.g., "Girls Education & Support", "Household Operations", "Healthcare", "Administration"
  category: BudgetCategory;
  subcategory?: string;
  householdId?: string; // Optional link to specific household
  itemDescription: string;
  unit: string; // e.g., "months", "bags", "students", "visits", "lumpsum"
  quantity: number;
  unitCost: number;
  daysFrequency?: number;
  budgetAmount: number; // Qty * Unit Cost
  actualExpenditure?: number; // Calculated or manually tracked
  currentMarketPrice?: number;
  historicalAveragePrice?: number;
  forecastUnitPrice?: number;
  forecastAmount?: number;
  seasonalMonths?: number[];
  financialValueStatus?: 'Approved' | 'Actual' | 'Forecast' | 'Scenario';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  responsiblePerson?: string;
  activityId?: string;
  girlId?: string;
  auditMetadata?: { createdByUid?: string; updatedByUid?: string };
}

export type PayrollPaymentStatus = 'Paid' | 'Partially Paid' | 'Unpaid' | 'Pending';
export type PayrollPaymentMethod = 'Cash' | 'Bank transfer' | 'Mobile money' | 'Cheque' | 'Other';

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentOrProgramme?: string;
  employeeCategory?: EmployeeCategory;
  payPeriod: string;
  payPeriodStartDate: string;
  payPeriodEndDate: string;
  applicableSalary: number;
  salaryHistoryRecordId?: string;
  salaryHistoryRecordIds: string[];
  expectedAmount: number;
  amountPaid: number;
  datePaid?: string;
  paymentStatus: PayrollPaymentStatus;
  paymentMethod?: PayrollPaymentMethod;
  paymentReference?: string;
  notes?: string;
  budgetId?: string;
  budgetLineId?: string;
  createdBy: string;
  createdByUid: string;
  createdAt: string;
  updatedBy: string;
  updatedByUid: string;
  updatedAt: string;
}

// --------------------------------------------------
// 2. WORKPLANS TYPES
// --------------------------------------------------
export type WorkplanPeriodType = 'annual' | 'quarterly' | 'monthly' | 'project';
export type WorkplanStatus = 'Planned' | 'In Progress' | 'Completed' | 'Delayed' | 'Cancelled';

export interface IndicatorValidity {
  checks: string[];
  source?: { name: string; reference?: string; date?: string };
  secondSource?: string;
  checkedBy?: string;
  checkedByRole?: StaffRole;
  checkedAt?: string;
  note?: string;
}

export interface WorkplanItem {
  id: string;
  programmeId?: ProgrammeId;
  indicatorId?: string;
  validity?: IndicatorValidity;
  dataSource?: string;
  measurementMethod?: string;
  narrativeOnly?: boolean;
  narrativeOnlyReason?: string;
  managerApproved?: boolean;
  costLevel?: 'activity' | 'group';
  period: string; // e.g. "Annual 2026", "2026-Q3", "September 2026"
  periodType: WorkplanPeriodType;
  dueDatePeriod?: string;
  domain?: string;
  sourceRecordId?: string;
  activity: string; // e.g. "School Monitoring Visits"
  objective: string; // e.g. "Assess girl attendance and academic term performance"
  description: string;
  responsibleStaffId: string;
  responsibleStaffName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  recurrence?: { every: 'week' | 'month' | 'term' | 'year'; until?: string };
  completionDates?: string[];
  targetCount: number; // e.g., 20 visits
  unit: string; // e.g. "visits", "girls", "workshops", "sessions"
  completedCount?: number; // Actual completed count (e.g. 14)
  budget?: number; // Optional associated budget (MWK)
  location: string; // e.g. "Zomba Schools", "Tikondane House"
  status: WorkplanStatus;
  progress: number; // 0 to 100 percentage
  notes?: string;
  outcome?: string;
  linkedActivityIds?: string[]; // IDs of linked HouseholdActivity or FollowUps
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface ProcurementQuote {
  supplier: string;
  amountMWK: number;
  quotedAt?: string;
  note?: string;
}

export interface ProcurementListItem {
  description: string;
  specification?: string;
  quantity: number;
  unit: string;
  unitPriceMWK?: number;
  totalMWK?: number;
  note?: string;
  priceStatus: 'quoted' | 'missing' | 'unclear';
  itemNumber?: string;
  budgetLineId?: string;
  quotes?: ProcurementQuote[];
}

export interface ProcurementList {
  id: string;
  title: string;
  purpose: string;
  programmeId?: ProgrammeId;
  items: ProcurementListItem[];
  totalMWK: number;
  status: 'draft' | 'approved' | 'purchased';
  quoteThresholdMWK?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface ProjectProjection {
  id: string;
  programmeId: 'fish-chicken' | 'rice-maize-mill' | 'tomato-farming';
  period: string;
  revenueMWK: number;
  costLines: Array<{ label: string; amountMWK?: number; status: 'priced' | 'unpriced' }>;
  netProfitMWK?: number;
  assumptions: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// --------------------------------------------------
// 3. SCHEDULES TYPES
// --------------------------------------------------
export type ScheduleType =
  | 'activity'
  | 'followup'
  | 'household_visit'
  | 'girl_followup'
  | 'programme_event'
  | 'staff_assignment'
  | 'other';

export type ScheduleStatus =
  | 'Upcoming'
  | 'Scheduled'
  | 'In Progress'
  | 'Rescheduled'
  | 'Completed'
  | 'Cancelled';

export interface ScheduleItem {
  id: string;
  type: ScheduleType;
  title: string;
  description?: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:mm
  targetType?: 'girl' | 'household' | 'workplan' | 'general';
  targetId?: string;
  targetName?: string;
  location?: string;
  assignedStaffId: string;
  assignedStaffName: string;
  status: ScheduleStatus;
  completedAt?: string;
  notes?: string;
  reminderSent?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export type MeetingStatus = 'Planned' | 'In Progress' | 'Completed' | 'Cancelled';

export interface MeetingRecord {
  id: string;
  title: string;
  dateTime: string;
  endDateTime?: string;
  attendees: string[];
  location?: string;
  status: MeetingStatus;
  minutesText: string;
  transcriptionText?: string;
  summaryAndOutcomes: string;
  decisions?: string;
  audioRecordingUrl?: string;
  attachedReports?: string[];
  extractedActionIds?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type Phase5LinkedModule = 'general' | 'early_years' | 'feeding_program' | 'budgeting';

export interface FeedingProgramLog {
  id: string;
  date: string;
  studentsPresent: number;
  mealsServed: number;
  foodItems: string[];
  quantities: Record<string, number>;
  estimatedCost: number;
  actualCost?: number;
  notes?: string;
  earlyYearsGroup?: string;
  audioUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export type MarketPriceSource = 'manual' | 'receipt_ocr' | 'shelf_photo_ocr' | 'audio_entry';

export interface MarketPriceRecord {
  id: string;
  itemName: string;
  category: string;
  unit?: string;
  price: number;
  currency: string;
  dateRecorded: string;
  sourceType: MarketPriceSource;
  locationOrShop?: string;
  imageUrl?: string;
  audioUrl?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface ForecastSettings {
  id: string;
  inflationPercent: number;
  fuelPricePercent: number;
  transportMultiplierPercent: number;
  seasonalFoodPercent: number;
  authorizedBy: string;
  updatedAt: string;
}

export interface WhatIfScenario {
  id: string;
  name: string;
  foodPricePercent: number;
  fuelPricePercent: number;
  transportPercent: number;
  studentPopulationPercent: number;
  feedingDaysChange: number;
  increasedEnrollmentPercent: number;
  createdBy: string;
  createdAt: string;
}

export type IntelligenceReviewStatus = 'suggested' | 'accepted' | 'edited' | 'dismissed';
export type IntelligenceSuggestionType = 'follow_up' | 'workplan' | 'calendar' | 'missing_information' | 'duplicate_review';

export interface IntelligenceSuggestion {
  id: string;
  type: IntelligenceSuggestionType;
  title: string;
  explanation: string;
  sourceRecordIds: string[];
  suggestedAction?: string;
  suggestedDueDate?: string;
  assignedStaffId?: string;
  reviewStatus: IntelligenceReviewStatus;
  confidence: 'high' | 'review_recommended' | 'low';
  createdAt: string;
  createdBy: 'SHINE Intelligence';
  reviewedByUid?: string;
  reviewedAt?: string;
}

export type DataQualityIssueType = 'missing_required_information' | 'duplicate_candidate' | 'contradictory_dates' | 'invalid_value' | 'unresolved_record';

export interface DataQualityIssue {
  id: string;
  type: DataQualityIssueType;
  title: string;
  detail: string;
  recordType: string;
  recordId: string;
  relatedRecordIds?: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface AISettings {
  id: string;
  enabled: boolean;
  speechToText: boolean;
  textToSpeech: boolean;
  documentAnalysis: boolean;
  naturalLanguageSearch: boolean;
  dailyUsageLimit: number;
  updatedByUid: string;
  updatedAt: string;
}

// --------------------------------------------------
// 4. HISTORICAL CASE RECORDS (PREVENTS SILENT OVERWRITE)
// --------------------------------------------------
export type HistoricalRecordType =
  | 'school_class'
  | 'education'
  | 'medical'
  | 'family'
  | 'household'
  | 'support_intervention'
  | 'general';

export interface HistoricalCaseRecord {
  id: string;
  girlId: string;
  recordType: HistoricalRecordType;
  eventDate?: string; // YYYY-MM-DD (left undefined if missing from document)
  isDateUnknown: boolean; // Flagged if source document has no reliable date
  title: string;
  description: string;
  historicalSchool?: string;
  historicalClass?: string;
  historicalGuardian?: GuardianInfo;
  historicalSupport?: string;
  outcome?: string;
  challenges?: string;
  recordedBy?: string;
  source: {
    originalFileName: string;
    fileType: 'xlsx' | 'xls' | 'docx' | 'manual';
    importedAt: string;
    importedByUid: string;
    importedByName: string;
    documentDate?: string;
  };
  createdAt: string;
}

// --------------------------------------------------
// 4B. CENTRAL PEOPLE & CONTACTS DIRECTORY
// Separate from SHINE Girls case list & Application Login Accounts!
// --------------------------------------------------
export type StandardPersonType =
  | 'SHINE Girl'
  | 'Guardian'
  | 'Parent'
  | 'Caregiver'
  | 'Teacher'
  | 'School Staff'
  | 'Pastor'
  | 'Church Leader'
  | 'Youth Leader'
  | 'Mentor'
  | 'SHINE Staff'
  | 'House Mum/Caregiver'
  | 'Worker'
  | 'Volunteer'
  | 'Intern'
  | 'Social Worker'
  | 'Health Worker'
  | 'Community Leader'
  | 'Programme Partner'
  | 'Other';

export type PersonType = StandardPersonType | string;

export type PersonStatus = 'Active' | 'Inactive' | 'Archived' | 'Pending Review';

export interface PersonSourceDocument {
  docName: string;
  reportingPeriod?: string;
  importBatchId?: string;
  section?: string;
  date?: string;
}

export interface Person {
  id: string; // Unique Person ID, e.g. "PER-001"
  fullName: string;
  personType: PersonType;
  organisation?: string;
  positionTitle?: string;
  phoneNumber?: string;
  email?: string;
  location?: string;
  workplaceOrAffiliation?: string; // School, church, organisation or workplace
  relationshipToGirl?: string;
  linkedGirlIds: string[];
  linkedGirlNames?: string[];
  linkedHouseholdIds: string[];
  linkedHouseholdNames?: string[];
  notes?: string;
  sourceDocuments: PersonSourceDocument[];
  dateFirstIdentified: string;
  dateRegistered: string;
  createdBy: string;
  createdDate: string;
  updatedBy: string;
  updatedDate: string;
  status: PersonStatus;
  // Safety marker to guarantee UI/system never treats as login account
  isLoginUser?: false;
}

export type ContactEntityType = 'person' | 'organisation';
export type ContactCategory =
  | 'school'
  | 'church'
  | 'partner NGO'
  | 'government'
  | 'donor'
  | 'supplier'
  | 'volunteer'
  | 'guest speaker'
  | 'health facility'
  | 'other';
export type ContactSource = 'manual' | 'import';

export interface ContactInteraction {
  id: string;
  date: string;
  type: string;
  summary: string;
  sourceReportId?: string;
  sourceRecordId?: string;
  programme?: string;
}

export interface ContactRecord {
  id: string;
  type: ContactEntityType;
  name: string;
  aliases: string[];
  organisationId?: string;
  affiliation?: string;
  roleTitle?: string;
  category: ContactCategory;
  phone: string[];
  email: string[];
  address?: string;
  district?: string;
  notes: string;
  programmes: string[];
  firstSeen: string;
  lastSeen: string;
  createdBy: string;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
  updatedByUid: string;
  updatedByName: string;
  source: ContactSource;
  archived: boolean;
  interactions: ContactInteraction[];
  mergedInto?: string;
}

// --------------------------------------------------
// 5. IMPORT AUDIT & PREVIEW TYPES
// --------------------------------------------------
export type ImportResultType =
  | 'NEW_RECORD'
  | 'NEW_PERSON'
  | 'EXISTING_PERSON_MATCHED'
  | 'POSSIBLE_DUPLICATE_PERSON'
  | 'POTENTIAL_NEW_GIRL'
  | 'PROFILE_UPDATE'
  | 'HISTORICAL_RECORD'
  | 'NO_CHANGE'
  | 'POSSIBLE_DUPLICATE'
  | 'CONFLICT'
  | 'IMPORT_ERROR';

export interface ImportAuditRecord {
  id: string;
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'docx';
  importedAt: string;
  importedByUid: string;
  importedByName: string;
  reportingPeriod?: string;
  contactsDetectedCount?: number;
  newContactsCount?: number;
  existingContactsLinkedCount?: number;
  totalExamined: number;
  newRecordsCount: number;
  profileUpdatesCount: number;
  historicalRecordsCount: number;
  unchangedCount: number;
  duplicatesCount: number;
  conflictsCount: number;
  errorsCount: number;
  // People-specific audit fields
  peopleDetectedCount?: number;
  newPeopleCount?: number;
  existingPeopleMatchedCount?: number;
  possibleDuplicatesCount?: number;
  relationshipsCreatedCount?: number;
  status: 'completed' | 'cancelled' | 'failed';
  summary?: string;
  qualityIssues?: Array<{
    id: string;
    severity: 'blocker' | 'warning' | 'info';
    rule: string;
    message: string;
    location: string;
    suggestedFix?: string;
    target?: { kind: 'preview-item' | 'indicator-result' | 'budget-item' | 'workplan-item' | 'narrative-section' | 'report-section'; id: string; field?: string };
    fix?: { type: 'set-field' | 'choose-option' | 'text-input' | 'number-input' | 'confirm' | 'external'; safe: boolean; field?: string; options?: Array<{ value: string; label: string }>; suggestedValue?: unknown; reversible: boolean };
    status?: 'open' | 'resolved' | 'overridden' | 'pending-approval';
    context?: string;
    whyMatters?: string;
  }>;
  qualityScores?: { quantification: number; impact: number; dataQuality: number };
  blockerOverrideReason?: string;
  qualityResolutions?: Array<{ issueId: string; status: 'resolved' | 'overridden' | 'pending-approval'; note: string; by: string; at: string; field?: string; before?: unknown; after?: unknown }>;
  sourceData?: Record<string, unknown>;
}

export interface RestrictedImportSourceData {
  id: string;
  auditId: string;
  fileName: string;
  importedAt: string;
  sourceData: Record<string, unknown>;
}

export interface EarlyYearsRecord {
  id: string;
  reportingPeriod: string; // e.g. "July to September 2026"
  previousEnrolment?: number;
  enrolled?: number;
  continuing?: number;
  graduates?: number;
  targetEnrolment?: number;
  teacherCaregiverRatio?: string; // e.g. "1:25"
  teachersRequired?: number;
  teacherCount?: number;
  caregiverCount?: number;
  communityVolunteers?: number;
  programmeStartDate?: string;
  classesStartDate?: string;
  feedingProgrammeStartDate?: string;
  ratioTarget?: string;
  notes?: string;
  sourceDocument: string;
  createdAt: string;
  createdBy?: string;
  studentId?: string;
  studentName?: string;
  dateOfBirth?: string;
  guardianName?: string;
  enrollmentDate?: string;
  classGroup?: string;
  attendanceStatus?: 'Present' | 'Absent' | 'Late' | 'Excused';
  studentStatus?: 'Active' | 'Completed' | 'Transferred' | 'Inactive';
  teacherName?: string;
  teacherContact?: string;
}

export type DocxClassification =
  | 'INDIVIDUAL_GIRL_HISTORICAL'
  | 'PEOPLE_DIRECTORY_RECORD'
  | 'HOUSEHOLD_RECORD'
  | 'EDUCATIONAL_FOLLOW_UP'
  | 'HEALTH_MEDICAL_FOLLOW_UP'
  | 'FAMILY_GUARDIAN_FOLLOW_UP'
  | 'GROUP_ACTIVITY'
  | 'PROGRAMME_ACTIVITY'
  | 'EARLY_YEARS_RECORD'
  | 'AGRICULTURE_PRACTICAL_SKILLS'
  | 'WORKPLAN_PRIORITY'
  | 'BUDGET_FINANCIAL'
  | 'GENERAL_REPORT_INFO'
  | 'PHOTO_HIGHLIGHT'
  | 'CONTACT_DIRECTORY_RECORD'
  | 'UNCLASSIFIED_REVIEW';

export interface ImportPreviewItem {
  tempId: string;
  resultType: ImportResultType;
  targetEntity:
    | 'girl'
    | 'person'
    | 'household'
    | 'educationalFollowUp'
    | 'healthFollowUp'
    | 'familyFollowUp'
    | 'expense'
    | 'rent'
    | 'activity'
    | 'budget'
    | 'workplan'
    | 'payroll'
    | 'procurementList'
    | 'projectProjection'
    | 'schedule'
    | 'earlyYears'
    | 'attachment'
    | 'contact'
    | 'general';
  classification?: DocxClassification;
  classificationLabel?: string;
  matchedId?: string; // e.g. "SG-001", "SH-01", or "PER-001"
  matchedName?: string;
  identityResolution?: 'existing-person' | 'new-person';
  matchConfidence?: 'exact' | 'high' | 'medium' | 'possible_match' | 'none';
  candidateGirls?: Array<{ id: string; fullName: string; school?: string; classLevel?: string }>;
  candidatePeople?: Array<{ id: string; fullName: string; personType: string; organisation?: string }>;
  recordDate?: string;
  reportingPeriod?: string;
  isDateUnknown: boolean;
  title?: string;
  summary: string;
  originalSnippet?: string;
  extractedData: Record<string, any>;
  currentData?: Record<string, any>;
  differences?: Array<{ field: string; currentVal: any; importedVal: any }>;
  isHistorical: boolean;
  selected: boolean; // whether user accepted this row for saving
  userNote?: string;
  warningOrConflict?: string;
  missingFields?: string[];
  actionProposed?: string;
  proposedGrouping?: string;
  photoBase64?: string;
  photoContentType?: string;
  photoCaption?: string;
  contactMatchStatus?: 'linked' | 'possible' | 'new';
  contactMatchCandidates?: Array<{ id: string; name: string; category: ContactCategory }>;
  // Detected Person specific details
  detectedRole?: string;
  detectedOrganisation?: string;
  detectedRelationship?: string;
  detectedAffiliation?: string;
  matchedPersonAction?:
    | 'REGISTER_PERSON'
    | 'ADD_TO_EXISTING_PERSON'
    | 'ADD_HISTORICAL_RECORD'
    | 'REGISTER_AS_NEW_GIRL'
    | 'DO_NOT_REGISTER'
    | 'LINK_TO_GIRL'
    | 'LINK_TO_HOUSEHOLD'
    | 'LINK_TO_ACTIVITY'
    | 'IGNORE'
    | 'MARK_FOR_REVIEW';
}

export interface AppDatabase {
  girls: Girl[];
  households: Household[];
  educationalFollowUps: EducationalFollowUp[];
  healthFollowUps: HealthFollowUp[];
  familyFollowUps: FamilyFollowUp[];
  rentPayments: HouseholdRentPayment[];
  expenses: HouseholdExpense[];
  householdActivities: HouseholdActivity[];
  contacts?: ContactRecord[];
  attachments?: PhotoAttachment[];
  budgets?: BudgetItem[];
  annualBudgets?: AnnualBudgetPlan[];
  payrollRecords?: PayrollRecord[];
  workplans?: WorkplanItem[];
  schedules?: ScheduleItem[];
  meetings?: MeetingRecord[];
  feedingProgramLogs?: FeedingProgramLog[];
  marketPrices?: MarketPriceRecord[];
  forecastSettings?: ForecastSettings[];
  whatIfScenarios?: WhatIfScenario[];
  intelligenceSuggestions?: IntelligenceSuggestion[];
  aiSettings?: AISettings[];
  historicalRecords?: HistoricalCaseRecord[];
  importAudits?: ImportAuditRecord[];
  restrictedImportSources?: RestrictedImportSourceData[];
  earlyYearsRecords?: EarlyYearsRecord[];
  people?: Person[];
  customPersonTypes?: string[];
  caseActions?: CaseAction[];
  educationHistory?: EducationHistoryRecord[];
  academicSupports?: AcademicSupportRecord[];
  examinationRecords?: ExaminationRecord[];
  attendanceRecords?: AttendanceRecord[];
  girlLeaves?: GirlLeaveRecord[];
  programmeLogs?: ProgrammeLogRecord[];
  caseReviews?: CaseReview[];
  procurementLists?: ProcurementList[];
  projectProjections?: ProjectProjection[];
}

export interface ReportHistoryRecord {
  id: string;
  reportType: string;
  title: string;
  reportingPeriod: string;
  dateRange?: { start?: string; end?: string };
  filters: Record<string, string>;
  generatedBy: string;
  generatedByUid: string;
  generatedAt: string;
  fileType: 'docx' | 'xlsx' | 'pdf' | 'csv';
  fileName: string;
  storagePath?: string;
  dataSourceReferences: string[];
  recordCount: number;
  photoCount: number;
  tableCount: number;
  status: 'Generated';
  qualityIssues?: Array<{
    id: string;
    severity: 'blocker' | 'warning' | 'info';
    rule: string;
    message: string;
    location: string;
    suggestedFix?: string;
    target?: { kind: 'preview-item' | 'indicator-result' | 'budget-item' | 'workplan-item' | 'narrative-section' | 'report-section'; id: string; field?: string };
    fix?: { type: 'set-field' | 'choose-option' | 'text-input' | 'number-input' | 'confirm' | 'external'; safe: boolean; field?: string; options?: Array<{ value: string; label: string }>; suggestedValue?: unknown; reversible: boolean };
    status?: 'open' | 'resolved' | 'overridden' | 'pending-approval';
    context?: string;
    whyMatters?: string;
  }>;
  qualityScores?: { quantification: number; impact: number; dataQuality: number };
  blockerOverrideReason?: string;
  qualityResolutions?: Array<{ issueId: string; status: 'resolved' | 'overridden' | 'pending-approval'; note: string; by: string; at: string; field?: string; before?: unknown; after?: unknown }>;
}

export interface ReportExportRecord {
  id: string;
  reportType: string;
  title: string;
  fileName: string;
  format: 'docx' | 'pdf' | 'marked-docx' | 'xlsx' | 'csv';
  version: number;
  hash: string;
  openProblems: Array<{ severity: 'blocker' | 'warning' | 'info'; text: string }>;
  overrides: Array<{ issueId: string; reason: string; by: string; at: string }>;
  generatedBy: string;
  generatedByUid: string;
  generatedAt: string;
  draft: boolean;
  finalLocked: boolean;
}

export type ConversationType = 'direct' | 'group' | 'announcement';

export interface ParticipantDetail {
  uid: string;
  name: string;
  role: StaffRole;
  email: string;
}

export interface StaffConversation {
  id: string;
  type: ConversationType;
  title?: string;
  participants: string[]; // array of UIDs
  participantDetails: ParticipantDetail[];
  lastMessageText: string;
  lastMessageAt: string; // ISO
  lastMessageSenderId: string;
  lastMessageSenderName: string;
  unreadCounts: Record<string, number>; // uid -> unread count
  archivedBy?: string[]; // uids who archived this conversation from their inbox
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface StaffMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  recipientId?: string;
  recipientName?: string;
  recipientUids: string[];
  text: string;
  createdAt: string; // ISO
  status: 'sent' | 'delivered' | 'read';
  readBy?: string[];
  readAt?: Record<string, string>; // uid -> ISO
  relatedRecordType?:
    | 'girl'
    | 'household'
    | 'educationalFollowUp'
    | 'healthFollowUp'
    | 'familyFollowUp'
    | 'activity'
    | 'rentPayment'
    | 'expense';
  relatedRecordId?: string;
  relatedRecordTitle?: string;
}

export type NotificationType =
  | 'direct_message'
  | 'data_change'
  | 'assignment'
  | 'followup_reminder'
  | 'announcement'
  | 'system';

export type NotificationPriority = 'normal' | 'important' | 'urgent';

export interface StaffNotification {
  id: string;
  userId: string; // recipient UID
  type: NotificationType;
  title: string;
  message: string;
  source: string;
  priority: NotificationPriority;
  isRead: boolean;
  readAt?: string;
  createdAt: string; // ISO
  createdBy: string;
  relatedRecordType?:
    | 'girl'
    | 'household'
    | 'educationalFollowUp'
    | 'healthFollowUp'
    | 'familyFollowUp'
    | 'activity'
    | 'rentPayment'
    | 'expense'
    | 'conversation';
  relatedRecordId?: string;
  relatedRecordTitle?: string;
  conversationId?: string;
}

export interface StaffAnnouncement {
  id: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  targetGroup: 'all' | 'managers' | 'staff' | 'selected';
  targetUids?: string[];
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  expiresAt?: string;
  readBy?: string[];
}

export interface ReminderTimingSettings {
  sevenDaysBefore: boolean;
  threeDaysBefore: boolean;
  oneDayBefore: boolean;
  onDueDate: boolean;
  afterOverdue: boolean;
}

export interface UserNotificationPreferences {
  userId: string;
  directMessages: boolean;
  caseAssignments: boolean;
  followUpReminders: boolean;
  dataChangeNotifications: boolean;
  administrativeAnnouncements: boolean;
  reminderTiming: ReminderTimingSettings;
  pushEnabled: boolean;
  fcmTokens?: string[];
  updatedAt: string;
}
