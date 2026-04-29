/**
 * Server-side Supabase clients.
 *
 * Two flavors:
 *   - getServerClient()  — uses the anon key + the user's auth cookies.
 *                          RLS applies; ideal for "act as the user".
 *   - getServiceClient() — uses the SERVICE ROLE key, bypasses RLS.
 *                          Use only in trusted server code (route handlers,
 *                          edge functions, cron) for reading shared API keys
 *                          or doing admin operations.
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function getServerClient() {
  const store = await cookies();
  return createServerClient<Database>(URL, ANON, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // setAll inside RSC is a no-op; that's fine.
        }
      },
    },
  });
}

let serviceCache: ReturnType<typeof createClient<Database>> | null = null;

export function getServiceClient() {
  if (!serviceCache) {
    serviceCache = createClient<Database>(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceCache;
}
