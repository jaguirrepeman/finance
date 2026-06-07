import { useState, useRef, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import { Spinner } from "@/components/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";

interface UploadOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UploadOrdersModal({ isOpen, onClose }: UploadOrdersModalProps) {
  const [sourceType, setSourceType] = useState("myinvestor_fondos");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setError("");
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

  const handleUpload = async () => {
    if (!file) {
      setError("Por favor, selecciona un fichero primero.");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      await api.uploadOrdersFile(file, sourceType);
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
              onChange={(e) => setSourceType(e.target.value)}
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
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={isUploading}
              className="w-full text-sm text-text-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-bg-glass file:px-4 file:py-2 file:text-sm file:font-semibold file:text-text-primary hover:file:bg-bg-glass-hover focus:outline-none disabled:opacity-50"
              accept=".csv,.tsv,.xlsx"
            />
          </div>

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
