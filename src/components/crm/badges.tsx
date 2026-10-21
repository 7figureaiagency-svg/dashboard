import { Star } from "lucide-react";
import { PROPERTY_STATE_MAP, STATUS_MAP, type Tone } from "@/lib/crm";

export function ToneBadge({
  label,
  tone,
  pulse,
}: {
  label: string;
  tone: Tone;
  pulse?: boolean;
}) {
  return (
    <span className="crm-badge" data-tone={tone} data-pulse={pulse ? "true" : undefined}>
      {label}
    </span>
  );
}

export function StatusBadge({ value }: { value: string | null }) {
  const meta = (value && STATUS_MAP[value]) || { label: value ?? "Unknown", tone: "gray" as Tone };
  return <ToneBadge label={meta.label} tone={meta.tone} />;
}

export function PropertyStateBadge({ value }: { value: string | null }) {
  const meta = (value && PROPERTY_STATE_MAP[value]) || {
    label: value ?? "Unknown",
    tone: "gray" as Tone,
  };
  return <ToneBadge label={meta.label} tone={meta.tone} pulse={"pulse" in meta && meta.pulse} />;
}

export function DualRoleBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold tracking-tight bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 shadow-2xs select-none backdrop-blur-xs ${className ?? ""}`}
      title="Dual Role: Active Buyer and Property Seller"
    >
      <Star className="size-3 fill-amber-400 text-amber-500 shrink-0" />
      <span>DUAL: BUYER + SELLER</span>
    </span>
  );
}

