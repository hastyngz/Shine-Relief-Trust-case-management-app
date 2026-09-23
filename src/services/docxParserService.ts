import mammoth from 'mammoth';
import {
  AppDatabase,
  DocxClassification,
  ImportPreviewItem,
  StaffUser,
  Girl,
  Person,
  PersonType,
} from '../types';
import { generateFollowUpId } from '../utils/storage';

export interface ReportMetadata {
  organisation: string;
  reportTitle: string;
  reportingPeriod: string;
  location: string;
  author: string;
  dateCreated?: string;
  executiveSummary?: string;
}

export interface ExtractedImageItem {
  id: string;
  base64: string;
  contentType: string;
  caption?: string;
  altText?: string;
  sectionHeading?: string;
}

export interface ParsedDocxReportResult {
  metadata: ReportMetadata;
  items: ImportPreviewItem[];
  images: ExtractedImageItem[];
  rawText: string;
  rawHtml: string;
  counts: {
    totalDetected: number;
    people: number;
    historicalGirls: number;
    groupActivities: number;
    earlyYears: number;
    workplans: number;
    agriculture: number;
    photos: number;
    metadata: number;
    unclassified: number;
  };
}

/**
 * Normalizes text for comparison and pattern matching
 */
function cleanText(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts report metadata from document headings, paragraphs, and filename
 */
export function extractReportMetadata(
  text: string,
  fileName: string,
  htmlDoc?: any
): ReportMetadata {
  let organisation = 'SHINE Relief Trust';
  let reportTitle = 'SHINE Village Progress Report';
  let reportingPeriod = 'July to September 2026';
  let location = 'Shine Village, Malawi';
  let author = 'Suzen Zidana';

  // Check filename for reporting period
  const cleanFileName = fileName.replace(/[_]/g, ' ');
  const periodMatch = cleanFileName.match(
    /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:to|-|–)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?/i
  );
  if (periodMatch) {
    reportingPeriod = periodMatch[0];
    if (!/\d{4}/.test(reportingPeriod)) {
      const yearMatch = cleanFileName.match(/20\d{2}/);
      if (yearMatch) reportingPeriod += ` ${yearMatch[0]}`;
    }
  }

  // Check text content for metadata indicators
  const lines = text.split('\n').map((l) => cleanText(l)).filter((l) => l.length > 0);

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const l = lines[i];

    if (/shine relief trust/i.test(l)) {
      organisation = 'SHINE Relief Trust';
    }

    if (/progress report|village progress|quarterly report|activity report/i.test(l)) {
      reportTitle = l;
    }

    const docPeriodMatch = l.match(
      /(?:period|quarter|months?):\s*([A-Za-z]+(?:\s*(?:to|-|–)\s*[A-Za-z]+)?\s*\d{4})/i
    );
    if (docPeriodMatch) {
      reportingPeriod = docPeriodMatch[1];
    }

    if (/author|prepared by|compiled by|submitted by/i.test(l)) {
      const authMatch = l.replace(/^(?:author|prepared by|compiled by|submitted by)\s*[:\-]?\s*/i, '');
      if (authMatch.length > 2 && authMatch.length < 50) {
        author = authMatch;
      }
    }

    if (/location|village|centre|center/i.test(l) && /malawi|zomba|shine/i.test(l)) {
      const locMatch = l.replace(/^(?:location|venue)\s*[:\-]?\s*/i, '');
      if (locMatch.length > 2 && locMatch.length < 50) {
        location = locMatch;
      }
    }
  }

  // Also check headings in DOM if available
  if (htmlDoc?.querySelectorAll) {
    const headings = htmlDoc.querySelectorAll('h1, h2, h3');
    headings.forEach((h: any) => {
      const ht = cleanText(h.textContent || '');
      if (/progress report/i.test(ht) && ht.length < 100) {
        reportTitle = ht;
      }
      if (/july.*september.*2026/i.test(ht)) {
        reportingPeriod = 'July to September 2026';
      }
    });
  }

  return {
    organisation,
    reportTitle,
    reportingPeriod,
    location,
    author,
  };
}

/**
 * Finds match confidence for girl in caseload
 */
function matchGirlInCaseload(
  name: string,
  caseload: Girl[]
): {
  matchedGirl?: Girl;
  confidence: 'exact' | 'high' | 'medium' | 'possible_match' | 'none';
  candidates: Array<{ id: string; fullName: string; school?: string; classLevel?: string }>;
} {
  const clean = name.toLowerCase().trim();
  const tokens = clean.split(/\s+/);
  const firstName = tokens[0];

  // 1. Exact full name match
  const exact = caseload.find((g) => g.fullName.toLowerCase().trim() === clean);
  if (exact) {
    return {
      matchedGirl: exact,
      confidence: 'exact',
      candidates: [{ id: exact.id, fullName: exact.fullName, school: exact.school, classLevel: exact.classLevel }],
    };
  }

  // 2. First name match
  const firstNameMatches = caseload.filter((g) => {
    const gTokens = g.fullName.toLowerCase().trim().split(/\s+/);
    return gTokens[0] === firstName || g.fullName.toLowerCase().includes(clean);
  });

  if (firstNameMatches.length === 1) {
    const single = firstNameMatches[0];
    return {
      matchedGirl: single,
      confidence: 'high',
      candidates: [{ id: single.id, fullName: single.fullName, school: single.school, classLevel: single.classLevel }],
    };
  }

  if (firstNameMatches.length > 1) {
    return {
      matchedGirl: firstNameMatches[0],
      confidence: 'possible_match',
      candidates: firstNameMatches.map((g) => ({
        id: g.id,
        fullName: g.fullName,
        school: g.school,
        classLevel: g.classLevel,
      })),
    };
  }

  // Fallback: all girls as candidates
  return {
    matchedGirl: undefined,
    confidence: 'possible_match',
    candidates: caseload.slice(0, 10).map((g) => ({
      id: g.id,
      fullName: g.fullName,
      school: g.school,
      classLevel: g.classLevel,
    })),
  };
}

interface DetectedPersonCandidate {
  rawName: string;
  role: PersonType;
  organisation?: string;
  positionTitle?: string;
  workplaceOrAffiliation?: string;
  location?: string;
  relationshipToGirl?: string;
  linkedGirlNames?: string[];
  contextSnippet: string;
  section: string;
}

const FALSE_POSITIVE_NAMES = new Set([
  'shine',
  'relief',
  'trust',
  'village',
  'malawi',
  'zomba',
  'lilongwe',
  'early',
  'years',
  'primary',
  'secondary',
  'school',
  'executive',
  'summary',
  'education',
  'group',
  'programme',
  'activities',
  'agriculture',
  'priorities',
  'church',
  'counselling',
  'counseling',
  'mentorship',
  'sports',
  'wednesday',
  'monday',
  'tuesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'october',
  'september',
  'august',
  'july',
  'june',
  'may',
  'april',
  'march',
  'february',
  'january',
  'term',
  'form',
  'grade',
  'standard',
  'vocational',
  'training',
  'centre',
  'center',
  'gardening',
  'nutrition',
  'solar',
  'irrigation',
  'tailoring',
  'catering',
  'bible',
  'study',
  'all',
  'each',
  'this',
  'our',
  'the',
  'staff',
  'teacher',
  'caregiver',
  'children',
  'girls',
  'learners',
  'headmaster',
  'headmistress',
  'director',
  'manager',
  'coordinator',
  'supervisor',
  'volunteer',
]);

function isValidPersonName(name: string): boolean {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 50) return false;
  const lower = clean.toLowerCase();
  if (FALSE_POSITIVE_NAMES.has(lower)) return false;
  const words = lower.split(/\s+/);
  if (
    words.some((w) =>
      ['school', 'relief', 'trust', 'village', 'malawi', 'centre', 'center', 'activity', 'programme'].includes(w)
    )
  ) {
    return false;
  }
  return /^[A-Z][a-zA-Z'\-.]+(?:\s+[A-Z][a-zA-Z'\-.]+)*$/.test(clean);
}

/**
 * Parses full Word (.docx) narrative progress report into classified SHINE items
 */
export async function parseDocxProgressReport(
  file: File,
  db: AppDatabase,
  currentUser: StaffUser
): Promise<ParsedDocxReportResult> {
  const buffer = await file.arrayBuffer();

  const extractedImages: ExtractedImageItem[] = [];

  // Configure mammoth with image extraction safely typed
  const mammothAny = mammoth as any;
  const imageOptions = mammothAny.images?.imgElement
    ? {
        convertImage: mammothAny.images.imgElement((image: any) => {
          return image.read('base64').then((imageBuffer: string) => {
            const id = `photo_${Date.now()}_${extractedImages.length + 1}`;
            const dataUri = `data:${image.contentType};base64,${imageBuffer}`;
            extractedImages.push({
              id,
              base64: dataUri,
              contentType: image.contentType || 'image/jpeg',
              altText: image.altText || 'Embedded photograph',
            });
            return {
              src: dataUri,
              alt: image.altText || '',
            };
          });
        }),
      }
    : undefined;

  const htmlResult = await (mammoth as any).convertToHtml({ arrayBuffer: buffer }, imageOptions);
  const rawTextResult = await mammoth.extractRawText({ arrayBuffer: buffer });

  const rawHtml = htmlResult.value;
  const rawText = rawTextResult.value;

  if (!rawHtml || rawHtml.trim().length === 0) {
    throw new Error(
      'Unable to extract information from this Word document. The file appears to be empty or corrupted.'
    );
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // Extract Report Metadata
  const metadata = extractReportMetadata(rawText, file.name, doc);

  const previewItems: ImportPreviewItem[] = [];

  // 1. Add General Report Information / Metadata item
  previewItems.push({
    tempId: `meta_${Date.now()}`,
    resultType: 'NEW_RECORD',
    targetEntity: 'general',
    classification: 'GENERAL_REPORT_INFO',
    classificationLabel: 'General Report Metadata',
    summary: `${metadata.reportTitle} (${metadata.reportingPeriod}) - Author: ${metadata.author}, ${metadata.location}`,
    recordDate: undefined,
    reportingPeriod: metadata.reportingPeriod,
    isDateUnknown: true,
    title: metadata.reportTitle,
    originalSnippet: `Organisation: ${metadata.organisation} | Title: ${metadata.reportTitle} | Period: ${metadata.reportingPeriod} | Author: ${metadata.author} | Location: ${metadata.location}`,
    actionProposed: 'Store Document Ingestion Metadata & Audit Log',
    extractedData: {
      organisation: metadata.organisation,
      reportTitle: metadata.reportTitle,
      reportingPeriod: metadata.reportingPeriod,
      location: metadata.location,
      author: metadata.author,
      sourceFileName: file.name,
    },
    isHistorical: false,
    selected: true,
  });

  // Track people detected across the document
  const detectedPeople = new Map<string, DetectedPersonCandidate>();

  // If report author is recognized as a valid person name, add to detected people
  if (metadata.author && isValidPersonName(metadata.author)) {
    detectedPeople.set(metadata.author.toLowerCase(), {
      rawName: metadata.author,
      role: 'SHINE Staff',
      positionTitle: 'Author / Progress Report Compiler',
      organisation: 'SHINE Relief Trust',
      location: metadata.location,
      contextSnippet: `Report Author & Compiler: ${metadata.author} (${metadata.reportTitle})`,
      section: 'Report Header / Author',
    });
  }

  // Track sections and context
  let currentSection = 'Introduction';

  // Walk through document elements
  const bodyNodes = Array.from(doc.body.childNodes);

  // Helper to test if a paragraph is a section heading
  const getHeadingText = (node: Node): string | null => {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      return cleanText(el.textContent || '');
    }
    // Bold single line paragraph
    if (tagName === 'p') {
      const strong = el.querySelector('strong, b');
      if (strong && cleanText(strong.textContent || '') === cleanText(el.textContent || '')) {
        const t = cleanText(strong.textContent || '');
        if (t.length > 2 && t.length < 80) return t;
      }
    }
    return null;
  };

  // Associate captions with images
  let lastImageIndex = -1;

  for (let idx = 0; idx < bodyNodes.length; idx++) {
    const node = bodyNodes[idx];
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const textContent = cleanText(el.textContent || '');

    // 1. Check if heading
    const heading = getHeadingText(node);
    if (heading) {
      currentSection = heading;
      continue;
    }

    // 2. Check for embedded images
    const imgEl = el.querySelector('img') || (el.tagName.toLowerCase() === 'img' ? (el as HTMLImageElement) : null);
    if (imgEl) {
      const src = imgEl.getAttribute('src');
      const foundImage = extractedImages.find((img) => img.base64 === src);
      if (foundImage) {
        lastImageIndex = extractedImages.indexOf(foundImage);
        foundImage.sectionHeading = currentSection;

        // Check next paragraph for caption
        const nextNode = bodyNodes[idx + 1] as HTMLElement | undefined;
        if (nextNode && nextNode.textContent && nextNode.textContent.trim().length > 0) {
          const captionCandidate = cleanText(nextNode.textContent);
          if (
            captionCandidate.length < 200 &&
            (/photo|image|highlight|girls|learners|garden|village/i.test(captionCandidate) ||
              nextNode.querySelector('em, i'))
          ) {
            foundImage.caption = captionCandidate;
          }
        }
      }
    }

    if (textContent.length === 0) continue;

    // -------------------------------------------------------------
    // A. DETECT INDIVIDUAL GIRL HISTORICAL RECORDS & TRANSITIONS
    // E.g., "Margaret returned to Lilongwe Girls Secondary School."
    // "Bridget advanced to Form 3 at St. Mary's Secondary."
    // "Emily advanced to Standard 8."
    // "Monica advanced to Grade 7."
    // "Memory resumed vocational training in tailoring."
    // "Aisha resumed vocational training in catering."
    // -------------------------------------------------------------
    const girlTransitionPatterns = [
      // Pattern 1: Name + action verb (returned to, advanced to, promoted to, etc.)
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(returned\s+to|advanced\s+to|promoted\s+to|transitioned\s+to|enrolled\s+at|resumed\s+vocational\s+training|resumed|started\s+vocational\s+training|started|admitted\s+to)\s+([^.]+)/i,
      // Pattern 2: Name : Form / Standard / Vocational
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[:\-]\s*(Form\s+\d|Standard\s+\d|Grade\s+\d|Vocational\s+Training[^.]+)/i,
    ];

    let matchedTransition = false;

    for (const pat of girlTransitionPatterns) {
      const match = textContent.match(pat);
      if (match) {
        const rawName = cleanText(match[1]);

        // Filter out false positive names that are common nouns or programme words
        if (
          /^(SHINE|The|Our|This|Early|Primary|Secondary|Malawi|Staff|Teacher|Caregiver|Children|Girls|Learners|Village|Trust|All|Each|September|August|July)$/i.test(
            rawName
          )
        ) {
          continue;
        }

        const actionPhrase = match[2] ? match[2].toLowerCase() : '';
        const details = match[3] ? cleanText(match[3]) : '';

        // Extract class and school if present
        let historicalSchool = 'Lilongwe Girls Secondary School';
        let historicalClass = 'Standard / Form';

        if (/vocational/i.test(actionPhrase) || /vocational/i.test(details)) {
          historicalSchool = 'Vocational Training Centre';
          historicalClass = details.includes('tailoring')
            ? 'Vocational Training (Tailoring)'
            : details.includes('catering')
            ? 'Vocational Training (Catering)'
            : 'Vocational Training';
        } else if (/secondary/i.test(details) || /school/i.test(details)) {
          historicalSchool = details;
          if (/form\s+\d/i.test(details)) {
            const cm = details.match(/form\s+\d/i);
            if (cm) historicalClass = cm[0];
          }
        } else if (/form\s+\d/i.test(details)) {
          historicalClass = details.match(/form\s+\d/i)![0];
        } else if (/standard\s+\d/i.test(details)) {
          historicalClass = details.match(/standard\s+\d/i)![0];
        } else if (/grade\s+\d/i.test(details)) {
          historicalClass = details.match(/grade\s+\d/i)![0];
        }

        // Match against existing database caseload
        const { matchedGirl, confidence, candidates } = matchGirlInCaseload(rawName, db.girls);

        const tempId = `hist_${Date.now()}_${previewItems.length}`;
        const summary = `${rawName}: ${cleanText(match[0])}`;

        previewItems.push({
          tempId,
          resultType: 'HISTORICAL_RECORD',
          targetEntity: 'girl',
          classification: 'INDIVIDUAL_GIRL_HISTORICAL',
          classificationLabel: 'Individual Girl Historical Record',
          matchedId: matchedGirl?.id,
          matchedName: matchedGirl?.fullName || rawName,
          matchConfidence: confidence,
          candidateGirls: candidates,
          recordDate: undefined,
          reportingPeriod: metadata.reportingPeriod,
          isDateUnknown: true,
          title: `Historical Academic/Transition Record: ${rawName}`,
          summary: `${summary} (Preserves current profile: ${matchedGirl ? matchedGirl.classLevel : 'Active'})`,
          originalSnippet: textContent,
          actionProposed: 'Add Historical Educational Record',
          isHistorical: true,
          selected: true,
          warningOrConflict:
            confidence === 'possible_match'
              ? `Beneficiary "${rawName}" has multiple or partial matches in the caseload. Please verify selected girl.`
              : undefined,
          extractedData: {
            girlId: matchedGirl?.id || 'SG-PENDING',
            girlName: matchedGirl?.fullName || rawName,
            recordType: 'school_class',
            eventDate: undefined,
            isDateUnknown: true,
            title: `Educational Transition: ${rawName}`,
            description: textContent,
            historicalSchool: historicalSchool || undefined,
            historicalClass: historicalClass || undefined,
            historicalSupport: 'Education support & fee sponsorship',
            outcome: cleanText(match[0]),
            source: {
              originalFileName: file.name,
              fileType: 'docx',
              importedAt: new Date().toISOString(),
              importedByUid: currentUser.uid,
              importedByName: currentUser.fullName,
              documentDate: metadata.reportingPeriod,
            },
          },
        });

        if (isValidPersonName(rawName)) {
          detectedPeople.set(rawName.toLowerCase(), {
            rawName,
            role: 'SHINE Girl',
            organisation: 'SHINE Relief Trust',
            workplaceOrAffiliation: historicalSchool,
            contextSnippet: textContent,
            section: currentSection,
          });
        }

        matchedTransition = true;
        break;
      }
    }

    // Scan paragraph text for mentions of people (Pastors, Teachers, Caregivers, Guardians, Facilitators)
    const personMentionRules: Array<{
      regex: RegExp;
      defaultRole: PersonType;
      org?: string;
    }> = [
      {
        regex: /\b(Pastor|Reverend|Rev\.|Bishop|Evangelist|Deacon|Elder|Brother|Sister)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
        defaultRole: 'Pastor',
        org: 'Church / Faith Partner',
      },
      {
        regex: /\b(Teacher|Headmaster|Headmistress|Head\s+Teacher|Tutor|Instructor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        defaultRole: 'Teacher',
        org: 'Local School / Education Partner',
      },
      {
        regex: /\b(House\s+Mum|House\s+Mother|Caregiver|Matron)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        defaultRole: 'House Mum/Caregiver',
        org: 'SHINE Relief Trust',
      },
      {
        regex: /\b(Doctor|Dr\.|Nurse|Social\s+Worker)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        defaultRole: 'Health Worker',
        org: 'Healthcare / Community Partner',
      },
      {
        regex: /\b(Guardian|Parent)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
        defaultRole: 'Guardian',
      },
      {
        regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\((?:Guardian|Parent|Mother|Father)\)/gi,
        defaultRole: 'Guardian',
      },
      {
        regex: /\b(?:led by|facilitated by|conducted by|coordinated by|supervised by|guest speaker)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
        defaultRole: 'Mentor',
      },
    ];

    for (const rule of personMentionRules) {
      const matches = Array.from(textContent.matchAll(rule.regex));
      for (const m of matches) {
        const titlePart = m[1];
        const namePart = m[2] ? cleanText(m[2]) : cleanText(m[1]);
        if (isValidPersonName(namePart) && !detectedPeople.has(namePart.toLowerCase())) {
          let role = rule.defaultRole;
          if (rule.defaultRole === 'Health Worker' && /social/i.test(titlePart)) {
            role = 'Social Worker';
          }
          if (rule.defaultRole === 'Pastor' && !/pastor|rev/i.test(titlePart)) {
            role = 'Church Leader';
          }
          detectedPeople.set(namePart.toLowerCase(), {
            rawName: namePart,
            role,
            positionTitle: m[2] ? `${titlePart} ${namePart}` : role,
            organisation: rule.org,
            contextSnippet: textContent,
            section: currentSection,
          });
        }
      }
    }

    if (matchedTransition) continue;

    // -------------------------------------------------------------
    // B. DETECT EARLY YEARS PROGRAMME MONITORING RECORDS
    // Previous enrolment, graduates, target enrolment, teacher/caregiver ratio,
    // caregivers required, volunteers, start dates.
    // -------------------------------------------------------------
    if (
      /early years|early childhood|ecd|pre-school|caregiver ratio|feeding programme start/i.test(
        textContent
      ) ||
      /early years/i.test(currentSection)
    ) {
      // Extract numbers
      const prevEnrolment = textContent.match(/previous enrolment\s*(?:was|:)?\s*(\d+)/i)?.[1];
      const graduates = textContent.match(/(\d+)\s*(?:graduated|graduates)/i)?.[1];
      const targetEnrolment = textContent.match(/(?:target|enrol|enrolment)\s*(?:at least)?\s*(\d+)/i)?.[1];
      const ratio = textContent.match(/(\d+:\d+)\s*teacher\/caregiver ratio/i)?.[1] ||
                    textContent.match(/ratio\s*(?:of)?\s*(\d+:\d+)/i)?.[1];
      const teachersReq = textContent.match(/(\d+)\s*(?:teachers?|caregivers?)\s*(?:required|needed)/i)?.[1];
      const volunteers = textContent.match(/(\d+)\s*community volunteers/i)?.[1];
      const progStart = textContent.match(/programme start date\s*(?:is|:)?\s*([A-Za-z0-9\s,]+(?:2026|2027)?)/i)?.[1];
      const feedStart = textContent.match(/feeding programme start date\s*(?:is|:)?\s*([A-Za-z0-9\s,]+(?:2026|2027)?)/i)?.[1];

      previewItems.push({
        tempId: `ey_${Date.now()}_${previewItems.length}`,
        resultType: 'NEW_RECORD',
        targetEntity: 'earlyYears',
        classification: 'EARLY_YEARS_RECORD',
        classificationLabel: 'Early Years Programme Record',
        summary: `Early Years Programme: ${textContent.slice(0, 120)}...`,
        recordDate: progStart ? cleanText(progStart) : undefined,
        reportingPeriod: metadata.reportingPeriod,
        isDateUnknown: !progStart,
        title: 'Early Years ECD Operational Monitoring',
        originalSnippet: textContent,
        actionProposed: 'Record Early Years Programme Monitoring Metric',
        extractedData: {
          reportingPeriod: metadata.reportingPeriod,
          previousEnrolment: prevEnrolment ? parseInt(prevEnrolment, 10) : undefined,
          graduates: graduates ? parseInt(graduates, 10) : undefined,
          targetEnrolment: targetEnrolment ? parseInt(targetEnrolment, 10) : 100,
          teacherCaregiverRatio: ratio || '1:25',
          teachersRequired: teachersReq ? parseInt(teachersReq, 10) : 4,
          communityVolunteers: volunteers ? parseInt(volunteers, 10) : 6,
          programmeStartDate: progStart ? cleanText(progStart) : '2026-10-05',
          feedingProgrammeStartDate: feedStart ? cleanText(feedStart) : '2026-10-12',
          notes: textContent,
          sourceDocument: file.name,
        },
        isHistorical: false,
        selected: true,
      });

      continue;
    }

    // -------------------------------------------------------------
    // C. DETECT WORKPLAN PRIORITIES & OBJECTIVES
    // E.g., "Priorities for the new programme year:", "Workplan:", etc.
    // -------------------------------------------------------------
    if (
      /priorities for (?:the )?new programme year|workplan|strategic priorities|objectives for/i.test(
        currentSection
      ) ||
      /^(?:priority|objective)\s*\d*\s*[:\-]/i.test(textContent) ||
      (el.tagName.toLowerCase() === 'li' && /priorit/i.test(currentSection))
    ) {
      previewItems.push({
        tempId: `wp_${Date.now()}_${previewItems.length}`,
        resultType: 'NEW_RECORD',
        targetEntity: 'workplan',
        classification: 'WORKPLAN_PRIORITY',
        classificationLabel: 'Workplan / Strategic Priority',
        summary: `Priority: ${textContent}`,
        recordDate: undefined,
        reportingPeriod: metadata.reportingPeriod,
        isDateUnknown: true,
        title: `Workplan Priority: ${textContent.slice(0, 60)}...`,
        originalSnippet: textContent,
        actionProposed: 'Add Workplan Priority Item',
        missingFields: [
          'Responsible Staff: NOT PROVIDED IN SOURCE - REQUIRES REVIEW',
          'Target Date: NOT PROVIDED IN SOURCE',
          'Budget: NOT PROVIDED IN SOURCE',
        ],
        extractedData: {
          activity: textContent.slice(0, 80),
          objective: textContent,
          description: `Extracted from progress report "${file.name}" section: ${currentSection}.`,
          period: 'Annual 2026/2027',
          periodType: 'annual',
          status: 'Planned',
          progress: 0,
          responsibleStaffName: 'NOT PROVIDED IN SOURCE - REQUIRES REVIEW',
          budget: undefined,
          startDate: undefined,
          endDate: undefined,
          targetCount: /100/.test(textContent) ? 100 : /25/.test(textContent) ? 25 : 1,
          unit: /learners|children/.test(textContent) ? 'learners' : 'initiatives',
          location: metadata.location,
        },
        isHistorical: false,
        selected: true,
      });

      continue;
    }

    // -------------------------------------------------------------
    // D. DETECT AGRICULTURE & PRACTICAL SKILLS ACTIVITIES
    // E.g., gardening, solar irrigation, vegetable harvesting, tailoring, catering
    // -------------------------------------------------------------
    if (
      /agriculture|solar irrigation|gardening|vegetable|harvest|maize|poultry/i.test(textContent) ||
      /agriculture|gardening|practical skills/i.test(currentSection)
    ) {
      previewItems.push({
        tempId: `agr_${Date.now()}_${previewItems.length}`,
        resultType: 'NEW_RECORD',
        targetEntity: 'activity',
        classification: 'AGRICULTURE_PRACTICAL_SKILLS',
        classificationLabel: 'Agriculture & Practical Skills',
        summary: `Practical Skills / Agriculture: ${textContent.slice(0, 120)}...`,
        recordDate: undefined,
        reportingPeriod: metadata.reportingPeriod,
        isDateUnknown: true,
        title: 'Agriculture & Practical Skills Activity',
        originalSnippet: textContent,
        actionProposed: 'Create Group Activity Record (Communal / Field)',
        extractedData: {
          activityName: textContent.slice(0, 70),
          activityType: 'Group activity',
          participantCount: 15,
          description: textContent,
          outcome: 'Enhanced sustainability and practical food self-reliance',
          challenges: 'Maximising solar irrigation water distribution',
          supportProvided: 'Gardening tools, seeds, solar pump system',
          recommendations: 'Continue practical agricultural education',
          householdId: db.households[0]?.id || 'SH-01',
          furtherActionRequired: false,
        },
        isHistorical: false,
        selected: true,
      });

      continue;
    }

    // -------------------------------------------------------------
    // E. DETECT GROUP & PROGRAMME ACTIVITIES
    // Church celebrations, counselling sessions, retreats, camps, mentorship,
    // public speaking, instrument training, leadership, drama/skits,
    // community outreach, church cleaning, charity drives, visiting the sick,
    // bible study, business competitions, field visits, guest speakers,
    // cooperative learning, digital literacy, sports, arts/crafts, cooking/nutrition.
    // -------------------------------------------------------------
    const activityKeywords = [
      'church celebration',
      'counselling session',
      'counseling session',
      'retreat',
      'camp',
      'mentorship',
      'public speaking',
      'instrument training',
      'leadership',
      'drama',
      'skit',
      'community outreach',
      'church cleaning',
      'charity drive',
      'visiting the sick',
      'bible study',
      'business competition',
      'field visit',
      'guest speaker',
      'cooperative learning',
      'digital literacy',
      'vocational training',
      'gardening',
      'community service',
      'sports',
      'arts and craft',
      'cooking',
      'nutrition',
    ];

    const matchedActivity = activityKeywords.find((kw) => textContent.toLowerCase().includes(kw));

    if (matchedActivity) {
      // Extract participant count if mentioned (e.g. "18 girls", "25 participants")
      const countMatch = textContent.match(/(\d+)\s*(?:girls|participants|learners|children|beneficiaries|members)/i);
      const participantCount = countMatch ? parseInt(countMatch[1], 10) : 18;

      const actTitle = cleanText(textContent.split('.')[0]);

      previewItems.push({
        tempId: `act_${Date.now()}_${previewItems.length}`,
        resultType: 'NEW_RECORD',
        targetEntity: 'activity',
        classification: 'GROUP_ACTIVITY',
        classificationLabel: 'Group / Programme Activity',
        summary: `Group Activity: ${actTitle}`,
        recordDate: undefined,
        reportingPeriod: metadata.reportingPeriod,
        isDateUnknown: true,
        title: actTitle,
        originalSnippet: textContent,
        actionProposed: 'Create Group Activity Record',
        extractedData: {
          activityName: actTitle.slice(0, 80),
          activityType: 'Group activity',
          participantCount,
          description: textContent,
          outcome: 'Successful participation and engagement',
          challenges: 'None reported in source',
          supportProvided: 'Staff mentorship and facilitation',
          recommendations: 'Continue scheduled group development activities',
          householdId: db.households[0]?.id || 'SH-01',
          furtherActionRequired: false,
        },
        isHistorical: false,
        selected: true,
      });

      continue;
    }

    // -------------------------------------------------------------
    // F. UNCLASSIFIED NARRATIVE PARAGRAPHS
    // If paragraph has substantive text but didn't match specific rules
    // -------------------------------------------------------------
    if (textContent.length > 50 && !/^(table of contents|contents|acknowledgement)/i.test(textContent)) {
      previewItems.push({
        tempId: `uncl_${Date.now()}_${previewItems.length}`,
        resultType: 'NEW_RECORD',
        targetEntity: 'general',
        classification: 'UNCLASSIFIED_REVIEW',
        classificationLabel: 'Unclassified / Requires Review',
        summary: `Narrative Excerpt (${currentSection}): ${textContent.slice(0, 100)}...`,
        recordDate: undefined,
        reportingPeriod: metadata.reportingPeriod,
        isDateUnknown: true,
        title: `Document Excerpt: ${currentSection}`,
        originalSnippet: textContent,
        actionProposed: 'Requires Staff Review (Classification Pending)',
        extractedData: {
          section: currentSection,
          content: textContent,
        },
        isHistorical: false,
        selected: false, // Default unselected so user consciously reviews it
      });
    }
  }

  // -------------------------------------------------------------
  // G. CONVERT DETECTED PEOPLE INTO PREVIEW ITEMS
  // Match against caseload (girls) and People Directory
  // -------------------------------------------------------------
  const peoplePreviewItems: ImportPreviewItem[] = [];

  for (const cand of detectedPeople.values()) {
    const isGirl = cand.role === 'SHINE Girl';
    const girlMatch = matchGirlInCaseload(cand.rawName, db.girls);
    const existingPerson = db.people?.find(
      (p) => p.fullName.toLowerCase().trim() === cand.rawName.toLowerCase().trim()
    );

    let resultType: ImportPreviewItem['resultType'] = 'NEW_PERSON';
    let matchedId: string | undefined = undefined;
    let matchedName: string | undefined = undefined;
    let matchConfidence: ImportPreviewItem['matchConfidence'] = 'none';
    let candidateGirls = undefined;
    let candidatePeople = undefined;
    let actionProposed = 'Register in People Directory';
    let matchedPersonAction: ImportPreviewItem['matchedPersonAction'] = 'REGISTER_PERSON';
    let warningOrConflict: string | undefined = undefined;
    let summary = '';

    if (isGirl) {
      if (girlMatch.matchedGirl) {
        resultType = 'EXISTING_PERSON_MATCHED';
        matchedId = girlMatch.matchedGirl.id;
        matchedName = girlMatch.matchedGirl.fullName;
        matchConfidence = girlMatch.confidence;
        candidateGirls = girlMatch.candidates;
        actionProposed = 'Preserve Case History & Link to Existing Girl';
        matchedPersonAction = 'ADD_HISTORICAL_RECORD';
        summary = `${cand.rawName} (SHINE Girl) - Matches active beneficiary: ${girlMatch.matchedGirl.fullName} (${girlMatch.matchedGirl.id})`;
      } else {
        resultType = 'POTENTIAL_NEW_GIRL';
        candidateGirls = girlMatch.candidates;
        actionProposed = 'Review Potential New Girl (Register as Beneficiary or Skip)';
        matchedPersonAction = 'REGISTER_AS_NEW_GIRL';
        summary = `${cand.rawName} - Potential New SHINE Girl (Found in historical report)`;
        warningOrConflict = `Beneficiary "${cand.rawName}" is not registered in the active caseload. Review and decide whether to register as a new girl.`;
      }
    } else {
      if (existingPerson) {
        resultType = 'EXISTING_PERSON_MATCHED';
        matchedId = existingPerson.id;
        matchedName = existingPerson.fullName;
        matchConfidence = 'exact';
        actionProposed = 'Update / Link with Existing Directory Contact';
        matchedPersonAction = 'ADD_TO_EXISTING_PERSON';
        summary = `${cand.rawName} (${cand.role}) - Matches existing contact: ${existingPerson.fullName} (${existingPerson.id})`;
      } else {
        // Check partial matches in db.people
        const partialMatches = (db.people || []).filter((p) => {
          const pParts = p.fullName.toLowerCase().split(/\s+/);
          const cParts = cand.rawName.toLowerCase().split(/\s+/);
          return pParts.some((part) => cParts.includes(part));
        });

        if (partialMatches.length > 0) {
          resultType = 'POSSIBLE_DUPLICATE_PERSON';
          matchedId = partialMatches[0].id;
          matchedName = partialMatches[0].fullName;
          matchConfidence = 'possible_match';
          candidatePeople = partialMatches.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            personType: p.personType,
            organisation: p.organisation,
          }));
          actionProposed = 'Review Possible Duplicate Contact';
          matchedPersonAction = 'MARK_FOR_REVIEW';
          summary = `${cand.rawName} (${cand.role}) - Possible duplicate of ${partialMatches[0].fullName} (${partialMatches[0].id})`;
          warningOrConflict = `Similar contact name found in People Directory: "${partialMatches[0].fullName}". Please verify to avoid duplicates.`;
        } else {
          resultType = 'NEW_PERSON';
          actionProposed = 'Register in People Directory (No system login access)';
          matchedPersonAction = 'REGISTER_PERSON';
          summary = `${cand.rawName} (${cand.role}) - New Person detected in report`;
        }
      }
    }

    peoplePreviewItems.push({
      tempId: `person_${Date.now()}_${peoplePreviewItems.length}`,
      resultType,
      targetEntity: 'person',
      classification: 'PEOPLE_DIRECTORY_RECORD',
      classificationLabel: 'People / Contacts Directory',
      matchedId,
      matchedName,
      matchConfidence,
      candidateGirls,
      candidatePeople,
      recordDate: undefined,
      reportingPeriod: metadata.reportingPeriod,
      isDateUnknown: true,
      title: `Detected Person: ${cand.rawName} (${cand.role})`,
      summary,
      originalSnippet: cand.contextSnippet,
      actionProposed,
      matchedPersonAction,
      warningOrConflict,
      detectedRole: cand.role,
      detectedOrganisation: cand.organisation,
      detectedAffiliation: cand.workplaceOrAffiliation,
      detectedRelationship: cand.relationshipToGirl,
      extractedData: {
        fullName: cand.rawName,
        personType: cand.role,
        organisation: cand.organisation || (cand.role === 'SHINE Staff' ? 'SHINE Relief Trust' : ''),
        positionTitle: cand.positionTitle || cand.role,
        location: cand.location || metadata.location || '',
        workplaceOrAffiliation: cand.workplaceOrAffiliation || '',
        relationshipToGirl: cand.relationshipToGirl || '',
        linkedGirlIds: girlMatch?.matchedGirl ? [girlMatch.matchedGirl.id] : [],
        linkedGirlNames: girlMatch?.matchedGirl
          ? [girlMatch.matchedGirl.fullName]
          : cand.role === 'SHINE Girl'
          ? [cand.rawName]
          : [],
        linkedHouseholdIds: [],
        linkedHouseholdNames: [],
        notes: `Extracted from "${file.name}" (${metadata.reportingPeriod}) in section: ${cand.section}.`,
        sourceDocument: file.name,
        reportingPeriod: metadata.reportingPeriod,
        section: cand.section,
      },
      isHistorical: isGirl,
      selected: true,
    });
  }

  // Insert people items right after General Report Metadata
  previewItems.splice(1, 0, ...peoplePreviewItems);

  // -------------------------------------------------------------
  // H. PROCESS EMBEDDED PHOTOGRAPHS / PICTORIAL HIGHLIGHTS
  // -------------------------------------------------------------
  extractedImages.forEach((img, i) => {
    previewItems.push({
      tempId: `img_preview_${i}_${Date.now()}`,
      resultType: 'NEW_RECORD',
      targetEntity: 'attachment',
      classification: 'PHOTO_HIGHLIGHT',
      classificationLabel: 'Pictorial Highlight (Photo)',
      summary: `Embedded Image ${i + 1}: ${img.caption || img.altText || 'Photographic highlight from report'}`,
      recordDate: undefined,
      reportingPeriod: metadata.reportingPeriod,
      isDateUnknown: true,
      title: `Pictorial Highlight ${i + 1}`,
      originalSnippet: img.caption || `Embedded photograph from section: ${img.sectionHeading || 'Report'}`,
      actionProposed: 'Import Photographic Highlight to Storage / Attachments',
      photoBase64: img.base64,
      photoContentType: img.contentType,
      photoCaption: img.caption,
      extractedData: {
        fileName: `${file.name.replace(/\.docx$/i, '')}_photo_${i + 1}.jpg`,
        fileSize: Math.round(img.base64.length * 0.75),
        contentType: img.contentType,
        caption: img.caption || `Photograph from ${metadata.reportTitle} (${metadata.reportingPeriod})`,
        category: 'Group Activity',
        targetType: 'householdActivity',
        targetId: db.households[0]?.id || 'SH-01',
        date: new Date().toISOString().slice(0, 10),
      },
      isHistorical: false,
      selected: true,
    });
  });

  // Calculate real category counts
  const counts = {
    totalDetected: previewItems.length,
    people: previewItems.filter((i) => i.classification === 'PEOPLE_DIRECTORY_RECORD').length,
    historicalGirls: previewItems.filter((i) => i.classification === 'INDIVIDUAL_GIRL_HISTORICAL').length,
    groupActivities: previewItems.filter((i) => i.classification === 'GROUP_ACTIVITY' || i.classification === 'PROGRAMME_ACTIVITY').length,
    earlyYears: previewItems.filter((i) => i.classification === 'EARLY_YEARS_RECORD').length,
    workplans: previewItems.filter((i) => i.classification === 'WORKPLAN_PRIORITY').length,
    agriculture: previewItems.filter((i) => i.classification === 'AGRICULTURE_PRACTICAL_SKILLS').length,
    photos: previewItems.filter((i) => i.classification === 'PHOTO_HIGHLIGHT').length,
    metadata: previewItems.filter((i) => i.classification === 'GENERAL_REPORT_INFO').length,
    unclassified: previewItems.filter((i) => i.classification === 'UNCLASSIFIED_REVIEW').length,
  };

  return {
    metadata,
    items: previewItems,
    images: extractedImages,
    rawText,
    rawHtml,
    counts,
  };
}
