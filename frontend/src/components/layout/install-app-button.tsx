import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Evento no estándar de Chromium para instalar la PWA. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** ¿La app ya está instalada / ejecutándose como PWA? */
function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari expone navigator.standalone
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Detección de iOS/iPadOS (Safari no dispara beforeinstallprompt). */
function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS se identifica como Mac; se distingue por el táctil
    (/macintosh/i.test(ua) && "ontouchend" in document)
  );
}

/**
 * Botón "Instalar app".
 *
 * - Android/escritorio (Chromium): usa el evento `beforeinstallprompt` para
 *   lanzar el diálogo nativo de instalación (mismo patrón que gymapp).
 * - iOS/iPadOS (Safari): no hay API de instalación, así que muestra las
 *   instrucciones manuales (Compartir → Añadir a pantalla de inicio).
 * - Si ya está instalada (standalone) o el navegador no lo soporta, no se
 *   renderiza nada.
 */
export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // evita el mini-infobar; mostramos nuestro botón
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Nada que mostrar: ya instalada, o navegador sin soporte y no es iOS.
  if (installed) return null;
  if (!deferred && !ios) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setDeferred(null);
      return;
    }
    if (ios) setShowIosHelp((v) => !v);
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        aria-label="Instalar app"
        className={cn(
          "glass-panel-sm flex items-center gap-2 px-3 py-2 text-sm font-medium sm:px-4",
          "text-accent-glow transition-opacity hover:opacity-90",
        )}
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Instalar app</span>
      </button>

      {showIosHelp && ios && (
        <div className="glass-panel absolute right-0 top-full z-[10001] mt-2 w-64 p-3 text-xs text-text-secondary shadow-glass">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-text-primary">Instalar en iPhone/iPad</span>
            <button onClick={() => setShowIosHelp(false)} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          En <span className="text-text-primary">Safari</span>, pulsa{" "}
          <span className="text-text-primary">Compartir</span> y elige{" "}
          <span className="text-text-primary">"Añadir a pantalla de inicio"</span>.
        </div>
      )}
    </div>
  );
}
