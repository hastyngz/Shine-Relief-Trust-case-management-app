export interface ImportAuditWritePlan {
  writeAudit: boolean;
  writeRestrictedSource: boolean;
}

export interface ImportAuditSourceShape {
  id: string;
  auditId: string;
  fileName: string;
  importedAt: string;
  sourceData: Record<string, unknown>;
}

function stableValue(value: unknown): string {
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    const toDate = (value as { toDate?: () => unknown }).toDate;
    if (typeof toDate === 'function') {
      const date = toDate.call(value);
      if (date instanceof Date) return stableValue(date);
    }
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function sameData(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return stableValue(left) === stableValue(right);
}

function restrictedSourceMatches(existing: Record<string, unknown>, expected: ImportAuditSourceShape): boolean {
  return existing.id === expected.id &&
    existing.auditId === expected.auditId &&
    existing.fileName === expected.fileName &&
    existing.importedAt === expected.importedAt &&
    stableValue(existing.sourceData) === stableValue(expected.sourceData);
}

export function planImportAuditWrites(
  auditMetadata: Record<string, unknown>,
  restrictedSource: ImportAuditSourceShape | undefined,
  existingAudit: Record<string, unknown> | undefined,
  existingRestrictedSource: Record<string, unknown> | undefined,
  canReadExistingRestrictedSource = false,
  canWriteAuditMetadata = false,
): ImportAuditWritePlan {
  let writeAudit = !existingAudit;
  if (existingAudit) {
    if (Object.prototype.hasOwnProperty.call(existingAudit, 'sourceData')) {
      throw new Error('An existing import audit still contains embedded source data; resolve it with the migration procedure.');
    }
    const { sourceDataStoredInRestrictedCollection: _existingProof, ...existingMetadata } = existingAudit;
    const { sourceDataStoredInRestrictedCollection: _expectedProof, ...expectedMetadata } = auditMetadata;
    if (!sameData(existingMetadata, expectedMetadata)) {
      throw new Error('A different import audit already exists for this ID; the existing record was preserved.');
    }
    const sourceProofPresent = existingAudit.sourceDataStoredInRestrictedCollection === true;
    if (restrictedSource && !sourceProofPresent && !canReadExistingRestrictedSource) {
      throw new Error('The existing audit does not verify that restricted source data was committed; a manager must review this retry.');
    }
    if (restrictedSource && !sourceProofPresent && !canWriteAuditMetadata) {
      throw new Error('An administrator must confirm restricted source data before this audit retry can be completed.');
    }
    writeAudit = restrictedSource !== undefined && canReadExistingRestrictedSource && canWriteAuditMetadata && !sourceProofPresent;
  }

  let writeRestrictedSource = false;
  if (restrictedSource) {
    if (existingRestrictedSource) {
      if (!restrictedSourceMatches(existingRestrictedSource, restrictedSource)) {
        throw new Error('A different restricted import source already exists for this audit ID; the existing source was preserved.');
      }
    } else if (!existingAudit || canReadExistingRestrictedSource) {
      writeRestrictedSource = true;
    }
  }

  return { writeAudit, writeRestrictedSource };
}