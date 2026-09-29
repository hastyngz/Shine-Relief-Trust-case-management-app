import { AppDatabase, DataQualityIssue, Girl, IntelligenceSuggestion } from '../types';

export interface IntelligentCaseSummary {
  girl: Girl;
  recentDevelopments: string[];
  outstandingFollowUps: Array<{ type: string; id: string; date?: string; detail: string }>;
  education: string[];
  health: string[];
  family: string[];
  household: string[];
  activities: string[];
  documents: string[];
  recommendations: string[];
  upcomingActions: string[];
  missingInformation: string[];
}

export interface DuplicateCandidate {
  recordType: 'girl' | 'household' | 'person';
  recordId: string;
  candidateId: string;
  reason: string;
  matchFields: string[];
}

const validDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
const daysFromToday = (date?: string) => date ? Math.floor((new Date(`${date}T00:00:00.000Z`).getTime() - Date.now()) / 86400000) : undefined;

export function buildIntelligentCaseSummary(db: AppDatabase, girlId: string): IntelligentCaseSummary | null {
  const girl = db.girls.find((item) => item.id === girlId);
  if (!girl) return null;
  const education = (db.educationalFollowUps || []).filter((item) => item.girlId === girlId).sort((a, b) => b.date.localeCompare(a.date));
  const health = (db.healthFollowUps || []).filter((item) => item.girlId === girlId).sort((a, b) => b.date.localeCompare(a.date));
  const family = (db.familyFollowUps || []).filter((item) => item.girlId === girlId).sort((a, b) => b.date.localeCompare(a.date));
  const actions = (db.caseActions || []).filter((item) => item.girlId === girlId);
  const reviews = (db.caseReviews || []).filter((item) => item.girlId === girlId);
  const household = db.households.find((item) => item.id === girl.householdId);
  const activities = (db.householdActivities || []).filter((item) => item.householdId === girl.householdId).sort((a, b) => b.date.localeCompare(a.date));
  const attachments = (db.attachments || []).filter((item) => item.targetId === girlId || (item.targetType === 'household' && item.targetId === girl.householdId));
  const outstandingFollowUps = [
    ...education.filter((item) => item.furtherActionRequired).map((item) => ({ type: 'Education', id: item.id, date: item.nextFollowUpDate, detail: item.recommendations || item.supportProvided || item.academicIssue })),
    ...health.filter((item) => item.furtherActionRequired).map((item) => ({ type: 'Health', id: item.id, date: item.nextFollowUpDate, detail: item.recommendations || item.reasonForVisit })),
    ...family.filter((item) => item.furtherActionRequired).map((item) => ({ type: 'Family', id: item.id, date: item.nextFollowUpDate, detail: item.recommendations || item.challengesOrConcerns || item.familySituation })),
  ];
  return {
    girl,
    recentDevelopments: [...education.slice(0, 3).map((item) => `Education on ${item.date}: ${item.progressOutcome || item.academicIssue}`), ...health.slice(0, 2).map((item) => `Health on ${item.date}: ${item.outcome || item.reasonForVisit}`), ...family.slice(0, 2).map((item) => `Family contact on ${item.date}: ${item.familySituation}`)],
    outstandingFollowUps,
    education: education.map((item) => `${item.date}: ${item.school} ${item.classLevel} - ${item.supportProvided || item.academicIssue}`),
    health: health.map((item) => `${item.date}: ${item.medicalFacility} - ${item.treatmentProvided || item.reasonForVisit}`),
    family: family.map((item) => `${item.date}: ${item.contactType} - ${item.familySituation}`),
    household: household ? [`${household.name} in ${household.location}`, `House mum: ${household.houseMum}`] : [],
    activities: activities.map((item) => `${item.date}: ${item.activityName} at ${item.location || 'location not recorded'}`),
    documents: attachments.map((item) => `${item.date}: ${item.fileName} (${item.category})`),
    recommendations: [...education, ...health, ...family].map((item) => item.recommendations).filter(Boolean),
    upcomingActions: [...actions.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).map((item) => `${item.title} due ${item.dueDate}`), ...reviews.filter((item) => item.nextReviewDate).map((item) => `Case review due ${item.nextReviewDate}`)],
    missingInformation: [
      !girl.dateOfBirth ? 'Date of birth is missing' : '',
      !girl.guardianInfo?.name ? 'Guardian name is missing' : '',
      !girl.guardianInfo?.phone ? 'Guardian phone is missing' : '',
      !girl.school ? 'School is missing' : '',
    ].filter(Boolean),
  };
}

export function detectIntelligenceSuggestions(db: AppDatabase, today = new Date().toISOString().slice(0, 10)): IntelligenceSuggestion[] {
  const suggestions: IntelligenceSuggestion[] = [];
  const add = (suggestion: Omit<IntelligenceSuggestion, 'id' | 'createdAt' | 'createdBy' | 'reviewStatus'>) => suggestions.push({ ...suggestion, id: `suggestion-${suggestions.length + 1}`, createdAt: new Date().toISOString(), createdBy: 'SHINE Intelligence', reviewStatus: 'suggested' });
  (db.educationalFollowUps || []).forEach((item) => {
    if (item.furtherActionRequired && (!item.nextFollowUpDate || item.nextFollowUpDate <= today)) add({ type: 'follow_up', title: `Review education follow-up for ${item.girlId}`, explanation: item.nextFollowUpDate ? `The recorded follow-up date ${item.nextFollowUpDate} has passed.` : 'The record requires action but has no next follow-up date.', sourceRecordIds: [item.id, item.girlId], suggestedAction: item.recommendations || item.supportProvided, suggestedDueDate: today, confidence: 'high' });
  });
  (db.healthFollowUps || []).forEach((item) => {
    if (item.furtherActionRequired && (!item.nextFollowUpDate || item.nextFollowUpDate <= today)) add({ type: 'follow_up', title: `Review health follow-up for ${item.girlId}`, explanation: item.nextFollowUpDate ? `The recorded follow-up date ${item.nextFollowUpDate} has passed.` : 'The record requires action but has no next follow-up date.', sourceRecordIds: [item.id, item.girlId], suggestedAction: item.recommendations || item.reasonForVisit, suggestedDueDate: today, confidence: 'high' });
  });
  (db.caseActions || []).forEach((item) => {
    const days = daysFromToday(item.dueDate);
    if (!item.assignedStaffId) add({ type: 'missing_information', title: `Assign responsible staff for ${item.title}`, explanation: 'This action has no responsible staff member.', sourceRecordIds: [item.id], suggestedAction: 'Review and assign a responsible staff member.', confidence: 'high' });
    else if (days !== undefined && days < 0 && !['Completed', 'Cancelled'].includes(item.status)) add({ type: 'workplan', title: `Overdue action: ${item.title}`, explanation: `The action was due on ${item.dueDate} and remains ${item.status}.`, sourceRecordIds: [item.id], suggestedAction: 'Review status and next action.', suggestedDueDate: today, assignedStaffId: item.assignedStaffId, confidence: 'high' });
  });
  db.girls.forEach((girl) => {
    if (!girl.guardianInfo?.phone || !girl.school) add({ type: 'missing_information', title: `Complete profile for ${girl.fullName}`, explanation: [!girl.guardianInfo?.phone ? 'guardian phone' : '', !girl.school ? 'school' : ''].filter(Boolean).join(' and ') + ' is missing.', sourceRecordIds: [girl.id], suggestedAction: 'Open the profile and complete the missing information.', confidence: 'high' });
  });
  return suggestions;
}

export function findPotentialDuplicates(db: AppDatabase): DuplicateCandidate[] {
  const duplicates: DuplicateCandidate[] = [];
  for (let leftIndex = 0; leftIndex < db.girls.length; leftIndex += 1) {
    const left = db.girls[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < db.girls.length; rightIndex += 1) {
      const right = db.girls[rightIndex];
      const fields: string[] = [];
      if (left.fullName.trim().toLowerCase() === right.fullName.trim().toLowerCase()) fields.push('name');
      if (left.dateOfBirth && left.dateOfBirth === right.dateOfBirth) fields.push('date of birth');
      if (left.guardianInfo?.phone && left.guardianInfo.phone === right.guardianInfo?.phone) fields.push('guardian phone');
      if (fields.length >= 2) duplicates.push({ recordType: 'girl', recordId: left.id, candidateId: right.id, reason: 'Multiple identifying fields match.', matchFields: fields });
    }
  }
  for (let leftIndex = 0; leftIndex < db.households.length; leftIndex += 1) {
    const left = db.households[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < db.households.length; rightIndex += 1) {
      const right = db.households[rightIndex];
      const fields: string[] = [];
      if (left.name.trim().toLowerCase() === right.name.trim().toLowerCase()) fields.push('name');
      if (left.location && left.location.trim().toLowerCase() === right.location?.trim().toLowerCase()) fields.push('location');
      if (fields.length >= 2) duplicates.push({ recordType: 'household', recordId: left.id, candidateId: right.id, reason: 'Household name and location match.', matchFields: fields });
    }
  }
  const people = db.people || [];
  for (let leftIndex = 0; leftIndex < people.length; leftIndex += 1) {
    const left = people[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < people.length; rightIndex += 1) {
      const right = people[rightIndex];
      const fields: string[] = [];
      if (left.fullName.trim().toLowerCase() === right.fullName.trim().toLowerCase()) fields.push('name');
      if (left.phoneNumber && left.phoneNumber === right.phoneNumber) fields.push('phone');
      if (left.email && left.email.toLowerCase() === right.email?.toLowerCase()) fields.push('email');
      if (fields.length >= 2) duplicates.push({ recordType: 'person', recordId: left.id, candidateId: right.id, reason: 'People directory identifiers match.', matchFields: fields });
    }
  }
  return duplicates;
}

export function scanDataQuality(db: AppDatabase): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  db.girls.forEach((girl) => {
    if (!girl.fullName || !girl.dateOfBirth || !girl.householdId) issues.push({ id: `quality-${girl.id}-required`, type: 'missing_required_information', title: `Incomplete girl profile: ${girl.fullName || girl.id}`, detail: 'Name, date of birth, and household are required for a complete profile.', recordType: 'girl', recordId: girl.id, severity: 'high' });
    if (girl.dateOfBirth && !validDate(girl.dateOfBirth)) issues.push({ id: `quality-${girl.id}-dob`, type: 'invalid_value', title: `Invalid date of birth: ${girl.fullName}`, detail: girl.dateOfBirth, recordType: 'girl', recordId: girl.id, severity: 'medium' });
  });
  (db.caseActions || []).forEach((item) => {
    if (!item.assignedStaffId) issues.push({ id: `quality-${item.id}-staff`, type: 'missing_required_information', title: `Action has no responsible staff: ${item.title}`, detail: 'Assign a staff member before relying on the deadline.', recordType: 'caseAction', recordId: item.id, severity: 'medium' });
    if (!validDate(item.dueDate)) issues.push({ id: `quality-${item.id}-date`, type: 'invalid_value', title: `Invalid action date: ${item.title}`, detail: item.dueDate, recordType: 'caseAction', recordId: item.id, severity: 'medium' });
  });
  findPotentialDuplicates(db).forEach((duplicate) => issues.push({ id: `quality-duplicate-${duplicate.recordId}-${duplicate.candidateId}`, type: 'duplicate_candidate', title: 'Possible duplicate girl records', detail: `${duplicate.reason} Matching fields: ${duplicate.matchFields.join(', ')}.`, recordType: duplicate.recordType, recordId: duplicate.recordId, relatedRecordIds: [duplicate.candidateId], severity: 'high' }));
  return issues;
}
