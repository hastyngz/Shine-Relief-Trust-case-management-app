import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { SaveButton } = await import('../src/components/ui/SaveButton');
const container = document.getElementById('root');
assert.ok(container);
const root = createRoot(container);
async function render(status: 'idle' | 'saving' | 'done' | 'error') {
  await act(async () => root.render(<SaveButton status={status} onClick={() => undefined}>Save Expense</SaveButton>));
}
await render('idle');
assert.equal(container.querySelector('button')?.dataset.saveState, 'idle');
assert.equal(container.querySelector('button')?.textContent?.trim(), 'Save Expense');
await render('saving');
assert.equal(container.querySelector('button')?.getAttribute('aria-busy'), 'true');
assert.equal((container.querySelector('button') as HTMLButtonElement).disabled, true);
assert.equal(container.querySelector('button')?.textContent?.trim(), 'Saving…');
await render('done');
assert.equal(container.querySelector('button')?.dataset.saveState, 'done');
assert.ok(container.querySelector('.fx-success-pop'), 'success tick appears in a popping circle');
await render('error');
assert.equal(container.querySelector('button')?.dataset.saveState, 'error');
assert.equal(container.querySelector('button')?.textContent?.trim(), 'Try again');
assert.equal((container.querySelector('button') as HTMLButtonElement).disabled, false);
const css = await readFile(new URL('../src/styles/effects.css', import.meta.url), 'utf8');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /\.fx-skeleton\s*\{\s*animation:\s*none\s*!important/);
assert.match(css, /\.fx-spinner\s*\{\s*animation:\s*none\s*!important/);
await act(async () => root.unmount());
dom.window.close();
console.log('SaveButton states and reduced-motion CSS checks passed.');
