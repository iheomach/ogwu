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
- AI SDK v5 streaming with multi-step tool orchestration
- 7 tools: hospital search, slot availability, appointment booking, drug interactions, emergency flag, consult history, send-to-hospital
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
| Backend | Node.js, Express, AI SDK v5 |
| AI | OpenAI GPT-4o-mini, multi-step tool orchestration |
| Database | Supabase (Postgres + pgvector + Auth) |
| Integrations | Google Calendar API, Google Meet |
| Admin dashboard | React, TypeScript, Vite, Tailwind CSS |

---

## Roadmap

- [ ] **Push notifications** — notify patients when a provider replies or an appointment is approaching
- [ ] **RAG pipeline** — hospital-specific knowledge base (formularies, care protocols, policies) via pgvector; powers both triage agent grounding and a regulatory assistant on the admin dashboard
- [ ] **Payments** — Paystack integration for consultation fees before booking confirmation
- [ ] **Prescription + referral flow** — structured provider output that feeds back into the patient's record
- [ ] **Guardrails + evals** — confidence thresholds, content safety filter, automated triage regression suite
- [ ] **Error recovery** — retry/fallback/escalation logic in the agent tool chain
- [ ] **App Store / Play Store release** — currently distributed via TestFlight and APK

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
