// Types copied from docs/API.md — keep the two in sync.

export type User = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
};

export type EmailType = { id: string; label: string; description: string };
export type Tone = { id: string; label: string; description: string };

export type Source = {
  documentId: string;
  title: string;
  chunkIndex: number;
  score: number;
  excerpt: string;
};

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'urgent';

export type ReplyAnalysis = {
  senderName: string | null;
  summary: string;
  intent: string;
  questions: string[];
  requestedActions: string[];
  deadlines: string[];
  sentiment: Sentiment;
};

export type EmailMode = 'compose' | 'reply';

export type Email = {
  id: string;
  mode: EmailMode;
  type: string | null;
  tone: string;
  prompt: string;
  incomingEmail: string | null;
  analysis: ReplyAnalysis | null;
  subject: string;
  body: string;
  placeholders: string[];
  sources: Source[];
  wordCount: number;
  recipient: string | null;
  finalizedAt: string | null;
  createdAt: string;
};

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type KnowledgeDocument = {
  id: string;
  title: string;
  sourceType: 'pdf' | 'text';
  status: DocumentStatus;
  chunkCount: number;
  error: string | null;
  createdAt: string;
};

// ---- Meta ----

export type Limits = {
  promptMaxChars: number;
  incomingEmailMaxChars: number;
  minWords: number;
  maxWords: number;
  maxUploadMb: number;
  promptMinChars: number;
  instructionsMaxChars: number;
  knowledgeTextMaxChars: number;
};

export type Meta = {
  emailTypes: EmailType[];
  tones: Tone[];
  limits: Limits;
};

// ---- Request bodies ----

export type LengthOption = { option: 'flexible' } | { option: 'custom'; words: number };

export type ComposeRequest = {
  type: string;
  tone: string;
  prompt: string;
  length: LengthOption;
  useKnowledge: boolean;
};

export type ReplyRequest = {
  incomingEmail: string;
  tone: string;
  instructions?: string;
  useKnowledge: boolean;
};

// ---- Response bodies ----

export type UserResponse = { user: User };
export type MessageResponse = { message: string };

export type GenerateResponse = {
  email: Email;
  usage: { remainingToday: number };
};

export type EmailListResponse = { items: Email[]; nextCursor: string | null };
export type ClearHistoryResponse = { deletedCount: number };

export type KnowledgeListResponse = { items: KnowledgeDocument[] };
export type KnowledgeUploadResponse = { document: KnowledgeDocument };

export type UsageResponse = {
  today: { requests: number; promptTokens: number; completionTokens: number };
  dailyLimit: number;
};

// ---- Streaming drafts (Server-Sent Events) ----

/** `draft` event: the full subject/body written so far (not just the new part). */
export type DraftPreview = { subject: string; body: string };
export type AnalysisEvent = { analysis: ReplyAnalysis };
export type DoneEvent = GenerateResponse;
export type StreamErrorEvent = { code: string; message: string };

// ---- Search ----

export type MatchedBy = 'keyword' | 'meaning';
export type SearchResult = Email & { matchedBy: MatchedBy[] };
export type SearchResponse = { items: SearchResult[] };

// ---- Follow-up reminders ----

export type ReminderStatus = 'scheduled' | 'sent' | 'cancelled' | 'failed';

export type Reminder = {
  id: string;
  emailId: string;
  emailSubject: string;
  recipient: string | null;
  note: string;
  dueAt: string;
  status: ReminderStatus;
  sentAt: string | null;
  createdAt: string;
};

export type ReminderResponse = { reminder: Reminder };
export type ReminderListResponse = { upcoming: Reminder[]; past: Reminder[] };

// ---- Insights ----

export type InsightsDays = 7 | 30 | 90;

export type Insights = {
  range: { days: number; from: string; to: string };
  totals: {
    emails: number;
    composed: number;
    replies: number;
    sentViaGmail: number;
    avgWords: number;
    withPlaceholders: number;
    usedKnowledge: number;
  };
  perDay: { date: string; count: number }[]; // date is YYYY-MM-DD in the requested time zone
  byType: { type: string; label: string; count: number }[];
  byTone: { tone: string; label: string; count: number }[];
  topRecipients: { address: string; count: number }[];
  ai: { promptTokens: number; completionTokens: number; avgLatencyMs: number };
  reminders: { scheduled: number; sent: number };
};

// ---- Errors ----

export type ErrorDetail = { path: string; message: string };

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
    requestId?: string;
  };
};
