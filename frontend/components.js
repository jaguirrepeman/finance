const { useState, useEffect, useRef, useMemo } = React;
const COLORS = ["#4ca1af", "#c4e0e5", "#89f7fe", "#66a6ff", "#f3a183", "#a18cd1", "#fbc2eb", "#fad0c4", "#ff9a9e", "#fecfef"];
const AdviceCard = ({ advice, type = "info" }) => /* @__PURE__ */ React.createElement("div", { className: `glass-panel advice-card ${type}` }, /* @__PURE__ */ React.createElement("div", { className: "advice-title" }, advice.title), /* @__PURE__ */ React.createElement("div", { className: "advice-text" }, advice.text));
const GeneralTab = ({ data, chartData, reloadData }) => {
  const [newFund, setNewFund] = useState({ Fondo: "", ISIN: "", TIPO: "INDEX", Porcentaje: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [lastDate, setLastDate] = useState(null);
  useEffect(() => {
    fetch("/api/portfolio/last_update").then((r) => r.json()).then((d) => setLastDate(d.last_date || null)).catch(() => {
    });
  }, []);
  const handleAdd = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await fetch("/api/portfolio/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newFund)
    });
    setIsSaving(false);
    setNewFund({ Fondo: "", ISIN: "", TIPO: "INDEX", Porcentaje: 0 });
    reloadData();
  };
  const handleDelete = async (id) => {
    if (!confirm(`\xBFSeguro que quieres eliminar la entrada: ${id}?`)) return;
    await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    reloadData();
  };
  return /* @__PURE__ */ React.createElement("div", { className: "main-content", style: { gridTemplateColumns: "1fr" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 0.75rem", fontWeight: 600, fontSize: "0.9rem" } }, "Asset Allocation"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: "24px", borderRadius: "6px", overflow: "hidden", width: "100%", marginBottom: "0.75rem" } }, chartData.map((entry, index) => /* @__PURE__ */ React.createElement("div", { key: entry.name, title: `${entry.name}: ${entry.value.toFixed(1)}%`, style: {
    width: `${entry.value / Object.values(data.summary.details).reduce((a, b) => a + b, 0) * 100}%`,
    backgroundColor: COLORS[index % COLORS.length]
  } }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.6rem" } }, chartData.map((entry, index) => /* @__PURE__ */ React.createElement("div", { key: entry.name, style: { display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "10px", height: "10px", borderRadius: "3px", backgroundColor: COLORS[index % COLORS.length] } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, entry.name, " ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, entry.value.toFixed(1), "%")))))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 0.75rem", fontWeight: 600, fontSize: "0.9rem" } }, "Gesti\xF3n"), (() => {
    const ti = data.summary.total_indexed || 0;
    const ta = data.summary.total_active || 0;
    const total = ti + ta || 1;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: "24px", borderRadius: "6px", overflow: "hidden", width: "100%", marginBottom: "0.75rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${ti / total * 100}%`, background: "#00d4aa", transition: "width 0.3s" }, title: `Indexado: ${ti.toFixed(1)}%` }), /* @__PURE__ */ React.createElement("div", { style: { width: `${ta / total * 100}%`, background: "#8b5cf6", transition: "width 0.3s" }, title: `Activo: ${ta.toFixed(1)}%` })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "1.5rem", fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "0.4rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "10px", height: "10px", borderRadius: "3px", background: "#00d4aa" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Indexado ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#00d4aa" } }, ti.toFixed(1), "%"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "0.4rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "10px", height: "10px", borderRadius: "3px", background: "#8b5cf6" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Activo ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#8b5cf6" } }, ta.toFixed(1), "%")))));
  })())), /* @__PURE__ */ React.createElement("div", { className: "glass-panel fund-table-container" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { fontWeight: 600, margin: 0 } }, "Mi Cartera Base"), lastDate && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "3px" } }, "Datos a: ", /* @__PURE__ */ React.createElement("strong", null, lastDate)))), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", minWidth: "600px" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Fondo / Activo"), /* @__PURE__ */ React.createElement("th", null, "Tipo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Peso"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Valor Actual (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Invertido (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Ganancia (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Ganancia (%)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "NAV"), /* @__PURE__ */ React.createElement("th", null, "Rating"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, (() => {
    const totalValor = data.funds.reduce((s, f) => s + (f.Valor_Actual || 0), 0);
    const totalInv = data.funds.reduce((s, f) => s + (f.Capital_Invertido || 0), 0);
    const totalGanAbs = data.funds.reduce((s, f) => s + (f.Ganancia_Abs || 0), 0);
    const totalGanPct = totalInv > 0 ? totalGanAbs / totalInv * 100 : 0;
    const posColor = totalGanAbs >= 0 ? "var(--success)" : "var(--danger)";
    return /* @__PURE__ */ React.createElement("tr", { style: { background: "rgba(74,162,175,0.08)", borderBottom: "2px solid rgba(74,162,175,0.3)", fontWeight: 700 } }, /* @__PURE__ */ React.createElement("td", { style: { fontWeight: 700, color: "var(--accent-glow)" } }, "\u{1F4CA} TOTAL CARTERA"), /* @__PURE__ */ React.createElement("td", null), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--accent-glow)" } }, "100%"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } }, "\u20AC", totalValor.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, "\u20AC", totalInv.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: posColor, fontVariantNumeric: "tabular-nums" } }, totalGanAbs >= 0 ? "+" : "", "\u20AC", Math.abs(totalGanAbs).toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: posColor, fontVariantNumeric: "tabular-nums" } }, totalGanPct >= 0 ? "+" : "", totalGanPct.toFixed(1), "%"), /* @__PURE__ */ React.createElement("td", null), /* @__PURE__ */ React.createElement("td", null), /* @__PURE__ */ React.createElement("td", null));
  })(), [...data.funds].sort((a, b) => b.Porcentaje - a.Porcentaje).map((fund, idx) => {
    const ganPct = fund.Ganancia_Pct;
    const ganAbs = fund.Ganancia_Abs;
    const posColor = ganPct > 0 ? "var(--success)" : ganPct < 0 ? "var(--danger)" : "var(--text-primary)";
    return /* @__PURE__ */ React.createElement("tr", { key: idx }, /* @__PURE__ */ React.createElement("td", { style: { fontWeight: 500 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: fund.IsIndex ? "#00d4aa" : "#8b5cf6", flexShrink: 0 }, title: fund.IsIndex ? "Indexado" : "Activo" }), /* @__PURE__ */ React.createElement("span", null, fund.Fondo)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginLeft: "14px" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.73rem" } }, fund.ISIN || ""), fund.ISIN && /* @__PURE__ */ React.createElement(
      "a",
      {
        href: fund.finect_url || `https://www.finect.com/fondos-inversion/${fund.ISIN}`,
        target: "_blank",
        rel: "noreferrer",
        style: { fontSize: "0.68rem", color: "var(--accent-glow)", textDecoration: "none", opacity: 0.7 },
        title: "Ver en Finect"
      },
      "\u2197"
    ))), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { style: { padding: "3px 7px", background: "var(--border-glass)", borderRadius: "6px", fontSize: "0.75rem" } }, fund["Categor\xEDa"] || fund.TIPO)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600, color: "var(--accent-glow)" } }, fund.Porcentaje.toFixed(1), "%"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } }, fund.Valor_Actual != null ? `\u20AC${fund.Valor_Actual.toLocaleString("es-ES", { minimumFractionDigits: 2 })}` : "---"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, fund.Capital_Invertido != null ? `\u20AC${fund.Capital_Invertido.toLocaleString("es-ES", { minimumFractionDigits: 2 })}` : "---"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600, color: posColor, fontVariantNumeric: "tabular-nums" } }, ganAbs != null ? `${ganAbs >= 0 ? "+" : ""}\u20AC${Math.abs(ganAbs).toLocaleString("es-ES", { minimumFractionDigits: 2 })}` : "---"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600, color: posColor, fontVariantNumeric: "tabular-nums" } }, ganPct != null ? `${ganPct >= 0 ? "+" : ""}${ganPct.toFixed(1)}%` : "---"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--text-primary)", fontWeight: "bold", fontVariantNumeric: "tabular-nums" } }, fund["NAV (Precio)"] || "---"), /* @__PURE__ */ React.createElement("td", { style: { color: "var(--accent-secondary)" } }, fund["Estrellas MS"] || "---"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { onClick: () => handleDelete(fund.ISIN || fund.Fondo), style: { background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", padding: "3px 7px", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem" } }, "\u2715")));
  })))), /* @__PURE__ */ React.createElement("form", { onSubmit: handleAdd, style: { marginTop: "2rem", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px dashed var(--border-glass)" } }, /* @__PURE__ */ React.createElement("input", { required: true, placeholder: "Nombre (ej. SP500)", value: newFund.Fondo, onChange: (e) => setNewFund({ ...newFund, Fondo: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", flex: 1 } }), /* @__PURE__ */ React.createElement("input", { placeholder: "ISIN (Opcional)", value: newFund.ISIN, onChange: (e) => setNewFund({ ...newFund, ISIN: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", flex: 1 } }), /* @__PURE__ */ React.createElement("select", { value: newFund.TIPO, onChange: (e) => setNewFund({ ...newFund, TIPO: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white" } }, /* @__PURE__ */ React.createElement("option", { value: "INDEX" }, "INDEX"), /* @__PURE__ */ React.createElement("option", { value: "VALUE" }, "VALUE"), /* @__PURE__ */ React.createElement("option", { value: "SPECIALIZED" }, "SPECIALIZED"), /* @__PURE__ */ React.createElement("option", { value: "RF" }, "RENTA FIJA"), /* @__PURE__ */ React.createElement("option", { value: "ORO" }, "ORO"), /* @__PURE__ */ React.createElement("option", { value: "CRYPTO" }, "CRYPTO"), /* @__PURE__ */ React.createElement("option", { value: "CASH" }, "LIQUIDEZ")), /* @__PURE__ */ React.createElement("input", { required: true, max: "100", min: "0", step: "0.01", type: "number", placeholder: "% Peso", value: newFund.Porcentaje, onChange: (e) => setNewFund({ ...newFund, Porcentaje: Number(e.target.value) }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", width: "80px" } }), /* @__PURE__ */ React.createElement("button", { disabled: isSaving, type: "submit", style: { padding: "8px 15px", background: "var(--accent-glow)", color: "black", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" } }, isSaving ? "..." : "+ A\xF1adir"))), data.recommendation.cash_warn && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "1rem" } }, /* @__PURE__ */ React.createElement(AdviceCard, { advice: data.recommendation.cash_warn, type: "warning" })));
};
const DetailsTab = ({ onRefreshDetails, refreshingDetails, refreshStep, refreshElapsed, refreshDetailsKey }) => {
  const [details, setDetails] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFundKey, setSelectedFundKey] = useState(null);
  const [fundDetail, setFundDetail] = useState(null);
  const [fundDetailLoading, setFundDetailLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/portfolio/details").then((r) => r.json()),
      fetch("/api/portfolio/benchmark/msci-world").then((r) => r.json()).catch(() => null)
    ]).then(([d, b]) => {
      setDetails(d);
      setBenchmark(b);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [refreshDetailsKey]);
  const loadFundDetail = (fundKey, forceRefresh = false) => {
    if (!fundKey || !details) return;
    const fund = details[fundKey];
    if (!fund || !fund.isin) return;
    setFundDetailLoading(true);
    const url = `/api/portfolio/fund/${fund.isin}/details${forceRefresh ? "?refresh=true" : ""}`;
    fetch(url).then((r) => r.json()).then((d) => {
      setFundDetail(d);
      setFundDetailLoading(false);
    }).catch(() => setFundDetailLoading(false));
  };
  useEffect(() => {
    setFundDetail(null);
    loadFundDetail(selectedFundKey);
  }, [selectedFundKey]);
  if (loading) return /* @__PURE__ */ React.createElement("div", { style: { padding: "3rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { className: "spinner", style: { margin: "0 auto 1rem" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Cargando perfiles estructurales..."));
  const hasData = details && Object.keys(details).length > 0 && Object.values(details).some(
    (f) => f.sector && Object.keys(f.sector).length > 0 || f.region && Object.keys(f.region).length > 0
  );
  if (!hasData && !refreshingDetails) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", marginBottom: "1rem" } }, "No hay datos sectoriales/geogr\xE1ficos disponibles."), /* @__PURE__ */ React.createElement("button", { onClick: onRefreshDetails, style: { padding: "10px 20px", background: "var(--accent-secondary)", color: "white", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" } }, "\u{1F504} Recalcular Detalles"));
  const aggregate = (keyExtractor) => {
    const aggr = {};
    Object.values(details || {}).forEach((fund) => {
      const dataBlock = fund[keyExtractor] || {};
      let items = Array.isArray(dataBlock) ? dataBlock : Object.keys(dataBlock).map((k) => ({ name: k, value: dataBlock[k] }));
      items.forEach((idx) => {
        const name = idx.name || idx.Name || idx.Id || "Unknown";
        const val = parseFloat(idx.value || idx.Value || 0);
        if (!aggr[name]) aggr[name] = 0;
        aggr[name] += val * (fund.percentage / 100);
      });
    });
    const total = Object.values(aggr).reduce((a, b) => a + b, 0) || 1;
    return Object.keys(aggr).map((k) => ({ name: k, value: aggr[k] / total * 100 })).filter((x) => x.value > 0.5).sort((a, b) => b.value - a.value);
  };
  const sectors = aggregate("sector");
  const regions = aggregate("region");
  const renderComparisonBars = (dataList, benchmarkData) => {
    const allKeys = /* @__PURE__ */ new Set([
      ...dataList.map((d) => d.name),
      ...benchmarkData ? Object.keys(benchmarkData) : []
    ]);
    const merged = Array.from(allKeys).map((name) => {
      const mine = dataList.find((d) => d.name === name);
      const msci = benchmarkData ? benchmarkData[name] || 0 : 0;
      return { name, myValue: mine ? mine.value : 0, msciValue: msci };
    }).filter((x) => x.myValue > 0.5 || x.msciValue > 0.5).sort((a, b) => b.myValue - a.myValue);
    const maxVal = Math.max(...merged.map((x) => Math.max(x.myValue, x.msciValue)), 1);
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } }, merged.map((item, idx) => {
      const diff = item.myValue - item.msciValue;
      const hasBenchmark = benchmarkData && item.msciValue > 0;
      return /* @__PURE__ */ React.createElement("div", { key: item.name, style: { fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "4px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", null, item.name), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--accent-glow)" } }, item.myValue.toFixed(1), "%"), hasBenchmark && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.75rem" } }, "MSCI: ", item.msciValue.toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", fontWeight: 700, color: diff > 1 ? "var(--success)" : diff < -1 ? "var(--danger)" : "var(--text-secondary)" } }, diff >= 0 ? "+" : "", diff.toFixed(1), "%")))), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: "100%", height: hasBenchmark ? "14px" : "8px", background: "var(--border-glass)", borderRadius: "4px", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { height: hasBenchmark ? "7px" : "8px", width: `${item.myValue / maxVal * 100}%`, background: "var(--accent-glow)", borderRadius: "4px 4px 0 0", transition: "width 0.3s" } }), hasBenchmark && /* @__PURE__ */ React.createElement("div", { style: { height: "7px", width: `${item.msciValue / maxVal * 100}%`, background: "rgba(255,215,0,0.5)", borderRadius: "0 0 4px 4px", transition: "width 0.3s" } })));
    }), merged.length === 0 && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "No se detect\xF3 informaci\xF3n."));
  };
  const fmtPct = (v) => v != null ? `${v.toFixed(2)}%` : "\u2014";
  const signColor = (v) => v > 0 ? "var(--success)" : v < 0 ? "var(--danger)" : "var(--text-primary)";
  const riskColor = (v) => v < 10 ? "var(--success)" : v < 20 ? "var(--warning)" : "var(--danger)";
  const fundKeys = details ? Object.keys(details) : [];
  const selectedFund = selectedFundKey ? details[selectedFundKey] : null;
  const progressSteps = [
    "\u{1F517} Iniciando conexi\xF3n con proveedores de datos...",
    "\u{1F4E1} Descargando datos sectoriales de Finect...",
    "\u{1F30D} Descargando exposici\xF3n geogr\xE1fica...",
    "\u{1F4CA} Procesando m\xE9tricas de cada fondo...",
    "\u{1F504} Normalizando sectores y regiones...",
    "\u{1F4BE} Guardando resultados en cach\xE9..."
  ];
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px", flex: 1 } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" } }, "Ver fondo:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedFundKey || "",
      onChange: (e) => {
        setSelectedFundKey(e.target.value || null);
        setFundDetail(null);
      },
      style: { padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.85rem", flex: 1, maxWidth: "400px", cursor: "pointer" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 Visi\xF3n global de cartera \u2014"),
    fundKeys.map((k) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, k, details[k]?.isin ? ` (${details[k].isin})` : ""))
  ), selectedFund?.isin && /* @__PURE__ */ React.createElement(
    "a",
    {
      href: selectedFund.finect_url || `https://www.finect.com/fondos-inversion/${selectedFund.isin}`,
      target: "_blank",
      rel: "noreferrer",
      style: { padding: "6px 12px", background: "rgba(74,162,175,0.15)", borderRadius: "8px", border: "1px solid rgba(74,162,175,0.3)", color: "var(--accent-glow)", fontSize: "0.8rem", textDecoration: "none", whiteSpace: "nowrap" }
    },
    "\u{1F517} Ver en Finect"
  )), /* @__PURE__ */ React.createElement("button", { onClick: onRefreshDetails, disabled: refreshingDetails, style: {
    padding: "8px 16px",
    background: refreshingDetails ? "var(--border-glass)" : "var(--accent-secondary)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
    cursor: refreshingDetails ? "not-allowed" : "pointer",
    fontSize: "0.85rem",
    transition: "all 0.2s"
  } }, refreshingDetails ? `\u23F3 Recalculando... ${refreshElapsed > 0 ? `(${refreshElapsed}s)` : ""}` : "\u{1F504} Recalcular Detalles")), refreshingDetails && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "1rem", padding: "1rem 1.5rem", background: "rgba(74,162,175,0.08)", borderRadius: "12px", border: "1px solid rgba(74,162,175,0.25)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" } }, /* @__PURE__ */ React.createElement("div", { className: "spinner", style: { width: "18px", height: "18px", flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, fontSize: "0.9rem", color: "var(--accent-glow)" } }, refreshStep || progressSteps[0])), /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "6px", background: "var(--border-glass)", borderRadius: "3px", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: {
    height: "100%",
    width: `${Math.min(refreshElapsed / 120 * 100, 95)}%`,
    background: "linear-gradient(90deg, var(--accent-glow), var(--accent-secondary))",
    borderRadius: "3px",
    transition: "width 2s linear"
  } })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "6px" } }, "Los datos de Finect pueden tardar 1\u20133 minutos. Los resultados se mostrar\xE1n autom\xE1ticamente al finalizar.")), selectedFundKey && selectedFund && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "8px" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, fontWeight: 600 } }, "\u{1F4CB} ", selectedFundKey, selectedFund.isin && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "10px", fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400 } }, selectedFund.isin)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => loadFundDetail(selectedFundKey, true),
      disabled: fundDetailLoading,
      style: { padding: "5px 12px", background: "rgba(74,162,175,0.15)", border: "1px solid rgba(74,162,175,0.3)", borderRadius: "6px", color: "var(--accent-glow)", fontSize: "0.75rem", cursor: "pointer" }
    },
    "\u{1F504} Recargar de Finect"
  ), selectedFund.isin && /* @__PURE__ */ React.createElement(
    "a",
    {
      href: selectedFund.finect_url || `https://www.finect.com/fondos-inversion/${selectedFund.isin}`,
      target: "_blank",
      rel: "noreferrer",
      style: { padding: "5px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--text-secondary)", fontSize: "0.75rem", textDecoration: "none" }
    },
    "\u{1F517} Ver en Finect"
  ))), fundDetailLoading && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.85rem" } }, "Cargando detalles completos..."), fundDetail && !fundDetailLoading && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "1rem" } }, fundDetail.category && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(74,162,175,0.15)", borderRadius: "6px", fontSize: "0.8rem", color: "var(--accent-glow)" } }, fundDetail.category), fundDetail.management_company && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(160,130,210,0.15)", borderRadius: "6px", fontSize: "0.8rem", color: "var(--accent-secondary)" } }, fundDetail.management_company), fundDetail.srri != null && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "0.8rem" } }, "SRRI: ", fundDetail.srri, "/7"), fundDetail.expense_ratio != null && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "0.8rem" } }, "TER: ", fundDetail.expense_ratio, "%"), fundDetail.aum != null && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "0.8rem" } }, "AUM: ", typeof fundDetail.aum === "number" ? `\u20AC${(fundDetail.aum / 1e6).toFixed(0)}M` : fundDetail.aum), fundDetail.inception_date && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "0.8rem" } }, "Fecha inicio: ", fundDetail.inception_date)), fundDetail.metrics && Object.keys(fundDetail.metrics).length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.08)" } }, fundDetail.metrics.sharpe_ratio != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "8px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Sharpe"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: signColor(fundDetail.metrics.sharpe_ratio) } }, fundDetail.metrics.sharpe_ratio.toFixed(2))), fundDetail.metrics.alpha != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "8px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Alpha"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: signColor(fundDetail.metrics.alpha) } }, fundDetail.metrics.alpha.toFixed(2))), fundDetail.metrics.beta != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "8px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Beta"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700 } }, fundDetail.metrics.beta.toFixed(2))), fundDetail.metrics.standard_deviation != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "8px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Volatilidad"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: riskColor(fundDetail.metrics.standard_deviation) } }, fmtPct(fundDetail.metrics.standard_deviation))), fundDetail.metrics.max_drawdown != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "8px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Max Ca\xEDda"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: "var(--danger)" } }, fmtPct(fundDetail.metrics.max_drawdown))), fundDetail.metrics.tracking_error != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "8px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "T. Error"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700 } }, fmtPct(fundDetail.metrics.tracking_error)))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" } }, Object.keys(fundDetail.sectors || {}).length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Sectores"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, Object.entries(fundDetail.sectors).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => /* @__PURE__ */ React.createElement("div", { key: k, style: { fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "2px" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, k), /* @__PURE__ */ React.createElement("strong", null, v.toFixed(1), "%")), /* @__PURE__ */ React.createElement("div", { style: { height: "4px", background: "var(--border-glass)", borderRadius: "2px" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", width: `${Math.min(v, 100)}%`, background: "var(--accent-glow)", borderRadius: "2px" } })))))), Object.keys(fundDetail.countries || {}).length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Geograf\xEDa"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, Object.entries(fundDetail.countries).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => /* @__PURE__ */ React.createElement("div", { key: k, style: { fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "2px" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, k), /* @__PURE__ */ React.createElement("strong", null, v.toFixed(1), "%")), /* @__PURE__ */ React.createElement("div", { style: { height: "4px", background: "var(--border-glass)", borderRadius: "2px" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", width: `${Math.min(v, 100)}%`, background: "var(--accent-secondary)", borderRadius: "2px" } }))))))), /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: 0, fontWeight: 600, fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Top Holdings ", fundDetail.holdings && fundDetail.holdings.length > 0 ? `(${fundDetail.holdings.length})` : ""), fundDetail.isin && /* @__PURE__ */ React.createElement(
    "a",
    {
      href: fundDetail.finect_url || `https://www.finect.com/fondos-inversion/${fundDetail.isin}`,
      target: "_blank",
      rel: "noreferrer",
      style: { fontSize: "0.75rem", color: "var(--accent-glow)", textDecoration: "none", opacity: 0.8 }
    },
    "Ver en Finect \u2197"
  )), fundDetail.holdings && fundDetail.holdings.length > 0 ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, fundDetail.holdings.slice(0, 15).map((h, i) => {
    const name = h.name || h.Name || h.company || h.ticker || `Holding ${i + 1}`;
    const weight = parseFloat(h.weight || h.Weight || h.percentage || 0);
    return /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: "10px", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "20px", textAlign: "right", color: "var(--text-secondary)", fontSize: "0.7rem", flexShrink: 0 } }, i + 1, "."), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, color: "var(--text-primary)" } }, name), weight > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { width: "80px", height: "4px", background: "var(--border-glass)", borderRadius: "2px", flexShrink: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", width: `${Math.min(weight * 4, 100)}%`, background: "var(--accent-glow)", borderRadius: "2px" } })), /* @__PURE__ */ React.createElement("span", { style: { width: "50px", textAlign: "right", fontWeight: 600, color: "var(--accent-glow)", flexShrink: 0 } }, weight.toFixed(1), "%")));
  })) : /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.82rem", padding: "8px 0", fontStyle: "italic" } }, "Sin datos de holdings disponibles en cach\xE9.", " ", fundDetail.isin && /* @__PURE__ */ React.createElement(
    "a",
    {
      href: fundDetail.finect_url || `https://www.finect.com/fondos-inversion/${fundDetail.isin}`,
      target: "_blank",
      rel: "noreferrer",
      style: { color: "var(--accent-glow)", textDecoration: "none" }
    },
    "Consultar en Finect \u2197"
  )))), !fundDetailLoading && !fundDetail && selectedFund && /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" } }, Object.keys(selectedFund.sector || {}).length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "0.75rem", fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" } }, "Sectores"), renderComparisonBars(
    Object.entries(selectedFund.sector).map(([k, v]) => ({ name: k, value: parseFloat(v) })),
    null
  )), Object.keys(selectedFund.region || {}).length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "0.75rem", fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" } }, "Geograf\xEDa"), renderComparisonBars(
    Object.entries(selectedFund.region).map(([k, v]) => ({ name: k, value: parseFloat(v) })),
    null
  )))), benchmark && !selectedFundKey && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "16px", marginBottom: "1rem", padding: "8px 14px", background: "rgba(255,215,0,0.06)", borderRadius: "8px", border: "1px solid rgba(255,215,0,0.15)", alignItems: "center", fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "12px", height: "6px", background: "var(--accent-glow)", borderRadius: "2px", display: "inline-block" } }), "Mi Cartera"), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "12px", height: "6px", background: "rgba(255,215,0,0.5)", borderRadius: "2px", display: "inline-block" } }), "MSCI World"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", marginLeft: "auto", fontSize: "0.75rem" } }, "Diferencia: ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--success)" } }, "+sobreponderado"), " / ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--danger)" } }, "-infraponderado"))), !selectedFundKey && /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" } }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1.5rem", fontWeight: 600 } }, "\u{1F3AF} Exposici\xF3n Sectorial"), renderComparisonBars(sectors, benchmark ? benchmark.sectors : null)), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1.5rem", fontWeight: 600 } }, "\u{1F30D} Exposici\xF3n Geogr\xE1fica"), renderComparisonBars(regions, benchmark ? benchmark.regions : null))));
};
const HeatmapRenderer = ({ data, activeFunds }) => {
  const [sortMode, setSortMode] = useState("weight");
  if (!data || !data.labels) return null;
  const baseLabels = data.labels.filter((l) => activeFunds.includes(l));
  if (baseLabels.length < 2) return /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)" } }, "Selecciona al menos dos fondos para ver la correlaci\xF3n.");
  const labels = sortMode === "corr" ? [...baseLabels].sort((a, b) => {
    const avgA = baseLabels.reduce((s, l) => s + (l !== a ? data.matrix[a]?.[l] ?? 0 : 0), 0) / (baseLabels.length - 1);
    const avgB = baseLabels.reduce((s, l) => s + (l !== b ? data.matrix[b]?.[l] ?? 0 : 0), 0) / (baseLabels.length - 1);
    return avgB - avgA;
  }) : baseLabels;
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "8px", display: "flex", gap: "6px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)" } }, "Ordenar:"), [["weight", "Por peso"], ["corr", "Por correlaci\xF3n media"]].map(([mode, label]) => /* @__PURE__ */ React.createElement("button", { key: mode, onClick: () => setSortMode(mode), style: {
    padding: "3px 10px",
    borderRadius: "10px",
    fontSize: "0.72rem",
    cursor: "pointer",
    border: sortMode === mode ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)",
    background: sortMode === mode ? "var(--accent-glow)" : "transparent",
    color: sortMode === mode ? "#000" : "var(--text-secondary)"
  } }, label))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: `auto repeat(${labels.length}, 1fr)`, gap: "3px", fontSize: "0.7rem", marginTop: "1rem" } }, /* @__PURE__ */ React.createElement("div", null), labels.map((l) => /* @__PURE__ */ React.createElement("div", { key: l, style: { textAlign: "center", writingMode: "vertical-rl", alignSelf: "end", maxHeight: "110px", overflow: "hidden" } }, l.substring(0, 20))), labels.map((l1) => /* @__PURE__ */ React.createElement(React.Fragment, { key: l1 }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", paddingRight: "8px", alignSelf: "center", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "140px" } }, l1.substring(0, 20)), labels.map((l2) => {
    const val = data.matrix[l1]?.[l2] ?? null;
    if (val === null) {
      return /* @__PURE__ */ React.createElement("div", { key: l2, style: { backgroundColor: "rgba(128,128,128,0.3)", color: "var(--text-secondary)", padding: "8px 4px", textAlign: "center", borderRadius: "4px", fontSize: "0.65rem" } }, "N/A");
    }
    const hue = (val + 1) / 2 * 120;
    const sat = Math.abs(val) > 0.5 ? 80 : 60;
    const light = l1 === l2 ? 30 : 40;
    return /* @__PURE__ */ React.createElement("div", { key: l2, title: `${l1} vs ${l2}: ${val.toFixed(4)}`, style: {
      backgroundColor: `hsla(${hue}, ${sat}%, ${light}%, 0.9)`,
      color: "white",
      padding: "8px 4px",
      textAlign: "center",
      borderRadius: "4px",
      textShadow: "0 0 2px black",
      fontWeight: "bold",
      border: l1 === l2 ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(0,0,0,0.1)",
      cursor: "default",
      transition: "transform 0.1s"
    } }, val.toFixed(2));
  })))));
};
const getDateRange = (timeframe, customRange) => {
  const end = customRange && customRange.to ? new Date(customRange.to) : /* @__PURE__ */ new Date();
  const start = new Date(end);
  if (customRange && customRange.from) return { start: new Date(customRange.from), end };
  if (timeframe === "1M") start.setMonth(start.getMonth() - 1);
  else if (timeframe === "3M") start.setMonth(start.getMonth() - 3);
  else if (timeframe === "YTD") {
    start.setMonth(0);
    start.setDate(1);
  } else if (timeframe === "1Y") start.setFullYear(start.getFullYear() - 1);
  else if (timeframe === "3Y") start.setFullYear(start.getFullYear() - 3);
  else if (timeframe === "5Y") start.setFullYear(start.getFullYear() - 5);
  else if (timeframe === "10Y") start.setFullYear(start.getFullYear() - 10);
  else start.setFullYear(1900);
  return { start, end };
};
const filterSeries = (series, start, end) => series.filter((p) => {
  const d = new Date(p.date);
  return d >= start && d <= end;
});
const numberOrNull = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const normalizeMetricShape = (metrics) => {
  if (!metrics) return null;
  const maxDrawdown = metrics.maxDD ?? metrics.max_drawdown;
  return {
    totalReturn: numberOrNull(metrics.totalReturn ?? metrics.total_return),
    annReturn: numberOrNull(metrics.annReturn ?? metrics.annualized_return),
    vol: numberOrNull(metrics.vol ?? metrics.standard_deviation),
    sharpe: numberOrNull(metrics.sharpe ?? metrics.sharpe_ratio),
    maxDD: maxDrawdown != null ? Math.abs(maxDrawdown) : null
  };
};
const calculateSeriesPeriodReturn = (series, timeframe, annualized = false) => {
  if (!series || series.length < 2) return null;
  const sorted = [...series].filter((p) => p && p.date && typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sorted.length < 2) return null;
  const endDate = new Date(sorted[sorted.length - 1].date);
  const startDate = new Date(endDate);
  if (timeframe === "1M") startDate.setMonth(startDate.getMonth() - 1);
  else if (timeframe === "3M") startDate.setMonth(startDate.getMonth() - 3);
  else if (timeframe === "YTD") {
    startDate.setMonth(0);
    startDate.setDate(1);
  } else if (timeframe === "1Y") startDate.setFullYear(startDate.getFullYear() - 1);
  else if (timeframe === "3Y") startDate.setFullYear(startDate.getFullYear() - 3);
  else if (timeframe === "5Y") startDate.setFullYear(startDate.getFullYear() - 5);
  else if (timeframe === "10Y") startDate.setFullYear(startDate.getFullYear() - 10);
  else if (timeframe === "MAX") startDate.setFullYear(1900);
  const window2 = sorted.filter((p) => {
    const date = new Date(p.date);
    return date >= startDate && date <= endDate;
  });
  if (window2.length < 2) return null;
  const first = window2[0].price;
  const last = window2[window2.length - 1].price;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0 || last <= 0) return null;
  const totalReturn = (last / first - 1) * 100;
  if (!annualized) return +totalReturn.toFixed(2);
  const days = Math.max((new Date(window2[window2.length - 1].date) - new Date(window2[0].date)) / 864e5, 1);
  const annualizedReturn = (Math.pow(last / first, 365 / days) - 1) * 100;
  return +annualizedReturn.toFixed(2);
};
const buildPeriodReturnsComparison = (currentSeries, fundSeries, simulatedSeries) => {
  const periods = [
    { label: "1 Mes", timeframe: "1M", annualized: false },
    { label: "3 Meses", timeframe: "3M", annualized: false },
    { label: "YTD", timeframe: "YTD", annualized: false },
    { label: "1 A\xF1o", timeframe: "1Y", annualized: true },
    { label: "3 A\xF1os", timeframe: "3Y", annualized: true },
    { label: "5 A\xF1os", timeframe: "5Y", annualized: true },
    { label: "10 A\xF1os", timeframe: "10Y", annualized: true },
    { label: "M\xE1x.", timeframe: "MAX", annualized: true }
  ];
  return periods.map((period) => ({
    label: period.label,
    current: calculateSeriesPeriodReturn(currentSeries, period.timeframe, period.annualized),
    fund: calculateSeriesPeriodReturn(fundSeries, period.timeframe, period.annualized),
    simulated: calculateSeriesPeriodReturn(simulatedSeries, period.timeframe, period.annualized)
  })).filter((row) => row.current != null || row.fund != null || row.simulated != null);
};
const computeFundMetrics = (pts, benchmarkPts) => {
  if (!pts || pts.length < 5) return null;
  const first = pts[0].price, last = pts[pts.length - 1].price;
  const days = (new Date(pts[pts.length - 1].date) - new Date(pts[0].date)) / 864e5 || 1;
  const totalReturn = (last / first - 1) * 100;
  const annReturn = (Math.pow(last / first, 365 / days) - 1) * 100;
  const logRets = [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].price > 0 && pts[i - 1].price > 0)
      logRets.push(Math.log(pts[i].price / pts[i - 1].price));
  }
  let vol = null, sharpe = null;
  if (logRets.length >= 10) {
    const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
    const variance = logRets.reduce((a, b) => a + (b - mean) ** 2, 0) / logRets.length;
    vol = Math.sqrt(variance * 252) * 100;
    sharpe = vol > 0 ? annReturn / vol : null;
  }
  let peak = pts[0].price, maxDD = 0;
  for (const p of pts) {
    if (p.price > peak) peak = p.price;
    const dd = (peak - p.price) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  let alpha = null, beta = null;
  if (benchmarkPts && benchmarkPts.length >= 10) {
    const ptsMap = {};
    pts.forEach((p) => {
      ptsMap[p.date] = p.price;
    });
    const benchMap = {};
    benchmarkPts.forEach((p) => {
      benchMap[p.date] = p.price;
    });
    const commonDates = Object.keys(ptsMap).filter((d) => benchMap[d]).sort();
    if (commonDates.length >= 20) {
      const fundRets = [], benchRets = [];
      for (let i = 1; i < commonDates.length; i++) {
        const dp = commonDates[i - 1], dc = commonDates[i];
        if (ptsMap[dp] > 0 && ptsMap[dc] > 0 && benchMap[dp] > 0 && benchMap[dc] > 0) {
          fundRets.push(Math.log(ptsMap[dc] / ptsMap[dp]));
          benchRets.push(Math.log(benchMap[dc] / benchMap[dp]));
        }
      }
      if (fundRets.length >= 20) {
        const mf = fundRets.reduce((a, b) => a + b, 0) / fundRets.length;
        const mb = benchRets.reduce((a, b) => a + b, 0) / benchRets.length;
        let cov = 0, vb = 0;
        for (let i = 0; i < fundRets.length; i++) {
          cov += (fundRets[i] - mf) * (benchRets[i] - mb);
          vb += (benchRets[i] - mb) ** 2;
        }
        if (vb !== 0) {
          beta = +(cov / vb).toFixed(3);
          const bFirst = benchmarkPts[0].price, bLast = benchmarkPts[benchmarkPts.length - 1].price;
          const bDays = (new Date(benchmarkPts[benchmarkPts.length - 1].date) - new Date(benchmarkPts[0].date)) / 864e5 || 1;
          const benchAnn = (Math.pow(bLast / bFirst, 365 / bDays) - 1) * 100;
          alpha = +(annReturn - beta * benchAnn).toFixed(2);
        }
      }
    }
  }
  return {
    totalReturn: +totalReturn.toFixed(2),
    annReturn: +annReturn.toFixed(2),
    vol: vol !== null ? +vol.toFixed(2) : null,
    sharpe: sharpe !== null ? +sharpe.toFixed(3) : null,
    maxDD: +(maxDD * 100).toFixed(2),
    alpha,
    beta
  };
};
const pearson = (a, b) => {
  if (a.length !== b.length || a.length < 5) return null;
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da2 = 0, db2 = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    num += da * db;
    da2 += da * da;
    db2 += db * db;
  }
  const denom = Math.sqrt(da2 * db2);
  return denom === 0 ? null : +(num / denom).toFixed(4);
};
const computeClientCorrelation = (historyBatch, funds, start, end) => {
  const dailyRets = {};
  const dateIndex = {};
  funds.forEach((fund) => {
    const pts = filterSeries(historyBatch[fund] || [], start, end);
    if (pts.length < 6) return;
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].date;
      if (!dateIndex[d]) dateIndex[d] = {};
      if (pts[i].price > 0 && pts[i - 1].price > 0)
        dateIndex[d][fund] = Math.log(pts[i].price / pts[i - 1].price);
    }
  });
  const labels = funds.filter((f) => (historyBatch[f] || []).length >= 6);
  const matrix = {};
  labels.forEach((f1) => {
    matrix[f1] = {};
    labels.forEach((f2) => {
      if (f1 === f2) {
        matrix[f1][f2] = 1;
        return;
      }
      const dates = Object.keys(dateIndex).filter((d) => dateIndex[d][f1] !== void 0 && dateIndex[d][f2] !== void 0);
      if (dates.length < 30) {
        matrix[f1][f2] = null;
        return;
      }
      matrix[f1][f2] = pearson(dates.map((d) => dateIndex[d][f1]), dates.map((d) => dateIndex[d][f2]));
    });
  });
  return { labels, matrix };
};
const FundMetricsTable = ({ historyBatch, activeFunds, timeframe, customRange, fundColorMap, benchmarkKey }) => {
  const [sortCol, setSortCol] = useState("annReturn");
  const [sortAsc, setSortAsc] = useState(false);
  const { start, end } = getDateRange(timeframe, customRange);
  const benchmarkPts = benchmarkKey ? filterSeries(historyBatch[benchmarkKey] || [], start, end) : null;
  const rows = activeFunds.map((fund) => {
    const pts = filterSeries(historyBatch[fund] || [], start, end);
    const bPts = benchmarkKey && fund !== benchmarkKey ? benchmarkPts : null;
    return { fund, m: computeFundMetrics(pts, bPts) };
  }).filter((r) => r.m !== null);
  const sortedRows = [...rows].sort((a, b) => {
    const va = a.m[sortCol], vb = b.m[sortCol];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return sortAsc ? va - vb : vb - va;
  });
  const handleSort = (key) => {
    if (sortCol === key) setSortAsc(!sortAsc);
    else {
      setSortCol(key);
      setSortAsc(false);
    }
  };
  if (sortedRows.length === 0) return /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)", textAlign: "center" } }, "Sin datos suficientes para el periodo.");
  const signColor = (v) => v > 0 ? "var(--success)" : v < 0 ? "var(--danger)" : "var(--text-primary)";
  const isPortfolio = (name) => name.includes("Mi Cartera");
  const hasBenchmark = benchmarkKey && !!benchmarkPts && benchmarkPts.length >= 10;
  const cols = [
    { key: "totalReturn", label: "Retorno Total", unit: "%", color: signColor },
    { key: "annReturn", label: "CAGR", unit: "%", color: signColor },
    { key: "vol", label: "Volatilidad", unit: "%", color: (v) => v !== null ? v < 10 ? "var(--success)" : v < 20 ? "var(--warning)" : "var(--danger)" : "var(--text-secondary)" },
    { key: "sharpe", label: "Sharpe", unit: "", color: (v) => v !== null ? signColor(v) : "var(--text-secondary)" },
    { key: "maxDD", label: "Max Drawdown", unit: "%", color: (v) => v !== null ? v < 10 ? "var(--success)" : v < 20 ? "var(--warning)" : "var(--danger)" : "var(--text-secondary)" },
    ...hasBenchmark ? [
      { key: "alpha", label: "Alpha (%aa)", unit: "", color: (v) => v !== null ? signColor(v) : "var(--text-secondary)" },
      { key: "beta", label: "Beta", unit: "", color: (v) => v !== null ? v < 0.8 ? "var(--success)" : v > 1.2 ? "var(--danger)" : "var(--text-primary)" : "var(--text-secondary)" }
    ] : []
  ];
  const SortIcon = ({ col }) => {
    if (sortCol !== col) return /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.3, marginLeft: "4px" } }, "\u21C5");
    return /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "4px", color: "var(--accent-glow)" } }, sortAsc ? "\u2191" : "\u2193");
  };
  return /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, hasBenchmark && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "6px", padding: "4px 10px", background: "rgba(0,212,170,0.06)", borderRadius: "6px", border: "1px solid rgba(0,212,170,0.15)" } }, "\u03B1/\u03B2 calculados vs ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--accent-glow)" } }, benchmarkKey), " en el periodo seleccionado"), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "1px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 600, minWidth: "160px" } }, "Fondo"), cols.map((c) => /* @__PURE__ */ React.createElement(
    "th",
    {
      key: c.key,
      onClick: () => handleSort(c.key),
      style: { textAlign: "right", padding: "8px 10px", color: sortCol === c.key ? "var(--accent-glow)" : "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }
    },
    c.label,
    /* @__PURE__ */ React.createElement(SortIcon, { col: c.key })
  )))), /* @__PURE__ */ React.createElement("tbody", null, sortedRows.map(({ fund, m }) => {
    const color = fundColorMap[fund] || "#ffffff";
    const isP = isPortfolio(fund);
    return /* @__PURE__ */ React.createElement(
      "tr",
      {
        key: fund,
        style: { borderBottom: "1px solid rgba(255,255,255,0.05)", background: isP ? "rgba(255,215,0,0.05)" : "transparent", transition: "background 0.15s" },
        onMouseEnter: (e) => e.currentTarget.style.background = isP ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.04)",
        onMouseLeave: (e) => e.currentTarget.style.background = isP ? "rgba(255,215,0,0.05)" : "transparent"
      },
      /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: color, flexShrink: 0, boxShadow: isP ? "0 0 6px #FFD700" : "none" } }), /* @__PURE__ */ React.createElement("span", { style: { color, fontWeight: isP ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" } }, fund.substring(0, 30))),
      cols.map((c) => {
        const val = m[c.key];
        return /* @__PURE__ */ React.createElement("td", { key: c.key, style: { padding: "8px 10px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: val !== null ? c.color(val) : "var(--text-secondary)" } }, val !== null ? `${val}${c.unit}` : "\u2014");
      })
    );
  }))));
};
const InteractiveChart = ({ datasets, timeframe, activeFunds, customRange, fundColorMap }) => {
  const containerRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const overlayRef = React.useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 400 });
  const PORTFOLIO_KEY = "\u{1F4CA} Mi Cartera Actual";
  const getLimitDate = () => {
    if (customRange && customRange.from) return new Date(customRange.from);
    const d = /* @__PURE__ */ new Date();
    if (timeframe === "1M") d.setMonth(d.getMonth() - 1);
    else if (timeframe === "3M") d.setMonth(d.getMonth() - 3);
    else if (timeframe === "YTD") {
      d.setMonth(0);
      d.setDate(1);
    } else if (timeframe === "1Y") d.setFullYear(d.getFullYear() - 1);
    else if (timeframe === "3Y") d.setFullYear(d.getFullYear() - 3);
    else if (timeframe === "5Y") d.setFullYear(d.getFullYear() - 5);
    else if (timeframe === "10Y") d.setFullYear(d.getFullYear() - 10);
    else if (timeframe === "MAX") d.setFullYear(1900);
    return d;
  };
  const getEndDate = () => {
    if (customRange && customRange.to) return new Date(customRange.to);
    return /* @__PURE__ */ new Date();
  };
  const processData = () => {
    if (!datasets || Object.keys(datasets).length === 0) return null;
    const limitDate = getLimitDate();
    const endDate = getEndDate();
    let globalMin = 0, globalMax = 0, globalDateMin = Infinity, globalDateMax = -Infinity;
    const lines = [];
    const PORTFOLIO_KEY2 = "\u{1F4CA} Mi Cartera Actual";
    activeFunds.forEach((fund) => {
      const raw = datasets[fund];
      if (!raw || raw.length === 0) return;
      let pts = raw.filter((p) => {
        const d = new Date(p.date);
        return d >= limitDate && d <= endDate;
      });
      if (pts.length === 0) pts = raw;
      const base = pts[0].price;
      const normalized = pts.map((p) => {
        const pct = (p.price - base) / base * 100;
        const ts = new Date(p.date).getTime();
        if (pct < globalMin) globalMin = pct;
        if (pct > globalMax) globalMax = pct;
        if (ts < globalDateMin) globalDateMin = ts;
        if (ts > globalDateMax) globalDateMax = ts;
        return { date: p.date, ts, pct, price: p.price };
      });
      const color = fund === PORTFOLIO_KEY2 ? "#FFD700" : (fundColorMap ? fundColorMap[fund] : COLORS[0]) || COLORS[0];
      lines.push({
        fund,
        color,
        points: normalized,
        isPortfolio: fund === PORTFOLIO_KEY2
      });
    });
    if (lines.length === 0) return null;
    return { lines, globalMin, globalMax, globalDateMin, globalDateMax };
  };
  const chartData = processData();
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({ w: Math.max(width, 300), h: Math.min(Math.max(width * 0.45, 280), 500) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!canvasRef.current || !chartData) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = dimensions;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const margin = { top: 20, right: 15, bottom: 30, left: 55 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;
    const { lines, globalMin, globalMax, globalDateMin, globalDateMax } = chartData;
    const rawRange = globalMax - globalMin || 1;
    const yPad = rawRange * 0.08;
    const yMin = globalMin - yPad;
    const yMax = globalMax + yPad;
    const yRange = yMax - yMin;
    const dateRange = globalDateMax - globalDateMin || 1;
    const xScale = (ts) => margin.left + (ts - globalDateMin) / dateRange * plotW;
    const yScale = (pct) => margin.top + (1 - (pct - yMin) / yRange) * plotH;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(15, 20, 35, 0.4)";
    ctx.fillRect(margin.left, margin.top, plotW, plotH);
    const yStepOpts = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    let yStep = yStepOpts[yStepOpts.length - 1];
    for (const s of yStepOpts) {
      if (rawRange / s <= 7) {
        yStep = s;
        break;
      }
    }
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yStart = Math.ceil(yMin / yStep) * yStep;
    for (let v = yStart; v <= yMax; v += yStep) {
      const y = yScale(v);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(w - margin.right, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      const label = v > 0 ? `+${v.toFixed(yStep < 1 ? 1 : 0)}%` : `${v.toFixed(yStep < 1 ? 1 : 0)}%`;
      ctx.fillText(label, margin.left - 6, y);
    }
    const zeroY = yScale(0);
    if (zeroY > margin.top && zeroY < margin.top + plotH) {
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, zeroY);
      ctx.lineTo(w - margin.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const labelCount = Math.max(4, Math.floor(plotW / 100));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "10px Inter, sans-serif";
    for (let i = 0; i <= labelCount; i++) {
      const ts = globalDateMin + i / labelCount * dateRange;
      const x = xScale(ts);
      const d = new Date(ts);
      ctx.fillText(`${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`, x, h - margin.bottom + 10);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + plotH);
      ctx.stroke();
    }
    lines.forEach((line) => {
      if (line.points.length < 2 || line.isPortfolio) return;
      const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + plotH);
      gradient.addColorStop(0, line.color + "18");
      gradient.addColorStop(1, line.color + "02");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(xScale(line.points[0].ts), yScale(line.points[0].pct));
      line.points.forEach((p) => ctx.lineTo(xScale(p.ts), yScale(p.pct)));
      ctx.lineTo(xScale(line.points[line.points.length - 1].ts), margin.top + plotH);
      ctx.lineTo(xScale(line.points[0].ts), margin.top + plotH);
      ctx.closePath();
      ctx.fill();
    });
    const sortedLines = [...lines.filter((l) => !l.isPortfolio), ...lines.filter((l) => l.isPortfolio)];
    sortedLines.forEach((line) => {
      if (line.points.length < 2) return;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.isPortfolio ? 3 : 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (line.isPortfolio) {
        ctx.shadowColor = "#FFD70080";
        ctx.shadowBlur = 10;
      } else {
        ctx.shadowColor = line.color + "60";
        ctx.shadowBlur = 6;
      }
      ctx.beginPath();
      line.points.forEach((p, i) => {
        const x = xScale(p.ts);
        const y = yScale(p.pct);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);
  }, [chartData, dimensions]);
  const handleMouseMove = (e) => {
    if (!chartData || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { w, h } = dimensions;
    const margin = { top: 20, right: 15, bottom: 30, left: 55 };
    const plotW = w - margin.left - margin.right;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    if (mouseX < margin.left || mouseX > w - margin.right || mouseY < margin.top || mouseY > h - margin.bottom) {
      setTooltip(null);
      return;
    }
    const { lines, globalDateMin, globalDateMax, globalMin, globalMax } = chartData;
    const dateRange = globalDateMax - globalDateMin || 1;
    const hoverTs = globalDateMin + (mouseX - margin.left) / plotW * dateRange;
    const hoverDate = new Date(hoverTs);
    const points = [];
    lines.forEach((line) => {
      let closest = line.points[0];
      let minDist = Math.abs(closest.ts - hoverTs);
      for (const p of line.points) {
        const dist = Math.abs(p.ts - hoverTs);
        if (dist < minDist) {
          minDist = dist;
          closest = p;
        }
      }
      points.push({ fund: line.fund, color: line.color, pct: closest.pct, price: closest.price, date: closest.date });
    });
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const dateStr = `${hoverDate.getDate()} ${months[hoverDate.getMonth()]} ${hoverDate.getFullYear()}`;
    setTooltip({ x: mouseX, y: mouseY, date: dateStr, points });
  };
  if (!chartData) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", color: "var(--text-secondary)" } }, "Selecciona al menos un fondo para ver la gr\xE1fica.");
  return /* @__PURE__ */ React.createElement("div", { ref: containerRef, style: { position: "relative", width: "100%", marginTop: "0.5rem", background: "var(--bg-glass)", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border-glass)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", padding: "12px 16px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)" } }, chartData.lines.map((l) => {
    const lastPct = l.points[l.points.length - 1].pct;
    return /* @__PURE__ */ React.createElement("span", { key: l.fund, style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--text-secondary)" } }, /* @__PURE__ */ React.createElement("span", { style: { width: l.isPortfolio ? "14px" : "10px", height: l.isPortfolio ? "4px" : "3px", borderRadius: "2px", backgroundColor: l.color, display: "inline-block", boxShadow: l.isPortfolio ? "0 0 6px #FFD700" : "none" } }), /* @__PURE__ */ React.createElement("span", { style: { color: l.color, fontWeight: l.isPortfolio ? 800 : 600 } }, l.fund.substring(0, 28)), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.7rem" } }, "(", lastPct >= 0 ? "+" : "", lastPct.toFixed(1), "%)"));
  })), /* @__PURE__ */ React.createElement(
    "canvas",
    {
      ref: canvasRef,
      style: { display: "block", cursor: "crosshair" },
      onMouseMove: handleMouseMove,
      onMouseLeave: () => setTooltip(null)
    }
  ), tooltip && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: tooltip.x, top: 20, bottom: 30, width: "1px", background: "rgba(255,255,255,0.25)", pointerEvents: "none" } }), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: tooltip.x > dimensions.w / 2 ? tooltip.x - 220 : tooltip.x + 15,
    top: Math.max(30, Math.min(tooltip.y - 20, dimensions.h - 160)),
    background: "rgba(15,20,35,0.95)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    padding: "10px 14px",
    pointerEvents: "none",
    backdropFilter: "blur(12px)",
    minWidth: "180px",
    zIndex: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "6px", fontWeight: 600 } }, tooltip.date), tooltip.points.map((p) => /* @__PURE__ */ React.createElement("div", { key: p.fund, style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "2px 0", fontSize: "0.78rem" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "5px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: p.color, display: "inline-block", boxShadow: `0 0 4px ${p.color}` } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.fund.substring(0, 16))), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: p.pct >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, p.pct >= 0 ? "+" : "", p.pct.toFixed(2), "%"))))));
};
const EvolutionTab = ({ rawData }) => {
  const [historyBatch, setHistoryBatch] = useState(null);
  const [correlationMatrix, setCorrelationMatrix] = useState(null);
  const [activeFunds, setActiveFunds] = useState([]);
  const [timeframe, setTimeframe] = useState("3Y");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [showCustom, setShowCustom] = useState(false);
  const [lastDate, setLastDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extraFunds, setExtraFunds] = useState({});
  const [extSearch, setExtSearch] = useState("");
  const [extResults, setExtResults] = useState([]);
  const [extSearching, setExtSearching] = useState(false);
  const [extLoading, setExtLoading] = useState(false);
  const extDebounceRef = React.useRef(null);
  const handleExtSearch = (q) => {
    setExtSearch(q);
    if (extDebounceRef.current) clearTimeout(extDebounceRef.current);
    if (q.length < 2) {
      setExtResults([]);
      return;
    }
    extDebounceRef.current = setTimeout(() => {
      setExtSearching(true);
      fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(q)}&limit=10`).then((r) => r.json()).then((res) => {
        setExtResults(res);
        setExtSearching(false);
      }).catch(() => setExtSearching(false));
    }, 300);
  };
  const addExternalFund = (fund) => {
    const displayName = fund.name ? `${fund.name.substring(0, 28)} [${fund.isin}]` : fund.isin;
    setExtSearch("");
    setExtResults([]);
    if (extraFunds[displayName]) {
      if (!activeFunds.includes(displayName)) setActiveFunds((prev) => [...prev, displayName]);
      return;
    }
    setExtLoading(true);
    fetch(`/api/portfolio/fund/${fund.isin}/nav_history?years=10`).then((r) => r.json()).then((history) => {
      if (!Array.isArray(history) || history.length === 0) return;
      setExtraFunds((prev) => ({ ...prev, [displayName]: history }));
      setActiveFunds((prev) => [...prev, displayName]);
    }).catch(() => {
    }).finally(() => setExtLoading(false));
  };
  const removeExtraFund = (name) => {
    setExtraFunds((prev) => {
      const n = { ...prev };
      delete n[name];
      return n;
    });
    setActiveFunds((prev) => prev.filter((f) => f !== name));
  };
  useEffect(() => {
    Promise.all([
      fetch("/api/portfolio/history_batch").then((r) => r.json()),
      fetch("/api/portfolio/correlation").then((r) => r.json()),
      fetch("/api/portfolio/last_update").then((r) => r.json())
    ]).then(([history, correlation, updateInfo]) => {
      setHistoryBatch(history);
      setCorrelationMatrix(correlation);
      setLastDate(updateInfo.last_date);
      const fundKeys = Object.keys(history);
      const portfolioKey2 = fundKeys.find((k) => k.includes("Mi Cartera"));
      const regularFunds2 = fundKeys.filter((k) => !k.includes("Mi Cartera"));
      const defaultActive = [];
      if (portfolioKey2) defaultActive.push(portfolioKey2);
      defaultActive.push(...regularFunds2.slice(0, 4));
      setActiveFunds(defaultActive);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoading(false);
    });
  }, [rawData]);
  const mergedHistory = React.useMemo(() => {
    if (!historyBatch) return null;
    if (Object.keys(extraFunds).length === 0) return historyBatch;
    return { ...historyBatch, ...extraFunds };
  }, [historyBatch, extraFunds]);
  const allKeys = mergedHistory ? Object.keys(mergedHistory) : [];
  const portfolioKey = allKeys.find((k) => k.includes("Mi Cartera"));
  const weightMap = React.useMemo(() => {
    const map = {};
    if (rawData && rawData.funds) {
      rawData.funds.forEach((f) => {
        if (f.Fondo) map[f.Fondo] = f.Porcentaje || 0;
      });
    }
    return map;
  }, [rawData]);
  const extraFundKeys = Object.keys(extraFunds);
  const regularFunds = allKeys.filter((k) => !k.includes("Mi Cartera") && !extraFundKeys.includes(k)).sort((a, b) => (weightMap[b] || 0) - (weightMap[a] || 0));
  const allFunds = portfolioKey ? [portfolioKey, ...regularFunds, ...extraFundKeys] : [...regularFunds, ...extraFundKeys];
  const MSCI_KEYWORDS = ["msci world", "world index"];
  const benchmarkKey = regularFunds.find((k) => MSCI_KEYWORDS.some((kw) => k.toLowerCase().includes(kw))) || null;
  const fundColorMap = React.useMemo(() => {
    const map = {};
    allFunds.forEach((f, i) => {
      if (f.includes("Mi Cartera")) {
        map[f] = "#FFD700";
      } else if (extraFundKeys.includes(f)) {
        map[f] = COLORS[(regularFunds.length + extraFundKeys.indexOf(f)) % COLORS.length];
      } else {
        map[f] = COLORS[i % COLORS.length];
      }
    });
    return map;
  }, [allFunds.join(",")]);
  const clientCorrelation = React.useMemo(() => {
    if (!mergedHistory || activeFunds.length < 2) return null;
    const { start, end } = getDateRange(showCustom ? null : timeframe, showCustom ? customRange : null);
    return computeClientCorrelation(mergedHistory, activeFunds, start, end);
  }, [mergedHistory, activeFunds.join(","), timeframe, showCustom, customRange.from, customRange.to]);
  if (loading) return /* @__PURE__ */ React.createElement("div", { style: { padding: "3rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { className: "spinner", style: { margin: "0 auto 1rem" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Cargando datos hist\xF3ricos..."));
  if (!historyBatch || Object.keys(historyBatch).length === 0) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", textAlign: "center", color: "var(--text-secondary)" } }, 'No hay datos hist\xF3ricos disponibles. Pulsa "Recalcular Cotizaciones" para generar los datos.');
  const corrFunds = activeFunds;
  const timeframes = ["1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"];
  const handleTimeframeClick = (tf) => {
    setTimeframe(tf);
    setShowCustom(false);
    setCustomRange({ from: "", to: "" });
  };
  return /* @__PURE__ */ React.createElement("div", null, lastDate && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem", padding: "8px 14px", background: "rgba(74,162,175,0.1)", borderRadius: "8px", border: "1px solid rgba(74,162,175,0.2)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "\u{1F4CA} \xDAltimo dato:"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-glow)" } }, lastDate)), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } }, /* @__PURE__ */ React.createElement("strong", { style: { marginRight: "6px", fontSize: "0.85rem" } }, "Periodo:"), timeframes.map((tf) => /* @__PURE__ */ React.createElement("button", { key: tf, onClick: () => handleTimeframeClick(tf), style: {
    padding: "5px 14px",
    borderRadius: "20px",
    border: timeframe === tf && !showCustom ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)",
    background: timeframe === tf && !showCustom ? "var(--accent-glow)" : "transparent",
    color: timeframe === tf && !showCustom ? "#000" : "var(--text-primary)",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.8rem",
    transition: "all 0.15s"
  } }, tf)), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowCustom(!showCustom), style: {
    padding: "5px 14px",
    borderRadius: "20px",
    border: showCustom ? "1px solid var(--accent-secondary)" : "1px solid var(--border-glass)",
    background: showCustom ? "var(--accent-secondary)" : "transparent",
    color: showCustom ? "#000" : "var(--text-primary)",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.8rem",
    transition: "all 0.15s"
  } }, "Personalizado")), showCustom && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.08)", alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Desde:", /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: customRange.from,
      onChange: (e) => setCustomRange({ ...customRange, from: e.target.value }),
      style: { marginLeft: "6px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.8rem" }
    }
  )), /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Hasta:", /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: customRange.to,
      onChange: (e) => setCustomRange({ ...customRange, to: e.target.value }),
      style: { marginLeft: "6px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.8rem" }
    }
  ))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.08)" } }, /* @__PURE__ */ React.createElement("strong", { style: { marginRight: "6px", fontSize: "0.85rem", alignSelf: "center" } }, "Fondos:"), /* @__PURE__ */ React.createElement("button", { onClick: () => setActiveFunds(allFunds), style: { padding: "3px 10px", borderRadius: "12px", border: "1px solid var(--border-glass)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.72rem" } }, "Todos"), /* @__PURE__ */ React.createElement("button", { onClick: () => setActiveFunds([]), style: { padding: "3px 10px", borderRadius: "12px", border: "1px solid var(--border-glass)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.72rem" } }, "Ninguno"), portfolioKey && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    const isActive = activeFunds.includes(portfolioKey);
    setActiveFunds(isActive ? activeFunds.filter((f) => f !== portfolioKey) : [portfolioKey, ...activeFunds]);
  }, style: {
    padding: "4px 14px",
    borderRadius: "20px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.8rem",
    transition: "all 0.15s",
    border: activeFunds.includes(portfolioKey) ? "2px solid #FFD700" : "1px solid rgba(255,215,0,0.4)",
    background: activeFunds.includes(portfolioKey) ? "rgba(255,215,0,0.18)" : "transparent",
    color: activeFunds.includes(portfolioKey) ? "#FFD700" : "rgba(255,215,0,0.6)",
    boxShadow: activeFunds.includes(portfolioKey) ? "0 0 10px rgba(255,215,0,0.3)" : "none"
  } }, "\u{1F4CA} Mi Cartera Actual"), regularFunds.map((fund) => {
    const isActive = activeFunds.includes(fund);
    const fundColor = fundColorMap[fund] || COLORS[0];
    return /* @__PURE__ */ React.createElement("label", { key: fund, style: {
      display: "flex",
      alignItems: "center",
      gap: "5px",
      cursor: "pointer",
      fontSize: "0.8rem",
      background: isActive ? fundColor + "15" : "rgba(255,255,255,0.03)",
      padding: "4px 10px",
      borderRadius: "8px",
      border: isActive ? `1px solid ${fundColor}50` : "1px solid transparent",
      transition: "all 0.15s"
    } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: isActive, onChange: (e) => {
      if (e.target.checked) setActiveFunds([...activeFunds, fund]);
      else setActiveFunds(activeFunds.filter((f) => f !== fund));
    }, style: { accentColor: fundColor } }), /* @__PURE__ */ React.createElement("span", { style: { color: isActive ? fundColor : "var(--text-secondary)", fontWeight: isActive ? 600 : 400 } }, fund.substring(0, 24)));
  }), extraFundKeys.map((name) => {
    const isActive = activeFunds.includes(name);
    const fundColor = fundColorMap[name] || "#a78bfa";
    return /* @__PURE__ */ React.createElement("div", { key: name, style: {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "0.8rem",
      background: isActive ? fundColor + "18" : "rgba(167,139,250,0.06)",
      padding: "4px 8px",
      borderRadius: "8px",
      border: isActive ? `1px solid ${fundColor}60` : "1px solid rgba(167,139,250,0.25)",
      transition: "all 0.15s"
    } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: isActive, onChange: (e) => {
      if (e.target.checked) setActiveFunds((prev) => [...prev, name]);
      else setActiveFunds((prev) => prev.filter((f) => f !== name));
    }, style: { accentColor: fundColor } }), /* @__PURE__ */ React.createElement("span", { style: { color: isActive ? fundColor : "rgba(167,139,250,0.7)", fontWeight: isActive ? 600 : 400, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: name }, name.substring(0, 30)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.65rem", padding: "1px 6px", borderRadius: "8px", background: "rgba(167,139,250,0.15)", color: "#a78bfa", whiteSpace: "nowrap" } }, "ext"), /* @__PURE__ */ React.createElement("button", { onClick: () => removeExtraFund(name), title: "Eliminar fondo externo", style: { background: "none", border: "none", cursor: "pointer", color: "rgba(255,100,100,0.7)", fontSize: "0.85rem", lineHeight: 1, padding: "0 2px" } }, "\xD7"));
  })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", flex: "1 1 260px" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: extSearch,
      onChange: (e) => handleExtSearch(e.target.value),
      placeholder: "\u2795 A\xF1adir fondo externo (ISIN o nombre)...",
      style: { width: "100%", padding: "7px 12px", borderRadius: "8px", border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.06)", color: "white", fontSize: "0.82rem", boxSizing: "border-box" }
    }
  ), extSearching && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", right: "10px", top: "8px", fontSize: "0.72rem", color: "#a78bfa" } }, "Buscando..."), extLoading && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", right: "10px", top: "8px", fontSize: "0.72rem", color: "#a78bfa" } }, "Cargando..."), extResults.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, maxHeight: "240px", overflowY: "auto", background: "rgba(15,20,35,0.98)", border: "1px solid rgba(167,139,250,0.4)", borderRadius: "0 0 8px 8px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" } }, extResults.map((r) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: r.isin,
      onClick: () => addExternalFund(r),
      style: { padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.15s" },
      onMouseEnter: (e) => e.currentTarget.style.background = "rgba(167,139,250,0.15)",
      onMouseLeave: (e) => e.currentTarget.style.background = "transparent"
    },
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: "0.82rem", color: "#a78bfa" } }, r.isin), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.name)),
    r.in_portfolio ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.68rem", padding: "2px 7px", background: "rgba(74,162,175,0.2)", borderRadius: "10px", color: "var(--accent-glow)" } }, "En cartera") : /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.68rem", padding: "2px 7px", background: "rgba(167,139,250,0.15)", borderRadius: "10px", color: "#a78bfa" } }, "A\xF1adir")
  )))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "rgba(167,139,250,0.6)", alignSelf: "center", flex: "0 0 auto" } }, "Compara fondos externos sin modificar tu cartera"))), /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "0.5rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" } }, "Crecimiento Porcentual Acumulado", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400 } }, "(base 100 al inicio del periodo)")), /* @__PURE__ */ React.createElement(InteractiveChart, { datasets: mergedHistory, timeframe, activeFunds, customRange: showCustom ? customRange : null, fundColorMap }), /* @__PURE__ */ React.createElement("h3", { style: { marginTop: "2.5rem", marginBottom: "0.5rem", fontWeight: 600 } }, "M\xE9tricas del Periodo", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400, marginLeft: "8px" } }, "calculadas sobre la selecci\xF3n temporal activa \xB7 click en cabecera para ordenar")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", overflowX: "auto" } }, /* @__PURE__ */ React.createElement(FundMetricsTable, { historyBatch: mergedHistory, activeFunds, timeframe, customRange: showCustom ? customRange : { from: "", to: "" }, fundColorMap, benchmarkKey })), activeFunds.length >= 2 && (() => {
    const isinList = activeFunds.map((f) => {
      const fund = rawData && rawData.funds ? rawData.funds.find((x) => x.Fondo === f) : null;
      if (fund) return fund.ISIN;
      const m = f.match(/\[([A-Z0-9]{12})\]$/);
      if (m) return m[1];
      if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(f)) return f;
      return null;
    }).filter(Boolean);
    if (isinList.length < 2) return null;
    const url = `https://www.finect.com/fondos-inversion/comparador?products=${isinList.join(",")}`;
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: "1rem", marginBottom: "0.5rem" } }, /* @__PURE__ */ React.createElement(
      "a",
      {
        href: url,
        target: "_blank",
        rel: "noreferrer",
        style: { padding: "7px 14px", background: "rgba(74,162,175,0.15)", borderRadius: "8px", border: "1px solid rgba(74,162,175,0.3)", color: "var(--accent-glow)", fontSize: "0.82rem", textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }
      },
      "\u{1F517} Comparar fondos seleccionados en Finect (",
      isinList.length,
      ")"
    ));
  })(), /* @__PURE__ */ React.createElement("h3", { style: { marginTop: "2.5rem", marginBottom: "0.5rem", fontWeight: 600 } }, "Matriz de Correlaci\xF3n de Pearson"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" } }, "Valores cercanos a ", /* @__PURE__ */ React.createElement("span", { style: { color: "hsl(120,80%,40%)" } }, "+1 (verde)"), " = fondos se mueven juntos. Valores cercanos a ", /* @__PURE__ */ React.createElement("span", { style: { color: "hsl(0,80%,50%)" } }, "-1 (rojo)"), " = descorrelacionados (protegen tu cartera).", /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "8px", fontSize: "0.78rem", opacity: 0.7 } }, "Calculada sobre el periodo seleccionado, incluye Mi Cartera.")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", overflowX: "auto" } }, clientCorrelation && clientCorrelation.labels && clientCorrelation.labels.length > 1 ? /* @__PURE__ */ React.createElement(HeatmapRenderer, { data: clientCorrelation, activeFunds: corrFunds }) : /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)", textAlign: "center" } }, "Datos insuficientes para la correlaci\xF3n en este periodo. Selecciona m\xE1s fondos o ampl\xEDa el rango.")));
};
const SimuladorTab = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedFund, setSelectedFund] = useState(null);
  const [amount, setAmount] = useState("");
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [fundDetail, setFundDetail] = useState(null);
  const [simTimeframe, setSimTimeframe] = useState("MAX");
  const [simCustomRange, setSimCustomRange] = useState({ from: "", to: "" });
  const [showSimCustom, setShowSimCustom] = useState(false);
  const debounceRef = React.useRef(null);
  const handleSearch = (query) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(query)}&limit=15`).then((r) => r.json()).then((results) => {
        setSearchResults(results);
        setSearching(false);
      }).catch(() => setSearching(false));
    }, 300);
  };
  const selectFund = (fund) => {
    setSelectedFund(fund);
    setSearchQuery(fund.isin);
    setSearchResults([]);
    fetch(`/api/portfolio/fund/${fund.isin}/details`).then((r) => r.json()).then((detail) => setFundDetail(detail)).catch(() => {
    });
  };
  const runSimulation = () => {
    if (!selectedFund || !amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    fetch("/api/portfolio/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isin: selectedFund.isin, amount: parseFloat(amount) })
    }).then((r) => r.json()).then((result) => {
      setSimulation(result);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  const signColor = (v) => v > 0 ? "var(--success)" : v < 0 ? "var(--danger)" : "var(--text-primary)";
  const riskColor = (v) => v < 10 ? "var(--success)" : v < 20 ? "var(--warning)" : "var(--danger)";
  const drawdownColor = (v) => v < 10 ? "var(--success)" : v < 20 ? "var(--warning)" : "var(--danger)";
  const simAnalysis = useMemo(() => {
    if (!simulation) return null;
    const currentKey = "\u{1F4CA} Cartera actual";
    const fundKey = simulation.added_name || simulation.added_isin || "Fondo seleccionado";
    const simulatedKey = "\u{1F4C8} Cartera actualizada";
    const datasets = {};
    if (simulation.history_current?.length > 1) datasets[currentKey] = simulation.history_current;
    if (simulation.history_fund?.length > 1) datasets[fundKey] = simulation.history_fund;
    if (simulation.history_simulated?.length > 1) datasets[simulatedKey] = simulation.history_simulated;
    const { start, end } = getDateRange(showSimCustom ? null : simTimeframe, showSimCustom ? simCustomRange : null);
    const filteredCurrent = filterSeries(datasets[currentKey] || [], start, end);
    const filteredFund = filterSeries(datasets[fundKey] || [], start, end);
    const filteredSimulated = filterSeries(datasets[simulatedKey] || [], start, end);
    const fallbackCurrent = normalizeMetricShape(simulation.current_portfolio_metrics);
    const fallbackSimulated = normalizeMetricShape(simulation.simulated_portfolio_metrics);
    const benchmarkPts = filteredCurrent.length >= 10 ? filteredCurrent : null;
    const currentMetrics = computeFundMetrics(filteredCurrent, null) || fallbackCurrent;
    const fundMetrics = computeFundMetrics(filteredFund, benchmarkPts);
    const simulatedMetrics = computeFundMetrics(filteredSimulated, benchmarkPts) || fallbackSimulated;
    const periodReturns = buildPeriodReturnsComparison(
      datasets[currentKey] || [],
      datasets[fundKey] || [],
      datasets[simulatedKey] || []
    );
    const activeCorrelationFunds = [currentKey, fundKey, simulatedKey].filter((key) => (datasets[key] || []).length > 5);
    const correlation = activeCorrelationFunds.length >= 2 ? computeClientCorrelation(datasets, activeCorrelationFunds, start, end) : null;
    return {
      currentKey,
      fundKey,
      simulatedKey,
      datasets,
      activeFunds: Object.keys(datasets),
      colorMap: {
        [currentKey]: "#FFD700",
        [fundKey]: "#FF8C00",
        [simulatedKey]: "#4ADE80"
      },
      metrics: {
        current: currentMetrics,
        fund: fundMetrics,
        simulated: simulatedMetrics
      },
      periodReturns: periodReturns.length > 0 ? periodReturns : simulation.period_returns || [],
      correlation
    };
  }, [simulation, simTimeframe, showSimCustom, simCustomRange.from, simCustomRange.to]);
  const renderMetricComparison = (label, current, fund, simulated, colorFn, suffix = "", decimals = 2) => {
    const currentValue = numberOrNull(current);
    const fundValue = numberOrNull(fund);
    const simulatedValue = numberOrNull(simulated);
    if (currentValue == null && fundValue == null && simulatedValue == null) return null;
    const diff = currentValue != null && simulatedValue != null ? simulatedValue - currentValue : null;
    const formatValue = (value) => value != null ? `${value.toFixed(decimals)}${suffix}` : "\u2014";
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", flex: 1 } }, label), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center", fontWeight: 600, color: colorFn && currentValue != null ? colorFn(currentValue) : "var(--text-primary)", fontVariantNumeric: "tabular-nums" } }, formatValue(currentValue)), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center", fontWeight: 600, color: colorFn && fundValue != null ? colorFn(fundValue) : "var(--text-primary)", fontVariantNumeric: "tabular-nums" } }, formatValue(fundValue)), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center", fontWeight: 600, color: colorFn && simulatedValue != null ? colorFn(simulatedValue) : "var(--text-primary)", fontVariantNumeric: "tabular-nums" } }, formatValue(simulatedValue)), /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 90px", textAlign: "right", fontWeight: 700, fontSize: "0.8rem", color: diff !== null ? diff > 0 ? "var(--success)" : diff < 0 ? "var(--danger)" : "var(--text-secondary)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, diff !== null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(decimals)}${suffix}` : "\u2014"));
  };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F9EA} Simulador de Aportaciones"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" } }, "Busca cualquier fondo disponible en Finect, selecciona una cantidad a a\xF1adir y visualiza c\xF3mo cambiar\xEDan las m\xE9tricas de tu cartera."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 300px", position: "relative" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Buscar fondo (ISIN o nombre)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: searchQuery,
      onChange: (e) => handleSearch(e.target.value),
      placeholder: "Ej: IE00B4L5Y983 o msci world",
      style: { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.9rem" }
    }
  ), searching && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", right: "12px", top: "28px", color: "var(--accent-glow)", fontSize: "0.75rem" } }, "Buscando..."), searchResults.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, maxHeight: "300px", overflowY: "auto", background: "rgba(15,20,35,0.98)", border: "1px solid var(--border-glass)", borderRadius: "0 0 8px 8px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" } }, searchResults.map((r) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: r.isin,
      onClick: () => selectFund(r),
      style: { padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.15s" },
      onMouseEnter: (e) => e.currentTarget.style.background = "rgba(74,162,175,0.15)",
      onMouseLeave: (e) => e.currentTarget.style.background = "transparent"
    },
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: "0.85rem" } }, r.isin), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.name)),
    r.in_portfolio && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", padding: "2px 8px", background: "rgba(74,162,175,0.2)", borderRadius: "10px", color: "var(--accent-glow)" } }, "En cartera")
  )))), /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 180px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Cantidad (\u20AC)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "1",
      step: "100",
      value: amount,
      onChange: (e) => setAmount(e.target.value),
      placeholder: "1000",
      style: { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.9rem" }
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: runSimulation,
      disabled: !selectedFund || !amount || loading,
      style: {
        padding: "10px 24px",
        height: "42px",
        background: !selectedFund || !amount ? "var(--border-glass)" : "linear-gradient(135deg, var(--accent-glow), var(--accent-secondary))",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontWeight: 700,
        cursor: !selectedFund || !amount ? "not-allowed" : "pointer",
        fontSize: "0.9rem",
        transition: "all 0.2s",
        boxShadow: selectedFund && amount ? "0 4px 16px rgba(66,153,225,0.3)" : "none"
      }
    },
    loading ? "Simulando..." : "\u{1F680} Simular"
  ))), fundDetail && selectedFund && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: 0, fontWeight: 600 } }, "\u{1F4CB} ", fundDetail.name || selectedFund.isin), selectedFund.isin && /* @__PURE__ */ React.createElement(
    "a",
    {
      href: fundDetail.finect_url || selectedFund.url || `https://www.finect.com/fondos-inversion/${selectedFund.isin}`,
      target: "_blank",
      rel: "noreferrer",
      style: { padding: "5px 12px", background: "rgba(74,162,175,0.15)", border: "1px solid rgba(74,162,175,0.3)", borderRadius: "6px", color: "var(--accent-glow)", fontSize: "0.75rem", textDecoration: "none" }
    },
    "\u{1F517} Ver en Finect"
  )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap" } }, fundDetail.category && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(74,162,175,0.15)", borderRadius: "6px", fontSize: "0.8rem", color: "var(--accent-glow)" } }, fundDetail.category), fundDetail.management_company && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(160,130,210,0.15)", borderRadius: "6px", fontSize: "0.8rem", color: "var(--accent-secondary)" } }, fundDetail.management_company), fundDetail.srri && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "0.8rem" } }, "SRRI: ", fundDetail.srri, "/7"), fundDetail.expense_ratio != null && /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 10px", background: "rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "0.8rem" } }, "TER: ", fundDetail.expense_ratio, "%")), fundDetail.metrics && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)" } }, fundDetail.metrics.sharpe_ratio != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "SHARPE"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: signColor(fundDetail.metrics.sharpe_ratio) } }, fundDetail.metrics.sharpe_ratio.toFixed(2))), fundDetail.metrics.alpha != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "ALPHA"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: signColor(fundDetail.metrics.alpha) } }, fundDetail.metrics.alpha.toFixed(2))), fundDetail.metrics.beta != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "BETA"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700 } }, fundDetail.metrics.beta.toFixed(2))), fundDetail.metrics.standard_deviation != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "VOLATILIDAD"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: riskColor(fundDetail.metrics.standard_deviation) } }, fundDetail.metrics.standard_deviation.toFixed(2))), fundDetail.metrics.max_drawdown != null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "MAX CA\xCDDA"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: "var(--danger)" } }, fundDetail.metrics.max_drawdown.toFixed(2), "%")))), simulation && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Cartera Actual"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)" } }, "\u20AC", simulation.current_total.toLocaleString("es-ES", { minimumFractionDigits: 2 }))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Aportaci\xF3n"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.3rem", fontWeight: 700, color: "var(--accent-glow)" } }, "+\u20AC", simulation.added_amount.toLocaleString("es-ES", { minimumFractionDigits: 2 }))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Cartera Actualizada"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.3rem", fontWeight: 700, color: "var(--success)" } }, "\u20AC", simulation.simulated_total.toLocaleString("es-ES", { minimumFractionDigits: 2 })))), simAnalysis?.activeFunds?.length > 0 && (() => {
    const SIM_TIMEFRAMES = ["1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y", "MAX"];
    return /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F4C9} Evoluci\xF3n Hist\xF3rica (base 100)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "1rem" } }, SIM_TIMEFRAMES.map((tf) => /* @__PURE__ */ React.createElement("button", { key: tf, onClick: () => {
      setSimTimeframe(tf);
      setShowSimCustom(false);
      setSimCustomRange({ from: "", to: "" });
    }, style: {
      padding: "4px 12px",
      borderRadius: "16px",
      cursor: "pointer",
      fontWeight: 600,
      fontSize: "0.75rem",
      border: simTimeframe === tf && !showSimCustom ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)",
      background: simTimeframe === tf && !showSimCustom ? "var(--accent-glow)" : "transparent",
      color: simTimeframe === tf && !showSimCustom ? "#000" : "var(--text-primary)",
      transition: "all 0.15s"
    } }, tf)), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowSimCustom(!showSimCustom), style: {
      padding: "4px 12px",
      borderRadius: "16px",
      cursor: "pointer",
      fontWeight: 600,
      fontSize: "0.75rem",
      border: showSimCustom ? "1px solid var(--accent-secondary)" : "1px solid var(--border-glass)",
      background: showSimCustom ? "var(--accent-secondary)" : "transparent",
      color: showSimCustom ? "#000" : "var(--text-primary)",
      transition: "all 0.15s"
    } }, "Personalizado")), showSimCustom && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", marginBottom: "10px", alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Desde:", /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "date",
        value: simCustomRange.from,
        onChange: (e) => setSimCustomRange({ ...simCustomRange, from: e.target.value }),
        style: { marginLeft: "6px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.8rem" }
      }
    )), /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Hasta:", /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "date",
        value: simCustomRange.to,
        onChange: (e) => setSimCustomRange({ ...simCustomRange, to: e.target.value }),
        style: { marginLeft: "6px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.8rem" }
      }
    ))), /* @__PURE__ */ React.createElement(
      InteractiveChart,
      {
        datasets: simAnalysis.datasets,
        timeframe: simTimeframe,
        activeFunds: simAnalysis.activeFunds,
        customRange: showSimCustom ? simCustomRange : null,
        fundColorMap: simAnalysis.colorMap
      }
    ));
  })(), simAnalysis?.periodReturns?.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F4C5} Rentabilidad por Per\xEDodo"), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "2px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "8px 12px", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" } }, "Per\xEDodo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "8px 12px", color: "#FFD700", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" } }, "Cartera actual"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "8px 12px", color: "#FF8C00", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" } }, String(simulation.added_name || simulation.added_isin).substring(0, 22)), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "8px 12px", color: "#4ADE80", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" } }, "Cartera actualizada"))), /* @__PURE__ */ React.createElement("tbody", null, simAnalysis.periodReturns.map((row, i) => {
    const fmtPct = (v) => v != null ? /* @__PURE__ */ React.createElement("span", { style: { color: v >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 700 } }, v >= 0 ? "+" : "", v.toFixed(1), "%", row.label.includes("A\xF1o") || row.label === "M\xE1x." ? " aa" : "") : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "\u2014");
    const delta = row.simulated != null && row.current != null ? row.simulated - row.current : null;
    return /* @__PURE__ */ React.createElement("tr", { key: i, style: { borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", fontWeight: 600 } }, row.label), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums" } }, fmtPct(row.current)), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums" } }, fmtPct(row.fund)), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums" } }, fmtPct(row.simulated), delta != null && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", color: delta >= 0 ? "var(--success)" : "var(--danger)", marginLeft: "6px" } }, "(", delta >= 0 ? "+" : "", delta.toFixed(2), "pp)")));
  }))))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F4C8} M\xE9tricas del per\xEDodo seleccionado"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "2px solid rgba(255,255,255,0.1)", fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, "M\xE9trica"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center" } }, "Actual"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center" } }, "Fondo"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center" } }, "Actualizada"), /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 90px", textAlign: "right" } }, "\u0394 vs actual")), renderMetricComparison("Retorno total", simAnalysis?.metrics?.current?.totalReturn, simAnalysis?.metrics?.fund?.totalReturn, simAnalysis?.metrics?.simulated?.totalReturn, signColor, "%", 2), renderMetricComparison("Rentabilidad anualizada", simAnalysis?.metrics?.current?.annReturn, simAnalysis?.metrics?.fund?.annReturn, simAnalysis?.metrics?.simulated?.annReturn, signColor, "%", 2), renderMetricComparison("Volatilidad", simAnalysis?.metrics?.current?.vol, simAnalysis?.metrics?.fund?.vol, simAnalysis?.metrics?.simulated?.vol, riskColor, "%", 2), renderMetricComparison("Sharpe ratio", simAnalysis?.metrics?.current?.sharpe, simAnalysis?.metrics?.fund?.sharpe, simAnalysis?.metrics?.simulated?.sharpe, signColor, "", 3), renderMetricComparison("M\xE1x. drawdown", simAnalysis?.metrics?.current?.maxDD, simAnalysis?.metrics?.fund?.maxDD, simAnalysis?.metrics?.simulated?.maxDD, drawdownColor, "%", 2)), simAnalysis?.correlation?.labels?.length > 1 && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F517} Correlaci\xF3n entre cartera actual, cartera actualizada y fondo"), /* @__PURE__ */ React.createElement(HeatmapRenderer, { data: simAnalysis.correlation, activeFunds: simAnalysis.correlation.labels })), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u2696\uFE0F Cambio de Pesos en Cartera"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [...simulation.funds].sort((a, b) => b.simulated_weight - a.simulated_weight).map((fund) => {
    const isTarget = fund.isin === simulation.added_isin;
    const weightDiff = fund.simulated_weight - fund.current_weight;
    return /* @__PURE__ */ React.createElement("div", { key: fund.isin, style: { display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", background: isTarget ? "rgba(74,162,175,0.1)" : "transparent", borderRadius: "8px", border: isTarget ? "1px solid rgba(74,162,175,0.3)" : "1px solid transparent" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: isTarget ? 700 : 500, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, isTarget && "\u2795 ", fund.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)" } }, fund.isin)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontVariantNumeric: "tabular-nums" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", width: "60px", textAlign: "right" } }, fund.current_weight.toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "\u2192"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.8rem", fontWeight: 600, width: "60px", textAlign: "right" } }, fund.simulated_weight.toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", fontWeight: 700, width: "60px", textAlign: "right", color: weightDiff > 0 ? "var(--success)" : weightDiff < 0 ? "var(--danger)" : "var(--text-secondary)" } }, weightDiff >= 0 ? "+" : "", weightDiff.toFixed(2), "%")), /* @__PURE__ */ React.createElement("div", { style: { width: "100px", height: "6px", background: "var(--border-glass)", borderRadius: "3px", overflow: "hidden", position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", width: `${fund.current_weight}%`, background: "rgba(255,255,255,0.2)", position: "absolute" } }), /* @__PURE__ */ React.createElement("div", { style: { height: "100%", width: `${fund.simulated_weight}%`, background: isTarget ? "var(--accent-glow)" : "var(--accent-secondary)", position: "absolute", opacity: 0.8 } })));
  })))));
};
const RetiradasTab = () => {
  const [targetAmount, setTargetAmount] = useState("");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRacional, setShowRacional] = useState(false);
  const [traspaso, setTraspaso] = useState(null);
  const [traspasoLoading, setTraspasoLoading] = useState(false);
  React.useEffect(() => {
    setTraspasoLoading(true);
    fetch("/api/portfolio/traspaso-analysis").then((r) => r.ok ? r.json() : Promise.reject(r)).then((data) => {
      setTraspaso(data);
      setTraspasoLoading(false);
    }).catch(() => setTraspasoLoading(false));
  }, []);
  const runOptimization = () => {
    const amt = parseFloat(targetAmount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setError(null);
    fetch("/api/portfolio/tax-optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_amount: amt })
    }).then(async (r) => {
      if (!r.ok) {
        let detail = "Error en la API";
        try {
          const body = await r.json();
          detail = body.detail || JSON.stringify(body);
        } catch {
        }
        throw new Error(detail);
      }
      return r.json();
    }).then((result) => {
      setPlan(result);
      setLoading(false);
    }).catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  };
  const taxBrackets = [
    { limit: 6e3, rate: 19 },
    { limit: 5e4, rate: 21 },
    { limit: 2e5, rate: 23 },
    { limit: 3e5, rate: 27 },
    { limit: Infinity, rate: 28 }
  ];
  const getTaxBreakdown = (capitalGain) => {
    if (capitalGain <= 0) return [];
    let remaining = capitalGain;
    const breakdown = [];
    let prevLimit = 0;
    for (const bracket of taxBrackets) {
      if (remaining <= 0) break;
      const bracketSize = bracket.limit - prevLimit;
      const aplicable = Math.min(remaining, bracketSize);
      const tax = aplicable * (bracket.rate / 100);
      breakdown.push({
        range: bracket.limit === Infinity ? `>${prevLimit.toLocaleString("es-ES")}\u20AC` : `${prevLimit.toLocaleString("es-ES")}\u20AC \u2014 ${bracket.limit.toLocaleString("es-ES")}\u20AC`,
        rate: bracket.rate,
        base: aplicable,
        tax
      });
      remaining -= aplicable;
      prevLimit = bracket.limit;
    }
    return breakdown;
  };
  const totalAhorroTraspaso = traspaso ? traspaso.reduce((s, f) => s + f.ahorro_traspaso, 0) : 0;
  const totalPlusvaliaDiferible = traspaso ? traspaso.filter((f) => f.cualifica_traspaso && f.plusvalia_latente > 0).reduce((s, f) => s + f.plusvalia_latente, 0) : 0;
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem", borderLeft: "3px solid var(--accent-glow)" } }, /* @__PURE__ */ React.createElement(
    "div",
    {
      style: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" },
      onClick: () => setShowRacional((r) => !r)
    },
    /* @__PURE__ */ React.createElement("h4", { style: { fontWeight: 600, margin: 0 } }, "\u{1F4DA} \xBFC\xF3mo funciona? Estrategia de retirada fiscal"),
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: "1.2rem", color: "var(--text-secondary)" } }, showRacional ? "\u25B2" : "\u25BC")
  ), showRacional && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "1.2rem", display: "flex", flexDirection: "column", gap: "1rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h5", { style: { color: "var(--accent-glow)", marginBottom: "0.4rem" } }, "1. Contabilidad FIFO"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 } }, "En Espa\xF1a, la venta de participaciones de fondos de inversi\xF3n sigue la regla ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, "FIFO (First In, First Out)"), ": se venden primero las participaciones adquiridas en fecha m\xE1s antigua. Esto significa que las ganancias acumuladas desde hace m\xE1s tiempo son las que tributan primero. La herramienta calcula autom\xE1ticamente el precio de coste de cada lote y la ganancia patrimonial imputable.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h5", { style: { color: "var(--warning)", marginBottom: "0.4rem" } }, "2. IRPF \u2014 Renta del Ahorro 2024 (Art. 46 LIRPF)"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 } }, "Las ganancias patrimoniales por venta de fondos tributan en la ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, "base imponible del ahorro"), " con los siguientes tramos progresivos:"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.6rem", display: "flex", flexWrap: "wrap", gap: "6px" } }, [{ r: "0 \u2013 6.000\u20AC", t: "19%" }, { r: "6.001 \u2013 50.000\u20AC", t: "21%" }, { r: "50.001 \u2013 200.000\u20AC", t: "23%" }, { r: "200.001 \u2013 300.000\u20AC", t: "27%" }, { r: ">300.000\u20AC", t: "28%" }].map((b) => /* @__PURE__ */ React.createElement("span", { key: b.r, style: { padding: "4px 10px", borderRadius: "6px", background: "rgba(255,165,0,0.1)", border: "1px solid rgba(255,165,0,0.3)", fontSize: "0.78rem" } }, /* @__PURE__ */ React.createElement("strong", null, b.t), " ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, b.r))))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h5", { style: { color: "var(--success)", marginBottom: "0.4rem" } }, "3. Traspasos entre fondos \u2014 diferimiento sin l\xEDmite (Art. 94 LIRPF)"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 } }, "La ventaja fiscal m\xE1s potente disponible en Espa\xF1a: puedes ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, "mover dinero entre fondos de inversi\xF3n sin tributar"), '. Al hacer un traspaso, el reembolso del fondo origen no se considera transmisi\xF3n a efectos del IRPF; la plusval\xEDa latente se "hereda" en el nuevo fondo y solo tributa cuando se produce la venta definitiva.', /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--success)" } }, "Requisitos:"), " Ambos fondos deben ser Instituciones de Inversi\xF3n Colectiva (IICs) registradas en CNMV o ESMA.", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--danger)" } }, " No aplica a ETFs, acciones ni planes de pensiones."), "No existe l\xEDmite de importe ni de frecuencia. La gestora de destino gestiona el tr\xE1mite.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h5", { style: { color: "var(--accent-glow)", marginBottom: "0.4rem" } }, "4. Estrategia \xF3ptima combinada"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, "Para rebalancear cartera:"), " usa traspasos (0\u20AC de impuesto).", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, "Para necesitar liquidez:"), " vende priorizando los lotes con menor ganancia relativa (esta herramienta lo hace autom\xE1ticamente).", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, "Para compensar minusval\xEDas:"), " si tienes fondos en p\xE9rdidas, v\xE9ndelos primero en el mismo ejercicio para compensar ganancias de otros (siempre que no recompres el mismo fondo en los 2 meses siguientes \u2014 regla anti-lavado Art. 33.5 LIRPF).")))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { fontWeight: 600, marginBottom: "0.75rem" } }, "\u{1F504} Optimizaci\xF3n por Traspasos \u2014 Impuesto Diferido"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1rem" } }, "Si necesitas rebalancear tu cartera ", /* @__PURE__ */ React.createElement("em", null, "sin retirar dinero"), ", puedes hacerlo mediante traspasos fiscalmente neutros. El ahorro potencial muestra el impuesto que evitar\xEDas pagar si traspasas en lugar de vender."), traspasoLoading && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.85rem" } }, "\u23F3 Calculando..."), !traspasoLoading && traspaso && traspaso.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.2rem" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", borderRadius: "10px", background: "rgba(0,200,100,0.08)", border: "1px solid rgba(0,200,100,0.2)", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "4px" } }, "Plusval\xEDa diferible"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.2rem", fontWeight: 700, color: "var(--success)" } }, "\u20AC", totalPlusvaliaDiferible.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }))), /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", borderRadius: "10px", background: "rgba(0,200,100,0.08)", border: "1px solid rgba(0,200,100,0.2)", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "4px" } }, "Ahorro fiscal potencial"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.2rem", fontWeight: 700, color: "var(--success)" } }, "\u20AC", totalAhorroTraspaso.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })))), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", minWidth: "600px" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left" } }, "Fondo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Valor actual"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Plusval\xEDa latente"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Impuesto si vendes"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Ahorro traspaso"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center" } }, "Cualifica"))), /* @__PURE__ */ React.createElement("tbody", null, traspaso.map((f, idx) => /* @__PURE__ */ React.createElement("tr", { key: idx }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 500, fontSize: "0.88rem" } }, f.nombre), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "monospace" } }, f.isin)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } }, "\u20AC", f.valor_actual.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600, color: f.plusvalia_latente >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, f.plusvalia_latente >= 0 ? "+" : "", "\u20AC", f.plusvalia_latente.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "4px" } }, "(", f.plusvalia_pct >= 0 ? "+" : "", f.plusvalia_pct.toFixed(1), "%)")), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--danger)", fontVariantNumeric: "tabular-nums", fontWeight: 600 } }, f.impuesto_si_vendes > 0 ? `-\u20AC${f.impuesto_si_vendes.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--success)", fontVariantNumeric: "tabular-nums", fontWeight: 700 } }, f.ahorro_traspaso > 0 ? `+\u20AC${f.ahorro_traspaso.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("span", { style: {
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "0.75rem",
    fontWeight: 600,
    background: f.cualifica_traspaso ? "rgba(0,200,100,0.15)" : "rgba(220,50,50,0.15)",
    color: f.cualifica_traspaso ? "var(--success)" : "var(--danger)"
  } }, f.cualifica_traspaso ? "\u2713 S\xED" : "\u2717 No"))))))), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.75rem", fontStyle: "italic" } }, "* Se asume que todos los fondos son IICs (fondos de inversi\xF3n). Verifica que no hay ETFs en cartera antes de ejecutar un traspaso. El ahorro es temporal (diferimiento), no eliminaci\xF3n del impuesto.")), !traspasoLoading && (!traspaso || traspaso.length === 0) && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.85rem" } }, "No hay datos de posiciones disponibles.")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F4B0} Retirada de Fondos \u2014 Optimizaci\xF3n Fiscal"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" } }, "Calcula el plan de venta \xF3ptimo para minimizar impuestos sobre la ganancia patrimonial. Usa contabilidad FIFO y prioriza los lotes con ", /* @__PURE__ */ React.createElement("strong", null, "menor plusval\xEDa relativa"), " para diferir el m\xE1ximo impuesto posible."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 220px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Importe a retirar (\u20AC)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "100",
      step: "1000",
      value: targetAmount,
      onChange: (e) => setTargetAmount(e.target.value),
      placeholder: "50000",
      style: { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "1rem" }
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: runOptimization,
      disabled: !targetAmount || loading,
      style: {
        padding: "10px 24px",
        height: "42px",
        background: !targetAmount ? "var(--border-glass)" : "linear-gradient(135deg, var(--warning), hsl(25, 90%, 50%))",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontWeight: 700,
        cursor: !targetAmount ? "not-allowed" : "pointer",
        fontSize: "0.9rem",
        transition: "all 0.2s"
      }
    },
    loading ? "Calculando..." : "\u{1F4B0} Optimizar Retirada"
  )), error && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "12px", padding: "8px 14px", background: "rgba(220,50,50,0.15)", borderRadius: "8px", color: "var(--danger)", fontSize: "0.85rem" } }, error)), plan && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Importe Retirado"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)" } }, "\u20AC", plan.withdrawn_amount.toLocaleString("es-ES", { minimumFractionDigits: 2 }))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Ganancia Patrimonial"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.3rem", fontWeight: 700, color: plan.total_capital_gain >= 0 ? "var(--success)" : "var(--danger)" } }, "\u20AC", plan.total_capital_gain.toLocaleString("es-ES", { minimumFractionDigits: 2 }))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Impuestos Estimados"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.3rem", fontWeight: 700, color: "var(--warning)" } }, "\u20AC", plan.estimated_tax.toLocaleString("es-ES", { minimumFractionDigits: 2 }))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Neto tras Impuestos"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.3rem", fontWeight: 700, color: "var(--accent-glow)" } }, "\u20AC", plan.net_amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F4CB} Plan de Venta \xD3ptimo"), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", minWidth: "700px" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left" } }, "Fondo"), /* @__PURE__ */ React.createElement("th", null, "Fecha Compra"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Participaciones"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Importe Venta"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Ganancia"))), /* @__PURE__ */ React.createElement("tbody", null, plan.plan.map((step, idx) => /* @__PURE__ */ React.createElement("tr", { key: idx }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: "0.9rem" } }, step.Fondo), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "monospace" } }, step.ISIN)), /* @__PURE__ */ React.createElement("td", { style: { fontSize: "0.85rem" } }, step.Fecha_Compra || "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } }, step.Participaciones_Vendidas.toFixed(4)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" } }, "\u20AC", step.Importe_Retirado.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600, color: step.Ganancia_Patrimonial >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, step.Ganancia_Patrimonial >= 0 ? "+" : "", "\u20AC", step.Ganancia_Patrimonial.toLocaleString("es-ES", { minimumFractionDigits: 2 })))))))), plan.total_capital_gain > 0 && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F3DB}\uFE0F Desglose por Tramos Fiscales (Ahorro Espa\xF1a 2024)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, getTaxBreakdown(plan.total_capital_gain).map((bracket, idx) => /* @__PURE__ */ React.createElement("div", { key: idx, style: { display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", background: "rgba(0,0,0,0.15)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 200px", fontSize: "0.8rem", color: "var(--text-secondary)" } }, bracket.range), /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 60px", fontWeight: 700, color: "var(--warning)", fontSize: "0.9rem" } }, bracket.rate, "%"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: "0.85rem", fontVariantNumeric: "tabular-nums" } }, "Base: \u20AC", bracket.base.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 120px", textAlign: "right", fontWeight: 600, color: "var(--danger)", fontVariantNumeric: "tabular-nums" } }, "-\u20AC", bracket.tax.toLocaleString("es-ES", { minimumFractionDigits: 2 }))))))));
};
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshingNav, setRefreshingNav] = useState(false);
  const [refreshingDetails, setRefreshingDetails] = useState(false);
  const [refreshDetailsKey, setRefreshDetailsKey] = useState(0);
  const [refreshStep, setRefreshStep] = useState("");
  const [refreshElapsed, setRefreshElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState("general");
  const refreshIntervalRef = React.useRef(null);
  const loadData = (endpoint = "/api/portfolio/summary") => {
    fetch(endpoint).then((res) => res.json()).then((json) => {
      setData(json);
      setLoading(false);
    }).catch((err) => {
      console.error("Error fetching data:", err);
      setLoading(false);
    });
  };
  const handleRefreshNav = () => {
    setRefreshingNav(true);
    fetch("/api/portfolio/refresh-nav").then((res) => res.json()).then((json) => {
      setData(json);
      setRefreshingNav(false);
    }).catch((err) => {
      console.error("Error refreshing NAVs:", err);
      setRefreshingNav(false);
    });
  };
  const handleRefreshDetails = () => {
    setRefreshingDetails(true);
    setRefreshElapsed(0);
    const steps = [
      "\u{1F517} Conectando con Finect...",
      "\u{1F4E1} Descargando datos sectoriales...",
      "\u{1F30D} Descargando exposici\xF3n geogr\xE1fica...",
      "\u{1F4CA} Procesando m\xE9tricas de cada fondo...",
      "\u{1F504} Normalizando sectores y regiones...",
      "\u{1F4BE} Guardando resultados en cach\xE9..."
    ];
    setRefreshStep(steps[0]);
    fetch("/api/portfolio/refresh-details").catch(() => {
    });
    let elapsed = 0;
    let stepIdx = 0;
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    refreshIntervalRef.current = setInterval(() => {
      elapsed += 5;
      stepIdx = Math.min(Math.floor(elapsed / 20), steps.length - 1);
      setRefreshStep(steps[stepIdx]);
      setRefreshElapsed(elapsed);
      fetch("/api/portfolio/details").then((r) => r.json()).then((d) => {
        const hasContent = d && Object.keys(d).length > 0 && Object.values(d).some(
          (f) => f.sector && Object.keys(f.sector).length > 0 || f.region && Object.keys(f.region).length > 0
        );
        if (hasContent || elapsed >= 150) {
          clearInterval(refreshIntervalRef.current);
          setRefreshingDetails(false);
          setRefreshStep("");
          setRefreshElapsed(0);
          setRefreshDetailsKey((k) => k + 1);
        }
      }).catch(() => {
        if (elapsed >= 150) {
          clearInterval(refreshIntervalRef.current);
          setRefreshingDetails(false);
        }
      });
    }, 5e3);
  };
  useEffect(() => {
    loadData();
  }, []);
  if (loading) return /* @__PURE__ */ React.createElement("div", { className: "loading-state" }, /* @__PURE__ */ React.createElement("div", { className: "spinner" }), /* @__PURE__ */ React.createElement("p", null, "Connecting..."));
  if (!data || !data.summary) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", color: "#ff4444" } }, /* @__PURE__ */ React.createElement("h3", null, "API Error / Database Empty"));
  const chartData = Object.keys(data.summary.details).map((k) => ({ name: k, value: data.summary.details[k] }));
  const tabs = ["general", "detalles", "evolucion", "simulador", "retiradas"];
  const tabLabels = { general: "General", detalles: "Detalles", evolucion: "Evoluci\xF3n", simulador: "Simulador", retiradas: "Retiradas" };
  return /* @__PURE__ */ React.createElement("div", { className: "dashboard-container" }, /* @__PURE__ */ React.createElement("header", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Portfolio Tracker")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px", background: "rgba(0,0,0,0.3)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-glass)" } }, tabs.map((tab) => /* @__PURE__ */ React.createElement("button", { key: tab, onClick: () => setActiveTab(tab), style: {
    padding: "8px 16px",
    background: activeTab === tab ? "var(--accent-glow)" : "transparent",
    color: activeTab === tab ? "#000" : "var(--text-primary)",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s"
  } }, tabLabels[tab]))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleRefreshNav,
      disabled: refreshingNav,
      style: {
        padding: "10px 20px",
        background: refreshingNav ? "var(--border-glass)" : "var(--bg-glass)",
        color: refreshingNav ? "var(--text-secondary)" : "#fff",
        border: "1px solid var(--border-glass)",
        borderRadius: "8px",
        fontWeight: "600",
        cursor: refreshingNav ? "not-allowed" : "pointer",
        transition: "all 0.3s"
      }
    },
    refreshingNav ? "Sincronizando..." : "\u{1F504} Recalcular Cotizaciones"
  )), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "2rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "general" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(GeneralTab, { data, chartData, reloadData: loadData })), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "detalles" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(
    DetailsTab,
    {
      onRefreshDetails: handleRefreshDetails,
      refreshingDetails,
      refreshStep,
      refreshElapsed,
      refreshDetailsKey
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "evolucion" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(EvolutionTab, { rawData: data })), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "simulador" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(SimuladorTab, null)), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "retiradas" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(RetiradasTab, null))));
};
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", color: "red" } }, /* @__PURE__ */ React.createElement("h2", null, "Crash"), /* @__PURE__ */ React.createElement("pre", null, this.state.error.toString()));
    return this.props.children;
  }
}
try {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(/* @__PURE__ */ React.createElement(ErrorBoundary, null, /* @__PURE__ */ React.createElement(Dashboard, null)));
} catch (e) {
  document.getElementById("root").innerHTML = `<p style="color:red">React Engine Fatal Error: ${e.message}</p>`;
}
