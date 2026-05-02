const { useState, useEffect } = React;
const COLORS = ["#4ca1af", "#c4e0e5", "#89f7fe", "#66a6ff", "#f3a183", "#a18cd1", "#fbc2eb", "#fad0c4", "#ff9a9e", "#fecfef"];
const MetricCard = ({ title, value, unit = "%" }) => /* @__PURE__ */ React.createElement("div", { className: "glass-panel metric-card" }, /* @__PURE__ */ React.createElement("div", { className: "metric-card-title" }, title), /* @__PURE__ */ React.createElement("div", { className: "metric-card-value" }, value, unit));
const AdviceCard = ({ advice, type = "info" }) => /* @__PURE__ */ React.createElement("div", { className: `glass-panel advice-card ${type}` }, /* @__PURE__ */ React.createElement("div", { className: "advice-title" }, advice.title), /* @__PURE__ */ React.createElement("div", { className: "advice-text" }, advice.text));
const GeneralTab = ({ data, chartData, reloadData }) => {
  const [newFund, setNewFund] = useState({ Fondo: "", ISIN: "", TIPO: "INDEX", Porcentaje: 0 });
  const [isSaving, setIsSaving] = useState(false);
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
  return /* @__PURE__ */ React.createElement("div", { className: "main-content" }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel fund-table-container" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { fontWeight: 600, margin: 0 } }, "Mi Cartera Base")), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", minWidth: "600px" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Fondo / Activo"), /* @__PURE__ */ React.createElement("th", null, "Tipo / Categor\xEDa MS"), /* @__PURE__ */ React.createElement("th", null, "NAV Actual"), /* @__PURE__ */ React.createElement("th", null, "YTD (%)"), /* @__PURE__ */ React.createElement("th", null, "Rating"), /* @__PURE__ */ React.createElement("th", null, "Acciones"))), /* @__PURE__ */ React.createElement("tbody", null, data.funds.map((fund, idx) => /* @__PURE__ */ React.createElement("tr", { key: idx }, /* @__PURE__ */ React.createElement("td", { style: { fontWeight: 500 } }, fund.Fondo, " ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--accent-glow)", fontSize: "0.75rem" } }, "(", fund.Porcentaje, "%)"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.75rem" } }, fund.ISIN || "")), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { style: { padding: "4px 8px", background: "var(--border-glass)", borderRadius: "6px", fontSize: "0.8rem" } }, fund["Categor\xEDa"] || fund.TIPO)), /* @__PURE__ */ React.createElement("td", { style: { color: "var(--text-primary)", fontWeight: "bold" } }, fund["NAV (Precio)"] || "---"), /* @__PURE__ */ React.createElement("td", { style: { color: fund["YTD (%)"] && fund["YTD (%)"].includes("-") ? "var(--danger)" : "var(--success)" } }, fund["YTD (%)"] || "---"), /* @__PURE__ */ React.createElement("td", { style: { color: "var(--accent-secondary)" } }, fund["Estrellas MS"] || "---"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { onClick: () => handleDelete(fund.ISIN || fund.Fondo), style: { background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" } }, "X"))))))), /* @__PURE__ */ React.createElement("form", { onSubmit: handleAdd, style: { marginTop: "2rem", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px dashed var(--border-glass)" } }, /* @__PURE__ */ React.createElement("input", { required: true, placeholder: "Nombre (ej. SP500)", value: newFund.Fondo, onChange: (e) => setNewFund({ ...newFund, Fondo: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", flex: 1 } }), /* @__PURE__ */ React.createElement("input", { placeholder: "ISIN (Opcional)", value: newFund.ISIN, onChange: (e) => setNewFund({ ...newFund, ISIN: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", flex: 1 } }), /* @__PURE__ */ React.createElement("select", { value: newFund.TIPO, onChange: (e) => setNewFund({ ...newFund, TIPO: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white" } }, /* @__PURE__ */ React.createElement("option", { value: "INDEX" }, "INDEX"), /* @__PURE__ */ React.createElement("option", { value: "VALUE" }, "VALUE"), /* @__PURE__ */ React.createElement("option", { value: "SPECIALIZED" }, "SPECIALIZED"), /* @__PURE__ */ React.createElement("option", { value: "RF" }, "RENTA FIJA"), /* @__PURE__ */ React.createElement("option", { value: "ORO" }, "ORO"), /* @__PURE__ */ React.createElement("option", { value: "CRYPTO" }, "CRYPTO"), /* @__PURE__ */ React.createElement("option", { value: "CASH" }, "LIQUIDEZ")), /* @__PURE__ */ React.createElement("input", { required: true, max: "100", min: "0", step: "0.01", type: "number", placeholder: "% Peso", value: newFund.Porcentaje, onChange: (e) => setNewFund({ ...newFund, Porcentaje: Number(e.target.value) }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", width: "80px" } }), /* @__PURE__ */ React.createElement("button", { disabled: isSaving, type: "submit", style: { padding: "8px 15px", background: "var(--accent-glow)", color: "black", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" } }, isSaving ? "..." : "+ A\xF1adir"))), /* @__PURE__ */ React.createElement("div", { className: "advice-section" }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { height: "300px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1rem", alignSelf: "flex-start" } }, "Asset Allocation"), /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: "35px", borderRadius: "8px", overflow: "hidden", width: "100%", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" } }, chartData.map((entry, index) => /* @__PURE__ */ React.createElement("div", { key: entry.name, style: {
    width: `${entry.value / Object.values(data.summary.details).reduce((a, b) => a + b, 0) * 100}%`,
    backgroundColor: COLORS[index % COLORS.length]
  } }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "center", marginTop: "1.5rem" } }, chartData.map((entry, index) => /* @__PURE__ */ React.createElement("div", { key: entry.name, style: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "12px", height: "12px", borderRadius: "50%", backgroundColor: COLORS[index % COLORS.length] } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, entry.name, " ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, "(", entry.value.toFixed(2), "%)"))))))), data.recommendation.rf_sug && /* @__PURE__ */ React.createElement(AdviceCard, { advice: data.recommendation.rf_sug, type: "info" }), data.recommendation.cash_warn && /* @__PURE__ */ React.createElement(AdviceCard, { advice: data.recommendation.cash_warn, type: "warning" })));
};
const DetailsTab = () => {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portfolio/details").then((r) => r.json()).then((d) => {
      setDetails(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  if (loading) return /* @__PURE__ */ React.createElement("div", { style: { padding: "3rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { className: "spinner", style: { margin: "0 auto 1rem" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Cargando perfiles estructurales..."));
  const hasData = details && Object.keys(details).length > 0 && Object.values(details).some(
    (f) => f.sector && Object.keys(f.sector).length > 0 || f.region && Object.keys(f.region).length > 0
  );
  if (!hasData) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", marginBottom: "1rem" } }, "No hay datos sectoriales/geogr\xE1ficos disponibles."), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.85rem", color: "var(--text-secondary)" } }, 'Pulsa "\u{1F504} Recalcular Morningstar" para descargar los perfiles detallados de cada fondo (requiere datos de Morningstar en modo "detailed").'), details && Object.keys(details).length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "1.5rem", textAlign: "left" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "0.5rem", color: "var(--text-primary)" } }, "Fondos detectados (", Object.keys(details).length, "):"), Object.entries(details).map(([name, info]) => /* @__PURE__ */ React.createElement("div", { key: name, style: { padding: "6px 0", fontSize: "0.85rem", borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--accent-glow)" } }, name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", marginLeft: "8px" } }, " \u2014 ", info.tipo || "?", " \xB7 ", info.percentage?.toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { color: Object.keys(info.sector || {}).length > 0 ? "var(--success)" : "var(--danger)", marginLeft: "8px" } }, Object.keys(info.sector || {}).length > 0 ? "\u2713 sector" : "\u2717 sector"), /* @__PURE__ */ React.createElement("span", { style: { color: Object.keys(info.region || {}).length > 0 ? "var(--success)" : "var(--danger)", marginLeft: "8px" } }, Object.keys(info.region || {}).length > 0 ? "\u2713 regi\xF3n" : "\u2717 regi\xF3n")))));
  const aggregate = (keyExtractor) => {
    const aggr = {};
    Object.values(details).forEach((fund) => {
      const dataBlock = fund[keyExtractor] || {};
      let items = [];
      if (Array.isArray(dataBlock)) items = dataBlock;
      else if (typeof dataBlock === "object") {
        items = Object.keys(dataBlock).map((k) => ({ name: k, value: dataBlock[k] }));
      }
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
  const renderBars = (dataList) => /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } }, dataList.map((item, idx) => /* @__PURE__ */ React.createElement("div", { key: item.name, style: { fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "6px" } }, /* @__PURE__ */ React.createElement("span", null, item.name), /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--accent-secondary)" } }, item.value.toFixed(1), "%")), /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "8px", background: "var(--border-glass)", borderRadius: "4px", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", width: `${Math.min(item.value * 2, 100)}%`, background: COLORS[idx % COLORS.length] } })))), dataList.length === 0 && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "No se detect\xF3 informaci\xF3n en la capa externa."));
  return /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" } }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1.5rem", fontWeight: 600 } }, "\u{1F3AF} Exposici\xF3n Sectorial"), renderBars(sectors)), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1.5rem", fontWeight: 600 } }, "\u{1F30D} Exposici\xF3n Geogr\xE1fica"), renderBars(regions)));
};
const HeatmapRenderer = ({ data, activeFunds }) => {
  if (!data || !data.labels) return null;
  const labels = data.labels.filter((l) => activeFunds.includes(l));
  if (labels.length < 2) return /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)" } }, "Selecciona al menos dos fondos para ver la correlaci\xF3n.");
  return /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: `auto repeat(${labels.length}, 1fr)`, gap: "3px", fontSize: "0.7rem", marginTop: "1rem" } }, /* @__PURE__ */ React.createElement("div", null), labels.map((l) => /* @__PURE__ */ React.createElement("div", { key: l, style: { textAlign: "center", writingMode: "vertical-rl", alignSelf: "end", maxHeight: "110px", overflow: "hidden" } }, l.substring(0, 20))), labels.map((l1) => /* @__PURE__ */ React.createElement(React.Fragment, { key: l1 }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", paddingRight: "8px", alignSelf: "center", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "140px" } }, l1.substring(0, 20)), labels.map((l2) => {
    const val = data.matrix[l1]?.[l2] ?? null;
    if (val === null || val === 0 && l1 !== l2) {
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
  }))));
};
const InteractiveChart = ({ datasets, timeframe, activeFunds, customRange }) => {
  const containerRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const overlayRef = React.useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 400 });
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
    let idx = 0;
    const PORTFOLIO_KEY = "\u{1F4C8} Mi Cartera";
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
      lines.push({
        fund,
        color: fund === PORTFOLIO_KEY ? "#FFD700" : COLORS[idx % COLORS.length],
        points: normalized,
        isPortfolio: fund === PORTFOLIO_KEY
      });
      if (fund !== PORTFOLIO_KEY) idx++;
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
  if (loading) return /* @__PURE__ */ React.createElement("div", { style: { padding: "3rem", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { className: "spinner", style: { margin: "0 auto 1rem" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Cargando datos hist\xF3ricos..."));
  if (!historyBatch || Object.keys(historyBatch).length === 0) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", textAlign: "center", color: "var(--text-secondary)" } }, 'No hay datos hist\xF3ricos disponibles. Pulsa "Recalcular Morningstar" para generar los datos.');
  const allKeys = Object.keys(historyBatch);
  const portfolioKey = allKeys.find((k) => k.includes("Mi Cartera"));
  const regularFunds = allKeys.filter((k) => !k.includes("Mi Cartera")).sort();
  const allFunds = portfolioKey ? [portfolioKey, ...regularFunds] : regularFunds;
  const corrFunds = activeFunds.filter((f) => !f.includes("Mi Cartera"));
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
  ))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.08)" } }, /* @__PURE__ */ React.createElement("strong", { style: { marginRight: "6px", fontSize: "0.85rem", alignSelf: "center" } }, "Fondos:"), /* @__PURE__ */ React.createElement("button", { onClick: () => setActiveFunds(allFunds), style: { padding: "3px 10px", borderRadius: "12px", border: "1px solid var(--border-glass)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.72rem" } }, "Todos"), /* @__PURE__ */ React.createElement("button", { onClick: () => setActiveFunds([]), style: { padding: "3px 10px", borderRadius: "12px", border: "1px solid var(--border-glass)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.72rem" } }, "Ninguno"), allFunds.map((fund) => {
    const isActive = activeFunds.includes(fund);
    const colorIdx = allFunds.indexOf(fund);
    const fundColor = COLORS[colorIdx % COLORS.length];
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
  }))), /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "0.5rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" } }, "Crecimiento Porcentual Acumulado", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400 } }, "(base 100 al inicio del periodo)")), /* @__PURE__ */ React.createElement(InteractiveChart, { datasets: historyBatch, timeframe, activeFunds, customRange: showCustom ? customRange : null }), /* @__PURE__ */ React.createElement("h3", { style: { marginTop: "2.5rem", marginBottom: "0.5rem", fontWeight: 600 } }, "Matriz de Correlaci\xF3n de Pearson"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" } }, "Valores cercanos a ", /* @__PURE__ */ React.createElement("span", { style: { color: "hsl(120,80%,40%)" } }, "+1 (verde)"), " = fondos se mueven juntos. Valores cercanos a ", /* @__PURE__ */ React.createElement("span", { style: { color: "hsl(0,80%,50%)" } }, "-1 (rojo)"), " = descorrelacionados (protegen tu cartera)."), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", overflowX: "auto" } }, correlationMatrix && correlationMatrix.labels && correlationMatrix.labels.length > 0 ? /* @__PURE__ */ React.createElement(HeatmapRenderer, { data: correlationMatrix, activeFunds: corrFunds }) : /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)", textAlign: "center" } }, 'Matriz no disponible. Pulsa "Recalcular Morningstar" para generarla.')));
};
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const loadData = (endpoint = "/api/portfolio/summary") => {
    if (endpoint.includes("enrich")) setRefreshing(true);
    fetch(endpoint).then((res) => res.json()).then((json) => {
      setData(json);
      setLoading(false);
      setRefreshing(false);
    }).catch((err) => {
      console.error("Error fetching data:", err);
      setLoading(false);
      setRefreshing(false);
    });
  };
  useEffect(() => {
    loadData();
  }, []);
  if (loading) return /* @__PURE__ */ React.createElement("div", { className: "loading-state" }, /* @__PURE__ */ React.createElement("div", { className: "spinner" }), /* @__PURE__ */ React.createElement("p", null, "Establishing Secure Connection..."));
  if (!data || !data.summary) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", color: "#ff4444" } }, /* @__PURE__ */ React.createElement("h3", null, "API Error / Database Empty"));
  const chartData = Object.keys(data.summary.details).map((k) => ({ name: k, value: data.summary.details[k] }));
  return /* @__PURE__ */ React.createElement("div", { className: "dashboard-container" }, /* @__PURE__ */ React.createElement("header", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Portfolio Tracker Pro"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--success)" } }, "\u{1F680} Arquitectura SQL/JSON Local Integrada")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px", background: "rgba(0,0,0,0.3)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-glass)" } }, ["general", "detalles", "evolucion"].map((tab) => /* @__PURE__ */ React.createElement("button", { key: tab, onClick: () => setActiveTab(tab), style: {
    padding: "8px 16px",
    background: activeTab === tab ? "var(--accent-glow)" : "transparent",
    color: activeTab === tab ? "#000" : "var(--text-primary)",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
    textTransform: "capitalize",
    transition: "all 0.2s"
  } }, tab))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => loadData("/api/portfolio/enrich"),
      disabled: refreshing,
      style: {
        padding: "10px 20px",
        background: refreshing ? "var(--border-glass)" : "var(--bg-glass)",
        color: refreshing ? "var(--text-secondary)" : "#fff",
        border: "1px solid var(--border-glass)",
        borderRadius: "8px",
        fontWeight: "600",
        cursor: refreshing ? "not-allowed" : "pointer",
        transition: "all 0.3s"
      }
    },
    refreshing ? "Sincronizando..." : "\u{1F504} Recalcular Morningstar"
  )), /* @__PURE__ */ React.createElement("div", { className: "top-metrics" }, /* @__PURE__ */ React.createElement(MetricCard, { title: "Renta Variable (RV)", value: data.summary.total_rv.toFixed(2) }), /* @__PURE__ */ React.createElement(MetricCard, { title: "Renta Fija (RF)", value: data.summary.total_rf.toFixed(2) }), /* @__PURE__ */ React.createElement(MetricCard, { title: "Liquidez (Cash)", value: data.summary.total_cash.toFixed(2) }), /* @__PURE__ */ React.createElement(MetricCard, { title: "Alternativos", value: data.summary.total_alt.toFixed(2) })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "2rem" } }, activeTab === "general" && /* @__PURE__ */ React.createElement(GeneralTab, { data, chartData, reloadData: loadData }), activeTab === "detalles" && /* @__PURE__ */ React.createElement(DetailsTab, null), activeTab === "evolucion" && /* @__PURE__ */ React.createElement(EvolutionTab, { rawData: data })));
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
