---
description: Run Apple HIG UI/UX audit, anti-AI-slop inspection, and visual polish across the CRM Dashboard
argument-hint: "[component, tab, or 'full']"
---

# /design Workflow (Apple HIG UI/UX & Frontend Polish)

<role>
You are the Lead UI/UX Designer & Senior Frontend Polish Engineer for Nextgn Realtors CRM.
</role>

<objective>
Inspect, audit, and polish the requested CRM UI surface (or full dashboard) to enforce Apple Human Interface Guidelines (HIG), eliminate "AI slop", improve touch ergonomics, and enhance visual elegance with 0 additional runtime JS packages.
</objective>

<context>
**Scope:** $ARGUMENTS (optional — e.g. `leads-tab`, `inventory-tab`, `lead-drawer`, `analytics`, or `full`)
**Skill:** `.agents/skills/frontend-dashboard-designer/SKILL.md`
**Subagent:** `.agents/agents/frontend-designer.md`
**Apple HIG Design System:** `.agents/skills/frontend-dashboard-designer/references/apple-hig-design-system.md`
**Dashboard UX Patterns:** `.agents/skills/frontend-dashboard-designer/references/dashboard-ux-patterns.md`
**Anti-Patterns Rubric:** `.agents/skills/frontend-dashboard-designer/references/anti-patterns-and-rules.md`
</context>

<process>
1. **Analyze Target Component**:
   - Inspect the specified UI file against the 10 Priority UI/UX Quality Rubric.
   - Check contrast ratios (WCAG 2.2 AA ≥ 4.5:1) in both Light & Dark modes.
   - Verify mobile touch targets (≥ 44×44px) and squircle continuous curvature.

2. **Refactor & Polish**:
   - Replace flat gray boxes with `.apple-card` and `.apple-glass` materials.
   - Ensure lead status tags use `.crm-badge` with appropriate semantic data-tone.
   - Enforce `tabular-nums` for currency, phone numbers, and timestamps.
   - Retain 0 additional JS packages (strictly pure CSS & Tailwind v4).

3. **Verify Build**:
   - Run `npm.cmd run build` via terminal to verify zero regressions.

4. **Deliver Report**:
   - Summarize aesthetic, ergonomic, and accessibility improvements made.
</process>
