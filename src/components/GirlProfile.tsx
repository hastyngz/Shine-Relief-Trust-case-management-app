import React, { useState, useEffect } from 'react';
import {
  Girl,
  Household,
  EducationalFollowUp,
  HealthFollowUp,
  FamilyFollowUp,
  HistoricalCaseRecord,
  PhotoAttachment,
  CaseAction,
  EducationHistoryRecord,
  AcademicSupportRecord,
  ExaminationRecord,
  AttendanceRecord,
  GirlLeaveRecord,
  CaseReview,
} from '../types';
import { formatDate } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft,
  GraduationCap,
  HeartPulse,
  Users,
  Home,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Edit,
  Phone,
  MapPin,
  FileText,
  Trash2,
  ShieldAlert,
  Camera,
  Bot,
  Archive,
} from 'lucide-react';
import { PhotoGallery } from './Attachments/PhotoGallery';
import { PhotoUploadModal } from './Attachments/PhotoUploadModal';
import { RecordAttachmentBar } from './Attachments/RecordAttachmentBar';
import { subscribeAllGirlAttachments } from '../services/attachmentService';

interface GirlProfileProps {
  girl: Girl;
  household?: Household;
  educationalFollowUps: EducationalFollowUp[];
  healthFollowUps: HealthFollowUp[];
  familyFollowUps: FamilyFollowUp[];
  historicalRecords?: HistoricalCaseRecord[];
  caseActions?: CaseAction[];
  educationHistory?: EducationHistoryRecord[];
  academicSupports?: AcademicSupportRecord[];
  examinationRecords?: ExaminationRecord[];
  attendanceRecords?: AttendanceRecord[];
  girlLeaves?: GirlLeaveRecord[];
  caseReviews?: CaseReview[];
  onBack: () => void;
  onNavigateToHouse: (houseId: string) => void;
  onEditGirl: (girl: Girl) => void;
  onDeleteGirl?: (girlId: string) => void;
  onDeleteFollowUp?: (type: 'educational' | 'health' | 'family', id: string) => void;
  onAddEducationalFollowUp: (girl: Girl) => void;
  onAddHealthFollowUp: (girl: Girl) => void;
  onAddFamilyFollowUp: (girl: Girl) => void;
  onAskAI?: (girlId: string) => void;
}

type TimelineFilter = 'all' | 'educational' | 'health' | 'family' | 'historical' | 'action' | 'education-history' | 'support' | 'examination' | 'attendance' | 'leave' | 'review';

interface UnifiedTimelineItem {
  id: string;
  type: TimelineFilter;
  date: string;
  title: string;
  subtitle: string;
  description: string;
  supportProvided?: string;
  progressOrOutcome?: string;
  furtherActionRequired: boolean;
  recommendations?: string;
  nextFollowUpDate?: string;
  recordedBy?: string;
  isDateUnknown?: boolean;
  sourceDocument?: string;
}

export const GirlProfile: React.FC<GirlProfileProps> = ({
  girl,
  household,
  educationalFollowUps,
  healthFollowUps,
  familyFollowUps,
  historicalRecords = [],
  caseActions = [],
  educationHistory = [],
  academicSupports = [],
  examinationRecords = [],
  attendanceRecords = [],
  girlLeaves = [],
  caseReviews = [],
  onBack,
  onNavigateToHouse,
  onEditGirl,
  onDeleteGirl,
  onDeleteFollowUp,
  onAddEducationalFollowUp,
  onAddHealthFollowUp,
  onAddFamilyFollowUp,
  onAskAI,
}) => {
  const { isViewOnly, canViewHealthRecords, canEditHealthRecords } = useAuth();
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [attachments, setAttachments] = useState<PhotoAttachment[]>([]);
  const [isProfilePhotoModalOpen, setIsProfilePhotoModalOpen] = useState(false);

  // Subscribe to all attachments linked to this girl or her follow-ups
  useEffect(() => {
    const followUpIds = [
      ...educationalFollowUps.map((e) => e.id),
      ...healthFollowUps.map((h) => h.id),
      ...familyFollowUps.map((f) => f.id),
    ];
    const unsub = subscribeAllGirlAttachments(girl.id, followUpIds, (list) => {
      setAttachments(list);
    });
    return () => unsub();
  }, [girl.id, educationalFollowUps, healthFollowUps, familyFollowUps]);

  // Unify follow-ups into a chronological timeline
  const timeline: UnifiedTimelineItem[] = [
    ...educationalFollowUps.map((edu) => ({
      id: edu.id,
      type: 'educational' as const,
      date: edu.date,
      title: edu.academicIssue,
      subtitle: `${edu.school} • ${edu.classLevel}`,
      description: edu.problemsExperienced,
      supportProvided: edu.supportProvided,
      progressOrOutcome: edu.progressOutcome,
      furtherActionRequired: edu.furtherActionRequired,
      recommendations: edu.recommendations,
      nextFollowUpDate: edu.nextFollowUpDate,
      recordedBy: edu.recordedBy,
    })),
    ...healthFollowUps.map((hlt) => ({
      id: hlt.id,
      type: 'health' as const,
      date: hlt.date,
      title: hlt.reasonForVisit,
      subtitle: `${hlt.medicalFacility}`,
      description: hlt.healthIssueComplaint,
      supportProvided: hlt.treatmentProvided,
      progressOrOutcome: hlt.outcome,
      furtherActionRequired: hlt.furtherActionRequired,
      recommendations: hlt.recommendations,
      nextFollowUpDate: hlt.nextFollowUpDate,
      recordedBy: hlt.recordedBy,
    })),
    ...familyFollowUps.map((fam) => ({
      id: fam.id,
      type: 'family' as const,
      date: fam.date,
      title: `Family Contact: ${fam.contactType}`,
      subtitle: `Guardian Contact`,
      description: fam.familySituation,
      supportProvided: fam.supportProvided,
      progressOrOutcome: fam.challengesOrConcerns ? `Challenges: ${fam.challengesOrConcerns}` : undefined,
      furtherActionRequired: fam.furtherActionRequired,
      recommendations: fam.recommendations,
      nextFollowUpDate: fam.nextFollowUpDate,
      recordedBy: fam.recordedBy,
    })),
    ...historicalRecords.map((hist) => ({
      id: hist.id,
      type: 'historical' as const,
      date: hist.eventDate || hist.createdAt || '1970-01-01',
      title: hist.title || `Preserved Case History: ${hist.historicalSchool || 'Past Education'} (${hist.historicalClass || 'Past Level'})`,
      subtitle: hist.isDateUnknown ? 'Historical Record - Date Unknown' : `Archived from ${hist.source?.originalFileName || 'Imported Document'}`,
      description: hist.description || `Preserved historical record. Prior school: ${hist.historicalSchool || 'N/A'}. Prior class: ${hist.historicalClass || 'N/A'}.`,
      supportProvided: hist.historicalSupport,
      progressOrOutcome: hist.outcome,
      furtherActionRequired: false,
      recommendations: undefined,
      nextFollowUpDate: undefined,
      recordedBy: hist.recordedBy || hist.source?.originalFileName,
      isDateUnknown: hist.isDateUnknown,
      sourceDocument: hist.source?.originalFileName,
    })),
    ...caseActions.map((action) => ({
      id: action.id,
      type: 'action' as const,
      date: action.createdAt,
      title: action.title,
      subtitle: `Case action · ${action.status}`,
      description: action.description,
      supportProvided: action.completionNotes,
      progressOrOutcome: `Assigned to ${action.assignedStaffName} · ${action.priority} priority`,
      furtherActionRequired: !['Completed', 'Cancelled'].includes(action.status),
      nextFollowUpDate: action.dueDate,
      recordedBy: action.createdBy,
    })),
    ...educationHistory.map((record) => ({
      id: record.id,
      type: 'education-history' as const,
      date: record.startDate || record.createdAt,
      title: `${record.school} · ${record.classLevel}`,
      subtitle: `Education history · ${record.academicYear || 'Academic year not recorded'} · ${record.status}`,
      description: record.notes || record.reasonForChange || '',
      furtherActionRequired: false,
      recordedBy: record.createdBy,
    })),
    ...academicSupports.map((record) => ({
      id: record.id,
      type: 'support' as const,
      date: record.date,
      title: `${record.subject || 'Academic support'} · ${record.areaOfConcern}`,
      subtitle: 'Academic support',
      description: record.problemIdentified,
      supportProvided: record.supportProvided,
      progressOrOutcome: record.outcome,
      furtherActionRequired: record.furtherActionRequired,
      nextFollowUpDate: record.nextFollowUpDate,
      recordedBy: record.responsiblePerson || record.createdBy,
    })),
    ...examinationRecords.map((record) => ({
      id: record.id,
      type: 'examination' as const,
      date: record.createdAt,
      title: `${record.examinationType} · ${record.examinationYear}`,
      subtitle: 'Examination record',
      description: record.subjects?.map((subject) => subject.result ? `${subject.subject}: ${subject.result}` : subject.subject).join(', ') || 'No subject results recorded',
      supportProvided: record.supportRequired,
      progressOrOutcome: record.overallOutcome,
      furtherActionRequired: Boolean(record.supportRequired),
      recordedBy: record.createdBy,
      sourceDocument: record.sourceDocument,
    })),
    ...attendanceRecords.map((record) => ({
      id: record.id,
      type: 'attendance' as const,
      date: record.date,
      title: record.activityName,
      subtitle: `${record.activityType}${record.location ? ` · ${record.location}` : ''}`,
      description: record.notes || `Attendance: ${record.status}`,
      progressOrOutcome: record.status,
      furtherActionRequired: false,
      recordedBy: record.recordedBy,
    })),
    ...girlLeaves.map((record) => ({
      id: record.id,
      type: 'leave' as const,
      date: record.startDate,
      title: record.leaveType,
      subtitle: `${record.status} · Expected return ${record.expectedReturnDate}`,
      description: record.reason,
      progressOrOutcome: record.actualReturnDate ? `Returned ${record.actualReturnDate}` : undefined,
      furtherActionRequired: record.status === 'Active',
      recordedBy: record.approvedBy,
    })),
    ...caseReviews.map((review) => ({
      id: review.id,
      type: 'review' as const,
      date: review.reviewDate,
      title: 'Periodic case review',
      subtitle: review.nextReviewDate ? `Next review ${review.nextReviewDate}` : 'Next review not set',
      description: review.currentSituation || review.progress || '',
      supportProvided: review.supportRequired,
      progressOrOutcome: review.actionPlan,
      furtherActionRequired: Boolean(review.actionPlan),
      nextFollowUpDate: review.nextReviewDate,
      recordedBy: review.createdBy,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredTimeline = timeline.filter((item) => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  const outstandingItems = timeline.filter((item) => item.furtherActionRequired);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'On Holiday':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Completed':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Left SHINE':
        return 'bg-stone-200 text-stone-700 border-stone-300';
      default:
        return 'bg-stone-100 text-stone-800 border-stone-200';
    }
  };

  return (
    <div id="girl-profile-view" className="space-y-6 pb-12">
      {/* Top Bar with Back and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-teal-900 bg-white border border-stone-200 px-3 py-2 rounded-lg shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Girls List</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {onAskAI && (
            <button
              onClick={() => onAskAI(girl.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
              title={`Ask SHINE AI Assistant about ${girl.fullName}`}
            >
              <Bot className="w-4 h-4 text-teal-800" />
              <span>Ask AI About Girl</span>
            </button>
          )}

          {!isViewOnly && (
            <>
              <button
                onClick={() => onEditGirl(girl)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-teal-900 bg-white border border-stone-200 px-3 py-2 rounded-lg shadow-xs transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>

              {onDeleteGirl && (
                <button
                  onClick={() => onDeleteGirl(girl.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-900 hover:bg-red-50 bg-white border border-red-200 px-3 py-2 rounded-lg shadow-xs transition-colors"
                  title="Delete girl profile and follow-ups"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span className="hidden sm:inline">Delete Profile</span>
                </button>
              )}

              {/* Quick Record Follow-up buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onAddEducationalFollowUp(girl)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-teal-950 bg-teal-100 hover:bg-teal-200 border border-teal-300 px-2.5 py-2 rounded-lg shadow-xs transition-colors"
                  title="Add educational follow-up"
                >
                  <GraduationCap className="w-3.5 h-3.5 text-teal-800" />
                  <span>+ Education</span>
                </button>
                {canEditHealthRecords && <button
                  onClick={() => onAddHealthFollowUp(girl)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-950 bg-rose-100 hover:bg-rose-200 border border-rose-300 px-2.5 py-2 rounded-lg shadow-xs transition-colors"
                  title="Add medical follow-up"
                >
                  <HeartPulse className="w-3.5 h-3.5 text-rose-800" />
                  <span>+ Medical</span>
                </button>}
                <button
                  onClick={() => onAddFamilyFollowUp(girl)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-2 rounded-lg shadow-xs transition-colors"
                  title="Add family follow-up"
                >
                  <Users className="w-3.5 h-3.5 text-amber-800" />
                  <span>+ Family</span>
                </button>
              </div>
            </>
          )}
          {isViewOnly && (
            <span className="text-xs font-bold text-stone-500 bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-stone-400" />
              View-Only Mode
            </span>
          )}
        </div>
      </div>

      {/* Profile Header Card */}
      <div className="overflow-hidden">
        <div className="shine-hero rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-4">
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-400 text-teal-950 flex items-center justify-center font-black text-xl sm:text-2xl shadow-md shrink-0 overflow-hidden group border-2 border-white/20">
                {girl.photoUrl ? (
                  <img
                    src={girl.photoUrl}
                    alt={girl.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  girl.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                )}

                {!isViewOnly && (
                  <button
                    type="button"
                    onClick={() => setIsProfilePhotoModalOpen(true)}
                    className="absolute inset-0 bg-stone-900/70 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[9px] font-bold"
                    title="Change portrait photo"
                  >
                    <Camera className="w-4 h-4 text-amber-400 mb-0.5" />
                    <span>Photo</span>
                  </button>
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    {girl.fullName}
                  </h1>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(
                      girl.status
                    )}`}
                  >
                    {girl.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-teal-100 mt-1">
                  <span>Case ID: <strong className="text-amber-300">{girl.id}</strong></span>
                  <span>DOB: {formatDate(girl.dateOfBirth)}</span>
                  <span>Admitted: {formatDate(girl.dateAdmitted)}</span>
                </div>
              </div>
            </div>

            {/* Linked Household link */}
            {household && (
              <button
                onClick={() => onNavigateToHouse(household.id)}
                className="self-start sm:self-center flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-950/60 hover:bg-teal-950 border border-teal-700/60 text-xs text-amber-200 transition-colors text-left"
              >
                <Home className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-300">SHINE House</div>
                  <div className="font-bold text-white">{household.name}</div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Basic Info Cards Grid */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-stone-200 bg-stone-50/50">
          {/* School & Class */}
          <div className="bg-white p-3.5 rounded-lg border border-stone-200 shadow-2xs">
            <div className="flex items-center gap-2 text-teal-900 font-bold text-xs uppercase tracking-wider mb-2">
              <GraduationCap className="w-4 h-4 text-teal-700" />
              <span>Schooling</span>
            </div>
            <div className="text-sm font-semibold text-stone-900">{girl.school}</div>
            <div className="text-xs text-stone-600 mt-0.5">Current Class: <span className="font-medium text-teal-800">{girl.classLevel}</span></div>
          </div>

          {/* Guardian / Family Information */}
          <div className="bg-white p-3.5 rounded-lg border border-stone-200 shadow-2xs">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider mb-2">
              <Users className="w-4 h-4 text-amber-700" />
              <span>Guardian & Family</span>
            </div>
            <div className="text-sm font-semibold text-stone-900">
              {girl.guardianInfo.name} ({girl.guardianInfo.relationship})
            </div>
            {girl.guardianInfo.phone && (
              <div className="text-xs text-stone-600 flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3 text-stone-400" />
                <span>{girl.guardianInfo.phone}</span>
              </div>
            )}
            {girl.guardianInfo.villageOrLocation && (
              <div className="text-xs text-stone-600 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-stone-400" />
                <span>{girl.guardianInfo.villageOrLocation}</span>
              </div>
            )}
          </div>

          {/* Household & House Mum */}
          <div className="bg-white p-3.5 rounded-lg border border-stone-200 shadow-2xs">
            <div className="flex items-center gap-2 text-stone-900 font-bold text-xs uppercase tracking-wider mb-2">
              <Home className="w-4 h-4 text-teal-700" />
              <span>Living Arrangement</span>
            </div>
            <div className="text-sm font-semibold text-stone-900">
              {household ? household.name : 'Not assigned'}
            </div>
            <div className="text-xs text-stone-600 mt-0.5">
              House Mum: {household ? household.houseMum : '—'}
            </div>
            {household?.location && (
              <div className="text-xs text-stone-500 mt-0.5">{household.location}</div>
            )}
          </div>
        </div>

        {/* Detailed Family Situation Notes */}
        {girl.guardianInfo.situationNotes && (
          <div className="px-5 py-3.5 bg-amber-50/50 border-b border-amber-100 text-xs text-stone-700">
            <strong className="text-amber-900 font-semibold">Family Situation & Referral Notes: </strong>
            {girl.guardianInfo.situationNotes}
          </div>
        )}

        {/* Audit Trail Metadata */}
        {(girl.createdBy || girl.createdAt || girl.updatedBy || girl.updatedAt) && (
          <div className="px-5 py-2.5 bg-stone-50 border-t border-stone-200 text-[11px] text-stone-500 flex flex-wrap items-center justify-between gap-2">
            <span>
              Recorded: {girl.createdAt ? formatDate(girl.createdAt) : 'Initial registration'}
              {girl.createdBy ? ` by ${girl.createdBy}` : ''}
            <select value={filter} onChange={(event) => setFilter(event.target.value as TimelineFilter)} aria-label="Filter case timeline" className="max-w-36 bg-white border border-stone-200 rounded-md px-2 py-1.5 text-[11px] text-stone-700">
              <option value="all">All case events</option>
              <option value="action">Case actions</option>
              <option value="education-history">Education history</option>
              <option value="support">Academic support</option>
              <option value="examination">Examinations</option>
              <option value="attendance">Attendance</option>
              <option value="leave">Leave</option>
              <option value="review">Case reviews</option>
            </select>
            </span>
            {girl.updatedAt && (
              <span>
                Last updated: {formatDate(girl.updatedAt)}
                {girl.updatedBy ? ` by ${girl.updatedBy}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Outstanding Action Items Alert Box */}
      {outstandingItems.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900">
                Outstanding Follow-Up Actions ({outstandingItems.length})
              </h3>
              <p className="text-xs text-amber-800">
                The following records require further intervention or pending action:
              </p>
              <ul className="text-xs space-y-1.5 mt-2">
                {outstandingItems.map((item) => (
                  <li key={item.id} className="bg-white/80 p-2 rounded border border-amber-200">
                    <div className="flex items-center justify-between font-semibold text-stone-800">
                      <span>[{item.type.toUpperCase()}] {item.title}</span>
                      <span className="text-[11px] text-amber-900">
                        {item.nextFollowUpDate ? `Due: ${formatDate(item.nextFollowUpDate)}` : 'Action pending'}
                      </span>
                    </div>
                    {item.recommendations && (
                      <p className="text-stone-600 text-[11px] mt-0.5 italic">
                        Recommendation: {item.recommendations}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Historical Follow-Ups Section */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-teal-950">Chronological Case History</h2>
            <p className="text-xs text-stone-500">
              All educational, health, and family follow-up records for {girl.fullName}
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg self-start">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                filter === 'all'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All ({timeline.length})
            </button>
            <button
              onClick={() => setFilter('educational')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                filter === 'educational'
                  ? 'bg-teal-800 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <GraduationCap className="w-3 h-3" />
              <span>Edu ({educationalFollowUps.length})</span>
            </button>
            {canViewHealthRecords && <button
              onClick={() => setFilter('health')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                filter === 'health'
                  ? 'bg-rose-800 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <HeartPulse className="w-3 h-3" />
              <span>Health ({healthFollowUps.length})</span>
            </button>}
            <button
              onClick={() => setFilter('family')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                filter === 'family'
                  ? 'bg-amber-800 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Family ({familyFollowUps.length})</span>
            </button>
            {historicalRecords.length > 0 && (
              <button
                onClick={() => setFilter('historical')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  filter === 'historical'
                    ? 'bg-amber-700 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Archive className="w-3 h-3" />
                <span>Historical ({historicalRecords.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Timeline Records */}
        {filteredTimeline.length === 0 ? (
          <div className="text-center py-10 bg-stone-50 rounded-xl border border-dashed border-stone-300 p-6">
            <FileText className="w-8 h-8 text-stone-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-stone-700">No records found for this category</p>
            <p className="text-xs text-stone-500 mt-1">
              Add a new follow-up using the buttons at the top of the profile.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTimeline.map((item) => {
              const isEdu = item.type === 'educational';
              const isHlt = item.type === 'health';
              const isFam = item.type === 'family';
              const isHist = item.type === 'historical';
              const isEducationRecord = ['education-history', 'support', 'examination'].includes(item.type);
              const isOther = !isEdu && !isHlt && !isFam && !isHist && !isEducationRecord;
              const typeLabel = isHist ? 'Historical Record' : isEdu ? 'Educational Follow-Up' : isHlt ? 'Health / Medical Record' : isFam ? 'Family / Guardian Contact' : item.type === 'action' ? 'Case Action' : item.type === 'education-history' ? 'Education History' : item.type === 'support' ? 'Academic Support' : item.type === 'examination' ? 'Examination' : item.type === 'attendance' ? 'Attendance' : item.type === 'leave' ? 'Leave' : 'Case Review';

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isHist
                      ? 'border-amber-400/80 bg-amber-50/20 shadow-xs'
                      : item.furtherActionRequired
                      ? 'border-amber-300 bg-amber-50/30 shadow-xs'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isEdu
                            ? 'bg-teal-100 text-teal-800'
                            : isHlt
                            ? 'bg-rose-100 text-rose-800'
                            : isHist
                            ? 'bg-amber-200 text-amber-900'
                            : isOther
                            ? 'bg-sky-100 text-sky-900'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isEdu && <GraduationCap className="w-5 h-5" />}
                        {isHlt && <HeartPulse className="w-5 h-5" />}
                        {isFam && <Users className="w-5 h-5" />}
                        {isHist && <Archive className="w-5 h-5" />}
                        {isOther && <Calendar className="w-5 h-5" />}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isEdu
                                ? 'bg-teal-800 text-white'
                                : isHlt
                                ? 'bg-rose-800 text-white'
                                : isHist
                                ? 'bg-amber-700 text-white'
                                : isOther
                                ? 'bg-sky-800 text-white'
                                : 'bg-amber-800 text-white'
                            }`}
                          >
                            {item.isDateUnknown ? 'Historical Record - Date Unknown' : typeLabel}
                          </span>
                          <span className="text-xs text-stone-500 font-medium">
                            {item.isDateUnknown ? 'Date Unknown' : formatDate(item.date)}
                          </span>
                          {item.sourceDocument && (
                            <span className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md font-mono">
                              File: {item.sourceDocument}
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-stone-900 mt-1">
                          {item.title}
                        </h3>
                        <p className="text-xs font-medium text-stone-600">{item.subtitle}</p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="self-start sm:self-center">
                      {item.furtherActionRequired ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Action Required
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          In Order
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Detailed descriptions */}
                  <div className="mt-3 pl-0 sm:pl-12 space-y-2 text-xs text-stone-700">
                    {item.description && <div className="bg-stone-50 p-3 rounded-lg border border-stone-200">
                      <span className="font-semibold text-stone-900 block mb-1">
                        {isEdu
                          ? 'Problems & Observations:'
                          : isHlt
                          ? 'Symptoms & Complaint:'
                          : isFam
                          ? 'Family Situation:'
                          : `${typeLabel}:`}
                      </span>
                      <p className="whitespace-pre-line leading-relaxed">{item.description}</p>
                    </div>}

                    {item.supportProvided && (
                      <div className="bg-teal-50/60 p-2.5 rounded-lg border border-teal-200/80">
                        <span className="font-semibold text-teal-950 block mb-0.5">
                          {isHlt ? 'Treatment / Medication Given:' : 'Support / Intervention Provided:'}
                        </span>
                        <p className="text-teal-900 leading-relaxed">{item.supportProvided}</p>
                      </div>
                    )}

                    {item.progressOrOutcome && (
                      <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                        <span className="font-semibold text-stone-900 block mb-0.5">Outcome / Progress:</span>
                        <p className="leading-relaxed">{item.progressOrOutcome}</p>
                      </div>
                    )}

                    {item.recommendations && (
                      <div className="p-2.5 rounded-lg bg-stone-100 border border-stone-200">
                        <span className="font-semibold text-stone-800 block mb-0.5">Recommendations:</span>
                        <p className="italic text-stone-700">{item.recommendations}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-stone-500 border-t border-stone-200">
                      <div className="flex items-center gap-3">
                        {item.nextFollowUpDate && (
                          <span className="flex items-center gap-1 text-teal-900 font-semibold">
                            <Clock className="w-3 h-3 text-teal-700" />
                            Next Follow-up Date: {formatDate(item.nextFollowUpDate)}
                          </span>
                        )}
                        {item.recordedBy && <span>Staff: {item.recordedBy}</span>}
                      </div>

                      {onDeleteFollowUp && ['educational', 'health', 'family'].includes(item.type) && (
                        <button
                          onClick={() => onDeleteFollowUp(item.type as 'educational' | 'health' | 'family', item.id)}
                          className="text-stone-400 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Delete this follow-up record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Attached photos for this specific follow-up */}
                    {['educational', 'health', 'family'].includes(item.type) && <RecordAttachmentBar
                      targetType={
                        item.type === 'educational'
                          ? 'educationalFollowUp'
                          : item.type === 'health'
                          ? 'healthFollowUp'
                          : 'familyFollowUp'
                      }
                      targetId={item.id}
                      targetTitle={`${girl.fullName} - ${item.title}`}
                      defaultCategory={
                        item.type === 'educational'
                          ? 'School Document'
                          : item.type === 'health'
                          ? 'Medical Document'
                          : 'Family Visit'
                      }
                    />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Comprehensive Attached Photos & Documentation Section */}
      <PhotoGallery
        attachments={attachments}
        targetType="girl"
        targetId={girl.id}
        targetTitle={girl.fullName}
        title={`Photos & Attached Records for ${girl.fullName}`}
        subtitle="Passport photos, school report cards, medical discharge notes, and guardian visits stored in Firebase Storage"
        defaultCategory="School Document"
      />

      {/* Modal for setting/updating girl's profile photo */}
      <PhotoUploadModal
        isOpen={isProfilePhotoModalOpen}
        onClose={() => setIsProfilePhotoModalOpen(false)}
        targetType="girl"
        targetId={girl.id}
        targetTitle={girl.fullName}
        defaultCategory="Profile Photo"
      />
    </div>
  );
};
