import { cn } from "@/lib/utils";

export interface SubTabOption {
  key: string;
  label: string;
}

interface SubTabsProps {
  tabs: readonly SubTabOption[];
  value: string;
  onChange: (key: string) => void;
  /** "pills" = individual bordered buttons, "segmented" = grouped segment control */
  variant?: "pills" | "segmented";
  className?: string;
}

export function SubTabs({
  tabs,
  value,
  onChange,
  variant = "segmented",
  className,
}: SubTabsProps) {
  if (variant === "pills") {
    return (
      <div className={cn("flex gap-2 overflow-x-auto", className)}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              value === tab.key
                ? "border border-accent-glow bg-accent-glow/15 text-accent-glow"
                : "border border-border-glass bg-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  // segmented
  return (
    <div
      className={cn(
        "flex gap-1 rounded-lg border border-border-glass bg-white/3 p-1",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            value === tab.key
              ? "bg-accent-glow/15 text-accent-glow"
              : "text-text-secondary hover:text-white",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
