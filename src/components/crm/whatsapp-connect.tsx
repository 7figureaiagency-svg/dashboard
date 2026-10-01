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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Button size="sm" onClick={connect} disabled={connecting}>
        <MessageCircle className="size-4" /> {connecting ? "Connecting…" : "Connect WhatsApp"}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4" /> WhatsApp Business account
        </CardTitle>
        <CardDescription>
          Link your Meta WhatsApp Business (Cloud API) number so incoming chats are routed to your
          leads automatically — no manual setup needed once connected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* ── Pending-token warning ─────────────────────────────────── */}
        {pendingToken && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Token pending — manual setup required
              </p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                WhatsApp details saved, but a permanent access token hasn't been issued yet. Follow
                the System User Token steps in <span className="font-mono text-xs">SETUP.md</span>{" "}
                or reconnect below to complete the setup.
              </p>
            </div>
          </div>
        )}

        {/* ── Token expiry warning ──────────────────────────────────── */}
        {fullyConnected && (expiringSoon || tokenExpired) && (
          <div
            className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
              tokenExpired
                ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
            }`}
          >
            <Clock
              className={`mt-0.5 size-4 shrink-0 ${
                tokenExpired
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            />
            <div className="flex-1">
              <p
                className={`font-medium ${
                  tokenExpired
                    ? "text-red-800 dark:text-red-300"
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
                    ? "text-red-700 dark:text-red-400"
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
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
            {fullyConnected && !expiringSoon && !tokenExpired ? (
              <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
            ) : (
              <WifiOff className="size-5 text-amber-500" />
            )}
            <div className="flex-1">
              <p className="font-medium">{client?.display_phone_number || "Connected number"}</p>
              <p className="text-xs text-muted-foreground">
                WABA ID: {client?.waba_id || "—"} · Phone number ID:{" "}
                {client?.phone_number_id || "—"}
                {client?.access_token_expires_at && daysRemaining !== null && daysRemaining >= 0 && (
                  <> · Token expires in {daysRemaining}d</>
                )}
              </p>
            </div>
            {fullyConnected ? (
              <ToneBadge tone="green" label="Connected" />
            ) : (
              <ToneBadge tone="orange" label="Pending token" />
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={testConnection}
                disabled={testing || !fullyConnected}
              >
                {testing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                {testing ? "Testing…" : "Test connection"}
              </Button>
              <Button size="sm" variant="outline" onClick={connect} disabled={connecting}>
                {connecting ? "Connecting…" : "Reconnect / switch number"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={disconnecting}>
                    {disconnecting ? "Disconnecting…" : "Disconnect"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will clear your stored WABA credentials and stop new WhatsApp leads from
                      being routed to your CRM. Existing leads and activity won't be affected. You
                      can reconnect at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={connect} disabled={connecting}>
              <MessageCircle className="size-4" />
              {connecting ? "Connecting…" : "Connect WhatsApp Business account"}
            </Button>
            {!configured && (
              <p className="text-xs text-muted-foreground">
                Not configured yet on this deployment — see SETUP.md for the Meta App steps needed
                before this button will work.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
