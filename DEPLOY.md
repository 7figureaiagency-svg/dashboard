# Deploying to Vercel (via GitHub)

## What changed to make this Vercel-ready

- **`vite.config.ts`** — hard-pins the Nitro build target to `preset: "vercel"`,
  so `vercel build` always produces a proper Vercel serverless deployment
  instead of relying on auto-detection (this only applies *outside* a
  Lovable build; Lovable's own pipeline is unaffected).
- **`vercel.json`** — explicitly sets `installCommand: "npm ci"` and
  `buildCommand: "npm run build"`, and `framework: null` so Vercel doesn't
  try to apply a generic Vite/SPA static-site preset over Nitro's server
  output. This also sidesteps the fact that both `bun.lock` **and**
  `package-lock.json` exist in this repo (Vercel would otherwise guess the
  package manager from whichever lockfile it finds first) — npm is pinned
  explicitly to remove the ambiguity.
- **`.gitignore`** — now excludes `.env` / `.env.local` / `.env.*.local` and
  `.vercel`. This repo was never committed to git yet, so nothing sensitive
  has leaked, but do **not** remove this before your first commit.
- **`package.json`** — added `"engines": { "node": ">=20.9.0" }`.

## 1. Push to GitHub

```bash
cd "nextgnrealtors multi tenant"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

`.env` is git-ignored, so double-check with `git status` before your first
commit that it does **not** show up as a tracked file.

## 2. Import the repo into Vercel

Vercel dashboard → **Add New → Project** → import the GitHub repo. Framework
preset: choose **Other** (vercel.json already overrides this to `null`, so
whatever you pick here doesn't really matter). Leave Build/Install commands
as "Override" if the dashboard fills in something else — `vercel.json`'s
values win.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Set these for **Production**, **Preview**, and **Development** environments:

| Variable | Required? | Where it's used |
|---|---|---|
| `SUPABASE_URL` | Yes | server + client Supabase connection |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | server + client (anon key) |
| `VITE_SUPABASE_URL` | Yes | same value as `SUPABASE_URL`, exposed to the browser bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | same value as `SUPABASE_PUBLISHABLE_KEY`, exposed to the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes — currently missing** | server-only (`client.server.ts`), bypasses RLS. Needed for onboarding (creating a tenant, promoting to admin) and the WhatsApp-link server function to work at all. **Get this from Supabase → Project Settings → API → `service_role` secret, and only ever put it in Vercel's env settings (or a local `.env` that stays git-ignored) — never in chat, a commit, or the client bundle.** |
| `META_APP_ID` / `META_APP_SECRET` | Optional | server-side Meta token exchange for WhatsApp linking |
| `META_GRAPH_VERSION` | Optional (defaults to `v21.0`) | Meta Graph API version |
| `META_WEBHOOK_URL` | Optional | shown as the "meta" row in the webhooks tab |
| `VITE_META_APP_ID` / `VITE_META_CONFIG_ID` | Optional | enables "Continue with Facebook" + WhatsApp Embedded Signup buttons in the browser |
| `VITE_META_GRAPH_VERSION` | Optional | |
| `VITE_N8N_WEBHOOK_BASE_URL` | Optional | pre-fills suggested portal webhook URLs |

`SUPABASE_SERVICE_ROLE_KEY` was never in `.env` in this project — I didn't
have it and it's a secret you should never paste into chat. Add it to Vercel
(and to your own local `.env`, which is git-ignored) before relying on
onboarding or WhatsApp linking in production.

## 4. Point Supabase's Auth allow-list at your Vercel domain

Supabase → Authentication → URL Configuration:

- **Site URL**: your production Vercel domain, e.g. `https://your-app.vercel.app`
- **Redirect URLs**: add the same domain (and any preview-deployment
  wildcard you want, e.g. `https://your-app-*.vercel.app/**`) — otherwise
  Facebook login's `redirectTo` and email confirmation links will be
  rejected.

## 5. Apply the database migration (if you haven't already)

```bash
supabase link --project-ref rooimpeiyxhxkfnqkyay
supabase db push
```

See `SETUP.md` for the full breakdown of what that migration does and the
Meta/Facebook app setup needed for login + WhatsApp linking to actually work
end to end.

## 6. Deploy

Push to `main` (or open a PR for a Preview deployment) — Vercel builds and
deploys automatically once the repo is imported.

## Known limitation

I verified this project with a full TypeScript typecheck and ESLint (both
clean). I could **not** run an actual `vite build` / `vercel build` in this
sandbox — it has no outbound network access and its Node install is missing
a native binary for `rolldown` (Vite 8's bundler) on this sandbox's specific
architecture. That's a sandbox-environment issue, not a code issue, and
Vercel's own build image is the officially supported target for this stack
— but treat your first Vercel build as the real verification, and check the
build logs if anything unexpected comes up.
