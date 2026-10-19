import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Handshake,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge } from "@/components/crm/badges";
import { ExecutiveDrawer } from "@/components/crm/executive-drawer";
import { useActivity, useAddExecutive, useDeleteExecutive, useExecutives, useUpdateExecutive } from "@/lib/crm-data";
import type { Executive } from "@/lib/crm";
import { buildExecStats, buildTeamSummary, dailyActivity, type ExecStats } from "@/lib/crm-metrics";
import {
  ACTION_LABELS,
  PERIODS,
  actionLabel,
  formatMoney,
  inPeriod,
  formatMinutes,
  slaTone,
  timeAgo,
  type Lead,
  type Period,
} from "@/lib/crm";

type SortKey =
  | "visitsDone"
  | "pipelineValue"
  | "visitShowupRate"
  | "conversion"
  | "avgSla"
  | "assigned"
  | "actions";

export function PerformanceTab({ leads, clientId }: { leads: Lead[]; clientId: string | null }) {
  const { data: activity = [] } = useActivity();
  const [period, setPeriod] = useState<Period>("30d");
  const [sort, setSort] = useState<SortKey>("visitsDone");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);

  const periodLeads = useMemo(
    () => leads.filter((l) => inPeriod(l.created_at, period)),
    [leads, period],
  );
  const periodActivity = useMemo(
    () => activity.filter((a) => inPeriod(a.created_at, period)),
    [activity, period],
  );

  const summary = useMemo(() => buildTeamSummary(leads, period), [leads, period]);

  const board = useMemo(() => {
    const rows = buildExecStats(leads, activity, period);
    const value = (r: ExecStats) => {
      if (sort === "avgSla") return r.avgSla === null ? Number.MAX_SAFE_INTEGER : r.avgSla;
      return r[sort] ?? 0;
    };
    return [...rows].sort((a, b) =>
      sort === "avgSla" ? Number(value(a)) - Number(value(b)) : Number(value(b)) - Number(value(a)),
    );
  }, [leads, activity, period, sort]);

  const topCloser = useMemo(() => board.find((r) => r.isTopCloser), [board]);
  const speedChamp = useMemo(() => board.find((r) => r.isSpeedChampion), [board]);
  const bestShowup = useMemo(() => board.find((r) => r.isBestConversion), [board]);

  const chart = useMemo(() => dailyActivity(activity, period), [activity, period]);
  const maxDay = Math.max(1, ...chart.map((c) => c.count));

  const feed = useMemo(
    () =>
      [...periodActivity]
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .slice(0, 12),
    [periodActivity],
  );

  return (
    <div className="space-y-6">
      <TeamManager clientId={clientId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Team Performance & Revenue Pipeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor sales executive response times, active deal values, and physical site visit completions.
          </p>
        </div>
        <div className="flex rounded-lg border bg-background p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4 Realtor Business KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<TrendingUp className="size-5" />}
          label="Active Deal Pipeline"
          value={formatMoney(summary.totalPipelineValue)}
          subtext={`${periodLeads.length} active leads in period`}
        />
        <Kpi
          icon={<CalendarCheck className="size-5" />}
          label="Site Visits Completed"
          value={summary.totalVisitsDone}
          subtext={`${summary.teamShowupRate}% Show-up (${summary.totalVisitsBooked} booked)`}
        />
        <Kpi
          icon={<Zap className="size-5" />}
          label="Speed-to-Call (<15m SLA)"
          value={summary.teamSlaCompliance !== null ? `${summary.teamSlaCompliance}%` : "—"}
          subtext={`Avg: ${summary.teamAvgSla !== null ? formatMinutes(summary.teamAvgSla) : "No alerts"} response`}
        />
        <Kpi
          icon={<AlertTriangle className="size-5" />}
          label="Revenue at Risk"
          value={summary.unattendedAlerts}
          subtext={summary.unattendedAlerts > 0 ? "Leads waiting > 30m without call" : "All alerts attended on-time"}
          danger={summary.unattendedAlerts > 0}
        />
      </div>

      {/* ── ⚠️ Revenue-at-Risk Alert Banner (Overdue Leads) ── */}
      {summary.unattendedAlerts > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-950 dark:text-rose-100 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-rose-500/20 p-2 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm">
                  ⚠️ {summary.unattendedAlerts} High-Intent Lead{summary.unattendedAlerts > 1 ? "s" : ""} Overdue for Call (&gt;30 mins)!
                </h4>
                <p className="text-xs opacity-90 mt-0.5">
                  These clients requested a VIP site visit or executive phone call more than 30 minutes ago. In real estate, buyers reach out to 2-3 brokers simultaneously — delay causes direct deal loss.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                  {summary.overdueLeads.slice(0, 4).map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-1.5 rounded-md border border-rose-500/20 bg-background/80 px-2 py-1 text-foreground"
                    >
                      <span className="font-semibold">{l.name || l.first_name || "Lead"}</span>
                      <span className="text-muted-foreground text-[11px]">
                        ({l.property_type || "Property"} · {formatMoney(l.budget)})
                      </span>
                      <span className="rounded bg-rose-500/10 px-1 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                        Assigned: {l.assigned_executive_name || "Unassigned"}
                      </span>
                    </div>
                  ))}
                  {summary.overdueLeads.length > 4 && (
                    <span className="text-xs text-muted-foreground self-center">
                      +{summary.overdueLeads.length - 4} more leads
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 🏆 Top Performer Spotlight Podium ── */}
      {(topCloser || speedChamp || bestShowup) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {topCloser && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-600 dark:text-amber-400 shrink-0">
                <Trophy className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 block">
                  🏆 Top Closer
                </span>
                <p className="font-bold text-sm text-foreground truncate">{topCloser.name}</p>
                <p className="text-xs text-muted-foreground">
                  <b>{topCloser.visitsDone}</b> Visits Completed ({formatMoney(topCloser.pipelineValue)} Pipeline)
                </p>
              </div>
            </div>
          )}

          {speedChamp && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/20 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Zap className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                  ⚡ Speed Champion
                </span>
                <p className="font-bold text-sm text-foreground truncate">{speedChamp.name}</p>
                <p className="text-xs text-muted-foreground">
                  <b>{formatMinutes(speedChamp.avgSla)}</b> Avg Response ({speedChamp.slaComplianceRate ?? 100}% on-time)
                </p>
              </div>
            </div>
          )}

          {bestShowup && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/20 p-2.5 text-blue-600 dark:text-blue-400 shrink-0">
                <Target className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 block">
                  🎯 Best Show-Up Rate
                </span>
                <p className="font-bold text-sm text-foreground truncate">{bestShowup.name}</p>
                <p className="text-xs text-muted-foreground">
                  <b>{bestShowup.visitShowupRate}%</b> Show-Up ({bestShowup.visitsDone}/{bestShowup.visitsBooked} Visits)
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Executive Scorecard Card ── */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Sales Executive Scorecard</CardTitle>
            <CardDescription className="text-xs">
              Ranked by deal volume, visit completions, and client response speeds.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            {(
              [
                ["visitsDone", "Visits Done"],
                ["pipelineValue", "Pipeline (₹)"],
                ["visitShowupRate", "Show-up Rate"],
                ["conversion", "Conversion"],
                ["avgSla", "Fastest Response"],
                ["assigned", "Total Leads"],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`rounded-md border px-2.5 py-1 font-medium transition-colors ${
                  sort === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {/* ── 📱 Mobile Executive Scorecard (Phones < 768px) ── */}
          <div className="space-y-3 px-4 md:hidden">
            {board.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
                No executive data yet.
              </div>
            )}
            {board.map((row) => (
              <div
                key={`m-exec-${row.name}`}
                className="rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-bold text-sm text-foreground">{row.name}</h4>
                      {row.isTopCloser && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          🏆 Top Closer
                        </span>
                      )}
                      {row.isSpeedChampion && (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          ⚡ Speed Star
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Active: {timeAgo(row.lastActiveAt)}
                    </p>
                  </div>
                  <button
                    className="rounded-lg border border-border/80 px-2.5 py-1 text-xs font-semibold hover:bg-muted shrink-0"
                    onClick={() => setProfile(row.name)}
                  >
                    Profile
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {row.silent && <ToneBadge tone="red" label="Silent 48 hrs" />}
                  {row.openAlerts > 0 && (
                    <ToneBadge
                      tone="orange"
                      label={`${row.openAlerts} open alert${row.openAlerts > 1 ? "s" : ""}`}
                    />
                  )}
                  {row.staleLeads > 0 && (
                    <ToneBadge tone="yellow" label={`${row.staleLeads} untouched 7d+`} />
                  )}
                  {row.isAtRisk && !row.silent && row.openAlerts === 0 && (
                    <ToneBadge tone="red" label="SLA Risk" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-2.5 rounded-lg border border-border/50">
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Active Pipeline</span>
                    <span className="font-bold text-foreground text-sm tabular-nums">
                      {formatMoney(row.pipelineValue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Site Visits Done</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums">
                      {row.visitsDone} / {row.visitsBooked} ({row.visitShowupRate}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Response Speed</span>
                    <span className="font-bold text-foreground text-sm tabular-nums">
                      {row.avgSla === null ? "—" : formatMinutes(row.avgSla)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Conversion Rate</span>
                    <span className="font-bold text-foreground text-sm tabular-nums">{row.conversion}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── 💻 Desktop Executive Scorecard Table (>= 768px) ── */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Active Pipeline</TableHead>
                  <TableHead>Site Visits (Done/Booked)</TableHead>
                  <TableHead>Speed to Call (SLA)</TableHead>
                  <TableHead>Conversion</TableHead>
                  <TableHead>Client Mix</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No executive data yet.
                    </TableCell>
                  </TableRow>
                )}
                {board.map((row) => (
                  <Fragment key={row.name}>
                    <TableRow>
                      <TableCell>
                        <button
                          className="flex items-center gap-1.5 font-semibold text-foreground hover:underline"
                          onClick={() => setExpanded((e) => (e === row.name ? null : row.name))}
                        >
                          {expanded === row.name ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                          <span>{row.name}</span>
                          {row.isTopCloser && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              🏆 Closer
                            </span>
                          )}
                          {row.isSpeedChampion && (
                            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              ⚡ Fast
                            </span>
                          )}
                        </button>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.silent && <ToneBadge tone="red" label="Silent 48 hrs" />}
                          {row.openAlerts > 0 && (
                            <ToneBadge
                              tone="orange"
                              label={`${row.openAlerts} open alert${row.openAlerts > 1 ? "s" : ""}${
                                row.oldestAlertHours !== null
                                  ? ` · ${Math.round(row.oldestAlertHours)}h old`
                                  : ""
                              }`}
                            />
                          )}
                          {row.staleLeads > 0 && (
                            <ToneBadge tone="yellow" label={`${row.staleLeads} untouched 7d+`} />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-foreground text-sm">
                          {formatMoney(row.pipelineValue)}
                        </span>
                        <p className="text-[11px] text-muted-foreground">{row.assigned} leads total</p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums">
                            {row.visitsDone} <span className="text-xs text-muted-foreground font-normal">/ {row.visitsBooked}</span>
                          </span>
                          <div>
                            <ToneBadge
                              tone={row.visitShowupRate >= 70 ? "green" : row.visitShowupRate >= 45 ? "yellow" : "red"}
                              label={`${row.visitShowupRate}% Show-up`}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <ToneBadge
                            tone={slaTone(row.avgSla)}
                            label={row.avgSla === null ? "No alerts" : `⚡ ${formatMinutes(row.avgSla)}`}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {row.fast} fast · {row.ok} ok · {row.slow} slow
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-sm tabular-nums">{row.conversion}%</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.luxuryLeads > 0 && (
                          <span className="text-purple-600 dark:text-purple-400 font-medium">
                            {row.luxuryLeads} Luxury ·{" "}
                          </span>
                        )}
                        {row.premiumLeads > 0 && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                            {row.premiumLeads} Prem ·{" "}
                          </span>
                        )}
                        <span>{row.assigned} Active</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {timeAgo(row.lastActiveAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          className="rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                          onClick={() => setProfile(row.name)}
                        >
                          View profile
                        </button>
                      </TableCell>
                    </TableRow>
                    {expanded === row.name && (
                      <TableRow className="bg-muted/40">
                        <TableCell colSpan={8}>
                          {row.recent.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No recorded actions in this period.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {row.recent.map((a) => (
                                <li
                                  key={a.id}
                                  className="flex flex-wrap items-center gap-2 text-sm"
                                >
                                  <ToneBadge
                                    tone={ACTION_LABELS[a.action]?.tone ?? "gray"}
                                    label={actionLabel(a.action)}
                                  />
                                  <span className="font-medium">{a.lead_name || a.lead_id}</span>
                                  {a.field && (
                                    <span className="text-xs text-muted-foreground">
                                      {a.field}: {a.old_value ?? "empty"} → {a.new_value ?? "empty"}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {timeAgo(a.created_at)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Daily Activity & Feed ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Team Touchpoints</CardTitle>
            <CardDescription className="text-xs">
              Client calls, WhatsApp updates, and status adjustments per day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1">
              {chart.map((c) => (
                <div key={c.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${(c.count / maxDay) * 100}%`, minHeight: c.count ? 4 : 1 }}
                    title={`${c.label}: ${c.count} actions`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>{chart[0]?.label}</span>
              <span>{chart[chart.length - 1]?.label}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live Activity Feed</CardTitle>
            <CardDescription className="text-xs">
              Real-time executive actions and milestone updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {feed.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No actions recorded yet. Every executive action appears here.
              </p>
            )}
            {feed.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0"
              >
                <span className="font-semibold text-foreground">{a.executive_name || "Unassigned"}</span>
                <ToneBadge
                  tone={ACTION_LABELS[a.action]?.tone ?? "gray"}
                  label={actionLabel(a.action)}
                />
                <span className="text-muted-foreground">{a.lead_name || a.lead_id}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {timeAgo(a.created_at)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ExecutiveDrawer
        name={profile}
        leads={leads}
        activity={activity}
        period={period}
        onPeriodChange={setPeriod}
        open={!!profile}
        onOpenChange={(v) => !v && setProfile(null)}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  subtext,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtext?: string;
  danger?: boolean;
}) {
  return (
    <Card className="shadow-xs transition-shadow hover:shadow-sm">
      <CardContent className="flex items-start gap-4 pt-6">
        <div
          className={`rounded-xl p-3 shrink-0 ${
            danger ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-primary/10 text-primary"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p
            className="text-2xl font-bold tracking-tight text-foreground"
            style={danger ? { color: "var(--tone-red, #e11d48)" } : undefined}
          >
            {value}
          </p>
          {subtext && <p className="mt-1 text-[11px] text-muted-foreground truncate">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Lets an admin add/remove sales executives for their tenant.
 */
function TeamManager({ clientId }: { clientId: string | null }) {
  const { data: executives = [] } = useExecutives();
  const add = useAddExecutive();
  const del = useDeleteExecutive();
  const update = useUpdateExecutive();

  // Add dialog state
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("sales_executive");

  // Edit dialog state
  const [editEx, setEditEx] = useState<Executive | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("sales_executive");

  // Delete confirm state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openEdit = (ex: Executive) => {
    setEditEx(ex);
    setEditName(ex.name);
    setEditEmail(ex.email ?? "");
    setEditPhone(ex.phone ?? "");
    setEditRole((ex as Executive & { role?: string }).role ?? "sales_executive");
  };

  const hasManager = executives.some(
    (ex) => (ex as Executive & { role?: string }).role === "manager",
  );

  const submitAdd = () => {
    if (!clientId) {
      toast.error("No tenant selected");
      return;
    }
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (role === "manager" && hasManager) {
      toast.error("A manager already exists for this team. Only one manager is allowed.");
      return;
    }
    add.mutate(
      { clientId, name: name.trim(), email: email.trim(), phone: phone.trim(), role },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setEmail("");
          setPhone("");
          setRole("sales_executive");
        },
      },
    );
  };

  const submitEdit = () => {
    if (!editEx) return;
    if (!editName.trim() || !editEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    const currentRole = (editEx as Executive & { role?: string }).role ?? "sales_executive";
    const changingToManager = editRole === "manager" && currentRole !== "manager";
    if (changingToManager && hasManager) {
      toast.error("A manager already exists for this team. Only one manager is allowed.");
      return;
    }
    update.mutate(
      { id: editEx.id, name: editName, email: editEmail, phone: editPhone, role: editRole },
      { onSuccess: () => setEditEx(null) },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex-1">
          <CardTitle className="text-base">Sales Team & Access Management</CardTitle>
          <CardDescription className="text-xs">
            Add team executives and managers. Account binding occurs automatically when signing in with the designated email.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="w-full sm:w-auto">
          <Plus /> Add team member
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {executives.length === 0 && (
          <p className="text-sm text-muted-foreground">No executives added yet.</p>
        )}
        {executives.map((ex) => (
          <div
            key={ex.id}
            className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-semibold text-sm">{ex.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ex.email || "—"} · {ex.phone || "—"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge
                tone={(ex as Executive & { role?: string }).role === "manager" ? "blue" : "gray"}
                label={(ex as Executive & { role?: string }).role === "manager" ? "Manager" : "Sales Executive"}
              />
              <ToneBadge
                tone={ex.user_id ? "green" : "yellow"}
                label={ex.user_id ? "Linked" : "Pending sign-in"}
              />
              <Button
                size="sm"
                variant="ghost"
                className="size-8 p-0"
                onClick={() => openEdit(ex)}
                title="Edit member"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="size-8 p-0 text-destructive hover:text-destructive"
                onClick={() => setDeleteId(ex.id)}
                title="Remove member"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              Assign a role and contact info. When they sign in with this email, they'll join your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="add-name">Full name</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Patel"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. ramesh@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-phone">Phone (optional)</Label>
              <Input
                id="add-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_executive">Sales Executive</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={add.isPending}>
              {add.isPending ? "Adding..." : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editEx} onOpenChange={(v) => !v && setEditEx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit team member</DialogTitle>
            <DialogDescription>Update contact information or role.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_executive">Sales Executive</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEx(null)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink the executive from this workspace. Their assigned leads will remain in the CRM and can be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) del.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
