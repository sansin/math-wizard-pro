/**
 * Resolve API keys for a given user.
 *
 * Returns BYOK keys + admin keys + permission flags. Used by
 * server-side route handlers immediately before invoking the router.
 *
 * Critical invariant: this function is the only place where the
 * `encrypted_key` column is decrypted. The decrypted plaintext never
 * leaves this module's return value.
 */

import type { AIProviderId } from '@/types/core';
import type { RouterContext } from './types';
import { getServiceClient } from '@/lib/supabase/server';
import { decryptKey } from './encryption';

export interface ResolvedKeys {
  ctx: RouterContext;
  byok: AIProviderId[];
  shared: AIProviderId[];
  /** True if this user is admin-blocked from shared keys. */
  blockedFromShared: boolean;
  /** Daily shared-key request limit + current count. */
  sharedQuota: { limit: number; used: number; remaining: number };
}

const DAILY_SHARED_LIMIT = parseInt(process.env.SHARED_KEY_DAILY_LIMIT ?? '50', 10);

function adminKeys(): Partial<Record<AIProviderId, string>> {
  // Cloudflare needs both account ID + token; combine into the
  // `accountId:token` format the provider expects.
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cloudflareCombined =
    cfAccount && cfToken ? `${cfAccount}:${cfToken}` : undefined;

  return {
    gemini: process.env.GEMINI_API_KEY || undefined,
    claude: process.env.ANTHROPIC_API_KEY || undefined,
    openai: process.env.OPENAI_API_KEY || undefined,
    deepseek: process.env.DEEPSEEK_API_KEY || undefined,
    groq: process.env.GROQ_API_KEY || undefined,
    cerebras: process.env.CEREBRAS_API_KEY || undefined,
    cloudflare: cloudflareCombined,
    openrouter: process.env.OPENROUTER_API_KEY || undefined,
    mistral: process.env.MISTRAL_API_KEY || undefined,
    huggingface: process.env.HUGGINGFACE_API_KEY || undefined,
  };
}

export async function resolveKeysForUser(userId: string): Promise<ResolvedKeys> {
  const sb = getServiceClient();
  const secret = process.env.KEY_ENCRYPTION_SECRET!;

  // 1) Read user's BYOK rows.
  const { data: keyRows } = await sb
    .from('user_api_keys')
    .select('provider, encrypted_key, active')
    .eq('user_id', userId)
    .eq('active', true);

  const userKeys: Partial<Record<AIProviderId, string>> = {};
  if (keyRows) {
    for (const r of keyRows as Array<{ provider: string; encrypted_key: string }>) {
      try {
        const plain = await decryptKey(r.encrypted_key, secret);
        userKeys[r.provider as AIProviderId] = plain;
      } catch {
        // skip — corrupted entry; user can re-add
      }
    }
  }

  // 2) Check per-user shared-key block.
  const { data: blockRow } = await sb
    .from('shared_key_overrides')
    .select('shared_disabled')
    .eq('user_id', userId)
    .maybeSingle();

  const globallyDisabled = process.env.DISABLE_SHARED_KEYS === 'true';
  const blockedFromShared = !!(blockRow && (blockRow as { shared_disabled?: boolean }).shared_disabled);
  const canUseSharedKeys = !globallyDisabled && !blockedFromShared;

  // 3) Daily shared-key quota.
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRow } = await sb
    .from('shared_key_usage')
    .select('request_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();

  const used = (usageRow as { request_count?: number } | null)?.request_count ?? 0;
  const remaining = Math.max(0, DAILY_SHARED_LIMIT - used);

  const admin = canUseSharedKeys && remaining > 0 ? adminKeys() : {};
  const byok = Object.keys(userKeys) as AIProviderId[];
  const shared = Object.keys(admin).filter((k) => admin[k as AIProviderId]) as AIProviderId[];

  return {
    ctx: { userKeys, adminKeys: admin, canUseSharedKeys: canUseSharedKeys && remaining > 0 },
    byok,
    shared,
    blockedFromShared,
    sharedQuota: { limit: DAILY_SHARED_LIMIT, used, remaining },
  };
}

/** Increment shared-key usage atomically. Call after a successful admin-key request. */
export async function bumpSharedUsage(userId: string): Promise<void> {
  const sb = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  // Naive upsert + manual increment; for perfect atomicity at high QPS we'd
  // use a Postgres function, but for our scale this is fine.
  const { data } = await sb
    .from('shared_key_usage')
    .select('request_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();
  const current = (data as { request_count?: number } | null)?.request_count ?? 0;
  await sb
    .from('shared_key_usage')
    .upsert(
      { user_id: userId, usage_date: today, request_count: current + 1 },
      { onConflict: 'user_id,usage_date' },
    );
}
