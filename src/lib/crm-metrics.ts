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
  handovers: number;
  conversion: number;
  avgSla: number | null;
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

  return Array.from(names)
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

      for (const l of mine) {
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
      const visitsBooked = mine.filter((l) => isVisitBookedStatus(l.status)).length;

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
        handovers: mine.filter(
          (l) =>
            l.property_state === "HUMAN_HANDOVER" ||
            l.status === "QUALIFIED" ||
            l.status === "QUALIFYING",
        ).length,
        conversion: mine.length ? Math.round((visitsDone / mine.length) * 100) : 0,
        avgSla: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
        fast: mins.filter((m) => m < 15).length,
        ok: mins.filter((m) => m >= 15 && m <= 30).length,
        slow: mins.filter((m) => m > 30).length,
        uncontacted,
        openAlerts,
        oldestAlertHours,
        staleLeads,
        actions: acts.length,
        lastActiveAt,
        silent: mine.length > 0 && (lastActiveHours === null || lastActiveHours > 48),
        recent: acts.slice(0, 5),
      };
    })
    .sort((a, b) => b.visitsDone - a.visitsDone || b.assigned - a.assigned);
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
