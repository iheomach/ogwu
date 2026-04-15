import { apiGet } from './api';

export type ReportData = {
  profile: {
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    dob: string | null;
    biological_sex: string | null;
    allergies: string | null;
    known_conditions: string | null;
  } | null;
  intake: {
    urgency: string;
    summary: string | null;
    safety_note: string | null;
    answers: Array<{ q: string; a: string }>;
    updated_at: string;
  } | null;
  consults: Array<{
    complaint: string;
    urgency: string;
    symptoms: string[];
    recommended_specialty: string | null;
    care_pathway: string;
    created_at: string;
  }>;
  appointments: Array<{
    starts_at: string;
    duration_minutes: number;
    status: string;
    meeting_url: string | null;
    reason: string | null;
    hospital_name: string | null;
    created_at: string;
  }>;
};

export async function fetchReport(): Promise<ReportData> {
  return apiGet<ReportData>('/api/report');
}

function computeAge(dobIso: string | null): number | null {
  if (!dobIso) return null;
  const d = new Date(dobIso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

const DIV = '─────────────────────────────';

export function buildReportText(data: ReportData): string {
  const lines: string[] = [];
  const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  lines.push('OGWU HEALTH REPORT');
  lines.push(`Generated: ${now}`);
  lines.push(DIV);

  // ── Patient ──────────────────────────────────────────
  lines.push('');
  lines.push('PATIENT');
  if (data.profile) {
    const { first_name, middle_name, last_name, dob, biological_sex, allergies, known_conditions } = data.profile;
    const name = [first_name, middle_name, last_name].filter(Boolean).join(' ');
    if (name) lines.push(`Name: ${name}`);
    if (dob) {
      const age = computeAge(dob);
      lines.push(`Date of birth: ${fmt(dob)}${age !== null ? ` (${age} years)` : ''}`);
    }
    if (biological_sex) lines.push(`Sex: ${biological_sex}`);
    lines.push(`Allergies: ${allergies?.trim() || 'None reported'}`);
    lines.push(`Conditions: ${known_conditions?.trim() || 'None reported'}`);
  } else {
    lines.push('Profile not available');
  }

  // ── Triage Intake ────────────────────────────────────
  lines.push('');
  lines.push(DIV);
  lines.push('');
  lines.push('TRIAGE INTAKE');
  if (data.intake) {
    lines.push(`Urgency: ${data.intake.urgency.toUpperCase()}`);
    if (data.intake.updated_at) lines.push(`Assessment date: ${fmt(data.intake.updated_at)}`);
    if (data.intake.summary) {
      lines.push('');
      lines.push('Summary:');
      lines.push(data.intake.summary);
    }
    if (data.intake.safety_note) {
      lines.push('');
      lines.push('Safety note:');
      lines.push(data.intake.safety_note);
    }
    if (data.intake.answers.length > 0) {
      lines.push('');
      lines.push('Q&A:');
      data.intake.answers.forEach((qa, i) => {
        lines.push(`${i + 1}. ${qa.q}`);
        lines.push(`   ${qa.a || '—'}`);
      });
    }
  } else {
    lines.push('No intake on file');
  }

  // ── AI Assistant Sessions ────────────────────────────
  if (data.consults.length > 0) {
    lines.push('');
    lines.push(DIV);
    lines.push('');
    lines.push('AI ASSISTANT SESSIONS');
    data.consults.forEach((c, i) => {
      lines.push('');
      lines.push(`[${i + 1}] ${fmt(c.created_at)}`);
      lines.push(`Urgency: ${c.urgency.toUpperCase()}`);
      lines.push(`Complaint: ${c.complaint}`);
      if (c.symptoms?.length > 0) lines.push(`Symptoms: ${c.symptoms.join(', ')}`);
      if (c.recommended_specialty) lines.push(`Recommended specialty: ${c.recommended_specialty}`);
      if (c.care_pathway) {
        lines.push('Care pathway:');
        lines.push(c.care_pathway);
      }
    });
  }

  // ── Appointments ─────────────────────────────────────
  if (data.appointments.length > 0) {
    lines.push('');
    lines.push(DIV);
    lines.push('');
    lines.push('APPOINTMENTS');
    data.appointments.forEach((a, i) => {
      lines.push('');
      lines.push(`[${i + 1}] ${fmt(a.starts_at)}`);
      if (a.hospital_name) lines.push(`Hospital: ${a.hospital_name}`);
      lines.push(`Duration: ${a.duration_minutes} min`);
      lines.push(`Status: ${a.status}`);
      if (a.reason) lines.push(`Reason: ${a.reason}`);
    });
  }

  // ── Footer ──────────────────────────────────────────
  lines.push('');
  lines.push(DIV);
  lines.push('Powered by Ogwu — AI Health Assistant');

  return lines.join('\n');
}
