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
  treatmentProvided: string; // Medication, dosage, labs
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
}

export interface HouseholdActivity {
  id: string;
  householdId: string;
  date: string;
  activityName: string;
  activityType: HouseholdActivityType;
  participantCount: number;
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
  | 'Food'
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

export interface BudgetItem {
  id: string;
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
  budgetAmount: number; // Qty * Unit Cost
  actualExpenditure?: number; // Calculated or manually tracked
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

// --------------------------------------------------
// 2. WORKPLANS TYPES
// --------------------------------------------------
export type WorkplanPeriodType = 'annual' | 'quarterly' | 'monthly' | 'project';
export type WorkplanStatus = 'Planned' | 'In Progress' | 'Completed' | 'Delayed' | 'Cancelled';

export interface WorkplanItem {
  id: string;
  period: string; // e.g. "Annual 2026", "2026-Q3", "September 2026"
  periodType: WorkplanPeriodType;
  activity: string; // e.g. "School Monitoring Visits"
  objective: string; // e.g. "Assess girl attendance and academic term performance"
  description: string;
  responsibleStaffId: string;
  responsibleStaffName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
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

export type ScheduleStatus = 'Upcoming' | 'Completed' | 'Cancelled';

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
}

export interface EarlyYearsRecord {
  id: string;
  reportingPeriod: string; // e.g. "July to September 2026"
  previousEnrolment?: number;
  graduates?: number;
  targetEnrolment?: number;
  teacherCaregiverRatio?: string; // e.g. "1:25"
  teachersRequired?: number;
  communityVolunteers?: number;
  programmeStartDate?: string;
  feedingProgrammeStartDate?: string;
  notes?: string;
  sourceDocument: string;
  createdAt: string;
  createdBy?: string;
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
    | 'schedule'
    | 'earlyYears'
    | 'attachment'
    | 'general';
  classification?: DocxClassification;
  classificationLabel?: string;
  matchedId?: string; // e.g. "SG-001", "SH-01", or "PER-001"
  matchedName?: string;
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
  photoBase64?: string;
  photoContentType?: string;
  photoCaption?: string;
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
  attachments?: PhotoAttachment[];
  budgets?: BudgetItem[];
  workplans?: WorkplanItem[];
  schedules?: ScheduleItem[];
  historicalRecords?: HistoricalCaseRecord[];
  importAudits?: ImportAuditRecord[];
  earlyYearsRecords?: EarlyYearsRecord[];
  people?: Person[];
  customPersonTypes?: string[];
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
