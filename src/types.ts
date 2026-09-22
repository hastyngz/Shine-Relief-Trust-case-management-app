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
