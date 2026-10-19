import { useEffect, useMemo, useState } from "react";
import {
  AlarmClockOff,
  Bot,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  History,
  MessageSquare,
  MessageSquareText,
  Phone,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
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
  AlertDialogFooter as DialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyStateBadge, StatusBadge, ToneBadge } from "@/components/crm/badges";
import { useInventory, useLeadEvents, useUpdateLead } from "@/lib/crm-data";
import {
  LEAD_STATUSES,
  STATUS_MAP,
  actionLabel,
  buildAiActivity,
  buildLeadSummary,
  contactResolution,
  formatDate,
  formatMoney,
  toNumber,
  type Activity,
  type Lead,
} from "@/lib/crm";

function PickOne({
  value,
  onChange,
  options,
  render,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render?: (v: string) => string;
}) {
  // If the current value exists but isn't in the options list (e.g. AI-parsed
  // free-text that doesn't match inventory exactly), include it so the field
  // displays the saved value rather than falling back to placeholder.
  const extraOption = value && !options.includes(value) ? value : null;
  const allOptions = extraOption ? [extraOption, ...options] : options;
  // Only pass `value` to Select when it's a known option — prevents stale
  // selections from persisting after filter changes invalidate them.
  const validValue = value && allOptions.includes(value) ? value : "";
  return (
    <Select {...(validValue ? { value: validValue } : {})} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {allOptions.length === 0 && (
          <SelectItem value="__none__" disabled>
            No options
          </SelectItem>
        )}
        {extraOption && (
          <SelectItem key={extraOption} value={extraOption} className="text-muted-foreground italic">
            {render ? render(extraOption) : extraOption}
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {render ? render(o) : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


export function LeadDrawer({
  lead,
  open,
  onOpenChange,
  activity = [],
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Executive/admin actions logged for this lead — timestamped, unlike the AI snapshot below. */
  activity?: Activity[];
}) {
  const update = useUpdateLead();
  const { data: inventory = [] } = useInventory();
  const uniq = (vals: (string | null)[]) =>
    Array.from(new Set(vals.filter((v): v is string => !!v))).sort();
  const locations = uniq(inventory.map((p) => p.location));
  const configurations = uniq(inventory.map((p) => p.configuration));
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<Lead>>({});

  // Reset local edits whenever a different lead is opened so stale profile
  // values from the previous lead don't bleed into the newly opened one.
  useEffect(() => {
    setProfile({});
  }, [lead?.lead_id]);

  // Filter projects by all live lead-profile fields: location, property_type, budget, requirement
  // These must be derived before the hooks below — hooks cannot come after an early return.
  const activeLocation = (profile.location !== undefined ? profile.location : lead?.location) as string | undefined;
  const activePropType = (profile.property_type !== undefined ? profile.property_type : lead?.property_type) as string | undefined;
  const activeBudget = toNumber(
    (profile.budget !== undefined ? profile.budget : lead?.budget) as never,
  );
  const activeRequirement = (
    profile.requirement !== undefined ? profile.requirement : lead?.requirement
  ) as string | undefined;

  // Memoised so useEffect below gets a stable reference to compare against.
  const projects = useMemo(
    () =>
      uniq(
        inventory
          .filter((p) => {
            if (activeLocation && p.location !== activeLocation) return false;
            if (activePropType && p.configuration !== activePropType) return false;
            // Map requirement → listing_type inline (requirementMatch closure isn't stable)
            if (activeRequirement) {
              const lt = (p.listing_type ?? "").toLowerCase();
              if (activeRequirement === "BUY" && !(lt === "sale" || lt === "for sale" || lt === "buy")) return false;
              if (activeRequirement === "RENT" && !(lt === "rent" || lt === "for rent" || lt === "lease")) return false;
            }
            // Budget: show properties at or below budget (20% headroom for negotiable)
            if (activeBudget && activeBudget > 0) {
              const ceiling = p.price_negotiable ? p.price * 0.8 : p.price;
              if (ceiling > activeBudget) return false;
            }
            return true;
          })
          .map((p) => p.project_name),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inventory, activeLocation, activePropType, activeBudget, activeRequirement],
  );

  // When filters change and the currently-selected property is no longer in
  // the filtered list, clear the selection so the dropdown resets to "Select…"
  useEffect(() => {
    if (!lead) return;
    const currentSel = String(profile.selected_property_name ?? lead.selected_property_name ?? "");
    if (currentSel && projects.length > 0 && !projects.includes(currentSel)) {
      setProfile((p) => ({ ...p, selected_property_name: "" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // Lead Events & Chat Messages (called unconditionally on every render)
  const { data: rawEvents = [], isLoading: eventsLoading } = useLeadEvents(lead?.lead_id);

  const chatMessages = useMemo(() => {
    if (!lead) return [];
    const list: Array<{ sender: "user" | "bot"; text: string; time: string; badge?: string }> = [];
    for (const ev of rawEvents) {
      const p = ev.payload || {};
      if (p.userText) {
        list.push({ sender: "user", text: p.userText, time: ev.created_at });
      }
      if (p.replySent || p.replyText) {
        list.push({
          sender: "bot",
          text: p.replySent || p.replyText,
          time: ev.created_at,
          badge: p.state || ev.event_type,
        });
      }
    }
    return list;
  }, [rawEvents, lead]);

  const matchingProperties = useMemo(() => {
    if (!inventory || inventory.length === 0 || !lead) return [];
    const loc = ((profile.location !== undefined ? profile.location : lead.location) || "").toLowerCase().trim();
    const budget = toNumber((profile.budget !== undefined ? profile.budget : lead.budget) as never);
    const cat = ((profile.property_type !== undefined ? profile.property_type : lead.property_type) || "").toLowerCase().trim();

    return inventory
      .filter((p) => {
        let score = 0;
        if (loc && (p.location?.toLowerCase().includes(loc) || loc.includes(p.location?.toLowerCase() || ""))) score += 3;
        if (cat && (p.configuration?.toLowerCase().includes(cat) || p.property_category?.toLowerCase().includes(cat))) score += 2;
        if (budget > 0 && p.price) {
          const diff = Math.abs(Number(p.price) - budget);
          if (diff / budget <= 0.3) score += 2;
        }
        return score > 0;
      })
      .slice(0, 4);
  }, [inventory, profile.location, profile.budget, profile.property_type, lead]);

  if (!lead) return null;
  const dropped = lead.status === "NOT_INTERESTED";
  const dealWon = lead.status === "DEAL_WON";
  // "closed" covers both dropped and deal-won — most actions disabled for both.
  const closed = dropped || dealWon;

  // Map lead requirement → inventory listing_type values
  const requirementMatch = (listingType: string | null): boolean => {
    if (!activeRequirement) return true;
    if (!listingType) return true;
    const lt = listingType.toLowerCase();
    if (activeRequirement === "BUY") return lt === "sale" || lt === "for sale" || lt === "buy";
    if (activeRequirement === "RENT") return lt === "rent" || lt === "for rent" || lt === "lease";
    return true;
  };

  const notes = String(
    (profile.executive_notes !== undefined ? profile.executive_notes : lead.executive_notes) ?? "",
  ).trim();
  const field = <K extends keyof Lead>(key: K): Lead[K] =>
    (profile[key] !== undefined ? profile[key] : lead[key]) as Lead[K];
  const set = (key: keyof Lead, value: unknown) => setProfile((p) => ({ ...p, [key]: value }));

  const run = (values: Partial<Lead>, message: string, action: string) =>
    update.mutate({ leadId: lead.lead_id, values, message, lead, action, note: notes || null });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full w-full p-0 sm:max-w-xl overflow-hidden">
        {/* ── 📱 iOS Sheet Grabber ── */}
        <div className="w-9 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

        {/* ── Scrollable Inspector Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <SheetHeader className="text-left space-y-1.5">
            <SheetTitle className="text-xl font-bold tracking-tight text-foreground">{lead.name || "Unnamed lead"}</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {lead.phone || "No phone"} · Created {formatDate(lead.created_at)}
            </SheetDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              <StatusBadge value={lead.status} />
              <PropertyStateBadge value={lead.property_state} />
            </div>
          </SheetHeader>
          {closed && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {dealWon
                ? "Deal won — this lead is closed. Use Revert below if you need to reopen it."
                : "This lead is dropped. Most actions are disabled — use Revert Lead below to reactivate."}
            </p>
          )}

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="size-4" /> AI Conversation summary
            </h3>
            <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground leading-relaxed">
              {buildLeadSummary(lead)}
            </p>
          </section>

          <Separator />

          <Tabs defaultValue="ai">
            <TabsList className="w-full">
              <TabsTrigger value="ai" className="flex flex-1 items-center gap-1.5 text-xs">
                <Bot className="size-3.5" /> Workflow
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex flex-1 items-center gap-1.5 text-xs">
                <MessageSquare className="size-3.5" /> Chat Messages ({chatMessages.length})
              </TabsTrigger>
              <TabsTrigger value="exec" className="flex flex-1 items-center gap-1.5 text-xs">
                <History className="size-3.5" /> History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                What the automated workflow has done on this lead so far — reflects current state,
                not a message-by-message log.
              </p>
              <ul className="space-y-2">
                {buildAiActivity(lead).map((event) => (
                  <li
                    key={event.key}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-card p-2.5"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{event.label}</p>
                      {event.detail && (
                        <p className="text-xs text-muted-foreground">{event.detail}</p>
                      )}
                      {event.timestamp && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(event.timestamp)}
                        </p>
                      )}
                    </div>
                    <ToneBadge
                      label={event.done ? "Done" : "Pending"}
                      tone={event.done ? event.tone : "gray"}
                    />
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="chat" className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Actual conversation messages exchanged between the client and Nextgen AI Bot.
              </p>
              {eventsLoading && (
                <p className="py-6 text-center text-xs text-muted-foreground">Loading chat history…</p>
              )}
              {!eventsLoading && chatMessages.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">No chat messages recorded yet.</p>
              )}
              {!eventsLoading && chatMessages.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/20 p-3.5 max-h-[380px] overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${msg.sender === "user" ? "items-start" : "items-end"}`}
                    >
                      <span className="text-[10px] text-muted-foreground mb-1 px-1 font-medium">
                        {msg.sender === "user" ? (lead.name || lead.first_name || "Client") : "🤖 Nextgen AI Bot"}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs ${
                          msg.sender === "user"
                            ? "bg-muted/80 text-foreground border border-border/40 rounded-bl-xs"
                            : "bg-primary/10 text-primary border border-primary/20 rounded-br-xs"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                      </div>
                      <span className="text-[9px] text-muted-foreground/75 mt-1 px-1 font-mono tabular-nums">
                        {formatDate(msg.time)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="exec" className="mt-3 space-y-2">
              {activity.length === 0 ? (
                <p className="text-xs text-muted-foreground">No executive actions yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {activity
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                    )
                    .map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start gap-2 rounded-md border bg-card px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-sm font-medium">{actionLabel(a.action)}</span>
                            <span className="text-xs text-muted-foreground">
                              · {a.executive_name || "Unassigned"}
                            </span>
                          </div>
                          {a.field && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {a.field}: {a.old_value ?? "—"} → {a.new_value ?? "—"}
                            </p>
                          )}
                          {a.note && (
                            <p className="mt-0.5 text-xs italic text-muted-foreground">{a.note}</p>
                          )}
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(a.created_at)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Quick actions</h3>
            {notice && <p className="text-xs font-medium text-primary">{notice}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {/* ── Always available ── */}
              <Button asChild variant="outline" disabled={!lead.phone}>
                <a href={`tel:${lead.phone ?? ""}`}>
                  <Phone /> Call Now
                </a>
              </Button>
              <Button
                disabled={closed || update.isPending || !notes}
                onClick={() => {
                  run(
                    {
                      ...contactResolution(lead),
                      executive_notes: notes,
                      bot_active: false,
                    },
                    "Marked contacted — alert cleared",
                    "TAKEOVER",
                  );
                  setNotice("Chat taken over — bot paused and alert cleared.");
                }}
              >
                <UserCheck /> Mark Contacted / Takeover Chat
              </Button>

              {/* ── Call not answered: sets last_followup_at (1-msg/day anti-spam) ── */}
              <Button
                variant="outline"
                disabled={closed || update.isPending}
                onClick={() => {
                  run(
                    { last_followup_at: new Date().toISOString() },
                    "Call not answered — bot follow-up paused for today",
                    "CALL_NOT_ANSWERED",
                  );
                  setNotice("Bot follow-up paused for today.");
                }}
              >
                <AlarmClockOff /> Call Not Answered
              </Button>

              {/* ── Options Shared: triggers n8n OPTIONS_FEEDBACK drip ── */}
              {lead.status === "QUALIFIED" && (
                <Button
                  variant="outline"
                  disabled={closed || update.isPending}
                  onClick={() =>
                    run(
                      {
                        property_state: "PROPERTY_OPTIONS_SENT",
                        last_interaction_at: new Date().toISOString(),
                      },
                      "Property options shared with lead",
                      "OPTIONS_SHARED",
                    )
                  }
                >
                  <Send /> Options Shared
                </Button>
              )}

              {/* ── Site visit lifecycle buttons (only when a visit is booked) ── */}
              {(lead.status === "SITE_VISIT_BOOKED" || lead.status === "VISIT_BOOKED") && (
                <>
                  <Button
                    variant="outline"
                    disabled={closed || update.isPending}
                    onClick={() =>
                      run(
                        {
                          status: "VISIT_DONE",
                          property_state: "PROPERTY_SELECTED",
                          last_interaction_at: new Date().toISOString(),
                        },
                        "Site visit marked done",
                        "VISIT_DONE",
                      )
                    }
                  >
                    <CheckCircle2 /> Site Visit Done
                  </Button>
                  <Button
                    variant="outline"
                    disabled={closed || update.isPending}
                    onClick={() =>
                      run(
                        {
                          status: "VISIT_MISSED",
                          last_interaction_at: new Date().toISOString(),
                        },
                        "Site visit marked as missed",
                        "VISIT_MISSED",
                      )
                    }
                  >
                    <CalendarX /> Visit Missed
                  </Button>
                </>
              )}

              {/* ── Deal Won: excludes lead from all n8n follow-ups ── */}
              {!closed && !["NOT_INTERESTED", "DEAL_WON"].includes(lead.status ?? "") && (
                <Button
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() =>
                    run(
                      {
                        status: "DEAL_WON",
                        bot_active: false,
                        last_interaction_at: new Date().toISOString(),
                      },
                      "Deal marked as won",
                      "DEAL_WON",
                    )
                  }
                >
                  <Trophy /> Deal Won
                </Button>
              )}
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Book / reschedule site visit</h3>
            {lead.site_visit_datetime && (
              <p className="text-xs">
                <span className="crm-badge" data-tone="green">
                  Visit Scheduled
                </span>{" "}
                <span className="text-muted-foreground">{formatDate(lead.site_visit_datetime)}</span>
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="visit-date">Date</Label>
                <Input
                  id="visit-date"
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="visit-time">Time</Label>
                <Input
                  id="visit-time"
                  type="time"
                  value={visitTime}
                  onChange={(e) => setVisitTime(e.target.value)}
                />
              </div>
              <Button
                disabled={closed || !visitDate || !visitTime || update.isPending}
                onClick={() =>
                  run(
                    {
                      site_visit_datetime: `${visitDate} ${visitTime}`,
                      status: "SITE_VISIT_BOOKED",
                      property_state: "SITE_VISIT_BOOKED",
                      last_interaction_at: new Date().toISOString(),
                    },
                    "Site visit confirmed",
                    "VISIT_BOOKED",
                  )
                }
              >
                <CalendarCheck /> Confirm Visit
              </Button>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Lead profile</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* ── Filter funnel: each field narrows Selected property ── */}
              <div className="space-y-1">
                <Label>Requirement</Label>
                <PickOne
                  value={field("requirement") ?? ""}
                  onChange={(v) => set("requirement", v)}
                  options={["BUY", "RENT"]}
                />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <PickOne
                  value={field("location") ?? ""}
                  onChange={(v) => set("location", v)}
                  options={locations}
                />
              </div>
              <div className="space-y-1">
                <Label>Property type</Label>
                <PickOne
                  value={field("property_type") ?? ""}
                  onChange={(v) => set("property_type", v)}
                  options={configurations}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="budget">Budget</Label>
                <Input
                  id="budget"
                  value={String(field("budget") ?? "")}
                  onChange={(e) => set("budget", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {formatMoney(toNumber(field("budget") as never))}
                </p>
              </div>
              {/* ── Result: filtered property list ── */}
              <div className="space-y-1 sm:col-span-2">
                <Label>
                  Selected property{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({projects.length} available)
                  </span>
                </Label>
                <PickOne
                  value={field("selected_property_name") ?? ""}
                  onChange={(v) => set("selected_property_name", v)}
                  options={projects}
                />
              </div>
              {/* ── Lead metadata ── */}
              <div className="space-y-1">
                <Label>Purpose</Label>
                <PickOne
                  value={field("purpose") ?? ""}
                  onChange={(v) => set("purpose", v)}
                  options={["SELF_USE", "INVESTMENT"]}
                  render={(v) => (v === "SELF_USE" ? "Self use" : "Investment")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="timeline">Timeline</Label>
                <Input
                  id="timeline"
                  value={field("timeline") ?? ""}
                  onChange={(e) => set("timeline", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <PickOne
                  value={field("status") ?? ""}
                  onChange={(v) => set("status", v)}
                  options={LEAD_STATUSES}
                  render={(v) => STATUS_MAP[v]?.label ?? v}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="notes">
                  Executive notes <span style={{ color: "var(--tone-red)" }}>*</span>
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Required — what happened on this lead?"
                  value={field("executive_notes") ?? ""}
                  onChange={(e) => set("executive_notes", e.target.value)}
                />
                {!notes && (
                  <p className="text-xs text-muted-foreground">
                    Executive notes are required before you can save or clear the alert.
                  </p>
                )}
              </div>
            </div>
            <Button
              disabled={closed || update.isPending || !notes}
              onClick={() => {
                // When selected property changes, auto-assign the executive
                // who owns that property in the inventory.
                const selectedName = field("selected_property_name");
                const matchedProperty = selectedName
                  ? inventory.find(
                      (p) =>
                        p.project_name === selectedName &&
                        p.assigned_executive_id != null,
                    )
                  : null;

                run(
                  {
                    status: field("status"),
                    budget: toNumber(field("budget") as never),
                    location: field("location"),
                    property_type: field("property_type"),
                    purpose: field("purpose"),
                    requirement: field("requirement"),
                    timeline: field("timeline"),
                    selected_property_name: selectedName,
                    executive_notes: notes,
                    // Re-assign executive to whoever owns the selected property
                    ...(matchedProperty
                      ? { assigned_executive_id: matchedProperty.assigned_executive_id }
                      : {}),
                    ...contactResolution(lead),
                  },
                  "Lead updated successfully",
                  "PROFILE_UPDATED",
                );
              }}
            >
              <Save /> Save Updates
            </Button>
          </section>

          {/* ── ⚡ Realtor Matchmaker: Top Matching Inventory ── */}
          {matchingProperties.length > 0 && (
            <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.02] p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="size-4 text-primary" /> Top Matching Inventory ({matchingProperties.length})
                </h3>
                <span className="text-[11px] text-muted-foreground">Auto-matched from live units</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {matchingProperties.map((prop) => (
                  <div
                    key={prop.property_id}
                    className="flex flex-col justify-between rounded-lg border bg-card p-3 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-semibold text-sm leading-tight text-foreground">{prop.project_name}</p>
                        <span className="text-xs font-bold text-primary">{formatMoney(prop.price)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {prop.property_category} · {prop.configuration} · 📍 {prop.location}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs flex-1"
                        onClick={() => {
                          set("selected_property_name", prop.project_name);
                          toast.success(`Selected "${prop.project_name}" for this lead!`);
                        }}
                      >
                        Select Unit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Separator />

          <div className="flex flex-wrap gap-2">
            {closed ? (
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() =>
                  run(
                    {
                      status: "QUALIFYING",
                      bot_active: true,
                      last_interaction_at: new Date().toISOString(),
                    },
                    "Lead reverted to active",
                    "LEAD_REVERTED",
                  )
                }
              >
                <RotateCcw /> Revert Lead
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={update.isPending}
                onClick={() => setDropOpen(true)}
              >
                <Trash2 /> Drop Lead / Mark Junk
              </Button>
            )}
          </div>
        </div>

        {/* ── 📱 Persistent Sticky Frosted Action Bar (iOS Ergonomics) ── */}
        <div className="sticky bottom-0 z-20 apple-glass border-t border-border/40 p-3 sm:px-5 flex items-center gap-2.5 shrink-0">
          {lead.phone ? (
            <>
              <Button
                asChild
                size="sm"
                variant="default"
                className="apple-button flex-1 h-11 min-h-[44px] gap-2 rounded-xl text-xs font-semibold shadow-xs"
              >
                <a href={`tel:${lead.phone}`}>
                  <Phone className="size-4" /> Call Client
                </a>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="apple-button flex-1 h-11 min-h-[44px] gap-2 rounded-xl text-xs font-semibold border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 shadow-xs"
              >
                <a
                  href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageSquare className="size-4" /> WhatsApp
                </a>
              </Button>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center py-2 text-xs text-muted-foreground font-mono">
              Telegram ID: {lead.lead_id} (Direct calling unavailable)
            </div>
          )}
        </div>

        <AlertDialog open={dropOpen} onOpenChange={setDropOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to drop this lead?</AlertDialogTitle>
              <AlertDialogDescription>
                The lead will be marked as Closed/Dropped and further actions will be disabled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  run(
                    { status: "NOT_INTERESTED", rejection_reason: "Dropped manually" },
                    "Lead dropped",
                    "LEAD_DROPPED",
                  )
                }
              >
                Yes, drop lead
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
