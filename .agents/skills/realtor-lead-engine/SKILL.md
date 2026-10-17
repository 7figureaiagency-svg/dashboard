---
name: realtor-lead-engine
description: >-
  Comprehensive guide and operational runbook for developing, deploying, testing, and maintaining
  the realtor-lead-engine Supabase Edge Function, multi-channel WhatsApp/Telegram bot flows,
  multilingual conversational nuances, WABA anti-ban protections, and React CRM dashboard integration.
---

# Realtor Lead Engine & Multi-Channel CRM Runbook

This skill provides step-by-step procedures, business logic rules, and verification checklists for developing, deploying, and maintaining the real estate lead qualification engine, conversational bot flows, and CRM integration.

## 1. System Architecture & Boundaries

* **100% Non-n8n Architecture**:
  * **Database & Engine**: Supabase PostgreSQL + Edge Function (`supabase/functions/realtor-lead-engine/index.ts`).
  * **Frontend**: React + Vite CRM Dashboard (`src/`).
  * **n8n Workflows**: Read-only historical references only. NEVER edit, modify, or publish n8n workflows. All logic belongs in Supabase Edge Functions and the frontend codebase.
* **Channels**: Telegram Bot (`TELEGRAM_BOT_TOKEN`) and WhatsApp Cloud API (WABA multi-tenant via Meta Graph API).
* **Scheduled Triggers**: `pg_cron` invoking `/cron-sweep` every 10 minutes, plus CRM manual sweep trigger.

---

## 2. Development & Deployment Workflow

When making modifications to `realtor-lead-engine`:

### Step 1: Code Modifications & Version Bump
* Edit `supabase/functions/realtor-lead-engine/index.ts`.
* Increment the semantic version tag in the health endpoint response (e.g. `v25-...` -> `v26-...`).

### Step 2: Edge Function Deployment
Deploy the function using the Supabase MCP tool `deploy_edge_function` or the automated deployment script (`scratch/deploy_v*.cjs`):
* **Function Name**: `realtor-lead-engine`
* **Entrypoint**: `index.ts`
* **Verify JWT**: `false` (webhooks handle external channel validation)

### Step 3: Propagation Verification
Poll the live health check endpoint until the new version tag is returned:
* `GET https://<project_ref>.supabase.co/functions/v1/realtor-lead-engine/health`
* Ensure `status: "ONLINE"` and version matches the incremented tag.

### Step 4: Frontend Compatibility Check
Always verify the React CRM frontend compiles without TypeScript or build regressions:
```bash
npm run build
```

---

## 3. Conversational Rules & Language Invariants

### Language Matching & Phonetics
* **Mirror User Language**: Respond in the exact language/dialect used by the user:
  * **English**: Professional real estate tone.
  * **Hinglish**: Natural conversational Hindi in Latin script (*"Kaunsi location me property dekh rahe hain?"*).
  * **Gujlish**: Natural phonetics with authentic regional phrasing (*"Site par maliye chiye!"*, *"Bhavin bhai"*, not artificial robotic translations).
  * **Gujarati Script**: Gujarati script with Indic numeral normalization (`૧`, `૨`, `૩` -> 1, 2, 3; `અલકાપુરી` -> Alkapuri) matching against English inventory data.
* **Inventory Search Fallback**:
  * If no matching property is found in inventory, **DO NOT** suggest random or unrequested nearby properties.
  * Inform the user that a senior sales executive is curating customized options and will connect shortly via phone call.

### Site Visit Flow Invariants
* **Location Context**: Always say *"Milte hain site par"* / *"Site par maliye chiye"*. Never tell the user that a sales executive will pick them up from their home.
* **Returning Users**: If a site visit is already scheduled and the user sends a greeting ("Hi"/"Hello"), welcome them back and reference their upcoming appointment details rather than restarting qualification.
* **Rescheduling Intent**: If a user asks *"Site visit change thase?"*, reply *"Ha thase"* and ask for their preferred new date/time slot before modifying the database.
* **Missed Visits**: If user expresses inability to attend (traffic, emergency):
  1. Empathize in user's language (*"Arey koi vandho nahi..."* / *"Koi baat nahi..."*).
  2. Set state `VISIT_MISSED` and update appointment in `site_visits` to `MISSED`.
  3. Prompt with alternative reschedule slots.
  4. Send high-priority sales alert to the assigned executive.
* **Completed Visits (`SITE_VISIT_DONE`)**:
  * When visit is completed, set lead state `SITE_VISIT_DONE` (synced to CRM UI `VISIT_DONE`) and appointment to `COMPLETED`.
  * Trigger automated 3-stage nurture drip in user's preferred language:
    * **Day 1**: Preferred unit selection & token booking offer.
    * **Day 3**: Banking partners & lowest home loan rates.
    * **Day 7**: Final sitting / meeting with developer or alternative property review.

---

## 4. WABA Multi-Tenant Anti-Ban Protections

To protect client WhatsApp Business numbers and server resources:
* **Batch Cap**: Max 20 outbound messages per sweep execution across reminders, surveys, and drips.
* **Inter-Message Jitter**: 350ms to 550ms random delay between outbound dispatches.
* **Business Hours**: Outbound follow-ups and drips only execute between 11:00 AM and 6:30 PM IST.

---

## 5. Testing Policy

> [!CRITICAL]
> **DO NOT** run full QA test suites automatically. Only run test suites when explicitly instructed by the user.
* For targeted ad-hoc webhook checks, use lightweight scripts in `scratch/` (e.g. `test_user_query.cjs`).
