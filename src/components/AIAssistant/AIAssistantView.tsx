import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  BookOpen,
  Calendar,
  Home,
  Heart,
  DollarSign,
  ChevronDown,
  User,
  ArrowRight,
  Database,
  Volume2,
  StopCircle,
  Mic,
  MicOff,
  Languages,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AppDatabase, Girl, Household } from '../../types';
import { AudioDataInput } from '../Intelligence/AudioDataInput';
import { cleanTextForSpeech } from '../../utils/speech';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  accessedRecordIds?: string[];
  isUnavailable?: boolean;
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const getSpeechRecognition = (): BrowserSpeechRecognitionConstructor | undefined => {
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
};

interface AIAssistantViewProps {
  db: AppDatabase;
  initialGirlId?: string;
  initialHouseId?: string;
  onNavigateToGirl?: (girlId: string) => void;
  onNavigateToHouse?: (houseId: string) => void;
}

const SUGGESTED_QUESTIONS = [
  {
    category: 'Case Summary',
    text: "Summarize this girl's case history.",
    icon: User,
    needsGirl: true,
  },
  {
    category: 'Follow-ups',
    text: 'What outstanding follow-ups need attention?',
    icon: Calendar,
  },
  {
    category: 'Follow-ups',
    text: 'Show me follow-ups that are overdue.',
    icon: AlertCircle,
  },
  {
    category: 'Education',
    text: 'Show me girls with unresolved educational issues.',
    icon: BookOpen,
  },
  {
    category: 'Health',
    text: 'Summarize the medical follow-ups for this month.',
    icon: Heart,
  },
  {
    category: 'Finance',
    text: 'Summarize household expenditure for this month.',
    icon: DollarSign,
  },
  {
    category: 'Rent',
    text: 'Which households have unpaid or partially paid rent?',
    icon: Home,
  },
  {
    category: 'Activities',
    text: "Summarize this month's SHINE activities.",
    icon: Sparkles,
  },
  {
    category: 'Trends',
    text: 'What educational concerns appear most frequently?',
    icon: BookOpen,
  },
  {
    category: 'Reporting',
    text: 'Draft a monthly case-management summary.',
    icon: Database,
  },
];

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  db,
  initialGirlId,
  initialHouseId,
  onNavigateToGirl,
  onNavigateToHouse,
}) => {
  const { staffProfile, currentUser, role, isViewOnly } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Load cached session chat per user to preserve context while switching views
    if (currentUser?.uid) {
      try {
        const saved = sessionStorage.getItem(`shine_ai_chat_${currentUser.uid}`);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedGirlId, setSelectedGirlId] = useState<string>(initialGirlId || '');
  const [selectedHouseId, setSelectedHouseId] = useState<string>(initialHouseId || '');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [voiceConversation, setVoiceConversation] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState('en-GB');
  const [voiceListening, setVoiceListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [recognitionCycle, setRecognitionCycle] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceConversationRef = useRef(voiceConversation);
  const submitVoiceQueryRef = useRef<(query: string) => void>(() => {});
  voiceConversationRef.current = voiceConversation;

  // Sync to sessionStorage
  useEffect(() => {
    if (currentUser?.uid && messages.length > 0) {
      try {
        sessionStorage.setItem(`shine_ai_chat_${currentUser.uid}`, JSON.stringify(messages));
      } catch (e) {
        // ignore
      }
    }
  }, [messages, currentUser?.uid]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Update context if props change
  useEffect(() => {
    if (initialGirlId) setSelectedGirlId(initialGirlId);
    if (initialHouseId) setSelectedHouseId(initialHouseId);
  }, [initialGirlId, initialHouseId]);

  const activeGirl = db.girls.find((g) => g.id === selectedGirlId);
  const activeHouse = db.households.find((h) => h.id === selectedHouseId);

  const handleClearChat = () => {
    if (confirm('Clear the current conversation? Stored records in the database will not be affected.')) {
      setMessages([]);
      if (currentUser?.uid) {
        sessionStorage.removeItem(`shine_ai_chat_${currentUser.uid}`);
      }
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const speakResponse = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(text));
    utterance.lang = voiceLanguage;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const handleSubmit = async (queryToSend?: string) => {
    const query = (queryToSend || inputQuery).trim();
    if (!query || loading) return;

    setErrorMessage(null);
    setInputQuery('');

    // If query is "Summarize this girl's case history" but no girl is selected, prompt user
    if (query.toLowerCase().includes("this girl") && !selectedGirlId && db.girls.length > 0) {
      // Pick first girl or prompt selection
      setSelectedGirlId(db.girls[0].id);
    }

    const userMessage: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Get authentication token if available
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => null) : null;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
      // Convert messages for API history
      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Call server-side controlled Gemini endpoint
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: query,
          history,
          context: {
            girlId: selectedGirlId || undefined,
            householdId: selectedHouseId || undefined,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || data.isUnavailable) {
        const assistantMsg: ChatMessage = {
          id: 'asst_' + Date.now(),
          role: 'assistant',
          content:
            data.reply ||
            'SHINE AI Assistant is temporarily unavailable. Your normal SHINE case-management functions are still available.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isUnavailable: true,
        };
        setMessages([...newMessages, assistantMsg]);
        if (voiceConversationRef.current) speakResponse(assistantMsg.content);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: 'asst_' + Date.now(),
        role: 'assistant',
        content: data.reply || 'No information found in SHINE records.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolsUsed: data.toolsUsed,
        accessedRecordIds: data.accessedRecordIds,
      };

      setMessages([...newMessages, assistantMsg]);
      if (voiceConversationRef.current) speakResponse(assistantMsg.content);

    } catch (err: any) {
      console.error('AI chat error:', err);
      const assistantMsg: ChatMessage = {
        id: 'asst_' + Date.now(),
        role: 'assistant',
        content:
          'SHINE AI Assistant is temporarily unavailable. Your normal SHINE case-management functions are still available.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isUnavailable: true,
      };
      setMessages([...newMessages, assistantMsg]);
      if (voiceConversationRef.current) speakResponse(assistantMsg.content);
    } finally {
      setLoading(false);
    }
  };

  submitVoiceQueryRef.current = (query) => { void handleSubmit(query); };

  useEffect(() => {
    if (!voiceConversation || loading || isSpeaking) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setVoiceListening(false);
      return;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceError('Voice conversation is not supported in this browser.');
      setVoiceConversation(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = voiceLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(' ')
        .trim();
      if (!transcript) return;
      setInputQuery(transcript);
      recognitionRef.current = null;
      setVoiceListening(false);
      recognition.stop();
      submitVoiceQueryRef.current(transcript);
    };
    recognition.onerror = (event) => {
      setVoiceError(`Voice input stopped: ${event.error}.`);
      setVoiceConversation(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setVoiceListening(false);
      window.setTimeout(() => {
        if (voiceConversationRef.current) {
          setRecognitionCycle((cycle) => cycle + 1);
        }
      }, 400);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setVoiceListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceListening(false);
      setVoiceError('Could not start voice input. Check microphone permission and try again.');
      setVoiceConversation(false);
    }

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        recognition.stop();
      }
    };
  }, [voiceConversation, voiceLanguage, loading, isSpeaking, recognitionCycle]);

  const renderComposer = () => (
    <div className="w-full space-y-3 text-left">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="flex w-full items-stretch gap-2"
      >
        <textarea
          ref={textareaRef}
          value={inputQuery}
          onChange={(event) => setInputQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Ask any question about SHINE girls, overdue follow-ups, expenses, or rent..."
          rows={2}
          disabled={loading}
          className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:border-teal-800 focus:bg-white focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-900 px-5 py-3 text-sm font-semibold text-white shadow-xs transition-all hover:bg-teal-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin text-amber-400" /> : <Send className="h-4 w-4 text-amber-400" />}
          <span>Ask AI</span>
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-stone-200 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-label={`Voice conversation ${voiceConversation ? 'On' : 'Off'}`}
            aria-checked={voiceConversation}
            onClick={() => {
              setVoiceError(null);
              setVoiceConversation((enabled) => !enabled);
            }}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              voiceConversation ? 'bg-teal-900 text-white' : 'border border-stone-300 bg-white text-stone-700'
            }`}
          >
            {voiceConversation ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            <span>Voice conversation {voiceConversation ? 'On' : 'Off'}</span>
            {voiceListening && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
          </button>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-600">
            <Languages className="h-4 w-4" />
            <span>Language</span>
            <select
              aria-label="Voice conversation language"
              value={voiceLanguage}
              onChange={(event) => setVoiceLanguage(event.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-800"
            >
              <option value="en-GB">English (UK)</option>
              <option value="en-US">English (US)</option>
              <option value="ny-MW">Chichewa</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={stopSpeaking}
          disabled={!isSpeaking}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Stop speaking"
        >
          <StopCircle className="h-4 w-4" />
          <span>Stop speaking</span>
        </button>
      </div>

      {voiceError && <p className="text-xs text-rose-700" role="status">{voiceError}</p>}
      <details className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-stone-700">Record or upload a voice question</summary>
        <div className="pt-3">
          <AudioDataInput label="Voice question" onTranscriptionChange={setInputQuery} disabled={loading} />
        </div>
      </details>
      <p className="text-center text-[11px] font-medium text-stone-500">
        AI-generated summaries may contain errors. Verify important information against the original SHINE records.
      </p>
    </div>
  );

  // Extract girl IDs (e.g., SG-001) or household IDs (e.g., HH-01) from content to create quick navigation links
  const renderFormattedContent = (content: string) => {
    // Process markdown-like sections and add badge highlights
    const lines = content.split('\n');

    return (
      <div className="space-y-2 text-sm leading-relaxed text-stone-800">
        {lines.map((line, idx) => {
          const trimmed = line.trim();

          // Section headers
          if (trimmed.startsWith('📋') || trimmed.includes('Information from SHINE Records') || trimmed.includes('SHINE Records:')) {
            return (
              <div key={idx} className="mt-4 mb-2 flex items-center gap-1.5 font-bold text-teal-900 border-b border-teal-200 pb-1">
                <span>{line}</span>
              </div>
            );
          }
          if (trimmed.startsWith('🔢') || trimmed.includes('Calculations') || trimmed.includes('Calculations:')) {
            return (
              <div key={idx} className="mt-4 mb-2 flex items-center gap-1.5 font-bold text-sky-900 border-b border-sky-200 pb-1">
                <span>{line}</span>
              </div>
            );
          }
          if (trimmed.startsWith('📝') || trimmed.includes('Case Summary') || trimmed.includes('Summary:')) {
            return (
              <div key={idx} className="mt-4 mb-2 flex items-center gap-1.5 font-bold text-amber-900 border-b border-amber-200 pb-1">
                <span>{line}</span>
              </div>
            );
          }
          if (trimmed.startsWith('💡') || trimmed.includes('Recommendations') || trimmed.includes('Suggested Next Actions:')) {
            return (
              <div key={idx} className="mt-4 mb-2 flex items-center gap-1.5 font-bold text-emerald-900 border-b border-emerald-200 pb-1">
                <span>{line}</span>
              </div>
            );
          }

          // Bullet point lines
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const bulletText = trimmed.substring(2);
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-teal-700 font-bold mt-1 text-xs">•</span>
                <span className="flex-1">{formatTextWithRecordLinks(bulletText)}</span>
              </div>
            );
          }

          // Numbered lines
          const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
          if (numMatch) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-teal-800 font-bold text-xs mt-0.5">{numMatch[1]}.</span>
                <span className="flex-1">{formatTextWithRecordLinks(numMatch[2])}</span>
              </div>
            );
          }

          // Regular paragraph
          if (!trimmed) {
            return <div key={idx} className="h-1" />;
          }

          return <p key={idx}>{formatTextWithRecordLinks(line)}</p>;
        })}
      </div>
    );
  };

  const formatTextWithRecordLinks = (text: string) => {
    // Look for patterns like SG-001 or HH-01 or girl names
    const parts = text.split(/(\bSG-\d{3}\b|\bHH-\d{2}\b)/g);
    if (parts.length === 1) {
      return renderBoldText(text);
    }

    return (
      <>
        {parts.map((part, pIdx) => {
          if (part.startsWith('SG-')) {
            const girl = db.girls.find((g) => g.id === part);
            return (
              <button
                key={pIdx}
                type="button"
                onClick={() => onNavigateToGirl && onNavigateToGirl(part)}
                className="inline-flex items-center gap-1 font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-1.5 py-0.5 mx-0.5 text-xs transition-colors cursor-pointer"
                title={`Open profile for ${girl ? girl.fullName : part}`}
              >
                <span>{part}</span>
                {girl && <span className="text-stone-500 font-normal">({girl.fullName})</span>}
                <ExternalLink className="w-3 h-3 text-teal-600" />
              </button>
            );
          }
          if (part.startsWith('HH-')) {
            const house = db.households.find((h) => h.id === part);
            return (
              <button
                key={pIdx}
                type="button"
                onClick={() => onNavigateToHouse && onNavigateToHouse(part)}
                className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 mx-0.5 text-xs transition-colors cursor-pointer"
                title={`Open household profile for ${house ? house.name : part}`}
              >
                <span>{part}</span>
                {house && <span className="text-stone-500 font-normal">({house.name})</span>}
                <ExternalLink className="w-3 h-3 text-amber-700" />
              </button>
            );
          }
          return renderBoldText(part);
        })}
      </>
    );
  };

  const renderBoldText = (str: string) => {
    const boldParts = str.split(/(\*\*.*?\*\*)/g);
    return (
      <>
        {boldParts.map((bp, bIdx) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return (
              <strong key={bIdx} className="font-semibold text-stone-900">
                {bp.slice(2, -2)}
              </strong>
            );
          }
          return bp;
        })}
      </>
    );
  };

  return (
    <div id="shine-ai-assistant-container" className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-120px)] bg-stone-100">
      {/* Top Header */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 shrink-0 shadow-xs">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-900 flex items-center justify-center text-amber-400 shadow-sm shrink-0">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-teal-950">SHINE AI Assistant</h1>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-900 px-2 py-0.5 rounded-full border border-teal-200">
                  Read-Only Support
                </span>
                <span className="text-[10px] font-semibold bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md border border-stone-200">
                  {role} Access
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Confidential Case Analysis • Grounded exclusively in verified SHINE records
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="text-xs text-stone-600 hover:text-red-700 hover:bg-stone-100 px-2.5 py-1.5 rounded-lg border border-stone-200 flex items-center gap-1.5 transition-colors"
                title="Clear current conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Chat</span>
              </button>
            )}
          </div>
        </div>

        {/* Context Selector Bar (Allows staff to lock context onto a specific girl or house) */}
        <div className="max-w-5xl mx-auto mt-3 pt-2.5 border-t border-stone-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-stone-600 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
            Query Focus:
          </span>

          {/* Girl Selector */}
          <div className="flex items-center gap-1">
            <select
              value={selectedGirlId}
              onChange={(e) => setSelectedGirlId(e.target.value)}
              className="bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 text-xs text-stone-800 focus:outline-teal-800"
            >
              <option value="">All SHINE Girls</option>
              {db.girls.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.fullName} ({g.id}) - {g.school}
                </option>
              ))}
            </select>
            {selectedGirlId && (
              <button
                type="button"
                onClick={() => setSelectedGirlId('')}
                className="text-stone-400 hover:text-stone-700 text-xs px-1"
                title="Clear girl focus"
              >
                ✕
              </button>
            )}
          </div>

          {/* Household Selector */}
          <div className="flex items-center gap-1">
            <select
              value={selectedHouseId}
              onChange={(e) => setSelectedHouseId(e.target.value)}
              className="bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 text-xs text-stone-800 focus:outline-teal-800"
            >
              <option value="">All Households</option>
              {db.households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.id})
                </option>
              ))}
            </select>
            {selectedHouseId && (
              <button
                type="button"
                onClick={() => setSelectedHouseId('')}
                className="text-stone-400 hover:text-stone-700 text-xs px-1"
                title="Clear household focus"
              >
                ✕
              </button>
            )}
          </div>

          {activeGirl && (
            <span className="bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full text-[11px] font-medium">
              Focus: {activeGirl.fullName} ({activeGirl.id})
            </span>
          )}
          {activeHouse && (
            <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-medium">
              Focus: {activeHouse.name}
            </span>
          )}
        </div>
      </div>

      {/* Main Chat Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-5xl w-full mx-auto">
        {messages.length === 0 ? (
          <div className="shine-card bg-white border border-stone-200 p-6 max-w-5xl mx-auto my-4 text-center">
            <div className="w-14 h-14 bg-teal-50 border border-teal-200 rounded-2xl flex items-center justify-center text-teal-800 mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-stone-900 mb-1">Welcome to SHINE AI Assistant</h2>
            <p className="text-xs text-stone-600 max-w-md mx-auto mb-6">
              Ask natural-language questions or tap a suggested topic below to analyze girl histories, follow-ups,
              school attendance, clinic visits, rent, and monthly expenditures.
            </p>

            <div className="text-left mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2 px-1">
                Suggested Questions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_QUESTIONS.map((q, idx) => {
                  const Icon = q.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        let finalQuery = q.text;
                        if (q.needsGirl && activeGirl) {
                          finalQuery = `Summarize case history for ${activeGirl.fullName} (${activeGirl.id}).`;
                        } else if (q.needsGirl && db.girls.length > 0) {
                          const firstGirl = db.girls[0];
                          setSelectedGirlId(firstGirl.id);
                          finalQuery = `Summarize case history for ${firstGirl.fullName} (${firstGirl.id}).`;
                        }
                        handleSubmit(finalQuery);
                      }}
                      className="text-left text-xs bg-stone-50 hover:bg-teal-50 hover:border-teal-300 border border-stone-200 rounded-xl p-3 flex items-start gap-2.5 transition-all text-stone-800 hover:text-teal-950 group"
                    >
                      <Icon className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 group-hover:text-teal-900" />
                      <span className="font-medium">{q.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 border-t border-stone-200 pt-5">
              {renderComposer()}
            </div>

            <div className="bg-stone-50 rounded-xl border border-stone-200 p-3 text-[11px] text-stone-500 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                <strong>Confidential &amp; Read-Only:</strong> Queries analyze only your authorized SHINE records. No records are altered.
              </span>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-teal-900 text-amber-400 flex items-center justify-center shrink-0 mt-1 shadow-xs">
                    <Bot className="w-5 h-5" />
                  </div>
                )}

                <div
                  className={`shine-card max-w-3xl px-4 py-3 ${
                    isUser
                      ? 'bg-teal-900 text-white rounded-tr-xs'
                      : msg.isUnavailable
                      ? 'bg-amber-50 border border-amber-300 text-amber-950 rounded-tl-xs'
                      : 'bg-white border border-stone-200 text-stone-900 rounded-tl-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1 text-[11px] opacity-80">
                    <span className="font-bold">
                      {isUser ? staffProfile?.fullName || 'You' : 'SHINE AI Assistant • AI-Generated'}
                    </span>
                    <span className="text-[10px]">{msg.timestamp}</span>
                  </div>

                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : msg.isUnavailable ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-amber-900">
                        <AlertCircle className="w-4 h-4 text-amber-700" />
                        <span>Service Notice</span>
                      </div>
                      <p className="text-xs leading-relaxed">{msg.content}</p>
                      <button
                        type="button"
                        onClick={() => handleSubmit(messages[messages.length - 2]?.content)}
                        className="inline-flex items-center gap-1.5 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer mt-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Question</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      {renderFormattedContent(msg.content)}

                      {/* Tool references and accessed records */}
                      {(msg.toolsUsed && msg.toolsUsed.length > 0) ||
                      (msg.accessedRecordIds && msg.accessedRecordIds.length > 0) ? (
                        <div className="mt-3 pt-2 border-t border-stone-100 flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500">
                          <span className="font-semibold text-stone-600">Verified from records:</span>
                          {msg.accessedRecordIds?.slice(0, 6).map((recId) => (
                            <span
                              key={recId}
                              className="bg-stone-100 border border-stone-200 text-stone-700 px-1.5 py-0.5 rounded font-mono font-medium"
                            >
                              {recId}
                            </span>
                          ))}
                          {msg.accessedRecordIds && msg.accessedRecordIds.length > 6 && (
                            <span className="text-stone-400">+{msg.accessedRecordIds.length - 6} more</span>
                          )}
                        </div>
                      ) : null}

                      {/* Message Actions */}
                      <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
                        <span className="text-[10px] italic">
                          Verify important figures against original documents.
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="hover:text-stone-700 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded hover:bg-stone-50 transition-colors"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700 font-semibold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => speakResponse(msg.content)} title="Read response aloud" className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] hover:bg-stone-50 hover:text-stone-700"><Volume2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Replay</span></button>
                          <button type="button" onClick={stopSpeaking} title="Stop speaking" className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] hover:bg-stone-50 hover:text-stone-700"><StopCircle className="h-3.5 w-3.5" /><span className="hidden sm:inline">Stop</span></button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-lg bg-stone-300 text-stone-700 flex items-center justify-center shrink-0 mt-1 font-bold text-xs">
                    {(staffProfile?.fullName || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-teal-900 text-amber-400 flex items-center justify-center shrink-0 mt-1 shadow-xs animate-pulse">
              <Bot className="w-5 h-5" />
            </div>
            <div className="shine-card bg-white border rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-teal-900 font-medium">
                <RefreshCw className="w-4 h-4 animate-spin text-teal-700" />
                <span>Analyzing SHINE records with controlled tools...</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1">
                Checking educational logs, clinic records, rent ledgers, and expenditures.
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Chips Bar (When messages exist, staff can still quickly click suggestions) */}
      {messages.length > 0 && (
        <div className="bg-white border-t border-stone-200 px-4 py-2 shrink-0 overflow-x-auto">
          <div className="max-w-5xl mx-auto flex items-center gap-2 text-xs">
            <span className="text-stone-400 font-semibold shrink-0">Quick questions:</span>
            {SUGGESTED_QUESTIONS.slice(0, 5).map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  let text = q.text;
                  if (q.needsGirl && activeGirl) {
                    text = `Summarize case history for ${activeGirl.fullName} (${activeGirl.id}).`;
                  }
                  handleSubmit(text);
                }}
                disabled={loading}
                className="bg-stone-50 hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300 border border-stone-200 rounded-full px-3 py-1 text-stone-700 whitespace-nowrap transition-colors shrink-0 disabled:opacity-50"
              >
                {q.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keep the chat composer directly beneath quick questions. */}
      {messages.length > 0 && (
        <div className="shrink-0 border-t border-stone-200 bg-white p-4">
          <div className="mx-auto max-w-5xl">
            {renderComposer()}
          </div>
        </div>
      )}
    </div>
  );
};
