import { analyzeDocument, processAIChat, transcribeAudio } from '../../src/server/aiService';
import type { AppDatabase } from '../../src/types';

const firestoreRoot = (projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

let cachedAccessToken = '';
let cachedAccessTokenExpiry = 0;

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getFirestoreAccessToken(env: Record<string, string>): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiry - 60_000) return cachedAccessToken;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Firebase service access is not configured.');

  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: tokenUrl,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const privateKey = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const keyBytes = Uint8Array.from(atob(privateKey), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedToken));
  const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error('Could not authorize Firestore access.');
  const token = await response.json() as { access_token: string; expires_in: number };
  cachedAccessToken = token.access_token;
  cachedAccessTokenExpiry = Date.now() + token.expires_in * 1000;
  return cachedAccessToken;
}

function decodeValue(value: any): any {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('geoPointValue' in value) return value.geoPointValue;
  return undefined;
}

function decodeFields(fields: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeDocument(document: any): Record<string, any> {
  return { ...decodeFields(document.fields || {}), id: document.name.split('/').at(-1) };
}

function encodeValue(value: any): any {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { nullValue: null };
}

function encodeFields(fields: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, encodeValue(value)]));
}

async function firestoreRequest(env: Record<string, string>, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getFirestoreAccessToken(env);
  return fetch(`${firestoreRoot(env.FIREBASE_PROJECT_ID)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

async function getSettings(env: Record<string, string>): Promise<Record<string, any>> {
  const response = await firestoreRequest(env, '/aiSettings/default');
  if (response.status === 404) return { enabled: true, speechToText: true, documentAnalysis: true, naturalLanguageSearch: true };
  if (!response.ok) throw new Error('Could not load AI settings.');
  return decodeFields((await response.json() as any).fields || {});
}

async function listRecords(env: Record<string, string>, collection: string): Promise<Record<string, any>[]> {
  const records: Record<string, any>[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await firestoreRequest(env, `/${collection}?${query}`);
    if (!response.ok) throw new Error(`Could not load ${collection} from Firestore.`);
    const page = await response.json() as any;
    records.push(...(page.documents || []).map(decodeDocument));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return records;
}

async function loadCaseActions(env: Record<string, string>, staff: any, canViewTeamTasks: boolean): Promise<Record<string, any>[]> {
  if (canViewTeamTasks) return listRecords(env, 'caseActions');
  const response = await firestoreRequest(env, ':runQuery', {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'caseActions' }],
      where: { fieldFilter: {
        field: { fieldPath: 'assignedStaffId' },
        op: 'EQUAL',
        value: { stringValue: staff.uid },
      } },
    } }),
  });
  if (!response.ok) throw new Error('Could not load assigned case actions from Firestore.');
  const results = await response.json() as any[];
  return results.filter((item) => item.document).map((item) => decodeDocument(item.document));
}

export function getAICollectionsForTool(toolName: string, args: Record<string, any>, staff: any): string[] {
  const collectionsByTool: Record<string, string[]> = {
    searchGirls: ['girls'],
    getGirlProfile: ['girls', 'households', 'caseGoals'],
    getGirlFollowUps: ['girls', 'educationalFollowUps', 'healthFollowUps', 'familyFollowUps'],
    searchHouseholds: ['households', 'girls'],
    getHouseholdProfile: ['households', 'girls'],
    getHouseholdFollowUps: ['households', 'householdActivities'],
    getRentRecords: ['households', 'rentPayments'],
    getHouseholdExpenses: ['households', 'expenses'],
    getGroupActivities: ['households', 'householdActivities'],
    getOutstandingFollowUps: ['girls', 'educationalFollowUps', 'healthFollowUps', 'familyFollowUps'],
    getDashboardStatistics: ['girls', 'households', 'educationalFollowUps', 'healthFollowUps', 'familyFollowUps', 'caseActions', 'caseReviews', 'girlLeaves'],
    getCaseActions: ['caseActions'],
    getGirlEducationHistory: ['girls', 'educationHistory', 'academicSupports', 'examinationRecords'],
    getGirlsOnLeave: ['girls', 'girlLeaves'],
    getUpcomingCaseReviews: ['caseReviews'],
    searchOperationalRecords: ['girls', 'households', 'meetings', 'schedules', 'workplans', 'marketPrices', 'feedingProgramLogs', 'programmeLogs'],
    getReportData: ['girls', 'educationalFollowUps', 'healthFollowUps', 'familyFollowUps', 'householdActivities', 'expenses', 'rentPayments'],
  };

  let collections = collectionsByTool[toolName] || [];
  if (toolName === 'getGirlFollowUps') {
    const type = String(args.followUpType || 'all').toLowerCase();
    collections = collections.filter((name) => name !== 'educationalFollowUps' || type === 'all' || type === 'educational')
      .filter((name) => name !== 'healthFollowUps' || type === 'all' || type === 'health')
      .filter((name) => name !== 'familyFollowUps' || type === 'all' || type === 'family');
  }
  if (!staff.canViewHealthRecords) collections = collections.filter((name) => name !== 'healthFollowUps');
  if (!staff.canViewCaseReviews) collections = collections.filter((name) => name !== 'caseReviews');
  return collections;
}

async function loadAIRecords(
  env: Record<string, string>,
  staff: any,
  toolName: string,
  args: Record<string, any>
): Promise<AppDatabase> {
  const collections = getAICollectionsForTool(toolName, args, staff);
  const results = await Promise.all(collections.map((name) =>
    name === 'caseActions'
      ? loadCaseActions(env, staff, staff.role === 'Administrator' || staff.role === 'Manager')
      : listRecords(env, name)
  ));
  const records = Object.fromEntries(collections.map((name, index) => [name, results[index]]));
  return {
    ...records,
    girls: records.girls || [],
    households: records.households || [],
    educationalFollowUps: records.educationalFollowUps || [],
    healthFollowUps: records.healthFollowUps || [],
    familyFollowUps: records.familyFollowUps || [],
    rentPayments: records.rentPayments || [],
    expenses: records.expenses || [],
    householdActivities: records.householdActivities || [],
  } as AppDatabase;
}

async function writeAudit(env: Record<string, string>, entry: Record<string, any>): Promise<void> {
  const response = await firestoreRequest(env, '/aiAuditLogs', {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFields({ ...entry, createdAt: new Date().toISOString() }) }),
  });
  if (!response.ok) throw new Error('Could not write the AI audit record.');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function auditSafely(env: Record<string, string>, entry: Record<string, any>): Promise<void> {
  try {
    await writeAudit(env, entry);
  } catch (error) {
    console.error('AI audit write failed:', error);
  }
}

export async function handleAIRequest(request: Request, env: Record<string, string>, staff: any): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST') return json({ error: 'AI endpoint not found.' }, 404);
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 35 * 1024 * 1024) return json({ error: 'Request payload is too large.' }, 413);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'A valid JSON request body is required.' }, 400);
  }

  try {
    const settings = await getSettings(env);
    if (settings.enabled === false) return json({ error: 'AI features are disabled by an Administrator.' }, 403);

    if (url.pathname === '/api/ai/chat') {
      if (settings.naturalLanguageSearch === false) return json({ error: 'Natural-language AI search is disabled by an Administrator.' }, 403);
      if (typeof body?.message !== 'string' || !body.message.trim() || body.message.length > 4000) {
        return json({ error: 'Please provide a question of 1 to 4,000 characters.' }, 400);
      }
      const result = await processAIChat({
        message: body.message.trim(),
        history: Array.isArray(body.history)
          ? body.history.slice(-6).filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
            .map((item: any) => ({ role: item.role, content: item.content.slice(0, 4000) }))
          : [],
        context: {
          girlId: typeof body.context?.girlId === 'string' ? body.context.girlId.slice(0, 128) : undefined,
          householdId: typeof body.context?.householdId === 'string' ? body.context.householdId.slice(0, 128) : undefined,
        },
        loadDatabase: (toolName, args) => loadAIRecords(env, staff, toolName, args),
        staffUser: {
          uid: staff.uid,
          email: staff.email,
          fullName: staff.fullName,
          role: staff.role,
          status: 'Active',
        },
      });
      if (result.auditEntry) await auditSafely(env, result.auditEntry);
      const { auditEntry: _auditEntry, ...clientResult } = result;
      return json(clientResult);
    }

    if (url.pathname === '/api/ai/transcribe') {
      if (settings.speechToText === false) return json({ error: 'Speech-to-text is disabled by an Administrator.' }, 403);
      if (typeof body?.audioBase64 !== 'string' || typeof body?.mimeType !== 'string') {
        return json({ error: 'Audio data and MIME type are required.' }, 400);
      }
      const result = await transcribeAudio(body.audioBase64, body.mimeType);
      await auditSafely(env, {
        userId: staff.uid, userEmail: staff.email, userRole: staff.role,
        timestamp: new Date().toISOString(), aiFunction: 'transcription', status: 'success', recordIdsAccessed: [],
      });
      return json(result);
    }

    if (url.pathname === '/api/ai/analyze-document') {
      if (settings.documentAnalysis === false) return json({ error: 'Document analysis is disabled by an Administrator.' }, 403);
      if (typeof body?.documentBase64 !== 'string' || typeof body?.mimeType !== 'string') {
        return json({ error: 'Document data and MIME type are required.' }, 400);
      }
      const result = await analyzeDocument(body.documentBase64, body.mimeType);
      await auditSafely(env, {
        userId: staff.uid, userEmail: staff.email, userRole: staff.role,
        timestamp: new Date().toISOString(), aiFunction: 'document_analysis', status: 'success',
        recordIdsAccessed: [], reviewStatus: 'review_required',
      });
      return json(result);
    }

    return json({ error: 'AI endpoint not found.' }, 404);
  } catch (error: any) {
    console.error('SHINE AI Worker request failed:', error);
    return json({ error: error.message || 'SHINE AI request failed.' }, 500);
  }
}