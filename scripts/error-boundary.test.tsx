import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// A DOM is required to mount React and exercise the error boundary's fallback.
// ---------------------------------------------------------------------------
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
});
const { window } = dom;
Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
Object.defineProperty(globalThis, 'document', { configurable: true, value: window.document });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: window.HTMLElement });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { ErrorBoundary } = await import('../src/components/Error/ErrorBoundary');

const errors: unknown[] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => { errors.push(args); };

function Boom(): React.ReactElement {
  throw new Error('boom in view');
}

const container = window.document.getElementById('root')!;
const root = createRoot(container);

await act(async () => {
  root.render(
    React.createElement(ErrorBoundary as any, { label: 'test-view' }, React.createElement(Boom)),
  );
});

const text = container.textContent || '';
assert.ok(text.includes('Something went wrong on this screen'), 'the fallback message appears');
assert.ok(text.includes('Try again'), 'the fallback offers Try again');
assert.ok(text.includes('Go to dashboard'), 'the fallback offers Go to dashboard');
assert.ok(errors.length > 0, 'the error is logged to the console');

// Clicking "Go to dashboard" resets the boundary and navigates via the hash.
const dashboardButton = [...container.querySelectorAll('button')].find((button) =>
  (button.textContent || '').includes('Go to dashboard'),
)!;
await act(async () => {
  dashboardButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
});
assert.equal(window.location.hash, '#/dashboard', 'Go to dashboard navigates to the dashboard');

// A healthy child renders normally with no fallback.
const okContainer = window.document.createElement('div');
window.document.body.appendChild(okContainer);
const okRoot = createRoot(okContainer);
await act(async () => {
  okRoot.render(
    React.createElement(ErrorBoundary as any, null, React.createElement('p', null, 'All good')),
  );
});
assert.ok((okContainer.textContent || '').includes('All good'), 'a healthy child renders normally');
assert.ok(!(okContainer.textContent || '').includes('Something went wrong'), 'no fallback for a healthy child');

console.error = originalError;
console.log('Error boundary tests passed.');
