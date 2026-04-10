# Ogwu

Ogwu is an AI-powered health assistant for patients in Nigeria and emerging markets. Patients complete a short triage, then interact with an AI agent that searches a hospital directory, recommends care options, and books appointments — all in one conversational flow.

## What's working right now

- Phone OTP authentication (Supabase Auth)
- Patient onboarding — name, DOB, sex, allergies, known conditions
- LLM-powered triage (up to 5 questions) with urgency tiering and a safety note
- AI health assistant with multi-step tool orchestration:
  - Searches a hospital directory ranked by GPS proximity
  - Checks available Google Calendar slots for onboarded hospitals
  - Books Google Meet appointments and saves them to the database
  - Flags emergencies, checks drug interactions, retrieves consult history
- Triage context is injected into the agent — no repeated questions
- Consult records and async consultation thread view
- Multi-language UI (en/es/fr/ig/yo/ha)
- Hospital directory seeded with 150+ hospitals across Nigeria, India, and the US

## Architecture

```
ogwu/
├── mobile/      # React Native (Expo) — patient-facing iOS/Android app
├── backend/     # Node.js + Express — AI agent, tool execution, calendar integration
└── supabase/    # Postgres schema, RLS policies, migrations
```

- Mobile uses the Supabase `anon` key (safe for clients) and communicates with the backend for anything that requires secrets
- Backend uses the Supabase `service_role` key and handles all OpenAI/Google API calls
- Deployed on Railway; database on Supabase Cloud

## Tech stack

| Layer    | Technology |
|----------|------------|
| Mobile   | React Native (Expo), TypeScript |
| Backend  | Node.js, Express, AI SDK v5 |
| AI       | OpenAI GPT-4o-mini, multi-step tool orchestration |
| Database | Supabase (Postgres + Auth) |
| Integrations | Google Calendar API, Google Meet |

## What's next

- **Doctor web dashboard** — Next.js interface for clinicians to view incoming consults, respond to patients, and manage their calendar
- **Payments** — Paystack integration for consultation fees before booking is confirmed
- **Push notifications** — notify patients when a doctor responds or an appointment is coming up
- **Prescription + referral flow** — structured output from the doctor side that feeds back into the patient's record
- **App Store / Play Store release** — currently distributed via TestFlight and APK

## Local setup

### Backend

```bash
cd backend
npm install
npm run dev
```

Required env vars:

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

Required env vars:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_API_URL   # backend base URL — use LAN IP (not localhost) when testing on a physical device
```

### Database

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## License

MIT
