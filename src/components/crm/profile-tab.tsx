import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Building2,
  Clock,
  FileText,
  Landmark,
  MapPin,
  MessageSquare,
  Monitor,
  Moon,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { uploadClientLogo, useClient } from "@/lib/crm-data";
import { useQueryClient } from "@tanstack/react-query";

export interface CustomFaq {
  question: string;
  answer: string;
}

export interface BotKnowledge {
  office_address?: string;
  operating_hours?: string;
  contact_phone?: string;
  brokerage_policy?: string;
  bank_partners?: string;
  rera_number?: string;
  site_visit_facility?: string;
  custom_faqs?: CustomFaq[];
}

export function ProfileTab() {
  const { data: me } = useCurrentUser();
  const { data: client } = useClient(me?.clientId);
  const qc = useQueryClient();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [fullName, setFullName] = useState(me?.fullName ?? "");
  const [companyName, setCompanyName] = useState(client?.company_name ?? "");
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Bot Knowledge & FAQ Studio State
  const [officeAddress, setOfficeAddress] = useState("");
  const [operatingHours, setOperatingHours] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [brokeragePolicy, setBrokeragePolicy] = useState("");
  const [bankPartners, setBankPartners] = useState("");
  const [reraNumber, setReraNumber] = useState("");
  const [siteVisitFacility, setSiteVisitFacility] = useState("");
  const [customFaqs, setCustomFaqs] = useState<CustomFaq[]>([]);

  // Sync state when user loads
  useEffect(() => {
    if (me?.fullName) setFullName(me.fullName);
    if (me?.phone) setPhone(me.phone ?? "");
  }, [me?.fullName, me?.phone]);

  // Sync state when client data loads
  useEffect(() => {
    if (client?.company_name) setCompanyName(client.company_name);
    if (client?.logo_url) setLogoUrl(client.logo_url as string);

    if (client?.bot_knowledge) {
      const bk = client.bot_knowledge as BotKnowledge;
      if (bk.office_address !== undefined) setOfficeAddress(bk.office_address || "");
      if (bk.operating_hours !== undefined) setOperatingHours(bk.operating_hours || "");
      if (bk.contact_phone !== undefined) setContactPhone(bk.contact_phone || "");
      if (bk.brokerage_policy !== undefined) setBrokeragePolicy(bk.brokerage_policy || "");
      if (bk.bank_partners !== undefined) setBankPartners(bk.bank_partners || "");
      if (bk.rera_number !== undefined) setReraNumber(bk.rera_number || "");
      if (bk.site_visit_facility !== undefined) setSiteVisitFacility(bk.site_visit_facility || "");
      if (Array.isArray(bk.custom_faqs)) setCustomFaqs(bk.custom_faqs);
    } else if (client?.office_address) {
      setOfficeAddress(client.office_address);
    }
  }, [client]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
  };

  const handleAddFaq = () => {
    setCustomFaqs((prev) => [...prev, { question: "", answer: "" }]);
  };

  const handleRemoveFaq = (index: number) => {
    setCustomFaqs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", value: string) => {
    setCustomFaqs((prev) =>
      prev.map((faq, i) => (i === index ? { ...faq, [field]: value } : faq))
    );
  };

  const isAdmin = me?.role === "admin";

  const save = async () => {
    if (!me) return;
    setBusy(true);
    try {
      // 1. Update/Upsert user profile in public.profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: me.id,
            email: me.email,
            full_name: fullName || null,
            phone: phone || null,
            role: me.role,
            client_id: me.clientId,
          },
          { onConflict: "id" }
        );
      if (profileError) {
        console.warn("Profile table update note:", profileError);
      }

      // 2. Update company name, logo, and bot_knowledge (admin only)
      if (isAdmin && me.clientId) {
        let newLogoUrl = logoUrl;
        if (logoFile) {
          newLogoUrl = await uploadClientLogo(logoFile, me.clientId);
          setLogoUrl(newLogoUrl);
          setLogoFile(null);
        }
        const clientUpdate: Record<string, unknown> = {};
        if (companyName) {
          clientUpdate.company_name = companyName;
          clientUpdate.name = companyName;
        }
        if (newLogoUrl) {
          clientUpdate.logo_url = newLogoUrl;
        }

        const updatedBotKnowledge: BotKnowledge = {
          office_address: officeAddress.trim() || undefined,
          operating_hours: operatingHours.trim() || undefined,
          contact_phone: contactPhone.trim() || undefined,
          brokerage_policy: brokeragePolicy.trim() || undefined,
          bank_partners: bankPartners.trim() || undefined,
          rera_number: reraNumber.trim() || undefined,
          site_visit_facility: siteVisitFacility.trim() || undefined,
          custom_faqs: customFaqs.filter((f) => f.question.trim() && f.answer.trim()),
        };

        clientUpdate.bot_knowledge = updatedBotKnowledge;
        if (officeAddress.trim()) {
          clientUpdate.office_address = officeAddress.trim();
        }

        if (Object.keys(clientUpdate).length > 0) {
          const { error: clientError } = await supabase
            .from("clients")
            .update(clientUpdate as never)
            .eq("id", me.clientId);
          if (clientError) throw clientError;
        }
      }

      await qc.invalidateQueries({ queryKey: ["current-user"] });
      await qc.invalidateQueries({ queryKey: ["client", me.clientId] });
      toast.success("Profile and AI Bot Knowledge updated successfully");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Personal info */}
      <Card className="apple-card overflow-hidden border border-border/50 bg-card shadow-xs rounded-2xl">
        <CardHeader className="bg-muted/15 border-b border-border/30 px-5 py-4">
          <CardTitle className="flex items-center gap-2.5 text-base font-bold tracking-tight text-foreground">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <User className="size-4" />
            </div>
            <span>Personal Information</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Update your full name, direct phone number, and account credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-xs font-semibold text-foreground">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                placeholder="Your full name"
                onChange={(e) => setFullName(e.target.value)}
                className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground">Email address</Label>
              <Input id="email" value={me?.email ?? ""} disabled className="h-10 rounded-xl opacity-60 bg-muted/40 font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">Primary login email cannot be changed here.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-semibold text-foreground">Phone number</Label>
              <Input
                id="phone"
                value={phone}
                placeholder="+91 98765 43210"
                onChange={(e) => setPhone(e.target.value)}
                className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Assigned Role</Label>
              <Input
                value={me?.role === "admin" ? "Organization Admin" : "Sales Executive"}
                disabled
                className="h-10 rounded-xl opacity-60 bg-muted/40 font-medium text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company info — admin only */}
      {isAdmin && (
        <Card className="apple-card overflow-hidden border border-border/50 bg-card shadow-xs rounded-2xl">
          <CardHeader className="bg-muted/15 border-b border-border/30 px-5 py-4">
            <CardTitle className="flex items-center gap-2.5 text-base font-bold tracking-tight text-foreground">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-foreground">
                <Building2 className="size-4" />
              </div>
              <span>Company & Brokerage Branding</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Configure your brokerage name and logo as they appear on client site visit invites and portal leads.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {/* Logo upload */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Company logo</Label>
              <div className="flex items-center gap-4">
                {(logoPreview || logoUrl) ? (
                  <div className="relative size-18 rounded-2xl border border-border/60 bg-muted/20 p-2 shadow-2xs flex items-center justify-center overflow-hidden">
                    <img
                      src={logoPreview ?? logoUrl ?? ""}
                      alt="Company logo"
                      className="size-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex size-18 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/30 text-muted-foreground shadow-2xs">
                    <Building2 className="size-7 opacity-60" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="apple-button h-9 rounded-xl border-border/50 text-xs font-semibold gap-1.5 shadow-2xs"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    <span>{logoUrl || logoPreview ? "Change logo" : "Upload logo"}</span>
                  </Button>
                  <p className="text-[11px] text-muted-foreground">PNG, JPG, SVG or WebP up to 2MB</p>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-xs font-semibold text-foreground">Brokerage / Company name</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  placeholder="e.g. Nextgn Realtors"
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Billing email</Label>
                <Input value={client?.email ?? ""} disabled className="h-10 rounded-xl opacity-60 bg-muted/40 font-mono text-xs" />
              </div>
              {client?.display_phone_number && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">WhatsApp Business Number</Label>
                  <Input value={client.display_phone_number} disabled className="h-10 rounded-xl opacity-60 bg-muted/40 font-mono text-xs tabular-nums" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">WhatsApp API Status</Label>
                <div className="flex h-10 items-center rounded-xl border border-border/40 bg-muted/30 px-3.5 text-xs font-medium text-foreground">
                  <span className={`inline-block size-2 rounded-full mr-2 ${client?.meta_signup_status === "connected" ? "bg-emerald-500 shadow-xs" : "bg-amber-500"}`} />
                  <span>{client?.meta_signup_status === "connected" ? "Connected & Active" : "Not connected"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Bot Knowledge & FAQ Studio — admin only */}
      {isAdmin && (
        <Card className="apple-card overflow-hidden border border-border/50 bg-card shadow-xs rounded-2xl">
          <CardHeader className="bg-muted/15 border-b border-border/30 px-5 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2.5 text-base font-bold tracking-tight text-foreground">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <Sparkles className="size-4" />
                </div>
                <span>AI Bot Knowledge & FAQ Studio</span>
              </CardTitle>
              <div className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                <Bot className="size-3" />
                <span>Zero Regex • Dynamic AI</span>
              </div>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Customize your agency's operating address, timings, brokerage terms, and custom FAQs. The AI bot answers inquiries dynamically on Telegram and WhatsApp without hardcoded regex.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            {/* Section 1: Agency Operations */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <MapPin className="size-3.5 text-primary" />
                <span>1. Agency Operations & Office Location</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="officeAddress" className="text-xs font-semibold text-foreground">
                  Physical Office Address
                </Label>
                <Textarea
                  id="officeAddress"
                  value={officeAddress}
                  placeholder="e.g. 402, Alkapuri Arcade, RC Dutt Road, Alkapuri, Vadodara - 390007"
                  onChange={(e) => setOfficeAddress(e.target.value)}
                  className="min-h-[60px] rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm leading-relaxed"
                />
                <p className="text-[11px] text-muted-foreground">
                  When leads ask "Where is your office?" or "Address bhejo", the AI bot replies with this exact location.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="operatingHours" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="size-3 text-muted-foreground" />
                    <span>Visiting Hours</span>
                  </Label>
                  <Input
                    id="operatingHours"
                    value={operatingHours}
                    placeholder="e.g. 10:00 AM - 7:30 PM (Mon-Sat)"
                    onChange={(e) => setOperatingHours(e.target.value)}
                    className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contactPhone" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Phone className="size-3 text-muted-foreground" />
                    <span>Direct Helpline Phone</span>
                  </Label>
                  <Input
                    id="contactPhone"
                    value={contactPhone}
                    placeholder="e.g. +91 98765 43210"
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="siteVisitFacility" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <MapPin className="size-3 text-muted-foreground" />
                    <span>Site Visit Facility</span>
                  </Label>
                  <Input
                    id="siteVisitFacility"
                    value={siteVisitFacility}
                    placeholder="e.g. Free AC Cab Pickup & Drop Available"
                    onChange={(e) => setSiteVisitFacility(e.target.value)}
                    className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-border/40" />

            {/* Section 2: Commercial & Legal Policies */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <ShieldCheck className="size-3.5 text-emerald-500" />
                <span>2. Commercial & Legal Policies</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="brokeragePolicy" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="size-3 text-muted-foreground" />
                    <span>Brokerage Policy</span>
                  </Label>
                  <Input
                    id="brokeragePolicy"
                    value={brokeragePolicy}
                    placeholder="e.g. 0% Brokerage on direct builder bookings; 1% on resale deals"
                    onChange={(e) => setBrokeragePolicy(e.target.value)}
                    className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bankPartners" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Landmark className="size-3 text-muted-foreground" />
                    <span>Bank Loan Partners</span>
                  </Label>
                  <Input
                    id="bankPartners"
                    value={bankPartners}
                    placeholder="e.g. SBI, HDFC, ICICI, Bank of Baroda"
                    onChange={(e) => setBankPartners(e.target.value)}
                    className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reraNumber" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="size-3 text-muted-foreground" />
                    <span>Agency RERA Reg. No.</span>
                  </Label>
                  <Input
                    id="reraNumber"
                    value={reraNumber}
                    placeholder="e.g. PR/GJ/VADODARA/RAA09876/010124"
                    onChange={(e) => setReraNumber(e.target.value)}
                    className="h-10 rounded-xl border-border/40 bg-muted/20 focus:bg-background transition-colors text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-border/40" />

            {/* Section 3: Custom Q&A Studio */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <MessageSquare className="size-3.5 text-blue-500" />
                  <span>3. Custom Q&A Knowledge Base</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddFaq}
                  className="apple-button h-8 rounded-xl border-border/50 text-xs font-semibold gap-1.5 shadow-2xs hover:bg-muted/30"
                >
                  <Plus className="size-3.5" />
                  <span>Add Question</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Add agency-specific questions & answers (documents required, booking token process, refund policy). The AI model understands lead inquiries in Hindi, Gujarati, or English and answers accurately.
              </p>

              {customFaqs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/15 p-6 text-center">
                  <MessageSquare className="size-6 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-medium text-foreground">No custom FAQs configured yet</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Click "Add Question" to train the AI bot with your agency's custom policies.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {customFaqs.map((faq, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-2.5 transition-all focus-within:border-primary/40 focus-within:bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          FAQ #{index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveFaq(index)}
                          className="size-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-foreground">Question</Label>
                        <Input
                          value={faq.question}
                          placeholder="e.g. Property booking ke liye kya documentation chahiye?"
                          onChange={(e) => handleUpdateFaq(index, "question", e.target.value)}
                          className="h-9 rounded-lg border-border/40 bg-background text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-foreground">Factual Answer</Label>
                        <Textarea
                          value={faq.answer}
                          placeholder="e.g. Booking ke liye PAN card, Aadhaar card aur booking token lagta hai. Hamari team paperwork coordinate karti hai."
                          onChange={(e) => handleUpdateFaq(index, "answer", e.target.value)}
                          className="min-h-[50px] rounded-lg border-border/40 bg-background text-xs leading-relaxed"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="h-px bg-border/40" />

            {/* Section 4: Live Bot Response Preview */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Bot className="size-3.5 text-primary" />
                  <span>4. Live AI Bot Response Simulation</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Real-time Dynamic Sync</span>
                </span>
              </div>

              <div className="rounded-2xl border border-border/50 bg-muted/30 p-4 space-y-3 font-sans text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-[10px]">
                    BOT
                  </div>
                  <div className="space-y-2 rounded-2xl rounded-tl-xs bg-card border border-border/40 p-3.5 shadow-2xs max-w-lg text-foreground">
                    <p className="font-medium">
                      Hamari agency <b>{companyName || "Griham Realty"}</b> ka main office{" "}
                      <b>{officeAddress || "402, Alkapuri Arcade, RC Dutt Road, Alkapuri, Vadodara"}</b> par sthit hai! 🏢
                    </p>
                    <div className="space-y-1 text-muted-foreground text-[11px] border-t border-border/30 pt-2">
                      <p>⏰ <b>Visiting Hours:</b> {operatingHours || "10:00 AM - 7:30 PM (Mon-Sat)"}</p>
                      <p>💰 <b>Brokerage Policy:</b> {brokeragePolicy || "0% on direct builder bookings, 1% on verified resale deals"}</p>
                      {contactPhone && <p>📞 <b>Helpline:</b> <code>{contactPhone}</code></p>}
                    </div>
                    <p className="text-[11px] text-primary font-medium pt-1">
                      👉 <b>Manthan ji</b>, kya hum kal aapki <b>VIP Site Visit 🚗</b> plan karein?
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Appearance & Theme */}
      <Card className="apple-card overflow-hidden border border-border/50 bg-card shadow-xs rounded-2xl">
        <CardHeader className="bg-muted/15 border-b border-border/30 px-5 py-4">
          <CardTitle className="flex items-center gap-2.5 text-base font-bold tracking-tight text-foreground">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Sun className="size-4" />
            </div>
            <span>Appearance & Theme</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Select your preferred display theme. All colors adhere to Apple Human Interface Guidelines and OKLCH system tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`apple-button flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                theme === "light"
                  ? "border-primary bg-primary/8 ring-2 ring-primary/25 shadow-xs"
                  : "border-border/50 bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${theme === "light" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                  <Sun className="size-4.5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">Light</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Apple System Gray 6</div>
                </div>
              </div>
              {theme === "light" && <div className="size-2.5 rounded-full bg-primary shadow-xs" />}
            </button>

            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`apple-button flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                theme === "dark"
                  ? "border-primary bg-primary/8 ring-2 ring-primary/25 shadow-xs"
                  : "border-border/50 bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${theme === "dark" ? "bg-indigo-500/15 text-indigo-400" : "bg-muted text-muted-foreground"}`}>
                  <Moon className="size-4.5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">Dark</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Deep Obsidian Canvas</div>
                </div>
              </div>
              {theme === "dark" && <div className="size-2.5 rounded-full bg-primary shadow-xs" />}
            </button>

            <button
              type="button"
              onClick={() => setTheme("system")}
              className={`apple-button flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                theme === "system"
                  ? "border-primary bg-primary/8 ring-2 ring-primary/25 shadow-xs"
                  : "border-border/50 bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${theme === "system" ? "bg-blue-500/15 text-blue-500" : "bg-muted text-muted-foreground"}`}>
                  <Monitor className="size-4.5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">System</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Match OS ({resolvedTheme === "dark" ? "Dark" : "Light"})
                  </div>
                </div>
              </div>
              {theme === "system" && <div className="size-2.5 rounded-full bg-primary shadow-xs" />}
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button
          onClick={save}
          disabled={busy}
          className="apple-button h-11 px-7 rounded-xl font-bold text-xs bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all flex items-center gap-2"
        >
          {busy ? "Saving Changes…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
