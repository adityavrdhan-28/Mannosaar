import { createClient } from '@supabase/supabase-js';
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_CONFIG_${name}`);
  return value;
}
export function db() {
  if (typeof window !== 'undefined') throw new Error('SERVER_ONLY');
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw new Error(`DB_${error.code}_${name}`);
  return data as T;
}
export function check(error: { code?: string } | null) { if (error) throw new Error(`DB_${error.code || 'ERROR'}`); }
export function log(event: string, id?: string) { console.info(JSON.stringify({ event, id })); }
export function origin() {
  const url = new URL(required('NEXT_PUBLIC_APP_URL'));
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('HTTPS_REQUIRED');
  return url.origin;
}
