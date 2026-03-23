# Ogwu 🏥

> Telehealth MVP for Nigeria: async consultations first.

Ogwu is a telehealth product focused on validating one loop: patients can describe symptoms, book a consult, pay, and get a doctor response.

## Current Status

This repository is currently **early scaffolding**:

- Supabase Cloud schema migration for `profiles` (+ RLS + auth trigger)
- Express API with basic auth + profile endpoints
- Expo mobile app skeleton + Supabase client wiring

The consultation flow, AI triage, payments, and the doctor dashboard are planned next (see MVP spec).

## MVP (Stage 1)

**Goal:** Validate that patients in Nigeria will pay for and use an async telehealth consultation product.

**Core loop:** Patient signs up → AI triage → Books consult → Pays → Doctor reviews → Response + prescription → Patient receives it.

For the full Stage 1 spec, see [ogwu_mvp.md](ogwu_mvp.md).

### What’s in scope (MVP)

This is the **product scope** for Stage 1 (not all of it is implemented yet).

- Patient app (Expo)
  - Auth + basic profile
  - AI symptom intake (triage) that outputs a structured summary + disclaimer
  - Consultation booking (async + live via Google Meet link)
  - Payments (Paystack)
  - Consultation thread + basic record/history

- Doctor experience
  - **Planned:** a web dashboard (Next.js) as described in [ogwu_mvp.md](ogwu_mvp.md)

### What’s explicitly NOT in scope (MVP)

- Native video calling (use Google Meet links)
- Lab test booking, medication delivery
- Multi-language, USSD/SMS fallback
- App Store / Play Store public launch (beta via TestFlight/APK)

## Architecture (simple)

- **Mobile app (Expo):** patient-facing UI
- **Backend (Node/Express):** runs on Railway/Render; holds secrets; handles payments webhooks + AI calls (and any server-only logic)
- **Supabase (Cloud):** Postgres + Auth + Storage

Rule of thumb:
- Mobile uses Supabase `anon` key (safe for clients)
- Backend uses Supabase `service_role` key (server-only)

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Mobile    | Expo (React Native)                 |
| Backend   | Node.js + Express (Railway / Render)|
| Database  | Supabase (Postgres + Auth + Storage)|

## Repo Structure

```
ogwu/
├── mobile/          # Patient app (Expo)
├── backend/         # Express API
└── supabase/        # Supabase migrations & config
```

## Development (quickstart)

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### 2) Mobile

```bash
cd mobile
cp .env.example .env
npm install
npx expo start
```

If testing on a physical phone, set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your computer’s LAN IP (not `localhost`).

### 3) Supabase (Cloud)

This repo includes a migration at [supabase/migrations/001_initial_schema.sql](supabase/migrations/001_initial_schema.sql).

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## License

MIT
