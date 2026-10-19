import {
  hoursSince,
  inPeriod,
  isVisitBookedStatus,
  isVisitDoneStatus,
  responseMinutes,
  type Activity,
  type Lead,
  type Period,
} from "@/lib/crm";

export type ExecStats = {
  name: string;
  assigned: number;
  visitsBooked: number;
  visitsDone: number;
  visitShowupRate: number; // percentage (0 - 100)
  handovers: number;
  conversion: number;
  pipelineValue: number; // total ₹ sum of active qualified buyer/tenant deals
  avgSla: number | null;
  slaComplianceRate: number | null; // % of alerts handled within 15 min SLA
  fast: number;
  ok: number;
  slow: number;
  uncontacted: number;
  openAlerts: number;
  oldestAlertHours: number | null;
  staleLeads: number;
  actions: number;
  lastActiveAt: string | null;
  silent: boolean;
  recent: Activity[];
  // Real Estate Recognition Badges:
  isTopCloser?: boolean;
  isSpeedChampion?: boolean;
  isBestConversion?: boolean;
  isAtRisk?: boolean;
  // Segment Breakdown:
  luxuryLeads: number;
  premiumLeads: number;
  midLeads: number;
  affordableLeads: number;
};

export function execName(lead: Lead): string {
  return lead.assigned_executive_name || "Unassigned";
}

/** Build per-executive performance rows from leads + logged activity. */
export function buildExecStats(
  leads: Lead[],
  activity: Activity[],
  period: Period,
): ExecStats[] {
  // Leads stay attached to their executive whatever the period; only the
  // logged actions are scoped, so switching period never hides a person.
  const periodActivity = activity.filter((a) => inPeriod(a.created_at, period));

  const names = new Set<string>([
    ...leads.map(execName),
    ...activity.map((a) => a.executive_name || "Unassigned"),
  ]);

  const rows: ExecStats[] = Array.from(names)
    .map((name) => {
      const mine = leads.filter((l) => execName(l) === name);
      const myLeadIds = new Set(mine.map((l) => l.lead_id));
      const isMine = (a: Activity) =>
        (a.executive_name && a.executive_name === name) || myLeadIds.has(a.lead_id);

      const allActs = activity
        .filter(isMine)
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      const acts = periodActivity
        .filter(isMine)
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

      const mins: number[] = [];
      let uncontacted = 0;
      let openAlerts = 0;
      let oldestAlertHours: number | null = null;
      let staleLeads = 0;
      let pipelineValue = 0;
      let luxuryLeads = 0;
      let premiumLeads = 0;
      let midLeads = 0;
      let affordableLeads = 0;

      for (const l of mine) {
        const isDropped =
          ["NOT_INTERESTED", "DROPPED", "LOST"].includes(String(l.status || "").toUpperCase()) ||
          ["DROPPED", "LOST"].includes(String(l.state || "").toUpperCase());

        const price = Number(l.selected_property_price) || Number(l.budget) || 0;
        if (!isDropped && price > 0) {
          pipelineValue += price;
        }

        // Budget tier distribution
        if (price >= 17500000) luxuryLeads += 1;
        else if (price >= 9000000) premiumLeads += 1;
        else if (price >= 4500000) midLeads += 1;
        else if (price > 0) affordableLeads += 1;

        const m = responseMinutes(l);
        if (m !== null) mins.push(m);
        else if (l.alert_sent_at) uncontacted += 1;
        if (l.alert_sent_at && !l.first_human_contact_at) {
          openAlerts += 1;
          const h = hoursSince(l.alert_sent_at);
          if (h !== null && (oldestAlertHours === null || h > oldestAlertHours)) {
            oldestAlertHours = h;
          }
        }
        const touched = hoursSince(l.updated_at ?? l.last_interaction_at ?? l.created_at);
        if (touched !== null && touched > 24 * 7 && l.status !== "NOT_INTERESTED") staleLeads += 1;
      }

      const visitsDone = mine.filter((l) => isVisitDoneStatus(l.status)).length;
      const visitsBooked = mine.filter((l) => isVisitBookedStatus(l.status) || l.site_visit_booked).length;
      const visitShowupRate =
        visitsBooked > 0
          ? Math.min(100, Math.round((visitsDone / visitsBooked) * 100))
          : visitsDone > 0
          ? 100
          : 0;

      const fast = mins.filter((m) => m < 15).length;
      const ok = mins.filter((m) => m >= 15 && m <= 30).length;
      const slow = mins.filter((m) => m > 30).length;
      const totalResponded = fast + ok + slow;
      const slaComplianceRate =
        totalResponded > 0 ? Math.round((fast / totalResponded) * 100) : null;

      // Fall back to the newest lead update so history that predates the
      // activity log does not read as "silent".
      const lastLeadTouch = mine
        .map((l) => l.updated_at ?? l.last_interaction_at ?? l.created_at)
        .filter((v): v is string => !!v)
        .sort()
        .pop();
      const lastActiveAt =
        [allActs[0]?.created_at, lastLeadTouch]
          .filter((v): v is string => !!v)
          .sort()
          .pop() ?? null;
      const lastActiveHours = hoursSince(lastActiveAt);

      return {
        name,
        assigned: mine.length,
        visitsBooked,
        visitsDone,
        visitShowupRate,
        handovers: mine.filter(
          (l) =>
            l.property_state === "HUMAN_HANDOVER" ||
            l.status === "QUALIFIED" ||
            l.status === "QUALIFYING",
        ).length,
        conversion: mine.length ? Math.round((visitsDone / mine.length) * 100) : 0,
        pipelineValue,
        avgSla: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
        slaComplianceRate,
        fast,
        ok,
        slow,
        uncontacted,
        openAlerts,
        oldestAlertHours,
        staleLeads,
        actions: acts.length,
        lastActiveAt,
        silent: mine.length > 0 && (lastActiveHours === null || lastActiveHours > 48),
        recent: acts.slice(0, 5),
        luxuryLeads,
        premiumLeads,
        midLeads,
        affordableLeads,
      };
    })
    .sort((a, b) => b.visitsDone - a.visitsDone || b.assigned - a.assigned);

  // Derive Performer Badges across team
  const validNamedRows = rows.filter((r) => r.name !== "Unassigned");
  const maxVisitsDone = Math.max(0, ...validNamedRows.map((r) => r.visitsDone));
  const validSpeeds = validNamedRows
    .filter((r) => r.avgSla !== null && r.avgSla <= 15 && (r.fast + r.ok + r.slow) >= 1)
    .map((r) => r.avgSla!);
  const minAvgSla = validSpeeds.length > 0 ? Math.min(...validSpeeds) : null;
  const validShowups = validNamedRows
    .filter((r) => r.visitsBooked >= 2)
    .map((r) => r.visitShowupRate);
  const maxShowup = validShowups.length > 0 ? Math.max(...validShowups) : null;

  for (const r of rows) {
    if (r.name !== "Unassigned") {
      if (maxVisitsDone > 0 && r.visitsDone === maxVisitsDone) {
        r.isTopCloser = true;
      }
      if (minAvgSla !== null && r.avgSla === minAvgSla) {
        r.isSpeedChampion = true;
      }
      if (maxShowup !== null && maxShowup >= 60 && r.visitShowupRate === maxShowup && r.visitsBooked >= 2) {
        r.isBestConversion = true;
      }
      if (r.silent || r.openAlerts > 0 || (r.avgSla !== null && r.avgSla > 30)) {
        r.isAtRisk = true;
      }
    }
  }

  return rows;
}

export type TeamSummary = {
  totalLeads: number;
  totalPipelineValue: number;
  totalVisitsBooked: number;
  totalVisitsDone: number;
  teamShowupRate: number;
  unattendedAlerts: number;
  teamAvgSla: number | null;
  teamSlaCompliance: number | null;
  overdueLeads: Lead[];
};

export function buildTeamSummary(leads: Lead[], period: Period): TeamSummary {
  const periodLeads = leads.filter((l) => inPeriod(l.created_at, period));

  let totalPipelineValue = 0;
  let totalVisitsBooked = 0;
  let totalVisitsDone = 0;
  let fast = 0;
  let ok = 0;
  let slow = 0;
  const allMins: number[] = [];
  const overdueLeads: Lead[] = [];

  for (const l of periodLeads) {
    const isDropped =
      ["NOT_INTERESTED", "DROPPED", "LOST"].includes(String(l.status || "").toUpperCase()) ||
      ["DROPPED", "LOST"].includes(String(l.state || "").toUpperCase());

    const price = Number(l.selected_property_price) || Number(l.budget) || 0;
    if (!isDropped && price > 0) {
      totalPipelineValue += price;
    }

    if (isVisitBookedStatus(l.status) || l.site_visit_booked) totalVisitsBooked += 1;
    if (isVisitDoneStatus(l.status)) totalVisitsDone += 1;

    const m = responseMinutes(l);
    if (m !== null) {
      allMins.push(m);
      if (m < 15) fast += 1;
      else if (m <= 30) ok += 1;
      else slow += 1;
    }

    // Overdue alerts: alert sent > 30 min ago with no first human contact and visit not completed
    if (l.alert_sent_at && !l.first_human_contact_at && !isVisitDoneStatus(l.status)) {
      const h = hoursSince(l.alert_sent_at);
      if (h !== null && h >= 0.5) {
        overdueLeads.push(l);
      }
    }
  }

  const teamShowupRate =
    totalVisitsBooked > 0
      ? Math.min(100, Math.round((totalVisitsDone / totalVisitsBooked) * 100))
      : totalVisitsDone > 0
      ? 100
      : 0;
  const teamAvgSla =
    allMins.length ? Math.round(allMins.reduce((a, b) => a + b, 0) / allMins.length) : null;
  const totalResponded = fast + ok + slow;
  const teamSlaCompliance =
    totalResponded > 0 ? Math.round((fast / totalResponded) * 100) : null;

  return {
    totalLeads: periodLeads.length,
    totalPipelineValue,
    totalVisitsBooked,
    totalVisitsDone,
    teamShowupRate,
    unattendedAlerts: overdueLeads.length,
    teamAvgSla,
    teamSlaCompliance,
    overdueLeads,
  };
}

/** Actions per day for the selected period, oldest first. */
export function dailyActivity(
  activity: Activity[],
  period: Period,
  days = period === "today" || period === "7d" ? 7 : 30,
): { day: string; label: string; count: number }[] {
  const buckets: { day: string; label: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push({
      day: d.toDateString(),
      label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      count: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.day, i]));
  for (const a of activity) {
    if (!a.created_at) continue;
    const key = new Date(a.created_at).toDateString();
    const i = index.get(key);
    if (i !== undefined) buckets[i]!.count += 1;
  }
  return buckets;
}
