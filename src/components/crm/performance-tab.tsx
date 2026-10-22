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
import { useCurrentUser } from "@/lib/auth";
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
        <div className="flex items-center rounded-xl border border-border/30 bg-muted/60 p-1 shadow-2xs backdrop-blur-xs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`apple-button rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                period === p.key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4 Realtor Business KPI Cards (Apple Complication Widgets) ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<TrendingUp className="size-5" />}
          label="Active Deal Pipeline"
          value={formatMoney(summary.totalPipelineValue)}
          subtext={`${periodLeads.length} active leads in period`}
          variant="blue"
        />
        <Kpi
          icon={<CalendarCheck className="size-5" />}
          label="Site Visits Completed"
          value={summary.totalVisitsDone}
          subtext={`${summary.teamShowupRate}% Show-up (${summary.totalVisitsBooked} booked)`}
          variant="green"
        />
        <Kpi
          icon={<Zap className="size-5" />}
          label="Speed-to-Call (<15m SLA)"
          value={summary.teamSlaCompliance !== null ? `${summary.teamSlaCompliance}%` : "—"}
          subtext={`Avg: ${summary.teamAvgSla !== null ? formatMinutes(summary.teamAvgSla) : "No alerts"} response`}
          variant="amber"
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
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4.5 text-rose-950 dark:text-rose-100 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="flex items-start gap-3.5">
              <div className="size-10 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm tracking-tight">
                  ⚠️ {summary.unattendedAlerts} High-Intent Lead{summary.unattendedAlerts > 1 ? "s" : ""} Overdue for Call (&gt;30 mins)!
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  These clients requested a VIP site visit or executive phone call more than 30 minutes ago. In real estate, buyers reach out to multiple brokers simultaneously — delay causes direct deal loss.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {summary.overdueLeads.slice(0, 4).map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-background/90 px-2.5 py-1 text-foreground shadow-2xs"
                    >
                      <span className="font-semibold">{l.name || l.first_name || "Lead"}</span>
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        ({l.property_type || "Property"} · {formatMoney(l.budget)})
                      </span>
                      <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                        Assigned: {l.assigned_executive_name || "Unassigned"}
                      </span>
                    </div>
                  ))}
                  {summary.overdueLeads.length > 4 && (
                    <span className="text-xs text-muted-foreground self-center tabular-nums">
                      +{summary.overdueLeads.length - 4} more leads
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 🏆 Top Performer Spotlight Podium (Apple Highlight Cards) ── */}
      {(topCloser || speedChamp || bestShowup) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {topCloser && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 shadow-xs apple-button transition-all flex items-center gap-3.5 hover:bg-amber-500/15">
              <div className="size-10 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Trophy className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 block">
                  🏆 Top Closer
                </span>
                <p className="font-bold text-sm text-foreground truncate mt-0.5">{topCloser.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  <b>{topCloser.visitsDone}</b> Visits Done · {formatMoney(topCloser.pipelineValue)} Pipeline
                </p>
              </div>
            </div>
          )}

          {speedChamp && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 shadow-xs apple-button transition-all flex items-center gap-3.5 hover:bg-emerald-500/15">
              <div className="size-10 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Zap className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                  ⚡ Speed Champion
                </span>
                <p className="font-bold text-sm text-foreground truncate mt-0.5">{speedChamp.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  <b>{formatMinutes(speedChamp.avgSla)}</b> Avg Response ({speedChamp.slaComplianceRate ?? 100}% on-time)
                </p>
              </div>
            </div>
          )}

          {bestShowup && (
            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 shadow-xs apple-button transition-all flex items-center gap-3.5 hover:bg-blue-500/15">
              <div className="size-10 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Target className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 block">
                  🎯 Best Show-Up Rate
                </span>
                <p className="font-bold text-sm text-foreground truncate mt-0.5">{bestShowup.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  <b>{bestShowup.visitShowupRate}%</b> Show-Up ({bestShowup.visitsDone}/{bestShowup.visitsBooked} Visits)
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Executive Scorecard (Apple Inset-Grouped Table) ── */}
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xs">
        <div className="flex flex-col gap-3 p-4 sm:p-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between border-b border-border/40">
          <div>
            <h3 className="text-base font-bold tracking-tight text-foreground">Sales Executive Scorecard</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ranked by deal volume, visit completions, and client response speeds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/30">
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
                className={`apple-button rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  sort === key
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-0">
          {/* ── 📱 Mobile Executive Scorecard (Phones < 768px) ── */}
          <div className="space-y-3 p-4 md:hidden">
            {board.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-xs text-muted-foreground">
                No executive data yet.
              </div>
            )}
            {board.map((row) => (
              <div
                key={`m-exec-${row.name}`}
                className="rounded-2xl border border-border/50 bg-card p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-bold text-sm text-foreground">{row.name}</h4>
                      {row.isTopCloser && (
                        <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          🏆 Closer
                        </span>
                      )}
                      {row.isSpeedChampion && (
                        <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          ⚡ Speed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Active: {timeAgo(row.lastActiveAt)}
                    </p>
                  </div>
                  <button
                    className="apple-button min-h-[44px] h-11 px-4 rounded-xl border border-border/60 bg-muted/30 text-xs font-semibold hover:bg-muted text-foreground shrink-0 shadow-2xs"
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

                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-border/40">
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
                <TableRow className="bg-muted/50 border-b border-border/60 hover:bg-muted/50">
                  <TableHead className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase py-3.5">Executive</TableHead>
                  <TableHead className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase py-3.5">Active Pipeline</TableHead>
                  <TableHead className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase py-3.5">Site Visits (Done/Booked)</TableHead>
                  <TableHead className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase py-3.5">Speed to Call (SLA)</TableHead>
                  <TableHead className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase py-3.5">Conversion</TableHead>
                  <TableHead className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase py-3.5">Client Mix</TableHead>
                  <TableHead className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase py-3.5">Last Active</TableHead>
                  <TableHead className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase py-3.5 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground text-xs">
                      No executive data yet.
                    </TableCell>
                  </TableRow>
                )}
                {board.map((row) => (
                  <Fragment key={row.name}>
                    <TableRow className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                      <TableCell className="py-3.5">
                        <button
                          className="flex items-center gap-1.5 font-semibold text-foreground hover:text-primary transition-colors"
                          onClick={() => setExpanded((e) => (e === row.name ? null : row.name))}
                        >
                          {expanded === row.name ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                          <span>{row.name}</span>
                          {row.isTopCloser && (
                            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              🏆 Closer
                            </span>
                          )}
                          {row.isSpeedChampion && (
                            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
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
                      <TableCell className="py-3.5">
                        <span className="font-bold text-foreground text-sm tabular-nums">
                          {formatMoney(row.pipelineValue)}
                        </span>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{row.assigned} leads total</p>
                      </TableCell>
                      <TableCell className="py-3.5">
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
                      <TableCell className="py-3.5">
                        <div className="space-y-1">
                          <ToneBadge
                            tone={slaTone(row.avgSla)}
                            label={row.avgSla === null ? "No alerts" : `⚡ ${formatMinutes(row.avgSla)}`}
                          />
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {row.fast} fast · {row.ok} ok · {row.slow} slow
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className="font-semibold text-sm tabular-nums">{row.conversion}%</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3.5">
                        {row.luxuryLeads > 0 && (
                          <span className="text-purple-600 dark:text-purple-400 font-medium tabular-nums">
                            {row.luxuryLeads} Luxury ·{" "}
                          </span>
                        )}
                        {row.premiumLeads > 0 && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium tabular-nums">
                            {row.premiumLeads} Prem ·{" "}
                          </span>
                        )}
                        <span className="tabular-nums">{row.assigned} Active</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground py-3.5">
                        {timeAgo(row.lastActiveAt)}
                      </TableCell>
                      <TableCell className="text-right py-3.5">
                        <button
                          className="apple-button rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold hover:bg-muted shadow-2xs"
                          onClick={() => setProfile(row.name)}
                        >
                          View profile
                        </button>
                      </TableCell>
                    </TableRow>
                    {expanded === row.name && (
                      <TableRow className="bg-muted/30 border-b border-border/30">
                        <TableCell colSpan={8} className="p-4">
                          {row.recent.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No recorded actions in this period.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {row.recent.map((a) => (
                                <li
                                  key={a.id}
                                  className="flex flex-wrap items-center gap-2 text-xs"
                                >
                                  <ToneBadge
                                    tone={ACTION_LABELS[a.action]?.tone ?? "gray"}
                                    label={actionLabel(a.action)}
                                  />
                                  <span className="font-medium text-foreground">{a.lead_name || a.lead_id}</span>
                                  {a.field && (
                                    <span className="text-muted-foreground">
                                      {a.field}: {a.old_value ?? "empty"} → {a.new_value ?? "empty"}
                                    </span>
                                  )}
                                  <span className="text-muted-foreground/75 tabular-nums ml-auto">
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
        </div>
      </div>

      {/* ── Daily Activity & Feed ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-bold tracking-tight text-foreground">Daily Team Touchpoints</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Client calls, WhatsApp updates, and status adjustments per day.
            </p>
          </div>
          <div>
            <div className="flex h-40 items-end gap-1.5 pt-2">
              {chart.map((c) => (
                <div key={c.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm bg-primary/80 hover:bg-primary transition-colors cursor-pointer"
                    style={{ height: `${(c.count / maxDay) * 100}%`, minHeight: c.count ? 4 : 1 }}
                    title={`${c.label}: ${c.count} actions`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>{chart[0]?.label}</span>
              <span>{chart[chart.length - 1]?.label}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-xs flex flex-col">
          <div className="mb-3">
            <h3 className="text-base font-bold tracking-tight text-foreground">Live Activity Feed</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time executive actions and milestone updates.
            </p>
          </div>
          <div className="space-y-2.5 flex-1 max-h-[220px] overflow-y-auto pr-1">
            {feed.length === 0 && (
              <p className="text-xs text-muted-foreground py-8 text-center">
                No actions recorded yet. Every executive action appears here.
              </p>
            )}
            {feed.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-2 border-b border-border/30 pb-2 text-xs last:border-0"
              >
                <span className="font-semibold text-foreground">{a.executive_name || "Unassigned"}</span>
                <ToneBadge
                  tone={ACTION_LABELS[a.action]?.tone ?? "gray"}
                  label={actionLabel(a.action)}
                />
                <span className="text-muted-foreground truncate max-w-[160px]">{a.lead_name || a.lead_id}</span>
                <span className="ml-auto text-[11px] text-muted-foreground/75 tabular-nums">
                  {timeAgo(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
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
  variant = "blue",
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtext?: string;
  variant?: "blue" | "green" | "amber" | "rose";
  danger?: boolean;
}) {
  const iconTheme = {
    blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  }[danger ? "rose" : variant];

  return (
    <div
      className={`rounded-2xl border p-4.5 shadow-xs transition-all hover:bg-muted/30 ${
        danger
          ? "border-rose-500/30 bg-rose-500/5 ring-1 ring-rose-500/20"
          : "border-border/50 bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`size-10 items-center justify-center rounded-full flex shrink-0 ${iconTheme}`}>
          {icon}
        </div>
      </div>
      <p
        className={`mt-3.5 text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${
          danger ? "text-rose-600 dark:text-rose-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <div className="mt-1">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {subtext && <p className="text-[11px] text-muted-foreground mt-0.5 truncate tabular-nums">{subtext}</p>}
      </div>
    </div>
  );
}

/**
 * Lets an admin add/remove sales executives for their tenant.
 */
function TeamManager({ clientId }: { clientId: string | null }) {
  const { data: executives = [] } = useExecutives();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const add = useAddExecutive();
  const del = useDeleteExecutive();
  const update = useUpdateExecutive();

  // Add dialog state
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [role, setRole] = useState("sales_executive");

  // Edit dialog state
  const [editEx, setEditEx] = useState<Executive | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTelegramId, setEditTelegramId] = useState("");
  const [editRole, setEditRole] = useState("sales_executive");

  // Delete confirm state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openEdit = (ex: Executive) => {
    setEditEx(ex);
    setEditName(ex.name);
    setEditEmail(ex.email ?? "");
    setEditPhone(ex.phone ?? "");
    setEditTelegramId(ex.telegram_id ?? "");
    const rawRole = ((ex as Executive & { role?: string }).role || "").toLowerCase();
    const normalizedRole = rawRole.includes("admin")
      ? "admin"
      : rawRole.includes("manager")
      ? "manager"
      : "sales_executive";
    setEditRole(normalizedRole);
  };

  const hasManager = executives.some(
    (ex) => ((ex as Executive & { role?: string }).role || "").toLowerCase() === "manager",
  );

  const submitAdd = () => {
    if (!isAdmin) {
      toast.error("Admin access required: Only an Admin can add new team members.");
      return;
    }
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
      {
        clientId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        telegram_id: telegramId.trim() || undefined,
        role,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setEmail("");
          setPhone("");
          setTelegramId("");
          setRole("sales_executive");
        },
      },
    );
  };

  const submitEdit = () => {
    if (!isAdmin) {
      toast.error("Admin access required: Only an Admin can modify team member settings.");
      return;
    }
    if (!editEx) return;
    if (!editName.trim() || !editEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    const currentRole = ((editEx as Executive & { role?: string }).role || "").toLowerCase();
    const changingToManager = editRole === "manager" && currentRole !== "manager";
    const otherManagerExists = executives.some((e) => e.id !== editEx.id && ((e as Executive & { role?: string }).role || "").toLowerCase() === "manager");
    if (changingToManager && otherManagerExists) {
      toast.error("A manager already exists for this team. Only one manager is allowed.");
      return;
    }
    update.mutate(
      {
        id: editEx.id,
        name: editName,
        email: editEmail,
        phone: editPhone,
        telegram_id: editTelegramId.trim() || undefined,
        role: editRole,
      },
      { onSuccess: () => setEditEx(null) },
    );
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-base font-bold tracking-tight text-foreground">Sales Team & Access Management</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add team executives and managers. Account binding occurs automatically when signing in with the designated email.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setOpen(true)} className="apple-button rounded-xl h-10 px-4 text-xs font-semibold shadow-2xs w-full sm:w-auto">
            <Plus className="size-4" /> Add team member
          </Button>
        )}
      </div>
      {!isAdmin && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 font-medium">
          🔒 View-only mode: Only Admins can add members, change roles, or delete executives.
        </p>
      )}
      <div className="space-y-2.5">
        {executives.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">No executives added yet.</p>
        )}
        {executives.map((ex) => (
          <div
            key={ex.id}
            className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card p-3 sm:flex-row sm:items-center sm:justify-between shadow-2xs hover:bg-muted/20 transition-all"
          >
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground">{ex.name}</p>
              <p className="truncate text-xs text-muted-foreground mt-0.5">
                {ex.email || "—"} · {ex.phone || "—"}{ex.telegram_id ? ` · TG: ${ex.telegram_id}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge
                tone={
                  (ex as Executive & { role?: string }).role === "admin"
                    ? "purple"
                    : (ex as Executive & { role?: string }).role === "manager"
                    ? "blue"
                    : "gray"
                }
                label={
                  (ex as Executive & { role?: string }).role === "admin"
                    ? "Admin"
                    : (ex as Executive & { role?: string }).role === "manager"
                    ? "Manager"
                    : "Sales Executive"
                }
              />
              <ToneBadge
                tone={ex.user_id ? "green" : "yellow"}
                label={ex.user_id ? "Linked" : "Pending sign-in"}
              />
              {isAdmin && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="apple-button size-8.5 rounded-lg p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(ex)}
                    title="Edit member"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="apple-button size-8.5 rounded-lg p-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(ex.id)}
                    title="Remove member"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

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
              <Label htmlFor="add-phone">Phone (WhatsApp Alerts)</Label>
              <Input
                id="add-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-telegram">Telegram Chat ID (Testing Alerts)</Label>
              <Input
                id="add-telegram"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="e.g. 5117510624"
              />
              <p className="text-[11px] text-muted-foreground">
                Enter your numeric Telegram Chat ID. First message the bot from this ID so Telegram allows alerts.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin / Director</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="sales_executive">Sales Executive</SelectItem>
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
              <Label htmlFor="edit-phone">Phone (WhatsApp Alerts)</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-telegram">Telegram Chat ID (Testing Alerts)</Label>
              <Input
                id="edit-telegram"
                value={editTelegramId}
                onChange={(e) => setEditTelegramId(e.target.value)}
                placeholder="e.g. 5117510624"
              />
              <p className="text-[11px] text-muted-foreground">
                Enter your numeric Telegram Chat ID. First message the bot from this ID so Telegram allows alerts.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin / Director</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="sales_executive">Sales Executive</SelectItem>
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
    </div>
  );
}
