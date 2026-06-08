import { useState, useRef, useEffect, type DragEvent } from "react";
import { Upload, X, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import { Spinner } from "@/components/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";

interface UploadOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_SIZE_MB = 15;

/** Extensiones aceptadas por cada fuente de datos. Debe reflejar lo que el
 *  backend sabe parsear para cada source_type. */
const ACCEPTED_EXT: Record<string, string[]> = {
  myinvestor_fondos: [".csv", ".tsv", ".xlsx"],
  traderepublic_etfs: [".csv"],
  myinvestor_etfs: [".xlsx"],
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

export function UploadOrdersModal({ isOpen, onClose }: UploadOrdersModalProps) {
  const [sourceType, setSourceType] = useState("myinvestor_fondos");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const acceptedExts = ACCEPTED_EXT[sourceType] ?? [];
  const acceptAttr = acceptedExts.join(",");

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setError("");
      setProgress(0);
      setSourceType("myinvestor_fondos");
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUploading) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, isUploading, onClose]);

  if (!isOpen) return null;

  /** Valida extensión y tamaño antes de aceptar el fichero. */
  const validateAndSet = (f: File | null) => {
    if (!f) return;
    const ext = extOf(f.name);
    if (acceptedExts.length && !acceptedExts.includes(ext)) {
      setError(`Esta fuente solo admite: ${acceptedExts.join(", ")}.`);
      setFile(null);
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`El fichero supera el máximo de ${MAX_SIZE_MB} MB.`);
      setFile(null);
      return;
    }
    setError("");
    setFile(f);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    validateAndSet(e.dataTransfer.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Por favor, selecciona un fichero primero.");
      return;
    }

    setIsUploading(true);
    setError("");
    setProgress(0);

    try {
      await api.uploadOrdersFile(file, sourceType, setProgress);
      queryClient.invalidateQueries(); // Refresh all data
      onClose();
    } catch (err: any) {
      setError(err.message || "Error al subir el fichero.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) onClose();
      }}
    >
      <div className="glass-panel w-full max-w-md p-6 shadow-glass relative">
        <button
          onClick={onClose}
          disabled={isUploading}
          className="absolute right-4 top-4 text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <Upload className="h-5 w-5 text-accent-glow" />
          <h3 className="text-lg font-semibold text-text-primary">
            Cargar Datos de Inversión
          </h3>
        </div>

        <p className="mb-6 text-sm text-text-secondary">
          Sube un fichero con tus órdenes o transacciones para actualizar la cartera.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Fuente de Datos
            </label>
            <select
              value={sourceType}
              onChange={(e) => {
                setSourceType(e.target.value);
                setFile(null);
                setError("");
              }}
              disabled={isUploading}
              className="w-full rounded-lg border border-border-glass bg-bg-dark px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-glow focus:ring-1 focus:ring-accent-glow disabled:opacity-50"
            >
              <option value="myinvestor_fondos">MyInvestor Fondos (.csv, .tsv, .xlsx)</option>
              <option value="traderepublic_etfs">Trade Republic ETFs (.csv)</option>
              <option value="myinvestor_etfs">MyInvestor ETFs (.xlsx)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Fichero
            </label>

            {/* Zona de drag-and-drop (también clicable, táctil-friendly) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !isUploading) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isUploading) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                isDragging
                  ? "border-accent-glow bg-accent-glow/10"
                  : "border-border-glass hover:border-accent-glow/60 hover:bg-white/5",
                isUploading && "pointer-events-none opacity-60",
              )}
            >
              {file ? (
                <>
                  <FileCheck className="h-7 w-7 text-accent-glow" />
                  <span className="break-all text-sm font-medium text-text-primary">
                    {file.name}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {(file.size / 1024).toFixed(0)} KB · toca para cambiar
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-7 w-7 text-text-secondary" />
                  <span className="text-sm text-text-primary">
                    Arrastra el fichero aquí o toca para seleccionar
                  </span>
                  <span className="text-xs text-text-secondary">
                    {acceptedExts.join(", ")} · máx. {MAX_SIZE_MB} MB
                  </span>
                </>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
              disabled={isUploading}
              className="hidden"
              accept={acceptAttr}
            />
          </div>

          {isUploading && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-text-secondary">
                <span>Subiendo…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-bg-glass">
                <div
                  className="h-full rounded-full bg-accent-glow transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="rounded-lg border border-border-glass px-4 py-2 text-sm hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-glow/50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading || !file}
            className={cn(
              "flex items-center gap-2 rounded-lg bg-accent-glow px-4 py-2 text-sm font-semibold text-black hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-glow/50 focus:ring-offset-1 disabled:opacity-50",
            )}
          >
            {isUploading ? <Spinner className="h-4 w-4" /> : null}
            {isUploading ? "Subiendo..." : "Subir Fichero"}
          </button>
        </div>
      </div>
    </div>
  );
}
