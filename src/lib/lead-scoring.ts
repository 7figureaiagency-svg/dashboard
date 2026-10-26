import type { Lead } from "./crm";

export type LeadTemperature = "HOT" | "WARM" | "COLD";

export interface LeadScoreResult {
  score: number;
  temperature: LeadTemperature;
  label: string;
  badgeClass: string;
  dotClass: string;
  breakdown: {
    stage: number;
    budget: number;
    engagement: number;
    penalties: number;
  };
  reasons: string[];
}

/**
 * Computes deterministic real estate lead score (0 - 100) and temperature classification.
 * Strictly adheres to PropTech conversion rubrics from lead-scoring-engine skill.
 */
export function computeLeadScore(lead: Partial<Lead> | null | undefined): LeadScoreResult {
  if (!lead) {
    return {
      score: 0,
      temperature: "COLD",
      label: "Cold",
      badgeClass: "bg-slate-500/10 text-slate-400 border-slate-500/20",
      dotClass: "bg-slate-400",
      breakdown: { stage: 0, budget: 0, engagement: 0, penalties: 0 },
      reasons: ["No lead data"],
    };
  }

  const meta = (lead.metadata || {}) as Record<string, any>;
  let stageScore = 0;
  let budgetScore = 0;
  let engagementScore = 0;
  let penalties = 0;
  const reasons: string[] = [];

  const rawState = String(lead.state || lead.status || "").toUpperCase();

  // Inactive / Terminal Visit States Guard: Never award active visit points if visit was cancelled, missed, or dropped
  const isVisitExplicitlyInactive =
    rawState === "VISIT_CANCELLED" ||
    rawState === "VISIT_MISSED" ||
    rawState === "DROPPED" ||
    rawState === "NOT_INTERESTED" ||
    rawState === "OPT_OUT" ||
    rawState === "COLD_UNQUALIFIED" ||
    rawState === "COLD";

  const isConfirmedBooked = Boolean(lead.site_visit_booked);
  const hasVisitDate = Boolean(lead.site_visit_datetime || lead.site_visit_at);
  const hasActiveSiteVisit =
    !isVisitExplicitlyInactive &&
    (isConfirmedBooked || (hasVisitDate && lead.site_visit_booked !== false));

  // ---------------------------------------------------------------------------
  // 1. Stage & Commitment Signals (Max 45 Pts)
  // ---------------------------------------------------------------------------
  if (rawState === "SITE_VISIT_DONE" || rawState === "VISIT_DONE" || meta.visit_feedback) {
    stageScore += 45;
    reasons.push("Site visit completed (+45)");
  } else if (rawState === "SITE_VISIT_BOOKED" || hasActiveSiteVisit) {
    stageScore += 35;
    reasons.push("Site visit locked & scheduled (+35)");
  } else if (rawState === "SITE_VISIT_PROPOSED") {
    stageScore += 25;
    reasons.push("Visit slot actively selected (+25)");
  } else if (rawState === "OPTIONS_SENT" || meta.alternative_options_sent || (Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > 0)) {
    stageScore += 18;
    reasons.push("Alternative options requested (+18)");
  } else if (rawState === "QUALIFIED" || (lead.budget && lead.location)) {
    stageScore += 12;
    reasons.push("Requirements qualified (+12)");
  } else {
    stageScore += 5;
    reasons.push("Initial inquiry (+5)");
  }

  // Dual-role bonus (High Lifetime Value)
  if (meta.has_buyer_profile && meta.has_seller_profile) {
    stageScore += 10;
    reasons.push("Dual-role buyer & seller (+10)");
  }

  // ---------------------------------------------------------------------------
  // 2. Financial Viability & Ticket Size (Max 25 Pts)
  // ---------------------------------------------------------------------------
  const budgetNum = Number(lead.budget || 0);
  if (budgetNum >= 15000000) {
    budgetScore += 25;
    reasons.push("Ultra-luxury budget >= ₹1.5 Cr (+25)");
  } else if (budgetNum >= 7500000) {
    budgetScore += 20;
    reasons.push("Premium budget ₹75L - ₹1.5 Cr (+20)");
  } else if (budgetNum >= 4000000) {
    budgetScore += 15;
    reasons.push("Mid-segment budget ₹40L - ₹75L (+15)");
  } else if (budgetNum > 0) {
    budgetScore += 10;
    reasons.push("Starter budget < ₹40L (+10)");
  }

  // ---------------------------------------------------------------------------
  // 3. Conversational Velocity & Engagement (Max 20 Pts)
  // ---------------------------------------------------------------------------
  if (meta.last_objection || meta.visit_feedback) {
    engagementScore += 10;
    reasons.push("Detailed property feedback provided (+10)");
  }

  const followupCount = Number(lead.followup_count || 0);
  if (followupCount >= 3) {
    engagementScore += 10;
    reasons.push("High interaction volume (+10)");
  } else if (followupCount >= 1) {
    engagementScore += 5;
  }

  // SLA response speed bonus if lead responded fast
  const slaMinutes = Number(lead.sla_response_minutes || 0);
  if (slaMinutes > 0 && slaMinutes <= 10) {
    engagementScore += 10;
    reasons.push("Immediate responder (< 10 min) (+10)");
  }

  // ---------------------------------------------------------------------------
  // 4. Negative & Churn Penalties (-10 to -35 Pts)
  // ---------------------------------------------------------------------------
  if (
    rawState === "DROPPED" ||
    rawState === "NOT_INTERESTED" ||
    rawState === "OPT_OUT" ||
    lead.rejection_reason
  ) {
    penalties += 35;
    reasons.push("Marked dropped or rejected (-35)");
  }

  if (rawState === "VISIT_CANCELLED") {
    penalties += 20;
    reasons.push("Cancelled visit (-20)");
  }

  if (rawState === "VISIT_MISSED") {
    penalties += 20;
    reasons.push("Missed scheduled site visit (-20)");
  }

  // Missing phone penalty (must be a valid 10-digit number)
  const cleanPhone = String(lead.phone || "").replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    penalties += 10;
    reasons.push("Missing 10-digit mobile number (-10)");
  }

  // Calculate clamped total
  const rawTotal = stageScore + budgetScore + engagementScore - penalties;
  const score = Math.max(0, Math.min(100, Math.round(rawTotal)));

  // Temperature categorization
  let temperature: LeadTemperature = "COLD";
  let label = "Cold";
  let badgeClass = "bg-sky-500/10 text-sky-400 border-sky-500/20";
  let dotClass = "bg-sky-400";

  if (score >= 70) {
    temperature = "HOT";
    label = "🔥 Hot";
    badgeClass = "bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]";
    dotClass = "bg-amber-400 animate-pulse";
  } else if (score >= 40) {
    temperature = "WARM";
    label = "⚡ Warm";
    badgeClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/25";
    dotClass = "bg-yellow-400";
  } else {
    temperature = "COLD";
    label = "❄️ Cold";
    badgeClass = "bg-slate-500/10 text-slate-400 border-slate-500/20";
    dotClass = "bg-slate-400";
  }

  return {
    score,
    temperature,
    label,
    badgeClass,
    dotClass,
    breakdown: {
      stage: Math.min(45, stageScore),
      budget: Math.min(25, budgetScore),
      engagement: Math.min(20, engagementScore),
      penalties,
    },
    reasons,
  };
}
