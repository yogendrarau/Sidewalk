import { PROVENANCE_LABELS } from "@/lib/sidewalk";

export default function ProvenanceBadge({ provenance, size = "sm" }) {
  if (!provenance) return null;
  const cfg = PROVENANCE_LABELS[provenance.mode] || PROVENANCE_LABELS.unavailable;
  const sizes = size === "lg" ? "text-xs px-3 py-1.5" : "text-[10px] px-2.5 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide ${cfg.className} ${sizes}`}
      title={provenance.source}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}