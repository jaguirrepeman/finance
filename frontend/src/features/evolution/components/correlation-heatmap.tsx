import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { PillToggle, HoverTooltip } from "@/components/ui";

interface HeatmapProps {
  labels: string[];
  matrix: Record<string, Record<string, number | null>>;
}

export function CorrelationHeatmap({ labels, matrix }: HeatmapProps) {
  const [sortBy, setSortBy] = useState<"weight" | "correlation">("weight");

  const sortedLabels = useMemo(() => {
    if (sortBy === "correlation") {
      return [...labels].sort((a, b) => {
        const avgA = labels.reduce((s, l) => {
          const v = matrix[a]?.[l];
          return s + (v != null && l !== a ? Math.abs(v) : 0);
        }, 0);
        const avgB = labels.reduce((s, l) => {
          const v = matrix[b]?.[l];
          return s + (v != null && l !== b ? Math.abs(v) : 0);
        }, 0);
        return avgB - avgA;
      });
    }
    return labels;
  }, [labels, matrix, sortBy]);

  const cellColor = (val: number | null, isDiag: boolean) => {
    if (val == null) return { bg: "hsl(220, 20%, 15%)", text: "#666" };
    const hue = ((val + 1) / 2) * 120; // 0=red, 120=green
    const sat = isDiag ? 30 : 70;
    const light = isDiag ? 30 : 35;
    return {
      bg: `hsl(${hue}, ${sat}%, ${light}%)`,
      text: isDiag ? "#888" : "#fff",
    };
  };

  if (!labels.length) {
    return (
      <div className="py-4 text-center text-sm text-text-secondary">
        No hay suficientes datos para la correlación.
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-x-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-accent-glow" />
          Correlación (Pearson)
        </h4>
        <PillToggle
          options={[
            { key: "weight", label: "Por peso" },
            { key: "correlation", label: "Por correlación" },
          ]}
          value={sortBy}
          onChange={(v) => setSortBy(v as "weight" | "correlation")}
        />
      </div>

      <div
        className="gap-[2px]"
        style={{
          display: "grid",
          gridTemplateColumns: `auto repeat(${sortedLabels.length}, 1fr)`,
        }}
      >
        {/* Header: empty corner + column labels */}
        <div />
        {sortedLabels.map((col) => (
          <div
            key={`col-${col}`}
            className="overflow-hidden text-center text-[0.6rem] text-text-secondary"
            style={{ writingMode: "vertical-rl" }}
            title={col}
          >
            <span className="inline-block max-h-[80px] truncate">
              {col.length > 20 ? col.substring(0, 18) + "…" : col}
            </span>
          </div>
        ))}

        {/* Rows */}
        {sortedLabels.map((row) => (
          <>
            <div
              key={`row-${row}`}
              className="flex items-center pr-2 text-[0.7rem] text-text-secondary"
              title={row}
            >
              <span className="max-w-[120px] truncate">
                {row.length > 20 ? row.substring(0, 18) + "…" : row}
              </span>
            </div>
            {sortedLabels.map((col) => {
              const val = matrix[row]?.[col] ?? null;
              const isDiag = row === col;
              const { bg, text } = cellColor(val, isDiag);

              return (
                <HoverTooltip
                  key={`${row}-${col}`}
                  content={
                    val != null ? (
                      <span>
                        <span style={{ color: "hsl(220,20%,70%)" }}>{row.length > 22 ? row.slice(0,20)+"…" : row}</span>
                        {" vs "}
                        <span style={{ color: "hsl(220,20%,70%)" }}>{col.length > 22 ? col.slice(0,20)+"…" : col}</span>
                        <br />
                        <strong style={{ color: val >= 0.7 ? "#34d399" : val <= 0.3 ? "#f87171" : "#fbbf24" }}>
                          {val.toFixed(4)}
                        </strong>
                      </span>
                    ) : "Sin datos suficientes"
                  }
                  className="flex items-center justify-center rounded-sm py-1 text-[0.65rem] font-semibold"
                  style={{ backgroundColor: bg, color: text, minHeight: "28px" } as React.CSSProperties}
                >
                  {val != null ? val.toFixed(2) : "—"}
                </HoverTooltip>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
