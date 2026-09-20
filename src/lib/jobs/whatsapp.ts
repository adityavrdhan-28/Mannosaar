import { randomUUID } from 'node:crypto';
import { check, db, log, rpc } from '../whatsapp/server';
import { retryDelay, slotEndInstant, slotInstant, type Job } from '../whatsapp/core';
import { converse } from '../whatsapp/conversation';
import { send } from '../whatsapp/client';
import { textMessage, type TemplateName } from '../whatsapp/messages';
import { settlePayment } from '../payments/whatsapp';
import { syncCalendar, type Therapist } from '../google-calendar/whatsapp';

export async function processJob(job: Job) {
  if (job.type === 'INBOUND') return converse(job);
  if (job.type === 'SEND') return send(job);
  if (job.type === 'PAYMENT') return settlePayment(String(job.payload.txnid));
  if (!['CALENDAR', 'NOTIFY'].includes(job.type)) throw new Error('UNKNOWN_JOB');
  const result = await db().from('bookings').select('*').eq('id', job.payload.booking).single(); check(result.error);
  const booking = result.data!;
  const slot = await db().from('therapy_slots').select('therapist_id').eq('id', booking.slot_id).single(); check(slot.error);
  const therapist = await db().from('whatsapp_therapists').select('*').eq('therapist_id', slot.data!.therapist_id).single(); check(therapist.error);
  if (job.type === 'CALENDAR') {
    if (['CONFIRMED', 'CANCELLED'].includes(booking.fulfillment_status)) return;
    let calendarBooking = booking;
    if (booking.fulfillment_status === 'RESCHEDULE_PENDING') {
      const hold = await db().from('booking_holds').select('slot_id').eq('booking_id', booking.id).eq('status', 'RESCHEDULE').single(); check(hold.error);
      const target = await db().from('therapy_slots').select('date,start_time,end_time').eq('id', hold.data!.slot_id).single(); check(target.error);
      calendarBooking = { ...booking, slot_date: target.data!.date, slot_start_time: target.data!.start_time, slot_end_time: target.data!.end_time };
    }
    const pinnedTherapist = { ...therapist.data, calendar_id: booking.google_calendar_id || therapist.data!.calendar_id, oauth_user_id: booking.google_oauth_user_id || therapist.data!.oauth_user_id } as Therapist;
    const calendar = await syncCalendar(pinnedTherapist, calendarBooking);
    const offsets = (process.env.WHATSAPP_REMINDER_MINUTES || '1440,60').split(',').map(Number);
    if (offsets.some(n => !Number.isInteger(n) || n < 1 || n > 10080)) throw new Error('REMINDER_CONFIG_INVALID');
    await rpc('wa_finish_calendar', { p_booking: booking.id, p_version: booking.booking_version, p_event: calendar.event, p_calendar: pinnedTherapist.calendar_id, p_meet: calendar.meet, p_offsets: offsets });
    log('BOOKING_CALENDAR_SYNCED', booking.id);
    return;
  }
  if (booking.booking_version !== job.payload.version) return;
  const template = job.payload.template as TemplateName;
  const cancelled = template === 'booking_cancelled';
  if ((!cancelled && booking.fulfillment_status !== 'CONFIRMED') || (cancelled && booking.fulfillment_status !== 'CANCELLED')) return;
  if (template.startsWith('booking_reminder') && Date.parse(slotInstant(booking.slot_date, booking.slot_start_time)) <= Date.now()) return;
  const payment = await db().from('whatsapp_payments').select('session_id').eq('booking_id', booking.id).single(); check(payment.error);
  const when = `${booking.slot_date} at ${booking.slot_start_time.slice(0, 5)} IST`;
  const title = cancelled ? 'Your Mannosaar session is cancelled.' : template === 'booking_rescheduled' ? 'Your Mannosaar session has been rescheduled.' : template.startsWith('booking_reminder') ? 'A reminder of your upcoming Mannosaar session.' : '✅ Your Mannosaar session is confirmed';
  const duration = Math.round((Date.parse(slotEndInstant(booking.slot_date, booking.slot_start_time, booking.slot_end_time)) - Date.parse(slotInstant(booking.slot_date, booking.slot_start_time))) / 60000);
  const body = `${title}\n\nTherapist: ${therapist.data!.display_name}\n${when}\nDuration: ${duration} minutes${cancelled ? '\nAny eligible refund is being processed.' : `\nPayment: Successful\n\nJoin your session:\n${booking.meeting_link}`}\n\nReply “manage” to view, reschedule or cancel your booking.`;
  // Always use approved utility templates for scheduled notifications; body parameter schema is centralized.
  await send({ ...job, payload: { ...job.payload, session: payment.data!.session_id, message: textMessage(body), template, forceTemplate: true, values: cancelled ? [therapist.data!.display_name, when] : [therapist.data!.display_name, when, `${duration} minutes`, booking.meeting_link] } });
}
export async function runJobs(budgetMs = 40_000) {
  const owner = randomUUID();
  if (!await rpc<boolean>('wa_worker_acquire', { p_owner: owner })) return { processed: 0, busy: true };
  const start = Date.now(); let processed = 0;
  try {
    await rpc('wa_maintenance');
    while (Date.now() - start < budgetMs) {
      const jobs = await rpc<Job[]>('wa_claim_job', { p_owner: owner });
      if (!jobs.length) break;
      const job = jobs[0];
      try {
        await processJob(job);
        check((await db().from('background_jobs').update({ status: 'DONE', payload: job.type === 'NOTIFY' ? job.payload : {}, last_error: null, locked_until: null, updated_at: new Date().toISOString() }).eq('id', job.id)).error);
        processed++;
      } catch (error) {
        // Persist only controlled codes, never provider response bodies or patient content.
        const raw = error instanceof Error ? error.message : 'JOB_FAILED';
        const code = /^[A-Za-z0-9_]+$/.test(raw) ? raw.toUpperCase() : 'JOB_FAILED';
        const dead = job.attempts >= job.max_attempts || ['DELIVERY_UNCERTAIN', 'CUSTOMER_WINDOW_EXPIRED'].includes(code);
        check((await db().from('background_jobs').update({ status: dead ? 'DEAD' : 'PENDING', last_error: code, locked_until: null, next_attempt_at: new Date(Date.now() + retryDelay(job.attempts) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('id', job.id)).error);
        log(dead ? 'WHATSAPP_JOB_NEEDS_ATTENTION' : 'WHATSAPP_JOB_RETRY', job.id);
      }
    }
    return { processed, busy: false };
  } finally { await rpc('wa_worker_release', { p_owner: owner }); }
}
