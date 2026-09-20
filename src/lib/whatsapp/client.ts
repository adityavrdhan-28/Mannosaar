import { check, db, required, log, rpc } from './server';
import type { Job, Session } from './core';
import { textMessage, templateMessage, type TemplateName } from './messages';
export async function send(job: Job) {
  const { data: session, error } = await db().from('whatsapp_sessions').select('*').eq('id', job.payload.session).single(); check(error);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  const s = session as Session;
  const record = await db().from('whatsapp_messages').upsert({ dedupe_key: job.dedupe_key, session_id: s.id, booking_id: job.payload.booking || null, direction: 'OUT', template_name: job.payload.template || null }, { onConflict: 'dedupe_key', ignoreDuplicates: true }); check(record.error);
  const prior = await db().from('whatsapp_messages').select('status,wa_message_id').eq('dedupe_key', job.dedupe_key).single(); check(prior.error);
  if (prior.data?.wa_message_id) return;
  // A crash after transmitting cannot distinguish accepted from lost. Never blindly resend.
  if (['sending', 'uncertain'].includes(prior.data?.status || '')) throw new Error('DELIVERY_UNCERTAIN');
  const withinWindow = Date.parse(s.last_message_at) > Date.now() - 23 * 3600_000;
  let message = job.payload.message;
  if (job.payload.notice) message = textMessage(String(job.payload.notice));
  if (!withinWindow || job.payload.forceTemplate) {
    if (!job.payload.template) throw new Error('CUSTOMER_WINDOW_EXPIRED');
    message = templateMessage(job.payload.template as TemplateName, (job.payload.values as string[]) || [String(job.payload.notice)]);
  }
  if (!message) throw new Error('MESSAGE_MISSING');
  const start = await db().from('whatsapp_messages').update({ status: 'sending' }).eq('dedupe_key', job.dedupe_key); check(start.error);
  let response: Response;
  try {
    const version = required('WHATSAPP_GRAPH_VERSION');
    if (!/^v\d+\.\d+$/.test(version)) throw new Error('GRAPH_VERSION_INVALID');
    response = await fetch(`https://graph.facebook.com/${version}/${required('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${required('WHATSAPP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: s.wa_id, ...(message as object) }),
    });
  } catch {
    check((await db().from('whatsapp_messages').update({ status: 'uncertain', error_code: 'DELIVERY_UNCERTAIN' }).eq('dedupe_key', job.dedupe_key)).error);
    throw new Error('DELIVERY_UNCERTAIN');
  }
  const result = await response.json();
  if (!response.ok) {
    check((await db().from('whatsapp_messages').update({ status: 'failed', error_code: String(result.error?.code || response.status) }).eq('dedupe_key', job.dedupe_key)).error);
    throw new Error(`META_SEND_${response.status}`);
  }
  const id = result.messages?.[0]?.id;
  if (!id) throw new Error('DELIVERY_UNCERTAIN');
  await rpc('wa_mark_sent', { p_key: job.dedupe_key, p_id: id });
  log('WHATSAPP_MESSAGE_SENT', job.id);
}
