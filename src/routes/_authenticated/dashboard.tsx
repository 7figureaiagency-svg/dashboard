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
import { ThemeToggle } from "@/components/theme-toggle";
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
  { value: "leads", label: "Leads CRM", shortLabel: "Leads", icon: LayoutList, adminOnly: false },
  { value: "inventory", label: "Live Inventory", shortLabel: "Inventory", icon: Building2, adminOnly: true },
  { value: "team", label: "Team Performance", shortLabel: "Team", icon: LineChart, adminOnly: true },
  { value: "budget", label: "Budget & Pipeline", shortLabel: "Budget", icon: Wallet, adminOnly: true },
  { value: "integrations", label: "Lead Sources & Channels", shortLabel: "Channels", icon: Share2, adminOnly: true },
  { value: "profile", label: "Profile & Settings", shortLabel: "Profile", icon: UserCircle, adminOnly: false },
] as const;

function Dashboard() {
  const [activeTab, setActiveTab] = useState("leads");
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
    () =>
      myLeads.filter(
        (l) =>
          inDatePreset(l.created_at, preset) ||
          inDatePreset(l.site_visit_datetime, preset) ||
          inDatePreset(l.site_visit_at, preset),
      ),
    [myLeads, preset],
  );

  if (me && me.role === null) return null; // redirecting to /onboarding

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 apple-glass border-b border-border/40">
        <div className="mx-auto max-w-7xl px-3.5 py-2.5 sm:px-6 sm:py-3.5">
          {/* Main Header Bar */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: Brand / Tenant Identity */}
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs ring-1 ring-border/50">
                <Building2 className="size-4.5 sm:size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="text-sm sm:text-lg font-bold tracking-tight text-foreground truncate max-w-[160px] xs:max-w-[220px] sm:max-w-none">
                    {client?.company_name || "Nextgn Realtors"}
                  </h1>
                  <span className="hidden xs:inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground border border-accent/25 shrink-0">
                    {isAdmin ? "Admin" : "Executive"}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate max-w-[190px] xs:max-w-xs sm:max-w-none mt-0.5">
                  {me
                    ? `${me.fullName || me.email} · ${isAdmin ? "Lead & Inventory Management" : "Field Executive"}`
                    : "Loading…"}
                </p>
              </div>
            </div>

            {/* Right: Actions Cluster */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Desktop Presets Inline */}
              <div className="hidden sm:flex items-center rounded-xl border border-border/30 bg-muted/60 p-1 shadow-2xs backdrop-blur-xs">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPreset(p.key)}
                    className={`apple-button rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                      preset === p.key
                        ? "bg-card text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <ThemeToggle />

              <Button
                variant="outline"
                size="icon"
                className="apple-button size-8.5 rounded-xl border-border/40 bg-card/80 hover:bg-muted shadow-2xs"
                onClick={() => {
                  leadsQuery.refetch();
                  inventoryQuery.refetch();
                }}
                aria-label="Refresh data"
                title="Refresh dashboard data"
              >
                <RefreshCw className={`size-3.5 ${leadsQuery.isFetching ? "animate-spin text-primary" : "text-muted-foreground"}`} />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="apple-button h-8.5 rounded-xl text-xs text-muted-foreground hover:text-destructive gap-1.5 px-2 sm:px-3"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/auth", replace: true });
                }}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-3.5" /> <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>

          {/* Mobile Presets Segmented Control Row (< 640px) */}
          <div className="mt-2.5 sm:hidden">
            <div className="grid grid-cols-3 rounded-xl border border-border/40 bg-muted/70 p-1 shadow-2xs">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={`apple-button rounded-lg py-1.5 text-xs font-semibold transition-all text-center ${
                    preset === p.key
                      ? "bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-6 pb-28 md:pb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            {/* Desktop Navigation Sidebar (>= 768px) */}
            <TabsList className="hidden md:flex touch-scroll h-auto w-60 shrink-0 flex-col items-stretch gap-1.5 bg-transparent p-0 overflow-visible">
              {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.value;
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="group relative justify-start gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all apple-button data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs data-[state=active]:border data-[state=active]:border-border/60 text-muted-foreground hover:text-foreground hover:bg-card/50 w-full"
                  >
                    <Icon className={`size-4.5 shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                    <span className="flex-1 text-left tracking-tight">{item.label}</span>
                    {item.value === "leads" && leads.length > 0 && (
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums transition-colors ${
                        isActive
                          ? "bg-primary/12 text-primary"
                          : "bg-muted/80 text-muted-foreground"
                      }`}>
                        {leads.length}
                      </span>
                    )}
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
                    <BudgetTab leads={leads} inventory={inventoryQuery.data ?? []} />
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

      {/* ── 📱 Mobile Floating Thumb Dock (Native Phone Navigation < 768px) ── */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden apple-glass border-t border-border/60 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 px-2 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-around gap-1 max-w-md mx-auto">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setActiveTab(item.value)}
                className={`apple-button relative flex flex-1 flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-semibold transition-all min-h-[46px] ${
                  isActive
                    ? "text-primary bg-primary/12 font-bold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative">
                  <Icon className={`size-5 transition-transform ${isActive ? "text-primary scale-110" : "text-muted-foreground"}`} />
                  {item.value === "leads" && leads.length > 0 && (
                    <span className="absolute -top-1 -right-2.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow-xs">
                      {leads.length > 99 ? "99+" : leads.length}
                    </span>
                  )}
                </div>
                <span className="mt-1 truncate max-w-[56px] tracking-tight">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
