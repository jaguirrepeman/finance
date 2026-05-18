import { cn } from "@/lib/utils";

export interface PillOption {
  key: string;
  label: string;
  title?: string;
  /** Extra classes on this specific pill (e.g. `max-w-[140px] truncate`) */
  className?: string;
}

interface PillToggleProps {
  options: readonly PillOption[];
  value: string;
  onChange: (key: string) => void;
  /** "filled" = solid accent bg, "outlined" = translucent accent border */
  variant?: "filled" | "outlined";
  /** Extra classes on the outer container */
  className?: string;
}

const FILLED_ACTIVE =
  "border border-accent-glow bg-accent-glow text-black font-semibold";
const FILLED_INACTIVE =
  "border border-border-glass bg-transparent text-text-primary hover:border-border-glass-hover";

const OUTLINED_ACTIVE =
  "border-accent-glow bg-accent-glow/15 text-accent-glow font-semibold";
const OUTLINED_INACTIVE =
  "border border-border-glass hover:bg-white/5";

export function PillToggle({
  options,
  value,
  onChange,
  variant = "filled",
  className,
}: PillToggleProps) {
  const isActive = (key: string) => key === value;

  const activeCls = variant === "filled" ? FILLED_ACTIVE : OUTLINED_ACTIVE;
  const inactiveCls =
    variant === "filled" ? FILLED_INACTIVE : OUTLINED_INACTIVE;
  const shape = variant === "filled" ? "rounded-full" : "rounded-md";

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          title={opt.title}
          className={cn(
            shape,
            "px-3 py-1 text-xs transition-all",
            isActive(opt.key) ? activeCls : inactiveCls,
            opt.className,
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
