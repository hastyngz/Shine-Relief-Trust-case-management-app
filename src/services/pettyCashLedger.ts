import type { PettyCashTransaction, PettyCashTransactionType } from '../types';

export const PETTY_CASH_OPENING_BALANCE_ID = 'PETTY_CASH_OPENING_BALANCE';

export interface PettyCashDraft {
  id: string;
  date: string;
  type: PettyCashTransactionType;
  amountMWK: number;
  description: string;
  reference: string;
  category?: string;
}

export interface PettyCashLedgerSummary {
  openingBalanceMWK: number;
  cashReceivedMWK: number;
  expensesMWK: number;
  cashReturnedMWK: number;
  adjustmentsInMWK: number;
  adjustmentsOutMWK: number;
  currentBalanceMWK: number;
  entries: Array<PettyCashTransaction & { balanceAfterMWK: number }>;
}

export interface PettyCashLedgerState {
  balanceMWK: number;
  latestDate: string;
  lastTransactionId: string;
  updatedAt: string;
}

export class PettyCashLedgerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PettyCashLedgerValidationError';
  }
}

export function isPettyCashTransaction(value: unknown): value is PettyCashTransaction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' &&
    record.id.length > 0 &&
    isValidPettyCashDate(record.date) &&
    ['opening_balance', 'cash_received', 'expense', 'cash_returned', 'adjustment_in', 'adjustment_out'].includes(String(record.type)) &&
    Number.isSafeInteger(record.amountMWK) &&
    Number(record.amountMWK) > 0 &&
    typeof record.description === 'string' &&
    record.description.length >= 3 && record.description.length <= 250 &&
    typeof record.reference === 'string' &&
    record.reference.length >= 2 && record.reference.length <= 120 &&
    (record.category === undefined || typeof record.category === 'string') &&
    (record.category === undefined || record.category.length <= 100) &&
    typeof record.recordedAt === 'string' &&
    record.recordedAt.length > 0 &&
    typeof record.recordedBy === 'string' &&
    record.recordedBy.length > 0 &&
    typeof record.recordedByUid === 'string' &&
    record.recordedByUid.length > 0 &&
    typeof record.createdAt === 'string';
}

export function getNextPettyCashLedgerState(
  current: PettyCashLedgerState | null,
  transaction: PettyCashTransaction,
): PettyCashLedgerState {
  if (!Number.isSafeInteger(transaction.amountMWK) || transaction.amountMWK <= 0) {
    throw new PettyCashLedgerValidationError('Petty-cash amounts must be positive whole-number MWK values.');
  }
  if (!isValidPettyCashDate(transaction.date)) {
    throw new PettyCashLedgerValidationError('Petty-cash transaction date is invalid.');
  }

  if (!current) {
    if (transaction.type !== 'opening_balance' || transaction.id !== PETTY_CASH_OPENING_BALANCE_ID) {
      throw new PettyCashLedgerValidationError('The petty-cash ledger state is missing. Restore or initialize the opening float before recording movements.');
    }
    return {
      balanceMWK: transaction.amountMWK,
      latestDate: transaction.date,
      lastTransactionId: transaction.id,
      updatedAt: transaction.recordedAt,
    };
  }

  if (transaction.type === 'opening_balance' || transaction.id === PETTY_CASH_OPENING_BALANCE_ID) {
    throw new PettyCashLedgerValidationError('The petty-cash opening float can only be recorded once.');
  }
  if (transaction.date < current.latestDate) {
    throw new PettyCashLedgerValidationError('Backdated petty-cash entries are not allowed.');
  }

  const isOutflow = transaction.type === 'expense' || transaction.type === 'adjustment_out';
  if (isOutflow && transaction.amountMWK > current.balanceMWK) {
    throw new PettyCashLedgerValidationError(`This cash outflow exceeds the available petty-cash balance of MWK ${current.balanceMWK.toLocaleString()}.`);
  }
  const isInflow = transaction.type === 'cash_received' ||
    transaction.type === 'cash_returned' ||
    transaction.type === 'adjustment_in';

  if (!isOutflow && !isInflow) throw new PettyCashLedgerValidationError('Select a valid petty-cash transaction type.');

  return {
    balanceMWK: current.balanceMWK + (isOutflow ? -transaction.amountMWK : transaction.amountMWK),
    latestDate: transaction.date,
    lastTransactionId: transaction.id,
    updatedAt: transaction.recordedAt,
  };
}

export function isValidPettyCashDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function getPettyCashLedgerSummary(
  transactions: PettyCashTransaction[],
): PettyCashLedgerSummary {
  const ordered = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)
  );
  let openingBalanceMWK = 0;
  let cashReceivedMWK = 0;
  let expensesMWK = 0;
  let cashReturnedMWK = 0;
  let adjustmentsInMWK = 0;
  let adjustmentsOutMWK = 0;
  let balance = 0;
  const entries = ordered.map((entry) => {
    if (entry.type === 'opening_balance') {
      openingBalanceMWK += entry.amountMWK;
      balance += entry.amountMWK;
    } else if (entry.type === 'cash_received') {
      cashReceivedMWK += entry.amountMWK;
      balance += entry.amountMWK;
    } else if (entry.type === 'cash_returned') {
      cashReturnedMWK += entry.amountMWK;
      balance += entry.amountMWK;
    } else if (entry.type === 'adjustment_in') {
      adjustmentsInMWK += entry.amountMWK;
      balance += entry.amountMWK;
    } else if (entry.type === 'adjustment_out') {
      adjustmentsOutMWK += entry.amountMWK;
      balance -= entry.amountMWK;
    } else {
      expensesMWK += entry.amountMWK;
      balance -= entry.amountMWK;
    }
    return { ...entry, balanceAfterMWK: balance };
  });
  return {
    openingBalanceMWK, cashReceivedMWK, expensesMWK, cashReturnedMWK,
    adjustmentsInMWK, adjustmentsOutMWK, currentBalanceMWK: balance, entries,
  };
}

export function validatePettyCashTransaction(
  transactions: PettyCashTransaction[],
  draft: PettyCashDraft,
  today: string,
): string[] {
  const errors: string[] = [];
  if (!isValidPettyCashDate(draft.date) || draft.date > today) errors.push('Enter a valid transaction date that is not in the future.');
  if (!['opening_balance', 'cash_received', 'expense', 'cash_returned', 'adjustment_in', 'adjustment_out'].includes(draft.type)) errors.push('Select a valid petty-cash transaction type.');
  if (!Number.isFinite(draft.amountMWK) || draft.amountMWK <= 0 || !Number.isSafeInteger(draft.amountMWK)) errors.push('Enter a positive whole-number amount in MWK.');
  if (typeof draft.description !== 'string' || draft.description.trim().length < 3 || draft.description.trim().length > 250) errors.push('Enter a description between 3 and 250 characters.');
  if (typeof draft.reference !== 'string' || draft.reference.trim().length < 2 || draft.reference.trim().length > 120) errors.push('Enter a receipt, voucher, transfer or correction reference between 2 and 120 characters.');
  if (!draft.id || draft.id.trim().length < 8) errors.push('The petty-cash entry ID is invalid.');
  if (transactions.some((entry) => entry.id === draft.id)) errors.push('This petty-cash entry already exists. Refresh the ledger before retrying.');

  const openingEntries = transactions.filter((entry) => entry.type === 'opening_balance');
  if (draft.type === 'opening_balance') {
    if (draft.id !== PETTY_CASH_OPENING_BALANCE_ID) errors.push('The opening-balance record must use its fixed ledger ID.');
    if (openingEntries.length > 0 || transactions.length > 0) errors.push('The opening balance can only be recorded once, before other petty-cash entries.');
  } else {
    if (openingEntries.length !== 1) errors.push('Record the opening cash float before entering other petty-cash movements.');
    const summary = getPettyCashLedgerSummary(transactions);
    const latestDate = summary.entries[summary.entries.length - 1]?.date;
    if (latestDate && draft.date < latestDate) errors.push('Backdated entries are not allowed. Record transactions in date order or use a current-dated correction entry.');
    const currentBalance = summary.currentBalanceMWK;
    if ((draft.type === 'expense' || draft.type === 'adjustment_out') && draft.amountMWK > currentBalance) {
      errors.push(`This cash outflow exceeds the available petty-cash balance of MWK ${currentBalance.toLocaleString()}.`);
    }
  }
  return errors;
}

export function createPettyCashTransaction(
  draft: PettyCashDraft,
  actor: { uid: string; name: string },
  recordedAt: string,
): PettyCashTransaction {
  return {
    ...draft,
    description: draft.description.trim(),
    reference: draft.reference.trim(),
    category: draft.category?.trim() || undefined,
    recordedAt,
    recordedBy: actor.name,
    recordedByUid: actor.uid,
    createdAt: recordedAt,
  };
}
