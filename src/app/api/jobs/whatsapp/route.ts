import { NextResponse } from 'next/server';
import { equalSecret } from '@/lib/whatsapp/core';
import { runJobs } from '@/lib/jobs/whatsapp';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!equalSecret(request.headers.get('authorization') || '', process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '')) return new Response('Forbidden', { status: 403 });
  try { return NextResponse.json(await runJobs(35_000)); }
  catch { return NextResponse.json({ error: 'Worker unavailable' }, { status: 503 }); }
}
