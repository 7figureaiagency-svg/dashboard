import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  MessageCircle,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToneBadge } from "@/components/crm/badges";
import {
  disconnectWhatsApp,
  linkWhatsAppAccount,
  saveManualWhatsAppCredentials,
  testWhatsAppConnection,
} from "@/lib/onboarding.functions";
import type { Client } from "@/lib/crm";

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (res: { authResponse?: { code?: string } | null; status?: string }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const META_APP_ID =
  (import.meta.env["VITE_META_APP_ID"] as string | undefined) || "1117232154391535";
const META_CONFIG_ID =
  (import.meta.env["VITE_META_CONFIG_ID"] as string | undefined) || "1765212574527975";
const META_GRAPH_VERSION =
  (import.meta.env["VITE_META_GRAPH_VERSION"] as string | undefined) || "v21.0";

const WEBHOOK_CALLBACK_URL =
  "https://yeiygfysijptjdepctnx.supabase.co/functions/v1/realtor-lead-engine/webhook";

let fbSdkPromise: Promise<void> | null = null;

/** Lazily injects the Facebook JS SDK exactly once and resolves once `FB` is ready. */
function loadFacebookSdk(): Promise<void> {
  if (fbSdkPromise) return fbSdkPromise;
  fbSdkPromise = new Promise((resolve, reject) => {
    // If window.FB already exists and has init method
    if (window.FB && typeof window.FB.init === "function") {
      try {
        window.FB.init({
          appId: META_APP_ID,
          autoLogAppEvents: true,
          xfbml: false,
          version: META_GRAPH_VERSION,
          cookie: true,
        });
        resolve();
        return;
      } catch (err) {
        console.warn("FB.init on pre-existing window.FB failed:", err);
      }
    }

    // Safety timeout in case the script hangs or is silently dropped by an ad blocker / firewall
    const timeoutId = setTimeout(() => {
      fbSdkPromise = null;
      reject(
        new Error(
          "Facebook SDK load timed out. Your browser or an ad-blocker (uBlock, Brave Shields) may be blocking connect.facebook.net. Please pause ad-blocking or use 'Enter Credentials Manually'.",
        ),
      );
    }, 8000);

    window.fbAsyncInit = () => {
      clearTimeout(timeoutId);
      try {
        window.FB?.init({
          appId: META_APP_ID,
          autoLogAppEvents: true,
          xfbml: false,
          version: META_GRAPH_VERSION,
          cookie: true,
        });
        resolve();
      } catch (err) {
        fbSdkPromise = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    // Remove any previously failed or dangling facebook script tag
    const existingScript = document.getElementById("facebook-jssdk");
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      clearTimeout(timeoutId);
      fbSdkPromise = null;
      reject(
        new Error(
          "Facebook SDK script failed to load. Browser extensions (uBlock, AdBlock, Brave Shields) block connect.facebook.net. Please pause ad-blockers for this site or use 'Enter Credentials Manually'.",
        ),
      );
    };

    document.body.appendChild(script);
  });
  return fbSdkPromise;
}

/** Returns the number of whole days until the given ISO timestamp, or null if none. */
function daysUntil(isoTs: string | null | undefined): number | null {
  if (!isoTs) return null;
  const ms = new Date(isoTs).getTime() - Date.now();
  return Math.floor(ms / 86_400_000);
}

type SignupPayload = { waba_id?: string; phone_number_id?: string; business_id?: string };

export function WhatsAppConnectCard({
  clientId,
  client,
  compact = false,
}: {
  clientId: string | null;
  client?: Client | null;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const signupData = useRef<SignupPayload>({});

  // Manual Credentials Dialog State
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPhoneId, setManualPhoneId] = useState(client?.phone_number_id || "");
  const [manualWabaId, setManualWabaId] = useState(client?.waba_id || "");
  const [manualToken, setManualToken] = useState(client?.access_token || "");
  const [manualDisplayPhone, setManualDisplayPhone] = useState(client?.display_phone_number || "");
  const [savingManual, setSavingManual] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  useEffect(() => {
    if (client) {
      if (client.phone_number_id && !manualPhoneId) setManualPhoneId(client.phone_number_id);
      if (client.waba_id && !manualWabaId) setManualWabaId(client.waba_id);
      if (client.display_phone_number && !manualDisplayPhone) setManualDisplayPhone(client.display_phone_number);
      if (client.access_token && !manualToken) setManualToken(client.access_token);
    }
  }, [client]);

  const configured = !!META_APP_ID && !!META_CONFIG_ID;

  // Derive connection state
  const signupStatus = client?.meta_signup_status;
  const fullyConnected =
    !!client?.access_token && !!client?.phone_number_id && signupStatus === "connected";
  const pendingToken =
    !!client?.phone_number_id && signupStatus === "connected_pending_token";
  const hasCredentials = fullyConnected || pendingToken;

  // Token expiry
  const daysRemaining = daysUntil(client?.access_token_expires_at);
  const expiringSoon = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
  const tokenExpired = daysRemaining !== null && daysRemaining < 0;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      )
        return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.event === "FINISH") {
          signupData.current = {
            waba_id: data.data?.waba_id,
            phone_number_id: data.data?.phone_number_id,
            business_id: data.data?.business_id,
          };
        }
      } catch {
        // Not a JSON embedded-signup message — ignore.
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const connect = async () => {
    if (!clientId) {
      toast.error("No tenant selected");
      return;
    }
    if (!configured) {
      toast.error(
        "WhatsApp connect isn't configured yet — set VITE_META_APP_ID and VITE_META_CONFIG_ID (see SETUP.md).",
      );
      setManualOpen(true);
      return;
    }
    setConnecting(true);
    try {
      await loadFacebookSdk();
      window.FB?.login(
        async (response) => {
          const code = response.authResponse?.code;
          if (!code) {
            toast.error("WhatsApp connection was cancelled or didn't complete.");
            setConnecting(false);
            return;
          }
          try {
            const result = await linkWhatsAppAccount({
              data: {
                clientId,
                code,
                ...(signupData.current.waba_id ? { wabaId: signupData.current.waba_id } : {}),
                ...(signupData.current.phone_number_id
                  ? { phoneNumberId: signupData.current.phone_number_id }
                  : {}),
                ...(signupData.current.business_id
                  ? { businessId: signupData.current.business_id }
                  : {}),
              },
            });
            if (result?.status === "connected") {
              toast.success("WhatsApp Business account connected!");
            } else {
              toast.success(
                "WhatsApp details saved — a permanent access token still needs to be issued (see SETUP.md).",
              );
            }
            qc.invalidateQueries({ queryKey: ["client", clientId] });
          } catch (err) {
            toast.error((err as Error).message || "Couldn't complete the WhatsApp connection.");
          } finally {
            setConnecting(false);
          }
        },
        {
          config_id: META_CONFIG_ID,
          response_type: "code",
          override_default_response_type: true,
          extras: { sessionInfoVersion: "3" },
        },
      );
    } catch (err) {
      console.error("Facebook SDK connection failure:", err);
      const errMsg =
        (err as Error)?.message ||
        "Couldn't load the Facebook SDK. Check your network or ad-blockers.";
      toast.error(errMsg, {
        description: "Opening Manual Setup so you can connect directly with your credentials.",
        duration: 7000,
      });
      setConnecting(false);
      setManualOpen(true);
    }
  };

  const disconnect = async () => {
    if (!clientId) return;
    setDisconnecting(true);
    try {
      await disconnectWhatsApp({ data: { clientId } });
      toast.success("WhatsApp account disconnected.");
      qc.invalidateQueries({ queryKey: ["client", clientId] });
    } catch (err) {
      toast.error((err as Error).message || "Couldn't disconnect.");
    } finally {
      setDisconnecting(false);
    }
  };

  const testConnection = async () => {
    if (!clientId) return;
    setTesting(true);
    try {
      const result = await testWhatsAppConnection({ data: { clientId } });
      if (result.ok) {
        toast.success(`Connection live — number confirmed: ${result.displayPhoneNumber}`);
      } else {
        const messages: Record<string, string> = {
          token_invalid: "Token is invalid or expired — reconnect or update token.",
          number_not_found: "Phone number ID not found on this WABA — verify Phone Number ID.",
          no_credentials: "No credentials stored — please connect first.",
          network_error: "Couldn't reach Meta — check your network.",
        };
        toast.error(messages[result.reason] ?? "Connection test failed.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const saveManual = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!clientId) {
      toast.error("No tenant selected");
      return;
    }
    if (!manualPhoneId.trim()) {
      toast.error("Please enter your WhatsApp Phone Number ID");
      return;
    }
    if (!manualToken.trim()) {
      toast.error("Please enter your Permanent Access Token (System User Token)");
      return;
    }
    setSavingManual(true);
    try {
      const res = await saveManualWhatsAppCredentials({
        data: {
          clientId,
          phoneNumberId: manualPhoneId.trim(),
          wabaId: manualWabaId.trim() || undefined,
          accessToken: manualToken.trim(),
          displayPhoneNumber: manualDisplayPhone.trim() || undefined,
        },
      });
      toast.success(
        res.displayPhoneNumber
          ? `WhatsApp connected successfully for ${res.displayPhoneNumber}!`
          : "WhatsApp credentials saved successfully!",
      );
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      setManualOpen(false);
    } catch (err) {
      toast.error((err as Error).message || "Failed to save WhatsApp credentials.");
    } finally {
      setSavingManual(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(WEBHOOK_CALLBACK_URL);
    setCopiedWebhook(true);
    toast.success("Webhook Callback URL copied to clipboard!");
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const manualDialog = (
    <Dialog open={manualOpen} onOpenChange={setManualOpen}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border-border/50 p-6 shadow-xl">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/30">
          <div className="flex items-center gap-2 text-primary font-bold">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <KeyRound className="size-4" />
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
              WhatsApp Cloud API Manual Setup
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Directly connect your Meta WhatsApp Cloud API credentials. This bypasses browser ad-blockers (uBlock, Brave Shields) and Meta Embedded Signup popup restrictions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={saveManual} className="space-y-4 pt-2">
          {/* Phone Number ID */}
          <div className="space-y-1.5">
            <Label htmlFor="manual-phone-id" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>WhatsApp Phone Number ID <span className="text-destructive">*</span></span>
              <span className="text-[11px] font-normal text-muted-foreground">Numeric ID (e.g. 104829104820194)</span>
            </Label>
            <Input
              id="manual-phone-id"
              value={manualPhoneId}
              onChange={(e) => setManualPhoneId(e.target.value)}
              placeholder="e.g. 104829104820194"
              className="apple-input text-xs font-mono h-9 rounded-xl"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Found in <strong className="text-foreground">Meta Business Suite → WhatsApp → API Setup → Phone number ID</strong>.
            </p>
          </div>

          {/* Permanent Access Token */}
          <div className="space-y-1.5">
            <Label htmlFor="manual-token" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Permanent Access Token (System User Token) <span className="text-destructive">*</span></span>
              <span className="text-[11px] font-normal text-muted-foreground">Starts with EAA...</span>
            </Label>
            <textarea
              id="manual-token"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="EAAG... (paste permanent System User Token here)"
              rows={3}
              className="w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-xs font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              required
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Generate from <strong className="text-foreground">Meta Business Settings → Users → System Users</strong> with <code className="text-primary font-mono text-[10px] bg-muted px-1 py-0.5 rounded">whatsapp_business_messaging</code> and <code className="text-primary font-mono text-[10px] bg-muted px-1 py-0.5 rounded">whatsapp_business_management</code>.
            </p>
          </div>

          {/* WABA ID & Display Phone in 2-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="manual-waba-id" className="text-xs font-semibold text-foreground">
                WhatsApp Business Account ID (WABA ID)
              </Label>
              <Input
                id="manual-waba-id"
                value={manualWabaId}
                onChange={(e) => setManualWabaId(e.target.value)}
                placeholder="e.g. 104829104820193"
                className="apple-input text-xs font-mono h-9 rounded-xl"
              />
              <p className="text-[11px] text-muted-foreground">
                From Meta WhatsApp Accounts → Account ID.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-display-phone" className="text-xs font-semibold text-foreground">
                Display Phone Number <span className="text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                id="manual-display-phone"
                value={manualDisplayPhone}
                onChange={(e) => setManualDisplayPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="apple-input text-xs h-9 rounded-xl"
              />
              <p className="text-[11px] text-muted-foreground">
                Auto-detected from Meta if omitted.
              </p>
            </div>
          </div>

          {/* Webhook Configuration Guide Callout */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-primary">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4" />
                <span>Meta Webhook Configuration (for incoming leads)</span>
              </span>
              <button
                type="button"
                onClick={copyWebhookUrl}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-mono"
              >
                {copiedWebhook ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                <span>{copiedWebhook ? "Copied" : "Copy URL"}</span>
              </button>
            </div>
            <div className="font-mono text-[11px] bg-background/80 p-2 rounded-lg border border-border/40 select-all break-all text-foreground">
              {WEBHOOK_CALLBACK_URL}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              In Meta App Dashboard → WhatsApp → Configuration: paste this as the <strong>Callback URL</strong>, set any Verify Token (e.g. <code className="font-mono text-primary text-[10px]">realtor_webhook</code>), and subscribe to the <code className="font-mono text-primary text-[10px]">messages</code> field.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/30">
            <Button
              type="button"
              variant="outline"
              onClick={() => setManualOpen(false)}
              className="apple-button h-9 rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={savingManual || !manualPhoneId || !manualToken}
              className="apple-button h-9 rounded-xl text-xs font-semibold px-4 shadow-2xs gap-1.5"
            >
              {savingManual ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>{savingManual ? "Saving credentials…" : "Save & Connect WhatsApp"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={connect}
          disabled={connecting}
          className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold gap-1.5 shadow-2xs"
        >
          <MessageCircle className="size-4" />
          <span>{connecting ? "Connecting…" : "Connect WhatsApp"}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setManualOpen(true)}
          className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold gap-1.5 bg-background/80"
        >
          <KeyRound className="size-3.5" />
          <span>Manual setup</span>
        </Button>
        {manualDialog}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-xs overflow-hidden">
      <div className="p-5 pb-4 border-b border-border/30 bg-muted/15">
        <h3 className="flex items-center gap-2.5 text-base font-bold tracking-tight text-foreground">
          <div className="size-8 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <MessageCircle className="size-4" />
          </div>
          <span>WhatsApp Business Account (Meta Cloud API)</span>
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
          Link your Meta WhatsApp Business number so incoming customer chats are routed to your leads automatically — zero manual data entry needed once connected.
        </p>
      </div>
      <div className="p-5 space-y-4">

        {/* ── Pending-token warning ─────────────────────────────────── */}
        {pendingToken && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Token pending — manual setup available
              </p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400 leading-relaxed">
                WhatsApp details saved, but a permanent access token hasn't been issued yet. Click{" "}
                <button
                  type="button"
                  onClick={() => setManualOpen(true)}
                  className="font-bold underline cursor-pointer text-amber-900 dark:text-amber-200"
                >
                  Manual setup
                </button>{" "}
                to paste your System User token immediately.
              </p>
            </div>
          </div>
        )}

        {/* ── Token expiry warning ──────────────────────────────────── */}
        {fullyConnected && (expiringSoon || tokenExpired) && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-3.5 text-xs ${
              tokenExpired
                ? "border-rose-500/25 bg-rose-500/10 text-rose-800 dark:text-rose-300"
                : "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            }`}
          >
            <Clock
              className={`mt-0.5 size-4 shrink-0 ${
                tokenExpired
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            />
            <div className="flex-1">
              <p
                className={`font-semibold ${
                  tokenExpired
                    ? "text-rose-800 dark:text-rose-300"
                    : "text-amber-800 dark:text-amber-300"
                }`}
              >
                {tokenExpired
                  ? "Access token has expired"
                  : `Access token expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
              </p>
              <p
                className={`mt-0.5 ${
                  tokenExpired
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-amber-700 dark:text-amber-400"
                }`}
              >
                Reconnect or use Manual Setup to refresh your permanent token and keep incoming leads flowing.
              </p>
            </div>
          </div>
        )}

        {/* ── Connected ────────────────────────────────────────────── */}
        {hasCredentials ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 rounded-xl border border-border/40 bg-muted/20 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="size-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                {fullyConnected && !expiringSoon && !tokenExpired ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <WifiOff className="size-4 text-amber-500" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm text-foreground">{client?.display_phone_number || "Connected number"}</p>
                  {fullyConnected ? (
                    <ToneBadge tone="green" label="Connected" />
                  ) : (
                    <ToneBadge tone="orange" label="Pending token" />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 font-mono">
                  <span className="rounded-md bg-background/80 px-2 py-0.5 border border-border/30">WABA: {client?.waba_id || "—"}</span>
                  <span className="rounded-md bg-background/80 px-2 py-0.5 border border-border/30">Phone ID: {client?.phone_number_id || "—"}</span>
                  {client?.access_token_expires_at && daysRemaining !== null && daysRemaining >= 0 && (
                    <span className="rounded-md bg-background/80 px-2 py-0.5 border border-border/30">Expires: {daysRemaining}d</span>
                  )}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30">
              <Button
                size="sm"
                variant="outline"
                className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold px-3"
                onClick={testConnection}
                disabled={testing || !fullyConnected}
              >
                {testing ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : null}
                {testing ? "Testing…" : "Test connection"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold px-3"
                onClick={connect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Reconnect via Meta"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold px-3 gap-1"
                onClick={() => {
                  setManualWabaId(client?.waba_id || "");
                  setManualPhoneId(client?.phone_number_id || "");
                  setManualDisplayPhone(client?.display_phone_number || "");
                  setManualToken(client?.access_token || "");
                  setManualOpen(true);
                }}
              >
                <KeyRound className="size-3.5" />
                <span>Manual setup</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold px-3 text-destructive hover:text-destructive"
                    disabled={disconnecting}
                  >
                    {disconnecting ? "Disconnecting…" : "Disconnect"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl border-border/50 shadow-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-base font-bold tracking-tight">Disconnect WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground">
                      This will clear your stored WABA credentials and stop new WhatsApp leads from
                      being routed to your CRM. Existing leads and activity won't be affected. You
                      can reconnect at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="apple-button rounded-xl min-h-[44px] sm:min-h-0 sm:h-9 text-xs font-semibold">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="apple-button rounded-xl min-h-[44px] sm:min-h-0 sm:h-9 text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-2xs"
                      onClick={disconnect}
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          /* ── Not connected ─────────────────────────────────────── */
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Button
              onClick={connect}
              disabled={connecting}
              className="apple-button min-h-[44px] sm:min-h-0 sm:h-9 rounded-xl font-semibold text-xs px-4 shadow-2xs gap-1.5"
            >
              <MessageCircle className="size-4" />
              <span>{connecting ? "Connecting…" : "Connect WhatsApp Business account"}</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setManualOpen(true)}
              className="apple-button min-h-[44px] sm:min-h-0 sm:h-9 rounded-xl font-semibold text-xs px-4 gap-1.5"
            >
              <KeyRound className="size-4" />
              <span>Enter Credentials Manually</span>
            </Button>
            {!configured && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Embedded signup not configured yet — use <strong className="text-foreground">Enter Credentials Manually</strong> above or see <span className="font-mono text-[11px] bg-background/80 px-1 py-0.5 rounded border border-border/30">SETUP.md</span>.
              </p>
            )}
          </div>
        )}
      </div>

      {manualDialog}
    </div>
  );
}
