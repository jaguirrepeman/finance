const { useState, useEffect, useRef, useMemo, useCallback } = React;
const COLORS = ["#4ca1af", "#c4e0e5", "#89f7fe", "#66a6ff", "#f3a183", "#a18cd1", "#fbc2eb", "#fad0c4", "#ff9a9e", "#fecfef"];
const AdviceCard = ({ advice, type = "info" }) => /* @__PURE__ */ React.createElement("div", { className: `glass-panel advice-card ${type}` }, /* @__PURE__ */ React.createElement("div", { className: "advice-title" }, advice.title), /* @__PURE__ */ React.createElement("div", { className: "advice-text" }, advice.text));
const PortfolioValueChart = ({ series }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [dims, setDims] = useState({ w: 800, h: 280 });
  const [zoomRange, setZoomRange] = useState("ALL");
  const filteredSeries = useMemo(() => {
    if (!series || !series.length) return series;
    if (zoomRange === "ALL") return series;
    const now = new Date(series[series.length - 1].date);
    const cutoff = new Date(now);
    if (zoomRange === "3M") cutoff.setMonth(cutoff.getMonth() - 3);
    else if (zoomRange === "6M") cutoff.setMonth(cutoff.getMonth() - 6);
    else if (zoomRange === "1Y") cutoff.setFullYear(cutoff.getFullYear() - 1);
    else if (zoomRange === "2Y") cutoff.setFullYear(cutoff.getFullYear() - 2);
    return series.filter((d) => new Date(d.date) >= cutoff);
  }, [series, zoomRange]);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: 280 });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !filteredSeries || filteredSeries.length < 2) return;
    const { w, h } = dims;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const mg = { top: 20, right: 20, bottom: 36, left: 72 };
    const pw = w - mg.left - mg.right;
    const ph = h - mg.top - mg.bottom;
    const values = filteredSeries.map((d) => d.value);
    const invested = filteredSeries.map((d) => d.invested);
    const allY = [...values, ...invested].filter(Boolean);
    const minY = Math.min(...allY) * 0.97;
    const maxY = Math.max(...allY) * 1.03;
    const dates = filteredSeries.map((d) => new Date(d.date).getTime());
    const minX = dates[0], maxX = dates[dates.length - 1];
    const xS = (ts) => mg.left + (ts - minX) / (maxX - minX || 1) * pw;
    const yS = (v) => mg.top + ph - (v - minY) / (maxY - minY || 1) * ph;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "10px Inter, sans-serif";
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const v = minY + (maxY - minY) * (i / steps);
      const y = yS(v);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mg.left, y);
      ctx.lineTo(mg.left + pw, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText(`\u20AC${(v / 1e3).toFixed(0)}k`, mg.left - 6, y);
    }
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 6; i++) {
      const ts = minX + i / 6 * (maxX - minX);
      const x = xS(ts);
      const d = new Date(ts);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText(`${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`, x, h - mg.bottom + 8);
    }
    ctx.beginPath();
    filteredSeries.forEach((d, i) => {
      const x = xS(dates[i]);
      const y = yS(d.value);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    filteredSeries.slice().reverse().forEach((d, i, arr) => {
      const origIdx = arr.length - 1 - i;
      ctx.lineTo(xS(dates[origIdx]), yS(d.invested));
    });
    ctx.closePath();
    const lastGain = filteredSeries[filteredSeries.length - 1].value - filteredSeries[filteredSeries.length - 1].invested;
    ctx.fillStyle = lastGain >= 0 ? "rgba(0,212,170,0.12)" : "rgba(239,68,68,0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    filteredSeries.forEach((d, i) => {
      const x = xS(dates[i]);
      const y = yS(d.invested);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#FFD70060";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    filteredSeries.forEach((d, i) => {
      const x = xS(dates[i]);
      const y = yS(d.value);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [filteredSeries, dims]);
  const handleMouseMove = (e) => {
    if (!filteredSeries || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mg = { top: 20, right: 20, bottom: 36, left: 72 };
    const mx = e.clientX - rect.left;
    if (mx < mg.left || mx > dims.w - mg.right) {
      setTooltip(null);
      return;
    }
    const pw = dims.w - mg.left - mg.right;
    const dates = filteredSeries.map((d2) => new Date(d2.date).getTime());
    const minX = dates[0], maxX = dates[dates.length - 1];
    const ts = minX + (mx - mg.left) / pw * (maxX - minX);
    const idx = dates.reduce((best, t, i) => Math.abs(t - ts) < Math.abs(dates[best] - ts) ? i : best, 0);
    const d = filteredSeries[idx];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const dd = new Date(d.date);
    const gain = d.value - d.invested;
    const gainPct = d.invested > 0 ? gain / d.invested * 100 : 0;
    setTooltip({ x: mx, date: `${dd.getDate()} ${months[dd.getMonth()]} ${dd.getFullYear()}`, value: d.value, invested: d.invested, gain, gainPct });
  };
  return /* @__PURE__ */ React.createElement("div", { ref: containerRef, style: { position: "relative", width: "100%", background: "var(--bg-glass)", borderRadius: "10px", border: "1px solid var(--border-glass)", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "16px", padding: "10px 16px 4px", fontSize: "0.78rem", borderBottom: "1px solid rgba(255,255,255,0.05)", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "16px" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "12px", height: "3px", background: "#FFD700", display: "inline-block", borderRadius: "2px", boxShadow: "0 0 6px #FFD700" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Patrimonio")), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "12px", borderTop: "2px dashed rgba(255,255,255,0.5)", display: "inline-block" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Invertido"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "4px" } }, ["3M", "6M", "1Y", "2Y", "MAX"].map((r) => /* @__PURE__ */ React.createElement("button", { key: r, onClick: () => setZoomRange(r === "MAX" ? "ALL" : r), style: { padding: "2px 8px", borderRadius: "8px", fontSize: "0.7rem", fontWeight: 600, border: zoomRange === r || r === "MAX" && zoomRange === "ALL" ? "1px solid var(--accent-glow)" : "1px solid rgba(255,255,255,0.12)", background: zoomRange === r || r === "MAX" && zoomRange === "ALL" ? "var(--accent-glow)" : "transparent", color: zoomRange === r || r === "MAX" && zoomRange === "ALL" ? "#000" : "var(--text-secondary)", cursor: "pointer" } }, r)))), /* @__PURE__ */ React.createElement("canvas", { ref: canvasRef, style: { display: "block", cursor: "crosshair" }, onMouseMove: handleMouseMove, onMouseLeave: () => setTooltip(null) }), tooltip && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: tooltip.x, top: 30, bottom: 36, width: "1px", background: "rgba(255,255,255,0.2)", pointerEvents: "none" } }), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: tooltip.x > dims.w / 2 ? tooltip.x - 210 : tooltip.x + 14, top: 40, background: "rgba(15,20,35,0.97)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px", padding: "10px 14px", pointerEvents: "none", backdropFilter: "blur(12px)", minWidth: "190px", zIndex: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "6px", fontWeight: 600 } }, tooltip.date), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "3px" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "#FFD700" } }, "Patrimonio"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontVariantNumeric: "tabular-nums" } }, "\u20AC", tooltip.value.toLocaleString("es-ES", { minimumFractionDigits: 0 }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "3px" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Invertido"), /* @__PURE__ */ React.createElement("span", { style: { fontVariantNumeric: "tabular-nums" } }, "\u20AC", tooltip.invested.toLocaleString("es-ES", { minimumFractionDigits: 0 }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.8rem", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "4px" } }, /* @__PURE__ */ React.createElement("span", { style: { color: tooltip.gain >= 0 ? "var(--success)" : "var(--danger)" } }, "Ganancia"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: tooltip.gain >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, tooltip.gain >= 0 ? "+" : "", "\u20AC", Math.abs(tooltip.gain).toLocaleString("es-ES", { minimumFractionDigits: 0 }), " (", tooltip.gainPct >= 0 ? "+" : "", tooltip.gainPct.toFixed(1), "%)")))));
};
const PerFundEvolutionChart = ({ evolutionData }) => {
  const [fundData, setFundData] = useState(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);
  const [zoom, setZoom] = useState("MAX");
  const [selectedFunds, setSelectedFunds] = useState(null);
  const [singleFund, setSingleFund] = useState("");
  const chartState = useRef(null);
  useEffect(() => {
    if (evolutionData?.funds && Object.keys(evolutionData.funds).length > 0) {
      setFundData(evolutionData);
    } else {
      setLoading(true);
      fetch("/api/portfolio/real-evolution-per-fund").then((r) => r.json()).then((d) => {
        setFundData(d);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [evolutionData]);
  const COLORS2 = ["#FFD700", "#4fc3f7", "#66bb6a", "#ef5350", "#ab47bc", "#ff7043", "#26c6da", "#8d6e63", "#78909c", "#d4e157", "#5c6bc0", "#ec407a", "#00bcd4", "#cddc39", "#ff5722"];
  const allFunds = useMemo(() => {
    if (!fundData?.funds) return [];
    return Object.entries(fundData.funds).map(([name, pts]) => ({ name, lastVal: pts.length > 0 ? pts[pts.length - 1].value : 0 })).sort((a, b) => b.lastVal - a.lastVal);
  }, [fundData]);
  const effectiveSelected = useMemo(() => {
    if (singleFund) return /* @__PURE__ */ new Set([singleFund]);
    if (!selectedFunds) return new Set(allFunds.map((f) => f.name));
    return selectedFunds;
  }, [singleFund, selectedFunds, allFunds]);
  const colorMap = useMemo(() => {
    const m = {};
    allFunds.forEach((f, i) => {
      m[f.name] = COLORS2[i % COLORS2.length];
    });
    return m;
  }, [allFunds]);
  const toggleFund = (name) => {
    if (singleFund) {
      setSingleFund("");
      return;
    }
    setSelectedFunds((prev) => {
      const current = prev || new Set(allFunds.map((f) => f.name));
      const next = new Set(current);
      if (next.has(name)) {
        if (next.size > 1) next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };
  useEffect(() => {
    if (!fundData?.funds || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    const now = /* @__PURE__ */ new Date();
    const zoomMonths = { "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "5Y": 60, "MAX": 9999 };
    const months = zoomMonths[zoom] || 9999;
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    const activeFunds = allFunds.filter((f) => effectiveSelected.has(f.name));
    if (!activeFunds.length) {
      chartState.current = null;
      return;
    }
    const parsed = {};
    const allDatesSet = /* @__PURE__ */ new Set();
    for (const { name } of activeFunds) {
      parsed[name] = (fundData.funds[name] || []).map((p) => ({ date: new Date(p.date), value: p.value })).filter((p) => p.date >= cutoff);
      parsed[name].forEach((p) => allDatesSet.add(p.date.getTime()));
    }
    const allDates = [...allDatesSet].sort((a, b) => a - b);
    if (!allDates.length) {
      chartState.current = null;
      return;
    }
    let parsedInvested = null;
    if (singleFund && fundData.invested_per_fund?.[singleFund]) {
      parsedInvested = fundData.invested_per_fund[singleFund].map((p) => ({ date: new Date(p.date), invested: p.invested })).filter((p) => p.date >= cutoff);
    }
    const stacked = allDates.map((ts) => {
      let cumulative = 0;
      const layers = activeFunds.map(({ name }) => {
        const pt = parsed[name].find((p) => p.date.getTime() === ts);
        const val = pt ? pt.value : 0;
        const layer = { bottom: cumulative, top: cumulative + val, name, value: val };
        cumulative += val;
        return layer;
      });
      let invested = null;
      if (parsedInvested) {
        const ip = parsedInvested.find((p) => p.date.getTime() === ts);
        invested = ip ? ip.invested : null;
      }
      return { date: ts, layers, total: cumulative, invested };
    });
    let maxVal = Math.max(...stacked.map((s) => s.total), 1);
    if (singleFund && parsedInvested) {
      const maxInv = Math.max(...stacked.map((s) => s.invested || 0));
      maxVal = Math.max(maxVal, maxInv);
    }
    const pad = { top: 20, right: 20, bottom: 30, left: 68 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const xScale = (i) => pad.left + i / Math.max(allDates.length - 1, 1) * plotW;
    const yScale = (v) => pad.top + plotH - v / maxVal * plotH;
    chartState.current = { stacked, allDates, activeFunds, pad, plotW, plotH, W, H, xScale, yScale, maxVal, parsedInvested };
    for (let li = 0; li < activeFunds.length; li++) {
      const color = colorMap[activeFunds[li].name] || "#888";
      ctx.beginPath();
      ctx.moveTo(xScale(0), yScale(stacked[0].layers[li].bottom));
      for (let i = 0; i < stacked.length; i++) ctx.lineTo(xScale(i), yScale(stacked[i].layers[li].top));
      for (let i = stacked.length - 1; i >= 0; i--) ctx.lineTo(xScale(i), yScale(stacked[i].layers[li].bottom));
      ctx.closePath();
      ctx.fillStyle = color + "55";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    if (singleFund && parsedInvested) {
      ctx.beginPath();
      ctx.setLineDash([6, 3]);
      let started = false;
      for (let i = 0; i < stacked.length; i++) {
        const inv = stacked[i].invested;
        if (inv != null && inv > 0) {
          const x = xScale(i), y = yScale(inv);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.strokeStyle = "#ff9800";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px Inter,sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = maxVal * i / 4;
      const y = yScale(val);
      ctx.fillText("\u20AC" + Math.round(val).toLocaleString("es-ES"), pad.left - 8, y + 3);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(allDates.length / 6));
    for (let i = 0; i < allDates.length; i += step) {
      const d = new Date(allDates[i]);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }), xScale(i), H - 8);
    }
  }, [fundData, zoom, effectiveSelected, colorMap, allFunds, singleFund]);
  const handleMouseMove = useCallback((e) => {
    const cs = chartState.current;
    const tooltip = tooltipRef.current;
    if (!cs || !tooltip || !canvasRef.current) {
      if (tooltip) tooltip.style.display = "none";
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < cs.pad.left || mx > cs.W - cs.pad.right || my < cs.pad.top || my > cs.H - cs.pad.bottom) {
      tooltip.style.display = "none";
      return;
    }
    const ratio = (mx - cs.pad.left) / cs.plotW;
    const idx = Math.min(Math.max(0, Math.round(ratio * (cs.allDates.length - 1))), cs.allDates.length - 1);
    const snap = cs.stacked[idx];
    if (!snap) {
      tooltip.style.display = "none";
      return;
    }
    const date = new Date(snap.date);
    const dateStr = date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
    let html = `<div style="font-weight:600;margin-bottom:4px;font-size:0.78rem">${dateStr}</div>`;
    for (let li = snap.layers.length - 1; li >= 0; li--) {
      const l = snap.layers[li];
      const c = colorMap[l.name] || "#888";
      html += `<div style="display:flex;align-items:center;gap:5px;font-size:0.72rem"><span style="width:8px;height:8px;border-radius:2px;background:${c};display:inline-block;flex-shrink:0"></span><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${l.name}</span><span style="font-weight:500">\u20AC${Math.round(l.value).toLocaleString("es-ES")}</span></div>`;
    }
    if (singleFund && snap.invested != null) {
      html += `<div style="display:flex;align-items:center;gap:5px;font-size:0.72rem;margin-top:3px;border-top:1px solid rgba(255,255,255,0.1);padding-top:3px"><span style="width:8px;height:2px;background:#ff9800;display:inline-block;flex-shrink:0"></span><span>Invertido</span><span style="font-weight:500">\u20AC${Math.round(snap.invested).toLocaleString("es-ES")}</span></div>`;
    }
    html += `<div style="margin-top:3px;border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;font-size:0.72rem;font-weight:600">Total: \u20AC${Math.round(snap.total).toLocaleString("es-ES")}</div>`;
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    const tw = tooltip.offsetWidth;
    let left = mx + 14;
    if (left + tw > rect.width - 4) left = mx - tw - 14;
    tooltip.style.left = left + "px";
    tooltip.style.top = Math.max(0, my - 20) + "px";
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
  }, [colorMap, singleFund]);
  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  }, []);
  if (loading) return /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.25rem", marginTop: "1.5rem", textAlign: "center" } }, "Cargando evoluci\xF3n por fondo...");
  if (!fundData?.funds || allFunds.length === 0) return null;
  const selStyle = { padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.78rem" };
  return /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.25rem", marginTop: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "8px" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: 0, fontWeight: 600, fontSize: "0.95rem" } }, "\u{1F4CA} Evoluci\xF3n Real por Fondo"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("select", { value: singleFund, onChange: (e) => {
    setSingleFund(e.target.value);
    setSelectedFunds(null);
  }, style: selStyle }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u{1F4CA} Vista apilada"), allFunds.map((f) => /* @__PURE__ */ React.createElement("option", { key: f.name, value: f.name }, f.name.length > 35 ? f.name.slice(0, 33) + "\u2026" : f.name))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "3px" } }, ["3M", "6M", "1Y", "2Y", "5Y", "MAX"].map((p) => /* @__PURE__ */ React.createElement("button", { key: p, onClick: () => setZoom(p), style: { padding: "3px 7px", fontSize: "0.7rem", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.15)", background: zoom === p ? "rgba(255,215,0,0.2)" : "transparent", color: zoom === p ? "#FFD700" : "var(--text-secondary)", cursor: "pointer" } }, p))))), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("canvas", { ref: canvasRef, style: { width: "100%", height: "230px", display: "block" }, onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave }), /* @__PURE__ */ React.createElement("div", { ref: tooltipRef, style: { display: "none", position: "absolute", top: 0, left: 0, background: "rgba(20,20,30,0.94)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 10px", pointerEvents: "none", zIndex: 10, minWidth: "140px", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" } })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: "10px" } }, allFunds.map(({ name, lastVal }) => {
    const color = colorMap[name];
    const isOn = effectiveSelected.has(name);
    return /* @__PURE__ */ React.createElement(
      "span",
      {
        key: name,
        onClick: () => toggleFund(name),
        title: `\u20AC${Math.round(lastVal).toLocaleString("es-ES")}`,
        style: { fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", opacity: isOn ? 1 : 0.35, padding: "2px 6px 2px 0", userSelect: "none" }
      },
      /* @__PURE__ */ React.createElement("span", { style: { width: "11px", height: "11px", borderRadius: "2px", flexShrink: 0, background: isOn ? color : "transparent", border: `2px solid ${color}`, display: "inline-block", transition: "background 0.15s" } }),
      name
    );
  }), singleFund && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "5px", color: "#ff9800" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "14px", height: "2px", background: "#ff9800", display: "inline-block", borderTop: "1px dashed #ff9800" } }), "Dinero Invertido"), selectedFunds && !singleFund && /* @__PURE__ */ React.createElement("span", { onClick: () => setSelectedFunds(null), style: { fontSize: "0.7rem", color: "var(--text-secondary)", cursor: "pointer", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.1)" } }, "Todos")));
};
const OrdersSummaryChart = () => {
  const [ordersData, setOrdersData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("monthly");
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);
  const chartState = useRef(null);
  useEffect(() => {
    fetch("/api/portfolio/orders-summary").then((r) => r.json()).then((d) => {
      setOrdersData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!ordersData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    const entries = viewMode === "monthly" ? Object.entries(ordersData.monthly || {}).sort((a, b) => a[0].localeCompare(b[0])) : Object.entries(ordersData.yearly || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    if (entries.length === 0) {
      chartState.current = null;
      return;
    }
    const values = entries.map((e) => e[1]);
    const maxVal = Math.max(...values, 1);
    const pad = { top: 20, right: 20, bottom: 40, left: 60 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const barW = Math.min(40, plotW / entries.length * 0.7);
    const gap = (plotW - barW * entries.length) / (entries.length + 1);
    const bars = [];
    entries.forEach(([label, val], i) => {
      const x = pad.left + gap + i * (barW + gap);
      const barH = val / maxVal * plotH;
      const y = pad.top + plotH - barH;
      bars.push({ x, y, w: barW, h: barH, label, val });
      const grad = ctx.createLinearGradient(x, y, x, y + barH);
      grad.addColorStop(0, "#4fc3f7");
      grad.addColorStop(1, "#1976d2");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "9px Inter, sans-serif";
      ctx.textAlign = "center";
      const displayLabel = viewMode === "monthly" ? label.slice(2) : label;
      ctx.fillText(displayLabel, x + barW / 2, H - 8);
    });
    ctx.textAlign = "right";
    ctx.font = "10px Inter, sans-serif";
    for (let i = 0; i <= 4; i++) {
      const val = maxVal * i / 4;
      const y = pad.top + plotH - val / maxVal * plotH;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("\u20AC" + Math.round(val).toLocaleString("es-ES"), pad.left - 8, y + 3);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
    }
    chartState.current = { bars, W, H };
  }, [ordersData, viewMode]);
  const handleMouseMove = useCallback((e) => {
    const cs = chartState.current;
    const tooltip = tooltipRef.current;
    if (!cs || !tooltip || !canvasRef.current) {
      if (tooltip) tooltip.style.display = "none";
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const bar = cs.bars.find((b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
    if (!bar) {
      tooltip.style.display = "none";
      return;
    }
    const period = viewMode === "monthly" ? bar.label : `A\xF1o ${bar.label}`;
    tooltip.innerHTML = `<div style="font-weight:600;font-size:0.78rem;margin-bottom:2px">${period}</div><div style="font-size:0.75rem">Invertido: <span style="font-weight:600;color:#4fc3f7">\u20AC${Math.round(bar.val).toLocaleString("es-ES")}</span></div>`;
    tooltip.style.display = "block";
    let left = mx + 14;
    const tw = tooltip.offsetWidth;
    if (left + tw > rect.width - 4) left = mx - tw - 14;
    tooltip.style.left = left + "px";
    tooltip.style.top = Math.max(0, my - 30) + "px";
  }, [viewMode]);
  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  }, []);
  if (loading) return /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.25rem", marginTop: "1.5rem", textAlign: "center" } }, "Cargando resumen de \xF3rdenes...");
  if (!ordersData) return null;
  const total = Object.values(ordersData.yearly || {}).reduce((s, v) => s + v, 0);
  return /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.25rem", marginTop: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: 0, fontWeight: 600, fontSize: "0.95rem" } }, "\u{1F4B0} Resumen de Inversiones ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", fontWeight: 400, color: "var(--text-secondary)" } }, "Total: \u20AC", Math.round(total).toLocaleString("es-ES"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "4px" } }, ["monthly", "yearly"].map((m) => /* @__PURE__ */ React.createElement("button", { key: m, onClick: () => setViewMode(m), style: { padding: "3px 8px", fontSize: "0.7rem", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.15)", background: viewMode === m ? "rgba(79,195,247,0.2)" : "transparent", color: viewMode === m ? "#4fc3f7" : "var(--text-secondary)", cursor: "pointer", textTransform: "capitalize" } }, m === "monthly" ? "Mensual" : "Anual")))), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("canvas", { ref: canvasRef, style: { width: "100%", height: "180px", display: "block" }, onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave }), /* @__PURE__ */ React.createElement("div", { ref: tooltipRef, style: { display: "none", position: "absolute", top: 0, left: 0, background: "rgba(20,20,30,0.94)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 10px", pointerEvents: "none", zIndex: 10, minWidth: "120px", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" } })));
};
const MonthComparisonWidget = ({ realEvolution }) => {
  const monthly = realEvolution?.monthly || [];
  const monthlyPerFund = realEvolution?.monthly_per_fund || {};
  const [monthA, setMonthA] = useState("");
  const [monthB, setMonthB] = useState("");
  const [showPerFund, setShowPerFund] = useState(false);
  useEffect(() => {
    if (monthly.length >= 2 && !monthA) {
      setMonthA(monthly[monthly.length - 1].date || "");
      setMonthB(monthly[monthly.length - 2].date || "");
    }
  }, [monthly.length]);
  if (!monthly.length) return null;
  const getM = (key) => monthly.find((m) => m.date === key) || null;
  const mA = getM(monthA);
  const mB = getM(monthB);
  const euros = (v) => v != null ? `\u20AC${Number(v).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "\u2014";
  const fmtPct = (v) => v != null ? `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%` : "\u2014";
  const col = (v) => v > 0 ? "var(--success)" : v < 0 ? "var(--danger)" : "var(--text-primary)";
  const rows = [
    { label: "\u{1F4B0} Patrimonio", vA: mA?.value, vB: mB?.value },
    { label: "\u{1F4E5} Capital Invertido", vA: mA?.invested, vB: mB?.invested },
    { label: "\u{1F4C8} Ganancia (\u20AC)", vA: mA?.gain, vB: mB?.gain },
    { label: "\u{1F4CA} Ganancia (%)", vA: mA?.gain_pct, vB: mB?.gain_pct, isPct: true }
  ];
  const fundNames = Object.keys(monthlyPerFund).sort();
  const getFundM = (fundName, dateKey) => {
    const arr = monthlyPerFund[fundName] || [];
    return arr.find((m) => m.date === dateKey) || null;
  };
  const selStyle = { padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.82rem", marginLeft: "6px" };
  const thStyle = { textAlign: "left", padding: "7px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" };
  const thRightStyle = { ...thStyle, textAlign: "right" };
  const renderComparisonTable = (tableRows, title) => /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto", marginBottom: title ? "0.8rem" : 0 } }, title && /* @__PURE__ */ React.createElement("h5", { style: { margin: "0.8rem 0 0.4rem", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-secondary)" } }, title), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "2px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: thStyle }, "Concepto"), mA && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, color: "#4AA2AF", fontWeight: 700 } }, mA.label), mB && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, color: "#a78bfa", fontWeight: 700 } }, mB.label), mA && mB && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, fontWeight: 600 } }, "\u0394 (A\u2212B)"), mA && mB && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, fontWeight: 600 } }, "%\u0394"))), /* @__PURE__ */ React.createElement("tbody", null, tableRows.map((row) => {
    const vA = row.vA, vB = row.vB;
    const delta = vA != null && vB != null ? vA - vB : null;
    const pctDelta = delta != null && vB != null && Math.abs(vB) > 0.01 ? delta / Math.abs(vB) * 100 : null;
    return /* @__PURE__ */ React.createElement("tr", { key: row.label, style: { borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", fontWeight: 600 } }, row.label), mA && /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: vA != null && row.isPct ? col(vA) : void 0 } }, row.isPct ? fmtPct(vA) : euros(vA)), mB && /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: vB != null && row.isPct ? col(vB) : void 0 } }, row.isPct ? fmtPct(vB) : euros(vB)), mA && mB && /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", fontWeight: 700, color: delta != null ? col(delta) : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, delta != null ? `${delta >= 0 ? "+" : ""}${row.isPct ? fmtPct(delta) : euros(delta)}` : "\u2014"), mA && mB && /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", fontWeight: 600, color: pctDelta != null ? col(pctDelta) : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, pctDelta != null ? fmtPct(pctDelta) : "\u2014"));
  }))));
  return /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.25rem", marginTop: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 0.9rem", fontWeight: 600, fontSize: "0.95rem" } }, "\u{1F4C5} Comparativa entre Meses"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Mes A:", /* @__PURE__ */ React.createElement("select", { value: monthA, onChange: (e) => setMonthA(e.target.value), style: selStyle }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 elegir \u2014"), [...monthly].reverse().map((m) => /* @__PURE__ */ React.createElement("option", { key: m.date, value: m.date }, m.label)))), /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Mes B:", /* @__PURE__ */ React.createElement("select", { value: monthB, onChange: (e) => setMonthB(e.target.value), style: selStyle }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 elegir \u2014"), [...monthly].reverse().map((m) => /* @__PURE__ */ React.createElement("option", { key: m.date, value: m.date }, m.label)))), fundNames.length > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => setShowPerFund(!showPerFund), style: {
    padding: "5px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-glass)",
    background: showPerFund ? "var(--accent-primary)" : "var(--bg-glass)",
    color: "white",
    fontSize: "0.78rem",
    cursor: "pointer",
    marginLeft: "auto"
  } }, showPerFund ? "\u{1F4CA} Ocultar fondos" : "\u{1F4CA} Ver por fondo")), (mA || mB) && renderComparisonTable(rows, "\u{1F4CA} Total Cartera"), showPerFund && (mA || mB) && fundNames.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "1rem" } }, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 0.7rem", fontWeight: 600, fontSize: "0.88rem" } }, "\u{1F4CB} Desglose por Fondo"), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "2px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: thStyle }, "Fondo"), mA && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, color: "#4AA2AF", fontWeight: 600 } }, "Valor A"), mB && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, color: "#a78bfa", fontWeight: 600 } }, "Valor B"), mA && mB && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, fontWeight: 600 } }, "\u0394 (\u20AC)"), mA && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, color: "#4AA2AF", fontWeight: 600 } }, "Inv A"), mB && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, color: "#a78bfa", fontWeight: 600 } }, "Inv B"), mA && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, color: "#4AA2AF", fontWeight: 600 } }, "Rent A"), mB && /* @__PURE__ */ React.createElement("th", { style: { ...thRightStyle, color: "#a78bfa", fontWeight: 600 } }, "Rent B"))), /* @__PURE__ */ React.createElement("tbody", null, fundNames.map((name) => {
    const fA = getFundM(name, monthA);
    const fB = getFundM(name, monthB);
    const vA = fA?.value || 0, vB = fB?.value || 0;
    const iA = fA?.invested || 0, iB = fB?.invested || 0;
    const gA = fA?.gain_pct, gB = fB?.gain_pct;
    const deltaV = vA - vB;
    if (vA === 0 && vB === 0) return null;
    return /* @__PURE__ */ React.createElement("tr", { key: name, style: { borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", fontWeight: 500, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: name }, name.length > 28 ? name.slice(0, 26) + "\u2026" : name), mA && /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, euros(vA)), mB && /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, euros(vB)), mA && mB && /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "right", fontWeight: 700, color: col(deltaV), fontVariantNumeric: "tabular-nums" } }, `${deltaV >= 0 ? "+" : ""}${euros(deltaV)}`), mA && /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" } }, euros(iA)), mB && /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" } }, euros(iB)), mA && /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: gA != null ? col(gA) : void 0 } }, fmtPct(gA)), mB && /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: gB != null ? col(gB) : void 0 } }, fmtPct(gB)));
  }))))));
};
const GeneralTab = ({ data, chartData, reloadData }) => {
  const [newFund, setNewFund] = useState({ Fondo: "", ISIN: "", TIPO: "INDEX", Porcentaje: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [lastDate, setLastDate] = useState(null);
  const [showMonthly, setShowMonthly] = useState(false);
  useEffect(() => {
    fetch("/api/portfolio/last_update").then((r) => r.json()).then((d) => setLastDate(d.last_date || null)).catch(() => {
    });
  }, []);
  const realEvolution = data.real_evolution || null;
  const realEvoLoading = false;
  const totalValor = data.funds.reduce((s, f) => s + (f.Valor_Actual || 0), 0);
  const totalInv = data.funds.reduce((s, f) => s + (f.Capital_Invertido || 0), 0);
  const totalGanAbs = totalValor - totalInv;
  const totalGanPct = totalInv > 0 ? totalGanAbs / totalInv * 100 : 0;
  const gainColor = totalGanAbs >= 0 ? "var(--success)" : "var(--danger)";
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
  return /* @__PURE__ */ React.createElement("div", { className: "main-content", style: { gridTemplateColumns: "1fr" } }, (() => {
    const kpis = [
      { label: "Patrimonio", value: `\u20AC${totalValor.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, color: "var(--accent-glow)" },
      { label: "Capital Invertido", value: `\u20AC${totalInv.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, color: "var(--text-primary)" },
      { label: "Ganancia (\u20AC)", value: `${totalGanAbs >= 0 ? "+" : ""}\u20AC${Math.abs(totalGanAbs).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, color: gainColor },
      { label: "Ganancia (%)", value: `${totalGanPct >= 0 ? "+" : ""}${totalGanPct.toFixed(2)}%`, color: gainColor }
    ];
    return /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: `repeat(${kpis.length},1fr)`, gap: "0.75rem", marginBottom: "1.5rem" } }, kpis.map((kpi) => /* @__PURE__ */ React.createElement("div", { key: kpi.label, className: "glass-panel", style: { padding: "0.9rem 1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" } }, kpi.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.25rem", fontWeight: 700, color: kpi.color, fontVariantNumeric: "tabular-nums" } }, kpi.value))));
  })(), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 0.75rem", fontWeight: 600, fontSize: "0.9rem" } }, "Asset Allocation"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: "24px", borderRadius: "6px", overflow: "hidden", width: "100%", marginBottom: "0.75rem" } }, chartData.map((entry, index) => /* @__PURE__ */ React.createElement("div", { key: entry.name, title: `${entry.name}: ${entry.value.toFixed(1)}%`, style: {
    width: `${entry.value / Object.values(data.summary.details).reduce((a, b) => a + b, 0) * 100}%`,
    backgroundColor: COLORS[index % COLORS.length]
  } }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.6rem" } }, chartData.map((entry, index) => /* @__PURE__ */ React.createElement("div", { key: entry.name, style: { display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "10px", height: "10px", borderRadius: "3px", backgroundColor: COLORS[index % COLORS.length] } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, entry.name, " ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-primary)" } }, entry.value.toFixed(1), "%")))))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 0.75rem", fontWeight: 600, fontSize: "0.9rem" } }, "Gesti\xF3n"), (() => {
    const ti = data.summary.total_indexed || 0;
    const ta = data.summary.total_active || 0;
    const total = ti + ta || 1;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: "24px", borderRadius: "6px", overflow: "hidden", width: "100%", marginBottom: "0.75rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${ti / total * 100}%`, background: "#00d4aa", transition: "width 0.3s" }, title: `Indexado: ${ti.toFixed(1)}%` }), /* @__PURE__ */ React.createElement("div", { style: { width: `${ta / total * 100}%`, background: "#8b5cf6", transition: "width 0.3s" }, title: `Activo: ${ta.toFixed(1)}%` })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "1.5rem", fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "0.4rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "10px", height: "10px", borderRadius: "3px", background: "#00d4aa" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Indexado ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#00d4aa" } }, ti.toFixed(1), "%"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "0.4rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "10px", height: "10px", borderRadius: "3px", background: "#8b5cf6" } }), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Activo ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#8b5cf6" } }, ta.toFixed(1), "%")))));
  })())), /* @__PURE__ */ React.createElement("div", { className: "glass-panel fund-table-container" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { fontWeight: 600, margin: 0 } }, "Mi Cartera Base"), lastDate && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "3px" } }, "Datos a: ", /* @__PURE__ */ React.createElement("strong", null, lastDate)))), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", minWidth: "600px" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Fondo / Activo"), /* @__PURE__ */ React.createElement("th", null, "Tipo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Peso"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Valor Actual (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Invertido (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Ganancia (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Ganancia (%)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "NAV"), /* @__PURE__ */ React.createElement("th", null, "Rating"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, (() => {
    const totalValor2 = data.funds.reduce((s, f) => s + (f.Valor_Actual || 0), 0);
    const totalInv2 = data.funds.reduce((s, f) => s + (f.Capital_Invertido || 0), 0);
    const totalGanAbs2 = data.funds.reduce((s, f) => s + (f.Ganancia_Abs || 0), 0);
    const totalGanPct2 = totalInv2 > 0 ? totalGanAbs2 / totalInv2 * 100 : 0;
    const posColor = totalGanAbs2 >= 0 ? "var(--success)" : "var(--danger)";
    return /* @__PURE__ */ React.createElement("tr", { style: { background: "rgba(74,162,175,0.08)", borderBottom: "2px solid rgba(74,162,175,0.3)", fontWeight: 700 } }, /* @__PURE__ */ React.createElement("td", { style: { fontWeight: 700, color: "var(--accent-glow)" } }, "\u{1F4CA} TOTAL CARTERA"), /* @__PURE__ */ React.createElement("td", null), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--accent-glow)" } }, "100%"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } }, "\u20AC", totalValor2.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, "\u20AC", totalInv2.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: posColor, fontVariantNumeric: "tabular-nums" } }, totalGanAbs2 >= 0 ? "+" : "", "\u20AC", Math.abs(totalGanAbs2).toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: posColor, fontVariantNumeric: "tabular-nums" } }, totalGanPct2 >= 0 ? "+" : "", totalGanPct2.toFixed(1), "%"), /* @__PURE__ */ React.createElement("td", null), /* @__PURE__ */ React.createElement("td", null), /* @__PURE__ */ React.createElement("td", null));
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
  })))), /* @__PURE__ */ React.createElement("form", { onSubmit: handleAdd, style: { marginTop: "2rem", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px dashed var(--border-glass)" } }, /* @__PURE__ */ React.createElement("input", { required: true, placeholder: "Nombre (ej. SP500)", value: newFund.Fondo, onChange: (e) => setNewFund({ ...newFund, Fondo: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", flex: 1 } }), /* @__PURE__ */ React.createElement("input", { placeholder: "ISIN (Opcional)", value: newFund.ISIN, onChange: (e) => setNewFund({ ...newFund, ISIN: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", flex: 1 } }), /* @__PURE__ */ React.createElement("select", { value: newFund.TIPO, onChange: (e) => setNewFund({ ...newFund, TIPO: e.target.value }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white" } }, /* @__PURE__ */ React.createElement("option", { value: "INDEX" }, "INDEX"), /* @__PURE__ */ React.createElement("option", { value: "VALUE" }, "VALUE"), /* @__PURE__ */ React.createElement("option", { value: "SPECIALIZED" }, "SPECIALIZED"), /* @__PURE__ */ React.createElement("option", { value: "RF" }, "RENTA FIJA"), /* @__PURE__ */ React.createElement("option", { value: "ORO" }, "ORO"), /* @__PURE__ */ React.createElement("option", { value: "CRYPTO" }, "CRYPTO"), /* @__PURE__ */ React.createElement("option", { value: "CASH" }, "LIQUIDEZ")), /* @__PURE__ */ React.createElement("input", { required: true, max: "100", min: "0", step: "0.01", type: "number", placeholder: "% Peso", value: newFund.Porcentaje, onChange: (e) => setNewFund({ ...newFund, Porcentaje: Number(e.target.value) }), style: { padding: "8px", borderRadius: "4px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", width: "80px" } }), /* @__PURE__ */ React.createElement("button", { disabled: isSaving, type: "submit", style: { padding: "8px 15px", background: "var(--accent-glow)", color: "black", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" } }, isSaving ? "..." : "+ A\xF1adir"))), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.25rem", marginTop: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { margin: 0, fontWeight: 600, fontSize: "0.95rem" } }, "\u{1F4C8} Evoluci\xF3n Real del Patrimonio"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" } }, "Basada en \xF3rdenes reales \u2014 NO en pesos objetivo")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setShowMonthly(false), style: { padding: "5px 14px", borderRadius: "16px", fontSize: "0.75rem", fontWeight: 600, border: !showMonthly ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)", background: !showMonthly ? "var(--accent-glow)" : "transparent", color: !showMonthly ? "#000" : "var(--text-primary)", cursor: "pointer" } }, "\u{1F4C9} Gr\xE1fico"), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowMonthly(true), style: { padding: "5px 14px", borderRadius: "16px", fontSize: "0.75rem", fontWeight: 600, border: showMonthly ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)", background: showMonthly ? "var(--accent-glow)" : "transparent", color: showMonthly ? "#000" : "var(--text-primary)", cursor: "pointer" } }, "\u{1F4C5} Mensuales"))), realEvoLoading ? /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.85rem", padding: "1.5rem 0", textAlign: "center" } }, "\u23F3 Calculando evoluci\xF3n real...") : !realEvolution || realEvolution.series?.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.85rem", padding: "1rem", textAlign: "center" } }, 'Sin datos de evoluci\xF3n. Pulsa "Recalcular Cotizaciones".') : !showMonthly ? /* @__PURE__ */ React.createElement(PortfolioValueChart, { series: realEvolution.series }) : /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto", maxHeight: "400px", overflowY: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" } }, /* @__PURE__ */ React.createElement("thead", { style: { position: "sticky", top: 0, background: "var(--bg-glass)" } }, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "2px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "8px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" } }, "Mes"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" } }, "Patrimonio"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" } }, "Invertido"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" } }, "Ganancia (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" } }, "Ganancia (%)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" } }, "MoM (%)"))), /* @__PURE__ */ React.createElement("tbody", null, [...realEvolution.monthly || []].reverse().map((m, i) => {
    const gainColor2 = m.gain >= 0 ? "var(--success)" : "var(--danger)";
    const momColor = m.mom == null ? "var(--text-secondary)" : m.mom >= 0 ? "var(--success)" : "var(--danger)";
    return /* @__PURE__ */ React.createElement("tr", { key: i, style: { borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", fontWeight: 600 } }, m.label), /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 } }, "\u20AC", m.value.toLocaleString("es-ES", { minimumFractionDigits: 0 })), /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, "\u20AC", m.invested.toLocaleString("es-ES", { minimumFractionDigits: 0 })), /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", fontWeight: 700, color: gainColor2, fontVariantNumeric: "tabular-nums" } }, m.gain >= 0 ? "+" : "", "\u20AC", Math.abs(m.gain).toLocaleString("es-ES", { minimumFractionDigits: 0 })), /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", fontWeight: 700, color: gainColor2, fontVariantNumeric: "tabular-nums" } }, m.gain_pct >= 0 ? "+" : "", m.gain_pct.toFixed(1), "%"), /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "right", color: momColor, fontVariantNumeric: "tabular-nums" } }, m.mom != null ? `${m.mom >= 0 ? "+" : ""}${m.mom.toFixed(1)}%` : "\u2014"));
  }))))), /* @__PURE__ */ React.createElement(PerFundEvolutionChart, { evolutionData: data.real_evolution }), /* @__PURE__ */ React.createElement(OrdersSummaryChart, null), /* @__PURE__ */ React.createElement(MonthComparisonWidget, { realEvolution: data.real_evolution }), data.recommendation.cash_warn && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "1rem" } }, /* @__PURE__ */ React.createElement(AdviceCard, { advice: data.recommendation.cash_warn, type: "warning" })));
};
const DetailsTab = ({ onRefreshDetails, refreshingDetails, refreshStep, refreshElapsed, refreshDetailsKey }) => {
  const [details, setDetails] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFundKey, setSelectedFundKey] = useState(null);
  const [comparisonFundKey, setComparisonFundKey] = useState(null);
  const [benchmarkFundKey, setBenchmarkFundKey] = useState(null);
  const [fundDetail, setFundDetail] = useState(null);
  const [fundDetailLoading, setFundDetailLoading] = useState(false);
  const [portfolioHoldings, setPortfolioHoldings] = useState(null);
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/portfolio/details").then((r) => r.json()),
      fetch("/api/portfolio/benchmark/msci-world").then((r) => r.json()).catch(() => null),
      fetch("/api/portfolio/portfolio-holdings").then((r) => r.json()).catch(() => null)
    ]).then(([d, b, ph]) => {
      setDetails(d);
      setBenchmark(b);
      setPortfolioHoldings(ph);
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
  const renderComparisonBars = (dataList, benchmarkData, benchmarkLabel) => {
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
    const bmLabel = benchmarkLabel || (benchmarkFundKey ? benchmarkFundKey.substring(0, 18) : "Benchmark");
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } }, merged.map((item, idx) => {
      const diff = item.myValue - item.msciValue;
      const hasBenchmark = benchmarkData && item.msciValue > 0;
      return /* @__PURE__ */ React.createElement("div", { key: item.name, style: { fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "4px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", null, item.name), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--accent-glow)" } }, item.myValue.toFixed(1), "%"), hasBenchmark && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.75rem" } }, bmLabel, ": ", item.msciValue.toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", fontWeight: 700, color: diff > 1 ? "var(--success)" : diff < -1 ? "var(--danger)" : "var(--text-secondary)" } }, diff >= 0 ? "+" : "", diff.toFixed(1), "%")))), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: "100%", height: hasBenchmark ? "14px" : "8px", background: "var(--border-glass)", borderRadius: "4px", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { height: hasBenchmark ? "7px" : "8px", width: `${item.myValue / maxVal * 100}%`, background: "var(--accent-glow)", borderRadius: "4px 4px 0 0", transition: "width 0.3s" } }), hasBenchmark && /* @__PURE__ */ React.createElement("div", { style: { height: "7px", width: `${item.msciValue / maxVal * 100}%`, background: "rgba(255,215,0,0.5)", borderRadius: "0 0 4px 4px", transition: "width 0.3s" } })));
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
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px", flex: 1, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px", flex: "1 1 300px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" } }, "Ver fondo:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedFundKey || "",
      onChange: (e) => {
        setSelectedFundKey(e.target.value || null);
        setFundDetail(null);
        setComparisonFundKey(null);
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
  )), selectedFundKey && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", flex: "0 1 300px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" } }, "Comparar con:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: comparisonFundKey || "",
      onChange: (e) => setComparisonFundKey(e.target.value || null),
      style: { padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(167,139,250,0.4)", background: "var(--bg-glass)", color: "white", fontSize: "0.85rem", flex: 1, cursor: "pointer" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 ninguno \u2014"),
    fundKeys.filter((k) => k !== selectedFundKey).map((k) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, k, details[k]?.isin ? ` (${details[k].isin})` : ""))
  ))), /* @__PURE__ */ React.createElement("button", { onClick: onRefreshDetails, disabled: refreshingDetails, style: {
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
  } })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "6px" } }, "Los datos de Finect pueden tardar 1\u20133 minutos. Los resultados se mostrar\xE1n autom\xE1ticamente al finalizar.")), selectedFundKey && selectedFund && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "8px" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, fontWeight: 600 } }, "\u{1F4CB} ", selectedFundKey, selectedFund.isin && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "10px", fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400 } }, selectedFund.isin), comparisonFundKey && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "14px", fontSize: "0.8rem", color: "#a78bfa", fontWeight: 500 } }, "vs ", comparisonFundKey.substring(0, 25))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, /* @__PURE__ */ React.createElement(
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
  )), fundDetail.holdings && fundDetail.holdings.length > 0 ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, fundDetail.holdings.map((h, i) => {
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
  ))), comparisonFundKey && (() => {
    const compFund = details[comparisonFundKey];
    if (!compFund) return null;
    const renderCmpTable = (titleA, titleB, dataA, dataB) => {
      const allKeys = /* @__PURE__ */ new Set([...Object.keys(dataA), ...Object.keys(dataB)]);
      const rows = Array.from(allKeys).map((k) => ({
        name: k,
        a: parseFloat(dataA[k] || 0),
        b: parseFloat(dataB[k] || 0)
      })).filter((r) => r.a > 0.5 || r.b > 0.5).sort((x, y) => y.a + y.b - (x.a + x.b));
      if (!rows.length) return /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.8rem" } }, "Sin datos");
      return /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "1px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "5px 8px", color: "var(--text-secondary)", fontWeight: 600 } }, "Concepto"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "5px 8px", color: "var(--accent-glow)", fontWeight: 700 } }, titleA), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "5px 8px", color: "#a78bfa", fontWeight: 700 } }, titleB), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "5px 8px", color: "var(--text-secondary)", fontWeight: 600 } }, "\u0394 (A\u2212B)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "5px 8px", color: "var(--text-secondary)", fontWeight: 600 } }, "%\u0394"))), /* @__PURE__ */ React.createElement("tbody", null, rows.map((r, i) => {
        const delta = r.a - r.b;
        const pctDelta = r.b > 0.01 ? delta / r.b * 100 : null;
        return /* @__PURE__ */ React.createElement("tr", { key: i, style: { borderBottom: "1px solid rgba(255,255,255,0.04)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 8px", color: "var(--text-secondary)" } }, r.name), /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "var(--accent-glow)", fontVariantNumeric: "tabular-nums" } }, r.a > 0 ? `${r.a.toFixed(1)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#a78bfa", fontVariantNumeric: "tabular-nums" } }, r.b > 0 ? `${r.b.toFixed(1)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 8px", textAlign: "right", fontWeight: 600, color: Math.abs(delta) < 1 ? "var(--text-secondary)" : delta > 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, delta >= 0 ? "+" : "", delta.toFixed(1), "pp"), /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 8px", textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: pctDelta == null ? "var(--text-secondary)" : pctDelta > 0 ? "var(--success)" : pctDelta < 0 ? "var(--danger)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, pctDelta != null ? `${pctDelta >= 0 ? "+" : ""}${pctDelta.toFixed(0)}%` : "\u2014"));
      })));
    };
    const nameA = selectedFundKey.substring(0, 20);
    const nameB = comparisonFundKey.substring(0, 20);
    return /* @__PURE__ */ React.createElement("div", { style: { marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.08)" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600, fontSize: "0.9rem" } }, "\u{1F500} Comparativa: ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--accent-glow)" } }, nameA), " vs ", /* @__PURE__ */ React.createElement("span", { style: { color: "#a78bfa" } }, nameB)), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h5", { style: { marginBottom: "0.5rem", fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Sectores"), renderCmpTable(nameA, nameB, selectedFund.sector || {}, compFund.sector || {})), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h5", { style: { marginBottom: "0.5rem", fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Geograf\xEDa"), renderCmpTable(nameA, nameB, selectedFund.region || {}, compFund.region || {}))));
  })()), !selectedFundKey && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "16px", marginBottom: "1rem", padding: "8px 14px", background: "rgba(255,215,0,0.06)", borderRadius: "8px", border: "1px solid rgba(255,215,0,0.15)", alignItems: "center", fontSize: "0.8rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "12px", height: "6px", background: "var(--accent-glow)", borderRadius: "2px", display: "inline-block" } }), "Mi Cartera"), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "12px", height: "6px", background: "rgba(255,215,0,0.5)", borderRadius: "2px", display: "inline-block" } }), benchmarkFundKey ? benchmarkFundKey.substring(0, 28) : "MSCI World"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", whiteSpace: "nowrap" } }, "Benchmark:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: benchmarkFundKey || "",
      onChange: (e) => setBenchmarkFundKey(e.target.value || null),
      style: { padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,215,0,0.3)", background: "rgba(0,0,0,0.3)", color: "white", fontSize: "0.78rem", cursor: "pointer" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "MSCI World (default)"),
    fundKeys.map((k) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, k.substring(0, 35)))
  )), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.72rem", whiteSpace: "nowrap" } }, "Diferencia: ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--success)" } }, "+sobreponderado"), " / ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--danger)" } }, "-infraponderado"))), !selectedFundKey && (() => {
    let benchSectors = null, benchRegions = null;
    if (benchmarkFundKey && details && details[benchmarkFundKey]) {
      const bf = details[benchmarkFundKey];
      benchSectors = bf.sector ? Object.fromEntries(
        Object.entries(bf.sector).map(([k, v]) => [k, parseFloat(v)])
      ) : null;
      benchRegions = bf.region ? Object.fromEntries(
        Object.entries(bf.region).map(([k, v]) => [k, parseFloat(v)])
      ) : null;
    } else if (benchmark) {
      benchSectors = benchmark.sectors || null;
      benchRegions = benchmark.regions || null;
    }
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" } }, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1.5rem", fontWeight: 600 } }, "\u{1F3AF} Exposici\xF3n Sectorial"), renderComparisonBars(sectors, benchSectors, benchmarkFundKey ? benchmarkFundKey.substring(0, 20) : "MSCI World")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1.5rem", fontWeight: 600 } }, "\u{1F30D} Exposici\xF3n Geogr\xE1fica"), renderComparisonBars(regions, benchRegions, benchmarkFundKey ? benchmarkFundKey.substring(0, 20) : "MSCI World"))), portfolioHoldings && portfolioHoldings.holdings && portfolioHoldings.holdings.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", marginTop: "2rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "10px" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, fontWeight: 600 } }, "\u{1F3E2} Holdings Ponderados de Cartera"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)" } }, portfolioHoldings.funds_with_holdings, "/", portfolioHoldings.total_funds, " fondos con datos \xB7 Cobertura: ", portfolioHoldings.coverage_pct, "%")), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" } }, portfolioHoldings.holdings.map((h, i) => /* @__PURE__ */ React.createElement("div", { key: h.name, style: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", minWidth: "22px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, "#", i + 1), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: "0.83rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: h.name }, h.name)), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", flexShrink: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: "0.88rem", color: "var(--accent-glow)", fontVariantNumeric: "tabular-nums" } }, h.weight.toFixed(2), "%"), /* @__PURE__ */ React.createElement("div", { style: { height: "4px", width: `${Math.min(h.weight * 8, 80)}px`, background: "var(--accent-glow)", borderRadius: "2px", opacity: 0.6, marginTop: "2px", marginLeft: "auto" } })))))));
  })());
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
    else if (timeframe === "MAX") {
      let maxFirst = null;
      (activeFunds || []).forEach((f) => {
        const raw = datasets && datasets[f];
        if (raw && raw.length > 0) {
          const fd = new Date(raw[0].date);
          if (!maxFirst || fd > maxFirst) maxFirst = fd;
        }
      });
      return maxFirst || new Date(1900, 0, 1);
    }
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
const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pctToHeatColor = (v) => {
  if (v == null) return "rgba(128,128,128,0.15)";
  if (Math.abs(v) < 0.05) return "rgba(140,140,140,0.35)";
  if (v > 0) {
    const t = Math.min(v / 25, 1);
    return `hsla(118, ${40 + t * 50}%, ${30 + t * 12}%, 0.88)`;
  } else {
    const t = Math.min(-v / 25, 1);
    return `hsla(4, ${40 + t * 50}%, ${32 + t * 12}%, 0.88)`;
  }
};
const heatCellStyle = (v, isPortfolio) => ({
  padding: "5px 6px",
  textAlign: "center",
  borderRadius: "4px",
  fontSize: "0.73rem",
  fontWeight: isPortfolio ? 800 : 600,
  fontVariantNumeric: "tabular-nums",
  color: v == null ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.93)",
  backgroundColor: pctToHeatColor(v),
  border: isPortfolio ? "1px solid rgba(255,215,0,0.45)" : "1px solid transparent",
  cursor: "default",
  minWidth: "58px",
  whiteSpace: "nowrap"
});
const computeMonthlyReturns = (histData) => {
  if (!histData) return null;
  const result = {};
  const allMonths = /* @__PURE__ */ new Set();
  for (const [name, series] of Object.entries(histData)) {
    if (!Array.isArray(series)) continue;
    const byMonth = {};
    for (const pt of series) {
      const ym = pt.date?.substring(0, 7);
      if (!ym || pt.price == null) continue;
      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(pt);
    }
    const fundMonthly = {};
    for (const [ym, pts] of Object.entries(byMonth)) {
      const sorted = pts.slice().sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0].price, last = sorted[sorted.length - 1].price;
      if (first > 0 && sorted.length >= 2) {
        fundMonthly[ym] = +((last / first - 1) * 100).toFixed(2);
        allMonths.add(ym);
      }
    }
    if (Object.keys(fundMonthly).length) result[name] = fundMonthly;
  }
  return { returns: result, months: [...allMonths].sort() };
};
const AnnualReturnsHeatmap = ({ rawData }) => {
  const [annualData, setAnnualData] = useState(null);
  const [histData, setHistData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("annual");
  const [selectedYear, setSelectedYear] = useState(null);
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");
  const [cmpType, setCmpType] = useState("months");
  const [cmpMetric, setCmpMetric] = useState("pct");
  const [ordersData, setOrdersData] = useState(null);
  const [cmpYearA, setCmpYearA] = useState(null);
  const [cmpYearB, setCmpYearB] = useState(null);
  useEffect(() => {
    fetch("/api/portfolio/annual-returns").then((r) => r.json()).then((d) => {
      setAnnualData(d);
      setLoading(false);
      if (d.years?.length) setSelectedYear(d.years[d.years.length - 1]);
    }).catch(() => setLoading(false));
  }, []);
  useEffect(() => {
    if ((viewMode === "monthly" || viewMode === "compare") && !histData) {
      fetch("/api/portfolio/history_batch").then((r) => r.json()).then((d) => setHistData(d)).catch(() => {
      });
    }
  }, [viewMode, histData]);
  useEffect(() => {
    if (cmpMetric === "eur" && !ordersData) {
      fetch("/api/portfolio/orders-summary").then((r) => r.json()).then((d) => setOrdersData(d)).catch(() => {
      });
    }
  }, [cmpMetric, ordersData]);
  useEffect(() => {
    if (viewMode !== "compare") return;
    if (cmpType === "months") {
      const now = /* @__PURE__ */ new Date();
      const lastCompleteDate = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastYM = `${lastCompleteDate.getFullYear()}-${String(lastCompleteDate.getMonth() + 1).padStart(2, "0")}`;
      const prevYearYM = `${lastCompleteDate.getFullYear() - 1}-${String(lastCompleteDate.getMonth() + 1).padStart(2, "0")}`;
      if (!cmpA) setCmpA(lastYM);
      if (!cmpB) setCmpB(prevYearYM);
    } else if (cmpType === "years") {
      if (!annualData?.years?.length) return;
      const sortedYears = [...annualData.years].sort((a, b) => b - a);
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      const lastCompleteYear = sortedYears.find((y) => y < currentYear);
      const prevYear = lastCompleteYear != null ? sortedYears.find((y) => y < lastCompleteYear) : null;
      if (cmpYearA == null && lastCompleteYear != null) setCmpYearA(lastCompleteYear);
      if (cmpYearB == null && prevYear != null) setCmpYearB(prevYear);
    }
  }, [viewMode, cmpType, annualData]);
  const monthlyData = useMemo(() => computeMonthlyReturns(histData), [histData]);
  if (loading) return /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)" } }, "Cargando rentabilidades anuales...");
  if (!annualData?.years?.length) return /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)" } }, "Sin datos anuales disponibles.");
  const weightMap = {};
  if (rawData?.funds) rawData.funds.forEach((f) => {
    if (f.Fondo) weightMap[f.Fondo] = f.Porcentaje || 0;
  });
  const buildOrder = (fundsObj) => {
    const portfolioKey = Object.keys(fundsObj).find((k) => k.includes("Mi Cartera"));
    const others = Object.keys(fundsObj).filter((k) => !k.includes("Mi Cartera")).sort((a, b) => (weightMap[b] || 0) - (weightMap[a] || 0));
    return portfolioKey ? [portfolioKey, ...others] : others;
  };
  const renderTable = (columns, getVal, colHeader) => {
    const orderedFunds = buildOrder(annualData.funds);
    return /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "separate", borderSpacing: "3px", fontSize: "0.78rem", width: "100%" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "6px 10px", color: "var(--text-secondary)", fontWeight: 600, position: "sticky", left: 0, background: "var(--bg-primary)", zIndex: 2, whiteSpace: "nowrap" } }, "Fondo"), columns.map((col) => /* @__PURE__ */ React.createElement("th", { key: col, style: { textAlign: "center", padding: "6px 4px", color: "var(--text-secondary)", fontWeight: 600, minWidth: "58px", whiteSpace: "nowrap" } }, colHeader(col))))), /* @__PURE__ */ React.createElement("tbody", null, orderedFunds.map((name) => {
      const isPortfolio = name.includes("Mi Cartera");
      return /* @__PURE__ */ React.createElement("tr", { key: name, style: { borderBottom: isPortfolio ? "2px solid rgba(255,215,0,0.18)" : "none" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px", fontWeight: isPortfolio ? 800 : 500, color: isPortfolio ? "#FFD700" : "var(--text-primary)", position: "sticky", left: 0, background: "var(--bg-primary)", zIndex: 1 }, title: name }, isPortfolio ? "\u{1F4CA} " : "", name.substring(0, 28)), columns.map((col) => {
        const v = getVal(name, col);
        return /* @__PURE__ */ React.createElement("td", { key: col }, /* @__PURE__ */ React.createElement("div", { style: heatCellStyle(v, isPortfolio), title: v != null ? `${name} \u2014 ${colHeader(col)}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "Sin datos" }, v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "\u2014"));
      }));
    }))));
  };
  const btnStyle = (active) => ({
    padding: "5px 14px",
    borderRadius: "16px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.78rem",
    border: active ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)",
    background: active ? "var(--accent-glow)" : "transparent",
    color: active ? "#000" : "var(--text-primary)",
    transition: "all 0.15s"
  });
  const toolbar = /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" } }, /* @__PURE__ */ React.createElement("button", { style: btnStyle(viewMode === "annual"), onClick: () => setViewMode("annual") }, "\u{1F4C5} Anual"), /* @__PURE__ */ React.createElement("button", { style: btnStyle(viewMode === "monthly"), onClick: () => setViewMode("monthly") }, "\u{1F5D3} Mensual"), /* @__PURE__ */ React.createElement("button", { style: btnStyle(viewMode === "compare"), onClick: () => setViewMode("compare") }, "\u2696\uFE0F Comparativa"), viewMode === "monthly" && annualData.years && /* @__PURE__ */ React.createElement("select", { value: selectedYear || "", onChange: (e) => setSelectedYear(Number(e.target.value)), style: { marginLeft: "8px", padding: "5px 10px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.8rem" } }, [...annualData.years].reverse().map((y) => /* @__PURE__ */ React.createElement("option", { key: y, value: y }, y))));
  const legend = /* @__PURE__ */ React.createElement("div", { style: { marginTop: "8px", fontSize: "0.72rem", color: "var(--text-secondary)", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "14px", height: "14px", borderRadius: "3px", background: "hsla(118,80%,36%,0.88)", display: "inline-block" } }), " Positivo"), /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "14px", height: "14px", borderRadius: "3px", background: "hsla(4,80%,38%,0.88)", display: "inline-block" } }), " Negativo"), /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "14px", height: "14px", borderRadius: "3px", background: "rgba(140,140,140,0.35)", display: "inline-block" } }), " ~0%"));
  if (viewMode === "annual") {
    return /* @__PURE__ */ React.createElement("div", null, toolbar, renderTable(
      annualData.years,
      (name, y) => annualData.funds[name]?.[y] ?? null,
      (y) => y === annualData.current_year ? `${y} (A)` : String(y)
    ), annualData.current_year && annualData.years.includes(annualData.current_year) && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "6px" } }, "(A) = A\xF1o en curso, rentabilidad anualizada (YTD \xD7 365/d\xEDas)"), legend);
  }
  if (viewMode === "monthly") {
    if (!monthlyData) return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("br", null), toolbar, /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)" } }, "Cargando datos mensuales..."));
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const months = selectedYear === currentYear ? monthlyData.months.slice(-12) : monthlyData.months.filter((ym) => ym.startsWith(String(selectedYear) + "-"));
    return /* @__PURE__ */ React.createElement("div", null, toolbar, months.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)" } }, "Sin datos para ", selectedYear) : renderTable(months, (name, ym) => monthlyData.returns[name]?.[ym] ?? null, (ym) => MONTH_LABELS[parseInt(ym.split("-")[1], 10) - 1]), legend);
  }
  if (viewMode === "compare") {
    const availMonths = monthlyData?.months || [];
    const selStyle = { padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.82rem" };
    const orderedFunds = buildOrder(annualData.funds);
    const fmtYM = (ym) => {
      if (!ym) return "\u2014";
      const [y, m] = ym.split("-");
      return `${MONTH_LABELS[parseInt(m, 10) - 1]} ${y}`;
    };
    const btnSmall = (active) => ({ padding: "5px 12px", borderRadius: "12px", cursor: "pointer", fontWeight: 600, fontSize: "0.78rem", border: active ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)", background: active ? "var(--accent-glow)" : "transparent", color: active ? "#000" : "var(--text-primary)", transition: "all 0.15s" });
    const getPctValA = (name) => cmpType === "months" ? cmpA && monthlyData ? monthlyData.returns[name]?.[cmpA] ?? null : null : cmpYearA != null ? annualData.funds[name]?.[cmpYearA] ?? null : null;
    const getPctValB = (name) => cmpType === "months" ? cmpB && monthlyData ? monthlyData.returns[name]?.[cmpB] ?? null : null : cmpYearB != null ? annualData.funds[name]?.[cmpYearB] ?? null : null;
    const getEurA = () => cmpType === "months" ? cmpA ? ordersData?.monthly?.[cmpA] ?? null : null : cmpYearA != null ? ordersData?.yearly?.[cmpYearA] ?? null : null;
    const getEurB = () => cmpType === "months" ? cmpB ? ordersData?.monthly?.[cmpB] ?? null : null : cmpYearB != null ? ordersData?.yearly?.[cmpYearB] ?? null : null;
    const labelA = cmpType === "months" ? fmtYM(cmpA) : cmpYearA != null ? String(cmpYearA) : "\u2014";
    const labelB = cmpType === "months" ? fmtYM(cmpB) : cmpYearB != null ? String(cmpYearB) : "\u2014";
    const hasSelectionA = cmpType === "months" ? !!cmpA : cmpYearA != null;
    const hasSelectionB = cmpType === "months" ? !!cmpB : cmpYearB != null;
    const euros = (v) => v != null ? `\u20AC${Number(v).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "\u2014";
    return /* @__PURE__ */ React.createElement("div", null, toolbar, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginRight: "4px" } }, "Agrupar:"), /* @__PURE__ */ React.createElement("button", { style: btnSmall(cmpType === "months"), onClick: () => {
      setCmpType("months");
      setCmpYearA(null);
      setCmpYearB(null);
    } }, "Meses"), /* @__PURE__ */ React.createElement("button", { style: btnSmall(cmpType === "years"), onClick: () => {
      setCmpType("years");
      setCmpA("");
      setCmpB("");
    } }, "A\xF1os")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginRight: "4px" } }, "Mostrar:"), /* @__PURE__ */ React.createElement("button", { style: btnSmall(cmpMetric === "pct"), onClick: () => setCmpMetric("pct") }, "% Rentabilidad"))), !monthlyData && cmpType === "months" && /* @__PURE__ */ React.createElement("div", { style: { padding: "0.5rem", color: "var(--text-secondary)", fontSize: "0.82rem" } }, "Cargando datos mensuales..."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" } }, cmpType === "months" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Periodo A:", /* @__PURE__ */ React.createElement("select", { value: cmpA, onChange: (e) => setCmpA(e.target.value), style: { ...selStyle, marginLeft: "6px" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 elegir \u2014"), [...availMonths].reverse().map((ym) => /* @__PURE__ */ React.createElement("option", { key: ym, value: ym }, fmtYM(ym))))), /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Periodo B:", /* @__PURE__ */ React.createElement("select", { value: cmpB, onChange: (e) => setCmpB(e.target.value), style: { ...selStyle, marginLeft: "6px" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 elegir \u2014"), [...availMonths].reverse().map((ym) => /* @__PURE__ */ React.createElement("option", { key: ym, value: ym }, fmtYM(ym)))))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "A\xF1o A:", /* @__PURE__ */ React.createElement("select", { value: cmpYearA ?? "", onChange: (e) => setCmpYearA(e.target.value ? Number(e.target.value) : null), style: { ...selStyle, marginLeft: "6px" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 elegir \u2014"), [...annualData.years].reverse().map((y) => /* @__PURE__ */ React.createElement("option", { key: y, value: y }, y)))), /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "A\xF1o B:", /* @__PURE__ */ React.createElement("select", { value: cmpYearB ?? "", onChange: (e) => setCmpYearB(e.target.value ? Number(e.target.value) : null), style: { ...selStyle, marginLeft: "6px" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 elegir \u2014"), [...annualData.years].reverse().map((y) => /* @__PURE__ */ React.createElement("option", { key: y, value: y }, y)))))), cmpMetric === "pct" && (hasSelectionA || hasSelectionB) && /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "separate", borderSpacing: "3px", fontSize: "0.78rem", width: "100%" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "6px 10px", color: "var(--text-secondary)", fontWeight: 600, position: "sticky", left: 0, background: "var(--bg-primary)", zIndex: 2 } }, "Fondo"), hasSelectionA && /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "6px 8px", color: "#4AA2AF", fontWeight: 700, minWidth: "75px" } }, labelA), hasSelectionB && /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "6px 8px", color: "#a78bfa", fontWeight: 700, minWidth: "75px" } }, labelB), hasSelectionA && hasSelectionB && /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 600, minWidth: "65px" } }, "\u0394 (A\u2212B)"), hasSelectionA && hasSelectionB && /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 600, minWidth: "65px" } }, "%\u0394"))), /* @__PURE__ */ React.createElement("tbody", null, orderedFunds.map((name) => {
      const isPortfolio = name.includes("Mi Cartera");
      const vA = getPctValA(name), vB = getPctValB(name);
      const delta = vA != null && vB != null ? +(vA - vB).toFixed(2) : null;
      const pctDelta = vB != null && Math.abs(vB) > 0.01 && delta != null ? delta / Math.abs(vB) * 100 : null;
      return /* @__PURE__ */ React.createElement("tr", { key: name, style: { borderBottom: isPortfolio ? "2px solid rgba(255,215,0,0.18)" : "none" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 10px", fontWeight: isPortfolio ? 800 : 500, color: isPortfolio ? "#FFD700" : "var(--text-primary)", position: "sticky", left: 0, background: "var(--bg-primary)", zIndex: 1, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: name }, isPortfolio ? "\u{1F4CA} " : "", name.substring(0, 28)), hasSelectionA && /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: heatCellStyle(vA, isPortfolio) }, vA != null ? `${vA >= 0 ? "+" : ""}${vA.toFixed(1)}%` : "\u2014")), hasSelectionB && /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: heatCellStyle(vB, isPortfolio) }, vB != null ? `${vB >= 0 ? "+" : ""}${vB.toFixed(1)}%` : "\u2014")), hasSelectionA && hasSelectionB && /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { ...heatCellStyle(delta, false), borderLeft: "1px solid rgba(255,255,255,0.1)" } }, delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp` : "\u2014")), hasSelectionA && hasSelectionB && /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 8px", textAlign: "center", fontSize: "0.75rem", color: pctDelta == null ? "var(--text-secondary)" : pctDelta > 0 ? "var(--success)" : pctDelta < 0 ? "var(--danger)" : "var(--text-secondary)" } }, pctDelta != null ? `${pctDelta >= 0 ? "+" : ""}${pctDelta.toFixed(0)}%` : "\u2014")));
    })))), cmpMetric === "pct" && !hasSelectionA && !hasSelectionB && /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)", fontSize: "0.85rem" } }, "Selecciona dos per\xEDodos para comparar la rentabilidad de cada fondo."), legend);
  }
  return null;
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
  })(), /* @__PURE__ */ React.createElement("h3", { style: { marginTop: "2.5rem", marginBottom: "0.5rem", fontWeight: 600 } }, "Matriz de Correlaci\xF3n de Pearson"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" } }, "Valores cercanos a ", /* @__PURE__ */ React.createElement("span", { style: { color: "hsl(120,80%,40%)" } }, "+1 (verde)"), " = fondos se mueven juntos. Valores cercanos a ", /* @__PURE__ */ React.createElement("span", { style: { color: "hsl(0,80%,50%)" } }, "-1 (rojo)"), " = descorrelacionados (protegen tu cartera).", /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "8px", fontSize: "0.78rem", opacity: 0.7 } }, "Calculada sobre el periodo seleccionado, incluye Mi Cartera.")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", overflowX: "auto" } }, clientCorrelation && clientCorrelation.labels && clientCorrelation.labels.length > 1 ? /* @__PURE__ */ React.createElement(HeatmapRenderer, { data: clientCorrelation, activeFunds: corrFunds }) : /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)", textAlign: "center" } }, "Datos insuficientes para la correlaci\xF3n en este periodo. Selecciona m\xE1s fondos o ampl\xEDa el rango.")), /* @__PURE__ */ React.createElement("h3", { style: { marginTop: "2.5rem", marginBottom: "0.5rem", fontWeight: 600 } }, "Calendario de Rentabilidades Anuales", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400, marginLeft: "8px" } }, "retorno por a\xF1o natural (precio cierre enero \u2192 precio cierre diciembre)")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", overflowX: "auto" } }, /* @__PURE__ */ React.createElement(AnnualReturnsHeatmap, { rawData })));
};
const AnadirFondoTab = () => {
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
const FundSearchInput = ({ onSelect, placeholder = "ISIN o nombre del fondo", clearOnSelect = true }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debRef = React.useRef(null);
  const handleChange = (val) => {
    setQuery(val);
    if (debRef.current) clearTimeout(debRef.current);
    if (val.length < 2) {
      setResults([]);
      return;
    }
    debRef.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(val)}&limit=15`).then((r) => r.json()).then((res) => {
        setResults(res);
        setSearching(false);
      }).catch(() => setSearching(false));
    }, 300);
  };
  const select = (fund) => {
    onSelect(fund);
    if (clearOnSelect) {
      setQuery("");
      setResults([]);
    } else {
      setQuery(fund.isin);
      setResults([]);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { style: { position: "relative", flex: "1 1 220px" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: query,
      onChange: (e) => handleChange(e.target.value),
      placeholder,
      style: { width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.85rem", boxSizing: "border-box" }
    }
  ), searching && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", right: "10px", top: "9px", color: "var(--accent-glow)", fontSize: "0.72rem", pointerEvents: "none" } }, "Buscando\u2026"), results.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, maxHeight: "260px", overflowY: "auto", background: "rgba(15,20,35,0.98)", border: "1px solid var(--border-glass)", borderRadius: "0 0 8px 8px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" } }, results.map((r) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: r.isin,
      onClick: () => select(r),
      style: { padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" },
      onMouseEnter: (e) => e.currentTarget.style.background = "rgba(74,162,175,0.15)",
      onMouseLeave: (e) => e.currentTarget.style.background = "transparent"
    },
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: "0.85rem" } }, r.isin), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.73rem", color: "var(--text-secondary)", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.name)),
    r.in_portfolio && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", padding: "2px 8px", background: "rgba(74,162,175,0.2)", borderRadius: "10px", color: "var(--accent-glow)" } }, "En cartera")
  ))));
};
const RebalancearTab = () => {
  const [positions, setPositions] = useState([]);
  const [loadingPos, setLoadingPos] = useState(true);
  const [transfers, setTransfers] = useState([]);
  const [fromISIN, setFromISIN] = useState("");
  const [toISIN, setToISIN] = useState("");
  const [toIsNew, setToIsNew] = useState(false);
  const [toNewFund, setToNewFund] = useState(null);
  const [amount, setAmount] = useState("");
  const [addFund, setAddFund] = useState(null);
  const [addAmount, setAddAmount] = useState("");
  useEffect(() => {
    fetch("/api/portfolio/positions").then((r) => r.json()).then((data) => {
      setPositions(data.positions || []);
      setLoadingPos(false);
    }).catch(() => setLoadingPos(false));
  }, []);
  const [standaloneAdds, setStandaloneAdds] = useState([]);
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState(null);
  const [simTimeframe, setSimTimeframe] = useState("5Y");
  const totalPortfolio = positions.reduce((s, p) => s + (p.Valor_Actual || p.Capital_Invertido || 0), 0);
  const computeResult = () => {
    const bal = {};
    positions.forEach((p) => {
      bal[p.ISIN] = p.Valor_Actual || p.Capital_Invertido || 0;
    });
    transfers.forEach((t) => {
      bal[t.fromISIN] = (bal[t.fromISIN] || 0) - t.amount;
      if (t.toISIN) bal[t.toISIN] = (bal[t.toISIN] || 0) + t.amount;
    });
    standaloneAdds.forEach((a) => {
      bal[a.isin] = (bal[a.isin] || 0) + a.amount;
    });
    return bal;
  };
  const addTransfer = () => {
    const destISIN = toIsNew ? toNewFund?.isin : toISIN;
    const destName = toIsNew ? toNewFund?.name : positions.find((p) => p.ISIN === toISIN)?.Fondo || toISIN;
    if (!fromISIN || !destISIN || !amount || parseFloat(amount) <= 0) return;
    setTransfers((prev) => [...prev, {
      id: Date.now(),
      fromISIN,
      fromName: positions.find((p) => p.ISIN === fromISIN)?.Fondo || fromISIN,
      toISIN: destISIN,
      toName: destName,
      toIsNew,
      amount: parseFloat(amount)
    }]);
    setAmount("");
    if (toIsNew) setToNewFund(null);
  };
  const addStandalone = () => {
    if (!addFund || !addAmount || parseFloat(addAmount) <= 0) return;
    setStandaloneAdds((prev) => [...prev, { id: Date.now(), isin: addFund.isin, name: addFund.name, amount: parseFloat(addAmount) }]);
    setAddFund(null);
    setAddAmount("");
  };
  const removeTransfer = (id) => setTransfers((prev) => prev.filter((t) => t.id !== id));
  const removeStandalone = (id) => setStandaloneAdds((prev) => prev.filter((a) => a.id !== id));
  const runHistoricalSimulation = () => {
    const existingISINs = new Set(positions.map((p) => p.ISIN));
    const rawWeights = {};
    let wTotal = 0;
    Object.entries(result).forEach(([isin, bal]) => {
      if (existingISINs.has(isin) && bal > 0.01) {
        rawWeights[isin] = bal;
        wTotal += bal;
      }
    });
    if (wTotal <= 0) return;
    const weights = {};
    Object.keys(rawWeights).forEach((isin) => {
      weights[isin] = rawWeights[isin] / wTotal;
    });
    setSimLoading(true);
    setSimError(null);
    setSimResult(null);
    fetch("/api/portfolio/rebalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weights })
    }).then(async (r) => {
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.detail || "Error");
      }
      return r.json();
    }).then((res) => {
      setSimResult(res);
      setSimLoading(false);
    }).catch((e) => {
      setSimError(e.message);
      setSimLoading(false);
    });
  };
  const result = computeResult();
  const totalAfter = Object.values(result).reduce((s, v) => s + Math.max(v, 0), 0);
  const newFundsFromTransfers = transfers.filter((t) => t.toIsNew).filter((t, i, arr) => arr.findIndex((x) => x.toISIN === t.toISIN) === i).map((t) => ({ isin: t.toISIN, name: t.toName, isNew: true }));
  const newFundsFromStandalone = standaloneAdds.filter((a) => !positions.find((p) => p.ISIN === a.isin)).filter((a, i, arr) => arr.findIndex((x) => x.isin === a.isin) === i).map((a) => ({ isin: a.isin, name: a.name, isNew: true }));
  const allFunds = [
    ...positions.map((p) => ({ isin: p.ISIN, name: p.Fondo, isNew: false })),
    ...newFundsFromTransfers,
    ...newFundsFromStandalone
  ].filter((f, i, arr) => arr.findIndex((x) => x.isin === f.isin) === i);
  const hasErrors = Object.entries(result).some(([, v]) => v < -0.01);
  const hasChanges = transfers.length > 0 || standaloneAdds.length > 0;
  const inputStyle = { padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.85rem" };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "0.25rem", fontWeight: 600 } }, "\u2696\uFE0F Planificador de Traspasos"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" } }, "Define traspasos entre fondos (fiscalmente neutros \u2014 0 \u20AC de impuesto). Puedes traspasar a fondos ya existentes o a fondos nuevos."), loadingPos ? /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)" } }, "Cargando posiciones...") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 0.6rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.05em" } }, "Saldos actuales"), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto", marginBottom: "1.75rem" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "2px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "8px 12px", color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase" } }, "Fondo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 12px", color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase" } }, "Saldo (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 12px", color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase" } }, "Peso (%)"))), /* @__PURE__ */ React.createElement("tbody", null, [...positions].sort((a, b) => (b.Valor_Actual || b.Capital_Invertido || 0) - (a.Valor_Actual || a.Capital_Invertido || 0)).map((p) => {
    const val = p.Valor_Actual || p.Capital_Invertido || 0;
    const w = totalPortfolio > 0 ? val / totalPortfolio * 100 : 0;
    return /* @__PURE__ */ React.createElement("tr", { key: p.ISIN, style: { borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: "0.85rem" } }, p.Fondo), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)" } }, p.ISIN)), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 } }, "\u20AC", val.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, w.toFixed(1), "%"));
  }), /* @__PURE__ */ React.createElement("tr", { style: { borderTop: "2px solid rgba(255,255,255,0.15)", fontWeight: 700 } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", color: "var(--accent-glow)" } }, "TOTAL"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--accent-glow)" } }, "\u20AC", totalPortfolio.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", color: "var(--accent-glow)" } }, "100%"))))), /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(0,0,0,0.2)", borderRadius: "10px", border: "1px dashed var(--border-glass)", padding: "1.25rem", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 1rem", fontWeight: 600, color: "var(--accent-glow)" } }, "\u2795 A\xF1adir Traspaso"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Origen"), /* @__PURE__ */ React.createElement("select", { value: fromISIN, onChange: (e) => setFromISIN(e.target.value), style: { ...inputStyle, minWidth: "200px" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 Selecciona fondo \u2014"), positions.map((p) => /* @__PURE__ */ React.createElement("option", { key: p.ISIN, value: p.ISIN }, p.Fondo)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.4rem", paddingBottom: "6px", color: "var(--accent-glow)" } }, "\u2192"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Destino"), /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: toIsNew, onChange: (e) => {
    setToIsNew(e.target.checked);
    setToISIN("");
    setToName("");
    setToNewISIN("");
  } }), "Fondo nuevo")), toIsNew ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement(
    FundSearchInput,
    {
      placeholder: "Busca el fondo destino (ISIN o nombre)",
      clearOnSelect: false,
      onSelect: (f) => setToNewFund(f)
    }
  ), toNewFund && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.73rem", padding: "4px 8px", background: "rgba(74,162,175,0.1)", borderRadius: "5px", color: "var(--accent-glow)" } }, "\u2714 ", toNewFund.isin, " \u2014 ", toNewFund.name)) : /* @__PURE__ */ React.createElement("select", { value: toISIN, onChange: (e) => setToISIN(e.target.value), style: { ...inputStyle, minWidth: "200px" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 Selecciona fondo \u2014"), positions.filter((p) => p.ISIN !== fromISIN).map((p) => /* @__PURE__ */ React.createElement("option", { key: p.ISIN, value: p.ISIN }, p.Fondo)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Importe (\u20AC)"), fromISIN && positions.find((p) => p.ISIN === fromISIN) && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        const pos = positions.find((p) => p.ISIN === fromISIN);
        const bal = pos ? pos.Valor_Actual || pos.Capital_Invertido || 0 : 0;
        setAmount(String(bal.toFixed(2)));
      },
      style: { fontSize: "0.65rem", padding: "1px 6px", borderRadius: "4px", border: "1px solid var(--accent-glow)", background: "rgba(74,162,175,0.15)", color: "var(--accent-glow)", cursor: "pointer", fontWeight: 700 }
    },
    "Todo"
  )), fromISIN && positions.find((p) => p.ISIN === fromISIN) && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "2px" } }, "Disponible: \u20AC", (positions.find((p) => p.ISIN === fromISIN)?.Valor_Actual || positions.find((p) => p.ISIN === fromISIN)?.Capital_Invertido || 0).toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "1",
      step: "any",
      placeholder: "0,00",
      value: amount,
      onChange: (e) => setAmount(e.target.value),
      style: { ...inputStyle, width: "140px" }
    }
  )), /* @__PURE__ */ React.createElement("button", { onClick: addTransfer, style: { padding: "8px 18px", background: "var(--accent-glow)", color: "black", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer", height: "37px" } }, "A\xF1adir"))), /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(0,0,0,0.15)", borderRadius: "10px", border: "1px dashed rgba(74,162,175,0.3)", padding: "1.25rem", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 1rem", fontWeight: 600, color: "var(--text-secondary)" } }, "\u{1F4B0} A\xF1adir fondo nuevo (sin traspaso)"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" } }, "Capital nuevo externo \u2014 no proviene de ning\xFAn fondo existente."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 220px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Fondo destino"), /* @__PURE__ */ React.createElement(FundSearchInput, { placeholder: "Busca por ISIN o nombre", onSelect: (f) => setAddFund(f), clearOnSelect: false }), addFund && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.73rem", padding: "4px 8px", background: "rgba(74,162,175,0.1)", borderRadius: "5px", color: "var(--accent-glow)" } }, "\u2714 ", addFund.isin, " \u2014 ", addFund.name)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Importe (\u20AC)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "1",
      step: "any",
      placeholder: "0,00",
      value: addAmount,
      onChange: (e) => setAddAmount(e.target.value),
      style: { ...inputStyle, width: "120px" }
    }
  )), /* @__PURE__ */ React.createElement("button", { onClick: addStandalone, style: { padding: "8px 18px", background: "rgba(74,162,175,0.3)", color: "white", border: "1px solid var(--accent-glow)", borderRadius: "6px", fontWeight: 700, cursor: "pointer", height: "37px" } }, "A\xF1adir")), standaloneAdds.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "5px" } }, standaloneAdds.map((a) => /* @__PURE__ */ React.createElement("div", { key: a.id, style: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 12px", background: "rgba(74,162,175,0.08)", borderRadius: "6px", border: "1px solid rgba(74,162,175,0.2)" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontWeight: 600, fontSize: "0.85rem" } }, a.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)" } }, a.isin), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--success)", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: "100px", textAlign: "right" } }, "+\u20AC", a.amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("button", { onClick: () => removeStandalone(a.id), style: { background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "var(--danger)", borderRadius: "4px", padding: "2px 7px", cursor: "pointer", fontSize: "0.75rem" } }, "\u2715"))))), transfers.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 0.75rem", fontWeight: 600 } }, "\u{1F4CB} Traspasos planificados"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, transfers.map((t) => {
    const srcBalAfter = result[t.fromISIN] ?? 0;
    const negative = srcBalAfter < -0.01;
    return /* @__PURE__ */ React.createElement("div", { key: t.id, style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 14px", background: negative ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)", borderRadius: "8px", border: `1px solid ${negative ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}` } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontWeight: 600, fontSize: "0.85rem" } }, t.fromName), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--danger)", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: "100px", textAlign: "right" } }, "\u2212\u20AC", t.amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "1rem", padding: "0 4px" } }, "\u2192"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontWeight: 600, fontSize: "0.85rem" } }, t.toName, t.toIsNew && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.68rem", background: "rgba(74,162,175,0.2)", color: "var(--accent-glow)", padding: "1px 5px", borderRadius: "4px", marginLeft: "6px" } }, "nuevo")), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--success)", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: "100px", textAlign: "right" } }, "+\u20AC", t.amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })), negative && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--danger)", whiteSpace: "nowrap" } }, "\u26A0\uFE0F saldo insuficiente"), /* @__PURE__ */ React.createElement("button", { onClick: () => removeTransfer(t.id), style: { background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "var(--danger)", borderRadius: "4px", padding: "2px 7px", cursor: "pointer", fontSize: "0.75rem", flexShrink: 0 } }, "\u2715"));
  }))))), hasChanges && !loadingPos && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "0.5rem", fontWeight: 600 } }, "\u{1F4CA} Resultado tras los movimientos"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.25rem" } }, "Los traspasos entre fondos son ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--success)" } }, "fiscalmente neutros (0 \u20AC de impuesto)"), ". Las aportaciones de capital nuevo s\xED incrementan el total de la cartera."), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "2px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "8px 12px", color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase" } }, "Fondo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 12px", color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase" } }, "Antes (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 12px", color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase" } }, "Movimiento (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 12px", color: "var(--accent-glow)", fontSize: "0.75rem", textTransform: "uppercase" } }, "Despu\xE9s (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 12px", color: "var(--accent-glow)", fontSize: "0.75rem", textTransform: "uppercase" } }, "Nuevo peso (%)"))), /* @__PURE__ */ React.createElement("tbody", null, allFunds.filter((f) => {
    const before = positions.find((p) => p.ISIN === f.isin);
    const beforeVal = before ? before.Valor_Actual || before.Capital_Invertido || 0 : 0;
    return beforeVal > 0 || (result[f.isin] || 0) > 0;
  }).sort((a, b) => (result[b.isin] || 0) - (result[a.isin] || 0)).map((f) => {
    const posData = positions.find((p) => p.ISIN === f.isin);
    const before = posData ? posData.Valor_Actual || posData.Capital_Invertido || 0 : 0;
    const after = result[f.isin] || 0;
    const delta = after - before;
    const wAfter = totalAfter > 0 ? after / totalAfter * 100 : 0;
    const isNegative = after < -0.01;
    return /* @__PURE__ */ React.createElement("tr", { key: f.isin, style: { borderBottom: "1px solid rgba(255,255,255,0.05)", background: isNegative ? "rgba(239,68,68,0.06)" : "transparent" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600 } }, f.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)" } }, f.isin, f.isNew && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "6px", fontSize: "0.68rem", background: "rgba(74,162,175,0.2)", color: "var(--accent-glow)", padding: "1px 5px", borderRadius: "4px" } }, "nuevo"))), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, before > 0 ? `\u20AC${before.toLocaleString("es-ES", { minimumFractionDigits: 2 })}` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: delta > 0.01 ? "var(--success)" : delta < -0.01 ? "var(--danger)" : "var(--text-secondary)" } }, Math.abs(delta) > 0.01 ? `${delta > 0 ? "+" : ""}\u20AC${delta.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isNegative ? "var(--danger)" : "var(--text-primary)" } }, isNegative ? "\u26A0\uFE0F negativo" : `\u20AC${after.toLocaleString("es-ES", { minimumFractionDigits: 2 })}`), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, after > 0.01 ? `${wAfter.toFixed(1)}%` : "0%"));
  })))), hasErrors && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "1rem", padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "var(--danger)", fontSize: "0.85rem" } }, "\u26A0\uFE0F Algunos fondos de origen no tienen saldo suficiente para los traspasos definidos. Revisa los importes.")), hasChanges && !loadingPos && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginTop: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "10px" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { margin: 0, fontWeight: 600 } }, "\u{1F9EA} Simular impacto hist\xF3rico"), /* @__PURE__ */ React.createElement("p", { style: { margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" } }, "\xBFC\xF3mo habr\xEDa rendido esta cartera resultado vs. la actual?")), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: runHistoricalSimulation,
      disabled: simLoading || hasErrors,
      style: { padding: "9px 22px", background: hasErrors ? "var(--border-glass)" : "linear-gradient(135deg, var(--accent-glow), var(--accent-secondary))", color: hasErrors ? "var(--text-secondary)" : "white", border: "none", borderRadius: "8px", fontWeight: 700, cursor: hasErrors ? "not-allowed" : "pointer" }
    },
    simLoading ? "\u23F3 Simulando..." : "\u{1F680} Simular"
  )), simError && /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" } }, simError), simResult && (() => {
    const SIM_TF = ["1Y", "3Y", "5Y", "10Y", "MAX"];
    const datasets = {};
    if (simResult.history_current?.length > 1) datasets["\u{1F4CA} Cartera actual"] = simResult.history_current;
    if (simResult.history_simulated?.length > 1) datasets["\u{1F4C8} Resultado traspasos"] = simResult.history_simulated;
    const colorMap = { "\u{1F4CA} Cartera actual": "#FFD700", "\u{1F4C8} Resultado traspasos": "#4ADE80" };
    const activeFunds = Object.keys(datasets);
    const { start, end } = getDateRange(simTimeframe, null);
    const curr = computeFundMetrics(filterSeries(datasets["\u{1F4CA} Cartera actual"] || [], start, end), null);
    const sim = computeFundMetrics(filterSeries(datasets["\u{1F4C8} Resultado traspasos"] || [], start, end), null);
    const signC = (v) => v > 0 ? "var(--success)" : v < 0 ? "var(--danger)" : "var(--text-primary)";
    const riskC = (v) => v < 10 ? "var(--success)" : v < 20 ? "var(--warning)" : "var(--danger)";
    const metRow = (label, cv, sv, fmt, col) => {
      if (cv == null && sv == null) return null;
      const d = cv != null && sv != null ? sv - cv : null;
      return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", flex: 1 } }, label), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center", fontWeight: 600, color: col && cv != null ? col(cv) : "var(--text-primary)", fontVariantNumeric: "tabular-nums" } }, cv != null ? fmt(cv) : "\u2014"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center", fontWeight: 600, color: col && sv != null ? col(sv) : "var(--text-primary)", fontVariantNumeric: "tabular-nums" } }, sv != null ? fmt(sv) : "\u2014"), /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 80px", textAlign: "right", fontWeight: 700, fontSize: "0.8rem", color: d != null ? d > 0 ? "var(--success)" : d < 0 ? "var(--danger)" : "var(--text-secondary)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, d != null ? `${d >= 0 ? "+" : ""}${d.toFixed(2)}` : "\u2014"));
    };
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", marginBottom: "1rem", flexWrap: "wrap" } }, SIM_TF.map((tf) => /* @__PURE__ */ React.createElement("button", { key: tf, onClick: () => setSimTimeframe(tf), style: { padding: "4px 12px", borderRadius: "16px", cursor: "pointer", fontWeight: 600, fontSize: "0.75rem", border: simTimeframe === tf ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)", background: simTimeframe === tf ? "var(--accent-glow)" : "transparent", color: simTimeframe === tf ? "#000" : "var(--text-primary)" } }, tf))), activeFunds.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement(InteractiveChart, { datasets, timeframe: simTimeframe, activeFunds, customRange: null, fundColorMap: colorMap })), simResult.period_returns?.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 0.6rem", fontWeight: 600 } }, "\u{1F4C5} Rentabilidad por per\xEDodo"), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "2px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "6px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" } }, "Per\xEDodo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "6px 10px", color: "#FFD700", fontSize: "0.72rem", textTransform: "uppercase" } }, "Actual"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "center", padding: "6px 10px", color: "#4ADE80", fontSize: "0.72rem", textTransform: "uppercase" } }, "Rebalanceada"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "6px 10px", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase" } }, "\u0394"))), /* @__PURE__ */ React.createElement("tbody", null, simResult.period_returns.map((r, i) => {
      const d = r.simulated != null && r.current != null ? r.simulated - r.current : null;
      const fmtP = (v) => v != null ? /* @__PURE__ */ React.createElement("span", { style: { color: v >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 700 } }, v >= 0 ? "+" : "", v.toFixed(1), "%") : "\u2014";
      return /* @__PURE__ */ React.createElement("tr", { key: i, style: { borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", fontWeight: 600 } }, r.label), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "center" } }, fmtP(r.current)), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "center" } }, fmtP(r.simulated)), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "right", fontWeight: 700, fontSize: "0.8rem", color: d != null ? d >= 0 ? "var(--success)" : "var(--danger)" : "var(--text-secondary)" } }, d != null ? `${d >= 0 ? "+" : ""}${d.toFixed(2)}pp` : "\u2014"));
    })))), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 0.5rem", fontWeight: 600 } }, "\u{1F4CA} M\xE9tricas (per\xEDodo seleccionado)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", padding: "6px 12px", borderBottom: "2px solid rgba(255,255,255,0.1)", fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, "M\xE9trica"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center", color: "#FFD700" } }, "Actual"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, textAlign: "center", color: "#4ADE80" } }, "Rebalanceada"), /* @__PURE__ */ React.createElement("span", { style: { flex: "0 0 80px", textAlign: "right" } }, "\u0394")), metRow("Retorno total", curr?.totalReturn, sim?.totalReturn, (v) => `${v.toFixed(2)}%`, signC), metRow("Rentabilidad anualizada", curr?.annReturn, sim?.annReturn, (v) => `${v.toFixed(2)}%`, signC), metRow("Volatilidad", curr?.vol, sim?.vol, (v) => `${v.toFixed(2)}%`, riskC), metRow("Sharpe ratio", curr?.sharpe, sim?.sharpe, (v) => v.toFixed(3), signC), metRow("M\xE1x. drawdown", curr?.maxDD, sim?.maxDD, (v) => `${v.toFixed(2)}%`)), simResult.funds?.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 0.5rem", fontWeight: 600 } }, "\u2696\uFE0F Cambio de pesos simulado"), [...simResult.funds].sort((a, b) => b.target_weight - a.target_weight).map((f) => {
      const d = f.target_weight - f.current_weight;
      return /* @__PURE__ */ React.createElement("div", { key: f.isin, style: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", width: "52px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, (f.current_weight * 100).toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "\u2192"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, width: "52px", fontVariantNumeric: "tabular-nums" } }, (f.target_weight * 100).toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, width: "50px", textAlign: "right", color: d > 5e-3 ? "var(--success)" : d < -5e-3 ? "var(--danger)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" } }, d >= 0 ? "+" : "", (d * 100).toFixed(1), "pp"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: f.delta_eur > 0 ? "var(--success)" : f.delta_eur < 0 ? "var(--danger)" : "var(--text-secondary)", width: "80px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, f.delta_eur >= 0 ? "+" : "", "\u20AC", Math.round(f.delta_eur).toLocaleString("es-ES")));
    })));
  })()));
};
const ProyeccionTab = () => {
  const [historyBatch, setHistoryBatch] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [extraInversion, setExtraInversion] = useState("0");
  const [aporteAnual, setAporteAnual] = useState("0");
  const [years, setYears] = useState("10");
  const [sigma, setSigma] = useState("1.0");
  const [lookback, setLookback] = useState("5Y");
  const [inflacion, setInflacion] = useState("2.0");
  const canvasRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const [dimensions, setDimensions] = useState({ w: 700, h: 320 });
  const [tooltip, setTooltip] = useState(null);
  const [drawn, setDrawn] = useState(null);
  useEffect(() => {
    Promise.all([
      fetch("/api/portfolio/history_batch").then((r) => r.json()),
      fetch("/api/portfolio/summary").then((r) => r.json())
    ]).then(([hist, sum]) => {
      setHistoryBatch(hist);
      setSummary(sum);
      setLoadingData(false);
    }).catch(() => setLoadingData(false));
  }, []);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width) || 700;
        setDimensions({ w, h: Math.max(260, Math.min(380, Math.floor(w * 0.42))) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);
  const projection = useMemo(() => {
    if (!historyBatch || !summary) return null;
    const summaryFunds = summary.funds || [];
    const currentPortfolioValue2 = summaryFunds.reduce((s2, f) => s2 + (f.Valor_Actual || 0), 0);
    const totalVal = currentPortfolioValue2 || 1;
    const weightMap = {};
    summaryFunds.forEach((f) => {
      if (f.Fondo) weightMap[f.Fondo] = (f.Valor_Actual || 0) / totalVal;
    });
    const now = /* @__PURE__ */ new Date();
    const lbStart = new Date(now);
    if (lookback === "3Y") lbStart.setFullYear(now.getFullYear() - 3);
    else if (lookback === "5Y") lbStart.setFullYear(now.getFullYear() - 5);
    else if (lookback === "10Y") lbStart.setFullYear(now.getFullYear() - 10);
    else lbStart.setFullYear(1900);
    let portCagrDec = 0, portVolVar = 0;
    const fundLines = [];
    for (const [name, series] of Object.entries(historyBatch)) {
      if (name.includes("Mi Cartera")) continue;
      const w = weightMap[name] || 0;
      if (w === 0 || !Array.isArray(series)) continue;
      const pts = series.filter((p) => p.price != null && p.price > 0 && new Date(p.date) >= lbStart);
      if (pts.length < 30) continue;
      const m = computeFundMetrics(pts, null);
      if (!m || m.annReturn == null || m.vol == null) continue;
      const cagrDec = m.annReturn / 100;
      const volDec = m.vol / 100;
      portCagrDec += w * cagrDec;
      portVolVar += Math.pow(w * volDec, 2);
      fundLines.push({ name, w, cagr: cagrDec, vol: volDec });
    }
    const portVolDec = Math.sqrt(portVolVar);
    const X0 = currentPortfolioValue2 + (parseFloat(extraInversion) || 0);
    const N = Math.max(1, Math.min(50, parseInt(years) || 10));
    const s = Math.max(0, parseFloat(sigma) || 1);
    const aporte = Math.max(0, parseFloat(aporteAnual) || 0);
    const base = [], optimistic = [], pessimistic = [];
    for (let t = 0; t <= N; t++) {
      if (t === 0) {
        base.push(X0);
        optimistic.push(X0);
        pessimistic.push(X0);
      } else {
        base.push(base[t - 1] * (1 + portCagrDec) + aporte);
        optimistic.push(optimistic[t - 1] * (1 + portCagrDec + s * portVolDec) + aporte);
        pessimistic.push(pessimistic[t - 1] * Math.max(1e-3, 1 + portCagrDec - s * portVolDec) + aporte);
      }
    }
    const infRate = Math.max(0, parseFloat(inflacion) || 0) / 100;
    if (infRate > 0) {
      for (let t = 1; t <= N; t++) {
        const deflator = Math.pow(1 + infRate, t);
        base[t] /= deflator;
        optimistic[t] /= deflator;
        pessimistic[t] /= deflator;
      }
    }
    return { base, optimistic, pessimistic, N, X0, currentPortfolioValue: currentPortfolioValue2, aporte, portCagrDec, portVolDec, s, fundLines, lookback, infRate };
  }, [historyBatch, summary, extraInversion, aporteAnual, years, sigma, lookback, inflacion]);
  useEffect(() => {
    if (!projection || !canvasRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const w = Math.max(300, Math.floor(container.getBoundingClientRect().width) || dimensions.w);
    const h = Math.max(260, Math.min(380, Math.floor(w * 0.42)));
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const margin = { top: 20, right: 35, bottom: 38, left: 72 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;
    ctx.clearRect(0, 0, w, h);
    const { base, optimistic, pessimistic, N } = projection;
    const allVals = [...base, ...optimistic, ...pessimistic];
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const valRange = maxVal - minVal || 1;
    const xS = (t) => margin.left + t / N * plotW;
    const yS = (v) => margin.top + plotH - (v - minVal) / valRange * plotH;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = margin.top + i / 5 * plotH;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();
    }
    const step = Math.max(1, Math.floor(N / 5));
    for (let t = 0; t <= N; t += step) {
      const x = xS(t);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + plotH);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "11px Inter,sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const v = minVal + valRange * (5 - i) / 5;
      ctx.fillText(v >= 1e6 ? `${(v / 1e6).toFixed(2)}M\u20AC` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K\u20AC` : `${v.toFixed(0)}\u20AC`, margin.left - 5, margin.top + i / 5 * plotH + 4);
    }
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    ctx.textAlign = "center";
    for (let t = 0; t <= N; t += step) ctx.fillText(`${currentYear + t}`, xS(t), margin.top + plotH + 18);
    ctx.beginPath();
    optimistic.forEach((v, t) => t === 0 ? ctx.moveTo(xS(t), yS(v)) : ctx.lineTo(xS(t), yS(v)));
    for (let t = N; t >= 0; t--) ctx.lineTo(xS(t), yS(pessimistic[t]));
    ctx.closePath();
    ctx.fillStyle = "rgba(74,162,175,0.1)";
    ctx.fill();
    ctx.beginPath();
    pessimistic.forEach((v, t) => t === 0 ? ctx.moveTo(xS(t), yS(v)) : ctx.lineTo(xS(t), yS(v)));
    ctx.strokeStyle = "rgba(239,68,68,0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    optimistic.forEach((v, t) => t === 0 ? ctx.moveTo(xS(t), yS(v)) : ctx.lineTo(xS(t), yS(v)));
    ctx.strokeStyle = "rgba(74,222,128,0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    base.forEach((v, t) => t === 0 ? ctx.moveTo(xS(t), yS(v)) : ctx.lineTo(xS(t), yS(v)));
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(xS(0), yS(base[0]), 5, 0, Math.PI * 2);
    ctx.fillStyle = "#FFD700";
    ctx.fill();
    setDrawn({ xS, yS, N, base, optimistic, pessimistic, margin, plotW, plotH });
  }, [projection, dimensions]);
  const handleMouseMove = (e) => {
    if (!drawn || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const t = Math.round((mouseX - drawn.margin.left) / drawn.plotW * drawn.N);
    if (t < 0 || t > drawn.N) {
      setTooltip(null);
      return;
    }
    setTooltip({ x: mouseX, t, base: drawn.base[t], opt: drawn.optimistic[t], pes: drawn.pessimistic[t] });
  };
  const fmtEur = (v) => {
    if (v == null) return "\u2014";
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M\u20AC`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K\u20AC`;
    return `${v.toFixed(0)}\u20AC`;
  };
  if (loadingData) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", color: "var(--text-secondary)" } }, "Cargando hist\xF3rico de precios...");
  if (!historyBatch) return /* @__PURE__ */ React.createElement("div", { style: { padding: "2rem", color: "var(--text-secondary)" } }, "Sin datos de hist\xF3rico. Actualiza las cotizaciones primero.");
  const currentPortfolioValue = summary?.funds?.reduce((s, f) => s + (f.Valor_Actual || 0), 0) || 0;
  const noFunds = !projection || projection.fundLines.length === 0;
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "0.5rem", fontWeight: 600 } }, '\u{1F52E} Proyecci\xF3n de Crecimiento "What If"'), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" } }, "Proyecci\xF3n partiendo del patrimonio actual usando el CAGR hist\xF3rico ponderado de cada fondo. Puedes a\xF1adir aportaci\xF3n adicional inicial y/o una aportaci\xF3n anual recurrente."), currentPortfolioValue > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.25rem", padding: "10px 16px", background: "rgba(255,215,0,0.08)", borderRadius: "10px", border: "1px solid rgba(255,215,0,0.2)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Patrimonio actual:"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 800, fontSize: "1.15rem", color: "#FFD700", fontVariantNumeric: "tabular-nums" } }, fmtEur(currentPortfolioValue)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", marginLeft: "8px" } }, "(punto de partida de la proyecci\xF3n)")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 180px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Aportaci\xF3n extra inicial (\u20AC)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      step: "1000",
      value: extraInversion,
      onChange: (e) => setExtraInversion(e.target.value),
      style: { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.9rem" }
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 180px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Aportaci\xF3n anual (\u20AC)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      step: "500",
      value: aporteAnual,
      onChange: (e) => setAporteAnual(e.target.value),
      style: { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.9rem" }
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 130px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Horizonte (a\xF1os)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "1",
      max: "50",
      step: "1",
      value: years,
      onChange: (e) => setYears(e.target.value),
      style: { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.9rem" }
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 200px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "CAGR hist\xF3rico \u2014 ventana look-back"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px" } }, ["3Y", "5Y", "10Y", "MAX"].map((lb) => /* @__PURE__ */ React.createElement("button", { key: lb, onClick: () => setLookback(lb), style: {
    flex: 1,
    padding: "10px 6px",
    borderRadius: "8px",
    border: lookback === lb ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)",
    background: lookback === lb ? "var(--accent-glow)" : "transparent",
    color: lookback === lb ? "#000" : "var(--text-primary)",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.85rem",
    transition: "all 0.15s"
  } }, lb)))), /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 200px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Bandas de confianza (\u03C3 = ", parseFloat(sigma).toFixed(1), ")"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px" } }, ["0.5", "1.0", "1.5", "2.0"].map((s) => /* @__PURE__ */ React.createElement("button", { key: s, onClick: () => setSigma(s), style: {
    flex: 1,
    padding: "10px 6px",
    borderRadius: "8px",
    border: sigma === s ? "1px solid var(--accent-secondary)" : "1px solid var(--border-glass)",
    background: sigma === s ? "var(--accent-secondary)" : "transparent",
    color: sigma === s ? "#000" : "var(--text-primary)",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.85rem",
    transition: "all 0.15s"
  } }, s, "\u03C3")))), /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 200px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Inflaci\xF3n Espa\xF1a CPI (%/a\xF1o)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px" } }, ["0", "1.5", "2.5", "3.5"].map((inf) => /* @__PURE__ */ React.createElement("button", { key: inf, onClick: () => setInflacion(inf), style: {
    flex: 1,
    padding: "10px 4px",
    borderRadius: "8px",
    border: inflacion === inf ? "1px solid rgba(251,146,60,0.8)" : "1px solid var(--border-glass)",
    background: inflacion === inf ? "rgba(251,146,60,0.25)" : "transparent",
    color: inflacion === inf ? "rgb(251,146,60)" : "var(--text-primary)",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.8rem",
    transition: "all 0.15s"
  } }, inf === "0" ? "Sin" : inf + "%"))))), noFunds && /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--warning)", fontSize: "0.85rem" } }, "\u26A0\uFE0F No hay fondos con suficiente hist\xF3rico para el per\xEDodo seleccionado. Prueba con MAX."), projection && !noFunds && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", padding: "12px 16px", background: "rgba(0,0,0,0.2)", borderRadius: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 14px", background: "rgba(255,215,0,0.08)", borderRadius: "8px", border: "1px solid rgba(255,215,0,0.15)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "INICIO"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: "#FFD700", fontSize: "1.05rem" } }, fmtEur(projection.X0))), projection.aporte > 0 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "APORTE/A\xD1O"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: "var(--accent-glow)", fontSize: "1.05rem" } }, fmtEur(projection.aporte))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "CAGR CARTERA (", lookback, ")"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: projection.portCagrDec >= 0 ? "var(--success)" : "var(--danger)", fontSize: "1.05rem" } }, projection.portCagrDec >= 0 ? "+" : "", (projection.portCagrDec * 100).toFixed(2), "%")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "VOL CARTERA"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: "1.05rem" } }, (projection.portVolDec * 100).toFixed(2), "%")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "BASE ", (/* @__PURE__ */ new Date()).getFullYear() + projection.N, projection.infRate > 0 ? " (real)" : ""), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: "#FFD700", fontSize: "1.05rem" } }, fmtEur(projection.base[projection.N]))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "OPTIMISTA (+", parseFloat(sigma).toFixed(1), "\u03C3)", projection.infRate > 0 ? " real" : ""), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: "var(--success)", fontSize: "1.05rem" } }, fmtEur(projection.optimistic[projection.N]))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)" } }, "PESIMISTA (-", parseFloat(sigma).toFixed(1), "\u03C3)", projection.infRate > 0 ? " real" : ""), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: "var(--danger)", fontSize: "1.05rem" } }, fmtEur(projection.pessimistic[projection.N]))))), projection && !noFunds && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F4C8} Evoluci\xF3n Proyectada"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "14px", marginBottom: "10px", flexWrap: "wrap", fontSize: "0.78rem" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "5px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "22px", height: "3px", background: "#FFD700", display: "inline-block", borderRadius: "2px" } }), " Base", parseFloat(inflacion) > 0 ? ` (real, \u2212${parseFloat(inflacion).toFixed(1)}% CPI)` : " (nominal)"), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "5px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "22px", height: "0", borderTop: "2px dashed rgba(74,222,128,0.7)", display: "inline-block" } }), " Optimista (+", parseFloat(sigma).toFixed(1), "\u03C3)", parseFloat(inflacion) > 0 ? " real" : ""), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: "5px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "22px", height: "0", borderTop: "2px dashed rgba(239,68,68,0.7)", display: "inline-block" } }), " Pesimista (-", parseFloat(sigma).toFixed(1), "\u03C3)", parseFloat(inflacion) > 0 ? " real" : "")), /* @__PURE__ */ React.createElement("div", { ref: containerRef, style: { position: "relative", width: "100%" } }, /* @__PURE__ */ React.createElement(
    "canvas",
    {
      ref: canvasRef,
      style: { display: "block", cursor: "crosshair" },
      onMouseMove: handleMouseMove,
      onMouseLeave: () => setTooltip(null)
    }
  ), tooltip && /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: tooltip.x > dimensions.w / 2 ? tooltip.x - 195 : tooltip.x + 15,
    top: 20,
    background: "rgba(15,20,35,0.95)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    padding: "10px 14px",
    pointerEvents: "none",
    backdropFilter: "blur(12px)",
    minWidth: "165px",
    zIndex: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "6px", fontWeight: 600 } }, (/* @__PURE__ */ new Date()).getFullYear() + tooltip.t), [["#FFD700", "Base", tooltip.base], ["var(--success)", "Optimista", tooltip.opt], ["var(--danger)", "Pesimista", tooltip.pes]].map(([c, l, v]) => /* @__PURE__ */ React.createElement("div", { key: l, style: { display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "0.78rem", padding: "2px 0" } }, /* @__PURE__ */ React.createElement("span", { style: { color: c } }, l), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: c } }, fmtEur(v))))))), projection && !noFunds && projection.fundLines.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { marginBottom: "1rem", fontWeight: 600 } }, "Contribuci\xF3n por Fondo"), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "1px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 600 } }, "Fondo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 600 } }, "Peso"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 600 } }, "CAGR (", lookback, ")"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 600 } }, "Volatilidad"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 600 } }, "Valor inicial"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 600 } }, "Aporte/a\xF1o"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 600 } }, "Base (", (/* @__PURE__ */ new Date()).getFullYear() + projection.N, ")"))), /* @__PURE__ */ React.createElement("tbody", null, projection.fundLines.slice().sort((a, b) => b.w - a.w).map((f) => {
    const initial = projection.X0 * f.w;
    const porteAnualFund = projection.aporte * f.w;
    let finalBase = initial;
    for (let t = 1; t <= projection.N; t++) finalBase = finalBase * (1 + f.cagr) + porteAnualFund;
    return /* @__PURE__ */ React.createElement("tr", { key: f.name, style: { borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: f.name }, f.name.substring(0, 30)), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, (f.w * 100).toFixed(1), "%"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: f.cagr >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, f.cagr >= 0 ? "+" : "", (f.cagr * 100).toFixed(2), "%"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, (f.vol * 100).toFixed(2), "%"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, fmtEur(initial)), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--accent-glow)" } }, projection.aporte > 0 ? fmtEur(porteAnualFund) : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#FFD700", fontVariantNumeric: "tabular-nums" } }, fmtEur(finalBase)));
  })))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "12px", fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", lineHeight: 1.5 } }, "\u26A0\uFE0F Proyecci\xF3n basada en CAGR hist\xF3rico (", lookback, ") y volatilidad anualizada. Rentabilidades pasadas no garantizan resultados futuros. El modelo aplica CAGR constante con aportaci\xF3n anual distribuida por pesos.")));
};
const SimuladorTab = () => {
  const [subTab, setSubTab] = useState("anadir");
  const subTabs = [{ id: "anadir", label: "\u2795 A\xF1adir Fondo" }, { id: "rebalancear", label: "\u2696\uFE0F Rebalancear Cartera" }, { id: "proyeccion", label: "\u{1F52E} Proyecci\xF3n" }];
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px", background: "rgba(0,0,0,0.3)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-glass)", marginBottom: "1.5rem", width: "fit-content" } }, subTabs.map((st) => /* @__PURE__ */ React.createElement("button", { key: st.id, onClick: () => setSubTab(st.id), style: { padding: "8px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem", transition: "all 0.15s", background: subTab === st.id ? "var(--accent-glow)" : "transparent", color: subTab === st.id ? "#000" : "var(--text-primary)" } }, st.label))), subTab === "anadir" && /* @__PURE__ */ React.createElement(AnadirFondoTab, null), subTab === "rebalancear" && /* @__PURE__ */ React.createElement(RebalancearTab, null), subTab === "proyeccion" && /* @__PURE__ */ React.createElement(ProyeccionTab, null));
};
const RetiradasTab = () => {
  const [targetAmount, setTargetAmount] = useState("");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRacional, setShowRacional] = useState(false);
  const [traspaso, setTraspaso] = useState(null);
  const [traspasoLoading, setTraspasoLoading] = useState(false);
  const [fifoAmount, setFifoAmount] = useState("");
  const [fifoResult, setFifoResult] = useState(null);
  const [fifoLoading, setFifoLoading] = useState(false);
  const [fifoError, setFifoError] = useState(null);
  const [fifoShowDetail, setFifoShowDetail] = useState(false);
  React.useEffect(() => {
    setTraspasoLoading(true);
    fetch("/api/portfolio/traspaso-analysis").then((r) => r.ok ? r.json() : Promise.reject(r)).then((data) => {
      setTraspaso(data);
      setTraspasoLoading(false);
    }).catch(() => setTraspasoLoading(false));
  }, []);
  const runFifoOptimization = () => {
    const amt = parseFloat(fifoAmount);
    if (!amt || amt <= 0) return;
    setFifoLoading(true);
    setFifoError(null);
    setFifoResult(null);
    const body = { target_amount: amt };
    fetch("/api/portfolio/traspaso-optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(async (r) => {
      if (!r.ok) {
        let detail = "Error en la API";
        try {
          const b = await r.json();
          detail = b.detail || JSON.stringify(b);
        } catch {
        }
        throw new Error(detail);
      }
      return r.json();
    }).then((result) => {
      setFifoResult(result);
      setFifoLoading(false);
    }).catch((e) => {
      setFifoError(e.message);
      setFifoLoading(false);
    });
  };
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
  const fmt = (n, dec = 0) => n != null ? n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "\u2014";
  const fmtEur = (n, dec = 2) => n != null ? `\u20AC${fmt(n, dec)}` : "\u2014";
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
  } }, f.cualifica_traspaso ? "\u2713 S\xED" : "\u2717 No"))))))), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.75rem", fontStyle: "italic" } }, "* Se asume que todos los fondos son IICs (fondos de inversi\xF3n). Verifica que no hay ETFs en cartera antes de ejecutar un traspaso. El ahorro es temporal (diferimiento), no eliminaci\xF3n del impuesto.")), !traspasoLoading && (!traspaso || traspaso.length === 0) && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.85rem" } }, "No hay datos de posiciones disponibles.")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", marginBottom: "1.5rem", borderLeft: "3px solid var(--success)" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "0.5rem", fontWeight: 600 } }, "\u{1F3AF} Quiero retirar dinero \u2014 \xBFC\xF3mo pago menos?"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem", lineHeight: 1.6 } }, "Algoritmo greedy global \xF3ptimo: analiza ", /* @__PURE__ */ React.createElement("em", null, "todos"), " los lotes de ", /* @__PURE__ */ React.createElement("em", null, "todos"), " los fondos, selecciona los de menor plusval\xEDa para reembolso, y los lotes FIFO-bloqueantes se traspasan autom\xE1ticamente (coste = ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--success)" } }, "0\u20AC"), " bajo Art. 94 Ley 35/2006 IRPF). El destino del traspaso es un ", /* @__PURE__ */ React.createElement("strong", null, "fondo indexado"), " (existente en cartera o nueva sugerencia)."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 220px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Importe a retirar (\u20AC)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "100",
      step: "1000",
      value: fifoAmount,
      onChange: (e) => setFifoAmount(e.target.value),
      placeholder: "10000",
      style: { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "1rem" }
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: runFifoOptimization,
      disabled: !fifoAmount || fifoLoading,
      style: {
        padding: "10px 24px",
        height: "42px",
        background: !fifoAmount ? "var(--border-glass)" : "linear-gradient(135deg, #00c864, #00a050)",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontWeight: 700,
        cursor: !fifoAmount ? "not-allowed" : "pointer",
        fontSize: "0.9rem",
        transition: "all 0.2s"
      }
    },
    fifoLoading ? "\u23F3 Calculando..." : "\u{1F3AF} Calcular estrategia \xF3ptima"
  )), fifoError && /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 14px", background: "rgba(220,50,50,0.15)", borderRadius: "8px", color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" } }, fifoError), fifoResult && (() => {
    const dest = fifoResult.destination_fund;
    const isPortfolioIndex = dest && dest.tipo === "portfolio_index";
    return /* @__PURE__ */ React.createElement("div", { style: { marginTop: "1.5rem" } }, dest && /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem 1.2rem", borderRadius: "10px", background: isPortfolioIndex ? "rgba(0,200,100,0.07)" : "rgba(0,150,255,0.07)", border: `1px solid ${isPortfolioIndex ? "rgba(0,200,100,0.3)" : "rgba(0,150,255,0.3)"}`, marginBottom: "1.2rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" } }, isPortfolioIndex ? "\u2705 Fondo destino \u2014 ya en tu cartera" : "\u{1F4A1} Fondo destino sugerido"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem" } }, dest.nombre), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-secondary)", marginTop: "2px" } }, dest.isin)), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: "200px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 } }, dest.motivo)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { style: { padding: "3px 10px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, background: "rgba(0,200,100,0.15)", color: "var(--success)" } }, dest.is_index ? "\u{1F4CA} Indexado" : "Fondo IIC"))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "1.2rem", borderRadius: "12px", background: "rgba(220,50,50,0.08)", border: "1px solid rgba(220,50,50,0.3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, marginBottom: "0.75rem", color: "var(--danger)", fontSize: "0.9rem" } }, "\u274C Venta directa FIFO (sin traspasos)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Ganancia patrimonial"), /* @__PURE__ */ React.createElement("strong", null, fmtEur(fifoResult.escenario_directo.ganancia_patrimonial))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Impuesto IRPF"), /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--danger)" } }, "-", fmtEur(fifoResult.escenario_directo.impuesto))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.9rem", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "6px", marginTop: "4px" } }, /* @__PURE__ */ React.createElement("span", null, "Neto recibido"), /* @__PURE__ */ React.createElement("strong", null, fmtEur(fifoResult.escenario_directo.neto_recibido))))), /* @__PURE__ */ React.createElement("div", { style: { padding: "1.2rem", borderRadius: "12px", background: "rgba(0,200,100,0.08)", border: "1px solid rgba(0,200,100,0.3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, marginBottom: "0.75rem", color: "var(--success)", fontSize: "0.9rem" } }, "\u2705 \xD3ptimo: traspaso previo + reembolso"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Ganancia patrimonial"), /* @__PURE__ */ React.createElement("strong", null, fmtEur(fifoResult.escenario_optimizado.ganancia_patrimonial))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.85rem" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "Impuesto IRPF"), /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--success)" } }, "-", fmtEur(fifoResult.escenario_optimizado.impuesto))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "0.9rem", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "6px", marginTop: "4px" } }, /* @__PURE__ */ React.createElement("span", null, "Neto recibido"), /* @__PURE__ */ React.createElement("strong", null, fmtEur(fifoResult.escenario_optimizado.neto_recibido)))))), /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem 1.5rem", borderRadius: "12px", background: "rgba(0,200,100,0.12)", border: "2px solid rgba(0,200,100,0.4)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" } }, "Ahorro fiscal"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "2rem", fontWeight: 800, color: "var(--success)" } }, "+", fmtEur(fifoResult.ahorro_fiscal))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "2px" } }, "Reducci\xF3n del impuesto"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.4rem", fontWeight: 700, color: "var(--success)" } }, fifoResult.ahorro_fiscal_pct ? fifoResult.ahorro_fiscal_pct.toFixed(1) : "0.0", "%")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "2px" } }, "Plusval\xEDa diferida al destino"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1rem", fontWeight: 600, color: "var(--warning)" } }, "~", fmtEur(fifoResult.plusvalia_diferida))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "2px" } }, "Importe a traspasar"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1rem", fontWeight: 600, color: "#4db8ff" } }, fmtEur(fifoResult.importe_traspasado)))), /* @__PURE__ */ React.createElement(
      "div",
      {
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: "0.75rem", userSelect: "none" },
        onClick: () => setFifoShowDetail((v) => !v)
      },
      /* @__PURE__ */ React.createElement("h5", { style: { margin: 0, fontWeight: 600 } }, "\u{1F4CB} Plan de acci\xF3n paso a paso"),
      /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "1.1rem" } }, fifoShowDetail ? "\u25B2" : "\u25BC")
    ), fifoShowDetail && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "1.2rem" } }, fifoResult.plan_traspasos && fifoResult.plan_traspasos.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", borderRadius: "10px", background: "rgba(0,150,255,0.07)", border: "1px solid rgba(0,150,255,0.25)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, marginBottom: "0.5rem", color: "#4db8ff", fontSize: "0.95rem" } }, "\u{1F4E4} Paso 1 \u2014 Traspasar ", fmtEur(fifoResult.importe_traspasado), " a:", /* @__PURE__ */ React.createElement("strong", { style: { marginLeft: "8px", color: "var(--text-primary)" } }, dest ? dest.nombre : "\u2014"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "8px", fontSize: "0.72rem", fontFamily: "monospace", color: "var(--text-secondary)" } }, dest ? dest.isin : ""), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "10px", padding: "2px 8px", borderRadius: "4px", background: "rgba(0,200,100,0.15)", color: "var(--success)", fontWeight: 600, fontSize: "0.75rem" } }, "0\u20AC impuesto")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 0.75rem 0", lineHeight: 1.5 } }, "Traspaso exento bajo Art. 94 Ley 35/2006 IRPF. La plusval\xEDa latente queda diferida en el fondo destino."), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", minWidth: "600px", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left" } }, "Fondo origen"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left" } }, "Lote compra"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Participaciones"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Importe"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Plusval\xEDa diferida"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Precio compra"))), /* @__PURE__ */ React.createElement("tbody", null, fifoResult.plan_traspasos.map((t, i) => /* @__PURE__ */ React.createElement("tr", { key: i }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.82rem", fontWeight: 500 } }, t.Fondo), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text-secondary)" } }, t.ISIN)), /* @__PURE__ */ React.createElement("td", { style: { fontFamily: "monospace", color: "var(--text-secondary)", fontSize: "0.8rem" } }, t.Fecha_Compra || "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right" } }, t.Participaciones ? t.Participaciones.toFixed(4) : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600 } }, fmtEur(t.Importe_Traspasado)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: (t.Plusvalia_Diferida || 0) >= 0 ? "var(--warning)" : "var(--danger)" } }, (t.Plusvalia_Diferida || 0) >= 0 ? "+" : "", fmtEur(t.Plusvalia_Diferida)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--text-secondary)", fontSize: "0.78rem" } }, t.Precio_Compra_Unitario ? `\u20AC${t.Precio_Compra_Unitario.toFixed(4)}` : "\u2014"))))))), fifoResult.plan_traspasos && fifoResult.plan_traspasos.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "0.75rem 1rem", background: "rgba(0,200,100,0.07)", borderRadius: "8px", fontSize: "0.85rem", color: "var(--success)" } }, "\u2705 No se necesitan traspasos previos \u2014 los lotes m\xE1s baratos ya est\xE1n disponibles para reembolso directo."), /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", borderRadius: "10px", background: "rgba(0,200,100,0.07)", border: "1px solid rgba(0,200,100,0.25)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, marginBottom: "0.5rem", color: "var(--success)", fontSize: "0.95rem" } }, "\u{1F4B5} Paso 2 \u2014 Reembolsar ", fmtEur(parseFloat(fifoAmount)), " en efectivo", /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "10px", fontSize: "0.75rem", padding: "2px 8px", borderRadius: "4px", background: "rgba(0,200,100,0.15)", color: "var(--success)", fontWeight: 600 } }, "Impuesto: ", fmtEur(fifoResult.escenario_optimizado.impuesto))), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 0.75rem 0", lineHeight: 1.5 } }, fifoResult.plan_traspasos && fifoResult.plan_traspasos.length > 0 ? "Una vez completado el traspaso (3\u20135 d\xEDas h\xE1biles), solicita el reembolso. FIFO opera ahora sobre los lotes m\xE1s recientes." : "Solicita el reembolso directamente. El optimizador ha seleccionado los lotes con menor plusval\xEDa de toda la cartera."), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", minWidth: "600px", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left" } }, "Fondo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left" } }, "Lote compra"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Participaciones"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Importe"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Ganancia (tributa)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Precio compra"))), /* @__PURE__ */ React.createElement("tbody", null, (fifoResult.plan_reembolso || []).map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.82rem", fontWeight: 500 } }, r.Fondo), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text-secondary)" } }, r.ISIN)), /* @__PURE__ */ React.createElement("td", { style: { fontFamily: "monospace", color: "var(--text-secondary)", fontSize: "0.8rem" } }, r.Fecha_Compra || "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right" } }, r.Participaciones ? r.Participaciones.toFixed(4) : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600 } }, fmtEur(r.Importe)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: (r.Ganancia_Patrimonial || 0) >= 0 ? "var(--success)" : "var(--danger)" } }, (r.Ganancia_Patrimonial || 0) >= 0 ? "+" : "", fmtEur(r.Ganancia_Patrimonial)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--text-secondary)", fontSize: "0.78rem" } }, r.Precio_Compra_Unitario ? `\u20AC${r.Precio_Compra_Unitario.toFixed(4)}` : "\u2014"))))))), fifoResult.portfolio_after && fifoResult.portfolio_after.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, marginBottom: "0.75rem", fontSize: "0.95rem" } }, "\u{1F4CA} Cartera resultante tras las operaciones"), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", minWidth: "560px", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left" } }, "Fondo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Antes"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Despu\xE9s"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right" } }, "Cambio"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left" } }, "Operaci\xF3n"))), /* @__PURE__ */ React.createElement("tbody", null, fifoResult.portfolio_after.map((f, i) => {
      const opLabel = {
        "destino": "\u{1F4E5} Destino traspaso",
        "reembolso": "\u{1F4B5} Reembolso",
        "traspaso_out": "\u{1F4E4} Traspaso salida",
        "traspaso_out+reembolso": "\u{1F4E4} Traspaso + reembolso",
        "sin_cambio": "\u2014"
      }[f.operacion] || f.operacion;
      const badgeColor = {
        "destino": "rgba(0,200,100,0.15)",
        "reembolso": "rgba(220,50,50,0.15)",
        "traspaso_out": "rgba(0,150,255,0.15)",
        "traspaso_out+reembolso": "rgba(255,165,0,0.15)"
      }[f.operacion] || "transparent";
      const textColor = {
        "destino": "var(--success)",
        "reembolso": "var(--danger)",
        "traspaso_out": "#4db8ff",
        "traspaso_out+reembolso": "var(--warning)"
      }[f.operacion] || "var(--text-secondary)";
      return /* @__PURE__ */ React.createElement("tr", { key: i, style: { opacity: f.valor_despues === 0 && f.operacion !== "destino" ? 0.45 : 1 } }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: f.es_destino ? 700 : 400, fontSize: "0.82rem" } }, f.nombre), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text-secondary)" } }, f.isin)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: "var(--text-secondary)" } }, fmtEur(f.valor_antes)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", fontWeight: 600 } }, fmtEur(f.valor_despues)), /* @__PURE__ */ React.createElement("td", { style: { textAlign: "right", color: f.cambio_valor >= 0 ? "var(--success)" : "var(--danger)" } }, f.cambio_valor >= 0 ? "+" : "", fmtEur(f.cambio_valor)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { style: { padding: "2px 8px", borderRadius: "4px", background: badgeColor, color: textColor, fontSize: "0.75rem", fontWeight: 500 } }, opLabel)));
    }))))), /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 14px", background: "rgba(255,165,0,0.07)", borderRadius: "8px", border: "1px solid rgba(255,165,0,0.2)", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6 } }, "\u26A0\uFE0F ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--warning)" } }, "Base legal y advertencias:"), " ", fifoResult.notas)));
  })()), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1rem", fontWeight: 600 } }, "\u{1F4B0} Retirada de Fondos \u2014 Optimizaci\xF3n Fiscal"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" } }, "Calcula el plan de venta \xF3ptimo para minimizar impuestos sobre la ganancia patrimonial. Usa contabilidad FIFO y prioriza los lotes con ", /* @__PURE__ */ React.createElement("strong", null, "menor plusval\xEDa relativa"), " para diferir el m\xE1ximo impuesto posible."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 220px" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Importe a retirar (\u20AC)"), /* @__PURE__ */ React.createElement(
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
const TimingScoreBar = ({ score, height = 8 }) => {
  const color = score >= 75 ? "#00c853" : score >= 60 ? "#448aff" : score >= 40 ? "#90a4ae" : score >= 25 ? "#ffd600" : "#ff9100";
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", width: "100%" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: `${height}px`, background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${score}%`, height: "100%", background: color, borderRadius: "4px", transition: "width 0.5s ease" } })), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color, fontSize: "0.9rem", minWidth: "32px", textAlign: "right" } }, score));
};
const SubScoreBar = ({ label, icon, score }) => /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: "100px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-secondary)", marginBottom: "2px" } }, icon, " ", label), /* @__PURE__ */ React.createElement(TimingScoreBar, { score: score || 50, height: 5 }));
const SignalBadge = ({ label, value, unit = "", good, neutral }) => {
  const isGood = typeof good === "function" ? good(value) : false;
  const isNeutral = typeof neutral === "function" ? neutral(value) : false;
  const color = isGood ? "var(--success)" : isNeutral ? "var(--text-secondary)" : "var(--danger)";
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 10px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", minWidth: "80px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.6rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" } }, label), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "1rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" } }, value != null ? `${typeof value === "number" ? Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1) : value}${unit}` : "\u2014"));
};
const CompareChart = ({ chartData }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 320 });
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setDims({ w: e.contentRect.width, h: 320 }));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData || Object.keys(chartData).length === 0) return;
    const { w, h } = dims;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const mg = { top: 20, right: 20, bottom: 36, left: 60 };
    const pw = w - mg.left - mg.right, ph = h - mg.top - mg.bottom;
    const names = Object.keys(chartData);
    let allDates = [], allVals = [];
    names.forEach((n) => {
      chartData[n].forEach((p) => {
        allDates.push(new Date(p.date).getTime());
        allVals.push(p.price);
      });
    });
    const minX = Math.min(...allDates), maxX = Math.max(...allDates);
    const minY = Math.min(...allVals) * 0.95, maxY = Math.max(...allVals) * 1.05;
    const xS = (ts) => mg.left + (ts - minX) / (maxX - minX || 1) * pw;
    const yS = (v) => mg.top + ph - (v - minY) / (maxY - minY || 1) * ph;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "10px Inter, sans-serif";
    for (let i = 0; i <= 4; i++) {
      const v = minY + (maxY - minY) * (i / 4);
      const y = yS(v);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mg.left, y);
      ctx.lineTo(mg.left + pw, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText(v.toFixed(0), mg.left - 8, y);
    }
    names.forEach((name, idx) => {
      const pts = chartData[name];
      ctx.beginPath();
      ctx.strokeStyle = COLORS[idx % COLORS.length];
      ctx.lineWidth = 2;
      pts.forEach((p, j) => {
        const x = xS(new Date(p.date).getTime()), y = yS(p.price);
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    let lx = mg.left + 8;
    names.forEach((name, idx) => {
      ctx.fillStyle = COLORS[idx % COLORS.length];
      ctx.fillRect(lx, mg.top + 4, 12, 3);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "left";
      ctx.font = "10px Inter";
      const sn = name.length > 25 ? name.slice(0, 25) + "\u2026" : name;
      ctx.fillText(sn, lx + 16, mg.top + 8);
      lx += ctx.measureText(sn).width + 32;
    });
  }, [chartData, dims]);
  return /* @__PURE__ */ React.createElement("div", { ref: containerRef, style: { width: "100%" } }, /* @__PURE__ */ React.createElement("canvas", { ref: canvasRef }));
};
const FilterInput = ({ label, value, onChange, placeholder, type = "number", step = "1" }) => /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "110px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.6rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, label), /* @__PURE__ */ React.createElement(
  "input",
  {
    type,
    value,
    onChange,
    placeholder,
    step,
    style: { padding: "4px 6px", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-glass)", borderRadius: "4px", fontSize: "0.78rem", width: "100%" }
  }
));
const TimingChartCanvas = ({ data, signals }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 400 });
  const [tooltip, setTooltip] = useState(null);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setDims({ w: e.contentRect.width, h: 400 }));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || !data.chart) return;
    const chart = data.chart;
    if (!chart.price_series || chart.price_series.length === 0) return;
    const { w, h } = dims;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const mg = { top: 16, right: 20, bottom: 32, left: 60 };
    const splitY = h * 0.72;
    const pw = w - mg.left - mg.right;
    const ph1 = splitY - mg.top - 8;
    const ph2 = h - splitY - mg.bottom - 4;
    const allSeries = [chart.price_series, chart.regression, chart.band_2_upper, chart.band_2_lower, chart.sma200].filter(Boolean);
    let allPrices = [];
    allSeries.forEach((s) => s.forEach((p) => {
      if (p.value != null) allPrices.push(p.value);
      if (p.price != null) allPrices.push(p.price);
    }));
    if (chart.pullback_levels) {
      allPrices.push(chart.pullback_levels.max_3m);
    }
    const minP = Math.min(...allPrices) * 0.998;
    const maxP = Math.max(...allPrices) * 1.002;
    const allDates = chart.price_series.map((p) => new Date(p.date).getTime());
    const minX = Math.min(...allDates);
    const maxX = Math.max(...allDates);
    const xS = (ts) => mg.left + (ts - minX) / (maxX - minX || 1) * pw;
    const yS = (v) => mg.top + ph1 - (v - minP) / (maxP - minP || 1) * ph1;
    const yR = (v) => splitY + 4 + ph2 - v / 100 * ph2;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "10px Inter, system-ui, sans-serif";
    for (let i = 0; i <= 4; i++) {
      const v = minP + (maxP - minP) * (i / 4);
      const y = yS(v);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mg.left, y);
      ctx.lineTo(mg.left + pw, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText(v.toFixed(2), mg.left - 6, y);
    }
    const drawBand = (upper, lower, color) => {
      if (!upper || !lower || upper.length === 0) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      upper.forEach((p, j) => {
        const x = xS(new Date(p.date).getTime()), y = yS(p.value);
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      for (let j = lower.length - 1; j >= 0; j--) {
        const p = lower[j];
        ctx.lineTo(xS(new Date(p.date).getTime()), yS(p.value));
      }
      ctx.closePath();
      ctx.fill();
    };
    drawBand(chart.band_2_upper, chart.band_1_upper, "rgba(255,82,82,0.06)");
    drawBand(chart.band_1_upper, chart.regression, "rgba(255,235,59,0.05)");
    drawBand(chart.regression, chart.band_1_lower, "rgba(76,175,80,0.08)");
    drawBand(chart.band_1_lower, chart.band_2_lower, "rgba(76,175,80,0.12)");
    if (chart.regression && chart.regression.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "#ffd600";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      chart.regression.forEach((p, j) => {
        const x = xS(new Date(p.date).getTime()), y = yS(p.value);
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (chart.sma200 && chart.sma200.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(158,158,158,0.5)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      chart.sma200.forEach((p, j) => {
        const x = xS(new Date(p.date).getTime()), y = yS(p.value);
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (chart.pullback_levels) {
      const y3m = yS(chart.pullback_levels.max_3m);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(68,138,255,0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(mg.left, y3m);
      ctx.lineTo(mg.left + pw, y3m);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(68,138,255,0.5)";
      ctx.textAlign = "right";
      ctx.font = "9px Inter, system-ui, sans-serif";
      ctx.fillText(`M\xE1x 3M: ${chart.pullback_levels.max_3m.toFixed(2)}`, mg.left + pw - 2, y3m - 4);
    }
    ctx.beginPath();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    chart.price_series.forEach((p, j) => {
      const x = xS(new Date(p.date).getTime()), y = yS(p.price);
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (chart.crossovers) {
      chart.crossovers.forEach((c) => {
        if (!c.price) return;
        const x = xS(new Date(c.date).getTime()), y = yS(c.price);
        ctx.beginPath();
        if (c.type === "bullish") {
          ctx.fillStyle = "#00c853";
          ctx.moveTo(x, y);
          ctx.lineTo(x - 5, y + 8);
          ctx.lineTo(x + 5, y + 8);
        } else {
          ctx.fillStyle = "#ff5252";
          ctx.moveTo(x, y);
          ctx.lineTo(x - 5, y - 8);
          ctx.lineTo(x + 5, y - 8);
        }
        ctx.closePath();
        ctx.fill();
      });
    }
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.moveTo(mg.left, splitY);
    ctx.lineTo(mg.left + pw, splitY);
    ctx.stroke();
    if (chart.rsi_series && chart.rsi_series.length > 0) {
      [30, 50, 70].forEach((lev) => {
        const y = yR(lev);
        ctx.beginPath();
        ctx.strokeStyle = lev === 50 ? "rgba(255,255,255,0.08)" : lev === 30 ? "rgba(76,175,80,0.3)" : "rgba(255,82,82,0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.moveTo(mg.left, y);
        ctx.lineTo(mg.left + pw, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.textAlign = "right";
        ctx.font = "9px Inter, system-ui, sans-serif";
        ctx.fillText(lev.toString(), mg.left - 6, y);
      });
      ctx.fillStyle = "rgba(76,175,80,0.04)";
      ctx.fillRect(mg.left, yR(30), pw, yR(0) - yR(30));
      ctx.fillStyle = "rgba(255,82,82,0.04)";
      ctx.fillRect(mg.left, yR(100), pw, yR(70) - yR(100));
      ctx.beginPath();
      ctx.strokeStyle = "#ce93d8";
      ctx.lineWidth = 1.5;
      chart.rsi_series.forEach((p, j) => {
        const x = xS(new Date(p.date).getTime()), y = yR(p.value);
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = "#ce93d8";
      ctx.textAlign = "left";
      ctx.font = "10px Inter";
      ctx.fillText("RSI-14", mg.left + 4, splitY + 14);
    }
    ctx.textAlign = "left";
    ctx.font = "10px Inter, system-ui, sans-serif";
    let lx = mg.left + 4;
    const legendItems = [
      { color: "#ffffff", label: "Precio", dash: false },
      { color: "#ffd600", label: "Tendencia (log)", dash: true },
      { color: "rgba(76,175,80,0.5)", label: "Zona descuento (\u2212\u03C3)", dash: false },
      { color: "rgba(255,82,82,0.5)", label: "Zona premium (+\u03C3)", dash: false },
      { color: "rgba(158,158,158,0.5)", label: "SMA-200", dash: true }
    ];
    legendItems.forEach((item) => {
      if (lx > w - 100) return;
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, mg.top + 2, 12, 3);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(item.label, lx + 15, mg.top + 6);
      lx += ctx.measureText(item.label).width + 28;
    });
    ctx.textAlign = "center";
    ctx.font = "9px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    const nLabels = Math.min(6, chart.price_series.length);
    const step = Math.floor(chart.price_series.length / nLabels);
    for (let i = 0; i < chart.price_series.length; i += step) {
      const p = chart.price_series[i];
      const d = new Date(p.date);
      ctx.fillText(`${d.getDate()}/${d.getMonth() + 1}`, xS(d.getTime()), h - mg.bottom + 14);
    }
  }, [data, dims]);
  const handleMouseMove = useCallback((e) => {
    if (!data || !data.chart || !data.chart.price_series) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { w } = dims;
    const mg = { left: 60, right: 20 };
    const pw = w - mg.left - mg.right;
    const allDates = data.chart.price_series.map((p) => new Date(p.date).getTime());
    const minX = Math.min(...allDates), maxX = Math.max(...allDates);
    const t = (mx - mg.left) / pw;
    if (t < 0 || t > 1) {
      setTooltip(null);
      return;
    }
    const targetTime = minX + t * (maxX - minX);
    let closest = 0, closestDist = Infinity;
    data.chart.price_series.forEach((p, i) => {
      const diff = Math.abs(new Date(p.date).getTime() - targetTime);
      if (diff < closestDist) {
        closestDist = diff;
        closest = i;
      }
    });
    const pt = data.chart.price_series[closest];
    const regPt = data.chart.regression?.find((r) => r.date === pt.date);
    setTooltip({
      x: mx,
      date: pt.date,
      price: pt.price,
      regression: regPt?.value,
      deviation: regPt ? ((pt.price / regPt.value - 1) * 100).toFixed(2) : null
    });
  }, [data, dims]);
  if (!data || !data.chart) return null;
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: containerRef,
      style: { width: "100%", position: "relative" },
      onMouseMove: handleMouseMove,
      onMouseLeave: () => setTooltip(null)
    },
    /* @__PURE__ */ React.createElement("canvas", { ref: canvasRef, style: { display: "block" } }),
    tooltip && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      left: tooltip.x + 10,
      top: 20,
      background: "rgba(15,15,30,0.95)",
      padding: "6px 10px",
      borderRadius: "6px",
      border: "1px solid var(--border-glass)",
      fontSize: "0.72rem",
      color: "#fff",
      pointerEvents: "none",
      zIndex: 10,
      whiteSpace: "nowrap"
    } }, /* @__PURE__ */ React.createElement("div", null, new Date(tooltip.date).toLocaleDateString("es-ES")), /* @__PURE__ */ React.createElement("div", null, "Precio: ", /* @__PURE__ */ React.createElement("strong", null, tooltip.price?.toFixed(4))), tooltip.regression && /* @__PURE__ */ React.createElement("div", null, "Tendencia: ", tooltip.regression.toFixed(4)), tooltip.deviation && /* @__PURE__ */ React.createElement("div", { style: { color: parseFloat(tooltip.deviation) < 0 ? "#4caf50" : "#ff5252" } }, "Desviaci\xF3n: ", tooltip.deviation, "%"))
  );
};
const OportunidadesTab = () => {
  const [subTab, setSubTab] = useState("scanner");
  const [opportunities, setOpportunities] = useState(null);
  const [loading, setLoading] = useState(false);
  const [weights, setWeights] = useState(null);
  const [presets, setPresets] = useState(null);
  const [defaultWeights, setDefaultWeights] = useState(null);
  const [activePreset, setActivePreset] = useState("balanced");
  const [showWeightPanel, setShowWeightPanel] = useState(false);
  const [chartData, setChartData] = useState({});
  const [chartLoading, setChartLoading] = useState({});
  const [expandedCharts, setExpandedCharts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [enrichedFunds, setEnrichedFunds] = useState([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState("");
  const [filters, setFilters] = useState({ ret5yMin: "", ret1yMax: "", terMax: "", sharpeMin: "", ratingMin: "", timingMin: "", category: "" });
  const [sortCol, setSortCol] = useState("timing_score");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedFunds, setSelectedFunds] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [comparingLoading, setComparingLoading] = useState(false);
  const [fundDetail, setFundDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    fetch("/api/portfolio/timing-presets").then((r) => r.json()).then((d) => {
      setPresets(d.presets);
      setDefaultWeights(d.default_weights);
      const saved = localStorage.getItem("timing_weights");
      const savedPreset = localStorage.getItem("timing_preset");
      if (saved) {
        try {
          setWeights(JSON.parse(saved));
        } catch {
          setWeights(d.default_weights);
        }
      } else {
        setWeights(d.default_weights);
      }
      if (savedPreset) setActivePreset(savedPreset);
    }).catch(() => {
      const fallback = { trend: 0.25, pullback: 0.15, divergence: 0.15, rsi: 0.15, vol_regime: 0.1, short_term: 0.2 };
      setWeights(fallback);
      setDefaultWeights(fallback);
    });
  }, []);
  const loadOpportunities = () => {
    setLoading(true);
    const url = weights ? `/api/portfolio/opportunities?weights=${encodeURIComponent(JSON.stringify(weights))}` : "/api/portfolio/opportunities";
    fetch(url).then((r) => r.json()).then((d) => {
      setOpportunities(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => {
    if (weights) loadOpportunities();
  }, []);
  const applyPreset = (presetKey) => {
    if (!presets || !presets[presetKey]) return;
    const w = presets[presetKey].weights;
    setWeights(w);
    setActivePreset(presetKey);
    localStorage.setItem("timing_weights", JSON.stringify(w));
    localStorage.setItem("timing_preset", presetKey);
  };
  const updateWeight = (key, val) => {
    setWeights((prev) => {
      const updated = { ...prev, [key]: Math.max(0, parseFloat(val) || 0) };
      return updated;
    });
    setActivePreset("custom");
  };
  const normalizeWeights = () => {
    if (!weights) return;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const normalized = {};
    for (const [k, v] of Object.entries(weights)) {
      normalized[k] = Math.round(v / total * 100) / 100;
    }
    const diff = 1 - Object.values(normalized).reduce((a, b) => a + b, 0);
    const firstKey = Object.keys(normalized)[0];
    normalized[firstKey] = Math.round((normalized[firstKey] + diff) * 100) / 100;
    setWeights(normalized);
    localStorage.setItem("timing_weights", JSON.stringify(normalized));
  };
  const applyWeightsAndReload = () => {
    normalizeWeights();
    localStorage.setItem("timing_weights", JSON.stringify(weights));
    loadOpportunities();
  };
  const toggleChart = (isin) => {
    const isExpanded = expandedCharts[isin];
    if (isExpanded) {
      setExpandedCharts((prev) => ({ ...prev, [isin]: false }));
      return;
    }
    setExpandedCharts((prev) => ({ ...prev, [isin]: true }));
    if (chartData[isin]) return;
    setChartLoading((prev) => ({ ...prev, [isin]: true }));
    fetch(`/api/portfolio/opportunity/${isin}/chart-data?months=12`).then((r) => r.json()).then((d) => {
      setChartData((prev) => ({ ...prev, [isin]: d }));
      setChartLoading((prev) => ({ ...prev, [isin]: false }));
    }).catch(() => setChartLoading((prev) => ({ ...prev, [isin]: false })));
  };
  const handleSearch = () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    setEnrichedFunds([]);
    setComparison(null);
    fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(searchQuery)}&limit=40`).then((r) => r.json()).then((d) => {
      setSearchResults(d);
      setSearching(false);
    }).catch(() => setSearching(false));
  };
  const toggleFundSelect = (isin, name) => {
    setSelectedFunds((prev) => {
      const existing = prev.find((f) => f.isin === isin);
      if (existing) return prev.filter((f) => f.isin !== isin);
      if (prev.length >= 6) return prev;
      return [...prev, { isin, name }];
    });
  };
  const handleCompare = () => {
    if (selectedFunds.length < 2) return;
    setComparingLoading(true);
    fetch("/api/portfolio/compare-funds?years=5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectedFunds.map((f) => f.isin))
    }).then((r) => r.json()).then((d) => {
      setComparison(d);
      setComparingLoading(false);
    }).catch(() => setComparingLoading(false));
  };
  const viewFundDetail = (isin) => {
    setDetailLoading(true);
    setFundDetail(null);
    fetch(`/api/portfolio/opportunity/${isin}`).then((r) => r.json()).then((d) => {
      setFundDetail(d);
      setDetailLoading(false);
    }).catch(() => setDetailLoading(false));
  };
  const handleEnrich = async () => {
    const isins = searchResults.map((r) => r.isin);
    if (isins.length === 0) return;
    setEnriching(true);
    setEnrichProgress("Cargando m\xE9tricas...");
    const batchSize = 10;
    let all = [];
    for (let i = 0; i < isins.length; i += batchSize) {
      const batch = isins.slice(i, i + batchSize);
      setEnrichProgress(`Procesando ${i + 1}-${Math.min(i + batchSize, isins.length)} de ${isins.length}...`);
      try {
        const res = await fetch("/api/portfolio/fund/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch)
        });
        const data = await res.json();
        all = [...all, ...data];
      } catch {
      }
    }
    setEnrichedFunds(all);
    setEnriching(false);
    setEnrichProgress("");
  };
  const filteredFunds = useMemo(() => {
    let list = [...enrichedFunds];
    const f = filters;
    if (f.ret5yMin) list = list.filter((fd) => (fd.returns?.["5y"] ?? -999) >= +f.ret5yMin);
    if (f.ret1yMax) list = list.filter((fd) => (fd.returns?.["1y"] ?? 999) <= +f.ret1yMax);
    if (f.terMax) list = list.filter((fd) => fd.expense_ratio != null && fd.expense_ratio * 100 <= +f.terMax);
    if (f.sharpeMin) list = list.filter((fd) => (fd.signals?.sharpe ?? fd.metrics?.sharpe_ratio ?? -999) >= +f.sharpeMin);
    if (f.ratingMin) list = list.filter((fd) => (fd.rating ?? 0) >= +f.ratingMin);
    if (f.timingMin) list = list.filter((fd) => (fd.signals?.timing_score ?? 0) >= +f.timingMin);
    if (f.category) list = list.filter((fd) => (fd.category || "").toLowerCase().includes(f.category.toLowerCase()));
    const col = sortCol;
    list.sort((a, b) => {
      let va, vb;
      if (col === "timing_score") {
        va = a.signals?.timing_score ?? 0;
        vb = b.signals?.timing_score ?? 0;
      } else if (col === "ret_5y") {
        va = a.returns?.["5y"] ?? -999;
        vb = b.returns?.["5y"] ?? -999;
      } else if (col === "ret_3y") {
        va = a.returns?.["3y"] ?? -999;
        vb = b.returns?.["3y"] ?? -999;
      } else if (col === "ret_1y") {
        va = a.returns?.["1y"] ?? -999;
        vb = b.returns?.["1y"] ?? -999;
      } else if (col === "sharpe") {
        va = a.signals?.sharpe ?? a.metrics?.sharpe_ratio ?? -999;
        vb = b.signals?.sharpe ?? b.metrics?.sharpe_ratio ?? -999;
      } else if (col === "ter") {
        va = a.expense_ratio ?? 999;
        vb = b.expense_ratio ?? 999;
      } else if (col === "rating") {
        va = a.rating ?? 0;
        vb = b.rating ?? 0;
      } else if (col === "volatility") {
        va = a.signals?.volatility_pct ?? 999;
        vb = b.signals?.volatility_pct ?? 999;
      } else if (col === "max_dd") {
        va = a.signals?.max_drawdown_pct ?? -999;
        vb = b.signals?.max_drawdown_pct ?? -999;
      } else if (col === "z_trend") {
        va = a.signals?.z_trend ?? 0;
        vb = b.signals?.z_trend ?? 0;
      } else {
        va = 0;
        vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return list;
  }, [enrichedFunds, filters, sortCol, sortDir]);
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  const SortHeader = ({ col, children }) => /* @__PURE__ */ React.createElement("th", { onClick: () => toggleSort(col), style: { padding: "6px 4px", textAlign: "center", fontSize: "0.65rem", textTransform: "uppercase", color: sortCol === col ? "#89f7fe" : "var(--text-secondary)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" } }, children, " ", sortCol === col ? sortDir === "desc" ? "\u25BC" : "\u25B2" : "");
  const subTabs = [
    { id: "scanner", label: "\u{1F50D} Esc\xE1ner Cartera" },
    { id: "explorer", label: "\u{1F310} Explorador" }
  ];
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px", marginBottom: "1.5rem", background: "rgba(0,0,0,0.25)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-glass)", width: "fit-content" } }, subTabs.map((st) => /* @__PURE__ */ React.createElement("button", { key: st.id, onClick: () => setSubTab(st.id), style: {
    padding: "8px 16px",
    background: subTab === st.id ? "var(--accent-glow)" : "transparent",
    color: subTab === st.id ? "#000" : "var(--text-primary)",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
    fontSize: "0.85rem"
  } }, st.label))), subTab === "scanner" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0 } }, "Timing de Compra \u2014 Tu Cartera"), /* @__PURE__ */ React.createElement("button", { onClick: loadOpportunities, disabled: loading, style: { padding: "6px 16px", background: "var(--accent-glow)", color: "#000", border: "none", borderRadius: "6px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" } }, loading ? "\u23F3 Analizando..." : "\u{1F504} Recalcular"), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowWeightPanel((v) => !v), style: { padding: "6px 16px", background: showWeightPanel ? "rgba(137,247,254,0.15)" : "rgba(255,255,255,0.08)", color: showWeightPanel ? "#89f7fe" : "var(--text-secondary)", border: "1px solid " + (showWeightPanel ? "rgba(137,247,254,0.3)" : "var(--border-glass)"), borderRadius: "6px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" } }, "\u2699\uFE0F Configurar pesos")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 } }, /* @__PURE__ */ React.createElement("strong", null, "\xBFC\xF3mo funciona?"), " Cada fondo se punt\xFAa por ", /* @__PURE__ */ React.createElement("strong", null, "momento de entrada"), " con 6 dimensiones:", /* @__PURE__ */ React.createElement("strong", null, " \u{1F4D0} Tendencia"), " (z-score vs regresi\xF3n log-lineal) \xB7", /* @__PURE__ */ React.createElement("strong", null, " \u{1F4C9} Pullback"), " (ca\xEDda desde m\xE1x. 3M) \xB7", /* @__PURE__ */ React.createElement("strong", null, " \u{1F500} Divergencia"), " (momentum 1M vs 6M) \xB7", /* @__PURE__ */ React.createElement("strong", null, " \u{1F4CA} RSI"), " (sobrevendido/comprado) \xB7", /* @__PURE__ */ React.createElement("strong", null, " \u{1F30A} Vol. R\xE9gimen"), " (vol actual vs hist\xF3rica) \xB7", /* @__PURE__ */ React.createElement("strong", null, " \u26A1 Corto Plazo"), " (dips 3d/1w/2w). Los umbrales se ", /* @__PURE__ */ React.createElement("strong", null, "ajustan por tipo de fondo"), " (RV, RF, Liquidez).", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { color: "#00c853" } }, "\u{1F7E2} \u226575 Descuento significativo"), " \xB7 ", /* @__PURE__ */ React.createElement("span", { style: { color: "#448aff" } }, "\u{1F535} \u226560 Ligeramente por debajo"), " \xB7 ", /* @__PURE__ */ React.createElement("span", { style: { color: "#90a4ae" } }, "\u26AA \u226540 En tendencia"), " \xB7 ", /* @__PURE__ */ React.createElement("span", { style: { color: "#ffd600" } }, "\u{1F7E1} \u226525 Por encima"), " \xB7 ", /* @__PURE__ */ React.createElement("span", { style: { color: "#ff9100" } }, "\u{1F7E0} <25 Rally extendido"))), showWeightPanel && weights && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.85rem", fontWeight: 700 } }, "\u2699\uFE0F Pesos de las dimensiones"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", color: "var(--text-secondary)" } }, "Total: ", (Object.values(weights).reduce((a, b) => a + b, 0) * 100).toFixed(0), "%")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" } }, presets && Object.entries(presets).map(([key, preset]) => /* @__PURE__ */ React.createElement("button", { key, onClick: () => applyPreset(key), style: {
    padding: "5px 12px",
    fontSize: "0.75rem",
    fontWeight: 600,
    background: activePreset === key ? "var(--accent-glow)" : "rgba(255,255,255,0.06)",
    color: activePreset === key ? "#000" : "var(--text-primary)",
    border: activePreset === key ? "none" : "1px solid var(--border-glass)",
    borderRadius: "6px",
    cursor: "pointer"
  } }, preset.label)), activePreset === "custom" && /* @__PURE__ */ React.createElement("span", { style: { padding: "5px 12px", fontSize: "0.75rem", fontWeight: 600, color: "#ce93d8", background: "rgba(206,147,216,0.1)", borderRadius: "6px", border: "1px solid rgba(206,147,216,0.3)" } }, "\u{1F39B}\uFE0F Personalizado")), presets && presets[activePreset] && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "10px" } }, presets[activePreset].description), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" } }, [
    { key: "trend", icon: "\u{1F4D0}", label: "Tendencia" },
    { key: "pullback", icon: "\u{1F4C9}", label: "Pullback" },
    { key: "divergence", icon: "\u{1F500}", label: "Divergencia" },
    { key: "rsi", icon: "\u{1F4CA}", label: "RSI" },
    { key: "vol_regime", icon: "\u{1F30A}", label: "Vol. R\xE9gimen" },
    { key: "short_term", icon: "\u26A1", label: "Corto Plazo" }
  ].map((dim) => /* @__PURE__ */ React.createElement("div", { key: dim.key, style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", minWidth: "90px", color: "var(--text-secondary)" } }, dim.icon, " ", dim.label), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "range",
      min: "0",
      max: "50",
      step: "1",
      value: Math.round((weights[dim.key] || 0) * 100),
      onChange: (e) => updateWeight(dim.key, parseInt(e.target.value) / 100),
      style: { flex: 1, accentColor: "#89f7fe" }
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", fontWeight: 600, minWidth: "32px", textAlign: "right", color: "#89f7fe" } }, Math.round((weights[dim.key] || 0) * 100), "%")))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", marginTop: "12px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("button", { onClick: applyWeightsAndReload, style: {
    padding: "6px 18px",
    background: "var(--accent-glow)",
    color: "#000",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.8rem"
  } }, "\u2713 Aplicar y recalcular"), /* @__PURE__ */ React.createElement("button", { onClick: normalizeWeights, style: {
    padding: "6px 14px",
    background: "rgba(255,255,255,0.06)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-glass)",
    borderRadius: "6px",
    fontSize: "0.75rem",
    cursor: "pointer"
  } }, "Normalizar a 100%"), defaultWeights && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setWeights(defaultWeights);
    setActivePreset("balanced");
  }, style: {
    padding: "6px 14px",
    background: "rgba(255,255,255,0.06)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-glass)",
    borderRadius: "6px",
    fontSize: "0.75rem",
    cursor: "pointer"
  } }, "Reset defaults"))), loading && /* @__PURE__ */ React.createElement("div", { className: "loading-state" }, /* @__PURE__ */ React.createElement("div", { className: "spinner" }), /* @__PURE__ */ React.createElement("p", null, "Analizando fondos de tu cartera...")), opportunities && !loading && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } }, opportunities.map((opp) => /* @__PURE__ */ React.createElement("div", { key: opp.isin, className: "glass-panel", style: { padding: "1.2rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 280px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "1.05rem", fontWeight: 700 } }, opp.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "monospace" } }, opp.isin), opp.fund_type && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.62rem", padding: "2px 6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", color: "var(--text-secondary)" } }, opp.fund_type)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", marginBottom: "8px" } }, opp.level), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: "300px", marginBottom: "8px" } }, /* @__PURE__ */ React.createElement(TimingScoreBar, { score: opp.timing_score })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", width: "100%", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(SubScoreBar, { label: "Tendencia", icon: "\u{1F4D0}", score: opp.trend_score }), /* @__PURE__ */ React.createElement(SubScoreBar, { label: "Pullback", icon: "\u{1F4C9}", score: opp.pullback_score }), /* @__PURE__ */ React.createElement(SubScoreBar, { label: "Divergencia", icon: "\u{1F500}", score: opp.divergence_score }), /* @__PURE__ */ React.createElement(SubScoreBar, { label: "RSI", icon: "\u{1F4CA}", score: opp.rsi_score }), /* @__PURE__ */ React.createElement(SubScoreBar, { label: "Vol.R\xE9g", icon: "\u{1F30A}", score: opp.vol_regime_score }), /* @__PURE__ */ React.createElement(SubScoreBar, { label: "Corto P.", icon: "\u26A1", score: opp.short_term_score }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px", flex: "1 1 420px", justifyContent: "flex-end", alignContent: "flex-start" } }, /* @__PURE__ */ React.createElement(SignalBadge, { label: "Z-Trend", value: opp.z_trend, good: (v) => v < -0.5, neutral: (v) => v >= -0.5 && v <= 1 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Pull. 3M", value: opp.pullback_3m_pct, unit: "%", good: (v) => v < -5, neutral: (v) => v > -3 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Mom 1M", value: opp.momentum_1m, unit: "%", good: (v) => v < -3, neutral: (v) => v > -1 && v < 5 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Mom 6M", value: opp.momentum_6m, unit: "%", good: (v) => v > 5, neutral: (v) => v >= -3 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "RSI-14", value: opp.rsi_14, good: (v) => v < 30, neutral: (v) => v >= 30 && v <= 70 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Vol.Ratio", value: opp.vol_regime_ratio, good: (v) => v < 0.8, neutral: (v) => v >= 0.8 && v <= 1.2 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Mom 3D", value: opp.momentum_3d, unit: "%", good: (v) => v < -1, neutral: (v) => v > -0.5 && v < 2 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Mom 1W", value: opp.momentum_1w, unit: "%", good: (v) => v < -2, neutral: (v) => v > -1 && v < 3 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Pull. 1W", value: opp.pullback_1w_pct, unit: "%", good: (v) => v < -2, neutral: (v) => v > -1 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Sharpe", value: opp.sharpe, good: (v) => v > 0.8, neutral: (v) => v >= 0.3 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "MaxDD", value: opp.max_drawdown_pct, unit: "%", good: (v) => v > -15, neutral: (v) => v > -25 }))), opp.short_term_score != null && opp.short_term_score >= 70 && opp.timing_score >= 50 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "8px", padding: "6px 12px", background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.2)", borderRadius: "8px", fontSize: "0.78rem", color: "#69f0ae" } }, "\u{1F3AF} Esta semana parece buen momento para aportar \u2014 dip reciente en tendencia favorable"), opp.short_term_score != null && opp.short_term_score < 30 && opp.timing_score >= 40 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "8px", padding: "6px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "0.78rem", color: "var(--text-secondary)" } }, "\u23F3 Sin se\xF1al a corto plazo \u2014 considerar esperar unos d\xEDas dentro del mes"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5, flex: 1 } }, opp.description), /* @__PURE__ */ React.createElement("button", { onClick: () => toggleChart(opp.isin), style: {
    padding: "5px 14px",
    background: expandedCharts[opp.isin] ? "rgba(137,247,254,0.1)" : "rgba(255,255,255,0.06)",
    color: expandedCharts[opp.isin] ? "#89f7fe" : "var(--text-secondary)",
    border: `1px solid ${expandedCharts[opp.isin] ? "rgba(137,247,254,0.3)" : "var(--border-glass)"}`,
    borderRadius: "6px",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    marginLeft: "12px"
  } }, expandedCharts[opp.isin] ? "\u25B2 Ocultar gr\xE1fico" : "\u{1F4C8} Ver gr\xE1fico")), expandedCharts[opp.isin] && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "10px" } }, chartLoading[opp.isin] && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "2rem", color: "var(--text-secondary)" } }, /* @__PURE__ */ React.createElement("div", { className: "spinner", style: { margin: "0 auto 8px" } }), "Cargando datos de gr\xE1fico..."), chartData[opp.isin] && !chartData[opp.isin].error && /* @__PURE__ */ React.createElement(TimingChartCanvas, { data: chartData[opp.isin], signals: opp }), chartData[opp.isin] && chartData[opp.isin].error && /* @__PURE__ */ React.createElement("div", { style: { padding: "1rem", color: "var(--text-secondary)", textAlign: "center" } }, "\u26A0\uFE0F ", chartData[opp.isin].error))))), opportunities && opportunities.length === 0 && !loading && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", textAlign: "center", color: "var(--text-secondary)" } }, "No se encontraron fondos con suficiente hist\xF3rico para analizar.")), subTab === "explorer" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1rem" } }, "Explorador de Fondos"), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      placeholder: "Buscar por ISIN o nombre (ej: MSCI World, renta fija, IE00B4L5Y983...)",
      value: searchQuery,
      onChange: (e) => setSearchQuery(e.target.value),
      onKeyDown: (e) => e.key === "Enter" && handleSearch(),
      style: { flex: 1, padding: "10px 14px", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-glass)", borderRadius: "8px", fontSize: "0.9rem", outline: "none" }
    }
  ), /* @__PURE__ */ React.createElement("button", { onClick: handleSearch, disabled: searching, style: { padding: "10px 20px", background: "var(--accent-glow)", color: "#000", border: "none", borderRadius: "8px", fontWeight: 600, cursor: searching ? "not-allowed" : "pointer" } }, searching ? "\u23F3" : "\u{1F50D} Buscar")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "6px" } }, '\u{1F4A1} Busca fondos del universo Finect. Tras la b\xFAsqueda, pulsa "Cargar m\xE9tricas" para ver retornos, Sharpe, timing y m\xE1s.')), searchResults.length > 0 && enrichedFunds.length === 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.85rem", color: "var(--text-secondary)" } }, searchResults.length, " fondos encontrados"), /* @__PURE__ */ React.createElement("button", { onClick: handleEnrich, disabled: enriching, style: { padding: "8px 18px", background: "linear-gradient(135deg,#448aff,#00c853)", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: enriching ? "not-allowed" : "pointer", fontSize: "0.85rem" } }, enriching ? `\u23F3 ${enrichProgress}` : "\u{1F4CA} Cargar m\xE9tricas de todos")), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "0", overflow: "hidden", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "rgba(0,0,0,0.3)" } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "10px 12px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-secondary)" } }, "Fondo"), /* @__PURE__ */ React.createElement("th", { style: { padding: "10px 12px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-secondary)" } }, "ISIN"), /* @__PURE__ */ React.createElement("th", { style: { padding: "10px 12px", textAlign: "center", fontSize: "0.75rem", color: "var(--text-secondary)" } }, "Cartera"), /* @__PURE__ */ React.createElement("th", { style: { padding: "10px 12px", textAlign: "center", fontSize: "0.75rem", color: "var(--text-secondary)" } }, "Acciones"))), /* @__PURE__ */ React.createElement("tbody", null, searchResults.map((r, idx) => /* @__PURE__ */ React.createElement("tr", { key: r.isin + idx, style: { borderTop: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", fontSize: "0.85rem" } }, r.name || r.isin), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-secondary)" } }, r.isin), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "center" } }, r.in_portfolio ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--success)" } }, "\u2713") : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => viewFundDetail(r.isin), style: { padding: "4px 10px", background: "rgba(76,161,175,0.3)", color: "#89f7fe", border: "1px solid rgba(76,161,175,0.4)", borderRadius: "4px", fontSize: "0.72rem", cursor: "pointer" } }, "\u{1F4CA} Analizar")))))))), enrichedFunds.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "10px 14px", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.8rem", fontWeight: 600 } }, "\u{1F527} Filtros"), /* @__PURE__ */ React.createElement("button", { onClick: () => setFilters({ ret5yMin: "", ret1yMax: "", terMax: "", sharpeMin: "", ratingMin: "", timingMin: "", category: "" }), style: { padding: "2px 8px", background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer" } }, "Limpiar"), /* @__PURE__ */ React.createElement("button", { onClick: () => setEnrichedFunds([]), style: { padding: "2px 8px", background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer", marginLeft: "auto" } }, "\u2190 Volver a resultados")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(FilterInput, { label: "Ret. 5Y m\xEDn (%)", value: filters.ret5yMin, onChange: (e) => setFilters((f) => ({ ...f, ret5yMin: e.target.value })), placeholder: "ej: 10", step: "0.5" }), /* @__PURE__ */ React.createElement(FilterInput, { label: "Ret. 1Y m\xE1x (%)", value: filters.ret1yMax, onChange: (e) => setFilters((f) => ({ ...f, ret1yMax: e.target.value })), placeholder: "ej: 20", step: "0.5" }), /* @__PURE__ */ React.createElement(FilterInput, { label: "TER m\xE1x (%)", value: filters.terMax, onChange: (e) => setFilters((f) => ({ ...f, terMax: e.target.value })), placeholder: "ej: 0.5", step: "0.05" }), /* @__PURE__ */ React.createElement(FilterInput, { label: "Sharpe m\xEDn", value: filters.sharpeMin, onChange: (e) => setFilters((f) => ({ ...f, sharpeMin: e.target.value })), placeholder: "ej: 0.5", step: "0.1" }), /* @__PURE__ */ React.createElement(FilterInput, { label: "Rating m\xEDn \u2605", value: filters.ratingMin, onChange: (e) => setFilters((f) => ({ ...f, ratingMin: e.target.value })), placeholder: "1-5", step: "1" }), /* @__PURE__ */ React.createElement(FilterInput, { label: "Timing m\xEDn", value: filters.timingMin, onChange: (e) => setFilters((f) => ({ ...f, timingMin: e.target.value })), placeholder: "ej: 50", step: "5" }), /* @__PURE__ */ React.createElement(FilterInput, { label: "Categor\xEDa", value: filters.category, onChange: (e) => setFilters((f) => ({ ...f, category: e.target.value })), placeholder: "ej: equity", type: "text" }))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "6px" } }, filteredFunds.length, " de ", enrichedFunds.length, " fondos \xB7 Clic en cabeceras para ordenar \xB7 Selecciona \u22652 fondos para comparar"), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "0", overflow: "auto", maxHeight: "500px" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: "1050px" } }, /* @__PURE__ */ React.createElement("thead", { style: { position: "sticky", top: 0, zIndex: 2 } }, /* @__PURE__ */ React.createElement("tr", { style: { background: "rgba(10,10,25,0.98)" } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 8px", textAlign: "center", fontSize: "0.65rem", color: "var(--text-secondary)", width: "32px" } }, "\u2610"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 8px", textAlign: "left", fontSize: "0.65rem", color: "var(--text-secondary)", minWidth: "180px", position: "sticky", left: 0, background: "rgba(10,10,25,0.98)", zIndex: 3 } }, "Fondo"), /* @__PURE__ */ React.createElement(SortHeader, { col: "timing_score" }, "Timing"), /* @__PURE__ */ React.createElement(SortHeader, { col: "ret_5y" }, "Ret 5Y"), /* @__PURE__ */ React.createElement(SortHeader, { col: "ret_3y" }, "Ret 3Y"), /* @__PURE__ */ React.createElement(SortHeader, { col: "ret_1y" }, "Ret 1Y"), /* @__PURE__ */ React.createElement(SortHeader, { col: "sharpe" }, "Sharpe"), /* @__PURE__ */ React.createElement(SortHeader, { col: "ter" }, "TER"), /* @__PURE__ */ React.createElement(SortHeader, { col: "rating" }, "Rating"), /* @__PURE__ */ React.createElement(SortHeader, { col: "volatility" }, "Volat."), /* @__PURE__ */ React.createElement(SortHeader, { col: "max_dd" }, "MaxDD"), /* @__PURE__ */ React.createElement(SortHeader, { col: "z_trend" }, "Z-Trend"))), /* @__PURE__ */ React.createElement("tbody", null, filteredFunds.map((fd) => {
    const sc = fd.signals || {};
    const ts = sc.timing_score ?? 0;
    const tsColor = ts >= 75 ? "#00c853" : ts >= 60 ? "#448aff" : ts >= 40 ? "#90a4ae" : ts >= 25 ? "#ffd600" : "#ff9100";
    const isSelected = selectedFunds.some((f) => f.isin === fd.isin);
    return /* @__PURE__ */ React.createElement("tr", { key: fd.isin, onClick: () => toggleFundSelect(fd.isin, fd.name), style: { borderTop: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: isSelected ? "rgba(0,200,83,0.08)" : "transparent" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "4px 8px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { color: isSelected ? "#00c853" : "var(--text-secondary)" } }, isSelected ? "\u2611" : "\u2610")), /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 8px", position: "sticky", left: 0, background: isSelected ? "rgba(10,20,15,0.95)" : "rgba(15,15,30,0.95)", zIndex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: "0.78rem", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, fd.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.6rem", color: "var(--text-secondary)", fontFamily: "monospace" } }, fd.isin, " \xB7 ", fd.fund_type || "\u2014")), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", fontWeight: 700, color: tsColor } }, ts || "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", fontWeight: 600, color: (fd.returns?.["5y"] ?? 0) >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, fd.returns?.["5y"] != null ? `${fd.returns["5y"].toFixed(1)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", color: (fd.returns?.["3y"] ?? 0) >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, fd.returns?.["3y"] != null ? `${fd.returns["3y"].toFixed(1)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", color: (fd.returns?.["1y"] ?? 0) >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" } }, fd.returns?.["1y"] != null ? `${fd.returns["1y"].toFixed(1)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", fontVariantNumeric: "tabular-nums" } }, sc.sharpe != null ? sc.sharpe.toFixed(2) : fd.metrics?.sharpe_ratio != null ? fd.metrics.sharpe_ratio.toFixed(2) : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", fontVariantNumeric: "tabular-nums" } }, fd.expense_ratio != null ? `${(fd.expense_ratio * 100).toFixed(2)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center" } }, fd.rating ? "\u2605".repeat(fd.rating) : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", fontVariantNumeric: "tabular-nums" } }, sc.volatility_pct != null ? `${sc.volatility_pct.toFixed(1)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: "var(--danger)" } }, sc.max_drawdown_pct != null ? `${sc.max_drawdown_pct.toFixed(1)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { style: { padding: "4px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: (sc.z_trend ?? 0) < -0.5 ? "var(--success)" : (sc.z_trend ?? 0) > 1 ? "var(--danger)" : "var(--text-secondary)" } }, sc.z_trend != null ? sc.z_trend.toFixed(2) : "\u2014"));
  })))), selectedFunds.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "10px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Seleccionados (", selectedFunds.length, "/6):"), selectedFunds.map((f) => /* @__PURE__ */ React.createElement("span", { key: f.isin, onClick: (e) => {
    e.stopPropagation();
    toggleFundSelect(f.isin, f.name);
  }, style: { padding: "3px 8px", background: "rgba(0,200,83,0.2)", border: "1px solid rgba(0,200,83,0.3)", borderRadius: "20px", fontSize: "0.72rem", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" } }, f.name.length > 18 ? f.name.slice(0, 18) + "\u2026" : f.name, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--danger)", fontWeight: 700 } }, "\xD7"))), /* @__PURE__ */ React.createElement("button", { onClick: handleCompare, disabled: comparingLoading || selectedFunds.length < 2, style: { padding: "5px 14px", background: selectedFunds.length >= 2 ? "var(--accent-glow)" : "var(--border-glass)", color: selectedFunds.length >= 2 ? "#000" : "var(--text-secondary)", border: "none", borderRadius: "6px", fontWeight: 600, fontSize: "0.8rem", cursor: selectedFunds.length >= 2 ? "pointer" : "not-allowed", marginLeft: "auto" } }, comparingLoading ? "\u23F3 Comparando..." : "\u2696\uFE0F Comparar seleccionados")), comparison && !comparingLoading && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.2rem", marginTop: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: 0, fontWeight: 600 } }, "\u2696\uFE0F Comparaci\xF3n lado a lado"), /* @__PURE__ */ React.createElement("button", { onClick: () => setComparison(null), style: { padding: "3px 10px", background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer" } }, "\u2715 Cerrar")), comparison.chart_data && Object.keys(comparison.chart_data).length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "6px" } }, "\u{1F4C8} Evoluci\xF3n Normalizada (Base 100, 5 a\xF1os)"), /* @__PURE__ */ React.createElement(CompareChart, { chartData: comparison.chart_data })), /* @__PURE__ */ React.createElement("div", { style: { overflow: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: "600px" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "rgba(0,0,0,0.3)" } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "10px", textAlign: "left", fontSize: "0.72rem", color: "var(--text-secondary)", position: "sticky", left: 0, background: "rgba(15,15,30,0.95)" } }, "M\xE9trica"), comparison.funds.map((f, i) => /* @__PURE__ */ React.createElement("th", { key: f.isin, style: { padding: "10px", textAlign: "center", fontSize: "0.78rem", color: COLORS[i % COLORS.length], minWidth: "130px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700 } }, f.name.length > 20 ? f.name.slice(0, 20) + "\u2026" : f.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.6rem", color: "var(--text-secondary)", fontFamily: "monospace" } }, f.isin))))), /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", { style: { borderTop: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", fontWeight: 600, fontSize: "0.82rem", position: "sticky", left: 0, background: "rgba(15,15,30,0.9)" } }, "\u23F1\uFE0F Timing Score"), comparison.funds.map((f) => /* @__PURE__ */ React.createElement("td", { key: f.isin, style: { padding: "8px 10px", textAlign: "center" } }, /* @__PURE__ */ React.createElement(TimingScoreBar, { score: f.signals?.timing_score ?? 50, height: 6 })))), /* @__PURE__ */ React.createElement("tr", { style: { borderTop: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", fontSize: "0.82rem", position: "sticky", left: 0, background: "rgba(15,15,30,0.9)" } }, "Se\xF1al"), comparison.funds.map((f) => /* @__PURE__ */ React.createElement("td", { key: f.isin, style: { padding: "8px 10px", textAlign: "center", fontSize: "0.78rem" } }, f.level))), ["1y", "3y", "5y"].map((period) => /* @__PURE__ */ React.createElement("tr", { key: period, style: { borderTop: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", fontSize: "0.82rem", position: "sticky", left: 0, background: "rgba(15,15,30,0.9)" } }, "Ret. ", period), comparison.funds.map((f) => {
    const ret = f.returns?.[period];
    return /* @__PURE__ */ React.createElement("td", { key: f.isin, style: { padding: "8px 10px", textAlign: "center", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: ret != null ? ret >= 0 ? "var(--success)" : "var(--danger)" : "var(--text-secondary)" } }, ret != null ? `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%` : "\u2014");
  }))), [
    { k: "category", l: "Categor\xEDa", fmt: (f) => f.category || "\u2014" },
    { k: "ter", l: "TER", fmt: (f) => f.expense_ratio != null ? `${(f.expense_ratio * 100).toFixed(2)}%` : "\u2014" },
    { k: "rating", l: "Rating \u2605", fmt: (f) => f.rating ? "\u2605".repeat(f.rating) : "\u2014" },
    { k: "srri", l: "Riesgo (SRRI)", fmt: (f) => f.srri || "\u2014" }
  ].map(({ k, l, fmt }) => /* @__PURE__ */ React.createElement("tr", { key: k, style: { borderTop: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", fontSize: "0.82rem", position: "sticky", left: 0, background: "rgba(15,15,30,0.9)" } }, l), comparison.funds.map((f) => /* @__PURE__ */ React.createElement("td", { key: f.isin, style: { padding: "8px 10px", textAlign: "center", fontSize: "0.78rem" } }, fmt(f))))), [
    { key: "sharpe_ratio", label: "Sharpe" },
    { key: "standard_deviation", label: "Volatilidad" },
    { key: "max_drawdown", label: "Max Drawdown" }
  ].map(({ key, label }) => /* @__PURE__ */ React.createElement("tr", { key, style: { borderTop: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", fontSize: "0.82rem", position: "sticky", left: 0, background: "rgba(15,15,30,0.9)" } }, label), comparison.funds.map((f) => {
    const val = f.metrics?.[key];
    return /* @__PURE__ */ React.createElement("td", { key: f.isin, style: { padding: "8px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" } }, val != null ? key === "max_drawdown" ? `${(val * 100).toFixed(1)}%` : val.toFixed(3) : "\u2014");
  }))), [
    { key: "z_trend", label: "Z-Trend", unit: "" },
    { key: "pullback_3m_pct", label: "Pullback 3M", unit: "%" },
    { key: "momentum_1m", label: "Mom. 1M", unit: "%" },
    { key: "momentum_6m", label: "Mom. 6M", unit: "%" }
  ].map(({ key, label, unit }) => /* @__PURE__ */ React.createElement("tr", { key, style: { borderTop: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 10px", fontSize: "0.82rem", position: "sticky", left: 0, background: "rgba(15,15,30,0.9)" } }, label), comparison.funds.map((f) => {
    const val = f.signals?.[key];
    return /* @__PURE__ */ React.createElement("td", { key: f.isin, style: { padding: "8px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" } }, val != null ? `${val.toFixed(1)}${unit}` : "\u2014");
  })))))))), detailLoading && /* @__PURE__ */ React.createElement("div", { className: "loading-state", style: { marginTop: "1rem" } }, /* @__PURE__ */ React.createElement("div", { className: "spinner" }), /* @__PURE__ */ React.createElement("p", null, "Analizando fondo...")), fundDetail && !detailLoading && !fundDetail.error && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.5rem", marginTop: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "1rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { style: { margin: 0, fontWeight: 700 } }, fundDetail.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" } }, fundDetail.isin), fundDetail.category && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "8px" } }, "| ", fundDetail.category), fundDetail.fund_type && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.62rem", padding: "2px 6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", color: "var(--text-secondary)", marginLeft: "8px" } }, fundDetail.fund_type)), /* @__PURE__ */ React.createElement("button", { onClick: () => setFundDetail(null), style: { padding: "3px 10px", background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "0.7rem", cursor: "pointer" } }, "\u2715 Cerrar")), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.9rem", marginBottom: "8px" } }, fundDetail.level), /* @__PURE__ */ React.createElement(TimingScoreBar, { score: fundDetail.timing_score })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", marginBottom: "12px" } }, /* @__PURE__ */ React.createElement(SubScoreBar, { label: "Tendencia", icon: "\u{1F4D0}", score: fundDetail.trend_score }), /* @__PURE__ */ React.createElement(SubScoreBar, { label: "Pullback", icon: "\u{1F4C9}", score: fundDetail.pullback_score }), /* @__PURE__ */ React.createElement(SubScoreBar, { label: "Divergencia", icon: "\u{1F500}", score: fundDetail.divergence_score })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "8px" } }, /* @__PURE__ */ React.createElement(SignalBadge, { label: "Z-Trend", value: fundDetail.z_trend, good: (v) => v < -0.5, neutral: (v) => v >= -0.5 && v <= 1 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Pull. 3M", value: fundDetail.pullback_3m_pct, unit: "%", good: (v) => v < -5, neutral: (v) => v > -3 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Mom 1M", value: fundDetail.momentum_1m, unit: "%", good: (v) => v < -3, neutral: (v) => v > -1 && v < 5 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Mom 6M", value: fundDetail.momentum_6m, unit: "%", good: (v) => v > 5, neutral: (v) => v >= -3 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Sharpe", value: fundDetail.sharpe, good: (v) => v > 0.8, neutral: (v) => v >= 0.3 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Vol.", value: fundDetail.volatility_pct, unit: "%", good: (v) => v < 10, neutral: (v) => v >= 10 && v <= 20 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "MaxDD", value: fundDetail.max_drawdown_pct, unit: "%", good: (v) => v > -15, neutral: (v) => v > -25 }), /* @__PURE__ */ React.createElement(SignalBadge, { label: "Calmar", value: fundDetail.calmar, good: (v) => v > 1, neutral: (v) => v > 0.3 })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 } }, fundDetail.description)), fundDetail && fundDetail.error && !detailLoading && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", color: "var(--danger)", marginTop: "1rem" } }, "\u26A0\uFE0F ", fundDetail.error)));
};
const PORTFOLIO_COLORS = ["#4ca1af", "#a78bfa", "#4ade80", "#fb923c", "#f472b6", "#60a5fa", "#facc15", "#34d399"];
const CarterasTab = () => {
  const [subTab, setSubTab] = useState("carteras");
  const [portfolios, setPortfolios] = useState([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [cloningCurrent, setCloningCurrent] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [loadingFavs, setLoadingFavs] = useState(true);
  const [favSearch, setFavSearch] = useState("");
  const [favResults, setFavResults] = useState([]);
  const [favSearching, setFavSearching] = useState(false);
  const favDebounceRef = React.useRef(null);
  const [comparePortA, setComparePortA] = useState("current");
  const [comparePortB, setComparePortB] = useState("");
  const [compareYears, setCompareYears] = useState(5);
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [compareError, setCompareError] = useState("");
  const [livePositions, setLivePositions] = useState(null);
  const loadPortfolios = () => {
    setLoadingPortfolios(true);
    fetch("/api/portfolio/portfolios").then((r) => r.json()).then((d) => {
      setPortfolios(d.portfolios || []);
      setLoadingPortfolios(false);
    }).catch(() => setLoadingPortfolios(false));
  };
  const loadFavorites = () => {
    setLoadingFavs(true);
    fetch("/api/portfolio/favorites").then((r) => r.json()).then((d) => {
      setFavorites(d.favorites || []);
      setLoadingFavs(false);
    }).catch(() => setLoadingFavs(false));
  };
  const loadLivePositions = () => {
    fetch("/api/portfolio/positions").then((r) => r.json()).then((d) => setLivePositions(d.positions || [])).catch(() => {
    });
  };
  useEffect(() => {
    loadPortfolios();
    loadFavorites();
    loadLivePositions();
  }, []);
  const handleFavSearch = (q) => {
    setFavSearch(q);
    if (favDebounceRef.current) clearTimeout(favDebounceRef.current);
    if (q.length < 2) {
      setFavResults([]);
      return;
    }
    favDebounceRef.current = setTimeout(() => {
      setFavSearching(true);
      fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(q)}&limit=10`).then((r) => r.json()).then((res) => {
        setFavResults(res);
        setFavSearching(false);
      }).catch(() => setFavSearching(false));
    }, 300);
  };
  const addToFavorites = (fund) => {
    fetch("/api/portfolio/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isin: fund.isin, name: fund.name || fund.isin })
    }).then((r) => r.json()).then((fav) => {
      setFavorites((prev) => [fav, ...prev.filter((f) => f.isin !== fav.isin)]);
      setFavSearch("");
      setFavResults([]);
    }).catch(() => {
    });
  };
  const removeFavorite = (isin) => {
    fetch(`/api/portfolio/favorites/${isin}`, { method: "DELETE" }).then(() => setFavorites((prev) => prev.filter((f) => f.isin !== isin))).catch(() => {
    });
  };
  const deletePortfolio = (id) => {
    if (!confirm("\xBFEliminar esta cartera guardada?")) return;
    fetch(`/api/portfolio/portfolios/${id}`, { method: "DELETE" }).then(() => setPortfolios((prev) => prev.filter((p) => p.id !== id))).catch(() => {
    });
  };
  const cloneCurrent = () => {
    const name = prompt("Nombre para la copia:", "Copia de Mi Cartera");
    if (!name) return;
    setCloningCurrent(true);
    fetch("/api/portfolio/portfolios/clone-current", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }).then((r) => r.json()).then((p) => {
      setPortfolios((prev) => [p, ...prev]);
      setCloningCurrent(false);
    }).catch(() => setCloningCurrent(false));
  };
  const buildPortDef = (selId, customName) => {
    if (selId === "current") {
      if (!livePositions || livePositions.length === 0) return null;
      const total = livePositions.reduce((s, p) => s + (p.Valor_Actual || 0), 0) || 1;
      return {
        name: customName || "Mi Cartera Actual",
        funds: livePositions.filter((p) => p.ISIN && (p.Valor_Actual || 0) > 0).map((p) => ({ isin: p.ISIN, name: p.Fondo || p.ISIN, weight: (p.Valor_Actual || 0) / total }))
      };
    }
    const port = portfolios.find((p) => String(p.id) === String(selId));
    if (!port) return null;
    return { name: port.name, funds: port.funds || [] };
  };
  const runCompare = async () => {
    if (!comparePortA || !comparePortB) return;
    const getFullPort = async (selId) => {
      if (selId === "current") return buildPortDef("current");
      const res = await fetch(`/api/portfolio/portfolios/${selId}`).then((r) => r.json());
      return { name: res.name, funds: res.funds || [] };
    };
    setComparing(true);
    setCompareResult(null);
    setCompareError("");
    try {
      const [pa, pb] = await Promise.all([getFullPort(comparePortA), getFullPort(comparePortB)]);
      if (!pa || !pa.funds?.length) {
        setCompareError("La cartera A no tiene fondos.");
        setComparing(false);
        return;
      }
      if (!pb || !pb.funds?.length) {
        setCompareError("La cartera B no tiene fondos.");
        setComparing(false);
        return;
      }
      const res = await fetch("/api/portfolio/portfolios/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio_a: pa, portfolio_b: pb, years: compareYears })
      }).then((r) => r.json());
      setCompareResult(res);
    } catch (e) {
      setCompareError("Error al comparar. Int\xE9ntalo de nuevo.");
    }
    setComparing(false);
  };
  const subTabBtn = (id) => ({
    padding: "7px 18px",
    borderRadius: "20px",
    fontWeight: 600,
    fontSize: "0.82rem",
    cursor: "pointer",
    background: subTab === id ? "var(--accent-glow)" : "transparent",
    color: subTab === id ? "#000" : "var(--text-primary)",
    border: subTab === id ? "none" : "1px solid var(--border-glass)"
  });
  const signColor = (v) => v > 0 ? "var(--success)" : v < 0 ? "var(--danger)" : "var(--text-primary)";
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", marginBottom: "1.5rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { style: subTabBtn("carteras"), onClick: () => setSubTab("carteras") }, "\u{1F5C2}\uFE0F Mis Carteras"), /* @__PURE__ */ React.createElement("button", { style: subTabBtn("favoritos"), onClick: () => setSubTab("favoritos") }, "\u2B50 Favoritos"), /* @__PURE__ */ React.createElement("button", { style: subTabBtn("comparar"), onClick: () => setSubTab("comparar") }, "\u2696\uFE0F Comparar")), subTab === "carteras" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0 } }, "Carteras Guardadas"), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowCreateForm(!showCreateForm), style: { padding: "7px 16px", background: "var(--accent-glow)", color: "#000", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" } }, "\uFF0B Nueva cartera"), /* @__PURE__ */ React.createElement("button", { onClick: cloneCurrent, disabled: cloningCurrent, style: { padding: "7px 16px", background: "rgba(255,255,255,0.07)", color: "var(--text-primary)", border: "1px solid var(--border-glass)", borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" } }, cloningCurrent ? "\u23F3 Clonando..." : "\u{1F4CB} Clonar cartera actual")), showCreateForm && /* @__PURE__ */ React.createElement(
    CreatePortfolioForm,
    {
      onSave: (p) => {
        setPortfolios((prev) => [p, ...prev]);
        setShowCreateForm(false);
      },
      onCancel: () => setShowCreateForm(false),
      portfolios
    }
  ), loadingPortfolios && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", padding: "1rem" } }, "Cargando carteras..."), !loadingPortfolios && portfolios.length === 0 && !showCreateForm && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", textAlign: "center", color: "var(--text-secondary)" } }, "No tienes carteras guardadas. Crea una nueva o clona tu cartera actual para empezar."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, portfolios.map((port) => /* @__PURE__ */ React.createElement("div", { key: port.id }, editingId === port.id ? /* @__PURE__ */ React.createElement(
    CreatePortfolioForm,
    {
      initialData: port,
      onSave: (updated) => {
        setPortfolios((prev) => prev.map((p) => p.id === updated.id ? updated : p));
        setEditingId(null);
      },
      onCancel: () => setEditingId(null),
      isEdit: true,
      portfolios: portfolios.filter((p) => p.id !== port.id)
    }
  ) : /* @__PURE__ */ React.createElement(
    PortfolioCard,
    {
      port,
      onEdit: () => setEditingId(port.id),
      onDelete: () => deletePortfolio(port.id),
      onCompare: () => {
        setComparePortA(String(port.id));
        setSubTab("comparar");
      }
    }
  ))))), subTab === "favoritos" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1rem" } }, "\u2B50 Fondos Favoritos"), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", marginBottom: "1rem", position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "8px" } }, "A\xF1ade fondos a tu watchlist personal para seguirlos aunque no est\xE9n en tu cartera."), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: favSearch,
      onChange: (e) => handleFavSearch(e.target.value),
      placeholder: "Buscar por ISIN o nombre (ej: IE00B4L5Y983)...",
      style: { width: "100%", padding: "9px 14px", borderRadius: "8px", border: "1px solid rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.04)", color: "white", fontSize: "0.85rem", boxSizing: "border-box" }
    }
  ), favSearching && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", right: "12px", top: "10px", fontSize: "0.72rem", color: "var(--text-secondary)" } }, "Buscando..."), favResults.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, maxHeight: "240px", overflowY: "auto", background: "rgba(15,20,35,0.98)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: "0 0 8px 8px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" } }, favResults.map((r) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: r.isin,
      onClick: () => addToFavorites(r),
      style: { padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.15s" },
      onMouseEnter: (e) => e.currentTarget.style.background = "rgba(255,215,0,0.1)",
      onMouseLeave: (e) => e.currentTarget.style.background = "transparent"
    },
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: "0.83rem", color: "#FFD700" } }, r.isin), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "var(--text-secondary)" } }, r.name?.substring(0, 60))),
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", alignItems: "center" } }, r.in_portfolio && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.68rem", padding: "2px 7px", background: "rgba(74,162,175,0.2)", borderRadius: "10px", color: "var(--accent-glow)" } }, "En cartera"), favorites.some((f) => f.isin === r.isin) ? /* @__PURE__ */ React.createElement("span", { style: { color: "#FFD700", fontSize: "0.75rem" } }, "\u2B50 En favoritos") : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.75rem" } }, "\u2795 A\xF1adir"))
  ))))), loadingFavs && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)" } }, "Cargando favoritos..."), !loadingFavs && favorites.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "2rem", textAlign: "center", color: "var(--text-secondary)" } }, "No tienes fondos favoritos a\xFAn. Busca un fondo arriba para a\xF1adirlo."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, favorites.map((fav) => /* @__PURE__ */ React.createElement("div", { key: fav.isin, className: "glass-panel", style: { padding: "1rem", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "1.1rem" } }, "\u2B50"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: "0.9rem" } }, fav.name || fav.isin), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "monospace" } }, fav.isin), fav.notes && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" } }, "\u{1F4DD} ", fav.notes)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 } }, /* @__PURE__ */ React.createElement(
    "a",
    {
      href: `https://www.finect.com/fondos-inversion/${fav.isin}`,
      target: "_blank",
      rel: "noreferrer",
      style: { fontSize: "0.78rem", color: "var(--accent-glow)", textDecoration: "none", padding: "4px 10px", border: "1px solid rgba(74,162,175,0.3)", borderRadius: "6px" }
    },
    "\u{1F517} Finect"
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", color: "var(--text-secondary)" } }, new Date(fav.added_at * 1e3).toLocaleDateString("es-ES")), /* @__PURE__ */ React.createElement("button", { onClick: () => removeFavorite(fav.isin), style: { background: "transparent", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "0.75rem" } }, "\u2715 Quitar")))))), subTab === "comparar" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { marginBottom: "1rem" } }, "\u2696\uFE0F Comparar Carteras"), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.25rem", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" } }, [
    { label: "Cartera A", value: comparePortA, set: setComparePortA, color: "#FFD700" },
    { label: "Cartera B", value: comparePortB, set: setComparePortB, color: "#4ade80" }
  ].map(({ label, value, set, color }) => /* @__PURE__ */ React.createElement("div", { key: label }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.78rem", color, fontWeight: 700, display: "block", marginBottom: "4px" } }, label), /* @__PURE__ */ React.createElement("select", { value, onChange: (e) => set(e.target.value), style: { width: "100%", padding: "8px 10px", borderRadius: "8px", border: `1px solid ${color}40`, background: "rgba(0,0,0,0.3)", color: "white", fontSize: "0.85rem", cursor: "pointer" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 Selecciona cartera \u2014"), /* @__PURE__ */ React.createElement("option", { value: "current" }, "\u{1F4CA} Mi Cartera Actual (posiciones reales)"), portfolios.map((p) => /* @__PURE__ */ React.createElement("option", { key: p.id, value: String(p.id) }, "\u{1F5C2}\uFE0F ", p.name, " (", p.fund_count, " fondos)")))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.8rem", color: "var(--text-secondary)" } }, "Periodo hist\xF3rico:"), [1, 3, 5, 10].map((y) => /* @__PURE__ */ React.createElement("button", { key: y, onClick: () => setCompareYears(y), style: { padding: "5px 14px", borderRadius: "16px", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", border: compareYears === y ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)", background: compareYears === y ? "var(--accent-glow)" : "transparent", color: compareYears === y ? "#000" : "var(--text-primary)" } }, y, "A")), /* @__PURE__ */ React.createElement("button", { onClick: runCompare, disabled: comparing || !comparePortA || !comparePortB, style: { marginLeft: "auto", padding: "8px 22px", background: comparePortA && comparePortB ? "var(--accent-glow)" : "var(--border-glass)", color: comparePortA && comparePortB ? "#000" : "var(--text-secondary)", border: "none", borderRadius: "8px", fontWeight: 700, cursor: comparePortA && comparePortB ? "pointer" : "not-allowed", fontSize: "0.85rem" } }, comparing ? "\u23F3 Comparando..." : "\u2696\uFE0F Comparar")), compareError && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "8px", color: "var(--danger)", fontSize: "0.82rem" } }, "\u26A0\uFE0F ", compareError), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "8px", fontSize: "0.75rem", color: "var(--text-secondary)" } }, "\u{1F4A1} Puedes comparar tu cartera real vs. una cartera hipot\xE9tica, o dos carteras guardadas entre s\xED.")), compareResult && !comparing && /* @__PURE__ */ React.createElement(CompareResultPanel, { result: compareResult, years: compareYears, signColor })));
};
const PortfolioCard = ({ port, onEdit, onDelete, onCompare }) => {
  const [expanded, setExpanded] = useState(false);
  const [fullData, setFullData] = useState(null);
  const expand = () => {
    if (!expanded && !fullData) {
      fetch(`/api/portfolio/portfolios/${port.id}`).then((r) => r.json()).then((d) => setFullData(d));
    }
    setExpanded(!expanded);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", borderLeft: `4px solid ${port.color || "#4ca1af"}` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: "1rem" } }, port.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", padding: "2px 8px", background: "rgba(255,255,255,0.07)", borderRadius: "10px", color: "var(--text-secondary)" } }, port.fund_count, " fondos")), port.description && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" } }, port.description), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" } }, "\xDAltima edici\xF3n: ", new Date(port.updated_at * 1e3).toLocaleDateString("es-ES"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", flexShrink: 0 } }, /* @__PURE__ */ React.createElement("button", { onClick: expand, style: { padding: "5px 12px", background: "transparent", border: "1px solid var(--border-glass)", borderRadius: "6px", color: "var(--text-secondary)", fontSize: "0.75rem", cursor: "pointer" } }, expanded ? "\u25B2 Ocultar" : "\u25BC Ver fondos"), /* @__PURE__ */ React.createElement("button", { onClick: onCompare, style: { padding: "5px 12px", background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)", borderRadius: "6px", color: "#FFD700", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 } }, "\u2696\uFE0F Comparar"), /* @__PURE__ */ React.createElement("button", { onClick: onEdit, style: { padding: "5px 12px", background: "rgba(137,247,254,0.07)", border: "1px solid rgba(137,247,254,0.2)", borderRadius: "6px", color: "#89f7fe", fontSize: "0.75rem", cursor: "pointer" } }, "\u270F\uFE0F Editar"), /* @__PURE__ */ React.createElement("button", { onClick: onDelete, style: { padding: "5px 12px", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", color: "var(--danger)", fontSize: "0.75rem", cursor: "pointer" } }, "\u{1F5D1}\uFE0F"))), expanded && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.07)" } }, !fullData ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.8rem" } }, "Cargando fondos...") : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "5px" } }, (fullData.funds || []).map((f) => /* @__PURE__ */ React.createElement("div", { key: f.isin, style: { display: "flex", alignItems: "center", gap: "10px", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${Math.max(f.weight * 100, 2)}px`, height: "6px", background: port.color || "#4ca1af", borderRadius: "3px", flexShrink: 0, maxWidth: "100px" } }), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, color: "var(--accent-glow)", minWidth: "50px" } }, (f.weight * 100).toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "0.72rem", minWidth: "80px" } }, f.isin), /* @__PURE__ */ React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.name || f.isin))))));
};
const CreatePortfolioForm = ({ onSave, onCancel, initialData = null, isEdit = false, portfolios = [] }) => {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [color, setColor] = useState(initialData?.color || "#4ca1af");
  const [funds, setFunds] = useState(initialData?.funds ? [...initialData.funds] : []);
  const [saving, setSaving] = useState(false);
  const [inputMode, setInputMode] = useState(initialData?.total_value > 0 ? "eur" : "pct");
  const [totalAmount, setTotalAmount] = useState(
    initialData?.total_value > 0 ? String(initialData.total_value.toFixed(2)) : ""
  );
  const [eurAmounts, setEurAmounts] = useState({});
  const [showTraspaso, setShowTraspaso] = useState(false);
  const [trasTransfers, setTrasTransfers] = useState([]);
  const [trasStandalone, setTrasStandalone] = useState([]);
  const [trasFromISIN, setTrasFromISIN] = useState("");
  const [trasToISIN, setTrasToISIN] = useState("");
  const [trasToIsNew, setTrasToIsNew] = useState(false);
  const [trasToNewFund, setTrasToNewFund] = useState(null);
  const [trasAmount, setTrasAmount] = useState("");
  const [trasAddFund, setTrasAddFund] = useState(null);
  const [trasAddAmount, setTrasAddAmount] = useState("");
  const [trasPlanTotal, setTrasPlanTotal] = useState(
    initialData?.total_value > 0 ? String(initialData.total_value.toFixed(2)) : ""
  );
  const [importPortId, setImportPortId] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  useEffect(() => {
    if (isEdit && initialData?.id && funds.length === 0 && (initialData.fund_count || 0) > 0) {
      fetch(`/api/portfolio/portfolios/${initialData.id}`).then((r) => r.json()).then((d) => setFunds(d.funds || []));
    }
  }, []);
  const getFundBalance = (isin) => {
    const eurAmt = parseFloat(eurAmounts[isin]);
    if (eurAmt >= 0 && eurAmounts[isin] !== void 0) return eurAmt;
    const fund = funds.find((f) => f.isin === isin);
    if (!fund) return 0;
    const tot = totalEurEntered > 0 ? totalEurEntered : parseFloat(totalAmount) || 0;
    return tot > 0 ? fund.weight * tot : fund.weight * 100;
  };
  const importFromPortfolio = (portId) => {
    if (!portId) return;
    setImportLoading(true);
    fetch(`/api/portfolio/portfolios/${portId}`).then((r) => r.json()).then((data) => {
      const toAdd = (data.funds || []).filter((f) => !funds.some((x) => x.isin === f.isin));
      if (toAdd.length === 0) {
        setImportLoading(false);
        return;
      }
      const srcTotal = data.total_value || 0;
      setFunds((prev) => {
        const next = [...prev, ...toAdd.map((f) => ({ isin: f.isin, name: f.name || f.isin, weight: f.weight || 0 }))];
        return next;
      });
      if (srcTotal > 0 && inputMode === "eur") {
        setEurAmounts((prev) => {
          const next = { ...prev };
          toAdd.forEach((f) => {
            next[f.isin] = ((f.weight || 0) * srcTotal).toFixed(2);
          });
          return next;
        });
      }
      setImportLoading(false);
      setImportPortId("");
    }).catch(() => setImportLoading(false));
  };
  const addFund = (fund) => {
    if (funds.some((f) => f.isin === fund.isin)) return;
    setFunds((prev) => {
      const next = [...prev, { isin: fund.isin, name: fund.name || fund.isin, weight: 0 }];
      return next;
    });
    if (inputMode === "eur") {
      setEurAmounts((prev) => ({ ...prev, [fund.isin]: "0" }));
    }
  };
  const removeFund = (isin) => {
    setFunds((prev) => prev.filter((f) => f.isin !== isin));
    setEurAmounts((prev) => {
      const n = { ...prev };
      delete n[isin];
      return n;
    });
  };
  const updateWeightPct = (isin, val) => setFunds((prev) => prev.map((f) => f.isin === isin ? { ...f, weight: parseFloat(val) / 100 } : f));
  const updateEurAmount = (isin, val) => {
    setEurAmounts((prev) => {
      const next = { ...prev, [isin]: val };
      const total = Object.values(next).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      if (total > 0) {
        setFunds((prevFunds) => prevFunds.map((f) => ({
          ...f,
          weight: (parseFloat(next[f.isin]) || 0) / total
        })));
      }
      return next;
    });
  };
  const applyTotalAmount = () => {
    const total = parseFloat(totalAmount) || 0;
    if (total <= 0 || funds.length === 0) return;
    const hasAmounts = funds.some((f) => parseFloat(eurAmounts[f.isin]) > 0);
    if (!hasAmounts) {
      const perFund = total / funds.length;
      const newAmounts = {};
      funds.forEach((f) => {
        newAmounts[f.isin] = perFund.toFixed(2);
      });
      setEurAmounts(newAmounts);
      setFunds((prev) => prev.map((f) => ({ ...f, weight: 1 / prev.length })));
    }
  };
  const normalizeWeights = () => {
    if (inputMode === "eur") {
      const total = totalEurEntered;
      if (total <= 0) return;
      setFunds((prev) => prev.map((f) => ({
        ...f,
        weight: (parseFloat(eurAmounts[f.isin]) || 0) / total
      })));
    } else {
      const total = funds.reduce((s, f) => s + (f.weight || 0), 0);
      if (total <= 0) return;
      setFunds((prev) => prev.map((f) => ({ ...f, weight: f.weight / total })));
    }
  };
  const getPlanBalance = (isin) => {
    const plan = parseFloat(trasPlanTotal);
    if (plan > 0) {
      const eurAmt = parseFloat(eurAmounts[isin]);
      if (eurAmt >= 0 && eurAmounts[isin] !== void 0) return eurAmt;
      const fund = funds.find((f) => f.isin === isin);
      return fund ? (fund.weight || 0) * plan : 0;
    }
    return getFundBalance(isin);
  };
  const getTrasBal = () => {
    const bal = {};
    funds.forEach((f) => {
      bal[f.isin] = getPlanBalance(f.isin);
    });
    trasTransfers.forEach((t) => {
      bal[t.fromISIN] = (bal[t.fromISIN] || 0) - t.amount;
      if (t.toISIN) bal[t.toISIN] = (bal[t.toISIN] || 0) + t.amount;
    });
    trasStandalone.forEach((a) => {
      bal[a.isin] = (bal[a.isin] || 0) + a.amount;
    });
    return bal;
  };
  const addTrasTransfer = () => {
    const destISIN = trasToIsNew ? trasToNewFund?.isin : trasToISIN;
    const destName = trasToIsNew ? trasToNewFund?.name : funds.find((f) => f.isin === trasToISIN)?.name || trasToISIN;
    if (!trasFromISIN || !destISIN || !trasAmount || parseFloat(trasAmount) <= 0) return;
    setTrasTransfers((prev) => [...prev, {
      id: Date.now(),
      fromISIN: trasFromISIN,
      fromName: funds.find((f) => f.isin === trasFromISIN)?.name || trasFromISIN,
      toISIN: destISIN,
      toName: destName,
      toIsNew: trasToIsNew,
      amount: parseFloat(trasAmount)
    }]);
    setTrasAmount("");
    if (trasToIsNew) setTrasToNewFund(null);
  };
  const addTrasStandalone = () => {
    if (!trasAddFund || !trasAddAmount || parseFloat(trasAddAmount) <= 0) return;
    setTrasStandalone((prev) => [...prev, { id: Date.now(), isin: trasAddFund.isin, name: trasAddFund.name, amount: parseFloat(trasAddAmount) }]);
    setTrasAddFund(null);
    setTrasAddAmount("");
  };
  const resetTraspasoInputs = () => {
    setTrasTransfers([]);
    setTrasStandalone([]);
    setTrasFromISIN("");
    setTrasToISIN("");
    setTrasToIsNew(false);
    setTrasToNewFund(null);
    setTrasAmount("");
    setTrasAddFund(null);
    setTrasAddAmount("");
    setTrasPlanTotal("");
  };
  const applyTraspasoToFunds = () => {
    const bal = getTrasBal();
    const total = Object.values(bal).reduce((s, v) => s + Math.max(v, 0), 0);
    if (total <= 0) return;
    const nameMap = {};
    funds.forEach((f) => {
      nameMap[f.isin] = f.name;
    });
    trasTransfers.filter((t) => t.toIsNew).forEach((t) => {
      nameMap[t.toISIN] = t.toName;
    });
    trasStandalone.forEach((a) => {
      nameMap[a.isin] = a.name;
    });
    const newFunds = Object.entries(bal).filter(([, v]) => v > 0.01).map(([isin, v]) => ({ isin, name: nameMap[isin] || isin, weight: v / total }));
    setFunds(newFunds);
    const newAmounts = {};
    newFunds.forEach((f) => {
      newAmounts[f.isin] = (f.weight * total).toFixed(2);
    });
    setEurAmounts(newAmounts);
    setTotalAmount(total.toFixed(2));
    setInputMode("eur");
    resetTraspasoInputs();
    setShowTraspaso(false);
  };
  const save = () => {
    if (!name || funds.length === 0) return;
    setSaving(true);
    const url = isEdit ? `/api/portfolio/portfolios/${initialData.id}` : "/api/portfolio/portfolios";
    const method = isEdit ? "PUT" : "POST";
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, color, funds, total_value: inputMode === "eur" ? totalEurEntered : parseFloat(totalAmount) || 0 })
    }).then((r) => r.json()).then((p) => {
      onSave(p);
      setSaving(false);
    }).catch(() => setSaving(false));
  };
  const totalW = funds.reduce((s, f) => s + (f.weight || 0), 0);
  const isPctOk = Math.abs(totalW - 1) < 5e-3;
  const totalEurEntered = Object.values(eurAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const inputStyle = { padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.85rem" };
  const trasBal = showTraspaso ? getTrasBal() : {};
  const trasTotalAfter = Object.values(trasBal).reduce((s, v) => s + Math.max(v, 0), 0);
  const trasHasChanges = trasTransfers.length > 0 || trasStandalone.length > 0;
  const trasHasErrors = Object.values(trasBal).some((v) => v < -0.01);
  const trasTotalBase = funds.reduce((s, f) => s + getPlanBalance(f.isin), 0);
  const trasPlanTotalNum = parseFloat(trasPlanTotal) || 0;
  return /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1.25rem", marginBottom: "10px", border: "1px solid rgba(137,247,254,0.2)" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 1rem", fontWeight: 600 } }, isEdit ? "\u270F\uFE0F Editar cartera" : "\uFF0B Nueva cartera"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", marginBottom: "10px", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      value: name,
      onChange: (e) => setName(e.target.value),
      placeholder: "Nombre de la cartera *",
      style: { flex: "1 1 200px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.85rem" }
    }
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: description,
      onChange: (e) => setDescription(e.target.value),
      placeholder: "Descripci\xF3n (opcional)",
      style: { flex: "2 1 260px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-glass)", background: "var(--bg-glass)", color: "white", fontSize: "0.85rem" }
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "4px", alignItems: "center" } }, PORTFOLIO_COLORS.map((c) => /* @__PURE__ */ React.createElement("button", { key: c, onClick: () => setColor(c), style: { width: "22px", height: "22px", borderRadius: "50%", background: c, border: color === c ? "3px solid white" : "2px solid transparent", cursor: "pointer", flexShrink: 0 } })))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" } }, "Modo de entrada:"), [["pct", "% Porcentajes"], ["eur", "\u20AC Importes"]].map(([m, label]) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: m,
      onClick: () => {
        if (m === "eur" && inputMode !== "eur") {
          const tot = parseFloat(totalAmount);
          const base = tot > 0 ? tot : 100;
          const derived = {};
          funds.forEach((f) => {
            derived[f.isin] = ((f.weight || 0) * base).toFixed(2);
          });
          setEurAmounts((prev) => {
            const merged = { ...derived };
            funds.forEach((f) => {
              const existing = parseFloat(prev[f.isin]);
              if (existing > 0) merged[f.isin] = prev[f.isin];
            });
            return merged;
          });
          if (!tot) setTotalAmount("100");
        }
        setInputMode(m);
      },
      style: {
        padding: "4px 14px",
        borderRadius: "16px",
        fontWeight: 600,
        fontSize: "0.78rem",
        cursor: "pointer",
        border: inputMode === m ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)",
        background: inputMode === m ? "var(--accent-glow)" : "transparent",
        color: inputMode === m ? "#000" : "var(--text-primary)"
      }
    },
    label
  )), inputMode === "eur" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.75rem", color: "var(--text-secondary)" } }, totalEurEntered > 0 ? "Total actual (\u20AC):" : "Inversi\xF3n total (\u20AC):"), totalEurEntered > 0 ? (
    // Read-only once amounts are set — reflects the real sum of all fund amounts
    /* @__PURE__ */ React.createElement("span", { style: { ...inputStyle, width: "120px", display: "inline-block", textAlign: "right", fontWeight: 700, color: "var(--accent-glow)", fontVariantNumeric: "tabular-nums" } }, totalEurEntered.toLocaleString("es-ES", { minimumFractionDigits: 2 }))
  ) : (
    // Editable seed: used only to distribute total equally when no amounts entered yet
    /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "0",
        step: "100",
        placeholder: "ej: 10000",
        value: totalAmount,
        onChange: (e) => setTotalAmount(e.target.value),
        onBlur: applyTotalAmount,
        style: { ...inputStyle, width: "120px" }
      }
    )
  ))), funds.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.78rem", color: "var(--text-secondary)" } }, "Fondos: ", funds.length, inputMode === "pct" && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 Total: ", /* @__PURE__ */ React.createElement("span", { style: { color: isPctOk ? "var(--success)" : "var(--warning)", fontWeight: 700 } }, (totalW * 100).toFixed(1), "%")), inputMode === "eur" && /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 Total: ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--accent-glow)", fontWeight: 700 } }, "\u20AC", totalEurEntered.toLocaleString("es-ES", { minimumFractionDigits: 2 })))), /* @__PURE__ */ React.createElement("button", { onClick: normalizeWeights, style: { fontSize: "0.72rem", padding: "3px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.07)", border: "1px solid var(--border-glass)", color: "var(--text-secondary)", cursor: "pointer" } }, inputMode === "eur" ? "Recalcular %" : "Normalizar a 100%")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, funds.map((f) => /* @__PURE__ */ React.createElement("div", { key: f.isin, style: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", fontFamily: "monospace", color: "var(--accent-glow)", minWidth: "95px" } }, f.isin), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: f.name }, f.name), inputMode === "pct" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "range",
      min: "0",
      max: "100",
      step: "0.5",
      value: Math.round((f.weight || 0) * 100 * 10) / 10,
      onChange: (e) => updateWeightPct(f.isin, e.target.value),
      style: { width: "100px", accentColor: color }
    }
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      max: "100",
      step: "0.1",
      value: ((f.weight || 0) * 100).toFixed(1),
      onChange: (e) => updateWeightPct(f.isin, e.target.value),
      style: { ...inputStyle, width: "72px", textAlign: "right", padding: "4px 8px" }
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.78rem", color: "var(--text-secondary)", minWidth: "12px" } }, "%")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", minWidth: "42px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, ((f.weight || 0) * 100).toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.78rem", color: "var(--text-secondary)" } }, "\u20AC"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      step: "any",
      placeholder: "0,00",
      value: eurAmounts[f.isin] ?? "0",
      onChange: (e) => updateEurAmount(f.isin, e.target.value),
      style: { ...inputStyle, width: "110px", textAlign: "right", padding: "4px 8px" }
    }
  )), /* @__PURE__ */ React.createElement("button", { onClick: () => removeFund(f.isin), style: { background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "1rem", padding: "0 4px" } }, "\xD7"))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap", alignItems: "flex-end" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 260px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" } }, "A\xF1adir fondo"), /* @__PURE__ */ React.createElement(FundSearchInput, { placeholder: "Buscar por ISIN o nombre...", onSelect: addFund, clearOnSelect: true })), portfolios.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.75rem", color: "var(--text-secondary)" } }, "Importar fondos de otra cartera"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px" } }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: importPortId,
      onChange: (e) => setImportPortId(e.target.value),
      style: { ...inputStyle, flex: 1, minWidth: 0 }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 Selecciona cartera \u2014"),
    portfolios.map((p) => /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.name))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => importFromPortfolio(importPortId),
      disabled: !importPortId || importLoading,
      style: { padding: "8px 14px", background: importPortId ? "rgba(74,162,175,0.3)" : "var(--border-glass)", color: importPortId ? "white" : "var(--text-secondary)", border: "1px solid var(--accent-glow)", borderRadius: "6px", fontWeight: 700, cursor: importPortId ? "pointer" : "not-allowed", whiteSpace: "nowrap", fontSize: "0.82rem" }
    },
    importLoading ? "\u23F3" : "\uFF0B Importar"
  )))), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "12px" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        if (!trasPlanTotal) {
          const derived = totalEurEntered > 0 ? totalEurEntered : parseFloat(totalAmount) || 0;
          if (derived > 0) setTrasPlanTotal(derived.toFixed(2));
        }
        setShowTraspaso((p) => !p);
      },
      style: { padding: "6px 16px", borderRadius: "8px", border: "1px dashed var(--accent-glow)", background: "rgba(74,162,175,0.07)", color: "var(--accent-glow)", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }
    },
    showTraspaso ? "\u25B2 Ocultar planificador de traspasos" : "\u2696\uFE0F Realizar traspasos"
  )), showTraspaso && /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(0,0,0,0.2)", borderRadius: "10px", border: "1px solid rgba(74,162,175,0.25)", padding: "1.25rem", marginBottom: "12px" } }, /* @__PURE__ */ React.createElement("h5", { style: { margin: "0 0 0.5rem", fontWeight: 600, color: "var(--accent-glow)" } }, "\u2696\uFE0F Realizar traspasos"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" } }, "Redistribuye los fondos de ", /* @__PURE__ */ React.createElement("strong", null, "esta cartera"), ": traspasa importe (\u20AC) de un fondo a otro o a\xF1ade nueva inversi\xF3n. Al aplicar, los pesos se actualizan y el planificador se reinicia."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem", padding: "10px 14px", background: "rgba(74,162,175,0.06)", borderRadius: "8px", border: "1px solid rgba(74,162,175,0.2)", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", whiteSpace: "nowrap" } }, "Valor total de la cartera (\u20AC):"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      step: "100",
      placeholder: totalEurEntered > 0 ? totalEurEntered.toFixed(2) : parseFloat(totalAmount) ? parseFloat(totalAmount).toFixed(2) : "ej: 20000",
      value: trasPlanTotal,
      onChange: (e) => setTrasPlanTotal(e.target.value),
      style: { ...inputStyle, width: "150px", fontWeight: 700, color: "var(--accent-glow)" }
    }
  ), !trasPlanTotalNum && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--warning)" } }, "\u26A0\uFE0F Necesario para introducir importes en \u20AC"), trasPlanTotalNum > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "var(--success)" } }, "\u2714 Los saldos se calculan sobre \u20AC", trasPlanTotalNum.toLocaleString("es-ES", { minimumFractionDigits: 0 }))), funds.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: "0.85rem" } }, "A\xF1ade fondos a la cartera antes de usar el planificador.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "1rem", overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "1px solid rgba(255,255,255,0.1)" } }, /* @__PURE__ */ React.createElement("th", { style: { textAlign: "left", padding: "6px 10px", color: "var(--text-secondary)", fontSize: "0.7rem", textTransform: "uppercase" } }, "Fondo"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "6px 10px", color: "var(--text-secondary)", fontSize: "0.7rem", textTransform: "uppercase" } }, "Saldo (\u20AC)"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", padding: "6px 10px", color: "var(--text-secondary)", fontSize: "0.7rem", textTransform: "uppercase" } }, "Peso"))), /* @__PURE__ */ React.createElement("tbody", null, [...funds].sort((a, b) => getFundBalance(b.isin) - getFundBalance(a.isin)).map((f) => {
    const val = getFundBalance(f.isin);
    return /* @__PURE__ */ React.createElement("tr", { key: f.isin, style: { borderBottom: "1px solid rgba(255,255,255,0.04)" } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 10px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, f.name), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "6px", fontSize: "0.7rem", color: "var(--text-secondary)" } }, f.isin)), /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" } }, trasPlanTotalNum > 0 ? `\u20AC${val.toLocaleString("es-ES", { minimumFractionDigits: 2 })}` : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--warning)", fontSize: "0.75rem" } }, "\u2014 Introduce valor total \u2014")), /* @__PURE__ */ React.createElement("td", { style: { padding: "5px 10px", textAlign: "right", color: "var(--text-secondary)" } }, trasTotalBase > 0 ? (val / trasTotalBase * 100).toFixed(1) : (f.weight * 100).toFixed(1), "%"));
  })))), /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(0,0,0,0.15)", borderRadius: "8px", border: "1px dashed var(--border-glass)", padding: "1rem", marginBottom: "0.75rem" } }, /* @__PURE__ */ React.createElement("h6", { style: { margin: "0 0 0.75rem", fontWeight: 600, color: "var(--accent-glow)", fontSize: "0.82rem" } }, "\u2795 A\xF1adir Traspaso"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Origen"), /* @__PURE__ */ React.createElement("select", { value: trasFromISIN, onChange: (e) => setTrasFromISIN(e.target.value), style: { ...inputStyle, minWidth: "180px" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 Selecciona fondo \u2014"), funds.map((f) => /* @__PURE__ */ React.createElement("option", { key: f.isin, value: f.isin }, f.name)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "1.2rem", paddingBottom: "4px", color: "var(--accent-glow)" } }, "\u2192"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Destino"), /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: trasToIsNew, onChange: (e) => {
    setTrasToIsNew(e.target.checked);
    setTrasToISIN("");
    setTrasToNewFund(null);
  } }), "Fondo nuevo")), trasToIsNew ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement(FundSearchInput, { placeholder: "Busca el fondo destino", clearOnSelect: false, onSelect: (f) => setTrasToNewFund(f) }), trasToNewFund && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", padding: "3px 7px", background: "rgba(74,162,175,0.1)", borderRadius: "4px", color: "var(--accent-glow)" } }, "\u2714 ", trasToNewFund.isin, " \u2014 ", trasToNewFund.name)) : /* @__PURE__ */ React.createElement("select", { value: trasToISIN, onChange: (e) => setTrasToISIN(e.target.value), style: { ...inputStyle, minWidth: "180px" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 Selecciona fondo \u2014"), funds.filter((f) => f.isin !== trasFromISIN).map((f) => /* @__PURE__ */ React.createElement("option", { key: f.isin, value: f.isin }, f.name)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Importe (\u20AC)"), trasFromISIN && funds.find((f) => f.isin === trasFromISIN) && trasPlanTotalNum > 0 && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
    setTrasAmount(String(getPlanBalance(trasFromISIN).toFixed(2)));
  }, style: { fontSize: "0.62rem", padding: "1px 5px", borderRadius: "4px", border: "1px solid var(--accent-glow)", background: "rgba(74,162,175,0.15)", color: "var(--accent-glow)", cursor: "pointer", fontWeight: 700 } }, "Todo")), trasFromISIN && funds.find((f) => f.isin === trasFromISIN) && trasPlanTotalNum > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.68rem", color: "var(--text-secondary)" } }, "Disponible: \u20AC", getPlanBalance(trasFromISIN).toLocaleString("es-ES", { minimumFractionDigits: 2 }), " \xB7 ", "Tras traspasos: \u20AC", (trasBal[trasFromISIN] ?? getPlanBalance(trasFromISIN)).toFixed(2)), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", step: "any", placeholder: "0,00", value: trasAmount, onChange: (e) => setTrasAmount(e.target.value), style: { ...inputStyle, width: "130px" } })), /* @__PURE__ */ React.createElement("button", { onClick: addTrasTransfer, style: { padding: "7px 16px", background: "var(--accent-glow)", color: "black", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer", height: "35px", alignSelf: "flex-end" } }, "A\xF1adir"))), /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(0,0,0,0.1)", borderRadius: "8px", border: "1px dashed rgba(74,162,175,0.25)", padding: "1rem", marginBottom: "0.75rem" } }, /* @__PURE__ */ React.createElement("h6", { style: { margin: "0 0 0.75rem", fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.82rem" } }, "\u{1F4B0} Aportaci\xF3n nueva (sin traspaso)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 200px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Fondo destino"), /* @__PURE__ */ React.createElement(FundSearchInput, { placeholder: "Busca por ISIN o nombre", onSelect: (f) => setTrasAddFund(f), clearOnSelect: false }), trasAddFund && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", padding: "3px 7px", background: "rgba(74,162,175,0.1)", borderRadius: "4px", color: "var(--accent-glow)" } }, "\u2714 ", trasAddFund.isin, " \u2014 ", trasAddFund.name)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" } }, "Importe (\u20AC)"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", step: "any", placeholder: "0,00", value: trasAddAmount, onChange: (e) => setTrasAddAmount(e.target.value), style: { ...inputStyle, width: "110px" } })), /* @__PURE__ */ React.createElement("button", { onClick: addTrasStandalone, style: { padding: "7px 14px", background: "rgba(74,162,175,0.3)", color: "white", border: "1px solid var(--accent-glow)", borderRadius: "6px", fontWeight: 700, cursor: "pointer", height: "35px", alignSelf: "flex-end" } }, "A\xF1adir")), trasStandalone.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "4px" } }, trasStandalone.map((a) => /* @__PURE__ */ React.createElement("div", { key: a.id, style: { display: "flex", alignItems: "center", gap: "8px", padding: "5px 10px", background: "rgba(74,162,175,0.08)", borderRadius: "5px", border: "1px solid rgba(74,162,175,0.2)", fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontWeight: 600 } }, a.name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, a.isin), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--success)", fontWeight: 700, fontVariantNumeric: "tabular-nums" } }, "+\u20AC", a.amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setTrasStandalone((prev) => prev.filter((x) => x.id !== a.id)), style: { background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "var(--danger)", borderRadius: "4px", padding: "1px 6px", cursor: "pointer", fontSize: "0.75rem" } }, "\u2715"))))), trasTransfers.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "0.75rem" } }, /* @__PURE__ */ React.createElement("h6", { style: { margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.8rem" } }, "\u{1F4CB} Traspasos definidos"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "5px" } }, trasTransfers.map((t) => {
    const balAfter = trasBal[t.fromISIN] ?? 0;
    const neg = balAfter < -0.01;
    return /* @__PURE__ */ React.createElement("div", { key: t.id, style: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: neg ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)", borderRadius: "6px", border: `1px solid ${neg ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}`, fontSize: "0.82rem" } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontWeight: 600 } }, t.fromName), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--danger)", fontVariantNumeric: "tabular-nums" } }, "\u2212\u20AC", t.amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)" } }, "\u2192"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontWeight: 600 } }, t.toName, t.toIsNew && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.65rem", background: "rgba(74,162,175,0.2)", color: "var(--accent-glow)", padding: "1px 4px", borderRadius: "3px", marginLeft: "5px" } }, "nuevo")), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--success)", fontVariantNumeric: "tabular-nums" } }, "+\u20AC", t.amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })), neg && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", color: "var(--danger)" } }, "\u26A0\uFE0F saldo insuf."), /* @__PURE__ */ React.createElement("button", { onClick: () => setTrasTransfers((prev) => prev.filter((x) => x.id !== t.id)), style: { background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "var(--danger)", borderRadius: "4px", padding: "1px 6px", cursor: "pointer", fontSize: "0.75rem" } }, "\u2715"));
  }))), trasHasChanges && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginTop: "0.5rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.82rem", color: "var(--text-secondary)" } }, "Resultado: ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--accent-glow)" } }, "\u20AC", trasTotalAfter.toLocaleString("es-ES", { minimumFractionDigits: 2 }))), trasHasErrors && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.78rem", color: "var(--danger)" } }, "\u26A0\uFE0F Saldo insuficiente en alg\xFAn origen"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: applyTraspasoToFunds,
      disabled: trasHasErrors,
      style: { marginLeft: "auto", padding: "8px 20px", background: trasHasErrors ? "var(--border-glass)" : "var(--accent-glow)", color: trasHasErrors ? "var(--text-secondary)" : "#000", border: "none", borderRadius: "8px", fontWeight: 700, cursor: trasHasErrors ? "not-allowed" : "pointer" }
    },
    "\u2705 Aplicar a cartera"
  )))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px" } }, /* @__PURE__ */ React.createElement("button", { onClick: save, disabled: saving || !name || funds.length === 0, style: { padding: "8px 20px", background: name && funds.length > 0 ? "var(--accent-glow)" : "var(--border-glass)", color: name && funds.length > 0 ? "#000" : "var(--text-secondary)", border: "none", borderRadius: "8px", fontWeight: 700, cursor: name && funds.length > 0 ? "pointer" : "not-allowed" } }, saving ? "\u23F3 Guardando..." : isEdit ? "Guardar cambios" : "Crear cartera"), /* @__PURE__ */ React.createElement("button", { onClick: onCancel, style: { padding: "8px 16px", background: "transparent", border: "1px solid var(--border-glass)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer" } }, "Cancelar")));
};
const CompareResultPanel = ({ result, years, signColor }) => {
  const [zoom, setZoom] = useState(String(years) + "Y");
  const colA = "#FFD700", colB = "#4ade80";
  const datasets = {};
  if (result.portfolio_a?.series?.length > 0) datasets[result.portfolio_a.name] = result.portfolio_a.series.map((p) => ({ date: p.date, price: p.price }));
  if (result.portfolio_b?.series?.length > 0) datasets[result.portfolio_b.name] = result.portfolio_b.series.map((p) => ({ date: p.date, price: p.price }));
  const colorMap = { [result.portfolio_a?.name]: colA, [result.portfolio_b?.name]: colB };
  const activeFunds = Object.keys(datasets);
  const m = (port, field) => port?.metrics?.[field];
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "3px", marginBottom: "1.5rem" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" } }, "M\xE9trica"), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", fontSize: "0.8rem", fontWeight: 700, color: colA, textAlign: "center", background: "rgba(255,215,0,0.06)", borderRadius: "8px 8px 0 0" } }, result.portfolio_a?.name), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", fontSize: "0.8rem", fontWeight: 700, color: colB, textAlign: "center", background: "rgba(74,222,128,0.06)", borderRadius: "8px 8px 0 0" } }, result.portfolio_b?.name), [
    { label: "\u{1F4C8} Retorno Total", field: "total_return", unit: "%" },
    { label: "\u{1F4CA} CAGR", field: "ann_return", unit: "%" },
    { label: "\u{1F30A} Volatilidad", field: "vol", unit: "%", invert: true },
    { label: "\u26A1 Sharpe", field: "sharpe", unit: "" },
    { label: "\u{1F4C9} M\xE1x. Drawdown", field: "max_dd", unit: "%", invert: true }
  ].map(({ label, field, unit, invert }) => {
    const vA = m(result.portfolio_a, field);
    const vB = m(result.portfolio_b, field);
    const winner = vA != null && vB != null ? invert ? vA < vB ? "A" : vA > vB ? "B" : "" : vA > vB ? "A" : vA < vB ? "B" : "" : "";
    const fmt = (v) => v != null ? `${v >= 0 && !invert ? "+" : ""}${v.toFixed(2)}${unit}` : "\u2014";
    return /* @__PURE__ */ React.createElement(React.Fragment, { key: field }, /* @__PURE__ */ React.createElement("div", { style: { padding: "7px 12px", fontSize: "0.82rem", color: "var(--text-secondary)", alignSelf: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" } }, label), /* @__PURE__ */ React.createElement("div", { style: { padding: "7px 12px", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: "0.88rem", background: "rgba(255,215,0,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)", color: vA != null ? signColor(invert ? -vA : vA) : "var(--text-secondary)", position: "relative" } }, fmt(vA), winner === "A" && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", right: "6px", color: "#FFD700", fontSize: "0.7rem" } }, "\u2605")), /* @__PURE__ */ React.createElement("div", { style: { padding: "7px 12px", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: "0.88rem", background: "rgba(74,222,128,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)", color: vB != null ? signColor(invert ? -vB : vB) : "var(--text-secondary)", position: "relative" } }, fmt(vB), winner === "B" && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", right: "6px", color: "#4ade80", fontSize: "0.7rem" } }, "\u2605")));
  })), activeFunds.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem", marginBottom: "1rem" } }, /* @__PURE__ */ React.createElement("h4", { style: { margin: "0 0 0.75rem", fontWeight: 600 } }, "\u{1F4C9} Evoluci\xF3n comparativa (base 100)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", marginBottom: "8px" } }, [String(years) + "Y", "MAX"].map((z) => /* @__PURE__ */ React.createElement("button", { key: z, onClick: () => setZoom(z), style: { padding: "3px 10px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", border: zoom === z ? "1px solid var(--accent-glow)" : "1px solid var(--border-glass)", background: zoom === z ? "var(--accent-glow)" : "transparent", color: zoom === z ? "#000" : "var(--text-primary)" } }, z))), /* @__PURE__ */ React.createElement(
    InteractiveChart,
    {
      datasets,
      timeframe: zoom === "MAX" ? "MAX" : zoom.replace("Y", "Y"),
      activeFunds,
      customRange: null,
      fundColorMap: colorMap
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "glass-panel", style: { padding: "1rem" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.85rem", marginBottom: "8px" } }, /* @__PURE__ */ React.createElement("strong", null, "Fondos en com\xFAn:"), " ", /* @__PURE__ */ React.createElement("span", { style: { color: result.overlap_count > 0 ? "var(--warning)" : "var(--success)" } }, result.overlap_count), result.overlap_count > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.78rem", marginLeft: "8px" } }, "(", result.overlap_isins?.join(", "), ")")), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.8rem" } }, [result.portfolio_a, result.portfolio_b].map((port, idx) => /* @__PURE__ */ React.createElement("div", { key: idx }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: idx === 0 ? colA : colB, marginBottom: "5px" } }, port?.name), (port?.funds || []).map((f) => /* @__PURE__ */ React.createElement("div", { key: f.isin, style: { display: "flex", gap: "6px", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--accent-glow)", minWidth: "45px", fontWeight: 600 } }, ((f.weight || 0) * 100).toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: "0.7rem", fontFamily: "monospace", minWidth: "80px" } }, f.isin), /* @__PURE__ */ React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: result.overlap_isins?.includes(f.isin) ? "var(--warning)" : "var(--text-primary)" }, title: f.name }, f.name?.substring(0, 35) || f.isin))))))));
};
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshingNav, setRefreshingNav] = useState(false);
  const [pollingNav, setPollingNav] = useState(false);
  const [refreshToast, setRefreshToast] = useState(false);
  const navRefreshBuiltAtRef = React.useRef(null);
  const navPollIntervalRef = React.useRef(null);
  const [refreshingDetails, setRefreshingDetails] = useState(false);
  const [refreshDetailsKey, setRefreshDetailsKey] = useState(0);
  const [refreshStep, setRefreshStep] = useState("");
  const [refreshElapsed, setRefreshElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState("general");
  const refreshIntervalRef = React.useRef(null);
  const loadData = (endpoint = "/api/portfolio/summary", retries = 4, delay = 2e3) => {
    fetch(endpoint).then((res) => res.json()).then((json) => {
      if (json && json.summary) {
        setData(json);
        setLoading(false);
      } else if (retries > 0) {
        setTimeout(() => loadData(endpoint, retries - 1, delay), delay);
      } else {
        setData(json);
        setLoading(false);
      }
    }).catch((err) => {
      console.error("Error fetching data:", err);
      if (retries > 0) {
        setTimeout(() => loadData(endpoint, retries - 1, delay), delay);
      } else {
        setLoading(false);
      }
    });
  };
  const handleRefreshNav = () => {
    if (pollingNav) return;
    navRefreshBuiltAtRef.current = data?.built_at || null;
    setRefreshingNav(true);
    fetch("/api/portfolio/refresh-nav").then((res) => res.json()).then(() => {
      setRefreshingNav(false);
      setPollingNav(true);
      if (navPollIntervalRef.current) clearInterval(navPollIntervalRef.current);
      let elapsed = 0;
      navPollIntervalRef.current = setInterval(() => {
        elapsed += 5;
        fetch("/api/portfolio/summary").then((r) => r.json()).then((json) => {
          if (json.built_at && json.built_at !== navRefreshBuiltAtRef.current) {
            clearInterval(navPollIntervalRef.current);
            setPollingNav(false);
            setData(json);
            setRefreshToast(true);
            setTimeout(() => setRefreshToast(false), 4e3);
          } else if (elapsed >= 300) {
            clearInterval(navPollIntervalRef.current);
            setPollingNav(false);
          }
        }).catch(() => {
          if (elapsed >= 300) {
            clearInterval(navPollIntervalRef.current);
            setPollingNav(false);
          }
        });
      }, 5e3);
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
  const tabs = ["general", "detalles", "evolucion", "oportunidades", "simulador", "retiradas", "carteras"];
  const tabLabels = { general: "General", detalles: "Detalles", evolucion: "Evoluci\xF3n", oportunidades: "Oportunidades", simulador: "Simulador", retiradas: "Retiradas", carteras: "\u{1F4BC} Carteras" };
  return /* @__PURE__ */ React.createElement("div", { className: "dashboard-container" }, /* @__PURE__ */ React.createElement("header", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Portfolio Tracker")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "5px", background: "rgba(0,0,0,0.3)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-glass)" } }, tabs.map((tab) => /* @__PURE__ */ React.createElement("button", { key: tab, onClick: () => setActiveTab(tab), style: {
    padding: "8px 16px",
    background: activeTab === tab ? "var(--accent-glow)" : "transparent",
    color: activeTab === tab ? "#000" : "var(--text-primary)",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s"
  } }, tabLabels[tab]))), refreshToast && /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    bottom: "1.5rem",
    right: "1.5rem",
    zIndex: 9999,
    background: "linear-gradient(135deg,#0d6e3b,#14a356)",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "10px",
    fontWeight: "600",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    animation: "fadeInUp 0.3s ease"
  } }, "\u2713 Datos actualizados"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleRefreshNav,
      disabled: refreshingNav || pollingNav,
      style: {
        padding: "10px 20px",
        background: refreshingNav || pollingNav ? "var(--border-glass)" : "var(--bg-glass)",
        color: refreshingNav || pollingNav ? "var(--text-secondary)" : "#fff",
        border: pollingNav ? "1px solid #14a356" : "1px solid var(--border-glass)",
        borderRadius: "8px",
        fontWeight: "600",
        cursor: refreshingNav || pollingNav ? "not-allowed" : "pointer",
        transition: "all 0.3s"
      }
    },
    refreshingNav ? "Iniciando..." : pollingNav ? "\u23F3 Recalculando..." : "\u{1F504} Recalcular Cotizaciones"
  )), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "2rem" } }, /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "general" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(GeneralTab, { data, chartData, reloadData: loadData })), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "detalles" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(
    DetailsTab,
    {
      onRefreshDetails: handleRefreshDetails,
      refreshingDetails,
      refreshStep,
      refreshElapsed,
      refreshDetailsKey
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "evolucion" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(EvolutionTab, { rawData: data })), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "oportunidades" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(OportunidadesTab, null)), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "simulador" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(SimuladorTab, null)), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "retiradas" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(RetiradasTab, null)), /* @__PURE__ */ React.createElement("div", { style: { display: activeTab === "carteras" ? "block" : "none" } }, /* @__PURE__ */ React.createElement(CarterasTab, null))));
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
