import type { Choice } from './core';
export type Message = { type: 'text'; text: { body: string } } | { type: 'interactive'; interactive: { type: 'list'; body: { text: string }; action: { button: string; sections: { title: string; rows: Choice[] }[] } } };
export const textMessage = (body: string): Message => ({ type: 'text', text: { body: body.slice(0, 4096) } });
export function listMessage(body: string, choices: Choice[]): Message {
  if (!choices.length || choices.length > 10) throw new Error('INVALID_LIST_SIZE');
  return { type: 'interactive', interactive: { type: 'list', body: { text: body.slice(0, 1024) }, action: { button: 'Choose', sections: [{ title: 'Mannosaar', rows: choices.map(c => ({ ...c, title: c.title.slice(0, 24), description: c.description?.slice(0, 72) })) }] } } };
}
export const templateNames = ['booking_confirmation', 'booking_reminder_24h', 'booking_reminder_1h', 'booking_rescheduled', 'booking_cancelled', 'payment_reminder'] as const;
export type TemplateName = typeof templateNames[number];
export function templateMessage(name: TemplateName, values: string[]) {
  const configured = process.env[`WHATSAPP_TEMPLATE_${name.toUpperCase()}`] || name;
  return { type: 'template', template: { name: configured, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' }, components: [{ type: 'body', parameters: values.map(text => ({ type: 'text', text: text || '—' })) }] } };
}
