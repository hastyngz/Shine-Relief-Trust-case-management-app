import * as XLSX from 'xlsx';
import {
  AppDatabase,
  Girl,
  Household,
  HealthFollowUp,
  HistoricalCaseRecord,
  HouseholdActivity,
  WorkplanItem,
  EarlyYearsRecord,
  PhotoAttachment,
  ImportAuditRecord,
  ImportPreviewItem,
  Person,
  PersonType,
  PersonSourceDocument,
  ContactRecord,
  BudgetItem,
  ProcurementList,
  ProjectProjection,
  StaffUser,
  PayrollRecord,
  EmployeeRecord,
  SalaryHistoryRecord,
} from '../types';
import { generateFollowUpId, generatePersonId, saveDatabase } from '../utils/storage';
import { auth } from '../firebase';
import {
  persistGirlToFirestore,
  persistHouseholdToFirestore,
  persistEduFollowUpToFirestore,
  persistHealthFollowUpToFirestore,
  persistFamilyFollowUpToFirestore,
  persistHistoricalCaseRecordToFirestore,
  persistHouseholdActivityToFirestore,
  persistWorkplanItemToFirestore,
  persistBudgetItemToFirestore,
  persistPayrollRecordToFirestore,
  persistPhase2Record,
  persistEarlyYearsRecordToFirestore,
  persistPersonToFirestore,
  persistImportAuditToFirestore,
  persistEmployeeRecordToFirestore,
  persistEmployeeSalaryHistoryToFirestore,
  appendEmployeeAuditLog,
} from './firestoreSync';
import { parseDocxProgressReport, ParsedDocxReportResult } from './docxParserService';
import {
  addContactInteraction,
  ConfirmedContactCandidate,
  createContact,
  detectContactEntities,
  detectRosterContacts,
} from './contactsService';
import { getDueDateRange } from './ingestionRules';
import { analyzeSpreadsheetWorkbook, SpreadsheetAnalysis } from './spreadsheetImport/detector';
import { createSpreadsheetImportPreview, SpreadsheetImportPreview } from './spreadsheetImport/importers';

function employeeImportWriteError(collectionName: string, recordId: string, error: unknown): Error {
  const details = error instanceof Error ? error.message : String(error);
  const isPermissionDenied = typeof error === 'object' && error !== null
    && 'code' in error && (error as { code?: unknown }).code === 'permission-denied'
    || /missing or insufficient permissions|permission-denied/i.test(details);
  return new Error(
    isPermissionDenied
      ? `Permission denied writing ${collectionName}/${recordId}`
      : `Failed writing ${collectionName}/${recordId}: ${details}`,
    { cause: error },
  );
}

export interface FileAnalysisResult {
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'docx';
  sheetsOrSections: string[];
  rawRows: Array<Record<string, any>>;
  suggestedEntity: 'girl' | 'person' | 'household' | 'educationalFollowUp' | 'healthFollowUp' | 'familyFollowUp' | 'general';
  docxResult?: ParsedDocxReportResult;
  spreadsheetAnalysis?: SpreadsheetAnalysis;
  spreadsheetImportPreview?: SpreadsheetImportPreview;
  detectedContacts: ReturnType<typeof detectContactEntities>;
}

/**
 * Parses an Excel (.xlsx / .xls) file into structured raw row objects
 */
export async function parseExcelFile(
  file: File,
  excludedNames: string[] = [],
  staff: StaffUser[] = [],
  employees: EmployeeRecord[] = [],
): Promise<FileAnalysisResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellFormula: true,
    cellNF: true,
    cellText: true,
  });
  const spreadsheetAnalysis = analyzeSpreadsheetWorkbook(workbook);
  const spreadsheetImportPreview = createSpreadsheetImportPreview(
    workbook, spreadsheetAnalysis, spreadsheetAnalysis.detectedKind, staff, employees, file.name,
  );
  const sheetNames = workbook.SheetNames;
  const primarySheet = workbook.Sheets[sheetNames[0]];
  const rawRows: Array<Record<string, any>> = XLSX.utils.sheet_to_json(primarySheet, { defval: '' });

  // Guess entity type based on header keys
  const sample = rawRows[0] || {};
  const keysLower = Object.keys(sample).map((k) => k.toLowerCase());

  let suggestedEntity: FileAnalysisResult['suggestedEntity'] = 'girl';
  if (keysLower.some((k) => k.includes('house') && !k.includes('school'))) {
    suggestedEntity = 'household';
  } else if (
    keysLower.some(
      (k) => k.includes('academic') || k.includes('exam') || k.includes('term') || k.includes('subject')
    )
  ) {
    suggestedEntity = 'educationalFollowUp';
  } else if (
    keysLower.some(
      (k) => k.includes('health') || k.includes('clinic') || k.includes('complaint') || k.includes('hospital')
    )
  ) {
    suggestedEntity = 'healthFollowUp';
  } else if (
    keysLower.some(
      (k) => k.includes('family') || (k.includes('guardian') && keysLower.some((key) => key.includes('visit')))
    )
  ) {
    suggestedEntity = 'familyFollowUp';
  } else if (
    keysLower.some(
      (k) =>
        k.includes('person') ||
        k.includes('contact') ||
        k.includes('persontype') ||
        k.includes('stakeholder') ||
        k.includes('organisation') ||
        k.includes('organization') ||
        k.includes('institution') ||
        k.includes('pastor') ||
        k.includes('teacher') ||
        (k.includes('role') &&
          keysLower.some(
            (key) => key.includes('organisation') || key.includes('organization') || key.includes('name')
          ))
    )
  ) {
    suggestedEntity = 'person';
  }

  const extension = file.name.endsWith('.xls') ? 'xls' : 'xlsx';
  return {
    fileName: file.name,
    fileType: extension,
    sheetsOrSections: sheetNames,
    rawRows,
    suggestedEntity,
    spreadsheetAnalysis,
    spreadsheetImportPreview,
    detectedContacts: detectRosterContacts(rawRows, { excludedNames }),
  };
}

/**
 * Parses a Word (.docx) narrative progress report using deep section and pattern extraction
 */
export async function parseDocxFile(
  file: File,
  db: AppDatabase,
  currentUser: StaffUser
): Promise<FileAnalysisResult> {
  const docxResult = await parseDocxProgressReport(file, db, currentUser);

  // Flatten preview items to raw rows if needed for generic views
  const rawRows = docxResult.items.map((item, idx) => ({
    Index: idx + 1,
    Classification: item.classificationLabel || item.classification,
    Summary: item.summary,
    Action: item.actionProposed,
    ReportingPeriod: item.reportingPeriod,
    Target: item.matchedName || 'Programme / Communal',
  }));

  return {
    fileName: file.name,
    fileType: 'docx',
    sheetsOrSections: [
      'Narrative Overview',
      'Historical Girl Records',
      'Group & Programme Activities',
      'Early Years Programme',
      'Agriculture & Solar Irrigation',
      'Workplan Priorities',
      'Pictorial Highlights',
    ],
    rawRows,
    suggestedEntity: 'general',
    docxResult,
    detectedContacts: detectContactEntities(docxResult.rawText, {
      authorName: docxResult.metadata.author,
      excludedNames: db.girls.map((girl) => girl.fullName),
    }),
  };
}

/**
 * Match and analyze imported Excel rows against current live database.
 * CRITICAL RULE: Older dates or historical school/classes become HISTORICAL_RECORD,
 * never overwriting existing profile data!
 */
export function analyzeImportRows(
  rawRows: Array<Record<string, any>>,
  targetEntity: 'girl' | 'person' | 'household' | 'educationalFollowUp' | 'healthFollowUp' | 'familyFollowUp',
  db: AppDatabase,
  sourceFileName: string,
  currentUser: StaffUser
): ImportPreviewItem[] {
  const previewItems: ImportPreviewItem[] = [];

  // Helper maps for existing girls
  const girlById = new Map(db.girls.map((g) => [g.id.toLowerCase().trim(), g]));
  const girlByName = new Map(db.girls.map((g) => [g.fullName.toLowerCase().trim(), g]));

  rawRows.forEach((row, rowIndex) => {
    const tempId = `preview_${Date.now()}_${rowIndex}`;

    const findVal = (...keys: string[]): string => {
      for (const k of keys) {
        for (const rowKey of Object.keys(row)) {
          if (rowKey.toLowerCase().replace(/[^a-z0-9]/g, '') === k.toLowerCase().replace(/[^a-z0-9]/g, '')) {
            return String(row[rowKey]).trim();
          }
        }
      }
      return '';
    };

    if (targetEntity === 'girl') {
      const girlId = findVal('girlid', 'id', 'sgid', 'code');
      const fullName = findVal('fullname', 'name', 'girlname', 'studentname');
      const dob = findVal('dateofbirth', 'dob', 'birthdate');
      const school = findVal('school', 'currentschool', 'schoolname');
      const classLevel = findVal('classlevel', 'class', 'grade', 'form');
      const guardianName = findVal('guardianname', 'guardian', 'parent');
      const guardianPhone = findVal('guardianphone', 'phone', 'contact');
      const guardianRelation = findVal('guardianrelation', 'relation', 'relationship');
      const recordDate = findVal('date', 'reportdate', 'year', 'recorddate');

      if (!fullName && !girlId) {
        return; // Skip empty rows
      }

      // Check for match in database
      const matchedGirl =
        (girlId && girlById.get(girlId.toLowerCase())) ||
        (fullName && girlByName.get(fullName.toLowerCase()));

      const isDateUnknown = !recordDate || isNaN(new Date(recordDate).getTime());

      if (!matchedGirl) {
        // Brand new girl
        previewItems.push({
          tempId,
          resultType: 'NEW_RECORD',
          targetEntity: 'girl',
          classification: 'INDIVIDUAL_GIRL_HISTORICAL',
          classificationLabel: 'Individual Girl (New Beneficiary)',
          matchedId: girlId || undefined,
          matchedName: fullName,
          recordDate: recordDate || undefined,
          isDateUnknown,
          summary: `New Beneficiary: ${fullName || 'Unnamed'} (Initial Profile Entry)`,
          extractedData: {
            id: girlId || `SG-${String(db.girls.length + previewItems.length + 1).padStart(3, '0')}`,
            fullName: fullName || 'Unnamed Girl',
            dateOfBirth: dob,
            gender: 'Female',
            school,
            classLevel,
            dateAdmitted: recordDate,
            householdId: '',
            status: 'Active',
            guardianInfo: {
              name: guardianName,
              relationship: guardianRelation,
              phone: guardianPhone,
              villageOrLocation: '',
              situationNotes: '',
            },
            notes: `Imported from ${sourceFileName}${!dob ? '. Date of birth was not provided in the source.' : ''}`,
          },
          isHistorical: false,
          selected: true,
        });
      } else {
        // Girl exists: CHECK FOR HISTORICAL RECORD VS PROFILE UPDATE
        const isOlderRecord = recordDate && new Date(recordDate) < new Date('2026-01-01');

        if (isOlderRecord) {
          previewItems.push({
            tempId,
            resultType: 'HISTORICAL_RECORD',
            targetEntity: 'girl',
            classification: 'INDIVIDUAL_GIRL_HISTORICAL',
            classificationLabel: 'Individual Girl Historical Record',
            matchedId: matchedGirl.id,
            matchedName: matchedGirl.fullName,
            recordDate,
            isDateUnknown,
            summary: `Historical Record for ${matchedGirl.fullName} (${matchedGirl.id}): ${school || matchedGirl.school} - ${classLevel || matchedGirl.classLevel} [Period: ${recordDate}]`,
            originalSnippet: JSON.stringify(row),
            actionProposed: 'Add Historical Educational Record',
            extractedData: {
              girlId: matchedGirl.id,
              recordType: 'school_class',
              eventDate: recordDate,
              isDateUnknown,
              title: `Historical Class/School: ${classLevel || 'Standard/Form'} at ${school || matchedGirl.school}`,
              description: `Recorded in ${sourceFileName}. Prior educational placement preserved safely without overwriting current ${matchedGirl.classLevel} status.`,
              historicalSchool: school || matchedGirl.school,
              historicalClass: classLevel || matchedGirl.classLevel,
              historicalGuardian: guardianName || matchedGirl.guardianInfo?.name,
              source: {
                originalFileName: sourceFileName,
                fileType: 'xlsx',
                importedAt: new Date().toISOString(),
                importedByUid: currentUser.uid,
                importedByName: currentUser.fullName,
                documentDate: recordDate,
              },
            },
            currentData: matchedGirl,
            isHistorical: true,
            selected: true,
          });
        } else {
          // Check for profile differences
          const diffs: Array<{ field: string; currentVal: any; importedVal: any }> = [];
          if (school && school !== matchedGirl.school) {
            diffs.push({ field: 'school', currentVal: matchedGirl.school, importedVal: school });
          }
          if (classLevel && classLevel !== matchedGirl.classLevel) {
            diffs.push({ field: 'classLevel', currentVal: matchedGirl.classLevel, importedVal: classLevel });
          }
          if (guardianPhone && guardianPhone !== matchedGirl.guardianInfo?.phone) {
            diffs.push({
              field: 'guardianPhone',
              currentVal: matchedGirl.guardianInfo?.phone,
              importedVal: guardianPhone,
            });
          }

          if (diffs.length === 0) {
            previewItems.push({
              tempId,
              resultType: 'NO_CHANGE',
              targetEntity: 'girl',
              matchedId: matchedGirl.id,
              matchedName: matchedGirl.fullName,
              isDateUnknown: false,
              summary: `${matchedGirl.fullName} (${matchedGirl.id}): All fields identical to current database record.`,
              extractedData: {},
              currentData: matchedGirl,
              isHistorical: false,
              selected: false,
            });
          } else {
            previewItems.push({
              tempId,
              resultType: 'PROFILE_UPDATE',
              targetEntity: 'girl',
              matchedId: matchedGirl.id,
              matchedName: matchedGirl.fullName,
              recordDate: recordDate || undefined,
              isDateUnknown,
              summary: `Update current profile for ${matchedGirl.fullName} (${matchedGirl.id}) with recent changes`,
              extractedData: {
                school: school || matchedGirl.school,
                classLevel: classLevel || matchedGirl.classLevel,
                guardianInfo: {
                  ...matchedGirl.guardianInfo,
                  phone: guardianPhone || matchedGirl.guardianInfo?.phone || '',
                },
              },
              currentData: matchedGirl,
              differences: diffs,
              isHistorical: false,
              selected: true,
            });
          }
        }
      }
    } else if (targetEntity === 'educationalFollowUp') {
      const girlIdRaw = findVal('girlid', 'id', 'sgid');
      const girlNameRaw = findVal('name', 'girlname', 'fullname', 'student');
      const date = findVal('date', 'visitdate', 'followupdate');
      const school = findVal('school', 'schoolname');
      const classLevel = findVal('class', 'classlevel');
      const issue = findVal('academicissue', 'issue', 'concern');
      const support = findVal('support', 'supportprovided', 'intervention');
      const outcome = findVal('outcome', 'progressoutcome', 'progress');
      const recommendations = findVal('recommendations', 'nextsteps');

      const matchedGirl =
        (girlIdRaw ? girlById.get(girlIdRaw.toLowerCase()) : undefined) ||
        (girlNameRaw ? girlByName.get(girlNameRaw.toLowerCase()) : undefined);

      const isDateUnknown = !date || isNaN(new Date(date).getTime());

      previewItems.push({
        tempId,
        resultType: matchedGirl ? 'NEW_RECORD' : 'POSSIBLE_DUPLICATE',
        targetEntity: 'educationalFollowUp',
        matchedId: matchedGirl?.id,
        matchedName: matchedGirl?.fullName || girlNameRaw || 'Unmatched Girl',
        recordDate: date || undefined,
        isDateUnknown,
        summary: `Educational follow-up: ${matchedGirl?.fullName || girlNameRaw || 'Unknown'} - ${
          support || issue || 'Term assessment'
        }`,
        extractedData: {
          girlId: matchedGirl?.id || db.girls[0]?.id || 'SG-001',
          date: date || new Date().toISOString().slice(0, 10),
          school: school || matchedGirl?.school || 'School',
          classLevel: classLevel || matchedGirl?.classLevel || 'Standard 1',
          academicIssue: issue || 'General academic review',
          problemsExperienced: issue || 'None reported',
          subjectsNeedingSupport: '',
          supportProvided: support || 'Monitoring and counseling',
          progressOutcome: outcome || 'Satisfactory progress',
          furtherActionRequired: false,
          recommendations: recommendations || 'Continue term monitoring',
          recordedBy: currentUser.fullName,
        },
        isHistorical: false,
        selected: true,
        warningOrConflict: !matchedGirl
          ? `Beneficiary "${girlNameRaw || girlIdRaw}" not found in current caseload. Verify mapping before saving.`
          : undefined,
      });
    } else if (targetEntity === 'healthFollowUp') {
      const girlIdRaw = findVal('girlid', 'sgid', 'beneficiaryid');
      const girlNameRaw = findVal('girlname', 'fullname', 'beneficiary', 'student');
      const date = findVal('date', 'visitdate', 'medicaldate', 'reportdate');
      const matchedGirl =
        (girlIdRaw ? girlById.get(girlIdRaw.toLowerCase()) : undefined) ||
        (girlNameRaw ? girlByName.get(girlNameRaw.toLowerCase()) : undefined);
      const actionRequired = findVal('furtherActionRequired', 'followUpRequired', 'followUpNeeded').toLowerCase();
      const isDateUnknown = !date || isNaN(new Date(date).getTime());

      previewItems.push({
        tempId,
        resultType: matchedGirl ? 'NEW_RECORD' : 'IMPORT_ERROR',
        targetEntity: 'healthFollowUp',
        classification: 'HEALTH_MEDICAL_FOLLOW_UP',
        classificationLabel: 'Health / Medical Follow-up',
        matchedId: matchedGirl?.id,
        matchedName: matchedGirl?.fullName || girlNameRaw || 'Unmatched Girl',
        recordDate: date || undefined,
        isDateUnknown,
        summary: `Health follow-up: ${matchedGirl?.fullName || girlNameRaw || 'Unmatched Girl'} - ${findVal('reasonForVisit', 'reason', 'visitreason', 'healthissue', 'complaint') || 'Medical information requires review'}`,
        originalSnippet: JSON.stringify(row),
        actionProposed: 'Add health follow-up record',
        extractedData: {
          girlId: matchedGirl?.id || '',
          date,
          reasonForVisit: findVal('reasonForVisit', 'reason', 'visitreason'),
          healthIssueComplaint: findVal('healthIssueComplaint', 'complaint', 'healthissue', 'issue'),
          medicalFacility: findVal('medicalFacility', 'facility', 'clinic', 'hospital'),
          healthProfessional: findVal('healthProfessional', 'professional', 'clinician', 'provider') || undefined,
          treatmentProvided: findVal('treatmentProvided', 'treatment', 'careprovided'),
          medication: findVal('medication', 'medicines', 'prescription') || undefined,
          referral: findVal('referral', 'referredto') || undefined,
          notes: findVal('notes', 'comments', 'remarks') || undefined,
          outcome: findVal('outcome', 'result'),
          furtherActionRequired: ['yes', 'true', '1'].includes(actionRequired),
          recommendations: findVal('recommendations', 'nextsteps', 'followupaction'),
          nextFollowUpDate: findVal('nextFollowUpDate', 'followUpDate', 'nextVisitDate') || undefined,
          recordedBy: currentUser.fullName,
        },
        isHistorical: false,
        selected: Boolean(matchedGirl),
        warningOrConflict: !matchedGirl
          ? `Girl "${girlNameRaw || girlIdRaw || 'not identified'}" could not be matched. This row cannot be imported until it is matched to an existing girl.`
          : isDateUnknown
            ? 'The source does not contain a reliable visit date. Review before confirming.'
            : undefined,
      });
    } else if (targetEntity === 'person') {
      const fullName = findVal('name', 'fullname', 'contactname', 'person', 'stakeholder', 'staffname', 'teacher', 'pastor');
      const roleRaw = (findVal('role', 'persontype', 'type', 'position', 'title') || 'Other') as PersonType;
      const org = findVal('organisation', 'organization', 'org', 'church', 'school', 'agency');
      const title = findVal('positiontitle', 'title', 'position', 'designation');
      const phone = findVal('phone', 'phonenumber', 'telephone', 'mobile', 'cell', 'contact');
      const email = findVal('email', 'emailaddress');
      const location = findVal('location', 'village', 'address', 'city', 'district');
      const workplace = findVal('workplace', 'affiliation', 'school', 'church', 'centre');
      const relation = findVal('relationship', 'relationshiptogirl', 'relation');
      const girlNameOrId = findVal('girl', 'girlname', 'beneficiary', 'student');
      const notes = findVal('notes', 'comments', 'remarks', 'context');

      if (!fullName) return;

      const matchedGirl = girlNameOrId
        ? girlById.get(girlNameOrId.toLowerCase()) || girlByName.get(girlNameOrId.toLowerCase())
        : undefined;

      const existingPerson = (db.people || []).find(
        (p) => p.fullName.toLowerCase().trim() === fullName.toLowerCase().trim()
      );

      let resultType: ImportPreviewItem['resultType'] = 'NEW_PERSON';
      let matchedId: string | undefined = undefined;
      let matchedName: string | undefined = undefined;
      let matchConfidence: ImportPreviewItem['matchConfidence'] = 'none';
      let actionProposed = 'Register in People Directory';
      let matchedPersonAction: ImportPreviewItem['matchedPersonAction'] = 'REGISTER_PERSON';
      let warningOrConflict: string | undefined = undefined;

      if (existingPerson) {
        resultType = 'EXISTING_PERSON_MATCHED';
        matchedId = existingPerson.id;
        matchedName = existingPerson.fullName;
        matchConfidence = 'exact';
        actionProposed = 'Update / Link with Existing Directory Contact';
        matchedPersonAction = 'ADD_TO_EXISTING_PERSON';
      } else {
        const partialMatches = (db.people || []).filter((p) => {
          const pParts = p.fullName.toLowerCase().split(/\s+/);
          const cParts = fullName.toLowerCase().split(/\s+/);
          return pParts.some((part) => cParts.includes(part));
        });

        if (partialMatches.length > 0) {
          resultType = 'POSSIBLE_DUPLICATE_PERSON';
          matchedId = partialMatches[0].id;
          matchedName = partialMatches[0].fullName;
          matchConfidence = 'possible_match';
          actionProposed = 'Review Possible Duplicate Contact';
          matchedPersonAction = 'MARK_FOR_REVIEW';
          warningOrConflict = `Similar contact name found: "${partialMatches[0].fullName}" (${partialMatches[0].id}).`;
        } else {
          resultType = 'NEW_PERSON';
          actionProposed = 'Register in People Directory (No system login access)';
          matchedPersonAction = 'REGISTER_PERSON';
        }
      }

      previewItems.push({
        tempId,
        resultType,
        targetEntity: 'person',
        classification: 'PEOPLE_DIRECTORY_RECORD',
        classificationLabel: 'People / Contacts Directory',
        matchedId,
        matchedName,
        matchConfidence,
        summary: `${fullName} (${roleRaw}) - ${org || workplace || 'Contact/Stakeholder'}`,
        detectedRole: roleRaw,
        detectedOrganisation: org,
        detectedAffiliation: workplace,
        detectedRelationship: relation,
        actionProposed,
        matchedPersonAction,
        warningOrConflict,
        isDateUnknown: true,
        extractedData: {
          fullName,
          personType: roleRaw,
          organisation: org || '',
          positionTitle: title || roleRaw,
          phoneNumber: phone || '',
          email: email || '',
          location: location || '',
          workplaceOrAffiliation: workplace || '',
          relationshipToGirl: relation || '',
          linkedGirlIds: matchedGirl ? [matchedGirl.id] : [],
          linkedGirlNames: matchedGirl ? [matchedGirl.fullName] : (girlNameOrId ? [girlNameOrId] : []),
          linkedHouseholdIds: [],
          linkedHouseholdNames: [],
          notes: notes || '',
        },
        isHistorical: false,
        selected: true,
      });
    }
  });

  return previewItems;
}

/**
 * Commits approved import preview items to Firestore and updates local database
 */
export async function commitImportBatch(
  approvedItems: ImportPreviewItem[],
  auditRecord: Omit<ImportAuditRecord, 'id'>,
  db: AppDatabase,
  onProgress?: (processed: number, total: number) => void,
  approvedContacts: ConfirmedContactCandidate[] = [],
  confirmedDueDatePeriods: Record<string, string> = {}
): Promise<{ success: boolean; createdAudit: ImportAuditRecord }> {
  const authenticatedUid = auth.currentUser?.uid;
  const importingEmployee = approvedItems.some((item) => item.selected && item.targetEntity === 'employee');
  if (importingEmployee && !authenticatedUid) {
    throw new Error('Employee payroll import requires an authenticated Firebase user.');
  }
  if (importingEmployee && auditRecord.importedByUid !== authenticatedUid) {
    throw new Error('Employee payroll import actor does not match the signed-in Firebase user. Reopen Import and try again.');
  }
  const employeeActorUid = authenticatedUid || auditRecord.importedByUid;
  const updatedDb: AppDatabase = {
    ...db,
    girls: [...db.girls],
    households: [...db.households],
    educationalFollowUps: [...db.educationalFollowUps],
    healthFollowUps: [...db.healthFollowUps],
    familyFollowUps: [...db.familyFollowUps],
    householdActivities: [...(db.householdActivities || [])],
    workplans: [...(db.workplans || [])],
    budgets: [...(db.budgets || [])],
    procurementLists: [...(db.procurementLists || [])],
    projectProjections: [...(db.projectProjections || [])],
    payrollRecords: [...(db.payrollRecords || [])],
    employees: [...(db.employees || [])],
    earlyYearsRecords: [...(db.earlyYearsRecords || [])],
    attachments: [...(db.attachments || [])],
    historicalRecords: [...(db.historicalRecords || [])],
    importAudits: [...(db.importAudits || [])],
    contacts: [...(db.contacts || [])],
  };

  let processed = 0;
  const total = approvedItems.length + approvedContacts.length;
  const auditId = generateFollowUpId('AUD');
  let importedEmployees = 0;
  let matchedEmployees = 0;
  let importedPayrollRecords = 0;

  for (const item of approvedItems) {
    if (!item.selected) continue;
    const spreadsheetWorkplan = item.extractedData.spreadsheetKind === 'workplan-matrix';
    const createsWorkplan = item.classification === 'WORKPLAN_PRIORITY' || item.targetEntity === 'workplan' || item.extractedData.createWorkplan === true;
    const dueDatePeriod = createsWorkplan ? confirmedDueDatePeriods[item.tempId] : undefined;
    const dueDateRange = dueDatePeriod ? getDueDateRange(dueDatePeriod) : null;
    if (createsWorkplan && !spreadsheetWorkplan && !dueDateRange) {
      throw new Error(`A valid due-date period is required for Workplan item: ${item.title || item.summary}`);
    }
    let linkedRecordId: string | undefined;

    // 1. Historical Case Records (Preserves current profile completely)
    if (item.resultType === 'HISTORICAL_RECORD' || item.classification === 'INDIVIDUAL_GIRL_HISTORICAL') {
      const newHist: HistoricalCaseRecord = {
        id: generateFollowUpId('HIST'),
        girlId: item.matchedId || item.extractedData.girlId || 'SG-001',
        recordType: item.extractedData.recordType || 'school_class',
        eventDate: item.extractedData.eventDate,
        isDateUnknown: item.isDateUnknown,
        title: item.title || item.extractedData.title || 'Historical Document Record',
        description: item.extractedData.description || item.summary,
        historicalSchool: item.extractedData.historicalSchool,
        historicalClass: item.extractedData.historicalClass,
        historicalGuardian: item.extractedData.historicalGuardian,
        historicalSupport: item.extractedData.historicalSupport,
        outcome: item.extractedData.outcome,
        challenges: item.extractedData.challenges,
        source: item.extractedData.source || {
          originalFileName: auditRecord.fileName,
          fileType: auditRecord.fileType,
          importedAt: new Date().toISOString(),
          importedByUid: auditRecord.importedByUid,
          importedByName: auditRecord.importedByName,
          documentDate: item.reportingPeriod,
        },
        createdAt: new Date().toISOString(),
      };
      updatedDb.historicalRecords?.unshift(newHist);
      await persistHistoricalCaseRecordToFirestore(newHist);
    }
    // 2. Group / Programme Activity or Agriculture Activity
    else if (
      item.classification === 'GROUP_ACTIVITY' ||
      item.classification === 'PROGRAMME_ACTIVITY' ||
      item.classification === 'AGRICULTURE_PRACTICAL_SKILLS' ||
      item.targetEntity === 'activity'
    ) {
      const newActivity: HouseholdActivity = {
        id: generateFollowUpId('ACT'),
        householdId: item.extractedData.householdId || '',
        date: item.recordDate || new Date().toISOString().slice(0, 10),
        activityName: item.extractedData.activityName || item.title || 'Group Activity',
        activityType: item.extractedData.activityType || 'Group activity',
        activityCategory: item.extractedData.activityCategory || item.extractedData.activityType,
        participantCount: item.extractedData.participantCount,
        participatingGirlIds: item.extractedData.participatingGirlIds || [],
        description: item.extractedData.description || item.summary,
        outcome: item.extractedData.outcome || '',
        challenges: item.extractedData.challenges || '',
        supportProvided: item.extractedData.supportProvided || '',
        recommendations: item.extractedData.recommendations || '',
        furtherActionRequired: item.extractedData.furtherActionRequired || false,
        recordedBy: auditRecord.importedByName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      linkedRecordId = newActivity.id;
      updatedDb.householdActivities.unshift(newActivity);
      await persistHouseholdActivityToFirestore(newActivity);
    }
    // 3. Early Years Programme Record
    else if (item.classification === 'EARLY_YEARS_RECORD' || item.targetEntity === 'earlyYears') {
      const newEarlyYears: EarlyYearsRecord = {
        id: generateFollowUpId('EY'),
        reportingPeriod: item.extractedData.reportingPeriod || item.reportingPeriod || 'July to September 2026',
        previousEnrolment: item.extractedData.previousEnrolment,
        enrolled: item.extractedData.enrolled,
        continuing: item.extractedData.continuing,
        graduates: item.extractedData.graduates,
        targetEnrolment: item.extractedData.targetEnrolment,
        teacherCaregiverRatio: item.extractedData.teacherCaregiverRatio,
        ratioTarget: item.extractedData.ratioTarget,
        teachersRequired: item.extractedData.teachersRequired,
        teacherCount: item.extractedData.teacherCount,
        caregiverCount: item.extractedData.caregiverCount,
        communityVolunteers: item.extractedData.communityVolunteers,
        programmeStartDate: item.extractedData.programmeStartDate,
        classesStartDate: item.extractedData.classesStartDate,
        feedingProgrammeStartDate: item.extractedData.feedingProgrammeStartDate,
        notes: item.extractedData.notes || item.summary,
        sourceDocument: auditRecord.fileName,
        createdAt: new Date().toISOString(),
        createdBy: auditRecord.importedByName,
      };
      linkedRecordId = newEarlyYears.id;
      if (!updatedDb.earlyYearsRecords) updatedDb.earlyYearsRecords = [];
      updatedDb.earlyYearsRecords.unshift(newEarlyYears);
      await persistEarlyYearsRecordToFirestore(newEarlyYears);
    }
    else if (item.targetEntity === 'employee') {
      const data = item.extractedData;
      const employeeId = data.matchedEmployeeId || item.matchedId || generateFollowUpId('EMP');
      const now = new Date().toISOString();
      const existingIndex = updatedDb.employees!.findIndex((employee) => employee.id === employeeId);
      const existingEmployee = existingIndex >= 0 ? updatedDb.employees![existingIndex] : undefined;
      const importedSalaryPeriod = String(data.latestSourcePeriod || '');
      const importedPaymentPeriod = String(data.latestWorkbookPaymentPeriod || '');
      const useImportedSalary = Boolean(Number(data.currentSalary) > 0
        && (!existingEmployee?.latestSalaryPeriod || importedSalaryPeriod >= existingEmployee.latestSalaryPeriod));
      const useImportedEmploymentStatus = Boolean(importedPaymentPeriod
        && (!existingEmployee?.latestWorkbookPaymentPeriod || importedPaymentPeriod >= existingEmployee.latestWorkbookPaymentPeriod));
      const importedOtherAmounts = Array.isArray(data.otherPayrollAmounts)
        ? data.otherPayrollAmounts as Array<{ type: string; amount: number; payPeriod?: string; sourceReference?: string }>
        : [];
      const employee: EmployeeRecord = {
        ...existingEmployee,
        id: employeeId,
        fullName: String(data.employeeName || item.title || '').trim(),
        department: data.department || existingEmployee?.department,
        positionTitle: data.positionTitle || existingEmployee?.positionTitle,
        sourceYear: Number(data.sourceYear) || existingEmployee?.sourceYear,
        employmentStatus: useImportedEmploymentStatus
          ? data.employmentStatus
          : existingEmployee?.employmentStatus || data.employmentStatus || 'Active',
        needsEmploymentReview: false,
        salaryMWK: useImportedSalary ? Number(data.currentSalary) : existingEmployee?.salaryMWK || 0,
        latestSalaryPeriod: useImportedSalary ? importedSalaryPeriod : existingEmployee?.latestSalaryPeriod,
        latestWorkbookPaymentPeriod: useImportedEmploymentStatus
          ? importedPaymentPeriod
          : existingEmployee?.latestWorkbookPaymentPeriod,
        otherPayrollAmounts: Array.from(new Map([
          ...(existingEmployee?.otherPayrollAmounts || []),
          ...importedOtherAmounts,
        ].map((amount) => [amount.sourceReference || `${amount.type}|${amount.payPeriod || ''}|${amount.amount}`, amount])).values()),
        source: {
          fileName: auditRecord.fileName,
          importedAt: now,
          importedByUid: employeeActorUid,
          importedByName: auditRecord.importedByName,
        },
        createdAt: existingEmployee?.createdAt || now,
        updatedAt: now,
        createdBy: existingEmployee?.createdBy || auditRecord.importedByName,
        updatedBy: auditRecord.importedByName,
      };
      if (existingIndex >= 0) updatedDb.employees![existingIndex] = employee;
      else updatedDb.employees!.unshift(employee);
      importedEmployees += existingIndex >= 0 ? 0 : 1;
      matchedEmployees += data.matchedEmployeeId ? 1 : 0;

      const history = Array.isArray(data.salaryHistory)
        ? data.salaryHistory as Array<{ payPeriod: string; amount: number }>
        : [];
      const importedSalaryIds = new Set(employee.salaryHistoryRecordIds || []);
      let previousSalary: number | undefined;
      let currentSalaryHistoryRecordId: string | undefined;
      for (const entry of history) {
        const periodMatch = entry.payPeriod.match(/^(\d{4})-(\d{2})$/);
        if (!periodMatch || !Number.isFinite(entry.amount) || entry.amount <= 0) continue;
        const effectiveDate = `${entry.payPeriod}-01`;
        const salaryId = `SAL-${employeeId}-${entry.payPeriod}`;
        const latestPriorSalary = previousSalary;
        if (latestPriorSalary !== entry.amount && !importedSalaryIds.has(salaryId)) {
          const salaryRecord: SalaryHistoryRecord = {
            id: salaryId,
            employeeId,
            effectiveDate,
            salaryAmount: entry.amount,
            salaryFrequency: 'Monthly',
            previousSalary: latestPriorSalary,
            reasonForChange: `Imported from ${auditRecord.fileName}`,
            recordedBy: auditRecord.importedByName,
            recordedDate: now,
            notes: 'Historical salary amount from payroll spreadsheet; amount is not treated as proof of payment.',
            auditMetadata: {
              createdAt: now,
              createdByUid: employeeActorUid,
            },
          };
          try {
            await persistEmployeeSalaryHistoryToFirestore(salaryRecord);
          } catch (error) {
            throw employeeImportWriteError('employeeSalaryHistory', salaryRecord.id, error);
          }
          currentSalaryHistoryRecordId = salaryId;
          importedSalaryIds.add(salaryId);
        }
        if (latestPriorSalary !== entry.amount && !currentSalaryHistoryRecordId) {
          currentSalaryHistoryRecordId = salaryId;
        }
        previousSalary = entry.amount;

        const existingPayment = updatedDb.payrollRecords!.find((record) =>
          record.employeeId === employeeId && record.payPeriod === entry.payPeriod);
        if (!existingPayment) {
          const month = Number(periodMatch[2]);
          const payment: PayrollRecord = {
            id: `PAY-${employeeId}-${entry.payPeriod}`,
            employeeId,
            employeeName: employee.fullName,
            departmentOrProgramme: employee.department,
            payPeriod: entry.payPeriod,
            payPeriodStartDate: `${entry.payPeriod}-01`,
            payPeriodEndDate: new Date(Date.UTC(Number(periodMatch[1]), month, 0)).toISOString().slice(0, 10),
            applicableSalary: entry.amount,
            salaryHistoryRecordIds: currentSalaryHistoryRecordId ? [currentSalaryHistoryRecordId] : [],
            expectedAmount: entry.amount,
            amountPaid: 0,
            paymentStatus: 'Pending',
            notes: `Imported from ${auditRecord.fileName}; confirmation required. No payment date or paid status was supplied.`,
            createdBy: auditRecord.importedByName,
            createdByUid: employeeActorUid,
            createdAt: now,
            updatedBy: auditRecord.importedByName,
            updatedByUid: employeeActorUid,
            updatedAt: now,
          };
          updatedDb.payrollRecords!.unshift(payment);
          try {
            await persistPayrollRecordToFirestore(payment);
          } catch (error) {
            throw employeeImportWriteError('payrollRecords', payment.id, error);
          }
          importedPayrollRecords += 1;
        }
      }
      const sourceYear = Number(data.sourceYear) || Number(auditRecord.fileName.match(/\b20\d{2}\b/)?.[0]) || new Date().getFullYear();
      for (const special of importedOtherAmounts) {
        if (!['loan', 'arrears', 'gratuity'].includes(special.type) || !Number.isFinite(special.amount) || special.amount <= 0) continue;
        const payPeriod = `${special.payPeriod || String(sourceYear)}-${special.type.toUpperCase()}`;
        if (updatedDb.payrollRecords!.some((record) => record.employeeId === employeeId && record.payPeriod === payPeriod)) continue;
        const nowForSpecial = new Date().toISOString();
        const periodStart = special.payPeriod && /^\d{4}-\d{2}$/.test(special.payPeriod)
          ? `${special.payPeriod}-01`
          : `${sourceYear}-01-01`;
        const periodEnd = special.payPeriod && /^\d{4}-\d{2}$/.test(special.payPeriod)
          ? new Date(Date.UTC(Number(special.payPeriod.slice(0, 4)), Number(special.payPeriod.slice(5, 7)), 0)).toISOString().slice(0, 10)
          : `${sourceYear}-12-31`;
        const sourceSuffix = special.sourceReference
          ? `-${special.sourceReference.replace(/[^A-Za-z0-9-]/g, '-').slice(-48)}`
          : '';
        const specialRecord: PayrollRecord = {
          id: `PAY-${employeeId}-${payPeriod}${sourceSuffix}`,
          employeeId,
          employeeName: employee.fullName,
          departmentOrProgramme: employee.department,
          payPeriod,
          payPeriodStartDate: periodStart,
          payPeriodEndDate: periodEnd,
          applicableSalary: 0,
          salaryHistoryRecordIds: [],
          expectedAmount: special.amount,
          amountPaid: 0,
          paymentStatus: 'Pending',
          notes: `Imported ${special.type} amount from ${auditRecord.fileName}; requires staff review and is not treated as a confirmed payment.`,
          createdBy: auditRecord.importedByName,
          createdByUid: employeeActorUid,
          createdAt: nowForSpecial,
          updatedBy: auditRecord.importedByName,
          updatedByUid: employeeActorUid,
          updatedAt: nowForSpecial,
        };
        updatedDb.payrollRecords!.unshift(specialRecord);
        try {
          await persistPayrollRecordToFirestore(specialRecord);
        } catch (error) {
          throw employeeImportWriteError('payrollRecords', specialRecord.id, error);
        }
        importedPayrollRecords += 1;
      }
      employee.salaryHistoryRecordIds = Array.from(importedSalaryIds);
      try {
        await persistEmployeeRecordToFirestore(employee);
      } catch (error) {
        throw employeeImportWriteError('employees', employee.id, error);
      }
      const employeeImportEventId = `employee_import_${auditId}_${employeeId}`.replace(/[^A-Za-z0-9_-]/g, '_');
      try {
        await appendEmployeeAuditLog({
        employeeId,
        action: existingEmployee ? 'employee_import_updated' : 'employee_import_created',
        actorUid: employeeActorUid,
        actorName: auditRecord.importedByName,
        sourceFile: auditRecord.fileName,
        payrollRecordsImported: history.filter((entry) => !db.payrollRecords?.some((record) =>
          record.employeeId === employeeId && record.payPeriod === entry.payPeriod)).length,
        timestamp: now,
        }, employeeImportEventId);
      } catch (error) {
        throw employeeImportWriteError('employeeAuditLogs', employeeImportEventId, error);
      }
      linkedRecordId = employeeId;
    }
    // 4. Payroll payment record
    else if (item.targetEntity === 'payroll') {
      const data = item.extractedData;
      const monthMatch = String(data.payPeriod || '').match(/^(\d{4})-(\d{2})$/);
      const specialMatch = String(data.payPeriod || '').match(/^(\d{4})-(LOAN|ARREARS)$/);
      const year = Number(monthMatch?.[1] || specialMatch?.[1] || new Date().getFullYear());
      const month = Number(monthMatch?.[2] || 1);
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      const now = new Date().toISOString();
      const payroll: PayrollRecord = {
        id: generateFollowUpId('PAY'),
        employeeId: data.employeeId,
        employeeName: data.employeeName,
        departmentOrProgramme: data.department || undefined,
        payPeriod: specialMatch
          ? `${year}-${String(month).padStart(2, '0')} (${specialMatch[2]} - REVIEW)`
          : String(data.payPeriod),
        payPeriodStartDate: periodStart,
        payPeriodEndDate: periodEnd,
        applicableSalary: Number(data.amount) || 0,
        salaryHistoryRecordIds: [],
        expectedAmount: Number(data.amount) || 0,
        amountPaid: 0,
        paymentStatus: 'Pending',
        notes: [
          data.notes,
          specialMatch ? `Imported ${specialMatch[2]} amount; verify treatment before payroll processing.` : 'Imported payroll grid; payment status requires confirmation.',
        ].filter(Boolean).join(' '),
        createdBy: auditRecord.importedByName,
        createdByUid: auditRecord.importedByUid,
        createdAt: now,
        updatedBy: auditRecord.importedByName,
        updatedByUid: auditRecord.importedByUid,
        updatedAt: now,
      };
      if (!updatedDb.payrollRecords) updatedDb.payrollRecords = [];
      updatedDb.payrollRecords.unshift(payroll);
      await persistPayrollRecordToFirestore(payroll);
      linkedRecordId = payroll.id;
    }
    else if (item.targetEntity === 'procurementList') {
      const data = item.extractedData;
      const now = new Date().toISOString();
      const sourceItems = Array.isArray(data.items) ? data.items : [];
      const procurement: ProcurementList = {
        id: generateFollowUpId('PRC'),
        title: data.title || item.title || 'Imported procurement list',
        purpose: data.purpose || 'Imported item list',
        programmeId: data.programmeId,
        items: sourceItems.map((source: ProcurementList['items'][number]) => ({ ...source })),
        totalMWK: sourceItems.reduce(
          (sum: number, source: ProcurementList['items'][number]) => sum + (source.totalMWK || 0),
          0,
        ),
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        createdBy: auditRecord.importedByName,
        updatedBy: auditRecord.importedByName,
      };
      if (!updatedDb.procurementLists) updatedDb.procurementLists = [];
      updatedDb.procurementLists.unshift(procurement);
      await persistPhase2Record('procurementLists', { ...procurement });
      linkedRecordId = procurement.id;
    }
    else if (item.targetEntity === 'projectProjection') {
      const data = item.extractedData;
      const now = new Date().toISOString();
      const projection: ProjectProjection = {
        id: generateFollowUpId('PRJ'),
        programmeId: data.programmeId,
        period: data.period,
        revenueMWK: Number(data.revenueMWK) || 0,
        costLines: Array.isArray(data.costLines) ? data.costLines : [],
        netProfitMWK: typeof data.netProfitMWK === 'number' ? data.netProfitMWK : undefined,
        assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
        createdAt: now,
        updatedAt: now,
        createdBy: auditRecord.importedByName,
        updatedBy: auditRecord.importedByName,
      };
      if (!updatedDb.projectProjections) updatedDb.projectProjections = [];
      updatedDb.projectProjections.unshift(projection);
      await persistPhase2Record('projectProjections', { ...projection });
      linkedRecordId = projection.id;
    }
    else if (item.targetEntity === 'budget') {
      const data = item.extractedData;
      const now = new Date().toISOString();
      const budget: BudgetItem = {
        id: generateFollowUpId('BDG'),
        programmeId: data.programmeId,
        period: data.period || 'Annual',
        periodType: data.periodType || 'annual',
        month: data.month,
        financialYear: data.financialYear,
        programme: data.programme || 'Unassigned',
        category: data.category || 'Other',
        itemDescription: data.itemDescription || item.title || item.summary,
        unit: data.unit || 'unit',
        quantity: Number(data.quantity) || 0,
        unitCost: Number(data.unitCost) || 0,
        budgetAmount: Number(data.budgetAmount) || (Number(data.quantity) || 0) * (Number(data.unitCost) || 0),
        notes: data.notes || item.originalSnippet,
        createdAt: now,
        updatedAt: now,
        createdBy: auditRecord.importedByName,
        updatedBy: auditRecord.importedByName,
      };
      if (!updatedDb.budgets) updatedDb.budgets = [];
      updatedDb.budgets.unshift(budget);
      await persistBudgetItemToFirestore(budget);
      linkedRecordId = budget.id;
    }
    else if (item.classification === 'WORKPLAN_PRIORITY' || item.targetEntity === 'workplan') {
      const importedStart = spreadsheetWorkplan && /^\d{4}-\d{2}$/.test(item.extractedData.period || '')
        ? `${item.extractedData.period}-01`
        : undefined;
      const importedEnd = importedStart
        ? new Date(Date.UTC(Number(importedStart.slice(0, 4)), Number(importedStart.slice(5, 7)), 0)).toISOString().slice(0, 10)
        : undefined;
      const startDate = importedStart || dueDateRange?.startDate;
      const endDate = importedEnd || dueDateRange?.endDate;
      if (!startDate || !endDate) throw new Error(`Missing schedule dates for Workplan item: ${item.title || item.summary}`);
      const existingWorkplan = item.matchedId
        ? updatedDb.workplans?.find((workplan) => workplan.id === item.matchedId)
        : undefined;
      const now = new Date().toISOString();
      const progress = Number(item.extractedData.progress) || 0;
      const newWorkplan: WorkplanItem = {
        ...(existingWorkplan || {}),
        id: existingWorkplan?.id || generateFollowUpId('WP'),
        activity: item.extractedData.activity || item.title || 'Workplan Priority',
        objective: item.extractedData.objective || item.summary,
        description: item.extractedData.description || item.summary,
        period: item.extractedData.period || `${startDate} to ${endDate}`,
        periodType: item.extractedData.periodType || (dueDatePeriod?.startsWith('month:') ? 'monthly' : dueDatePeriod?.startsWith('quarter:') ? 'quarterly' : 'project'),
        dueDatePeriod,
        programmeId: item.extractedData.programmeId,
        indicatorId: item.extractedData.indicatorId,
        validity: item.extractedData.validity,
        dataSource: item.extractedData.dataSource,
        measurementMethod: item.extractedData.measurementMethod,
        narrativeOnly: item.extractedData.narrativeOnly,
        narrativeOnlyReason: item.extractedData.narrativeOnlyReason,
        managerApproved: item.extractedData.managerApproved,
        costLevel: item.extractedData.costLevel,
        domain: item.extractedData.workplanDomain || 'Programme',
        sourceRecordId: item.extractedData.sourceRecordId,
        status: item.extractedData.status || (progress >= 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'Planned'),
        progress,
        responsibleStaffId: item.extractedData.responsibleStaffId || auditRecord.importedByUid,
        responsibleStaffName: item.extractedData.responsibleStaffName || 'NOT PROVIDED IN SOURCE - REQUIRES REVIEW',
        budget: item.extractedData.budget,
        startDate,
        endDate,
        targetCount: item.extractedData.targetCount ?? 1,
        unit: item.extractedData.unit || 'activities',
        completedCount: item.extractedData.completedCount,
        location: item.extractedData.location || 'Shine Village, Malawi',
        createdAt: existingWorkplan?.createdAt || now,
        updatedAt: now,
        updatedBy: auditRecord.importedByName,
      };
      if (!updatedDb.workplans) updatedDb.workplans = [];
      if (existingWorkplan) {
        const index = updatedDb.workplans.findIndex((workplan) => workplan.id === existingWorkplan.id);
        updatedDb.workplans[index] = newWorkplan;
      } else {
        updatedDb.workplans.unshift(newWorkplan);
      }
      await persistWorkplanItemToFirestore(newWorkplan);
      linkedRecordId = newWorkplan.id;
    }
    // 5. Photographic Highlights / Embedded Photos
    else if (item.classification === 'PHOTO_HIGHLIGHT' || item.targetEntity === 'attachment') {
      if (item.photoBase64) {
        const newAttachment: PhotoAttachment = {
          id: generateFollowUpId('ATT'),
          targetType: item.extractedData.targetType || 'householdActivity',
          targetId: item.extractedData.targetId || updatedDb.households[0]?.id || 'SH-01',
          fileName: item.extractedData.fileName || 'highlight_photo.jpg',
          fileSize: item.extractedData.fileSize || 50000,
          contentType: item.photoContentType || 'image/jpeg',
          storagePath: `imports/${auditRecord.fileName}/${generateFollowUpId('ATT')}.jpg`,
          downloadUrl: item.photoBase64, // Preserves base64 directly
          caption: item.photoCaption || item.extractedData.caption || item.summary,
          category: (item.extractedData.category as any) || 'Group Activity',
          date: item.recordDate || new Date().toISOString().slice(0, 10),
          uploadedBy: {
            uid: auditRecord.importedByUid,
            name: auditRecord.importedByName,
            email: 'staff@shinerelieftrust.org',
            role: 'Staff',
          },
          createdAt: new Date().toISOString(),
        };
        if (!updatedDb.attachments) updatedDb.attachments = [];
        updatedDb.attachments.unshift(newAttachment);
      }
    }
    // 6. People Directory Record / Stakeholder Contact
    else if (item.classification === 'PEOPLE_DIRECTORY_RECORD' || item.targetEntity === 'person') {
      if (!updatedDb.people) updatedDb.people = [];

      // Check if user decided to register as a new SHINE girl instead
      if (item.matchedPersonAction === 'REGISTER_AS_NEW_GIRL') {
        const nextGirlNum = updatedDb.girls.length + 1;
        const newGirlId = `SG-${String(nextGirlNum).padStart(3, '0')}`;
        const newGirl: Girl = {
          id: newGirlId,
          fullName: item.extractedData.fullName || item.title || 'New Beneficiary',
          dateOfBirth: item.extractedData.dateOfBirth || '',
          gender: item.extractedData.gender || 'Female',
          dateAdmitted: item.extractedData.dateAdmitted || item.extractedData.dateEnrolled || '',
          status: 'Active',
          householdId: item.extractedData.householdId || '',
          school: item.extractedData.workplaceOrAffiliation || item.extractedData.historicalSchool || '',
          classLevel: item.extractedData.historicalClass || '',
          guardianInfo: {
            name: item.extractedData.guardianInfo?.name || '',
            relationship: item.extractedData.guardianInfo?.relationship || item.extractedData.relationshipToGirl || '',
            phone: item.extractedData.guardianInfo?.phone || item.extractedData.phoneNumber || '',
            villageOrLocation: item.extractedData.guardianInfo?.villageOrLocation || '',
            situationNotes: item.extractedData.guardianInfo?.situationNotes || '',
          },
          notes: `Identified from historical progress report: ${auditRecord.fileName}. ${item.originalSnippet || ''}`,
          createdBy: auditRecord.importedByName,
          updatedBy: auditRecord.importedByName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        updatedDb.girls.unshift(newGirl);
        await persistGirlToFirestore(newGirl);

        // Also add historical record for this newly registered girl
        const newHist: HistoricalCaseRecord = {
          id: generateFollowUpId('HCR'),
          girlId: newGirlId,
          recordType: 'school_class',
          isDateUnknown: true,
          title: `Historical Report Record: ${item.reportingPeriod || 'Historical'}`,
          description: item.originalSnippet || item.summary,
          historicalSchool: item.extractedData.workplaceOrAffiliation,
          historicalClass: item.extractedData.historicalClass,
          source: {
            originalFileName: auditRecord.fileName,
            fileType: auditRecord.fileType,
            importedAt: new Date().toISOString(),
            importedByUid: auditRecord.importedByUid,
            importedByName: auditRecord.importedByName,
            documentDate: item.reportingPeriod,
          },
          createdAt: new Date().toISOString(),
        };
        if (!updatedDb.historicalRecords) updatedDb.historicalRecords = [];
        updatedDb.historicalRecords.unshift(newHist);
        await persistHistoricalCaseRecordToFirestore(newHist);
      } else if (item.matchedPersonAction === 'DO_NOT_REGISTER' || item.matchedPersonAction === 'IGNORE') {
        // Skip
      } else if (
        (item.matchedPersonAction === 'ADD_TO_EXISTING_PERSON' || item.resultType === 'EXISTING_PERSON_MATCHED') &&
        item.matchedId
      ) {
        // Update existing person in database
        const existingIdx = updatedDb.people.findIndex((p) => p.id === item.matchedId);
        if (existingIdx !== -1) {
          const currentPerson = updatedDb.people[existingIdx];
          const newDocEntry: PersonSourceDocument = {
            docName: auditRecord.fileName,
            reportingPeriod: item.reportingPeriod,
            importBatchId: auditId,
            section: item.extractedData.section || item.classificationLabel,
            date: item.recordDate || new Date().toISOString().slice(0, 10),
          };

          const existingDocs = currentPerson.sourceDocuments || [];
          const docAlreadyAdded = existingDocs.some(
            (d) => d.docName === newDocEntry.docName && d.reportingPeriod === newDocEntry.reportingPeriod
          );
          const updatedDocs = docAlreadyAdded ? existingDocs : [...existingDocs, newDocEntry];

          // Merge linked girls
          const newGirlIds = item.extractedData.linkedGirlIds || [];
          const combinedGirlIds = Array.from(new Set([...currentPerson.linkedGirlIds, ...newGirlIds]));
          const newGirlNames = item.extractedData.linkedGirlNames || [];
          const combinedGirlNames = Array.from(new Set([...(currentPerson.linkedGirlNames || []), ...newGirlNames]));

          const updatedPerson: Person = {
            ...currentPerson,
            organisation: currentPerson.organisation || item.extractedData.organisation,
            positionTitle: currentPerson.positionTitle || item.extractedData.positionTitle,
            phoneNumber: currentPerson.phoneNumber || item.extractedData.phoneNumber,
            email: currentPerson.email || item.extractedData.email,
            location: currentPerson.location || item.extractedData.location,
            workplaceOrAffiliation: currentPerson.workplaceOrAffiliation || item.extractedData.workplaceOrAffiliation,
            relationshipToGirl: currentPerson.relationshipToGirl || item.extractedData.relationshipToGirl,
            linkedGirlIds: combinedGirlIds,
            linkedGirlNames: combinedGirlNames,
            sourceDocuments: updatedDocs,
            updatedBy: auditRecord.importedByName,
            updatedDate: new Date().toISOString(),
            notes: currentPerson.notes
              ? `${currentPerson.notes}\n[Imported ${new Date().toLocaleDateString()}]: ${item.summary || item.originalSnippet || ''}`
              : item.extractedData.notes || item.summary,
            isLoginUser: false,
          };

          updatedDb.people[existingIdx] = updatedPerson;
          await persistPersonToFirestore(updatedPerson);
        }
      } else {
        // Register brand new Person
        const personId = generatePersonId(updatedDb.people);
        const sourceDocEntry: PersonSourceDocument = {
          docName: auditRecord.fileName,
          reportingPeriod: item.reportingPeriod,
          importBatchId: auditId,
          section: item.extractedData.section || item.classificationLabel,
          date: item.recordDate || new Date().toISOString().slice(0, 10),
        };

        const newPerson: Person = {
          id: personId,
          fullName: item.extractedData.fullName || item.title?.replace('Detected Person: ', '').trim() || 'Unknown Contact',
          personType: item.extractedData.personType || item.detectedRole || 'Other',
          organisation: item.extractedData.organisation || (item.detectedRole === 'SHINE Staff' ? 'SHINE Relief Trust' : ''),
          positionTitle: item.extractedData.positionTitle || item.detectedRole || 'Stakeholder Contact',
          phoneNumber: item.extractedData.phoneNumber || '',
          email: item.extractedData.email || '',
          location: item.extractedData.location || '',
          workplaceOrAffiliation: item.extractedData.workplaceOrAffiliation || '',
          relationshipToGirl: item.extractedData.relationshipToGirl || '',
          linkedGirlIds: item.extractedData.linkedGirlIds || [],
          linkedGirlNames: item.extractedData.linkedGirlNames || [],
          linkedHouseholdIds: item.extractedData.linkedHouseholdIds || [],
          linkedHouseholdNames: item.extractedData.linkedHouseholdNames || [],
          notes: item.extractedData.notes || `Extracted from "${auditRecord.fileName}". ${item.originalSnippet || ''}`,
          sourceDocuments: [sourceDocEntry],
          dateFirstIdentified: item.recordDate || new Date().toISOString().slice(0, 10),
          dateRegistered: new Date().toISOString(),
          createdBy: auditRecord.importedByName,
          createdDate: new Date().toISOString(),
          updatedBy: auditRecord.importedByName,
          updatedDate: new Date().toISOString(),
          status: 'Active',
          isLoginUser: false,
        };

        updatedDb.people.unshift(newPerson);
        await persistPersonToFirestore(newPerson);
      }
    }
    // 7. New Girl Profile (if explicitly confirmed)
    else if (item.resultType === 'NEW_RECORD' && item.targetEntity === 'girl') {
      const newGirl: Girl = {
        ...item.extractedData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Girl;
      updatedDb.girls.unshift(newGirl);
      await persistGirlToFirestore(newGirl);
    }
    // 8. Profile Update (if recent differences)
    else if (item.resultType === 'PROFILE_UPDATE' && item.targetEntity === 'girl' && item.matchedId) {
      const idx = updatedDb.girls.findIndex((g) => g.id === item.matchedId);
      if (idx !== -1) {
        updatedDb.girls[idx] = {
          ...updatedDb.girls[idx],
          ...item.extractedData,
          updatedAt: new Date().toISOString(),
        };
        await persistGirlToFirestore(updatedDb.girls[idx]);
      }
    }
    // 9. Educational Follow-Up
    else if (item.targetEntity === 'educationalFollowUp') {
      const newEdu = {
        ...item.extractedData,
        id: generateFollowUpId('EDU'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updatedDb.educationalFollowUps.unshift(newEdu as any);
      await persistEduFollowUpToFirestore(newEdu as any);
    }
    // 10. Health Follow-up (only after staff review and confirmation)
    else if (item.targetEntity === 'healthFollowUp' && item.matchedId) {
      const newHealth: HealthFollowUp = {
        ...item.extractedData,
        girlId: item.matchedId,
        id: generateFollowUpId('HLT'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: auditRecord.importedByName,
        updatedBy: auditRecord.importedByName,
      } as HealthFollowUp;
      updatedDb.healthFollowUps.unshift(newHealth);
      await persistHealthFollowUpToFirestore(newHealth);
    }

    if (createsWorkplan && item.targetEntity !== 'workplan' && item.classification !== 'WORKPLAN_PRIORITY') {
      const periodType = dueDatePeriod!.startsWith('month:') ? 'monthly' : dueDatePeriod!.startsWith('quarter:') ? 'quarterly' : 'project';
      const linkedWorkplan: WorkplanItem = {
        id: generateFollowUpId('WP'),
        activity: item.extractedData.workplanAction || item.extractedData.activity || item.extractedData.activityName || item.title || item.summary,
        objective: item.extractedData.workplanAction || item.extractedData.objective || item.summary,
        description: item.extractedData.workplanAction || item.extractedData.description || item.extractedData.notes || item.summary,
        period: `${dueDateRange!.startDate} to ${dueDateRange!.endDate}`,
        periodType,
        dueDatePeriod,
        domain: item.extractedData.workplanDomain || 'Programme',
        sourceRecordId: linkedRecordId,
        linkedActivityIds: item.targetEntity === 'activity' && linkedRecordId ? [linkedRecordId] : undefined,
        status: 'Planned',
        progress: 0,
        responsibleStaffId: auditRecord.importedByUid,
        responsibleStaffName: auditRecord.importedByName,
        startDate: dueDateRange!.startDate,
        endDate: dueDateRange!.endDate,
        targetCount: item.extractedData.targetCount || 1,
        unit: item.extractedData.unit || 'activities',
        location: item.extractedData.location || 'Shine Village, Malawi',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!updatedDb.workplans) updatedDb.workplans = [];
      updatedDb.workplans.unshift(linkedWorkplan);
      await persistWorkplanItemToFirestore(linkedWorkplan);
    }

    processed++;
    onProgress?.(processed, total);
  }

  const reportDate = (() => {
    const period = auditRecord.reportingPeriod || '';
    const months = period.match(/January|February|March|April|May|June|July|August|September|October|November|December/gi) || [];
    const year = period.match(/20\d{2}/)?.[0];
    if (!year || months.length === 0) return auditRecord.importedAt.slice(0, 10);
    const month = new Date(`${months[months.length - 1]} 1, ${year}`).getMonth() + 1;
    const lastDay = new Date(Number(year), month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  })();
  for (const { candidate, contactId } of approvedContacts) {
    const interaction = {
      id: `${auditId}-${candidate.type}-${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      date: reportDate,
      type: 'Report mention',
      summary: `${auditRecord.reportingPeriod ? `Reporting period ${auditRecord.reportingPeriod}. ` : ''}${candidate.context}`,
      sourceReportId: auditId,
      sourceRecordId: candidate.sourceRecordId,
      programme: candidate.programme,
    };
    const actor = { uid: auditRecord.importedByUid, name: auditRecord.importedByName };
    if (contactId) {
      await addContactInteraction(contactId, interaction, actor);
      const existing = updatedDb.contacts?.find((contact) => contact.id === contactId);
      if (existing) {
        const updated: ContactRecord = {
          ...existing,
          interactions: [...existing.interactions, interaction],
          programmes: Array.from(new Set([...existing.programmes, ...(interaction.programme ? [interaction.programme] : [])])),
          lastSeen: existing.lastSeen > reportDate ? existing.lastSeen : reportDate,
          updatedAt: new Date().toISOString(),
          updatedByUid: actor.uid,
          updatedByName: actor.name,
        };
        updatedDb.contacts = updatedDb.contacts?.map((contact) => contact.id === contactId ? updated : contact);
      }
    } else {
      const created = await createContact({
        type: candidate.type,
        name: candidate.name,
        category: candidate.category,
        aliases: [],
        roleTitle: candidate.roleTitle,
        affiliation: candidate.affiliation,
        phone: candidate.phone,
        email: candidate.email,
        notes: candidate.context,
        programmes: candidate.programme ? [candidate.programme] : [],
        firstSeen: reportDate,
        lastSeen: reportDate,
      }, actor, 'import', interaction);
      updatedDb.contacts?.unshift(created);
    }
    processed++;
    onProgress?.(processed, total);
  }

  // Calculate people audit statistics
  const peopleItems = approvedItems.filter(
    (i) => i.selected && (i.classification === 'PEOPLE_DIRECTORY_RECORD' || i.targetEntity === 'person')
  );
  const peopleDetectedCount = peopleItems.length;
  const newPeopleCount = peopleItems.filter(
    (i) => i.resultType === 'NEW_PERSON' && i.matchedPersonAction !== 'DO_NOT_REGISTER' && i.matchedPersonAction !== 'IGNORE'
  ).length;
  const existingPeopleMatchedCount = peopleItems.filter(
    (i) => i.resultType === 'EXISTING_PERSON_MATCHED' || i.matchedPersonAction === 'ADD_TO_EXISTING_PERSON'
  ).length;
  const possibleDuplicatesCount = peopleItems.filter(
    (i) => i.resultType === 'POSSIBLE_DUPLICATE_PERSON'
  ).length;
  const relationshipsCreatedCount = peopleItems.reduce(
    (acc, curr) => acc + (curr.extractedData.linkedGirlIds?.length || 0) + (curr.extractedData.linkedHouseholdIds?.length || 0),
    0
  );

  // Save Audit Record
  const finalAudit: ImportAuditRecord = {
    ...auditRecord,
    id: auditId,
    status: 'completed',
    peopleDetectedCount,
    newPeopleCount,
    existingPeopleMatchedCount,
    possibleDuplicatesCount,
    relationshipsCreatedCount,
    employeesDetectedCount: auditRecord.employeesDetectedCount ?? approvedItems.filter((item) => item.targetEntity === 'employee').length,
    employeesAddedCount: importedEmployees,
    existingEmployeesMatchedCount: matchedEmployees,
    employeesNeedingReviewCount: auditRecord.employeesNeedingReviewCount ?? approvedItems.filter((item) =>
      item.targetEntity === 'employee' && item.extractedData.status === 'ambiguous').length,
    payrollRecordsDetectedCount: auditRecord.payrollRecordsDetectedCount ?? approvedItems.filter((item) =>
      item.targetEntity === 'employee').reduce((total, item) => total + (Array.isArray(item.extractedData.salaryHistory) ? item.extractedData.salaryHistory.length : 0), 0),
    payrollRecordsImportedCount: importedPayrollRecords,
  };
  updatedDb.importAudits?.unshift(finalAudit);
  await persistImportAuditToFirestore(finalAudit);

  saveDatabase(updatedDb);

  return { success: true, createdAudit: finalAudit };
}
