import React, { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Sprout } from 'lucide-react';
import { AppDatabase, ProgrammeLogRecord, ProgrammeLogType } from '../../types';
import { PROGRAMMES, PROGRAMME_BY_ID, ProgrammeDefinition, ProgrammeId } from '../../data/programmes';
import { addProgrammeLog } from '../../utils/storage';
import { formatMWK } from '../../utils/export';
import { incomeTotals, logsForProgramme, productionByUnit, startBadge, summariseProgramme } from '../../services/programmeSummary';
import { PROGRAMME_ICONS } from './programmeIcons';

interface ProgrammesViewProps {
  db: AppDatabase;
  selectedProgrammeId: ProgrammeId | null;
  auditActor: string;
  isViewOnly: boolean;
  onOpenProgramme: (id: ProgrammeId | null) => void;
  onNavigateToGirls: () => void;
  onNavigateToHouses: () => void;
  onNavigateToOperations: () => void;
  onRefresh: () => void;
}

export const ProgrammesView: React.FC<ProgrammesViewProps> = (props) => {
  const programme = props.selectedProgrammeId ? PROGRAMME_BY_ID[props.selectedProgrammeId] : null;
  if (!programme) return <ProgrammesHub db={props.db} onOpenProgramme={props.onOpenProgramme} />;
  return <ProgrammeDetail key={programme.id} {...props} programme={programme} />;
};

function StartBadge({ id, fallbackStartDate }: { id: ProgrammeId; fallbackStartDate?: string }) {
  const badge = startBadge(id, fallbackStartDate);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-900">
      {badge.text}{badge.text.startsWith('Since') && !badge.confirmed ? ' · confirm' : ''}
    </span>
  );
}

function ProgrammesHub({ db, onOpenProgramme }: Pick<ProgrammesViewProps, 'db' | 'onOpenProgramme'>) {
  const groups = Array.from(new Set(PROGRAMMES.map((programme) => programme.group)));
  return (
    <div className="space-y-8 pb-12">
      <header className="border-b border-stone-200 pb-5">
        <div className="flex items-center gap-2 text-teal-800">
          <Sprout className="h-5 w-5" />
          <span className="text-xs font-bold uppercase">SHINE Relief Trust</span>
        </div>
        <h1 className="mt-2 text-2xl font-black text-teal-950">Programmes</h1>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">Care, education, community support, and income projects in TA Kuntumanji, Zomba District.</p>
      </header>

      {groups.map((group) => (
        <section key={group} aria-label={group} className="space-y-3">
          <h2 className="border-b border-stone-200 pb-2 text-sm font-bold text-stone-700">{group}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PROGRAMMES.filter((programme) => programme.group === group).map((programme) => {
              const Icon = PROGRAMME_ICONS[programme.id];
              const summary = summariseProgramme(db, programme.id);
              return (
                <button
                  type="button"
                  key={programme.id}
                  onClick={() => onOpenProgramme(programme.id)}
                  className="shine-card rounded-xl border border-stone-200 bg-white p-5 text-left transition-colors hover:border-teal-700 hover:bg-teal-50/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-800"><Icon className="h-5 w-5" /></span>
                      <span className="min-w-0">
                        <span className="block font-bold text-stone-950">{programme.name}</span>
                        <span className="mt-0.5 block text-xs text-stone-500">{programme.tagline}</span>
                      </span>
                    </span>
                    <StartBadge id={programme.id} fallbackStartDate={summary.fallbackStartDate} />
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3 border-t border-stone-100 pt-3">
                    <span>
                      <span className="block text-xl font-black text-teal-950">{summary.value}</span>
                      <span className="block text-xs text-stone-600">{summary.label}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-teal-800" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-black text-teal-950">{value}</div>
      {detail && <div className="mt-1 text-xs text-stone-600">{detail}</div>}
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-2">
        <h2 className="text-sm font-bold text-stone-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ProgrammeDetail(props: ProgrammeViewDetailProps) {
  const { programme, db } = props;
  const Icon = PROGRAMME_ICONS[programme.id];
  const logs = logsForProgramme(db, programme.id);
  const summary = summariseProgramme(db, programme.id);
  const isIncomeProgramme = programme.id === 'fish-chicken' || programme.id === 'rice-maize-mill' || programme.id === 'tomato-farming';

  return (
    <div className="space-y-7 pb-12">
      <button type="button" onClick={() => props.onOpenProgramme(null)} className="inline-flex items-center gap-2 text-sm font-bold text-teal-800 hover:text-teal-950">
        <ArrowLeft className="h-4 w-4" /> All programmes
      </button>

      <header className="space-y-4 border-b border-stone-200 pb-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-900"><Icon className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-bold uppercase text-stone-500">{programme.group}</p>
              <h1 className="mt-1 text-2xl font-black text-teal-950">{programme.name}</h1>
              <p className="mt-1 text-sm text-stone-600">{programme.tagline}</p>
            </div>
          </div>
          <StartBadge id={programme.id} fallbackStartDate={summary.fallbackStartDate} />
        </div>
        <div className="max-w-4xl text-sm leading-relaxed text-stone-700">{programme.background}</div>
        {programme.startNote && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
            {programme.startNote} <span className="font-bold">Update the source in edit src/data/programmes.ts.</span>
          </p>
        )}
      </header>

      {programme.id === 'early-years' && <EarlyYearsDetail db={db} onNavigate={props.onNavigateToOperations} />}
      {programme.id === 'bursary' && <BursaryDetail db={db} onNavigate={props.onNavigateToGirls} logs={logs} />}
      {programme.id === 'child-house' && <ChildHouseDetail db={db} onNavigate={props.onNavigateToHouses} />}
      {programme.id === 'relief-family' && <ReliefFamilyDetail logs={logs} />}
      {programme.id === 'shine-village' && <Stat label="Recorded activities" value={logs.length} />}
      {isIncomeProgramme && <IncomeDetail logs={logs} />}

      {programme.logTypes.length > 0 && (
        <RecordsSection
          programme={programme}
          logs={logs}
          auditActor={props.auditActor}
          isViewOnly={props.isViewOnly}
          onRefresh={props.onRefresh}
        />
      )}
    </div>
  );
}

interface ProgrammeViewDetailProps extends ProgrammesViewProps {
  programme: ProgrammeDefinition;
}

function EarlyYearsDetail({ db, onNavigate }: { db: AppDatabase; onNavigate: () => void }) {
  const records = db.earlyYearsRecords || [];
  const students = records.filter((record) => record.studentName?.trim() && (!record.studentStatus || record.studentStatus === 'Active'));
  const latestReport = [...records].filter((record) => record.reportingPeriod).sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0];
  const feedingDays = new Set((db.feedingProgramLogs || []).map((log) => log.date)).size;
  return (
    <div className="space-y-6">
      <Section title="Programme overview" action={<button type="button" onClick={onNavigate} className="text-xs font-bold text-teal-800 hover:text-teal-950">Open Operations &amp; Intelligence</button>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Children on record" value={students.length} />
          <Stat label="Target enrolment" value={latestReport?.targetEnrolment ?? 'Not reported'} detail={latestReport?.reportingPeriod} />
          <Stat label="Graduates" value={latestReport?.graduates ?? 'Not reported'} detail={latestReport?.reportingPeriod} />
          <Stat label="Feeding days" value={feedingDays} />
        </div>
      </Section>
      <Section title="Children">
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          {students.length === 0 ? <p className="p-4 text-sm text-stone-500">No active children recorded.</p> : students.map((student) => (
            <div key={student.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 p-3 last:border-0">
              <span className="text-sm font-semibold text-stone-900">{student.studentName}</span>
              <span className="text-xs text-stone-500">{student.classGroup || 'Class not recorded'}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function BursaryDetail({ db, onNavigate, logs }: { db: AppDatabase; onNavigate: () => void; logs: ProgrammeLogRecord[] }) {
  const students = db.girls.filter((girl) => girl.status === 'Active' && Boolean(girl.school?.trim()));
  const studentIds = new Set(students.map((girl) => girl.id));
  const followUps = db.educationalFollowUps.filter((followUp) => studentIds.has(followUp.girlId));
  const expenses = logs.filter((log) => log.entryType === 'Expense').reduce((total, log) => total + (log.amountMWK || 0), 0);
  return (
    <div className="space-y-6">
      <Section title="Student support" action={<button type="button" onClick={onNavigate} className="text-xs font-bold text-teal-800 hover:text-teal-950">Open SHINE Girls</button>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Education follow-ups" value={followUps.length} />
          <Stat label="Follow-ups needing action" value={followUps.filter((item) => item.furtherActionRequired).length} />
          <Stat label="Logged expenses" value={formatMWK(expenses)} />
        </div>
      </Section>
      <Section title="Students">
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          {students.length === 0 ? <p className="p-4 text-sm text-stone-500">No active students with a school recorded.</p> : students.map((girl) => (
            <div key={girl.id} className="grid grid-cols-1 gap-1 border-b border-stone-100 p-3 last:border-0 sm:grid-cols-3 sm:gap-3">
              <span className="text-sm font-semibold text-stone-900">{girl.fullName}</span>
              <span className="text-xs text-stone-600">{girl.school}</span>
              <span className="text-xs text-stone-500">{girl.classLevel || 'Class not recorded'}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function ChildHouseDetail({ db, onNavigate }: { db: AppDatabase; onNavigate: () => void }) {
  const houses = db.households.map((house) => ({
    house,
    girls: db.girls.filter((girl) => girl.householdId === house.id),
  }));
  const activeHouses = houses.filter(({ house }) => house.status === 'Active');
  const monthlyRent = activeHouses.reduce((total, { house }) => total + house.monthlyRentCost, 0);
  return (
    <Section title="Children’s Home" action={<button type="button" onClick={onNavigate} className="text-xs font-bold text-teal-800 hover:text-teal-950">Open Households</button>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Houses" value={db.households.length} />
        <Stat label="Active houses" value={activeHouses.length} />
        <Stat label="Monthly rent" value={formatMWK(monthlyRent)} />
      </div>
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        {houses.length === 0 ? <p className="p-4 text-sm text-stone-500">No houses recorded.</p> : houses.map(({ house, girls }) => (
          <div key={house.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-3 last:border-0">
            <div>
              <div className="text-sm font-semibold text-stone-900">{house.name}</div>
              <div className="text-xs text-stone-500">House mother: {house.houseMum} · {house.status}</div>
            </div>
            <div className="text-right text-xs text-stone-600">{girls.length} {girls.length === 1 ? 'girl' : 'girls'} · {formatMWK(house.monthlyRentCost)}/month</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ReliefFamilyDetail({ logs }: { logs: ProgrammeLogRecord[] }) {
  const reachLogs = logs.filter((log) => log.entryType === 'Distribution' || log.entryType === 'Family support');
  const reached = reachLogs.reduce((total, log) => total + (log.beneficiaries || 0), 0);
  const distributions = logs.filter((log) => log.entryType === 'Distribution').length;
  const visits = logs.filter((log) => log.entryType === 'Family support').length;
  const spend = logs.filter((log) => log.entryType === 'Expense' || log.entryType === 'Input').reduce((total, log) => total + (log.amountMWK || 0), 0);
  return (
    <Section title="Community support">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Households reached" value={reached} />
        <Stat label="Distributions" value={distributions} />
        <Stat label="Family support visits" value={visits} />
        <Stat label="Logged spend" value={formatMWK(spend)} />
      </div>
    </Section>
  );
}

function IncomeDetail({ logs }: { logs: ProgrammeLogRecord[] }) {
  const totals = incomeTotals(logs);
  const output = productionByUnit(logs);
  return (
    <Section title="Financial and production summary">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Sales" value={formatMWK(totals.sales)} />
        <Stat label="Costs" value={formatMWK(totals.costs)} />
        <Stat label="Net income" value={formatMWK(totals.net)} />
      </div>
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="text-xs font-bold uppercase text-stone-500">Output by unit</h3>
        {output.length === 0 ? <p className="mt-2 text-sm text-stone-500">No production recorded.</p> : (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {output.map(({ unit, quantity }) => <span key={unit} className="text-sm text-stone-800"><strong>{quantity}</strong> {unit}</span>)}
          </div>
        )}
      </div>
    </Section>
  );
}

const CHIP_COLOURS: Record<ProgrammeLogType, string> = {
  Production: 'bg-emerald-100 text-emerald-900',
  Sale: 'bg-teal-100 text-teal-900',
  Expense: 'bg-rose-100 text-rose-900',
  Input: 'bg-amber-100 text-amber-900',
  Distribution: 'bg-sky-100 text-sky-900',
  'Family support': 'bg-orange-100 text-orange-900',
  Activity: 'bg-blue-100 text-blue-900',
  Note: 'bg-stone-200 text-stone-800',
};

function RecordsSection({
  programme,
  logs,
  auditActor,
  isViewOnly,
  onRefresh,
}: {
  programme: ProgrammeDefinition;
  logs: ProgrammeLogRecord[];
  auditActor: string;
  isViewOnly: boolean;
  onRefresh: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<ProgrammeLogType>(programme.logTypes[0] || 'Note');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [amountMWK, setAmountMWK] = useState('');
  const [beneficiaries, setBeneficiaries] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const showQuantity = ['Production', 'Sale', 'Input', 'Distribution'].includes(entryType);
  const showAmount = ['Sale', 'Expense', 'Input', 'Distribution'].includes(entryType);
  const showBeneficiaries = entryType === 'Distribution' || entryType === 'Family support';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const optionalNumbers = [quantity, amountMWK, beneficiaries].filter((value) => value.trim() !== '');
    if (!date || !description.trim() || optionalNumbers.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      setFormError('Enter a date and description, and use zero or a positive number for each numeric field.');
      return;
    }
    addProgrammeLog({
      programmeId: programme.id,
      date,
      entryType,
      description: description.trim(),
      ...(showQuantity && quantity !== '' ? { quantity: Number(quantity) } : {}),
      ...(showQuantity && unit.trim() ? { unit: unit.trim() } : {}),
      ...(showAmount && amountMWK !== '' ? { amountMWK: Number(amountMWK) } : {}),
      ...(showBeneficiaries && beneficiaries !== '' ? { beneficiaries: Number(beneficiaries) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }, auditActor);
    setDescription('');
    setQuantity('');
    setUnit('');
    setAmountMWK('');
    setBeneficiaries('');
    setNotes('');
    setFormError('');
    onRefresh();
  };

  return (
    <Section title="Records">
      {!isViewOnly && (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900"><Plus className="h-4 w-4 text-teal-800" />Add record</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs font-semibold text-stone-700">Date
              <input required type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-stone-700">Type
              <select value={entryType} onChange={(event) => setEntryType(event.currentTarget.value as ProgrammeLogType)} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
                {programme.logTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-stone-700 sm:col-span-2">Description
              <input required value={description} onChange={(event) => setDescription(event.currentTarget.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </label>
            {showQuantity && <label className="space-y-1 text-xs font-semibold text-stone-700">Quantity
              <input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.currentTarget.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </label>}
            {showQuantity && <label className="space-y-1 text-xs font-semibold text-stone-700">Unit
              <input value={unit} onChange={(event) => setUnit(event.currentTarget.value)} placeholder="kg, trays, bags..." className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </label>}
            {showAmount && <label className="space-y-1 text-xs font-semibold text-stone-700">Amount (MWK)
              <input type="number" min="0" step="any" value={amountMWK} onChange={(event) => setAmountMWK(event.currentTarget.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </label>}
            {showBeneficiaries && <label className="space-y-1 text-xs font-semibold text-stone-700">Households reached
              <input type="number" min="0" step="1" value={beneficiaries} onChange={(event) => setBeneficiaries(event.currentTarget.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </label>}
            <label className="space-y-1 text-xs font-semibold text-stone-700 sm:col-span-2 lg:col-span-4">Notes
              <textarea rows={2} value={notes} onChange={(event) => setNotes(event.currentTarget.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </label>
          </div>
          {formError && <p role="alert" className="text-xs font-semibold text-rose-800">{formError}</p>}
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2 text-xs font-bold text-white hover:bg-teal-900">Save record</button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        {logs.length === 0 ? <p className="p-4 text-sm text-stone-500">No records yet.</p> : logs.map((log) => (
          <article key={log.id} className="border-b border-stone-100 p-4 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${CHIP_COLOURS[log.entryType]}`}>{log.entryType}</span>
                <h3 className="text-sm font-bold text-stone-900">{log.description}</h3>
              </div>
              <time className="text-xs text-stone-500">{log.date}</time>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
              {log.quantity !== undefined && <span>{log.quantity}{log.unit ? ` ${log.unit}` : ''}</span>}
              {log.amountMWK !== undefined && <span>{formatMWK(log.amountMWK)}</span>}
              {log.beneficiaries !== undefined && <span>{log.beneficiaries} households reached</span>}
              {log.notes && <span>{log.notes}</span>}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}