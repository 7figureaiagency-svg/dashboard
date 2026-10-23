# Architecture Decisions

## Phase 4 Decisions: Bi-Directional Dual-Persona Lifecycle Architecture

**Date:** 2026-10-21

### Scope
- Support bi-directional lifecycle where the same client can act as both Property Seeker (Buyer/Tenant) and Property Provider (Seller/Landlord).
- Maintain both profiles in parallel without criteria wipes or state deadlocks.
- Contextual dual-reminder greeting menu for returning dual clients.

### Approach
- **Choice:** Option A (Multi-Persona Lead Model)
- **Rationale:** 
  - Upgrades `leads.lead_type` to `'DUAL_ROLE'` when both buyer and seller actions are registered.
  - Buyer criteria (`property_type`, `budget`, `location`, `site_visit_at`) persist in `leads` table.
  - Seller properties persist independently in `property_submissions` table (with `lead_id` foreign key).
  - Contextual Dual-Reminder greeting menu acknowledges both upcoming visits and submitted property verification status when user greets.
  - Full visibility in React CRM Dashboard with `[DUAL: BUYER + SELLER 🌟]` badges and Lead Drawer dual tabs.

### Constraints
- 100% Non-n8n architectural compliance.
- Zero criteria wipes: Switching personas must NEVER delete previous search criteria or cancel scheduled visits.
- High-converting Indic language support across English, Hinglish, and Gujlish.

## Phase 7 Decisions: Multi-Portal Lead Webhooks, Auto-Property Presentation & Site Visit Booking Engine

**Date:** 2026-10-23

### Scope
- Universal webhook ingestion for major Indian real estate portals (99acres, MagicBricks, Housing.com, CommonFloor, Facebook Lead Ads, and Custom Webhooks) in `integrations-tab.tsx`.
- Real-time automated property matching and WhatsApp outreach delivery with brochure links, Google map pins, and consultative site visit CTAs.
- Seamless handoff to the TypeChat FSM conversational engine when the lead replies on WhatsApp.
- Prominent missing WhatsApp number indicator in CRM Leads Table, Badges, and Drawer with 1-tap manual phone entry modal.
- Multi-tenant isolation and WABA safety compliance (zero bans, transactional messaging, and anti-ban jitter).

### Approach
- **Outreach Timing:** Option A (Instant Real-Time Automated Outreach) — Triggers WhatsApp outreach within seconds of receiving the portal webhook payload to maximize lead conversion during peak intent.
- **Language & Tone:** Consultative Hinglish — Engaging, high-taste, brand-tailored real estate advisor tone delivering property specs, pricing, brochure PDF link, map pin, and an invitation to schedule an exclusive VIP site visit.
- **Missing Phone UI & Fallbacks:**
  - Leads with no phone, landline, or masked numbers receive a dedicated badge: `⚠️ No WhatsApp Number`.
  - Drawer shows visual alert banner: *"Portal inquiry me WhatsApp number provide nahi kiya gaya"*.
  - 1-tap "Add WhatsApp Number" modal allows sales executives to input verified mobile numbers acquired via phone/email, immediately enabling WhatsApp chat actions.
- **De-duplication:** Automatically merges multiple inquiries from the same phone/email across different portals within a 24-hour window to prevent CRM clutter.

### Constraints
- Strictly 100% Non-n8n (all webhook logic and normalization inside Supabase Edge Function `realtor-lead-engine` and CRM dashboard).
- Zero additional runtime JavaScript packages (pure React, Tailwind v4, Lucide icons, and TanStack Query).
- Multi-tenant WABA safety: tenant-scoped token resolution and compliance with Meta messaging limits.

