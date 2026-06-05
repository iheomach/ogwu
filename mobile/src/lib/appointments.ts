import { apiGet } from './api';

export type AppointmentRow = {
  id: string;
  hospital_id: string | null;
  starts_at: string;
  created_at: string;
  status: string;
};

export async function fetchAppointments(): Promise<AppointmentRow[]> {
  const res = await apiGet<{ appointments: AppointmentRow[] }>('/api/appointments');
  return Array.isArray(res.appointments) ? res.appointments : [];
}

export function nextFutureAppointment(appts: AppointmentRow[]): AppointmentRow | null {
  const now = new Date().toISOString();
  return appts
    .filter(a => a.status !== 'cancelled' && a.starts_at > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
}
