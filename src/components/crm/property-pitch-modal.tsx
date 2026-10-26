import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  MessageCircle,
  Pencil,
  RotateCcw,
  Building2,
  MapPin,
  Banknote,
  Send,
  User,
  ShieldCheck,
  Calculator,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { formatMoney, toWhatsAppUrl, type Lead, type Property, type PropertySubmission } from "@/lib/crm";
import {
  craftPropertyPitch,
  inferBestPersona,
  FORMAT_LABELS,
  LANGUAGE_LABELS,
  PERSONA_LABELS,
  type PitchFormat,
  type PitchLanguage,
  type PitchPersona,
} from "@/lib/pitch-crafter";

interface PropertyPitchModalProps {
  property: Property | PropertySubmission | null;
  lead?: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PropertyPitchModal({
  property,
  lead,
  open,
  onOpenChange,
}: PropertyPitchModalProps) {
  const { data: me } = useCurrentUser();
  const queryClient = useQueryClient();

  // Normalize price and name for inference and header
  const pRecord = (property || {}) as Record<string, any>;
  const rawPrice = Number(
    pRecord.price || pRecord.expected_price || pRecord.expected_rent || 0
  );
  const projectName =
    pRecord.project_name || pRecord.society_name || pRecord.title || "Prime Residence";
  const configuration = pRecord.configuration || pRecord.property_type || "3BHK Flat";
  const location = pRecord.location || "Vadodara";
  const carpetArea = Number(pRecord.carpet_area_sqft || pRecord.area_sqft || 0);

  // Initial inferred persona based on property and lead
  const initialPersona = useMemo(
    () => inferBestPersona(lead, rawPrice),
    [lead, rawPrice]
  );

  const [persona, setPersona] = useState<PitchPersona>(initialPersona);
  const [language, setLanguage] = useState<PitchLanguage>("HINGLISH");
  const [format, setFormat] = useState<PitchFormat>("WHATSAPP_QUICK");
  const [customNote, setCustomNote] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [customizedText, setCustomizedText] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isLogging, setIsLogging] = useState<boolean>(false);

  // Reset state when property or modal open changes
  useEffect(() => {
    if (open && property) {
      const best = inferBestPersona(lead, rawPrice);
      setPersona(best);
      setLanguage("HINGLISH");
      setFormat("WHATSAPP_QUICK");
      setCustomNote("");
      setIsEditing(false);
      setCustomizedText(null);
      setIsCopied(false);
    }
  }, [open, property, lead, rawPrice]);

  // Reactive algorithmic pitch computation
  const generatedPitch = useMemo(() => {
    if (!property) return null;
    return craftPropertyPitch(property, lead, {
      persona,
      language,
      format,
      customNote: customNote.trim() || undefined,
      agencyName: "Nextgen Realty",
      executiveName: me?.name || undefined,
    });
  }, [property, lead, persona, language, format, customNote, me?.name]);

  // Current active text: customized if user manually edited it, otherwise algorithm generated
  const activeFullMessage = customizedText ?? generatedPitch?.fullMessage ?? "";

  // Handle manual edits
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCustomizedText(e.target.value);
  };

  const handleResetToAuto = () => {
    setCustomizedText(null);
    setIsEditing(false);
    toast.info("Pitch restored to automated template.");
  };

  // Activity logger when pitch is copied or sent via WhatsApp
  const logPitchActivity = async (action: "COPIED" | "WHATSAPP_SENT") => {
    if (!lead || !property) return;
    try {
      setIsLogging(true);
      const clientId = lead.client_id || me?.clientId;
      const propId = pRecord.property_id || pRecord.id || "unknown";

      // 1. Insert into lead_activity
      await supabase.from("lead_activity" as any).insert({
        lead_id: lead.lead_id,
        lead_name: lead.name || lead.first_name || "Client",
        client_id: clientId,
        executive_name: me?.name || "Executive",
        action: "PITCH_SHARED",
        note: `${action === "WHATSAPP_SENT" ? "Sent WhatsApp" : "Copied"} ${PERSONA_LABELS[persona].label} pitch for ${projectName}`,
      });

      // 2. Also insert unified lead_events audit trail
      await supabase.from("lead_events" as any).insert({
        lead_id: lead.lead_id,
        client_id: clientId,
        event_type: "PITCH_SHARED",
        payload: {
          property_id: propId,
          project_name: projectName,
          persona,
          language,
          format,
          action,
          executive_name: me?.name || "Executive",
        },
      });

      queryClient.invalidateQueries({ queryKey: ["lead_activity"] });
      queryClient.invalidateQueries({ queryKey: ["lead_events"] });
      queryClient.invalidateQueries({ queryKey: ["lead_events", lead.lead_id] });
    } catch (err) {
      console.warn("Could not log pitch activity:", err);
    } finally {
      setIsLogging(false);
    }
  };

  // Copy to clipboard handler
  const handleCopy = async () => {
    if (!activeFullMessage) return;
    try {
      await navigator.clipboard.writeText(activeFullMessage);
      setIsCopied(true);
      toast.success("Pitch copied to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
      if (lead) {
        logPitchActivity("COPIED");
      }
    } catch {
      toast.error("Failed to copy pitch text.");
    }
  };

  // WhatsApp sender handler
  const handleSendWhatsApp = () => {
    if (!activeFullMessage) return;

    const targetPhone = lead?.phone || pRecord.owner_phone || null;
    let url: string | null = null;

    if (targetPhone) {
      url = toWhatsAppUrl(targetPhone, activeFullMessage);
    }

    if (!url) {
      // General WhatsApp web / app intent with message pre-filled
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(activeFullMessage)}`;
    }

    if (lead) {
      logPitchActivity("WHATSAPP_SENT");
    }

    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("Opening WhatsApp with tailored pitch!");
  };

  if (!property) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="apple-modal sm:max-w-3xl max-h-[92vh] flex flex-col p-0 overflow-hidden border border-border/60 bg-background/95 backdrop-blur-2xl shadow-2xl rounded-3xl">
        {/* ── Apple HIG Modal Header ── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/15 to-emerald-600/30 border border-emerald-500/30 flex items-center justify-center shadow-inner shrink-0 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  Property Pitch Studio
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    Psychology Engine
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-foreground">{projectName}</span>
                  <span>•</span>
                  <span>{configuration}</span>
                  <span>•</span>
                  <span className="text-primary font-bold">{formatMoney(rawPrice)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-0.5">
                    <MapPin className="size-3 text-muted-foreground" />
                    {location}
                  </span>
                </DialogDescription>
              </div>
            </div>

            {lead && (
              <div className="hidden sm:flex flex-col items-end text-right shrink-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Target Client
                </span>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1 mt-0.5">
                  <User className="size-3 text-primary" />
                  {lead.name || lead.first_name || "Client"}
                </span>
                {lead.phone && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {lead.phone}
                  </span>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* ── Scrollable Body Area ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* 1. Buyer Persona Segmented Control */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                Target Persona
              </label>
              {persona === initialPersona && (
                <span className="text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="size-3" /> Auto-inferred from budget & requirement
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/50">
              {(Object.keys(PERSONA_LABELS) as PitchPersona[]).map((key) => {
                const item = PERSONA_LABELS[key];
                const isSelected = persona === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setPersona(key);
                      setCustomizedText(null);
                    }}
                    className={`flex flex-col items-center justify-center py-2 px-2.5 rounded-xl text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-background text-foreground shadow-sm font-semibold border border-border/80"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                    }`}
                  >
                    <span className="text-base mb-0.5">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/80 italic px-1">
              {PERSONA_LABELS[persona].description}
            </p>
          </div>

          {/* 2. Language & Format Dual Strip */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Language Selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Linguistic Dialect
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted/60 border border-border/50">
                {(Object.keys(LANGUAGE_LABELS) as PitchLanguage[]).map((langKey) => {
                  const lang = LANGUAGE_LABELS[langKey];
                  const isSelected = language === langKey;
                  return (
                    <button
                      key={langKey}
                      type="button"
                      onClick={() => {
                        setLanguage(langKey);
                        setCustomizedText(null);
                      }}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs transition-all ${
                        isSelected
                          ? "bg-background text-foreground shadow-sm font-semibold border border-border/80"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                      }`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format Selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Pitch Length & Format
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted/60 border border-border/50">
                {(Object.keys(FORMAT_LABELS) as PitchFormat[]).map((fmtKey) => {
                  const fmt = FORMAT_LABELS[fmtKey];
                  const isSelected = format === fmtKey;
                  return (
                    <button
                      key={fmtKey}
                      type="button"
                      onClick={() => {
                        setFormat(fmtKey);
                        setCustomizedText(null);
                      }}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs transition-all ${
                        isSelected
                          ? "bg-background text-foreground shadow-sm font-semibold border border-border/80"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                      }`}
                    >
                      <span>{fmt.icon}</span>
                      <span className="truncate">{fmt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Financial Intelligence Badges Strip */}
          <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-muted/40 border border-border/40 text-xs">
            {generatedPitch?.estimatedEmi && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-background border border-border/60 shadow-2xs font-medium">
                <Calculator className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Est. EMI:</span>
                <span className="font-bold text-foreground">
                  ~{generatedPitch.estimatedEmi}
                </span>
                <span className="text-[10px] text-muted-foreground">(80% @ 8.5%)</span>
              </div>
            )}

            {generatedPitch?.pricePerSqFt && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-background border border-border/60 shadow-2xs font-medium">
                <Banknote className="size-3.5 text-blue-600 dark:text-blue-400" />
                <span>Rate:</span>
                <span className="font-bold text-foreground">
                  ₹{generatedPitch.pricePerSqFt.toLocaleString("en-IN")}/sq.ft
                </span>
              </div>
            )}

            {carpetArea > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-background border border-border/60 shadow-2xs font-medium">
                <Building2 className="size-3.5 text-purple-600 dark:text-purple-400" />
                <span>Carpet:</span>
                <span className="font-bold text-foreground">{carpetArea} sq.ft</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-background border border-border/60 shadow-2xs text-muted-foreground ml-auto">
              <MapPin className="size-3.5 text-muted-foreground" />
              <span>{location}</span>
            </div>
          </div>

          {/* 4. WhatsApp Live Preview / Textarea Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MessageCircle className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                WhatsApp Message Preview
              </label>

              <div className="flex items-center gap-2">
                {customizedText !== null && (
                  <button
                    type="button"
                    onClick={handleResetToAuto}
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="size-3" />
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                >
                  <Pencil className="size-3" />
                  {isEditing ? "View Live Preview" : "Customize Message"}
                </button>
              </div>
            </div>

            {isEditing ? (
              <Textarea
                value={activeFullMessage}
                onChange={handleTextChange}
                rows={9}
                className="font-sans text-xs leading-relaxed rounded-2xl border-border bg-card shadow-inner focus-visible:ring-1 focus-visible:ring-emerald-500"
                placeholder="Edit your WhatsApp pitch message here..."
              />
            ) : (
              /* WhatsApp Chat Bubble Card */
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-950/[0.15] p-4 relative overflow-hidden shadow-inner">
                {/* Chat Bubble Header indicator */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-500/10 text-[11px] text-muted-foreground">
                  <span className="font-medium flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="size-3 text-emerald-500" />
                    Verified Agent Outgoing WhatsApp
                  </span>
                  <span className="text-[10px] font-mono">
                    {lead?.phone || "wa.me/direct"}
                  </span>
                </div>

                <div className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground select-text selection:bg-emerald-500/25">
                  {activeFullMessage}
                </div>

                <div className="flex items-center justify-end gap-1 mt-3 pt-2 text-[10px] text-muted-foreground">
                  <span>Now</span>
                  <span className="text-emerald-500 font-bold">✓✓</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Apple HIG Modal Footer ── */}
        <DialogFooter className="px-6 py-4 border-t border-border/50 bg-muted/20 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="apple-button h-9 rounded-xl text-xs w-full sm:w-auto text-muted-foreground hover:text-foreground"
          >
            Close
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopy}
              className="apple-button h-9 rounded-xl text-xs flex-1 sm:flex-none gap-1.5 shadow-2xs font-semibold"
            >
              {isCopied ? (
                <>
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Copy Pitch</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={isLogging}
              className="apple-button h-9 rounded-xl text-xs flex-1 sm:flex-none gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
            >
              <MessageCircle className="size-3.5 fill-current" />
              <span>Send via WhatsApp</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
