# Setup Guide

Step-by-step from `git clone` to a deployed app.

## 1. Local development

```bash
git clone https://github.com/sansin/math-wizard-pro.git
cd math-wizard-pro
npm install
cp .env.example .env.local
```

Generate the encryption secret used to encrypt user-provided API keys:

```bash
openssl rand -hex 32
# paste output as KEY_ENCRYPTION_SECRET in .env.local
```

## 2. Supabase project (free)

1. https://supabase.com/dashboard → **New project** (free tier).
2. Once created, go to **Project Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon (public) key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY` (KEEP SECRET)

3. Apply migrations. Either:

   **Option A — Supabase CLI** (recommended):
   ```bash
   npm i -g supabase
   supabase link --project-ref <your-ref>
   supabase db push
   ```

   **Option B — SQL editor**: Open each file in `supabase/migrations/` in the
   Supabase SQL editor and run them in order:
   - `20260428000001_initial_schema.sql`
   - `20260428000002_rls_policies.sql`
   - `20260428000003_xp_and_mastery_triggers.sql`
   - `20260428000004_seed_skills.sql`

4. Enable email auth: Authentication → Providers → Email (already on by default).

## 3. AI provider keys (free)

You need at least one. **Gemini is the most generous and easiest** (no card):

1. https://aistudio.google.com/apikey → Create API key.
2. Paste into `.env.local` as `GEMINI_API_KEY`.

For more, see `src/lib/ai/provider-info.ts` or the Settings → AI Providers
page in the running app — each has step-by-step instructions.

## 4. Run

```bash
npm run dev
# open http://localhost:3000
```

## 5. Tests

```bash
npm test               # unit + integration (Vitest)
npm run test:coverage  # with coverage thresholds
npm run test:e2e       # Playwright e2e
```

## 6. Production deploy — Cloudflare Pages

1. Push your repo to GitHub.
2. https://dash.cloudflare.com → **Pages** → Create → Connect to Git.
3. Framework preset: **Next.js**. Build: `npm run build`. Output: `.next`.
4. Environment variables: copy everything from `.env.local`.
5. Save & Deploy. First build takes ~3 minutes.

A `<your-project>.pages.dev` URL is yours immediately. Custom domain is free
under "Custom domains".

## 7. Migrate users from v1 (Classic Math Wizard)

If you're keeping v1 alive and want users to optionally bring their progress:

1. Export your Firebase project's API key + project ID from the Firebase
   console (Project settings → General → Web API Key).
2. Add to v2's `.env.local`:
   ```
   LEGACY_FIREBASE_API_KEY=AIza...
   LEGACY_FIREBASE_PROJECT_ID=math-wizard-xxxx
   ```
3. Apply the v1 toggle patch (`scripts/v1-toggle-patch.md`) so users can
   discover the new app.
4. The `/migrate` flow handles everything else automatically.

## 8. Admin panel

There's no full admin UI yet, but the `shared_key_overrides` table lets you
disable shared (admin-key) access for specific users. Insert a row with
`shared_disabled = true` to force a user to BYOK.

To grant yourself admin role, run in the Supabase SQL editor:
```sql
update public.profiles set role = 'admin' where user_id = (
  select id from auth.users where email = 'your-email@example.com'
);
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| "no-providers" error in practice | Add a Gemini key in `.env.local` or via Settings |
| KaTeX renders raw `$x^2$` | Make sure `katex/dist/katex.min.css` is imported (it is, in `globals.css`) |
| RLS blocks a query | Use `getServiceClient()` only in route handlers; user-facing pages should use `getServerClient()` |
| Migration fails with "classic-auth-failed" | Verify `LEGACY_FIREBASE_API_KEY` matches the v1 project |
