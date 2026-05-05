/**
 * @sageon/math-wizard-shared — pure-TypeScript modules shared across the
 * Math Wizard Pro web (Next.js) and mobile (Expo) apps.
 *
 * INTENTIONALLY EMPTY at this commit. The package is scaffolded but no
 * modules have been migrated yet — that happens in a follow-up commit
 * (the "Commit B" in the monorepo plan). Web app continues to import
 * from its existing `@/lib/*` paths in the meantime.
 *
 * When migration begins, exports will be added like:
 *   export * as math from './math';
 *   export * as mastery from './mastery';
 *   export * as types from './types';
 *
 * Anything imported from this barrel must have zero React/DOM/
 * Next.js/Expo dependencies — the test of belonging here is "could
 * this run inside a Node script with no DOM and no native modules?".
 */

// No exports yet — placeholder so TypeScript and bundlers don't complain
// about an empty file.
export const __PACKAGE_VERSION__ = '0.0.0';
