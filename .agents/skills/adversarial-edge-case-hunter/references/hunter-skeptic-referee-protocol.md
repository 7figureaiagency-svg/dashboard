# The Hunter-Skeptic-Referee Bug Verification Protocol

Adapted from open-source agentic bug hunting methodologies on GitHub (`awarexone/Agentic-Bug-Hunter`), this protocol guarantees **0 false positives** and **100% reproducible defect dossiers**.

```
   ┌──────────────────────────────────────────────┐
   │             1. HUNTER AGENT                  │
   │  Probes code, traces AST, finds anomalies    │
   └──────────────────────┬───────────────────────┘
                          │ Proposes suspected flaw
                          ▼
   ┌──────────────────────────────────────────────┐
   │             2. SKEPTIC AGENT                 │
   │  Attempts to disprove flaw, tests defenses   │
   └──────────────────────┬───────────────────────┘
                          │ Validated vs Refuted
                          ▼
   ┌──────────────────────────────────────────────┐
   │             3. REFEREE AGENT                 │
   │  Constructs reproduction script, assigns P0-P3│
   └──────────────────────────────────────────────┘
```

---

## Stage 1: The Hunter (Vulnerability & Edge-Case Prober)
* **Goal:** Explore code paths, state machines, regexes, and database hooks looking for unhandled edge cases.
* **Probing Strategy:**
  1. **Null/Undefined Propagation:** Does any code assume an object or array exists without optional chaining (`lead?.metadata?.seeker_draft?.budget`)?
  2. **Type Coercion:** Does comparing numbers and strings (e.g. `price > maxBudget`) fail when price is stored as string `"3000000"`?
  3. **Greedy Regex Collisions:** Does a regex match unintended substrings (e.g. city names matching landmark strings)?
  4. **State Machine Trapping:** Can a user input cause the bot to enter a state with no exit path?

---

## Stage 2: The Skeptic (False-Positive Eliminator)
* **Goal:** Challenge every bug reported by the Hunter.
* **Testing Defenses:**
  - *Is there already an upstream guard handling this?*
  - *Does the LLM fallback recover from this gracefully?*
  - *Can this edge case realistically occur in production messaging?*
  - *Is the alleged bug actually intended business behavior?*
* **Outcome:** If the Skeptic finds that an existing guard prevents the failure, the issue is dismissed as a False Positive.

---

## Stage 3: The Referee (Empirical Proof & Dossier Construction)
* **Goal:** For any defect that survives the Skeptic, construct an executable reproduction test script.
* **Verification Invariant:**
  - A bug cannot be filed without an executable script reproducing the exact failure mode.
  - The script must assert the expected behavior vs the actual failing behavior.
* **Dossier Template:**
  - **Defect Title:** Concise summary of the loophole.
  - **Severity:** P0 (Critical blocker), P1 (High logic error), P2 (Medium UX friction), P3 (Minor cosmetic).
  - **Failing Code Location:** File link and line range.
  - **Reproduction Payload:** The exact incoming message payload causing failure.
  - **Remediation Plan:** Precise surgical edit to eliminate the defect without side effects.
