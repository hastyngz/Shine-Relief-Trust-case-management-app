import { createHash } from 'node:crypto';
import {
  getNextPettyCashLedgerState,
  isPettyCashTransaction,
  type PettyCashLedgerState,
} from '../src/services/pettyCashLedger';

export interface PettyCashLedgerMigrationStore {
  listEntries(): Promise<Array<{ id: string; data: unknown }>>;
  readState(): Promise<unknown | null>;
  initializeStateIfUnchanged(
    state: PettyCashLedgerState,
    expectedFingerprint: string,
  ): Promise<'created' | 'already-current' | 'changed'>;
}

export interface PettyCashLedgerMigrationOptions {
  apply: boolean;
  projectId: string;
}

export interface PettyCashLedgerMigrationSummary {
  entriesExamined: number;
  conflicts: number;
  malformed: number;
  stateStatus: 'missing' | 'current' | 'inconsistent' | 'not-needed';
  applied: boolean;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function fingerprintPettyCashEntries(entries: Array<{ id: string; data: unknown }>): string {
  const content = stableStringify([...entries].sort((a, b) => a.id.localeCompare(b.id)));
  return createHash('sha256').update(content).digest('hex');
}

function sameState(left: unknown, right: PettyCashLedgerState): boolean {
  if (!left || typeof left !== 'object' || Array.isArray(left)) return false;
  const state = left as Record<string, unknown>;
  return state.balanceMWK === right.balanceMWK &&
    state.latestDate === right.latestDate &&
    state.lastTransactionId === right.lastTransactionId &&
    state.updatedAt === right.updatedAt &&
    Object.keys(state).length === 4;
}

export async function migratePettyCashLedgerState(
  store: PettyCashLedgerMigrationStore,
  options: PettyCashLedgerMigrationOptions,
): Promise<PettyCashLedgerMigrationSummary> {
  const entries = await store.listEntries();
  const summary: PettyCashLedgerMigrationSummary = {
    entriesExamined: entries.length,
    conflicts: 0,
    malformed: 0,
    stateStatus: entries.length ? 'missing' : 'not-needed',
    applied: false,
  };
  const ids = new Set<string>();
  const ordered = [...entries].sort((a, b) => {
    const left = isPettyCashTransaction(a.data) ? a.data : null;
    const right = isPettyCashTransaction(b.data) ? b.data : null;
    return String(left?.date || '').localeCompare(String(right?.date || '')) ||
      String(left?.recordedAt || '').localeCompare(String(right?.recordedAt || '')) ||
      a.id.localeCompare(b.id);
  });

  let computedState: PettyCashLedgerState | null = null;
  for (const entry of ordered) {
    if (!isPettyCashTransaction(entry.data) || entry.id !== entry.data.id || ids.has(entry.id)) {
      summary.malformed += 1;
      continue;
    }
    ids.add(entry.id);
    try {
      computedState = getNextPettyCashLedgerState(computedState, entry.data);
    } catch {
      summary.malformed += 1;
    }
  }
  if (summary.malformed > 0) return summary;
  const currentState = await store.readState();
  if (!entries.length) {
    if (currentState !== null) {
      summary.stateStatus = 'inconsistent';
      summary.conflicts += 1;
    }
    return summary;
  }
  if (!computedState) {
    summary.malformed += 1;
    return summary;
  }

  if (currentState !== null) {
    if (!sameState(currentState, computedState)) {
      summary.stateStatus = 'inconsistent';
      summary.conflicts += 1;
      return summary;
    }
    summary.stateStatus = 'current';
    return summary;
  }

  if (!options.apply) return summary;
  const result = await store.initializeStateIfUnchanged(
    computedState,
    fingerprintPettyCashEntries(entries),
  );
  if (result === 'changed') {
    summary.conflicts += 1;
    return summary;
  }
  summary.stateStatus = 'current';
  summary.applied = result === 'created';
  return summary;
}

function readOption(args: string[], index: number, name: string): { value: string; nextIndex: number } {
  const argument = args[index];
  if (argument.includes('=')) {
    const value = argument.slice(argument.indexOf('=') + 1);
    if (!value) throw new Error(`${name} requires a value.`);
    return { value, nextIndex: index };
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return { value, nextIndex: index + 1 };
}

export function parsePettyCashLedgerMigrationOptions(
  args: string[],
  configuredProjectId: string | undefined,
): PettyCashLedgerMigrationOptions {
  let projectId: string | undefined;
  let confirmedProjectId: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply') {
      if (apply) throw new Error('Duplicate --apply flag.');
      apply = true;
    } else if (argument === '--project' || argument.startsWith('--project=')) {
      if (projectId !== undefined) throw new Error('Duplicate --project flag.');
      const option = readOption(args, index, '--project');
      projectId = option.value;
      index = option.nextIndex;
    } else if (argument === '--confirm-project' || argument.startsWith('--confirm-project=')) {
      if (confirmedProjectId !== undefined) throw new Error('Duplicate --confirm-project flag.');
      const option = readOption(args, index, '--confirm-project');
      confirmedProjectId = option.value;
      index = option.nextIndex;
    } else {
      throw new Error(`Unknown migration argument: ${argument}`);
    }
  }

  if (!projectId || projectId !== configuredProjectId) {
    throw new Error('Supply --project matching the configured Firebase project.');
  }
  if (apply && confirmedProjectId !== projectId) {
    throw new Error('Apply requires --confirm-project with the same explicitly selected project.');
  }
  if (!apply && confirmedProjectId !== undefined) {
    throw new Error('--confirm-project is only valid together with --apply.');
  }
  return { apply, projectId };
}
