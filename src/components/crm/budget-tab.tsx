import { useMemo, useState } from "react";
import { Building2, ChevronDown, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyStateBadge, StatusBadge } from "@/components/crm/badges";
import { BUDGET_TIERS, formatMoney, type Lead } from "@/lib/crm";

/** Normalizes a lead's free-text `requirement` (set by the AI parser) into one of the three deal types. */
type DealType = "BUY" | "RENT" | "LEASE" | "OTHER";

const DEAL_TYPE_GROUPS: {
  key: DealType;
  label: string;
  tone: "indigo" | "green" | "purple" | "gray";
}[] = [
  { key: "BUY", label: "Buy", tone: "indigo" },
  { key: "RENT", label: "Rent", tone: "green" },
  { key: "LEASE", label: "Lease", tone: "purple" },
  { key: "OTHER", label: "Unspecified", tone: "gray" },
];

function dealType(requirement: string | null): DealType {
  const r = (requirement || "").toLowerCase();
  if (r.includes("rent")) return "RENT";
  if (r.includes("lease")) return "LEASE";
  if (r.includes("buy") || r.includes("sale") || r.includes("purchase")) return "BUY";
  return "OTHER";
}

export function BudgetTab({ leads }: { leads: Lead[] }) {
  const tiers = useMemo(
    () =>
      BUDGET_TIERS.map((t) => {
        const tierLeads = leads.filter((l) => (l.budget ?? 0) >= t.min && (l.budget ?? 0) < t.max);
        const groups = DEAL_TYPE_GROUPS.map((g) => ({
          ...g,
          leads: tierLeads.filter((l) => dealType(l.requirement) === g.key),
        })).filter((g) => g.leads.length > 0);
        return { ...t, leads: tierLeads, groups };
      }),
    [leads],
  );

  const byProperty = useMemo(() => {
    const map = new Map<string, { leads: Lead[]; visits: number }>();
    for (const l of leads) {
      const key = l.selected_property_name;
      if (!key) continue;
      const entry = map.get(key) ?? { leads: [], visits: 0 };
      entry.leads.push(l);
      if (l.status === "SITE_VISIT_BOOKED" || l.property_state === "SITE_VISIT_BOOKED")
        entry.visits += 1;
      map.set(key, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].leads.length - a[1].leads.length);
  }, [leads]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {tiers.map((tier) => (
          <Card key={tier.key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{tier.label}</span>
                <span className="crm-badge" data-tone="blue">
                  {tier.leads.length} leads
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{tier.hint}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {tier.leads.length === 0 && (
                <p className="text-sm text-muted-foreground">No leads in this tier.</p>
              )}
              {tier.groups.map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="crm-badge" data-tone={group.tone}>
                      {group.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.leads.length} lead{group.leads.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.leads.map((lead) => (
                      <LeadMiniCard key={lead.lead_id} lead={lead} />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4" /> Property breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {byProperty.length === 0 && (
            <p className="text-sm text-muted-foreground">No properties selected by leads yet.</p>
          )}
          {byProperty.map(([name, info]) => (
            <div key={name} className="rounded-xl border bg-card p-4">
              <p className="font-medium">{name}</p>
              <div className="mt-2 flex gap-2">
                <span className="crm-badge" data-tone="indigo">
                  {info.leads.length} interested
                </span>
                <span className="crm-badge" data-tone="green">
                  {info.visits} site visits
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {info.leads.slice(0, 5).map((l) => (
                  <li key={l.lead_id}>
                    {l.name || "Unnamed"} · {formatMoney(l.budget)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function LeadMiniCard({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{lead.name || "Unnamed"}</p>
          <p className="text-xs text-muted-foreground">
            {formatMoney(lead.budget)} · {lead.location || "No location"}
          </p>
        </div>
        <Button asChild size="sm" variant="outline" disabled={!lead.phone}>
          <a href={`tel:${lead.phone ?? ""}`}>
            <Phone /> Call
          </a>
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <StatusBadge value={lead.status} />
        <PropertyStateBadge value={lead.property_state} />
      </div>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="mt-2 px-0">
            <ChevronDown className={open ? "rotate-180 transition" : "transition"} /> Summary
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="whitespace-pre-wrap pt-1 text-sm text-muted-foreground">
          {lead.summary || "No summary yet."}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
