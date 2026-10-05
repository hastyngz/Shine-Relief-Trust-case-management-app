import assert from 'node:assert/strict';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type { AppDatabase } from '../src/types';
import { generateReportNarrative } from '../src/services/reportNarrative';
import { assembleSponsorReport } from '../src/services/sponsorReport';
import { filterDataForReport, generateExcelWorkbook, generatePdfReport, generateWordReport, type ReportConfig } from '../src/services/reportGenerators';

const emptyDb: AppDatabase = {
  girls: [],
  households: [],
  educationalFollowUps: [],
  healthFollowUps: [],
  familyFollowUps: [],
  rentPayments: [],
  expenses: [],
  householdActivities: [],
};

const baseOptions = {
  fromDate: '',
  toDate: '',
  programmeId: 'ALL' as const,
  audience: 'Sponsor' as const,
  hideIdentifyingDetails: true,
};
const emptyReport = assembleSponsorReport(emptyDb, baseOptions);
assert.equal(emptyReport.girlsSupported, 0);
assert.equal(emptyReport.programmes.length, 8);
assert.equal(emptyReport.budgeted, 0);

const sourceDb: AppDatabase = {
  ...emptyDb,
  girls: [{
    id: 'SG-001',
    fullName: 'Sensitive Example Name',
    dateOfBirth: '2010-01-01',
    gender: 'Female',
    dateAdmitted: '2020-01-01',
    school: 'Example School',
    classLevel: 'Form 1',
    householdId: '',
    status: 'Active',
    guardianInfo: { name: '', relationship: '', phone: '', villageOrLocation: '', situationNotes: '' },
    createdAt: '',
    updatedAt: '',
  }],
  programmeLogs: [{
    id: 'log-1',
    programmeId: 'fish-chicken',
    date: '2026-08-02',
    entryType: 'Sale',
    description: 'Produce sale',
    amountMWK: 350,
    createdAt: '',
    updatedAt: '',
    createdBy: '',
    updatedBy: '',
  }],
  budgets: [{
    id: 'budget-1',
    programmeId: 'fish-chicken',
    period: '2026-08',
    periodType: 'monthly',
    programme: 'Agriculture',
    category: 'Programme activities',
    itemDescription: 'Feed',
    unit: 'bag',
    quantity: 1,
    unitCost: 100,
    budgetAmount: 100,
    actualExpenditure: 90,
    createdAt: '',
  }],
};
const fishReport = assembleSponsorReport(sourceDb, {
  ...baseOptions,
  programmeId: 'fish-chicken',
  fromDate: '2026-01-01',
  toDate: '2026-12-31',
});
assert.equal(fishReport.programmes.length, 1);
assert.equal(fishReport.budgeted, 100);
assert.equal(fishReport.actual, 90);
assert.equal(fishReport.girlsSupported, 1);
assert.equal(JSON.stringify(fishReport).includes('Sensitive Example Name'), false);
assert.equal(JSON.stringify(fishReport).includes('guardianInfo'), false);

const privacyConfig: ReportConfig = {
  title: 'Privacy check',
  periodLabel: '2026',
  generatedBy: 'Manager',
  blockerOverrideReason: 'Approved for a test fixture.',
  hideIdentifyingDetails: true,
  structuredTables: [{
    title: 'Imported details',
    headers: ['Name', 'School', 'Summary'],
    rows: [['Sensitive Example Name', 'Example School', 'Sensitive Example Name attended Example School']],
  }],
  includeSections: {
    executiveSummary: true,
    statistics: true,
    girlsList: true,
    householdsList: true,
    educationalFollowUps: true,
    healthFollowUps: true,
    familyFollowUps: true,
    householdActivities: true,
    expenditure: true,
    rentPayments: true,
    budgets: true,
    workplans: true,
    schedules: true,
    photoGallery: true,
  },
};
const privacyData = filterDataForReport(sourceDb, privacyConfig);
assert.equal(privacyData.girls[0].fullName, 'Girl 1');
assert.equal(privacyData.girls[0].school, '');
assert.equal(privacyData.health.length, 0);
assert.equal(privacyData.family.length, 0);
assert.equal(privacyData.photos.length, 0);
const privacyDoc = await generateWordReport(sourceDb, privacyConfig);
const privacyDocArchive = await JSZip.loadAsync(await privacyDoc.arrayBuffer());
const privacyDocXml = await privacyDocArchive.file('word/document.xml')?.async('string');
assert.ok(!privacyDocXml?.includes('Sensitive Example Name'));
assert.ok(!privacyDocXml?.includes('Example School'));
assert.ok(privacyDocXml?.includes('[hidden]'));
const privacyWorkbook = XLSX.read(generateExcelWorkbook(sourceDb, privacyConfig), { type: 'array' });
assert.ok(!JSON.stringify(privacyWorkbook.Sheets).includes('Sensitive Example Name'));
assert.ok(!JSON.stringify(privacyWorkbook.Sheets).includes('Example School'));
const privacyPdf = await generatePdfReport(sourceDb, privacyConfig);
const privacyPdfText = await privacyPdf.text();
assert.ok(!privacyPdfText.includes('Sensitive Example Name'));
assert.ok(!privacyPdfText.includes('Example School'));

const noLogReport = assembleSponsorReport(emptyDb, {
  ...baseOptions,
  programmeId: 'fish-chicken',
});
assert.equal(noLogReport.programmes.length, 1);
assert.equal(noLogReport.programmes[0].budgeted, 0);

const narrative = generateReportNarrative({
  audience: 'Trustee',
  periodLabel: '2026',
  girlsSupported: 12,
  programmeCount: 3,
  budgeted: 100,
  actual: 120,
  workplanCompletionPercent: 50,
  openWorkplans: 2,
});
assert.match(narrative, /Trustee report for 2026/);
assert.match(narrative, /exceed the attributed budget by MWK 20/);

console.log('report service tests passed');
