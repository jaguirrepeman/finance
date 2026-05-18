import { cn } from "@/lib/utils";
import { CHART_COLORS_HEX } from "@/lib/colors";
import type { PortfolioSummary } from "@/types";

interface AllocationBarProps {
  title: string;
  segments: Array<{ name: string; value: number; color: string }>;
}

function AllocationBar({ title, segments }: AllocationBarProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;

  return (
    <div className="glass-panel p-4">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      {/* Bar */}
      <div className="mb-3 flex h-6 overflow-hidden rounded-md">
        {segments.map((seg) => (
          <div
            key={seg.name}
            className="transition-all duration-300"
            style={{
              width: `${(seg.value / total) * 100}%`,
              backgroundColor: seg.color,
            }}
            title={`${seg.name}: ${seg.value.toFixed(1)}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {segments.map((seg) => (
          <div key={seg.name} className="flex items-center gap-1.5 text-xs">
            <div
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-text-secondary">
              {seg.name}{" "}
              <strong className="text-text-primary">
                {seg.value.toFixed(1)}%
              </strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AllocationSectionProps {
  summary: PortfolioSummary;
  chartData: Array<{ name: string; value: number }>;
}

export function AllocationSection({
  summary,
  chartData,
}: AllocationSectionProps) {
  const assetSegments = chartData.map((entry, i) => ({
    name: entry.name,
    value: entry.value,
    color: CHART_COLORS_HEX[i % CHART_COLORS_HEX.length],
  }));

  const indexed = summary.total_indexed ?? 0;
  const active = summary.total_active ?? 0;
  const managementSegments = [
    { name: "Indexado", value: indexed, color: "#00d4aa" },
    { name: "Activo", value: active, color: "#8b5cf6" },
  ];

  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2")}>
      <AllocationBar title="Asset Allocation" segments={assetSegments} />
      <AllocationBar title="Gestión" segments={managementSegments} />
    </div>
  );
}
