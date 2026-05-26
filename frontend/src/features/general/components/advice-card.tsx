import { AlertTriangle } from "lucide-react";

interface AdviceCardProps {
  recommendation: Record<string, Record<string, string>>;
}

export function AdviceCard({ recommendation }: AdviceCardProps) {
  const cashWarn = recommendation?.cash_warn;
  if (!cashWarn) return null;

  return (
    <div className="glass-panel border-l-4 border-yellow-400 p-4">
      <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-yellow-400">
        <AlertTriangle className="size-4" />
        Aviso
      </h4>
      <div className="space-y-1 text-xs text-text-secondary">
        {Object.entries(cashWarn).map(([key, val]) => (
          <p key={key}>
            <strong className="text-text-primary">{key}:</strong> {val}
          </p>
        ))}
      </div>
    </div>
  );
}
