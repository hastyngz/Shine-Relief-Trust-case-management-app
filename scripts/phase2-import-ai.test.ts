import assert from 'node:assert/strict';
import { analyzeImportRows } from '../src/services/importService';
import { executeAITool } from '../src/server/aiTools';
import { AppDatabase, StaffUser } from '../src/types';

const staff: StaffUser = {
  id: 'staff-1',
  uid: 'staff-1',
  email: 'staff@example.test',
  fullName: 'Test Staff',
  role: 'Staff',
  status: 'Active',
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
};

const db: AppDatabase = {
  girls: [{
    id: 'SG-001',
    fullName: 'Test Girl',
    dateOfBirth: '2010-01-01',
    gender: 'Female',
    dateAdmitted: '2024-01-01',
    school: 'Test School',
    classLevel: 'Form 2',
    householdId: 'SH-01',
    status: 'Active',
    guardianInfo: { name: 'Guardian', relationship: 'Aunt', phone: '', villageOrLocation: '', situationNotes: '' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }],
  households: [],
  educationalFollowUps: [],
  healthFollowUps: [],
  familyFollowUps: [],
  rentPayments: [],
  expenses: [],
  householdActivities: [],
  caseActions: [],
  educationHistory: [],
  academicSupports: [],
  examinationRecords: [],
  attendanceRecords: [],
  girlLeaves: [],
  caseReviews: [],
};

async function run() {
  const healthPreview = analyzeImportRows([
    {
      GirlID: 'SG-001',
      VisitDate: '2026-09-20',
      Complaint: 'Recorded complaint',
      Facility: 'Test Clinic',
      Treatment: 'Recorded treatment',
      FollowUpRequired: 'Yes',
    },
  ], 'healthFollowUp', db, 'health.xlsx', staff);

  assert.equal(healthPreview[0].targetEntity, 'healthFollowUp');
  assert.equal(healthPreview[0].matchedId, 'SG-001');
  assert.equal(healthPreview[0].extractedData.medicalFacility, 'Test Clinic');
  assert.equal(healthPreview[0].selected, true);

  const accessed = new Set<string>();
  const educationResult = await executeAITool('getGirlEducationHistory', { girlId: 'SG-001' }, db, accessed);
  assert.equal(educationResult.girl.id, 'SG-001');
  assert.equal('safeguardingCases' in educationResult, false);
  assert.equal('safeguardingCases' in db, false);

  console.log('Import and AI scope tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
