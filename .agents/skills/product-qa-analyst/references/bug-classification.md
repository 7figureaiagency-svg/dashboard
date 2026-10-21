# Bug Classification Standards, Anti-Patterns & Triage Rubric

This reference defines the severity ranking, common PropTech domain anti-patterns, and the standard bug report format for the `product-qa-analyst` skill.

---

## 1. Bug Severity Matrix

| Severity | Definition | Examples in Nextgn Realtors CRM | SLA for Fix |
|---|---|---|---|
| **CRITICAL (P0)** | Data loss, security breach, total outage, WABA ban risk, or broken core revenue path. | - WABA automated sweep running outside business hours (ban risk)<br>- Multi-tenant leakage: Executive A seeing Brokerage B's leads<br>- Build crash on production deployment | Immediate |
| **HIGH (P1)** | Major business feature non-functional with no acceptable workaround. | - Site visit scheduling failing to save to database<br>- AI bot continuously replying even after `bot_active = false`<br>- WhatsApp / Call buttons in CRM triggering broken links | < 24 Hours |
| **MEDIUM (P2)** | Feature works partially or has visual/usability flaws with workaround. | - Mobile layout horizontal scroll glitch on smaller screens<br>- Incorrect Indian currency abbreviation (e.g. ₹4,850,000 instead of ₹4.85 Cr)<br>- Inconsistent filter chip count vs table row count | Next Sprint |
| **LOW (P3)** | Minor cosmetic or non-functional polish issues. | - Micro-spacing misalignment in drawer header<br>- Typo in placeholder text | Backlog |

---

## 2. Common Domain Anti-Patterns to Hunt For

### Anti-Pattern 1: Indian Real Estate Currency Formatting Flaws
- **Issue**: Indian luxury real estate uses Lakhs and Crores (e.g. ₹3.50 Cr, ₹85 Lakh), not Millions or Billions.
- **Bug Check**: Look for raw numbers like `₹35000000` or Western formats like `$35M`. Ensure all price displays run through `formatMoney()`.

### Anti-Pattern 2: Timezone Mismatches (UTC vs IST)
- **Issue**: Supabase timestamps are stored in UTC (`2026-10-21T06:00:00Z`), but client visits and business hours must calculate in **IST (UTC+5:30)**.
- **Bug Check**: Site visits scheduled for 11:00 AM IST must not trigger reminders at 11:00 PM UTC.

### Anti-Pattern 3: WABA Message Template Parameter Mismatches
- **Issue**: Meta WhatsApp Business Cloud API requires exact parameter matching for approved templates.
- **Bug Check**: Any webhook or sweep call sending unexpected variable counts will fail with Meta error `132000`.

### Anti-Pattern 4: Mobile Ergonomics Breakdown
- **Issue**: Field executives operate on phones in high sunlight or on the move.
- **Bug Check**: Tap targets smaller than 44px (e.g. tiny 24px icon buttons) cause high mis-tap rates.

### Anti-Pattern 5: Architecture Violations (n8n Leakage)
- **Issue**: Old n8n workflows being referenced or executed.
- **Bug Check**: Grep codebase for webhook endpoints pointing to n8n cloud or local n8n instances.

---

## 3. Standard Bug Report Template

When a bug is detected during QA audits, the agent MUST format the finding using this standardized schema:

```markdown
### 🐛 [BUG-{ID}] [{SEVERITY}] {Component / Flow Name}: {Concise Bug Title}

- **Flow / Journey**: {e.g. Journey 2: CRM Dashboard Lead Management}
- **Severity**: Critical (P0) | High (P1) | Medium (P2) | Low (P3)
- **File(s) Affected**: [path/to/file.tsx](file:///absolute/path/to/file.tsx#L10-L25)

#### 1. Description
{Clear explanation of the unexpected behavior and business impact.}

#### 2. Steps to Reproduce
1. Navigate to ...
2. Click ...
3. Observe ...

#### 3. Expected vs Actual Behavior
- **Expected**: {What the product spec dictates}
- **Actual**: {What currently happens}

#### 4. Evidence / Code Trace
```typescript
// Problematic snippet or error log
```

#### 5. Proposed Fix
{Explanation of how to resolve the root cause cleanly adhering to invariants.}
```
