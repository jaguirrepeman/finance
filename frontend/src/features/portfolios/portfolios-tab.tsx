import { useState } from "react";
import { SubTabs } from "@/components/ui";
import { MisCarterasView } from "./components/mis-carteras-view";
import { CompararView } from "./components/comparar-view";
import { SustitucionesView } from "./components/sustituciones-view";

type SubTab = "carteras" | "comparar" | "sustituciones";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "carteras", label: "Mis Carteras" },
  { key: "comparar", label: "Comparar" },
  { key: "sustituciones", label: "Sustituciones" },
];

export function PortfoliosTab() {
  const [subTab, setSubTab] = useState<SubTab>("carteras");

  return (
    <div className="space-y-4">
      <SubTabs
        tabs={SUB_TABS}
        value={subTab}
        onChange={(k) => setSubTab(k as SubTab)}
      />

      {subTab === "carteras" && <MisCarterasView />}
      {subTab === "comparar" && <CompararView />}
      {subTab === "sustituciones" && <SustitucionesView />}
    </div>
  );
}
