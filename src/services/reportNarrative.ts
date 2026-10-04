export interface NarrativeFigures {
  audience: string;
  periodLabel: string;
  girlsSupported: number;
  programmeCount: number;
  budgeted: number;
  actual: number;
  workplanCompletionPercent: number;
  openWorkplans: number;
}

export function generateReportNarrative(figures: NarrativeFigures): string {
  const variance = figures.budgeted - figures.actual;
  const financialSentence = figures.budgeted === 0
    ? 'No attributed budget was available for comparison during this period.'
    : variance >= 0
    ? `Recorded actuals of MWK ${figures.actual.toLocaleString()} are MWK ${variance.toLocaleString()} below the attributed budget of MWK ${figures.budgeted.toLocaleString()}.`
    : `Recorded actuals exceed the attributed budget by MWK ${Math.abs(variance).toLocaleString()}.`;
  return `${figures.audience} report for ${figures.periodLabel}: ${figures.girlsSupported} girls are currently supported across ${figures.programmeCount} programmes. ${financialSentence} Workplans are ${figures.workplanCompletionPercent}% complete, with ${figures.openWorkplans} open items requiring follow-through.`;
}
