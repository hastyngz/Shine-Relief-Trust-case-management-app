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
  currentBalanceMWK: number;
  entries: Array<PettyCashTransaction & { balanceAfterMWK: number }>;
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
    } else {
      expensesMWK += entry.amountMWK;
      balance -= entry.amountMWK;
    }
    return { ...entry, balanceAfterMWK: balance };
  });
  return {
    openingBalanceMWK, cashReceivedMWK, expensesMWK, cashReturnedMWK,
    currentBalanceMWK: balance, entries,
  };
}

export function validatePettyCashTransaction(
  transactions: PettyCashTransaction[],
  draft: PettyCashDraft,
  today: string,
): string[] {
  const errors: string[] = [];
  if (!isValidPettyCashDate(draft.date) || draft.date > today) errors.push('Enter a valid transaction date that is not in the future.');
  if (!['opening_balance', 'cash_received', 'expense', 'cash_returned'].includes(draft.type)) errors.push('Select a valid petty-cash transaction type.');
  if (!Number.isFinite(draft.amountMWK) || draft.amountMWK <= 0 || !Number.isSafeInteger(draft.amountMWK)) errors.push('Enter a positive whole-number amount in MWK.');
  if (typeof draft.description !== 'string' || draft.description.trim().length < 3 || draft.description.trim().length > 250) errors.push('Enter a description between 3 and 250 characters.');
  if (typeof draft.reference !== 'string' || draft.reference.trim().length < 2 || draft.reference.trim().length > 120) errors.push('Enter a receipt, voucher or transfer reference between 2 and 120 characters.');
  if (!draft.id || draft.id.trim().length < 8) errors.push('The petty-cash entry ID is invalid.');
  if (transactions.some((entry) => entry.id === draft.id)) errors.push('This petty-cash entry already exists. Refresh the ledger before retrying.');

  const openingEntries = transactions.filter((entry) => entry.type === 'opening_balance');
  if (draft.type === 'opening_balance') {
    if (draft.id !== PETTY_CASH_OPENING_BALANCE_ID) errors.push('The opening-balance record must use its fixed ledger ID.');
    if (openingEntries.length > 0 || transactions.length > 0) errors.push('The opening balance can only be recorded once, before other petty-cash entries.');
  } else {
    if (openingEntries.length !== 1) errors.push('Record the opening cash float before entering receipts or expenses.');
    const summary = getPettyCashLedgerSummary(transactions);
    const latestDate = summary.entries[summary.entries.length - 1]?.date;
    if (latestDate && draft.date < latestDate) errors.push('Backdated entries are not allowed. Record transactions in date order or use a referenced reversal.');
    const currentBalance = summary.currentBalanceMWK;
    if (draft.type === 'expense' && draft.amountMWK > currentBalance) {
      errors.push(`This expense exceeds the available petty-cash balance of MWK ${currentBalance.toLocaleString()}.`);
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
