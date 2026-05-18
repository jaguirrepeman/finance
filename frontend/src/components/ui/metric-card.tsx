import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  valueClassName?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  className,
  valueClassName,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "glass-panel relative overflow-hidden p-6 transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-glass-hover",
        "before:absolute before:top-0 before:left-0 before:right-0 before:h-1",
        "before:bg-gradient-to-r before:from-accent-glow before:to-accent-secondary",
        "before:opacity-0 before:transition-opacity before:duration-300",
        "hover:before:opacity-100",
        className,
      )}
    >
      <div className="text-xs font-semibold tracking-widest text-text-secondary uppercase">
        {title}
      </div>
      <div className={cn("mt-2 text-3xl font-bold tabular-nums", valueClassName)}>
        {value}
      </div>
      {subtitle && (
        <div className="mt-1 text-sm text-text-secondary">{subtitle}</div>
      )}
    </div>
  );
}
