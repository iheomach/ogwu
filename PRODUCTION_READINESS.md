# Ogwu — Production Readiness & Agentic Experience Checklist

---

## Part 1: Production Readiness

### 🔴 Blocking (fix before launch)

#### Security
- [ ] Rotate Supabase keys — real keys are committed in `mobile/.env` git history; rotate them in the Supabase dashboard to invalidate the exposed ones (you can keep using a local `.env` file for Expo dev, just add `.env` to `.gitignore` so new keys are never committed again)
- [ ] Add `mobile/.env` to `.gitignore` — the file itself is fine for local Expo testing, it just should never be tracked by git
- [ ] Restrict CORS — `backend/src/index.js` calls `cors()` with no origin list; add `cors({ origin: process.env.ALLOWED_ORIGINS })`
- [ ] Add rate limiting — `express-rate-limit` on auth, triage, and agent routes
- [ ] Add `helmet` middleware to backend for security headers (CSP, HSTS, X-Frame-Options)
- [ ] Sanitize error responses — never send `err.message` directly to clients; log internally, return generic message externally

#### Auth
- [ ] Add token refresh logic — handle Supabase session expiry mid-operation on both web and mobile
- [ ] Clear sensitive state on sign-out in web admin (`App.tsx`)

#### Data & Validation
- [ ] Add Zod schemas to unvalidated backend routes (users, doctors endpoints)
- [ ] Add pagination to all list endpoints — consults, patients, threads currently fetch everything at once

---

### 🟡 Important (ship soon after)

#### Reliability
- [ ] Add centralized Express error handler middleware
- [ ] Add React error boundaries to web admin
- [ ] Add graceful shutdown to backend — handle `SIGTERM` to drain in-flight requests before Railway redeploys
- [ ] Add structured logging (Winston or Pino) for audit trails and production debugging

#### Deployment
- [ ] Write a `Dockerfile` for the backend
- [ ] Add EAS build profiles to mobile `app.json` (staging vs. production)
- [ ] Add `.env.example` files to all three packages documenting required variables

#### Notifications
- [ ] Implement push notifications on mobile — patients currently have no signal that a provider replied to their consult thread; the async loop breaks without this

---

### 🟢 Nice to Have (polish)

- [ ] Add automated tests — currently zero; focus on backend auth routes and data mutations first
- [ ] Integrate Sentry or equivalent for error tracking and alerting
- [ ] Add read receipts / typing indicators to consult thread UI
- [ ] Strengthen password policy beyond `length >= 8`
- [ ] Infinite scroll / lazy loading on patients and consults pages

---

## Part 2: Agentic Experience Checklist

These are the five pillars that separate a true agent from a linear LLM chain. Each one has a concrete checklist for Ogwu specifically.

---

### 1. Tool Use / Function Calling
> The LLM can invoke external tools (APIs, databases, CLI commands) to take actions, not just generate text.

**Current state:** ✅ Present — 7 tools (hospital search, booking, drug interactions, etc.)

- [ ] Every tool has a strict JSON Schema definition (no freeform descriptions as the schema)
- [ ] Tool responses are structured and typed — avoid returning raw HTML or unstructured strings
- [ ] Each tool has a clear failure contract — what it returns on error so the agent can reason about it
- [ ] Tools are scoped to least privilege — booking tool can't read drug interaction data, etc.
- [ ] Log every tool call and its result for observability

---

### 2. Planning / Multi-Step Reasoning
> The agent decomposes a goal into steps and sequences tool calls autonomously rather than needing the user to drive each step.

**Current state:** ✅ Present — triage-to-booking pipeline does this

- [ ] The system prompt instructs the agent to plan before acting (e.g. "think step by step before calling any tool")
- [ ] The agent can conditionally branch — e.g. if triage returns `emergency`, skip booking and escalate instead
- [ ] Long plans are checkpointed — if a mid-chain tool call fails, the agent knows where it was
- [ ] The agent can decide when it has enough information to stop asking questions and act
- [ ] Plans are visible/auditable — log the reasoning trace, not just the final output

---

### 3. Context / Memory Management
> Injecting relevant state (patient history, prior Q&A, session data) into the prompt so the agent has what it needs without re-asking.

**Current state:** ✅ Present — triage-to-agent context pipeline covers this

- [ ] Patient triage answers are always injected into downstream agent prompts (no re-asking)
- [ ] Conversation history is trimmed intelligently — oldest messages dropped first, system context preserved
- [ ] The agent has access to: current urgency tier, prior intake summary, appointment history, active consult threads
- [ ] Context is scoped per patient and per session — no bleed between users
- [ ] Token budgets are enforced — monitor prompt length and truncate gracefully before hitting model limits

---

### 4. Evaluation / Guardrails
> Some mechanism to assess whether the agent's outputs and actions are correct, safe, and on-track.

**Current state:** ❌ Missing — this is the one most people skip

- [ ] Output validation — urgency classifications are checked against the allowed enum before being stored (`routine | soon | urgent | emergency`)
- [ ] Confidence thresholds — if the model is uncertain (e.g. ambiguous symptoms), it should flag for human review rather than proceeding
- [ ] Content safety filter — agent responses are checked for harmful medical advice before being sent to patients
- [ ] Human-in-the-loop checkpoint — `emergency` triage results should notify a human immediately, not just return a badge
- [ ] Schema validation on all LLM-generated structured output (tool call arguments, JSON responses) before use
- [ ] Automated evals — a test suite of known symptom inputs with expected urgency outputs to catch regressions when prompts change

---

### 5. Feedback Loops / Error Recovery
> The agent observes the result of a tool call, detects failures or unexpected outputs, and adjusts its approach (retry, fallback, escalate).

**Current state:** ❌ Weak — mostly linear chains with no retry or fallback logic

- [ ] Tool call results are checked before the next step — agent reads the response, not just fires and moves on
- [ ] Retry with backoff on transient failures (network errors, rate limits from OpenAI/Supabase)
- [ ] Fallback paths defined — if booking fails, agent explains why and offers alternatives (different time, different hospital)
- [ ] Escalation path — if the agent fails to resolve a situation after N retries, it hands off to a human provider with full context
- [ ] Error state is communicated to the user in plain language — not "something went wrong" but "I couldn't find available slots, here's what I can do instead"
- [ ] Failed tool calls are logged with full context (input, output, model reasoning) for post-hoc debugging

---

## Summary

| Pillar | Status |
|---|---|
| Tool use / function calling | ✅ Done |
| Planning / multi-step reasoning | ✅ Done |
| Context / memory management | ✅ Done |
| Evaluation / guardrails | ❌ Needs work |
| Feedback loops / error recovery | ❌ Needs work |

| Category | Status |
|---|---|
| Security | ❌ Blocking issues |
| Auth | ❌ Token refresh missing |
| Validation & pagination | ❌ Gaps |
| Reliability & logging | 🟡 Partial |
| Deployment config | 🟡 Incomplete |
| Push notifications | ❌ Missing |
| Tests & monitoring | ❌ Missing |
| Core feature set | ✅ Complete |

---

## Part 3: RAG Pipeline — Hospital Knowledge Base

### What it enables

1. **Hospital-specific agent reasoning** — the triage/booking agent can answer questions like "does this hospital cover X procedure" or "what is this hospital's after-hours intake policy" without any hardcoding per hospital.
2. **Regulatory assistant (admin dashboard)** — a dedicated interface where hospital admins can ask compliance and policy questions against their own uploaded documents (formularies, care protocols, regulatory filings, accreditation requirements).
3. **Dynamic knowledge** — hospitals update their policies without any code changes; they re-upload a document and the embeddings are refreshed.

---

### Architecture

```
Hospital admin uploads PDF/DOCX
        ↓
Document chunking (split into ~500 token segments with overlap)
        ↓
Embed each chunk (OpenAI text-embedding-3-small)
        ↓
Store vectors in Supabase pgvector (table: hospital_documents)
        ↓
At query time:
  User query → embed → cosine similarity search → top-k chunks
        ↓
Inject retrieved chunks into agent system prompt
        ↓
LLM answers grounded in hospital's actual documents
```

**Why Supabase pgvector:** It's already your database. No new infrastructure (Pinecone, Weaviate, etc.) needed. pgvector supports cosine similarity search natively with an index.

---

### Database Schema

```sql
-- Stores the source documents per hospital
create table hospital_documents (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals_directory(id) on delete cascade,
  name        text not null,                  -- e.g. "Formulary 2025.pdf"
  type        text not null,                  -- 'policy' | 'formulary' | 'protocol' | 'regulatory'
  uploaded_at timestamptz default now(),
  uploaded_by uuid references auth.users(id)
);

-- Stores the embedded chunks
create table hospital_document_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references hospital_documents(id) on delete cascade,
  hospital_id uuid not null,                  -- denormalized for faster RLS filtering
  chunk_index int not null,
  content     text not null,                  -- raw text of the chunk
  embedding   vector(1536)                    -- text-embedding-3-small dimensions
);

-- Index for fast cosine similarity search
create index on hospital_document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RLS: hospital admins only see their own chunks
alter table hospital_document_chunks enable row level security;
create policy "hospital sees own chunks"
  on hospital_document_chunks for select
  using (
    hospital_id in (
      select id from hospitals_directory where admin_user_id = auth.uid()
    )
  );
```

---

### Backend Implementation

#### 1. Document ingestion endpoint (`POST /api/documents`)
```
1. Receive file (PDF or DOCX) + metadata (type, name)
2. Extract plain text (use pdf-parse for PDF, mammoth for DOCX)
3. Split into chunks (~500 tokens, 50-token overlap to preserve context across boundaries)
4. Embed each chunk with OpenAI text-embedding-3-small
5. Bulk insert into hospital_document_chunks
6. Insert metadata row into hospital_documents
```

#### 2. Retrieval function (used inside agent + regulatory assistant)
```
1. Embed the incoming user query
2. Run pgvector cosine similarity search scoped to the hospital_id
3. Return top 5 chunks above a similarity threshold (e.g. 0.75)
4. Format chunks as: [Document: {name}, Section {chunk_index}]\n{content}
5. Inject into system prompt under a "Hospital Knowledge Base" heading
```

#### 3. Document management endpoints
- `GET /api/documents` — list all documents for this hospital
- `DELETE /api/documents/:id` — delete document and cascade-delete all its chunks
- `PUT /api/documents/:id` — re-process (re-chunk + re-embed) an updated document

---

### Web Admin — Regulatory Assistant UI

**New page: `/knowledge`**

**Two sections:**

**1. Document library (top)**
- Upload button — accepts PDF, DOCX
- Document type selector: Policy / Formulary / Care Protocol / Regulatory
- Table of uploaded documents: name, type, upload date, chunk count, delete button
- Re-process button for when a document is updated

**2. Regulatory assistant chat (bottom)**
- Chat interface (same pill input as consults page)
- Queries are answered using only retrieved chunks from this hospital's documents
- Each answer cites the source document and section it came from
- Suggested starter questions: "What procedures are covered?", "What is the after-hours intake protocol?", "Summarise our compliance obligations"

---

### Mobile / Triage Agent Integration

- During triage, after the urgency tier is set, the agent retrieves relevant chunks from the hospital's documents before generating its summary
- This allows responses like: "Based on [Hospital Name]'s intake policy, you should present to the emergency department rather than scheduling an appointment"
- Retrieval is scoped to the hospital the patient has an appointment with — no cross-hospital data leakage

---

### Implementation Checklist

#### Infrastructure
- [ ] Enable pgvector extension in Supabase (`create extension if not exists vector`)
- [ ] Create `hospital_documents` and `hospital_document_chunks` tables with RLS policies
- [ ] Add ivfflat index on the embedding column

#### Backend
- [ ] Add `pdf-parse` and `mammoth` dependencies for document text extraction
- [ ] Add `@ai-sdk/openai` embedding call using `text-embedding-3-small`
- [ ] Build chunking utility (sentence-aware splitting with overlap)
- [ ] `POST /api/documents` — ingest, chunk, embed, store
- [ ] `GET /api/documents` — list with chunk counts
- [ ] `DELETE /api/documents/:id` — cascade delete
- [ ] `POST /api/documents/query` — retrieval endpoint used by both the agent and the regulatory assistant chat
- [ ] Inject retrieved chunks into triage agent system prompt when hospital context is known

#### Web Admin
- [ ] New `/knowledge` page with document library table and upload flow
- [ ] Regulatory assistant chat UI (reuse `chat-input-bar` / `chat-bubble` CSS classes)
- [ ] Citation rendering — display source document name alongside each answer
- [ ] Add "Knowledge Base" entry to sidebar navigation

#### Quality & Safety
- [ ] Set a similarity threshold — don't inject chunks below 0.75 cosine similarity (avoids hallucination from loosely related content)
- [ ] Cap injected context at ~2000 tokens to avoid crowding out patient context in the triage agent
- [ ] Add a "no relevant documents found" fallback so the agent doesn't fabricate policy answers
- [ ] Log every retrieval query and which chunks were returned for auditability
