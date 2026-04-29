# v1 → v2 Toggle Button — Patch for math-wizard (v1)

This is a tiny diff to apply to the existing `sansin/math-wizard` repo so users
on the live v1 app can opt in to **Math Wizard Pro**.

It adds a single button to `src/App.jsx` (in the existing nav). No styling
changes elsewhere. Safe to revert by removing the button.

---

## Step 1 — set the v2 URL

Add to `.env.local` (and `.env.example`):

```env
REACT_APP_V2_URL=https://math-wizard-pro.pages.dev
```

(Replace with whatever Cloudflare Pages URL or custom domain you choose.)

## Step 2 — patch the desktop nav (around line 175 of `src/App.jsx`)

Find the desktop nav block (the one starting with `<div className="hidden md:flex items-center space-x-3">`)
and add **as the first button**:

```jsx
{process.env.REACT_APP_V2_URL && (
  <a
    href={process.env.REACT_APP_V2_URL}
    className="px-4 py-2 rounded-lg font-semibold bg-amber-400 text-violet-900 hover:bg-amber-300 transition shadow"
    title="Try the redesigned Math Wizard Pro"
  >
    🚀 Try Pro →
  </a>
)}
```

## Step 3 — patch the mobile menu (search for the mobile menu block)

Find the mobile menu drawer and add as its first item:

```jsx
{process.env.REACT_APP_V2_URL && (
  <a
    href={process.env.REACT_APP_V2_URL}
    className="block w-full text-left px-4 py-3 rounded-lg font-semibold bg-amber-400 text-violet-900"
    onClick={() => setMenuOpen(false)}
  >
    🚀 Try Math Wizard Pro
  </a>
)}
```

## Step 4 — deploy

```bash
npm run build
npm run deploy
```

That's it — existing v1 users now see a "Try Pro" button. No other v1 code is
touched. Reverting is a single git revert.

---

## What the user sees on v2

Math Wizard Pro automatically reads `NEXT_PUBLIC_V1_URL` and shows a
"← Classic" link in its nav so users can go back. The toggle is bidirectional.
