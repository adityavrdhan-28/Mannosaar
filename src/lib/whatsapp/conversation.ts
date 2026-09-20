import { availableSlots, therapists } from '../bookings/availability';
import { preparePayment, type Hold } from '../payments/whatsapp';
import { check, db, origin, rpc } from './server';
import { cleanText, selectedChoice, type Choice, type Inbound, type Job, type Session } from './core';
import { listMessage, textMessage, type Message } from './messages';

async function prices() {
  const result = await db().from('pricing_config').select('session_type,price,currency').eq('bundle_size', 1).eq('currency', 'INR'); check(result.error);
  return (result.data || []).filter(p => ['personal', 'couple'].includes(p.session_type) && Number(p.price) > 0);
}
async function advance(job: Job) {
  const input = job.payload as unknown as Inbound & { session: string };
  const previous = await db().from('whatsapp_messages').select('status').eq('wa_message_id', input.id).single(); check(previous.error);
  if (previous.data?.status === 'processed') return;
  const result = await db().from('whatsapp_sessions').select('*').eq('id', input.session).single(); check(result.error);
  const session = result.data as Session;
  const s: Session = { ...session, data: { ...session.data } };
  const command = input.input.trim().toLowerCase();
  let reply: Message = textMessage('Please choose an option above, or type “manage” to view your bookings.');
  const choose = (body: string, choices: Choice[], page = 0) => {
    const rows = choices.slice(page * 8, page * 8 + 8);
    if (page > 0) rows.push({ id: 'previous', title: 'Previous' });
    if ((page + 1) * 8 < choices.length) rows.push({ id: 'next', title: 'More options' });
    s.data.choices = rows; s.data.page = page;
    if (rows.length) reply = listMessage(body, rows);
    else { s.data.choices = []; reply = textMessage('No availability right now. Please try another date, or type “book” to start again.'); }
  };
  const dateMenu = async (reschedule = false, page = 0) => {
    s.state = reschedule ? 'RESCHEDULE_DATE' : 'SELECT_DATE';
    const slots = await availableSlots(s.data.therapist!);
    choose('Choose a date. All times are India Standard Time (IST).', [...new Set(slots.map(slot => slot.date))].map(date => ({ id: date, title: date })), page);
  };
  const slotMenu = async (reschedule = false, page = 0) => {
    s.state = reschedule ? 'RESCHEDULE_TIME' : 'SELECT_TIME';
    const slots = await availableSlots(s.data.therapist!, s.data.date);
    choose('Choose an available time (IST).', slots.map(slot => ({ id: slot.id, title: `${slot.start_time.slice(0, 5)} – ${slot.end_time.slice(0, 5)}`, description: `${slot.duration_minutes} minutes` })), page);
  };
  const therapistMenu = async (page = 0) => {
    s.state = 'SELECT_THERAPIST';
    const price = (await prices()).find(p => p.session_type === s.data.service);
    choose('Choose your therapist. Session duration is shown with each available time.', (await therapists(s.data.service)).map(t => ({ id: t.therapist_id, title: t.display_name, description: `${t.focus} · ₹${price?.price}` })), page);
  };
  const manageMenu = async (page = 0) => {
    const bookings = await db().from('whatsapp_payments').select('booking:bookings(id,slot_date,slot_start_time,fulfillment_status)').eq('session_id', s.id).eq('status', 'SUCCESS').not('booking_id', 'is', null); check(bookings.error);
    const rows = (bookings.data || []).flatMap(p => Array.isArray(p.booking) ? p.booking : [p.booking]).filter(b => b && b.fulfillment_status !== 'CANCELLED');
    s.state = 'MANAGE_BOOKING';
    choose('Choose a booking to view or manage.', rows.map(b => ({ id: b.id, title: b.slot_date, description: `${b.slot_start_time.slice(0, 5)} IST · ${b.fulfillment_status}` })), page);
  };
  const bookingDetails = async () => {
    const payment = await db().from('whatsapp_payments').select('booking_id').eq('session_id', s.id).eq('booking_id', s.data.booking).single(); check(payment.error);
    const booking = await db().from('bookings').select('*').eq('id', payment.data!.booking_id).single(); check(booking.error);
    return booking.data!;
  };
  const reset = async () => {
    const active = await db().from('booking_holds').select('id').eq('session_id', s.id).in('status', ['ACTIVE', 'RESCHEDULE']).gt('expires_at', new Date().toISOString()); check(active.error);
    if (active.data?.length) {
      reply = textMessage(s.data.paymentUrl ? `Your reservation is active. Pay before it expires:\n${s.data.paymentUrl}\nType “manage” for paid bookings.` : 'Your reservation is being processed. Please wait a moment, then type “manage”.'); return;
    }
    s.data = {}; s.state = 'SELECT_SERVICE';
    if (process.env.WHATSAPP_BOOKING_ENABLED !== 'true') { reply = textMessage('WhatsApp booking is currently unavailable. Please book on our website.'); return; }
    choose('Welcome to Mannosaar 🌿\nChoose a session. We use your WhatsApp number for booking updates and reminders. Please share booking details only. Type “manage” anytime.', (await prices()).map(p => ({ id: p.session_type, title: p.session_type === 'personal' ? 'Personal session' : 'Couple session', description: `₹${p.price} · one session` })));
  };
  const expired = Date.parse(s.expires_at) < Date.now();
  if (Number(input.timestamp) * 1000 < Date.now() - 24 * 3600_000) {
    reply = textMessage('Please send “book” or “manage” to continue.');
  } else if (command === 'manage') {
    await manageMenu();
  } else if (command === 'book' || s.state === 'START' || expired) {
    await reset();
  } else if (['hi', 'hello', 'help', 'start'].includes(command)) {
    reply = s.data.choices?.length ? listMessage('Continue with an option below. Type “book” for a new booking or “manage” for your sessions.', s.data.choices) : textMessage(s.state === 'COLLECT_NAME' ? 'What name should we use for your booking?' : s.state === 'COLLECT_EMAIL' ? 'Please enter your email for PayU checkout.' : `Type “book” or “manage” to continue.${s.data.paymentUrl ? `\nPayment link: ${s.data.paymentUrl}` : ''}`);
  } else if (['next', 'previous'].includes(command) && selectedChoice(s, command)) {
    const page = Math.max(0, (s.data.page || 0) + (command === 'next' ? 1 : -1));
    if (s.state === 'SELECT_THERAPIST') await therapistMenu(page);
    else if (['SELECT_DATE', 'RESCHEDULE_DATE'].includes(s.state)) await dateMenu(s.state === 'RESCHEDULE_DATE', page);
    else if (['SELECT_TIME', 'RESCHEDULE_TIME'].includes(s.state)) await slotMenu(s.state === 'RESCHEDULE_TIME', page);
    else if (s.state === 'MANAGE_BOOKING') await manageMenu(page);
  } else {
    switch (s.state) {
      case 'SELECT_SERVICE':
        if (selectedChoice(s, command) && ['personal', 'couple'].includes(command)) { s.data.service = command as 'personal' | 'couple'; await therapistMenu(); }
        break;
      case 'SELECT_THERAPIST':
        if (selectedChoice(s, input.input) && (await therapists(s.data.service)).some(t => t.therapist_id === input.input)) { s.data.therapist = input.input; await dateMenu(); }
        break;
      case 'SELECT_DATE': case 'RESCHEDULE_DATE':
        if (selectedChoice(s, input.input)) { s.data.date = input.input; await slotMenu(s.state === 'RESCHEDULE_DATE'); }
        break;
      case 'SELECT_TIME': case 'RESCHEDULE_TIME': {
        if (!selectedChoice(s, input.input)) break;
        const slots = await availableSlots(s.data.therapist!, s.data.date);
        if (!slots.some(slot => slot.id === input.input)) { await slotMenu(s.state === 'RESCHEDULE_TIME'); break; }
        s.data.slot = input.input;
        if (s.state === 'RESCHEDULE_TIME') {
          const hold = await rpc<Hold>('wa_hold', { p_session: s.id, p_slot: s.data.slot, p_key: input.id });
          await rpc('wa_manage', { p_session: s.id, p_booking: s.data.booking, p_action: 'reschedule', p_hold: hold.id });
          s.state = 'MANAGE_BOOKING'; s.data.choices = [];
          reply = textMessage('Your new time is reserved. We’ll confirm once your calendar appointment has been updated.');
        } else { s.state = 'COLLECT_NAME'; s.data.choices = []; reply = textMessage('What name should we use for your booking?'); }
        break;
      }
      case 'COLLECT_NAME':
        if (input.interactive || cleanText(input.input).length < 2) { reply = textMessage('Please enter your name (2–120 characters).'); break; }
        s.data.name = cleanText(input.input); s.state = 'COLLECT_EMAIL'; reply = textMessage('Please enter your email for PayU checkout. We won’t use it to link an existing account.'); break;
      case 'COLLECT_EMAIL': {
        if (input.interactive || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.input) || input.input.length > 254) { reply = textMessage('Please enter a valid email address. PayU checkout requires it.'); break; }
        s.data.email = input.input.toLowerCase(); s.state = 'REVIEW_BOOKING';
        const therapist = (await therapists()).find(t => t.therapist_id === s.data.therapist);
        const slot = (await availableSlots(s.data.therapist!, s.data.date)).find(slot => slot.id === s.data.slot);
        if (!slot) { await dateMenu(); break; }
        const price = (await prices()).find(p => p.session_type === s.data.service);
        s.data.quotedAmount = Number(price?.price);
        choose(`${s.data.name}\n${therapist?.display_name}\n${slot.date}, ${slot.start_time.slice(0, 5)} IST\n${slot.duration_minutes} minutes · ₹${price?.price}\n\nBy choosing Pay, you agree to our terms and refund policy:\n${origin()}/refund-policy\nWe’ll hold this time for 10 minutes.`, [{ id: 'pay', title: 'Agree and pay' }, { id: 'book', title: 'Start again' }]);
        break;
      }
      case 'REVIEW_BOOKING':
        if (command === 'pay' && selectedChoice(s, command)) {
          if (process.env.WHATSAPP_BOOKING_ENABLED !== 'true') { reply = textMessage('New WhatsApp bookings are temporarily unavailable. Please use our website.'); break; }
          const currentPrice = (await prices()).find(p => p.session_type === s.data.service);
          if (!currentPrice) throw new Error('PRICE_UNAVAILABLE');
          if (Number(currentPrice.price) !== s.data.quotedAmount) {
            s.data.quotedAmount = Number(currentPrice.price);
            choose(`The session price is now ₹${currentPrice.price}. Please review the updated amount before paying.`, [{ id: 'pay', title: 'Agree and pay' }, { id: 'book', title: 'Start again' }]);
            break;
          }
          const existing = await db().from('booking_holds').select('*').eq('idempotency_key', input.id).maybeSingle(); check(existing.error);
          if (!existing.data && !(await availableSlots(s.data.therapist!, s.data.date)).some(slot => slot.id === s.data.slot)) { await slotMenu(); break; }
          const hold = existing.data as Hold | null || await rpc<Hold>('wa_hold', { p_session: s.id, p_slot: s.data.slot, p_key: input.id });
          if (hold.status !== 'ACTIVE' || Date.parse(hold.expires_at) <= Date.now()) { await dateMenu(); break; }
          s.data.hold = hold.id;
          s.data.paymentUrl = await preparePayment(s, hold);
          s.state = 'AWAITING_PAYMENT'; s.data.choices = [];
          reply = textMessage(`Your time is held for 10 minutes. Complete payment here:\n${s.data.paymentUrl}\n\nWe’ll confirm your session after PayU verifies payment. If payment fails, you can retry using this link before it expires.`);
        }
        break;
      case 'AWAITING_PAYMENT':
        reply = textMessage(`Type “manage” to check confirmed sessions. If payment failed, retry before your reservation expires:\n${s.data.paymentUrl || ''}\nType “book” after the hold expires to choose a new time.`); break;
      case 'MANAGE_BOOKING': {
        if (!selectedChoice(s, input.input)) break;
        if (command === 'reschedule') { await dateMenu(true); break; }
        if (command === 'cancel') {
          const booking = await bookingDetails(); s.state = 'CANCEL_CONFIRMATION';
          choose(`Cancel your session on ${booking.slot_date} at ${booking.slot_start_time.slice(0, 5)} IST?\nRefund policy: more than 24h, 100%; 12–24h, 50%; under 12h, no refund. Eligible refunds are reviewed and processed in 5–10 business days.`, [{ id: 'confirm_cancel', title: 'Confirm cancellation' }, { id: 'manage', title: 'Keep session' }]); break;
        }
        s.data.booking = input.input;
        const booking = await bookingDetails();
        const slot = await db().from('therapy_slots').select('therapist_id').eq('id', booking.slot_id).single(); check(slot.error);
        s.data.therapist = slot.data!.therapist_id;
        if (booking.fulfillment_status !== 'CONFIRMED') { s.data.choices = []; reply = textMessage(`Your booking is being processed (${booking.fulfillment_status}). We’ll send an update shortly.`); break; }
        choose(`${booking.slot_date} at ${booking.slot_start_time.slice(0, 5)} IST\nJoin your session:\n${booking.meeting_link}\n\nChoose an action.`, [{ id: 'reschedule', title: 'Reschedule' }, { id: 'cancel', title: 'Cancel session' }]);
        break;
      }
      case 'CANCEL_CONFIRMATION':
        if (command === 'confirm_cancel' && selectedChoice(s, command)) {
          await rpc('wa_manage', { p_session: s.id, p_booking: s.data.booking, p_action: 'cancel' });
          s.state = 'MANAGE_BOOKING'; s.data.choices = []; reply = textMessage('We’re cancelling your calendar appointment. You’ll receive confirmation shortly. Any eligible refund has been submitted for processing.');
        }
        break;
    }
  }
  await rpc('wa_commit_conversation', { p_session: s.id, p_message: input.id, p_state: s.state, p_data: s.data, p_reply: reply, p_timestamp: new Date(Number(input.timestamp) * 1000).toISOString(), p_ttl: Number(process.env.WHATSAPP_SESSION_TTL_MINUTES || 120) });
}

export async function converse(job: Job) {
  try { return await advance(job); }
  catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (!['DB_23P01_wa_hold', 'DB_P0001_wa_hold', 'DB_P0001_wa_manage'].includes(code)) throw error;
    const input = job.payload as unknown as Inbound & { session: string };
    const current = await db().from('whatsapp_sessions').select('*').eq('id', input.session).single(); check(current.error);
    const session = current.data as Session;
    await rpc('wa_commit_conversation', { p_session: session.id, p_message: input.id, p_state: session.state, p_data: session.data, p_reply: textMessage('That time is no longer available, or your booking is already being processed. Type “book” to choose another time, or “manage” to check your appointment.'), p_timestamp: new Date(Number(input.timestamp) * 1000).toISOString() });
  }
}
