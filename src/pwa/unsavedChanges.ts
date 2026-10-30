/**
 * A tiny registry that lets a view tell the app shell that it is holding
 * unsaved form data. The service worker update prompt reads this so it never
 * reloads (or nudges a reload) while someone is mid-edit in a form.
 */
const UPDATED_EVENT = 'shine_unsaved_changes_changed';
let unsaved = false;

function notify(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(UPDATED_EVENT));
}

export const UNSAVED_CHANGES_EVENT = UPDATED_EVENT;

export function setHasUnsavedChanges(value: boolean): void {
  if (unsaved === value) return;
  unsaved = value;
  notify();
}

export function markUnsavedChanges(): void {
  setHasUnsavedChanges(true);
}

export function clearUnsavedChanges(): void {
  setHasUnsavedChanges(false);
}

export function hasUnsavedChanges(): boolean {
  return unsaved;
}
