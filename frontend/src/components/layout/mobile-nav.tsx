import { useState } from "react";
import { NavLink } from "react-router";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavTab } from "./nav-tabs";

interface MobileNavProps {
  tabs: readonly NavTab[];
  /** Nº de pestañas mostradas directamente en la barra; el resto va a "Más". */
  primaryCount?: number;
  onPrefetch?: (to: string) => void;
}

/**
 * Barra de navegación inferior fija para móvil (estilo app nativa).
 * Muestra las primeras `primaryCount` pestañas y agrupa el resto en una
 * hoja deslizante accesible desde el botón "Más". Se oculta en escritorio
 * (md+), donde se usa la barra de pestañas superior.
 */
export function MobileNav({ tabs, primaryCount = 4, onPrefetch }: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const primary = tabs.slice(0, primaryCount);
  const overflow = tabs.slice(primaryCount);

  const itemClass = (isActive: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
      isActive ? "text-accent-glow" : "text-text-secondary",
    );

  return (
    <>
      {/* Barra inferior fija */}
      <nav
        className="fixed inset-x-0 bottom-0 z-[9000] flex border-t border-border-glass bg-bg-dark/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primary.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              onClick={() => onPrefetch?.(tab.to)}
              className={({ isActive }) => itemClass(isActive)}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate max-w-[64px]">{tab.label}</span>
            </NavLink>
          );
        })}

        {overflow.length > 0 && (
          <button
            onClick={() => setSheetOpen(true)}
            className={itemClass(false)}
            aria-label="Más secciones"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>Más</span>
          </button>
        )}
      </nav>

      {/* Hoja deslizante con las pestañas restantes */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[9500] flex items-end md:hidden"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div
            className="glass-panel w-full rounded-b-none p-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Más secciones</h3>
              <button
                onClick={() => setSheetOpen(false)}
                className="text-text-secondary hover:text-text-primary"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {overflow.map((tab) => {
                const Icon = tab.icon;
                return (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end={tab.end}
                    onClick={() => {
                      onPrefetch?.(tab.to);
                      setSheetOpen(false);
                    }}
                    className={({ isActive }) =>
                      cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border border-border-glass px-2 py-3 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-accent-glow/15 text-accent-glow"
                          : "text-text-secondary hover:bg-bg-glass-hover hover:text-text-primary",
                      )
                    }
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-center leading-tight">{tab.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
