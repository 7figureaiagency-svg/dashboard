# Better Team Performance Tracking

Today the Performance tab only shows totals computed from the current state of each lead. There is no record of *what* an executive actually did, or *when*. Once a lead changes again, the earlier action disappears. The fix is to record every action as it happens and give each executive a profile page built from that history.

## 1. Activity history (the core change)

Add an activity log that records one row every time anyone acts on a lead:
- who acted (executive name)
- which lead
- what happened (took over chat, marked contacted, booked site visit, marked visit done, dropped lead, edited profile, paused/resumed AI, added notes)
- old value to new value where relevant (e.g. status QUALIFYING to SITE_VISIT_BOOKED)
- the note text saved with the action
- timestamp

Every existing action in the lead drawer and the leads table writes to this log in the same step as the lead update.

## 2. Executive profile page

Clicking an executive name anywhere (leaderboard or leads table) opens their profile:
- Scorecard: leads assigned, visits booked, visits done, conversion rate, average frozen SLA, alerts still unattended, actions logged in the selected period
- Activity timeline: reverse-chronological feed of every action with lead name, what changed, note, and time
- Their leads: the same lead table filtered to that executive
- Period switch: Today / 7 days / 30 days / All time

## 3. Upgraded Performance tab

- Period switch applied to all metrics so the client can compare weeks
- Leaderboard gains: conversion rate, actions in period, last active time, and a "silent" flag for executives with assigned leads but no action in 48 hours
- Sortable columns, and each row expands to a mini preview of that executive's last 5 actions
- Daily activity chart (actions per day per executive) so the client can see effort, not just outcomes

## 4. Accountability signals

- Unattended alerts broken out per executive with age of the oldest alert
- "Leads untouched in 7 days" count per executive
- Response-time distribution (under 15 min / 15-30 min / over 30 min) instead of only an average, so one bad lead does not hide a good record

## Technical notes

- New table `public.lead_activity` (lead_id, lead_name, executive_name, action, field, old_value, new_value, note, created_at) with grants and read/insert policies matching the current public-access model used by `leads` and `inventory`.
- Logging is written through the existing mutation helpers in `src/lib/crm-data.ts` so every current action path is covered without touching component logic twice.
- New `useActivity` query hook with the same 30-second polling as the other CRM queries; queries filtered by executive and date range server-side to keep payloads small.
- New `src/components/crm/executive-drawer.tsx` for the profile, reusing existing badges and table primitives.
- `performance-tab.tsx` refactored to accept a period and derive metrics from both `leads` and `lead_activity`. Frozen SLA logic in `src/lib/crm.ts` stays as is.
- History starts accumulating from the moment this ships; past actions cannot be reconstructed.
