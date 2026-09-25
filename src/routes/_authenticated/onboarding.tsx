import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsAppConnectCard } from "@/components/crm/whatsapp-connect";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { completeOnboarding } from "@/lib/onboarding.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [{ title: "Set up your workspace — Nextgn Realtors" }],
  }),
  component: OnboardingPage,
});

type Step = "phone" | "company" | "whatsapp" | "done";

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me, isLoading } = useCurrentUser();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [newClientId, setNewClientId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && me?.role) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isLoading, me, navigate]);

  const sendOtp = async () => {
    if (!phone.trim()) {
      toast.error("Enter a phone number with country code, e.g. +919876543210");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ phone: phone.trim() });
      if (error) throw error;
      setOtpSent(true);
      toast.success("Verification code sent over SMS");
    } catch (err) {
      toast.error(
        (err as Error).message ||
          "Couldn't send an SMS code. Make sure phone auth is configured in Supabase (see SETUP.md), or skip for now.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length < 4) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp,
        type: "phone_change",
      });
      if (error) throw error;
      await supabase
        .from("profiles")
        .update({ phone: phone.trim(), phone_verified: true })
        .eq("id", me?.id ?? "");
      setPhoneVerified(true);
      toast.success("Phone verified");
      setStep("company");
    } catch (err) {
      toast.error((err as Error).message || "That code didn't match. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCompany = async () => {
    if (!companyName.trim()) {
      toast.error("Enter your company / agency name");
      return;
    }
    setBusy(true);
    try {
      const result = await completeOnboarding({
        data: {
          companyName: companyName.trim(),
          ...(phoneVerified ? { phone: phone.trim() } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["current-user"] });
      if (result.status === "created_client") {
        setNewClientId(result.clientId);
        toast.success("Workspace created!");
        setStep("whatsapp");
      } else if (result.status === "joined_existing_team") {
        toast.success("You've been added to your team's workspace!");
        navigate({ to: "/dashboard", replace: true });
      } else if (result.status === "already_onboarded") {
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error((err as Error).message || "Couldn't finish setting up your workspace.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <CardTitle>Set up your workspace</CardTitle>
          <CardDescription>
            {step === "phone" && "First, let's verify your phone number."}
            {step === "company" && "Tell us about your agency."}
            {step === "whatsapp" && "Almost done — connect your WhatsApp Business number."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === "phone" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  placeholder="+91XXXXXXXXXX"
                  value={phone}
                  disabled={otpSent}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              {!otpSent ? (
                <Button className="w-full" onClick={sendOtp} disabled={busy}>
                  <ShieldCheck /> Send verification code
                </Button>
              ) : (
                <div className="space-y-3">
                  <Label>Enter the 6-digit code</Label>
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={verifyOtp}
                      disabled={busy || otp.length < 4}
                    >
                      Verify
                    </Button>
                    <Button variant="outline" onClick={sendOtp} disabled={busy}>
                      Resend
                    </Button>
                  </div>
                </div>
              )}
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground hover:underline"
                onClick={() => setStep("company")}
              >
                Skip phone verification for now
              </button>
            </div>
          )}

          {step === "company" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Agency / company name</Label>
                <Input
                  id="companyName"
                  placeholder="e.g. Nextgn Realtors"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                If your email matches an executive your admin already added, we'll add you to their
                team instead of creating a new workspace.
              </p>
              <Button className="w-full" onClick={submitCompany} disabled={busy}>
                Continue
              </Button>
            </div>
          )}

          {step === "whatsapp" && (
            <div className="space-y-4">
              <WhatsAppConnectCard clientId={newClientId} />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageCircle className="size-3.5" /> You can also connect this later from the
                "Lead Sources &amp; WhatsApp" tab.
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={async () => {
                  // Make sure the dashboard sees the freshly-set role/client_id
                  // before it mounts — otherwise it can read a stale cached
                  // "role: null" and bounce straight back here.
                  await qc.invalidateQueries({ queryKey: ["current-user"] });
                  navigate({ to: "/dashboard", replace: true });
                }}
              >
                <CheckCircle2 /> Go to dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
