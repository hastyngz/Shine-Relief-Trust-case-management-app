import { GoogleGenAI } from '@google/genai';
import { AppDatabase, StaffRole, StaffUser } from '../types';
import { AI_TOOL_DECLARATIONS, executeAITool } from './aiTools';

// Lazy client initialization for Gemini API
let genAIClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not configured.');
    }
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

export type AIProvider = 'gemini' | 'openrouter';

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIChatRequest {
  message: string;
  history?: AIChatMessage[];
  context?: {
    girlId?: string;
    householdId?: string;
  };
  db: AppDatabase;
  staffUser: {
    uid: string;
    email: string;
    fullName: string;
    role: StaffRole;
    status: string;
  };
}

export interface AIChatResponse {
  success: boolean;
  reply: string;
  isUnavailable?: boolean;
  provider?: AIProvider;
  toolsUsed?: string[];
  accessedRecordIds?: string[];
  auditEntry?: {
    userId: string;
    userEmail: string;
    userRole: string;
    timestamp: string;
    aiFunction: string;
    status: 'success' | 'failure';
    recordIdsAccessed: string[];
    errorMessage?: string;
  };
  errorMessage?: string;
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<{ transcription: string; reviewRequired: boolean; extractedData: Record<string, unknown> }> {
  if (!audioBase64 || audioBase64.length > 20_000_000) throw new Error('Audio payload is missing or too large.');
  const allowedMimeTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/webm'];
  if (!allowedMimeTypes.includes(mimeType)) throw new Error('Unsupported audio type.');
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: CANDIDATE_MODELS[0],
    contents: [{ role: 'user', parts: [
      { text: 'Transcribe this SHINE Relief Trust recording accurately. Return only the transcription. Preserve names, dates, numbers, and uncertainty. Do not invent missing words.' },
      { inlineData: { mimeType, data: audioBase64 } },
    ] }],
    config: { temperature: 0.1 },
  });
  const transcription = response.text?.trim() || '';
  return { transcription, reviewRequired: true, extractedData: {} };
}

export async function analyzeDocument(audioBase64: string, mimeType: string): Promise<{ extractedData: Record<string, unknown>; reviewRequired: true }> {
  if (!audioBase64 || audioBase64.length > 25_000_000) throw new Error('Document payload is missing or too large.');
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedMimeTypes.includes(mimeType)) throw new Error('Only JPEG, PNG, WebP, and PDF documents are supported.');
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: CANDIDATE_MODELS[0],
    contents: [{ role: 'user', parts: [
      { text: 'Analyze this SHINE Relief Trust document. Return valid JSON only with these keys: classification, names, dates, financialFigures, recommendations, actionItems, summary, potentialModule, confidence. Extract only visible/recorded information; use empty arrays or strings when unavailable. This is a review draft, not an official record.' },
      { inlineData: { mimeType, data: audioBase64 } },
    ] }],
    config: { temperature: 0.1, responseMimeType: 'application/json' },
  });
  let extractedData: Record<string, unknown> = {};
  try {
    extractedData = JSON.parse(response.text || '{}');
  } catch {
    extractedData = { summary: response.text || '', confidence: 'review_recommended' };
  }
  return { extractedData, reviewRequired: true };
}

const SYSTEM_INSTRUCTION = `You are the SHINE AI Assistant, a specialized, confidential case-management assistant for the SHINE Relief Trust in Malawi.
You assist authorized SHINE staff members (Administrators, Managers, and Social Workers) in reviewing, summarizing, and understanding records already stored in the SHINE case-management database.

CRITICAL OPERATIONAL RULES:
1. STRICT READ-ONLY FACTUALITY: Only report information retrieved via your tools. Never invent missing details, dates, statistics, girls, households, or expenditures.
2. MISSING INFORMATION: If information is unavailable or not found, explicitly state:
   "I could not find that information in the SHINE records."
   If a tool reports that more than one girl or household matches a name, do not pick one. List the candidates (name and ID) and ask the staff member which one they mean.
3. CONFLICT IDENTIFICATION: If records appear contradictory or incomplete, explicitly highlight the discrepancy for the staff member to review in the original documentation.
4. CLEAR CATEGORICAL SEPARATION: In every response, organize your findings and clearly distinguish between:
   - 📋 **Information from SHINE Records**: Verifiable data extracted directly from stored files, citing girl name, Case ID (e.g. SG-001), household name, or recorded visit dates.
   - 🔢 **Calculations**: Explicit math performed on records (e.g., total expenses, percentage rent collected, days overdue).
   - 📝 **Case Summary**: High-level synthesis of verified records.
   - 💡 **Recommendations & Next Steps**: Clearly labeled suggestions for staff follow-up (never confuse recommendations with recorded facts).
5. INDIVIDUAL GIRL SUMMARIES:
   When asked to summarize a girl's case history:
   - Provide basic case info: Name, Case ID, Age / DOB, School, Class level, Admission date, Living arrangement.
   - Educational follow-ups: Academic progress, attendance notes, school challenges.
   - Health / Medical follow-ups: Summarize recorded facility visits, recorded treatments, and follow-up requirements.
     * STRICT HEALTH RULE: Do NOT make medical diagnoses. Do NOT invent medical advice. Only report what is recorded in the SHINE medical log.
   - Family / Guardian follow-ups: Guardian relationship, home environment notes, family concerns.
   - Unresolved issues and upcoming scheduled follow-ups.
   - Recommended next actions for staff attention.
6. FOLLOW-UP AND OVERDUE LISTS:
   Present clear tabular or bulleted lists specifying:
   - Girl Name
   - Case ID
   - Follow-up Category (Educational, Health, Family)
   - Date Recorded
   - Identified Issue / Agreed Action
   - Next Follow-up Date
   - Current Status (e.g. Overdue, Open, In Progress)
7. HOUSEHOLD, RENT, AND EXPENSE ANALYSIS:
   - Use actual numbers stored in records. Provide currency in MWK (Malawian Kwacha).
   - Clearly report verified totals and category breakdowns.
8. REPORT NARRATIVES:
   When drafting monthly or periodic summaries, ground every statement in verified numbers. Show the underlying figures so staff can verify them before including in official trustee reports.
9. PRIVACY AND RESPECT:
   This system manages vulnerable girls and families in Malawi. Maintain a professional, supportive, objective, and strictly confidential tone at all times.`;

const CANDIDATE_MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-pro-preview'];

// Max tool-call rounds per question (same limit for both providers).
const MAX_TOOL_TURNS = 4;

async function generateContentWithFallback(
  ai: ReturnType<typeof getGenAI>,
  contents: any[],
  preferredModel?: string
) {
  const modelsToTry = preferredModel
    ? [preferredModel, ...CANDIDATE_MODELS.filter((m) => m !== preferredModel)]
    : CANDIDATE_MODELS;

  let lastError: any = null;

  for (const model of modelsToTry) {
    // Try up to 2 times for transient 503/high demand spikes
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
            temperature: 0.2,
          },
        });
        return { response, workingModel: model };
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        const isTransient =
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('overloaded') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isTransient && attempt === 1) {
          // Wait briefly before second attempt on same model
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }

        // If not transient or second attempt failed, switch to next candidate model
        break;
      }
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Quota, rate-limit, overload, out-of-credit or missing-key errors: the user should simply retry later. */
function isQuotaOrUnavailableMessage(message: string): boolean {
  return /quota|resource_exhausted|overloaded|\b429\b|\b402\b|\b503\b|unavailable|high demand|rate[\s_-]?limit|too many requests|insufficient (credits|funds)|GEMINI_API_KEY|OPENROUTER_API_KEY/i.test(message);
}

/** Gemini failures that justify trying the backup provider. */
function shouldFallBackToOpenRouter(message: string): boolean {
  return isQuotaOrUnavailableMessage(message) ||
    /not[\s_-]?found|\b404\b|permission[\s_-]?denied|\b403\b|api key not valid|invalid api key|\b500\b|\b502\b|\b504\b|deadline|timeout|fetch failed|ECONN|ENOTFOUND/i.test(message);
}

// ---------------------------------------------------------------------------
// Gemini (primary provider)
// ---------------------------------------------------------------------------

interface ProviderOutcome {
  text: string;
  hitToolLimit: boolean;
}

function buildUserPrompt(request: AIChatRequest): string {
  // Context hint if user is currently viewing a specific girl or household
  let userPromptWithContext = request.message;
  if (request.context?.girlId) {
    userPromptWithContext += `\n[Staff note: The staff member is currently viewing girl with ID: "${request.context.girlId}"]`;
  }
  if (request.context?.householdId) {
    userPromptWithContext += `\n[Staff note: The staff member is currently viewing household with ID: "${request.context.householdId}"]`;
  }
  return userPromptWithContext;
}

async function runGeminiChat(
  request: AIChatRequest,
  userPrompt: string,
  toolsUsed: Set<string>,
  accessedRecordIds: Set<string>
): Promise<ProviderOutcome> {
  const ai = getGenAI();
  const db = request.db;

  // Format chat contents
  const contents: Array<any> = [];

  // Add prior message history if present (limit to last 6 for prompt efficiency & privacy)
  if (request.history && request.history.length > 0) {
    const recentHistory = request.history.slice(-6);
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: userPrompt }],
  });

  let { response: currentResponse, workingModel } = await generateContentWithFallback(ai, contents);

  // Handle tool execution loop (max turns for fast response and cost efficiency)
  let turns = 0;
  while (turns < MAX_TOOL_TURNS && currentResponse.functionCalls && currentResponse.functionCalls.length > 0) {
    turns++;
    const functionCalls = currentResponse.functionCalls;

    // Append model response containing the tool calls
    const candidateContent = currentResponse.candidates?.[0]?.content;
    if (candidateContent) {
      contents.push(candidateContent);
    }

    // Execute each requested tool
    const functionResponseParts: any[] = [];
    for (const call of functionCalls) {
      if (!call.name) continue;
      toolsUsed.add(call.name);
      const result = await executeAITool(call.name, call.args || {}, db, accessedRecordIds);
      functionResponseParts.push({
        functionResponse: {
          name: call.name,
          response: { output: result },
        },
      });
    }

    // Append tool responses
    contents.push({
      role: 'user',
      parts: functionResponseParts,
    });

    // Request next completion from model using current working model (or fallback)
    const nextGen = await generateContentWithFallback(ai, contents, workingModel);
    currentResponse = nextGen.response;
    workingModel = nextGen.workingModel;
  }

  return {
    text: (currentResponse.text || '').trim(),
    hitToolLimit: !!(currentResponse.functionCalls && currentResponse.functionCalls.length > 0),
  };
}

// ---------------------------------------------------------------------------
// OpenRouter (backup provider, OpenAI-compatible API)
// ---------------------------------------------------------------------------

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function isOpenRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Comma-separated list in priority order. OpenRouter tries each in turn if one is rate limited or down. */
function getOpenRouterModels(): string[] {
  const configured = (process.env.OPENROUTER_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : ['openrouter/auto'];
}

/** Gemini declares schema types in upper case (OBJECT, STRING); JSON Schema / OpenAI want lower case. */
function toJsonSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const converted: any = { ...schema };
  if (typeof converted.type === 'string') converted.type = converted.type.toLowerCase();
  if (converted.properties && typeof converted.properties === 'object') {
    converted.properties = Object.fromEntries(
      Object.entries(converted.properties).map(([key, value]) => [key, toJsonSchema(value)])
    );
  }
  if (converted.items) converted.items = toJsonSchema(converted.items);
  return converted;
}

function getOpenRouterTools(): any[] {
  return AI_TOOL_DECLARATIONS.map((declaration: any) => ({
    type: 'function',
    function: {
      name: declaration.name,
      description: declaration.description,
      parameters: toJsonSchema(declaration.parameters) || { type: 'object', properties: {} },
    },
  }));
}

async function openRouterCompletion(messages: any[], tools: any[]): Promise<any> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'SHINE Case Management',
    },
    body: JSON.stringify({
      models: getOpenRouterModels(),
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      // Only use providers that actually support tool calling and every parameter we send.
      provider: { require_parameters: true },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 300)}`);
  }
  const data: any = await response.json();
  if (data?.error) {
    throw new Error(`OpenRouter error: ${JSON.stringify(data.error).slice(0, 300)}`);
  }
  return data;
}

async function runOpenRouterChat(
  request: AIChatRequest,
  userPrompt: string,
  toolsUsed: Set<string>,
  accessedRecordIds: Set<string>
): Promise<ProviderOutcome> {
  const db = request.db;
  const tools = getOpenRouterTools();

  const messages: any[] = [{ role: 'system', content: SYSTEM_INSTRUCTION }];
  if (request.history && request.history.length > 0) {
    for (const msg of request.history.slice(-6)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userPrompt });

  let data = await openRouterCompletion(messages, tools);
  let message = data?.choices?.[0]?.message;

  let turns = 0;
  while (turns < MAX_TOOL_TURNS && Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    turns++;
    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls });

    for (const call of message.tool_calls) {
      const toolName = call?.function?.name;
      if (!toolName) continue;
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      toolsUsed.add(toolName);
      const result = await executeAITool(toolName, args, db, accessedRecordIds);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    data = await openRouterCompletion(messages, tools);
    message = data?.choices?.[0]?.message;
  }

  return {
    text: String(message?.content || '').trim(),
    hitToolLimit: Array.isArray(message?.tool_calls) && message.tool_calls.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function processAIChat(request: AIChatRequest): Promise<AIChatResponse> {
  const timestamp = new Date().toISOString();
  const accessedRecordIds = new Set<string>();
  const toolsUsed = new Set<string>();

  // 1. Verify user authorization
  const staff = request.staffUser;
  if (!staff || !staff.uid) {
    return {
      success: false,
      reply: 'Unauthorized. Staff authentication is required.',
      errorMessage: 'Missing staff user authentication.',
    };
  }

  if (staff.status !== 'Active') {
    return {
      success: false,
      reply: 'Access Denied: Your staff account is suspended or inactive.',
      errorMessage: 'Staff account is inactive or suspended.',
    };
  }

  try {
    const userPrompt = buildUserPrompt(request);
    let provider: AIProvider = 'gemini';
    let outcome: ProviderOutcome;

    try {
      outcome = await runGeminiChat(request, userPrompt, toolsUsed, accessedRecordIds);
    } catch (geminiError: any) {
      const geminiMessage = String(geminiError?.message || geminiError);
      if (!isOpenRouterConfigured() || !shouldFallBackToOpenRouter(geminiMessage)) {
        throw geminiError;
      }

      console.warn('SHINE AI Assistant: Gemini failed, rerouting to OpenRouter:', geminiMessage.slice(0, 200));
      provider = 'openrouter';
      try {
        outcome = await runOpenRouterChat(request, userPrompt, toolsUsed, accessedRecordIds);
      } catch (openRouterError: any) {
        throw new Error(
          `Gemini failed: ${geminiMessage.slice(0, 200)} | OpenRouter failed: ${String(openRouterError?.message || openRouterError).slice(0, 200)}`
        );
      }
    }

    // If the model still wanted more look-ups after the turn limit, say so instead of
    // presenting a partial or empty answer as complete.
    let replyText = outcome.text;
    if (!replyText) {
      replyText = outcome.hitToolLimit
        ? 'I reached the limit of record look-ups for a single question before I could finish. Please narrow the question (for example to one girl, one household, or one month) and ask again.'
        : 'I could not produce an answer from the SHINE records for that question. Please rephrase it or add more detail.';
    } else if (outcome.hitToolLimit) {
      replyText += '\n\n⚠️ Note: this answer may be incomplete because I reached the limit of record look-ups for one question. Try a narrower question to confirm.';
    }

    const functionLabel = Array.from(toolsUsed).join(', ') || 'direct_query';
    return {
      success: true,
      reply: replyText,
      provider,
      toolsUsed: Array.from(toolsUsed),
      accessedRecordIds: Array.from(accessedRecordIds),
      auditEntry: {
        userId: staff.uid,
        userEmail: staff.email,
        userRole: staff.role,
        timestamp,
        // The backup provider is recorded in the audit log because it received the record data.
        aiFunction: provider === 'gemini' ? functionLabel : `${functionLabel} [via openrouter]`,
        status: 'success',
        recordIdsAccessed: Array.from(accessedRecordIds),
      },
    };
  } catch (error: any) {
    console.error('SHINE AI Assistant execution error:', error);
    const errMessage = String(error?.message || error);
    const isQuotaOrUnavailable = isQuotaOrUnavailableMessage(errMessage);

    return {
      success: false,
      reply: isQuotaOrUnavailable
        ? 'The SHINE AI Assistant is currently experiencing temporary high demand upstream. Please try your question again in a moment. All standard SHINE case-management operations remain fully accessible.'
        : 'SHINE AI Assistant is temporarily unavailable. Your normal SHINE case-management functions are still available.',
      isUnavailable: true,
      errorMessage: errMessage,
      auditEntry: {
        userId: staff.uid,
        userEmail: staff.email,
        userRole: staff.role,
        timestamp,
        aiFunction: Array.from(toolsUsed).join(', ') || 'error',
        status: 'failure',
        recordIdsAccessed: Array.from(accessedRecordIds),
        errorMessage: isQuotaOrUnavailable ? 'Quota exceeded or service temporarily unavailable' : errMessage,
      },
    };
  }
}
