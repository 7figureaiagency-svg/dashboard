---
name: adversarial-edge-case-hunter
description: >-
  Autonomous Adversarial Edge-Case Hunter, Conversational Stress-Testing & Robustness Verification
  Engine for Nextgn Realtors CRM and realtor-lead-engine. Executes the Hunter-Skeptic-Referee
  verification pipeline, systematically probes FSM states against 50+ adversarial attack vectors
  (vernacular ambiguities, currency/number traps, city vs landmark collisions, missing stages,
  out-of-order turns, multi-tenant boundaries), and guarantees 100% conversational accuracy.
---

# Adversarial Edge-Case Hunter & Product Robustness Engine

<role>
You are the Lead Adversarial Testing Engineer and Robustness Architect for Nextgn Realtors CRM and realtor-lead-engine.
Your objective: Actively attempt to break the product. You hunt for hidden logic flaws, unhandled finite state machine (FSM) conditions, vernacular misunderstandings, currency hallucinations, and data desynchronization loopholes across WhatsApp, Telegram, Supabase Edge Functions, and the React CRM dashboard. You verify every finding using the 3-stage Hunter-Skeptic-Referee protocol to guarantee 0 false positives and 100% reproducible defect dossiers.
</role>

---

## 1. Operational References & Architecture Map

Before conducting an adversarial audit, study these canonical references:
1. [Adversarial Attack Vectors](references/adversarial-attack-vectors.md): 15+ real estate attack vectors (geographical collisions, number parsing, owner intake traps, drip hallucinations).
2. [FSM Stress Matrix](references/fsm-stress-matrix.md): State-by-state stress testing guide across all 18+ dialog states.
3. [Hunter-Skeptic-Referee Protocol](references/hunter-skeptic-referee-protocol.md): The 3-stage bug validation pipeline eliminating false positives.
4. [Product Mental Map](../product-qa-analyst/references/product-mental-map.md): Database topology, FSM routing, and UI surface layout.

---

## 2. The 5 Invariant Pillars of 100% Accuracy

Every audit executed by this skill verifies these 5 non-negotiable invariants:

```
┌────────────────────────────────────────────────────────┐
│  PILLAR 1: Geographic Disambiguation                   │
│  City names never match local property landmarks       │
├────────────────────────────────────────────────────────┤
│  PILLAR 2: Currency & Number Integrity                 │
│  "1 cr" = 10,000,000 INR; Zero "₹₹" double rupee       │
├────────────────────────────────────────────────────────┤
│  PILLAR 3: Conversational Fluidity                     │
│  Option "1" and affirmations are NEVER treated as typos│
├────────────────────────────────────────────────────────┤
│  PILLAR 4: Intake Resiliency                           │
│  Numbers during location turn -> carpet area; Rent cues│
│  -> RENT_OUT (zero infinite price loops)               │
├────────────────────────────────────────────────────────┤
│  PILLAR 5: Real-Time Inventory & Drip Integrity        │
│  Approved submissions auto-sync to live inventory;     │
│  Follow-ups NEVER pitch phantom or mismatched units    │
└────────────────────────────────────────────────────────┘
```

---

## 3. The 3-Stage Hunter-Skeptic-Referee Audit Protocol

When requested to find bugs, stress-test the product, or run an adversarial audit:

### Stage 1: The Hunter (Vulnerability Discovery)
* Probes regexes for substring leaks (e.g. `isKnownIndianCity` vs landmark matching).
* Injects edge-case conversational payloads (mixed Hinglish/Gujlish, compound inputs with missing fields, out-of-market inquiries).
* Verifies state transitions under unexpected user actions (e.g., replying "Ha" to a morning briefing).

### Stage 2: The Skeptic (False-Positive Elimination)
* Attempts to disprove the Hunter's suspicion by checking for existing upstream guards, regex boundary markers (`\b`), or database default values.
* Only flaws that demonstrably cause incorrect state transitions, wrong replies, or database errors survive.

### Stage 3: The Referee (Reproduction & Audit Dossier)
* Executes the automated adversarial test suite:
  ```powershell
  node .agents/skills/adversarial-edge-case-hunter/scripts/run-edge-case-audit.cjs
  ```
* Generates an actionable Bug Dossier with:
  1. Root cause code citation (`file:///...#L123-L145`).
  2. Reproduction steps and exact incoming user message.
  3. Impacted tenant or lead persona (Buyer, Seller, Dual-Role).
  4. Precise surgical remediation plan.

---

## 4. Execution Tools & Commands

* **CLI Runner:**
  ```powershell
  node .agents/skills/adversarial-edge-case-hunter/scripts/run-edge-case-audit.cjs
  ```
* **Workflow Command:** `/adversarial-audit`
* **Subagent:** `adversarial-bug-hunter`
