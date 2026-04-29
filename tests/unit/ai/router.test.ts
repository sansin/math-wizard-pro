import { describe, it, expect, vi, beforeEach } from 'vitest';
import { route, NoProviderError, PROVIDER_REGISTRY } from '@/lib/ai/router';
import type { ProviderClient, MathResponse } from '@/lib/ai/types';

function fakeProvider(id: ProviderClient['id'], behaviour: 'ok' | 'rate' | 'auth'): ProviderClient {
  return {
    id,
    defaultModel: 'fake',
    async complete(): Promise<MathResponse> {
      if (behaviour === 'ok') {
        return {
          content: '{"questions":[]}',
          provider: id,
          model: 'fake',
          estimatedTokens: 10,
          latencyMs: 5,
        };
      }
      const code = behaviour === 'rate' ? 'rate-limit' : 'auth';
      const e = new Error(behaviour) as Error & { provider: string; code: string; retryable: boolean };
      e.provider = id;
      e.code = code;
      e.retryable = behaviour === 'rate';
      throw e;
    },
  };
}

beforeEach(() => {
  // Reset registry; restore via re-assignment after each test if mutated.
});

describe('route', () => {
  it('throws NoProviderError when no keys are available', async () => {
    await expect(
      route(
        { task: 'generate-question', system: '', user: '' },
        { userKeys: {}, adminKeys: {}, canUseSharedKeys: true },
      ),
    ).rejects.toBeInstanceOf(NoProviderError);
  });

  it('uses user keys before admin keys', async () => {
    const original = { ...PROVIDER_REGISTRY };
    PROVIDER_REGISTRY.gemini = fakeProvider('gemini', 'ok');
    PROVIDER_REGISTRY.claude = fakeProvider('claude', 'ok');
    try {
      const result = await route(
        { task: 'generate-question', system: '', user: '' },
        { userKeys: { claude: 'user-claude' }, adminKeys: { gemini: 'admin-gem' }, canUseSharedKeys: true },
      );
      expect(result.response.provider).toBe('claude');
      expect(result.attempts[0]?.source).toBe('user');
    } finally {
      Object.assign(PROVIDER_REGISTRY, original);
    }
  });

  it('falls back to next provider on rate limit', async () => {
    const original = { ...PROVIDER_REGISTRY };
    PROVIDER_REGISTRY.gemini = fakeProvider('gemini', 'rate');
    PROVIDER_REGISTRY.claude = fakeProvider('claude', 'ok');
    try {
      const result = await route(
        { task: 'generate-question', system: '', user: '' },
        { userKeys: { gemini: 'k', claude: 'k2' }, adminKeys: {}, canUseSharedKeys: true },
      );
      expect(result.response.provider).toBe('claude');
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]?.ok).toBe(false);
      expect(result.attempts[1]?.ok).toBe(true);
    } finally {
      Object.assign(PROVIDER_REGISTRY, original);
    }
  });

  it('respects canUseSharedKeys=false and refuses admin keys', async () => {
    const original = { ...PROVIDER_REGISTRY };
    PROVIDER_REGISTRY.gemini = fakeProvider('gemini', 'ok');
    try {
      await expect(
        route(
          { task: 'generate-question', system: '', user: '' },
          { userKeys: {}, adminKeys: { gemini: 'admin' }, canUseSharedKeys: false },
        ),
      ).rejects.toBeInstanceOf(NoProviderError);
    } finally {
      Object.assign(PROVIDER_REGISTRY, original);
    }
  });

  it('honors excluded set', async () => {
    const original = { ...PROVIDER_REGISTRY };
    PROVIDER_REGISTRY.gemini = fakeProvider('gemini', 'ok');
    PROVIDER_REGISTRY.claude = fakeProvider('claude', 'ok');
    try {
      const result = await route(
        { task: 'generate-question', system: '', user: '' },
        { userKeys: { gemini: 'k', claude: 'k2' }, adminKeys: {}, canUseSharedKeys: true },
        { excluded: new Set(['gemini']) },
      );
      expect(result.response.provider).toBe('claude');
    } finally {
      Object.assign(PROVIDER_REGISTRY, original);
    }
  });
});
