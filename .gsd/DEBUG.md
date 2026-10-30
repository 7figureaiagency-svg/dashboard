# Debug Session: OWNER_INTAKE_BUYER_CIRCUIT_BREAKER_LEAK

## Symptom
**User Report:** In Griham Realty, user (Telegram ID 5117510624) was asked if they want to list a property. User replied "yes", but the bot showed property results (buyer search options for Saraswati Bungalows) instead of asking for property listing details.
Also, in `OWNER_LOCATION_PENDING`, when user replied "vaikunth char rasta" for their shop, the bot showed buyer property results.

**When:** Occurred on turns 14 and 17 for lead 5117510624.
**Expected:** Replying "yes" in `OWNER_DETAILS_GATHERED` (or during owner listing invitation) transitions to `OWNER_CONFIG_PENDING` and asks for property configuration/type. Replying "vaikunth char rasta" in `OWNER_LOCATION_PENDING` records the location and asks for the next owner field (expected rent/price).
**Actual:** Both turns triggered the buyer circuit breaker and showed buyer property cards (`OPTIONS_SENT`).

## Evidence & Root Cause Analysis
1. **Circuit-Breaker False Trigger in `index.ts:8783`:**
   - In `dispatchStateAction()`, line 8783 checked `isBuyerSwitchIntent`. It evaluated `context.cognitiveTurn?.active_role === "BUYER" || context.cognitiveTurn?.primary_intent === "SEARCH_PROPERTY"`.
   - `routeCognitiveTurnDeterministic` in `cognitive_turn_router.ts:282` defaulted `primary_intent` to `"SEARCH_PROPERTY"` and `active_role` to `"BUYER"` for any message without explicit keywords.
   - For `"yes"` and `"vaikunth char rasta"`, `cognitiveTurn.active_role` was `"BUYER"`. Line 8783 fired, archived the owner draft (`SWITCHED_TO_BUYER`), set lead state to `QUALIFYING`, and called `handleQualificationCascade()`.
   - Because the lead was already fully qualified as a buyer from a prior search, `handleQualificationCascade()` immediately rendered matching property cards (`OPTIONS_SENT`).

2. **Regex Word-Boundary Defect in `fallbackDeterministicExtraction` (`index.ts:4324`)**:
   - `/(?:ha|haan|yes|yep|done|attended|gaya|gaye)/i` lacked `\b` boundaries.
   - The characters "ha" matched inside `"vaikunt[h] c[ha]r rasta"`!
   - This classified "vaikunth char rasta" as `CONFIRM_VISIT` with `selected_menu_option: 1`.

3. **Stale `last_bot_prompt` in `DUAL_ROLE_MENU_PENDING` (`index.ts:9534`)**:
   - Selecting Option 2 in `DUAL_ROLE_MENU_PENDING` set `state = "OWNER_DETAILS_GATHERED"` but omitted `last_bot_prompt`.
   - The stale prompt remained `question_type: "VISIT_ATTENDANCE"`, causing `isVisitAttendanceTurn` to activate on subsequent turns.

4. **Missing Owner Lead Context in `cognitive_turn_router.ts:282`**:
   - `routeCognitiveTurnDeterministic` did not inspect if `lead?.state` was an `OWNER_` state, defaulting every unknown utterance to `BUYER` / `SEARCH_PROPERTY`.

## Resolution Plan
1. In `index.ts` line 8783: Require `hasExplicitBuyerKeyword` and exclude `isAffirmativeListingTurn` in `isBuyerSwitchIntent`.
2. In `cognitive_turn_router.ts`: Check `lead?.state?.startsWith("OWNER_")`; default to `active_role: "SELLER"`, `primary_intent: "SUBMIT_PROPERTY"`. Add `\b` boundaries to attendance regex.
3. In `index.ts` and `cognitive_extractor.ts` line 4304 & 4324: Guard `isVisitAttendanceTurn` with `(currentLead?.state === "SITE_VISIT_DONE" || currentLead?.state === "SITE_VISIT_BOOKED")` and add `\b` boundaries to regex.
4. In `index.ts` line 9534: Set `last_bot_prompt: { question_type: "OWNER_LISTING_INVITATION" }`.
5. Deploy `v99-owner-circuit-breaker-fix` and run automated verification test.
