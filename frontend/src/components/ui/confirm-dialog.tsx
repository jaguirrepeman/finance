import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Custom confirm dialog that matches the dashboard glass-morphism style.
 * Drop-in replacement for window.confirm().
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button when dialog opens (safer default)
  useEffect(() => {
    if (isOpen) {
      cancelRef.current?.focus();
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="glass-panel w-full max-w-sm p-6 shadow-glass">
        {title && (
          <h3 className="mb-2 text-base font-semibold text-text-primary">
            {title}
          </h3>
        )}
        <p className="text-sm text-text-secondary">{message}</p>

        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-lg border border-border-glass px-4 py-2 text-sm hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent-glow/50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-1",
              variant === "danger"
                ? "bg-red-500/80 text-white hover:bg-red-500 focus:ring-red-500/50"
                : "bg-accent-glow text-black hover:opacity-90 focus:ring-accent-glow/50",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hook for a simple confirm dialog with promise-based API */
export function useConfirmDialog() {
  return null; // See ConfirmDialog component above for direct usage
}
