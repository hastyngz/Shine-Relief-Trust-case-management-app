import React, { useMemo, useState } from 'react';
import { Mail, MapPin, Phone, Plus, Search, UserRound } from 'lucide-react';
import { AppDatabase, ContactCategory, ContactRecord } from '../../types';
import { getDatabase, saveDatabase } from '../../utils/storage';

interface ContactsViewProps {
  db: AppDatabase;
  onBack: () => void;
}

const normalize = (value?: string | null) => (value || '').trim();

const asContactRecord = (person: any): ContactRecord => ({
  id: person.id,
  type: 'person',
  name: person.fullName || 'Unknown Contact',
  aliases: [person.fullName || 'Unknown Contact'],
  affiliation: person.workplaceOrAffiliation || person.organisation,
  roleTitle: person.positionTitle || person.personType || 'Contact',
  category: 'other' as ContactCategory,
  phone: person.phoneNumber ? [person.phoneNumber] : [],
  email: person.email ? [person.email] : [],
  address: person.location,
  notes: person.notes || '',
  programmes: [],
  firstSeen: person.dateFirstIdentified || new Date().toISOString(),
  lastSeen: person.updatedDate || new Date().toISOString(),
  createdBy: person.createdBy || 'System',
  createdByUid: person.createdBy || 'system',
  createdAt: person.createdDate || new Date().toISOString(),
  updatedAt: person.updatedDate || new Date().toISOString(),
  updatedByUid: person.updatedBy || 'system',
  updatedByName: person.updatedBy || 'System',
  source: 'manual',
  archived: false,
  interactions: [],
});

export const ContactsView: React.FC<ContactsViewProps> = ({ db, onBack }) => {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    roleTitle: '',
    phone: '',
    email: '',
    organisation: '',
    notes: '',
  });

  const contacts = useMemo(() => {
    const list: ContactRecord[] = [...(db.contacts || [])];
    for (const person of db.people || []) {
      const existing = list.find((contact) => contact.id === person.id);
      if (!existing) {
        list.push(asContactRecord(person));
      }
    }
    return list.filter((contact) => !contact.archived).sort((a, b) => a.name.localeCompare(b.name));
  }, [db.contacts, db.people]);

  const filteredContacts = contacts.filter((contact) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [contact.name, contact.roleTitle || '', contact.affiliation || '', contact.phone.join(' '), contact.email.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const handleCreate = () => {
    const name = normalize(draft.name);
    if (!name) return;

    const created: ContactRecord = {
      id: `CONTACT-${Date.now().toString().slice(-6)}`,
      type: 'person',
      name,
      aliases: [name],
      affiliation: normalize(draft.organisation) || undefined,
      roleTitle: normalize(draft.roleTitle) || 'Contact',
      category: 'other',
      phone: normalize(draft.phone) ? [normalize(draft.phone)] : [],
      email: normalize(draft.email) ? [normalize(draft.email)] : [],
      notes: normalize(draft.notes),
      programmes: [],
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      createdBy: 'Staff User',
      createdByUid: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedByUid: 'manual',
      updatedByName: 'Staff User',
      source: 'manual',
      archived: false,
      interactions: [],
    };

    const nextDb = getDatabase();
    const contactsList = [...(nextDb.contacts || [])];
    contactsList.unshift(created);
    saveDatabase({ ...nextDb, contacts: contactsList });
    setDraft({ name: '', roleTitle: '', phone: '', email: '', organisation: '', notes: '' });
    setShowForm(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">Directory</p>
          <h1 className="text-2xl font-black text-stone-900">Contacts & Stakeholders</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-3 py-2 text-xs font-bold text-white shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add contact
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
          >
            Back
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[11px] font-semibold text-stone-700">
              Full name
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm" placeholder="e.g. Pastor Chisomo Banda" />
            </label>
            <label className="text-[11px] font-semibold text-stone-700">
              Role / title
              <input value={draft.roleTitle} onChange={(event) => setDraft({ ...draft, roleTitle: event.target.value })} className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm" placeholder="Teacher, Pastor, Nurse, Partner" />
            </label>
            <label className="text-[11px] font-semibold text-stone-700">
              Phone
              <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm" placeholder="+265 ..." />
            </label>
            <label className="text-[11px] font-semibold text-stone-700">
              Email
              <input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm" placeholder="name@example.org" />
            </label>
            <label className="text-[11px] font-semibold text-stone-700 md:col-span-2">
              Organisation / affiliation
              <input value={draft.organisation} onChange={(event) => setDraft({ ...draft, organisation: event.target.value })} className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm" placeholder="School, church, clinic, NGO or partner" />
            </label>
            <label className="text-[11px] font-semibold text-stone-700 md:col-span-2">
              Notes
              <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="mt-1 min-h-[84px] w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm" placeholder="Relationship to the girls, referral source, or follow-up notes" />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700">Cancel</button>
            <button type="button" onClick={handleCreate} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white">Save contact</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, phone, email or affiliation"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-xs text-stone-700 outline-none focus:border-teal-700"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredContacts.length === 0 ? (
          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-500">
            No contacts match the current filter.
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <article key={contact.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-stone-900">{contact.name}</h2>
                    <p className="text-[11px] text-stone-500">{contact.roleTitle || 'Contact'}</p>
                  </div>
                </div>
                <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-600">
                  {contact.category}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-[11px] text-stone-600">
                {contact.affiliation && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 text-stone-400" />
                    <span>{contact.affiliation}</span>
                  </div>
                )}
                {contact.phone?.[0] && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-stone-400" />
                    <span>{contact.phone[0]}</span>
                  </div>
                )}
                {contact.email?.[0] && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-stone-400" />
                    <span>{contact.email[0]}</span>
                  </div>
                )}
              </div>

              {contact.notes && (
                <p className="mt-4 rounded-xl bg-stone-50 p-2 text-[11px] leading-relaxed text-stone-600">
                  {contact.notes}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-[10px] uppercase tracking-[0.15em] text-stone-400">
                <span>Last seen</span>
                <span>{new Date(contact.lastSeen || contact.updatedAt).toLocaleDateString()}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
