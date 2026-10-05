import type { HouseholdExpense } from '../types';

type ExpenseChanges = Partial<Omit<HouseholdExpense, 'id' | 'householdId' | 'createdAt'>>;

const AUDITED_FIELDS: ReadonlyArray<keyof ExpenseChanges> = [
  'totalCost',
  'unitCost',
  'quantity',
  'unit',
  'itemDescription',
  'supplier',
  'supplierContactPerson',
  'supplierPhone',
  'supplierEmail',
  'supplierAddress',
  'invoiceReference',
  'amountDue',
  'dueDate',
  'datePaid',
  'paymentMethod',
  'paymentReference',
];

export function withExpenseCreationAudit(expense: HouseholdExpense, by: string, at: string): HouseholdExpense {
  const paymentStatus = expense.paymentStatus || 'Paid';
  return {
    ...expense,
    paymentStatus,
    auditTrail: [
      ...(expense.auditTrail || []),
      { action: 'created', by, at, newStatus: paymentStatus },
    ],
  };
}

export function updateExpenseWithAudit(
  existing: HouseholdExpense,
  changes: ExpenseChanges,
  by: string,
  at: string,
): HouseholdExpense {
  const previousStatus = existing.paymentStatus || 'Paid';
  const newStatus = changes.paymentStatus || previousStatus;
  const fieldChanges = AUDITED_FIELDS.flatMap((field) => {
    const after = changes[field];
    const before = existing[field];
    return after !== undefined && after !== before
      ? [{
        field,
        ...(before !== undefined ? { before } : {}),
        after,
      }]
      : [];
  });
  const statusChanged = newStatus !== previousStatus;
  const safeChanges = { ...changes };
  (Object.keys(safeChanges) as Array<keyof typeof safeChanges>).forEach((key) => {
    if (safeChanges[key] === undefined) delete safeChanges[key];
  });
  return {
    ...existing,
    ...safeChanges,
    paymentStatus: newStatus,
    updatedAt: at,
    updatedBy: by,
    auditTrail: [
      ...(existing.auditTrail || []),
      ...((statusChanged || fieldChanges.length > 0) ? [{
        action: statusChanged ? 'payment-status-changed' as const : 'updated' as const,
        by,
        at,
        ...(statusChanged ? { previousStatus, newStatus } : {}),
        ...(fieldChanges.length ? { changes: fieldChanges } : {}),
      }] : []),
    ],
  };
}
