import { useEffect, useRef, useState } from "react";

interface AppGesturesOptions {
  /** Swipe horizontal hacia la izquierda (→ siguiente pestaña). */
  onSwipeLeft?: () => void;
  /** Swipe horizontal hacia la derecha (→ pestaña anterior). */
  onSwipeRight?: () => void;
  /** Tirar hacia abajo desde el tope (pull-to-refresh). Puede ser async. */
  onPull?: () => void | Promise<void>;
}

const SWIPE_THRESHOLD = 60; // px mínimos para considerar swipe
const PULL_THRESHOLD = 70; // px de tirón para disparar refresh
const PULL_MAX = 90; // tope visual del indicador
const AXIS_LOCK = 12; // px para decidir el eje del gesto

/** ¿El elemento (o algún ancestro hasta `boundary`) puede hacer scroll horizontal? */
function isInHorizontalScroller(target: EventTarget | null, boundary: Element): boolean {
  let el = target as Element | null;
  while (el && el !== boundary) {
    if (el instanceof HTMLElement) {
      // inputs de rango deslizan en horizontal por sí mismos
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "range") return true;
      const style = window.getComputedStyle(el);
      const ox = style.overflowX;
      if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 2) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Gestos "de app" para móvil, atados a un contenedor vía la ref devuelta.
 *
 * - Swipe horizontal → cambia de pestaña (respetando scrollers horizontales).
 * - Tirar hacia abajo desde arriba → pull-to-refresh.
 *
 * Solo reacciona a eventos táctiles, así que en escritorio (ratón) no hace
 * nada: misma base de código, sin ramas duplicadas.
 */
export function useAppGestures({ onSwipeLeft, onSwipeRight, onPull }: AppGesturesOptions) {
  const ref = useRef<HTMLElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Callbacks y estado en refs para enganchar los listeners UNA sola vez.
  const cbRef = useRef({ onSwipeLeft, onSwipeRight, onPull });
  cbRef.current = { onSwipeLeft, onSwipeRight, onPull };
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const setPullBoth = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };
  const setRefreshingBoth = (v: boolean) => {
    refreshingRef.current = v;
    setRefreshing(v);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let axis: null | "x" | "y" = null;
    let active = false;
    let fromTop = false;
    let guardX = false;

    const scrollTop = () =>
      (document.scrollingElement || document.documentElement).scrollTop;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || refreshingRef.current) {
        active = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      axis = null;
      active = true;
      fromTop = scrollTop() <= 0;
      guardX = isInHorizontalScroller(e.target, el);
    };

    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!axis) {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }

      // Pull-to-refresh: tirón vertical hacia abajo estando en el tope.
      if (axis === "y" && fromTop && dy > 0) {
        const dist = Math.min(dy * 0.5, PULL_MAX); // amortiguado
        setPullBoth(dist);
        e.preventDefault(); // requiere listener no-pasivo
      }
    };

    const finish = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (
        axis === "x" &&
        !guardX &&
        Math.abs(dx) > SWIPE_THRESHOLD &&
        Math.abs(dx) > Math.abs(dy) * 1.5
      ) {
        if (dx < 0) cbRef.current.onSwipeLeft?.();
        else cbRef.current.onSwipeRight?.();
      }

      if (axis === "y" && pullRef.current >= PULL_THRESHOLD && !refreshingRef.current) {
        setRefreshingBoth(true);
        Promise.resolve(cbRef.current.onPull?.()).finally(() => {
          setRefreshingBoth(false);
          setPullBoth(0);
        });
      } else if (pullRef.current !== 0) {
        setPullBoth(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", finish, { passive: true });
    el.addEventListener("touchcancel", finish, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", finish);
    };
  }, []);

  return { ref, pull, refreshing };
}
