import { checkoutNonce } from '@/lib/payments/whatsapp';
import { digest } from '@/lib/whatsapp/core';
import { check, db } from '@/lib/whatsapp/server';
import type { PayUInitiationResult } from '@/lib/payu';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Link unavailable', { status: 404, headers });
  try {
    const payment = await db().from('whatsapp_payments').select('checkout,status,hold:booking_holds(status,expires_at)').eq('token_hash', digest(token)).maybeSingle(); check(payment.error);
    const hold = Array.isArray(payment.data?.hold) ? payment.data.hold[0] : payment.data?.hold;
    if (!payment.data || !hold || hold.status !== 'ACTIVE' || Date.parse(hold.expires_at) <= Date.now() || !['CREATED','PENDING','FAILED'].includes(payment.data.status)) return new Response('This payment link has expired or payment is already being processed. Return to WhatsApp and type “manage” or “book”.', { status: 410, headers });
    const checkout = payment.data.checkout as PayUInitiationResult;
    const url = new URL(checkout.paymentUrl);
    if (url.protocol !== 'https:' || !['secure.payu.in', 'test.payu.in'].includes(url.hostname)) throw new Error('INVALID_PAYU_URL');
    const nonce = checkoutNonce();
    return new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mannosaar secure payment</title></head><body><main><h1>Continue to secure payment</h1><p>Your session is reserved for a limited time. PayU will securely process your payment.</p><form method="post" action="${escape(checkout.paymentUrl)}">${Object.entries(checkout.fields).map(([key, value]) => `<input type="hidden" name="${escape(key)}" value="${escape(value)}">`).join('')}<button type="submit">Pay with PayU</button></form></main></body></html>`, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; form-action ${url.origin}; frame-ancestors 'none'; base-uri 'none'; script-src 'nonce-${nonce}'` } });
  } catch { return new Response('Payment is temporarily unavailable. Please try again.', { status: 503, headers }); }
}
