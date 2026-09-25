import { useMemo, useState } from "react";
import { Phone, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { PropertyStateBadge, StatusBadge, ToneBadge } from "@/components/crm/badges";
import { LeadDrawer } from "@/components/crm/lead-drawer";
import { ExecutiveDrawer } from "@/components/crm/executive-drawer";
import { useActivity, useUpdateLead } from "@/lib/crm-data";
import { formatDate, formatMoney, STATUS_MAP, type Lead, type Period } from "@/lib/crm";

const ALL = "__all__";

const STATUS_FILTER_OPTIONS = [
  "SITE_VISIT_BOOKED",
  "VISIT_DONE",
  "QUALIFIED",
  "QUALIFYING",
  "VISIT_MISSED",
  "NOT_INTERESTED",
];

export function LeadsTab({
  leads,
  loading,
  lockedExecutive = null,
}: {
  leads: Lead[];
  loading: boolean;
  /** When set, the executive filter is locked to this person. */
  lockedExecutive?: string | null;
}) {
  const [executive, setExecutive] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [profilePeriod, setProfilePeriod] = useState<Period>("30d");
  const update = useUpdateLead();
  const { data: allActivity = [] } = useActivity();

  const activity = useMemo(() => {
    const ids = new Set(leads.map((l) => l.lead_id));
    return allActivity.filter((a) => ids.has(a.lead_id));
  }, [allActivity, leads]);

  const executives = useMemo(
    () =>
      Array.from(new Set(leads.map((l) => l.assigned_executive_name).filter(Boolean))) as string[],
    [leads],
  );
  const sources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source).filter(Boolean))) as string[],
    [leads],
  );

  const rows = useMemo(
    () =>
      leads.filter((l) => {
        if (executive !== ALL && l.assigned_executive_name !== executive) return false;
        if (status !== ALL && l.status !== status) return false;
        if (source !== ALL && l.source !== source) return false;
        if (from && (!l.created_at || new Date(l.created_at) < new Date(from))) return false;
        if (to && (!l.created_at || new Date(l.created_at) > new Date(`${to}T23:59:59`)))
          return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = `${l.name ?? ""} ${l.phone ?? ""} ${l.selected_property_name ?? ""}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [leads, executive, status, source, from, to, search],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal className="size-4" /> Filters
          </div>
          {lockedExecutive ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Executive</p>
              <div className="flex h-9 min-w-[150px] items-center rounded-md border bg-muted px-3 text-sm">
                {lockedExecutive}
              </div>
            </div>
          ) : (
            <FilterSelect
              label="Executive"
              value={executive}
              onChange={setExecutive}
              options={executives}
            />
          )}
          <FilterSelect
            label="Status"
            allLabel="All Statuses"
            value={status}
            onChange={setStatus}
            options={STATUS_FILTER_OPTIONS}
            render={(v) => STATUS_MAP[v]?.label ?? v}
          />
          <FilterSelect label="Source" value={source} onChange={setSource} options={sources} />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">From</p>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">To</p>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="relative min-w-[180px] flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">Search</p>
            <Search className="absolute left-3 top-[30px] size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name, phone or property"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI bot</TableHead>
                <TableHead>Selected property</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    Loading leads…
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No leads match these filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((lead) => (
                <TableRow key={lead.lead_id}>
                  <TableCell className="font-medium">{lead.name || "Unnamed"}</TableCell>
                  <TableCell>
                    {lead.assigned_executive_name ? (
                      <button
                        className="font-medium text-primary hover:underline"
                        onClick={() => setProfile(lead.assigned_executive_name)}
                      >
                        {lead.assigned_executive_name}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.phone || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge value={lead.status} />
                      <PropertyStateBadge value={lead.property_state} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!lead.bot_active}
                        aria-label="Toggle AI bot"
                        onCheckedChange={(v) =>
                          update.mutate({
                            leadId: lead.lead_id,
                            values: { bot_active: v },
                            message: v ? "AI bot activated" : "AI bot paused",
                            lead,
                            action: "BOT_TOGGLED",
                          })
                        }
                      />
                      <ToneBadge
                        tone={lead.bot_active ? "green" : "gray"}
                        label={lead.bot_active ? "AI Active" : "AI Paused"}
                      />
                    </div>
                  </TableCell>
                  <TableCell>{lead.selected_property_name || "—"}</TableCell>
                  <TableCell>{formatMoney(lead.budget)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(lead.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline" disabled={!lead.phone}>
                        <a href={`tel:${lead.phone ?? ""}`}>
                          <Phone /> Call Now
                        </a>
                      </Button>
                      <Button size="sm" onClick={() => setSelected(lead)}>
                        Open
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <LeadDrawer
        lead={selected ? (leads.find((l) => l.lead_id === selected.lead_id) ?? selected) : null}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        activity={selected ? activity.filter((a) => a.lead_id === selected.lead_id) : []}
      />

      <ExecutiveDrawer
        name={profile}
        leads={leads}
        activity={activity}
        period={profilePeriod}
        onPeriodChange={setProfilePeriod}
        open={!!profile}
        onOpenChange={(v) => !v && setProfile(null)}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  render,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render?: (v: string) => string;
  allLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="min-w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {render ? render(o) : o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
