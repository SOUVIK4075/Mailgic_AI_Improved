# Architecture & design decisions

This document explains **what** each part does and **why it exists**. Anything that didn't solve a real problem in this project was left out on purpose. That list is at the end.

---

## 1. The big picture

```
Browser (React SPA)
   │  fetch('/api/...', { credentials: 'include' })     ← same origin: Vite proxy (dev) / Express static (prod)
   ▼
Express API ─ helmet → pino-http (request id) → json/cookies → router → requireAuth → rate limit → controller → service → model
   │                                                                                                       │
   │                                                                                     central errorHandler (one JSON error shape)
   ├── MongoDB: users · sessions · emails · usage · knowledgedocuments · chunks (+ vector index)
   ├── OpenAI: chat completions (structured JSON) + embeddings
   └── Ingestion worker (setTimeout loop in the same process; MongoDB is the queue)
```

**Layering:** `routes` (URL + middleware) → `controller` (parse and validate the HTTP input, shape the response) → `service` (business logic, no `req`/`res`) → `model`. Services know nothing about HTTP, so they are easy to test and reuse. The worker, for example, calls the same `recordTokens` the API uses.

---

## 2. Authentication & authorization

| Decision | Why |
|---|---|
| **Access token:** JWT with a 15-minute lifetime, in an `httpOnly` cookie | Stateless: verifying it needs no DB lookup. `httpOnly` means XSS can't steal it with JavaScript. |
| **Refresh token:** a random opaque string, lasts 7 days, and only its **SHA-256 hash** is stored in `sessions` | It can be revoked (logout, password reset). A DB leak doesn't expose usable tokens. |
| **Refresh-token rotation:** each refresh token works once | A stolen refresh token stops working once it's used. The rotation is an atomic `findOneAndUpdate({ revokedAt: null })`, so two parallel refreshes can't both succeed. |
| Refresh cookie `path=/api/auth` | It isn't sent with every API call, only to the refresh and logout endpoints. |
| `sameSite=lax` cookies + JSON API | The browser won't attach cookies to cross-site POSTs, which is the CSRF protection. |
| Server returns `TOKEN_EXPIRED` vs `UNAUTHENTICATED` | Tells the client exactly when to call `/auth/refresh` and retry. Concurrent requests share one refresh call (`client/src/lib/api.ts`). |
| Sessions have a **TTL index** on `expiresAt` | MongoDB deletes expired sessions by itself, with no cron job. |
| bcrypt (cost 12) + a dummy hash when the email doesn't exist | Login takes the same time either way, so response time can't reveal which emails are registered. |
| Forgot-password always returns 200 | No account enumeration. The reset token is single-use, hashed in the DB, expires in 30 minutes, and resetting revokes every session. |
| Duplicate signup → **409 from the unique index** | "findOne then create" has a race condition. The database constraint doesn't. |

**Authorization** has two kinds:
1. **Ownership:** every query includes `userId` (`findOne({ _id, userId })`). Another user's email returns **404, not 403**, so the API doesn't reveal that it exists. Tested in `emails.test.ts` and `knowledge.test.ts`.
2. **Roles (RBAC):** the `requireRole('admin')` middleware protects `/api/admin/stats`.

---

## 3. API design, validation & errors

- **REST resources:** `/emails`, `/knowledge`, `/auth`, `/usage`. Status codes carry meaning: 201 created, 202 accepted for async processing, 204 no content, 409 conflict, 413 too large, 415 unsupported type, 429 rate limited or over quota, 502 upstream AI failure.
- **Zod on every input** (body, query, params). One schema gives both runtime validation and the TypeScript type. Enums for type/tone come from `config/constants.ts`, which the client also reads through `/api/meta`, so the UI and the validation can't drift apart. In the old version, three different lists had drifted.
- **One error shape:** `{ error: { code, message, details?, requestId } }`. Services `throw new AppError(...)`. Express 5 forwards async errors automatically, and `errorHandler` maps Zod, Mongoose, Multer and OpenAI errors to proper status codes. Unknown errors become a generic 500. Details are logged and never sent to the client.
- **`requestId`** appears in every log line and every error response, so a user's bug report can be traced to the exact logs.
- **Env validation at startup** (`config/env.ts`): a missing secret crashes the process immediately with a clear message, not hours later.

---

## 4. Database design & indexing

| Collection | Key indexes | Why |
|---|---|---|
| `users` | `email` unique | login lookup + duplicate protection |
| `sessions` | `tokenHash` unique, `expiresAt` TTL | refresh lookup, automatic cleanup |
| `emails` | `{ userId, _id: -1 }`, `{ userId, mode, type, _id: -1 }` | history is always "this user's emails, newest first, optionally filtered". Equality fields come first, then the sort field (the ESR rule), so the query is an index seek with no in-memory sort |
| `emails` (search) | text index on subject (weight 3), body, prompt · vector index on `embedding` · `{ embeddedAt }` · `{ userId, createdAt }` | keyword search, meaning search, "not indexed yet" for the job, insights date range |
| `usage` | `{ userId, date }` unique | one counter document per user per day, atomic `$inc` |
| `reminders` | `{ status, dueAt }` · `{ userId, dueAt }` · **partial unique** `{ emailId }` where `status = 'scheduled'` | the job's "due now" query; the user's list; at most one upcoming reminder per email, enforced by the database |
| `idempotencykeys` | `{ userId, key }` unique · TTL on `expiresAt` | the insert *is* the lock; MongoDB deletes keys after 24 h |
| `knowledgedocuments` | `{ userId, createdAt }`, `{ status, createdAt }` | the user's list, and the worker's "oldest pending first" |
| `chunks` | `documentId`, **vector index** on `embedding` with a `userId` filter field | cascading delete + semantic search restricted to one user |

**Cursor pagination** (`GET /emails?cursor=<lastId>`): `find({ userId, _id: { $lt: cursor } }).sort({ _id: -1 }).limit(n + 1)`. Compared with `skip/offset`, it stays fast on deep pages (an index seek, not scanning and discarding rows) and doesn't show duplicates when new emails arrive while the user scrolls. Fetching `n + 1` rows tells us whether there's a next page without a `count()` query.

**Denormalisation:** `chunks.documentTitle` is copied from the document, so search results need no `$lookup`. Titles never change, so this costs nothing.

---

## 5. The AI layer

### 5.1 Structured output (`modules/ai/llm.ts`)
Each AI call has a **Zod schema**. It's converted with `z.toJSONSchema()` and sent as `response_format: json_schema, strict: true`, which forces the model to return that exact shape. The reply is **validated again with Zod**, because an LLM is still external input. If it's invalid or cut off (`finish_reason: 'length'`), the call is **retried once**, then fails with a clean 502. The SDK also retries 429/5xx responses with backoff, and a 30-second timeout stops a hung request from holding a connection open. If the model is still unavailable after that (overloaded or rate-limited), the request is sent once to `OPENAI_FALLBACK_MODEL`, a different model. On Gemini's free tier this happens often, and the user still gets an email instead of an error.

Why it matters: the backend gets `{ subject, body, placeholders }` it can store and check, instead of parsing free text.

### 5.2 Reducing hallucination (`modules/ai/prompts.ts`)
1. **Grounding rule:** use only facts from the user's request, the incoming email or the retrieved knowledge.
2. **Placeholders instead of guesses:** a missing detail becomes `[Meeting Date]` and is listed in `placeholders`. The UI shows these as "fill these in before sending".
3. **Only retrieve what's relevant:** chunks with a similarity score below `0.7` are dropped. Unrelated context makes the model *more* likely to invent a connection.
4. **Showing sources:** every email stores which chunks were used (`sources`), so the user can check where a claim came from.
5. **Prompt-injection defence:** uploaded documents and pasted emails go inside `<knowledge>` / `<incoming_email>` tags, and the system prompt says content inside them is data, not instructions.
6. **Low temperature for extraction** (`0`) and a normal one for writing (`0.7`).

### 5.3 Reply mode: two focused calls instead of one big one
1. A **cheap, fast model** extracts JSON (`questions`, `requestedActions`, `deadlines`, `sentiment`). This is a simple task.
2. The knowledge base is searched with *summary + questions*, which is a cleaner query than raw email text with signatures and greetings.
3. The **main model** writes the reply with an explicit checklist: "answer every question listed".

This is easier to debug because you can see the analysis. It's cheaper because the extraction runs on the small model, and the reply is more complete because no question gets missed.

### 5.4 RAG, and why it's genuinely useful here
Problem: "Write a job application for this role" → the model invents skills. "Reply to this customer about refunds" → the model invents a refund policy.
Solution: the user uploads the *real* resume or policy, and the relevant passages are retrieved and given to the model as the only source of facts.

**Ingestion:** upload → extract text (`unpdf` for PDFs) → save the document as `pending` → **202 Accepted**. The worker then chunks the text (about 1000 characters with 150 characters of overlap, cut at paragraph/sentence/word boundaries), embeds it in **batches of 64** (one API call instead of 64), and saves the chunks.

**Retrieval:** embed the query → `$vectorSearch` (cosine similarity, `numCandidates = 25 × k`, `filter: { userId }`) → keep the top 4 above the score threshold.

**Why MongoDB Atlas Vector Search and not Pinecone?** The vectors sit next to the rest of the data: no second database, no syncing, and filtering by `userId` happens in the same query. At this scale (thousands of chunks per user), a separate vector DB adds cost and moving parts without any benefit.

**Graceful degradation:** if vector search fails, or the user has no documents, the email is still written without context. If the user has no ready documents, the embedding call is skipped entirely, which saves cost and latency.

### 5.5 Cost & latency awareness
- **Per-user daily quota** (`DAILY_AI_REQUEST_LIMIT`) enforced **atomically**. The upsert only matches while `requests < limit`. At the limit, the unique index rejects the insert, which becomes `DAILY_QUOTA_EXCEEDED`. Two parallel requests can't both take the last slot. **If the AI call fails, the slot is refunded.**
- **Burst rate limit** on AI endpoints (10/min per user) and auth endpoints (20 per 15 minutes per IP).
- **Every email stores `ai.promptTokens`, `completionTokens`, `latencyMs` and `model`,** and daily totals are in `usage`. That's enough to answer "what does one email cost?" and to spot slow requests.
- **Choosing models:** a cheap model for extraction and a configurable main model. Models are env variables, so switching is a config change.
- **Not locked to one provider:** the code talks to the OpenAI-compatible Chat Completions API, so pointing `OPENAI_BASE_URL` at Google Gemini (free tier for development) or back to OpenAI is a config change, not a code change.
- `max_completion_tokens` is set from the requested word count, so a "100-word" email can't produce 4000 tokens.
- Batched embeddings, and the embedding step is skipped when there's nothing to search.

---

## 6. Background jobs: why MongoDB and not Redis/BullMQ

Three kinds of background work, all in **one worker loop** (`src/jobs/worker.ts`) inside the API process:

| Job | Picks up | Does |
|---|---|---|
| `document-ingestion` | knowledge docs with `status: 'pending'` | chunk → embed (batched) → save chunks |
| `reminders` | reminders with `status: 'scheduled'` and `dueAt <= now` | email the user "follow up with …" |
| `email-search-index` | emails with `embeddedAt: null` (new, edited, or old ones → **automatic backfill**) | embed 20 at a time for meaning search |

Every job follows the same rules:
- **Claim atomically:** `findOneAndUpdate({ status: 'pending' }, { status: 'processing', lockedAt: now, $inc: { attempts: 1 } })`. Even with several server instances, an item is processed only once.
- **Retries with a limit:** 3 attempts, then `failed` with a message the user can read. Reminders retry *later* (5 min, then 10 min) by moving `dueAt`.
- **Crash recovery:** items stuck in `processing`/`sending` for more than 5 minutes are put back.
- **Idempotent work:** old chunks are deleted before new ones are inserted; the email indexer only writes if `updatedAt` hasn't changed (the user didn't edit it meanwhile).
- **Delivery guarantee:** reminders are **at-least-once**. If the server dies after the email went out but before it was marked sent, it's sent again. A duplicate reminder is better than a lost one.

The loop uses `setTimeout`, not `setInterval`, so two runs never overlap. If a tick did work it runs again immediately (drain the queue), otherwise it waits 3 s. A job that throws (e.g. the AI provider is down) is **paused for a minute** instead of being retried every 3 s. It stops cleanly on `SIGTERM`.

**"Delayed jobs" don't need a queue product.** A reminder is just a document with a `dueAt` date plus an index on `{ status, dueAt }`.

**When to add Redis + BullMQ:** throughput of hundreds of jobs per second, jobs that must run on separate worker machines, or needing priorities and rate-limited queues across many instances. None of these are true here, and polling one indexed query every 3 s costs almost nothing.

---

## 7. Production practices

- **Security headers** with `helmet`, a 100 KB JSON body limit, a 5 MB upload limit with a file-type allowlist, `trust proxy` for correct client IPs behind a load balancer.
- **Structured logs** with pino (JSON in production, pretty in development). Cookies and auth headers are redacted, and the MongoDB URI is never logged.
- **Health check** at `/api/health` (returns 503 when the DB is down), for the load balancer or uptime monitor.
- **Graceful shutdown:** stop the worker → `server.close()` finishes in-flight requests → disconnect the DB. It force-exits after 10 seconds.
- **One deployable:** Express serves the built React app, so everything is same-origin: no CORS, and cookies just work.
- **Tests:** Vitest + Supertest + an in-memory MongoDB, with the LLM and embeddings mocked (fast, free, deterministic), plus an opt-in integration test against real Atlas Vector Search.
- **CI:** GitHub Actions runs type-check and tests on the server and a build of the client.
- **Docker:** multi-stage build (the image contains only the production dependencies and compiled JS, and runs as the non-root `node` user). `docker-compose` gives a local DB with Vector Search.

---

## 8. Deliberately NOT used

| Not used | Reason |
|---|---|
| Microservices | One team, one domain, low traffic. A modular monolith (`modules/*`) gives the same separation without network calls between services. |
| Kafka / RabbitMQ | One kind of background job at low volume. The MongoDB-backed queue is enough (§6). |
| Kubernetes | A single container on a PaaS is enough. K8s would be all operations work with no benefit. |
| Redis | Rate limiting is in-memory (fine for one instance) and quotas live in MongoDB. Redis becomes worthwhile when there are several instances or BullMQ is needed. |
| Pinecone / Weaviate | Atlas Vector Search already lives in our database (§5.4). |
| LangChain / LlamaIndex | Our RAG is about 80 lines (chunk → embed → `$vectorSearch` → prompt). A framework would hide exactly the parts worth understanding. |
| AI agents / tool calling | Writing an email is a fixed pipeline, not an open-ended task. An agent loop would add latency, cost and unpredictability. |
| Caching LLM responses | Every generation is meant to be different, so cache hits would be about 0%. The only thing worth reusing is embeddings, and those are stored in `chunks`. |
| GraphQL | Few resources and simple shapes. REST is simpler and cacheable. |

---

## 9. Possible next steps (if asked "what would you add?")

1. **Email verification** on signup (same token pattern as the password reset).
2. **Refresh-token reuse detection:** if a revoked token is presented, revoke all of that user's sessions.
3. **Evaluation set:** 20 fixed prompts with expected facts, run against prompt changes to catch regressions (for example, "is any fact in the body missing from the knowledge?").
4. **Redis-backed rate limiting** once the API runs on more than one instance.

---

## 10. Backend features in depth

### 10.1 Idempotency keys (`modules/idempotency/`)
**Problem:** a double click, a mobile network drop or an automatic retry sends the same "write my email" request twice. That means two AI calls, two quota slots used, and two emails in history.
**Solution:** the client sends `Idempotency-Key: <uuid>` (a new one per click; the *same* one when it retries after a network error).
1. The server tries to **insert** `{ userId, key, requestHash, status: 'processing' }`. The unique index makes this the lock: of two identical requests arriving together, only one insert succeeds.
2. The winner runs the AI call and stores the response (`completed`). Later requests with that key get the **stored response replayed** (`Idempotent-Replayed: true`), with no AI call and no quota used.
3. Same key while it's still running → `409`. Same key with a different body (hash mismatch) → `422`.
4. **Failures aren't stored.** The record is deleted, so the client can retry with the same key.
5. A TTL index removes keys after 24 h.

This is the same pattern Stripe uses for payment APIs.

### 10.2 Streaming with cancel (Server-Sent Events)
**Problem:** a draft takes 3–10 s. Staring at a spinner feels broken, and if the user changes their mind we keep paying for tokens nobody reads.
**Solution:** `POST /emails/compose/stream` answers with `text/event-stream`: `draft` events carry the text so far, then `done` carries the saved email (reply mode also sends `analysis` first).
- **Why SSE and not WebSockets:** the data only flows one way (server → browser), and SSE is plain HTTP, so it works through proxies, cookies and auth with no extra protocol.
- **Structured output + streaming:** the model streams *JSON*. `readPartialString()` pulls `subject`/`body` out of the half-finished JSON so the user sees words appear. The complete text is still validated with Zod at the end.
- **Cancel:** the browser aborts the fetch → the server sees the response `close` → it aborts an `AbortController` that was passed to the OpenAI SDK → the HTTP call to the AI provider stops. The quota slot is refunded and nothing is saved.
- **A bug found in testing:** on abort, the SDK *ends the stream quietly* instead of throwing. The half-finished JSON then looked "invalid" and triggered the non-streamed retry, which finished the email anyway. The fix: check `signal.aborted` after the loop, and pass the signal to the retry as well. There's a regression test for it.
- **Errors:** problems found before streaming starts (validation, quota, idempotency) are normal JSON errors with real status codes, because headers are only sent on the first event. Failures midway become an `error` event.
- `draft` events are throttled to one per 50 ms. The final text always arrives in `done`, so dropping snapshots in between is safe.

### 10.3 Follow-up reminders (`modules/reminders/`)
After opening a draft in Gmail the user can ask "remind me in 2 days". It's stored as a `Reminder` with a `dueAt`, and the worker job emails the user when it's due (§6).
- **Validation:** `dueAt` must be between 5 minutes and 90 days from now. The email must belong to the user (404 otherwise), and a user can have at most 50 upcoming reminders.
- **One upcoming reminder per email** is enforced by a **partial unique index** (`unique` only where `status = 'scheduled'`), so cancelled or sent reminders don't block a new one.
- The subject and recipient are copied into the reminder, so it still makes sense if the email is deleted later.

### 10.4 Hybrid search (`GET /emails/search`)
- **Keyword:** MongoDB text index (stemming: "refunds" matches "refund"; subject matches weigh 3×).
- **Meaning:** the email's embedding + `$vectorSearch` filtered by `userId`. "money back for a subscription" finds refund emails that never use those words.
- **Merging:** **Reciprocal Rank Fusion**, where each result scores Σ 1/(60 + rank). It uses only ranks, so text scores and vector scores (completely different scales) can be combined, and items found by both searches rise to the top.
- **Relative cut-off for vector matches:** with this embedding model even unrelated emails score ~0.72 and good matches ~0.75–0.82, so a fixed threshold didn't work (this was measured on real data). Only matches within 0.015 of the best score are kept, with an absolute floor of 0.7.
- **Indexing is asynchronous** (the `email-search-index` job). Writing an email never waits for an embedding call, and old emails were backfilled automatically. If vector search isn't available, keyword search still works.

### 10.5 Insights (`GET /insights`)
One aggregation with **`$facet`** computes totals, per-day counts, breakdowns by kind and tone, and top recipients in a **single pass** over the user's emails, instead of five separate queries.
- `$dateToString` with the **user's time zone**, so "emails per day" follows the user's calendar, not UTC. The time zone is validated with `Intl`.
- `$split` + `$unwind` + `$trim` turns `"a@x.com, b@y.com"` into one row per address for "top recipients".
- Days with no emails are filled with 0 in code, so the chart has no gaps.
- It uses the `{ userId, createdAt }` index, so only this user's recent emails are read.

### 10.6 Fail fast to the fallback model
Measured live: an overloaded model returned 429, and the SDK's backoff retries took about 10 s before the fallback started. Now, when a fallback model is configured, the first model gets **no retries** (a quota error won't fix itself in a second) and the fallback keeps the normal retries.
