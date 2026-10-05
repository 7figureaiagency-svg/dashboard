import { useEffect, useRef, useState } from "react";
import { Building2, Upload, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { uploadClientLogo, useClient } from "@/lib/crm-data";
import { useQueryClient } from "@tanstack/react-query";

export function ProfileTab() {
  const { data: me } = useCurrentUser();
  const { data: client } = useClient(me?.clientId);
  const qc = useQueryClient();

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
    <div className="space-y-6">
      {/* Personal info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4" /> Personal Information
          </CardTitle>
          <CardDescription>Update your name and contact details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                placeholder="Your full name"
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={me?.email ?? ""} disabled className="opacity-60" />
              <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                value={phone}
                placeholder="+91 98765 43210"
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input
                value={me?.role === "admin" ? "Admin" : "Sales Executive"}
                disabled
                className="opacity-60"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company info — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" /> Company / Client Settings
            </CardTitle>
            <CardDescription>
              Update your company name and logo as they appear across the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo upload */}
            <div className="space-y-2">
              <Label>Company logo</Label>
              <div className="flex items-center gap-4">
                {(logoPreview || logoUrl) ? (
                  <img
                    src={logoPreview ?? logoUrl ?? ""}
                    alt="Company logo"
                    className="h-16 w-16 rounded-lg border object-contain p-1"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                    <Building2 className="size-6" />
                  </div>
                )}
                <div className="space-y-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="mr-2 size-4" />
                    {logoUrl || logoPreview ? "Change logo" : "Upload logo"}
                  </Button>
                  <p className="text-xs text-muted-foreground">PNG, JPG, SVG up to 2MB</p>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company name</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  placeholder="Your company name"
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact email</Label>
                <Input value={client?.email ?? ""} disabled className="opacity-60" />
              </div>
              {client?.display_phone_number && (
                <div className="space-y-1.5">
                  <Label>WhatsApp number</Label>
                  <Input value={client.display_phone_number} disabled className="opacity-60" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>WhatsApp status</Label>
                <Input
                  value={
                    client?.meta_signup_status === "connected"
                      ? "Connected"
                      : "Not connected"
                  }
                  disabled
                  className="opacity-60"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
