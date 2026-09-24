import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToneBadge } from "@/components/crm/badges";
import { linkWhatsAppAccount } from "@/lib/onboarding.functions";
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
  const signupData = useRef<SignupPayload>({});

  const configured = !!META_APP_ID && !!META_CONFIG_ID;
  const connected = !!client?.access_token && !!client?.phone_number_id;

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
        {connected ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
            <CheckCircle2 className="size-5 text-green-600" />
            <div className="flex-1">
              <p className="font-medium">{client?.display_phone_number || "Connected number"}</p>
              <p className="text-xs text-muted-foreground">
                WABA ID: {client?.waba_id || "—"} · Phone number ID:{" "}
                {client?.phone_number_id || "—"}
              </p>
            </div>
            <ToneBadge tone="green" label="Connected" />
            <Button size="sm" variant="outline" onClick={connect} disabled={connecting}>
              Reconnect / switch number
            </Button>
          </div>
        ) : (
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
