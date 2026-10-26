import { auth } from '../firebase';
import { API_BASE_URL } from './apiBase';

async function requestR2(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to access stored files.');
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `File storage request failed (${response.status}).`);
  }
  return response;
}

export async function uploadStoredFile(
  storagePath: string,
  body: Blob,
  contentType: string,
  metadata: Record<string, string> = {}
): Promise<void> {
  const headers = new Headers({
    'Content-Type': contentType || 'application/octet-stream',
    'X-Storage-Path': storagePath,
  });
  for (const [key, value] of Object.entries(metadata)) {
    headers.set(`X-Storage-${key}`, value);
  }
  await requestR2('/api/storage/object', { method: 'PUT', headers, body });
}

export async function getStoredFileDownloadUrl(storagePath: string, downloadFileName?: string): Promise<string> {
  const query = new URLSearchParams({ path: storagePath });
  if (downloadFileName) {
    query.set('download', '1');
    query.set('name', downloadFileName);
  }
  const response = await requestR2(`/api/storage/download-url?${query}`);
  const payload = await response.json();
  return payload.url;
}

export async function getStoredFile(storagePath: string): Promise<Blob> {
  const query = new URLSearchParams({ path: storagePath });
  const response = await requestR2(`/api/storage/object?${query}`);
  return response.blob();
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  const query = new URLSearchParams({ path: storagePath });
  await requestR2(`/api/storage/object?${query}`, { method: 'DELETE' });
}


export async function postInventoryMovement(payload: Record<string, unknown>): Promise<any> {
  const endpoint = ['/api', 'inventory', 'movement'].join('/');
  const response = await requestR2(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}


export async function postInventoryMovement(payload: Record<string, unknown>): Promise<{
  ok: true;
  duplicate: boolean;
  quantityOnHand?: number;
  movement: Record<string, unknown>;
}> {
  const endpoint = ['/api', 'inventory', 'movement'].join('/');
  const response = await requestR2(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}
