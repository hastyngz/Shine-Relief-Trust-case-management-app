/** Authenticated local workspace. Unscoped legacy data is preserved for explicit recovery. */
let activeWorkspaceUid: string | null = null;

export function setActiveWorkspaceUid(uid: string | null | undefined): void {
  const nextUid = typeof uid === 'string' && uid.trim() && uid !== 'unknown' ? uid : null;
  if (activeWorkspaceUid === nextUid) return;
  activeWorkspaceUid = nextUid;
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new Event('shine_workspace_changed')); } catch { /* best effort */ }
  }
}

export function getActiveWorkspaceUid(): string | null {
  return activeWorkspaceUid;
}

export function getWorkspaceStorageKey(baseKey: string): string | null {
  return activeWorkspaceUid ? `${baseKey}::uid:${encodeURIComponent(activeWorkspaceUid)}` : null;
}

export function getWorkspaceIndexedDbName(baseName: string): string | null {
  return activeWorkspaceUid ? `${baseName}::uid:${encodeURIComponent(activeWorkspaceUid)}` : null;
}
