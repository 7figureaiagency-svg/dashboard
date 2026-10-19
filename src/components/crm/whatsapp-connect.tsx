import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
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
import { ToneBadge } from "@/components/crm/badges";
import {
  disconnectWhatsApp,
  linkWhatsAppAccount,
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

const META_APP_ID = import.meta.env["VITE_META_APP_ID"] as string | undefined;
const META_CONFIG_ID = import.meta.env["VITE_META_CONFIG_ID"] as string | undefined;
const META_GRAPH_VERSION =
  (import.meta.env["VITE_META_GRAPH_VERSION"] as string | undefined) || "v21.0";

let fbSdkPromise: Promise<void> | null = null;

/** Lazily injects the Facebook JS SDK exactly once and resolves once `FB` is ready. */
function loadFacebookSdk(): Promise<void> {
  if (fbSdkPromise) return fbSdkPromise;
  fbSdkPromise = new Promise((resolve) => {
    if (window.FB) {
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID,
        autoLogAppEvents: true,
        xfbml: false,
        version: META_GRAPH_VERSION,
      });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
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
    } catch {
      toast.error("Couldn't load the Facebook SDK. Check your network and try again.");
      setConnecting(false);
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
          token_invalid: "Token is invalid or expired — reconnect to refresh it.",
          number_not_found: "Phone number ID not found on this WABA — reconnect to fix it.",
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

  if (compact) {
    return (
      <Button size="sm" onClick={connect} disabled={connecting} className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold gap-1.5 shadow-2xs">
        <MessageCircle className="size-4" /> <span>{connecting ? "Connecting…" : "Connect WhatsApp"}</span>
      </Button>
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
                Token pending — manual setup required
              </p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400 leading-relaxed">
                WhatsApp details saved, but a permanent access token hasn't been issued yet. Follow
                the System User Token steps in <span className="font-mono text-[11px] bg-background/80 px-1 py-0.5 rounded border border-border/30">SETUP.md</span>{" "}
                or reconnect below to complete the setup.
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
                Reconnect to refresh the token and keep incoming leads flowing.
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
                {connecting ? "Connecting…" : "Reconnect / switch"}
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
            <Button onClick={connect} disabled={connecting} className="apple-button min-h-[44px] sm:min-h-0 sm:h-9 rounded-xl font-semibold text-xs px-4 shadow-2xs gap-1.5">
              <MessageCircle className="size-4" />
              <span>{connecting ? "Connecting…" : "Connect WhatsApp Business account"}</span>
            </Button>
            {!configured && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Not configured yet on this deployment — see <span className="font-mono text-[11px] bg-background/80 px-1 py-0.5 rounded border border-border/30">SETUP.md</span> for the Meta App steps needed before connecting.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
