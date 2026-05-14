# Ogwu

Ogwu is an AI-powered healthcare platform for patients in Nigeria and emerging markets. Patients complete a short triage, then interact with an AI agent that searches a hospital directory, recommends care options, and books appointments — all in one conversational flow. Clinicians manage their patients, consults, and settings through a separate web admin dashboard.

---

## Screenshots

| Triage | AI Agent |
|---|---|
| ![Triage in progress](docs/screenshots/triage.png) | ![AI health assistant](docs/screenshots/agent.png) |

| Booking confirmation | Records & consults |
|---|---|
| ![Appointment booked](docs/screenshots/booking.png) | ![Records screen](docs/screenshots/records.png) |

---

## Architecture

```
ogwu/
├── mobile/      # React Native (Expo) — patient-facing iOS/Android app
├── backend/     # Node.js + Express — AI agent, tool execution, calendar integration
└── supabase/    # Postgres schema, RLS policies, migrations
```

- Mobile uses the Supabase `anon` key and communicates with the backend for anything requiring secrets
- Backend uses the Supabase `service_role` key and handles all OpenAI/Google API calls
- Web admin dashboard lives in a separate repo: `ogwu-web-admin-client`
- Deployed on Railway; database on Supabase Cloud

---

## Features

### Patient mobile app
- Phone OTP authentication
- Onboarding — name, DOB, sex, allergies, known conditions
- AI-powered triage (up to 5 questions) with urgency tier classification and safety note
- AI health assistant with multi-step tool orchestration:
  - Hospital directory search ranked by GPS proximity
  - Google Calendar slot availability for onboarded hospitals
  - Appointment booking with Google Meet link generation
  - Emergency escalation, drug interaction checks, consult history retrieval
- Triage context injected into the agent — no repeated questions
- Async consultation threads — patient ↔ provider messaging, open/closed states
- Health report export (shareable summary of records)
- Multi-language UI: English, Spanish, French, Igbo, Yoruba, Hausa

### Backend / AI agent
- LangGraph stateful directed graph — one node per tool, conditional emergency routing, Postgres checkpointing for fault tolerance
- Human-in-the-loop interrupt before booking confirmation — graph pauses, patient confirms, then resumes from saved state
- 8 tools: hospital search, slot availability, appointment booking, drug interactions, emergency flag, consult history, consult creation, end-conversation
- GPT-generated thread titles from triage summaries
- Triage pipeline: question generation → urgency classification → summary → context injection
- Google Calendar + Meet integration per hospital
- JWT auth middleware scoped to patient identity

### Database
- Supabase Postgres with row-level security on all tables
- Hospital-scoped RLS for admin dashboard access
- 150+ hospitals seeded across Nigeria, India, and the US
- 20 migrations covering schema, policies, and seed data

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo), TypeScript |
| Backend | Node.js, Express, LangGraph |
| AI | OpenAI GPT-4o-mini, LangGraph ReAct agent with per-tool nodes |
| Database | Supabase (Postgres + pgvector + Auth) |
| Integrations | Google Calendar API, Google Meet |
| Admin dashboard | React, TypeScript, Vite, Tailwind CSS |

---

## Current limitations

- No retry or fallback logic — tool errors surface to the patient with no exponential backoff or alternative path
- No guardrails or evals on urgency output; emergency triage produces a badge but no provider alert
- Zero automated tests; no auth token refresh; missing HTTP security headers (CSP, HSTS)

---

## Roadmap

See [`FUTURE_IMPLEMENTATION.md`](./FUTURE_IMPLEMENTATION.md) for full implementation details and priority scores.

**Agent & AI**
- [x] LangGraph agentic orchestration — stateful graphs, Postgres checkpointing, human-in-the-loop before booking
- [ ] AWS Comprehend Medical — medical entity extraction (ICD-10-CM, RxNorm) to ground urgency classification
- [ ] AWS HealthLake (FHIR R4) — versioned clinical data store replacing raw Supabase JSON
- [ ] Evaluation & guardrails — urgency output validation, content safety filter, provider alert on emergency
- [ ] Tool use hardening — Zod schemas on all tool I/O, scoped permissions, tool call logging
- [ ] Error recovery — exponential backoff, fallback booking paths, escalation on repeated failures
- [ ] Context & memory management — sliding-window trim to prevent silent token-limit truncation

**Features**
- [ ] Push notifications — patient alerts when a provider replies
- [ ] Payments — Paystack integration for consultation fees before booking confirmation
- [ ] Prescription + referral flow — structured provider output fed back into the patient record
- [ ] Voice input — OpenAI Whisper transcription on the triage screen mic button
- [ ] Quick reply chips — contextual short-answer chips per triage question
- [ ] Bedrock Data Automation — extract structured data from uploaded health records and policy documents
- [ ] Hospital knowledge base + regulatory assistant — pgvector RAG powering agent grounding and admin document Q&A
- [ ] Read receipts & typing indicators — Supabase Realtime presence on consult threads

**Infrastructure**
- [ ] Automated test suite — Jest + Supertest integration tests, GitHub Actions CI
- [ ] Structured logging — pino with request context, shipped to CloudWatch or Datadog
- [ ] Sentry error tracking — unhandled exceptions and slow transactions on backend and mobile
- [ ] Kafka (AWS MSK) — event-driven booking architecture decoupling confirmation from downstream consumers
- [ ] Auth token refresh — silent re-auth interceptor; clear sensitive state on sign-out
- [ ] Dockerfile + EAS build profiles — reproducible builds, per-environment config
- [ ] Helmet middleware, pagination, password policy, `.env.example` files

**Release**
- [ ] App Store / Play Store release — currently distributed via TestFlight and APK

---

## Local setup

### Backend

```bash
cd backend
npm install
npm run dev
```

Required environment variables:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
DATABASE_URL          # Supabase Postgres connection string — used by LangGraph checkpointer
OPENAI_MODEL          # optional, defaults to gpt-4o-mini
```

### Mobile

```bash
cd mobile
npm install
npx expo start
```

Required environment variables:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_API_URL   # backend base URL — use LAN IP (not localhost) on physical devices
```

### Database

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

---

## License

MIT
