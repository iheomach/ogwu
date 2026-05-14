# Ogwu — Future Implementation & Production Readiness

---

## Part 1: Production Readiness

### 🔴 Blocking (fix before launch)

#### Security
- [x] Supabase anon key in `mobile/.env` — anon key is safe to expose; RLS enforces access. `mobile/.env` added to `.gitignore` so it won't be tracked going forward.
- [x] Restrict CORS — `backend/src/index.js` now uses `cors({ origin: allowlist })` scoped to `localhost:5173`, `localhost:4173`, and `process.env.ADMIN_ORIGIN`. Set `ADMIN_ORIGIN=https://ogwu-web-admin-client.vercel.app` in Railway.
- [x] Add rate limiting — two-level: global IP limiter (300 req / 15 min) + per-user limiter (20 req / 1 min) on triage, agent, threads, appointments, and report routes via `express-rate-limit`
- [x] Sanitize error responses — `lib/serverError.js` helper logs internally and returns a generic message; applied across all 12 route files

#### Auth
- [ ] Add token refresh logic — handle Supabase session expiry mid-operation on both web and mobile
- [ ] Clear sensitive state on sign-out in web admin (`App.tsx`)

#### Data & Validation
- [x] Input validation on backend routes — users route uses a field whitelist, doctors is read-only, Supabase column constraints handle type enforcement
- [ ] Add pagination to all list endpoints — consults, patients, threads currently fetch everything at once

---

### 🟡 Important (ship soon after)

#### Reliability
- [ ] Add React error boundaries to web admin
- [ ] Add graceful shutdown to backend — handle `SIGTERM` to drain in-flight requests before Railway redeploys
- [ ] Add structured logging (Winston or Pino) for audit trails and production debugging

#### Deployment
- [ ] Write a `Dockerfile` for the backend
- [ ] Add EAS build profiles to mobile `app.json` (staging vs. production)
- [ ] Add `.env.example` files to all three packages documenting required variables
- [ ] Set `ADMIN_ORIGIN=https://ogwu-web-admin-client.vercel.app` as a Railway environment variable

#### Notifications
- [ ] Implement push notifications on mobile — patients currently have no signal that a provider replied to their consult thread; the async loop breaks without this

---

### 🟢 Nice to Have (polish)

- [ ] Add automated tests — currently zero; focus on backend auth routes and data mutations first
- [ ] Add `helmet` middleware for additional security headers (CSP, HSTS, X-Frame-Options) — low priority; not blocking
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
| Security | ✅ CORS, rate limiting, error sanitization done |
| Auth | ❌ Token refresh missing |
| Validation & pagination | 🟡 Validation done, pagination missing |
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

---

## Part 4: Quick Intake UX Improvements

### Quick Reply Chips

Each triage question now shows 2–3 contextual chip options (like Google Chat smart replies) that patients can tap to instantly populate their answer — while still allowing free-text input.

**Current state:** ✅ Implemented — client-side chip generation based on question keyword matching

**How it works:**
- `suggestionsForQuestion(question)` in `AppRouter.tsx` matches question text against patterns (duration, severity, allergies, fever, medications, conditions) and returns 2–3 relevant short answers
- Chips render as a horizontal scroll row above the text input in `TriageScreen.tsx`
- Tapping a chip populates the answer field; tapping again with different text overrides it
- Selected chip highlights in brand purple to give clear feedback

**Implementation checklist:**
- [x] `suggestionsForQuestion` helper with 7 question-type patterns
- [x] Chip row UI in `TriageScreen` (horizontal `ScrollView`, pill style)
- [x] Active chip state highlighted in purple
- [x] Compatible with free-text input (chips and text input coexist)
- [ ] Move suggestion logic to backend so the LLM generates context-aware chips alongside each question (better accuracy for edge-case questions)
- [ ] Localize chip labels — currently English-only regardless of locale

---

### Voice Input

Patients can tap a microphone button during triage to speak their answer instead of typing. Audio is recorded on-device, sent to the backend, and transcribed via OpenAI Whisper before populating the answer field.

**Current state:** ✅ Implemented — `expo-av` recording + Whisper transcription via `/api/triage/transcribe`

**Architecture:**
```
Patient taps mic → expo-av starts recording (m4a, HIGH_QUALITY preset)
       ↓
Patient taps stop → recording stopped, URI retrieved
       ↓
expo-file-system reads file as base64
       ↓
POST /api/triage/transcribe { audio: base64, mimeType: 'audio/m4a' }
       ↓
Backend converts base64 → Blob → multipart FormData
       ↓
OpenAI Whisper API (whisper-1) transcribes
       ↓
Transcribed text returned and populated into answer field
```

**Mobile implementation checklist:**
- [x] `expo-av` audio recording with `HIGH_QUALITY` preset
- [x] Microphone permission request with user-facing alert on denial
- [x] Recording state reflected in UI (mic icon ↔ stop icon, red border while recording)
- [x] `expo-file-system` base64 read + POST to `/api/triage/transcribe`
- [x] Transcribed text auto-populates answer field
- [x] All 6 locale strings added (`tapToSpeak`, `stopRecording`, `micPermTitle`, `micPermBody`, `voiceErrorTitle`, `voiceErrorBody`)
- [ ] Run `npx expo install expo-av expo-file-system` and update `app.json` with `NSMicrophoneUsageDescription` (iOS) and `android.permissions` (Android)
- [ ] Test on physical device — microphone recording does not work in Expo Go simulator
- [ ] Add max recording duration (e.g. 60s) to prevent accidental long recordings
- [ ] Waveform animation while recording to improve UX feedback

**Backend implementation checklist:**
- [x] `POST /api/triage/transcribe` endpoint in `backend/src/routes/triage.js`
- [x] Base64 → `Blob` → `FormData` → Whisper API pipeline (no extra npm deps, uses Node 20 native `Blob`/`FormData`)
- [x] Reuses existing `OPENAI_API_KEY` env var
- [x] Auth-protected via `authenticate` middleware
- [ ] Add request size limit for audio payload (recommend 10 MB cap via `express.json({ limit: '10mb' })` scoped to this route)
- [ ] Log transcription latency and failure rate for monitoring

---

## Part 5: Architecture Evolution Roadmap

### Summary Table

| # | Initiative | Area | Importance |
|---|---|---|:---:|
| 1 | Switch from Vercel AI SDK to LangGraph for agentic orchestration | Agent / AI | 5 / 5 |
| 2 | Replace LLM tool calls with RAG + AWS health services (HealthLake, Comprehend Medical) | AI / Data | 5 / 5 |
| 3 | Medical record ingestion via AWS Bedrock Data Automation (patient + admin) + EventBridge → Lambda → vector DB | Data / Docs / Infra | 4 / 5 |
| 4 | Switch appointment booking to event-driven architecture with AWS MSK (Kafka) | Infra / Events | 3 / 5 |

---

### 1. Switch to LangGraph — Importance: 5 / 5

**What:** Replace the current Vercel AI SDK orchestration layer with [LangGraph](https://github.com/langchain-ai/langgraph) (Python or JS) for all agentic workflows — triage, booking, thread summarisation, and the regulatory assistant.

**Why LangGraph over the current setup:**

| | Vercel AI SDK (current) | LangGraph |
|---|---|---|
| Orchestration model | Flat tool-call loop; you manage state manually | Directed graph: nodes = steps, edges = control flow |
| State persistence | None — context re-sent every request | Built-in checkpointing to Postgres / Redis / MemorySaver |
| Multi-turn memory | DIY — history arrays passed in prompt | First-class: state schema carries conversation + decisions |
| Conditional branching | If/else in application code | Conditional edges decided at runtime from agent state |
| Human-in-the-loop | Not supported | Built-in interrupt / approve / resume |
| Fault tolerance | None — failed tool call = broken flow | Replay from last checkpoint |
| JS support | Native | Full parity since v1.0 (Oct 2025) |

**What changes in Ogwu:**

```
Current flow (Vercel AI SDK):
  User message → buildSystemPrompt() → openai chat → tool calls (flat loop) → response

LangGraph flow:
  User message
       ↓
  [triage_node]  →  if urgency=emergency → [escalate_node]
       ↓                                         ↓
  [booking_node]                         [alert_provider_node]
       ↓
  [confirm_node]  ←→  human interrupt (awaiting patient approval)
       ↓
  [notify_node]
```

**Implementation checklist:**
- [ ] Define agent state schema: `{ messages, urgency, patient_id, booking_state, tool_results }`
- [ ] Port each triage tool to a LangGraph node
- [ ] Define conditional edges: `urgency === 'emergency'` → escalation path, else → booking path
- [ ] Configure checkpointer (Postgres recommended — reuse Supabase connection)
- [ ] Add human-in-the-loop interrupt before any booking confirmation
- [ ] Replace `backend/src/routes/agent.js` linear chain with LangGraph graph invocation
- [ ] Wire LangGraph streaming output to existing SSE response format (drop-in for frontend)

---

### 2. RAG + AWS Health Services — Importance: 5 / 5

**What:** Replace the current single LLM call + manual tool definitions with a retrieval-augmented pipeline grounded in structured medical knowledge via AWS-managed health services. The goal is factual grounding, not advice — surface relevant medical context to the LLM so it can ask better triage questions and categorise urgency more accurately.

> **Important:** Ogwu is not a diagnostic tool. These services are used for triage question generation and urgency classification accuracy — not to provide medical advice to patients.

#### AWS Comprehend Medical

**Role:** Extracts named medical entities from patient free-text (symptoms, medications, body locations, conditions) and maps them to standard ontology codes before passing context to the LLM.

| Output | API | Example |
|---|---|---|
| Conditions → ICD-10-CM | `InferICD10CM` | "headache" → R51 (confidence: 0.97) |
| Medications → RxNorm | `InferRxNorm` | "metformin" → RxCUI 6809 |
| Concepts → SNOMED CT | `InferSNOMEDCT` | "shortness of breath" → 230145002 |

**How it fits in the triage flow:**
```
Patient answer (free text)
       ↓
Comprehend Medical: extract entities + map to ICD-10 / RxNorm codes
       ↓
Structured entity payload injected into LangGraph triage node context
       ↓
LLM generates next question aware of extracted medical concepts
       ↓
computeUrgency() enriched with entity confidence scores
```

**Implementation checklist:**
- [ ] Add `@aws-sdk/client-comprehendmedical` to backend
- [ ] Call `InferICD10CM` on each patient answer before passing to triage node
- [ ] Filter entities above confidence threshold (0.80) to avoid low-quality signals
- [ ] Pass structured entities into LangGraph node state as `extracted_entities[]`
- [ ] Update `computeUrgency` to weight high-confidence emergency-signal entities more heavily

#### AWS HealthLake

**Role:** FHIR R4-compliant store for patient health records. Replaces raw Supabase JSON blobs for clinical data with a standards-compliant, queryable health data layer.

**Key capabilities relevant to Ogwu:**
- Stores `Patient`, `Condition`, `Medication`, `Encounter`, `Observation` resources with versioning
- FHIR REST search with date filtering, pagination, `_include` for related resources
- SMART on FHIR + OAuth 2.0 — patient-scoped access without custom RLS policies
- Data Transformation Agent converts uploaded C-CDA / legacy documents to FHIR automatically

**How it fits:**
```
Patient uploads medical record (PDF / C-CDA)
       ↓
Bedrock Data Automation extracts structured data
       ↓
HealthLake Data Transformation Agent normalises to FHIR R4
       ↓
Stored as FHIR Encounter / Condition / Observation resources
       ↓
At triage time: FHIR query pulls patient history → injected into LangGraph state
       ↓
LLM generates questions aware of prior conditions, medications, encounter history
```

**Implementation checklist:**
- [ ] Provision HealthLake datastore (us-east-1 or us-west-2)
- [ ] Configure SMART on FHIR OAuth for patient-scoped access
- [ ] Map current Supabase `triage_intakes` answers → FHIR `Observation` resources on save
- [ ] Map `encounters` table → FHIR `Encounter` resources
- [ ] At triage entry: query HealthLake for patient's prior `Condition` and `Medication` resources; inject into LangGraph state
- [ ] Evaluate cost: HealthLake charges per resource stored + per search request

---

### 3. Bedrock Data Automation for Document Ingestion — Importance: 4 / 5

**What:** Use [AWS Bedrock Data Automation](https://aws.amazon.com/bedrock/bda/) (BDA) to extract structured data from uploaded medical documents (PDFs, scans, DOCX) on both the patient side (personal health records) and the admin side (hospital policies, formularies, care protocols).

**Architecture:**

```
Document upload (patient app or admin dashboard)
       ↓
S3 PUT (e.g. s3://ogwu-docs/{hospital_id|patient_id}/{file})
       ↓
EventBridge rule: S3 ObjectCreated → fires on .pdf / .docx
       ↓
Lambda: invoke Bedrock Data Automation
  - Extract text, tables, key-value pairs with confidence scores
  - Returns structured JSON (diagnoses, medications, dates, etc.)
       ↓
Lambda: embed extracted text chunks (Bedrock Titan or OpenAI)
       ↓
SQS queue (decouples embedding from upload, handles spikes)
       ↓
Lambda consumer: write vectors + metadata to pgvector (Supabase)
  or Bedrock Knowledge Base sync
       ↓
DynamoDB / Supabase: store document metadata + processing status
```

**Patient side (medical records):**
- Patient uploads personal health records (discharge summaries, lab results, prescriptions)
- BDA extracts conditions, medications, dates, provider names
- Extracted data flows into HealthLake as FHIR resources and into the patient's triage context

**Admin side (hospital documents):**
- Hospital admin uploads policy documents, formularies, care protocols
- BDA extracts and chunks content; embeddings stored in pgvector (already planned in Part 3)
- Powers the regulatory assistant chat

**Implementation checklist:**
- [ ] Create S3 bucket with prefix-based routing (`patients/`, `hospitals/`)
- [ ] Configure EventBridge rule: `aws.s3` ObjectCreated, filter suffix `.pdf`/`.docx`
- [ ] Lambda: call `bedrock-data-automation:invokeDataAutomationAsync` with document blueprint
- [ ] Lambda: chunk BDA output text (~500 tokens, 50-token overlap), embed, write to pgvector
- [ ] SQS queue between extraction Lambda and embedding Lambda (prevent timeout on large docs)
- [ ] DLQ for failed events + CloudWatch alarm on DLQ depth
- [ ] Mobile: add document upload screen (patient records); Admin: document library UI already planned
- [ ] iOS: add `NSMicrophoneUsageDescription` and file picker entitlements for upload
- [ ] Add document processing status polling endpoint (`GET /api/documents/:id/status`)

---

### 4. Kafka (AWS MSK) for Appointment Event Streams — Importance: 3 / 5

**What:** Replace the current synchronous appointment booking flow (HTTP call → DB write → response) with an event-driven architecture using [AWS Managed Streaming for Apache Kafka (MSK)](https://aws.amazon.com/msk/). This decouples booking confirmation from downstream actions (notifications, calendar sync, HealthLake updates, provider alerts).

**Why Kafka over SQS here:**
- Multiple independent consumers need the same booking event (notification service, HealthLake writer, calendar sync, analytics) — Kafka fan-out handles this natively
- MSK Express brokers deliver sub-millisecond latency (2024 addition)
- Message replay allows re-processing if a consumer (e.g. push notification service) goes down
- Use SQS if volume stays below ~500 bookings/day — Kafka adds operational overhead not worth it at low scale

**Proposed topics:**

| Topic | Producers | Consumers |
|---|---|---|
| `ogwu.appointment.requested` | Agent booking tool | Availability checker, notification service |
| `ogwu.appointment.confirmed` | Booking confirmation Lambda | HealthLake writer, calendar sync, push notification |
| `ogwu.appointment.cancelled` | Patient / provider action | Availability updater, notification service |
| `ogwu.document.uploaded` | S3 EventBridge → Lambda | BDA processor, status tracker |

**Implementation checklist:**
- [ ] Provision MSK Express cluster (start single-AZ for dev, multi-AZ for prod)
- [ ] Define topic schema using JSON Schema or Avro (prefer Avro + Schema Registry for health data)
- [ ] Refactor `agent.js` booking tool: publish to `ogwu.appointment.requested` instead of direct DB write
- [ ] Lambda consumers: one per downstream action (notification, HealthLake, calendar)
- [ ] Dead-letter topics for failed events; CloudWatch metric alarm on consumer lag
- [ ] Configure retention: 7 days default; emergency events retain 30 days for audit
- [ ] Evaluate: if booking volume stays low (<500/day), SQS is simpler — revisit MSK after launch
