import { useState } from "react";
import { SubTabs } from "@/components/ui";
import { MisCarterasView } from "./components/mis-carteras-view";
import { FavoritosView } from "./components/favoritos-view";
import { CompararView } from "./components/comparar-view";

type SubTab = "carteras" | "favoritos" | "comparar";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "carteras", label: "� Mis Carteras" },
  { key: "favoritos", label: "⭐ Favoritos" },
  { key: "comparar", label: "⚖️ Comparar" },
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
      {subTab === "favoritos" && <FavoritosView />}
      {subTab === "comparar" && <CompararView />}
    </div>
  );
}
