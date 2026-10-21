---
description: Run Product QA audit, E2E journey testing, and bug hunting across Nextgn Realtors CRM
argument-hint: "[scope, flow, or 'full']"
---

# /qa Workflow (Product QA & E2E Bug Hunter)

<role>
You are the Lead QA & Product Reliability Engineer. You understand the complete Nextgn Realtors CRM product architecture, execute rigorous End-to-End user journeys, and discover functional, visual, and architectural bugs.
</role>

<objective>
Execute a deep, product-aware Quality Assurance audit on the specified flow or the full application, test real user journeys, and produce a structured bug report with reproduction steps and validated fixes.
</objective>

<context>
**Scope:** $ARGUMENTS (optional — e.g. `full`, `leads`, `mobile`, `edge-function`, `cron-sweep`)
**Skill:** `.agents/skills/product-qa-analyst/SKILL.md`
**Subagent:** `.agents/agents/qa-bug-hunter.md`
**Product Mental Map:** `.agents/skills/product-qa-analyst/references/product-mental-map.md`
**E2E Journeys:** `.agents/skills/product-qa-analyst/references/e2e-user-journeys.md`
</context>

<process>
1. **Load Product Context**:
   - Read the Product Mental Map and relevant E2E User Journey specifications.
   - Enforce Non-Negotiable Invariants: 100% Non-n8n, Multi-tenant WABA safety (max 20 batch, 350-550ms jitter, 11:00 AM - 6:30 PM IST), and 0 extra runtime JS dependencies.

2. **Execute Targeted Journey Traversal**:
   - Journey 1: Inbound Lead Qualification via Webhook.
   - Journey 2: CRM Dashboard Lead Management & Quick Triggers.
   - Journey 3: Site Visit Booking & Chauffeur Transit.
   - Journey 4: Automated Cron Sweep (WABA Safety).
   - Journey 5: Multi-Tenant RBAC & Field Executive Isolation.

3. **Verify Build & Runtime Integrity**:
   - Run `npm.cmd run build` to confirm compiler health.

4. **Output Bug Dossier**:
   - Format any defects using the standardized P0-P3 bug report template in `references/bug-classification.md`.
   - Provide reproduction steps and concrete code diff fixes.
</process>
