import { randomUUID } from 'node:crypto';
import { protectToken, revealToken } from './token-protection';
import { check, db, required } from '../whatsapp/server';
import { slotEndInstant, slotInstant } from '../whatsapp/core';
export interface Therapist { therapist_id: string; oauth_user_id: string; display_name: string; focus: string; calendar_id: string; services: string[]; timezone: string }
export interface CalendarBooking { id: string; booking_version: number; slot_date: string; slot_start_time: string; slot_end_time: string; google_calendar_event_id?: string; fulfillment_status: string }
interface GoogleEvent { id: string; hangoutLink?: string; status?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[]; createRequest?: { status?: { statusCode: string } } } }
async function token(therapist: Therapist) {
  const { data: creds, error } = await db().from('google_oauth_credentials').select('access_token,refresh_token,token_expiry').eq('user_id', therapist.oauth_user_id).single();
  check(error);
  if (!creds) throw new Error('GOOGLE_NOT_CONNECTED');
  if (Date.parse(creds.token_expiry) > Date.now() + 60_000) return revealToken(creds.access_token);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(12_000),
    body: new URLSearchParams({ client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), refresh_token: revealToken(creds.refresh_token), grant_type: 'refresh_token' }),
  });
  if (!response.ok) throw new Error(`GOOGLE_TOKEN_${response.status}`);
  const result = await response.json();
  if (!result.access_token) throw new Error('GOOGLE_TOKEN_INVALID');
  const update = await db().from('google_oauth_credentials').update({ access_token: protectToken(result.access_token), token_expiry: new Date(Date.now() + result.expires_in * 1000).toISOString() }).eq('user_id', therapist.oauth_user_id);
  check(update.error);
  return result.access_token as string;
}
async function request(therapist: Therapist, path: string, init?: RequestInit) {
  return fetch(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${await token(therapist)}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
}
export async function freeBusy(therapist: Therapist, start: string, end: string): Promise<{ start: string; end: string }[]> {
  const response = await request(therapist, 'freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: start, timeMax: end, timeZone: therapist.timezone, items: [{ id: therapist.calendar_id }] }) });
  if (!response.ok) throw new Error(`GOOGLE_FREEBUSY_${response.status}`);
  const result = await response.json();
  const calendar = result.calendars?.[therapist.calendar_id];
  if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error('GOOGLE_FREEBUSY_UNAVAILABLE');
  return calendar.busy;
}
export async function syncCalendar(therapist: Therapist, booking: CalendarBooking): Promise<{ event: string; meet: string }> {
  const eventId = booking.google_calendar_event_id || `mn${booking.id.replaceAll('-', '')}`;
  const base = `calendars/${encodeURIComponent(therapist.calendar_id)}/events`;
  const path = `${base}/${encodeURIComponent(eventId)}`;
  if (booking.fulfillment_status === 'CANCEL_PENDING') {
    const response = await request(therapist, path, { method: 'DELETE' });
    if (!response.ok && ![404, 410].includes(response.status)) throw new Error(`GOOGLE_DELETE_${response.status}`);
    return { event: eventId, meet: '' };
  }
  const body = {
    summary: 'Mannosaar Session', visibility: 'private',
    start: { dateTime: slotInstant(booking.slot_date, booking.slot_start_time), timeZone: therapist.timezone },
    end: { dateTime: slotEndInstant(booking.slot_date, booking.slot_start_time, booking.slot_end_time), timeZone: therapist.timezone },
  };
  let response: Response;
  if (booking.fulfillment_status === 'RESCHEDULE_PENDING') {
    response = await request(therapist, `${path}?conferenceDataVersion=1`, { method: 'PATCH', body: JSON.stringify(body) });
  } else {
    // Recover an existing deterministic event before checking busy time: its own event is busy too.
    response = await request(therapist, path);
    if (response.status === 404) {
      const busy = await freeBusy(therapist, body.start.dateTime, body.end.dateTime);
      if (busy.length) throw new Error('GOOGLE_SLOT_BECAME_BUSY');
      response = await request(therapist, `${base}?conferenceDataVersion=1`, { method: 'POST', body: JSON.stringify({ ...body, id: eventId, conferenceData: { createRequest: { requestId: eventId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }) });
      if (response.status === 409) response = await request(therapist, path);
    }
  }
  if (!response.ok) throw new Error(`GOOGLE_EVENT_${response.status}`);
  const event: GoogleEvent = await response.json();
  if (event.conferenceData?.createRequest?.status?.statusCode === 'failure') {
    const retry = await request(therapist, `${path}?conferenceDataVersion=1`, { method: 'PATCH', body: JSON.stringify({ conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }) });
    if (!retry.ok) throw new Error(`GOOGLE_CONFERENCE_${retry.status}`);
    throw new Error('GOOGLE_MEET_PENDING');
  }
  if (event.status === 'cancelled') throw new Error('GOOGLE_EVENT_EXTERNALLY_CANCELLED');
  const meet = event.hangoutLink || event.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri;
  if (!meet?.startsWith('https://meet.google.com/')) throw new Error('GOOGLE_MEET_PENDING');
  return { event: event.id, meet };
}
