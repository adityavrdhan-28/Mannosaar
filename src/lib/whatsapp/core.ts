import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function equalSecret(a: string, b: string): boolean {
  return !!a && !!b && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function validMetaSignature(raw: string, signature: string, secret: string): boolean {
  return !!secret && equalSecret(signature, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const slotInstant = (date: string, time: string) => new Date(`${date}T${time}+05:30`).toISOString();
export const slotEndInstant = (date: string, startTime: string, endTime: string) => {
  if (startTime === endTime) throw new Error('INVALID_SLOT_DURATION');
  const end = new Date(`${date}T${endTime}+05:30`);
  if (endTime < startTime) end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString();
};
export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
export const retryDelay = (attempt: number) => Math.min(3600, 15 * 2 ** Math.max(0, attempt - 1));
export const refundPercent = (start: string, now = Date.now()) => {
  const hours = (Date.parse(start) - now) / 3_600_000;
  return hours > 24 ? 100 : hours >= 12 ? 50 : 0;
};
export type State = 'START' | 'SELECT_SERVICE' | 'SELECT_THERAPIST' | 'SELECT_DATE' | 'SELECT_TIME' | 'COLLECT_NAME' | 'COLLECT_EMAIL' | 'REVIEW_BOOKING' | 'AWAITING_PAYMENT' | 'MANAGE_BOOKING' | 'RESCHEDULE_DATE' | 'RESCHEDULE_TIME' | 'CANCEL_CONFIRMATION';
export interface Choice { id: string; title: string; description?: string }
export interface SessionData {
  service?: 'personal' | 'couple'; therapist?: string; date?: string; slot?: string;
  name?: string; email?: string; quotedAmount?: number; hold?: string; booking?: string;
  choices?: Choice[]; page?: number; paymentUrl?: string;
}
export interface Session { id: string; wa_id: string; state: State; data: SessionData; expires_at: string; last_message_at: string; user_id?: string }
export interface Inbound { id: string; from: string; timestamp: string; input: string; interactive: boolean }
export interface Job { id: string; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number; dedupe_key: string }
export function selectedChoice(session: Session, input: string): boolean {
  return !!session.data.choices?.some(choice => choice.id === input);
}
export function cleanText(input: string, limit = 120): string {
  return Array.from(input, char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('').trim().slice(0, limit);
}
export function parseMeta(raw: string, phoneId: string, businessId: string): { messages: Inbound[]; statuses: { id: string; status: string; timestamp: string; error_code?: string }[] } {
  const body = JSON.parse(raw);
  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) throw new Error('INVALID_META_BODY');
  const messages: Inbound[] = [];
  const statuses: { id: string; status: string; timestamp: string; error_code?: string }[] = [];
  for (const entry of body.entry) {
    if (entry.id !== businessId) continue;
    for (const change of entry.changes || []) {
      const value = change.value;
      if (change.field !== 'messages' || value?.metadata?.phone_number_id !== phoneId) continue;
      for (const m of value.messages || []) {
        if (typeof m.id !== 'string' || !/^\d{7,15}$/.test(m.from) || !/^\d{10,}$/.test(m.timestamp)) continue;
        const input = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? m.button?.payload ?? m.text?.body ?? '';
        if (typeof input !== 'string') continue;
        messages.push({ id: m.id.slice(0, 250), from: m.from, timestamp: m.timestamp, input: cleanText(input, 500), interactive: !!m.interactive || !!m.button });
      }
      for (const s of value.statuses || []) {
        if (typeof s.id === 'string' && ['sent', 'delivered', 'read', 'failed'].includes(s.status))
          statuses.push({ id: s.id, status: s.status, timestamp: s.timestamp, error_code: s.errors?.[0]?.code ? String(s.errors[0].code) : undefined });
      }
    }
  }
  return { messages, statuses };
}
