import { useEffect, useMemo, useState } from "react";
import {
  AlarmClockOff,
  Bot,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  History,
  MessageSquareText,
  Phone,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Trophy,
  UserCheck,
} from "lucide-react";

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
import { useInventory, useUpdateLead } from "@/lib/crm-data";
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
  // Only pass `value` to Select when it's actually a valid option — if the
  // current value has been invalidated by a filter change, show placeholder.
  const validValue = value && options.includes(value) ? value : "";
  return (
    <Select {...(validValue ? { value: validValue } : {})} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 && (
          <SelectItem value="__none__" disabled>
            No options
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
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl">{lead.name || "Unnamed lead"}</SheetTitle>
          <SheetDescription>
            {lead.phone || "No phone"} · Created {formatDate(lead.created_at)}
          </SheetDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <StatusBadge value={lead.status} />
            <PropertyStateBadge value={lead.property_state} />
          </div>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-10">
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
              <TabsTrigger value="ai" className="flex flex-1 items-center gap-1.5">
                <Bot className="size-3.5" /> AI activity &amp; follow-ups
              </TabsTrigger>
              <TabsTrigger value="exec" className="flex flex-1 items-center gap-1.5">
                <History className="size-3.5" /> Sales Executive actions
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
              {lead.status === "SITE_VISIT_BOOKED" && (
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
