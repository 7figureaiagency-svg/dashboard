import React from "react";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Phone,
  PhoneCall,
  RotateCcw,
  Sparkles,
  Trophy,
  User,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { actionLabel, formatDate, type Activity } from "@/lib/crm";

interface HistoryTimelineProps {
  activity: Activity[];
}

function getActionMeta(action?: string) {
  const act = (action || "").toUpperCase();
  if (act.includes("CALL") || act === "CALL_LOGGED") {
    return { icon: PhoneCall, color: "text-blue-500", bg: "bg-blue-500/10" };
  }
  if (act.includes("WON") || act.includes("DEAL")) {
    return { icon: Trophy, color: "text-amber-500", bg: "bg-amber-500/10" };
  }
  if (act.includes("TAKEOVER") || act.includes("ASSIGN")) {
    return { icon: UserCheck, color: "text-purple-500", bg: "bg-purple-500/10" };
  }
  if (act.includes("VISIT")) {
    return { icon: CalendarCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" };
  }
  if (act.includes("NOTE") || act.includes("UPDATE")) {
    return { icon: FileText, color: "text-indigo-500", bg: "bg-indigo-500/10" };
  }
  if (act.includes("BOT") || act.includes("SWEEP")) {
    return { icon: Sparkles, color: "text-teal-500", bg: "bg-teal-500/10" };
  }
  return { icon: RotateCcw, color: "text-muted-foreground", bg: "bg-muted" };
}

export function HistoryTimeline({ activity = [] }: HistoryTimelineProps) {
  const sorted = React.useMemo(() => {
    return activity
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activity]);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center p-4 rounded-xl border border-dashed border-border/80 bg-muted/20">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-2">
          <History className="size-5" />
        </div>
        <p className="text-xs font-semibold text-foreground">No executive actions logged yet</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
          Executive calls, status updates, notes, and takeover actions will be audited here in chronological order.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Summary Pill ── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-1">
        <span>Recorded Actions ({sorted.length})</span>
        <span>Latest: {formatDate(sorted[0].created_at)}</span>
      </div>

      {/* ── Vertical Timeline ── */}
      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
        {sorted.map((item) => {
          const { icon: ActionIcon, color, bg } = getActionMeta(item.action);
          const isSystem = !item.executive_name || item.executive_name === "System";

          return (
            <div key={item.id} className="relative group">
              {/* Timeline Icon Node */}
              <div
                className={`absolute -left-6 top-1 flex size-5.5 items-center justify-center rounded-full ring-4 ring-background shadow-xs ${bg} ${color}`}
              >
                <ActionIcon className="size-3" />
              </div>

              {/* Action Card */}
              <div className="p-3 rounded-xl border border-border/60 bg-card shadow-2xs hover:border-border transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-foreground">
                        {actionLabel(item.action)}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-muted/40 font-medium"
                      >
                        {isSystem ? "🤖 Automated Engine" : `👤 ${item.executive_name}`}
                      </Badge>
                    </div>

                    {item.field && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 font-mono">
                        <span className="font-semibold text-foreground">{item.field}:</span>
                        <span className="line-through opacity-70">{item.old_value || "None"}</span>
                        <ArrowRight className="size-3 shrink-0" />
                        <span className="font-semibold text-primary">{item.new_value || "None"}</span>
                      </p>
                    )}
                  </div>

                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono tabular-nums">
                    {formatDate(item.created_at)}
                  </span>
                </div>

                {item.note && (
                  <div className="mt-2 text-xs italic text-foreground/90 bg-muted/40 dark:bg-muted/20 p-2 rounded-lg border border-border/40">
                    "{item.note}"
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
