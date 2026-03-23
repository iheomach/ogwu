# 🏥 Ogwu — MVP Specification (Stage 1)

> **Goal:** Validate that patients in Nigeria will pay for and use an async telehealth consultation product.
> **Timeline:** 8–12 weeks to launch
> **Team:** Solo developer

---

## What We Are NOT Building in MVP

Before listing what's in scope, here's what's explicitly deferred to Stage 2+:

- ❌ Native video calling (using Google Meet links instead)
- ❌ Lab test booking
- ❌ Medication delivery
- ❌ Chronic disease management agent
- ❌ Medication adherence agent
- ❌ FHIR compliance
- ❌ Multi-language support (English only for now)
- ❌ USSD / SMS fallback
- ❌ iOS App Store / Google Play launch (TestFlight + APK direct install for beta)
- ❌ Redis caching
- ❌ Native file storage (use Supabase storage)

---

## MVP Scope

### The Core Loop (Everything Else Is Secondary)

```
Patient signs up → AI triage → Books consult → Pays → 
Doctor reviews → Consult happens (async or Meet) → 
Doctor sends response + prescription → Patient receives it
```

If this loop works end-to-end and people pay for it, the MVP has succeeded.

---

## Features In Scope

### Patient Side (Mobile App — Expo)

**Auth**
- Sign up / log in with phone number + OTP (Supabase Auth)
- Basic profile: name, age, sex, known conditions

**AI Symptom Checker (Triage Agent)**
- Conversational symptom intake (text-based, chat UI)
- Claude API powers the conversation
- Collects: main complaint, duration, severity, relevant history
- Outputs a structured summary that gets attached to the consultation
- Clear disclaimer: "This is not a diagnosis. A doctor will review your case."
- Two outcomes: Book a consult → or → "Your symptoms suggest you go to an emergency room immediately" (hard stop, no consult booked)

**Consultation Booking**
- Browse available doctors (name, specialty, price, availability)
- Two consultation types:
  - **Async** — patient submits symptoms + voice note/text, doctor responds within 6 hours (cheaper)
  - **Live (Google Meet)** — app generates a Meet link for a scheduled time slot
- Select a time slot (live) or just submit (async)

**Payments**
- Paystack integration
- Pay before consult is confirmed
- Simple pricing: flat fee per consult type
- Receipt stored in app

**Consultation View**
- Async: chat-style thread between patient and doctor
- Live: shows Meet link + countdown to appointment time
- Doctor can attach: text response, prescription (PDF), follow-up recommendation

**Basic Health Records**
- List of past consultations
- View consultation notes + prescriptions
- No exports in MVP

---

### Doctor Side (Web Dashboard — Next.js)

> Doctors use a web app, not mobile, for MVP. Simpler to build and doctors are likely on a laptop anyway.

**Auth**
- Email + password login (Supabase Auth)
- Manual onboarding by admin (no self-serve doctor sign-up in MVP — you vet them yourself)

**Queue / Inbox**
- List of pending consultations (async) with patient symptom summary pre-filled by AI
- Upcoming live consultations with Meet link
- Status tags: Pending → In Progress → Completed

**Consultation Workspace**
- View AI-generated symptom summary
- Read patient's submitted voice note / text
- Write response (rich text)
- Upload prescription as PDF (or type it in)
- Mark consultation complete
- Flag for follow-up

**Availability**
- Set available time slots for live consultations
- Toggle availability on/off

**Earnings**
- Total earned (current month)
- Per-consultation breakdown
- Payout requested manually via mobile money in MVP (no automated payout yet)

---

## Tech Stack (MVP)

| Layer | Choice | Why |
|---|---|---|
| Mobile | Expo (React Native) | Fastest solo mobile dev, no native config |
| Web (Doctor dashboard) | Next.js | Simple, fast to build, good auth story |
| Backend | Node.js + Express.js | JavaScript across the full stack, pairs naturally with Supabase JS SDK |
| Database | Supabase (Postgres) | Hosted DB + auth + storage, minimal DevOps |
| File storage | Supabase Storage | Prescription PDFs, voice notes |
| AI | Anthropic Claude API | Powers the triage agent |
| Payments | Paystack | Best Nigerian payment gateway |
| Video | Google Meet API (or manual link generation) | Zero infra, doctors/patients already have it |
| Hosting (backend) | Railway | One-click Django deploys, free tier for MVP |
| Hosting (dashboard) | Vercel | Free Next.js hosting |

---

## Repo Structure

```
ogwu/
├── apps/
│   ├── mobile/          # Expo React Native (patient app)
│   └── dashboard/       # Next.js (doctor web app)
├── packages/
│   ├── api/             # Node.js + Express backend
│   ├── agents/          # Claude triage agent logic
│   └── shared/          # Shared TypeScript types & constants
├── turbo.json
└── package.json
```

---

## Data Models (Core Only)

```
User
- id, phone, name, age, sex, created_at
- role: patient | doctor | admin

DoctorProfile
- user_id, specialty, bio, consultation_fee_async, consultation_fee_live, is_available

Consultation
- id, patient_id, doctor_id
- type: async | live
- status: pending | confirmed | in_progress | completed | cancelled
- meet_link (nullable)
- scheduled_at (nullable, for live)
- ai_summary (text — triage agent output)
- patient_note (text or voice note URL)
- doctor_response (text)
- prescription_url (nullable)
- amount_paid
- created_at, updated_at

Payment
- id, consultation_id, patient_id
- amount, currency
- paystack_reference
- status: pending | success | failed
- created_at

TimeSlot
- id, doctor_id, start_time, end_time, is_booked
```

---

## The Triage Agent (MVP Version)

Keep it simple for MVP. This is a **single-turn structured conversation**, not a complex multi-agent system.

**Flow:**
1. Patient opens "New Consultation"
2. Chat UI launches — Claude is the assistant
3. System prompt instructs Claude to:
   - Greet the patient warmly
   - Ask about their main complaint
   - Ask 4–6 targeted follow-up questions (duration, severity, location, associated symptoms, relevant history)
   - NOT diagnose
   - At the end, output a structured JSON summary:
     ```json
     {
       "chief_complaint": "...",
       "duration": "...",
       "severity": "mild | moderate | severe",
       "associated_symptoms": ["..."],
       "relevant_history": "...",
       "red_flags": true | false,
       "red_flag_reason": "..." 
     }
     ```
4. If `red_flags: true` → show emergency message, block consult booking
5. If `red_flags: false` → show summary to patient, prompt to book consult
6. Summary attached to the consultation record

**That's it for MVP.** No memory, no follow-up agent, no results interpreter yet.

---

## Google Meet Integration (MVP)

No API needed for MVP. Keep it dead simple:

1. Doctor sets a time slot as available
2. Patient books a live slot → payment goes through
3. **Doctor manually creates a Meet link** and pastes it into the dashboard
4. App shows patient the link + appointment time
5. Both parties join at the scheduled time

Automate Meet link generation (Google Calendar API) in Stage 2 when this becomes tedious at volume.

---

## Paystack Integration

- Patient hits "Book Consult" → Paystack popup opens in-app (Paystack React Native SDK)
- On success → consultation status moves to `confirmed`
- On failure → consultation stays `pending`, patient prompted to retry
- Webhook from Paystack confirms payment server-side (don't trust client-only)
- Doctor payouts: manual bank transfer / mobile money in MVP. Automate in Stage 2.

---

## MVP Success Metrics

These are the only numbers that matter at this stage:

| Metric | Target (Month 1 post-launch) |
|---|---|
| Beta users signed up | 100 |
| Consultations completed | 30 |
| Paying patients (conversion) | >50% of signups |
| Patient satisfaction (post-consult survey) | >4/5 |
| Doctor response time (async) | <6 hours average |
| Critical bugs reported | <5 |

If you hit these, you've validated the core loop and have a green light for Stage 2.

---

## MVP Launch Plan

**Week 1–2: Setup**
- [ ] Initialise monorepo (Turborepo)
- [ ] Supabase project setup (DB schema, auth)
- [ ] Django project scaffold + DRF
- [ ] Expo project scaffold
- [ ] Next.js dashboard scaffold
- [ ] Railway + Vercel deployment pipelines

**Week 3–4: Core Backend**
- [ ] Auth endpoints (OTP for patients, email for doctors) via Supabase Auth
- [ ] Doctor and patient profile routes + controllers
- [ ] Consultation CRUD endpoints
- [ ] Time slot management endpoints
- [ ] Paystack webhook handler

**Week 5–6: Triage Agent**
- [ ] Claude API integration in `packages/agents`
- [ ] Triage conversation flow + system prompt
- [ ] Structured JSON output parsing
- [ ] Red flag detection logic

**Week 7–8: Mobile App (Patient)**
- [ ] Onboarding + auth screens
- [ ] Triage chat UI
- [ ] Doctor browse + booking flow
- [ ] Paystack payment flow
- [ ] Consultation view (async thread + Meet link)
- [ ] Past consultations list

**Week 9–10: Doctor Dashboard**
- [ ] Auth + onboarding
- [ ] Consultation queue + workspace
- [ ] Availability / slot management
- [ ] Response + prescription upload

**Week 11–12: Testing & Beta**
- [ ] End-to-end testing of full consult loop
- [ ] Onboard 5–10 pilot doctors
- [ ] Invite 20–30 beta patients (friends, family, network)
- [ ] Fix critical bugs
- [ ] Collect feedback, iterate

---

## What Stage 2 Looks Like (Don't Build Yet)

Just so it's in view:

- Lab test booking (partner with Synlab / Lancet)
- Medication delivery (partner pharmacy)
- Automated Google Meet link generation
- Automated doctor payouts
- Results interpreter agent
- Medication adherence agent
- Multi-language support (Yoruba, Hausa, Pidgin)
- App Store / Play Store public launch

---

*Document version: 0.1*
*Stage: MVP / Pre-launch*
*Last updated: March 2026*
