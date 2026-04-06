# Ogwu — MVP Specification (Clinic Co-Pilot)

## Goal

Validate a simple loop for Nigeria (and similar markets): patients can complete a short intake, get a clinic-ready summary, and share it with a clinician to speed up triage and reduce back-and-forth.

## MVP Scope (what we are building)

### Patient (Mobile app — Expo)

- Phone OTP sign in (Supabase Auth)
- Profile onboarding
  - First/middle/last name
  - Date of birth
  - Biological sex
  - Optional: known conditions + allergies
- Multi-language UI: en/es/fr/ig/yo/ha
- Quick intake (triage)
  - Up to 5 questions (rule-based selection)
  - Emergency signal detection (basic keyword heuristics)
  - Completion produces:
    - AI-generated summary + user-directed safety note (OpenAI)
    - Urgency tier: `routine | soon | urgent | emergency`
- Intake results screen
  - Displays urgency + summary + Q/A
  - One-tap “Share for clinic” text

### Clinician workflow (out of product)

For MVP: the clinician receives the shared intake text via WhatsApp/SMS/email and uses it to triage faster.

## Explicitly NOT in MVP (yet)

- Doctor web dashboard
- Consultation booking, payments (Paystack), and consult messaging
- Medication delivery, lab booking, imaging
- Full medical device-grade decision support
- Offline-first / USSD / SMS-only patient flows

## Product Flow

1. Patient signs in with phone OTP
2. Patient completes profile onboarding
3. Patient completes quick intake (max 5 Qs)
4. App shows Intake Results:
   - Urgency tier
   - Summary
   - Questions + answers
5. Patient taps “Share for clinic” and sends to a clinician

## Urgency Tiers (MVP definition)

- `routine`: mild symptoms, stable course, no red flags detected
- `soon`: moderate symptoms or “getting worse” signals; needs timely review
- `urgent`: severe symptom signals (e.g. high severity, concerning keywords)
- `emergency`: high-risk red flags detected; app should advise emergency care

Note: this is a **heuristic classification** to help route attention, not a diagnosis.

## Repo Structure

```
ogwu/
├── mobile/          # Expo React Native app
├── backend/         # Node/Express API
└── supabase/        # Supabase migrations & config
```

## Data Model (MVP)

### `profiles`

Stores patient profile fields used during intake.

### `triage_intakes`

Stores one “latest” intake per user (updated on completion):

- `user_id`
- `locale`
- `answers` (JSON array of `{ q, a }`)
- `summary` (text)
- `safety_note` (text)
- `urgency` (`routine | soon | urgent | emergency`)
- timestamps

## Success Metrics (early)

- % of signed-in users who complete intake
- % of completed intakes shared to a clinician
- Clinician feedback: “was this useful?” (qualitative)
- Time-to-triage reduction (self-reported initially)
