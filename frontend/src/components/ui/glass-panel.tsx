import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassPanel({
  children,
  className,
  hover = false,
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "glass-panel",
        hover &&
          "transition-all duration-300 hover:-translate-y-1 hover:shadow-glass-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}
