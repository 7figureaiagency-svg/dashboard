# Multi-tenant onboarding — setup guide

This documents what was changed for self-serve client onboarding (Facebook
login + phone OTP + automatic WhatsApp linking + per-client lead-source
webhooks + strict tenant isolation), and the steps needed on the Supabase /
Meta side to make it fully live. The code ships with safe placeholders —
nothing here breaks the existing app if you skip a step, it just leaves that
one feature inactive until configured.

## 1. Apply the database migration

`supabase/migrations/20260924000000_multi_tenant_onboarding.sql` is new. It
is written to be safe to run against the **live** project (everything is
`IF NOT EXISTS` / idempotent), and it:

- Reconciles `clients`, `executives`, `client_integrations` into migration
  history (they existed live but weren't tracked in this repo).
- Adds `profiles.client_id` / `phone` / `phone_verified`, `executives.user_id`,
  and a handful of columns on `clients` used for the WhatsApp link.
- Replaces the old "first signup becomes admin" trigger with one that binds
  a new sign-in to an existing team (by matching their email against
  `executives.email`) or leaves them unassigned until they complete
  onboarding.
- Turns on Row Level Security on every tenant table (`clients`, `executives`,
  `client_integrations`, `leads`, `inventory`, `lead_activity`) scoped to the
  signed-in user's own `client_id`, and locks the `property-brochures`
  storage bucket to per-tenant folders.

Run it with the Supabase CLI:

```bash
supabase link --project-ref rooimpeiyxhxkfnqkyay   # if not already linked
supabase db push
```

**Note:** the app now points at Supabase project `rooimpeiyxhxkfnqkyay`. If this
is a brand-new project, it has none of the tables yet — you'll need to run
every file in `supabase/migrations/` **in order** (not just the newest one),
since they build on each other (base `leads`/`inventory` columns → `profiles`
+ `is_admin` → this multi-tenant migration). `supabase db push` applies all
pending migrations in order automatically. If it's a copy of the old project
instead, this step is unnecessary for the tables that already match.

or paste the file's contents into the Supabase SQL Editor and run it once.

**Do this before deploying the updated app** — the dashboard now assumes
`client_id`/RLS are in place.

## 2. Enable Facebook login in Supabase Auth

Dashboard → Authentication → Providers → Facebook:

1. Create a Meta app at https://developers.facebook.com/apps (type: "Business").
2. Add the **Facebook Login** product. Under Settings → Basic, copy the
   **App ID** and **App Secret**.
3. In Facebook Login → Settings, add your Supabase auth callback URL as a
   valid OAuth redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Paste the App ID / App Secret into Supabase's Facebook provider config
   and enable it.
5. Set `VITE_META_APP_ID` (in `.env`) to the same App ID so the "Continue
   with Facebook" button on `/auth` lights up.

## 3. Enable phone OTP (for the onboarding phone-verification step)

Dashboard → Authentication → Providers → Phone → enable it, and configure an
SMS provider (Twilio, MessageBird, Vonage — any of Supabase's supported
ones) with your credentials. Until this is set up, the "Send verification
code" button in `/onboarding` will show an error — users can click
**"Skip phone verification for now"** to continue without it.

## 4. WhatsApp Embedded Signup (automatic WhatsApp linking)

This is what lets a client connect their own WhatsApp Business number
without you touching Meta Business Manager per-client.

1. On the same Meta app, add the **WhatsApp** product, then add the
   **Facebook Login for Business** product.
2. Under WhatsApp → Embedded Signup (or Facebook Login for Business →
   Configurations), create a signup configuration and note its
   **Configuration ID**.
3. Your app needs Advanced Access for `whatsapp_business_management` and
   `whatsapp_business_messaging` (Meta App Review) before real client
   businesses (not just admins/testers) can complete this flow.
4. Set these env vars:
   - `VITE_META_APP_ID` / `VITE_META_CONFIG_ID` (browser-side — drives the
     "Connect WhatsApp" button in `src/components/crm/whatsapp-connect.tsx`)
   - `META_APP_ID` / `META_APP_SECRET` (server-side only — used by
     `src/lib/server/onboarding.functions.ts` to exchange the signup `code`
     for a permanent access token via the Graph API)
5. Once connected, the client's `clients` row gets `waba_id`,
   `phone_number_id`, `access_token`, `display_phone_number` populated, and
   a `client_integrations` row (`provider = 'meta'`) is created/updated
   automatically.

**Without these env vars set**, clicking "Connect WhatsApp" still lets a
client capture their `waba_id`/`phone_number_id` (shown to them once Meta
returns from the popup), but the permanent access token is left blank and
the client row is marked `meta_signup_status = 'connected_pending_token'` —
someone with Meta access will need to issue that token manually until the
app secret is configured.

## 5. How a WhatsApp lead reaches the right tenant (for whoever updates n8n)

WhatsApp Cloud API webhooks are registered **once**, at the Meta app level
— every client's messages land on the same webhook URL
(`META_WEBHOOK_URL`), each payload carrying that message's `phone_number_id`.

To route a message to the right tenant, resolve it against `clients`:

```sql
select id as client_id, access_token
from clients
where phone_number_id = :incoming_phone_number_id;
```

Every `leads` / `inventory` / `lead_activity` write your workflow performs
after that must include `client_id = <resolved id>` — RLS will reject
anything else once you're writing as an authenticated role, and even the
service-role key should still stamp the right `client_id` since the
dashboard now scopes every read by it.

Portal leads (99acres, Housing.com, etc.) are simpler: the client picks a
per-tenant webhook URL from the "Lead Sources & WhatsApp" tab
(`.../webhook/portal/<provider>/<client_id>`), so `client_id` is already in
the URL path — no lookup needed.

The 3 uploaded n8n workflows (`Lead qualifier`, `Sales Notification
Handler`, `Qualified lead to Site visit book follow up`) were **not**
modified in this change — they're still single-tenant/Telegram-based today
(one shared bot + Supabase credential, no `client_id` anywhere). Updating
them to the contract above is the next step before WhatsApp leads actually
reach a specific tenant's dashboard end-to-end.

## 6. What's already wired up in the app

- `/auth` — "Continue with Facebook" (falls back to email/password).
- `/onboarding` — phone OTP → company name → WhatsApp connect. Runs
  automatically for any signed-in user without a `client_id` yet.
- Team tab (inside "Team Performance") — admin adds an executive's email;
  that person is linked to the tenant automatically on their first sign-in.
- "Lead Sources & WhatsApp" tab — WhatsApp connection status/reconnect, plus
  add/edit/remove any number of portal webhook URLs
  (99acres/Housing/MagicBricks/OLX/custom).
- Every table (`leads`, `inventory`, `lead_activity`, `executives`,
  `client_integrations`, `clients`) is now tenant-scoped end to end — one
  client's admins/executives can never see another client's data, enforced
  by RLS (not just app-level filtering).
