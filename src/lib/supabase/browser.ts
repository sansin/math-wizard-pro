'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;
let cached: BrowserClient | null = null;

export function getBrowserClient(): BrowserClient {
  if (!cached) cached = createBrowserClient<Database>(URL, ANON);
  return cached;
}
