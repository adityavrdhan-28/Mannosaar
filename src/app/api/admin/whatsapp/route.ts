import { availableSlots } from '@/lib/bookings/availability';
import type { Hold } from '@/lib/payments/whatsapp';
import { NextResponse } from 'next/server';
import { isWhatsAppAdmin } from '@/lib/whatsapp/admin';
import { check, db, origin, rpc } from '@/lib/whatsapp/server';
export async function GET(request: Request) {
  if (!await isWhatsAppAdmin()) return new Response('Forbidden', { status: 403 });
  const therapistId = new URL(request.url).searchParams.get('therapist');
  if (therapistId) return NextResponse.json({ slots: await availableSlots(therapistId) });
  const results = await Promise.all([
    db().from('bookings').select('id,user_id,user_name,user_phone,session_type,slot_date,slot_start_time,status,payment_status,fulfillment_status,google_calendar_event_id,meeting_link,booking_version,slot:therapy_slots(therapist_id)').eq('booking_source', 'WHATSAPP').order('created_at', { ascending: false }).limit(100),
    db().from('whatsapp_payments').select('txnid,amount,status,booking_id,created_at').order('created_at', { ascending: false }).limit(100),
    db().from('background_jobs').select('id,type,status,attempts,last_error,updated_at').eq('status', 'DEAD').order('updated_at', { ascending: false }).limit(100),
    db().from('whatsapp_messages').select('id,booking_id,status,error_code,created_at').eq('direction', 'OUT').order('created_at', { ascending: false }).limit(100),
    db().from('whatsapp_refund_requests').select('*').order('created_at', { ascending: false }).limit(100),
  ]);
  results.forEach(result => check(result.error));
  const therapistRows = await db().from('whatsapp_therapists').select('therapist_id,display_name'); check(therapistRows.error);
  const bookings = (results[0].data || []).map(b => {
    const slot = Array.isArray(b.slot) ? b.slot[0] : b.slot;
    return { ...b, therapist_id: slot?.therapist_id, therapist_name: therapistRows.data?.find(t => t.therapist_id === slot?.therapist_id)?.display_name };
  });
  return NextResponse.json({ bookings, payments: results[1].data, jobs: results[2].data, messages: results[3].data, refunds: results[4].data }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  if (!await isWhatsAppAdmin() || request.headers.get('origin') !== origin()) return new Response('Forbidden', { status: 403 });
  const body = await request.json();
  if (['cancel','reschedule'].includes(body.action)) {
    if (typeof body.id !== 'string') return new Response('Invalid booking', { status: 400 });
    const payment = await db().from('whatsapp_payments').select('session_id,booking:bookings(id,slot_id,fulfillment_status,booking_version)').eq('booking_id', body.id).single(); check(payment.error);
    const booking = Array.isArray(payment.data!.booking) ? payment.data!.booking[0] : payment.data!.booking;
    if (!booking) return new Response('Booking unavailable', { status: 404 });
    let hold: Hold | undefined;
    if (body.action === 'reschedule') {
      if (booking.fulfillment_status === 'RESCHEDULE_PENDING') return NextResponse.json({ queued: true });
      const slot = await db().from('therapy_slots').select('therapist_id').eq('id', booking.slot_id).single(); check(slot.error);
      if (!(await availableSlots(slot.data!.therapist_id)).some(s => s.id === body.slotId)) return new Response('Slot unavailable', { status: 409 });
      hold = await rpc<Hold>('wa_hold', { p_session: payment.data!.session_id, p_slot: body.slotId, p_key: `admin:${booking.id}:${booking.booking_version}:${body.slotId}` });
    }
    await rpc('wa_manage', { p_session: payment.data!.session_id, p_booking: booking.id, p_action: body.action, p_hold: hold?.id || null });
    return NextResponse.json({ queued: true });
  }
  if (body.action !== 'retry' || typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)) return new Response('Invalid action', { status: 400 });
  const job = await db().from('background_jobs').select('status,last_error').eq('id', body.id).single(); check(job.error);
  if (job.data?.status !== 'DEAD' || job.data.last_error === 'DELIVERY_UNCERTAIN') return new Response('Review delivery in Meta before resolving an uncertain send.', { status: 409 });
  check((await db().from('background_jobs').update({ status: 'PENDING', attempts: 0, next_attempt_at: new Date().toISOString() }).eq('id', body.id).eq('status', 'DEAD')).error);
  return NextResponse.json({ queued: true });
}
