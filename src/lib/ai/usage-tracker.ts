/**
 * Per-user, per-provider usage tracking + validation persistence.
 *
 * Two tables:
 *   - user_key_usage:        request_count + token_count per (user, provider, source, date)
 *   - user_key_validation:   last validate result per (user, provider)
 *
 * All operations use the service-role Supabase client because writes are
 * service-only (no user RLS write policies — server-only).
 */

import { getServiceClient } from '@/lib/supabase/server';
import type { AIProviderId } from '@/types/core';

type Source = 'user' | 'admin' | 'validate';

/** Bump request + token counters atomically (best-effort upsert + read+write). */
export async function bumpUsage(
  userId: string,
  provider: AIProviderId,
  source: Source,
  tokens: number,
): Promise<void> {
  const sb = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  // Read current — small race possible at very high QPS, fine for our scale.
  const { data } = await sb
    .from('user_key_usage')
    .select('request_count, token_count')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('source', source)
    .eq('usage_date', today)
    .maybeSingle();

  const current = data as { request_count?: number; token_count?: number } | null;
  await sb
    .from('user_key_usage')
    .upsert(
      {
        user_id: userId,
        provider,
        source,
        usage_date: today,
        request_count: (current?.request_count ?? 0) + 1,
        token_count: (current?.token_count ?? 0) + Math.max(0, Math.round(tokens)),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider,source,usage_date' },
    );
}

export interface UsageSummary {
  provider: AIProviderId;
  source: Source;
  todayRequests: number;
  todayTokens: number;
  totalRequests: number;
  totalTokens: number;
  lastUsedAt: string | null;
}

/** Snapshot per (provider, source) for one user. Today + cumulative. */
export async function getUsageForUser(userId: string): Promise<UsageSummary[]> {
  const sb = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await sb
    .from('user_key_usage')
    .select('provider, source, usage_date, request_count, token_count, last_used_at')
    .eq('user_id', userId);

  const rows = (data ?? []) as Array<{
    provider: string;
    source: string;
    usage_date: string;
    request_count: number;
    token_count: number;
    last_used_at: string;
  }>;

  // Aggregate by (provider, source).
  const grouped = new Map<string, UsageSummary>();
  for (const r of rows) {
    const key = `${r.provider}::${r.source}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        provider: r.provider as AIProviderId,
        source: r.source as Source,
        todayRequests: 0,
        todayTokens: 0,
        totalRequests: 0,
        totalTokens: 0,
        lastUsedAt: null,
      });
    }
    const g = grouped.get(key)!;
    g.totalRequests += r.request_count;
    g.totalTokens += r.token_count;
    if (r.usage_date === today) {
      g.todayRequests += r.request_count;
      g.todayTokens += r.token_count;
    }
    if (!g.lastUsedAt || r.last_used_at > g.lastUsedAt) g.lastUsedAt = r.last_used_at;
  }

  return Array.from(grouped.values());
}

// ─── Validation persistence ─────────────────────────────────────────────

export interface ValidationRecord {
  ok: boolean;
  model: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  validatedAt: string;
}

export async function saveValidation(
  userId: string,
  provider: AIProviderId,
  result: { ok: boolean; model?: string; latencyMs?: number; errorMessage?: string },
): Promise<void> {
  const sb = getServiceClient();
  await sb.from('user_key_validation').upsert(
    {
      user_id: userId,
      provider,
      ok: result.ok,
      model: result.model ?? null,
      latency_ms: result.latencyMs ?? null,
      error_message: result.errorMessage ?? null,
      validated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  );
}

export async function getValidationsForUser(
  userId: string,
): Promise<Record<AIProviderId, ValidationRecord>> {
  const sb = getServiceClient();
  const { data } = await sb
    .from('user_key_validation')
    .select('provider, ok, model, latency_ms, error_message, validated_at')
    .eq('user_id', userId);

  const out: Partial<Record<AIProviderId, ValidationRecord>> = {};
  for (const r of (data ?? []) as Array<{
    provider: string;
    ok: boolean;
    model: string | null;
    latency_ms: number | null;
    error_message: string | null;
    validated_at: string;
  }>) {
    out[r.provider as AIProviderId] = {
      ok: r.ok,
      model: r.model,
      latencyMs: r.latency_ms,
      errorMessage: r.error_message,
      validatedAt: r.validated_at,
    };
  }
  return out as Record<AIProviderId, ValidationRecord>;
}
