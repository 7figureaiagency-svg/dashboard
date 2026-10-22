import { useEffect, useRef, useState } from "react";
import { Building2, Monitor, Moon, Sun, Upload, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { uploadClientLogo, useClient } from "@/lib/crm-data";
import { useQueryClient } from "@tanstack/react-query";

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

  // Sync state when data loads
  useEffect(() => {
    if (me?.fullName) setFullName(me.fullName);
    if (me?.phone) setPhone(me.phone ?? "");
  }, [me?.fullName, me?.phone]);

  useEffect(() => {
    if (client?.company_name) setCompanyName(client.company_name);
    // @ts-ignore – logo_url may not yet be in the generated types
    if (client?.logo_url) setLogoUrl(client.logo_url as string);
  }, [client?.company_name, client]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
  };

  const isAdmin = me?.role === "admin";

  const save = async () => {
    if (!me) return;
    setBusy(true);
    try {
      // Update profile (name + phone)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: fullName || null, phone: phone || null })
        .eq("id", me.id);
      if (profileError) throw profileError;

      // Update company name and logo (admin only)
      if (isAdmin && me.clientId) {
        let newLogoUrl = logoUrl;
        if (logoFile) {
          newLogoUrl = await uploadClientLogo(logoFile, me.clientId);
          setLogoUrl(newLogoUrl);
          setLogoFile(null);
        }
        const clientUpdate: Record<string, unknown> = {};
        if (companyName) clientUpdate.company_name = companyName;
        if (newLogoUrl) clientUpdate.logo_url = newLogoUrl;
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
      toast.success("Profile updated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
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
