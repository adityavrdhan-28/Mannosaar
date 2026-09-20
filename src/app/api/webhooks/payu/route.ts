import { after, NextResponse } from 'next/server';
import { validatePayUWebhook } from '@/lib/payments/whatsapp';
import { check, db, rpc } from '@/lib/whatsapp/server';
import { digest } from '@/lib/whatsapp/core';
import { runJobs } from '@/lib/jobs/whatsapp';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) return new Response('Too large', { status: 413 });
  let fields: Record<string, string>;
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = JSON.parse(raw);
      fields = Object.fromEntries(Object.entries(body).filter(([, value]) => typeof value === 'string' || typeof value === 'number').map(([key, value]) => [key, String(value)]));
    } else fields = Object.fromEntries(new URLSearchParams(raw));
    if (!await validatePayUWebhook(fields)) return new Response('Forbidden', { status: 403 });
    const payment = await db().from('whatsapp_payments').select('txnid,amount').eq('txnid', fields.txnid).maybeSingle(); check(payment.error);
    if (!payment.data) return NextResponse.json({ received: true, channel: 'unmatched' });
    if (Number(payment.data.amount) !== Number(fields.amount)) return new Response('Amount mismatch', { status: 400 });
    await rpc('wa_enqueue', { p_key: `payu:${digest(`${fields.txnid}:${fields.hash}`)}`, p_type: 'PAYMENT', p_payload: { txnid: fields.txnid } });
    after(async () => { await runJobs(30_000); });
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: 'Webhook could not be persisted' }, { status: 503 }); }
}
