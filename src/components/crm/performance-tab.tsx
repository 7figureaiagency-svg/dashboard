import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Handshake,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ToneBadge } from "@/components/crm/badges";
import { ExecutiveDrawer } from "@/components/crm/executive-drawer";
import { useActivity, useAddExecutive, useDeleteExecutive, useExecutives, useUpdateExecutive } from "@/lib/crm-data";
import type { Executive } from "@/lib/crm";
import { buildExecStats, dailyActivity, type ExecStats } from "@/lib/crm-metrics";
import {
  ACTION_LABELS,
  PERIODS,
  actionLabel,
  inPeriod,
  slaTone,
  timeAgo,
  type Lead,
  type Period,
} from "@/lib/crm";

type SortKey = "visitsDone" | "assigned" | "conversion" | "actions" | "avgSla";

export function PerformanceTab({ leads, clientId }: { leads: Lead[]; clientId: string | null }) {
  const { data: activity = [] } = useActivity();
  const [period, setPeriod] = useState<Period>("30d");
  const [sort, setSort] = useState<SortKey>("visitsDone");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);

  const periodLeads = useMemo(
    () => leads.filter((l) => inPeriod(l.created_at, period)),
    [leads, period],
  );
  const periodActivity = useMemo(
    () => activity.filter((a) => inPeriod(a.created_at, period)),
    [activity, period],
  );

  const kpis = useMemo(
    () => ({
      total: periodLeads.length,
      visits: periodLeads.filter((l) => l.status === "SITE_VISIT_BOOKED").length,
      handovers: periodLeads.filter((l) => l.property_state === "HUMAN_HANDOVER").length,
      unattended: periodLeads.filter((l) => l.alert_sent_at && l.status !== "VISIT_DONE").length,
    }),
    [periodLeads],
  );

  const board = useMemo(() => {
    const rows = buildExecStats(leads, activity, period);
    const value = (r: ExecStats) =>
      sort === "avgSla" ? (r.avgSla === null ? Number.MAX_SAFE_INTEGER : r.avgSla) : r[sort];
    return [...rows].sort((a, b) =>
      sort === "avgSla" ? Number(value(a)) - Number(value(b)) : Number(value(b)) - Number(value(a)),
    );
  }, [leads, activity, period, sort]);

  const chart = useMemo(() => dailyActivity(activity, period), [activity, period]);
  const maxDay = Math.max(1, ...chart.map((c) => c.count));

  const feed = useMemo(
    () =>
      [...periodActivity]
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .slice(0, 12),
    [periodActivity],
  );

  return (
    <div className="space-y-6">
      <TeamManager clientId={clientId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing team performance for the selected period.
        </p>
        <div className="flex rounded-lg border bg-background p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Users className="size-5" />} label="Total Leads" value={kpis.total} />
        <Kpi
          icon={<CalendarCheck className="size-5" />}
          label="Site Visits Booked"
          value={kpis.visits}
        />
        <Kpi
          icon={<Handshake className="size-5" />}
          label="Pending Handovers"
          value={kpis.handovers}
        />
        <Kpi
          icon={<AlertTriangle className="size-5" />}
          label="Unattended Alerts"
          value={kpis.unattended}
          danger
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Executive scorecard</CardTitle>
          <div className="flex flex-wrap gap-1 text-xs">
            {(
              [
                ["visitsDone", "Visits done"],
                ["conversion", "Conversion"],
                ["actions", "Activity"],
                ["assigned", "Leads"],
                ["avgSla", "Fastest response"],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`rounded-md border px-2 py-1 font-medium transition-colors ${
                  sort === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Visits booked</TableHead>
                  <TableHead>Visits done</TableHead>
                  <TableHead>Conversion</TableHead>
                  <TableHead>Avg response</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-right">History</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No executive data yet.
                    </TableCell>
                  </TableRow>
                )}
                {board.map((row) => (
                  <Fragment key={row.name}>
                    <TableRow>
                      <TableCell>
                        <button
                          className="flex items-center gap-1 font-medium hover:underline"
                          onClick={() => setExpanded((e) => (e === row.name ? null : row.name))}
                        >
                          {expanded === row.name ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                          {row.name}
                        </button>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.silent && <ToneBadge tone="red" label="Silent 48 hrs" />}
                          {row.openAlerts > 0 && (
                            <ToneBadge
                              tone="orange"
                              label={`${row.openAlerts} open alert${row.openAlerts > 1 ? "s" : ""}${
                                row.oldestAlertHours !== null
                                  ? ` · ${Math.round(row.oldestAlertHours)} hr old`
                                  : ""
                              }`}
                            />
                          )}
                          {row.staleLeads > 0 && (
                            <ToneBadge tone="yellow" label={`${row.staleLeads} untouched 7d+`} />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{row.assigned}</TableCell>
                      <TableCell>{row.visitsBooked}</TableCell>
                      <TableCell className="font-semibold">{row.visitsDone}</TableCell>
                      <TableCell>{row.conversion}%</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <ToneBadge
                            tone={slaTone(row.avgSla)}
                            label={row.avgSla === null ? "No data" : `${row.avgSla} min`}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {row.fast} fast · {row.ok} ok · {row.slow} slow
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{row.actions}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {timeAgo(row.lastActiveAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                          onClick={() => setProfile(row.name)}
                        >
                          View profile
                        </button>
                      </TableCell>
                    </TableRow>
                    {expanded === row.name && (
                      <TableRow className="bg-muted/40">
                        <TableCell colSpan={9}>
                          {row.recent.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No recorded actions in this period.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {row.recent.map((a) => (
                                <li
                                  key={a.id}
                                  className="flex flex-wrap items-center gap-2 text-sm"
                                >
                                  <ToneBadge
                                    tone={ACTION_LABELS[a.action]?.tone ?? "gray"}
                                    label={actionLabel(a.action)}
                                  />
                                  <span className="font-medium">{a.lead_name || a.lead_id}</span>
                                  {a.field && (
                                    <span className="text-xs text-muted-foreground">
                                      {a.field}: {a.old_value ?? "empty"} → {a.new_value ?? "empty"}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {timeAgo(a.created_at)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily team activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1">
              {chart.map((c) => (
                <div key={c.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${(c.count / maxDay) * 100}%`, minHeight: c.count ? 4 : 1 }}
                    title={`${c.label}: ${c.count} actions`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>{chart[0]?.label}</span>
              <span>{chart[chart.length - 1]?.label}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest team actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {feed.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No actions recorded yet. Every executive action from now on appears here.
              </p>
            )}
            {feed.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0"
              >
                <span className="font-medium">{a.executive_name || "Unassigned"}</span>
                <ToneBadge
                  tone={ACTION_LABELS[a.action]?.tone ?? "gray"}
                  label={actionLabel(a.action)}
                />
                <span className="text-muted-foreground">{a.lead_name || a.lead_id}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {timeAgo(a.created_at)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ExecutiveDrawer
        name={profile}
        leads={leads}
        activity={activity}
        period={period}
        onPeriodChange={setPeriod}
        open={!!profile}
        onOpenChange={(v) => !v && setProfile(null)}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className="rounded-xl bg-secondary p-3 text-primary">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className="text-2xl font-bold"
            style={danger && value > 0 ? { color: "var(--tone-red)" } : undefined}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Lets an admin add/remove sales executives for their tenant. Adding one
 * here just reserves their email — the next time that person signs in
 * (Facebook or email/password), they're bound to this team automatically.
 */
function TeamManager({ clientId }: { clientId: string | null }) {
  const { data: executives = [] } = useExecutives();
  const add = useAddExecutive();
  const del = useDeleteExecutive();
  const update = useUpdateExecutive();

  // Add dialog state
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("sales_executive");

  // Edit dialog state
  const [editEx, setEditEx] = useState<Executive | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("sales_executive");

  // Delete confirm state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openEdit = (ex: Executive) => {
    setEditEx(ex);
    setEditName(ex.name);
    setEditEmail(ex.email ?? "");
    setEditPhone(ex.phone ?? "");
    setEditRole((ex as Executive & { role?: string }).role ?? "sales_executive");
  };

  const hasManager = executives.some(
    (ex) => (ex as Executive & { role?: string }).role === "manager",
  );

  const submitAdd = () => {
    if (!clientId) {
      toast.error("No tenant selected");
      return;
    }
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (role === "manager" && hasManager) {
      toast.error("A manager already exists for this team. Only one manager is allowed.");
      return;
    }
    add.mutate(
      { clientId, name: name.trim(), email: email.trim(), phone: phone.trim(), role },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setEmail("");
          setPhone("");
          setRole("sales_executive");
        },
      },
    );
  };

  const submitEdit = () => {
    if (!editEx) return;
    if (!editName.trim() || !editEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    const currentRole = (editEx as Executive & { role?: string }).role ?? "sales_executive";
    const changingToManager = editRole === "manager" && currentRole !== "manager";
    if (changingToManager && hasManager) {
      toast.error("A manager already exists for this team. Only one manager is allowed.");
      return;
    }
    update.mutate(
      { id: editEx.id, name: editName, email: editEmail, phone: editPhone, role: editRole },
      { onSuccess: () => setEditEx(null) },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Team</CardTitle>
          <CardDescription>
            Add a sales executive's email here — their account is linked to your workspace the
            moment they sign in with that email.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Add team member
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {executives.length === 0 && (
          <p className="text-sm text-muted-foreground">No executives added yet.</p>
        )}
        {executives.map((ex) => (
          <div
            key={ex.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3"
          >
            <div>
              <p className="font-medium">{ex.name}</p>
              <p className="text-xs text-muted-foreground">
                {ex.email || "—"} · {ex.phone || "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ToneBadge
                tone={(ex as Executive & { role?: string }).role === "manager" ? "blue" : "gray"}
                label={(ex as Executive & { role?: string }).role === "manager" ? "Manager" : "Sales Executive"}
              />
              <ToneBadge
                tone={ex.user_id ? "green" : "yellow"}
                label={ex.user_id ? "Active" : "Invited — awaiting first sign-in"}
              />
              <Button size="sm" variant="outline" onClick={() => openEdit(ex)}>
                <Pencil /> Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setDeleteId(ex.id)}>
                <Trash2 /> Remove
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              They'll be linked automatically on their first sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_executive">Sales Executive</SelectItem>
                  <SelectItem value="manager" disabled={hasManager}>
                    Manager{hasManager ? " (already assigned)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={add.isPending}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editEx} onOpenChange={(v) => !v && setEditEx(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit team member details</DialogTitle>
            <DialogDescription>
              Update the role, name, email, or phone for this team member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_executive">Sales Executive</SelectItem>
                  <SelectItem
                    value="manager"
                    disabled={
                      hasManager &&
                      (editEx as Executive & { role?: string })?.role !== "manager"
                    }
                  >
                    Manager
                    {hasManager && (editEx as Executive & { role?: string })?.role !== "manager"
                      ? " (already assigned)"
                      : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEx(null)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={update.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this executive?</AlertDialogTitle>
            <AlertDialogDescription>
              Leads already assigned to them keep their history — this only removes their access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) del.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
