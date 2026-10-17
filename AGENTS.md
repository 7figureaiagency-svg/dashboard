<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

> [!CRITICAL]
> **STRICT NON-N8N ARCHITECTURE RULE**:
> This project follows a 100% Non-n8n approach (Supabase PostgreSQL + Supabase Edge Functions + React CRM Dashboard).
> NEVER modify, update, publish, or touch any n8n workflows now or in the future. n8n workflows are only historical read-only reference files. All logic must reside exclusively within Supabase Edge Functions and the application codebase.

> [!IMPORTANT]
> **TEST SUITE EXECUTION POLICY**:
> Do NOT run automated test suites (e.g. full QA matrices, regression scripts) automatically on every code change or deployment.
> Only run automated test suites when EXPLICITLY requested by the user.

> [!WARNING]
> **MULTI-TENANT WABA SAFETY INVARIANT**:
> All outbound automated sweeps (reminders, feedback, follow-ups, drips) must strictly enforce batch caps (max 20 leads per run) and inter-message delay jitter (350ms-550ms) within business hours (11:00 AM - 6:30 PM IST) to prevent WhatsApp Business Account bans.

---

## ⚡ GSD (Get Shit Done) Methodology Integration

This project is integrated with [Get Shit Done for Antigravity](https://github.com/toonight/get-shit-done-for-antigravity).
* **Canonical Rules**: See [PROJECT_RULES.md](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/PROJECT_RULES.md) for the core protocol (`SPEC` → `PLAN` → `EXECUTE` → `VERIFY` → `COMMIT`).
* **Slash Commands**: 27 GSD workflows are available under [`.agent/workflows/`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agent/workflows) (e.g. `/new-project`, `/discuss-phase`, `/plan`, `/execute`, `/verify`, `/debug`, `/audit-milestone`, `/map`).
* **Subagents**: Specialized GSD subagents (`gsd-planner`, `gsd-executor`, `gsd-verifier`, `gsd-researcher`, `gsd-debugger`) live in [`.agents/agents/`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agents/agents).
* **Project Skills**: Live in [`.agents/skills/`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agents/skills) alongside the domain-specific [`realtor-lead-engine`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agents/skills/realtor-lead-engine/SKILL.md) skill.

---

## 🐇 CodeRabbit Skills & Agents Integration

This project is integrated with [CodeRabbit Skills](https://github.com/coderabbitai/skills) for AI-powered automated code reviews, PR audits, and quality enforcement.
* **Skills**:
  * [`code-review`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agents/skills/code-review/SKILL.md): Comprehensive AI code review using CodeRabbit CLI, detecting bugs, security vulnerabilities, and code quality risks.
  * [`autofix`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agents/skills/autofix/SKILL.md): Fetches and applies validated fixes from CodeRabbit PR review threads with per-change human approval.
* **Subagents**:
  * [`code-reviewer`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agents/agents/code-reviewer.md): Dedicated subagent for pre-commit and pre-PR quality audits, security checks, and performance recommendations.
  * [`autofix`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agents/agents/autofix.md): Dedicated read-only subagent that prepares and validates PR review-thread fix plans.
* **Slash Commands**:
  * `/review`: Run CodeRabbit code quality and security reviews on changes or specified paths (see [`.agent/workflows/review.md`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agent/workflows/review.md)).
  * `/autofix`: Gather and prepare fixes for CodeRabbit PR comments (see [`.agent/workflows/autofix.md`](file:///c:/Users/DELL/Downloads/antigravity%20real%20estate/.agent/workflows/autofix.md)).

