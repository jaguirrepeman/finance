import { useState, useMemo } from "react";
import { Spinner, PillToggle } from "@/components/ui";
import { useAnnualReturns, useHistoryBatch } from "../hooks";

function pctToHeatColor(v: number | null | undefined): string {
  if (v == null) return "hsl(220, 20%, 15%)";
  const clamped = Math.max(-25, Math.min(25, v));
  if (clamped >= 0) {
    const sat = Math.min((clamped / 25) * 80, 80);
    return `hsl(140, ${sat}%, ${35 - (sat / 80) * 10}%)`;
  }
  const sat = Math.min((Math.abs(clamped) / 25) * 80, 80);
  return `hsl(0, ${sat}%, ${35 - (sat / 80) * 10}%)`;
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Compute monthly returns per fund from history batch series */
function computeMonthlyReturns(
  series: Record<string, Array<{ date: string; price: number }>>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  for (const [fund, pts] of Object.entries(series)) {
    if (!pts?.length) continue;
    const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));

    // Get last price per YYYY-MM
    const byMonth = new Map<string, number>();
    for (const pt of sorted) {
      const ym = pt.date.slice(0, 7); // "YYYY-MM"
      byMonth.set(ym, pt.price);
    }

    const months = [...byMonth.keys()].sort();
    const fundReturns: Record<string, number> = {};

    for (let i = 1; i < months.length; i++) {
      const prev = byMonth.get(months[i - 1])!;
      const curr = byMonth.get(months[i])!;
      if (prev > 0) {
        fundReturns[months[i]] = parseFloat(((curr / prev - 1) * 100).toFixed(2));
      }
    }

    if (Object.keys(fundReturns).length) {
      result[fund] = fundReturns;
    }
  }
  return result;
}

export function AnnualReturnsHeatmap({ activeFunds }: { activeFunds?: string[] }) {
  const [mode, setMode] = useState<"anual" | "mensual">("anual");
  const [selectedYear, setSelectedYear] = useState<string>("TTM");

  const { data: annualData, isLoading: annualLoading } = useAnnualReturns();
  const { data: historyBatch, isLoading: histLoading } = useHistoryBatch();

  const isLoading = annualLoading || (mode === "mensual" && histLoading);

  // ── Annual data ──────────────────────────────────────────────────────────────
  const fundMap = useMemo(() => {
    return (annualData as unknown as Record<string, unknown>)?.funds as
      | Record<string, Record<string, number>>
      | undefined
      ?? annualData?.annual;
  }, [annualData]);

  const annualYears = useMemo(() => {
    if (!fundMap) return [];
    const years = new Set<string>();
    Object.values(fundMap).forEach((f) => Object.keys(f).forEach((y) => years.add(y)));
    return [...years].sort();
  }, [fundMap]);

  // ── Monthly data ─────────────────────────────────────────────────────────────
  const monthlyReturns = useMemo(() => {
    if (!historyBatch?.series) return {};
    return computeMonthlyReturns(historyBatch.series);
  }, [historyBatch]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    Object.values(monthlyReturns).forEach((f) =>
      Object.keys(f).forEach((ym) => years.add(ym.slice(0, 4))),
    );
    return ["TTM", ...[...years].sort().reverse()];
  }, [monthlyReturns]);

  // Columns for the month table depend on selected year
  const monthlyColumns = useMemo((): string[] => {
    if (selectedYear === "TTM") {
      // Last 12 months (inclusive of latest available)
      const allMonths = new Set<string>();
      Object.values(monthlyReturns).forEach((f) =>
        Object.keys(f).forEach((ym) => allMonths.add(ym)),
      );
      const sorted = [...allMonths].sort();
      return sorted.slice(-12);
    }
    // Specific year: Jan-Dec
    return Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, "0")}`);
  }, [monthlyReturns, selectedYear]);

  const monthlyFunds = useMemo(() => {
    const all = Object.keys(monthlyReturns);
    if (!activeFunds?.length) return all;
    // Preserve activeFunds order, then append any fund present in data but not in activeFunds
    const ordered = activeFunds.filter((f) => all.includes(f));
    const extra = all.filter((f) => !activeFunds.includes(f));
    return [...ordered, ...extra];
  }, [monthlyReturns, activeFunds]);

  // ── Annual funds list (ordered by activeFunds, then append any extra) ─────
  const annualFundKeys = useMemo(() => {
    if (!fundMap) return [];
    const all = Object.keys(fundMap);
    if (!activeFunds?.length) return all;
    // Preserve activeFunds order, then append funds in data not in activeFunds
    const inActive = activeFunds.filter((f) => all.includes(f));
    const extra = all.filter((f) => !activeFunds.includes(f));
    return [...inActive, ...extra];
  }, [fundMap, activeFunds]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-x-auto p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-sm font-semibold">📅 Retornos</h4>
        <div className="flex flex-wrap items-center gap-3">
          <PillToggle
            options={[
              { key: "anual", label: "Anual" },
              { key: "mensual", label: "Mensual" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as "anual" | "mensual")}
          />
          {mode === "mensual" && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="rounded border border-border-glass bg-bg-glass px-2 py-1 text-xs text-white"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y === "TTM" ? "TTM (últ. 12 meses)" : y}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {mode === "anual" ? (
        <>
          {!fundMap || !annualFundKeys.length ? (
            <div className="py-4 text-center text-sm text-text-secondary">
              {!fundMap || !Object.keys(fundMap).length
                ? "No hay datos de retornos anuales disponibles."
                : "Selecciona fondos en el filtro para ver sus retornos."}
            </div>
          ) : (
            <table
              className="w-full text-xs"
              style={{ borderSpacing: "3px", borderCollapse: "separate" }}
            >
              <thead>
                <tr>
                  <th className="sticky left-0 bg-bg-card px-2 py-1 text-left text-text-secondary">
                    Fondo
                  </th>
                  {annualYears.map((y) => (
                    <th
                      key={y}
                      className="px-2 py-1 text-center font-semibold text-text-secondary"
                    >
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {annualFundKeys.map((fund) => (
                  <tr key={fund}>
                    <td
                      className="sticky left-0 max-w-[160px] truncate bg-bg-card px-2 py-1 font-medium"
                      title={fund}
                    >
                      {fund}
                    </td>
                    {annualYears.map((year) => {
                      const val = fundMap[fund]?.[year] ?? null;
                      return (
                        <td
                          key={year}
                          className="rounded-sm px-2 py-1 text-center font-bold tabular-nums"
                          style={{
                            backgroundColor: pctToHeatColor(val),
                            color: val != null ? "#fff" : "#555",
                          }}
                        >
                          {val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          {!monthlyFunds.length ? (
            <div className="py-4 text-center text-sm text-text-secondary">
              No hay datos de histórico disponibles.
            </div>
          ) : (
            <table
              className="w-full text-xs"
              style={{ borderSpacing: "3px", borderCollapse: "separate" }}
            >
              <thead>
                <tr>
                  <th className="sticky left-0 bg-bg-card px-2 py-1 text-left text-text-secondary">
                    Fondo
                  </th>
                  {monthlyColumns.map((ym) => {
                    const [year, monthNum] = ym.split("-");
                    const label =
                      selectedYear === "TTM"
                        ? `${MONTH_LABELS[parseInt(monthNum) - 1]} ${year.slice(2)}`
                        : MONTH_LABELS[parseInt(monthNum) - 1];
                    return (
                      <th
                        key={ym}
                        className="px-2 py-1 text-center font-semibold text-text-secondary whitespace-nowrap"
                      >
                        {label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {monthlyFunds.map((fund) => (
                  <tr key={fund}>
                    <td
                      className="sticky left-0 max-w-[160px] truncate bg-bg-card px-2 py-1 font-medium"
                      title={fund}
                    >
                      {fund}
                    </td>
                    {monthlyColumns.map((ym) => {
                      const val = monthlyReturns[fund]?.[ym] ?? null;
                      return (
                        <td
                          key={ym}
                          className="rounded-sm px-2 py-1 text-center font-bold tabular-nums"
                          style={{
                            backgroundColor: pctToHeatColor(val),
                            color: val != null ? "#fff" : "#555",
                          }}
                        >
                          {val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
