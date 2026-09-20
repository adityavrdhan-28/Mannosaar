import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  // Reuse the same browser client across components to avoid duplicate auth stores.
  var __supabaseBrowserClient: SupabaseClient | undefined;
}

export const createClient = () => {
  if (!globalThis.__supabaseBrowserClient) {
    globalThis.__supabaseBrowserClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { fetch: async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const table = url.pathname.match(/^\/rest\/v1\/(users|bookings)$/)?.[1];
        if (table) {
          const headers = new Headers(init?.headers);
          headers.delete('authorization'); headers.delete('apikey');
          return fetch(`/api/private-data/${table}${url.search}`, { ...init, headers, credentials: 'same-origin' });
        }
        return fetch(input, init);
      } } }
    );
  }

  return globalThis.__supabaseBrowserClient;
};
