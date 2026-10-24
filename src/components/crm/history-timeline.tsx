import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  History,
  PhoneCall,
  RotateCcw,
  Search,
  Sparkles,
  Trophy,
  UserCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  actionLabel,
  formatDate,
  formatRelativeTime,
  groupActivityByDate,
  type Activity,
  type ActorType,
} from "@/lib/crm";

interface HistoryTimelineProps {
  activity: Activity[];
}

type ActorFilter = "ALL" | "SALES_REP" | "AI_BOT";

function getActionIcon(action?: string, actorType?: ActorType) {
  const act = (action || "").toUpperCase();
  if (act.includes("CALL") || act === "CALL_LOGGED" || act === "CALL_NOT_ANSWERED") {
    return { icon: PhoneCall, color: "text-blue-500", bg: "bg-blue-500/15" };
  }
  if (act.includes("WON") || act.includes("DEAL")) {
    return { icon: Trophy, color: "text-amber-500", bg: "bg-amber-500/15" };
  }
  if (act.includes("TAKEOVER") || act.includes("ASSIGN")) {
    return { icon: UserCheck, color: "text-purple-500", bg: "bg-purple-500/15" };
  }
  if (act.includes("VISIT")) {
    return { icon: CalendarCheck, color: "text-emerald-500", bg: "bg-emerald-500/15" };
  }
  if (act.includes("NOTE") || act.includes("UPDATE") || act.includes("PHONE")) {
    return { icon: FileText, color: "text-indigo-500", bg: "bg-indigo-500/15" };
  }
  if (actorType === "AI_BOT" || act.includes("BOT") || act.includes("SWEEP") || act.includes("MESSAGE")) {
    return { icon: Sparkles, color: "text-teal-500", bg: "bg-teal-500/15" };
  }
  return { icon: RotateCcw, color: "text-muted-foreground", bg: "bg-muted/60" };
}

export function HistoryTimeline({ activity = [] }: HistoryTimelineProps) {
  const [actorFilter, setActorFilter] = useState<ActorFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 1. Sort descending by created_at
  const sorted = useMemo(() => {
    return activity
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activity]);

  // 2. Metrics calculation
  const counts = useMemo(() => {
    let salesCount = 0;
    let aiCount = 0;
    let callsCount = 0;
    let notesCount = 0;

    for (const item of sorted) {
      if (item.actor_type === "SALES_REP") {
        salesCount++;
        const act = (item.action || "").toUpperCase();
        if (act.includes("CALL")) callsCount++;
        if (act.includes("NOTE") || item.note) notesCount++;
      } else {
        aiCount++;
      }
    }

    return {
      total: sorted.length,
      salesCount,
      aiCount,
      callsCount,
      notesCount,
    };
  }, [sorted]);

  // 3. Filter by Actor & Search Query
  const filtered = useMemo(() => {
    return sorted.filter((item) => {
      // Actor filter
      if (actorFilter === "SALES_REP" && item.actor_type !== "SALES_REP") return false;
      if (actorFilter === "AI_BOT" && item.actor_type === "SALES_REP") return false;

      // Text search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const summary = (item.short_summary || "").toLowerCase();
        const action = (item.action || "").toLowerCase();
        const label = (item.actor_label || item.executive_name || "").toLowerCase();
        const note = (item.note || item.details || "").toLowerCase();
        const field = (item.field || "").toLowerCase();
        if (
          !summary.includes(q) &&
          !action.includes(q) &&
          !label.includes(q) &&
          !note.includes(q) &&
          !field.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [sorted, actorFilter, searchQuery]);

  // 4. Group by Date
  const dateGroups = useMemo(() => {
    return groupActivityByDate(filtered);
  }, [filtered]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center p-4 rounded-2xl border border-dashed border-border/80 bg-muted/15">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-2 shadow-2xs">
          <History className="size-5" />
        </div>
        <p className="text-xs font-semibold text-foreground">No action history recorded yet</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs leading-relaxed">
          Both human sales rep actions (calls, notes, assignments) and automated AI bot actions will be audited here in chronological order.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Segmented Control Filter (Apple HIG Style) ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex p-1 bg-muted/60 dark:bg-muted/30 rounded-xl border border-border/40 gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActorFilter("ALL")}
            className={`apple-button px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
              actorFilter === "ALL"
                ? "bg-card text-foreground shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>All Actions</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted/80 font-mono tabular-nums">
              {counts.total}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActorFilter("SALES_REP")}
            className={`apple-button px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
              actorFilter === "SALES_REP"
                ? "bg-blue-600 text-white shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>👤 Sales Rep</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                actorFilter === "SALES_REP" ? "bg-white/20 text-white" : "bg-muted/80 text-muted-foreground"
              }`}
            >
              {counts.salesCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActorFilter("AI_BOT")}
            className={`apple-button px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
              actorFilter === "AI_BOT"
                ? "bg-teal-600 text-white shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>🤖 AI Bot</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                actorFilter === "AI_BOT" ? "bg-white/20 text-white" : "bg-muted/80 text-muted-foreground"
              }`}
            >
              {counts.aiCount}
            </span>
          </button>
        </div>

        {/* ── KPI Ribbon Strip ── */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
          {counts.callsCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
              <PhoneCall className="size-3" /> {counts.callsCount} {counts.callsCount === 1 ? "Call" : "Calls"}
            </span>
          )}
          {counts.notesCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium">
              <FileText className="size-3" /> {counts.notesCount} {counts.notesCount === 1 ? "Note" : "Notes"}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 font-mono text-[10px] text-muted-foreground">
            <Clock className="size-3" /> {formatRelativeTime(sorted[0]?.created_at)}
          </span>
        </div>
      </div>

      {/* ── Search Input (Shown when more than 5 actions exist) ── */}
      {sorted.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action, rep name, or notes..."
            className="h-8 pl-8 pr-7 text-xs bg-muted/20 rounded-lg border-border/50 focus-visible:ring-1"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      {/* ── Filtered Empty State ── */}
      {filtered.length === 0 && (
        <div className="py-8 text-center p-4 rounded-xl border border-dashed border-border/60 bg-muted/10">
          <p className="text-xs font-semibold text-foreground">No matching actions</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {actorFilter === "SALES_REP"
              ? "No human sales rep actions recorded yet. Use Quick Actions below to log a call or note."
              : actorFilter === "AI_BOT"
              ? "No automated bot interactions match this filter."
              : "Try clearing your search query."}
          </p>
        </div>
      )}

      {/* ── Compact Grouped Timeline List ── */}
      <div className="space-y-3.5">
        {dateGroups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            {/* Date Group Header */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-[10px] text-muted-foreground font-mono">
                {group.items.length}
              </span>
            </div>

            {/* Compact Action Rows */}
            <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/40 overflow-hidden shadow-2xs">
              {group.items.map((item) => {
                const isSalesRep = item.actor_type === "SALES_REP";
                const { icon: ActionIcon, color, bg } = getActionIcon(item.action, item.actor_type);
                const isExpanded = expandedIds.has(item.id);
                const hasDetails = Boolean(item.details || item.note || item.field);

                return (
                  <div
                    key={item.id}
                    className={`transition-colors ${
                      hasDetails ? "cursor-pointer hover:bg-muted/30" : ""
                    } ${isExpanded ? "bg-muted/20" : ""}`}
                    onClick={() => hasDetails && toggleExpand(item.id)}
                  >
                    {/* Row Header (Compact Height ~40px) */}
                    <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      {/* Left: Micro Actor Icon */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`size-6.5 shrink-0 flex items-center justify-center rounded-lg ${bg} ${color} shadow-2xs`}
                          title={isSalesRep ? "Human Sales Representative" : "Automated AI Engine"}
                        >
                          <ActionIcon className="size-3.5" />
                        </div>

                        {/* Title & Actor Tag */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-foreground truncate">
                              {item.short_summary || actionLabel(item.action)}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0 rounded font-medium ${
                                isSalesRep
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
                                  : "bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20"
                              }`}
                            >
                              {item.actor_label || (isSalesRep ? "👤 Sales" : "🤖 Bot")}
                            </span>
                          </div>

                          {/* Secondary Diff Pill (If single line field change) */}
                          {item.field && !isExpanded && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono truncate mt-0.5">
                              <span className="font-medium">{item.field}:</span>
                              {item.old_value && (
                                <>
                                  <span className="line-through opacity-70">{item.old_value}</span>
                                  <ArrowRight className="size-2.5 shrink-0" />
                                </>
                              )}
                              <span className="font-semibold text-primary">{item.new_value || "Updated"}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Timestamp & Chevron */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="text-[10px] text-muted-foreground font-mono tabular-nums whitespace-nowrap"
                          title={formatDate(item.created_at)}
                        >
                          {formatRelativeTime(item.created_at)}
                        </span>
                        {hasDetails && (
                          <div className="text-muted-foreground/70">
                            {isExpanded ? (
                              <ChevronUp className="size-3.5" />
                            ) : (
                              <ChevronDown className="size-3.5" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expandable Details Drawer (Progressive Disclosure) */}
                    {isExpanded && hasDetails && (
                      <div className="px-3 pb-2.5 pt-0.5 space-y-2 border-t border-border/30 bg-muted/30 text-xs">
                        {item.field && (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground pt-1.5">
                            <span className="font-semibold text-foreground">{item.field}:</span>
                            {item.old_value && (
                              <>
                                <span className="line-through opacity-70">{item.old_value}</span>
                                <ArrowRight className="size-3 shrink-0" />
                              </>
                            )}
                            <span className="font-semibold text-primary">{item.new_value || "Updated"}</span>
                          </div>
                        )}

                        {(item.details || item.note) && (
                          <div className="p-2 rounded-lg border border-border/50 bg-card/80 text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                            {item.details || item.note}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono pt-0.5">
                          <span>Recorded by {item.actor_label || item.executive_name || "System"}</span>
                          <span>{formatDate(item.created_at)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
