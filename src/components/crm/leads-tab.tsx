import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Columns3,
  LayoutList,
  MapPin,
  Phone,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Switch } from "@/components/ui/switch";
import { PropertyStateBadge, StatusBadge, ToneBadge } from "@/components/crm/badges";
import { LeadDrawer } from "@/components/crm/lead-drawer";
import { ExecutiveDrawer } from "@/components/crm/executive-drawer";
import { useActivity, useUpdateLead } from "@/lib/crm-data";
import {
  formatDate,
  formatMoney,
  inDatePreset,
  isVisitBookedStatus,
  isVisitDoneStatus,
  STATUS_MAP,
  type Lead,
  type Period,
} from "@/lib/crm";

const ALL = "__all__";

const STATUS_FILTER_OPTIONS = [
  "SITE_VISIT_BOOKED",
  "VISIT_DONE",
  "QUALIFIED",
  "QUALIFYING",
  "VISIT_MISSED",
  "NOT_INTERESTED",
];

export function LeadsTab({
  leads,
  loading,
  lockedExecutive = null,
}: {
  leads: Lead[];
  loading: boolean;
  /** When set, the executive filter is locked to this person. */
  lockedExecutive?: string | null;
}) {
  const [executive, setExecutive] = useState(lockedExecutive ?? ALL);
  const [status, setStatus] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [from, setFrom] = useState("");

  useEffect(() => {
    if (lockedExecutive) setExecutive(lockedExecutive);
  }, [lockedExecutive]);
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [profilePeriod, setProfilePeriod] = useState<Period>("30d");
  const [sweeping, setSweeping] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const update = useUpdateLead();

  const handleRunSweep = async () => {
    try {
      setSweeping(true);
      toast.info("Running automated follow-up sweep...");
      const res = await fetch(
        "https://yeiygfysijptjdepctnx.supabase.co/functions/v1/realtor-lead-engine/cron-sweep",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        }
      );
      const data = await res.json();
      if (data.success) {
        const rem = data.pre_visit_reminders?.length || 0;
        const fb = data.post_visit_feedbacks?.length || 0;
        const fl = data.daily_followups?.length || 0;
        toast.success(
          `Sweep completed: ${rem} pre-visit reminders, ${fb} post-visit feedbacks, ${fl} daily drips sent.`
        );
      } else {
        toast.error("Sweep finished with errors: " + JSON.stringify(data.errors));
      }
    } catch (err: any) {
      toast.error("Failed to run follow-up sweep: " + err.message);
    } finally {
      setSweeping(false);
    }
  };
  const { data: allActivity = [] } = useActivity();

  const activity = useMemo(() => {
    const ids = new Set(leads.map((l) => l.lead_id));
    return allActivity.filter((a) => ids.has(a.lead_id));
  }, [allActivity, leads]);

  const executives = useMemo(
    () =>
      Array.from(new Set(leads.map((l) => l.assigned_executive_name).filter(Boolean))) as string[],
    [leads],
  );
  const sources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source).filter(Boolean))) as string[],
    [leads],
  );

  type ActionFilter = "ALL" | "TODAY_VISITS" | "ACTION_NEEDED" | "QUALIFIED" | "FRESH";
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");

  const todayVisitsCount = useMemo(
    () =>
      leads.filter(
        (l) =>
          inDatePreset(l.site_visit_datetime, "today") ||
          inDatePreset(l.site_visit_at, "today"),
      ).length,
    [leads],
  );

  const actionNeededCount = useMemo(
    () =>
      leads.filter(
        (l) =>
          l.status === "VISIT_MISSED" ||
          l.status === "HUMAN_HANDOVER" ||
          l.property_state === "HUMAN_HANDOVER",
      ).length,
    [leads],
  );

  const qualifiedCount = useMemo(
    () =>
      leads.filter(
        (l) =>
          l.status === "QUALIFIED" ||
          l.status === "SITE_VISIT_BOOKED" ||
          l.status === "VISIT_BOOKED",
      ).length,
    [leads],
  );

  const freshCount = useMemo(
    () =>
      leads.filter(
        (l) =>
          l.status === "NEW" ||
          l.status === "FRESH" ||
          l.status === "QUALIFYING",
      ).length,
    [leads],
  );

  const rows = useMemo(
    () =>
      leads.filter((l) => {
        if (actionFilter === "TODAY_VISITS") {
          if (
            !inDatePreset(l.site_visit_datetime, "today") &&
            !inDatePreset(l.site_visit_at, "today")
          )
            return false;
        } else if (actionFilter === "ACTION_NEEDED") {
          if (
            l.status !== "VISIT_MISSED" &&
            l.status !== "HUMAN_HANDOVER" &&
            l.property_state !== "HUMAN_HANDOVER"
          )
            return false;
        } else if (actionFilter === "QUALIFIED") {
          if (
            l.status !== "QUALIFIED" &&
            l.status !== "SITE_VISIT_BOOKED" &&
            l.status !== "VISIT_BOOKED"
          )
            return false;
        } else if (actionFilter === "FRESH") {
          if (
            l.status !== "NEW" &&
            l.status !== "FRESH" &&
            l.status !== "QUALIFYING"
          )
            return false;
        }

        if (executive !== ALL && l.assigned_executive_name !== executive) return false;
        if (status !== ALL) {
          if (status === "SITE_VISIT_BOOKED") {
            if (!isVisitBookedStatus(l.status)) return false;
          } else if (status === "VISIT_DONE") {
            if (!isVisitDoneStatus(l.status)) return false;
          } else if (l.status !== status) {
            return false;
          }
        }
        if (source !== ALL && l.source !== source) return false;
        if (from && (!l.created_at || new Date(l.created_at) < new Date(from))) return false;
        if (to && (!l.created_at || new Date(l.created_at) > new Date(`${to}T23:59:59`)))
          return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = `${l.name ?? ""} ${l.first_name ?? ""} ${l.phone ?? ""} ${l.selected_property_name ?? ""} ${l.location ?? ""} ${l.lead_id ?? ""}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [leads, executive, status, source, from, to, search, actionFilter],
  );

  const pipelineColumns = useMemo(() => {
    return [
      {
        id: "qualifying",
        title: "In Qualifying",
        headerBg: "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-300",
        countBg: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
        leads: rows.filter(
          (l) =>
            l.status === "NEW" ||
            l.status === "FRESH" ||
            l.status === "QUALIFYING" ||
            l.status === "CRITERIA_CONFIRMATION_PENDING" ||
            l.status === "REQUIREMENT_GATHERED"
        ),
      },
      {
        id: "qualified",
        title: "Qualified Prospects",
        headerBg: "border-indigo-500/20 bg-indigo-500/5 text-indigo-700 dark:text-indigo-300",
        countBg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
        leads: rows.filter((l) => l.status === "QUALIFIED"),
      },
      {
        id: "scheduled",
        title: "Visit Scheduled",
        headerBg: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
        countBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        leads: rows.filter((l) => isVisitBookedStatus(l.status)),
      },
      {
        id: "action_needed",
        title: "Action Needed / Alert",
        headerBg: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300",
        countBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        leads: rows.filter(
          (l) =>
            l.status === "VISIT_MISSED" ||
            l.status === "HUMAN_HANDOVER" ||
            l.property_state === "HUMAN_HANDOVER" ||
            l.status === "RESCHEDULE_REQUESTED"
        ),
      },
      {
        id: "decision",
        title: "Visited / Closing",
        headerBg: "border-teal-500/20 bg-teal-500/5 text-teal-700 dark:text-teal-300",
        countBg: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
        leads: rows.filter(
          (l) => l.status === "DEAL_WON" || isVisitDoneStatus(l.status)
        ),
      },
      {
        id: "dropped",
        title: "Dropped / Junk",
        headerBg: "border-muted-foreground/20 bg-muted/40 text-muted-foreground",
        countBg: "bg-muted-foreground/15 text-muted-foreground",
        leads: rows.filter(
          (l) => l.status === "NOT_INTERESTED" || l.status === "DROPPED"
        ),
      },
    ];
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* ── 🚀 Apple HIG Complication Triage Widgets ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === "TODAY_VISITS" ? "ALL" : "TODAY_VISITS")}
          className={`apple-button flex flex-col text-left rounded-2xl border p-4 transition-all shadow-xs ${
            actionFilter === "TODAY_VISITS"
              ? "border-emerald-500/50 bg-emerald-500/10 ring-2 ring-emerald-500/30"
              : "bg-card hover:bg-muted/40 border-border/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CalendarCheck className="size-4" />
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {todayVisitsCount}
            </span>
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">{todayVisitsCount}</p>
          <div className="mt-1">
            <span className="text-xs font-semibold text-foreground">Visits Today</span>
            <p className="text-[11px] text-muted-foreground">Scheduled site tours</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === "ACTION_NEEDED" ? "ALL" : "ACTION_NEEDED")}
          className={`apple-button flex flex-col text-left rounded-2xl border p-4 transition-all shadow-xs ${
            actionFilter === "ACTION_NEEDED"
              ? "border-amber-500/50 bg-amber-500/10 ring-2 ring-amber-500/30"
              : "bg-card hover:bg-muted/40 border-border/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" />
            </div>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
              {actionNeededCount}
            </span>
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">{actionNeededCount}</p>
          <div className="mt-1">
            <span className="text-xs font-semibold text-foreground">Action Needed</span>
            <p className="text-[11px] text-muted-foreground">Missed visits & handovers</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === "QUALIFIED" ? "ALL" : "QUALIFIED")}
          className={`apple-button flex flex-col text-left rounded-2xl border p-4 transition-all shadow-xs ${
            actionFilter === "QUALIFIED"
              ? "border-indigo-500/50 bg-indigo-500/10 ring-2 ring-indigo-500/30"
              : "bg-card hover:bg-muted/40 border-border/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <CheckCircle2 className="size-4" />
            </div>
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 tabular-nums">
              {qualifiedCount}
            </span>
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">{qualifiedCount}</p>
          <div className="mt-1">
            <span className="text-xs font-semibold text-foreground">Qualified Leads</span>
            <p className="text-[11px] text-muted-foreground">Budget & area verified</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === "FRESH" ? "ALL" : "FRESH")}
          className={`apple-button flex flex-col text-left rounded-2xl border p-4 transition-all shadow-xs ${
            actionFilter === "FRESH"
              ? "border-purple-500/50 bg-purple-500/10 ring-2 ring-purple-500/30"
              : "bg-card hover:bg-muted/40 border-border/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400">
              <Sparkles className="size-4" />
            </div>
            <span className="rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300 tabular-nums">
              {freshCount}
            </span>
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">{freshCount}</p>
          <div className="mt-1">
            <span className="text-xs font-semibold text-foreground">In Qualifying</span>
            <p className="text-[11px] text-muted-foreground">Active AI conversations</p>
          </div>
        </button>
      </div>

      {actionFilter !== "ALL" && (
        <div className="flex items-center gap-2 rounded-xl bg-muted/60 border border-border/40 px-3.5 py-2 text-xs text-muted-foreground">
          <span>
            Active quick filter:{" "}
            <strong className="text-foreground">
              {actionFilter === "TODAY_VISITS" && "Today's Site Visits"}
              {actionFilter === "ACTION_NEEDED" && "Action Needed (Missed Visits / Handover)"}
              {actionFilter === "QUALIFIED" && "Qualified Prospects"}
              {actionFilter === "FRESH" && "In Qualifying"}
            </strong>{" "}
            ({rows.length} leads shown)
          </span>
          <button
            type="button"
            onClick={() => setActionFilter("ALL")}
            className="apple-button ml-auto inline-flex items-center gap-1 text-primary hover:underline font-medium"
          >
            <X className="size-3" /> Clear quick filter
          </button>
        </div>
      )}

      <Card className="rounded-2xl border border-border/50 bg-card shadow-xs">
        <CardContent className="flex flex-wrap items-end gap-3 pt-5 pb-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal className="size-4" /> Filters
          </div>
          {lockedExecutive ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Executive</p>
              <div className="flex h-9 min-w-[150px] items-center rounded-md border bg-muted px-3 text-sm">
                {lockedExecutive}
              </div>
            </div>
          ) : (
            <FilterSelect
              label="Executive"
              value={executive}
              onChange={setExecutive}
              options={executives}
            />
          )}
          <FilterSelect
            label="Status"
            allLabel="All Statuses"
            value={status}
            onChange={setStatus}
            options={STATUS_FILTER_OPTIONS}
            render={(v) => STATUS_MAP[v]?.label ?? v}
          />
          <FilterSelect label="Source" value={source} onChange={setSource} options={sources} />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">From</p>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">To</p>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="relative min-w-[180px] flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">Search</p>
            <Search className="absolute left-3 top-[30px] size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name, phone or property"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!lockedExecutive && (
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunSweep}
                disabled={sweeping}
                className="h-9 gap-1.5 font-medium border-primary/20 text-primary hover:bg-primary/5"
                title="Run Automated Pre-Visit Reminders, Post-Visit Feedback & Daily Qualification Follow-Up (Admin Only)"
              >
                <Send className={`size-3.5 ${sweeping ? "animate-spin" : ""}`} />
                {sweeping ? "Sweeping..." : "Run Follow-Up Sweep"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 📊 View Switcher Bar (Table View ⟷ Pipeline Board) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1 shadow-2xs">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "table" ? "default" : "ghost"}
            className="h-8 gap-1.5 text-xs font-medium"
            onClick={() => setViewMode("table")}
          >
            <LayoutList className="size-3.5" /> Table View ({rows.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "kanban" ? "default" : "ghost"}
            className="h-8 gap-1.5 text-xs font-medium"
            onClick={() => setViewMode("kanban")}
          >
            <Columns3 className="size-3.5" /> Pipeline Board
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Showing <b>{rows.length}</b> {rows.length === 1 ? "lead" : "leads"}
          </span>
          {viewMode === "kanban" && (
            <span className="hidden sm:inline-block text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              6 Pipeline Stages
            </span>
          )}
        </div>
      </div>

      {viewMode === "kanban" ? (
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-[1250px] gap-3.5 items-start">
            {pipelineColumns.map((col) => (
              <div
                key={col.id}
                className="flex flex-1 flex-col rounded-xl border bg-card/60 backdrop-blur-xs shadow-2xs min-w-[200px]"
              >
                {/* Column Header */}
                <div
                  className={`flex items-center justify-between border-b px-3.5 py-2.5 rounded-t-xl ${col.headerBg}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-xs tracking-tight truncate">
                      {col.title}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${col.countBg}`}
                  >
                    {col.leads.length}
                  </span>
                </div>

                {/* Column Card Body */}
                <div className="flex-1 space-y-2.5 p-2.5 min-h-[350px] max-h-[72vh] overflow-y-auto">
                  {loading && (
                    <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
                  )}
                  {!loading && col.leads.length === 0 && (
                    <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 text-center p-3 text-xs text-muted-foreground">
                      <span>No leads in this stage</span>
                    </div>
                  )}
                  {!loading &&
                    col.leads.map((lead) => (
                      <div
                        key={lead.lead_id}
                        onClick={() => setSelected(lead)}
                        className="group relative flex flex-col justify-between rounded-lg border bg-card p-3 shadow-2xs hover:border-primary/40 hover:shadow-xs transition-all cursor-pointer"
                      >
                        {/* Top: Customer Name & Budget */}
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-semibold text-sm leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {lead.name || lead.first_name || "Unnamed"}
                          </span>
                          <span className="shrink-0 text-xs font-bold text-primary">
                            {formatMoney(lead.budget)}
                          </span>
                        </div>

                        {/* Middle Info */}
                        <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                          {(lead.property_type || lead.location) && (
                            <p className="flex items-center gap-1.5 truncate text-[11px]">
                              <MapPin className="size-3 shrink-0 text-muted-foreground/70" />
                              <span className="truncate">
                                {[lead.property_type, lead.location].filter(Boolean).join(" · ")}
                              </span>
                            </p>
                          )}

                          {lead.selected_property_name && (
                            <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/90 truncate">
                              <Building2 className="size-3 shrink-0 text-primary" />
                              <span className="truncate">{lead.selected_property_name}</span>
                            </p>
                          )}

                          {(lead.site_visit_datetime || lead.site_visit_at) && (
                            <div className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              <CalendarCheck className="size-3 shrink-0" />
                              <span>{formatDate(lead.site_visit_datetime || lead.site_visit_at)}</span>
                            </div>
                          )}

                          {lead.pre_visit_reminder_sent && !lead.post_visit_feedback_sent && (
                            <span className="inline-block text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                              ⏰ Reminder Dispatched
                            </span>
                          )}

                          {lead.post_visit_feedback_sent && (
                            <span className="inline-block text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                              💬 Survey Dispatched
                            </span>
                          )}
                        </div>

                        {/* Card Footer: Executive & Call CTA */}
                        <div
                          className="mt-3 flex items-center justify-between gap-1 border-t border-border/50 pt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-muted-foreground truncate max-w-[85px]">
                            {lead.assigned_executive_name || "Unassigned"}
                          </span>

                          <div className="flex items-center gap-1">
                            {lead.phone ? (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px] gap-1 border-primary/20 text-primary hover:bg-primary/5 shadow-2xs font-medium"
                                title={`Call ${lead.name || "Client"}`}
                              >
                                <a href={`tel:${lead.phone}`}>
                                  <Phone className="size-2.5" />
                                  <span>Call</span>
                                </a>
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                TG
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={() => setSelected(lead)}
                            >
                              Open
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* ── 📱 Mobile Responsive Cards (Visible on Phones < 768px) ── */}
          <div className="space-y-3 md:hidden">
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`m-skel-${i}`}
                  className="animate-pulse rounded-2xl border border-border/50 bg-card p-4 space-y-3 shadow-xs"
                >
                  <div className="flex justify-between items-center">
                    <div className="h-4.5 w-32 rounded-lg bg-muted/60" />
                    <div className="h-5 w-20 rounded-full bg-muted/50" />
                  </div>
                  <div className="h-3.5 w-48 rounded-lg bg-muted/40" />
                  <div className="flex gap-2 pt-2 border-t border-border/40">
                    <div className="h-11 flex-1 rounded-xl bg-muted/50" />
                    <div className="h-11 flex-1 rounded-xl bg-muted/50" />
                  </div>
                </div>
              ))}

            {!loading && rows.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center bg-card/60">
                <Search className="mx-auto size-6 text-muted-foreground mb-2" />
                <p className="text-xs font-semibold text-foreground">No leads found</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Try clearing your search or filter tags.
                </p>
              </div>
            )}

            {!loading &&
              rows.map((lead) => (
                <div
                  key={`m-${lead.lead_id}`}
                  className="rounded-2xl border border-border/50 bg-card p-4 shadow-xs space-y-3 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4
                        className="font-bold text-sm text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                        onClick={() => setSelected(lead)}
                      >
                        {lead.name || "Unnamed Client"}
                      </h4>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <span className="font-medium text-foreground/80">{lead.assigned_executive_name || "Unassigned"}</span>
                        <span>·</span>
                        <span className="font-mono text-[11px]">{lead.phone || `TG:${lead.lead_id}`}</span>
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge value={lead.status} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-muted/40 rounded-xl px-3 py-2 border border-border/40">
                    <div className="truncate font-medium text-foreground">
                      {lead.selected_property_name ? (
                        <span className="flex items-center gap-1.5">
                          <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{lead.selected_property_name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">No property selected</span>
                      )}
                    </div>
                    <span className="font-bold text-foreground tabular-nums shrink-0 ml-2">
                      {formatMoney(lead.budget)}
                    </span>
                  </div>

                  {/* 44pt Touch Targets for iOS/Mobile Ergonomics */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                    {lead.phone ? (
                      <>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="apple-button min-h-[44px] h-11 flex-1 gap-2 text-xs font-semibold rounded-xl border-border/60 bg-card hover:bg-muted/60 shadow-2xs"
                        >
                          <a href={`tel:${lead.phone}`}>
                            <Phone className="size-3.5 text-primary" /> Call
                          </a>
                        </Button>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="apple-button min-h-[44px] h-11 flex-1 gap-2 text-xs font-semibold rounded-xl border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 shadow-2xs"
                        >
                          <a
                            href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Send className="size-3.5" /> WhatsApp
                          </a>
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="default"
                      className="apple-button min-h-[44px] h-11 px-4 text-xs font-semibold rounded-xl shadow-2xs"
                      onClick={() => setSelected(lead)}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              ))}
          </div>

          {/* ── 💻 Apple Inset Grouped Table View (Desktop & Tablet >= 768px) ── */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xs">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 border-b border-border/40 hover:bg-muted/30">
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Customer</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Executive</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Phone</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">AI Bot</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Selected Property</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Budget</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Created</TableHead>
                    <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`skeleton-${i}`} className="animate-pulse border-b border-border/30">
                        <TableCell><div className="h-4 w-28 rounded-lg bg-muted/60" /></TableCell>
                        <TableCell><div className="h-4 w-20 rounded-lg bg-muted/50" /></TableCell>
                        <TableCell><div className="h-4 w-24 rounded-lg bg-muted/50" /></TableCell>
                        <TableCell><div className="h-5 w-20 rounded-full bg-muted/60" /></TableCell>
                        <TableCell><div className="h-5 w-24 rounded-full bg-muted/50" /></TableCell>
                        <TableCell><div className="h-4 w-32 rounded-lg bg-muted/50" /></TableCell>
                        <TableCell><div className="h-4 w-16 rounded-lg bg-muted/50" /></TableCell>
                        <TableCell><div className="h-4 w-16 rounded-lg bg-muted/50" /></TableCell>
                        <TableCell className="text-right"><div className="ml-auto h-7 w-20 rounded-lg bg-muted/60" /></TableCell>
                      </TableRow>
                    ))}
                  {!loading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-14 text-center">
                        <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                          <div className="mb-2.5 flex size-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                            <Search className="size-4" />
                          </div>
                          <h4 className="text-sm font-semibold text-foreground">No leads match filters</h4>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Try adjusting your search query, status, or date filters.
                          </p>
                          {(search || status !== ALL || executive !== ALL || source !== ALL || actionFilter !== "ALL") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="apple-button mt-3 h-8 rounded-lg text-xs"
                              onClick={() => {
                                setSearch("");
                                setStatus(ALL);
                                setExecutive(lockedExecutive ?? ALL);
                                setSource(ALL);
                                setActionFilter("ALL");
                              }}
                            >
                              Reset filters
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((lead) => (
                    <TableRow key={lead.lead_id} className="border-b border-border/30 hover:bg-muted/35 transition-colors">
                      <TableCell className="font-semibold text-foreground py-3.5">{lead.name || "Unnamed"}</TableCell>
                      <TableCell className="py-3.5">
                        {lead.assigned_executive_name ? (
                          <button
                            className="font-medium text-primary hover:underline"
                            onClick={() => setProfile(lead.assigned_executive_name)}
                          >
                            {lead.assigned_executive_name}
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-xs">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground py-3.5">
                        {lead.phone ? (
                          <span className="font-mono text-xs tabular-nums">{lead.phone}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/60 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800 font-mono">
                            TG: {lead.lead_id}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <div className="flex flex-col gap-1 items-start">
                          <StatusBadge value={lead.status} />
                          {lead.property_state === "HUMAN_HANDOVER" && (
                            <PropertyStateBadge value="HUMAN_HANDOVER" />
                          )}
                          {lead.pre_visit_reminder_sent && (
                            <span className="text-[10px] text-muted-foreground font-medium">
                              ⏰ Reminder Sent
                            </span>
                          )}
                          {lead.post_visit_feedback_sent && (
                            <span className="text-[10px] text-muted-foreground font-medium">
                              💬 Survey Sent
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!lead.bot_active}
                            aria-label="Toggle AI bot"
                            onCheckedChange={(v) =>
                              update.mutate({
                                leadId: lead.lead_id,
                                values: { bot_active: v },
                                message: v ? "AI bot activated" : "AI bot paused",
                                lead,
                                action: "BOT_TOGGLED",
                              })
                            }
                          />
                          <ToneBadge
                            tone={lead.bot_active ? "green" : "gray"}
                            label={lead.bot_active ? "AI Active" : "AI Paused"}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5">{lead.selected_property_name || "—"}</TableCell>
                      <TableCell className="font-bold tabular-nums py-3.5">{formatMoney(lead.budget)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs tabular-nums py-3.5">
                        {formatDate(lead.created_at)}
                      </TableCell>
                      <TableCell className="text-right py-3.5">
                        <div className="flex justify-end items-center gap-1.5">
                          <Button asChild size="sm" variant="outline" className="apple-button h-8 rounded-lg gap-1.5 shadow-2xs" disabled={!lead.phone}>
                            <a href={`tel:${lead.phone ?? ""}`}>
                              <Phone className="size-3.5 text-primary" />
                              <span>Call</span>
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="apple-button h-8 rounded-lg text-xs"
                            onClick={() => setSelected(lead)}
                          >
                            Open
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      <LeadDrawer
        lead={selected ? (leads.find((l) => l.lead_id === selected.lead_id) ?? selected) : null}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        activity={selected ? activity.filter((a) => a.lead_id === selected.lead_id) : []}
      />

      <ExecutiveDrawer
        name={profile}
        leads={leads}
        activity={activity}
        period={profilePeriod}
        onPeriodChange={setProfilePeriod}
        open={!!profile}
        onOpenChange={(v) => !v && setProfile(null)}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  render,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render?: (v: string) => string;
  allLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="min-w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {render ? render(o) : o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
