import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isWhatsAppAdmin } from '@/lib/whatsapp/admin';
import { origin, required } from '@/lib/whatsapp/server';
export async function GET() {
  if (!await isWhatsAppAdmin()) return new Response('Forbidden', { status: 403 });
  const state = randomBytes(32).toString('hex');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: required('GOOGLE_CLIENT_ID'), redirect_uri: `${origin()}/api/auth/google-callback`, response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/userinfo.email', access_type: 'offline', prompt: 'consent', state }).toString();
  const response = NextResponse.json({ authUrl: url.toString() });
  response.cookies.set('google_oauth_state', state, { httpOnly: true, secure: origin().startsWith('https:'), sameSite: 'lax', maxAge: 600, path: '/api/auth/google-callback' });
  return response;
}
