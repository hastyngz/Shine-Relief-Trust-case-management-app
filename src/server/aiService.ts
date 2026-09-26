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

const SYSTEM_INSTRUCTION = `You are the SHINE AI Assistant, a specialized, confidential case-management assistant for the SHINE Relief Trust in Malawi.
You assist authorized SHINE staff members (Administrators, Managers, and Social Workers) in reviewing, summarizing, and understanding records already stored in the SHINE case-management database.

CRITICAL OPERATIONAL RULES:
1. STRICT READ-ONLY FACTUALITY: Only report information retrieved via your tools. Never invent missing details, dates, statistics, girls, households, or expenditures.
2. MISSING INFORMATION: If information is unavailable or not found, explicitly state:
   "I could not find that information in the SHINE records."
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

  // 2. Prepare database context
  const db = request.db;

  try {
    const ai = getGenAI();

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

    // Context hint if user is currently viewing a specific girl or household
    let userPromptWithContext = request.message;
    if (request.context?.girlId) {
      userPromptWithContext += `\n[Staff note: The staff member is currently viewing girl with ID: "${request.context.girlId}"]`;
    }
    if (request.context?.householdId) {
      userPromptWithContext += `\n[Staff note: The staff member is currently viewing household with ID: "${request.context.householdId}"]`;
    }

    contents.push({
      role: 'user',
      parts: [{ text: userPromptWithContext }],
    });

    let { response: currentResponse, workingModel } = await generateContentWithFallback(ai, contents);

    // Handle tool execution loop (max 4 turns for fast response and cost efficiency)
    let turns = 0;
    while (turns < 4 && currentResponse.functionCalls && currentResponse.functionCalls.length > 0) {
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

    const replyText = currentResponse.text || 'I have analyzed the available records.';

    return {
      success: true,
      reply: replyText,
      toolsUsed: Array.from(toolsUsed),
      accessedRecordIds: Array.from(accessedRecordIds),
      auditEntry: {
        userId: staff.uid,
        userEmail: staff.email,
        userRole: staff.role,
        timestamp,
        aiFunction: Array.from(toolsUsed).join(', ') || 'direct_query',
        status: 'success',
        recordIdsAccessed: Array.from(accessedRecordIds),
      },
    };
  } catch (error: any) {
    console.error('SHINE AI Assistant execution error:', error);
    const errMessage = String(error?.message || error);
    const isQuotaOrUnavailable =
      errMessage.includes('quota') ||
      errMessage.includes('resource_exhausted') ||
      errMessage.includes('overloaded') ||
      errMessage.includes('503') ||
      errMessage.includes('UNAVAILABLE') ||
      errMessage.includes('high demand') ||
      errMessage.includes('rate') ||
      errMessage.includes('GEMINI_API_KEY');

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
