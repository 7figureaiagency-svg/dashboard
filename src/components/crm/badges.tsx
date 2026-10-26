import { AlertTriangle, Star } from "lucide-react";
import { PROPERTY_STATE_MAP, STATUS_MAP, type Tone, type Lead } from "@/lib/crm";
import { computeLeadScore } from "@/lib/lead-scoring";

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

export function NoWhatsAppBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold tracking-tight bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-2xs select-none backdrop-blur-xs ${className ?? ""}`}
      title="No WhatsApp mobile number provided in portal inquiry"
    >
      <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400 shrink-0" />
      <span>No WhatsApp Number</span>
    </span>
  );
}

export function LeadScoreBadge({
  lead,
  className,
}: {
  lead: Partial<Lead>;
  className?: string;
}) {
  const result = computeLeadScore(lead);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold tracking-tight border backdrop-blur-xs select-none transition-all ${result.badgeClass} ${className ?? ""}`}
      title={`Score: ${result.score}/100 (${result.label})\n${result.reasons.join(" • ")}`}
    >
      <span className={`size-1.5 rounded-full shrink-0 ${result.dotClass}`} />
      <span className="font-mono font-bold">{result.score}</span>
      <span className="opacity-80 text-[9.5px] uppercase font-bold">{result.temperature}</span>
    </span>
  );
}



