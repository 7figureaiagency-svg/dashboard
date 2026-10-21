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
