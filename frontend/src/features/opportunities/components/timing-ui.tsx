import { cn } from "@/lib/utils";

/** Color-coded progress bar for timing score (0-100) */
export function TimingScoreBar({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const color =
    pct >= 70
      ? "bg-green-400"
      : pct >= 50
        ? "bg-yellow-400"
        : pct >= 30
          ? "bg-orange-400"
          : "bg-red-400";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="min-w-[2.5rem] text-right text-xs font-semibold tabular-nums">
        {pct.toFixed(0)}
      </span>
    </div>
  );
}

/** Small labeled sub-score bar */
export function SubScoreBar({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[10px] text-text-secondary capitalize">
        {label.replace(/_/g, " ")}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-accent-glow/70 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-text-secondary">
        {pct.toFixed(0)}
      </span>
    </div>
  );
}

/** Compact metric badge (good / neutral / bad coloring) */
export function SignalBadge({
  label,
  value,
  goodIf = "positive",
}: {
  label: string;
  value: number | null | undefined;
  goodIf?: "positive" | "negative" | "low";
}) {
  if (value == null) return null;

  const isGood =
    goodIf === "positive"
      ? value > 0
      : goodIf === "negative"
        ? value < 0
        : Math.abs(value) < 0.3;

  const colorClass = isGood
    ? "bg-green-400/15 text-green-400"
    : "bg-red-400/15 text-red-400";

  const fmt =
    typeof value === "number"
      ? Math.abs(value) < 10
        ? value.toFixed(2)
        : value.toFixed(1)
      : String(value);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        colorClass,
      )}
    >
      <span className="text-text-secondary">{label}</span>
      {fmt}
    </span>
  );
}

/** Level badge for timing classification */
export function LevelBadge({ level }: { level: string }) {
  const lower = level?.toLowerCase() ?? "";
  const colorClass = lower.includes("alto") || lower.includes("high")
    ? "bg-green-400/15 text-green-400 border-green-400/20"
    : lower.includes("medio") || lower.includes("medium")
      ? "bg-yellow-400/15 text-yellow-400 border-yellow-400/20"
      : "bg-white/8 text-text-secondary border-border-glass";

  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-xs font-semibold",
        colorClass,
      )}
    >
      {level}
    </span>
  );
}
