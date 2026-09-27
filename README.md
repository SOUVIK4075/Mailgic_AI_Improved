# Mailgic-AI

An AI email assistant that writes emails **grounded in your own documents** instead of making things up.

- **Compose** — pick a type, tone and length, describe what you want, get a structured email (subject + body).
- **Reply** — paste an email you received; Mailgic extracts the questions, requests and deadlines, then drafts a reply that answers every one.
- **Knowledge base (RAG)** — upload your resume, pricing sheet or FAQ (PDF / TXT / MD). Relevant passages are retrieved with vector search and used as the only source of facts.
- **No invented facts** — when a detail is missing, the AI writes a placeholder like `[Meeting Date]` and lists it for you to fill in.
- **Live drafts** — the email streams in word by word (Server-Sent Events); **Stop** cancels the AI call and refunds the quota.
- **Review & send** — fill the blanks, edit, and open Gmail with To/Subject/Body pre-filled.
- **Follow-up reminders** — "remind me in 2 days"; a background job emails you when it's due.
- **Search history** — by keywords *and* by meaning (hybrid text + vector search, merged with Reciprocal Rank Fusion).
- **Insights** — emails per day, kinds, tones, top recipients and AI usage, from one MongoDB aggregation.
- **Safe retries** — `Idempotency-Key` on AI endpoints: a retried request is replayed, never charged twice.

**Stack:** MongoDB · Express 5 · React 19 · Node 20 · TypeScript · OpenAI · MongoDB Atlas Vector Search

## Architecture at a glance

```
 React (Vite) ──/api──▶ Express API ──▶ MongoDB (Atlas)
                          │               ├─ users, sessions, emails, usage
                          │               └─ knowledge docs + chunks (vector index)
                          ├──▶ OpenAI (chat + embeddings)
                          └── Ingestion worker (same process, MongoDB as the job queue)
```

One server, one database, one AI provider. Details and the reasoning behind every choice:
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** · API reference: **[docs/API.md](docs/API.md)**

## Run locally

Prerequisites: Node 20+, Docker, a Gemini (free) or OpenAI API key.

```bash
git clone https://github.com/SOUVIK4075/Mailgic_AI_Improved.git
cd Mailgic_AI_Improved
npm run setup                          # installs root, server and client dependencies
docker compose up -d --wait mongo      # MongoDB with Vector Search (waits until it is ready)
cp server/.env.example server/.env     # then set OPENAI_API_KEY (Gemini key works) and JWT_ACCESS_SECRET
npm run dev                            # API on :4000, web app on http://localhost:5173
```

**AI provider:** the server uses the OpenAI SDK against any OpenAI-compatible API. `.env.example` is set up for **Google Gemini's free tier** (key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)), and switching to OpenAI means changing four env variables. Run `npm --prefix server run ai:check` to test your key.

Password-reset emails are printed in the server log unless `SMTP_URL` is set.

## Tests

```bash
npm test
```

59 tests run against an in-memory MongoDB, with the AI provider mocked. They cover auth and token rotation, ownership checks, cursor pagination, the daily quota, idempotency (replay / conflict / reuse), SSE streaming and cancel, reminders and their retries, hybrid search, the insights aggregation, the background jobs, and the LLM wrapper (structured-output retry, fallback model).

The real Atlas Vector Search integration test is skipped by default. To run it:

```bash
docker run -d -p 27018:27017 mongodb/mongodb-atlas-local:8.0
cd server && ATLAS_TEST_URI="mongodb://localhost:27018/mailgic_test?directConnection=true" npm test
```

CI (GitHub Actions) type-checks and tests the server and builds the client on every push.

## Production

```bash
npm run build && npm start             # Express serves the API and the built React app on :4000
# or
docker compose --profile full up --build
```

Deploy as a single Node service (Render / Railway / Fly.io) with a MongoDB Atlas cluster. The free M0 tier supports Vector Search. The vector index is created automatically at startup, or you can run `npm --prefix server run db:indexes`.

## Project structure

```
client/            React + Vite + Tailwind (see client/README.md)
server/
  src/
    config/        env validation (zod), constants (types, tones, limits)
    middleware/    auth, rate limits, central error handler
    models/        Mongoose schemas + indexes
    modules/
      auth/        signup, login, refresh-token rotation, password reset
      emails/      compose, reply, history (cursor pagination)
      knowledge/   upload, chunking, background ingestion worker, vector index
      ai/          OpenAI client, structured output, embeddings, retrieval, prompts
      usage/       per-user daily quota + token accounting
      admin/       role-protected stats
  tests/
docs/              API.md, ARCHITECTURE.md
```

## License

MIT
