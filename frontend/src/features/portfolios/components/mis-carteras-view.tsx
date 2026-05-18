import { useState, useCallback, useEffect, useRef } from "react";
import { Spinner, ConfirmDialog } from "@/components/ui";
import { fmtDate, fmtEur } from "@/lib/format";
import { CHART_COLORS_HEX } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { FundSearchInput } from "@/components/ui/fund-search-input";
import {
  usePortfolios,
  usePortfolioDetail,
  useCreatePortfolio,
  useUpdatePortfolio,
  useDeletePortfolio,
  useCloneCurrentPortfolio,
  useFavorites,
} from "../hooks";
import type { SavedPortfolio } from "@/types";

/** First 8 colors for the color picker */
const PALETTE = CHART_COLORS_HEX.slice(0, 8);

export function MisCarterasView() {
  const { data: portfolios, isLoading } = usePortfolios();
  const cloneMut = useCloneCurrentPortfolio();
  const deleteMut = useDeletePortfolio();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cloneFromId, setCloneFromId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [showCopyFrom, setShowCopyFrom] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Carteras Guardadas</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditingId(null);
              setCloneFromId(null);
              setShowForm(true);
            }}
            className="rounded-lg bg-accent-glow px-3 py-1.5 text-xs font-semibold text-black"
          >
            ＋ Nueva cartera
          </button>
          {/* Copy from existing saved portfolio */}
          <div className="relative">
            <button
              onClick={() => setShowCopyFrom((v) => !v)}
              disabled={(portfolios ?? []).length === 0}
              className="rounded-lg border border-border-glass px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
            >
              📋 Copiar desde...
            </button>
            {showCopyFrom && (portfolios ?? []).length > 0 && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-border-glass bg-bg-glass shadow-xl">
                {(portfolios ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setEditingId(null);
                      setCloneFromId(p.id);
                      setShowForm(true);
                      setShowCopyFrom(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                  >
                    {p.color && (
                      <span
                        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                        style={{ background: p.color }}
                      />
                    )}
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => cloneMut.mutate()}
            disabled={cloneMut.isPending}
            className="rounded-lg border border-border-glass px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
          >
            {cloneMut.isPending ? "Clonando..." : "🔄 Clonar cartera real"}
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <PortfolioForm
          editId={editingId}
          cloneFromId={cloneFromId}
          onClose={() => {
            setShowForm(false);
            setEditingId(null);
            setCloneFromId(null);
          }}
        />
      )}

      {/* Portfolio cards */}
      {(portfolios ?? []).map((p) => (
        <PortfolioCard
          key={p.id}
          portfolio={p}
          isExpanded={expandedId === p.id}
          onToggle={() =>
            setExpandedId(expandedId === p.id ? null : p.id)
          }
          onEdit={() => {
            setEditingId(p.id);
            setCloneFromId(null);
            setShowForm(true);
          }}
          onDelete={() => {
              setConfirmDelete({ id: p.id, name: p.name });
            }}
        />
      ))}

      {(portfolios ?? []).length === 0 && !showForm && (
        <p className="py-8 text-center text-sm text-text-secondary">
          No tienes carteras guardadas. Crea una nueva o clona la cartera actual.
        </p>
      )}

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title="Eliminar cartera"
        message={`¿Eliminar la cartera "${confirmDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => {
          if (confirmDelete) deleteMut.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

/* ── Portfolio Card ───────────────────────────────────────────────────── */

function PortfolioCard({
  portfolio,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  portfolio: SavedPortfolio;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: full } = usePortfolioDetail(isExpanded ? portfolio.id : null);
  const funds = full?.funds ?? portfolio.funds ?? [];

  return (
    <div className="glass-panel p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {portfolio.color && (
            <div
              className="h-3 w-3 rounded-full"
              style={{ background: portfolio.color }}
            />
          )}
          <div>
            <h4 className="font-semibold">{portfolio.name}</h4>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span>
                {portfolio.fund_count ?? funds.length} fondos
              </span>
              {portfolio.updated_at && (
                <span>· Última edición: {fmtDate(portfolio.updated_at)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onToggle}
            className="rounded px-2 py-1 text-xs hover:bg-white/5"
          >
            {isExpanded ? "▲" : "▼ Ver fondos"}
          </button>
          <button
            onClick={onEdit}
            className="rounded px-2 py-1 text-xs hover:bg-white/5"
            title="Editar cartera (incluye calculadora de traspasos)"
          >
            ✏️ Editar
          </button>
          <button
            onClick={onDelete}
            className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-400/10"
          >
            🗑️
          </button>
        </div>
      </div>

      {portfolio.description && (
        <p className="mt-1 text-xs text-text-secondary">
          {portfolio.description}
        </p>
      )}

      {isExpanded && funds.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {funds.map((f) => (
            <div
              key={f.isin}
              className="flex items-center gap-2 text-xs"
            >
              <div
                className="h-1.5 rounded-full bg-accent-glow/60"
                style={{ width: `${Math.max(f.weight * 100, 2)}%` }}
              />
              <span className="min-w-[3.5rem] text-right tabular-nums">
                {(f.weight * 100).toFixed(1)}%
              </span>
              <span className="truncate">{f.name}</span>
              <span className="text-text-secondary">{f.isin}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Portfolio Form ───────────────────────────────────────────────────── */

function PortfolioForm({
  editId,
  cloneFromId,
  onClose,
}: {
  editId: string | null;
  cloneFromId?: string | null;
  onClose: () => void;
}) {
  const { data: existing } = usePortfolioDetail(editId);
  const { data: cloneSource } = usePortfolioDetail(cloneFromId ?? null);
  const { data: favorites } = useFavorites();
  const createMut = useCreatePortfolio();
  const updateMut = useUpdatePortfolio();

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? PALETTE[0]);
  const [funds, setFunds] = useState<
    Array<{ isin: string; name: string; weight: number }>
  >(existing?.funds ?? []);
  /** Whether weight inputs show percentages ("%") or absolute euros ("€") */
  const [weightMode, setWeightMode] = useState<"pct" | "eur">("pct");
  /** ISIN pre-selected as transfer source (traspaso button per-row) */
  const [traspasoFromIsin, setTraspasoFromIsin] = useState<string | undefined>(undefined);

  // Sync when existing data loads (edit mode)
  const [synced, setSynced] = useState(false);
  if (existing && !synced && editId) {
    setName(existing.name);
    setDescription(existing.description ?? "");
    setColor(existing.color ?? PALETTE[0]);

    // If the portfolio has a known monetary total (e.g. cloned from real portfolio),
    // switch to EUR mode and expand fractional weights → absolute amounts
    const tv = existing.total_value ?? 0;
    if (tv > 0) {
      const eurFunds = (existing.funds ?? []).map((f) => ({
        ...f,
        weight: Math.round(f.weight * tv * 100) / 100,
      }));
      setFunds(eurFunds);
      setWeightMode("eur");
    } else {
      setFunds(existing.funds ?? []);
    }
    setSynced(true);
  }

  // Sync when cloneSource loads (copy-from mode): pre-fill funds but clear name
  const [cloneSynced, setCloneSynced] = useState(false);
  if (cloneSource && !cloneSynced && !editId && cloneFromId) {
    setDescription(`Copia de ${cloneSource.name}`);
    setColor(cloneSource.color ?? PALETTE[0]);
    const tv = cloneSource.total_value ?? 0;
    if (tv > 0) {
      const eurFunds = (cloneSource.funds ?? []).map((f) => ({
        ...f,
        weight: Math.round(f.weight * tv * 100) / 100,
      }));
      setFunds(eurFunds);
      setWeightMode("eur");
    } else {
      setFunds(cloneSource.funds ?? []);
    }
    setCloneSynced(true);
  }

  const addFund = useCallback(
    (isin: string, fundName: string) => {
      if (funds.find((f) => f.isin === isin)) return;
      // Default to 100% weight for the first fund; 0 otherwise (user will balance)
      const defaultWeight = weightMode === "pct" && funds.length === 0 ? 1 : 0;
      setFunds([...funds, { isin, name: fundName, weight: defaultWeight }]);
    },
    [funds, weightMode],
  );

  const removeFund = (isin: string) =>
    setFunds(funds.filter((f) => f.isin !== isin));

  const updateWeight = (isin: string, weight: number) =>
    setFunds(funds.map((f) => (f.isin === isin ? { ...f, weight } : f)));

  /** When in "€" mode, interpret value as absolute amount and convert to weight */
  const updateWeightFromEur = (isin: string, eurValue: number) => {
    // Store as absolute amount temporarily (we normalise on save)
    setFunds(funds.map((f) => (f.isin === isin ? { ...f, weight: eurValue } : f)));
  };

  /** Total “weight” across all funds when in "€" mode (= total portfolio €) */
  const totalEur = funds.reduce((s, f) => s + f.weight, 0);

  const normalize = () => {
    const total = funds.reduce((s, f) => s + f.weight, 0);
    if (total === 0) return;
    setFunds(
      funds.map((f) => ({
        ...f,
        weight: Math.round((f.weight / total) * 1_000_000) / 1_000_000,
      })),
    );
    // After normalization, switch to % view so user sees the result
    setWeightMode("pct");
  };

  const handleSave = async () => {
    // Normalize weights to 0-1 fractions before saving (handles € mode)
    const total = funds.reduce((s, f) => s + f.weight, 0);
    const normalizedFunds =
      total > 0 && Math.abs(total - 1) > 0.001
        ? funds.map((f) => ({
            ...f,
            weight: Math.round((f.weight / total) * 1_000_000) / 1_000_000,
          }))
        : funds;

    // Persist total_value when in EUR mode so the portfolio can restore amounts on re-open
    const savedTotalValue = weightMode === "eur" && total > 1 ? total : undefined;

    const body: Record<string, unknown> = { name, description, color, funds: normalizedFunds };
    if (savedTotalValue !== undefined) body.total_value = savedTotalValue;

    if (editId) {
      await updateMut.mutateAsync({ id: editId, body: body as Partial<SavedPortfolio> });
    } else {
      await createMut.mutateAsync(body as Omit<SavedPortfolio, "id" | "created_at" | "updated_at">);
    }
    onClose();
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="glass-panel space-y-4 p-5">
      <h4 className="font-semibold">
        {editId
          ? "Editar Cartera"
          : cloneFromId
            ? `📋 Nueva Cartera – Copia de "${cloneSource?.name ?? "..."}"`
            : "Nueva Cartera"}
      </h4>

      {/* Name + Description */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Nombre
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={cloneFromId ? `Nombre para la nueva cartera…` : ""}
            className="w-full rounded-md border border-border-glass bg-bg-glass px-3 py-1.5 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Descripción
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-border-glass bg-bg-glass px-3 py-1.5 text-sm text-white"
          />
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Color</label>
        <div className="flex gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform",
                color === c
                  ? "scale-110 border-white"
                  : "border-transparent hover:scale-105",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Funds list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Fondos</label>
          <div className="flex items-center gap-3">
            {/* Weight mode toggle */}
            <div className="flex rounded-md border border-border-glass text-xs overflow-hidden">
              <button
                onClick={() => setWeightMode("pct")}
                className={cn(
                  "px-2 py-0.5 transition-colors",
                  weightMode === "pct"
                    ? "bg-accent-glow/20 text-accent-glow"
                    : "hover:bg-white/5",
                )}
              >
                %
              </button>
              <button
                onClick={() => setWeightMode("eur")}
                className={cn(
                  "px-2 py-0.5 transition-colors",
                  weightMode === "eur"
                    ? "bg-accent-glow/20 text-accent-glow"
                    : "hover:bg-white/5",
                )}
              >
                €
              </button>
            </div>
            <button
              onClick={normalize}
              className="text-xs text-accent-glow hover:underline"
            >
              Normalizar a 100%
            </button>
          </div>
        </div>

        {weightMode === "eur" && totalEur > 0 && (
          <p className="text-xs text-text-secondary">
            Total: <span className="text-accent-glow font-semibold">{fmtEur(totalEur)}</span>
            {" "}(pulsa “Normalizar” para convertir a pesos %)
          </p>
        )}

        {funds.map((f) => (
          <div
            key={f.isin}
            className="flex items-center gap-2 text-sm"
          >
            <div className="min-w-0 flex-1 truncate">
              <span className="font-medium">{f.name}</span>
              <span className="ml-2 text-xs text-text-secondary">
                {f.isin}
              </span>
            </div>

            {weightMode === "pct" ? (
              <>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={f.weight * 100}
                  onChange={(e) =>
                    updateWeight(f.isin, Number(e.target.value) / 100)
                  }
                  className="w-24 accent-accent-glow"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={+(f.weight * 100).toFixed(1)}
                  onChange={(e) =>
                    updateWeight(f.isin, Number(e.target.value) / 100)
                  }
                  className="w-16 rounded border border-border-glass bg-bg-glass px-1.5 py-0.5 text-right text-xs tabular-nums focus:outline-none focus:border-accent-glow"
                />
                <span className="w-4 text-xs text-text-secondary">%</span>
              </>
            ) : (
              <>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={f.weight === 0 ? "" : f.weight}
                  placeholder="0"
                  onChange={(e) =>
                    updateWeightFromEur(f.isin, e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="w-28 rounded border border-border-glass bg-bg-glass px-1.5 py-0.5 text-right text-xs tabular-nums focus:outline-none focus:border-accent-glow"
                />
                <span className="w-4 text-xs text-text-secondary">€</span>
              </>
            )}

            <button
              onClick={() => removeFund(f.isin)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              ✕
            </button>
            {funds.length >= 2 && (
              <button
                onClick={() => setTraspasoFromIsin(f.isin)}
                title="Traspasar desde este fondo"
                className="text-xs text-accent-glow/70 hover:text-accent-glow"
              >
                ⇄
              </button>
            )}
          </div>
        ))}

        <FundSearchInput
          onSelect={(r) => addFund(r.isin, r.name)}
          placeholder="Añadir fondo..."
          portfolioIsins={funds.map((f) => f.isin)}
          favoriteIsins={(favorites ?? []).map((f) => f.isin)}
        />
      </div>

      {/* Traspasos calculator — available in both create and edit modes */}
      {funds.length >= 2 && (
        <TraspasoCalculator
          funds={funds}
          setFunds={setFunds}
          weightMode={weightMode}
          setWeightMode={setWeightMode}
          triggerFromIsin={traspasoFromIsin}
          onTriggerConsumed={() => setTraspasoFromIsin(undefined)}
        />
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || funds.length === 0}
          className="rounded-lg bg-accent-glow px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {saving ? "Guardando..." : editId ? "Guardar Cambios" : "Crear Cartera"}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-border-glass px-4 py-2 text-sm hover:bg-white/5"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ── Traspaso Calculator ───────────────────────────────────────────────── */

interface AppliedTransfer {
  id: number;
  fromIsin: string;
  fromName: string;
  toIsin: string;
  toName: string;
  amount: number;
}

function TraspasoCalculator({
  funds,
  setFunds,
  weightMode,
  setWeightMode,
  triggerFromIsin,
  onTriggerConsumed,
}: {
  funds: Array<{ isin: string; name: string; weight: number }>;
  setFunds: React.Dispatch<React.SetStateAction<Array<{ isin: string; name: string; weight: number }>>>;
  weightMode: "pct" | "eur";
  setWeightMode: (m: "pct" | "eur") => void;
  triggerFromIsin?: string;
  onTriggerConsumed?: () => void;
}) {
  const [showPanel, setShowPanel] = useState(false);
  const [fromIsin, setFromIsin] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // When a traspaso button from a fund row triggers this component, open and pre-select
  useEffect(() => {
    if (triggerFromIsin) {
      setFromIsin(triggerFromIsin);
      setShowPanel(true);
      onTriggerConsumed?.();
      // Scroll to this component after a tick
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerFromIsin]);
  const [toIsin, setToIsin] = useState("");
  const [toName, setToName] = useState("");
  const [allowNewDest, setAllowNewDest] = useState(false);
  const [amount, setAmount] = useState<number | "">("");
  const [history, setHistory] = useState<AppliedTransfer[]>([]);
  const [nextId, setNextId] = useState(1);

  const totalEur = funds.reduce((s, f) => s + f.weight, 0);
  const fromFund = funds.find((f) => f.isin === fromIsin);
  const toFund = funds.find((f) => f.isin === toIsin);

  const canApply =
    weightMode === "eur" &&
    fromIsin &&
    toIsin &&
    fromIsin !== toIsin &&
    typeof amount === "number" &&
    amount > 0 &&
    fromFund != null &&
    fromFund.weight >= amount;

  const handleApply = () => {
    if (!canApply || typeof amount !== "number") return;
    const resolvedToName = toFund?.name ?? toName ?? toIsin;
    setFunds((prev) => {
      // Check if TO fund already exists in the list
      const hasTo = prev.some((f) => f.isin === toIsin);
      return prev
        .map((f) => {
          if (f.isin === fromIsin) return { ...f, weight: Math.round((f.weight - amount) * 100) / 100 };
          if (f.isin === toIsin) return { ...f, weight: Math.round((f.weight + amount) * 100) / 100 };
          return f;
        })
        .concat(
          !hasTo ? [{ isin: toIsin, name: resolvedToName, weight: amount }] : [],
        );
    });
    setHistory((prev) => [
      ...prev,
      {
        id: nextId,
        fromIsin,
        fromName: fromFund?.name ?? fromIsin,
        toIsin,
        toName: resolvedToName,
        amount,
      },
    ]);
    setNextId((n) => n + 1);
    setAmount("");
    // Reset new-fund destination after applying
    if (allowNewDest) { setToIsin(""); setToName(""); }
  };

  const undoTransfer = (transfer: AppliedTransfer) => {
    setFunds((prev) =>
      prev.map((f) => {
        if (f.isin === transfer.fromIsin) return { ...f, weight: Math.round((f.weight + transfer.amount) * 100) / 100 };
        if (f.isin === transfer.toIsin) return { ...f, weight: Math.round((f.weight - transfer.amount) * 100) / 100 };
        return f;
      }),
    );
    setHistory((prev) => prev.filter((t) => t.id !== transfer.id));
  };

  return (
    <div ref={panelRef} className="rounded-lg border border-border-glass/60 bg-white/3">
      <button
        onClick={() => setShowPanel((v) => !v)}
        className="flex w-full items-center justify-between p-3 text-sm hover:bg-white/5"
      >
        <span className="font-semibold">⇄ Realizar un traspaso</span>
        <span className="text-text-secondary text-xs">{showPanel ? "▲ Ocultar" : "▼ Ver"}</span>
      </button>

      {showPanel && (
        <div className="border-t border-border-glass/40 p-4 space-y-4">
          <p className="text-xs text-text-secondary">
            Indica el importe a mover de un fondo a otro. Los cambios se aplicarán a los importes de la cartera directamente.
          </p>

          {/* Require € mode */}
          {weightMode !== "eur" && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/8 p-3 text-xs">
              <p className="text-yellow-300 font-medium">Los traspasos funcionan en modo €.</p>
              <p className="text-text-secondary mt-0.5">
                Introduce los importes actuales de cada fondo en euros y activa el modo €.
              </p>
              <button
                onClick={() => setWeightMode("eur")}
                className="mt-2 rounded-md border border-yellow-500/40 px-3 py-1 text-xs text-yellow-300 hover:bg-yellow-500/10"
              >
                Cambiar a modo €
              </button>
            </div>
          )}

          {weightMode === "eur" && (
            <>
              {/* Transfer form */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_100px_auto]">
                {/* FROM */}
                <div>
                  <label className="mb-1 block text-[10px] text-text-secondary uppercase tracking-wide">Origen</label>
                  <select
                    value={fromIsin}
                    onChange={(e) => setFromIsin(e.target.value)}
                    className="w-full rounded-md border border-border-glass bg-[#12172a] px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent-glow"
                  >
                    <option value="">— Seleccionar fondo —</option>
                    {funds.filter((f) => f.weight > 0).map((f) => (
                      <option key={f.isin} value={f.isin}>
                        {f.name} ({fmtEur(f.weight)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* TO */}
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <label className="text-[10px] text-text-secondary uppercase tracking-wide">Destino</label>
                    <button
                      type="button"
                      onClick={() => { setAllowNewDest((v) => !v); setToIsin(""); setToName(""); }}
                      className="rounded-full border border-border-glass px-1.5 py-0.5 text-[9px] text-text-secondary hover:border-accent-glow hover:text-accent-glow transition-colors"
                    >
                      {allowNewDest ? "En cartera" : "Fondo nuevo ＋"}
                    </button>
                  </div>
                  {allowNewDest ? (
                    <div>
                      {toIsin ? (
                        <div className="flex items-center justify-between rounded-md border border-accent-glow/40 bg-accent-glow/5 px-2 py-1.5 text-xs">
                          <div>
                            <span className="font-medium text-white">{toName}</span>
                            <span className="ml-2 font-mono text-text-secondary">{toIsin}</span>
                          </div>
                          <button
                            onClick={() => { setToIsin(""); setToName(""); }}
                            className="text-text-secondary hover:text-red-400"
                          >✕</button>
                        </div>
                      ) : (
                        <FundSearchInput
                          onSelect={(r) => { setToIsin(r.isin); setToName(r.name); }}
                          placeholder="Buscar fondo destino…"
                          portfolioIsins={[]}
                          favoriteIsins={[]}
                        />
                      )}
                    </div>
                  ) : (
                    <select
                      value={toIsin}
                      onChange={(e) => setToIsin(e.target.value)}
                      className="w-full rounded-md border border-border-glass bg-[#12172a] px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent-glow"
                    >
                      <option value="">— Seleccionar fondo —</option>
                      {funds.filter((f) => f.isin !== fromIsin).map((f) => (
                        <option key={f.isin} value={f.isin}>
                          {f.name} ({fmtEur(f.weight)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="mb-1 block text-[10px] text-text-secondary uppercase tracking-wide">Importe</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      step={100}
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full rounded-md border border-border-glass bg-bg-glass px-2 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-accent-glow"
                    />
                    <span className="shrink-0 text-xs text-text-secondary">€</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    {fromFund && (
                      <button
                        type="button"
                        onClick={() => setAmount(fromFund.weight)}
                        className="rounded-full border border-accent-glow/40 px-2 py-0.5 text-[9px] text-accent-glow hover:bg-accent-glow/10 transition-colors"
                      >
                        Todo ({fmtEur(fromFund.weight)})
                      </button>
                    )}
                    {fromFund && typeof amount === "number" && amount > fromFund.weight && (
                      <span className="text-[10px] text-red-400">Máx. {fmtEur(fromFund.weight)}</span>
                    )}
                  </div>
                </div>

                {/* Apply button */}
                <div className="flex items-end">
                  <button
                    onClick={handleApply}
                    disabled={!canApply}
                    className="w-full rounded-md bg-accent-glow px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
                  >
                    ⇄ Aplicar
                  </button>
                </div>
              </div>

              {/* Preview */}
              {fromIsin && toIsin && fromIsin !== toIsin && typeof amount === "number" && amount > 0 && fromFund && (
                <div className="rounded-lg bg-white/5 p-2 text-xs text-text-secondary flex flex-wrap gap-4">
                  <span>
                    <span className="text-white">{fromFund.name}:</span>{" "}
                    <span className="text-red-400 tabular-nums">{fmtEur(fromFund.weight)} → {fmtEur(fromFund.weight - amount)}</span>
                  </span>
                  <span className="text-text-muted">⇒</span>
                  <span>
                    <span className="text-white">{toFund ? toFund.name : (toName || toIsin)}:</span>{" "}
                    <span className="text-green-400 tabular-nums">
                      {fmtEur(toFund?.weight ?? 0)} → {fmtEur((toFund?.weight ?? 0) + amount)}
                    </span>
                  </span>
                  <span className="text-text-secondary">| Total: {fmtEur(totalEur)}</span>
                </div>
              )}

              {/* History */}
              {history.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-text-secondary uppercase tracking-wide">Traspasos aplicados (más recientes primero)</div>
                  {[...history].reverse().map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded bg-white/5 px-3 py-1.5 text-xs"
                    >
                      <span>
                        <span className="text-red-400">{t.fromName}</span>
                        {" → "}
                        <span className="text-green-400">{t.toName}</span>
                        {" · "}
                        <span className="tabular-nums font-semibold text-white">{fmtEur(t.amount)}</span>
                      </span>
                      <button
                        onClick={() => undoTransfer(t)}
                        className="text-text-secondary hover:text-red-400 transition-colors"
                        title="Deshacer este traspaso"
                      >
                        ↩ deshacer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
