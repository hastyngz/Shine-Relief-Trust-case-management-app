import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { analyzeSpreadsheetWorkbook } from '../src/services/spreadsheetImport/detector';
import { createSpreadsheetImportPreview } from '../src/services/spreadsheetImport/importers';
import { analyzeImportRows, assertImportLocalSaveSucceeded } from '../src/services/importService';
import { processAIChat } from '../src/server/aiService';
import { executeAITool } from '../src/server/aiTools';
import { AppDatabase, StaffUser } from '../src/types';
import { getAICollectionsForTool } from '../workers/r2-storage/aiBackend';

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

async function verifyPayrollYearInference() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['SHINE Payroll Year 2025'],
    ['Employee Name', 'January', 'February', 'September'],
    ['Maria Chipelesa', 200000, 200000, 200000],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Payroll');

  const analysis = await analyzeSpreadsheetWorkbook(workbook);
  assert.equal(analysis.detectedKind, 'payroll-grid');
  const preview = await createSpreadsheetImportPreview(
    workbook,
    analysis,
    'payroll-grid',
    [],
    'only sep employees salary 2026.xlsx',
  );
  const maria = preview.lines.find((line) => line.kind === 'employee' && line.employeeName === 'Maria Chipelesa');
  assert.ok(maria && maria.kind === 'employee', 'the employee row should be recognised');
  assert.deepEqual(
    maria.salaryHistory.map((entry) => entry.payPeriod),
    ['2025-01', '2025-02', '2025-09'],
    'the explicit workbook year must take precedence over a different year in the filename',
  );
}

async function run() {
  await verifyPayrollYearInference();
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

  const restrictedStaff = { role: 'Staff', canViewHealthRecords: false, canViewCaseReviews: false };
  assert.deepEqual(getAICollectionsForTool('getGirlProfile', {}, restrictedStaff), ['girls', 'households', 'caseGoals']);
  assert.deepEqual(getAICollectionsForTool('getGirlFollowUps', { followUpType: 'health' }, restrictedStaff), ['girls']);
  assert.equal(getAICollectionsForTool('getDashboardStatistics', {}, restrictedStaff).includes('healthFollowUps'), false);
  assert.equal(getAICollectionsForTool('getDashboardStatistics', {}, restrictedStaff).includes('caseReviews'), false);
  assert.deepEqual(getAICollectionsForTool('getCaseActions', {}, restrictedStaff), ['caseActions']);

  const originalFetch = globalThis.fetch;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key';
  let completion = 0;
  globalThis.fetch = async () => {
    const body = completion++ === 0
      ? {
          model: 'provider/tool-model',
          choices: [{ message: { tool_calls: [{ id: 'call-1', function: { name: 'searchGirls', arguments: JSON.stringify({ query: 'Test' }) } }] } }],
        }
      : { model: 'provider/final-model', choices: [{ message: { content: 'Test response.' } }] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await processAIChat({
      message: 'Find Test Girl',
      staffUser: staff,
      loadDatabase: async (toolName) => {
        assert.equal(toolName, 'searchGirls');
        return db;
      },
    });
    assert.deepEqual(response.modelsUsed, ['provider/tool-model', 'provider/final-model']);
    assert.deepEqual(response.sourceRefs, [{
      id: 'SG-001',
      collection: 'girls',
      date: '2024-01-01',
      girlId: 'SG-001',
      householdId: 'SH-01',
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  }

  
assert.doesNotThrow(() => assertImportLocalSaveSucceeded({ ok: true } as any),
  'successful local import persistence must be accepted');
assert.throws(
  () => assertImportLocalSaveSucceeded({ ok: false, error: new Error('QuotaExceededError') } as any),
  /Some records may already exist in Firestore\. Do not repeat the import blindly; refresh and verify the imported records/,
  'failed final local save must not return import success when earlier cloud writes may already have landed',
);

console.log('Import and AI scope tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
