import { cn } from "@/lib/utils";

interface ComparisonBarsProps {
  data: Array<{ name: string; value: number }>;
  benchmarkData?: Record<string, number> | null;
  benchmarkLabel?: string;
}

export function ComparisonBars({
  data,
  benchmarkData,
  benchmarkLabel = "Benchmark",
}: ComparisonBarsProps) {
  const allKeys = new Set([
    ...data.map((d) => d.name),
    ...(benchmarkData ? Object.keys(benchmarkData) : []),
  ]);

  const merged = Array.from(allKeys)
    .map((name) => {
      const mine = data.find((d) => d.name === name);
      const bench = benchmarkData?.[name] ?? 0;
      return { name, myValue: mine?.value ?? 0, benchValue: bench };
    })
    .filter((x) => x.myValue > 0.5 || x.benchValue > 0.5)
    .sort((a, b) => b.myValue - a.myValue);

  const maxVal = Math.max(
    ...merged.map((x) => Math.max(x.myValue, x.benchValue)),
    1,
  );

  if (!merged.length) {
    return (
      <span className="text-sm text-text-secondary">
        No se detectó información.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {merged.map((item) => {
        const diff = item.myValue - item.benchValue;
        const hasBench = benchmarkData != null && item.benchValue > 0;

        return (
          <div key={item.name} className="text-sm">
            {/* Label row */}
            <div className="mb-1 flex items-center justify-between">
              <span>{item.name}</span>
              <div className="flex items-center gap-2.5">
                <strong className="text-accent-glow">
                  {item.myValue.toFixed(1)}%
                </strong>
                {hasBench && (
                  <>
                    <span className="text-xs text-text-secondary">
                      {benchmarkLabel}: {item.benchValue.toFixed(1)}%
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold",
                        diff > 1
                          ? "text-green-400"
                          : diff < -1
                            ? "text-red-400"
                            : "text-text-secondary",
                      )}
                    >
                      {diff >= 0 ? "+" : ""}
                      {diff.toFixed(1)}%
                    </span>
                  </>
                )}
              </div>
            </div>
            {/* Bars */}
            <div
              className={cn(
                "relative w-full overflow-hidden rounded bg-border-glass",
                hasBench ? "h-3.5" : "h-2",
              )}
            >
              <div
                className="h-1/2 rounded-t bg-accent-glow transition-all duration-300"
                style={{
                  width: `${(item.myValue / maxVal) * 100}%`,
                  height: hasBench ? "50%" : "100%",
                }}
              />
              {hasBench && (
                <div
                  className="h-1/2 rounded-b bg-yellow-400/50 transition-all duration-300"
                  style={{
                    width: `${(item.benchValue / maxVal) * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
