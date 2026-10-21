# Nextgn Realtors CRM: Product Mental Map & Architectural Specification

This document provides the foundational mental map of the product so that QA agents and automated testing routines deeply understand business boundaries, data models, state machines, and system invariants.

---

## 1. System Invariants & Architectural Rules

### Invariant 1: 100% Non-n8n Architecture
- **Rule**: All backend business logic, webhook processing, AI qualification, and automated sweeps reside exclusively within **Supabase PostgreSQL** and **Supabase Edge Functions** (`supabase/functions/realtor-lead-engine/`).
- **QA Check**: Any attempt to call, reference, or deploy n8n webhooks is a critical architecture violation. n8n files are purely historical read-only references.

### Invariant 2: Multi-Tenant WABA Safety
- **Rule**: All outbound automated messaging (pre-visit reminders, post-visit feedback surveys, daily qualification drips) must strictly enforce:
  1. **Batch Cap**: Maximum 20 leads processed per cron sweep.
  2. **Inter-message Jitter**: 350ms to 550ms random delay between outgoing WhatsApp API requests.
  3. **Strict Business Hours**: Only dispatch between **11:00 AM and 6:30 PM IST** (to prevent WhatsApp Business Account bans).
- **QA Check**: Simulate sweep at 10:00 AM IST or 7:00 PM IST — system must defer dispatch. Simulate 50 leads — system must cap at 20 leads.

### Invariant 3: Zero Additional Runtime JS Packages
- **Rule**: The frontend uses TanStack Start, React 19, Tailwind CSS v4 (`@theme inline`), and TanStack Query.
- **QA Check**: Verify `package.json` changes during bug fixes — never introduce heavy runtime libraries when pure CSS or native browser APIs suffice.

---

## 2. Core Data Entities & Schema Topology

| Table | Primary Role | Key Columns / Constraints |
|---|---|---|
| `clients` | Multi-tenant brokerage tenant record | `id`, `company_name`, `waba_phone_number_id`, `access_token`, `waba_verified` |
| `leads` | Central prospective buyer record | `lead_id`, `client_id`, `phone`, `name`, `status`, `property_state`, `budget`, `selected_property_name`, `site_visit_datetime`, `assigned_executive_name`, `assigned_executive_id`, `bot_active` |
| `activity_logs` | Audit trail & communication history | `id`, `lead_id`, `action`, `actor`, `message`, `metadata`, `created_at` |
| `inventory_items` | Real estate projects & units | `id`, `client_id`, `name`, `location`, `property_type`, `price`, `available_units`, `amenities`, `rera_id` |
| `client_executives` | Onboarded sales executives & agents | `id`, `client_id`, `user_id`, `full_name`, `phone`, `role` (Admin / Executive) |
| `agent_sessions` | Conversational state & AI memory | `lead_id`, `conversation_history`, `last_intent`, `pending_action`, `updated_at` |

---

## 3. Lead Lifecycle State Machine

The product strictly enforces a finite state machine for lead progression:

```
[NEW / FRESH]
      │
      ▼ (Inbound message via WhatsApp/Telegram)
[QUALIFYING] (AI asks budget, locality, bedroom count)
      │
      ├────────────────────────┬────────────────────────┐
      ▼                        ▼                        ▼
[QUALIFIED]             [VISIT_MISSED]           [NOT_INTERESTED]
(Budget/area matched)    (Scheduled but no-show)   (Opted out / budget < min)
      │
      ▼ (Client agrees to site visit)
[SITE_VISIT_BOOKED]
      │
      ▼ (Site visit completed)
[VISIT_DONE]
      │
      ▼ (Booking token paid)
[TOKEN_RECEIVED / NEGOTIATING]
      │
      ▼
[CLOSED_WON]
```

### Critical State Transition Invariants:
1. When `status` moves to `SITE_VISIT_BOOKED`, `site_visit_datetime` (or `site_visit_at`) MUST be non-null and valid ISO timestamp.
2. When client requests a human agent or asks complex legal/escrow questions, `property_state` must become `HUMAN_HANDOVER` and `bot_active` must toggle to `false` (Paused).
3. If `bot_active` is `false`, the AI bot MUST NOT send automated conversational replies.

---

## 4. Frontend Surface Topology

1. **Dashboard Shell** (`src/routes/_authenticated/dashboard.tsx`):
   - Desktop: Persistent Tabs sidebar with badge counts + sticky navigation header.
   - Mobile: Mobile top bar + 44pt touch controls + bottom tab bar.
2. **Leads View & Pipeline Table** (`src/components/crm/ExecutiveLeadPipelineTable.tsx`):
   - Top 4 KPI metric cards: `Visits Today`, `Action Needed`, `Qualified Leads`, `In Qualifying`.
   - 5 Filter chips: `All Leads`, `Hot Prospects`, `Site Visit Scheduled`, `Follow-up Due`, `Closed / Won`.
   - Desktop: 8 exact columns:
     `CUSTOMER NAME` | `ASSIGNED EXECUTIVE` | `PHONE` | `STATUS` | `AI BOT STATUS` | `SELECTED PROPERTY` | `BUDGET` | `QUICK ACTIONS`.
   - Mobile: Touch cards with instant `Call` and `WhatsApp` triggers.
3. **Inspector Drawer** (`src/components/crm/lead-drawer.tsx`):
   - iOS / iMessage style chat bubble timeline.
   - Live AI bot toggle switch.
   - Property suggestion cards and status select dropdown.
4. **Site Visits Tab** (`src/components/crm/site-visits-tab.tsx`):
   - Daily tour agenda, chauffeur transit indicators, and gate pass clearances.
