import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  LayoutList,
  LineChart,
  LogOut,
  MessageCircleWarning,
  RefreshCw,
  Share2,
  UserCircle,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BudgetTab } from "@/components/crm/budget-tab";
import { InventoryTab } from "@/components/crm/inventory-tab";
import { IntegrationsTab } from "@/components/crm/integrations-tab";
import { LeadsTab } from "@/components/crm/leads-tab";
import { PerformanceTab } from "@/components/crm/performance-tab";
import { ProfileTab } from "@/components/crm/profile-tab";
import { WhatsAppConnectCard } from "@/components/crm/whatsapp-connect";
import { useClient, useExecutives, useInventory, useLeads } from "@/lib/crm-data";
import { useCurrentUser, useSignOut } from "@/lib/auth";
import { inDatePreset, type DatePreset } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Nextgn Realtors CRM & Inventory" },
      {
        name: "description",
        content:
          "Manage property leads, site visits, sales team performance and live inventory from one admin dashboard.",
      },
      { property: "og:title", content: "Dashboard — Nextgn Realtors CRM & Inventory" },
      {
        property: "og:description",
        content:
          "Track leads, book site visits, monitor executive response times and manage property inventory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "all", label: "All Time" },
];

const NAV_ITEMS = [
  { value: "leads", label: "Leads CRM", icon: LayoutList, adminOnly: false },
  { value: "budget", label: "Budget & Properties", icon: Wallet, adminOnly: true },
  { value: "team", label: "Team Performance", icon: LineChart, adminOnly: true },
  { value: "inventory", label: "Inventory", icon: Building2, adminOnly: true },
  { value: "integrations", label: "Lead Sources & WhatsApp", icon: Share2, adminOnly: true },
  { value: "profile", label: "Profile", icon: UserCircle, adminOnly: false },
] as const;

function Dashboard() {
  const [preset, setPreset] = useState<DatePreset>("all");
  const leadsQuery = useLeads();
  const inventoryQuery = useInventory();
  const { data: me, isFetching: meFetching } = useCurrentUser();
  const { data: executives = [] } = useExecutives();
  const { data: client } = useClient(me?.clientId);
  const signOut = useSignOut();
  const navigate = useNavigate();

  const isAdmin = me?.role === "admin";
  const clientId = me?.clientId ?? null;

  // Brand-new sign-ins (no client_id yet, not claimed as an invited
  // executive) need to onboard themselves before they can see a dashboard.
  // Wait out any in-flight refetch first — right after onboarding finishes,
  // this query may still be serving a stale cached "role: null" while a
  // background refetch (triggered by onboarding's invalidateQueries) is
  // still resolving; redirecting on that stale read is what caused the
  // dashboard <-> onboarding bounce-loop.
  useEffect(() => {
    if (!meFetching && me && me.role === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [me, meFetching, navigate]);

  const myExecutiveId = useMemo(
    () => executives.find((e) => e.user_id === me?.id)?.id ?? null,
    [executives, me?.id],
  );

  const myLeads = useMemo(() => {
    const all = leadsQuery.data ?? [];
    if (!me || isAdmin) return all;
    return all.filter((l) => l.assigned_executive_id === myExecutiveId);
  }, [leadsQuery.data, me, isAdmin, myExecutiveId]);

  const leads = useMemo(
    () => myLeads.filter((l) => inDatePreset(l.created_at, preset)),
    [myLeads, preset],
  );

  if (me && me.role === null) return null; // redirecting to /onboarding

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                {client?.company_name || "Nextgn Realtors Admin Panel"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {me
                  ? `${me.fullName || me.email} · ${isAdmin ? "Admin" : "Sales Executive"}`
                  : "Loading…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border bg-background p-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    preset === p.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                leadsQuery.refetch();
                inventoryQuery.refetch();
              }}
              aria-label="Refresh data"
            >
              <RefreshCw className={leadsQuery.isFetching ? "animate-spin" : ""} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <Tabs defaultValue="leads">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <TabsList className="flex h-auto w-full shrink-0 gap-1 overflow-x-auto bg-transparent p-0 md:w-56 md:flex-col md:items-stretch md:overflow-visible">
              {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="shrink-0 justify-start gap-2 rounded-lg px-3 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none md:w-full"
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="min-w-0 flex-1 space-y-6">
              {isAdmin && client && !client.access_token && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  <MessageCircleWarning className="size-4 shrink-0" />
                  <span className="flex-1">
                    Your WhatsApp Business account isn't connected yet — leads from WhatsApp won't
                    reach this dashboard until it is.
                  </span>
                  <WhatsAppConnectCard clientId={client.id} compact />
                </div>
              )}

              <TabsContent value="leads" className="mt-0">
                <LeadsTab
                  leads={leads}
                  loading={leadsQuery.isLoading}
                  lockedExecutive={isAdmin ? null : me?.fullName || null}
                />
              </TabsContent>
              {isAdmin && (
                <>
                  <TabsContent value="budget" className="mt-0">
                    <BudgetTab leads={leads} />
                  </TabsContent>
                  <TabsContent value="team" className="mt-0">
                    <PerformanceTab leads={leadsQuery.data ?? []} clientId={clientId} />
                  </TabsContent>
                  <TabsContent value="inventory" className="mt-0">
                    <InventoryTab
                      properties={inventoryQuery.data ?? []}
                      loading={inventoryQuery.isLoading}
                      clientId={clientId}
                    />
                  </TabsContent>
                  <TabsContent value="integrations" className="mt-0">
                    <IntegrationsTab clientId={clientId} client={client ?? null} />
                  </TabsContent>
                </>
              )}
              <TabsContent value="profile" className="mt-0">
                <ProfileTab />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </main>
  );
}
