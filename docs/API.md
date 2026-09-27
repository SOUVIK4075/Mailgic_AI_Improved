# Mailgic-AI API (v2)

Base path: `/api`. All request/response bodies are JSON unless noted.
Auth uses **httpOnly cookies** (`access_token`, `refresh_token`) — the client never touches tokens,
it only sends `credentials: 'include'` (same-origin via the Vite dev proxy / Express static in prod).

## Error format (every non-2xx response)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": [{ "path": "prompt", "message": "Too short" }], "requestId": "..." } }
```

| Status | code examples |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_ID` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN` |
| 413 | `FILE_TOO_LARGE` |
| 415 | `UNSUPPORTED_FILE_TYPE` |
| 429 | `RATE_LIMITED`, `DAILY_QUOTA_EXCEEDED` |
| 502 | `AI_UPSTREAM_ERROR`, `AI_INVALID_RESPONSE` |
| 500 | `INTERNAL_ERROR` |

Client rule: on `401` with code `TOKEN_EXPIRED`, call `POST /api/auth/refresh` once, then retry the original request. If refresh fails → treat as logged out.

## Types

```ts
type User = { id: string; email: string; name: string; role: 'user' | 'admin'; createdAt: string };

type EmailType = { id: string; label: string; description: string };
type Tone = { id: string; label: string; description: string };

type Source = { documentId: string; title: string; chunkIndex: number; score: number; excerpt: string };

type ReplyAnalysis = {
  senderName: string | null;
  summary: string;
  intent: string;
  questions: string[];          // questions the sender asked that the reply must answer
  requestedActions: string[];
  deadlines: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
};

type Email = {
  id: string;
  mode: 'compose' | 'reply';
  type: string | null;          // compose only
  tone: string;
  prompt: string;               // compose: user's description; reply: extra instructions ('' if none)
  incomingEmail: string | null; // reply only
  analysis: ReplyAnalysis | null; // reply only
  subject: string;
  body: string;
  placeholders: string[];       // e.g. ["[Client Name]"] — facts the user must fill in
  sources: Source[];            // knowledge-base chunks used (empty if none)
  wordCount: number;
  recipient: string | null;     // set once the user finalises it (comma-separated addresses)
  finalizedAt: string | null;
  createdAt: string;
};

type KnowledgeDocument = {
  id: string;
  title: string;
  sourceType: 'pdf' | 'text';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  chunkCount: number;
  error: string | null;
  createdAt: string;
};
```

## Meta

`GET /api/meta` (public) → `{ emailTypes: EmailType[], tones: Tone[], limits: { promptMinChars, promptMaxChars, incomingEmailMaxChars, instructionsMaxChars, knowledgeTextMaxChars, minWords, maxWords, maxUploadMb } }` (all numbers)
Single source of truth for dropdowns — the client must not hardcode type/tone lists.

`GET /api/health` (public) → `{ status: 'ok', db: 'up' | 'down' }`

## Auth

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, password }` (password ≥ 8 chars) | `201 { user }` + sets cookies (user is logged in) |
| POST | `/api/auth/login` | `{ email, password }` | `200 { user }` + sets cookies |
| POST | `/api/auth/refresh` | – (uses refresh cookie) | `200 { user }` + rotates cookies |
| POST | `/api/auth/logout` | – | `204` + clears cookies |
| GET | `/api/auth/me` | – | `200 { user }` |
| POST | `/api/auth/forgot-password` | `{ email }` | `200 { message }` (always, no enumeration) |
| POST | `/api/auth/reset-password` | `{ token, password }` | `200 { message }` — all sessions revoked; user must log in again |

Reset link format emailed to the user: `${APP_URL}/reset-password?token=<token>`.

## Emails (auth required)

`POST /api/emails/compose`
```json
{ "type": "business", "tone": "professional", "prompt": "…", "length": { "option": "flexible" } , "useKnowledge": true }
```
`length` is `{ "option": "flexible" }` or `{ "option": "custom", "words": 200 }`. → `201 { email: Email, usage: { remainingToday: number } }`

`POST /api/emails/reply`
```json
{ "incomingEmail": "…pasted email…", "tone": "professional", "instructions": "decline politely", "useKnowledge": true }
```
`instructions` optional. → `201 { email: Email, usage: { remainingToday: number } }` (email.analysis is filled)

`GET /api/emails?limit=20&cursor=<id>&mode=compose|reply&type=<typeId>`
→ `200 { items: Email[], nextCursor: string | null }` — newest first; pass `nextCursor` back as `cursor` for the next page.

`GET /api/emails/:id` → `200 { email }`
`PATCH /api/emails/:id` — save the user's final version before handing it to Gmail.
Body: any of `{ subject, body, recipient }` (recipient = comma-separated emails). → `200 { email }`
`DELETE /api/emails/:id` → `204`
`DELETE /api/emails` → `200 { deletedCount }` (clear all history)

## Knowledge base (auth required)

`POST /api/knowledge` — **multipart/form-data** with field `file` (`.pdf`, `.txt`, `.md`, max 5 MB) and optional field `title`;
**or** JSON `{ "title": "Refund policy", "text": "…" }`.
→ `202 { document: KnowledgeDocument }` with `status: 'pending'`. Processing (chunk + embed) happens in the background;
the client should poll `GET /api/knowledge` every ~3 s while any document is `pending`/`processing`.

`GET /api/knowledge` → `200 { items: KnowledgeDocument[] }`
`DELETE /api/knowledge/:id` → `204` (also deletes its chunks)

## Usage

`GET /api/usage` → `200 { today: { requests: number, promptTokens: number, completionTokens: number }, dailyLimit: number }`

## Admin (role = admin)

`GET /api/admin/stats` → `200 { users: number, emails: number, documents: number, last7Days: { date: string, requests: number, tokens: number }[] }`

---

## Idempotency (AI endpoints)

`POST /api/emails/compose`, `/reply`, `/compose/stream`, `/reply/stream` accept an optional header
`Idempotency-Key: <8–100 chars of A-Z a-z 0-9 _ ->` (the client sends a fresh `crypto.randomUUID()` per "Write" click).

| Situation | Result |
|---|---|
| New key | Request runs normally; the successful result is stored for 24 h |
| Same key + same body, first request finished | Stored result is replayed — no AI call, no quota used. JSON endpoints: same `201` body + header `Idempotent-Replayed: true`. Stream endpoints: a single `done` event |
| Same key while the first request is still running | `409 REQUEST_IN_PROGRESS` |
| Same key, different body | `422 IDEMPOTENCY_KEY_REUSED` |
| First request failed or was cancelled | Nothing stored — the same key can be retried |

## Streaming drafts (Server-Sent Events)

`POST /api/emails/compose/stream` — same body as `/compose`
`POST /api/emails/reply/stream` — same body as `/reply`

- Problems found **before** writing starts (auth, validation, quota, idempotency) come back as normal JSON errors with the usual status codes.
- Otherwise the response is `200` with `Content-Type: text/event-stream`. Each event is `event: <name>\ndata: <json>\n\n`:

| event | data | when |
|---|---|---|
| `analysis` | `{ analysis: ReplyAnalysis }` | reply only, once, before the draft starts |
| `draft` | `{ subject: string, body: string }` | many times — the **full text so far** (not a delta) |
| `done` | `{ email: Email, usage: { remainingToday } }` | once, at the end; the email is saved |
| `error` | `{ code, message }` | if generation fails midway; the stream then ends |

- **Cancel:** the client aborts the fetch (`AbortController`). The server stops the AI call, saves nothing and refunds the quota slot.
- `401 TOKEN_EXPIRED` is returned as JSON before streaming starts, so the normal refresh-and-retry rule applies.

## Search history

`GET /api/emails/search?q=<2–200 chars>&limit=20`
→ `200 { items: (Email & { matchedBy: ('keyword' | 'meaning')[] })[] }`, best match first.
Keyword = MongoDB text index on subject/body/prompt. Meaning = vector search on email embeddings
(emails are indexed in the background a few seconds after they're created or edited). Results are merged with Reciprocal Rank Fusion.

## Follow-up reminders

```ts
type Reminder = {
  id: string;
  emailId: string;
  emailSubject: string;
  recipient: string | null;
  note: string;
  dueAt: string;          // ISO
  status: 'scheduled' | 'sent' | 'cancelled' | 'failed';
  sentAt: string | null;
  createdAt: string;
};
```

`POST /api/reminders` `{ emailId, dueAt, note? }` — `dueAt` is an ISO date between 5 minutes and 90 days from now; `note` ≤ 200 chars.
→ `201 { reminder }`. `409 REMINDER_EXISTS` if that email already has a scheduled reminder. `404` if the email isn't yours.

`GET /api/reminders` → `200 { upcoming: Reminder[] /* scheduled, soonest first */, past: Reminder[] /* last 20 sent/cancelled/failed */ }`

`DELETE /api/reminders/:id` → `204` (cancels it). `409 REMINDER_NOT_SCHEDULED` if it was already sent/cancelled.

When a reminder is due, the server emails the user ("Follow up with rahul@acme.dev about …"). Without `SMTP_URL` it's printed to the server log.

## Insights

`GET /api/insights?days=7|30|90&tz=Asia/Kolkata` (`days` default 30, `tz` any IANA zone, default `UTC`)

```ts
type Insights = {
  range: { days: number; from: string; to: string };           // ISO
  totals: {
    emails: number; composed: number; replies: number;
    sentViaGmail: number;        // emails with a recipient saved
    avgWords: number;
    withPlaceholders: number;    // AI left at least one [blank]
    usedKnowledge: number;       // at least one source used
  };
  perDay: { date: string /* YYYY-MM-DD in tz */; count: number }[];   // every day in range, zeros included
  byType: { type: string; label: string; count: number }[];           // compose emails only, most first
  byTone: { tone: string; label: string; count: number }[];
  topRecipients: { address: string; count: number }[];                // max 5
  ai: { promptTokens: number; completionTokens: number; avgLatencyMs: number };
  reminders: { scheduled: number; sent: number };
};
```
