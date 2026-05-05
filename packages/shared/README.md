# @sageon/math-wizard-shared

Pure-TypeScript modules shared across the Math Wizard Pro web (Next.js)
and mobile (Expo) apps.

## What lives here

Anything that has zero React/DOM/Next.js/React Native dependencies and
can run in any JavaScript environment. The litmus test:

> "Could this run inside a plain Node script with no DOM and no native
> modules?"

If yes, it belongs here. If it imports from `react`, `next`, `react-native`,
or touches `window`/`document`, it belongs in the consuming app.

## Planned content (not yet migrated)

This package is currently a scaffold. The migration happens in
a follow-up commit (Commit B in the monorepo plan). When it does, these
modules move from `apps/web/src/lib/...` (or its predecessor `src/lib/`)
into `packages/shared/src/`:

- `math/` — parser, checker, verifier, equivalence (mathjs)
- `mastery/` — formula (Beta(2,2) prior), display, skill-grouping, xp, engine
- `ai/` — router, types, prompts, provider-info (HTTP calls stay in apps/web)
- `types/` — core domain types
- `utils.ts` — shared helpers (hash32, cn, clamp, lerp)

## Why a separate package?

The mobile app needs to:

- Run the same answer verifier so client-side answer checks match the server
- Render the same mastery percentages and labels
- Use the same skill-grouping logic for the practice picker
- Type-check against the same `Question`, `Skill`, `AnswerKind` shapes

Putting the shared logic in its own package means the mobile app gets
all of it via `import { ... } from '@sageon/math-wizard-shared'` with
no copy-paste drift between web and mobile.

## Development

```bash
# From repo root
npm install        # installs all workspaces

# From packages/shared
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
```
