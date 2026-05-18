import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { FundSearchInput } from "@/components/ui";
import type { TransactionOverride, RawMovement, ManualPosition, FundSearchResult, ExcludedMovement } from "@/types";

function fmtEur(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}€${Math.abs(n).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Inline-editable note cell ─────────────────────────────────────────────

function NoteCell({
  value,
  onSave,
}: {
  value: string | undefined;
  onSave: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onSave(draft); setEditing(false); }
          if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
        }}
        className="w-full rounded border border-border-glass bg-bg-glass px-1 py-0.5 text-xs text-white"
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className="cursor-pointer text-text-secondary hover:text-white"
      title="Clic para editar nota"
    >
      {value || <span className="italic opacity-40">añadir nota…</span>}
    </span>
  );
}

// ── Participaciones tooltip ───────────────────────────────────────────────

function ParticTooltip() {
  const [show, setShow] = useState(false);
  return (
    <span className="relative ml-1 inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-text-secondary hover:text-white leading-none"
        aria-label="Qué significan las participaciones"
      >
        ⓘ
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 z-50 mb-1 w-64 -translate-x-1/2 rounded border border-border-glass bg-bg-card p-2 text-[11px] text-text-secondary shadow-lg">
          <p className="mb-1 font-semibold text-white">¿Qué significa este campo?</p>
          <p className="mb-1">
            Es el valor correcto de participaciones que debe quedar en el movimiento.
            Usa <span className="font-mono text-red-400">negativo</span> para reembolsos o traspasos salientes.
          </p>
          <p>
            Valor <span className="font-mono text-accent-glow">0</span> = marcar automáticamente como negativas
            todas las filas positivas de esa fecha (útil si hay varios reembolsos el mismo día).
          </p>
        </div>
      )}
    </span>
  );
}

// ── Auto-format date DD-MM-YYYY ─────────────────────────────────────────

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

// ── Main panel ────────────────────────────────────────────────────────────

export function TransactionOverridesPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  // ── Overrides ────────────────────────────────────────────────────────────
  const [manualOpen, setManualOpen] = useState(false);
  const [form, setForm] = useState({ isin: "", fecha: "", participaciones: "", notes: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: overridesData, isLoading: overridesLoading } = useQuery({
    queryKey: ["transaction-overrides"],
    queryFn: api.getTransactionOverrides,
    enabled: expanded,
  });
  const overrides: TransactionOverride[] = (overridesData as TransactionOverride[] | undefined) ?? [];

  // ── Raw movements ────────────────────────────────────────────────────────
  const [movSearch, setMovSearch] = useState("");

  const { data: movData, isLoading: movLoading } = useQuery({
    queryKey: ["raw-movements"],
    queryFn: api.getRawMovements,
    enabled: expanded,
    staleTime: 60_000,
  });
  const movements: RawMovement[] = (movData as RawMovement[] | undefined) ?? [];

  // Build ISIN → fondo name lookup from movements (for showing names in overrides table)
  const nameFromMov = Object.fromEntries(
    movements
      .filter((m) => m.fondo && m.fondo !== m.isin)
      .map((m) => [m.isin, m.fondo]),
  );

  const correctedKeys = new Set(overrides.map((ov) => `${ov.isin}|${ov.fecha}`));

  const filteredMovements = movSearch
    ? movements.filter((m) => {
        const q = movSearch.toLowerCase();
        return (
          m.isin.toLowerCase().includes(q) ||
          m.fondo.toLowerCase().includes(q) ||
          m.fuente.toLowerCase().includes(q)
        );
      })
    : movements;

  // ── Mutations ────────────────────────────────────────────────────────────
  const upsertMut = useMutation<
    { message: string; override: TransactionOverride },
    Error,
    { isin: string; fecha: string; participaciones: number; notes?: string }
  >({
    mutationFn: api.upsertTransactionOverride,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transaction-overrides"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["raw-movements"] });
      setForm({ isin: "", fecha: "", participaciones: "", notes: "" });
      setFormError(null);
    },
    onError: (e) => setFormError(e.message),
  });

  const deleteMut = useMutation<{ message: string }, Error, number>({
    mutationFn: api.deleteTransactionOverride,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transaction-overrides"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["raw-movements"] });
    },
  });

  const deleteMovMut = useMutation<{ message: string }, Error, { isin: string; fecha: string }>({
    mutationFn: ({ isin, fecha }) => api.deleteRawMovement(isin, fecha),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raw-movements"] });
      qc.invalidateQueries({ queryKey: ["excluded-movements"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  /** Single-click traspaso marking: flip positive → negative immediately. */
  function markAsTruspaso(m: RawMovement) {
    upsertMut.mutate({
      isin: m.isin,
      fecha: m.fecha,
      participaciones: -Math.abs(m.participaciones),
      notes: "Traspaso saliente",
    });
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.isin || !form.fecha || form.participaciones === "") {
      setFormError("ISIN, fecha y participaciones son obligatorios.");
      return;
    }
    const parts = parseFloat(form.participaciones);
    if (isNaN(parts)) {
      setFormError("Participaciones debe ser un número.");
      return;
    }
    upsertMut.mutate({
      isin: form.isin.trim().toUpperCase(),
      fecha: form.fecha,
      participaciones: parts,
      notes: form.notes,
    });
  }

  // ── Manual positions ──────────────────────────────────────────────────────
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [selectedFund, setSelectedFund] = useState<FundSearchResult | null>(null);
  const [mForm, setMForm] = useState({ invertido: "", participaciones: "", fecha: "" });
  const [mError, setMError] = useState<string | null>(null);

  const { data: manualData, isLoading: manualLoading } = useQuery({
    queryKey: ["manual-positions"],
    queryFn: api.getManualPositions,
    enabled: expanded,
  });
  const manualPositions: ManualPosition[] = (manualData as ManualPosition[] | undefined) ?? [];

  const [isRecalculating, setIsRecalculating] = useState(false);

  async function handleRecalculate() {
    setIsRecalculating(true);
    try {
      await api.recalculatePortfolio();
      await qc.invalidateQueries({ queryKey: ["portfolio"] });
      await qc.invalidateQueries({ queryKey: ["manual-positions"] });
      await qc.invalidateQueries({ queryKey: ["raw-movements"] });
      await qc.invalidateQueries({ queryKey: ["excluded-movements"] });
      await qc.invalidateQueries({ queryKey: ["transaction-overrides"] });
    } finally {
      setIsRecalculating(false);
    }
  }

  const addManualMut = useMutation<{ message: string }, Error, Parameters<typeof api.addFund>[0]>({
    mutationFn: api.addFund,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-positions"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      setSelectedFund(null);
      setMForm({ invertido: "", participaciones: "", fecha: "" });
      setMError(null);
    },
    onError: (e) => setMError(e.message),
  });

  const deleteManualMut = useMutation<{ message: string }, Error, number>({
    mutationFn: api.deleteManualFundEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-positions"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  // ── Excluded movements ─────────────────────────────────────────────────
  const { data: excludedData, isLoading: excludedLoading } = useQuery({
    queryKey: ["excluded-movements"],
    queryFn: api.getExcludedMovements,
    enabled: expanded,
  });
  const excludedMovements: ExcludedMovement[] = (excludedData as ExcludedMovement[] | undefined) ?? [];

  const restoreMovMut = useMutation<{ message: string }, Error, { isin: string; fecha: string }>({
    mutationFn: ({ isin, fecha }) => api.restoreRawMovement(isin, fecha),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["excluded-movements"] });
      qc.invalidateQueries({ queryKey: ["raw-movements"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  function parseDDMMYYYY(s: string): string {
    const [d, m, y] = s.split("-");
    return `${y}-${m}-${d}`;
  }

  function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFund) { setMError("Selecciona un fondo."); return; }
    const partic = mForm.participaciones !== "" ? parseFloat(mForm.participaciones) : undefined;
    const inv = mForm.invertido !== "" ? parseFloat(mForm.invertido) : undefined;
    if (partic === undefined && inv === undefined) {
      setMError("Introduce al menos el capital invertido o las participaciones.");
      return;
    }
    let fechaISO: string | undefined = undefined;
    if (mForm.fecha) {
      const ddmmyyyy = /^\d{2}-\d{2}-\d{4}$/.test(mForm.fecha);
      fechaISO = ddmmyyyy ? parseDDMMYYYY(mForm.fecha) : mForm.fecha;
    }
    addManualMut.mutate({
      Fondo: selectedFund.name,
      TIPO: "AUTO",
      Porcentaje: 0,
      ISIN: selectedFund.isin,
      Capital_Invertido: inv,
      Participaciones: partic,
      Fecha_Compra: fechaISO || undefined,
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const inputCls =
    "rounded border border-border-glass bg-bg-glass px-2 py-1 text-xs text-white placeholder:text-text-secondary";

const totalChanges = overrides.length + excludedMovements.length + manualPositions.length;

  return (
    <div className="glass-panel">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-white"
      >
        <span className="flex items-center gap-3">
          <span>⚙️ Gestión de cartera</span>
          {expanded && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRecalculate(); }}
              disabled={isRecalculating}
              title="Recalcula el portfolio con todos los cambios guardados"
              className="rounded bg-accent-glow/20 px-2 py-0.5 text-xs font-medium text-accent-glow hover:bg-accent-glow/40 disabled:opacity-50"
            >
              {isRecalculating ? "⏳ Recalculando…" : "🔄 Recalcular cartera"}
            </button>
          )}
          {totalChanges > 0 && (
            <span className="ml-2 rounded-full bg-accent-glow/20 px-2 py-0.5 text-xs text-accent-glow">
              {totalChanges} cambios
            </span>
          )}
        </span>
        <span className="text-text-secondary text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="space-y-6 border-t border-border-glass px-4 py-4">

          {/* ── 1. CAMBIOS — Unified changes section ─────────────── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-white">
              📋 Cambios sobre los datos fuente
            </h3>
            <p className="mb-3 text-xs text-text-secondary">
              Todos los ajustes realizados sobre los ficheros de origen. Incluye correcciones de traspasos,
              movimientos eliminados y posiciones añadidas manualmente. Los cambios se aplican automáticamente
              al recalcular el portfolio.
            </p>

            {/* ── 1a. Correcciones de traspasos ──────────────────── */}
            <div className="mb-4">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-white">
                <span className="inline-block h-2 w-2 rounded-full bg-accent-glow" />
                Correcciones de traspasos ({overrides.length})
              </h4>

              {overridesLoading ? (
                <p className="text-xs text-text-secondary">Cargando…</p>
              ) : overrides.length === 0 ? (
                <p className="text-xs text-text-secondary italic">Sin correcciones.</p>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border-glass text-text-secondary">
                      <th className="py-1 pr-3 text-left font-normal">Fondo</th>
                      <th className="py-1 pr-3 text-left font-normal">Fecha</th>
                      <th className="py-1 pr-3 text-right font-normal">
                        Participaciones
                        <ParticTooltip />
                      </th>
                      <th className="py-1 pr-3 text-right font-normal">Importe €</th>
                      <th className="py-1 pr-3 text-left font-normal">Nota</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map((ov) => {
                      const fundName = ov.fondo && ov.fondo !== ov.isin ? ov.fondo : nameFromMov[ov.isin];
                      const displayPartic = ov.actual_participaciones ?? ov.participaciones;
                      const displayImporte = ov.importe ?? null;
                      return (
                        <tr key={ov.id} className="border-b border-border-glass/30 hover:bg-white/5">
                          <td className="py-1 pr-3">
                            <span className="font-mono text-white">{ov.isin}</span>
                            {fundName && (
                              <span className="ml-1.5 text-text-secondary">— {fundName}</span>
                            )}
                          </td>
                          <td className="py-1 pr-3 text-text-secondary">{ov.fecha}</td>
                          <td
                            className={`py-1 pr-3 text-right font-mono ${
                              displayPartic < 0
                                ? "text-red-400"
                                : displayPartic > 0
                                ? "text-green-400"
                                : "text-yellow-400"
                            }`}
                          >
                            {displayPartic !== 0 ? displayPartic.toFixed(4) : "auto (−)"}
                          </td>
                          <td className="py-1 pr-3 text-right font-mono text-red-400">
                            {displayImporte != null ? fmtEur(displayImporte) : "—"}
                          </td>
                          <td className="py-1 pr-3 max-w-[180px]">
                            <NoteCell
                              value={ov.notes}
                              onSave={(note) =>
                                upsertMut.mutate({
                                  isin: ov.isin,
                                  fecha: ov.fecha,
                                  participaciones: ov.participaciones,
                                  notes: note,
                                })
                              }
                            />
                          </td>
                          <td className="py-1 text-right">
                            <button
                              onClick={() => deleteMut.mutate(ov.id)}
                              disabled={deleteMut.isPending}
                              title="Eliminar corrección"
                              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div className="mt-2">
                <button
                  onClick={() => setManualOpen((p) => !p)}
                  className="text-xs text-text-secondary hover:text-white"
                >
                  {manualOpen ? "▲ Ocultar" : "＋ Añadir corrección manual"}
                </button>
                {manualOpen && (
                  <form onSubmit={handleManualSubmit} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <input
                      placeholder="ISIN"
                      value={form.isin}
                      onChange={(e) => setForm({ ...form, isin: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                    <input
                      type="date"
                      value={form.fecha}
                      onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      placeholder="Participaciones (negativo = salida)"
                      step="0.0001"
                      value={form.participaciones}
                      onChange={(e) => setForm({ ...form, participaciones: e.target.value })}
                      className={inputCls}
                    />
                    <input
                      placeholder="Nota (opcional)"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className={inputCls}
                    />
                    <button
                      type="submit"
                      disabled={upsertMut.isPending}
                      className="rounded bg-accent-glow px-3 py-1 text-xs font-semibold text-black disabled:opacity-50"
                    >
                      {upsertMut.isPending ? "…" : "Guardar"}
                    </button>
                  </form>
                )}
                {formError && <p className="mt-1 text-xs text-red-400">{formError}</p>}
              </div>
            </div>

            {/* ── 1b. Movimientos eliminados ─────────────────────── */}
            <div className="mb-4">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-white">
                <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                Movimientos eliminados ({excludedMovements.length})
              </h4>

              {excludedLoading ? (
                <p className="text-xs text-text-secondary">Cargando…</p>
              ) : excludedMovements.length === 0 ? (
                <p className="text-xs text-text-secondary italic">Sin movimientos eliminados.</p>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border-glass text-text-secondary">
                      <th className="py-1 pr-3 text-left font-normal">Fondo</th>
                      <th className="py-1 pr-3 text-left font-normal">Fecha</th>
                      <th className="py-1 pr-3 text-right font-normal">Participaciones</th>
                      <th className="py-1 pr-3 text-right font-normal">Importe €</th>
                      <th className="py-1 pr-3 text-right font-normal"></th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {excludedMovements.map((ex) => (
                      <tr key={`${ex.isin}|${ex.fecha}`} className="border-b border-border-glass/30 hover:bg-white/5 opacity-60">
                        <td className="py-1 pr-3">
                          <span className="font-mono text-white">{ex.isin}</span>
                          {ex.fondo && ex.fondo !== ex.isin && (
                            <span className="ml-1.5 text-text-secondary">— {ex.fondo}</span>
                          )}
                        </td>
                        <td className="py-1 pr-3 text-text-secondary">{ex.fecha}</td>
                        <td className={`py-1 pr-3 text-right font-mono ${
                          ex.participaciones != null && ex.participaciones < 0 ? "text-red-400" :
                          ex.participaciones != null && ex.participaciones > 0 ? "text-green-400" : "text-text-secondary"
                        }`}>
                          {ex.participaciones != null ? ex.participaciones.toFixed(4) : "—"}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono text-red-400">
                          {ex.importe != null ? fmtEur(ex.importe) : "—"}
                        </td>
                        <td />
                        <td className="py-1 text-right">
                          <button
                            onClick={() => restoreMovMut.mutate({ isin: ex.isin, fecha: ex.fecha })}
                            disabled={restoreMovMut.isPending}
                            title="Restaurar este movimiento"
                            className="rounded bg-white/10 px-2 py-0.5 text-xs text-green-400 hover:bg-green-400/20 disabled:opacity-50"
                          >
                            ↩ Restaurar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── 1c. Posiciones manuales ────────────────────────── */}
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-white">
                <span className="inline-block h-2 w-2 rounded-full bg-accent-secondary" />
                Posiciones manuales ({manualPositions.length})
              </h4>

              {manualLoading ? (
                <p className="text-xs text-text-secondary">Cargando…</p>
              ) : manualPositions.length === 0 ? (
                <p className="text-xs text-text-secondary italic">Sin posiciones manuales.</p>
              ) : (
                <table className="mb-3 w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border-glass text-text-secondary">
                      <th className="py-1 pr-3 text-left font-normal">Fondo</th>
                      <th className="py-1 pr-3 text-left font-normal">Fecha</th>
                      <th className="py-1 pr-3 text-right font-normal">Participaciones</th>
                      <th className="py-1 pr-3 text-right font-normal">Importe €</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {manualPositions.map((mp) => (
                      <tr key={mp.id} className="border-b border-border-glass/30 hover:bg-white/5">
                        <td className="py-1 pr-3">
                          <div className="text-white">{mp.name}</div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-text-secondary">{mp.isin}</span>
                            <span className="rounded bg-border-glass px-1 py-px text-[9px] text-text-secondary uppercase tracking-wide">{mp.tipo}</span>
                          </div>
                        </td>
                        <td className="py-1 pr-3 text-text-secondary">
                          {mp.fecha_compra ?? mp.added_at?.slice(0, 10) ?? "—"}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono text-text-secondary">
                          {mp.participaciones != null ? mp.participaciones.toLocaleString("es-ES", { maximumFractionDigits: 6 }) : "—"}
                        </td>
                        <td className={`py-1 pr-3 text-right tabular-nums font-mono ${
                          mp.capital_invertido < 0 ? "text-red-400" : "text-text-secondary"
                        }`}>
                          {mp.capital_invertido !== 0 ? fmtEur(mp.capital_invertido) : "—"}
                        </td>
                        <td className="py-1 text-right">
                          <button
                            onClick={() => deleteManualMut.mutate(mp.id)}
                            disabled={deleteManualMut.isPending}
                            title="Eliminar esta aportación"
                            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <button
                onClick={() => setAddManualOpen((p) => !p)}
                className="text-xs text-text-secondary hover:text-white"
              >
                {addManualOpen ? "▲ Ocultar" : "＋ Añadir posición manual"}
              </button>

              {addManualOpen && (
                <form onSubmit={handleAddManual} className="mt-2 space-y-2">
                  <div>
                    {selectedFund ? (
                      <div className="flex items-center gap-2 rounded border border-border-glass bg-bg-glass px-2 py-1">
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-xs font-semibold text-white">{selectedFund.name}</div>
                          <div className="font-mono text-[10px] text-text-secondary">{selectedFund.isin}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedFund(null)}
                          className="text-xs text-text-secondary hover:text-white"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <FundSearchInput
                        onSelect={(f) => setSelectedFund(f)}
                        placeholder="Buscar por nombre o ISIN…"
                        className="w-full"
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-text-secondary">Importe € <span className="opacity-60">(negativo = venta)</span></span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 10000 o -5000"
                        value={mForm.invertido}
                        onChange={(e) => setMForm({ ...mForm, invertido: e.target.value })}
                        className={`${inputCls} w-full text-right`}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-text-secondary">Participaciones <span className="opacity-60">(opcional)</span></span>
                      <input
                        type="number"
                        step="0.000001"
                        placeholder="Auto-calculado"
                        value={mForm.participaciones}
                        onChange={(e) => setMForm({ ...mForm, participaciones: e.target.value })}
                        className={`${inputCls} w-full text-right`}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-text-secondary">Fecha Compra</span>
                      <input
                        type="text"
                        placeholder="DD-MM-YYYY"
                        inputMode="numeric"
                        maxLength={10}
                        value={mForm.fecha}
                        onChange={(e) => setMForm({ ...mForm, fecha: formatDateInput(e.target.value) })}
                        className={`${inputCls} w-full font-mono`}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={addManualMut.isPending}
                      className="self-end rounded bg-accent-glow px-3 py-1 text-xs font-semibold text-black disabled:opacity-50"
                    >
                      {addManualMut.isPending ? "…" : "Añadir"}
                    </button>
                  </div>
                  {mError && <p className="text-xs text-red-400">{mError}</p>}
                </form>
              )}
            </div>
          </section>

          {/* ── 2. Movimientos ──────────────────────────────────── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-white">
              Movimientos
            </h3>
            <p className="mb-3 text-xs text-text-secondary">
              MyInvestor a veces exporta los traspasos salientes con signo positivo (incorrecto).
              Si un movimiento de abajo debería ser una <em className="text-white">salida</em> de dinero,
              pulsa <span className="rounded bg-white/10 px-1 font-semibold text-white">↩ Traspaso</span> para
              marcarlo como negativo. El cambio se guarda y se aplica al recalcular.
              Puedes <span className="rounded bg-white/10 px-1 font-semibold text-white">🗑️</span> eliminar movimientos que no deberían estar en el portfolio.
            </p>

            <input
              placeholder="Filtrar por ISIN, fondo o fuente…"
              value={movSearch}
              onChange={(e) => setMovSearch(e.target.value)}
              className={`${inputCls} mb-2 w-full`}
            />

            {movLoading ? (
              <p className="text-xs text-text-secondary">Cargando movimientos…</p>
            ) : filteredMovements.length === 0 ? (
              <p className="text-xs text-text-secondary">Sin resultados.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded border border-border-glass">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-bg-card">
                    <tr className="border-b border-border-glass text-text-secondary">
                      <th className="py-1 px-2 text-left font-normal">Fecha</th>
                      <th className="py-1 px-2 text-left font-normal">Fondo</th>
                      <th className="py-1 px-2 text-right font-normal">Importe</th>
                      <th className="py-1 px-2 text-left font-normal">Fuente</th>
                      <th className="py-1 px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.map((m) => {
                      const key = `${m.isin}|${m.fecha}`;
                      const isCorrected = correctedKeys.has(key);
                      const isSale = m.participaciones < 0;
                      return (
                        <tr
                          key={key}
                          className={`border-b border-border-glass/30 transition-colors ${
                            isCorrected
                              ? "opacity-40"
                              : isSale
                              ? "opacity-60"
                              : "hover:bg-white/5"
                          }`}
                        >
                          <td className="py-1 px-2 text-text-secondary">{m.fecha}</td>
                          <td className="py-1 px-2">
                            <div className="max-w-[200px] truncate text-white" title={m.fondo}>
                              {m.fondo}
                            </div>
                            <div className="font-mono text-[10px] text-text-secondary">{m.isin}</div>
                          </td>
                          <td
                            className={`py-1 px-2 text-right tabular-nums ${
                              m.importe < 0 ? "text-red-400" : "text-green-400"
                            }`}
                          >
                            {fmtEur(m.importe)}
                          </td>
                          <td className="py-1 px-2 text-text-secondary">{m.fuente}</td>
                          <td className="py-1 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                            {isCorrected ? (
                              <span className="text-xs text-accent-glow">✓ marcado</span>
                            ) : isSale ? (
                              <span className="text-xs text-text-secondary">—</span>
                            ) : (
                              <button
                                onClick={() => markAsTruspaso(m)}
                                disabled={upsertMut.isPending}
                                title="Marcar como traspaso saliente (cambia el signo a negativo)"
                                className="rounded bg-white/10 px-2 py-0.5 text-xs text-white hover:bg-red-500/30 disabled:opacity-50"
                              >
                                ↩ Traspaso
                              </button>
                            )}
                            <button
                              onClick={() => deleteMovMut.mutate({ isin: m.isin, fecha: m.fecha })}
                              disabled={deleteMovMut.isPending}
                              title="Eliminar este movimiento del portfolio"
                              className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-400/20 disabled:opacity-50"
                            >
                              🗑️
                            </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  );
}
