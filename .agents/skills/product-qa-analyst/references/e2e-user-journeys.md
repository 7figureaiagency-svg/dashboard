# End-to-End (E2E) User Journeys & QA Test Scenarios

This document defines the 5 canonical user journeys that the QA agent must validate end-to-end to detect logical flaws, broken integrations, or UI regressions.

---

## Journey 1: Inbound Lead Qualification (Webhook -> AI Engine)

### User Story:
A prospective homebuyer discovers an ad on Instagram or Meta and sends a WhatsApp message: *"Hi, I am looking for a 3BHK luxury apartment in South Mumbai under ₹5 Cr"*.

### E2E Flow:
1. **Webhook Ingestion**:
   - Meta Cloud API POSTs webhook payload to `/functions/v1/realtor-lead-engine/webhook`.
   - Webhook handler verifies client tenant mapping (`waba_phone_number_id` -> `client_id`).
   - If lead does not exist, insert into `leads` with `status: "QUALIFYING"`, `source: "WhatsApp Ads"`.
2. **AI Intent & Entity Extraction**:
   - Engine parses Budget (`50,000,000`), Bedrooms (`3BHK`), Locality (`South Mumbai`).
   - Query `inventory_items` matching criteria: `price <= 55000000 AND property_type = '3BHK'`.
3. **Conversational Response**:
   - AI bot formats response in the user's matching dialect (English/Hinglish/Gujlish).
   - Presents matching properties (e.g. *The Grandview Residences* or *Oberoi Sky City*).
   - Appends message to `activity_logs`.

### QA Verification Criteria:
- Lead phone format is sanitized (E.164: `+91...`).
- Lead record appears in CRM dashboard within <2s via Supabase Realtime.
- If user writes in Gujarati/Hinglish, AI response does NOT revert to generic English.
- If no inventory matches, bot gracefully asks for budget flexibility without hallucinating false properties.

---

## Journey 2: CRM Dashboard Lead Management & Quick Actions

### User Story:
A sales executive opens the CRM dashboard on their mobile browser or desktop to review fresh leads and make instant client contact.

### E2E Flow:
1. **Pipeline Table View**:
   - Navigate to `/dashboard`.
   - Verify top 4 KPI cards render valid counts (`Visits Today`, `Action Needed`, `Qualified Leads`, `In Qualifying`).
   - Filter chips test: Click `Hot Prospects` -> Table filters only `Hot Lead` rows.
2. **Lead Inspection Drawer**:
   - Click lead row -> Sheet slides in smoothly.
   - Conversation tab renders complete WhatsApp timeline in iMessage-style bubbles.
   - Activity tab renders timestamps and action actors.
3. **Quick Action Triggers**:
   - Click `Call` -> Valid `tel:+91...` protocol link triggered.
   - Click `WhatsApp` -> Valid `https://wa.me/91...` link with pre-filled context opened in new tab.
   - Toggle AI Bot switch -> Sends PATCH update to Supabase, toggles `bot_active`, records activity audit log.

### QA Verification Criteria:
- No hydration errors or missing DOM keys on table row rendering.
- On mobile viewport (< 768px), cards render with 44pt touch targets for finger tapability.
- Status update in drawer immediately reflects in table badge without page reload.

---

## Journey 3: Site Visit Booking & Chauffeur Transit

### User Story:
Client agrees to a site visit for Saturday at 3:00 PM. The CRM schedules the tour, notifies the executive, and issues a gate pass.

### E2E Flow:
1. **Schedule Site Visit**:
   - In Lead Drawer, executive selects `status: "SITE_VISIT_BOOKED"`.
   - Selects property from dropdown and picks datetime.
   - Saves record.
2. **Database Verification**:
   - `leads.site_visit_datetime` is saved as valid ISO timestamp.
   - `leads.status` updated to `SITE_VISIT_BOOKED`.
   - Audit log recorded in `activity_logs`.
3. **Site Visits Tab**:
   - Visit appears under `Site Visits` tab with chauffeur transit status (Confirmed / In Transit / Completed).

### QA Verification Criteria:
- Site visit cannot be scheduled in the past.
- Missing datetime triggers validation alert before submitting.
- Executive profile shows incremented site visit count.

---

## Journey 4: Automated Cron Sweep (WABA Safe Invariant)

### User Story:
The automated lead qualification engine runs its scheduled sweep to dispatch pre-visit reminders (24h before tour) and daily follow-up drips.

### E2E Flow:
1. **Trigger Sweep**:
   - Post to `/functions/v1/realtor-lead-engine/cron-sweep`.
2. **Safety Gates Verification**:
   - **Gate 1 (Time Window)**: If current IST time is before 11:00 AM or after 6:30 PM, execution must skip outbound messaging.
   - **Gate 2 (Batch Cap)**: Max 20 leads processed per execution.
   - **Gate 3 (Jitter)**: Inter-message delay of 350ms-550ms between Meta API calls.
3. **Dispatch & Flags**:
   - For leads with visit tomorrow: sends pre-visit reminder WhatsApp template and sets `pre_visit_reminder_sent = true`.
   - For completed visits: sends feedback survey and sets `post_visit_feedback_sent = true`.

### QA Verification Criteria:
- Never sends duplicate reminders if `pre_visit_reminder_sent` is already `true`.
- Never exceeds 20 messages in a single run.
- Zero n8n calls made.

---

## Journey 5: Multi-Tenant Role Isolation (Admin vs Executive)

### User Story:
An onboarded field executive logs in and must only see leads assigned to them, while the Admin sees the full brokerage portfolio.

### E2E Flow:
1. **Executive Login**:
   - Session authenticated. `me.role = 'executive'`.
   - Dashboard table automatically locks `executive` filter to `me.fullName`.
   - Only leads where `assigned_executive_id = myExecutiveId` are rendered.
2. **Admin Login**:
   - `me.role = 'admin'`.
   - Full unfiltered access across all brokerage leads and executives.
   - Admin-only controls visible: `Run Follow-Up Sweep`, `WhatsAppConnectCard`.

### QA Verification Criteria:
- Executive cannot access or modify unassigned leads.
- Switching between tabs does not clear executive session state.
