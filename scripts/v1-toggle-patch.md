# v1 → v2 Toggle Button — Full Patch for math-wizard (v1)

This patch makes Math Wizard Pro discoverable from the existing v1 app on
**every page** — landing, registration, and the in-app experience.

Apply these changes to `sansin/math-wizard` (v1 repo). Three files touched.
Safe to revert by reverting the commit.

---

## Step 1 — set the v2 URL

Add to v1's `.env.local` (and `.env.example`):

```env
REACT_APP_V2_URL=https://math-wizard-pro.vercel.app
```

(Replace with your actual Vercel URL.)

For the GitHub Pages production build, you'll need to either inline the URL
in `package.json`'s build script, or use a GitHub Actions workflow with the
secret set. The simplest option:

In `package.json`:
```json
"scripts": {
  "build": "REACT_APP_V2_URL=https://math-wizard-pro.vercel.app react-scripts build",
  ...
}
```

---

## Step 2 — patch the desktop nav (`src/App.jsx`)

Find the desktop nav block (starts with `<div className="hidden md:flex items-center space-x-3">`).

Add this **as the first button** in that block:

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

---

## Step 3 — patch the mobile menu drawer (`src/App.jsx`)

Find the mobile menu drawer block. Add this **as its first item** (before the
"Play / Progress / Settings / Parent" links):

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

---

## Step 4 — add a banner to the unauthenticated HomePage (`src/components/HomePage.jsx`)

The HomePage is what visitors see at the top of the v1 app before signing in.
We want a prominent banner there too — that's where new users land.

At the very top of the `return (...)` JSX in `HomePage.jsx` (right after the
opening `<div>` of the root container), insert:

```jsx
{process.env.REACT_APP_V2_URL && (
  <div className="bg-amber-400 text-violet-900 py-2 px-4 text-center font-semibold text-sm sm:text-base shadow">
    ✨ A redesigned <a href={process.env.REACT_APP_V2_URL} className="underline font-bold hover:text-violet-700">Math Wizard Pro</a> is here — faster, smarter, with AI tutoring. Give it a try!
  </div>
)}
```

This banner appears at the top of the landing page above the hero. It's
intentionally bright (amber on violet) so it doesn't get missed.

---

## Step 5 — add a button to the Registration / login screen (`src/components/Registration.jsx`)

Find the top of the login/register card. Add a small "Try Pro instead" link near
the bottom of the form, or as an alternative path:

```jsx
{process.env.REACT_APP_V2_URL && (
  <div className="mt-4 pt-4 border-t border-violet-200 text-center text-sm">
    <p className="text-gray-600 mb-2">Or check out the new version:</p>
    <a
      href={process.env.REACT_APP_V2_URL}
      className="inline-block px-4 py-2 bg-amber-400 text-violet-900 font-bold rounded-lg hover:bg-amber-300 transition shadow"
    >
      🚀 Math Wizard Pro
    </a>
  </div>
)}
```

Place it after the form submit button or at the bottom of the form card.

---

## Step 6 — deploy

```bash
npm run build
npm run deploy
```

That's it — every entry point of v1 now points at v2. The "Try Pro" button is
on:
- The HomePage banner (visitors)
- The Registration screen (signing up / logging in)
- The desktop nav (signed-in users)
- The mobile menu (signed-in users)

---

## What v2 already does (no change needed)

Math Wizard Pro automatically reads `NEXT_PUBLIC_V1_URL` and shows a
"← Classic Math Wizard" link in:
- The desktop nav (next to the user avatar)
- The mobile drawer
- The user dropdown menu

So bidirectional cross-linking is in place once you set `NEXT_PUBLIC_V1_URL`
on Vercel (already done if you followed the deploy guide).

---

## How to revert

If you need to roll back v1 entirely:
```bash
git revert <commit-hash-of-this-patch>
npm run build
npm run deploy
```

Done. Users keep using v1 as before; v2 stays running independently.
