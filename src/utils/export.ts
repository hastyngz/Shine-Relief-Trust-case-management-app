import * as XLSX from 'xlsx';
import {
  AppDatabase,
  Girl,
  Household,
  EducationalFollowUp,
  HealthFollowUp,
  FamilyFollowUp,
  HouseholdRentPayment,
  HouseholdExpense,
  HouseholdActivity,
} from '../types';

export function formatMWK(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Not recorded';
  return `MWK ${amount.toLocaleString('en-US')}`;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

// Convert tabular report rows to an Excel workbook and trigger browser download.
export function downloadExcel(filename: string, rows: (string | number)[][]): void {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
  sheet['!cols'] = (rows[0] || []).map((header, index) => ({
    wch: Math.min(40, Math.max(String(header ?? '').length + 2, ...rows.slice(1, 30).map((row) => String(row[index] ?? '').length + 2))),
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'SHINE Report');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 1. Girls Export
export function exportGirlsToExcel(girls: Girl[], households: Household[]): void {
  const houseMap = new Map(households.map((h) => [h.id, h.name]));
  const headers = [
    'Profile ID',
    'Full Name',
    'Status',
    'Date of Birth',
    'Date Admitted',
    'Household / House',
    'School',
    'Class',
    'Guardian Name',
    'Guardian Relationship',
    'Guardian Phone',
    'Village/Location',
    'Guardian Situation / Notes',
  ];

  const rows = girls.map((g) => [
    g.id,
    g.fullName,
    g.status,
    g.dateOfBirth,
    g.dateAdmitted,
    houseMap.get(g.householdId) || g.householdId,
    g.school,
    g.classLevel,
    g.guardianInfo.name,
    g.guardianInfo.relationship,
    g.guardianInfo.phone || '',
    g.guardianInfo.villageOrLocation || '',
    g.guardianInfo.situationNotes || '',
  ]);

  downloadExcel('SHINE_Relief_Girls_List', [headers, ...rows]);
}

export function exportGirlsExcel(db: AppDatabase): void {
  exportGirlsToExcel(db.girls, db.households);
}

// 2. Households Export
export function exportHouseholdsToExcel(households: Household[], girls: Girl[]): void {
  const headers = [
    'House ID',
    'House Name',
    'Location',
    'House Mum',
    'House Mum Phone',
    'Status',
    'Monthly Rent (MWK)',
    'Resident Girls Count',
    'Notes',
  ];

  const rows = households.map((h) => {
    const residentCount = girls.filter((g) => g.householdId === h.id).length;
    return [
      h.id,
      h.name,
      h.location,
      h.houseMum,
      h.houseMumPhone || '',
      h.status,
      h.monthlyRentCost,
      residentCount,
      h.notes || '',
    ];
  });

  downloadExcel('SHINE_Relief_Households_List', [headers, ...rows]);
}

export function exportHouseholdsExcel(db: AppDatabase): void {
  exportHouseholdsToExcel(db.households, db.girls);
}

// 3. Educational Follow-ups Export
export function exportEducationalFollowUpsToExcel(
  items: EducationalFollowUp[],
  girls: Girl[]
): void {
  const girlMap = new Map(girls.map((g) => [g.id, g.fullName]));
  const headers = [
    'Record ID',
    'Date',
    'Girl ID',
    'Girl Name',
    'School',
    'Class',
    'Academic Issue / Concern',
    'Problems Experienced',
    'Subjects Needing Support',
    'Support Provided',
    'Progress / Outcome',
    'Further Action Required',
    'Recommendations',
    'Next Follow-up Date',
    'Recorded By',
  ];

  const rows = items.map((item) => [
    item.id,
    item.date,
    item.girlId,
    girlMap.get(item.girlId) || 'Unknown',
    item.school,
    item.classLevel,
    item.academicIssue,
    item.problemsExperienced,
    item.subjectsNeedingSupport || '',
    item.supportProvided || '',
    item.progressOutcome || '',
    item.furtherActionRequired ? 'YES' : 'NO',
    item.recommendations || '',
    item.nextFollowUpDate || '',
    item.recordedBy || '',
  ]);

  downloadExcel('SHINE_Educational_FollowUps', [headers, ...rows]);
}

export function exportEducationalFollowUpsExcel(db: AppDatabase): void {
  exportEducationalFollowUpsToExcel(db.educationalFollowUps, db.girls);
}

// 4. Health Follow-ups Export
export function exportHealthFollowUpsToExcel(items: HealthFollowUp[], girls: Girl[]): void {
  const girlMap = new Map(girls.map((g) => [g.id, g.fullName]));
  const headers = [
    'Record ID',
    'Date',
    'Girl ID',
    'Girl Name',
    'Reason For Visit',
    'Health Issue / Complaint',
    'Medical Facility',
    'Treatment Provided',
    'Outcome',
    'Further Action Required',
    'Recommendations',
    'Next Follow-up Date',
    'Recorded By',
  ];

  const rows = items.map((item) => [
    item.id,
    item.date,
    item.girlId,
    girlMap.get(item.girlId) || 'Unknown',
    item.reasonForVisit,
    item.healthIssueComplaint,
    item.medicalFacility,
    item.treatmentProvided || '',
    item.outcome || '',
    item.furtherActionRequired ? 'YES' : 'NO',
    item.recommendations || '',
    item.nextFollowUpDate || '',
    item.recordedBy || '',
  ]);

  downloadExcel('SHINE_Health_Medical_FollowUps', [headers, ...rows]);
}

export function exportHealthFollowUpsExcel(db: AppDatabase): void {
  exportHealthFollowUpsToExcel(db.healthFollowUps, db.girls);
}

// 5. Family Follow-ups Export
export function exportFamilyFollowUpsToExcel(items: FamilyFollowUp[], girls: Girl[]): void {
  const girlMap = new Map(girls.map((g) => [g.id, g.fullName]));
  const headers = [
    'Record ID',
    'Date',
    'Girl ID',
    'Girl Name',
    'Contact Type',
    'Family Situation',
    'Challenges / Concerns',
    'Support Provided',
    'Further Action Required',
    'Recommendations',
    'Next Follow-up Date',
    'Recorded By',
  ];

  const rows = items.map((item) => [
    item.id,
    item.date,
    item.girlId,
    girlMap.get(item.girlId) || 'Unknown',
    item.contactType,
    item.familySituation,
    item.challengesOrConcerns || '',
    item.supportProvided || '',
    item.furtherActionRequired ? 'YES' : 'NO',
    item.recommendations || '',
    item.nextFollowUpDate || '',
    item.recordedBy || '',
  ]);

  downloadExcel('SHINE_Family_Guardian_FollowUps', [headers, ...rows]);
}

export function exportFamilyFollowUpsExcel(db: AppDatabase): void {
  exportFamilyFollowUpsToExcel(db.familyFollowUps, db.girls);
}

// 6. Household Group Activities Export
export function exportHouseholdActivitiesToExcel(
  items: HouseholdActivity[],
  households: Household[]
): void {
  const houseMap = new Map(households.map((h) => [h.id, h.name]));
  const headers = [
    'Activity ID',
    'Date',
    'Household ID',
    'Household Name',
    'Activity Name',
    'Activity Type',
    'Participant Count',
    'Description',
    'Outcome',
    'Challenges',
    'Support Provided',
    'Recommendations',
    'Further Action Required',
    'Next Action Date',
    'Recorded By',
  ];

  const rows = items.map((item) => [
    item.id,
    item.date,
    item.householdId,
    houseMap.get(item.householdId) || item.householdId,
    item.activityName,
    item.activityType,
    item.participantCount ?? '',
    item.description,
    item.outcome || '',
    item.challenges || '',
    item.supportProvided || '',
    item.recommendations || '',
    item.furtherActionRequired ? 'YES' : 'NO',
    item.nextFollowUpDate || '',
    item.recordedBy || '',
  ]);

  downloadExcel('SHINE_Household_Activities_Log', [headers, ...rows]);
}

export function exportHouseholdActivitiesExcel(db: AppDatabase): void {
  exportHouseholdActivitiesToExcel(db.householdActivities, db.households);
}

// 7. Expenses Export
export function exportExpensesToExcel(items: HouseholdExpense[], households: Household[]): void {
  const houseMap = new Map(households.map((h) => [h.id, h.name]));
  const headers = [
    'Expense ID',
    'Date',
    'House ID',
    'House Name',
    'Category',
    'Item Description',
    'Quantity',
    'Unit Cost (MWK)',
    'Total Cost (MWK)',
    'Supplier',
    'Notes',
  ];

  const rows = items.map((exp) => [
    exp.id,
    exp.date,
    exp.householdId,
    houseMap.get(exp.householdId) || exp.householdId,
    exp.category,
    exp.itemDescription,
    exp.quantity,
    exp.unitCost,
    exp.totalCost,
    exp.supplier || '',
    exp.notes || '',
  ]);

  downloadExcel('SHINE_Household_Expenditures', [headers, ...rows]);
}

export function exportExpensesExcel(db: AppDatabase): void {
  exportExpensesToExcel(db.expenses, db.households);
}

// 8. Rent Payments Export
export function exportRentPaymentsToExcel(
  items: HouseholdRentPayment[],
  households: Household[]
): void {
  const houseMap = new Map(households.map((h) => [h.id, h.name]));
  const headers = [
    'Payment ID',
    'Date Paid',
    'House ID',
    'House Name',
    'Month Covered',
    'Amount Paid (MWK)',
    'Payment Status',
    'Receipt Number',
    'Notes',
  ];

  const rows = items.map((r) => [
    r.id,
    r.datePaid,
    r.householdId,
    houseMap.get(r.householdId) || r.householdId,
    r.monthCovered,
    r.amountPaid,
    r.paymentStatus,
    r.receiptNumber || '',
    r.notes || '',
  ]);

  downloadExcel('SHINE_Rent_Payments_History', [headers, ...rows]);
}

export function exportRentPaymentsExcel(db: AppDatabase): void {
  exportRentPaymentsToExcel(db.rentPayments, db.households);
}

// 9. Full JSON Backup
export function exportAllDataJSON(db: AppDatabase): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `SHINE_Malawi_Full_Backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
