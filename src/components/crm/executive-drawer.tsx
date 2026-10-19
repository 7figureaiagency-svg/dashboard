import { useMemo } from "react";
import { Activity as ActivityIcon, Clock, TrendingUp } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, ToneBadge } from "@/components/crm/badges";
import { buildExecStats, execName } from "@/lib/crm-metrics";
import {
  ACTION_LABELS,
  PERIODS,
  actionLabel,
  formatDate,
  formatMinutes,
  formatMoney,
  inPeriod,
  timeAgo,
  type Activity,
  type Lead,
  type Period,
} from "@/lib/crm";

export function ExecutiveDrawer({
  name,
  leads,
  activity,
  period,
  onPeriodChange,
  open,
  onOpenChange,
}: {
  name: string | null;
  leads: Lead[];
  activity: Activity[];
  period: Period;
  onPeriodChange: (p: Period) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const stats = useMemo(
    () => (name ? buildExecStats(leads, activity, period).find((s) => s.name === name) : undefined),
    [name, leads, activity, period],
  );

  const myLeads = useMemo(
    () =>
      leads
        .filter((l) => execName(l) === name)
        .sort((a, b) =>
          (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? ""),
        ),
    [leads, name],
  );

  const myLeadIds = useMemo(() => new Set(myLeads.map((l) => l.lead_id)), [myLeads]);

  const timeline = useMemo(
    () =>
      activity
        .filter(
          (a) =>
            ((a.executive_name && a.executive_name === name) || myLeadIds.has(a.lead_id)) &&
            inPeriod(a.created_at, period),
        )
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .slice(0, 100),
    [activity, name, period, myLeadIds],
  );

  if (!name) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="text-xl flex items-center gap-2">
            <span>{name}</span>
            {stats?.isTopCloser && (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                🏆 Top Closer
              </span>
            )}
            {stats?.isSpeedChampion && (
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                ⚡ Speed Star
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            Performance analytics, active pipeline value, and action history for this sales executive.
          </SheetDescription>
          <div className="flex flex-wrap gap-1 pt-2">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => onPeriodChange(p.key)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-10">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Active Pipeline" value={stats?.pipelineValue ? formatMoney(stats.pipelineValue) : "₹0"} />
            <Stat label="Leads assigned" value={stats?.assigned ?? 0} />
            <Stat label="Visits (Done/Booked)" value={`${stats?.visitsDone ?? 0} / ${stats?.visitsBooked ?? 0}`} />
            <Stat label="Visit Show-up" value={`${stats?.visitShowupRate ?? 0}%`} />
            <Stat
              label="Avg response"
              value={stats === undefined ? "—" : formatMinutes(stats.avgSla ?? null)}
            />
            <Stat
              label="15m SLA On-Time"
              value={stats?.slaComplianceRate !== null && stats?.slaComplianceRate !== undefined ? `${stats.slaComplianceRate}%` : "—"}
            />
            <Stat label="Open alerts" value={stats?.openAlerts ?? 0} danger />
            <Stat label="Untouched 7d+" value={stats?.staleLeads ?? 0} danger />
          </section>

          {stats && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-xs">
              <span className="font-semibold text-foreground block">Client Budget Segment Distribution:</span>
              <div className="flex flex-wrap gap-2">
                <span className="rounded bg-background px-2 py-1 border text-purple-600 dark:text-purple-400 font-medium">
                  👑 Luxury (₹1.75Cr+): {stats.luxuryLeads}
                </span>
                <span className="rounded bg-background px-2 py-1 border text-indigo-600 dark:text-indigo-400 font-medium">
                  💎 Premium (₹90L-1.75Cr): {stats.premiumLeads}
                </span>
                <span className="rounded bg-background px-2 py-1 border text-blue-600 dark:text-blue-400 font-medium">
                  🏠 Mid-Segment (₹45L-90L): {stats.midLeads}
                </span>
                <span className="rounded bg-background px-2 py-1 border text-muted-foreground font-medium">
                  🌱 Affordable (&lt;₹45L): {stats.affordableLeads}
                </span>
              </div>
            </div>
          )}

          {stats && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> Last action {timeAgo(stats.lastActiveAt)}
              {stats.silent && <ToneBadge tone="red" label="No action in 48 hrs" />}
              <span className="ml-2 flex gap-1">
                <ToneBadge tone="green" label={`${stats.fast} under 15 min`} />
                <ToneBadge tone="yellow" label={`${stats.ok} in 15–30 min`} />
                <ToneBadge tone="red" label={`${stats.slow} over 30 min`} />
              </span>
            </p>
          )}

          <Separator />

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4" /> Assigned Leads ({myLeads.length})
            </h3>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Budget / Preference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myLeads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        No leads assigned yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {myLeads.map((l) => (
                    <TableRow key={l.lead_id}>
                      <TableCell className="font-medium">{l.name || l.first_name || "Unnamed"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.property_type || "Any Property"}
                        {l.budget ? ` · ${formatMoney(l.budget)}` : ""}
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={l.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                        {timeAgo(l.updated_at ?? l.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ActivityIcon className="size-4" /> Action History
            </h3>
            {timeline.length === 0 && (
              <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
                No recorded actions in this period.
              </p>
            )}
            <ol className="space-y-3 border-l pl-4">
              {timeline.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneBadge
                      tone={ACTION_LABELS[a.action]?.tone ?? "gray"}
                      label={actionLabel(a.action)}
                    />
                    <span className="text-sm font-medium">{a.lead_name || a.lead_id}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                  </div>
                  {a.field && (
                    <p className="text-xs text-muted-foreground">
                      {a.field}: {a.old_value ?? "empty"} → {a.new_value ?? "empty"}
                    </p>
                  )}
                  {a.note && <p className="mt-1 text-xs italic">“{a.note}”</p>}
                  <p className="text-[11px] text-muted-foreground">{formatDate(a.created_at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  const isDanger = danger && Number(value) > 0;
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className="text-xl font-bold"
        style={isDanger ? { color: "var(--tone-red)" } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
