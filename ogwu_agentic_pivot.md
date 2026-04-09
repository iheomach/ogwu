# Ogwu — Agentic Pivot Spec

## Context

Ogwu is an AI-powered telemedicine app targeting Nigeria and emerging markets.
Stack: React Native/Expo (patient app), Next.js (doctor dashboard), Node.js +
Express (backend), Supabase (Postgres + auth + storage), Railway (backend
hosting), Vercel (dashboard), Paystack (payments), Turborepo monorepo.

The current app has Home, New Consult, Records, and Profile pages functioning
as basic CRUD. This document specifies the pivot to a fully agentic architecture.

---

## Why the pivot

The original design was doctor-centric: patients submit consults, doctors review
and respond. This breaks down in underdeveloped markets because:

- Individual doctor profiles are nearly impossible to source and verify
- Doctor availability is unpredictable
- Patients need immediate triage guidance, not a queue

The new model makes the **AI the primary care layer**. Doctors can still be
onboarded as partners later, but the core value is delivered by the agent
without requiring a doctor to be present.

---

## What "agentic" means here

The app is currently **deterministic**: every action is explicit and
human-initiated. Patient fills a form → data saved → doctor reviews.

**Agentic** means the AI takes actions autonomously based on reasoning:

| Deterministic (current) | Agentic (target) |
|---|---|
| Patient fills triage form | Patient chats naturally, AI extracts structured data |
| App shows static hospital list | AI queries the hospitals table and decides what to recommend |
| Doctor reviews and responds | AI drafts care pathway, flags urgency, pre-fills consult record |
| Patient navigates manually | AI proactively surfaces follow-up reminders |

The key mechanism is **tools** — functions the AI can *choose to call* based on
what the conversation needs. That's what makes it non-deterministic.

---

## Framework: Vercel AI SDK

**Use Vercel AI SDK.** It is the correct choice for this stack.

- Works with React Native (Expo) and Next.js
- First-class `tools` support — define functions, the model decides when to call them
- Streaming built in
- `useChat` hook works on both mobile and web
- TypeScript-native, actively maintained

Do **not** use LangChain.js (too complex for this stage) or OpenAI Assistants
API (vendor lock-in, added latency).

### Installation

```bash
# In the Expo patient app
npx expo install ai @ai-sdk/openai zod

# In the Next.js doctor dashboard
npm install ai @ai-sdk/openai zod

# In the Express backend
npm install ai @ai-sdk/openai zod
```

---

## Revised page structure

```
Patient App (React Native/Expo)
├── Home
│   └── Summary cards: recent consult, urgent flags, quick-start chat
├── AI Health Assistant          ← replaces "New Consult" + "Find Doctor"
│   ├── Conversational triage
│   ├── Care pathway output
│   └── Hospital recommendations (agent-driven, not a static list)
├── My Records
│   └── Past consults (AI-generated summaries, uploadable lab results)
└── Profile
    └── Sex, age, allergies, existing conditions
        (injected into every agent context — never re-asked in chat)
```

The **"Find a Doctor"** page is removed. It is replaced by **"Find Care"** —
the output of the agent, not a static directory.

---

## The agent system prompt

This is the backbone of the agent. It is built dynamically per-request by
injecting the patient's profile so the model never asks for information it
already has.

```typescript
// backend/src/lib/buildSystemPrompt.ts

export function buildSystemPrompt(profile: PatientProfile): string {
  return `
You are Ogwu, an AI health assistant for patients in Nigeria and emerging markets.

Patient profile (do NOT ask the patient to repeat any of this):
- Sex: ${profile.sex}
- Age: ${profile.age ?? "not provided"}
- Allergies: ${profile.allergies?.join(", ") || "none reported"}
- Existing conditions: ${profile.conditions?.join(", ") || "none reported"}
- Location: ${profile.state}, Nigeria

Your responsibilities:
1. Understand the patient's complaint through natural conversation.
2. Ask focused clarifying questions — do not overwhelm the patient.
3. Triage urgency: emergency / urgent / routine / self_care.
4. Recommend a care pathway with clear next steps.
5. If a facility visit is needed, use the searchHospitals tool to find
   appropriate hospitals — do not recommend facilities from memory.
6. Once triage is complete, use the createConsult tool to save a structured
   record automatically — do not ask the patient to do this.
7. If symptoms suggest an emergency, call flagEmergency immediately and
   communicate this clearly to the patient before anything else.

Tone: clear, calm, empathetic. Avoid medical jargon unless necessary.
Never diagnose definitively. Always recommend professional confirmation.
If the patient is in distress, prioritize emotional acknowledgment before
clinical information.
`.trim();
}
```

---

## The five MVP tools

These are the only tools needed for MVP. The model decides when to call each one.

### 1. `searchHospitals`
Queries the Supabase hospitals table by specialty, state, tier, and emergency
capability. Called when triage determines a facility visit is needed.

### 2. `createConsult`
Writes a structured consult record to Supabase after triage is complete.
Called automatically by the agent — the patient never has to tap "save."

### 3. `flagEmergency`
Triggered when symptoms suggest an emergency. Surfaces emergency contacts and
a clear call to action in the UI. Can later trigger a push notification.

### 4. `getPatientHistory`
Pulls the patient's prior consults so the agent knows if a complaint is
recurring or worsening. Prevents the agent from treating everything as a
first presentation.

### 5. `checkDrugInteraction`
Given a medication name plus the patient's allergies and existing conditions
(already in profile), flags potential risks. Useful for the medication guidance
use case.

---

## Backend agent route

```typescript
// backend/src/routes/agent.ts

import { streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { buildSystemPrompt } from "../lib/buildSystemPrompt";
import { supabase } from "../lib/supabase";

export async function agentChatHandler(req: Request): Promise<Response> {
  const { messages, patientProfile } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: buildSystemPrompt(patientProfile),
    messages,
    maxSteps: 5, // allows multi-step reasoning: triage → search → save
    tools: {

      searchHospitals: tool({
        description:
          "Search for hospitals by medical specialty and patient location. " +
          "Call this when triage indicates the patient needs a facility visit.",
        parameters: z.object({
          specialty: z.string().describe(
            "Medical specialty needed, e.g. cardiology, nephrology, paediatrics"
          ),
          state: z.string().describe("Nigerian state the patient is in"),
          has_emergency: z.boolean().optional().describe(
            "Set true if the patient needs emergency care"
          ),
          tier: z.number().optional().describe(
            "Hospital tier: 1=primary, 2=secondary, 3=tertiary. " +
            "Default to 3 for serious complaints."
          ),
        }),
        execute: async ({ specialty, state, has_emergency, tier }) => {
          let query = supabase
            .from("hospitals")
            .select("id, name, city, state, type, tier, specialties, phone, website")
            .eq("state", state)
            .eq("is_active", true)
            .contains("specialties", [specialty]);

          if (tier) query = query.eq("tier", tier);
          if (has_emergency) query = query.eq("has_emergency", true);

          const { data, error } = await query.limit(5);
          if (error) return { error: error.message };
          return { hospitals: data };
        },
      }),

      createConsult: tool({
        description:
          "Save a structured consult record once triage is complete. " +
          "Call this automatically — do not ask the patient to initiate saving.",
        parameters: z.object({
          complaint: z.string().describe("The patient's presenting complaint"),
          urgency: z.enum(["emergency", "urgent", "routine", "self_care"]),
          symptoms: z.array(z.string()),
          recommended_specialty: z.string(),
          care_pathway: z.string().describe(
            "Clear next steps for the patient"
          ),
          recommended_hospital_ids: z.array(z.string()).optional(),
        }),
        execute: async (params) => {
          const { data, error } = await supabase
            .from("consults")
            .insert({
              patient_id: patientProfile.id,
              ...params,
              created_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (error) return { success: false, error: error.message };
          return { success: true, consult_id: data.id };
        },
      }),

      flagEmergency: tool({
        description:
          "Flag this consultation as an emergency requiring immediate action. " +
          "Call this as soon as symptoms suggest an emergency — before other tools.",
        parameters: z.object({
          reason: z.string().describe(
            "Why this is classified as an emergency"
          ),
        }),
        execute: async ({ reason }) => {
          // TODO: trigger push notification here
          return {
            flagged: true,
            reason,
            message:
              "Emergency flagged. Patient should call 112 or go to the " +
              "nearest emergency department immediately.",
          };
        },
      }),

      getPatientHistory: tool({
        description:
          "Retrieve the patient's recent consult history. Call this at the " +
          "start of a conversation about a recurring or chronic complaint.",
        parameters: z.object({
          limit: z.number().default(5),
        }),
        execute: async ({ limit }) => {
          const { data, error } = await supabase
            .from("consults")
            .select("id, complaint, urgency, care_pathway, created_at")
            .eq("patient_id", patientProfile.id)
            .order("created_at", { ascending: false })
            .limit(limit);

          if (error) return { error: error.message };
          return { history: data };
        },
      }),

      checkDrugInteraction: tool({
        description:
          "Check if a medication is safe given the patient's allergies and " +
          "existing conditions. The patient profile is already available — " +
          "only pass the medication name.",
        parameters: z.object({
          medication: z.string(),
        }),
        execute: async ({ medication }) => {
          // MVP: simple keyword check against profile
          // Later: integrate an actual drug interaction API
          const risks: string[] = [];

          for (const allergy of patientProfile.allergies ?? []) {
            if (
              medication.toLowerCase().includes(allergy.toLowerCase())
            ) {
              risks.push(`Patient is allergic to ${allergy}`);
            }
          }

          return {
            medication,
            risks,
            safe: risks.length === 0,
            note:
              "This is a basic check only. Always confirm with a pharmacist.",
          };
        },
      }),

    },
  });

  return result.toDataStreamResponse();
}
```

### Wire it up in Express

```typescript
// backend/src/index.ts

import express from "express";
import { agentChatHandler } from "./routes/agent";

const app = express();
app.use(express.json());

app.post("/agent/chat", (req, res) => {
  agentChatHandler(req as any).then((response) => {
    response.body?.pipeTo(
      new WritableStream({
        write(chunk) { res.write(chunk); },
        close() { res.end(); },
      })
    );
  });
});
```

> **Note:** For cleaner streaming in Express, consider using Hono instead of
> Express for this route — it handles Web API `Response` objects natively.
> Or use the `toTextStreamResponse` helper and pipe manually as above.

---

## Patient app: useChat hook

```typescript
// apps/patient/src/screens/HealthAssistantScreen.tsx

import { useChat } from "@ai-sdk/react";
import { fetch as expoFetch } from "expo/fetch";
import { useAuthStore } from "../store/authStore";

export function HealthAssistantScreen() {
  const { profile } = useAuthStore();

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: `${process.env.EXPO_PUBLIC_API_URL}/agent/chat`,
      fetch: expoFetch,  // use Expo's fetch for React Native compatibility
      body: {
        patientProfile: profile,  // sex, age, allergies, conditions injected here
      },
    });

  return (
    <View style={styles.container}>
      <ScrollView>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </ScrollView>
      <TextInput
        value={input}
        onChangeText={(text) =>
          handleInputChange({ target: { value: text } } as any)
        }
        placeholder="Describe what you're feeling..."
      />
      <Button
        title={isLoading ? "Thinking..." : "Send"}
        onPress={handleSubmit}
        disabled={isLoading}
      />
    </View>
  );
}
```

---

## `maxSteps` — how multi-step agency works

`maxSteps: 5` is what makes the agent genuinely agentic. Without it, the model
calls one tool and stops. With it, the model can chain:

```
Step 1: Patient says "chest pain for 2 days, worse when breathing"
Step 2: Agent reasons → high urgency → calls flagEmergency
Step 3: Agent calls searchHospitals (specialty=cardiology, state=Lagos, has_emergency=true)
Step 4: Agent calls createConsult (saves structured record automatically)
Step 5: Agent returns final response to patient with hospital recommendations
```

All of this happens in a single user message. You write zero orchestration logic.

---

## Example agent interaction

**Patient:** I've been having chest pains for the past 2 days, it gets worse
when I breathe deeply.

**Agent (internally):**
1. Triages → urgent/emergency
2. Calls `flagEmergency({ reason: "Pleuritic chest pain, possible pulmonary or cardiac cause" })`
3. Calls `searchHospitals({ specialty: "cardiology", state: "Lagos", has_emergency: true, tier: 3 })`
4. Calls `createConsult({ complaint: "chest pain", urgency: "emergency", ... })`

**Agent (to patient):**
> This needs attention today. Chest pain that worsens with breathing can
> indicate a serious condition affecting your heart or lungs. Based on your
> location in Lagos, here are hospitals with emergency cardiac care:
>
> - **Lagoon Hospital** — Apapa (emergency, cardiology, ICU)
> - **Reddington Hospital** — Lagos Island (emergency, cardiology)
> - **LUTH** — Surulere (emergency, cardiology, teaching hospital)
>
> Please go to the nearest emergency department now. Do you have someone who
> can take you, or do you need help finding directions?

---

## Supabase schema changes needed

### New `consults` table

```sql
CREATE TABLE consults (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                UUID NOT NULL REFERENCES auth.users(id),
  complaint                 TEXT NOT NULL,
  urgency                   TEXT NOT NULL CHECK (urgency IN (
                              'emergency', 'urgent', 'routine', 'self_care'
                            )),
  symptoms                  TEXT[],
  recommended_specialty     TEXT,
  care_pathway              TEXT,
  recommended_hospital_ids  UUID[],
  is_emergency_flagged      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE consults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can read own consults"
  ON consults FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Backend service role can insert consults"
  ON consults FOR INSERT
  WITH CHECK (TRUE);  -- locked down via service role key on backend
```

### Patient profile additions (if not already present)

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allergies TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS conditions TEXT[];
```

---

## Implementation order

1. **Install Vercel AI SDK** across Expo app and Express backend
2. **Create `buildSystemPrompt`** with profile injection
3. **Implement the agent route** with all five tools
4. **Replace the New Consult screen** with `HealthAssistantScreen` using `useChat`
5. **Create the `consults` table** in Supabase with RLS
6. **Remove or repurpose the Find a Doctor page** → rename to "Find Care",
   show the agent's hospital recommendations from the most recent consult
7. **Update the Home screen** to show the most recent consult summary and an
   "Ask Ogwu" CTA that opens the Health Assistant

---

## What to defer (post-MVP)

- Push notifications on `flagEmergency`
- Real drug interaction API (e.g. OpenFDA, DrugBank)
- Doctor-facing dashboard responses to flagged consults
- Proactive follow-up messages ("Your follow-up is overdue")
- Offline-capable triage (for low-connectivity users)
- Voice input (high value for low-literacy patients)

---

## Key design principles to hold

1. **Profile data is never re-asked.** Sex, allergies, conditions are always
   injected into the system prompt. The agent has them from the start.
2. **The agent saves records, not the patient.** `createConsult` is called
   automatically by the agent. No "submit" button for triage.
3. **Hospital recommendations are always live queries.** Never hardcode
   facility names in the system prompt. Always use `searchHospitals` so
   the data stays current as the hospitals table grows.
4. **Urgency is always classified first.** The agent must determine urgency
   before recommending next steps. This is enforced in the system prompt.
5. **`maxSteps: 5` is non-negotiable for MVP.** Without it the agent cannot
   chain triage → search → save in a single turn.
