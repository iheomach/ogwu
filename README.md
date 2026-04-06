# Ogwu 🏥

> Telehealth MVP for Nigeria: async consultations first.

Ogwu is a telehealth MVP focused on a simple **clinic co-pilot** loop: patients complete a quick intake and can share a clinic-ready summary (including an urgency tier) with a clinician.

## Current Status

This repository includes a working end-to-end flow:

- Phone OTP auth (Supabase Auth)
- Patient profile onboarding (name/DOB/sex + optional conditions/allergies)
- Multi-language UI (en/es/fr/ig/yo/ha)
- Quick intake (triage): up to 5 questions (rule-based)
- AI summary + safety note at completion (OpenAI)
- Saved intake results screen with an **urgency tier** and a **Share for clinic** action

## MVP (Stage 1)

**Goal:** Validate that patients in Nigeria will pay for and use an async telehealth consultation product.

**Core loop:** Patient signs up → Quick intake → Urgency tier + summary → Share with clinic.

For the full Stage 1 spec, see [ogwu_mvp.md](ogwu_mvp.md).

### What’s in scope (MVP)

This is the **product scope** for Stage 1 (not all of it is implemented yet).

- Patient app (Expo)
  - Auth + basic profile
  - Quick intake + AI summary/safety note
  - Urgency tiering (routine/soon/urgent/emergency)
  - Clinic-ready share text
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
npm install
npm run dev
```

Backend config comes from environment variables.

- **Production (Railway):** set env vars in Railway (recommended)
- **Local dev (no `backend/.env`):** export vars in your shell, or use `railway run` to inject your Railway env vars locally

Required backend env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `OPENAI_API_KEY` (required for `/api/triage/complete` summary/safety note)
- `OPENAI_MODEL` (optional; defaults to `gpt-4o-mini`)

### 2) Mobile

```bash
cd mobile
npm install
npx expo start
```

Mobile config is also read from environment variables.

- **Production builds (EAS):** set `EXPO_PUBLIC_*` variables in EAS/Expo (recommended)
- **Local dev (no `mobile/.env`):** export `EXPO_PUBLIC_*` variables in your shell before running `npx expo start`

Required mobile env vars:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_URL` (your backend base URL)

If your backend is running locally and you test on a physical phone, `EXPO_PUBLIC_API_URL` must use your computer’s LAN IP (not `localhost`).

### 3) Supabase (Cloud)

This repo includes migrations under [supabase/migrations](supabase/migrations).

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## License

MIT
