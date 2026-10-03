import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronLeft, Edit2, Mail, MapPin, Merge, Phone, Plus, Search, UserRound, X } from 'lucide-react';
import { AppDatabase, ContactCategory, ContactEntityType, ContactRecord } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { archiveContact, CONTACT_CATEGORIES, createContact, listContacts, mergeContacts, updateContact } from '../../services/contactsService';

interface ContactsViewProps {
  db: AppDatabase;
}

type ContactDraft = {
  type: ContactEntityType;
  name: string;
  category: ContactCategory;
  roleTitle: string;
  affiliation: string;
  phone: string;
  email: string;
  address: string;
  district: string;
  notes: string;
  programmes: string;
};

const emptyDraft = (): ContactDraft => ({
  type: 'person', name: '', category: 'other', roleTitle: '', affiliation: '', phone: '', email: '',
  address: '', district: '', notes: '', programmes: '',
});
const splitValues = (value: string) => value.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
const shownDate = (value?: string) => value ? new Date(value).toLocaleDateString() : 'Not recorded';

export const ContactsView: React.FC<ContactsViewProps> = ({ db }) => {
  const { currentUser, staffProfile, canEdit } = useAuth();
  const [contacts, setContacts] = useState<ContactRecord[]>(db.contacts || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [programmeFilter, setProgrammeFilter] = useState('all');
  const [selected, setSelected] = useState<ContactRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const [mergeTarget, setMergeTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const actor = { uid: currentUser?.uid || 'unknown', name: staffProfile?.fullName || currentUser?.displayName || 'Staff member' };
  const refreshContacts = async () => {
    setLoading(true);
    try {
      setContacts(await listContacts());
      setError('');
    } catch (loadError) {
      setContacts(db.contacts || []);
      setError('Could not load the live contacts directory. Showing locally available contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refreshContacts(); }, []);
  useEffect(() => {
    if (!loading) setContacts(db.contacts || []);
  }, [db.contacts]);

  const programmes = useMemo(() => Array.from(new Set(contacts.flatMap((contact) => contact.programmes || []))).sort(), [contacts]);
  const filtered = useMemo(() => contacts.filter((contact) => {
    if (contact.archived || contact.mergedInto) return false;
    if (typeFilter !== 'all' && contact.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && contact.category !== categoryFilter) return false;
    if (programmeFilter !== 'all' && !contact.programmes?.includes(programmeFilter)) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [contact.name, ...(contact.aliases || []), contact.roleTitle, contact.affiliation, contact.district, ...(contact.phone || []), ...(contact.email || [])]
      .filter(Boolean).join(' ').toLowerCase().includes(query);
  }), [contacts, typeFilter, categoryFilter, programmeFilter, search]);

  const startCreate = () => {
    setSelected(null);
    setDraft(emptyDraft());
    setEditing(true);
  };

  const startEdit = (contact: ContactRecord) => {
    setDraft({
      type: contact.type, name: contact.name, category: contact.category, roleTitle: contact.roleTitle || '',
      affiliation: contact.affiliation || '', phone: (contact.phone || []).join(', '), email: (contact.email || []).join(', '),
      address: contact.address || '', district: contact.district || '', notes: contact.notes || '',
      programmes: (contact.programmes || []).join(', '),
    });
    setEditing(true);
  };

  const saveDraft = async () => {
    if (!draft.name.trim() || !canEdit) return;
    setSaving(true);
    try {
      const changes = {
        type: draft.type,
        name: draft.name.trim(),
        category: draft.category,
        roleTitle: draft.roleTitle.trim() || undefined,
        affiliation: draft.affiliation.trim() || undefined,
        phone: splitValues(draft.phone),
        email: splitValues(draft.email),
        address: draft.address.trim() || undefined,
        district: draft.district.trim() || undefined,
        notes: draft.notes.trim(),
        programmes: splitValues(draft.programmes),
      };
      if (selected) {
        await updateContact(selected.id, changes, actor);
      } else {
        await createContact({ ...changes, aliases: [changes.name] }, actor);
      }
      await refreshContacts();
      setEditing(false);
      if (selected) setSelected((await listContacts()).find((contact) => contact.id === selected.id) || null);
    } catch (saveError) {
      setError('Contact could not be saved. Check your staff access and try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmMerge = async () => {
    if (!selected || !mergeTarget || !canEdit) return;
    setSaving(true);
    try {
      await mergeContacts(selected.id, mergeTarget, actor);
      await refreshContacts();
      setSelected((await listContacts()).find((contact) => contact.id === selected.id) || null);
      setMergeTarget('');
    } catch {
      setError('Contacts could not be merged. Both records must still exist.');
    } finally {
      setSaving(false);
    }
  };

  const doArchive = async () => {
    if (!selected || !canEdit || !window.confirm(`Archive ${selected.name}? This keeps the contact history.`)) return;
    await archiveContact(selected.id, actor);
    setSelected(null);
    await refreshContacts();
  };

  const updateDraft = (field: keyof ContactDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const form = (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" aria-label={selected ? 'Edit contact' : 'Record new contact'}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-stone-900">{selected ? 'Edit contact' : 'Record new contact'}</h2>
        <button type="button" onClick={() => setEditing(false)} aria-label="Close contact form" className="rounded-lg p-2 text-stone-600 hover:bg-stone-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-stone-700">Type
          <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value)} className="field mt-1 w-full">
            <option value="person">Person</option><option value="organisation">Organisation</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-stone-700">Category
          <select value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} className="field mt-1 w-full">
            {CONTACT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-stone-700 sm:col-span-2">Name
          <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} className="field mt-1 w-full" autoFocus />
        </label>
        <label className="text-xs font-semibold text-stone-700">Role / title
          <input value={draft.roleTitle} onChange={(event) => updateDraft('roleTitle', event.target.value)} className="field mt-1 w-full" />
        </label>
        <label className="text-xs font-semibold text-stone-700">Affiliation
          <input value={draft.affiliation} onChange={(event) => updateDraft('affiliation', event.target.value)} className="field mt-1 w-full" />
        </label>
        <label className="text-xs font-semibold text-stone-700">Phone numbers
          <input value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} className="field mt-1 w-full" placeholder="Separate multiple with commas" />
        </label>
        <label className="text-xs font-semibold text-stone-700">Email addresses
          <input value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} className="field mt-1 w-full" />
        </label>
        <label className="text-xs font-semibold text-stone-700">Address
          <input value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} className="field mt-1 w-full" />
        </label>
        <label className="text-xs font-semibold text-stone-700">District
          <input value={draft.district} onChange={(event) => updateDraft('district', event.target.value)} className="field mt-1 w-full" />
        </label>
        <label className="text-xs font-semibold text-stone-700 sm:col-span-2">Programmes
          <input value={draft.programmes} onChange={(event) => updateDraft('programmes', event.target.value)} className="field mt-1 w-full" placeholder="Child House, Early Years, Agriculture" />
        </label>
        <label className="text-xs font-semibold text-stone-700 sm:col-span-2">Notes
          <textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} className="field mt-1 min-h-24 w-full" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700">Cancel</button>
        <button type="button" onClick={() => void saveDraft()} disabled={saving || !canEdit || !draft.name.trim()} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save contact'}</button>
      </div>
    </section>
  );

  if (selected && !editing) {
    const timeline = [...(selected.interactions || [])].sort((a, b) => b.date.localeCompare(a.date));
    const mergeChoices = contacts.filter((contact) => contact.id !== selected.id && !contact.archived && !contact.mergedInto);
    return (
      <div id="contacts-view" className="mx-auto w-full max-w-5xl min-w-0 space-y-4 pb-20 md:pb-4">
        <button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-800"><ChevronLeft className="h-4 w-4" /> Contacts</button>
        <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-lg bg-stone-100 p-2 text-stone-700">{selected.type === 'person' ? <UserRound className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</span>
              <div className="min-w-0"><p className="break-words text-xl font-black text-stone-900">{selected.name}</p><p className="mt-1 text-sm text-stone-600">{selected.roleTitle || selected.category}</p><p className="text-xs text-stone-500">{selected.category} · {selected.type}</p></div>
            </div>
            {canEdit && <button type="button" onClick={() => startEdit(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700"><Edit2 className="h-3.5 w-3.5" /> Edit</button>}
          </div>
          <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
            {selected.affiliation && <p className="flex min-w-0 gap-2 break-words text-sm text-stone-700"><Building2 className="h-4 w-4 shrink-0 text-stone-500" />{selected.affiliation}</p>}
            {(selected.address || selected.district) && <p className="flex min-w-0 gap-2 break-words text-sm text-stone-700"><MapPin className="h-4 w-4 shrink-0 text-stone-500" />{[selected.address, selected.district].filter(Boolean).join(', ')}</p>}
            {(selected.phone || []).map((phone) => <a key={phone} href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="flex min-w-0 items-center gap-2 break-all text-sm font-semibold text-teal-800"><Phone className="h-4 w-4 shrink-0" />{phone}</a>)}
            {(selected.email || []).map((email) => <a key={email} href={`mailto:${email}`} className="flex min-w-0 items-center gap-2 break-all text-sm font-semibold text-teal-800"><Mail className="h-4 w-4 shrink-0" />{email}</a>)}
          </div>
          {!!selected.programmes?.length && <p className="mt-4 break-words text-xs text-stone-600">Programmes: {selected.programmes.join(', ')}</p>}
          {selected.notes && <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-stone-50 p-3 text-sm leading-relaxed text-stone-700">{selected.notes}</p>}
          <p className="mt-4 text-xs text-stone-500">First seen {shownDate(selected.firstSeen)} · Last seen {shownDate(selected.lastSeen)}</p>
          <p className="mt-1 text-[11px] text-stone-500">Last edited by {selected.updatedByName || 'Staff'} on {shownDate(selected.updatedAt)}</p>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" aria-label="Contact interaction timeline">
          <h2 className="text-sm font-bold text-stone-900">Interaction history</h2>
          {timeline.length === 0 ? <p className="mt-3 text-sm text-stone-500">No interactions recorded yet.</p> : <ol className="mt-3 space-y-3">{timeline.map((interaction) => <li key={interaction.id} className="border-l-2 border-teal-700 pl-3">
            <p className="text-xs font-bold text-stone-800">{interaction.type} · {shownDate(interaction.date)}</p><p className="mt-1 break-words text-sm text-stone-700">{interaction.summary}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">{interaction.sourceReportId && <a className="text-teal-800 underline" href={`#/reports?importAudit=${encodeURIComponent(interaction.sourceReportId)}`}>Source report {interaction.sourceReportId}</a>}{interaction.sourceRecordId && <a className="text-teal-800 underline" href={`#/reports?importAudit=${encodeURIComponent(interaction.sourceReportId || interaction.sourceRecordId)}`}>Source record {interaction.sourceRecordId}</a>}</div>
          </li>)}</ol>}
        </section>
        {canEdit && <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <Merge className="h-4 w-4 shrink-0 text-stone-600" />
          <label className="min-w-0 flex-1 text-xs font-semibold text-stone-700">Merge duplicate into this contact
            <select className="field mt-1 w-full" value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Choose duplicate…</option>{mergeChoices.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.category}</option>)}</select>
          </label>
          <button type="button" onClick={() => void confirmMerge()} disabled={!mergeTarget || saving} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Merge</button>
          <button type="button" onClick={() => void doArchive()} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700">Archive</button>
        </section>}
      </div>
    );
  }

  return (
    <div id="contacts-view" className="mx-auto w-full max-w-6xl min-w-0 space-y-4 pb-20 md:pb-4">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><p className="contacts-directory-label text-[11px] font-bold uppercase">Directory</p><h1 className="break-words text-xl font-black tracking-tight text-teal-950 sm:text-2xl">Contacts</h1><p className="text-xs text-stone-500">People and organisations Shine works with</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={startCreate} disabled={!canEdit} className="contacts-create-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm transition-transform active:scale-95 disabled:opacity-50"><Plus className="h-4 w-4" /> Record New Contact</button></div>
      </header>
      {error && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">{error}</p>}
      {editing && form}
      <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs" aria-label="Contact filters">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
          <label className="sr-only" htmlFor="contacts-search">Search contacts</label>
          <input
            id="contacts-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts by name, role, organisation, district, phone, or email..."
            className="w-full rounded-lg border border-stone-300 py-2 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear contact search"
              className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-stone-500">Type</span>
            <select id="contacts-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs">
              <option value="all">All types</option><option value="person">People</option><option value="organisation">Organisations</option>
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-stone-500">Category</span>
            <select id="contacts-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs">
              <option value="all">All categories</option>{CONTACT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="col-span-2 min-w-0 sm:col-span-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-stone-500">Programme</span>
            <select id="contacts-programme" value={programmeFilter} onChange={(event) => setProgrammeFilter(event.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs">
              <option value="all">All programmes</option>{programmes.map((programme) => <option key={programme} value={programme}>{programme}</option>)}
            </select>
          </label>
        </div>
      </section>
      {loading ? <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-600">Loading contacts…</div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">No contacts match these filters.</div> : <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((contact) => {
        return (
          <article
            key={contact.id}
            className="contact-directory-card contact-directory-card--warm min-w-0 rounded-xl border border-l-4 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <button type="button" onClick={() => setSelected(contact)} className="group flex w-full min-w-0 items-start gap-3 text-left">
              <span className="contact-directory-icon contact-directory-icon--warm shrink-0 rounded-xl p-3 transition-colors">
                {contact.type === 'person' ? <UserRound className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-black text-stone-900 group-hover:text-teal-900">{contact.name}</span>
                <span className="block break-words text-xs text-stone-600">{contact.roleTitle || contact.category}</span>
                <span className="contact-directory-badge contact-directory-badge--warm mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {contact.category}
                </span>
              </span>
            </button>
            {contact.affiliation && <p className="mt-3 flex min-w-0 items-start gap-2 break-words text-xs text-stone-600"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />{contact.affiliation}</p>}
            {contact.phone?.[0] && <a href={`tel:${contact.phone[0].replace(/[^+\d]/g, '')}`} className="mt-2 flex min-w-0 items-center gap-2 break-all text-xs font-semibold text-teal-800"><Phone className="h-3.5 w-3.5 shrink-0" />{contact.phone[0]}</a>}
            {contact.email?.[0] && <a href={`mailto:${contact.email[0]}`} className="mt-2 flex min-w-0 items-center gap-2 break-all text-xs font-semibold text-teal-800"><Mail className="h-3.5 w-3.5 shrink-0" />{contact.email[0]}</a>}
            <p className="mt-3 border-t border-stone-200/70 pt-2 text-[11px] text-stone-500">Last seen {shownDate(contact.lastSeen || contact.updatedAt)}</p>
          </article>
        );
      })}</div>}
    </div>
  );
};
