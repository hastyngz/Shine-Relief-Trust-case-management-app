import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.assign(dom.window.HTMLElement.prototype, {
  attachEvent: () => undefined,
  detachEvent: () => undefined,
});
dom.window.requestAnimationFrame = (callback) => {
  callback(0);
  return 1;
};
dom.window.cancelAnimationFrame = () => undefined;

const { QualityCheckPanel } = await import('../src/components/QualityCheckPanel');
const container = document.getElementById('root');
assert.ok(container);
const root = createRoot(container);

function issue(
  id: string,
  options: { target?: boolean; safe?: boolean; rule?: string; severity?: 'blocker' | 'warning' | 'info' } = {},
) {
  return {
    id,
    rule: options.rule || 'TEST-RECORD-01',
    severity: options.severity || 'warning',
    message: 'Review the sample record.',
    location: `records.${id}`,
    ...(options.target === false ? {} : { target: { kind: 'workplan-item' as const, id } }),
    ...(options.safe !== undefined ? {
      fix: { type: 'set-field' as const, safe: options.safe, field: 'label', suggestedValue: 'clean label', reversible: true },
    } : {}),
  };
}

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
}

async function expandGroup(group: Element) {
  const button = Array.from(group.querySelectorAll('button')).find((candidate) => candidate.textContent === 'Fix these one by one');
  assert.ok(button);
  if (button.getAttribute('aria-expanded') !== 'true') await click(button);
}

const openedTargets: string[] = [];
await render(
  <QualityCheckPanel
    issues={Array.from({ length: 26 }, (_, index) => issue(`record-${index}`))}
    scores={{ quantification: 80, impact: 70, dataQuality: 90 }}
    onOpenIssue={(selected) => openedTargets.push(selected.target?.id || '')}
  />,
);
const group = container.querySelector('article');
assert.ok(group);
assert.ok(group.textContent?.includes('26 items'));
await expandGroup(group);
assert.match(group.textContent || '', /Page 1 of 2/);
await click(Array.from(group.querySelectorAll('button')).find((button) => button.textContent === 'Next page')!);
const goToRecord = Array.from(group.querySelectorAll('button')).find((button) => button.textContent === 'Show in document');
assert.ok(goToRecord);
await click(goToRecord);
assert.deepEqual(openedTargets, ['record-25'], 'pagination keeps the selected issue linked to its stable record id');

const fuzzyIdentityIssue = {
  ...issue('identity-preview', { rule: 'IDENTITY-FUZZY-01' }),
  target: { kind: 'preview-item' as const, id: 'identity-preview' },
  candidateA: { id: 'imported-person', name: 'Magret Example' },
  candidateB: { id: 'existing-person', name: 'Margaret Example' },
  fix: {
    type: 'choose-option' as const,
    safe: false,
    field: 'matchedId',
    options: [{ value: 'existing-person', label: 'Margaret Example' }, { value: 'new-person', label: 'This is a new person' }],
    reversible: true,
  },
};
const identityDecisions: Array<{ issueId: string; resolution: { decision: string; candidateId?: string } }> = [];
await render(
  <QualityCheckPanel
    issues={[fuzzyIdentityIssue]}
    scores={{ quantification: 100, impact: 100, dataQuality: 100 }}
    onResolveIssue={(selected, resolution) => {
      identityDecisions.push({ issueId: selected.id, resolution: resolution.value as { decision: string; candidateId?: string } });
      return true;
    }}
  />,
);
const identityGroup = container.querySelector('article');
assert.ok(identityGroup?.textContent?.includes('Magret Example'));
assert.ok(identityGroup?.textContent?.includes('Margaret Example'));
assert.ok(identityGroup?.textContent?.includes('Are Candidate A Magret Example and Candidate B Margaret Example the same person?'));
assert.equal(identityGroup?.querySelectorAll('[aria-label="Person match candidates"]').length, 0);
await expandGroup(identityGroup!);
await click(Array.from(identityGroup!.querySelectorAll('button')).find((button) => button.textContent === 'Yes (Merge Records)')!);
assert.equal(identityDecisions.length, 1);
assert.equal(identityDecisions[0].issueId, 'identity-preview');
assert.equal(identityDecisions[0].resolution.decision, 'same-person');
assert.equal(identityDecisions[0].resolution.candidateId, 'existing-person');
assert.equal(container.querySelector('[role="dialog"]'), null, 'identity decisions resolve directly without a chooser dialog');
await render(null);
await render(
  <QualityCheckPanel
    issues={[fuzzyIdentityIssue]}
    scores={{ quantification: 100, impact: 100, dataQuality: 100 }}
    onResolveIssue={(selected, resolution) => {
      identityDecisions.push({ issueId: selected.id, resolution: resolution.value as { decision: string; candidateId?: string } });
      return true;
    }}
  />,
);
const separateGroup = container.querySelector('article');
assert.ok(separateGroup);
await click(Array.from(separateGroup.querySelectorAll('button')).find((button) => button.textContent === 'No (Different People)')!);
assert.equal(identityDecisions[1].issueId, 'identity-preview');
assert.equal(identityDecisions[1].resolution.decision, 'different-people');
assert.equal(identityDecisions[1].resolution.candidateId, undefined);

await render(null);
await render(
  <QualityCheckPanel
    issues={[{
      ...fuzzyIdentityIssue,
      target: undefined,
    }]}
    scores={{ quantification: 100, impact: 100, dataQuality: 100 }}
    onResolveIssue={() => assert.fail('Report-level identity hints cannot merge unrelated records')}
  />,
);
const reportIdentityGroup = container.querySelector('article');
assert.ok(reportIdentityGroup);
assert.equal(Array.from(reportIdentityGroup.querySelectorAll('button')).some((button) =>
  button.textContent === 'Yes (Merge Records)' || button.textContent === 'No (Different People)'), false);
assert.match(reportIdentityGroup.textContent || '', /Resolve this match in Import review/);

await render(
  <QualityCheckPanel
    issues={[issue('no-target', { target: false })]}
    scores={{ quantification: 100, impact: 100, dataQuality: 100 }}
    onOpenIssue={() => assert.fail('An untargeted issue cannot navigate')}
  />,
);
const untargetedGroup = container.querySelector('article');
assert.ok(untargetedGroup);
await expandGroup(untargetedGroup);
assert.equal(Array.from(untargetedGroup.querySelectorAll('button')).some((button) => button.textContent === 'Show in document'), false);

await render(
  <QualityCheckPanel
    issues={[issue('keyboard')]}
    scores={{ quantification: 100, impact: 100, dataQuality: 100 }}
  />,
);
const keyboardGroup = container.querySelector('article');
assert.ok(keyboardGroup);
await expandGroup(keyboardGroup);
await click(Array.from(keyboardGroup.querySelectorAll('button')).find((button) => button.textContent === 'Review this entry')!);
assert.ok(container.querySelector('[role="dialog"]'));
await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
assert.equal(container.querySelector('[role="dialog"]'), null, 'Escape closes the issue sheet');

let resolveCalls = 0;
await render(
  <QualityCheckPanel
    issues={[issue('recheck', { severity: 'blocker' })]}
    scores={{ quantification: 0, impact: 0, dataQuality: 0 }}
    onResolveIssue={() => {
      resolveCalls += 1;
      return resolveCalls > 1;
    }}
  />,
);
const recheckGroup = container.querySelector('article');
assert.ok(recheckGroup);
await expandGroup(recheckGroup);
await click(Array.from(recheckGroup.querySelectorAll('button')).find((button) => button.textContent === 'Review this entry')!);
const dialog = container.querySelector('[role="dialog"]');
assert.ok(dialog);
const reason = dialog.querySelector('textarea');
assert.ok(reason);
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(reason, 'Reviewed against the approved source record.');
  reason.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const save = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Save fix / reviewed');
assert.ok(save);
await click(save);
assert.ok(container.textContent?.includes('This still needs attention.'));
await click(save);
assert.ok(container.textContent?.includes('No open items need a check.'));
assert.equal(resolveCalls, 2);

let appliedSafeFixes = 0;
let undoneSafeFixes = 0;
await render(
  <QualityCheckPanel
    issues={[
      issue('safe', { safe: true, rule: 'TEST-SAFE-01' }),
      issue('unsafe', { safe: false, rule: 'TEST-SAFE-01' }),
    ]}
    scores={{ quantification: 100, impact: 100, dataQuality: 100 }}
    onApplyFix={() => { appliedSafeFixes += 1; }}
    onUndoFix={() => { undoneSafeFixes += 1; }}
  />,
);
const safeGroup = container.querySelector('article');
assert.ok(safeGroup);
await click(Array.from(safeGroup.querySelectorAll('button')).find((button) => button.textContent?.startsWith('Fix all safe'))!);
assert.equal(container.querySelectorAll('[role="dialog"] li').length, 1, 'unsafe changes are excluded from the batch preview');
await click(container.querySelector<HTMLButtonElement>('[role="dialog"] button:last-child')!);
assert.equal(appliedSafeFixes, 1);
await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.startsWith('Undo last safe batch'))!);
assert.equal(undoneSafeFixes, 1);

await act(async () => root.unmount());
dom.window.close();
console.log('Quality panel grouping, target navigation, pagination, recheck, keyboard close, and safe-fix undo tests passed.');
