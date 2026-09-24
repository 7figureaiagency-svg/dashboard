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
