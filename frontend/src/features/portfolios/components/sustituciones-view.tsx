import { useState, useEffect } from "react";
import { Shuffle, Trash2, Info } from "lucide-react";
import { FundSearchInput } from "@/components/ui";
import { useFavorites } from "../hooks";
import { usePortfolioPositions } from "@/hooks/use-shared-queries";
import { SUBSTITUTIONS_STORAGE_KEY } from "@/features/evolution/lib/evolution-utils";
import type { SubstitutionRule } from "@/features/evolution/lib/evolution-utils";

/**
 * Sustituciones view — central management for fund substitutions.
 * These substitutions are applied in both Evolution and Comparar tabs.
 */
export function SustitucionesView() {
  const { data: positionsData } = usePortfolioPositions();
  const { data: favorites } = useFavorites();

  const [substitutions, setSubstitutions] = useState<SubstitutionRule[]>([]);
  const [subNextId, setSubNextId] = useState(1);

  // Load substitution rules from shared localStorage key
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SUBSTITUTIONS_STORAGE_KEY);
      if (saved) {
        const parsed: SubstitutionRule[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.fundIsin !== undefined) {
          setSubstitutions(parsed);
          const maxId = Math.max(0, ...parsed.map((r) => Number(r.id) || 0));
          setSubNextId(maxId + 1);
        }
      }
    } catch {
      // ignore malformed localStorage data
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SUBSTITUTIONS_STORAGE_KEY, JSON.stringify(substitutions));
    } catch {
      // ignore quota errors
    }
  }, [substitutions]);

  const addSubstitution = () => {
    setSubstitutions((prev) => [
      ...prev,
      {
        id: String(subNextId),
        fundIsin: "",
        fundName: "",
        substituteIsin: "",
        substituteName: "",
        cutoverDate: new Date(Date.now() - 3 * 365 * 24 * 3600_000)
          .toISOString()
          .slice(0, 10),
      },
    ]);
    setSubNextId((n) => n + 1);
  };

  const removeSubstitution = (id: string) => {
    setSubstitutions((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSubstitution = (id: string, updates: Partial<SubstitutionRule>) => {
    setSubstitutions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Shuffle className="size-6 text-accent-glow mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white mb-1">Fondos Sustitutos</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              Extiende el historial de un fondo usando un sustituto equivalente. El sustituto se escala para empalmar en la fecha de corte.
              Las sustituciones se aplican automáticamente en <span className="text-accent-glow">Evolución</span> y <span className="text-accent-glow">Comparar</span>.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 px-4 py-3 text-xs text-blue-300 flex items-start gap-2">
          <Info className="size-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">¿Cuándo usar fondos sustitutos?</p>
            <p className="text-blue-200/90">
              Si compraste un fondo recientemente (ej. DNB Nuclear Energy) pero quieres ver su comportamiento histórico más largo,
              puedes sustituirlo por un fondo similar más antiguo (ej. DWS Global Mining) hasta la fecha de tu compra.
              Esto permite comparaciones más justas con otros fondos de tu cartera.
            </p>
          </div>
        </div>
      </div>

      {/* Substitutions list */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Sustituciones configuradas
            {substitutions.length > 0 && (
              <span className="ml-2 rounded-full bg-accent-glow/20 px-2 py-0.5 text-[10px] text-accent-glow">
                {substitutions.length}
              </span>
            )}
          </h3>
          <button
            onClick={addSubstitution}
            className="rounded-md border border-dashed border-border-glass px-3 py-1.5 text-xs text-text-secondary hover:border-accent-glow hover:text-accent-glow transition-colors"
          >
            ＋ Añadir sustitución
          </button>
        </div>

        {substitutions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-glass/50 px-4 py-8 text-center text-sm text-text-muted">
            No hay sustituciones configuradas.
            <br />
            Haz clic en "Añadir sustitución" para empezar.
          </div>
        ) : (
          <div className="space-y-3">
            {substitutions.map((rule) => (
              <div
                key={rule.id}
                className="rounded-lg border border-border-glass/40 bg-white/2 p-3"
              >
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
                  {/* Original fund */}
                  <div>
                    <div className="mb-1 text-[10px] text-text-muted">Fondo a extender</div>
                    {rule.fundIsin ? (
                      <div className="flex items-center gap-2 rounded border border-accent-glow/30 bg-accent-glow/5 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-white text-sm">{rule.fundName}</div>
                          <div className="font-mono text-[10px] text-text-muted">{rule.fundIsin}</div>
                        </div>
                        <button
                          onClick={() => updateSubstitution(rule.id, { fundIsin: "", fundName: "" })}
                          className="text-text-secondary hover:text-red-400 transition-colors"
                          title="Quitar fondo"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <FundSearchInput
                        onSelect={(r) => updateSubstitution(rule.id, { fundIsin: r.isin, fundName: r.name })}
                        placeholder="Buscar fondo a extender…"
                        portfolioIsins={(positionsData?.positions ?? []).map((p) => p.ISIN)}
                        favoriteIsins={(favorites ?? []).map((f) => f.isin)}
                        favoritesData={favorites ?? []}
                      />
                    )}
                  </div>

                  {/* Cutover date */}
                  <div className="md:w-32">
                    <div className="mb-1 text-[10px] text-text-muted">Sustituto hasta</div>
                    <input
                      type="date"
                      value={rule.cutoverDate}
                      onChange={(e) => updateSubstitution(rule.id, { cutoverDate: e.target.value })}
                      className="w-full rounded border border-border-glass bg-bg-glass px-2 py-2 text-xs text-white focus:outline-none focus:border-accent-glow transition-colors"
                    />
                  </div>

                  {/* Substitute fund */}
                  <div>
                    <div className="mb-1 text-[10px] text-text-muted">Fondo sustituto</div>
                    {rule.substituteIsin ? (
                      <div className="flex items-center gap-2 rounded border border-accent-glow/30 bg-accent-glow/5 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-white text-sm">{rule.substituteName}</div>
                          <div className="font-mono text-[10px] text-text-muted">{rule.substituteIsin}</div>
                        </div>
                        <button
                          onClick={() => updateSubstitution(rule.id, { substituteIsin: "", substituteName: "" })}
                          className="text-text-secondary hover:text-red-400 transition-colors"
                          title="Quitar sustituto"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <FundSearchInput
                        onSelect={(r) => updateSubstitution(rule.id, { substituteIsin: r.isin, substituteName: r.name })}
                        placeholder="Buscar fondo sustituto…"
                        portfolioIsins={[]}
                        favoriteIsins={(favorites ?? []).map((f) => f.isin)}
                        favoritesData={favorites ?? []}
                      />
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => removeSubstitution(rule.id)}
                    className="rounded px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition-colors self-start md:self-end"
                    title="Eliminar sustitución"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
