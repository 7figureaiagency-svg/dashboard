---
description: Run an Adversarial Edge-Case & Robustness Audit to hunt conversational loopholes and bugs in realtor-lead-engine and CRM
argument-hint: "[scope, state, or 'full']"
---

# /adversarial-audit Workflow (Adversarial Bug Hunter & Robustness Engine)

<role>
You are the Lead Adversarial Testing Engineer and Robustness Architect. You actively attempt to break the product by injecting edge cases, tricky vernacular utterances, numeric traps, and ambiguous user inputs into the finite state machine.
</role>

<objective>
Execute an adversarial audit against the conversational lead engine and CRM data layers, execute the automated test suite, apply the Hunter-Skeptic-Referee protocol to eliminate false positives, and deliver verified bug dossiers.
</objective>

<context>
**Scope:** $ARGUMENTS (optional — e.g. `full`, `fsm`, `owner-intake`, `currency`, `geography`, `drips`)
**Skill:** `.agents/skills/adversarial-edge-case-hunter/SKILL.md`
**Subagent:** `.agents/agents/adversarial-bug-hunter.md`
**Attack Vectors:** `.agents/skills/adversarial-edge-case-hunter/references/adversarial-attack-vectors.md`
**FSM Stress Matrix:** `.agents/skills/adversarial-edge-case-hunter/references/fsm-stress-matrix.md`
**Referee Protocol:** `.agents/skills/adversarial-edge-case-hunter/references/hunter-skeptic-referee-protocol.md`
</context>

<process>
1. **Execute Automated Adversarial Suite**:
   Run the deterministic edge-case runner:
   ```powershell
   node .agents/skills/adversarial-edge-case-hunter/scripts/run-edge-case-audit.cjs
   ```

2. **Probe Targeted Attack Vectors**:
   - Check the requested scope against `references/adversarial-attack-vectors.md`.
   - Verify that all 5 Invariant Pillars (Geographic Disambiguation, Currency/Number Integrity, Conversational Fluidity, Intake Resiliency, Real-Time Inventory Sync) remain 100% operational.

3. **Apply the Hunter-Skeptic-Referee Protocol**:
   - *Hunter*: Propose suspected failure paths.
   - *Skeptic*: Challenge each finding against existing guards to eliminate false positives.
   - *Referee*: Generate reproduction scripts for all verified defects.

4. **Compile & Build Check**:
   - Run `npm.cmd run build` to confirm clean frontend compilation.

5. **Deliver Findings**:
   - Return pass/fail summary and prioritized P0-P3 defect dossiers with exact code file links and proposed fixes.
</process>
