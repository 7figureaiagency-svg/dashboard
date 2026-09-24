import { useMemo, useState } from "react";
import { Building2, ChevronDown, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyStateBadge, StatusBadge } from "@/components/crm/badges";
import { BUDGET_TIERS, formatMoney, type Lead } from "@/lib/crm";

export function BudgetTab({ leads }: { leads: Lead[] }) {
  const tiers = useMemo(
    () =>
      BUDGET_TIERS.map((t) => ({
        ...t,
        leads: leads.filter((l) => (l.budget ?? 0) >= t.min && (l.budget ?? 0) < t.max),
      })),
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
            <CardContent className="space-y-3">
              {tier.leads.length === 0 && (
                <p className="text-sm text-muted-foreground">No leads in this tier.</p>
              )}
              {tier.leads.map((lead) => (
                <LeadMiniCard key={lead.lead_id} lead={lead} />
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
