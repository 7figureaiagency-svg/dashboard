import { useEffect, useMemo, useState } from "react";
import {
  AlarmClockOff,
  AlertTriangle,
  Bot,
  Building2,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  History,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Phone,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Star,
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DualRoleBadge,
  NoWhatsAppBadge,
  PropertyStateBadge,
  StatusBadge,
  ToneBadge,
} from "@/components/crm/badges";
import { WhatsAppChatView } from "@/components/crm/whatsapp-chat-view";
import { WorkflowTimeline } from "@/components/crm/workflow-timeline";
import { HistoryTimeline } from "@/components/crm/history-timeline";
import { useInventory, useLeadEvents, usePropertySubmissions, useUpdateLead } from "@/lib/crm-data";
import {
  LEAD_STATUSES,
  PROPERTY_SUBMISSION_STATUS_MAP,
  STATUS_MAP,
  actionLabel,
  buildAiActivity,
  buildLeadSummary,
  contactResolution,
  formatDate,
  formatMoney,
  isDualRoleLead,
  toNumber,
  toWhatsAppUrl,
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
  const { data: allSubmissions = [] } = usePropertySubmissions();
  const uniq = (vals: (string | null)[]) =>
    Array.from(new Set(vals.filter((v): v is string => !!v))).sort();
  const locations = uniq(inventory.map((p) => p.location));
  const configurations = uniq(inventory.map((p) => p.configuration));
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<Lead>>({});

  const submissions = useMemo(() => {
    if (!lead?.lead_id) return [];
    const cleanLeadPhone = lead.phone ? lead.phone.replace(/\D/g, "").slice(-10) : "";
    return allSubmissions.filter((s) => {
      if (s.lead_id === lead.lead_id) return true;
      if (cleanLeadPhone && s.owner_phone) {
        const cleanOwnerPhone = s.owner_phone.replace(/\D/g, "").slice(-10);
        if (cleanOwnerPhone && cleanOwnerPhone === cleanLeadPhone) return true;
      }
      return false;
    });
  }, [allSubmissions, lead?.lead_id, lead?.phone]);

  const isDual = useMemo(() => {
    return isDualRoleLead(lead) || submissions.length > 0;
  }, [lead, submissions.length]);

  // Reset local edits whenever a different lead is opened so stale profile
  // values from the previous lead don't bleed into the newly opened one.
  useEffect(() => {
    setProfile({});
    setNewPhone("");
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

  const currentPhone = (profile.phone !== undefined ? profile.phone : lead.phone) as string | null | undefined;
  const isMissingPhone = !currentPhone || currentPhone.trim() === "" || currentPhone.replace(/\D/g, "").length < 10;
  const isTelegram = lead.source === "telegram" || lead.lead_id?.startsWith("tg_") || lead.lead_id?.startsWith("telegram_");

  const handleSavePhone = () => {
    const cleanDigits = newPhone.replace(/\D/g, "");
    let formatted = "";
    if (cleanDigits.length === 10) {
      formatted = `91${cleanDigits}`;
    } else if (cleanDigits.length === 12 && cleanDigits.startsWith("91")) {
      formatted = cleanDigits;
    } else {
      toast.error("Please enter a valid 10-digit Indian mobile number");
      return;
    }
    run(
      {
        phone: formatted,
        bot_active: true,
        last_interaction_at: new Date().toISOString(),
      },
      `Added verified WhatsApp phone number +${formatted}`,
      "PHONE_ADDED",
    );
    setProfile((prev) => ({ ...prev, phone: formatted }));
    toast.success("WhatsApp number updated! Call and WhatsApp actions are now active.");
    setPhoneModalOpen(false);
    setNewPhone("");
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
      <SheetContent className="flex flex-col h-full w-full p-0 sm:max-w-2xl lg:max-w-3xl overflow-hidden">
        {/* ── 📱 iOS Sheet Grabber ── */}
        <div className="w-9 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

        {/* ── Scrollable Inspector Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <SheetHeader className="text-left space-y-1.5">
            <SheetTitle className="text-xl font-bold tracking-tight text-foreground">{lead.name || "Unnamed lead"}</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {currentPhone || (isTelegram ? `Telegram ID: ${lead.lead_id}` : "No WhatsApp phone")} · Created {formatDate(lead.created_at)}
            </SheetDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              <StatusBadge value={lead.status} />
              <PropertyStateBadge value={lead.property_state} />
              {isDual && <DualRoleBadge />}
              {isMissingPhone && !isTelegram && <NoWhatsAppBadge />}
            </div>
          </SheetHeader>
          {closed && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {dealWon
                ? "Deal won — this lead is closed. Use Revert below if you need to reopen it."
                : "This lead is dropped. Most actions are disabled — use Revert Lead below to reactivate."}
            </p>
          )}

          {isDual && (
            <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 shadow-xs backdrop-blur-xs relative overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-300">
                  <Star className="size-5 fill-amber-400 text-amber-500" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground">
                      🌟 High-Value Dual Client: Active Property Seeker + Verified Property Seller
                    </span>
                    <DualRoleBadge />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Senior Rep Pitch Hint:</strong> Client is actively looking to buy while listing their property. Prioritize senior partner callback for simultaneous exchange or double commission closure.
                  </p>
                  {submissions.length > 0 && (
                    <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 pt-0.5">
                      📦 {submissions.length} property listing{submissions.length > 1 ? "s" : ""} on record.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {isMissingPhone && !isTelegram && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-xs backdrop-blur-xs relative overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-300">
                  <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground">
                      Portal inquiry me WhatsApp number provide nahi kiya gaya
                    </span>
                    <NoWhatsAppBadge />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Ye lead <strong>{lead.source || "Portal"}</strong> inquiry se aayi hai par customer ka mobile number missing ya masked hai. Agar aapne call ya email par verified number acquire kiya hai, to 1-tap me add karein taaki automated WhatsApp site visit bot aur direct messaging active ho sake.
                  </p>
                  <div className="pt-1.5">
                    <Button
                      size="sm"
                      className="apple-button h-8 rounded-lg gap-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
                      onClick={() => setPhoneModalOpen(true)}
                    >
                      <Phone className="size-3.5" />
                      <span>Add WhatsApp Number</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquareText className="size-4 text-primary" /> AI Conversation summary
            </h3>
            <div className="rounded-xl border bg-card/60 p-3 shadow-xs">
              {buildLeadSummary(lead, submissions)}
            </div>
          </section>

          <Separator />

          <Tabs defaultValue="chat" className="w-full">
            <TabsList className={`w-full grid ${submissions.length > 0 ? "grid-cols-4" : "grid-cols-3"} h-10 p-1 bg-muted/60 rounded-xl`}>
              <TabsTrigger
                value="chat"
                className="flex items-center justify-center gap-1.5 text-xs font-semibold data-[state=active]:bg-[#008069] data-[state=active]:text-white transition-all rounded-lg truncate"
              >
                <MessageCircle className="size-3.5 shrink-0" /> WhatsApp ({chatMessages.length})
              </TabsTrigger>
              <TabsTrigger
                value="ai"
                className="flex items-center justify-center gap-1.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg truncate"
              >
                <Sparkles className="size-3.5 shrink-0" /> Workflow
              </TabsTrigger>
              {submissions.length > 0 && (
                <TabsTrigger
                  value="seller"
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all rounded-lg truncate"
                >
                  <Building2 className="size-3.5 shrink-0" /> Seller ({submissions.length})
                </TabsTrigger>
              )}
              <TabsTrigger
                value="exec"
                className="flex items-center justify-center gap-1.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg truncate"
              >
                <History className="size-3.5 shrink-0" /> History ({activity.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="mt-3 space-y-2">
              <WhatsAppChatView
                lead={lead}
                messages={chatMessages}
                loading={eventsLoading}
                onSendNote={(note) => {
                  run({ executive_notes: note }, "Logged WhatsApp note", "NOTE");
                }}
              />
            </TabsContent>

            <TabsContent value="ai" className="mt-3 space-y-2">
              <WorkflowTimeline
                lead={lead}
                matchingProperties={matchingProperties}
                onSelectProperty={(propName) =>
                  setProfile((p) => ({ ...p, selected_property_name: propName }))
                }
              />
            </TabsContent>

            {submissions.length > 0 && (
              <TabsContent value="seller" className="mt-3 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-purple-600 dark:text-purple-400" />
                    <h4 className="text-sm font-semibold text-foreground">Seller Property Submissions</h4>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {submissions.length} listed {submissions.length === 1 ? "unit" : "units"}
                  </span>
                </div>

                <div className="space-y-3">
                  {submissions.map((sub) => {
                    const statusMeta = (sub.status && PROPERTY_SUBMISSION_STATUS_MAP[sub.status]) || {
                      label: sub.status ?? "Pending Verification",
                      tone: "yellow" as const,
                    };
                    const ownerPhone = sub.owner_phone || lead.phone;
                    const title = sub.project_name || sub.society_name || "Unspecified Property";
                    const areaStr = sub.carpet_area_sqft
                      ? `${sub.carpet_area_sqft} sq.ft carpet`
                      : sub.super_built_up_sqft
                      ? `${sub.super_built_up_sqft} sq.ft built-up`
                      : null;
                    const priceStr = sub.expected_price
                      ? formatMoney(sub.expected_price)
                      : sub.expected_rent
                      ? `₹${sub.expected_rent.toLocaleString("en-IN")}/mo`
                      : "Price on request";

                    return (
                      <div
                        key={sub.id}
                        className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs space-y-3 hover:border-purple-500/30 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="font-bold text-sm text-foreground truncate">{title}</h5>
                              <ToneBadge label={statusMeta.label} tone={statusMeta.tone} />
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                              <MapPin className="size-3 shrink-0 text-muted-foreground/80" />
                              <span>{sub.location || "Vadodara"}</span>
                              {sub.property_category && <span>· {sub.property_category}</span>}
                              {sub.transaction_type && <span>· For {sub.transaction_type}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-foreground tabular-nums">
                              {priceStr}
                            </span>
                          </div>
                        </div>

                        {/* Inset specification specs */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/40 text-xs">
                          <div>
                            <span className="text-[10.5px] text-muted-foreground block">Configuration</span>
                            <span className="font-medium text-foreground">{sub.configuration || "Standard"}</span>
                          </div>
                          {areaStr && (
                            <div>
                              <span className="text-[10.5px] text-muted-foreground block">Area</span>
                              <span className="font-medium text-foreground">{areaStr}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-[10.5px] text-muted-foreground block">Furnishing</span>
                            <span className="font-medium text-foreground">{sub.furnishing_status || "Unfurnished"}</span>
                          </div>
                          {sub.possession_status && (
                            <div>
                              <span className="text-[10.5px] text-muted-foreground block">Possession</span>
                              <span className="font-medium text-foreground">{sub.possession_status}</span>
                            </div>
                          )}
                          {sub.owner_name && (
                            <div>
                              <span className="text-[10.5px] text-muted-foreground block">Owner</span>
                              <span className="font-medium text-foreground truncate">{sub.owner_name}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-[10.5px] text-muted-foreground block">Submitted On</span>
                            <span className="font-medium text-foreground">{formatDate(sub.created_at)}</span>
                          </div>
                        </div>

                        {sub.notes && (
                          <p className="text-xs text-muted-foreground bg-muted/20 p-2 rounded-lg italic">
                            "{sub.notes}"
                          </p>
                        )}

                        {/* Inspection & Owner Contact Action Buttons (44pt touch target) */}
                        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                          {ownerPhone ? (
                            <>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="apple-button min-h-[44px] h-11 flex-1 gap-2 text-xs font-semibold rounded-xl border-border/60 bg-card hover:bg-muted/60 shadow-2xs"
                              >
                                <a href={`tel:${ownerPhone}`}>
                                  <Phone className="size-3.5 text-primary" /> Call Owner
                                </a>
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="apple-button min-h-[44px] h-11 flex-1 gap-2 text-xs font-semibold rounded-xl border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 shadow-2xs"
                              >
                                <a
                                  href={toWhatsAppUrl(ownerPhone, `Hello, Nextgen Realtors inspection team contacting you regarding your property listing at ${title}.`) || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Send className="size-3.5" /> WhatsApp Owner
                                </a>
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No owner phone attached</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            )}

            <TabsContent value="exec" className="mt-3 space-y-2">
              <HistoryTimeline activity={activity} />
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
          {!isMissingPhone ? (
            <>
              <Button
                asChild
                size="sm"
                variant="default"
                className="apple-button flex-1 h-11 min-h-[44px] gap-2 rounded-xl text-xs font-semibold shadow-xs"
              >
                <a href={`tel:${currentPhone}`}>
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
                  href={toWhatsAppUrl(currentPhone) || "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageSquare className="size-4" /> WhatsApp
                </a>
              </Button>
            </>
          ) : !isTelegram ? (
            <Button
              size="sm"
              variant="default"
              className="apple-button flex-1 h-11 min-h-[44px] gap-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
              onClick={() => setPhoneModalOpen(true)}
            >
              <Phone className="size-4" /> Add WhatsApp Number
            </Button>
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

        <Dialog open={phoneModalOpen} onOpenChange={setPhoneModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Phone className="size-4 text-amber-600" /> Add Verified WhatsApp Number
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Enter customer&apos;s 10-digit Indian mobile number. Saving this will activate the automated WhatsApp AI bot and enable 1-tap call &amp; message actions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label htmlFor="phone-input" className="text-xs font-semibold text-foreground">
                WhatsApp Mobile Number
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex h-10 items-center justify-center rounded-lg border border-border/70 bg-muted/50 px-3 text-xs font-bold font-mono text-muted-foreground select-none">
                  +91
                </div>
                <Input
                  id="phone-input"
                  type="tel"
                  placeholder="98250 12345"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="font-mono text-sm tracking-wide h-10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSavePhone();
                    }
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter standard 10-digit Indian phone number without country code.
              </p>
            </div>
            <DialogFooter className="flex gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPhoneModalOpen(false)}
                className="apple-button h-9 rounded-lg text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="apple-button h-9 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleSavePhone}
              >
                Save &amp; Activate WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
