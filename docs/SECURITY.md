# Security audit notes

Last reviewed: 2026-04-29 (against `npm audit` after Next 16 + React 19 upgrade)

## Summary

After upgrading to Next.js 16 + React 19 + ESLint 9 + Vitest 3, all
**production** advisories are cleared. A small number of **development-only**
advisories remain in the test runner chain — these never reach the deployed
bundle and are explained below.

## What's installed

| Package | Version | Why |
|---|---|---|
| `next` | ^16.2.4 | Latest stable; clears 5 prior `next` advisories + transitive postcss |
| `react` / `react-dom` | ^19.2.0 | Required by Next 16; no breaking changes for our usage |
| `eslint` | ^9.18.0 | Latest stable; required by `eslint-config-next@16` |
| `eslint-config-next` | ^16.2.4 | Clears the `glob` CLI command-injection chain |
| `mathjs` | ^15.2.0 | Clears the object-mutation advisories |
| `vitest` | ^3.2.4 | See "Vitest version choice" below |

## Vitest version choice — why 3 instead of 4

Vitest 4 was the latest at upgrade time, and would have cleared the
`esbuild`/`vite` dev-only advisory chain. We deferred:

- Vitest 4 ships its own bundled Vite 8 (Rolldown-based)
- Rolldown's parser doesn't run our JSX-aware plugin
  (`@vitejs/plugin-react`) reliably for `.tsx` test files in the SSR
  transform context
- Net effect: tests fail to parse with `RolldownError: Parse failure ...
  Unexpected JSX expression`

The fix would require either custom plugin configuration or an OXC-based
React transformer once one is available for Vitest 4. Tracked for v2.1.

## Production advisories — CLEARED

After the upgrade, `npm audit --omit=dev` should report 0 vulnerabilities.

The following advisories from the prior 14.x branch are now fixed:
- All Next.js DoS / SSRF / cache poisoning / auth bypass advisories
- mathjs object property mutation
- glob CLI command injection (via eslint-config-next)

## Transitive override — postcss

Next.js 16 bundles an older PostCSS (<8.5.10) that has GHSA-qx2v-qp2m-jg93
(XSS in CSS stringifier output). We force the patched version via npm
override in `package.json`:

```json
"overrides": {
  "postcss": "^8.5.10"
}
```

This applies the fix without waiting for Next.js to bump its bundled
PostCSS. PostCSS 8.5.x is fully backward-compatible with 8.4.x.

## Development-only advisories — accepted

These will appear in `npm audit` (which audits both prod and dev) but never
ship to production:

### `esbuild` dev server (vitest chain)
- **GHSA-67mh-4wv8-2f99**
- Fix requires Vitest 4 (deferred — see above)
- **Risk:** None in our usage. The vulnerability allows cross-origin reads
  *to a running esbuild dev server*. Vitest never exposes one beyond
  localhost, and CI doesn't run a network-accessible server.

## Future security work — v2.1

1. **Re-attempt Vitest 4 upgrade** when the React/JSX plugin compatibility
   with Rolldown-Vite stabilizes
2. Add `npm audit --omit=dev --audit-level=high` to CI (will pass)
3. Add Dependabot or Renovate for proactive bumps
4. Add a Content Security Policy header
5. Add a reporting endpoint and `security.txt` for vulnerability disclosures

## Reporting a vulnerability

Email the maintainer rather than opening a public issue if you find a
security issue not listed here.
