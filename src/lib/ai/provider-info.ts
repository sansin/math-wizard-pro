/**
 * User-facing metadata for each AI provider.
 *
 * Powers the BYOK settings page tutorials. Each provider has step-by-step
 * instructions that walk users through obtaining a key — written assuming
 * the user is non-technical (this app targets parents and kids).
 */

import type { AIProviderId, AIProviderInfo } from '@/types/core';

export const PROVIDER_INFO: Record<AIProviderId, AIProviderInfo> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'Largest free tier — recommended primary',
    freeTier: '1,500 requests/day on Gemini 2.0 Flash; no credit card required',
    signupUrl: 'https://aistudio.google.com/apikey',
    setupSteps: [
      'Go to https://aistudio.google.com/apikey and sign in with your Google account.',
      'Click "Create API key" and choose "Create API key in new project".',
      'Copy the key (starts with "AIza..."). It will be a long string.',
      'Paste it below and click Save. The key is encrypted and only used by Math Wizard Pro.',
    ],
    defaultModel: 'gemini-2.0-flash',
    latencyTier: 'fast',
    qualityTier: 'high',
    strengths: ['Question generation', 'Step-by-step solutions', 'Generous free tier'],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    tagline: 'Fast + free — great for hints',
    freeTier: 'Free tier with daily request limits; very fast responses',
    signupUrl: 'https://console.groq.com/keys',
    setupSteps: [
      'Visit https://console.groq.com and sign up (free account, no credit card).',
      'Once logged in, go to the API Keys page in the left menu.',
      'Click "Create API Key", give it a name like "Math Wizard Pro".',
      'Copy the key (starts with "gsk_..."). Paste it below and Save.',
    ],
    defaultModel: 'llama-3.3-70b-versatile',
    latencyTier: 'instant',
    qualityTier: 'good',
    strengths: ['Fast responses', 'Hint generation', 'Free tier'],
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras',
    tagline: 'Fastest inference on the planet',
    freeTier: 'Free tier with daily token limits',
    signupUrl: 'https://cloud.cerebras.ai',
    setupSteps: [
      'Go to https://cloud.cerebras.ai and create a free account.',
      'After login, navigate to "API Keys" in your account.',
      'Click "Generate API Key" and copy the value.',
      'Paste it below and Save. No credit card required.',
    ],
    defaultModel: 'llama-3.3-70b',
    latencyTier: 'instant',
    qualityTier: 'good',
    strengths: ['Lowest latency', 'Fast hints', 'Free tier'],
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    tagline: 'Best math reasoning — paid',
    freeTier: 'No persistent free tier; requires payment method, $5 starter credit',
    signupUrl: 'https://console.anthropic.com/',
    setupSteps: [
      'Visit https://console.anthropic.com and create an account.',
      'Add a payment method under Settings → Billing (a small starter credit is included).',
      'Go to API Keys and click "Create Key".',
      'Copy the key (starts with "sk-ant-..."). Paste it below and Save.',
    ],
    defaultModel: 'claude-haiku-4-5-20251001',
    latencyTier: 'fast',
    qualityTier: 'frontier',
    strengths: ['Best math reasoning', 'Tutor mode', 'Step-by-step solutions'],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'Broad coverage — paid',
    freeTier: 'No free tier; pay-as-you-go (gpt-4o-mini is ~$0.15 per 1M tokens)',
    signupUrl: 'https://platform.openai.com/api-keys',
    setupSteps: [
      'Sign in to https://platform.openai.com/ and add a payment method.',
      'Go to "API Keys" in the left sidebar.',
      'Click "Create new secret key" and choose "Restricted" → leave most permissions off, just enable "/v1/chat/completions".',
      'Copy the key (starts with "sk-..."). Paste it below and Save. You will not see this key again on OpenAI\'s site.',
    ],
    defaultModel: 'gpt-4o-mini',
    latencyTier: 'fast',
    qualityTier: 'high',
    strengths: ['Broad coverage', 'Reliable JSON output'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    tagline: 'Cheap + great at math',
    freeTier: 'No persistent free tier; very cheap pay-as-you-go (~10x cheaper than OpenAI)',
    signupUrl: 'https://platform.deepseek.com/',
    setupSteps: [
      'Create an account at https://platform.deepseek.com/.',
      'Add a payment method under Billing (small minimum).',
      'Go to "API keys" and click "Create new API key".',
      'Copy the key and paste it below.',
    ],
    defaultModel: 'deepseek-chat',
    latencyTier: 'normal',
    qualityTier: 'high',
    strengths: ['Strong math', 'Low cost', 'Long context'],
  },
};

export const PROVIDER_LIST: AIProviderId[] = [
  'gemini',
  'groq',
  'cerebras',
  'claude',
  'openai',
  'deepseek',
];
