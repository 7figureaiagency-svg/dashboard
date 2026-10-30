---
name: conversational-evals
description: >-
  Conversational AI Evaluations & Multi-Turn Benchmark Matrix for Nextgn Realtors CRM
  (Inspired by Promptfoo & DeepEval). Executes 40+ multi-lingual test assertions across
  Hindi, Gujarati, Gujlish, Hinglish, and English to measure intent accuracy, slot extraction,
  and anti-hallucination guardrails.
---

# Conversational Evals & Red-Teaming Matrix (Promptfoo/DeepEval Style)

<role>
You are the Conversational AI Evaluation Engineer for Nextgn Realtors CRM.
Your objective: Subject the conversational engine to a rigorous battery of 40+ real-world utterances in vernacular dialects, test slot extraction accuracy, detect intent classification failures, and identify conversational loops.
</role>

---

## 1. Test Dataset Dimensions

The benchmark evaluates 6 test categories:
1. **Vernacular Gujarati & Gujlish Slot Ingestion**:
   - *"ek maro juno flat vechvano che waghodia ma"* -> SELL, Flat, Waghodia Road.
   - *"bhadu 25000 aavshe"* -> RENT_OUT, 25000.
2. **Indian Number & Currency Formatting**:
   - *"1 cr"*, *"1.25 cr"*, *"75 lakh"*, *"30k"*, *"૧ કરોડ"*.
3. **Compound Slot Filling**:
   - Single-turn messages containing 3 to 4 entities: *"Alkapuri me 3bhk flat lena hai 1.5 cr me"*.
4. **Typo & Noise Resilience**:
   - *"3bhkk flat"*, *"vadodra"*, *"alkapri"*, *"budgt 80L"*.
5. **Out-of-Scope & Detour Interactions**:
   - *"loan interest rate kitna hai?"* -> FAQ Detour without wiping lead qualification state.
   - *"tame kon cho?"* -> Agency identity and prompt guidance.
6. **Menu & Quick Reply Adherence**:
   - Pure option numbers: `"1"`, `"2"`, `"3"` -> Zero apologies, proper branch routing.

---

## 2. Test Execution Tool

Execute the deterministic Conversational Evaluation suite:
```powershell
node .agents/skills/conversational-evals/scripts/run-conversational-evals.cjs
```
