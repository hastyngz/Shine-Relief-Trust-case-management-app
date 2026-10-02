import assert from 'node:assert/strict';
import { detectContactEntities, detectRosterContacts, matchContactCandidate } from '../src/services/contactsService';
import { ContactRecord } from '../src/types';

const baseContact: ContactRecord = {
  id: 'contact-school',
  type: 'organisation',
  name: 'Lilongwe Girls Secondary School',
  aliases: ['Lilongwe Secondary'],
  category: 'school',
  phone: ['+265 999 123 456'],
  email: ['office@example.org'],
  notes: '',
  programmes: ['Child House'],
  firstSeen: '2026-01-01',
  lastSeen: '2026-09-30',
  createdBy: 'staff-1',
  createdByUid: 'staff-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
  updatedByUid: 'staff-1',
  updatedByName: 'Staff One',
  source: 'manual',
  archived: false,
  interactions: [],
};

const exact = matchContactCandidate({
  type: 'organisation', name: 'Lilongwe Secondary', category: 'school', phone: [], email: [], context: '', confidence: 0.9,
}, [baseContact]);
assert.equal(exact.status, 'linked');
assert.equal(exact.contact?.id, baseContact.id);

const fuzzy = matchContactCandidate({
  type: 'organisation', name: 'Lilongwe Girl Secondary School', category: 'school', phone: [], email: [], context: '', confidence: 0.8,
}, [baseContact]);
assert.equal(fuzzy.status, 'possible');
assert.equal(fuzzy.candidates[0].id, baseContact.id);

const fresh = matchContactCandidate({
  type: 'person', name: 'Dr Alice Banda', category: 'other', phone: [], email: [], context: '', confidence: 0.9,
}, [baseContact]);
assert.equal(fresh.status, 'new');

const detected = detectContactEntities(
  'Lilongwe Girls Secondary School hosted the session; call +265 999 123 456 or email school@example.org. Dr Alice Banda, guest speaker, joined the Early Years programme. Author: Grace Phiri.',
  { authorName: 'Grace Phiri', excludedNames: ['Martha John'] }
);
assert.ok(detected.some((candidate) => candidate.name === 'Lilongwe Girls Secondary School' && candidate.category === 'school'));
assert.ok(detected.some((candidate) => candidate.name === 'Alice Banda' && candidate.type === 'person'));
assert.ok(detected.some((candidate) => candidate.phone.includes('+265999123456')));
assert.ok(detected.some((candidate) => candidate.email.includes('school@example.org')));
assert.ok(!detected.some((candidate) => /Grace Phiri|Martha John/.test(candidate.name)));

const rosterDetected = detectRosterContacts([
  { 'Contact Name': 'Nurse Peter Zulu', Role: 'Health Worker', Phone: '+265 888 234 567', Email: 'peter@example.org' },
  { 'Organisation Name': 'Zomba Community Health Centre', Category: 'Health Facility' },
  { 'Student Name': 'Child House Girl Example', Programme: 'Child House' },
], { excludedNames: ['Child House Girl Example'] });
assert.equal(rosterDetected.length, 2);
assert.ok(rosterDetected.some((candidate) => candidate.name === 'Zomba Community Health Centre' && candidate.type === 'organisation'));
assert.ok(rosterDetected.some((candidate) => candidate.phone.includes('+265888234567') && candidate.email.includes('peter@example.org')));

console.log('Contact matching and entity detection tests passed.');
