import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  PieChart,
  TrendingUp,
  Target,
  Calculator,
  Banknote,
  Briefcase,
  Star,
  Database,
} from "lucide-react";

export interface NavTab {
  to: string;
  label: string;
  end?: boolean;
  icon: LucideIcon;
}

/**
 * Única fuente de verdad para las pestañas/secciones de la app.
 * La usan: la barra superior (escritorio), la barra inferior (móvil) y la
 * navegación por deslizamiento. El ORDEN aquí define el orden del swipe.
 */
export const TABS: readonly NavTab[] = [
  { to: "/", label: "General", end: true, icon: LayoutDashboard },
  { to: "/details", label: "Detalles", icon: PieChart },
  { to: "/evolution", label: "Evolución", icon: TrendingUp },
  { to: "/opportunities", label: "Oportunidades", icon: Target },
  { to: "/simulator", label: "Proyección", icon: Calculator },
  { to: "/withdrawals", label: "Retiradas", icon: Banknote },
  { to: "/portfolios", label: "Carteras", icon: Briefcase },
  { to: "/favoritos", label: "Favoritos", icon: Star },
  { to: "/providers", label: "Proveedores", icon: Database },
] as const;

/** Rutas en orden, para la navegación por deslizamiento. */
export const TAB_PATHS: readonly string[] = TABS.map((t) => t.to);
