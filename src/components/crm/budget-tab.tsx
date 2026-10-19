import { useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  Phone,
  TrendingUp,
  Wallet,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Search,
  MapPin,
  Sparkles,
  Layers,
  Home,
  KeyRound,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyStateBadge, StatusBadge } from "@/components/crm/badges";
import {
  SALE_BUDGET_TIERS,
  RENT_BUDGET_TIERS,
  buildLeadSummary,
  formatMoney,
  formatRatePerSqft,
  isVisitBookedStatus,
  type Lead,
  type PropertyRow,
} from "@/lib/crm";

type DealType = "BUY" | "RENT" | "LEASE" | "OTHER";

/**
 * Normalizes a lead's requirement, property type, or budget into Buy vs Rent.
 * Under ₹1.5L budget with unspecified requirement is inferred as Rent in Indian RE.
 */
function getLeadDealType(lead: Lead): "BUY" | "RENT" {
  const req = (lead.requirement || "").toLowerCase();
  const propType = (lead.property_type || "").toLowerCase();
  if (req.includes("rent") || req.includes("lease") || propType.includes("rent") || propType.includes("lease")) {
    return "RENT";
  }
  if (req.includes("buy") || req.includes("sale") || req.includes("purchase")) {
    return "BUY";
  }
  const b = Number(lead.budget ?? 0);
  if (b > 0 && b <= 150000) return "RENT";
  return "BUY";
}

export function BudgetTab({
  leads,
  inventory = [],
}: {
  leads: Lead[];
  inventory?: PropertyRow[];
}) {
  const [dealFilter, setDealFilter] = useState<"ALL" | "BUY" | "RENT">("ALL");
  const [search, setSearch] = useState("");
  const [selectedLocality, setSelectedLocality] = useState<string | null>(null);

  // 1. Pipeline High-Level Financial Metrics
  const metrics = useMemo(() => {
    let totalBuyVal = 0;
    let buyCount = 0;
    let totalRentVal = 0;
    let rentCount = 0;
    let highIntentVal = 0;
    let highIntentCount = 0;

    for (const l of leads) {
      const b = Number(l.budget ?? 0);
      const isRent = getLeadDealType(l) === "RENT";
      const isHighIntent =
        isVisitBookedStatus(l.status) ||
        l.property_state === "SITE_VISIT_BOOKED" ||
        l.property_state === "PROPERTY_SELECTED" ||
        l.status === "QUALIFIED";

      if (isRent) {
        if (b > 0) totalRentVal += b;
        rentCount++;
      } else {
        if (b > 0) totalBuyVal += b;
        buyCount++;
      }

      if (isHighIntent && b > 0) {
        highIntentVal += b;
        highIntentCount++;
      }
    }

    const avgBuyTicket = buyCount > 0 && totalBuyVal > 0 ? Math.round(totalBuyVal / buyCount) : 0;

    return {
      totalBuyVal,
      buyCount,
      totalRentVal,
      rentCount,
      avgBuyTicket,
      highIntentVal,
      highIntentCount,
    };
  }, [leads]);

  // 2. Micro-Market / Locality Demand Hub
  const topLocalities = useMemo(() => {
    const map = new Map<string, { count: number; totalDemand: number; visits: number }>();
    for (const l of leads) {
      const loc = (l.location || "").trim();
      if (!loc) continue;
      const key = loc.split(",")[0].trim();
      if (!key) continue;
      const existing = map.get(key) ?? { count: 0, totalDemand: 0, visits: 0 };
      existing.count += 1;
      existing.totalDemand += Number(l.budget ?? 0);
      if (isVisitBookedStatus(l.status) || l.property_state === "SITE_VISIT_BOOKED") {
        existing.visits += 1;
      }
      map.set(key, existing);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);
  }, [leads]);

  // 3. Filtered Leads by Search & Locality
  const eligibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (dealFilter !== "ALL") {
        const type = getLeadDealType(l);
        if (type !== dealFilter) return false;
      }
      if (selectedLocality) {
        const loc = (l.location || "").toLowerCase();
        if (!loc.includes(selectedLocality.toLowerCase())) return false;
      }
      if (q) {
        const name = (l.name || "").toLowerCase();
        const phone = (l.phone || "").toLowerCase();
        const loc = (l.location || "").toLowerCase();
        const req = (l.requirement || "").toLowerCase();
        const prop = (l.selected_property_name || "").toLowerCase();
        if (
          !name.includes(q) &&
          !phone.includes(q) &&
          !loc.includes(q) &&
          !req.includes(q) &&
          !prop.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [leads, dealFilter, selectedLocality, search]);

  // 4. Budget Tiers & Supply vs Demand Matching Engine
  const tiersData = useMemo(() => {
    const activeTiers = dealFilter === "RENT" ? RENT_BUDGET_TIERS : SALE_BUDGET_TIERS;
    const isRentMode = dealFilter === "RENT";

    return activeTiers.map((tier) => {
      // Matching Leads in this tier
      const tierLeads = eligibleLeads.filter((l) => {
        const b = Number(l.budget ?? 0);
        return b >= tier.min && b < tier.max;
      });

      // Matching Inventory units in this tier
      const matchingInventory = inventory.filter((p) => {
        const price = Number(p.price ?? 0);
        if (price < tier.min || price >= tier.max) return false;
        const isRentalProperty =
          (p.listing_type || "").toUpperCase() === "RENT" ||
          (p.property_category || "").toUpperCase() === "RENT";
        return isRentMode ? isRentalProperty : !isRentalProperty;
      });

      const tierDemandValue = tierLeads.reduce((sum, l) => sum + Number(l.budget ?? 0), 0);
      const tierSupplyValue = matchingInventory.reduce((sum, p) => sum + Number(p.price ?? 0), 0);

      // Opportunity Intelligence
      let opportunity = {
        label: "Empty Pipeline",
        tone: "gray" as const,
        icon: AlertTriangle,
        hint: "No active buyer demand or inventory in this bracket.",
      };

      if (tierLeads.length > 0 && matchingInventory.length === 0) {
        opportunity = {
          label: `🚨 Shortage (${tierLeads.length} Buyers Waiting)`,
          tone: "yellow" as const,
          icon: Flame,
          hint: `0 properties available for ${tierLeads.length} active leads. High builder/resale listing opportunity!`,
        };
      } else if (tierLeads.length > matchingInventory.length) {
        opportunity = {
          label: `🔥 High Demand (+${tierLeads.length - matchingInventory.length} Deficit)`,
          tone: "yellow" as const,
          icon: Flame,
          hint: `Demand exceeds supply by ${tierLeads.length - matchingInventory.length} buyers. Fast closing potential.`,
        };
      } else if (tierLeads.length > 0 && matchingInventory.length >= tierLeads.length) {
        opportunity = {
          label: `✅ Well Stocked (${matchingInventory.length} Units)`,
          tone: "green" as const,
          icon: CheckCircle2,
          hint: `${matchingInventory.length} inventory units ready to show to ${tierLeads.length} qualified leads.`,
        };
      } else if (tierLeads.length === 0 && matchingInventory.length > 0) {
        opportunity = {
          label: `📦 Surplus (${matchingInventory.length} Units)`,
          tone: "blue" as const,
          icon: Sparkles,
          hint: `${matchingInventory.length} units available. Launch targeted buyer ads or WhatsApp outreach.`,
        };
      }

      return {
        ...tier,
        isRentMode,
        leads: tierLeads,
        demandValue: tierDemandValue,
        matchingInventory,
        supplyValue: tierSupplyValue,
        opportunity,
      };
    });
  }, [eligibleLeads, inventory, dealFilter]);

  // 5. Property Traction / Selected Projects Breakdown
  const propertyTraction = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        leads: Lead[];
        visits: number;
        inventoryUnit?: PropertyRow;
      }
    >();

    // First map actual inventory units
    for (const inv of inventory) {
      map.set(inv.project_name.toLowerCase(), {
        name: inv.project_name,
        leads: [],
        visits: 0,
        inventoryUnit: inv,
      });
    }

    // Associate leads
    for (const l of leads) {
      const propName = l.selected_property_name;
      if (!propName) continue;
      const key = propName.toLowerCase();
      const existing = map.get(key) ?? {
        name: propName,
        leads: [],
        visits: 0,
      };
      existing.leads.push(l);
      if (isVisitBookedStatus(l.status) || l.property_state === "SITE_VISIT_BOOKED") {
        existing.visits += 1;
      }
      map.set(key, existing);
    }

    return Array.from(map.values())
      .filter((p) => p.leads.length > 0 || p.inventoryUnit !== undefined)
      .sort((a, b) => b.leads.length - a.leads.length || b.visits - a.visits);
  }, [leads, inventory]);

  return (
    <div className="space-y-6">
      {/* 1. Top Executive Pipeline KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Buyer Demand Pipeline
            </span>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {formatMoney(metrics.totalBuyVal)}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="size-3 text-indigo-500" />
              <span>{metrics.buyCount} active purchasing leads</span>
            </p>
          </div>
          <div className="rounded-xl p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Wallet className="size-6" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Rental Demand (Run-Rate)
            </span>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {formatMoney(metrics.totalRentVal, { isRent: true })}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <KeyRound className="size-3 text-emerald-500" />
              <span>{metrics.rentCount} active tenant leads</span>
            </p>
          </div>
          <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="size-6" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Avg. Buyer Ticket Size
            </span>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {formatMoney(metrics.avgBuyTicket)}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Home className="size-3 text-blue-500" />
              <span>Core buying sweet-spot</span>
            </p>
          </div>
          <div className="rounded-xl p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <Building2 className="size-6" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              High-Intent Pipeline
            </span>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {formatMoney(metrics.highIntentVal)}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Flame className="size-3 text-amber-500 fill-amber-500" />
              <span>{metrics.highIntentCount} visits booked / selected</span>
            </p>
          </div>
          <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Flame className="size-6" />
          </div>
        </div>
      </div>

      {/* 2. Controls & Filter Strip */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Deal Type Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg overflow-x-auto w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setDealFilter("ALL")}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                dealFilter === "ALL"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({leads.length})
            </button>
            <button
              type="button"
              onClick={() => setDealFilter("BUY")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                dealFilter === "BUY"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Buy / Sale ({metrics.buyCount})
            </button>
            <button
              type="button"
              onClick={() => setDealFilter("RENT")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                dealFilter === "RENT"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Rent / Lease ({metrics.rentCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search lead, location, requirement..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {/* Micro-market / Hot Localities Pills */}
        {topLocalities.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t text-xs overflow-x-auto">
            <span className="text-muted-foreground font-medium shrink-0 flex items-center gap-1">
              <MapPin className="size-3 text-primary" /> Hot Localities:
            </span>
            <button
              type="button"
              onClick={() => setSelectedLocality(null)}
              className={`px-2.5 py-1 rounded-full text-xs transition shrink-0 ${
                selectedLocality === null
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All Areas
            </button>
            {topLocalities.map(([loc, data]) => (
              <button
                key={loc}
                type="button"
                onClick={() => setSelectedLocality(selectedLocality === loc ? null : loc)}
                className={`px-2.5 py-1 rounded-full text-xs transition shrink-0 flex items-center gap-1.5 ${
                  selectedLocality === loc
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span>{loc}</span>
                <span className="opacity-75 font-mono text-[11px]">({data.count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. Indian Budget Segments & Supply vs Demand Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tiersData.map((tier) => {
          const OppIcon = tier.opportunity.icon;
          return (
            <Card key={tier.key} className="flex flex-col justify-between border-2 border-muted/80 hover:border-primary/30 transition shadow-sm">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold">{tier.label}</CardTitle>
                    <p className="text-xs font-medium text-muted-foreground">{tier.hint}</p>
                  </div>
                  <span className="crm-badge" data-tone={tier.tone}>
                    {tier.leads.length} Leads
                  </span>
                </div>

                {/* Supply vs Demand Comparison Bar */}
                <div className="mt-3 space-y-1.5 pt-2 border-t border-dashed">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Buyer Demand:</span>
                    <span className="font-semibold text-foreground">
                      {formatMoney(tier.demandValue, { isRent: tier.isRentMode })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Inventory Available:</span>
                    <span className="font-semibold text-foreground">
                      {tier.matchingInventory.length} unit{tier.matchingInventory.length === 1 ? "" : "s"}
                      {tier.supplyValue > 0 && ` (${formatMoney(tier.supplyValue, { isRent: tier.isRentMode })})`}
                    </span>
                  </div>

                  {/* Opportunity Signal Badge */}
                  <div
                    className={`mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      tier.opportunity.tone === "yellow"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                        : tier.opportunity.tone === "green"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                        : tier.opportunity.tone === "blue"
                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                    title={tier.opportunity.hint}
                  >
                    <OppIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{tier.opportunity.label}</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-3 space-y-2.5 flex-1 max-h-[500px] overflow-y-auto">
                {tier.leads.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No active leads in this budget bracket.
                  </div>
                ) : (
                  tier.leads.map((lead) => (
                    <LeadMiniCard key={lead.lead_id} lead={lead} isRent={tier.isRentMode} />
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 4. Live Inventory Traction & Demand Matrix */}
      <Card>
        <CardHeader className="pb-3 border-b bg-muted/10">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-primary" /> Property Demand & Site Visit Traction
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Showing active inventory and buyer interest
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {propertyTraction.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full py-6 text-center">
              No inventory or lead-selected properties available yet.
            </p>
          )}
          {propertyTraction.map((item) => {
            const inv = item.inventoryUnit;
            const rateFormatted = inv?.price && inv?.area_sqft ? formatRatePerSqft(inv.price, inv.area_sqft) : null;
            const isRental = (inv?.listing_type || "").toUpperCase() === "RENT";

            return (
              <div key={item.name} className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground text-sm leading-tight">{item.name}</p>
                    {inv?.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="size-3 text-muted-foreground/70" />
                        <span>{inv.location}</span>
                      </p>
                    )}
                  </div>
                  {inv?.price && (
                    <div className="text-right shrink-0">
                      <div className="font-bold text-sm text-foreground">
                        {formatMoney(inv.price, { isRent: isRental })}
                      </div>
                      {rateFormatted && (
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {rateFormatted}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                  <span className="crm-badge" data-tone="indigo">
                    <Users className="size-3" /> {item.leads.length} Interested Lead{item.leads.length === 1 ? "" : "s"}
                  </span>
                  <span className="crm-badge" data-tone="green">
                    <CheckCircle2 className="size-3" /> {item.visits} Site Visit{item.visits === 1 ? "" : "s"}
                  </span>
                </div>

                {item.leads.length > 0 && (
                  <div className="pt-2 border-t text-xs space-y-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Recent Interested Leads:
                    </span>
                    <ul className="space-y-1">
                      {item.leads.slice(0, 3).map((l) => (
                        <li key={l.lead_id} className="flex items-center justify-between text-muted-foreground">
                          <span className="font-medium text-foreground truncate max-w-[140px]">
                            {l.name || "Unnamed Lead"}
                          </span>
                          <span className="font-mono text-[11px]">
                            {formatMoney(l.budget, { isRent: getLeadDealType(l) === "RENT" })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function LeadMiniCard({ lead, isRent }: { lead: Lead; isRent?: boolean }) {
  const [open, setOpen] = useState(false);
  const isLeadRent = isRent || getLeadDealType(lead) === "RENT";

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm hover:border-primary/40 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">{lead.name || "Unnamed Lead"}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <span className="font-bold text-foreground">
              {formatMoney(lead.budget, { isRent: isLeadRent })}
            </span>
            <span>·</span>
            <span className="truncate max-w-[120px]">{lead.location || "Location pending"}</span>
          </div>
        </div>

        {/* Strict Call-Only CTA policy (tel:) */}
        <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs shrink-0" disabled={!lead.phone}>
          <a href={`tel:${lead.phone ?? ""}`}>
            <Phone className="size-3.5 mr-1" /> Call
          </a>
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1 items-center">
        <StatusBadge value={lead.status} />
        <PropertyStateBadge value={lead.property_state} />
        {lead.requirement && (
          <span className="crm-badge" data-tone="blue">
            {lead.requirement}
          </span>
        )}
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="mt-1 h-6 px-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className={`size-3.5 mr-1 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "Hide Details" : "Lead Insights"}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 text-xs text-muted-foreground leading-relaxed border-t mt-2">
          {buildLeadSummary(lead)}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
