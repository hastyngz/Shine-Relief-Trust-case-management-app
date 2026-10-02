import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { parseDocxFile } from '../src/services/importService';
import {
  extractChildHouseGirlLines,
  extractDocxParagraphData,
  extractEarlyYearsMetrics,
  extractHistoricalTransitionsFromText,
  pairDocxImageCaptions,
  extractPriorityEntriesFromText,
} from '../src/services/docxParserService';

const transitionText = `
2. Education and Beneficiary Academic Transitions

• Margaret returned to Lilongwe Girls Secondary School to resume her advanced academic studies.
• Patience returned to school after successfully completing the term.
• Bridget advanced to Form 3 following commendable examination performances.
• Aida returned to school.
• Emily advanced to Standard 8 with focused preparation for primary school leaving examinations.
• Monica advanced to Grade 7 showing notable progress in literacy and mathematics.
• Memory resumed vocational training in tailoring and dressmaking modules.
• Aisha resumed vocational training with specialized practical coursework in catering.
`;

const earlyYearsText = `
4. Early Years Programme (Early Childhood Development)
The Early Years nursery and pre-school at Shine Village concluded a productive preparatory phase. Previous enrolment was 85 children, and 24 learners graduated successfully to primary school education. Target enrolment for the upcoming intake is at least 100 learners. The team is maintaining a 1:25 teacher/caregiver ratio, with 4 qualified caregivers required alongside 6 dedicated community volunteers. Programme start date is scheduled for 5 October 2026, and the nourishing daily feeding programme start date is set for 12 October 2026.
`;

const priorityText = `
6. Priorities for the New Programme Year
1. Support girls returning to school with full tuition, uniforms, and learning materials.
2. Monitor educational and vocational progress through systematic term assessments and caregiver check-ins.
3. Enrol at least 100 Early Years learners to expand early childhood foundation skills.
4. Work toward 1:25 teacher/caregiver ratio across all nursery classrooms.
5. Engage community volunteers to assist with early childhood literacy and nutrition preparation.
6. Continue agriculture and gardening to enhance Village food security.
7. Maximise solar irrigation infrastructure to expand dry-season vegetable cultivation.
8. Strengthen education, nutrition, practical skills and community participation across all operational departments.
`;

const transitions = extractHistoricalTransitionsFromText(transitionText);
assert.equal(transitions.length, 8, 'all 8 candidate names should be extracted from the list');
assert.deepEqual(
  transitions.map((item) => item.rawName),
  ['Margaret', 'Patience', 'Bridget', 'Aida', 'Emily', 'Monica', 'Memory', 'Aisha'],
  'names should match the list in order they appear in the report'
);

const earlyYears = extractEarlyYearsMetrics(earlyYearsText);
assert.equal(earlyYears.previousEnrolment, 85, 'prior enrolment should be parsed');
assert.equal(earlyYears.graduates, 24, 'graduates count should be parsed');
assert.equal(earlyYears.targetEnrolment, 100, 'upcoming intake target should be parsed');
assert.equal(earlyYears.teacherCaregiverRatio, '1:25', 'ratio should be kept as a structured value');
assert.equal(extractEarlyYearsMetrics('Early Years target: 1:25 teacher ratio').teacherCaregiverRatio, '1:25', 'teacher ratio value should parse before the ratio label');
assert.equal(extractEarlyYearsMetrics('Maintain teacher-to-child ratio of 1:25').teacherCaregiverRatio, '1:25', 'teacher-to-child ratio wording should also parse');
assert.equal(earlyYears.teachersRequired, 4, 'caregiver count should be parsed');
assert.equal(earlyYears.programmeStartDate, '5 October 2026', 'programme start date should be parsed');
assert.equal(earlyYears.feedingProgrammeStartDate, '12 October 2026', 'feeding start date should be parsed');

const workplans = extractPriorityEntriesFromText(priorityText);
assert.equal(workplans.length, 8, 'all strategic priorities should be extracted as workplan items');
assert.match(workplans[0].text, /Support girls returning to school/i, 'first workplan item should be retained');
assert.match(workplans[3].text, /teacher\/caregiver ratio/i, 'ratio-based priority should be retained');

const childHouseLines = extractChildHouseGirlLines(`
• Margaret – returned to Lilongwe Girls Secondary School.
Patience — returned to school.
- Bridget - returned to school after advancing to Form 3.
Aida – returned to school.
Emily — returned to school after advancing to Standard 8.
Monica - returned to school after advancing to Grade 7.
Memory – resumed vocational training.
Aisha — resumed vocational training.
`);
assert.deepEqual(
  childHouseLines.map((line) => line.rawName),
  ['Margaret', 'Patience', 'Bridget', 'Aida', 'Emily', 'Monica', 'Memory', 'Aisha'],
  'Child House girl lines should accept en dashes, em dashes, and hyphens'
);
assert.match(childHouseLines[2].details, /Form 3/i, 'girl-line status should retain the form level');
assert.match(childHouseLines[4].details, /Standard 8/i, 'girl-line status should retain the standard level');
assert.match(childHouseLines[5].details, /Grade 7/i, 'girl-line status should retain the grade level');

const imageIds = Array.from({ length: 15 }, (_, index) => `rId${index + 2}`);
const imageParagraphXml = imageIds.map((relationshipId, index) => {
  const drawing = `<w:p><mc:AlternateContent><mc:Choice><w:drawing><a:blip r:embed="${relationshipId}"/></w:drawing></mc:Choice><mc:Fallback><w:drawing><a:blip r:embed="${relationshipId}"/></w:drawing></mc:Fallback></mc:AlternateContent></w:p>`;
  const caption = index === 13
    ? '<w:p><w:r><w:t>Children gathered indoors</w:t></w:r></w:p>'
    : index === 14
      ? '<w:p><w:r><w:t>Shine girls together at the centre</w:t></w:r></w:p>'
      : '<w:p><w:r><w:t>Girls making </w:t></w:r><w:r><w:t>manure</w:t></w:r><w:r><w:t> as part of practical skills training</w:t></w:r></w:p>';
  return drawing + caption;
}).join('');
const imageParagraphs = extractDocxParagraphData(imageParagraphXml, imageIds);
const imageCaptionPairs = pairDocxImageCaptions(imageParagraphs);
assert.equal(imageCaptionPairs.length, 15, 'alternate-content drawing duplicates should yield 15 unique images');
assert.equal(imageCaptionPairs[0].caption, 'Girls making manure as part of practical skills training', 'caption text runs should join without losing spaces');
assert.equal(imageCaptionPairs[13].caption, 'Children gathered indoors', 'the penultimate image should pair with its following caption');
assert.equal(imageCaptionPairs[14].caption, 'Shine girls together at the centre', 'the final image should pair with its following caption');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).Node = dom.window.Node;

const samplePath = './tests/fixtures/SHINE_Progress_Report_july to September_2026_Activities_Carried_Out.docx';
const sampleBytes = fs.readFileSync(samplePath);
const sampleName = samplePath.split('/').pop()!;
const expectedGirlCount = 8;
const expectedPhotoCount = 15;
const database = { girls: [], people: [], households: [{ id: 'SH-01' }] } as any;
const user = { id: 'test-user', name: 'Test User', role: 'admin' } as any;

const manualUploadFile = new File([sampleBytes], sampleName);
const manualUpload = await parseDocxFile(manualUploadFile, database, user);
assert.ok(manualUpload.docxResult?.items.length, 'manual upload input should reach document review data');
assert.ok(manualUpload.detectedContacts.length > 0, 'real report should surface stakeholder contacts for review');
assert.ok(manualUpload.detectedContacts.some((contact) => contact.type === 'organisation' && contact.category === 'school'), 'real report should detect schools as organisations');
assert.ok(manualUpload.detectedContacts.some((contact) => contact.name === 'Lilongwe Girls Secondary School'), 'real report should detect Lilongwe Girls Secondary School');
assert.ok(!manualUpload.detectedContacts.some((contact) => contact.name === manualUpload.docxResult?.metadata.author), 'report author should not become a contact');
assert.ok(!manualUpload.detectedContacts.some((contact) => ['Margaret', 'Patience', 'Bridget', 'Aida', 'Emily', 'Monica', 'Memory', 'Aisha'].includes(contact.name)), 'Child House girls should stay out of the contacts directory');
assert.equal(manualUpload.docxResult?.counts.historicalGirls, expectedGirlCount, 'manual upload should detect all girls in the selected fixture');
assert.equal(manualUpload.docxResult?.counts.photos, expectedPhotoCount, 'manual upload should detect the selected fixture photo count');
assert.equal(manualUpload.docxResult?.images.length, 15, 'the real report should extract all 15 inline images');
assert.ok(
  manualUpload.docxResult?.images.every((image) => image.base64.startsWith('data:image/jpeg;base64,') && Boolean(image.caption)),
  'every real image should have a renderable preview and paired caption'
);
assert.equal(manualUpload.docxResult?.images[13].caption, 'Children gathered indoors during a community celebration');
assert.equal(manualUpload.docxResult?.images[14].caption, 'Shine girls together at the centre');
const actualPhotoItems = manualUpload.docxResult?.items.filter((item) => item.classification === 'PHOTO_HIGHLIGHT') || [];
assert.equal(actualPhotoItems.length, 15, 'the real report should show one review card per image');
assert.ok(actualPhotoItems.every((item) => Boolean(item.photoBase64 && item.photoCaption)), 'each real photo card should carry its preview and caption');
const earlyYearsRatioItem = manualUpload.docxResult?.items.find(
  (item) => item.targetEntity === 'earlyYears' && /1:25 teacher\/caregiver-to-learner ratio/i.test(item.originalSnippet || '')
);
assert.ok(earlyYearsRatioItem, 'the ratio target should remain an Early Years record');
assert.equal(earlyYearsRatioItem.extractedData.createWorkplan, true, 'the pending ratio target should also be routed to Workplan');
assert.match(earlyYearsRatioItem.extractedData.workplanAction, /work toward/i, 'the Workplan copy should carry the pending ratio sentence');
const businessCompetitionItem = manualUpload.docxResult?.items.find((item) => /business competitions/i.test(item.originalSnippet || ''));
assert.equal(businessCompetitionItem?.extractedData.activityCategory, 'Business / Entrepreneurship', 'business competitions should suggest the business category');
const businessMentorshipItem = manualUpload.docxResult?.items.find(
  (item) => /mentorship activities included pairing girls with role models in business/i.test(item.originalSnippet || '')
);
assert.equal(businessMentorshipItem?.extractedData.activityCategory, 'Business / Entrepreneurship', 'business mentorship should suggest the business category');
const sportsActivityItem = manualUpload.docxResult?.items.find((item) => /sports and fitness/i.test(item.originalSnippet || ''));
assert.equal(sportsActivityItem?.extractedData.activityCategory, 'Sports / Recreation', 'sports should receive a specific suggested category');
const unmatchedLegacyTransition = manualUpload.docxResult?.items.find(
  (item) => item.classification === 'INDIVIDUAL_GIRL_HISTORICAL' && item.matchedName === 'Margaret'
);
assert.equal(unmatchedLegacyTransition?.matchConfidence, 'none', 'new Child House names should be marked as not yet matched');

const fetchedBlob = new Blob([sampleBytes], {
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
const shortcutFile = new File([fetchedBlob], sampleName, { type: fetchedBlob.type });
const shortcutUpload = await parseDocxFile(shortcutFile, database, user);
assert.ok(shortcutUpload.docxResult?.items.length, 'shortcut-loaded input should reach document review data');
assert.equal(shortcutUpload.docxResult?.counts.historicalGirls, expectedGirlCount, 'shortcut input should detect all girls in the selected fixture');
assert.equal(shortcutUpload.docxResult?.counts.photos, expectedPhotoCount, 'shortcut input should detect the selected fixture photo count');

const syntheticZip = new JSZip();
syntheticZip.file(
  '[Content_Types].xml',
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
);
syntheticZip.file(
  '_rels/.rels',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
);
const xmlParagraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const childHouseParagraphs = [
  'Margaret – returned to Lilongwe Girls Secondary School.',
  'Patience — returned to school.',
  'Bridget - returned to school after advancing to Form 3.',
  'Aida – returned to school.',
  'Emily — returned to school after advancing to Standard 8.',
  'Monica - returned to school after advancing to Grade 7.',
  'Memory – resumed vocational training.',
  'Aisha — resumed vocational training.',
].map(xmlParagraph).join('');
const syntheticPhotoCaptions = Array.from({ length: 15 }, (_, index) => {
  if (index === 13) return xmlParagraph('Children gathered indoors');
  if (index === 14) return xmlParagraph('Shine girls together at the centre');
  return '<w:p><w:r><w:t>Girls making </w:t></w:r><w:r><w:t>manure</w:t></w:r><w:r><w:t> as part of practical skills training</w:t></w:r></w:p>';
});
const syntheticImageParagraphs = Array.from({ length: 15 }, (_, index) => {
  const relationshipId = `rId${index + 2}`;
  syntheticZip.file(`word/media/image${index + 1}.png`, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuoAAAAASUVORK5CYII=', { base64: true });
  return `<w:p><w:r><w:drawing><a:blip r:embed="${relationshipId}"/><a:blip r:embed="${relationshipId}"/></w:drawing></w:r></w:p>${syntheticPhotoCaptions[index]}`;
}).join('');
const syntheticDocumentXml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>${xmlParagraph('2. Child House')}${childHouseParagraphs}${xmlParagraph('11. Pictorial Highlights')}${syntheticImageParagraphs}</w:body></w:document>`;
const imageRelationships = Array.from({ length: 15 }, (_, index) =>
  `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${index + 1}.png"/>`
).join('');
syntheticZip.file('word/document.xml', syntheticDocumentXml);
syntheticZip.file(
  'word/_rels/document.xml.rels',
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${imageRelationships}</Relationships>`
);
const syntheticBytes = await syntheticZip.generateAsync({ type: 'arraybuffer' });
const syntheticDatabase = {
  girls: [{ id: 'G-MARGARET', fullName: 'Margaret Example', school: 'Current School', classLevel: 'Form 4' }],
  people: [],
  households: [{ id: 'SH-01' }],
} as any;
const syntheticResult = await parseDocxFile(new File([syntheticBytes], 'synthetic-progress.docx'), syntheticDatabase, user);
assert.equal(syntheticResult.docxResult?.counts.historicalGirls, 8, 'synthetic Child House report should detect all eight girls');
assert.equal(syntheticResult.docxResult?.counts.photos, 15, 'synthetic report should emit one photo record per unique image relationship');
assert.equal(syntheticResult.docxResult?.images.length, 15, 'synthetic report should extract all image previews');
assert.ok(syntheticResult.docxResult?.images.every((image) => image.base64.startsWith('data:image/png;base64,')), 'each extracted image should have a renderable data URL');
assert.equal(syntheticResult.docxResult?.images[13].caption, 'Children gathered indoors', 'the penultimate embedded image should retain its caption');
assert.equal(syntheticResult.docxResult?.images[14].caption, 'Shine girls together at the centre', 'the final embedded image should retain its caption');
const matchedMargaret = syntheticResult.docxResult?.items.find(
  (item) => item.classification === 'INDIVIDUAL_GIRL_HISTORICAL' && item.matchedName === 'Margaret Example'
);
const newPatience = syntheticResult.docxResult?.items.find(
  (item) => item.classification === 'INDIVIDUAL_GIRL_HISTORICAL' && item.matchedName === 'Patience'
);
assert.equal(matchedMargaret?.matchConfidence, 'high', 'existing girl records should be matched by name');
assert.equal(newPatience?.matchConfidence, 'none', 'unmatched girl lines should be flagged as new');
assert.equal(matchedMargaret?.resultType, 'HISTORICAL_RECORD', 'matched girls should remain protected historical updates');
assert.equal(newPatience?.resultType, 'NEW_RECORD', 'unmatched girl lines should be marked as new records');
const photoPreviewItems = syntheticResult.docxResult?.items.filter((item) => item.classification === 'PHOTO_HIGHLIGHT') || [];
assert.equal(photoPreviewItems.length, 15, 'each image should produce a single review card');
assert.ok(photoPreviewItems.every((item) => item.photoBase64?.startsWith('data:image/png;base64,')), 'photo cards should carry the preview source');
assert.equal(photoPreviewItems[13].photoCaption, 'Children gathered indoors', 'penultimate photo card should carry the matching caption');
assert.equal(photoPreviewItems[14].photoCaption, 'Shine girls together at the centre', 'final photo card should carry the matching caption');

console.log('docx parser regression checks passed for both ingestion file paths');
