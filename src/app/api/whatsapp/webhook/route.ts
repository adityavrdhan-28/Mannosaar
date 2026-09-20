import { after, NextResponse } from 'next/server';
import { equalSecret, parseMeta, validMetaSignature } from '@/lib/whatsapp/core';
import { required, rpc } from '@/lib/whatsapp/server';
import { runJobs } from '@/lib/jobs/whatsapp';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const valid = params.get('hub.mode') === 'subscribe' && equalSecret(params.get('hub.verify_token') || '', process.env.WHATSAPP_VERIFY_TOKEN || '');
  return new Response(valid ? params.get('hub.challenge') || '' : 'Forbidden', { status: valid ? 200 : 403 });
}
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 262144) return new Response('Too large', { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 262144) return new Response('Too large', { status: 413 });
  if (!validMetaSignature(raw, request.headers.get('x-hub-signature-256') || '', process.env.META_APP_SECRET || '')) return new Response('Forbidden', { status: 403 });
  try {
    const parsed = parseMeta(raw, required('WHATSAPP_PHONE_NUMBER_ID'), required('WHATSAPP_BUSINESS_ACCOUNT_ID'));
    await rpc('wa_ingest', { p_messages: parsed.messages, p_statuses: parsed.statuses });
    after(async () => { await runJobs(30_000); });
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: 'Webhook could not be persisted' }, { status: 503 }); }
}
