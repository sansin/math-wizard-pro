/**
 * AI provider abstractions.
 *
 * Every provider implements the same Provider interface: given a structured
 * MathPrompt, return a structured MathResponse. The router orchestrates
 * fallback, retry, rate-limiting, and key resolution (BYOK vs admin keys).
 */

import type { AIProviderId } from '@/types/core';

export interface MathPrompt {
  /** What kind of output we want — drives schema instructions in prompt. */
  task: 'generate-question' | 'generate-batch' | 'generate-hint' | 'generate-solution' | 'tutor-chat';
  /** System prompt — sets tone & constraints. */
  system: string;
  /** User message — task specifics. */
  user: string;
  /** When set, we ask the provider to return strict JSON matching this schema. */
  jsonSchema?: object;
  /** Sampling controls. */
  temperature?: number;
  maxTokens?: number;
}

export interface MathResponse {
  /** Raw text content from the model. May be JSON-encoded if jsonSchema was set. */
  content: string;
  /** Provider that handled this request. */
  provider: AIProviderId;
  /** Model identifier used. */
  model: string;
  /** Estimated tokens — used for rate-limit accounting. */
  estimatedTokens: number;
  /** Wall-clock time in ms. */
  latencyMs: number;
}

export interface ProviderError extends Error {
  provider: AIProviderId;
  code: 'rate-limit' | 'auth' | 'bad-request' | 'server' | 'timeout' | 'unknown';
  retryable: boolean;
}

export interface ProviderClient {
  id: AIProviderId;
  /** Submit a request. May throw ProviderError. */
  complete(prompt: MathPrompt, apiKey: string, signal?: AbortSignal): Promise<MathResponse>;
  /** Default model used when caller doesn't specify. */
  defaultModel: string;
}

export interface RouterContext {
  /** User-supplied keys, decrypted for this request. */
  userKeys: Partial<Record<AIProviderId, string>>;
  /** Admin-provided keys (env vars). May be empty. */
  adminKeys: Partial<Record<AIProviderId, string>>;
  /** Whether the user is allowed to use admin keys. */
  canUseSharedKeys: boolean;
  /** Per-task hint about which provider to prefer. */
  preferredOrder?: AIProviderId[];
}
