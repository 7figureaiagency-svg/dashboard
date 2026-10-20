import React from "react";
import {
  Building2,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck2,
  FileText,
  Home,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Share2,
  Sparkles,
  Tag,
  Trophy,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatMoney,
  isVisitBookedStatus,
  isVisitDoneStatus,
  type Lead,
  type Property,
} from "@/lib/crm";

interface WorkflowTimelineProps {
  lead: Lead;
  matchingProperties?: Property[];
  onSelectProperty?: (propName: string) => void;
}

interface StepItem {
  id: number;
  title: string;
  subtitle: string;
  status: "completed" | "current" | "upcoming";
  timestamp?: string | null;
  icon: React.ElementType;
  details?: React.ReactNode;
}

export function WorkflowTimeline({
  lead,
  matchingProperties = [],
  onSelectProperty,
}: WorkflowTimelineProps) {
  const isOwner =
    lead.lead_type === "PROVIDER" ||
    lead.property_state?.startsWith("OWNER_") ||
    lead.status === "OWNER_LISTING";

  // Build Seeker Workflow Steps
  const seekerSteps: StepItem[] = [
    {
      id: 1,
      title: "Lead Ingestion & Role Qualified",
      subtitle: `Ingested via ${lead.source || "WhatsApp / Telegram"}`,
      status: "completed",
      timestamp: lead.created_at,
      icon: MessageSquare,
      details: (
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge variant="outline" className="text-[11px] bg-muted/50">
            Channel: {lead.source || "Direct WhatsApp"}
          </Badge>
          {lead.user_language && (
            <Badge variant="outline" className="text-[11px] bg-muted/50">
              Language: {lead.user_language}
            </Badge>
          )}
          <Badge variant="outline" className="text-[11px] bg-blue-500/10 text-blue-600 border-blue-200">
            Buyer / Seeker
          </Badge>
        </div>
      ),
    },
    {
      id: 2,
      title: "Search Criteria Captured",
      subtitle:
        lead.property_type || lead.location || lead.budget
          ? "Target configuration, location, and budget qualified"
          : "Collecting preferences from buyer",
      status:
        lead.property_type && lead.budget
          ? "completed"
          : lead.property_type || lead.location
          ? "current"
          : "upcoming",
      icon: Compass,
      details: (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2.5 p-2.5 rounded-lg bg-card border border-border/50 text-xs">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Config</span>
            <span className="font-medium text-foreground">{lead.property_type || "Not specified"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Locality</span>
            <span className="font-medium text-foreground">{lead.location || "Flexible"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Budget</span>
            <span className="font-semibold text-primary">{formatMoney(lead.budget) || "Any budget"}</span>
          </div>
          {lead.purpose && (
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Purpose</span>
              <span className="font-medium text-foreground">{lead.purpose}</span>
            </div>
          )}
          {lead.timeline && (
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Timeline</span>
              <span className="font-medium text-foreground">{lead.timeline}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 3,
      title: "Inventory Matches Dispatched",
      subtitle: lead.selected_property_name
        ? `Client selected: ${lead.selected_property_name}`
        : matchingProperties.length > 0
        ? `${matchingProperties.length} verified inventory options matched`
        : "Matching inventory options in progress",
      status: lead.selected_property_name
        ? "completed"
        : matchingProperties.length > 0
        ? "current"
        : "upcoming",
      icon: Home,
      details: (
        <div className="mt-2.5 space-y-2">
          {lead.selected_property_name && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                <span>Selected: <strong>{lead.selected_property_name}</strong></span>
              </div>
              {lead.selected_property_price && (
                <span className="font-semibold">{formatMoney(lead.selected_property_price)}</span>
              )}
            </div>
          )}

          {matchingProperties.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground block">
                Top Matched Inventory:
              </span>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {matchingProperties.slice(0, 2).map((p) => (
                  <div
                    key={p.id}
                    className="p-2 rounded-md border border-border/60 bg-card hover:border-primary/40 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <h5 className="font-semibold text-xs text-foreground truncate">{p.project_name}</h5>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate">{p.location}</span> · {p.configuration}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/40">
                      <span className="text-xs font-bold text-primary">{formatMoney(p.price)}</span>
                      {onSelectProperty && (
                        <button
                          type="button"
                          onClick={() => onSelectProperty(p.project_name)}
                          className="text-[10px] text-primary hover:underline font-medium"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 4,
      title: "Site Visit Scheduled",
      subtitle: lead.site_visit_datetime
        ? `Scheduled for ${formatDate(lead.site_visit_datetime)}`
        : "Awaiting client visit confirmation",
      status: lead.site_visit_datetime || isVisitBookedStatus(lead.status)
        ? "completed"
        : "upcoming",
      timestamp: lead.site_visit_datetime,
      icon: CalendarCheck,
      details: lead.site_visit_datetime ? (
        <div className="mt-2.5 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs space-y-1.5">
          <div className="flex items-center justify-between text-blue-900 dark:text-blue-200 font-semibold">
            <span>📅 {formatDate(lead.site_visit_datetime)}</span>
            <Badge variant="outline" className="bg-white/80 dark:bg-black/40 text-[10px] text-blue-700 dark:text-blue-300">
              {lead.assigned_executive_name ? `Assigned to ${lead.assigned_executive_name}` : "Pending Assignment"}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-blue-800 dark:text-blue-300">
            <span>Reminder: {lead.pre_visit_reminder_sent ? "✅ Sent" : "⏳ Pending"}</span>
            <span>Feedback: {lead.post_visit_feedback_sent ? "✅ Collected" : "⏳ Scheduled"}</span>
          </div>
        </div>
      ) : null,
    },
    {
      id: 5,
      title: "Closure & Deal Won",
      subtitle:
        lead.status === "DEAL_WON"
          ? "Deal closed successfully! 🏆"
          : isVisitDoneStatus(lead.status)
          ? "Visit completed — follow-up & negotiation in progress"
          : "Final negotiation & agreement",
      status: lead.status === "DEAL_WON" ? "completed" : isVisitDoneStatus(lead.status) ? "current" : "upcoming",
      icon: Trophy,
    },
  ];

  // Build Owner Workflow Steps
  const ownerSteps: StepItem[] = [
    {
      id: 1,
      title: "Owner Property Listing Initiated",
      subtitle: `Property registration started via ${lead.source || "WhatsApp / Telegram"}`,
      status: "completed",
      timestamp: lead.created_at,
      icon: Home,
      details: (
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge variant="outline" className="text-[11px] bg-purple-500/10 text-purple-600 border-purple-200">
            Property Provider / Owner
          </Badge>
          <Badge variant="outline" className="text-[11px] bg-muted/50">
            Direct Ingestion
          </Badge>
        </div>
      ),
    },
    {
      id: 2,
      title: "Property Specifications Recorded",
      subtitle:
        lead.property_type || lead.location
          ? "Type, society, and area specifications gathered"
          : "Collecting property parameters",
      status:
        lead.property_type && (lead.location || lead.selected_property_name)
          ? "completed"
          : "current",
      icon: Building2,
      details: (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2.5 p-2.5 rounded-lg bg-card border border-border/50 text-xs">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Type</span>
            <span className="font-semibold text-foreground">{lead.property_type || "Private Property"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Society / Project</span>
            <span className="font-medium text-foreground">{lead.selected_property_name || "Tribhuvandham Society"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Locality / City</span>
            <span className="font-medium text-foreground">{lead.location || "Vadodara"}</span>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      title: "Expected Demand & Furnishing Status",
      subtitle: lead.budget
        ? `Owner Demand: ${formatMoney(lead.budget)}`
        : "Asking price and possession status",
      status: lead.budget ? "completed" : "current",
      icon: Wallet,
      details: (
        <div className="flex flex-wrap items-center gap-2 mt-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs">
          <span className="text-emerald-900 dark:text-emerald-200 font-bold text-sm">
            💰 Expected: {formatMoney(lead.budget) || "₹1.25 Cr (1,25,00,000)"}
          </span>
          <Badge variant="outline" className="bg-white/80 dark:bg-black/40 text-emerald-800 dark:text-emerald-300">
            Ready to Move
          </Badge>
          <Badge variant="outline" className="bg-white/80 dark:bg-black/40 text-emerald-800 dark:text-emerald-300">
            Furnished
          </Badge>
        </div>
      ),
    },
    {
      id: 4,
      title: "Physical Inspection & Document Verification",
      subtitle:
        lead.state === "OWNER_DETAILS_GATHERED" || lead.assigned_executive_name
          ? "Verified phone contact — assigned to acquisition manager"
          : "On-site visit and document verification scheduling",
      status: lead.state === "OWNER_DETAILS_GATHERED" ? "completed" : "current",
      icon: UserCheck,
      details: (
        <div className="mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-md">
          {lead.assigned_executive_name
            ? `Assigned acquisition officer: ${lead.assigned_executive_name}`
            : "Acquisition team alerted: Schedule photography & document check."}
        </div>
      ),
    },
    {
      id: 5,
      title: "Live Inventory Listing & Active Buyer Matching",
      subtitle: "Published to NextGen CRM Inventory & live buyer matchmaking",
      status: lead.status === "DEAL_WON" ? "completed" : "upcoming",
      icon: Trophy,
    },
  ];

  const steps = isOwner ? ownerSteps : seekerSteps;
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="space-y-4">
      {/* ── Progress Bar Header ── */}
      <div className="p-3.5 rounded-xl border border-border/60 bg-card shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isOwner ? "Owner Intake Pipeline" : "Buyer Qualification Pipeline"}
            </h4>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              Stage {Math.min(completedCount + 1, 5)} of 5 · {progressPercent}% Completed
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {isOwner ? "🏡 Property Listing" : "🎯 Buyer Journey"}
          </span>
        </div>

        {/* Progress Track */}
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-[#008069] dark:bg-[#00A884] h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ── Interactive Vertical Stepper ── */}
      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/60">
        {steps.map((step) => {
          const isDone = step.status === "completed";
          const isCurrent = step.status === "current";
          const StepIcon = step.icon;

          return (
            <div key={step.id} className="relative group">
              {/* Step Marker Node */}
              <div
                className={`absolute -left-6 top-0.5 flex size-5.5 items-center justify-center rounded-full ring-4 ring-background text-[11px] font-bold shadow-xs transition-colors ${
                  isDone
                    ? "bg-[#008069] text-white"
                    : isCurrent
                    ? "bg-primary text-primary-foreground animate-pulse"
                    : "bg-muted text-muted-foreground border border-border/80"
                }`}
              >
                {isDone ? <Check className="size-3 stroke-[3]" /> : step.id}
              </div>

              {/* Step Card Body */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  isDone
                    ? "border-border/60 bg-card shadow-2xs"
                    : isCurrent
                    ? "border-primary/50 bg-primary/5 shadow-xs"
                    : "border-border/30 bg-muted/20 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <StepIcon className={`size-3.5 ${isDone ? "text-[#008069]" : isCurrent ? "text-primary" : "text-muted-foreground"}`} />
                      <h4 className="text-xs font-bold text-foreground">{step.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{step.subtitle}</p>
                  </div>

                  {step.timestamp && (
                    <span className="text-[10px] text-muted-foreground/80 shrink-0 font-mono tabular-nums">
                      {formatDate(step.timestamp)}
                    </span>
                  )}
                </div>

                {step.details}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
