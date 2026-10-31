# Debug Session: PRE_VISIT_REMINDER_DUPLICATION_AND_2_HOUR_CONSOLIDATION

## Symptom
**User Report:** "pre visit reminder do bar ja rha he matlab same kam ke do funcation he. hamko site visit ke 2 gante pahele pre visit reminder bhejna he. yad rhe hamoko batch me bhejne he taki server pe load na pade. check karo ke expected funcation kam karte he ke nai. follow up workflow aur bhi duplicate functionsho to check karo and single function hi rakho ek kam ke liye"

- **When:** When a site visit is scheduled for today.
- **Actual Behavior:** 
  1. Module 1A (Morning Briefing, lines 3643-3736 in `index.ts`) runs between 9:00 AM - 11:30 AM IST and sends a morning visit briefing (`Suprabhat / Good morning...`).
  2. Module 1 (Pre-Visit Reminders, lines 3739-3829 in `index.ts`) runs within 35-85 minutes before visit time and sends a 1-hour pre-visit reminder (`Namaste... Reminder... 1 ghante me...`).
  Both run under `runPreVisit = runAll || options.types.includes("pre_visit")`. As a result, users receive two duplicate reminder messages before their visit in different formats.
- **Expected Behavior:**
  1. Consolidate into ONE single Pre-Visit Reminder function. Eliminate Module 1A completely.
  2. Pre-visit reminder must be sent **2 hours before the site visit** (window: 90 to 150 minutes, centered at 120 mins).
  3. Ensure strict batching (`limit(BATCH_LIMIT)`) and inter-message jitter delay (`sleepJitter()`, 350-550ms) to prevent server/WABA/Telegram load.
  4. Ensure all other follow-up modules (Post-Visit Feedback, Unconfirmed Attendance Nudge, Missed Visit Reschedule, Daily Incomplete Follow-up, Post-Visit Drip Cadence) have disjoint, non-overlapping gates.

## Evidence & Root Cause
1. In `supabase/functions/realtor-lead-engine/index.ts`:
   - Line 3643: `// 1A. MODULE 1A: MORNING-OF-VISIT BRIEFING`
   - Line 3739: `// 1. MODULE 1: PRE-VISIT REMINDERS (1 Hour Before Scheduled Visit)`
   - Both executed sequentially when `runPreVisit` is true.
   - For an 11:00 AM visit, a cron run at 10:00 AM fired BOTH Module 1A and Module 1 back-to-back.
2. In `site_visits` table schema, the column was already defined as `reminder_2h_sent` (indicating original intent was a 2-hour reminder), but Module 1 checked `diffMinutes >= 35 && diffMinutes <= 85` (1 hour).

## Resolution Plan
1. **Remove Module 1A entirely**: Eliminate duplicate morning briefing so there is only one pre-visit reminder.
2. **Update Module 1 to 2 Hours**:
   - Window: `diffMinutes >= 90 && diffMinutes <= 150` (1.5 to 2.5 hours before visit, centered at 120 mins).
   - Update message copy in Gujlish, English, and Hinglish to state `2 kalak ma` / `in 2 hours` / `2 ghante me`.
   - Update `last_bot_prompt: { question_type: "VISIT_TIMING_CHECK" }`.
   - Update `leads.pre_visit_reminder_sent = true` and `site_visits.reminder_2h_sent = true`.
3. **Verify Load Balancing & Batch Caps**:
   - Enforce `BATCH_LIMIT = 20`.
   - Enforce `await sleepJitter()` between dispatches.
4. **Audit Remaining Modules**:
   - Confirm Modules 2, 2B, 2C, 3, 4 are strictly separated with zero duplicate execution.
5. **Build and Deploy**:
   - Test bundle with `npx.cmd esbuild`.
   - Deploy version `v105-consolidated-2hour-pre-visit-reminder` to Supabase.
