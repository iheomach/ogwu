import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
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
  narrative: string;
};

export async function fetchReport(): Promise<ReportData> {
  return apiGet<ReportData>('/api/report');
}

function computeAge(dobIso: string | null): number | null {
  if (!dobIso) return null;
  const d = new Date(dobIso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

function urgencyColor(urgency: string): string {
  switch (urgency?.toLowerCase()) {
    case 'emergency': return '#dc2626';
    case 'urgent':    return '#ea580c';
    case 'soon':      return '#d97706';
    default:          return '#16a34a';
  }
}

function urgencyLabel(urgency: string): string {
  switch (urgency?.toLowerCase()) {
    case 'emergency': return 'EMERGENCY — Seek care immediately';
    case 'urgent':    return 'URGENT — See a doctor today';
    case 'soon':      return 'SOON — See a doctor this week';
    default:          return 'ROUTINE — Monitor symptoms';
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1')     // italic
    .replace(/^#{1,6}\s+/gm, '')    // headings
    .replace(/^\s*[-*]\s+/gm, '')   // list markers
    .trim();
}

// Parses the LLM narrative into labelled sections
function parseNarrative(text: string): Array<{ heading: string; body: string }> {
  const HEADINGS = [
    'CHIEF COMPLAINT',
    'HISTORY OF PRESENT ILLNESS',
    'REVIEW OF SYSTEMS',
    'PAST MEDICAL & SURGICAL HISTORY',
    'ALLERGIES & ADVERSE REACTIONS',
    'CLINICAL IMPRESSION',
    'RECOMMENDED NEXT STEPS',
  ];

  const sections: Array<{ heading: string; body: string }> = [];
  let remaining = text;

  for (let i = 0; i < HEADINGS.length; i++) {
    const heading = HEADINGS[i];
    const nextHeading = HEADINGS[i + 1];
    const start = remaining.indexOf(heading);
    if (start === -1) continue;
    const afterHeading = remaining.slice(start + heading.length).trimStart();
    const end = nextHeading ? afterHeading.indexOf(nextHeading) : -1;
    const body = (end === -1 ? afterHeading : afterHeading.slice(0, end)).trim();
    sections.push({ heading, body });
    remaining = end === -1 ? '' : afterHeading.slice(end);
  }

  return sections;
}

function narrativeHtml(narrative: string): string {
  const sections = parseNarrative(stripMarkdown(narrative));
  if (sections.length === 0) {
    return `<p class="body">${narrative.replace(/\n/g, '<br/>')}</p>`;
  }
  return sections.map(({ heading, body }) => `
    <div class="section">
      <h3 class="section-heading">${heading}</h3>
      <p class="body">${body.replace(/\n/g, '<br/>')}</p>
    </div>
  `).join('');
}

export function buildReportHtml(data: ReportData): string {
  const { profile, intake, appointments, narrative } = data;

  const fullName = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')
    : 'Unknown';
  const age = profile ? computeAge(profile.dob) : null;
  const generated = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const urgency = intake?.urgency ?? 'routine';
  const uColor = urgencyColor(urgency);
  const uLabel = urgencyLabel(urgency);

  const appointmentsHtml = appointments.length > 0
    ? appointments.map((a) => `
        <tr>
          <td>${fmt(a.starts_at)}</td>
          <td>${a.hospital_name ?? '—'}</td>
          <td>${a.reason ?? '—'}</td>
          <td>${a.status}</td>
          <td>${a.duration_minutes} min</td>
        </tr>`).join('')
    : `<tr><td colspan="5" style="color:#6b7280;font-style:italic;">No appointments on record</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>OgwuAI Patient Report — ${fullName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #111827; background: #fff; padding: 40px 48px; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 24px; }
  .header-left h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
  .header-left p { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .header-right { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.6; }

  .urgency-banner { border-left: 4px solid ${uColor}; background: ${uColor}18; padding: 10px 14px; border-radius: 4px; margin-bottom: 24px; }
  .urgency-banner span { font-weight: 700; color: ${uColor}; font-size: 11.5px; letter-spacing: 0.3px; }

  .demographics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin-bottom: 28px; }
  .demo-item label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; display: block; margin-bottom: 2px; }
  .demo-item span { font-size: 12.5px; font-weight: 600; color: #111827; }

  h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 14px; margin-top: 28px; break-after: avoid; page-break-after: avoid; }
  .section { margin-bottom: 16px; break-inside: avoid; page-break-inside: avoid; }
  .section-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #4b5563; margin-bottom: 5px; }
  .body { font-size: 12px; line-height: 1.7; color: #1f2937; }

  .demographics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin-bottom: 28px; break-inside: avoid; page-break-inside: avoid; }
  .urgency-banner { border-left: 4px solid ${uColor}; background: ${uColor}18; padding: 10px 14px; border-radius: 4px; margin-bottom: 24px; break-inside: avoid; page-break-inside: avoid; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
  thead tr { background: #f3f4f6; }
  th { text-align: left; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
  td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
  tr { break-inside: avoid; page-break-inside: avoid; }

  .footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #111827; line-height: 1.6; break-inside: avoid; page-break-inside: avoid; }
  .footer strong { color: #111827; }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>Patient Summary Report</h1>
      <p>Prepared by OgwuAI Health Assistant &mdash; For clinical use only</p>
    </div>
    <div class="header-right">
      <div><strong>Report date:</strong> ${generated}</div>
      ${intake ? `<div><strong>Check-in date:</strong> ${fmt(intake.updated_at)}</div>` : ''}
      <div><strong>Confidential</strong></div>
    </div>
  </div>

  <!-- Urgency banner -->
  <div class="urgency-banner">
    <span>&#9679; ${uLabel}</span>
  </div>

  <!-- Demographics -->
  <div class="demographics">
    <div class="demo-item"><label>Full name</label><span>${fullName || '—'}</span></div>
    <div class="demo-item"><label>Date of birth</label><span>${profile?.dob ? fmt(profile.dob) : '—'}${age !== null ? ` (${age} yrs)` : ''}</span></div>
    <div class="demo-item"><label>Biological sex</label><span>${profile?.biological_sex || '—'}</span></div>
    <div class="demo-item"><label>Known conditions</label><span>${profile?.known_conditions?.trim() || 'None reported'}</span></div>
    <div class="demo-item"><label>Allergies</label><span>${profile?.allergies?.trim() || 'None reported'}</span></div>
  </div>

  <!-- Clinical narrative (LLM-generated) -->
  <h2>Clinical Summary</h2>
  ${narrativeHtml(narrative)}

  ${intake && intake.answers.length > 0 ? `
  <!-- Raw Q&A -->
  <h2>Health Check-In — Full Responses</h2>
  <table>
    <thead><tr><th>#</th><th>Question</th><th>Response</th></tr></thead>
    <tbody>
      ${intake.answers.map((qa, i) => `
        <tr>
          <td style="width:28px;color:#9ca3af;">${i + 1}</td>
          <td>${qa.q}</td>
          <td>${qa.a || '—'}</td>
        </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <!-- Appointments -->
  <h2>Appointment History</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Hospital</th><th>Reason</th><th>Status</th><th>Duration</th></tr>
    </thead>
    <tbody>${appointmentsHtml}</tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <strong>Disclaimer:</strong> This report was generated by OgwuAI, an AI-powered health assistant. The clinical summary is synthesised from patient-reported information and is intended to support — not replace — clinical assessment. All findings should be verified by a qualified healthcare provider. This document does not constitute a diagnosis or medical advice.
  </div>

</body>
</html>`;
}

export async function shareReportAsPdf(data: ReportData, patientName: string): Promise<void> {
  const html = buildReportHtml(data);
  const { uri: tmpUri } = await Print.printToFileAsync({ html, base64: false });

  const dateSuffix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const safeName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `OgwuAI_Report_${safeName}_${dateSuffix}.pdf`;
  const destUri = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.copyAsync({ from: tmpUri, to: destUri });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(destUri, {
      mimeType: 'application/pdf',
      dialogTitle: `OgwuAI Report — ${patientName}`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri: destUri });
  }
}
