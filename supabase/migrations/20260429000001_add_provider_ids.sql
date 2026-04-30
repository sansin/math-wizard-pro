-- ───────────────────────────────────────────────────────────────────────
-- Expand the user_api_keys.provider CHECK constraint to allow four more
-- providers: cloudflare (Workers AI), openrouter, mistral, huggingface.
-- ───────────────────────────────────────────────────────────────────────

alter table public.user_api_keys
  drop constraint if exists user_api_keys_provider_check;

alter table public.user_api_keys
  add constraint user_api_keys_provider_check
  check (provider in (
    'gemini','claude','openai','deepseek','groq','cerebras',
    'cloudflare','openrouter','mistral','huggingface'
  ));
