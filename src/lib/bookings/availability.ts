import { check, db } from '../whatsapp/server';
import { overlaps, slotEndInstant, slotInstant } from '../whatsapp/core';
import { freeBusy, type Therapist } from '../google-calendar/whatsapp';
import { getCurrentDateString } from '../time';
export interface AvailableSlot { id: string; date: string; start_time: string; end_time: string; therapist_id: string; duration_minutes: number }
export async function therapists(service?: string): Promise<Therapist[]> {
  let query = db().from('whatsapp_therapists').select('*').eq('active', true).order('display_name');
  if (service) query = query.contains('services', [service]);
  const { data, error } = await query; check(error); return data || [];
}
export async function availableSlots(therapistId: string, date?: string): Promise<AvailableSlot[]> {
  const therapist = (await therapists()).find(t => t.therapist_id === therapistId);
  if (!therapist) throw new Error('THERAPIST_UNAVAILABLE');
  const startDate = date || getCurrentDateString();
  const endDate = date || new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const start = slotInstant(startDate, '00:00:00');
  const end = new Date(Date.parse(slotInstant(endDate, '00:00:00')) + 86400_000).toISOString();
  const results = await Promise.all([
    db().from('therapy_slots').select('id,date,start_time,end_time,therapist_id,duration_minutes').eq('therapist_id', therapistId).eq('is_available', true).eq('is_blocked', false).gte('date', startDate).lte('date', endDate).order('date').order('start_time'),
    db().from('booking_reservations').select('slot_id,span,hold:booking_holds(status,expires_at)').eq('therapist_id', therapistId).overlaps('span', `[${start},${end})`),
    db().from('block_schedules').select('start_date,end_date,block_type,start_time,end_time').lte('start_date', endDate).gte('end_date', startDate),
  ]);
  results.forEach(result => check(result.error));
  const busy = await freeBusy(therapist, start, end);
  const reservations = results[1].data || [];
  const ranges = reservations.flatMap(r => {
    const hold = Array.isArray(r.hold) ? r.hold[0] : r.hold;
    if (hold?.status === 'ACTIVE' && Date.parse(hold.expires_at) <= Date.now()) return [];
    const bounds = String(r.span).slice(1, -1).split(',').map(s => s.replaceAll('"', ''));
    return [{ start: bounds[0], end: bounds[1] }];
  });
  return (results[0].data || []).filter(slot => {
    const span = { start: slotInstant(slot.date, slot.start_time), end: slotEndInstant(slot.date, slot.start_time, slot.end_time) };
    return Date.parse(span.start) >= Date.now() + 4 * 3600_000 && Date.parse(span.end) > Date.parse(span.start) &&
      ![...busy, ...ranges].some(range => overlaps(span, range)) &&
      !(results[2].data || []).some(block => slot.date >= block.start_date && slot.date <= block.end_date && (block.block_type === 'full_day' || (slot.start_time < block.end_time && block.start_time < slot.end_time)));
  });
}
