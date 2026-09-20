// The browser return is intentionally informational. Settlement is exclusively webhook-driven.
export async function POST() {
  return new Response('Thank you. Return to WhatsApp and type “manage”. We will send confirmation after PayU verifies your payment. This page does not confirm a booking.', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
export const GET = POST;
