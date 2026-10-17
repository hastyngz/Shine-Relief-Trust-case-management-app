import {
  collection,
  doc,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { getDatabase, saveDatabase } from '../utils/storage';
import { isBrowserOnline, loadQueue } from './offlineSync';
import {
  ContactCategory,
  ContactEntityType,
  ContactInteraction,
  ContactRecord,
  ContactSource,
} from '../types';

export const CONTACT_CATEGORIES: ContactCategory[] = [
  'school',
  'church',
  'partner NGO',
  'government',
  'donor',
  'supplier',
  'customer',
  'volunteer',
  'guest speaker',
  'health facility',
  'other',
];

export interface ContactCandidate {
  type: ContactEntityType;
  name: string;
  category: ContactCategory;
  roleTitle?: string;
  affiliation?: string;
  phone: string[];
  email: string[];
  context: string;
  confidence: number;
  programme?: string;
  sourceRecordId?: string;
}

export interface ContactMatch {
  status: 'linked' | 'possible' | 'new';
  contact?: ContactRecord;
  candidates: ContactRecord[];
}

export interface ConfirmedContactCandidate {
  candidate: ContactCandidate;
  contactId?: string;
}

export function normalizeContactValue(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const current = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return row[right.length];
}

function similarity(left: string, right: string): number {
  const a = normalizeContactValue(left);
  const b = normalizeContactValue(right);
  if (!a || !b) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

export function matchContactCandidate(candidate: ContactCandidate, contacts: ContactRecord[]): ContactMatch {
  const activeContacts = contacts.filter((contact) => !contact.archived && contact.type === candidate.type);
  const candidatePhones = new Set(candidate.phone.map(normalizeContactValue).filter(Boolean));
  const candidateEmails = new Set(candidate.email.map(normalizeContactValue).filter(Boolean));
  const exact = activeContacts.find((contact) => {
    const names = [contact.name, ...contact.aliases].map(normalizeContactValue);
    const phones = contact.phone.map(normalizeContactValue);
    const emails = contact.email.map(normalizeContactValue);
    return names.includes(normalizeContactValue(candidate.name)) ||
      phones.some((phone) => candidatePhones.has(phone)) ||
      emails.some((email) => candidateEmails.has(email));
  });
  if (exact) return { status: 'linked', contact: exact, candidates: [exact] };

  const possible = activeContacts
    .map((contact) => ({ contact, score: Math.max(similarity(candidate.name, contact.name), ...contact.aliases.map((alias) => similarity(candidate.name, alias))) }))
    .filter(({ score }) => score >= 0.78)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ contact }) => contact);
  return possible.length > 0
    ? { status: 'possible', candidates: possible }
    : { status: 'new', candidates: [] };
}

function categoryFromCue(text: string, type: ContactEntityType): ContactCategory {
  const value = text.toLowerCase();
  if (/school|college|university|training institution|secondary|primary/.test(value)) return 'school';
  if (/church|pastor|bishop|reverend/.test(value)) return 'church';
  if (/hospital|clinic|health centre|health center|nurse|doctor|medical facility/.test(value)) return 'health facility';
  if (/government|ministry|council|district office/.test(value)) return 'government';
  if (/donor|funding|sponsor/.test(value)) return 'donor';
  if (/supplier|vendor|company|business/.test(value)) return 'supplier';
  if (/volunteer/.test(value)) return 'volunteer';
  if (/guest speaker|speaker|mentor/.test(value)) return 'guest speaker';
  if (/ngo|partner organisation|partner organization|foundation|trust/.test(value)) return type === 'organisation' ? 'partner NGO' : 'other';
  return 'other';
}

function contactChannels(context: string): { phone: string[]; email: string[] } {
  const email = Array.from(new Set(context.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
  const phone = Array.from(new Set((context.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || [])
    .map((value) => value.replace(/[\s().-]/g, ''))
    .filter((value) => value.replace(/\D/g, '').length >= 7)));
  return { phone, email };
}

function programmeFromCue(text: string): string | undefined {
  if (/early years|early childhood|ecd|nursery|pre-school/i.test(text)) return 'Early Years';
  if (/agriculture|gardening|irrigation|farming/i.test(text)) return 'Agriculture';
  if (/child house/i.test(text)) return 'Child House';
  return undefined;
}

export function detectContactEntities(
  text: string,
  options: { authorName?: string; excludedNames?: string[]; programme?: string } = {}
): ContactCandidate[] {
  const excluded = new Set(
    [options.authorName, ...(options.excludedNames || [])]
      .filter((value): value is string => Boolean(value))
      .map(normalizeContactValue)
  );
  const found = new Map<string, ContactCandidate>();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const orgSuffix = '(?:Secondary\\s+School|Primary\\s+School|School|Church|Ministry|Hospital|Health\\s+(?:Centre|Center|Facility)|NGO|Trust|Foundation|University|College|Training\\s+(?:Centre|Center|Institution)|District\\s+Council|Council|Company|Organisation|Organization|Limited|Ltd\\.?)';
  const orgRegex = new RegExp(`\\b((?:(?:[A-Z][\\p{L}\\d&'’.-]*|of|and|the)\\s+){0,5}[A-Z][\\p{L}\\d&'’.-]*\\s+${orgSuffix})\\b`, 'gu');
  const partnerOrgRegex = /\\b(?:partner organisations?|partner organizations?|partner NGOs?|working with|in collaboration with)\\s*[:,-]?\\s*((?:[A-Z][\\p{L}\\d&'’.-]*|of|and|the)(?:\\s+(?:[A-Z][\\p{L}\\d&'’.-]*|of|and|the)){0,5})/giu;
  const titledPersonRegex = /\b(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Pastor|Reverend|Rev\.?|Bishop|Nurse|Teacher|Mentor|Facilitator|Guest Speaker)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2})/gu;
  const contextualPersonRegex = /\b(?:guest speakers?|mentors?|health workers?|suppliers?|donors?|facilitators?)\b[^A-Z]{0,30}([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){1,2})/giu;

  const addCandidate = (candidate: ContactCandidate) => {
    const normalizedName = normalizeContactValue(candidate.name);
    if (!normalizedName || excluded.has(normalizedName) || /shine(relieftrust|village|girls?)/i.test(normalizedName)) return;
    const key = `${candidate.type}:${normalizedName}`;
    const previous = found.get(key);
    if (previous) {
      previous.phone = Array.from(new Set([...previous.phone, ...candidate.phone]));
      previous.email = Array.from(new Set([...previous.email, ...candidate.email]));
      previous.confidence = Math.max(previous.confidence, candidate.confidence);
      return;
    }
    found.set(key, candidate);
  };

  for (const line of lines) {
    const channels = contactChannels(line);
    orgRegex.lastIndex = 0;
    for (const match of line.matchAll(orgRegex)) {
      const name = match[1].trim().replace(/[.,;:]+$/, '');
      addCandidate({
        type: 'organisation',
        name,
        category: categoryFromCue(name, 'organisation'),
        phone: channels.phone,
        email: channels.email,
        context: line,
        confidence: 0.9,
        programme: options.programme || programmeFromCue(line),
      });
    }
    partnerOrgRegex.lastIndex = 0;
    for (const match of line.matchAll(partnerOrgRegex)) {
      const name = match[1].trim().replace(/[.,;:]+$/, '');
      if (name.length < 3) continue;
      addCandidate({
        type: 'organisation',
        name,
        category: categoryFromCue(`${name} partner organisation`, 'organisation'),
        phone: channels.phone,
        email: channels.email,
        context: line,
        confidence: 0.75,
        programme: options.programme || programmeFromCue(line),
      });
    }

    const personMatches = [
      ...Array.from(line.matchAll(titledPersonRegex), (match) => ({ title: match[1], name: match[2] })),
      ...Array.from(line.matchAll(contextualPersonRegex), (match) => ({ title: '', name: match[1] })),
    ];
    for (const person of personMatches) {
      addCandidate({
        type: 'person',
        name: person.name.trim(),
        category: categoryFromCue(`${person.title} ${line}`, 'person'),
        roleTitle: person.title.trim() || undefined,
        affiliation: undefined,
        phone: channels.phone,
        email: channels.email,
        context: line,
        confidence: person.title ? 0.88 : 0.7,
        programme: options.programme || programmeFromCue(line),
      });
    }
  }
  return Array.from(found.values());
}

export function detectRosterContacts(
  rows: Array<Record<string, unknown>>,
  options: { excludedNames?: string[] } = {}
): ContactCandidate[] {
  const excluded = new Set((options.excludedNames || []).map(normalizeContactValue));
  const candidates = new Map<string, ContactCandidate>();
  const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  rows.forEach((row) => {
    const entries = Object.entries(row).map(([key, value]) => [key, String(value ?? '').trim()] as const);
    const get = (...names: string[]) => {
      const accepted = new Set(names.map(normalizeHeader));
      return entries.find(([key, value]) => accepted.has(normalizeHeader(key)) && value)?.[1] || '';
    };
    const headers = entries.map(([key]) => normalizeHeader(key));
    const rowText = entries.filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join('. ');
    const contactColumn = headers.some((header) => /contact|stakeholder|partner|supplier|donor|speaker|mentor|school|church|organisation|organization|institution|facility/.test(header));
    const beneficiaryColumn = headers.some((header) => /girlname|studentname|beneficiaryname|childname|girlid|studentid|beneficiaryid|guardian|dateofbirth|classlevel|grade|form/.test(header));
    if (beneficiaryColumn) return;

    const organisationName = get('organisation name', 'organization name', 'institution name', 'school name', 'facility name', 'company name');
    const personName = get('contact name', 'person name', 'full name', 'stakeholder name', 'name');
    const typeValue = get('type', 'contact type', 'entity type').toLowerCase();
    const roleTitle = get('role', 'title', 'position', 'job title');
    const name = organisationName || personName;
    if (!name || excluded.has(normalizeContactValue(name))) return;
    const type: ContactEntityType = /organisation|organization|school|church|ngo|company|facility|institution/.test(`${typeValue} ${rowText.toLowerCase()}`) && !personName
      ? 'organisation'
      : /organisation|organization/.test(typeValue) || organisationName
      ? 'organisation'
      : 'person';
    if (!contactColumn && !/\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Pastor|Reverend|Rev\.?|Bishop|Nurse|Teacher)\s+[A-Z]/.test(`${roleTitle} ${name}`)) return;

    const channels = contactChannels(rowText);
    const category = categoryFromCue(`${headers.join(' ')} ${typeValue} ${roleTitle} ${rowText}`, type);
    const candidate: ContactCandidate = {
      type,
      name,
      category,
      roleTitle: roleTitle || undefined,
      affiliation: get('organisation', 'organization', 'affiliation', 'workplace'),
      phone: channels.phone,
      email: channels.email,
      context: rowText,
      confidence: contactColumn ? 0.9 : 0.72,
      programme: get('programme', 'program') || programmeFromCue(rowText),
      sourceRecordId: get('record id', 'source record id', 'id') || undefined,
    };
    candidates.set(`${type}:${normalizeContactValue(name)}`, candidate);
  });
  return Array.from(candidates.values());
}

export async function listContacts(includeArchived = false): Promise<ContactRecord[]> {
  const snapshot = await getDocs(collection(firestore, 'contacts'));
  const contactsById = new Map<string, ContactRecord>(
    snapshot.docs.map((contactDoc) => [contactDoc.id, { id: contactDoc.id, ...contactDoc.data() } as ContactRecord]),
  );

  // A cloud snapshot can arrive before the durable local queue has flushed.
  // Overlay only contacts with a persisted pending operation; never prefer an
  // arbitrary stale local copy over the current server record.
  const queue = await loadQueue();
  const localContacts = new Map((getDatabase().contacts || []).map((contact) => [contact.id, contact]));
  for (const entry of queue) {
    if (entry.collection !== 'contacts') continue;
    if (entry.operation === 'delete') {
      contactsById.delete(entry.recordId);
      continue;
    }
    const local = localContacts.get(entry.recordId);
    const queued = entry.data as ContactRecord | null;
    if (local) contactsById.set(entry.recordId, local);
    else if (queued) contactsById.set(entry.recordId, queued);
  }

  return [...contactsById.values()]
    .filter((contact) => includeArchived || (!contact.archived && !contact.mergedInto))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function saveContactLocally(record: ContactRecord, creating = false): ContactRecord {
  const db = getDatabase();
  const previousContacts = db.contacts || [];
  if (!creating && !previousContacts.some((contact) => contact.id === record.id)) {
    throw new Error('Contact is not available in the local directory. Refresh the directory and try again.');
  }
  db.contacts = creating
    ? [...previousContacts.filter((contact) => contact.id !== record.id), record]
    : previousContacts.map((contact) => contact.id === record.id ? record : contact);
  const saved = saveDatabase(db);
  if (!saved.ok) {
    db.contacts = previousContacts;
    throw new Error(saved.quotaExceeded
      ? 'Contact was not saved because this device is out of storage. Free space and try again.'
      : 'Contact was not saved because local storage is unavailable. Try again.');
  }
  return record;
}

export type ContactDraft = Pick<ContactRecord, 'type' | 'name' | 'category'> & Partial<Omit<ContactRecord, 'id' | 'type' | 'name' | 'category'>>;

export async function createContact(
  draft: ContactDraft,
  actor: { uid: string; name: string },
  source: ContactSource = 'manual',
  interaction?: ContactInteraction
): Promise<ContactRecord> {
  const contactRef = doc(collection(firestore, 'contacts'));
  const now = new Date().toISOString();
  const record: ContactRecord = {
    id: contactRef.id,
    type: draft.type,
    name: draft.name.trim(),
    aliases: draft.aliases || [],
    organisationId: draft.organisationId,
    affiliation: draft.affiliation,
    roleTitle: draft.roleTitle,
    category: draft.category,
    phone: draft.phone || [],
    email: draft.email || [],
    address: draft.address,
    district: draft.district,
    notes: draft.notes || '',
    programmes: Array.from(new Set([...(draft.programmes || []), ...(interaction?.programme ? [interaction.programme] : [])])),
    firstSeen: interaction?.date || draft.firstSeen || now.slice(0, 10),
    lastSeen: interaction?.date || draft.lastSeen || now.slice(0, 10),
    createdBy: actor.uid,
    createdByUid: actor.uid,
    createdAt: now,
    updatedAt: now,
    updatedByUid: actor.uid,
    updatedByName: actor.name,
    source,
    archived: false,
    interactions: interaction ? [interaction] : draft.interactions || [],
  };
  return saveContactLocally(record, true);
}

export async function updateContact(
  id: string,
  changes: Partial<ContactRecord>,
  actor: { uid: string; name: string }
): Promise<ContactRecord> {
  const db = getDatabase();
  const current = (db.contacts || []).find((contact) => contact.id === id);
  if (!current) throw new Error('Contact is not available in the local directory. Refresh the directory and try again.');
  // Audit ownership fields must not be supplied by a form or caller.
  const { id: _ignoredId, createdBy: _ignoredCreator, createdByUid: _ignoredCreatorUid,
    createdAt: _ignoredCreatedAt, ...safeChanges } = changes;
  void _ignoredId; void _ignoredCreator; void _ignoredCreatorUid; void _ignoredCreatedAt;
  const updated: ContactRecord = {
    ...current,
    ...safeChanges,
    id: current.id,
    createdBy: current.createdBy,
    createdByUid: current.createdByUid,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    updatedByUid: actor.uid,
    updatedByName: actor.name,
  };
  return saveContactLocally(updated);
}

export async function addContactInteraction(
  id: string,
  interaction: ContactInteraction,
  actor: { uid: string; name: string }
): Promise<void> {
  const db = getDatabase();
  const contact = (db.contacts || []).find((candidate) => candidate.id === id);
  if (!contact) throw new Error('Contact no longer exists in the local directory.');
  const updated: ContactRecord = {
    ...contact,
    interactions: [...(contact.interactions || []), interaction],
    lastSeen: contact.lastSeen > interaction.date ? contact.lastSeen : interaction.date,
    programmes: Array.from(new Set([...(contact.programmes || []), ...(interaction.programme ? [interaction.programme] : [])])),
    updatedAt: new Date().toISOString(),
    updatedByUid: actor.uid,
    updatedByName: actor.name,
  };
  saveContactLocally(updated);
}

export async function archiveContact(id: string, actor: { uid: string; name: string }): Promise<ContactRecord> {
  return updateContact(id, { archived: true }, actor);
}

export async function mergeContacts(
  primaryId: string,
  duplicateId: string,
  actor: { uid: string; name: string }
): Promise<void> {
  if (!isBrowserOnline()) throw new Error('Contact merging needs an internet connection because both records must be updated together. Reconnect and retry; neither contact was changed.');
  const pendingContactChanges = (await loadQueue()).filter((entry) => entry.collection === 'contacts' && (entry.recordId === primaryId || entry.recordId === duplicateId));
  if (pendingContactChanges.length) throw new Error('These contacts have unsynced local changes. Let them sync or resolve their conflicts before merging; no merge was performed.');
  const primaryRef = doc(firestore, 'contacts', primaryId);
  const duplicateRef = doc(firestore, 'contacts', duplicateId);
  await runTransaction(firestore, async (transaction) => {
    const [primarySnapshot, duplicateSnapshot] = await Promise.all([
      transaction.get(primaryRef),
      transaction.get(duplicateRef),
    ]);
    if (!primarySnapshot.exists() || !duplicateSnapshot.exists()) throw new Error('Both contacts must exist to merge.');
    const primary = primarySnapshot.data() as ContactRecord;
    const duplicate = duplicateSnapshot.data() as ContactRecord;
    const now = new Date().toISOString();
    transaction.update(primaryRef, {
      aliases: Array.from(new Set([...primary.aliases, duplicate.name, ...duplicate.aliases])),
      phone: Array.from(new Set([...primary.phone, ...duplicate.phone])),
      email: Array.from(new Set([...primary.email, ...duplicate.email])),
      programmes: Array.from(new Set([...primary.programmes, ...duplicate.programmes])),
      interactions: [...primary.interactions, ...duplicate.interactions],
      lastSeen: primary.lastSeen > duplicate.lastSeen ? primary.lastSeen : duplicate.lastSeen,
      updatedAt: now,
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    transaction.update(duplicateRef, {
      archived: true,
      mergedInto: primaryId,
      updatedAt: now,
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
  });
}
