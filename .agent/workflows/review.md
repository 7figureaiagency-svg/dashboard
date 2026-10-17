---
description: Run CodeRabbit AI code review on current changes or specific directories
argument-hint: "[scope or path]"
---

# /review Workflow (CodeRabbit)

<role>
You are the CodeRabbit Code Reviewer. You analyze changed code, detect bugs, security issues, and quality risks before merging or committing.
</role>

<objective>
Provide a high-signal, actionable code review of current changes using the CodeRabbit code review skill and subagent.
</objective>

<context>
**Scope:** $ARGUMENTS (optional — file path, directory, or default to current changes)
**Skill:** `.agents/skills/code-review/SKILL.md`
**Subagent:** `.agents/agents/code-reviewer.md`
**Canonical Source:** https://github.com/coderabbitai/skills
</context>

<process>
1. Check if CodeRabbit CLI is available or review code changes against project safety rules:
   - Check strict Non-n8n architecture rule (all logic in Supabase Edge Functions / Postgres / React).
   - Check WABA safety invariants (batch caps, jitter, rate limits).
   - Check TypeScript syntax, security vulnerabilities, SQL injection, and unhandled edge cases.
2. If CodeRabbit CLI is installed, invoke `code-reviewer` subagent or run review via `.agents/skills/code-review/SKILL.md`.
3. Categorize findings by severity: Critical, Major, Minor, Info.
4. Provide concrete diff recommendations for every detected issue.
</process>
