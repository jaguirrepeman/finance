const { useState, useEffect, useRef, useMemo, useCallback } = React;
const COLORS = ['#4ca1af', '#c4e0e5', '#89f7fe', '#66a6ff', '#f3a183', '#a18cd1', '#fbc2eb', '#fad0c4', '#ff9a9e', '#fecfef'];

// ---------------- UI COMPONENTS ----------------
const AdviceCard = ({ advice, type = "info" }) => (
    <div className={`glass-panel advice-card ${type}`}>
        <div className="advice-title">{advice.title}</div>
        <div className="advice-text">{advice.text}</div>
    </div>
);

// ─── PortfolioValueChart ─────────────────────────────────────────────────────
// Canvas chart showing real portfolio value (€) vs invested capital over time.
const PortfolioValueChart = ({ series }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const [dims, setDims] = useState({ w: 800, h: 280 });
    const [zoomRange, setZoomRange] = useState('ALL'); // '3M'|'6M'|'1Y'|'2Y'|'ALL'

    // Filter series by zoom range
    const filteredSeries = useMemo(() => {
        if (!series || !series.length) return series;
        if (zoomRange === 'ALL') return series;
        const now = new Date(series[series.length - 1].date);
        const cutoff = new Date(now);
        if (zoomRange === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
        else if (zoomRange === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
        else if (zoomRange === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
        else if (zoomRange === '2Y') cutoff.setFullYear(cutoff.getFullYear() - 2);
        return series.filter(d => new Date(d.date) >= cutoff);
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
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const mg = { top: 20, right: 20, bottom: 36, left: 72 };
        const pw = w - mg.left - mg.right;
        const ph = h - mg.top - mg.bottom;

        const values = filteredSeries.map(d => d.value);
        const invested = filteredSeries.map(d => d.invested);
        const allY = [...values, ...invested].filter(Boolean);
        const minY = Math.min(...allY) * 0.97;
        const maxY = Math.max(...allY) * 1.03;
        const dates = filteredSeries.map(d => new Date(d.date).getTime());
        const minX = dates[0], maxX = dates[dates.length - 1];

        const xS = ts => mg.left + (ts - minX) / (maxX - minX || 1) * pw;
        const yS = v => mg.top + ph - (v - minY) / (maxY - minY || 1) * ph;

        // Grid lines
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.font = '10px Inter, sans-serif';
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const v = minY + (maxY - minY) * (i / steps);
            const y = yS(v);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(mg.left, y); ctx.lineTo(mg.left + pw, y); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(`€${(v / 1000).toFixed(0)}k`, mg.left - 6, y);
        }

        // X labels
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (let i = 0; i <= 6; i++) {
            const ts = minX + (i / 6) * (maxX - minX);
            const x = xS(ts);
            const d = new Date(ts);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText(`${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`, x, h - mg.bottom + 8);
        }

        // Gain/loss fill between value and invested lines
        ctx.beginPath();
        filteredSeries.forEach((d, i) => { const x = xS(dates[i]); const y = yS(d.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        filteredSeries.slice().reverse().forEach((d, i, arr) => {
            const origIdx = arr.length - 1 - i;
            ctx.lineTo(xS(dates[origIdx]), yS(d.invested));
        });
        ctx.closePath();
        const lastGain = filteredSeries[filteredSeries.length - 1].value - filteredSeries[filteredSeries.length - 1].invested;
        ctx.fillStyle = lastGain >= 0 ? 'rgba(0,212,170,0.12)' : 'rgba(239,68,68,0.12)';
        ctx.fill();

        // Invested line (dashed)
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        filteredSeries.forEach((d, i) => { const x = xS(dates[i]); const y = yS(d.invested); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.stroke();
        ctx.setLineDash([]);

        // Value line (gold)
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2.5;
        ctx.shadowColor = '#FFD70060'; ctx.shadowBlur = 8;
        ctx.beginPath();
        filteredSeries.forEach((d, i) => { const x = xS(dates[i]); const y = yS(d.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.stroke();
        ctx.shadowBlur = 0;
    }, [filteredSeries, dims]);

    const handleMouseMove = (e) => {
        if (!filteredSeries || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mg = { top: 20, right: 20, bottom: 36, left: 72 };
        const mx = e.clientX - rect.left;
        if (mx < mg.left || mx > dims.w - mg.right) { setTooltip(null); return; }
        const pw = dims.w - mg.left - mg.right;
        const dates = filteredSeries.map(d => new Date(d.date).getTime());
        const minX = dates[0], maxX = dates[dates.length - 1];
        const ts = minX + ((mx - mg.left) / pw) * (maxX - minX);
        const idx = dates.reduce((best, t, i) => Math.abs(t - ts) < Math.abs(dates[best] - ts) ? i : best, 0);
        const d = filteredSeries[idx];
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const dd = new Date(d.date);
        const gain = d.value - d.invested;
        const gainPct = d.invested > 0 ? gain / d.invested * 100 : 0;
        setTooltip({ x: mx, date: `${dd.getDate()} ${months[dd.getMonth()]} ${dd.getFullYear()}`, value: d.value, invested: d.invested, gain, gainPct });
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', background: 'var(--bg-glass)', borderRadius: '10px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '16px', padding: '10px 16px 4px', fontSize: '0.78rem', borderBottom: '1px solid rgba(255,255,255,0.05)', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '3px', background: '#FFD700', display: 'inline-block', borderRadius: '2px', boxShadow: '0 0 6px #FFD700' }} /><span style={{ color: 'var(--text-secondary)' }}>Patrimonio</span></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', borderTop: '2px dashed rgba(255,255,255,0.5)', display: 'inline-block' }} /><span style={{ color: 'var(--text-secondary)' }}>Invertido</span></span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {['3M','6M','1Y','2Y','MAX'].map(r => (
                        <button key={r} onClick={() => setZoomRange(r === 'MAX' ? 'ALL' : r)} style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 600, border: (zoomRange === r || (r === 'MAX' && zoomRange === 'ALL')) ? '1px solid var(--accent-glow)' : '1px solid rgba(255,255,255,0.12)', background: (zoomRange === r || (r === 'MAX' && zoomRange === 'ALL')) ? 'var(--accent-glow)' : 'transparent', color: (zoomRange === r || (r === 'MAX' && zoomRange === 'ALL')) ? '#000' : 'var(--text-secondary)', cursor: 'pointer' }}>{r}</button>
                    ))}
                </div>
            </div>
            <canvas ref={canvasRef} style={{ display: 'block', cursor: 'crosshair' }} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} />
            {tooltip && (
                <>
                    <div style={{ position: 'absolute', left: tooltip.x, top: 30, bottom: 36, width: '1px', background: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: tooltip.x > dims.w / 2 ? tooltip.x - 210 : tooltip.x + 14, top: 40, background: 'rgba(15,20,35,0.97)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '10px 14px', pointerEvents: 'none', backdropFilter: 'blur(12px)', minWidth: '190px', zIndex: 10 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>{tooltip.date}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '3px' }}><span style={{ color: '#FFD700' }}>Patrimonio</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>€{tooltip.value.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '3px' }}><span style={{ color: 'var(--text-secondary)' }}>Invertido</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>€{tooltip.invested.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '4px' }}><span style={{ color: tooltip.gain >= 0 ? 'var(--success)' : 'var(--danger)' }}>Ganancia</span><span style={{ fontWeight: 700, color: tooltip.gain >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{tooltip.gain >= 0 ? '+' : ''}€{Math.abs(tooltip.gain).toLocaleString('es-ES', { minimumFractionDigits: 0 })} ({tooltip.gainPct >= 0 ? '+' : ''}{tooltip.gainPct.toFixed(1)}%)</span></div>
                    </div>
                </>
            )}
        </div>
    );
};

// ---------------- Per-Fund Real Evolution Chart ----------------
const PerFundEvolutionChart = ({ evolutionData }) => {
    const [fundData, setFundData] = useState(null);
    const [loading, setLoading] = useState(false);
    const canvasRef = useRef(null);
    const tooltipRef = useRef(null);
    const [zoom, setZoom] = useState('MAX');
    const [selectedFunds, setSelectedFunds] = useState(null);
    const [singleFund, setSingleFund] = useState('');

    // Persist chart geometry for hover hit-testing
    const chartState = useRef(null);

    useEffect(() => {
        if (evolutionData?.funds && Object.keys(evolutionData.funds).length > 0) {
            setFundData(evolutionData);
        } else {
            setLoading(true);
            fetch('/api/portfolio/real-evolution-per-fund')
                .then(r => r.json())
                .then(d => { setFundData(d); setLoading(false); })
                .catch(() => setLoading(false));
        }
    }, [evolutionData]);

    const COLORS = ['#FFD700','#4fc3f7','#66bb6a','#ef5350','#ab47bc','#ff7043','#26c6da','#8d6e63','#78909c','#d4e157','#5c6bc0','#ec407a','#00bcd4','#cddc39','#ff5722'];

    const allFunds = useMemo(() => {
        if (!fundData?.funds) return [];
        return Object.entries(fundData.funds)
            .map(([name, pts]) => ({ name, lastVal: pts.length > 0 ? pts[pts.length - 1].value : 0 }))
            .sort((a, b) => b.lastVal - a.lastVal);
    }, [fundData]);

    const effectiveSelected = useMemo(() => {
        if (singleFund) return new Set([singleFund]);
        if (!selectedFunds) return new Set(allFunds.map(f => f.name));
        return selectedFunds;
    }, [singleFund, selectedFunds, allFunds]);

    const colorMap = useMemo(() => {
        const m = {};
        allFunds.forEach((f, i) => { m[f.name] = COLORS[i % COLORS.length]; });
        return m;
    }, [allFunds]);

    const toggleFund = (name) => {
        if (singleFund) { setSingleFund(''); return; }
        setSelectedFunds(prev => {
            const current = prev || new Set(allFunds.map(f => f.name));
            const next = new Set(current);
            if (next.has(name)) { if (next.size > 1) next.delete(name); } else { next.add(name); }
            return next;
        });
    };

    // Draw canvas
    useEffect(() => {
        if (!fundData?.funds || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const W = rect.width, H = rect.height;
        ctx.clearRect(0, 0, W, H);

        const now = new Date();
        const zoomMonths = { '3M': 3, '6M': 6, '1Y': 12, '2Y': 24, '5Y': 60, 'MAX': 9999 };
        const months = zoomMonths[zoom] || 9999;
        const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());

        const activeFunds = allFunds.filter(f => effectiveSelected.has(f.name));
        if (!activeFunds.length) { chartState.current = null; return; }

        const parsed = {};
        const allDatesSet = new Set();
        for (const { name } of activeFunds) {
            parsed[name] = (fundData.funds[name] || [])
                .map(p => ({ date: new Date(p.date), value: p.value }))
                .filter(p => p.date >= cutoff);
            parsed[name].forEach(p => allDatesSet.add(p.date.getTime()));
        }
        const allDates = [...allDatesSet].sort((a, b) => a - b);
        if (!allDates.length) { chartState.current = null; return; }

        // Parse invested data for single-fund mode
        let parsedInvested = null;
        if (singleFund && fundData.invested_per_fund?.[singleFund]) {
            parsedInvested = fundData.invested_per_fund[singleFund]
                .map(p => ({ date: new Date(p.date), invested: p.invested }))
                .filter(p => p.date >= cutoff);
        }

        // Build stacked values
        const stacked = allDates.map(ts => {
            let cumulative = 0;
            const layers = activeFunds.map(({ name }) => {
                const pt = parsed[name].find(p => p.date.getTime() === ts);
                const val = pt ? pt.value : 0;
                const layer = { bottom: cumulative, top: cumulative + val, name, value: val };
                cumulative += val;
                return layer;
            });
            // Also find invested for single fund
            let invested = null;
            if (parsedInvested) {
                const ip = parsedInvested.find(p => p.date.getTime() === ts);
                invested = ip ? ip.invested : null;
            }
            return { date: ts, layers, total: cumulative, invested };
        });

        // For single fund with invested, maxVal must include invested
        let maxVal = Math.max(...stacked.map(s => s.total), 1);
        if (singleFund && parsedInvested) {
            const maxInv = Math.max(...stacked.map(s => s.invested || 0));
            maxVal = Math.max(maxVal, maxInv);
        }

        const pad = { top: 20, right: 20, bottom: 30, left: 68 };
        const plotW = W - pad.left - pad.right;
        const plotH = H - pad.top - pad.bottom;
        const xScale = i => pad.left + (i / Math.max(allDates.length - 1, 1)) * plotW;
        const yScale = v => pad.top + plotH - (v / maxVal) * plotH;

        // Save chart geometry for hover
        chartState.current = { stacked, allDates, activeFunds, pad, plotW, plotH, W, H, xScale, yScale, maxVal, parsedInvested };

        // Draw stacked areas
        for (let li = 0; li < activeFunds.length; li++) {
            const color = colorMap[activeFunds[li].name] || '#888';
            ctx.beginPath();
            ctx.moveTo(xScale(0), yScale(stacked[0].layers[li].bottom));
            for (let i = 0; i < stacked.length; i++) ctx.lineTo(xScale(i), yScale(stacked[i].layers[li].top));
            for (let i = stacked.length - 1; i >= 0; i--) ctx.lineTo(xScale(i), yScale(stacked[i].layers[li].bottom));
            ctx.closePath();
            ctx.fillStyle = color + '55';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }

        // Draw invested line in single-fund mode
        if (singleFund && parsedInvested) {
            ctx.beginPath();
            ctx.setLineDash([6, 3]);
            let started = false;
            for (let i = 0; i < stacked.length; i++) {
                const inv = stacked[i].invested;
                if (inv != null && inv > 0) {
                    const x = xScale(i), y = yScale(inv);
                    if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
                }
            }
            ctx.strokeStyle = '#ff9800';
            ctx.lineWidth = 1.8;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Y-axis
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px Inter,sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const val = maxVal * i / 4;
            const y = yScale(val);
            ctx.fillText('€' + Math.round(val).toLocaleString('es-ES'), pad.left - 8, y + 3);
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        }

        // X-axis
        ctx.textAlign = 'center';
        const step = Math.max(1, Math.floor(allDates.length / 6));
        for (let i = 0; i < allDates.length; i += step) {
            const d = new Date(allDates[i]);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }), xScale(i), H - 8);
        }
    }, [fundData, zoom, effectiveSelected, colorMap, allFunds, singleFund]);

    // Hover handler
    const handleMouseMove = useCallback((e) => {
        const cs = chartState.current;
        const tooltip = tooltipRef.current;
        if (!cs || !tooltip || !canvasRef.current) { if (tooltip) tooltip.style.display = 'none'; return; }

        const rect = canvasRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (mx < cs.pad.left || mx > cs.W - cs.pad.right || my < cs.pad.top || my > cs.H - cs.pad.bottom) {
            tooltip.style.display = 'none';
            return;
        }

        // Find closest date index
        const ratio = (mx - cs.pad.left) / cs.plotW;
        const idx = Math.min(Math.max(0, Math.round(ratio * (cs.allDates.length - 1))), cs.allDates.length - 1);
        const snap = cs.stacked[idx];
        if (!snap) { tooltip.style.display = 'none'; return; }

        const date = new Date(snap.date);
        const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

        let html = `<div style="font-weight:600;margin-bottom:4px;font-size:0.78rem">${dateStr}</div>`;
        for (let li = snap.layers.length - 1; li >= 0; li--) {
            const l = snap.layers[li];
            const c = colorMap[l.name] || '#888';
            html += `<div style="display:flex;align-items:center;gap:5px;font-size:0.72rem"><span style="width:8px;height:8px;border-radius:2px;background:${c};display:inline-block;flex-shrink:0"></span><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${l.name}</span><span style="font-weight:500">€${Math.round(l.value).toLocaleString('es-ES')}</span></div>`;
        }
        if (singleFund && snap.invested != null) {
            html += `<div style="display:flex;align-items:center;gap:5px;font-size:0.72rem;margin-top:3px;border-top:1px solid rgba(255,255,255,0.1);padding-top:3px"><span style="width:8px;height:2px;background:#ff9800;display:inline-block;flex-shrink:0"></span><span>Invertido</span><span style="font-weight:500">€${Math.round(snap.invested).toLocaleString('es-ES')}</span></div>`;
        }
        html += `<div style="margin-top:3px;border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;font-size:0.72rem;font-weight:600">Total: €${Math.round(snap.total).toLocaleString('es-ES')}</div>`;

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';

        // Position tooltip
        const tw = tooltip.offsetWidth;
        let left = mx + 14;
        if (left + tw > rect.width - 4) left = mx - tw - 14;
        tooltip.style.left = left + 'px';
        tooltip.style.top = Math.max(0, my - 20) + 'px';

        // Draw crosshair on canvas
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        // Redraw needs full repaint — just overlay a thin line via a temp canvas trick
        // Simpler: just position via CSS overlay (we'll skip canvas crosshair for perf)
    }, [colorMap, singleFund]);

    const handleMouseLeave = useCallback(() => {
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    }, []);

    if (loading) return <div className="glass-panel" style={{padding:'1.25rem', marginTop:'1.5rem', textAlign:'center'}}>Cargando evolución por fondo...</div>;
    if (!fundData?.funds || allFunds.length === 0) return null;

    const selStyle = { padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.78rem' };

    return (
        <div className="glass-panel" style={{padding:'1.25rem', marginTop:'1.5rem'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.6rem', flexWrap:'wrap', gap:'8px'}}>
                <h4 style={{margin:0, fontWeight:600, fontSize:'0.95rem'}}>📊 Evolución Real por Fondo</h4>
                <div style={{display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap'}}>
                    <select value={singleFund} onChange={e => { setSingleFund(e.target.value); setSelectedFunds(null); }} style={selStyle}>
                        <option value=''>📊 Vista apilada</option>
                        {allFunds.map(f => (
                            <option key={f.name} value={f.name}>{f.name.length > 35 ? f.name.slice(0,33)+'…' : f.name}</option>
                        ))}
                    </select>
                    <div style={{display:'flex', gap:'3px'}}>
                        {['3M','6M','1Y','2Y','5Y','MAX'].map(p => (
                            <button key={p} onClick={() => setZoom(p)} style={{padding:'3px 7px', fontSize:'0.7rem', borderRadius:'4px', border:'1px solid rgba(255,255,255,0.15)', background: zoom===p ? 'rgba(255,215,0,0.2)' : 'transparent', color: zoom===p ? '#FFD700' : 'var(--text-secondary)', cursor:'pointer'}}>{p}</button>
                        ))}
                    </div>
                </div>
            </div>
            <div style={{position:'relative'}}>
                <canvas ref={canvasRef} style={{width:'100%', height:'230px', display:'block'}} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
                <div ref={tooltipRef} style={{display:'none', position:'absolute', top:0, left:0, background:'rgba(20,20,30,0.94)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', padding:'8px 10px', pointerEvents:'none', zIndex:10, minWidth:'140px', backdropFilter:'blur(8px)', boxShadow:'0 4px 16px rgba(0,0,0,0.4)'}} />
            </div>
            {/* Legend */}
            <div style={{display:'flex', flexWrap:'wrap', gap:'6px 14px', marginTop:'10px'}}>
                {allFunds.map(({ name, lastVal }) => {
                    const color = colorMap[name];
                    const isOn = effectiveSelected.has(name);
                    return (
                        <span key={name} onClick={() => toggleFund(name)} title={`€${Math.round(lastVal).toLocaleString('es-ES')}`}
                            style={{fontSize:'0.72rem', display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', opacity: isOn ? 1 : 0.35, padding:'2px 6px 2px 0', userSelect:'none'}}>
                            <span style={{width:'11px', height:'11px', borderRadius:'2px', flexShrink:0, background: isOn ? color : 'transparent', border: `2px solid ${color}`, display:'inline-block', transition:'background 0.15s'}} />
                            {name}
                        </span>
                    );
                })}
                {singleFund && (
                    <span style={{fontSize:'0.7rem', display:'flex', alignItems:'center', gap:'5px', color:'#ff9800'}}>
                        <span style={{width:'14px', height:'2px', background:'#ff9800', display:'inline-block', borderTop:'1px dashed #ff9800'}} />
                        Dinero Invertido
                    </span>
                )}
                {selectedFunds && !singleFund && (
                    <span onClick={() => setSelectedFunds(null)} style={{fontSize:'0.7rem', color:'var(--text-secondary)', cursor:'pointer', padding:'2px 6px', borderRadius:'4px', border:'1px solid rgba(255,255,255,0.1)'}}>Todos</span>
                )}
            </div>
        </div>
    );
};

// ---------------- Orders Summary Chart ----------------
const OrdersSummaryChart = () => {
    const [ordersData, setOrdersData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('monthly');
    const canvasRef = useRef(null);
    const tooltipRef = useRef(null);
    const chartState = useRef(null);

    useEffect(() => {
        fetch('/api/portfolio/orders-summary')
            .then(r => r.json())
            .then(d => { setOrdersData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!ordersData || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const W = rect.width, H = rect.height;
        ctx.clearRect(0, 0, W, H);

        const entries = viewMode === 'monthly'
            ? Object.entries(ordersData.monthly || {}).sort((a, b) => a[0].localeCompare(b[0]))
            : Object.entries(ordersData.yearly || {}).sort((a, b) => Number(a[0]) - Number(b[0]));

        if (entries.length === 0) { chartState.current = null; return; }

        const values = entries.map(e => e[1]);
        const maxVal = Math.max(...values, 1);
        const pad = { top: 20, right: 20, bottom: 40, left: 60 };
        const plotW = W - pad.left - pad.right;
        const plotH = H - pad.top - pad.bottom;
        const barW = Math.min(40, (plotW / entries.length) * 0.7);
        const gap = (plotW - barW * entries.length) / (entries.length + 1);

        // Save bar rects for hover
        const bars = [];

        entries.forEach(([label, val], i) => {
            const x = pad.left + gap + i * (barW + gap);
            const barH = (val / maxVal) * plotH;
            const y = pad.top + plotH - barH;
            bars.push({ x, y, w: barW, h: barH, label, val });

            const grad = ctx.createLinearGradient(x, y, x, y + barH);
            grad.addColorStop(0, '#4fc3f7');
            grad.addColorStop(1, '#1976d2');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'center';
            const displayLabel = viewMode === 'monthly' ? label.slice(2) : label;
            ctx.fillText(displayLabel, x + barW / 2, H - 8);
        });

        // Y-axis
        ctx.textAlign = 'right';
        ctx.font = '10px Inter, sans-serif';
        for (let i = 0; i <= 4; i++) {
            const val = maxVal * i / 4;
            const y = pad.top + plotH - (val / maxVal) * plotH;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('€' + Math.round(val).toLocaleString('es-ES'), pad.left - 8, y + 3);
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.moveTo(pad.left, y);
            ctx.lineTo(W - pad.right, y);
            ctx.stroke();
        }

        chartState.current = { bars, W, H };
    }, [ordersData, viewMode]);

    const handleMouseMove = useCallback((e) => {
        const cs = chartState.current;
        const tooltip = tooltipRef.current;
        if (!cs || !tooltip || !canvasRef.current) { if (tooltip) tooltip.style.display = 'none'; return; }

        const rect = canvasRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Find hovered bar
        const bar = cs.bars.find(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
        if (!bar) { tooltip.style.display = 'none'; return; }

        const period = viewMode === 'monthly' ? bar.label : `Año ${bar.label}`;
        tooltip.innerHTML = `<div style="font-weight:600;font-size:0.78rem;margin-bottom:2px">${period}</div><div style="font-size:0.75rem">Invertido: <span style="font-weight:600;color:#4fc3f7">€${Math.round(bar.val).toLocaleString('es-ES')}</span></div>`;
        tooltip.style.display = 'block';

        let left = mx + 14;
        const tw = tooltip.offsetWidth;
        if (left + tw > rect.width - 4) left = mx - tw - 14;
        tooltip.style.left = left + 'px';
        tooltip.style.top = Math.max(0, my - 30) + 'px';
    }, [viewMode]);

    const handleMouseLeave = useCallback(() => {
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    }, []);

    if (loading) return <div className="glass-panel" style={{padding:'1.25rem', marginTop:'1.5rem', textAlign:'center'}}>Cargando resumen de órdenes...</div>;
    if (!ordersData) return null;

    const total = Object.values(ordersData.yearly || {}).reduce((s, v) => s + v, 0);

    return (
        <div className="glass-panel" style={{padding:'1.25rem', marginTop:'1.5rem'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem'}}>
                <h4 style={{margin:0, fontWeight:600, fontSize:'0.95rem'}}>💰 Resumen de Inversiones <span style={{fontSize:'0.75rem', fontWeight:400, color:'var(--text-secondary)'}}>Total: €{Math.round(total).toLocaleString('es-ES')}</span></h4>
                <div style={{display:'flex', gap:'4px'}}>
                    {['monthly', 'yearly'].map(m => (
                        <button key={m} onClick={() => setViewMode(m)} style={{padding:'3px 8px', fontSize:'0.7rem', borderRadius:'4px', border:'1px solid rgba(255,255,255,0.15)', background: viewMode===m ? 'rgba(79,195,247,0.2)' : 'transparent', color: viewMode===m ? '#4fc3f7' : 'var(--text-secondary)', cursor:'pointer', textTransform:'capitalize'}}>{m === 'monthly' ? 'Mensual' : 'Anual'}</button>
                    ))}
                </div>
            </div>
            <div style={{position:'relative'}}>
                <canvas ref={canvasRef} style={{width:'100%', height:'180px', display:'block'}} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
                <div ref={tooltipRef} style={{display:'none', position:'absolute', top:0, left:0, background:'rgba(20,20,30,0.94)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', padding:'8px 10px', pointerEvents:'none', zIndex:10, minWidth:'120px', backdropFilter:'blur(8px)', boxShadow:'0 4px 16px rgba(0,0,0,0.4)'}} />
            </div>
        </div>
    );
};

// ---------------- TAB 1: Config & General ----------------
// ── Month Comparison Widget ────────────────────────────────────────────────
const MonthComparisonWidget = ({ realEvolution }) => {
    const monthly = realEvolution?.monthly || [];
    const monthlyPerFund = realEvolution?.monthly_per_fund || {};
    const [monthA, setMonthA] = useState('');
    const [monthB, setMonthB] = useState('');
    const [showPerFund, setShowPerFund] = useState(false);

    useEffect(() => {
        if (monthly.length >= 2 && !monthA) {
            setMonthA(monthly[monthly.length - 1].date || '');
            setMonthB(monthly[monthly.length - 2].date || '');
        }
    }, [monthly.length]);

    if (!monthly.length) return null;

    const getM = key => monthly.find(m => m.date === key) || null;
    const mA = getM(monthA);
    const mB = getM(monthB);

    const euros = v => v != null ? `€${Number(v).toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0})}` : '—';
    const fmtPct = v => v != null ? `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%` : '—';
    const col = v => v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text-primary)';

    const rows = [
        { label: '💰 Patrimonio', vA: mA?.value, vB: mB?.value },
        { label: '📥 Capital Invertido', vA: mA?.invested, vB: mB?.invested },
        { label: '📈 Ganancia (€)', vA: mA?.gain, vB: mB?.gain },
        { label: '📊 Ganancia (%)', vA: mA?.gain_pct, vB: mB?.gain_pct, isPct: true },
    ];

    // Per-fund data for selected months
    const fundNames = Object.keys(monthlyPerFund).sort();
    const getFundM = (fundName, dateKey) => {
        const arr = monthlyPerFund[fundName] || [];
        return arr.find(m => m.date === dateKey) || null;
    };

    const selStyle = { padding:'5px 8px', borderRadius:'6px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.82rem', marginLeft:'6px' };
    const thStyle = {textAlign:'left', padding:'7px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'};
    const thRightStyle = {...thStyle, textAlign:'right'};

    const renderComparisonTable = (tableRows, title) => (
        <div style={{overflowX:'auto', marginBottom: title ? '0.8rem' : 0}}>
            {title && <h5 style={{margin:'0.8rem 0 0.4rem', fontWeight:600, fontSize:'0.85rem', color:'var(--text-secondary)'}}>{title}</h5>}
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.83rem'}}>
                <thead>
                    <tr style={{borderBottom:'2px solid rgba(255,255,255,0.1)'}}>
                        <th style={thStyle}>Concepto</th>
                        {mA && <th style={{...thRightStyle, color:'#4AA2AF', fontWeight:700}}>{mA.label}</th>}
                        {mB && <th style={{...thRightStyle, color:'#a78bfa', fontWeight:700}}>{mB.label}</th>}
                        {mA && mB && <th style={{...thRightStyle, fontWeight:600}}>Δ (A−B)</th>}
                        {mA && mB && <th style={{...thRightStyle, fontWeight:600}}>%Δ</th>}
                    </tr>
                </thead>
                <tbody>
                    {tableRows.map(row => {
                        const vA = row.vA, vB = row.vB;
                        const delta = vA != null && vB != null ? vA - vB : null;
                        const pctDelta = delta != null && vB != null && Math.abs(vB) > 0.01 ? delta / Math.abs(vB) * 100 : null;
                        return (
                            <tr key={row.label} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                <td style={{padding:'7px 10px', fontWeight:600}}>{row.label}</td>
                                {mA && <td style={{padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', color: vA != null && row.isPct ? col(vA) : undefined}}>{row.isPct ? fmtPct(vA) : euros(vA)}</td>}
                                {mB && <td style={{padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', color: vB != null && row.isPct ? col(vB) : undefined}}>{row.isPct ? fmtPct(vB) : euros(vB)}</td>}
                                {mA && mB && <td style={{padding:'7px 10px', textAlign:'right', fontWeight:700, color: delta!=null ? col(delta) : 'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>{delta != null ? `${delta>=0?'+':''}${row.isPct ? fmtPct(delta) : euros(delta)}` : '—'}</td>}
                                {mA && mB && <td style={{padding:'7px 10px', textAlign:'right', fontWeight:600, color: pctDelta!=null ? col(pctDelta) : 'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>{pctDelta != null ? fmtPct(pctDelta) : '—'}</td>}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="glass-panel" style={{padding:'1.25rem', marginTop:'1.5rem'}}>
            <h4 style={{margin:'0 0 0.9rem', fontWeight:600, fontSize:'0.95rem'}}>📅 Comparativa entre Meses</h4>
            <div style={{display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'1rem', alignItems:'center'}}>
                <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Mes A:
                    <select value={monthA} onChange={e=>setMonthA(e.target.value)} style={selStyle}>
                        <option value=''>— elegir —</option>
                        {[...monthly].reverse().map(m => <option key={m.date} value={m.date}>{m.label}</option>)}
                    </select>
                </label>
                <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Mes B:
                    <select value={monthB} onChange={e=>setMonthB(e.target.value)} style={selStyle}>
                        <option value=''>— elegir —</option>
                        {[...monthly].reverse().map(m => <option key={m.date} value={m.date}>{m.label}</option>)}
                    </select>
                </label>
                {fundNames.length > 0 && (
                    <button onClick={() => setShowPerFund(!showPerFund)} style={{
                        padding:'5px 12px', borderRadius:'6px', border:'1px solid var(--border-glass)',
                        background: showPerFund ? 'var(--accent-primary)' : 'var(--bg-glass)',
                        color:'white', fontSize:'0.78rem', cursor:'pointer', marginLeft:'auto'
                    }}>
                        {showPerFund ? '📊 Ocultar fondos' : '📊 Ver por fondo'}
                    </button>
                )}
            </div>
            {(mA || mB) && renderComparisonTable(rows, '📊 Total Cartera')}
            {showPerFund && (mA || mB) && fundNames.length > 0 && (
                <div style={{marginTop:'1rem'}}>
                    <h5 style={{margin:'0 0 0.7rem', fontWeight:600, fontSize:'0.88rem'}}>📋 Desglose por Fondo</h5>
                    <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.8rem'}}>
                            <thead>
                                <tr style={{borderBottom:'2px solid rgba(255,255,255,0.1)'}}>
                                    <th style={thStyle}>Fondo</th>
                                    {mA && <th style={{...thRightStyle, color:'#4AA2AF', fontWeight:600}}>Valor A</th>}
                                    {mB && <th style={{...thRightStyle, color:'#a78bfa', fontWeight:600}}>Valor B</th>}
                                    {mA && mB && <th style={{...thRightStyle, fontWeight:600}}>Δ (€)</th>}
                                    {mA && <th style={{...thRightStyle, color:'#4AA2AF', fontWeight:600}}>Inv A</th>}
                                    {mB && <th style={{...thRightStyle, color:'#a78bfa', fontWeight:600}}>Inv B</th>}
                                    {mA && <th style={{...thRightStyle, color:'#4AA2AF', fontWeight:600}}>Rent A</th>}
                                    {mB && <th style={{...thRightStyle, color:'#a78bfa', fontWeight:600}}>Rent B</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {fundNames.map(name => {
                                    const fA = getFundM(name, monthA);
                                    const fB = getFundM(name, monthB);
                                    const vA = fA?.value || 0, vB = fB?.value || 0;
                                    const iA = fA?.invested || 0, iB = fB?.invested || 0;
                                    const gA = fA?.gain_pct, gB = fB?.gain_pct;
                                    const deltaV = vA - vB;
                                    // Skip funds with no value in either month
                                    if (vA === 0 && vB === 0) return null;
                                    return (
                                        <tr key={name} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                            <td style={{padding:'6px 10px', fontWeight:500, maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={name}>{name.length > 28 ? name.slice(0,26)+'…' : name}</td>
                                            {mA && <td style={{padding:'6px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{euros(vA)}</td>}
                                            {mB && <td style={{padding:'6px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{euros(vB)}</td>}
                                            {mA && mB && <td style={{padding:'6px 10px', textAlign:'right', fontWeight:700, color: col(deltaV), fontVariantNumeric:'tabular-nums'}}>{`${deltaV>=0?'+':''}${euros(deltaV)}`}</td>}
                                            {mA && <td style={{padding:'6px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)'}}>{euros(iA)}</td>}
                                            {mB && <td style={{padding:'6px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)'}}>{euros(iB)}</td>}
                                            {mA && <td style={{padding:'6px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', color: gA != null ? col(gA) : undefined}}>{fmtPct(gA)}</td>}
                                            {mB && <td style={{padding:'6px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', color: gB != null ? col(gB) : undefined}}>{fmtPct(gB)}</td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

const GeneralTab = ({ data, chartData, reloadData }) => {
    const [newFund, setNewFund] = useState({ Fondo: '', ISIN: '', TIPO: 'INDEX', Porcentaje: 0 });
    const [isSaving, setIsSaving] = useState(false);
    const [lastDate, setLastDate] = useState(null);
    const [showMonthly, setShowMonthly] = useState(false);

    useEffect(() => {
        fetch('/api/portfolio/last_update')
            .then(r => r.json())
            .then(d => setLastDate(d.last_date || null))
            .catch(() => {});
    }, []);

    // Real evolution data comes directly from the loaded data prop
    const realEvolution = data.real_evolution || null;
    const realEvoLoading = false;

    // KPI cards computed from fund data
    const totalValor    = data.funds.reduce((s, f) => s + (f.Valor_Actual || 0), 0);
    const totalInv      = data.funds.reduce((s, f) => s + (f.Capital_Invertido || 0), 0);
    const totalGanAbs   = totalValor - totalInv;
    const totalGanPct   = totalInv > 0 ? totalGanAbs / totalInv * 100 : 0;
    const gainColor     = totalGanAbs >= 0 ? 'var(--success)' : 'var(--danger)';

    const handleAdd = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        await fetch('/api/portfolio/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newFund)
        });
        setIsSaving(false);
        setNewFund({ Fondo: '', ISIN: '', TIPO: 'INDEX', Porcentaje: 0 });
        reloadData();
    };

    const handleDelete = async (id) => {
        if(!confirm(`¿Seguro que quieres eliminar la entrada: ${id}?`)) return;
        await fetch(`/api/portfolio/${id}`, { method: 'DELETE' });
        reloadData();
    };

    return (
        <div className="main-content" style={{gridTemplateColumns:'1fr'}}>

            {/* ── KPI STRIP ── */}
            {(() => {
                const kpis = [
                    { label: 'Patrimonio', value: `€${totalValor.toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0})}`, color: 'var(--accent-glow)' },
                    { label: 'Capital Invertido', value: `€${totalInv.toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0})}`, color: 'var(--text-primary)' },
                    { label: 'Ganancia (€)', value: `${totalGanAbs>=0?'+':''}€${Math.abs(totalGanAbs).toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0})}`, color: gainColor },
                    { label: 'Ganancia (%)', value: `${totalGanPct>=0?'+':''}${totalGanPct.toFixed(2)}%`, color: gainColor },
                ];
                return (
                    <div style={{display:'grid', gridTemplateColumns:`repeat(${kpis.length},1fr)`, gap:'0.75rem', marginBottom:'1.5rem'}}>
                        {kpis.map(kpi => (
                            <div key={kpi.label} className="glass-panel" style={{padding:'0.9rem 1rem'}}>
                                <div style={{fontSize:'0.68rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'4px'}}>{kpi.label}</div>
                                <div style={{fontSize:'1.25rem', fontWeight:700, color:kpi.color, fontVariantNumeric:'tabular-nums'}}>{kpi.value}</div>
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* Asset Allocation + Gestión */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.5rem'}}>
                <div className="glass-panel" style={{padding: '1rem'}}>
                    <h4 style={{margin:'0 0 0.75rem', fontWeight:600, fontSize:'0.9rem'}}>Asset Allocation</h4>
                    <div style={{display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', width: '100%', marginBottom:'0.75rem'}}>
                        {chartData.map((entry, index) => (
                            <div key={entry.name} title={`${entry.name}: ${entry.value.toFixed(1)}%`} style={{
                                width: `${(entry.value / Object.values(data.summary.details).reduce((a,b)=>a+b,0)) * 100}%`,
                                backgroundColor: COLORS[index % COLORS.length]
                            }} />
                        ))}
                    </div>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.6rem'}}>
                        {chartData.map((entry, index) => (
                            <div key={entry.name} style={{display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem'}}>
                                <div style={{width: '10px', height: '10px', borderRadius: '3px', backgroundColor: COLORS[index % COLORS.length]}} />
                                <span style={{color: 'var(--text-secondary)'}}>{entry.name} <strong style={{color: 'var(--text-primary)'}}>{entry.value.toFixed(1)}%</strong></span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="glass-panel" style={{padding: '1rem'}}>
                    <h4 style={{margin:'0 0 0.75rem', fontWeight:600, fontSize:'0.9rem'}}>Gestión</h4>
                    {(() => {
                        const ti = data.summary.total_indexed || 0;
                        const ta = data.summary.total_active || 0;
                        const total = ti + ta || 1;
                        return (
                            <React.Fragment>
                                <div style={{display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', width: '100%', marginBottom:'0.75rem'}}>
                                    <div style={{width:`${(ti/total)*100}%`, background:'#00d4aa', transition:'width 0.3s'}} title={`Indexado: ${ti.toFixed(1)}%`} />
                                    <div style={{width:`${(ta/total)*100}%`, background:'#8b5cf6', transition:'width 0.3s'}} title={`Activo: ${ta.toFixed(1)}%`} />
                                </div>
                                <div style={{display:'flex', gap:'1.5rem', fontSize:'0.8rem'}}>
                                    <div style={{display:'flex', alignItems:'center', gap:'0.4rem'}}>
                                        <div style={{width:'10px', height:'10px', borderRadius:'3px', background:'#00d4aa'}} />
                                        <span style={{color:'var(--text-secondary)'}}>Indexado <strong style={{color:'#00d4aa'}}>{ti.toFixed(1)}%</strong></span>
                                    </div>
                                    <div style={{display:'flex', alignItems:'center', gap:'0.4rem'}}>
                                        <div style={{width:'10px', height:'10px', borderRadius:'3px', background:'#8b5cf6'}} />
                                        <span style={{color:'var(--text-secondary)'}}>Activo <strong style={{color:'#8b5cf6'}}>{ta.toFixed(1)}%</strong></span>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })()}
                </div>
            </div>

            <div className="glass-panel fund-table-container">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '1.5rem'}}>
                    <div>
                        <h3 style={{fontWeight: 600, margin:0}}>Mi Cartera Base</h3>
                        {lastDate && <div style={{fontSize:'0.72rem', color:'var(--text-secondary)', marginTop:'3px'}}>Datos a: <strong>{lastDate}</strong></div>}
                    </div>
                </div>
                <div style={{overflowX: 'auto'}}>
                    <table style={{width: '100%', minWidth: '600px'}}>
                        <thead>
                            <tr>
                                <th>Fondo / Activo</th>
                                <th>Tipo</th>
                                <th style={{textAlign:'right'}}>Peso</th>
                                <th style={{textAlign:'right'}}>Valor Actual (€)</th>
                                <th style={{textAlign:'right'}}>Invertido (€)</th>
                                <th style={{textAlign:'right'}}>Ganancia (€)</th>
                                <th style={{textAlign:'right'}}>Ganancia (%)</th>
                                <th style={{textAlign:'right'}}>NAV</th>
                                <th>Rating</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* ── TOTALES ROW ── */}
                            {(() => {
                                const totalValor = data.funds.reduce((s, f) => s + (f.Valor_Actual || 0), 0);
                                const totalInv = data.funds.reduce((s, f) => s + (f.Capital_Invertido || 0), 0);
                                const totalGanAbs = data.funds.reduce((s, f) => s + (f.Ganancia_Abs || 0), 0);
                                const totalGanPct = totalInv > 0 ? (totalGanAbs / totalInv) * 100 : 0;
                                const posColor = totalGanAbs >= 0 ? 'var(--success)' : 'var(--danger)';
                                return (
                                    <tr style={{background:'rgba(74,162,175,0.08)', borderBottom:'2px solid rgba(74,162,175,0.3)', fontWeight:700}}>
                                        <td style={{fontWeight:700, color:'var(--accent-glow)'}}>📊 TOTAL CARTERA</td>
                                        <td></td>
                                        <td style={{textAlign:'right', color:'var(--accent-glow)'}}>100%</td>
                                        <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>€{totalValor.toLocaleString('es-ES', {minimumFractionDigits:2})}</td>
                                        <td style={{textAlign:'right', color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>€{totalInv.toLocaleString('es-ES', {minimumFractionDigits:2})}</td>
                                        <td style={{textAlign:'right', color:posColor, fontVariantNumeric:'tabular-nums'}}>{totalGanAbs >= 0 ? '+' : ''}€{Math.abs(totalGanAbs).toLocaleString('es-ES', {minimumFractionDigits:2})}</td>
                                        <td style={{textAlign:'right', color:posColor, fontVariantNumeric:'tabular-nums'}}>{totalGanPct >= 0 ? '+' : ''}{totalGanPct.toFixed(1)}%</td>
                                        <td></td>
                                        <td></td>
                                        <td></td>
                                    </tr>
                                );
                            })()}
                            {[...data.funds].sort((a, b) => b.Porcentaje - a.Porcentaje).map((fund, idx) => {
                                const ganPct = fund.Ganancia_Pct;
                                const ganAbs = fund.Ganancia_Abs;
                                const posColor = ganPct > 0 ? 'var(--success)' : ganPct < 0 ? 'var(--danger)' : 'var(--text-primary)';
                                return (
                                    <tr key={idx}>
                                        <td style={{fontWeight: 500}}>
                                            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                                                <span style={{display:'inline-block', width:'8px', height:'8px', borderRadius:'2px', background: fund.IsIndex ? '#00d4aa' : '#8b5cf6', flexShrink:0}} title={fund.IsIndex ? 'Indexado' : 'Activo'} />
                                                <span>{fund.Fondo}</span>
                                            </div>
                                            <div style={{display:'flex', alignItems:'center', gap:'8px', marginLeft:'14px'}}>
                                                <span style={{color: 'var(--text-secondary)', fontSize: '0.73rem'}}>{fund.ISIN || ''}</span>
                                                {fund.ISIN && (
                                                    <a href={fund.finect_url || `https://www.finect.com/fondos-inversion/${fund.ISIN}`} target="_blank" rel="noreferrer"
                                                       style={{fontSize:'0.68rem', color:'var(--accent-glow)', textDecoration:'none', opacity:0.7}}
                                                       title="Ver en Finect">↗</a>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{padding: '3px 7px', background: 'var(--border-glass)', borderRadius: '6px', fontSize: '0.75rem'}}>
                                                {fund['Categoría'] || fund.TIPO}
                                            </span>
                                        </td>
                                        <td style={{textAlign:'right', fontWeight:600, color:'var(--accent-glow)'}}>{fund.Porcentaje.toFixed(1)}%</td>
                                        <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{fund.Valor_Actual != null ? `€${fund.Valor_Actual.toLocaleString('es-ES', {minimumFractionDigits:2})}` : '---'}</td>
                                        <td style={{textAlign:'right', color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>{fund.Capital_Invertido != null ? `€${fund.Capital_Invertido.toLocaleString('es-ES', {minimumFractionDigits:2})}` : '---'}</td>
                                        <td style={{textAlign:'right', fontWeight:600, color:posColor, fontVariantNumeric:'tabular-nums'}}>{ganAbs != null ? `${ganAbs >= 0 ? '+' : ''}€${Math.abs(ganAbs).toLocaleString('es-ES', {minimumFractionDigits:2})}` : '---'}</td>
                                        <td style={{textAlign:'right', fontWeight:600, color:posColor, fontVariantNumeric:'tabular-nums'}}>{ganPct != null ? `${ganPct >= 0 ? '+' : ''}${ganPct.toFixed(1)}%` : '---'}</td>
                                        <td style={{textAlign:'right', color: 'var(--text-primary)', fontWeight: 'bold', fontVariantNumeric:'tabular-nums'}}>{fund['NAV (Precio)'] || '---'}</td>
                                        <td style={{color: 'var(--accent-secondary)'}}>{fund['Estrellas MS'] || '---'}</td>
                                        <td>
                                            <button onClick={() => handleDelete(fund.ISIN || fund.Fondo)} style={{background:'transparent', color:'var(--danger)', border:'1px solid var(--danger)', padding:'3px 7px', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem'}}>✕</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                
                <form onSubmit={handleAdd} style={{marginTop: '2rem', display: 'flex', gap: '10px', flexWrap:'wrap', alignItems:'center', padding:'1rem', background:'rgba(0,0,0,0.2)', borderRadius:'8px', border:'1px dashed var(--border-glass)'}}>
                    <input required placeholder="Nombre (ej. SP500)" value={newFund.Fondo} onChange={e=>setNewFund({...newFund, Fondo: e.target.value})} style={{padding:'8px', borderRadius:'4px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', flex:1}} />
                    <input placeholder="ISIN (Opcional)" value={newFund.ISIN} onChange={e=>setNewFund({...newFund, ISIN: e.target.value})} style={{padding:'8px', borderRadius:'4px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', flex:1}} />
                    <select value={newFund.TIPO} onChange={e=>setNewFund({...newFund, TIPO: e.target.value})} style={{padding:'8px', borderRadius:'4px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white'}}>
                        <option value="INDEX">INDEX</option>
                        <option value="VALUE">VALUE</option>
                        <option value="SPECIALIZED">SPECIALIZED</option>
                        <option value="RF">RENTA FIJA</option>
                        <option value="ORO">ORO</option>
                        <option value="CRYPTO">CRYPTO</option>
                        <option value="CASH">LIQUIDEZ</option>
                    </select>
                    <input required max="100" min="0" step="0.01" type="number" placeholder="% Peso" value={newFund.Porcentaje} onChange={e=>setNewFund({...newFund, Porcentaje: Number(e.target.value)})} style={{padding:'8px', borderRadius:'4px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', width:'80px'}} />
                    <button disabled={isSaving} type="submit" style={{padding:'8px 15px', background:'var(--accent-glow)', color:'black', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>{isSaving ? '...' : '+ Añadir'}</button>
                </form>
            </div>

            {/* ── REAL PORTFOLIO EVOLUTION ── */}
            <div className="glass-panel" style={{padding:'1.25rem', marginTop:'1.5rem', marginBottom:'1.5rem'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.9rem'}}>
                    <div>
                        <h4 style={{margin:0, fontWeight:600, fontSize:'0.95rem'}}>📈 Evolución Real del Patrimonio</h4>
                        <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'2px'}}>Basada en órdenes reales — NO en pesos objetivo</div>
                    </div>
                    <div style={{display:'flex', gap:'6px'}}>
                        <button onClick={()=>setShowMonthly(false)} style={{padding:'5px 14px', borderRadius:'16px', fontSize:'0.75rem', fontWeight:600, border: !showMonthly ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)', background: !showMonthly ? 'var(--accent-glow)' : 'transparent', color: !showMonthly ? '#000' : 'var(--text-primary)', cursor:'pointer'}}>📉 Gráfico</button>
                        <button onClick={()=>setShowMonthly(true)} style={{padding:'5px 14px', borderRadius:'16px', fontSize:'0.75rem', fontWeight:600, border: showMonthly ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)', background: showMonthly ? 'var(--accent-glow)' : 'transparent', color: showMonthly ? '#000' : 'var(--text-primary)', cursor:'pointer'}}>📅 Mensuales</button>
                    </div>
                </div>
                {realEvoLoading ? (
                    <div style={{color:'var(--text-secondary)', fontSize:'0.85rem', padding:'1.5rem 0', textAlign:'center'}}>⏳ Calculando evolución real...</div>
                ) : !realEvolution || realEvolution.series?.length === 0 ? (
                    <div style={{color:'var(--text-secondary)', fontSize:'0.85rem', padding:'1rem', textAlign:'center'}}>Sin datos de evolución. Pulsa "Recalcular Cotizaciones".</div>
                ) : !showMonthly ? (
                    <PortfolioValueChart series={realEvolution.series} />
                ) : (
                    <div style={{overflowX:'auto', maxHeight:'400px', overflowY:'auto'}}>
                        <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.83rem'}}>
                            <thead style={{position:'sticky', top:0, background:'var(--bg-glass)'}}>
                                <tr style={{borderBottom:'2px solid rgba(255,255,255,0.1)'}}>
                                    <th style={{textAlign:'left', padding:'8px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'}}>Mes</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'}}>Patrimonio</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'}}>Invertido</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'}}>Ganancia (€)</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'}}>Ganancia (%)</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'}}>MoM (%)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...(realEvolution.monthly || [])].reverse().map((m, i) => {
                                    const gainColor = m.gain >= 0 ? 'var(--success)' : 'var(--danger)';
                                    const momColor = m.mom == null ? 'var(--text-secondary)' : m.mom >= 0 ? 'var(--success)' : 'var(--danger)';
                                    return (
                                        <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                            <td style={{padding:'7px 10px', fontWeight:600}}>{m.label}</td>
                                            <td style={{padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:600}}>€{m.value.toLocaleString('es-ES',{minimumFractionDigits:0})}</td>
                                            <td style={{padding:'7px 10px', textAlign:'right', color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>€{m.invested.toLocaleString('es-ES',{minimumFractionDigits:0})}</td>
                                            <td style={{padding:'7px 10px', textAlign:'right', fontWeight:700, color:gainColor, fontVariantNumeric:'tabular-nums'}}>{m.gain>=0?'+':''}€{Math.abs(m.gain).toLocaleString('es-ES',{minimumFractionDigits:0})}</td>
                                            <td style={{padding:'7px 10px', textAlign:'right', fontWeight:700, color:gainColor, fontVariantNumeric:'tabular-nums'}}>{m.gain_pct>=0?'+':''}{m.gain_pct.toFixed(1)}%</td>
                                            <td style={{padding:'7px 10px', textAlign:'right', color:momColor, fontVariantNumeric:'tabular-nums'}}>{m.mom!=null ? `${m.mom>=0?'+':''}${m.mom.toFixed(1)}%` : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── PER-FUND REAL EVOLUTION (stacked area) ── */}
            <PerFundEvolutionChart evolutionData={data.real_evolution} />

            {/* ── ORDERS SUMMARY ── */}
            <OrdersSummaryChart />

            {/* ── MONTH COMPARISON ── */}
            <MonthComparisonWidget realEvolution={data.real_evolution} />

            {data.recommendation.cash_warn && <div style={{marginTop:'1rem'}}><AdviceCard advice={data.recommendation.cash_warn} type="warning" /></div>}
        </div>
    );
};

// ---------------- TAB 2: Detalle (Geografías, Sectores + MSCI World + Fund Detail) ----------------
const DetailsTab = ({ onRefreshDetails, refreshingDetails, refreshStep, refreshElapsed, refreshDetailsKey }) => {
    const [details, setDetails] = useState(null);
    const [benchmark, setBenchmark] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedFundKey, setSelectedFundKey] = useState(null);
    const [comparisonFundKey, setComparisonFundKey] = useState(null);
    const [benchmarkFundKey, setBenchmarkFundKey] = useState(null); // null = MSCI World; 'key' = portfolio fund
    const [fundDetail, setFundDetail] = useState(null);
    const [fundDetailLoading, setFundDetailLoading] = useState(false);
    const [portfolioHoldings, setPortfolioHoldings] = useState(null);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch('/api/portfolio/details').then(r => r.json()),
            fetch('/api/portfolio/benchmark/msci-world').then(r => r.json()).catch(() => null),
            fetch('/api/portfolio/portfolio-holdings').then(r => r.json()).catch(() => null),
        ]).then(([d, b, ph]) => {
            setDetails(d);
            setBenchmark(b);
            setPortfolioHoldings(ph);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [refreshDetailsKey]);

    // Load individual fund detail when selected
    const loadFundDetail = (fundKey, forceRefresh = false) => {
        if (!fundKey || !details) return;
        const fund = details[fundKey];
        if (!fund || !fund.isin) return;
        setFundDetailLoading(true);
        const url = `/api/portfolio/fund/${fund.isin}/details${forceRefresh ? '?refresh=true' : ''}`;
        fetch(url)
            .then(r => r.json())
            .then(d => { setFundDetail(d); setFundDetailLoading(false); })
            .catch(() => setFundDetailLoading(false));
    };

    useEffect(() => {
        setFundDetail(null);
        loadFundDetail(selectedFundKey);
    }, [selectedFundKey]);

    if (loading) return <div style={{padding:'3rem', textAlign:'center'}}><div className="spinner" style={{margin:'0 auto 1rem'}}></div><span style={{color:'var(--text-secondary)'}}>Cargando perfiles estructurales...</span></div>;

    const hasData = details && Object.keys(details).length > 0 && Object.values(details).some(f =>
        (f.sector && Object.keys(f.sector).length > 0) || (f.region && Object.keys(f.region).length > 0)
    );

    if (!hasData && !refreshingDetails) return (
        <div style={{padding:'2rem', textAlign:'center'}}>
            <div style={{color:'var(--text-secondary)', marginBottom:'1rem'}}>No hay datos sectoriales/geográficos disponibles.</div>
            <button onClick={onRefreshDetails} style={{padding:'10px 20px', background:'var(--accent-secondary)', color:'white', border:'none', borderRadius:'8px', fontWeight:600, cursor:'pointer'}}>
                🔄 Recalcular Detalles
            </button>
        </div>
    );

    // Aggregate function
    const aggregate = (keyExtractor) => {
        const aggr = {};
        Object.values(details || {}).forEach(fund => {
            const dataBlock = fund[keyExtractor] || {};
            let items = Array.isArray(dataBlock)
                ? dataBlock
                : Object.keys(dataBlock).map(k => ({name: k, value: dataBlock[k]}));
            items.forEach(idx => {
                const name = idx.name || idx.Name || idx.Id || 'Unknown';
                const val = parseFloat(idx.value || idx.Value || 0);
                if (!aggr[name]) aggr[name] = 0;
                aggr[name] += val * (fund.percentage / 100);
            });
        });
        const total = Object.values(aggr).reduce((a,b)=>a+b,0) || 1;
        return Object.keys(aggr)
            .map(k => ({name: k, value: (aggr[k]/total)*100}))
            .filter(x => x.value > 0.5)
            .sort((a,b) => b.value - a.value);
    };

    const sectors = aggregate('sector');
    const regions = aggregate('region');

    // Comparison bar renderer with correct proportional scaling
    const renderComparisonBars = (dataList, benchmarkData, benchmarkLabel) => {
        const allKeys = new Set([
            ...dataList.map(d => d.name),
            ...(benchmarkData ? Object.keys(benchmarkData) : []),
        ]);
        const merged = Array.from(allKeys).map(name => {
            const mine = dataList.find(d => d.name === name);
            const msci = benchmarkData ? (benchmarkData[name] || 0) : 0;
            return { name, myValue: mine ? mine.value : 0, msciValue: msci };
        }).filter(x => x.myValue > 0.5 || x.msciValue > 0.5)
          .sort((a, b) => b.myValue - a.myValue);

        // Scale bars relative to the largest value in this list (avoids capping)
        const maxVal = Math.max(...merged.map(x => Math.max(x.myValue, x.msciValue)), 1);
        const bmLabel = benchmarkLabel || (benchmarkFundKey ? benchmarkFundKey.substring(0, 18) : 'Benchmark');

        return (
            <div style={{display:'flex', flexDirection:'column', gap:'14px'}}>
                {merged.map((item, idx) => {
                    const diff = item.myValue - item.msciValue;
                    const hasBenchmark = benchmarkData && item.msciValue > 0;
                    return (
                        <div key={item.name} style={{fontSize:'0.85rem'}}>
                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'4px', alignItems:'center'}}>
                                <span>{item.name}</span>
                                <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                                    <strong style={{color:'var(--accent-glow)'}}>{item.myValue.toFixed(1)}%</strong>
                                    {hasBenchmark && (
                                        <React.Fragment>
                                            <span style={{color:'var(--text-secondary)', fontSize:'0.75rem'}}>{bmLabel}: {item.msciValue.toFixed(1)}%</span>
                                            <span style={{fontSize:'0.72rem', fontWeight:700, color: diff > 1 ? 'var(--success)' : diff < -1 ? 'var(--danger)' : 'var(--text-secondary)'}}>
                                                {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                                            </span>
                                        </React.Fragment>
                                    )}
                                </div>
                            </div>
                            <div style={{position:'relative', width:'100%', height: hasBenchmark ? '14px' : '8px', background:'var(--border-glass)', borderRadius:'4px', overflow:'hidden'}}>
                                <div style={{height: hasBenchmark ? '7px' : '8px', width:`${(item.myValue / maxVal) * 100}%`, background: 'var(--accent-glow)', borderRadius:'4px 4px 0 0', transition:'width 0.3s'}} />
                                {hasBenchmark && (
                                    <div style={{height:'7px', width:`${(item.msciValue / maxVal) * 100}%`, background:'rgba(255,215,0,0.5)', borderRadius:'0 0 4px 4px', transition:'width 0.3s'}} />
                                )}
                            </div>
                        </div>
                    );
                })}
                {merged.length === 0 && <span style={{color:'var(--text-secondary)'}}>No se detectó información.</span>}
            </div>
        );
    };

    const fmtPct = (v) => v != null ? `${v.toFixed(2)}%` : '—';
    const signColor = (v) => v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text-primary)';
    const riskColor = (v) => v < 10 ? 'var(--success)' : v < 20 ? 'var(--warning)' : 'var(--danger)';

    const fundKeys = details ? Object.keys(details) : [];
    const selectedFund = selectedFundKey ? details[selectedFundKey] : null;

    // Build progress steps message
    const progressSteps = [
        '🔗 Iniciando conexión con proveedores de datos...',
        '📡 Descargando datos sectoriales de Finect...',
        '🌍 Descargando exposición geográfica...',
        '📊 Procesando métricas de cada fondo...',
        '🔄 Normalizando sectores y regiones...',
        '💾 Guardando resultados en caché...',
    ];

    return (
        <div>
            {/* Toolbar: refresh button + fund selector */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'10px'}}>
                {/* Fund selector */}
                <div style={{display:'flex', alignItems:'center', gap:'10px', flex:1, flexWrap:'wrap'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'10px', flex:'1 1 300px'}}>
                        <label style={{fontSize:'0.8rem', color:'var(--text-secondary)', whiteSpace:'nowrap'}}>Ver fondo:</label>
                        <select
                            value={selectedFundKey || ''}
                            onChange={e => { setSelectedFundKey(e.target.value || null); setFundDetail(null); setComparisonFundKey(null); }}
                            style={{padding:'6px 10px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.85rem', flex:1, maxWidth:'400px', cursor:'pointer'}}
                        >
                            <option value="">— Visión global de cartera —</option>
                            {fundKeys.map(k => (
                                <option key={k} value={k}>{k}{details[k]?.isin ? ` (${details[k].isin})` : ''}</option>
                            ))}
                        </select>
                        {selectedFund?.isin && (
                            <a href={selectedFund.finect_url || `https://www.finect.com/fondos-inversion/${selectedFund.isin}`} target="_blank" rel="noreferrer"
                               style={{padding:'6px 12px', background:'rgba(74,162,175,0.15)', borderRadius:'8px', border:'1px solid rgba(74,162,175,0.3)', color:'var(--accent-glow)', fontSize:'0.8rem', textDecoration:'none', whiteSpace:'nowrap'}}>
                                🔗 Ver en Finect
                            </a>
                        )}
                    </div>
                    {selectedFundKey && (
                        <div style={{display:'flex', alignItems:'center', gap:'8px', flex:'0 1 300px'}}>
                            <label style={{fontSize:'0.8rem', color:'var(--text-secondary)', whiteSpace:'nowrap'}}>Comparar con:</label>
                            <select
                                value={comparisonFundKey || ''}
                                onChange={e => setComparisonFundKey(e.target.value || null)}
                                style={{padding:'6px 10px', borderRadius:'8px', border:'1px solid rgba(167,139,250,0.4)', background:'var(--bg-glass)', color:'white', fontSize:'0.85rem', flex:1, cursor:'pointer'}}
                            >
                                <option value="">— ninguno —</option>
                                {fundKeys.filter(k => k !== selectedFundKey).map(k => (
                                    <option key={k} value={k}>{k}{details[k]?.isin ? ` (${details[k].isin})` : ''}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
                {/* Refresh button */}
                <button onClick={onRefreshDetails} disabled={refreshingDetails} style={{
                    padding:'8px 16px', background: refreshingDetails ? 'var(--border-glass)' : 'var(--accent-secondary)',
                    color:'white', border:'none', borderRadius:'8px', fontWeight:600,
                    cursor: refreshingDetails ? 'not-allowed' : 'pointer', fontSize:'0.85rem', transition:'all 0.2s'
                }}>
                    {refreshingDetails ? `⏳ Recalculando... ${refreshElapsed > 0 ? `(${refreshElapsed}s)` : ''}` : '🔄 Recalcular Detalles'}
                </button>
            </div>

            {/* Progress panel */}
            {refreshingDetails && (
                <div style={{marginBottom:'1rem', padding:'1rem 1.5rem', background:'rgba(74,162,175,0.08)', borderRadius:'12px', border:'1px solid rgba(74,162,175,0.25)'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'10px'}}>
                        <div className="spinner" style={{width:'18px', height:'18px', flexShrink:0}} />
                        <span style={{fontWeight:600, fontSize:'0.9rem', color:'var(--accent-glow)'}}>
                            {refreshStep || progressSteps[0]}
                        </span>
                    </div>
                    <div style={{width:'100%', height:'6px', background:'var(--border-glass)', borderRadius:'3px', overflow:'hidden'}}>
                        <div style={{
                            height:'100%',
                            width:`${Math.min((refreshElapsed / 120) * 100, 95)}%`,
                            background:'linear-gradient(90deg, var(--accent-glow), var(--accent-secondary))',
                            borderRadius:'3px',
                            transition:'width 2s linear'
                        }} />
                    </div>
                    <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'6px'}}>
                        Los datos de Finect pueden tardar 1–3 minutos. Los resultados se mostrarán automáticamente al finalizar.
                    </div>
                </div>
            )}

            {/* Individual fund detail panel */}
            {selectedFundKey && selectedFund && (
                <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'8px'}}>
                        <h3 style={{margin:0, fontWeight:600}}>
                            📋 {selectedFundKey}
                            {selectedFund.isin && <span style={{marginLeft:'10px', fontSize:'0.75rem', color:'var(--text-secondary)', fontWeight:400}}>{selectedFund.isin}</span>}
                            {comparisonFundKey && (
                                <span style={{marginLeft:'14px', fontSize:'0.8rem', color:'#a78bfa', fontWeight:500}}>vs {comparisonFundKey.substring(0,25)}</span>
                            )}
                        </h3>
                        <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                            <button onClick={() => loadFundDetail(selectedFundKey, true)} disabled={fundDetailLoading}
                                style={{padding:'5px 12px', background:'rgba(74,162,175,0.15)', border:'1px solid rgba(74,162,175,0.3)', borderRadius:'6px', color:'var(--accent-glow)', fontSize:'0.75rem', cursor:'pointer'}}>
                                🔄 Recargar de Finect
                            </button>
                            {selectedFund.isin && (
                                <a href={selectedFund.finect_url || `https://www.finect.com/fondos-inversion/${selectedFund.isin}`} target="_blank" rel="noreferrer"
                                   style={{padding:'5px 12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'6px', color:'var(--text-secondary)', fontSize:'0.75rem', textDecoration:'none'}}>
                                    🔗 Ver en Finect
                                </a>
                            )}
                        </div>
                    </div>

                    {fundDetailLoading && <div style={{color:'var(--text-secondary)', fontSize:'0.85rem'}}>Cargando detalles completos...</div>}

                    {fundDetail && !fundDetailLoading && (
                        <div>
                            {/* Badges */}
                            <div style={{display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'1rem'}}>
                                {fundDetail.category && <span style={{padding:'4px 10px', background:'rgba(74,162,175,0.15)', borderRadius:'6px', fontSize:'0.8rem', color:'var(--accent-glow)'}}>{fundDetail.category}</span>}
                                {fundDetail.management_company && <span style={{padding:'4px 10px', background:'rgba(160,130,210,0.15)', borderRadius:'6px', fontSize:'0.8rem', color:'var(--accent-secondary)'}}>{fundDetail.management_company}</span>}
                                {fundDetail.srri != null && <span style={{padding:'4px 10px', background:'rgba(255,255,255,0.08)', borderRadius:'6px', fontSize:'0.8rem'}}>SRRI: {fundDetail.srri}/7</span>}
                                {fundDetail.expense_ratio != null && <span style={{padding:'4px 10px', background:'rgba(255,255,255,0.08)', borderRadius:'6px', fontSize:'0.8rem'}}>TER: {fundDetail.expense_ratio}%</span>}
                                {fundDetail.aum != null && <span style={{padding:'4px 10px', background:'rgba(255,255,255,0.08)', borderRadius:'6px', fontSize:'0.8rem'}}>AUM: {typeof fundDetail.aum === 'number' ? `€${(fundDetail.aum/1e6).toFixed(0)}M` : fundDetail.aum}</span>}
                                {fundDetail.inception_date && <span style={{padding:'4px 10px', background:'rgba(255,255,255,0.08)', borderRadius:'6px', fontSize:'0.8rem'}}>Fecha inicio: {fundDetail.inception_date}</span>}
                            </div>

                            {/* Metrics */}
                            {fundDetail.metrics && Object.keys(fundDetail.metrics).length > 0 && (
                                <div style={{display:'flex', flexWrap:'wrap', gap:'10px', marginBottom:'1.5rem', paddingBottom:'1.5rem', borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                                    {fundDetail.metrics.sharpe_ratio != null && <div style={{textAlign:'center', padding:'8px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'10px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Sharpe</div><div style={{fontWeight:700, color:signColor(fundDetail.metrics.sharpe_ratio)}}>{fundDetail.metrics.sharpe_ratio.toFixed(2)}</div></div>}
                                    {fundDetail.metrics.alpha != null && <div style={{textAlign:'center', padding:'8px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'10px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Alpha</div><div style={{fontWeight:700, color:signColor(fundDetail.metrics.alpha)}}>{fundDetail.metrics.alpha.toFixed(2)}</div></div>}
                                    {fundDetail.metrics.beta != null && <div style={{textAlign:'center', padding:'8px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'10px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Beta</div><div style={{fontWeight:700}}>{fundDetail.metrics.beta.toFixed(2)}</div></div>}
                                    {fundDetail.metrics.standard_deviation != null && <div style={{textAlign:'center', padding:'8px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'10px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Volatilidad</div><div style={{fontWeight:700, color:riskColor(fundDetail.metrics.standard_deviation)}}>{fmtPct(fundDetail.metrics.standard_deviation)}</div></div>}
                                    {fundDetail.metrics.max_drawdown != null && <div style={{textAlign:'center', padding:'8px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'10px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Max Caída</div><div style={{fontWeight:700, color:'var(--danger)'}}>{fmtPct(fundDetail.metrics.max_drawdown)}</div></div>}
                                    {fundDetail.metrics.tracking_error != null && <div style={{textAlign:'center', padding:'8px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'10px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>T. Error</div><div style={{fontWeight:700}}>{fmtPct(fundDetail.metrics.tracking_error)}</div></div>}
                                </div>
                            )}

                            {/* Sectors + Regions side by side */}
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem', marginBottom:'1.5rem'}}>
                                {Object.keys(fundDetail.sectors || {}).length > 0 && (
                                    <div>
                                        <h4 style={{marginBottom:'0.75rem', fontWeight:600, fontSize:'0.85rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px'}}>Sectores</h4>
                                        <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                                            {Object.entries(fundDetail.sectors).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v]) => (
                                                <div key={k} style={{fontSize:'0.8rem'}}>
                                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'2px'}}>
                                                        <span style={{color:'var(--text-secondary)'}}>{k}</span>
                                                        <strong>{v.toFixed(1)}%</strong>
                                                    </div>
                                                    <div style={{height:'4px', background:'var(--border-glass)', borderRadius:'2px'}}>
                                                        <div style={{height:'100%', width:`${Math.min(v, 100)}%`, background:'var(--accent-glow)', borderRadius:'2px'}} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {Object.keys(fundDetail.countries || {}).length > 0 && (
                                    <div>
                                        <h4 style={{marginBottom:'0.75rem', fontWeight:600, fontSize:'0.85rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px'}}>Geografía</h4>
                                        <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                                            {Object.entries(fundDetail.countries).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v]) => (
                                                <div key={k} style={{fontSize:'0.8rem'}}>
                                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'2px'}}>
                                                        <span style={{color:'var(--text-secondary)'}}>{k}</span>
                                                        <strong>{v.toFixed(1)}%</strong>
                                                    </div>
                                                    <div style={{height:'4px', background:'var(--border-glass)', borderRadius:'2px'}}>
                                                        <div style={{height:'100%', width:`${Math.min(v, 100)}%`, background:'var(--accent-secondary)', borderRadius:'2px'}} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Holdings */}
                            <div style={{borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:'1.5rem'}}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem'}}>
                                    <h4 style={{margin:0, fontWeight:600, fontSize:'0.85rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px'}}>
                                        Top Holdings {fundDetail.holdings && fundDetail.holdings.length > 0 ? `(${fundDetail.holdings.length})` : ''}
                                    </h4>
                                    {fundDetail.isin && (
                                        <a href={fundDetail.finect_url || `https://www.finect.com/fondos-inversion/${fundDetail.isin}`} target="_blank" rel="noreferrer"
                                           style={{fontSize:'0.75rem', color:'var(--accent-glow)', textDecoration:'none', opacity:0.8}}>
                                            Ver en Finect ↗
                                        </a>
                                    )}
                                </div>
                                {fundDetail.holdings && fundDetail.holdings.length > 0 ? (
                                    <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                                        {fundDetail.holdings.map((h, i) => {
                                            const name = h.name || h.Name || h.company || h.ticker || `Holding ${i+1}`;
                                            const weight = parseFloat(h.weight || h.Weight || h.percentage || 0);
                                            return (
                                                <div key={i} style={{display:'flex', alignItems:'center', gap:'10px', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:'0.82rem'}}>
                                                    <span style={{width:'20px', textAlign:'right', color:'var(--text-secondary)', fontSize:'0.7rem', flexShrink:0}}>{i+1}.</span>
                                                    <span style={{flex:1, color:'var(--text-primary)'}}>{name}</span>
                                                    {weight > 0 && (
                                                        <React.Fragment>
                                                            <div style={{width:'80px', height:'4px', background:'var(--border-glass)', borderRadius:'2px', flexShrink:0}}>
                                                                <div style={{height:'100%', width:`${Math.min(weight * 4, 100)}%`, background:'var(--accent-glow)', borderRadius:'2px'}} />
                                                            </div>
                                                            <span style={{width:'50px', textAlign:'right', fontWeight:600, color:'var(--accent-glow)', flexShrink:0}}>{weight.toFixed(1)}%</span>
                                                        </React.Fragment>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{color:'var(--text-secondary)', fontSize:'0.82rem', padding:'8px 0', fontStyle:'italic'}}>
                                        Sin datos de holdings disponibles en caché.{' '}
                                        {fundDetail.isin && (
                                            <a href={fundDetail.finect_url || `https://www.finect.com/fondos-inversion/${fundDetail.isin}`} target="_blank" rel="noreferrer"
                                               style={{color:'var(--accent-glow)', textDecoration:'none'}}>Consultar en Finect ↗</a>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Fallback: show cached sector/region from details object */}
                    {!fundDetailLoading && !fundDetail && selectedFund && (
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem'}}>
                            {Object.keys(selectedFund.sector || {}).length > 0 && (
                                <div>
                                    <h4 style={{marginBottom:'0.75rem', fontSize:'0.85rem', color:'var(--text-secondary)', fontWeight:600, textTransform:'uppercase'}}>Sectores</h4>
                                    {renderComparisonBars(
                                        Object.entries(selectedFund.sector).map(([k,v]) => ({name:k, value:parseFloat(v)})),
                                        null
                                    )}
                                </div>
                            )}
                            {Object.keys(selectedFund.region || {}).length > 0 && (
                                <div>
                                    <h4 style={{marginBottom:'0.75rem', fontSize:'0.85rem', color:'var(--text-secondary)', fontWeight:600, textTransform:'uppercase'}}>Geografía</h4>
                                    {renderComparisonBars(
                                        Object.entries(selectedFund.region).map(([k,v]) => ({name:k, value:parseFloat(v)})),
                                        null
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Comparison panel: side-by-side vs another portfolio fund */}
                    {comparisonFundKey && (() => {
                        const compFund = details[comparisonFundKey];
                        if (!compFund) return null;
                        const renderCmpTable = (titleA, titleB, dataA, dataB) => {
                            const allKeys = new Set([...Object.keys(dataA), ...Object.keys(dataB)]);
                            const rows = Array.from(allKeys).map(k => ({
                                name: k,
                                a: parseFloat(dataA[k] || 0),
                                b: parseFloat(dataB[k] || 0),
                            })).filter(r => r.a > 0.5 || r.b > 0.5).sort((x,y) => (y.a + y.b) - (x.a + x.b));
                            if (!rows.length) return <span style={{color:'var(--text-secondary)', fontSize:'0.8rem'}}>Sin datos</span>;
                            return (
                                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.8rem'}}>
                                    <thead>
                                        <tr style={{borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
                                            <th style={{textAlign:'left', padding:'5px 8px', color:'var(--text-secondary)', fontWeight:600}}>Concepto</th>
                                            <th style={{textAlign:'right', padding:'5px 8px', color:'var(--accent-glow)', fontWeight:700}}>{titleA}</th>
                                            <th style={{textAlign:'right', padding:'5px 8px', color:'#a78bfa', fontWeight:700}}>{titleB}</th>
                                            <th style={{textAlign:'right', padding:'5px 8px', color:'var(--text-secondary)', fontWeight:600}}>Δ (A−B)</th>
                                            <th style={{textAlign:'right', padding:'5px 8px', color:'var(--text-secondary)', fontWeight:600}}>%Δ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r, i) => {
                                            const delta = r.a - r.b;
                                            const pctDelta = r.b > 0.01 ? (delta / r.b * 100) : null;
                                            return (
                                                <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                                                    <td style={{padding:'5px 8px', color:'var(--text-secondary)'}}>{r.name}</td>
                                                    <td style={{padding:'5px 8px', textAlign:'right', fontWeight:700, color:'var(--accent-glow)', fontVariantNumeric:'tabular-nums'}}>{r.a > 0 ? `${r.a.toFixed(1)}%` : '—'}</td>
                                                    <td style={{padding:'5px 8px', textAlign:'right', fontWeight:700, color:'#a78bfa', fontVariantNumeric:'tabular-nums'}}>{r.b > 0 ? `${r.b.toFixed(1)}%` : '—'}</td>
                                                    <td style={{padding:'5px 8px', textAlign:'right', fontWeight:600, color: Math.abs(delta) < 1 ? 'var(--text-secondary)' : delta > 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric:'tabular-nums'}}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}pp</td>
                                                    <td style={{padding:'5px 8px', textAlign:'right', fontWeight:600, fontSize:'0.75rem', color: pctDelta == null ? 'var(--text-secondary)' : pctDelta > 0 ? 'var(--success)' : pctDelta < 0 ? 'var(--danger)' : 'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>{pctDelta != null ? `${pctDelta>=0?'+':''}${pctDelta.toFixed(0)}%` : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            );
                        };
                        const nameA = selectedFundKey.substring(0, 20);
                        const nameB = comparisonFundKey.substring(0, 20);
                        return (
                            <div style={{marginTop:'1.5rem', paddingTop:'1.5rem', borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                                <h4 style={{marginBottom:'1rem', fontWeight:600, fontSize:'0.9rem'}}>
                                    🔀 Comparativa: <span style={{color:'var(--accent-glow)'}}>{nameA}</span> vs <span style={{color:'#a78bfa'}}>{nameB}</span>
                                </h4>
                                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem'}}>
                                    <div>
                                        <h5 style={{marginBottom:'0.5rem', fontSize:'0.8rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Sectores</h5>
                                        {renderCmpTable(nameA, nameB, selectedFund.sector || {}, compFund.sector || {})}
                                    </div>
                                    <div>
                                        <h5 style={{marginBottom:'0.5rem', fontSize:'0.8rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Geografía</h5>
                                        {renderCmpTable(nameA, nameB, selectedFund.region || {}, compFund.region || {})}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Legend for comparison */}
            {!selectedFundKey && (
                <div style={{display:'flex', gap:'16px', marginBottom:'1rem', padding:'8px 14px', background:'rgba(255,215,0,0.06)', borderRadius:'8px', border:'1px solid rgba(255,215,0,0.15)', alignItems:'center', fontSize:'0.8rem', flexWrap:'wrap'}}>
                    <span style={{display:'flex', alignItems:'center', gap:'6px'}}>
                        <span style={{width:'12px', height:'6px', background:'var(--accent-glow)', borderRadius:'2px', display:'inline-block'}} />
                        Mi Cartera
                    </span>
                    <span style={{display:'flex', alignItems:'center', gap:'6px'}}>
                        <span style={{width:'12px', height:'6px', background:'rgba(255,215,0,0.5)', borderRadius:'2px', display:'inline-block'}} />
                        {benchmarkFundKey ? (benchmarkFundKey.substring(0, 28)) : 'MSCI World'}
                    </span>
                    <div style={{display:'flex', alignItems:'center', gap:'8px', marginLeft:'auto'}}>
                        <label style={{fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap'}}>Benchmark:</label>
                        <select
                            value={benchmarkFundKey || ''}
                            onChange={e => setBenchmarkFundKey(e.target.value || null)}
                            style={{padding:'3px 8px', borderRadius:'6px', border:'1px solid rgba(255,215,0,0.3)', background:'rgba(0,0,0,0.3)', color:'white', fontSize:'0.78rem', cursor:'pointer'}}
                        >
                            <option value="">MSCI World (default)</option>
                            {fundKeys.map(k => (
                                <option key={k} value={k}>{k.substring(0, 35)}</option>
                            ))}
                        </select>
                    </div>
                    <span style={{color:'var(--text-secondary)', fontSize:'0.72rem', whiteSpace:'nowrap'}}>Diferencia: <span style={{color:'var(--success)'}}>+sobreponderado</span> / <span style={{color:'var(--danger)'}}>-infraponderado</span></span>
                </div>
            )}

            {/* Aggregate global view */}
            {!selectedFundKey && (() => {
                // Determine benchmark data: portfolio fund or MSCI World
                let benchSectors = null, benchRegions = null;
                if (benchmarkFundKey && details && details[benchmarkFundKey]) {
                    const bf = details[benchmarkFundKey];
                    benchSectors = bf.sector ? Object.fromEntries(
                        Object.entries(bf.sector).map(([k,v]) => [k, parseFloat(v)])
                    ) : null;
                    benchRegions = bf.region ? Object.fromEntries(
                        Object.entries(bf.region).map(([k,v]) => [k, parseFloat(v)])
                    ) : null;
                } else if (benchmark) {
                    benchSectors = benchmark.sectors || null;
                    benchRegions = benchmark.regions || null;
                }
                return (
                    <React.Fragment>
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'2rem'}}>
                        <div className="glass-panel" style={{padding: '2rem'}}>
                            <h3 style={{marginBottom:'1.5rem', fontWeight:600}}>🎯 Exposición Sectorial</h3>
                            {renderComparisonBars(sectors, benchSectors, benchmarkFundKey ? benchmarkFundKey.substring(0,20) : 'MSCI World')}
                        </div>
                        <div className="glass-panel" style={{padding: '2rem'}}>
                            <h3 style={{marginBottom:'1.5rem', fontWeight:600}}>🌍 Exposición Geográfica</h3>
                            {renderComparisonBars(regions, benchRegions, benchmarkFundKey ? benchmarkFundKey.substring(0,20) : 'MSCI World')}
                        </div>
                    </div>
                    {portfolioHoldings && portfolioHoldings.holdings && portfolioHoldings.holdings.length > 0 && (
                        <div className="glass-panel" style={{padding:'2rem', marginTop:'2rem'}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem', flexWrap:'wrap', gap:'10px'}}>
                                <h3 style={{margin:0, fontWeight:600}}>🏢 Holdings Ponderados de Cartera</h3>
                                <span style={{fontSize:'0.75rem', color:'var(--text-secondary)'}}>
                                    {portfolioHoldings.funds_with_holdings}/{portfolioHoldings.total_funds} fondos con datos · Cobertura: {portfolioHoldings.coverage_pct}%
                                </span>
                            </div>
                            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:'8px'}}>
                                {portfolioHoldings.holdings.map((h, i) => (
                                    <div key={h.name} style={{display:'flex', alignItems:'center', gap:'10px', padding:'6px 10px', background:'rgba(255,255,255,0.03)', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.06)'}}>
                                        <span style={{fontSize:'0.72rem', color:'var(--text-secondary)', minWidth:'22px', textAlign:'right', fontVariantNumeric:'tabular-nums'}}>#{i+1}</span>
                                        <div style={{flex:1, overflow:'hidden'}}>
                                            <div style={{fontWeight:600, fontSize:'0.83rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={h.name}>{h.name}</div>
                                        </div>
                                        <div style={{textAlign:'right', flexShrink:0}}>
                                            <div style={{fontWeight:700, fontSize:'0.88rem', color:'var(--accent-glow)', fontVariantNumeric:'tabular-nums'}}>{h.weight.toFixed(2)}%</div>
                                            <div style={{height:'4px', width:`${Math.min(h.weight * 8, 80)}px`, background:'var(--accent-glow)', borderRadius:'2px', opacity:0.6, marginTop:'2px', marginLeft:'auto'}} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    </React.Fragment>
                );
            })()}
        </div>
    );
};

// ---------------- TAB 3: Evolución ----------------

const HeatmapRenderer = ({ data, activeFunds }) => {
    const [sortMode, setSortMode] = useState('weight'); // 'weight' | 'corr'
    if (!data || !data.labels) return null;
    const baseLabels = data.labels.filter(l => activeFunds.includes(l));
    if (baseLabels.length < 2) return <div style={{padding:'1rem', color:'var(--text-secondary)'}}>Selecciona al menos dos fondos para ver la correlación.</div>;

    // Sort labels by avg cross-correlation (desc) or keep original order
    const labels = sortMode === 'corr'
        ? [...baseLabels].sort((a, b) => {
            const avgA = baseLabels.reduce((s, l) => s + (l !== a ? (data.matrix[a]?.[l] ?? 0) : 0), 0) / (baseLabels.length - 1);
            const avgB = baseLabels.reduce((s, l) => s + (l !== b ? (data.matrix[b]?.[l] ?? 0) : 0), 0) / (baseLabels.length - 1);
            return avgB - avgA;
          })
        : baseLabels;

    return (
        <div>
        <div style={{marginBottom:'8px', display:'flex', gap:'6px', alignItems:'center'}}>
            <span style={{fontSize:'0.75rem', color:'var(--text-secondary)'}}>Ordenar:</span>
            {[['weight', 'Por peso'], ['corr', 'Por correlación media']].map(([mode, label]) => (
                <button key={mode} onClick={() => setSortMode(mode)} style={{
                    padding:'3px 10px', borderRadius:'10px', fontSize:'0.72rem', cursor:'pointer',
                    border: sortMode === mode ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)',
                    background: sortMode === mode ? 'var(--accent-glow)' : 'transparent',
                    color: sortMode === mode ? '#000' : 'var(--text-secondary)',
                }}>{label}</button>
            ))}
        </div>
        <div style={{display: 'grid', gridTemplateColumns: `auto repeat(${labels.length}, 1fr)`, gap: '3px', fontSize:'0.7rem', marginTop: '1rem'}}>
            <div />
            {labels.map(l => <div key={l} style={{textAlign:'center', writingMode: 'vertical-rl', alignSelf:'end', maxHeight:'110px', overflow:'hidden'}}>{l.substring(0,20)}</div>)}
            {labels.map((l1) => (
                <React.Fragment key={l1}>
                    <div style={{textAlign:'right', paddingRight: '8px', alignSelf:'center', fontWeight: 'bold', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'140px'}}>{l1.substring(0,20)}</div>
                    {labels.map((l2) => {
                        const val = data.matrix[l1]?.[l2] ?? null;
                        if (val === null) {
                            return <div key={l2} style={{backgroundColor:'rgba(128,128,128,0.3)', color:'var(--text-secondary)', padding:'8px 4px', textAlign:'center', borderRadius:'4px', fontSize:'0.65rem'}}>N/A</div>;
                        }
                        const hue = ((val + 1) / 2) * 120;
                        const sat = Math.abs(val) > 0.5 ? 80 : 60;
                        const light = l1 === l2 ? 30 : 40;
                        return (
                            <div key={l2} title={`${l1} vs ${l2}: ${val.toFixed(4)}`} style={{
                                backgroundColor: `hsla(${hue}, ${sat}%, ${light}%, 0.9)`, color: 'white', padding: '8px 4px',
                                textAlign: 'center', borderRadius: '4px', textShadow: '0 0 2px black', fontWeight: 'bold',
                                border: l1 === l2 ? '1px solid rgba(255,255,255,0.4)': '1px solid rgba(0,0,0,0.1)',
                                cursor: 'default', transition: 'transform 0.1s',
                            }}>
                                {val.toFixed(2)}
                            </div>
                        );
                    })}
                </React.Fragment>
            ))}
        </div>
        </div>
    );
};

// ---- Period helpers (shared by metrics & correlation) ----
const getDateRange = (timeframe, customRange) => {
    const end = (customRange && customRange.to) ? new Date(customRange.to) : new Date();
    const start = new Date(end);
    if (customRange && customRange.from) return { start: new Date(customRange.from), end };
    if (timeframe === '1M') start.setMonth(start.getMonth() - 1);
    else if (timeframe === '3M') start.setMonth(start.getMonth() - 3);
    else if (timeframe === 'YTD') { start.setMonth(0); start.setDate(1); }
    else if (timeframe === '1Y') start.setFullYear(start.getFullYear() - 1);
    else if (timeframe === '3Y') start.setFullYear(start.getFullYear() - 3);
    else if (timeframe === '5Y') start.setFullYear(start.getFullYear() - 5);
    else if (timeframe === '10Y') start.setFullYear(start.getFullYear() - 10);
    else start.setFullYear(1900); // MAX
    return { start, end };
};

const filterSeries = (series, start, end) =>
    series.filter(p => { const d = new Date(p.date); return d >= start && d <= end; });

const numberOrNull = (value) => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
);

const normalizeMetricShape = (metrics) => {
    if (!metrics) return null;
    const maxDrawdown = metrics.maxDD ?? metrics.max_drawdown;
    return {
        totalReturn: numberOrNull(metrics.totalReturn ?? metrics.total_return),
        annReturn: numberOrNull(metrics.annReturn ?? metrics.annualized_return),
        vol: numberOrNull(metrics.vol ?? metrics.standard_deviation),
        sharpe: numberOrNull(metrics.sharpe ?? metrics.sharpe_ratio),
        maxDD: maxDrawdown != null ? Math.abs(maxDrawdown) : null,
    };
};

const calculateSeriesPeriodReturn = (series, timeframe, annualized = false) => {
    if (!series || series.length < 2) return null;
    const sorted = [...series]
        .filter(p => p && p.date && typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sorted.length < 2) return null;

    const endDate = new Date(sorted[sorted.length - 1].date);
    const startDate = new Date(endDate);
    if (timeframe === '1M') startDate.setMonth(startDate.getMonth() - 1);
    else if (timeframe === '3M') startDate.setMonth(startDate.getMonth() - 3);
    else if (timeframe === 'YTD') { startDate.setMonth(0); startDate.setDate(1); }
    else if (timeframe === '1Y') startDate.setFullYear(startDate.getFullYear() - 1);
    else if (timeframe === '3Y') startDate.setFullYear(startDate.getFullYear() - 3);
    else if (timeframe === '5Y') startDate.setFullYear(startDate.getFullYear() - 5);
    else if (timeframe === '10Y') startDate.setFullYear(startDate.getFullYear() - 10);
    else if (timeframe === 'MAX') startDate.setFullYear(1900);

    const window = sorted.filter(p => {
        const date = new Date(p.date);
        return date >= startDate && date <= endDate;
    });
    if (window.length < 2) return null;

    const first = window[0].price;
    const last = window[window.length - 1].price;
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0 || last <= 0) return null;

    const totalReturn = ((last / first) - 1) * 100;
    if (!annualized) return +totalReturn.toFixed(2);

    const days = Math.max((new Date(window[window.length - 1].date) - new Date(window[0].date)) / 86400000, 1);
    const annualizedReturn = (Math.pow(last / first, 365 / days) - 1) * 100;
    return +annualizedReturn.toFixed(2);
};

const buildPeriodReturnsComparison = (currentSeries, fundSeries, simulatedSeries) => {
    const periods = [
        { label: '1 Mes', timeframe: '1M', annualized: false },
        { label: '3 Meses', timeframe: '3M', annualized: false },
        { label: 'YTD', timeframe: 'YTD', annualized: false },
        { label: '1 Año', timeframe: '1Y', annualized: true },
        { label: '3 Años', timeframe: '3Y', annualized: true },
        { label: '5 Años', timeframe: '5Y', annualized: true },
        { label: '10 Años', timeframe: '10Y', annualized: true },
        { label: 'Máx.', timeframe: 'MAX', annualized: true },
    ];

    return periods
        .map(period => ({
            label: period.label,
            current: calculateSeriesPeriodReturn(currentSeries, period.timeframe, period.annualized),
            fund: calculateSeriesPeriodReturn(fundSeries, period.timeframe, period.annualized),
            simulated: calculateSeriesPeriodReturn(simulatedSeries, period.timeframe, period.annualized),
        }))
        .filter(row => row.current != null || row.fund != null || row.simulated != null);
};

// Compute per-fund metrics for an array of {date, price} points
// benchmarkPts: optional array of {date, price} for Alpha/Beta calculation
const computeFundMetrics = (pts, benchmarkPts) => {
    if (!pts || pts.length < 5) return null;
    const first = pts[0].price, last = pts[pts.length - 1].price;
    const days = (new Date(pts[pts.length-1].date) - new Date(pts[0].date)) / 86400000 || 1;
    const totalReturn = (last / first - 1) * 100;
    const annReturn = ((Math.pow(last / first, 365 / days)) - 1) * 100;
    // Daily log returns for vol
    const logRets = [];
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].price > 0 && pts[i-1].price > 0)
            logRets.push(Math.log(pts[i].price / pts[i-1].price));
    }
    let vol = null, sharpe = null;
    if (logRets.length >= 10) {
        const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
        const variance = logRets.reduce((a, b) => a + (b - mean) ** 2, 0) / logRets.length;
        vol = Math.sqrt(variance * 252) * 100;
        sharpe = vol > 0 ? (annReturn / vol) : null;
    }
    // Max drawdown
    let peak = pts[0].price, maxDD = 0;
    for (const p of pts) {
        if (p.price > peak) peak = p.price;
        const dd = (peak - p.price) / peak;
        if (dd > maxDD) maxDD = dd;
    }
    // Alpha / Beta vs benchmark (MSCI World proxy)
    let alpha = null, beta = null;
    if (benchmarkPts && benchmarkPts.length >= 10) {
        const ptsMap = {};
        pts.forEach(p => { ptsMap[p.date] = p.price; });
        const benchMap = {};
        benchmarkPts.forEach(p => { benchMap[p.date] = p.price; });
        const commonDates = Object.keys(ptsMap).filter(d => benchMap[d]).sort();
        if (commonDates.length >= 20) {
            const fundRets = [], benchRets = [];
            for (let i = 1; i < commonDates.length; i++) {
                const dp = commonDates[i-1], dc = commonDates[i];
                if (ptsMap[dp] > 0 && ptsMap[dc] > 0 && benchMap[dp] > 0 && benchMap[dc] > 0) {
                    fundRets.push(Math.log(ptsMap[dc] / ptsMap[dp]));
                    benchRets.push(Math.log(benchMap[dc] / benchMap[dp]));
                }
            }
            if (fundRets.length >= 20) {
                const mf = fundRets.reduce((a,b) => a+b, 0) / fundRets.length;
                const mb = benchRets.reduce((a,b) => a+b, 0) / benchRets.length;
                let cov = 0, vb = 0;
                for (let i = 0; i < fundRets.length; i++) {
                    cov += (fundRets[i] - mf) * (benchRets[i] - mb);
                    vb += (benchRets[i] - mb) ** 2;
                }
                if (vb !== 0) {
                    beta = +(cov / vb).toFixed(3);
                    const bFirst = benchmarkPts[0].price, bLast = benchmarkPts[benchmarkPts.length-1].price;
                    const bDays = (new Date(benchmarkPts[benchmarkPts.length-1].date) - new Date(benchmarkPts[0].date)) / 86400000 || 1;
                    const benchAnn = ((Math.pow(bLast / bFirst, 365 / bDays)) - 1) * 100;
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
        beta,
    };
};

// Compute Pearson correlation between two numeric arrays
const pearson = (a, b) => {
    if (a.length !== b.length || a.length < 5) return null;
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, da2 = 0, db2 = 0;
    for (let i = 0; i < n; i++) {
        const da = a[i] - ma, db = b[i] - mb;
        num += da * db; da2 += da * da; db2 += db * db;
    }
    const denom = Math.sqrt(da2 * db2);
    return denom === 0 ? null : +(num / denom).toFixed(4);
};

// Build correlation matrix from historyBatch filtered by period
const computeClientCorrelation = (historyBatch, funds, start, end) => {
    const dailyRets = {};
    const dateIndex = {};
    funds.forEach(fund => {
        const pts = filterSeries(historyBatch[fund] || [], start, end);
        if (pts.length < 6) return;
        for (let i = 1; i < pts.length; i++) {
            const d = pts[i].date;
            if (!dateIndex[d]) dateIndex[d] = {};
            if (pts[i].price > 0 && pts[i-1].price > 0)
                dateIndex[d][fund] = Math.log(pts[i].price / pts[i-1].price);
        }
    });
    const labels = funds.filter(f => (historyBatch[f] || []).length >= 6);
    const matrix = {};
    labels.forEach(f1 => {
        matrix[f1] = {};
        labels.forEach(f2 => {
            if (f1 === f2) { matrix[f1][f2] = 1.0; return; }
            const dates = Object.keys(dateIndex).filter(d => dateIndex[d][f1] !== undefined && dateIndex[d][f2] !== undefined);
            if (dates.length < 30) { matrix[f1][f2] = null; return; }
            matrix[f1][f2] = pearson(dates.map(d => dateIndex[d][f1]), dates.map(d => dateIndex[d][f2]));
        });
    });
    return { labels, matrix };
};

// Fund metrics table component
const FundMetricsTable = ({ historyBatch, activeFunds, timeframe, customRange, fundColorMap, benchmarkKey }) => {
    const [sortCol, setSortCol] = useState('annReturn');
    const [sortAsc, setSortAsc] = useState(false);

    const { start, end } = getDateRange(timeframe, customRange);
    const benchmarkPts = benchmarkKey ? filterSeries(historyBatch[benchmarkKey] || [], start, end) : null;

    const rows = activeFunds.map(fund => {
        const pts = filterSeries(historyBatch[fund] || [], start, end);
        const bPts = (benchmarkKey && fund !== benchmarkKey) ? benchmarkPts : null;
        return { fund, m: computeFundMetrics(pts, bPts) };
    }).filter(r => r.m !== null);

    const sortedRows = [...rows].sort((a, b) => {
        const va = a.m[sortCol], vb = b.m[sortCol];
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return sortAsc ? va - vb : vb - va;
    });

    const handleSort = (key) => {
        if (sortCol === key) setSortAsc(!sortAsc);
        else { setSortCol(key); setSortAsc(false); }
    };

    if (sortedRows.length === 0) return <div style={{padding:'1rem', color:'var(--text-secondary)', textAlign:'center'}}>Sin datos suficientes para el periodo.</div>;

    const signColor = v => v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text-primary)';
    const isPortfolio = name => name.includes('Mi Cartera');
    const hasBenchmark = benchmarkKey && !!benchmarkPts && benchmarkPts.length >= 10;
    const cols = [
        { key: 'totalReturn', label: 'Retorno Total', unit: '%', color: signColor },
        { key: 'annReturn', label: 'CAGR', unit: '%', color: signColor },
        { key: 'vol', label: 'Volatilidad', unit: '%', color: v => v !== null ? (v < 10 ? 'var(--success)' : v < 20 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-secondary)' },
        { key: 'sharpe', label: 'Sharpe', unit: '', color: v => v !== null ? signColor(v) : 'var(--text-secondary)' },
        { key: 'maxDD', label: 'Max Drawdown', unit: '%', color: v => v !== null ? (v < 10 ? 'var(--success)' : v < 20 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-secondary)' },
        ...(hasBenchmark ? [
            { key: 'alpha', label: 'Alpha (%aa)', unit: '', color: v => v !== null ? signColor(v) : 'var(--text-secondary)' },
            { key: 'beta', label: 'Beta', unit: '', color: v => v !== null ? (v < 0.8 ? 'var(--success)' : v > 1.2 ? 'var(--danger)' : 'var(--text-primary)') : 'var(--text-secondary)' },
        ] : []),
    ];

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <span style={{opacity:0.3, marginLeft:'4px'}}>⇅</span>;
        return <span style={{marginLeft:'4px', color:'var(--accent-glow)'}}>{sortAsc ? '↑' : '↓'}</span>;
    };

    return (
        <div style={{overflowX:'auto'}}>
            {hasBenchmark && (
                <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'6px', padding:'4px 10px', background:'rgba(0,212,170,0.06)', borderRadius:'6px', border:'1px solid rgba(0,212,170,0.15)'}}>
                    α/β calculados vs <strong style={{color:'var(--accent-glow)'}}>{benchmarkKey}</strong> en el periodo seleccionado
                </div>
            )}
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.82rem'}}>
                <thead>
                    <tr style={{borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
                        <th style={{textAlign:'left', padding:'8px 10px', color:'var(--text-secondary)', fontWeight:600, minWidth:'160px'}}>Fondo</th>
                        {cols.map(c => (
                            <th key={c.key} onClick={() => handleSort(c.key)}
                                style={{textAlign:'right', padding:'8px 10px', color: sortCol === c.key ? 'var(--accent-glow)' : 'var(--text-secondary)', fontWeight:600, whiteSpace:'nowrap', cursor:'pointer', userSelect:'none'}}>
                                {c.label}<SortIcon col={c.key} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sortedRows.map(({ fund, m }) => {
                        const color = fundColorMap[fund] || '#ffffff';
                        const isP = isPortfolio(fund);
                        return (
                            <tr key={fund} style={{borderBottom:'1px solid rgba(255,255,255,0.05)', background: isP ? 'rgba(255,215,0,0.05)' : 'transparent', transition:'background 0.15s'}}
                                onMouseEnter={e => e.currentTarget.style.background = isP ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = isP ? 'rgba(255,215,0,0.05)' : 'transparent'}>
                                <td style={{padding:'8px 10px', display:'flex', alignItems:'center', gap:'8px'}}>
                                    <span style={{display:'inline-block', width:'10px', height:'10px', borderRadius:'50%', background:color, flexShrink:0, boxShadow: isP ? '0 0 6px #FFD700' : 'none'}}></span>
                                    <span style={{color: color, fontWeight: isP ? 700 : 500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'200px'}}>{fund.substring(0, 30)}</span>
                                </td>
                                {cols.map(c => {
                                    const val = m[c.key];
                                    return (
                                        <td key={c.key} style={{padding:'8px 10px', textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums', color: val !== null ? c.color(val) : 'var(--text-secondary)'}}>
                                            {val !== null ? `${val}${c.unit}` : '—'}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// Interactive Chart — uses fundColorMap for consistent colors
const InteractiveChart = ({ datasets, timeframe, activeFunds, customRange, fundColorMap }) => {
    const containerRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const overlayRef = React.useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const [dimensions, setDimensions] = useState({ w: 800, h: 400 });
    const PORTFOLIO_KEY = '📊 Mi Cartera Actual';
    const getLimitDate = () => {
        if (customRange && customRange.from) return new Date(customRange.from);
        const d = new Date();
        if (timeframe === '1M') d.setMonth(d.getMonth() - 1);
        else if (timeframe === '3M') d.setMonth(d.getMonth() - 3);
        else if (timeframe === 'YTD') { d.setMonth(0); d.setDate(1); }
        else if (timeframe === '1Y') d.setFullYear(d.getFullYear() - 1);
        else if (timeframe === '3Y') d.setFullYear(d.getFullYear() - 3);
        else if (timeframe === '5Y') d.setFullYear(d.getFullYear() - 5);
        else if (timeframe === '10Y') d.setFullYear(d.getFullYear() - 10);
        else if (timeframe === 'MAX') {
            // Common start date: max of first available dates across all active funds
            // so all funds start at the same point in the base-100 chart.
            let maxFirst = null;
            (activeFunds || []).forEach(f => {
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
        return new Date();
    };

    // Process data
    const processData = () => {
        if (!datasets || Object.keys(datasets).length === 0) return null;
        const limitDate = getLimitDate();
        const endDate = getEndDate();
        let globalMin = 0, globalMax = 0, globalDateMin = Infinity, globalDateMax = -Infinity;
        const lines = [];
        const PORTFOLIO_KEY = '📊 Mi Cartera Actual';

        activeFunds.forEach(fund => {
            const raw = datasets[fund];
            if (!raw || raw.length === 0) return;
            let pts = raw.filter(p => {
                const d = new Date(p.date);
                return d >= limitDate && d <= endDate;
            });
            if (pts.length === 0) pts = raw;
            const base = pts[0].price;
            const normalized = pts.map(p => {
                const pct = ((p.price - base) / base) * 100;
                const ts = new Date(p.date).getTime();
                if (pct < globalMin) globalMin = pct;
                if (pct > globalMax) globalMax = pct;
                if (ts < globalDateMin) globalDateMin = ts;
                if (ts > globalDateMax) globalDateMax = ts;
                return { date: p.date, ts, pct, price: p.price };
            });
            // Use fundColorMap for consistent colors between checkbox and chart
            const color = fund === PORTFOLIO_KEY ? '#FFD700' : (fundColorMap ? fundColorMap[fund] : COLORS[0]) || COLORS[0];
            lines.push({
                fund,
                color,
                points: normalized,
                isPortfolio: fund === PORTFOLIO_KEY,
            });
        });

        if (lines.length === 0) return null;
        return { lines, globalMin, globalMax, globalDateMin, globalDateMax };
    };

    const chartData = processData();

    // Resize observer
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            const { width } = entries[0].contentRect;
            setDimensions({ w: Math.max(width, 300), h: Math.min(Math.max(width * 0.45, 280), 500) });
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Draw chart on canvas
    useEffect(() => {
        if (!canvasRef.current || !chartData) return;
        const canvas = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        const { w, h } = dimensions;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const margin = { top: 20, right: 15, bottom: 30, left: 55 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;
        const { lines, globalMin, globalMax, globalDateMin, globalDateMax } = chartData;

        const rawRange = (globalMax - globalMin) || 1;
        const yPad = rawRange * 0.08;
        const yMin = globalMin - yPad;
        const yMax = globalMax + yPad;
        const yRange = yMax - yMin;
        const dateRange = (globalDateMax - globalDateMin) || 1;

        const xScale = ts => margin.left + ((ts - globalDateMin) / dateRange) * plotW;
        const yScale = pct => margin.top + (1 - (pct - yMin) / yRange) * plotH;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(15, 20, 35, 0.4)';
        ctx.fillRect(margin.left, margin.top, plotW, plotH);

        // Y grid lines
        const yStepOpts = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
        let yStep = yStepOpts[yStepOpts.length - 1];
        for (const s of yStepOpts) { if (rawRange / s <= 7) { yStep = s; break; } }

        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const yStart = Math.ceil(yMin / yStep) * yStep;
        for (let v = yStart; v <= yMax; v += yStep) {
            const y = yScale(v);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            const label = v > 0 ? `+${v.toFixed(yStep < 1 ? 1 : 0)}%` : `${v.toFixed(yStep < 1 ? 1 : 0)}%`;
            ctx.fillText(label, margin.left - 6, y);
        }

        // 0% reference
        const zeroY = yScale(0);
        if (zeroY > margin.top && zeroY < margin.top + plotH) {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.moveTo(margin.left, zeroY); ctx.lineTo(w - margin.right, zeroY); ctx.stroke();
            ctx.setLineDash([]);
        }

        // X date labels
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const labelCount = Math.max(4, Math.floor(plotW / 100));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '10px Inter, sans-serif';
        for (let i = 0; i <= labelCount; i++) {
            const ts = globalDateMin + (i / labelCount) * dateRange;
            const x = xScale(ts);
            const d = new Date(ts);
            ctx.fillText(`${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`, x, h - margin.bottom + 10);
            // Vertical grid line
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + plotH); ctx.stroke();
        }

        // Draw area fills (gradient under each line) — skip portfolio line
        lines.forEach(line => {
            if (line.points.length < 2 || line.isPortfolio) return;
            const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + plotH);
            gradient.addColorStop(0, line.color + '18');
            gradient.addColorStop(1, line.color + '02');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(xScale(line.points[0].ts), yScale(line.points[0].pct));
            line.points.forEach(p => ctx.lineTo(xScale(p.ts), yScale(p.pct)));
            ctx.lineTo(xScale(line.points[line.points.length - 1].ts), margin.top + plotH);
            ctx.lineTo(xScale(line.points[0].ts), margin.top + plotH);
            ctx.closePath();
            ctx.fill();
        });

        // Draw fund lines (non-portfolio first, then portfolio on top)
        const sortedLines = [...lines.filter(l => !l.isPortfolio), ...lines.filter(l => l.isPortfolio)];
        sortedLines.forEach(line => {
            if (line.points.length < 2) return;
            ctx.strokeStyle = line.color;
            ctx.lineWidth = line.isPortfolio ? 3 : 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            if (line.isPortfolio) {
                ctx.shadowColor = '#FFD70080';
                ctx.shadowBlur = 10;
            } else {
                ctx.shadowColor = line.color + '60';
                ctx.shadowBlur = 6;
            }
            ctx.beginPath();
            line.points.forEach((p, i) => {
                const x = xScale(p.ts);
                const y = yScale(p.pct);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.shadowBlur = 0;
        });

        // Plot border
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    }, [chartData, dimensions]);

    // Mouse handler for tooltip / crosshair
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
        const dateRange = (globalDateMax - globalDateMin) || 1;
        const hoverTs = globalDateMin + ((mouseX - margin.left) / plotW) * dateRange;
        const hoverDate = new Date(hoverTs);

        // Find closest point for each line
        const points = [];
        lines.forEach(line => {
            let closest = line.points[0];
            let minDist = Math.abs(closest.ts - hoverTs);
            for (const p of line.points) {
                const dist = Math.abs(p.ts - hoverTs);
                if (dist < minDist) { minDist = dist; closest = p; }
            }
            points.push({ fund: line.fund, color: line.color, pct: closest.pct, price: closest.price, date: closest.date });
        });

        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const dateStr = `${hoverDate.getDate()} ${months[hoverDate.getMonth()]} ${hoverDate.getFullYear()}`;

        setTooltip({ x: mouseX, y: mouseY, date: dateStr, points });
    };

    if (!chartData) return <div style={{padding:'2rem', color:'var(--text-secondary)'}}>Selecciona al menos un fondo para ver la gráfica.</div>;

    return (
        <div ref={containerRef} style={{position:'relative', width:'100%', marginTop:'0.5rem', background:'var(--bg-glass)', borderRadius:'12px', overflow:'hidden', border:'1px solid var(--border-glass)'}}>
            {/* Legend */}
            <div style={{display:'flex', gap:'12px', flexWrap:'wrap', padding:'12px 16px 4px', borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                {chartData.lines.map(l => {
                    const lastPct = l.points[l.points.length-1].pct;
                    return (
                        <span key={l.fund} style={{display:'flex', alignItems:'center', gap:'6px', fontSize:'0.78rem', color:'var(--text-secondary)'}}>
                            <span style={{width: l.isPortfolio ? '14px' : '10px', height: l.isPortfolio ? '4px' : '3px', borderRadius:'2px', backgroundColor:l.color, display:'inline-block', boxShadow: l.isPortfolio ? '0 0 6px #FFD700' : 'none'}} />
                            <span style={{color:l.color, fontWeight: l.isPortfolio ? 800 : 600}}>{l.fund.substring(0,28)}</span>
                            <span style={{color:'var(--text-secondary)', fontSize:'0.7rem'}}>({lastPct >= 0 ? '+' : ''}{lastPct.toFixed(1)}%)</span>
                        </span>
                    );
                })}
            </div>
            {/* Canvas */}
            <canvas ref={canvasRef} style={{display:'block', cursor:'crosshair'}}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setTooltip(null)}
            />
            {/* Crosshair + Tooltip */}
            {tooltip && (
                <>
                    <div style={{position:'absolute', left:tooltip.x, top:20, bottom:30, width:'1px', background:'rgba(255,255,255,0.25)', pointerEvents:'none'}} />
                    <div style={{
                        position:'absolute',
                        left: tooltip.x > dimensions.w / 2 ? tooltip.x - 220 : tooltip.x + 15,
                        top: Math.max(30, Math.min(tooltip.y - 20, dimensions.h - 160)),
                        background:'rgba(15,20,35,0.95)', border:'1px solid rgba(255,255,255,0.15)',
                        borderRadius:'10px', padding:'10px 14px', pointerEvents:'none',
                        backdropFilter:'blur(12px)', minWidth:'180px', zIndex:10,
                        boxShadow:'0 8px 32px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'6px', fontWeight:600}}>{tooltip.date}</div>
                        {tooltip.points.map(p => (
                            <div key={p.fund} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', padding:'2px 0', fontSize:'0.78rem'}}>
                                <span style={{display:'flex', alignItems:'center', gap:'5px'}}>
                                    <span style={{width:'8px', height:'8px', borderRadius:'50%', backgroundColor:p.color, display:'inline-block', boxShadow:`0 0 4px ${p.color}`}} />
                                    <span style={{color:'var(--text-secondary)', maxWidth:'100px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.fund.substring(0,16)}</span>
                                </span>
                                <span style={{fontWeight:700, color: p.pct >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric:'tabular-nums'}}>{p.pct >= 0 ? '+' : ''}{p.pct.toFixed(2)}%</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// ---- Return Calendar Heatmap (Annual & Monthly views + Month Comparison) ----
const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Pure green for positive, pure red for negative, gray for zero/null
const pctToHeatColor = (v) => {
    if (v == null) return 'rgba(128,128,128,0.15)';
    if (Math.abs(v) < 0.05) return 'rgba(140,140,140,0.35)'; // ~zero
    if (v > 0) {
        const t = Math.min(v / 25, 1);   // saturates at +25%
        return `hsla(118, ${40 + t * 50}%, ${30 + t * 12}%, 0.88)`;  // green only
    } else {
        const t = Math.min(-v / 25, 1);  // saturates at -25%
        return `hsla(4, ${40 + t * 50}%, ${32 + t * 12}%, 0.88)`;    // red only
    }
};

const heatCellStyle = (v, isPortfolio) => ({
    padding: '5px 6px', textAlign: 'center', borderRadius: '4px', fontSize: '0.73rem',
    fontWeight: isPortfolio ? 800 : 600, fontVariantNumeric: 'tabular-nums',
    color: v == null ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.93)',
    backgroundColor: pctToHeatColor(v),
    border: isPortfolio ? '1px solid rgba(255,215,0,0.45)' : '1px solid transparent',
    cursor: 'default', minWidth: '58px', whiteSpace: 'nowrap',
});

// Compute monthly returns map { fundName: { "YYYY-MM": pct } } from history_batch
const computeMonthlyReturns = (histData) => {
    if (!histData) return null;
    const result = {};
    const allMonths = new Set();
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
    const [viewMode, setViewMode] = useState('annual'); // 'annual' | 'monthly' | 'compare'
    const [selectedYear, setSelectedYear] = useState(null);
    const [cmpA, setCmpA] = useState(''); // YYYY-MM
    const [cmpB, setCmpB] = useState(''); // YYYY-MM
    const [cmpType, setCmpType] = useState('months'); // 'months' | 'years'
    const [cmpMetric, setCmpMetric] = useState('pct'); // 'pct' | 'eur'
    const [ordersData, setOrdersData] = useState(null);
    const [cmpYearA, setCmpYearA] = useState(null);
    const [cmpYearB, setCmpYearB] = useState(null);

    useEffect(() => {
        fetch('/api/portfolio/annual-returns')
            .then(r => r.json())
            .then(d => {
                setAnnualData(d);
                setLoading(false);
                if (d.years?.length) setSelectedYear(d.years[d.years.length - 1]);
            })
            .catch(() => setLoading(false));
    }, []);

    // Lazy-load history_batch when monthly/compare mode selected
    useEffect(() => {
        if ((viewMode === 'monthly' || viewMode === 'compare') && !histData) {
            fetch('/api/portfolio/history_batch')
                .then(r => r.json())
                .then(d => setHistData(d))
                .catch(() => {});
        }
    }, [viewMode, histData]);

    // Load orders data when EUR metric is selected
    useEffect(() => {
        if (cmpMetric === 'eur' && !ordersData) {
            fetch('/api/portfolio/orders-summary')
                .then(r => r.json())
                .then(d => setOrdersData(d))
                .catch(() => {});
        }
    }, [cmpMetric, ordersData]);

    // Auto-set default comparison selections when compare mode opens
    // Uses histData (not monthlyData, which is computed later in the render tree)
    useEffect(() => {
        if (viewMode !== 'compare') return;

        if (cmpType === 'months') {
            // Determine last complete month and same month previous year from today
            const now = new Date();
            // Last complete month = previous month
            const lastCompleteDate = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 = last day of prev month
            const lastYM = `${lastCompleteDate.getFullYear()}-${String(lastCompleteDate.getMonth() + 1).padStart(2, '0')}`;
            const prevYearYM = `${lastCompleteDate.getFullYear() - 1}-${String(lastCompleteDate.getMonth() + 1).padStart(2, '0')}`;
            if (!cmpA) setCmpA(lastYM);
            if (!cmpB) setCmpB(prevYearYM);
        } else if (cmpType === 'years') {
            if (!annualData?.years?.length) return;
            const sortedYears = [...annualData.years].sort((a, b) => b - a);
            const currentYear = new Date().getFullYear();
            const lastCompleteYear = sortedYears.find(y => y < currentYear);
            const prevYear = lastCompleteYear != null ? sortedYears.find(y => y < lastCompleteYear) : null;
            if (cmpYearA == null && lastCompleteYear != null) setCmpYearA(lastCompleteYear);
            if (cmpYearB == null && prevYear != null) setCmpYearB(prevYear);
        }
    }, [viewMode, cmpType, annualData]); // intentionally excludes cmpA/cmpB to avoid resetting user selections

    const monthlyData = useMemo(() => computeMonthlyReturns(histData), [histData]);

    if (loading) return <div style={{padding:'1rem', color:'var(--text-secondary)'}}>Cargando rentabilidades anuales...</div>;
    if (!annualData?.years?.length) return <div style={{padding:'1rem', color:'var(--text-secondary)'}}>Sin datos anuales disponibles.</div>;

    // Fund order: Mi Cartera first, then by portfolio weight
    const weightMap = {};
    if (rawData?.funds) rawData.funds.forEach(f => { if (f.Fondo) weightMap[f.Fondo] = f.Porcentaje || 0; });

    const buildOrder = (fundsObj) => {
        const portfolioKey = Object.keys(fundsObj).find(k => k.includes('Mi Cartera'));
        const others = Object.keys(fundsObj)
            .filter(k => !k.includes('Mi Cartera'))
            .sort((a, b) => (weightMap[b] || 0) - (weightMap[a] || 0));
        return portfolioKey ? [portfolioKey, ...others] : others;
    };

    const renderTable = (columns, getVal, colHeader) => {
        const orderedFunds = buildOrder(annualData.funds);
        // merge all fund names from both annual + monthly (for completeness)
        return (
            <div style={{overflowX: 'auto'}}>
                <table style={{borderCollapse: 'separate', borderSpacing: '3px', fontSize: '0.78rem', width: '100%'}}>
                    <thead>
                        <tr>
                            <th style={{textAlign:'left', padding:'6px 10px', color:'var(--text-secondary)', fontWeight:600, position:'sticky', left:0, background:'var(--bg-primary)', zIndex:2, whiteSpace:'nowrap'}}>Fondo</th>
                            {columns.map(col => <th key={col} style={{textAlign:'center', padding:'6px 4px', color:'var(--text-secondary)', fontWeight:600, minWidth:'58px', whiteSpace:'nowrap'}}>{colHeader(col)}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {orderedFunds.map(name => {
                            const isPortfolio = name.includes('Mi Cartera');
                            return (
                                <tr key={name} style={{borderBottom: isPortfolio ? '2px solid rgba(255,215,0,0.18)' : 'none'}}>
                                    <td style={{padding:'5px 10px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'180px', fontWeight: isPortfolio ? 800 : 500, color: isPortfolio ? '#FFD700' : 'var(--text-primary)', position:'sticky', left:0, background:'var(--bg-primary)', zIndex:1}} title={name}>
                                        {isPortfolio ? '📊 ' : ''}{name.substring(0, 28)}
                                    </td>
                                    {columns.map(col => {
                                        const v = getVal(name, col);
                                        return (
                                            <td key={col}>
                                                <div style={heatCellStyle(v, isPortfolio)} title={v != null ? `${name} — ${colHeader(col)}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : 'Sin datos'}>
                                                    {v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—'}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const btnStyle = (active) => ({
        padding:'5px 14px', borderRadius:'16px', cursor:'pointer', fontWeight:600, fontSize:'0.78rem', border: active ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)',
        background: active ? 'var(--accent-glow)' : 'transparent', color: active ? '#000' : 'var(--text-primary)', transition:'all 0.15s',
    });

    // ── View mode controls ──
    const toolbar = (
        <div style={{display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center', marginBottom:'12px'}}>
            <button style={btnStyle(viewMode==='annual')} onClick={() => setViewMode('annual')}>📅 Anual</button>
            <button style={btnStyle(viewMode==='monthly')} onClick={() => setViewMode('monthly')}>🗓 Mensual</button>
            <button style={btnStyle(viewMode==='compare')} onClick={() => setViewMode('compare')}>⚖️ Comparativa</button>
            {viewMode === 'monthly' && annualData.years && (
                <select value={selectedYear || ''} onChange={e => setSelectedYear(Number(e.target.value))} style={{marginLeft:'8px', padding:'5px 10px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.8rem'}}>
                    {[...annualData.years].reverse().map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            )}
        </div>
    );

    const legend = (
        <div style={{marginTop:'8px', fontSize:'0.72rem', color:'var(--text-secondary)', display:'flex', gap:'14px', flexWrap:'wrap', alignItems:'center'}}>
            <span style={{display:'inline-flex', alignItems:'center', gap:'4px'}}><span style={{width:'14px',height:'14px',borderRadius:'3px',background:'hsla(118,80%,36%,0.88)',display:'inline-block'}}/> Positivo</span>
            <span style={{display:'inline-flex', alignItems:'center', gap:'4px'}}><span style={{width:'14px',height:'14px',borderRadius:'3px',background:'hsla(4,80%,38%,0.88)',display:'inline-block'}}/> Negativo</span>
            <span style={{display:'inline-flex', alignItems:'center', gap:'4px'}}><span style={{width:'14px',height:'14px',borderRadius:'3px',background:'rgba(140,140,140,0.35)',display:'inline-block'}}/> ~0%</span>
        </div>
    );

    // ─── ANNUAL view ───
    if (viewMode === 'annual') {
        return (
            <div>
                {toolbar}
                {renderTable(
                    annualData.years,
                    (name, y) => (annualData.funds[name]?.[y] ?? null),
                    y => y === annualData.current_year ? `${y} (A)` : String(y)
                )}
                {annualData.current_year && annualData.years.includes(annualData.current_year) && (
                    <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', marginTop:'6px'}}>
                        (A) = Año en curso, rentabilidad anualizada (YTD × 365/días)
                    </div>
                )}
                {legend}
            </div>
        );
    }

    // ─── MONTHLY view ───
    if (viewMode === 'monthly') {
        if (!monthlyData) return <div><br/>{toolbar}<div style={{padding:'1rem', color:'var(--text-secondary)'}}>Cargando datos mensuales...</div></div>;
        const currentYear = new Date().getFullYear();
        // For the current year, show last 12 months (trailing) for fairer comparison
        const months = selectedYear === currentYear
            ? monthlyData.months.slice(-12)
            : monthlyData.months.filter(ym => ym.startsWith(String(selectedYear) + '-'));
        return (
            <div>
                {toolbar}
                {months.length === 0 ? <div style={{padding:'1rem', color:'var(--text-secondary)'}}>Sin datos para {selectedYear}</div>
                    : renderTable(months, (name, ym) => monthlyData.returns[name]?.[ym] ?? null, ym => MONTH_LABELS[parseInt(ym.split('-')[1],10)-1])}
                {legend}
            </div>
        );
    }

    // ─── COMPARE view ───
    if (viewMode === 'compare') {
        const availMonths = monthlyData?.months || [];
        const selStyle = {padding:'6px 10px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.82rem'};
        const orderedFunds = buildOrder(annualData.funds);
        const fmtYM = (ym) => { if (!ym) return '—'; const [y,m] = ym.split('-'); return `${MONTH_LABELS[parseInt(m,10)-1]} ${y}`; };
        const btnSmall = (active) => ({padding:'5px 12px', borderRadius:'12px', cursor:'pointer', fontWeight:600, fontSize:'0.78rem', border: active?'1px solid var(--accent-glow)':'1px solid var(--border-glass)', background:active?'var(--accent-glow)':'transparent', color:active?'#000':'var(--text-primary)', transition:'all 0.15s'});

        // Derived selectors
        const getPctValA = (name) => cmpType==='months' ? (cmpA && monthlyData ? (monthlyData.returns[name]?.[cmpA] ?? null) : null) : (cmpYearA != null ? (annualData.funds[name]?.[cmpYearA] ?? null) : null);
        const getPctValB = (name) => cmpType==='months' ? (cmpB && monthlyData ? (monthlyData.returns[name]?.[cmpB] ?? null) : null) : (cmpYearB != null ? (annualData.funds[name]?.[cmpYearB] ?? null) : null);
        const getEurA = () => cmpType==='months' ? (cmpA ? (ordersData?.monthly?.[cmpA] ?? null) : null) : (cmpYearA != null ? (ordersData?.yearly?.[cmpYearA] ?? null) : null);
        const getEurB = () => cmpType==='months' ? (cmpB ? (ordersData?.monthly?.[cmpB] ?? null) : null) : (cmpYearB != null ? (ordersData?.yearly?.[cmpYearB] ?? null) : null);
        const labelA = cmpType==='months' ? fmtYM(cmpA) : (cmpYearA != null ? String(cmpYearA) : '—');
        const labelB = cmpType==='months' ? fmtYM(cmpB) : (cmpYearB != null ? String(cmpYearB) : '—');
        const hasSelectionA = cmpType==='months' ? !!cmpA : cmpYearA != null;
        const hasSelectionB = cmpType==='months' ? !!cmpB : cmpYearB != null;
        const euros = (v) => v != null ? `€${Number(v).toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0})}` : '—';

        return (
            <div>
                {toolbar}

                {/* Mode toggles */}
                <div style={{display:'flex', gap:'16px', flexWrap:'wrap', marginBottom:'12px', alignItems:'center'}}>
                    <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                        <span style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginRight:'4px'}}>Agrupar:</span>
                        <button style={btnSmall(cmpType==='months')} onClick={()=>{setCmpType('months');setCmpYearA(null);setCmpYearB(null);}}>Meses</button>
                        <button style={btnSmall(cmpType==='years')} onClick={()=>{setCmpType('years');setCmpA('');setCmpB('');}}>Años</button>
                    </div>
                    <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                        <span style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginRight:'4px'}}>Mostrar:</span>
                        <button style={btnSmall(cmpMetric==='pct')} onClick={()=>setCmpMetric('pct')}>% Rentabilidad</button>
                    </div>
                </div>

                {/* Period selectors */}
                {!monthlyData && cmpType==='months' && <div style={{padding:'0.5rem', color:'var(--text-secondary)', fontSize:'0.82rem'}}>Cargando datos mensuales...</div>}
                <div style={{display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'12px', alignItems:'center'}}>
                    {cmpType === 'months' ? (
                        <>
                            <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Periodo A:
                                <select value={cmpA} onChange={e => setCmpA(e.target.value)} style={{...selStyle, marginLeft:'6px'}}>
                                    <option value="">— elegir —</option>
                                    {[...availMonths].reverse().map(ym => <option key={ym} value={ym}>{fmtYM(ym)}</option>)}
                                </select>
                            </label>
                            <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Periodo B:
                                <select value={cmpB} onChange={e => setCmpB(e.target.value)} style={{...selStyle, marginLeft:'6px'}}>
                                    <option value="">— elegir —</option>
                                    {[...availMonths].reverse().map(ym => <option key={ym} value={ym}>{fmtYM(ym)}</option>)}
                                </select>
                            </label>
                        </>
                    ) : (
                        <>
                            <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Año A:
                                <select value={cmpYearA ?? ''} onChange={e => setCmpYearA(e.target.value ? Number(e.target.value) : null)} style={{...selStyle, marginLeft:'6px'}}>
                                    <option value="">— elegir —</option>
                                    {[...annualData.years].reverse().map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </label>
                            <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Año B:
                                <select value={cmpYearB ?? ''} onChange={e => setCmpYearB(e.target.value ? Number(e.target.value) : null)} style={{...selStyle, marginLeft:'6px'}}>
                                    <option value="">— elegir —</option>
                                    {[...annualData.years].reverse().map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </label>
                        </>
                    )}
                </div>

                {/* Data table — pct mode */}
                {cmpMetric === 'pct' && (hasSelectionA || hasSelectionB) && (
                    <div style={{overflowX:'auto'}}>
                        <table style={{borderCollapse:'separate', borderSpacing:'3px', fontSize:'0.78rem', width:'100%'}}>
                            <thead>
                                <tr>
                                    <th style={{textAlign:'left', padding:'6px 10px', color:'var(--text-secondary)', fontWeight:600, position:'sticky', left:0, background:'var(--bg-primary)', zIndex:2}}>Fondo</th>
                                    {hasSelectionA && <th style={{textAlign:'center', padding:'6px 8px', color:'#4AA2AF', fontWeight:700, minWidth:'75px'}}>{labelA}</th>}
                                    {hasSelectionB && <th style={{textAlign:'center', padding:'6px 8px', color:'#a78bfa', fontWeight:700, minWidth:'75px'}}>{labelB}</th>}
                                    {hasSelectionA && hasSelectionB && <th style={{textAlign:'center', padding:'6px 8px', color:'var(--text-secondary)', fontWeight:600, minWidth:'65px'}}>Δ (A−B)</th>}
                                    {hasSelectionA && hasSelectionB && <th style={{textAlign:'center', padding:'6px 8px', color:'var(--text-secondary)', fontWeight:600, minWidth:'65px'}}>%Δ</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {orderedFunds.map(name => {
                                    const isPortfolio = name.includes('Mi Cartera');
                                    const vA = getPctValA(name), vB = getPctValB(name);
                                    const delta = vA != null && vB != null ? +(vA - vB).toFixed(2) : null;
                                    const pctDelta = vB != null && Math.abs(vB) > 0.01 && delta != null ? (delta / Math.abs(vB) * 100) : null;
                                    return (
                                        <tr key={name} style={{borderBottom: isPortfolio ? '2px solid rgba(255,215,0,0.18)' : 'none'}}>
                                            <td style={{padding:'5px 10px', fontWeight: isPortfolio?800:500, color: isPortfolio?'#FFD700':'var(--text-primary)', position:'sticky', left:0, background:'var(--bg-primary)', zIndex:1, maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={name}>{isPortfolio ? '📊 ' : ''}{name.substring(0,28)}</td>
                                            {hasSelectionA && <td><div style={heatCellStyle(vA, isPortfolio)}>{vA != null ? `${vA>=0?'+':''}${vA.toFixed(1)}%` : '—'}</div></td>}
                                            {hasSelectionB && <td><div style={heatCellStyle(vB, isPortfolio)}>{vB != null ? `${vB>=0?'+':''}${vB.toFixed(1)}%` : '—'}</div></td>}
                                            {hasSelectionA && hasSelectionB && <td><div style={{...heatCellStyle(delta, false), borderLeft:'1px solid rgba(255,255,255,0.1)'}}>{delta != null ? `${delta>=0?'+':''}${delta.toFixed(1)}pp` : '—'}</div></td>}
                                            {hasSelectionA && hasSelectionB && <td><div style={{padding:'6px 8px', textAlign:'center', fontSize:'0.75rem', color: pctDelta == null ? 'var(--text-secondary)' : pctDelta > 0 ? 'var(--success)' : pctDelta < 0 ? 'var(--danger)' : 'var(--text-secondary)'}}>{pctDelta != null ? `${pctDelta>=0?'+':''}${pctDelta.toFixed(0)}%` : '—'}</div></td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {cmpMetric === 'pct' && !hasSelectionA && !hasSelectionB && <div style={{padding:'1rem', color:'var(--text-secondary)', fontSize:'0.85rem'}}>Selecciona dos períodos para comparar la rentabilidad de cada fondo.</div>}
                {legend}
            </div>
        );
    }
    return null;
};

const EvolutionTab = ({ rawData }) => {
    const [historyBatch, setHistoryBatch] = useState(null);
    const [correlationMatrix, setCorrelationMatrix] = useState(null);
    const [activeFunds, setActiveFunds] = useState([]);
    const [timeframe, setTimeframe] = useState('3Y');
    const [customRange, setCustomRange] = useState({ from: '', to: '' });
    const [showCustom, setShowCustom] = useState(false);
    const [lastDate, setLastDate] = useState(null);
    const [loading, setLoading] = useState(true);

    // External funds (not in portfolio) added by the user for comparison
    const [extraFunds, setExtraFunds] = useState({}); // { displayName: [{date, price}] }
    const [extSearch, setExtSearch] = useState('');
    const [extResults, setExtResults] = useState([]);
    const [extSearching, setExtSearching] = useState(false);
    const [extLoading, setExtLoading] = useState(false); // loading NAV for selected fund
    const extDebounceRef = React.useRef(null);

    const handleExtSearch = (q) => {
        setExtSearch(q);
        if (extDebounceRef.current) clearTimeout(extDebounceRef.current);
        if (q.length < 2) { setExtResults([]); return; }
        extDebounceRef.current = setTimeout(() => {
            setExtSearching(true);
            fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(q)}&limit=10`)
                .then(r => r.json())
                .then(res => { setExtResults(res); setExtSearching(false); })
                .catch(() => setExtSearching(false));
        }, 300);
    };

    const addExternalFund = (fund) => {
        const displayName = fund.name ? `${fund.name.substring(0, 28)} [${fund.isin}]` : fund.isin;
        setExtSearch('');
        setExtResults([]);
        if (extraFunds[displayName]) {
            // Already added — just activate
            if (!activeFunds.includes(displayName)) setActiveFunds(prev => [...prev, displayName]);
            return;
        }
        setExtLoading(true);
        fetch(`/api/portfolio/fund/${fund.isin}/nav_history?years=10`)
            .then(r => r.json())
            .then(history => {
                if (!Array.isArray(history) || history.length === 0) return;
                setExtraFunds(prev => ({ ...prev, [displayName]: history }));
                setActiveFunds(prev => [...prev, displayName]);
            })
            .catch(() => {})
            .finally(() => setExtLoading(false));
    };

    const removeExtraFund = (name) => {
        setExtraFunds(prev => { const n = {...prev}; delete n[name]; return n; });
        setActiveFunds(prev => prev.filter(f => f !== name));
    };

    useEffect(() => {
        Promise.all([
            fetch('/api/portfolio/history_batch').then(r => r.json()),
            fetch('/api/portfolio/correlation').then(r => r.json()),
            fetch('/api/portfolio/last_update').then(r => r.json()),
        ]).then(([history, correlation, updateInfo]) => {
            setHistoryBatch(history);
            setCorrelationMatrix(correlation);
            setLastDate(updateInfo.last_date);
            // Sort keys: portfolio line first, then the rest
            const fundKeys = Object.keys(history);
            const portfolioKey = fundKeys.find(k => k.includes('Mi Cartera'));
            const regularFunds = fundKeys.filter(k => !k.includes('Mi Cartera'));
            // Select portfolio + first 4 funds by default
            const defaultActive = [];
            if (portfolioKey) defaultActive.push(portfolioKey);
            defaultActive.push(...regularFunds.slice(0, 4));
            setActiveFunds(defaultActive);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, [rawData]);

    // Merged historyBatch including external funds
    const mergedHistory = React.useMemo(() => {
        if (!historyBatch) return null;
        if (Object.keys(extraFunds).length === 0) return historyBatch;
        return { ...historyBatch, ...extraFunds };
    }, [historyBatch, extraFunds]);

    // Sort fund keys: portfolio first, then by portfolio weight (from rawData)
    const allKeys = mergedHistory ? Object.keys(mergedHistory) : [];
    const portfolioKey = allKeys.find(k => k.includes('Mi Cartera'));
    const weightMap = React.useMemo(() => {
        const map = {};
        if (rawData && rawData.funds) {
            rawData.funds.forEach(f => { if (f.Fondo) map[f.Fondo] = f.Porcentaje || 0; });
        }
        return map;
    }, [rawData]);
    const extraFundKeys = Object.keys(extraFunds);
    const regularFunds = allKeys
        .filter(k => !k.includes('Mi Cartera') && !extraFundKeys.includes(k))
        .sort((a, b) => (weightMap[b] || 0) - (weightMap[a] || 0));
    const allFunds = portfolioKey
        ? [portfolioKey, ...regularFunds, ...extraFundKeys]
        : [...regularFunds, ...extraFundKeys];

    // MSCI World proxy key for Alpha/Beta calculation
    const MSCI_KEYWORDS = ['msci world', 'world index'];
    const benchmarkKey = regularFunds.find(k => MSCI_KEYWORDS.some(kw => k.toLowerCase().includes(kw))) || null;

    // Build stable color map before any early returns (Rules of Hooks)
    const fundColorMap = React.useMemo(() => {
        const map = {};
        allFunds.forEach((f, i) => {
            if (f.includes('Mi Cartera')) {
                map[f] = '#FFD700';
            } else if (extraFundKeys.includes(f)) {
                // Distinct palette offset for external funds
                map[f] = COLORS[(regularFunds.length + extraFundKeys.indexOf(f)) % COLORS.length];
            } else {
                map[f] = COLORS[i % COLORS.length];
            }
        });
        return map;
    }, [allFunds.join(',')]);

    // Compute client-side correlation BEFORE early returns (Rules of Hooks)
    const clientCorrelation = React.useMemo(() => {
        if (!mergedHistory || activeFunds.length < 2) return null;
        const { start, end } = getDateRange(showCustom ? null : timeframe, showCustom ? customRange : null);
        return computeClientCorrelation(mergedHistory, activeFunds, start, end);
    }, [mergedHistory, activeFunds.join(','), timeframe, showCustom, customRange.from, customRange.to]);

    if (loading) return (
        <div style={{padding:'3rem', textAlign:'center'}}>
            <div className="spinner" style={{margin:'0 auto 1rem'}}></div>
            <span style={{color:'var(--text-secondary)'}}>Cargando datos históricos...</span>
        </div>
    );

    if (!historyBatch || Object.keys(historyBatch).length === 0) return (
        <div style={{padding:'2rem', textAlign:'center', color:'var(--text-secondary)'}}>
            No hay datos históricos disponibles. Pulsa "Recalcular Cotizaciones" para generar los datos.
        </div>
    );

    // Include Mi Cartera in correlation — all active funds
    const corrFunds = activeFunds;
    const timeframes = ['1M', '3M', 'YTD', '1Y', '3Y', '5Y', '10Y', 'MAX'];

    const handleTimeframeClick = (tf) => {
        setTimeframe(tf);
        setShowCustom(false);
        setCustomRange({ from: '', to: '' });
    };

    return (
        <div>
            {/* Last data date indicator */}
            {lastDate && (
                <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'1rem', padding:'8px 14px', background:'rgba(74,162,175,0.1)', borderRadius:'8px', border:'1px solid rgba(74,162,175,0.2)'}}>
                    <span style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>📊 Último dato:</span>
                    <span style={{fontSize:'0.85rem', fontWeight:700, color:'var(--accent-glow)'}}>{lastDate}</span>
                </div>
            )}

            {/* Controls panel */}
            <div className="glass-panel" style={{padding:'1rem', marginBottom:'1rem'}}>
                <div style={{display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center'}}>
                    <strong style={{marginRight:'6px', fontSize:'0.85rem'}}>Periodo:</strong>
                    {timeframes.map(tf => (
                        <button key={tf} onClick={() => handleTimeframeClick(tf)} style={{
                            padding:'5px 14px', borderRadius:'20px',
                            border: timeframe === tf && !showCustom ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)',
                            background: timeframe === tf && !showCustom ? 'var(--accent-glow)' : 'transparent',
                            color: timeframe === tf && !showCustom ? '#000': 'var(--text-primary)',
                            cursor:'pointer', fontWeight:600, fontSize:'0.8rem', transition:'all 0.15s'
                        }}>
                            {tf}
                        </button>
                    ))}
                    <button onClick={() => setShowCustom(!showCustom)} style={{
                        padding:'5px 14px', borderRadius:'20px',
                        border: showCustom ? '1px solid var(--accent-secondary)' : '1px solid var(--border-glass)',
                        background: showCustom ? 'var(--accent-secondary)' : 'transparent',
                        color: showCustom ? '#000' : 'var(--text-primary)',
                        cursor:'pointer', fontWeight:600, fontSize:'0.8rem', transition:'all 0.15s'
                    }}>
                        Personalizado
                    </button>
                </div>

                {/* Custom date range */}
                {showCustom && (
                    <div style={{display:'flex', gap:'12px', marginTop:'10px', paddingTop:'10px', borderTop:'1px solid rgba(255,255,255,0.08)', alignItems:'center', flexWrap:'wrap'}}>
                        <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Desde:
                            <input type="date" value={customRange.from} onChange={e => setCustomRange({...customRange, from: e.target.value})}
                                style={{marginLeft:'6px', padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.8rem'}} />
                        </label>
                        <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Hasta:
                            <input type="date" value={customRange.to} onChange={e => setCustomRange({...customRange, to: e.target.value})}
                                style={{marginLeft:'6px', padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.8rem'}} />
                        </label>
                    </div>
                )}

                <div style={{display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'10px', paddingTop:'10px', borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                    <strong style={{marginRight:'6px', fontSize:'0.85rem', alignSelf:'center'}}>Fondos:</strong>
                    <button onClick={() => setActiveFunds(allFunds)} style={{padding:'3px 10px', borderRadius:'12px', border:'1px solid var(--border-glass)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer', fontSize:'0.72rem'}}>Todos</button>
                    <button onClick={() => setActiveFunds([])} style={{padding:'3px 10px', borderRadius:'12px', border:'1px solid var(--border-glass)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer', fontSize:'0.72rem'}}>Ninguno</button>
                    {/* dedicated📊 Mi Cartera Actual toggle */}
                    {portfolioKey && (
                        <button onClick={() => {
                            const isActive = activeFunds.includes(portfolioKey);
                            setActiveFunds(isActive ? activeFunds.filter(f => f !== portfolioKey) : [portfolioKey, ...activeFunds]);
                        }} style={{
                            padding:'4px 14px', borderRadius:'20px', cursor:'pointer', fontWeight:700, fontSize:'0.8rem', transition:'all 0.15s',
                            border: activeFunds.includes(portfolioKey) ? '2px solid #FFD700' : '1px solid rgba(255,215,0,0.4)',
                            background: activeFunds.includes(portfolioKey) ? 'rgba(255,215,0,0.18)' : 'transparent',
                            color: activeFunds.includes(portfolioKey) ? '#FFD700' : 'rgba(255,215,0,0.6)',
                            boxShadow: activeFunds.includes(portfolioKey) ? '0 0 10px rgba(255,215,0,0.3)' : 'none'
                        }}>📊 Mi Cartera Actual</button>
                    )}
                    {regularFunds.map(fund => {
                        const isActive = activeFunds.includes(fund);
                        const fundColor = fundColorMap[fund] || COLORS[0];
                        return (
                            <label key={fund} style={{
                                display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', fontSize:'0.8rem',
                                background: isActive ? fundColor + '15' : 'rgba(255,255,255,0.03)',
                                padding:'4px 10px', borderRadius:'8px',
                                border: isActive ? `1px solid ${fundColor}50` : '1px solid transparent',
                                transition:'all 0.15s'
                            }}>
                                <input type="checkbox" checked={isActive} onChange={(e) => {
                                    if(e.target.checked) setActiveFunds([...activeFunds, fund]);
                                    else setActiveFunds(activeFunds.filter(f => f !== fund));
                                }} style={{accentColor: fundColor}} />
                                <span style={{color: isActive ? fundColor : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400}}>{fund.substring(0, 24)}</span>
                            </label>
                        );
                    })}
                    {/* Extra (external) funds */}
                    {extraFundKeys.map(name => {
                        const isActive = activeFunds.includes(name);
                        const fundColor = fundColorMap[name] || '#a78bfa';
                        return (
                            <div key={name} style={{
                                display:'flex', alignItems:'center', gap:'4px', fontSize:'0.8rem',
                                background: isActive ? fundColor + '18' : 'rgba(167,139,250,0.06)',
                                padding:'4px 8px', borderRadius:'8px',
                                border: isActive ? `1px solid ${fundColor}60` : '1px solid rgba(167,139,250,0.25)',
                                transition:'all 0.15s'
                            }}>
                                <input type="checkbox" checked={isActive} onChange={e => {
                                    if (e.target.checked) setActiveFunds(prev => [...prev, name]);
                                    else setActiveFunds(prev => prev.filter(f => f !== name));
                                }} style={{accentColor: fundColor}} />
                                <span style={{color: isActive ? fundColor : 'rgba(167,139,250,0.7)', fontWeight: isActive ? 600 : 400, maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={name}>{name.substring(0, 30)}</span>
                                <span style={{fontSize:'0.65rem', padding:'1px 6px', borderRadius:'8px', background:'rgba(167,139,250,0.15)', color:'#a78bfa', whiteSpace:'nowrap'}}>ext</span>
                                <button onClick={() => removeExtraFund(name)} title="Eliminar fondo externo" style={{background:'none', border:'none', cursor:'pointer', color:'rgba(255,100,100,0.7)', fontSize:'0.85rem', lineHeight:1, padding:'0 2px'}}>×</button>
                            </div>
                        );
                    })}
                </div>

                {/* Add external fund search */}
                <div style={{marginTop:'10px', paddingTop:'10px', borderTop:'1px solid rgba(255,255,255,0.08)', display:'flex', gap:'10px', alignItems:'flex-start', flexWrap:'wrap'}}>
                    <div style={{position:'relative', flex:'1 1 260px'}}>
                        <input
                            type="text"
                            value={extSearch}
                            onChange={e => handleExtSearch(e.target.value)}
                            placeholder="➕ Añadir fondo externo (ISIN o nombre)..."
                            style={{width:'100%', padding:'7px 12px', borderRadius:'8px', border:'1px solid rgba(167,139,250,0.4)', background:'rgba(167,139,250,0.06)', color:'white', fontSize:'0.82rem', boxSizing:'border-box'}}
                        />
                        {extSearching && <span style={{position:'absolute', right:'10px', top:'8px', fontSize:'0.72rem', color:'#a78bfa'}}>Buscando...</span>}
                        {extLoading && <span style={{position:'absolute', right:'10px', top:'8px', fontSize:'0.72rem', color:'#a78bfa'}}>Cargando...</span>}
                        {extResults.length > 0 && (
                            <div style={{position:'absolute', top:'100%', left:0, right:0, zIndex:200, maxHeight:'240px', overflowY:'auto', background:'rgba(15,20,35,0.98)', border:'1px solid rgba(167,139,250,0.4)', borderRadius:'0 0 8px 8px', boxShadow:'0 8px 32px rgba(0,0,0,0.6)'}}>
                                {extResults.map(r => (
                                    <div key={r.isin} onClick={() => addExternalFund(r)}
                                        style={{padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', justifyContent:'space-between', alignItems:'center', transition:'background 0.15s'}}
                                        onMouseEnter={e => e.currentTarget.style.background='rgba(167,139,250,0.15)'}
                                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                        <div>
                                            <div style={{fontWeight:600, fontSize:'0.82rem', color:'#a78bfa'}}>{r.isin}</div>
                                            <div style={{fontSize:'0.72rem', color:'var(--text-secondary)', maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.name}</div>
                                        </div>
                                        {r.in_portfolio
                                            ? <span style={{fontSize:'0.68rem', padding:'2px 7px', background:'rgba(74,162,175,0.2)', borderRadius:'10px', color:'var(--accent-glow)'}}>En cartera</span>
                                            : <span style={{fontSize:'0.68rem', padding:'2px 7px', background:'rgba(167,139,250,0.15)', borderRadius:'10px', color:'#a78bfa'}}>Añadir</span>
                                        }
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div style={{fontSize:'0.75rem', color:'rgba(167,139,250,0.6)', alignSelf:'center', flex:'0 0 auto'}}>
                        Compara fondos externos sin modificar tu cartera
                    </div>
                </div>
            </div>

            {/* Chart */}
            <h3 style={{marginBottom:'0.5rem', fontWeight:600, display:'flex', alignItems:'center', gap:'8px'}}>
                Crecimiento Porcentual Acumulado
                <span style={{fontSize:'0.75rem', color:'var(--text-secondary)', fontWeight:400}}>(base 100 al inicio del periodo)</span>
            </h3>
            <InteractiveChart datasets={mergedHistory} timeframe={timeframe} activeFunds={activeFunds} customRange={showCustom ? customRange : null} fundColorMap={fundColorMap} />

            {/* Per-fund metrics for selected period */}
            <h3 style={{marginTop:'2.5rem', marginBottom:'0.5rem', fontWeight:600}}>
                Métricas del Periodo
                <span style={{fontSize:'0.75rem', color:'var(--text-secondary)', fontWeight:400, marginLeft:'8px'}}>calculadas sobre la selección temporal activa · click en cabecera para ordenar</span>
            </h3>
            <div className="glass-panel" style={{padding:'1rem', overflowX:'auto'}}>
                <FundMetricsTable historyBatch={mergedHistory} activeFunds={activeFunds} timeframe={timeframe} customRange={showCustom ? customRange : {from:'', to:''}} fundColorMap={fundColorMap} benchmarkKey={benchmarkKey} />
            </div>

            {/* Finect comparador link */}
            {activeFunds.length >= 2 && (() => {
                const isinList = activeFunds
                    .map(f => {
                        // Portfolio fund: match by name
                        const fund = rawData && rawData.funds ? rawData.funds.find(x => x.Fondo === f) : null;
                        if (fund) return fund.ISIN;
                        // External fund display name format: "name [ISIN]"
                        const m = f.match(/\[([A-Z0-9]{12})\]$/);
                        if (m) return m[1];
                        // Raw ISIN (12 chars)
                        if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(f)) return f;
                        return null;
                    })
                    .filter(Boolean);
                if (isinList.length < 2) return null;
                const url = `https://www.finect.com/fondos-inversion/comparador?products=${isinList.join(',')}`;
                return (
                    <div style={{display:'flex', justifyContent:'flex-end', marginTop:'1rem', marginBottom:'0.5rem'}}>
                        <a href={url} target="_blank" rel="noreferrer"
                           style={{padding:'7px 14px', background:'rgba(74,162,175,0.15)', borderRadius:'8px', border:'1px solid rgba(74,162,175,0.3)', color:'var(--accent-glow)', fontSize:'0.82rem', textDecoration:'none', display:'flex', alignItems:'center', gap:'6px'}}>
                            🔗 Comparar fondos seleccionados en Finect ({isinList.length})
                        </a>
                    </div>
                );
            })()}

            {/* Correlation */}
            <h3 style={{marginTop:'2.5rem', marginBottom:'0.5rem', fontWeight:600}}>Matriz de Correlación de Pearson</h3>
            <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', marginBottom:'0.5rem'}}>
                Valores cercanos a <span style={{color:'hsl(120,80%,40%)'}}>+1 (verde)</span> = fondos se mueven juntos.
                Valores cercanos a <span style={{color:'hsl(0,80%,50%)'}}>-1 (rojo)</span> = descorrelacionados (protegen tu cartera).
                <span style={{marginLeft:'8px', fontSize:'0.78rem', opacity:0.7}}>Calculada sobre el periodo seleccionado, incluye Mi Cartera.</span>
            </p>
            <div className="glass-panel" style={{padding:'1rem', overflowX:'auto'}}>
                {clientCorrelation && clientCorrelation.labels && clientCorrelation.labels.length > 1 ? (
                    <HeatmapRenderer data={clientCorrelation} activeFunds={corrFunds} />
                ) : (
                    <div style={{padding:'1rem', color:'var(--text-secondary)', textAlign:'center'}}>
                        Datos insuficientes para la correlación en este periodo. Selecciona más fondos o amplía el rango.
                    </div>
                )}
            </div>

            {/* Annual Returns Heatmap */}
            <h3 style={{marginTop:'2.5rem', marginBottom:'0.5rem', fontWeight:600}}>
                Calendario de Rentabilidades Anuales
                <span style={{fontSize:'0.75rem', color:'var(--text-secondary)', fontWeight:400, marginLeft:'8px'}}>retorno por año natural (precio cierre enero → precio cierre diciembre)</span>
            </h3>
            <div className="glass-panel" style={{padding:'1rem', overflowX:'auto'}}>
                <AnnualReturnsHeatmap rawData={rawData} />
            </div>
        </div>
    );
};


// ---------------- TAB 4: Simulador ----------------

const AnadirFondoTab = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedFund, setSelectedFund] = useState(null);
    const [amount, setAmount] = useState('');
    const [simulation, setSimulation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [fundDetail, setFundDetail] = useState(null);
    const [simTimeframe, setSimTimeframe] = useState('MAX');
    const [simCustomRange, setSimCustomRange] = useState({ from: '', to: '' });
    const [showSimCustom, setShowSimCustom] = useState(false);
    const debounceRef = React.useRef(null);

    const handleSearch = (query) => {
        setSearchQuery(query);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (query.length < 2) { setSearchResults([]); return; }
        debounceRef.current = setTimeout(() => {
            setSearching(true);
            fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(query)}&limit=15`)
                .then(r => r.json())
                .then(results => { setSearchResults(results); setSearching(false); })
                .catch(() => setSearching(false));
        }, 300);
    };

    const selectFund = (fund) => {
        setSelectedFund(fund);
        setSearchQuery(fund.isin);
        setSearchResults([]);
        // Cargar detalle del fondo
        fetch(`/api/portfolio/fund/${fund.isin}/details`)
            .then(r => r.json())
            .then(detail => setFundDetail(detail))
            .catch(() => {});
    };

    const runSimulation = () => {
        if (!selectedFund || !amount || parseFloat(amount) <= 0) return;
        setLoading(true);
        fetch('/api/portfolio/simulate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ isin: selectedFund.isin, amount: parseFloat(amount) })
        })
            .then(r => r.json())
            .then(result => { setSimulation(result); setLoading(false); })
            .catch(() => setLoading(false));
    };

    const signColor = (v) => v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text-primary)';
    const riskColor = (v) => v < 10 ? 'var(--success)' : v < 20 ? 'var(--warning)' : 'var(--danger)';
    const drawdownColor = (v) => v < 10 ? 'var(--success)' : v < 20 ? 'var(--warning)' : 'var(--danger)';

    const simAnalysis = useMemo(() => {
        if (!simulation) return null;

        const currentKey = '📊 Cartera actual';
        const fundKey = simulation.added_name || simulation.added_isin || 'Fondo seleccionado';
        const simulatedKey = '📈 Cartera actualizada';

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
            datasets[simulatedKey] || [],
        );

        const activeCorrelationFunds = [currentKey, fundKey, simulatedKey]
            .filter(key => (datasets[key] || []).length > 5);
        const correlation = activeCorrelationFunds.length >= 2
            ? computeClientCorrelation(datasets, activeCorrelationFunds, start, end)
            : null;

        return {
            currentKey,
            fundKey,
            simulatedKey,
            datasets,
            activeFunds: Object.keys(datasets),
            colorMap: {
                [currentKey]: '#FFD700',
                [fundKey]: '#FF8C00',
                [simulatedKey]: '#4ADE80',
            },
            metrics: {
                current: currentMetrics,
                fund: fundMetrics,
                simulated: simulatedMetrics,
            },
            periodReturns: periodReturns.length > 0 ? periodReturns : (simulation.period_returns || []),
            correlation,
        };
    }, [simulation, simTimeframe, showSimCustom, simCustomRange.from, simCustomRange.to]);

    const renderMetricComparison = (label, current, fund, simulated, colorFn, suffix = '', decimals = 2) => {
        const currentValue = numberOrNull(current);
        const fundValue = numberOrNull(fund);
        const simulatedValue = numberOrNull(simulated);
        if (currentValue == null && fundValue == null && simulatedValue == null) return null;
        const diff = (currentValue != null && simulatedValue != null) ? simulatedValue - currentValue : null;
        const formatValue = (value) => value != null ? `${value.toFixed(decimals)}${suffix}` : '—';
        return (
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderBottom:'1px solid rgba(255,255,255,0.05)', fontSize:'0.85rem'}}>
                <span style={{color:'var(--text-secondary)', flex:1}}>{label}</span>
                <span style={{flex:1, textAlign:'center', fontWeight:600, color: colorFn && currentValue != null ? colorFn(currentValue) : 'var(--text-primary)', fontVariantNumeric:'tabular-nums'}}>
                    {formatValue(currentValue)}
                </span>
                <span style={{flex:1, textAlign:'center', fontWeight:600, color: colorFn && fundValue != null ? colorFn(fundValue) : 'var(--text-primary)', fontVariantNumeric:'tabular-nums'}}>
                    {formatValue(fundValue)}
                </span>
                <span style={{flex:1, textAlign:'center', fontWeight:600, color: colorFn && simulatedValue != null ? colorFn(simulatedValue) : 'var(--text-primary)', fontVariantNumeric:'tabular-nums'}}>
                    {formatValue(simulatedValue)}
                </span>
                <span style={{flex:'0 0 90px', textAlign:'right', fontWeight:700, fontSize:'0.8rem', color: diff !== null ? (diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text-secondary)') : 'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>
                    {diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(decimals)}${suffix}` : '—'}
                </span>
            </div>
        );
    };

    return (
        <div>
            <div className="glass-panel" style={{padding:'2rem', marginBottom:'1.5rem'}}>
                <h3 style={{marginBottom:'1rem', fontWeight:600}}>🧪 Simulador de Aportaciones</h3>
                <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', marginBottom:'1.5rem'}}>
                    Busca cualquier fondo disponible en Finect, selecciona una cantidad a añadir y visualiza cómo cambiarían las métricas de tu cartera.
                </p>

                <div style={{display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end'}}>
                    {/* Search */}
                    <div style={{flex:'1 1 300px', position:'relative'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Buscar fondo (ISIN o nombre)</label>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => handleSearch(e.target.value)}
                            placeholder="Ej: IE00B4L5Y983 o msci world"
                            style={{width:'100%', padding:'10px 14px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.9rem'}}
                        />
                        {searching && <div style={{position:'absolute', right:'12px', top:'28px', color:'var(--accent-glow)', fontSize:'0.75rem'}}>Buscando...</div>}
                        {searchResults.length > 0 && (
                            <div style={{position:'absolute', top:'100%', left:0, right:0, zIndex:100, maxHeight:'300px', overflowY:'auto', background:'rgba(15,20,35,0.98)', border:'1px solid var(--border-glass)', borderRadius:'0 0 8px 8px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
                                {searchResults.map(r => (
                                    <div key={r.isin} onClick={() => selectFund(r)} style={{padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', justifyContent:'space-between', alignItems:'center', transition:'background 0.15s'}}
                                        onMouseEnter={e => e.currentTarget.style.background='rgba(74,162,175,0.15)'}
                                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                        <div>
                                            <div style={{fontWeight:600, fontSize:'0.85rem'}}>{r.isin}</div>
                                            <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', maxWidth:'280px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.name}</div>
                                        </div>
                                        {r.in_portfolio && <span style={{fontSize:'0.7rem', padding:'2px 8px', background:'rgba(74,162,175,0.2)', borderRadius:'10px', color:'var(--accent-glow)'}}>En cartera</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Amount */}
                    <div style={{flex:'0 0 180px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Cantidad (€)</label>
                        <input
                            type="number"
                            min="1"
                            step="100"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="1000"
                            style={{width:'100%', padding:'10px 14px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.9rem'}}
                        />
                    </div>

                    {/* Button */}
                    <button
                        onClick={runSimulation}
                        disabled={!selectedFund || !amount || loading}
                        style={{
                            padding:'10px 24px', height:'42px',
                            background: (!selectedFund || !amount) ? 'var(--border-glass)' : 'linear-gradient(135deg, var(--accent-glow), var(--accent-secondary))',
                            color:'white', border:'none', borderRadius:'8px', fontWeight:700, cursor: (!selectedFund || !amount) ? 'not-allowed' : 'pointer',
                            fontSize:'0.9rem', transition:'all 0.2s', boxShadow: selectedFund && amount ? '0 4px 16px rgba(66,153,225,0.3)' : 'none'
                        }}>
                        {loading ? 'Simulando...' : '🚀 Simular'}
                    </button>
                </div>
            </div>

            {/* Selected Fund Detail */}
            {fundDetail && selectedFund && (
                <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem'}}>
                        <h4 style={{margin:0, fontWeight:600}}>📋 {fundDetail.name || selectedFund.isin}</h4>
                        {selectedFund.isin && (
                            <a href={fundDetail.finect_url || selectedFund.url || `https://www.finect.com/fondos-inversion/${selectedFund.isin}`} target="_blank" rel="noreferrer"
                               style={{padding:'5px 12px', background:'rgba(74,162,175,0.15)', border:'1px solid rgba(74,162,175,0.3)', borderRadius:'6px', color:'var(--accent-glow)', fontSize:'0.75rem', textDecoration:'none'}}>
                                🔗 Ver en Finect
                            </a>
                        )}
                    </div>
                    <div style={{display:'flex', gap:'12px', flexWrap:'wrap'}}>
                        {fundDetail.category && <span style={{padding:'4px 10px', background:'rgba(74,162,175,0.15)', borderRadius:'6px', fontSize:'0.8rem', color:'var(--accent-glow)'}}>{fundDetail.category}</span>}
                        {fundDetail.management_company && <span style={{padding:'4px 10px', background:'rgba(160,130,210,0.15)', borderRadius:'6px', fontSize:'0.8rem', color:'var(--accent-secondary)'}}>{fundDetail.management_company}</span>}
                        {fundDetail.srri && <span style={{padding:'4px 10px', background:'rgba(255,255,255,0.08)', borderRadius:'6px', fontSize:'0.8rem'}}>SRRI: {fundDetail.srri}/7</span>}
                        {fundDetail.expense_ratio != null && <span style={{padding:'4px 10px', background:'rgba(255,255,255,0.08)', borderRadius:'6px', fontSize:'0.8rem'}}>TER: {fundDetail.expense_ratio}%</span>}
                    </div>
                    {fundDetail.metrics && (
                        <div style={{display:'flex', gap:'10px', flexWrap:'wrap', marginTop:'12px', paddingTop:'12px', borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                            {fundDetail.metrics.sharpe_ratio != null && <div style={{textAlign:'center', padding:'6px 12px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>SHARPE</div><div style={{fontWeight:700, color:signColor(fundDetail.metrics.sharpe_ratio)}}>{fundDetail.metrics.sharpe_ratio.toFixed(2)}</div></div>}
                            {fundDetail.metrics.alpha != null && <div style={{textAlign:'center', padding:'6px 12px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>ALPHA</div><div style={{fontWeight:700, color:signColor(fundDetail.metrics.alpha)}}>{fundDetail.metrics.alpha.toFixed(2)}</div></div>}
                            {fundDetail.metrics.beta != null && <div style={{textAlign:'center', padding:'6px 12px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>BETA</div><div style={{fontWeight:700}}>{fundDetail.metrics.beta.toFixed(2)}</div></div>}
                            {fundDetail.metrics.standard_deviation != null && <div style={{textAlign:'center', padding:'6px 12px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>VOLATILIDAD</div><div style={{fontWeight:700, color:riskColor(fundDetail.metrics.standard_deviation)}}>{fundDetail.metrics.standard_deviation.toFixed(2)}</div></div>}
                            {fundDetail.metrics.max_drawdown != null && <div style={{textAlign:'center', padding:'6px 12px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}><div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>MAX CAÍDA</div><div style={{fontWeight:700, color:'var(--danger)'}}>{fundDetail.metrics.max_drawdown.toFixed(2)}%</div></div>}
                        </div>
                    )}
                </div>
            )}

            {/* Simulation Results */}
            {simulation && (
                <div>
                    {/* Summary Cards */}
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'1rem', marginBottom:'1.5rem'}}>
                        <div className="glass-panel" style={{padding:'1rem', textAlign:'center'}}>
                            <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Cartera Actual</div>
                            <div style={{fontSize:'1.3rem', fontWeight:700, color:'var(--text-primary)'}}>€{simulation.current_total.toLocaleString('es-ES', {minimumFractionDigits:2})}</div>
                        </div>
                        <div className="glass-panel" style={{padding:'1rem', textAlign:'center'}}>
                            <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Aportación</div>
                            <div style={{fontSize:'1.3rem', fontWeight:700, color:'var(--accent-glow)'}}>+€{simulation.added_amount.toLocaleString('es-ES', {minimumFractionDigits:2})}</div>
                        </div>
                        <div className="glass-panel" style={{padding:'1rem', textAlign:'center'}}>
                            <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Cartera Actualizada</div>
                            <div style={{fontSize:'1.3rem', fontWeight:700, color:'var(--success)'}}>€{simulation.simulated_total.toLocaleString('es-ES', {minimumFractionDigits:2})}</div>
                        </div>
                    </div>

                    {/* Simulation Chart */}
                    {simAnalysis?.activeFunds?.length > 0 && (() => {
                        const SIM_TIMEFRAMES = ['1M','3M','YTD','1Y','3Y','5Y','10Y','MAX'];
                        return (
                            <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                                <h4 style={{marginBottom:'1rem', fontWeight:600}}>📉 Evolución Histórica (base 100)</h4>
                                {/* Period selector */}
                                <div style={{display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'1rem'}}>
                                    {SIM_TIMEFRAMES.map(tf => (
                                        <button key={tf} onClick={() => { setSimTimeframe(tf); setShowSimCustom(false); setSimCustomRange({from:'',to:''}); }} style={{
                                            padding:'4px 12px', borderRadius:'16px', cursor:'pointer', fontWeight:600, fontSize:'0.75rem',
                                            border: simTimeframe === tf && !showSimCustom ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)',
                                            background: simTimeframe === tf && !showSimCustom ? 'var(--accent-glow)' : 'transparent',
                                            color: simTimeframe === tf && !showSimCustom ? '#000' : 'var(--text-primary)',
                                            transition:'all 0.15s'
                                        }}>{tf}</button>
                                    ))}
                                    <button onClick={() => setShowSimCustom(!showSimCustom)} style={{
                                        padding:'4px 12px', borderRadius:'16px', cursor:'pointer', fontWeight:600, fontSize:'0.75rem',
                                        border: showSimCustom ? '1px solid var(--accent-secondary)' : '1px solid var(--border-glass)',
                                        background: showSimCustom ? 'var(--accent-secondary)' : 'transparent',
                                        color: showSimCustom ? '#000' : 'var(--text-primary)',
                                        transition:'all 0.15s'
                                    }}>Personalizado</button>
                                </div>
                                {showSimCustom && (
                                    <div style={{display:'flex', gap:'12px', marginBottom:'10px', alignItems:'center', flexWrap:'wrap'}}>
                                        <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Desde:
                                            <input type="date" value={simCustomRange.from} onChange={e => setSimCustomRange({...simCustomRange, from:e.target.value})}
                                                style={{marginLeft:'6px', padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.8rem'}} />
                                        </label>
                                        <label style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Hasta:
                                            <input type="date" value={simCustomRange.to} onChange={e => setSimCustomRange({...simCustomRange, to:e.target.value})}
                                                style={{marginLeft:'6px', padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.8rem'}} />
                                        </label>
                                    </div>
                                )}
                                <InteractiveChart
                                    datasets={simAnalysis.datasets}
                                    timeframe={simTimeframe}
                                    activeFunds={simAnalysis.activeFunds}
                                    customRange={showSimCustom ? simCustomRange : null}
                                    fundColorMap={simAnalysis.colorMap}
                                />
                            </div>
                        );
                    })()}

                    {/* Period Returns Table */}
                    {simAnalysis?.periodReturns?.length > 0 && (
                        <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                            <h4 style={{marginBottom:'1rem', fontWeight:600}}>📅 Rentabilidad por Período</h4>
                            <div style={{overflowX:'auto'}}>
                                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85rem'}}>
                                    <thead>
                                        <tr style={{borderBottom:'2px solid rgba(255,255,255,0.1)'}}>
                                            <th style={{textAlign:'left', padding:'8px 12px', color:'var(--text-secondary)', fontWeight:600, fontSize:'0.75rem', textTransform:'uppercase'}}>Período</th>
                                            <th style={{textAlign:'center', padding:'8px 12px', color:'#FFD700', fontWeight:600, fontSize:'0.75rem', textTransform:'uppercase'}}>Cartera actual</th>
                                            <th style={{textAlign:'center', padding:'8px 12px', color:'#FF8C00', fontWeight:600, fontSize:'0.75rem', textTransform:'uppercase'}}>{String(simulation.added_name || simulation.added_isin).substring(0,22)}</th>
                                            <th style={{textAlign:'center', padding:'8px 12px', color:'#4ADE80', fontWeight:600, fontSize:'0.75rem', textTransform:'uppercase'}}>Cartera actualizada</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {simAnalysis.periodReturns.map((row, i) => {
                                            const fmtPct = (v) => v != null ? (
                                                <span style={{color: v >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:700}}>
                                                    {v >= 0 ? '+' : ''}{v.toFixed(1)}%{row.label.includes('Año') || row.label === 'Máx.' ? ' aa' : ''}
                                                </span>
                                            ) : <span style={{color:'var(--text-secondary)'}}>—</span>;
                                            const delta = (row.simulated != null && row.current != null) ? row.simulated - row.current : null;
                                            return (
                                                <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                                    <td style={{padding:'8px 12px', fontWeight:600}}>{row.label}</td>
                                                    <td style={{padding:'8px 12px', textAlign:'center', fontVariantNumeric:'tabular-nums'}}>{fmtPct(row.current)}</td>
                                                    <td style={{padding:'8px 12px', textAlign:'center', fontVariantNumeric:'tabular-nums'}}>{fmtPct(row.fund)}</td>
                                                    <td style={{padding:'8px 12px', textAlign:'center', fontVariantNumeric:'tabular-nums'}}>
                                                        {fmtPct(row.simulated)}
                                                        {delta != null && <span style={{fontSize:'0.72rem', color: delta >= 0 ? 'var(--success)' : 'var(--danger)', marginLeft:'6px'}}>({delta >= 0 ? '+' : ''}{delta.toFixed(2)}pp)</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Metrics Comparison Table */}
                    <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                        <h4 style={{marginBottom:'1rem', fontWeight:600}}>📈 Métricas del período seleccionado</h4>
                        <div style={{display:'flex', justifyContent:'space-between', padding:'8px 12px', borderBottom:'2px solid rgba(255,255,255,0.1)', fontSize:'0.75rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px'}}>
                            <span style={{flex:1}}>Métrica</span>
                            <span style={{flex:1, textAlign:'center'}}>Actual</span>
                            <span style={{flex:1, textAlign:'center'}}>Fondo</span>
                            <span style={{flex:1, textAlign:'center'}}>Actualizada</span>
                            <span style={{flex:'0 0 90px', textAlign:'right'}}>Δ vs actual</span>
                        </div>
                        {renderMetricComparison('Retorno total', simAnalysis?.metrics?.current?.totalReturn, simAnalysis?.metrics?.fund?.totalReturn, simAnalysis?.metrics?.simulated?.totalReturn, signColor, '%', 2)}
                        {renderMetricComparison('Rentabilidad anualizada', simAnalysis?.metrics?.current?.annReturn, simAnalysis?.metrics?.fund?.annReturn, simAnalysis?.metrics?.simulated?.annReturn, signColor, '%', 2)}
                        {renderMetricComparison('Volatilidad', simAnalysis?.metrics?.current?.vol, simAnalysis?.metrics?.fund?.vol, simAnalysis?.metrics?.simulated?.vol, riskColor, '%', 2)}
                        {renderMetricComparison('Sharpe ratio', simAnalysis?.metrics?.current?.sharpe, simAnalysis?.metrics?.fund?.sharpe, simAnalysis?.metrics?.simulated?.sharpe, signColor, '', 3)}
                        {renderMetricComparison('Máx. drawdown', simAnalysis?.metrics?.current?.maxDD, simAnalysis?.metrics?.fund?.maxDD, simAnalysis?.metrics?.simulated?.maxDD, drawdownColor, '%', 2)}
                    </div>

                    {simAnalysis?.correlation?.labels?.length > 1 && (
                        <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                            <h4 style={{marginBottom:'1rem', fontWeight:600}}>🔗 Correlación entre cartera actual, cartera actualizada y fondo</h4>
                            <HeatmapRenderer data={simAnalysis.correlation} activeFunds={simAnalysis.correlation.labels} />
                        </div>
                    )}

                    {/* Per-Fund Weight Changes */}
                    <div className="glass-panel" style={{padding:'1.5rem'}}>
                        <h4 style={{marginBottom:'1rem', fontWeight:600}}>⚖️ Cambio de Pesos en Cartera</h4>
                        <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                            {[...simulation.funds].sort((a,b) => b.simulated_weight - a.simulated_weight).map(fund => {
                                const isTarget = fund.isin === simulation.added_isin;
                                const weightDiff = fund.simulated_weight - fund.current_weight;
                                return (
                                    <div key={fund.isin} style={{display:'flex', alignItems:'center', gap:'12px', padding:'8px 12px', background: isTarget ? 'rgba(74,162,175,0.1)' : 'transparent', borderRadius:'8px', border: isTarget ? '1px solid rgba(74,162,175,0.3)' : '1px solid transparent'}}>
                                        <div style={{flex:1, minWidth:0}}>
                                            <div style={{fontWeight: isTarget ? 700 : 500, fontSize:'0.85rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                                                {isTarget && '➕ '}{fund.name}
                                            </div>
                                            <div style={{fontSize:'0.7rem', color:'var(--text-secondary)'}}>{fund.isin}</div>
                                        </div>
                                        <div style={{display:'flex', alignItems:'center', gap:'8px', fontVariantNumeric:'tabular-nums'}}>
                                            <span style={{fontSize:'0.8rem', color:'var(--text-secondary)', width:'60px', textAlign:'right'}}>{fund.current_weight.toFixed(1)}%</span>
                                            <span style={{color:'var(--text-secondary)'}}>→</span>
                                            <span style={{fontSize:'0.8rem', fontWeight:600, width:'60px', textAlign:'right'}}>{fund.simulated_weight.toFixed(1)}%</span>
                                            <span style={{fontSize:'0.75rem', fontWeight:700, width:'60px', textAlign:'right', color: weightDiff > 0 ? 'var(--success)' : weightDiff < 0 ? 'var(--danger)' : 'var(--text-secondary)'}}>
                                                {weightDiff >= 0 ? '+' : ''}{weightDiff.toFixed(2)}%
                                            </span>
                                        </div>
                                        {/* Mini weight bar */}
                                        <div style={{width:'100px', height:'6px', background:'var(--border-glass)', borderRadius:'3px', overflow:'hidden', position:'relative'}}>
                                            <div style={{height:'100%', width:`${fund.current_weight}%`, background:'rgba(255,255,255,0.2)', position:'absolute'}} />
                                            <div style={{height:'100%', width:`${fund.simulated_weight}%`, background: isTarget ? 'var(--accent-glow)' : 'var(--accent-secondary)', position:'absolute', opacity:0.8}} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// ---------------- TAB 4b: Rebalancear ----------------
// Reusable fund search input (same API as AnadirFondoTab)
const FundSearchInput = ({ onSelect, placeholder = 'ISIN o nombre del fondo', clearOnSelect = true }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const debRef = React.useRef(null);

    const handleChange = (val) => {
        setQuery(val);
        if (debRef.current) clearTimeout(debRef.current);
        if (val.length < 2) { setResults([]); return; }
        debRef.current = setTimeout(() => {
            setSearching(true);
            fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(val)}&limit=15`)
                .then(r => r.json())
                .then(res => { setResults(res); setSearching(false); })
                .catch(() => setSearching(false));
        }, 300);
    };

    const select = (fund) => {
        onSelect(fund);
        if (clearOnSelect) { setQuery(''); setResults([]); }
        else { setQuery(fund.isin); setResults([]); }
    };

    return (
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <input
                type="text"
                value={query}
                onChange={e => handleChange(e.target.value)}
                placeholder={placeholder}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)', color: 'white', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
            {searching && <div style={{ position: 'absolute', right: '10px', top: '9px', color: 'var(--accent-glow)', fontSize: '0.72rem', pointerEvents: 'none' }}>Buscando…</div>}
            {results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, maxHeight: '260px', overflowY: 'auto', background: 'rgba(15,20,35,0.98)', border: '1px solid var(--border-glass)', borderRadius: '0 0 8px 8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    {results.map(r => (
                        <div key={r.isin} onClick={() => select(r)}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,162,175,0.15)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.isin}</div>
                                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                            </div>
                            {r.in_portfolio && <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(74,162,175,0.2)', borderRadius: '10px', color: 'var(--accent-glow)' }}>En cartera</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const RebalancearTab = () => {
    const [positions, setPositions] = useState([]);
    const [loadingPos, setLoadingPos] = useState(true);
    const [transfers, setTransfers] = useState([]);
    const [fromISIN, setFromISIN] = useState('');
    const [toISIN, setToISIN] = useState('');
    const [toIsNew, setToIsNew] = useState(false);
    const [toNewFund, setToNewFund] = useState(null);   // { isin, name } from search
    const [amount, setAmount] = useState('');
    // "Añadir sin traspaso" state
    const [addFund, setAddFund] = useState(null);       // { isin, name } from search
    const [addAmount, setAddAmount] = useState('');

    useEffect(() => {
        fetch('/api/portfolio/positions')
            .then(r => r.json())
            .then(data => {
                setPositions(data.positions || []);
                setLoadingPos(false);
            }).catch(() => setLoadingPos(false));
    }, []);

    const [standaloneAdds, setStandaloneAdds] = useState([]);
    const [simResult, setSimResult] = useState(null);
    const [simLoading, setSimLoading] = useState(false);
    const [simError, setSimError] = useState(null);
    const [simTimeframe, setSimTimeframe] = useState('5Y');

    const totalPortfolio = positions.reduce((s, p) => s + (p.Valor_Actual || p.Capital_Invertido || 0), 0);

    // Compute balances after applying all transfers + standalone additions
    const computeResult = () => {
        const bal = {};
        positions.forEach(p => { bal[p.ISIN] = p.Valor_Actual || p.Capital_Invertido || 0; });
        transfers.forEach(t => {
            bal[t.fromISIN] = (bal[t.fromISIN] || 0) - t.amount;
            if (t.toISIN) bal[t.toISIN] = (bal[t.toISIN] || 0) + t.amount;
        });
        standaloneAdds.forEach(a => {
            bal[a.isin] = (bal[a.isin] || 0) + a.amount;
        });
        return bal;
    };

    const addTransfer = () => {
        const destISIN = toIsNew ? toNewFund?.isin : toISIN;
        const destName = toIsNew ? toNewFund?.name : (positions.find(p => p.ISIN === toISIN)?.Fondo || toISIN);
        if (!fromISIN || !destISIN || !amount || parseFloat(amount) <= 0) return;
        setTransfers(prev => [...prev, {
            id: Date.now(),
            fromISIN,
            fromName: positions.find(p => p.ISIN === fromISIN)?.Fondo || fromISIN,
            toISIN: destISIN,
            toName: destName,
            toIsNew,
            amount: parseFloat(amount)
        }]);
        setAmount('');
        if (toIsNew) setToNewFund(null);
    };

    const addStandalone = () => {
        if (!addFund || !addAmount || parseFloat(addAmount) <= 0) return;
        setStandaloneAdds(prev => [...prev, { id: Date.now(), isin: addFund.isin, name: addFund.name, amount: parseFloat(addAmount) }]);
        setAddFund(null);
        setAddAmount('');
    };

    const removeTransfer = (id) => setTransfers(prev => prev.filter(t => t.id !== id));
    const removeStandalone = (id) => setStandaloneAdds(prev => prev.filter(a => a.id !== id));

    const runHistoricalSimulation = () => {
        const existingISINs = new Set(positions.map(p => p.ISIN));
        const rawWeights = {};
        let wTotal = 0;
        Object.entries(result).forEach(([isin, bal]) => {
            if (existingISINs.has(isin) && bal > 0.01) { rawWeights[isin] = bal; wTotal += bal; }
        });
        if (wTotal <= 0) return;
        const weights = {};
        Object.keys(rawWeights).forEach(isin => { weights[isin] = rawWeights[isin] / wTotal; });
        setSimLoading(true); setSimError(null); setSimResult(null);
        fetch('/api/portfolio/rebalance', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ weights }),
        }).then(async r => {
            if (!r.ok) { const b = await r.json().catch(()=>({})); throw new Error(b.detail || 'Error'); }
            return r.json();
        }).then(res => { setSimResult(res); setSimLoading(false); })
          .catch(e => { setSimError(e.message); setSimLoading(false); });
    };

    const result = computeResult();
    const totalAfter = Object.values(result).reduce((s, v) => s + Math.max(v, 0), 0);

    // New funds introduced via transfers or standalone adds
    const newFundsFromTransfers = transfers
        .filter(t => t.toIsNew)
        .filter((t, i, arr) => arr.findIndex(x => x.toISIN === t.toISIN) === i)
        .map(t => ({ isin: t.toISIN, name: t.toName, isNew: true }));
    const newFundsFromStandalone = standaloneAdds
        .filter(a => !positions.find(p => p.ISIN === a.isin))
        .filter((a, i, arr) => arr.findIndex(x => x.isin === a.isin) === i)
        .map(a => ({ isin: a.isin, name: a.name, isNew: true }));

    const allFunds = [
        ...positions.map(p => ({ isin: p.ISIN, name: p.Fondo, isNew: false })),
        ...newFundsFromTransfers,
        ...newFundsFromStandalone
    ].filter((f, i, arr) => arr.findIndex(x => x.isin === f.isin) === i);

    const hasErrors = Object.entries(result).some(([, v]) => v < -0.01);
    const hasChanges = transfers.length > 0 || standaloneAdds.length > 0;

    const inputStyle = { padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)', color: 'white', fontSize: '0.85rem' };

    return (
        <div>
            {/* Current positions */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.25rem', fontWeight: 600 }}>⚖️ Planificador de Traspasos</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    Define traspasos entre fondos (fiscalmente neutros — 0 € de impuesto). Puedes traspasar a fondos ya existentes o a fondos nuevos.
                </p>

                {loadingPos ? <div style={{ color: 'var(--text-secondary)' }}>Cargando posiciones...</div> : (
                    <>
                        {/* Positions table */}
                        <h5 style={{ margin: '0 0 0.6rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Saldos actuales</h5>
                        <div style={{ overflowX: 'auto', marginBottom: '1.75rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Fondo</th>
                                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Saldo (€)</th>
                                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Peso (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...positions].sort((a, b) => (b.Valor_Actual || b.Capital_Invertido || 0) - (a.Valor_Actual || a.Capital_Invertido || 0)).map(p => {
                                        const val = p.Valor_Actual || p.Capital_Invertido || 0;
                                        const w = totalPortfolio > 0 ? val / totalPortfolio * 100 : 0;
                                        return (
                                            <tr key={p.ISIN} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.Fondo}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{p.ISIN}</div>
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                                    €{val.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {w.toFixed(1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.15)', fontWeight: 700 }}>
                                        <td style={{ padding: '8px 12px', color: 'var(--accent-glow)' }}>TOTAL</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--accent-glow)' }}>
                                            €{totalPortfolio.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--accent-glow)' }}>100%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Add transfer form */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px dashed var(--border-glass)', padding: '1.25rem', marginBottom: '1rem' }}>
                            <h5 style={{ margin: '0 0 1rem', fontWeight: 600, color: 'var(--accent-glow)' }}>➕ Añadir Traspaso</h5>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                {/* FROM */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Origen</label>
                                    <select value={fromISIN} onChange={e => setFromISIN(e.target.value)} style={{ ...inputStyle, minWidth: '200px' }}>
                                        <option value="">— Selecciona fondo —</option>
                                        {positions.map(p => (
                                            <option key={p.ISIN} value={p.ISIN}>{p.Fondo}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ fontSize: '1.4rem', paddingBottom: '6px', color: 'var(--accent-glow)' }}>→</div>

                                {/* TO */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Destino</label>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={toIsNew} onChange={e => { setToIsNew(e.target.checked); setToISIN(''); setToName(''); setToNewISIN(''); }} />
                                            Fondo nuevo
                                        </label>
                                    </div>
                                    {toIsNew ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <FundSearchInput
                                                placeholder="Busca el fondo destino (ISIN o nombre)"
                                                clearOnSelect={false}
                                                onSelect={f => setToNewFund(f)}
                                            />
                                            {toNewFund && (
                                                <div style={{ fontSize: '0.73rem', padding: '4px 8px', background: 'rgba(74,162,175,0.1)', borderRadius: '5px', color: 'var(--accent-glow)' }}>
                                                    ✔ {toNewFund.isin} — {toNewFund.name}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <select value={toISIN} onChange={e => setToISIN(e.target.value)} style={{ ...inputStyle, minWidth: '200px' }}>
                                            <option value="">— Selecciona fondo —</option>
                                            {positions.filter(p => p.ISIN !== fromISIN).map(p => (
                                                <option key={p.ISIN} value={p.ISIN}>{p.Fondo}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                {/* Amount */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Importe (€)</label>
                                        {fromISIN && positions.find(p => p.ISIN === fromISIN) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const pos = positions.find(p => p.ISIN === fromISIN);
                                                    const bal = pos ? (pos.Valor_Actual || pos.Capital_Invertido || 0) : 0;
                                                    setAmount(String(bal.toFixed(2)));
                                                }}
                                                style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--accent-glow)', background: 'rgba(74,162,175,0.15)', color: 'var(--accent-glow)', cursor: 'pointer', fontWeight: 700 }}
                                            >Todo</button>
                                        )}
                                    </div>
                                    {fromISIN && positions.find(p => p.ISIN === fromISIN) && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                            Disponible: €{(positions.find(p => p.ISIN === fromISIN)?.Valor_Actual || positions.find(p => p.ISIN === fromISIN)?.Capital_Invertido || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                        </div>
                                    )}
                                    <input type="number" min="1" step="any" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)}
                                        style={{ ...inputStyle, width: '140px' }} />
                                </div>

                                <button onClick={addTransfer} style={{ padding: '8px 18px', background: 'var(--accent-glow)', color: 'black', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', height: '37px' }}>
                                    Añadir
                                </button>
                            </div>
                        </div>

                        {/* Standalone add form */}
                        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px dashed rgba(74,162,175,0.3)', padding: '1.25rem', marginBottom: '1rem' }}>
                            <h5 style={{ margin: '0 0 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>💰 Añadir fondo nuevo (sin traspaso)</h5>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>Capital nuevo externo — no proviene de ningún fondo existente.</p>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Fondo destino</label>
                                    <FundSearchInput placeholder="Busca por ISIN o nombre" onSelect={f => setAddFund(f)} clearOnSelect={false} />
                                    {addFund && (
                                        <div style={{ fontSize: '0.73rem', padding: '4px 8px', background: 'rgba(74,162,175,0.1)', borderRadius: '5px', color: 'var(--accent-glow)' }}>
                                            ✔ {addFund.isin} — {addFund.name}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Importe (€)</label>
                                    <input type="number" min="1" step="any" placeholder="0,00" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                                        style={{ ...inputStyle, width: '120px' }} />
                                </div>
                                <button onClick={addStandalone} style={{ padding: '8px 18px', background: 'rgba(74,162,175,0.3)', color: 'white', border: '1px solid var(--accent-glow)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', height: '37px' }}>
                                    Añadir
                                </button>
                            </div>
                            {standaloneAdds.length > 0 && (
                                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {standaloneAdds.map(a => (
                                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', background: 'rgba(74,162,175,0.08)', borderRadius: '6px', border: '1px solid rgba(74,162,175,0.2)' }}>
                                            <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{a.name}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{a.isin}</span>
                                            <span style={{ color: 'var(--success)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: '100px', textAlign: 'right' }}>+€{a.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                            <button onClick={() => removeStandalone(a.id)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--danger)', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Transfer list */}
                        {transfers.length > 0 && (
                            <div>
                                <h5 style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>📋 Traspasos planificados</h5>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {transfers.map(t => {
                                        const srcBalAfter = result[t.fromISIN] ?? 0;
                                        const negative = srcBalAfter < -0.01;
                                        return (
                                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: negative ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: '8px', border: `1px solid ${negative ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                                                <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{t.fromName}</span>
                                                <span style={{ color: 'var(--danger)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: '100px', textAlign: 'right' }}>−€{t.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '1rem', padding: '0 4px' }}>→</span>
                                                <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>
                                                    {t.toName}
                                                    {t.toIsNew && <span style={{ fontSize: '0.68rem', background: 'rgba(74,162,175,0.2)', color: 'var(--accent-glow)', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px' }}>nuevo</span>}
                                                </span>
                                                <span style={{ color: 'var(--success)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: '100px', textAlign: 'right' }}>+€{t.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                                {negative && <span style={{ fontSize: '0.75rem', color: 'var(--danger)', whiteSpace: 'nowrap' }}>⚠️ saldo insuficiente</span>}
                                                <button onClick={() => removeTransfer(t.id)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--danger)', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}>✕</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Results panel */}
            {hasChanges && !loadingPos && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>📊 Resultado tras los movimientos</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                        Los traspasos entre fondos son <strong style={{ color: 'var(--success)' }}>fiscalmente neutros (0 € de impuesto)</strong>. Las aportaciones de capital nuevo sí incrementan el total de la cartera.
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Fondo</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Antes (€)</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Movimiento (€)</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--accent-glow)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Después (€)</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--accent-glow)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Nuevo peso (%)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allFunds
                                    .filter(f => {
                                        const before = positions.find(p => p.ISIN === f.isin);
                                        const beforeVal = before ? (before.Valor_Actual || before.Capital_Invertido || 0) : 0;
                                        return beforeVal > 0 || (result[f.isin] || 0) > 0;
                                    })
                                    .sort((a, b) => (result[b.isin] || 0) - (result[a.isin] || 0))
                                    .map(f => {
                                        const posData = positions.find(p => p.ISIN === f.isin);
                                        const before = posData ? (posData.Valor_Actual || posData.Capital_Invertido || 0) : 0;
                                        const after = result[f.isin] || 0;
                                        const delta = after - before;
                                        const wAfter = totalAfter > 0 ? after / totalAfter * 100 : 0;
                                        const isNegative = after < -0.01;
                                        return (
                                            <tr key={f.isin} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isNegative ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <div style={{ fontWeight: 600 }}>{f.name}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                        {f.isin}
                                                        {f.isNew && <span style={{ marginLeft: '6px', fontSize: '0.68rem', background: 'rgba(74,162,175,0.2)', color: 'var(--accent-glow)', padding: '1px 5px', borderRadius: '4px' }}>nuevo</span>}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {before > 0 ? `€${before.toLocaleString('es-ES', { minimumFractionDigits: 2 })}` : '—'}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: delta > 0.01 ? 'var(--success)' : delta < -0.01 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                                    {Math.abs(delta) > 0.01 ? `${delta > 0 ? '+' : ''}€${delta.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isNegative ? 'var(--danger)' : 'var(--text-primary)' }}>
                                                    {isNegative ? '⚠️ negativo' : `€${after.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {after > 0.01 ? `${wAfter.toFixed(1)}%` : '0%'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                    {hasErrors && (
                        <div style={{ marginTop: '1rem', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.85rem' }}>
                            ⚠️ Algunos fondos de origen no tienen saldo suficiente para los traspasos definidos. Revisa los importes.
                        </div>
                    )}
                </div>
            )}

            {/* ── SIMULATE HISTORICAL IMPACT ── */}
            {hasChanges && !loadingPos && (
                <div className="glass-panel" style={{padding:'1.5rem', marginTop:'1.5rem'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem', flexWrap:'wrap', gap:'10px'}}>
                        <div>
                            <h4 style={{margin:0, fontWeight:600}}>🧪 Simular impacto histórico</h4>
                            <p style={{margin:'4px 0 0', fontSize:'0.82rem', color:'var(--text-secondary)'}}>
                                ¿Cómo habría rendido esta cartera resultado vs. la actual?
                            </p>
                        </div>
                        <button onClick={runHistoricalSimulation} disabled={simLoading || hasErrors}
                            style={{padding:'9px 22px', background: hasErrors ? 'var(--border-glass)' : 'linear-gradient(135deg, var(--accent-glow), var(--accent-secondary))', color: hasErrors ? 'var(--text-secondary)' : 'white', border:'none', borderRadius:'8px', fontWeight:700, cursor: hasErrors ?'not-allowed':'pointer'}}>
                            {simLoading ? '⏳ Simulando...' : '🚀 Simular'}
                        </button>
                    </div>
                    {simError && <div style={{padding:'8px 12px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'8px', color:'var(--danger)', fontSize:'0.85rem', marginBottom:'1rem'}}>{simError}</div>}
                    {simResult && (() => {
                        const SIM_TF = ['1Y','3Y','5Y','10Y','MAX'];
                        const datasets = {};
                        if (simResult.history_current?.length > 1) datasets['📊 Cartera actual'] = simResult.history_current;
                        if (simResult.history_simulated?.length > 1) datasets['📈 Resultado traspasos'] = simResult.history_simulated;
                        const colorMap = {'📊 Cartera actual':'#FFD700','📈 Resultado traspasos':'#4ADE80'};
                        const activeFunds = Object.keys(datasets);
                        const { start, end } = getDateRange(simTimeframe, null);
                        const curr   = computeFundMetrics(filterSeries(datasets['📊 Cartera actual']||[], start, end), null);
                        const sim    = computeFundMetrics(filterSeries(datasets['📈 Resultado traspasos']||[], start, end), null);
                        const signC  = v => v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text-primary)';
                        const riskC  = v => v < 10 ? 'var(--success)' : v < 20 ? 'var(--warning)' : 'var(--danger)';
                        const metRow = (label, cv, sv, fmt, col) => {
                            if (cv == null && sv == null) return null;
                            const d = cv != null && sv != null ? sv - cv : null;
                            return (
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', borderBottom:'1px solid rgba(255,255,255,0.05)', fontSize:'0.85rem'}}>
                                    <span style={{color:'var(--text-secondary)', flex:1}}>{label}</span>
                                    <span style={{flex:1, textAlign:'center', fontWeight:600, color:col&&cv!=null?col(cv):'var(--text-primary)', fontVariantNumeric:'tabular-nums'}}>{cv!=null?fmt(cv):'—'}</span>
                                    <span style={{flex:1, textAlign:'center', fontWeight:600, color:col&&sv!=null?col(sv):'var(--text-primary)', fontVariantNumeric:'tabular-nums'}}>{sv!=null?fmt(sv):'—'}</span>
                                    <span style={{flex:'0 0 80px', textAlign:'right', fontWeight:700, fontSize:'0.8rem', color:d!=null?(d>0?'var(--success)':d<0?'var(--danger)':'var(--text-secondary)'):'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>{d!=null?`${d>=0?'+':''}${d.toFixed(2)}`:'—'}</span>
                                </div>
                            );
                        };
                        return (
                            <div>
                                <div style={{display:'flex', gap:'6px', marginBottom:'1rem', flexWrap:'wrap'}}>
                                    {SIM_TF.map(tf => (
                                        <button key={tf} onClick={()=>setSimTimeframe(tf)} style={{padding:'4px 12px', borderRadius:'16px', cursor:'pointer', fontWeight:600, fontSize:'0.75rem', border:simTimeframe===tf?'1px solid var(--accent-glow)':'1px solid var(--border-glass)', background:simTimeframe===tf?'var(--accent-glow)':'transparent', color:simTimeframe===tf?'#000':'var(--text-primary)'}}>{tf}</button>
                                    ))}
                                </div>
                                {activeFunds.length > 0 && <div style={{marginBottom:'1rem'}}><InteractiveChart datasets={datasets} timeframe={simTimeframe} activeFunds={activeFunds} customRange={null} fundColorMap={colorMap} /></div>}
                                {simResult.period_returns?.length > 0 && (
                                    <div style={{marginBottom:'1rem'}}>
                                        <h5 style={{margin:'0 0 0.6rem', fontWeight:600}}>📅 Rentabilidad por período</h5>
                                        <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.83rem'}}>
                                            <thead><tr style={{borderBottom:'2px solid rgba(255,255,255,0.1)'}}>
                                                <th style={{textAlign:'left', padding:'6px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'}}>Período</th>
                                                <th style={{textAlign:'center', padding:'6px 10px', color:'#FFD700', fontSize:'0.72rem', textTransform:'uppercase'}}>Actual</th>
                                                <th style={{textAlign:'center', padding:'6px 10px', color:'#4ADE80', fontSize:'0.72rem', textTransform:'uppercase'}}>Rebalanceada</th>
                                                <th style={{textAlign:'right', padding:'6px 10px', color:'var(--text-secondary)', fontSize:'0.72rem', textTransform:'uppercase'}}>Δ</th>
                                            </tr></thead>
                                            <tbody>{simResult.period_returns.map((r, i) => {
                                                const d = r.simulated!=null&&r.current!=null ? r.simulated-r.current : null;
                                                const fmtP = v => v!=null ? <span style={{color:v>=0?'var(--success)':'var(--danger)', fontWeight:700}}>{v>=0?'+':''}{v.toFixed(1)}%</span> : '—';
                                                return (<tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                                    <td style={{padding:'6px 10px', fontWeight:600}}>{r.label}</td>
                                                    <td style={{padding:'6px 10px', textAlign:'center'}}>{fmtP(r.current)}</td>
                                                    <td style={{padding:'6px 10px', textAlign:'center'}}>{fmtP(r.simulated)}</td>
                                                    <td style={{padding:'6px 10px', textAlign:'right', fontWeight:700, fontSize:'0.8rem', color:d!=null?(d>=0?'var(--success)':'var(--danger)'):'var(--text-secondary)'}}>{d!=null?`${d>=0?'+':''}${d.toFixed(2)}pp`:'—'}</td>
                                                </tr>);
                                            })}</tbody>
                                        </table>
                                    </div>
                                )}
                                <div style={{marginBottom:'1rem'}}>
                                    <h5 style={{margin:'0 0 0.5rem', fontWeight:600}}>📊 Métricas (período seleccionado)</h5>
                                    <div style={{display:'flex', justifyContent:'space-between', padding:'6px 12px', borderBottom:'2px solid rgba(255,255,255,0.1)', fontSize:'0.72rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>
                                        <span style={{flex:1}}>Métrica</span>
                                        <span style={{flex:1, textAlign:'center', color:'#FFD700'}}>Actual</span>
                                        <span style={{flex:1, textAlign:'center', color:'#4ADE80'}}>Rebalanceada</span>
                                        <span style={{flex:'0 0 80px', textAlign:'right'}}>Δ</span>
                                    </div>
                                    {metRow('Retorno total', curr?.totalReturn, sim?.totalReturn, v=>`${v.toFixed(2)}%`, signC)}
                                    {metRow('Rentabilidad anualizada', curr?.annReturn, sim?.annReturn, v=>`${v.toFixed(2)}%`, signC)}
                                    {metRow('Volatilidad', curr?.vol, sim?.vol, v=>`${v.toFixed(2)}%`, riskC)}
                                    {metRow('Sharpe ratio', curr?.sharpe, sim?.sharpe, v=>v.toFixed(3), signC)}
                                    {metRow('Máx. drawdown', curr?.maxDD, sim?.maxDD, v=>`${v.toFixed(2)}%`)}
                                </div>
                                {simResult.funds?.length > 0 && (
                                    <div>
                                        <h5 style={{margin:'0 0 0.5rem', fontWeight:600}}>⚖️ Cambio de pesos simulado</h5>
                                        {[...simResult.funds].sort((a,b)=>b.target_weight-a.target_weight).map(f => {
                                            const d = f.target_weight - f.current_weight;
                                            return (<div key={f.isin} style={{display:'flex', alignItems:'center', gap:'10px', padding:'6px 10px', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:'0.82rem'}}>
                                                <span style={{flex:1, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{f.name}</span>
                                                <span style={{color:'var(--text-secondary)', width:'52px', textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{(f.current_weight*100).toFixed(1)}%</span>
                                                <span style={{color:'var(--text-secondary)'}}>→</span>
                                                <span style={{fontWeight:700, width:'52px', fontVariantNumeric:'tabular-nums'}}>{(f.target_weight*100).toFixed(1)}%</span>
                                                <span style={{fontWeight:700, width:'50px', textAlign:'right', color:d>0.005?'var(--success)':d<-0.005?'var(--danger)':'var(--text-secondary)', fontVariantNumeric:'tabular-nums'}}>{d>=0?'+':''}{(d*100).toFixed(1)}pp</span>
                                                <span style={{fontWeight:700, color:f.delta_eur>0?'var(--success)':f.delta_eur<0?'var(--danger)':'var(--text-secondary)', width:'80px', textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{f.delta_eur>=0?'+':''}€{Math.round(f.delta_eur).toLocaleString('es-ES')}</span>
                                            </div>);
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};


// ---------------- Proyección What-If ----------------
const ProyeccionTab = () => {
    const [historyBatch, setHistoryBatch] = useState(null);
    const [summary, setSummary] = useState(null);
    const [loadingData, setLoadingData] = useState(true);

    // Inputs
    const [extraInversion, setExtraInversion] = useState('0');  // one-time extra on top of portfolio
    const [aporteAnual, setAporteAnual] = useState('0');         // recurring annual contribution
    const [years, setYears] = useState('10');
    const [sigma, setSigma] = useState('1.0');
    const [lookback, setLookback] = useState('5Y'); // period for computing CAGR/vol
    const [inflacion, setInflacion] = useState('2.0'); // España CPI anual estimado (%)

    // Canvas
    const canvasRef = React.useRef(null);
    const containerRef = React.useRef(null);
    const [dimensions, setDimensions] = useState({ w: 700, h: 320 });
    const [tooltip, setTooltip] = useState(null);
    const [drawn, setDrawn] = useState(null); // { xScale, yScale, N, base, optimistic, pessimistic, margin, plotW, plotH }

    useEffect(() => {
        Promise.all([
            fetch('/api/portfolio/history_batch').then(r => r.json()),
            fetch('/api/portfolio/summary').then(r => r.json()),
        ]).then(([hist, sum]) => {
            setHistoryBatch(hist);
            setSummary(sum);
            setLoadingData(false);
        }).catch(() => setLoadingData(false));
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) {
                const w = Math.floor(e.contentRect.width) || 700;
                setDimensions({ w, h: Math.max(260, Math.min(380, Math.floor(w * 0.42))) });
            }
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Compute CAGR + vol per fund using computeFundMetrics filtered by look-back
    const projection = useMemo(() => {
        if (!historyBatch || !summary) return null;
        const summaryFunds = summary.funds || [];
        const currentPortfolioValue = summaryFunds.reduce((s, f) => s + (f.Valor_Actual || 0), 0);
        const totalVal = currentPortfolioValue || 1;

        // Weight map by fund name
        const weightMap = {};
        summaryFunds.forEach(f => { if (f.Fondo) weightMap[f.Fondo] = (f.Valor_Actual || 0) / totalVal; });

        // Lookback: compute start date
        const now = new Date();
        const lbStart = new Date(now);
        if (lookback === '3Y') lbStart.setFullYear(now.getFullYear() - 3);
        else if (lookback === '5Y') lbStart.setFullYear(now.getFullYear() - 5);
        else if (lookback === '10Y') lbStart.setFullYear(now.getFullYear() - 10);
        else lbStart.setFullYear(1900); // MAX

        let portCagrDec = 0, portVolVar = 0;
        const fundLines = [];

        for (const [name, series] of Object.entries(historyBatch)) {
            if (name.includes('Mi Cartera')) continue;
            const w = weightMap[name] || 0;
            if (w === 0 || !Array.isArray(series)) continue;

            // Filter series to look-back window
            const pts = series.filter(p => p.price != null && p.price > 0 && new Date(p.date) >= lbStart);
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

        const X0 = currentPortfolioValue + (parseFloat(extraInversion) || 0); // starting value = portfolio + optional extra
        const N = Math.max(1, Math.min(50, parseInt(years) || 10));
        const s = Math.max(0, parseFloat(sigma) || 1.0);
        const aporte = Math.max(0, parseFloat(aporteAnual) || 0);

        const base = [], optimistic = [], pessimistic = [];
        for (let t = 0; t <= N; t++) {
            if (t === 0) {
                base.push(X0);
                optimistic.push(X0);
                pessimistic.push(X0);
            } else {
                base.push(base[t-1] * (1 + portCagrDec) + aporte);
                optimistic.push(optimistic[t-1] * (1 + portCagrDec + s * portVolDec) + aporte);
                pessimistic.push(pessimistic[t-1] * Math.max(0.001, 1 + portCagrDec - s * portVolDec) + aporte);
            }
        }

        const infRate = Math.max(0, parseFloat(inflacion) || 0) / 100;
        // When inflation > 0, deflate ALL scenarios (real values, not nominal)
        if (infRate > 0) {
            for (let t = 1; t <= N; t++) {
                const deflator = Math.pow(1 + infRate, t);
                base[t] /= deflator;
                optimistic[t] /= deflator;
                pessimistic[t] /= deflator;
            }
        }

        return { base, optimistic, pessimistic, N, X0, currentPortfolioValue, aporte, portCagrDec, portVolDec, s, fundLines, lookback, infRate };
    }, [historyBatch, summary, extraInversion, aporteAnual, years, sigma, lookback, inflacion]);

    // Draw canvas
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
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        const margin = { top: 20, right: 35, bottom: 38, left: 72 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;
        ctx.clearRect(0, 0, w, h);

        const { base, optimistic, pessimistic, N } = projection;
        const allVals = [...base, ...optimistic, ...pessimistic];
        const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
        const valRange = (maxVal - minVal) || 1;

        const xS = t => margin.left + (t / N) * plotW;
        const yS = v => margin.top + plotH - ((v - minVal) / valRange) * plotH;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) { const y = margin.top + (i/5)*plotH; ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left+plotW, y); ctx.stroke(); }
        const step = Math.max(1, Math.floor(N/5));
        for (let t = 0; t <= N; t += step) { const x = xS(t); ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top+plotH); ctx.stroke(); }

        // Y-axis labels
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px Inter,sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const v = minVal + valRange*(5-i)/5;
            ctx.fillText(v>=1e6?`${(v/1e6).toFixed(2)}M\u20ac`:v>=1e3?`${(v/1e3).toFixed(0)}K\u20ac`:`${v.toFixed(0)}\u20ac`, margin.left-5, margin.top+(i/5)*plotH+4);
        }
        // X-axis labels (year numbers starting from current year)
        const currentYear = new Date().getFullYear();
        ctx.textAlign = 'center';
        for (let t = 0; t <= N; t += step) ctx.fillText(`${currentYear + t}`, xS(t), margin.top+plotH+18);

        // Band fill
        ctx.beginPath();
        optimistic.forEach((v,t) => t===0?ctx.moveTo(xS(t),yS(v)):ctx.lineTo(xS(t),yS(v)));
        for (let t=N;t>=0;t--) ctx.lineTo(xS(t),yS(pessimistic[t]));
        ctx.closePath(); ctx.fillStyle='rgba(74,162,175,0.1)'; ctx.fill();

        // Pessimistic dashed
        ctx.beginPath(); pessimistic.forEach((v,t) => t===0?ctx.moveTo(xS(t),yS(v)):ctx.lineTo(xS(t),yS(v)));
        ctx.strokeStyle='rgba(239,68,68,0.7)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);
        // Optimistic dashed
        ctx.beginPath(); optimistic.forEach((v,t) => t===0?ctx.moveTo(xS(t),yS(v)):ctx.lineTo(xS(t),yS(v)));
        ctx.strokeStyle='rgba(74,222,128,0.7)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);
        // Base solid
        ctx.beginPath(); base.forEach((v,t) => t===0?ctx.moveTo(xS(t),yS(v)):ctx.lineTo(xS(t),yS(v)));
        ctx.strokeStyle='#FFD700'; ctx.lineWidth=2.5; ctx.stroke();
        // Start dot
        ctx.beginPath(); ctx.arc(xS(0),yS(base[0]),5,0,Math.PI*2); ctx.fillStyle='#FFD700'; ctx.fill();

        setDrawn({ xS, yS, N, base, optimistic, pessimistic, margin, plotW, plotH });
    }, [projection, dimensions]);

    const handleMouseMove = (e) => {
        if (!drawn || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const t = Math.round(((mouseX - drawn.margin.left) / drawn.plotW) * drawn.N);
        if (t < 0 || t > drawn.N) { setTooltip(null); return; }
        setTooltip({ x: mouseX, t, base: drawn.base[t], opt: drawn.optimistic[t], pes: drawn.pessimistic[t] });
    };

    const fmtEur = (v) => {
        if (v == null) return '—';
        if (v >= 1e6) return `${(v/1e6).toFixed(2)}M€`;
        if (v >= 1e3) return `${(v/1e3).toFixed(1)}K€`;
        return `${v.toFixed(0)}€`;
    };

    if (loadingData) return <div style={{padding:'2rem', color:'var(--text-secondary)'}}>Cargando histórico de precios...</div>;
    if (!historyBatch) return <div style={{padding:'2rem', color:'var(--text-secondary)'}}>Sin datos de histórico. Actualiza las cotizaciones primero.</div>;

    const currentPortfolioValue = summary?.funds?.reduce((s, f) => s + (f.Valor_Actual || 0), 0) || 0;
    const noFunds = !projection || projection.fundLines.length === 0;

    return (
        <div>
            <div className="glass-panel" style={{padding:'2rem', marginBottom:'1.5rem'}}>
                <h3 style={{marginBottom:'0.5rem', fontWeight:600}}>🔮 Proyección de Crecimiento "What If"</h3>
                <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', marginBottom:'1.5rem'}}>
                    Proyección partiendo del patrimonio actual usando el CAGR histórico ponderado de cada fondo.
                    Puedes añadir aportación adicional inicial y/o una aportación anual recurrente.
                </p>

                {/* Portfolio value + inputs */}
                {currentPortfolioValue > 0 && (
                    <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'1.25rem', padding:'10px 16px', background:'rgba(255,215,0,0.08)', borderRadius:'10px', border:'1px solid rgba(255,215,0,0.2)'}}>
                        <span style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Patrimonio actual:</span>
                        <span style={{fontWeight:800, fontSize:'1.15rem', color:'#FFD700', fontVariantNumeric:'tabular-nums'}}>{fmtEur(currentPortfolioValue)}</span>
                        <span style={{fontSize:'0.72rem', color:'rgba(255,255,255,0.35)', marginLeft:'8px'}}>(punto de partida de la proyección)</span>
                    </div>
                )}

                <div style={{display:'flex', gap:'16px', flexWrap:'wrap', alignItems:'flex-end', marginBottom:'1.5rem'}}>
                    <div style={{flex:'0 0 180px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Aportación extra inicial (€)</label>
                        <input type="number" min="0" step="1000" value={extraInversion} onChange={e=>setExtraInversion(e.target.value)}
                            style={{width:'100%', padding:'10px 14px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.9rem'}} />
                    </div>
                    <div style={{flex:'0 0 180px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Aportación anual (€)</label>
                        <input type="number" min="0" step="500" value={aporteAnual} onChange={e=>setAporteAnual(e.target.value)}
                            style={{width:'100%', padding:'10px 14px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.9rem'}} />
                    </div>
                    <div style={{flex:'0 0 130px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Horizonte (años)</label>
                        <input type="number" min="1" max="50" step="1" value={years} onChange={e=>setYears(e.target.value)}
                            style={{width:'100%', padding:'10px 14px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'0.9rem'}} />
                    </div>
                    <div style={{flex:'1 1 200px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>
                            CAGR histórico — ventana look-back
                        </label>
                        <div style={{display:'flex', gap:'5px'}}>
                            {['3Y','5Y','10Y','MAX'].map(lb => (
                                <button key={lb} onClick={() => setLookback(lb)} style={{
                                    flex:1, padding:'10px 6px', borderRadius:'8px',
                                    border: lookback===lb ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)',
                                    background: lookback===lb ? 'var(--accent-glow)' : 'transparent',
                                    color: lookback===lb ? '#000' : 'var(--text-primary)',
                                    cursor:'pointer', fontWeight:700, fontSize:'0.85rem', transition:'all 0.15s'
                                }}>{lb}</button>
                            ))}
                        </div>
                    </div>
                    <div style={{flex:'1 1 200px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>
                            Bandas de confianza (σ = {parseFloat(sigma).toFixed(1)})
                        </label>
                        <div style={{display:'flex', gap:'5px'}}>
                            {['0.5','1.0','1.5','2.0'].map(s => (
                                <button key={s} onClick={() => setSigma(s)} style={{
                                    flex:1, padding:'10px 6px', borderRadius:'8px',
                                    border: sigma===s ? '1px solid var(--accent-secondary)' : '1px solid var(--border-glass)',
                                    background: sigma===s ? 'var(--accent-secondary)' : 'transparent',
                                    color: sigma===s ? '#000' : 'var(--text-primary)',
                                    cursor:'pointer', fontWeight:700, fontSize:'0.85rem', transition:'all 0.15s'
                                }}>{s}σ</button>
                            ))}
                        </div>
                    </div>
                    <div style={{flex:'0 0 200px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>
                            Inflación España CPI (%/año)
                        </label>
                        <div style={{display:'flex', gap:'5px'}}>
                            {['0','1.5','2.5','3.5'].map(inf => (
                                <button key={inf} onClick={() => setInflacion(inf)} style={{
                                    flex:1, padding:'10px 4px', borderRadius:'8px',
                                    border: inflacion===inf ? '1px solid rgba(251,146,60,0.8)' : '1px solid var(--border-glass)',
                                    background: inflacion===inf ? 'rgba(251,146,60,0.25)' : 'transparent',
                                    color: inflacion===inf ? 'rgb(251,146,60)' : 'var(--text-primary)',
                                    cursor:'pointer', fontWeight:700, fontSize:'0.8rem', transition:'all 0.15s'
                                }}>{inf==='0'?'Sin':inf+'%'}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {noFunds && <div style={{padding:'1rem', color:'var(--warning)', fontSize:'0.85rem'}}>⚠️ No hay fondos con suficiente histórico para el período seleccionado. Prueba con MAX.</div>}

                {projection && !noFunds && (
                    <div style={{display:'flex', gap:'10px', flexWrap:'wrap', padding:'12px 16px', background:'rgba(0,0,0,0.2)', borderRadius:'10px'}}>
                        <div style={{textAlign:'center', padding:'6px 14px', background:'rgba(255,215,0,0.08)', borderRadius:'8px', border:'1px solid rgba(255,215,0,0.15)'}}>
                            <div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>INICIO</div>
                            <div style={{fontWeight:700, color:'#FFD700', fontSize:'1.05rem'}}>{fmtEur(projection.X0)}</div>
                        </div>
                        {projection.aporte > 0 && (
                            <div style={{textAlign:'center', padding:'6px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}>
                                <div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>APORTE/AÑO</div>
                                <div style={{fontWeight:700, color:'var(--accent-glow)', fontSize:'1.05rem'}}>{fmtEur(projection.aporte)}</div>
                            </div>
                        )}
                        <div style={{textAlign:'center', padding:'6px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}>
                            <div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>CAGR CARTERA ({lookback})</div>
                            <div style={{fontWeight:700, color: projection.portCagrDec>=0?'var(--success)':'var(--danger)', fontSize:'1.05rem'}}>{projection.portCagrDec>=0?'+':''}{(projection.portCagrDec*100).toFixed(2)}%</div>
                        </div>
                        <div style={{textAlign:'center', padding:'6px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}>
                            <div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>VOL CARTERA</div>
                            <div style={{fontWeight:700, fontSize:'1.05rem'}}>{(projection.portVolDec*100).toFixed(2)}%</div>
                        </div>
                        <div style={{textAlign:'center', padding:'6px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}>
                            <div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>BASE {new Date().getFullYear() + projection.N}{projection.infRate > 0 ? ' (real)' : ''}</div>
                            <div style={{fontWeight:700, color:'#FFD700', fontSize:'1.05rem'}}>{fmtEur(projection.base[projection.N])}</div>
                        </div>
                        <div style={{textAlign:'center', padding:'6px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}>
                            <div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>OPTIMISTA (+{parseFloat(sigma).toFixed(1)}σ){projection.infRate > 0 ? ' real' : ''}</div>
                            <div style={{fontWeight:700, color:'var(--success)', fontSize:'1.05rem'}}>{fmtEur(projection.optimistic[projection.N])}</div>
                        </div>
                        <div style={{textAlign:'center', padding:'6px 14px', background:'rgba(0,0,0,0.2)', borderRadius:'8px'}}>
                            <div style={{fontSize:'0.65rem', color:'var(--text-secondary)'}}>PESIMISTA (-{parseFloat(sigma).toFixed(1)}σ){projection.infRate > 0 ? ' real' : ''}</div>
                            <div style={{fontWeight:700, color:'var(--danger)', fontSize:'1.05rem'}}>{fmtEur(projection.pessimistic[projection.N])}</div>
                        </div>
                    </div>
                )}
            </div>

            {projection && !noFunds && (
                <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                    <h4 style={{marginBottom:'1rem', fontWeight:600}}>📈 Evolución Proyectada</h4>
                    <div style={{display:'flex', gap:'14px', marginBottom:'10px', flexWrap:'wrap', fontSize:'0.78rem'}}>
                        <span style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'22px', height:'3px', background:'#FFD700', display:'inline-block', borderRadius:'2px'}} /> Base{parseFloat(inflacion)>0?` (real, −${parseFloat(inflacion).toFixed(1)}% CPI)`:' (nominal)'}</span>
                        <span style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'22px', height:'0', borderTop:'2px dashed rgba(74,222,128,0.7)', display:'inline-block'}} /> Optimista (+{parseFloat(sigma).toFixed(1)}σ){parseFloat(inflacion)>0?' real':''}</span>
                        <span style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'22px', height:'0', borderTop:'2px dashed rgba(239,68,68,0.7)', display:'inline-block'}} /> Pesimista (-{parseFloat(sigma).toFixed(1)}σ){parseFloat(inflacion)>0?' real':''}</span>
                    </div>
                    <div ref={containerRef} style={{position:'relative', width:'100%'}}>
                        <canvas ref={canvasRef} style={{display:'block', cursor:'crosshair'}}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => setTooltip(null)}
                        />
                        {tooltip && (
                            <div style={{position:'absolute', left: tooltip.x > dimensions.w/2 ? tooltip.x-195 : tooltip.x+15, top:20,
                                background:'rgba(15,20,35,0.95)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'10px', padding:'10px 14px',
                                pointerEvents:'none', backdropFilter:'blur(12px)', minWidth:'165px', zIndex:10, boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
                                <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'6px', fontWeight:600}}>{new Date().getFullYear() + tooltip.t}</div>
                                {[['#FFD700','Base',tooltip.base],['var(--success)','Optimista',tooltip.opt],['var(--danger)','Pesimista',tooltip.pes]].map(([c,l,v]) => (
                                    <div key={l} style={{display:'flex', justifyContent:'space-between', gap:'8px', fontSize:'0.78rem', padding:'2px 0'}}>
                                        <span style={{color:c}}>{l}</span>
                                        <span style={{fontWeight:700, color:c}}>{fmtEur(v)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {projection && !noFunds && projection.fundLines.length > 0 && (
                <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                    <h4 style={{marginBottom:'1rem', fontWeight:600}}>Contribución por Fondo</h4>
                    <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.82rem'}}>
                            <thead>
                                <tr style={{borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
                                    <th style={{textAlign:'left', padding:'8px 10px', color:'var(--text-secondary)', fontWeight:600}}>Fondo</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontWeight:600}}>Peso</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontWeight:600}}>CAGR ({lookback})</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontWeight:600}}>Volatilidad</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontWeight:600}}>Valor inicial</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontWeight:600}}>Aporte/año</th>
                                    <th style={{textAlign:'right', padding:'8px 10px', color:'var(--text-secondary)', fontWeight:600}}>Base ({new Date().getFullYear() + projection.N})</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projection.fundLines.slice().sort((a,b) => b.w-a.w).map(f => {
                                    const initial = projection.X0 * f.w;
                                    const porteAnualFund = projection.aporte * f.w;
                                    // Projection with annual contribution per fund
                                    let finalBase = initial;
                                    for (let t = 1; t <= projection.N; t++) finalBase = finalBase * (1 + f.cagr) + porteAnualFund;
                                    return (
                                        <tr key={f.name} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                            <td style={{padding:'8px 10px', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={f.name}>{f.name.substring(0,30)}</td>
                                            <td style={{padding:'8px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{(f.w*100).toFixed(1)}%</td>
                                            <td style={{padding:'8px 10px', textAlign:'right', fontWeight:700, color:f.cagr>=0?'var(--success)':'var(--danger)', fontVariantNumeric:'tabular-nums'}}>{f.cagr>=0?'+':''}{(f.cagr*100).toFixed(2)}%</td>
                                            <td style={{padding:'8px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{(f.vol*100).toFixed(2)}%</td>
                                            <td style={{padding:'8px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{fmtEur(initial)}</td>
                                            <td style={{padding:'8px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--accent-glow)'}}>{projection.aporte > 0 ? fmtEur(porteAnualFund) : '—'}</td>
                                            <td style={{padding:'8px 10px', textAlign:'right', fontWeight:700, color:'#FFD700', fontVariantNumeric:'tabular-nums'}}>{fmtEur(finalBase)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div style={{marginTop:'12px', fontSize:'0.72rem', color:'rgba(255,255,255,0.3)', lineHeight:1.5}}>
                        ⚠️ Proyección basada en CAGR histórico ({lookback}) y volatilidad anualizada.
                        Rentabilidades pasadas no garantizan resultados futuros. El modelo aplica CAGR constante con aportación anual distribuida por pesos.
                    </div>
                </div>
            )}
        </div>
    );
};

// ---------------- TAB 4 wrapper: Simulador (sub-tabs) ----------------
const SimuladorTab = () => {
    const [subTab, setSubTab] = useState('anadir');
    const subTabs = [ { id: 'anadir', label: '➕ Añadir Fondo' }, { id: 'rebalancear', label: '⚖️ Rebalancear Cartera' }, { id: 'proyeccion', label: '🔮 Proyección' } ];
    return (
        <div>
            <div style={{ display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-glass)', marginBottom: '1.5rem', width: 'fit-content' }}>
                {subTabs.map(st => (
                    <button key={st.id} onClick={() => setSubTab(st.id)} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.15s', background: subTab === st.id ? 'var(--accent-glow)' : 'transparent', color: subTab === st.id ? '#000' : 'var(--text-primary)' }}>{st.label}</button>
                ))}
            </div>
            {subTab === 'anadir' && <AnadirFondoTab />}
            {subTab === 'rebalancear' && <RebalancearTab />}
            {subTab === 'proyeccion' && <ProyeccionTab />}
        </div>
    );
};


// ---------------- TAB 5: Retirada de Fondos ----------------

const RetiradasTab = () => {
    const [targetAmount, setTargetAmount] = useState('');
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showRacional, setShowRacional] = useState(false);
    const [traspaso, setTraspaso] = useState(null);
    const [traspasoLoading, setTraspasoLoading] = useState(false);

    // ── Estado para la nueva herramienta: Traspaso + Reembolso ──
    const [fifoAmount, setFifoAmount] = useState('');
    const [fifoResult, setFifoResult] = useState(null);
    const [fifoLoading, setFifoLoading] = useState(false);
    const [fifoError, setFifoError] = useState(null);
    const [fifoShowDetail, setFifoShowDetail] = useState(false);

    // Cargar análisis de traspasos al montar el componente
    React.useEffect(() => {
        setTraspasoLoading(true);
        fetch('/api/portfolio/traspaso-analysis')
            .then(r => r.ok ? r.json() : Promise.reject(r))
            .then(data => { setTraspaso(data); setTraspasoLoading(false); })
            .catch(() => setTraspasoLoading(false));
    }, []);

    const runFifoOptimization = () => {
        const amt = parseFloat(fifoAmount);
        if (!amt || amt <= 0) return;
        setFifoLoading(true);
        setFifoError(null);
        setFifoResult(null);
        const body = { target_amount: amt };
        fetch('/api/portfolio/traspaso-optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
            .then(async r => {
                if (!r.ok) {
                    let detail = 'Error en la API';
                    try { const b = await r.json(); detail = b.detail || JSON.stringify(b); } catch {}
                    throw new Error(detail);
                }
                return r.json();
            })
            .then(result => { setFifoResult(result); setFifoLoading(false); })
            .catch(e => { setFifoError(e.message); setFifoLoading(false); });
    };

    const runOptimization = () => {
        const amt = parseFloat(targetAmount);
        if (!amt || amt <= 0) return;
        setLoading(true);
        setError(null);
        fetch('/api/portfolio/tax-optimize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ target_amount: amt })
        })
            .then(async r => {
                if (!r.ok) {
                    let detail = 'Error en la API';
                    try { const body = await r.json(); detail = body.detail || JSON.stringify(body); } catch {}
                    throw new Error(detail);
                }
                return r.json();
            })
            .then(result => { setPlan(result); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    };

    const taxBrackets = [
        { limit: 6000,     rate: 19 },
        { limit: 50000,    rate: 21 },
        { limit: 200000,   rate: 23 },
        { limit: 300000,   rate: 27 },
        { limit: Infinity, rate: 28 },
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
                range: bracket.limit === Infinity ? `>${prevLimit.toLocaleString('es-ES')}€` : `${prevLimit.toLocaleString('es-ES')}€ — ${bracket.limit.toLocaleString('es-ES')}€`,
                rate: bracket.rate,
                base: aplicable,
                tax,
            });
            remaining -= aplicable;
            prevLimit = bracket.limit;
        }
        return breakdown;
    };

    const totalAhorroTraspaso = traspaso ? traspaso.reduce((s, f) => s + f.ahorro_traspaso, 0) : 0;
    const totalPlusvaliaDiferible = traspaso ? traspaso.filter(f => f.cualifica_traspaso && f.plusvalia_latente > 0).reduce((s, f) => s + f.plusvalia_latente, 0) : 0;

    const fmt = (n, dec = 0) => n != null ? n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
    const fmtEur = (n, dec = 2) => n != null ? `€${fmt(n, dec)}` : '—';

    return (
        <div>
            {/* ── Racional / Cómo funciona ── */}
            <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem', borderLeft:'3px solid var(--accent-glow)'}}>
                <div
                    style={{display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none'}}
                    onClick={() => setShowRacional(r => !r)}
                >
                    <h4 style={{fontWeight:600, margin:0}}>📚 ¿Cómo funciona? Estrategia de retirada fiscal</h4>
                    <span style={{fontSize:'1.2rem', color:'var(--text-secondary)'}}>{showRacional ? '▲' : '▼'}</span>
                </div>

                {showRacional && (
                    <div style={{marginTop:'1.2rem', display:'flex', flexDirection:'column', gap:'1rem'}}>
                        <div>
                            <h5 style={{color:'var(--accent-glow)', marginBottom:'0.4rem'}}>1. Contabilidad FIFO</h5>
                            <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', lineHeight:1.6, margin:0}}>
                                En España, la venta de participaciones de fondos de inversión sigue la regla <strong style={{color:'var(--text-primary)'}}>FIFO (First In, First Out)</strong>:
                                se venden primero las participaciones adquiridas en fecha más antigua. Esto significa que las ganancias
                                acumuladas desde hace más tiempo son las que tributan primero. La herramienta calcula automáticamente
                                el precio de coste de cada lote y la ganancia patrimonial imputable.
                            </p>
                        </div>
                        <div>
                            <h5 style={{color:'var(--warning)', marginBottom:'0.4rem'}}>2. IRPF — Renta del Ahorro 2024 (Art. 46 LIRPF)</h5>
                            <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', lineHeight:1.6, margin:0}}>
                                Las ganancias patrimoniales por venta de fondos tributan en la <strong style={{color:'var(--text-primary)'}}>base imponible del ahorro</strong> con los siguientes tramos progresivos:
                            </p>
                            <div style={{marginTop:'0.6rem', display:'flex', flexWrap:'wrap', gap:'6px'}}>
                                {[{r:'0 – 6.000€', t:'19%'},{r:'6.001 – 50.000€', t:'21%'},{r:'50.001 – 200.000€', t:'23%'},{r:'200.001 – 300.000€', t:'27%'},{r:'>300.000€', t:'28%'}].map(b => (
                                    <span key={b.r} style={{padding:'4px 10px', borderRadius:'6px', background:'rgba(255,165,0,0.1)', border:'1px solid rgba(255,165,0,0.3)', fontSize:'0.78rem'}}>
                                        <strong>{b.t}</strong> <span style={{color:'var(--text-secondary)'}}>{b.r}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h5 style={{color:'var(--success)', marginBottom:'0.4rem'}}>3. Traspasos entre fondos — diferimiento sin límite (Art. 94 LIRPF)</h5>
                            <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', lineHeight:1.6, margin:0}}>
                                La ventaja fiscal más potente disponible en España: puedes <strong style={{color:'var(--text-primary)'}}>mover dinero entre fondos de inversión sin tributar</strong>.
                                Al hacer un traspaso, el reembolso del fondo origen no se considera transmisión a efectos del IRPF;
                                la plusvalía latente se "hereda" en el nuevo fondo y solo tributa cuando se produce la venta definitiva.
                                <br/><br/>
                                <strong style={{color:'var(--success)'}}>Requisitos:</strong> Ambos fondos deben ser Instituciones de Inversión Colectiva (IICs) registradas en CNMV o ESMA.
                                <strong style={{color:'var(--danger)'}}> No aplica a ETFs, acciones ni planes de pensiones.</strong>
                                No existe límite de importe ni de frecuencia. La gestora de destino gestiona el trámite.
                            </p>
                        </div>
                        <div>
                            <h5 style={{color:'var(--accent-glow)', marginBottom:'0.4rem'}}>4. Estrategia óptima combinada</h5>
                            <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', lineHeight:1.6, margin:0}}>
                                <strong style={{color:'var(--text-primary)'}}>Para rebalancear cartera:</strong> usa traspasos (0€ de impuesto).<br/>
                                <strong style={{color:'var(--text-primary)'}}>Para necesitar liquidez:</strong> vende priorizando los lotes con menor ganancia relativa (esta herramienta lo hace automáticamente).<br/>
                                <strong style={{color:'var(--text-primary)'}}>Para compensar minusvalías:</strong> si tienes fondos en pérdidas, véndelos primero en el mismo ejercicio para compensar ganancias de otros (siempre que no recompres el mismo fondo en los 2 meses siguientes — regla anti-lavado Art. 33.5 LIRPF).
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Análisis de Traspasos ── */}
            <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                <h4 style={{fontWeight:600, marginBottom:'0.75rem'}}>🔄 Optimización por Traspasos — Impuesto Diferido</h4>
                <p style={{fontSize:'0.82rem', color:'var(--text-secondary)', marginBottom:'1rem'}}>
                    Si necesitas rebalancear tu cartera <em>sin retirar dinero</em>, puedes hacerlo mediante traspasos fiscalmente neutros.
                    El ahorro potencial muestra el impuesto que evitarías pagar si traspasas en lugar de vender.
                </p>
                {traspasoLoading && <div style={{color:'var(--text-secondary)', fontSize:'0.85rem'}}>⏳ Calculando...</div>}
                {!traspasoLoading && traspaso && traspaso.length > 0 && (
                    <>
                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'1rem', marginBottom:'1.2rem'}}>
                            <div style={{padding:'1rem', borderRadius:'10px', background:'rgba(0,200,100,0.08)', border:'1px solid rgba(0,200,100,0.2)', textAlign:'center'}}>
                                <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom:'4px'}}>Plusvalía diferible</div>
                                <div style={{fontSize:'1.2rem', fontWeight:700, color:'var(--success)'}}>€{totalPlusvaliaDiferible.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:0})}</div>
                            </div>
                            <div style={{padding:'1rem', borderRadius:'10px', background:'rgba(0,200,100,0.08)', border:'1px solid rgba(0,200,100,0.2)', textAlign:'center'}}>
                                <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom:'4px'}}>Ahorro fiscal potencial</div>
                                <div style={{fontSize:'1.2rem', fontWeight:700, color:'var(--success)'}}>€{totalAhorroTraspaso.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:0})}</div>
                            </div>
                        </div>
                        <div style={{overflowX:'auto'}}>
                            <table style={{width:'100%', minWidth:'600px'}}>
                                <thead>
                                    <tr>
                                        <th style={{textAlign:'left'}}>Fondo</th>
                                        <th style={{textAlign:'right'}}>Valor actual</th>
                                        <th style={{textAlign:'right'}}>Plusvalía latente</th>
                                        <th style={{textAlign:'right'}}>Impuesto si vendes</th>
                                        <th style={{textAlign:'right'}}>Ahorro traspaso</th>
                                        <th style={{textAlign:'center'}}>Cualifica</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {traspaso.map((f, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <div style={{fontWeight:500, fontSize:'0.88rem'}}>{f.nombre}</div>
                                                <div style={{fontSize:'0.72rem', color:'var(--text-secondary)', fontFamily:'monospace'}}>{f.isin}</div>
                                            </td>
                                            <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>€{f.valor_actual.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:0})}</td>
                                            <td style={{textAlign:'right', fontWeight:600, color: f.plusvalia_latente >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric:'tabular-nums'}}>
                                                {f.plusvalia_latente >= 0 ? '+' : ''}€{f.plusvalia_latente.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:0})}
                                                <span style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginLeft:'4px'}}>({f.plusvalia_pct >= 0 ? '+' : ''}{f.plusvalia_pct.toFixed(1)}%)</span>
                                            </td>
                                            <td style={{textAlign:'right', color:'var(--danger)', fontVariantNumeric:'tabular-nums', fontWeight:600}}>
                                                {f.impuesto_si_vendes > 0 ? `-€${f.impuesto_si_vendes.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:0})}` : '—'}
                                            </td>
                                            <td style={{textAlign:'right', color:'var(--success)', fontVariantNumeric:'tabular-nums', fontWeight:700}}>
                                                {f.ahorro_traspaso > 0 ? `+€${f.ahorro_traspaso.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:0})}` : '—'}
                                            </td>
                                            <td style={{textAlign:'center'}}>
                                                <span style={{padding:'2px 8px', borderRadius:'4px', fontSize:'0.75rem', fontWeight:600,
                                                    background: f.cualifica_traspaso ? 'rgba(0,200,100,0.15)' : 'rgba(220,50,50,0.15)',
                                                    color: f.cualifica_traspaso ? 'var(--success)' : 'var(--danger)'}}>
                                                    {f.cualifica_traspaso ? '✓ Sí' : '✗ No'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'0.75rem', fontStyle:'italic'}}>
                            * Se asume que todos los fondos son IICs (fondos de inversión). Verifica que no hay ETFs en cartera antes de ejecutar un traspaso.
                            El ahorro es temporal (diferimiento), no eliminación del impuesto.
                        </p>
                    </>
                )}
                {!traspasoLoading && (!traspaso || traspaso.length === 0) && (
                    <div style={{color:'var(--text-secondary)', fontSize:'0.85rem'}}>No hay datos de posiciones disponibles.</div>
                )}
            </div>

            {/* ── NUEVA: Estrategia Traspaso + Reembolso ── */}
            <div className="glass-panel" style={{padding:'2rem', marginBottom:'1.5rem', borderLeft:'3px solid var(--success)'}}>
                <h3 style={{marginBottom:'0.5rem', fontWeight:600}}>🎯 Quiero retirar dinero — ¿Cómo pago menos?</h3>
                <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', marginBottom:'1.5rem', lineHeight:1.6}}>
                    Algoritmo greedy global óptimo: analiza <em>todos</em> los lotes de <em>todos</em> los fondos,
                    selecciona los de menor plusvalía para reembolso, y los lotes FIFO-bloqueantes se traspasan
                    automáticamente (coste = <strong style={{color:'var(--success)'}}>0€</strong> bajo Art. 94 Ley 35/2006 IRPF).
                    El destino del traspaso es un <strong>fondo indexado</strong> (existente en cartera o nueva sugerencia).
                </p>
                <div style={{display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap', marginBottom:'1rem'}}>
                    <div style={{flex:'0 0 220px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Importe a retirar (€)</label>
                        <input
                            type="number" min="100" step="1000"
                            value={fifoAmount}
                            onChange={e => setFifoAmount(e.target.value)}
                            placeholder="10000"
                            style={{width:'100%', padding:'10px 14px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'1rem'}}
                        />
                    </div>
                    <button
                        onClick={runFifoOptimization}
                        disabled={!fifoAmount || fifoLoading}
                        style={{
                            padding:'10px 24px', height:'42px',
                            background: !fifoAmount ? 'var(--border-glass)' : 'linear-gradient(135deg, #00c864, #00a050)',
                            color:'white', border:'none', borderRadius:'8px', fontWeight:700,
                            cursor: !fifoAmount ? 'not-allowed' : 'pointer', fontSize:'0.9rem', transition:'all 0.2s'
                        }}>
                        {fifoLoading ? '⏳ Calculando...' : '🎯 Calcular estrategia óptima'}
                    </button>
                </div>
                {fifoError && (
                    <div style={{padding:'8px 14px', background:'rgba(220,50,50,0.15)', borderRadius:'8px', color:'var(--danger)', fontSize:'0.85rem', marginBottom:'1rem'}}>{fifoError}</div>
                )}

                {fifoResult && (() => {
                    const dest = fifoResult.destination_fund;
                    const isPortfolioIndex = dest && dest.tipo === 'portfolio_index';
                    return (
                        <div style={{marginTop:'1.5rem'}}>

                            {/* Fondo destino */}
                            {dest && (
                                <div style={{padding:'1rem 1.2rem', borderRadius:'10px', background: isPortfolioIndex ? 'rgba(0,200,100,0.07)' : 'rgba(0,150,255,0.07)', border: `1px solid ${isPortfolioIndex ? 'rgba(0,200,100,0.3)' : 'rgba(0,150,255,0.3)'}`, marginBottom:'1.2rem', display:'flex', flexWrap:'wrap', gap:'1rem', alignItems:'center', justifyContent:'space-between'}}>
                                    <div>
                                        <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'4px'}}>
                                            {isPortfolioIndex ? '✅ Fondo destino — ya en tu cartera' : '💡 Fondo destino sugerido'}
                                        </div>
                                        <div style={{fontWeight:700, color:'var(--text-primary)', fontSize:'0.95rem'}}>{dest.nombre}</div>
                                        <div style={{fontSize:'0.75rem', fontFamily:'monospace', color:'var(--text-secondary)', marginTop:'2px'}}>{dest.isin}</div>
                                    </div>
                                    <div style={{flex:1, minWidth:'200px'}}>
                                        <div style={{fontSize:'0.78rem', color:'var(--text-secondary)', lineHeight:1.5}}>{dest.motivo}</div>
                                    </div>
                                    <div>
                                        <span style={{padding:'3px 10px', borderRadius:'6px', fontSize:'0.75rem', fontWeight:600, background:'rgba(0,200,100,0.15)', color:'var(--success)'}}>
                                            {dest.is_index ? '📊 Indexado' : 'Fondo IIC'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Comparativa escenarios */}
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.5rem'}}>
                                <div style={{padding:'1.2rem', borderRadius:'12px', background:'rgba(220,50,50,0.08)', border:'1px solid rgba(220,50,50,0.3)'}}>
                                    <div style={{fontWeight:700, marginBottom:'0.75rem', color:'var(--danger)', fontSize:'0.9rem'}}>❌ Venta directa FIFO (sin traspasos)</div>
                                    <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem'}}>
                                            <span style={{color:'var(--text-secondary)'}}>Ganancia patrimonial</span>
                                            <strong>{fmtEur(fifoResult.escenario_directo.ganancia_patrimonial)}</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem'}}>
                                            <span style={{color:'var(--text-secondary)'}}>Impuesto IRPF</span>
                                            <strong style={{color:'var(--danger)'}}>-{fmtEur(fifoResult.escenario_directo.impuesto)}</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.9rem', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'6px', marginTop:'4px'}}>
                                            <span>Neto recibido</span>
                                            <strong>{fmtEur(fifoResult.escenario_directo.neto_recibido)}</strong>
                                        </div>
                                    </div>
                                </div>
                                <div style={{padding:'1.2rem', borderRadius:'12px', background:'rgba(0,200,100,0.08)', border:'1px solid rgba(0,200,100,0.3)'}}>
                                    <div style={{fontWeight:700, marginBottom:'0.75rem', color:'var(--success)', fontSize:'0.9rem'}}>✅ Óptimo: traspaso previo + reembolso</div>
                                    <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem'}}>
                                            <span style={{color:'var(--text-secondary)'}}>Ganancia patrimonial</span>
                                            <strong>{fmtEur(fifoResult.escenario_optimizado.ganancia_patrimonial)}</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem'}}>
                                            <span style={{color:'var(--text-secondary)'}}>Impuesto IRPF</span>
                                            <strong style={{color:'var(--success)'}}>-{fmtEur(fifoResult.escenario_optimizado.impuesto)}</strong>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.9rem', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'6px', marginTop:'4px'}}>
                                            <span>Neto recibido</span>
                                            <strong>{fmtEur(fifoResult.escenario_optimizado.neto_recibido)}</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Ahorro */}
                            <div style={{padding:'1rem 1.5rem', borderRadius:'12px', background:'rgba(0,200,100,0.12)', border:'2px solid rgba(0,200,100,0.4)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem', marginBottom:'1.5rem'}}>
                                <div>
                                    <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'2px'}}>Ahorro fiscal</div>
                                    <div style={{fontSize:'2rem', fontWeight:800, color:'var(--success)'}}>+{fmtEur(fifoResult.ahorro_fiscal)}</div>
                                </div>
                                <div style={{textAlign:'center'}}>
                                    <div style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom:'2px'}}>Reducción del impuesto</div>
                                    <div style={{fontSize:'1.4rem', fontWeight:700, color:'var(--success)'}}>{fifoResult.ahorro_fiscal_pct ? fifoResult.ahorro_fiscal_pct.toFixed(1) : '0.0'}%</div>
                                </div>
                                <div style={{textAlign:'center'}}>
                                    <div style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom:'2px'}}>Plusvalía diferida al destino</div>
                                    <div style={{fontSize:'1rem', fontWeight:600, color:'var(--warning)'}}>~{fmtEur(fifoResult.plusvalia_diferida)}</div>
                                </div>
                                <div style={{textAlign:'center'}}>
                                    <div style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom:'2px'}}>Importe a traspasar</div>
                                    <div style={{fontSize:'1rem', fontWeight:600, color:'#4db8ff'}}>{fmtEur(fifoResult.importe_traspasado)}</div>
                                </div>
                            </div>

                            {/* Plan detallado */}
                            <div
                                style={{display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', marginBottom:'0.75rem', userSelect:'none'}}
                                onClick={() => setFifoShowDetail(v => !v)}
                            >
                                <h5 style={{margin:0, fontWeight:600}}>📋 Plan de acción paso a paso</h5>
                                <span style={{color:'var(--text-secondary)', fontSize:'1.1rem'}}>{fifoShowDetail ? '▲' : '▼'}</span>
                            </div>

                            {fifoShowDetail && (
                                <div style={{display:'flex', flexDirection:'column', gap:'1.2rem'}}>
                                    {/* Paso 1: Traspasos */}
                                    {fifoResult.plan_traspasos && fifoResult.plan_traspasos.length > 0 && (
                                        <div style={{padding:'1rem', borderRadius:'10px', background:'rgba(0,150,255,0.07)', border:'1px solid rgba(0,150,255,0.25)'}}>
                                            <div style={{fontWeight:700, marginBottom:'0.5rem', color:'#4db8ff', fontSize:'0.95rem'}}>
                                                📤 Paso 1 — Traspasar {fmtEur(fifoResult.importe_traspasado)} a:
                                                <strong style={{marginLeft:'8px', color:'var(--text-primary)'}}>{dest ? dest.nombre : '—'}</strong>
                                                <span style={{marginLeft:'8px', fontSize:'0.72rem', fontFamily:'monospace', color:'var(--text-secondary)'}}>{dest ? dest.isin : ''}</span>
                                                <span style={{marginLeft:'10px', padding:'2px 8px', borderRadius:'4px', background:'rgba(0,200,100,0.15)', color:'var(--success)', fontWeight:600, fontSize:'0.75rem'}}>0€ impuesto</span>
                                            </div>
                                            <p style={{fontSize:'0.78rem', color:'var(--text-secondary)', margin:'0 0 0.75rem 0', lineHeight:1.5}}>
                                                Traspaso exento bajo Art. 94 Ley 35/2006 IRPF. La plusvalía latente queda diferida en el fondo destino.
                                            </p>
                                            <div style={{overflowX:'auto'}}>
                                                <table style={{width:'100%', minWidth:'600px', fontSize:'0.82rem'}}>
                                                    <thead><tr>
                                                        <th style={{textAlign:'left'}}>Fondo origen</th>
                                                        <th style={{textAlign:'left'}}>Lote compra</th>
                                                        <th style={{textAlign:'right'}}>Participaciones</th>
                                                        <th style={{textAlign:'right'}}>Importe</th>
                                                        <th style={{textAlign:'right'}}>Plusvalía diferida</th>
                                                        <th style={{textAlign:'right'}}>Precio compra</th>
                                                    </tr></thead>
                                                    <tbody>
                                                        {fifoResult.plan_traspasos.map((t, i) => (
                                                            <tr key={i}>
                                                                <td>
                                                                    <div style={{fontSize:'0.82rem', fontWeight:500}}>{t.Fondo}</div>
                                                                    <div style={{fontSize:'0.7rem', fontFamily:'monospace', color:'var(--text-secondary)'}}>{t.ISIN}</div>
                                                                </td>
                                                                <td style={{fontFamily:'monospace', color:'var(--text-secondary)', fontSize:'0.8rem'}}>{t.Fecha_Compra || '—'}</td>
                                                                <td style={{textAlign:'right'}}>{t.Participaciones ? t.Participaciones.toFixed(4) : '—'}</td>
                                                                <td style={{textAlign:'right', fontWeight:600}}>{fmtEur(t.Importe_Traspasado)}</td>
                                                                <td style={{textAlign:'right', color: (t.Plusvalia_Diferida || 0) >= 0 ? 'var(--warning)' : 'var(--danger)'}}>{(t.Plusvalia_Diferida || 0) >= 0 ? '+' : ''}{fmtEur(t.Plusvalia_Diferida)}</td>
                                                                <td style={{textAlign:'right', color:'var(--text-secondary)', fontSize:'0.78rem'}}>{t.Precio_Compra_Unitario ? `€${t.Precio_Compra_Unitario.toFixed(4)}` : '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {fifoResult.plan_traspasos && fifoResult.plan_traspasos.length === 0 && (
                                        <div style={{padding:'0.75rem 1rem', background:'rgba(0,200,100,0.07)', borderRadius:'8px', fontSize:'0.85rem', color:'var(--success)'}}>
                                            ✅ No se necesitan traspasos previos — los lotes más baratos ya están disponibles para reembolso directo.
                                        </div>
                                    )}

                                    {/* Paso 2: Reembolso */}
                                    <div style={{padding:'1rem', borderRadius:'10px', background:'rgba(0,200,100,0.07)', border:'1px solid rgba(0,200,100,0.25)'}}>
                                        <div style={{fontWeight:700, marginBottom:'0.5rem', color:'var(--success)', fontSize:'0.95rem'}}>
                                            💵 Paso 2 — Reembolsar {fmtEur(parseFloat(fifoAmount))} en efectivo
                                            <span style={{marginLeft:'10px', fontSize:'0.75rem', padding:'2px 8px', borderRadius:'4px', background:'rgba(0,200,100,0.15)', color:'var(--success)', fontWeight:600}}>
                                                Impuesto: {fmtEur(fifoResult.escenario_optimizado.impuesto)}
                                            </span>
                                        </div>
                                        <p style={{fontSize:'0.78rem', color:'var(--text-secondary)', margin:'0 0 0.75rem 0', lineHeight:1.5}}>
                                            {fifoResult.plan_traspasos && fifoResult.plan_traspasos.length > 0
                                                ? 'Una vez completado el traspaso (3–5 días hábiles), solicita el reembolso. FIFO opera ahora sobre los lotes más recientes.'
                                                : 'Solicita el reembolso directamente. El optimizador ha seleccionado los lotes con menor plusvalía de toda la cartera.'}
                                        </p>
                                        <div style={{overflowX:'auto'}}>
                                            <table style={{width:'100%', minWidth:'600px', fontSize:'0.82rem'}}>
                                                <thead><tr>
                                                    <th style={{textAlign:'left'}}>Fondo</th>
                                                    <th style={{textAlign:'left'}}>Lote compra</th>
                                                    <th style={{textAlign:'right'}}>Participaciones</th>
                                                    <th style={{textAlign:'right'}}>Importe</th>
                                                    <th style={{textAlign:'right'}}>Ganancia (tributa)</th>
                                                    <th style={{textAlign:'right'}}>Precio compra</th>
                                                </tr></thead>
                                                <tbody>
                                                    {(fifoResult.plan_reembolso || []).map((r, i) => (
                                                        <tr key={i}>
                                                            <td>
                                                                <div style={{fontSize:'0.82rem', fontWeight:500}}>{r.Fondo}</div>
                                                                <div style={{fontSize:'0.7rem', fontFamily:'monospace', color:'var(--text-secondary)'}}>{r.ISIN}</div>
                                                            </td>
                                                            <td style={{fontFamily:'monospace', color:'var(--text-secondary)', fontSize:'0.8rem'}}>{r.Fecha_Compra || '—'}</td>
                                                            <td style={{textAlign:'right'}}>{r.Participaciones ? r.Participaciones.toFixed(4) : '—'}</td>
                                                            <td style={{textAlign:'right', fontWeight:600}}>{fmtEur(r.Importe)}</td>
                                                            <td style={{textAlign:'right', color: (r.Ganancia_Patrimonial || 0) >= 0 ? 'var(--success)' : 'var(--danger)'}}>{(r.Ganancia_Patrimonial || 0) >= 0 ? '+' : ''}{fmtEur(r.Ganancia_Patrimonial)}</td>
                                                            <td style={{textAlign:'right', color:'var(--text-secondary)', fontSize:'0.78rem'}}>{r.Precio_Compra_Unitario ? `€${r.Precio_Compra_Unitario.toFixed(4)}` : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Cartera después */}
                                    {fifoResult.portfolio_after && fifoResult.portfolio_after.length > 0 && (
                                        <div style={{padding:'1rem', borderRadius:'10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.12)'}}>
                                            <div style={{fontWeight:700, marginBottom:'0.75rem', fontSize:'0.95rem'}}>
                                                📊 Cartera resultante tras las operaciones
                                            </div>
                                            <div style={{overflowX:'auto'}}>
                                                <table style={{width:'100%', minWidth:'560px', fontSize:'0.82rem'}}>
                                                    <thead><tr>
                                                        <th style={{textAlign:'left'}}>Fondo</th>
                                                        <th style={{textAlign:'right'}}>Antes</th>
                                                        <th style={{textAlign:'right'}}>Después</th>
                                                        <th style={{textAlign:'right'}}>Cambio</th>
                                                        <th style={{textAlign:'left'}}>Operación</th>
                                                    </tr></thead>
                                                    <tbody>
                                                        {fifoResult.portfolio_after.map((f, i) => {
                                                            const opLabel = {
                                                                'destino': '📥 Destino traspaso',
                                                                'reembolso': '💵 Reembolso',
                                                                'traspaso_out': '📤 Traspaso salida',
                                                                'traspaso_out+reembolso': '📤 Traspaso + reembolso',
                                                                'sin_cambio': '—',
                                                            }[f.operacion] || f.operacion;
                                                            const badgeColor = {
                                                                'destino': 'rgba(0,200,100,0.15)',
                                                                'reembolso': 'rgba(220,50,50,0.15)',
                                                                'traspaso_out': 'rgba(0,150,255,0.15)',
                                                                'traspaso_out+reembolso': 'rgba(255,165,0,0.15)',
                                                            }[f.operacion] || 'transparent';
                                                            const textColor = {
                                                                'destino': 'var(--success)',
                                                                'reembolso': 'var(--danger)',
                                                                'traspaso_out': '#4db8ff',
                                                                'traspaso_out+reembolso': 'var(--warning)',
                                                            }[f.operacion] || 'var(--text-secondary)';
                                                            return (
                                                                <tr key={i} style={{opacity: f.valor_despues === 0 && f.operacion !== 'destino' ? 0.45 : 1}}>
                                                                    <td>
                                                                        <div style={{fontWeight: f.es_destino ? 700 : 400, fontSize:'0.82rem'}}>{f.nombre}</div>
                                                                        <div style={{fontSize:'0.7rem', fontFamily:'monospace', color:'var(--text-secondary)'}}>{f.isin}</div>
                                                                    </td>
                                                                    <td style={{textAlign:'right', color:'var(--text-secondary)'}}>{fmtEur(f.valor_antes)}</td>
                                                                    <td style={{textAlign:'right', fontWeight:600}}>{fmtEur(f.valor_despues)}</td>
                                                                    <td style={{textAlign:'right', color: f.cambio_valor >= 0 ? 'var(--success)' : 'var(--danger)'}}>
                                                                        {f.cambio_valor >= 0 ? '+' : ''}{fmtEur(f.cambio_valor)}
                                                                    </td>
                                                                    <td>
                                                                        <span style={{padding:'2px 8px', borderRadius:'4px', background:badgeColor, color:textColor, fontSize:'0.75rem', fontWeight:500}}>
                                                                            {opLabel}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Notas */}
                                    <div style={{padding:'10px 14px', background:'rgba(255,165,0,0.07)', borderRadius:'8px', border:'1px solid rgba(255,165,0,0.2)', fontSize:'0.78rem', color:'var(--text-secondary)', lineHeight:1.6}}>
                                        ⚠️ <strong style={{color:'var(--warning)'}}>Base legal y advertencias:</strong> {fifoResult.notas}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* ── Optimizador de Retirada (FIFO simple) ── */}

            <div className="glass-panel" style={{padding:'2rem', marginBottom:'1.5rem'}}>
                <h3 style={{marginBottom:'1rem', fontWeight:600}}>💰 Retirada de Fondos — Optimización Fiscal</h3>
                <p style={{fontSize:'0.85rem', color:'var(--text-secondary)', marginBottom:'1.5rem'}}>
                    Calcula el plan de venta óptimo para minimizar impuestos sobre la ganancia patrimonial.
                    Usa contabilidad FIFO y prioriza los lotes con <strong>menor plusvalía relativa</strong> para diferir el máximo impuesto posible.
                </p>

                <div style={{display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap'}}>
                    <div style={{flex:'0 0 220px'}}>
                        <label style={{display:'block', fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Importe a retirar (€)</label>
                        <input
                            type="number"
                            min="100"
                            step="1000"
                            value={targetAmount}
                            onChange={e => setTargetAmount(e.target.value)}
                            placeholder="50000"
                            style={{width:'100%', padding:'10px 14px', borderRadius:'8px', border:'1px solid var(--border-glass)', background:'var(--bg-glass)', color:'white', fontSize:'1rem'}}
                        />
                    </div>
                    <button
                        onClick={runOptimization}
                        disabled={!targetAmount || loading}
                        style={{
                            padding:'10px 24px', height:'42px',
                            background: !targetAmount ? 'var(--border-glass)' : 'linear-gradient(135deg, var(--warning), hsl(25, 90%, 50%))',
                            color:'white', border:'none', borderRadius:'8px', fontWeight:700, cursor: !targetAmount ? 'not-allowed' : 'pointer',
                            fontSize:'0.9rem', transition:'all 0.2s'
                        }}>
                        {loading ? 'Calculando...' : '💰 Optimizar Retirada'}
                    </button>
                </div>
                {error && <div style={{marginTop:'12px', padding:'8px 14px', background:'rgba(220,50,50,0.15)', borderRadius:'8px', color:'var(--danger)', fontSize:'0.85rem'}}>{error}</div>}
            </div>

            {plan && (
                <div>
                    {/* Summary Cards */}
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'1rem', marginBottom:'1.5rem'}}>
                        <div className="glass-panel" style={{padding:'1rem', textAlign:'center'}}>
                            <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Importe Retirado</div>
                            <div style={{fontSize:'1.3rem', fontWeight:700, color:'var(--text-primary)'}}>€{plan.withdrawn_amount.toLocaleString('es-ES', {minimumFractionDigits:2})}</div>
                        </div>
                        <div className="glass-panel" style={{padding:'1rem', textAlign:'center'}}>
                            <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Ganancia Patrimonial</div>
                            <div style={{fontSize:'1.3rem', fontWeight:700, color: plan.total_capital_gain >= 0 ? 'var(--success)' : 'var(--danger)'}}>
                                €{plan.total_capital_gain.toLocaleString('es-ES', {minimumFractionDigits:2})}
                            </div>
                        </div>
                        <div className="glass-panel" style={{padding:'1rem', textAlign:'center'}}>
                            <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Impuestos Estimados</div>
                            <div style={{fontSize:'1.3rem', fontWeight:700, color:'var(--warning)'}}>€{plan.estimated_tax.toLocaleString('es-ES', {minimumFractionDigits:2})}</div>
                        </div>
                        <div className="glass-panel" style={{padding:'1rem', textAlign:'center'}}>
                            <div style={{fontSize:'0.7rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Neto tras Impuestos</div>
                            <div style={{fontSize:'1.3rem', fontWeight:700, color:'var(--accent-glow)'}}>€{plan.net_amount.toLocaleString('es-ES', {minimumFractionDigits:2})}</div>
                        </div>
                    </div>

                    {/* Withdrawal Plan Table */}
                    <div className="glass-panel" style={{padding:'1.5rem', marginBottom:'1.5rem'}}>
                        <h4 style={{marginBottom:'1rem', fontWeight:600}}>📋 Plan de Venta Óptimo</h4>
                        <div style={{overflowX:'auto'}}>
                            <table style={{width:'100%', minWidth:'700px'}}>
                                <thead>
                                    <tr>
                                        <th style={{textAlign:'left'}}>Fondo</th>
                                        <th>Fecha Compra</th>
                                        <th style={{textAlign:'right'}}>Participaciones</th>
                                        <th style={{textAlign:'right'}}>Importe Venta</th>
                                        <th style={{textAlign:'right'}}>Ganancia</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {plan.plan.map((step, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <div style={{fontWeight:600, fontSize:'0.9rem'}}>{step.Fondo}</div>
                                                <div style={{fontSize:'0.72rem', color:'var(--text-secondary)', fontFamily:'monospace'}}>{step.ISIN}</div>
                                            </td>
                                            <td style={{fontSize:'0.85rem'}}>{step.Fecha_Compra || '—'}</td>
                                            <td style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{step.Participaciones_Vendidas.toFixed(4)}</td>
                                            <td style={{textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums'}}>€{step.Importe_Retirado.toLocaleString('es-ES', {minimumFractionDigits:2})}</td>
                                            <td style={{textAlign:'right', fontWeight:600, color: step.Ganancia_Patrimonial >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric:'tabular-nums'}}>
                                                {step.Ganancia_Patrimonial >= 0 ? '+' : ''}€{step.Ganancia_Patrimonial.toLocaleString('es-ES', {minimumFractionDigits:2})}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Tax Bracket Breakdown */}
                    {plan.total_capital_gain > 0 && (
                        <div className="glass-panel" style={{padding:'1.5rem'}}>
                            <h4 style={{marginBottom:'1rem', fontWeight:600}}>🏛️ Desglose por Tramos Fiscales (Ahorro España 2024)</h4>
                            <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                                {getTaxBreakdown(plan.total_capital_gain).map((bracket, idx) => (
                                    <div key={idx} style={{display:'flex', alignItems:'center', gap:'12px', padding:'8px 12px', background:'rgba(0,0,0,0.15)', borderRadius:'8px'}}>
                                        <span style={{flex:'0 0 200px', fontSize:'0.8rem', color:'var(--text-secondary)'}}>{bracket.range}</span>
                                        <span style={{flex:'0 0 60px', fontWeight:700, color:'var(--warning)', fontSize:'0.9rem'}}>{bracket.rate}%</span>
                                        <span style={{flex:1, fontSize:'0.85rem', fontVariantNumeric:'tabular-nums'}}>Base: €{bracket.base.toLocaleString('es-ES', {minimumFractionDigits:2})}</span>
                                        <span style={{flex:'0 0 120px', textAlign:'right', fontWeight:600, color:'var(--danger)', fontVariantNumeric:'tabular-nums'}}>
                                            -€{bracket.tax.toLocaleString('es-ES', {minimumFractionDigits:2})}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


// ---------------- OPORTUNIDADES TAB ----------------

const TimingScoreBar = ({ score, height = 8 }) => {
    const color = score >= 75 ? '#00c853' : score >= 60 ? '#448aff' : score >= 40 ? '#90a4ae' : score >= 25 ? '#ffd600' : '#ff9100';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <div style={{ flex: 1, height: `${height}px`, background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ fontWeight: 700, color, fontSize: '0.9rem', minWidth: '32px', textAlign: 'right' }}>{score}</span>
        </div>
    );
};

const SubScoreBar = ({ label, icon, score }) => (
    <div style={{ flex: 1, minWidth: '100px' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>{icon} {label}</div>
        <TimingScoreBar score={score || 50} height={5} />
    </div>
);

const SignalBadge = ({ label, value, unit = '', good, neutral }) => {
    const isGood = typeof good === 'function' ? good(value) : false;
    const isNeutral = typeof neutral === 'function' ? neutral(value) : false;
    const color = isGood ? 'var(--success)' : isNeutral ? 'var(--text-secondary)' : 'var(--danger)';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', minWidth: '80px' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                {value != null ? `${typeof value === 'number' ? (Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1)) : value}${unit}` : '—'}
            </span>
        </div>
    );
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
        canvas.width = w * dpr; canvas.height = h * dpr;
        canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
        const mg = { top: 20, right: 20, bottom: 36, left: 60 };
        const pw = w - mg.left - mg.right, ph = h - mg.top - mg.bottom;
        const names = Object.keys(chartData);
        let allDates = [], allVals = [];
        names.forEach(n => { chartData[n].forEach(p => { allDates.push(new Date(p.date).getTime()); allVals.push(p.price); }); });
        const minX = Math.min(...allDates), maxX = Math.max(...allDates);
        const minY = Math.min(...allVals) * 0.95, maxY = Math.max(...allVals) * 1.05;
        const xS = ts => mg.left + (ts - minX) / (maxX - minX || 1) * pw;
        const yS = v => mg.top + ph - (v - minY) / (maxY - minY || 1) * ph;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '10px Inter, sans-serif';
        for (let i = 0; i <= 4; i++) {
            const v = minY + (maxY - minY) * (i / 4); const y = yS(v);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(mg.left, y); ctx.lineTo(mg.left + pw, y); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText(v.toFixed(0), mg.left - 8, y);
        }
        names.forEach((name, idx) => {
            const pts = chartData[name];
            ctx.beginPath(); ctx.strokeStyle = COLORS[idx % COLORS.length]; ctx.lineWidth = 2;
            pts.forEach((p, j) => { const x = xS(new Date(p.date).getTime()), y = yS(p.price); j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
            ctx.stroke();
        });
        let lx = mg.left + 8;
        names.forEach((name, idx) => {
            ctx.fillStyle = COLORS[idx % COLORS.length]; ctx.fillRect(lx, mg.top + 4, 12, 3);
            ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'left'; ctx.font = '10px Inter';
            const sn = name.length > 25 ? name.slice(0, 25) + '…' : name;
            ctx.fillText(sn, lx + 16, mg.top + 8); lx += ctx.measureText(sn).width + 32;
        });
    }, [chartData, dims]);
    return <div ref={containerRef} style={{ width: '100%' }}><canvas ref={canvasRef} /></div>;
};

// Filter input helper
const FilterInput = ({ label, value, onChange, placeholder, type = 'number', step = '1' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '110px' }}>
        <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</label>
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} step={step}
            style={{ padding: '4px 6px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--border-glass)', borderRadius: '4px', fontSize: '0.78rem', width: '100%' }} />
    </div>
);

// ── Timing Chart Canvas: visualizes WHY a fund has its timing score ──
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
        canvas.width = w * dpr; canvas.height = h * dpr;
        canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);

        // Layout: price panel top 72%, RSI panel bottom 28%
        const mg = { top: 16, right: 20, bottom: 32, left: 60 };
        const splitY = h * 0.72;
        const pw = w - mg.left - mg.right;
        const ph1 = splitY - mg.top - 8;
        const ph2 = h - splitY - mg.bottom - 4;

        // Collect all price values for Y scale
        const allSeries = [chart.price_series, chart.regression, chart.band_2_upper, chart.band_2_lower, chart.sma200].filter(Boolean);
        let allPrices = [];
        allSeries.forEach(s => s.forEach(p => { if (p.value != null) allPrices.push(p.value); if (p.price != null) allPrices.push(p.price); }));
        if (chart.pullback_levels) { allPrices.push(chart.pullback_levels.max_3m); }
        const minP = Math.min(...allPrices) * 0.998;
        const maxP = Math.max(...allPrices) * 1.002;

        const allDates = chart.price_series.map(p => new Date(p.date).getTime());
        const minX = Math.min(...allDates);
        const maxX = Math.max(...allDates);

        const xS = ts => mg.left + (ts - minX) / (maxX - minX || 1) * pw;
        const yS = v => mg.top + ph1 - (v - minP) / (maxP - minP || 1) * ph1;
        const yR = v => splitY + 4 + ph2 - (v / 100) * ph2; // RSI 0-100

        // ── Grid lines ──
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.font = '10px Inter, system-ui, sans-serif';
        for (let i = 0; i <= 4; i++) {
            const v = minP + (maxP - minP) * (i / 4);
            const y = yS(v);
            ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(mg.left, y); ctx.lineTo(mg.left + pw, y); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(v.toFixed(2), mg.left - 6, y);
        }

        // Helper: draw filled area between two series
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
            ctx.closePath(); ctx.fill();
        };

        // ── Bands ±2σ (red premium) ──
        drawBand(chart.band_2_upper, chart.band_1_upper, 'rgba(255,82,82,0.06)');
        // ── Bands ±1σ upper (yellow) ──
        drawBand(chart.band_1_upper, chart.regression, 'rgba(255,235,59,0.05)');
        // ── Bands ±1σ lower (green = discount zone) ──
        drawBand(chart.regression, chart.band_1_lower, 'rgba(76,175,80,0.08)');
        // ── Bands ±2σ lower (deep green) ──
        drawBand(chart.band_1_lower, chart.band_2_lower, 'rgba(76,175,80,0.12)');

        // ── Regression line ──
        if (chart.regression && chart.regression.length > 0) {
            ctx.beginPath(); ctx.strokeStyle = '#ffd600'; ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            chart.regression.forEach((p, j) => {
                const x = xS(new Date(p.date).getTime()), y = yS(p.value);
                j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke(); ctx.setLineDash([]);
        }

        // ── SMA-200 ──
        if (chart.sma200 && chart.sma200.length > 0) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(158,158,158,0.5)'; ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 3]);
            chart.sma200.forEach((p, j) => {
                const x = xS(new Date(p.date).getTime()), y = yS(p.value);
                j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke(); ctx.setLineDash([]);
        }

        // ── Pullback max 3M line ──
        if (chart.pullback_levels) {
            const y3m = yS(chart.pullback_levels.max_3m);
            ctx.beginPath(); ctx.strokeStyle = 'rgba(68,138,255,0.4)'; ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.moveTo(mg.left, y3m); ctx.lineTo(mg.left + pw, y3m);
            ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(68,138,255,0.5)'; ctx.textAlign = 'right';
            ctx.font = '9px Inter, system-ui, sans-serif';
            ctx.fillText(`Máx 3M: ${chart.pullback_levels.max_3m.toFixed(2)}`, mg.left + pw - 2, y3m - 4);
        }

        // ── Price line ──
        ctx.beginPath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        chart.price_series.forEach((p, j) => {
            const x = xS(new Date(p.date).getTime()), y = yS(p.price);
            j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // ── Crossovers ──
        if (chart.crossovers) {
            chart.crossovers.forEach(c => {
                if (!c.price) return;
                const x = xS(new Date(c.date).getTime()), y = yS(c.price);
                ctx.beginPath();
                if (c.type === 'bullish') {
                    ctx.fillStyle = '#00c853';
                    ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 8); ctx.lineTo(x + 5, y + 8);
                } else {
                    ctx.fillStyle = '#ff5252';
                    ctx.moveTo(x, y); ctx.lineTo(x - 5, y - 8); ctx.lineTo(x + 5, y - 8);
                }
                ctx.closePath(); ctx.fill();
            });
        }

        // ── Separator line ──
        ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
        ctx.moveTo(mg.left, splitY); ctx.lineTo(mg.left + pw, splitY); ctx.stroke();

        // ── RSI panel ──
        if (chart.rsi_series && chart.rsi_series.length > 0) {
            // RSI grid
            [30, 50, 70].forEach(lev => {
                const y = yR(lev);
                ctx.beginPath(); ctx.strokeStyle = lev === 50 ? 'rgba(255,255,255,0.08)' : (lev === 30 ? 'rgba(76,175,80,0.3)' : 'rgba(255,82,82,0.3)');
                ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
                ctx.moveTo(mg.left, y); ctx.lineTo(mg.left + pw, y); ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'right';
                ctx.font = '9px Inter, system-ui, sans-serif';
                ctx.fillText(lev.toString(), mg.left - 6, y);
            });
            // Oversold zone
            ctx.fillStyle = 'rgba(76,175,80,0.04)';
            ctx.fillRect(mg.left, yR(30), pw, yR(0) - yR(30));
            // Overbought zone
            ctx.fillStyle = 'rgba(255,82,82,0.04)';
            ctx.fillRect(mg.left, yR(100), pw, yR(70) - yR(100));

            // RSI line
            ctx.beginPath(); ctx.strokeStyle = '#ce93d8'; ctx.lineWidth = 1.5;
            chart.rsi_series.forEach((p, j) => {
                const x = xS(new Date(p.date).getTime()), y = yR(p.value);
                j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke();
            // RSI label
            ctx.fillStyle = '#ce93d8'; ctx.textAlign = 'left'; ctx.font = '10px Inter';
            ctx.fillText('RSI-14', mg.left + 4, splitY + 14);
        }

        // ── Legend ──
        ctx.textAlign = 'left'; ctx.font = '10px Inter, system-ui, sans-serif';
        let lx = mg.left + 4;
        const legendItems = [
            { color: '#ffffff', label: 'Precio', dash: false },
            { color: '#ffd600', label: 'Tendencia (log)', dash: true },
            { color: 'rgba(76,175,80,0.5)', label: 'Zona descuento (−σ)', dash: false },
            { color: 'rgba(255,82,82,0.5)', label: 'Zona premium (+σ)', dash: false },
            { color: 'rgba(158,158,158,0.5)', label: 'SMA-200', dash: true },
        ];
        legendItems.forEach(item => {
            if (lx > w - 100) return;
            ctx.fillStyle = item.color; ctx.fillRect(lx, mg.top + 2, 12, 3);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText(item.label, lx + 15, mg.top + 6);
            lx += ctx.measureText(item.label).width + 28;
        });

        // ── Date labels on X axis ──
        ctx.textAlign = 'center'; ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        const nLabels = Math.min(6, chart.price_series.length);
        const step = Math.floor(chart.price_series.length / nLabels);
        for (let i = 0; i < chart.price_series.length; i += step) {
            const p = chart.price_series[i];
            const d = new Date(p.date);
            ctx.fillText(`${d.getDate()}/${d.getMonth()+1}`, xS(d.getTime()), h - mg.bottom + 14);
        }
    }, [data, dims]);

    // Mouse hover for tooltip
    const handleMouseMove = useCallback((e) => {
        if (!data || !data.chart || !data.chart.price_series) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const { w } = dims;
        const mg = { left: 60, right: 20 };
        const pw = w - mg.left - mg.right;
        const allDates = data.chart.price_series.map(p => new Date(p.date).getTime());
        const minX = Math.min(...allDates), maxX = Math.max(...allDates);
        const t = (mx - mg.left) / pw;
        if (t < 0 || t > 1) { setTooltip(null); return; }
        const targetTime = minX + t * (maxX - minX);
        // Find closest point
        let closest = 0, closestDist = Infinity;
        data.chart.price_series.forEach((p, i) => {
            const diff = Math.abs(new Date(p.date).getTime() - targetTime);
            if (diff < closestDist) { closestDist = diff; closest = i; }
        });
        const pt = data.chart.price_series[closest];
        // Find regression value at same date
        const regPt = data.chart.regression?.find(r => r.date === pt.date);
        setTooltip({
            x: mx, date: pt.date, price: pt.price,
            regression: regPt?.value,
            deviation: regPt ? ((pt.price / regPt.value - 1) * 100).toFixed(2) : null,
        });
    }, [data, dims]);

    if (!data || !data.chart) return null;

    return (
        <div ref={containerRef} style={{ width: '100%', position: 'relative' }}
             onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
            {tooltip && (
                <div style={{
                    position: 'absolute', left: tooltip.x + 10, top: 20,
                    background: 'rgba(15,15,30,0.95)', padding: '6px 10px',
                    borderRadius: '6px', border: '1px solid var(--border-glass)',
                    fontSize: '0.72rem', color: '#fff', pointerEvents: 'none',
                    zIndex: 10, whiteSpace: 'nowrap',
                }}>
                    <div>{new Date(tooltip.date).toLocaleDateString('es-ES')}</div>
                    <div>Precio: <strong>{tooltip.price?.toFixed(4)}</strong></div>
                    {tooltip.regression && <div>Tendencia: {tooltip.regression.toFixed(4)}</div>}
                    {tooltip.deviation && (
                        <div style={{ color: parseFloat(tooltip.deviation) < 0 ? '#4caf50' : '#ff5252' }}>
                            Desviación: {tooltip.deviation}%
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const OportunidadesTab = () => {
    const [subTab, setSubTab] = useState('scanner');
    // Scanner state
    const [opportunities, setOpportunities] = useState(null);
    const [loading, setLoading] = useState(false);
    // Weight configuration
    const [weights, setWeights] = useState(null);
    const [presets, setPresets] = useState(null);
    const [defaultWeights, setDefaultWeights] = useState(null);
    const [activePreset, setActivePreset] = useState('balanced');
    const [showWeightPanel, setShowWeightPanel] = useState(false);
    // Chart state (per fund)
    const [chartData, setChartData] = useState({}); // {isin: data}
    const [chartLoading, setChartLoading] = useState({});
    const [expandedCharts, setExpandedCharts] = useState({});
    // Explorer state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [enrichedFunds, setEnrichedFunds] = useState([]);
    const [enriching, setEnriching] = useState(false);
    const [enrichProgress, setEnrichProgress] = useState('');
    const [filters, setFilters] = useState({ ret5yMin: '', ret1yMax: '', terMax: '', sharpeMin: '', ratingMin: '', timingMin: '', category: '' });
    const [sortCol, setSortCol] = useState('timing_score');
    const [sortDir, setSortDir] = useState('desc');
    // Comparison state (integrated in explorer)
    const [selectedFunds, setSelectedFunds] = useState([]);
    const [comparison, setComparison] = useState(null);
    const [comparingLoading, setComparingLoading] = useState(false);
    // Fund detail
    const [fundDetail, setFundDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Load presets on mount
    useEffect(() => {
        fetch('/api/portfolio/timing-presets')
            .then(r => r.json())
            .then(d => {
                setPresets(d.presets);
                setDefaultWeights(d.default_weights);
                // Try to load saved weights from localStorage
                const saved = localStorage.getItem('timing_weights');
                const savedPreset = localStorage.getItem('timing_preset');
                if (saved) {
                    try { setWeights(JSON.parse(saved)); } catch { setWeights(d.default_weights); }
                } else {
                    setWeights(d.default_weights);
                }
                if (savedPreset) setActivePreset(savedPreset);
            })
            .catch(() => {
                const fallback = { trend: 0.25, pullback: 0.15, divergence: 0.15, rsi: 0.15, vol_regime: 0.10, short_term: 0.20 };
                setWeights(fallback);
                setDefaultWeights(fallback);
            });
    }, []);

    const loadOpportunities = () => {
        setLoading(true);
        const url = weights
            ? `/api/portfolio/opportunities?weights=${encodeURIComponent(JSON.stringify(weights))}`
            : '/api/portfolio/opportunities';
        fetch(url)
            .then(r => r.json())
            .then(d => { setOpportunities(d); setLoading(false); })
            .catch(() => setLoading(false));
    };
    useEffect(() => { if (weights) loadOpportunities(); }, []);

    const applyPreset = (presetKey) => {
        if (!presets || !presets[presetKey]) return;
        const w = presets[presetKey].weights;
        setWeights(w);
        setActivePreset(presetKey);
        localStorage.setItem('timing_weights', JSON.stringify(w));
        localStorage.setItem('timing_preset', presetKey);
    };

    const updateWeight = (key, val) => {
        setWeights(prev => {
            const updated = { ...prev, [key]: Math.max(0, parseFloat(val) || 0) };
            return updated;
        });
        setActivePreset('custom');
    };

    const normalizeWeights = () => {
        if (!weights) return;
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        if (total <= 0) return;
        const normalized = {};
        for (const [k, v] of Object.entries(weights)) {
            normalized[k] = Math.round((v / total) * 100) / 100;
        }
        // Fix rounding to sum exactly 1.0
        const diff = 1.0 - Object.values(normalized).reduce((a, b) => a + b, 0);
        const firstKey = Object.keys(normalized)[0];
        normalized[firstKey] = Math.round((normalized[firstKey] + diff) * 100) / 100;
        setWeights(normalized);
        localStorage.setItem('timing_weights', JSON.stringify(normalized));
    };

    const applyWeightsAndReload = () => {
        normalizeWeights();
        localStorage.setItem('timing_weights', JSON.stringify(weights));
        loadOpportunities();
    };

    const toggleChart = (isin) => {
        const isExpanded = expandedCharts[isin];
        if (isExpanded) {
            setExpandedCharts(prev => ({ ...prev, [isin]: false }));
            return;
        }
        setExpandedCharts(prev => ({ ...prev, [isin]: true }));
        if (chartData[isin]) return; // Already loaded
        setChartLoading(prev => ({ ...prev, [isin]: true }));
        fetch(`/api/portfolio/opportunity/${isin}/chart-data?months=12`)
            .then(r => r.json())
            .then(d => {
                setChartData(prev => ({ ...prev, [isin]: d }));
                setChartLoading(prev => ({ ...prev, [isin]: false }));
            })
            .catch(() => setChartLoading(prev => ({ ...prev, [isin]: false })));
    };

    const handleSearch = () => {
        if (searchQuery.trim().length < 2) return;
        setSearching(true); setEnrichedFunds([]); setComparison(null);
        fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(searchQuery)}&limit=40`)
            .then(r => r.json())
            .then(d => { setSearchResults(d); setSearching(false); })
            .catch(() => setSearching(false));
    };

    const toggleFundSelect = (isin, name) => {
        setSelectedFunds(prev => {
            const existing = prev.find(f => f.isin === isin);
            if (existing) return prev.filter(f => f.isin !== isin);
            if (prev.length >= 6) return prev;
            return [...prev, { isin, name }];
        });
    };

    const handleCompare = () => {
        if (selectedFunds.length < 2) return;
        setComparingLoading(true);
        fetch('/api/portfolio/compare-funds?years=5', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(selectedFunds.map(f => f.isin)),
        }).then(r => r.json()).then(d => { setComparison(d); setComparingLoading(false); }).catch(() => setComparingLoading(false));
    };

    const viewFundDetail = (isin) => {
        setDetailLoading(true); setFundDetail(null);
        fetch(`/api/portfolio/opportunity/${isin}`)
            .then(r => r.json()).then(d => { setFundDetail(d); setDetailLoading(false); }).catch(() => setDetailLoading(false));
    };

    // Enrich search results
    const handleEnrich = async () => {
        const isins = searchResults.map(r => r.isin);
        if (isins.length === 0) return;
        setEnriching(true); setEnrichProgress('Cargando métricas...');
        const batchSize = 10;
        let all = [];
        for (let i = 0; i < isins.length; i += batchSize) {
            const batch = isins.slice(i, i + batchSize);
            setEnrichProgress(`Procesando ${i + 1}-${Math.min(i + batchSize, isins.length)} de ${isins.length}...`);
            try {
                const res = await fetch('/api/portfolio/fund/enrich', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(batch),
                });
                const data = await res.json();
                all = [...all, ...data];
            } catch { /* skip */ }
        }
        setEnrichedFunds(all); setEnriching(false); setEnrichProgress('');
    };

    // Filter + sort enriched data
    const filteredFunds = useMemo(() => {
        let list = [...enrichedFunds];
        const f = filters;
        if (f.ret5yMin) list = list.filter(fd => (fd.returns?.['5y'] ?? -999) >= +f.ret5yMin);
        if (f.ret1yMax) list = list.filter(fd => (fd.returns?.['1y'] ?? 999) <= +f.ret1yMax);
        if (f.terMax) list = list.filter(fd => fd.expense_ratio != null && fd.expense_ratio * 100 <= +f.terMax);
        if (f.sharpeMin) list = list.filter(fd => (fd.signals?.sharpe ?? fd.metrics?.sharpe_ratio ?? -999) >= +f.sharpeMin);
        if (f.ratingMin) list = list.filter(fd => (fd.rating ?? 0) >= +f.ratingMin);
        if (f.timingMin) list = list.filter(fd => (fd.signals?.timing_score ?? 0) >= +f.timingMin);
        if (f.category) list = list.filter(fd => (fd.category || '').toLowerCase().includes(f.category.toLowerCase()));
        const col = sortCol;
        list.sort((a, b) => {
            let va, vb;
            if (col === 'timing_score') { va = a.signals?.timing_score ?? 0; vb = b.signals?.timing_score ?? 0; }
            else if (col === 'ret_5y') { va = a.returns?.['5y'] ?? -999; vb = b.returns?.['5y'] ?? -999; }
            else if (col === 'ret_3y') { va = a.returns?.['3y'] ?? -999; vb = b.returns?.['3y'] ?? -999; }
            else if (col === 'ret_1y') { va = a.returns?.['1y'] ?? -999; vb = b.returns?.['1y'] ?? -999; }
            else if (col === 'sharpe') { va = a.signals?.sharpe ?? a.metrics?.sharpe_ratio ?? -999; vb = b.signals?.sharpe ?? b.metrics?.sharpe_ratio ?? -999; }
            else if (col === 'ter') { va = a.expense_ratio ?? 999; vb = b.expense_ratio ?? 999; }
            else if (col === 'rating') { va = a.rating ?? 0; vb = b.rating ?? 0; }
            else if (col === 'volatility') { va = a.signals?.volatility_pct ?? 999; vb = b.signals?.volatility_pct ?? 999; }
            else if (col === 'max_dd') { va = a.signals?.max_drawdown_pct ?? -999; vb = b.signals?.max_drawdown_pct ?? -999; }
            else if (col === 'z_trend') { va = a.signals?.z_trend ?? 0; vb = b.signals?.z_trend ?? 0; }
            else { va = 0; vb = 0; }
            return sortDir === 'desc' ? vb - va : va - vb;
        });
        return list;
    }, [enrichedFunds, filters, sortCol, sortDir]);

    const toggleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortCol(col); setSortDir('desc'); }
    };
    const SortHeader = ({ col, children }) => (
        <th onClick={() => toggleSort(col)} style={{ padding: '6px 4px', textAlign: 'center', fontSize: '0.65rem', textTransform: 'uppercase', color: sortCol === col ? '#89f7fe' : 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {children} {sortCol === col ? (sortDir === 'desc' ? '▼' : '▲') : ''}
        </th>
    );

    const subTabs = [
        { id: 'scanner', label: '🔍 Escáner Cartera' },
        { id: 'explorer', label: '🌐 Explorador' },
    ];

    return (
        <div>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.25)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-glass)', width: 'fit-content' }}>
                {subTabs.map(st => (
                    <button key={st.id} onClick={() => setSubTab(st.id)} style={{
                        padding: '8px 16px', background: subTab === st.id ? 'var(--accent-glow)' : 'transparent',
                        color: subTab === st.id ? '#000' : 'var(--text-primary)', border: 'none', borderRadius: '8px',
                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem'
                    }}>{st.label}</button>
                ))}
            </div>

            {/* ── SCANNER ── */}
            {subTab === 'scanner' && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>Timing de Compra — Tu Cartera</h3>
                        <button onClick={loadOpportunities} disabled={loading} style={{ padding: '6px 16px', background: 'var(--accent-glow)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
                            {loading ? '⏳ Analizando...' : '🔄 Recalcular'}
                        </button>
                        <button onClick={() => setShowWeightPanel(v => !v)} style={{ padding: '6px 16px', background: showWeightPanel ? 'rgba(137,247,254,0.15)' : 'rgba(255,255,255,0.08)', color: showWeightPanel ? '#89f7fe' : 'var(--text-secondary)', border: '1px solid ' + (showWeightPanel ? 'rgba(137,247,254,0.3)' : 'var(--border-glass)'), borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}>
                            ⚙️ Configurar pesos
                        </button>
                    </div>

                    <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            <strong>¿Cómo funciona?</strong> Cada fondo se puntúa por <strong>momento de entrada</strong> con 6 dimensiones:
                            <strong> 📐 Tendencia</strong> (z-score vs regresión log-lineal) ·
                            <strong> 📉 Pullback</strong> (caída desde máx. 3M) ·
                            <strong> 🔀 Divergencia</strong> (momentum 1M vs 6M) ·
                            <strong> 📊 RSI</strong> (sobrevendido/comprado) ·
                            <strong> 🌊 Vol. Régimen</strong> (vol actual vs histórica) ·
                            <strong> ⚡ Corto Plazo</strong> (dips 3d/1w/2w).
                            Los umbrales se <strong>ajustan por tipo de fondo</strong> (RV, RF, Liquidez).
                            <br/>
                            <span style={{color:'#00c853'}}>🟢 ≥75 Descuento significativo</span> · <span style={{color:'#448aff'}}>🔵 ≥60 Ligeramente por debajo</span> · <span style={{color:'#90a4ae'}}>⚪ ≥40 En tendencia</span> · <span style={{color:'#ffd600'}}>🟡 ≥25 Por encima</span> · <span style={{color:'#ff9100'}}>🟠 &lt;25 Rally extendido</span>
                        </div>
                    </div>

                    {/* ── Weight configuration panel ── */}
                    {showWeightPanel && weights && (
                        <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>⚙️ Pesos de las dimensiones</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                    Total: {(Object.values(weights).reduce((a,b) => a+b, 0) * 100).toFixed(0)}%
                                </span>
                            </div>
                            {/* Presets */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                {presets && Object.entries(presets).map(([key, preset]) => (
                                    <button key={key} onClick={() => applyPreset(key)} style={{
                                        padding: '5px 12px', fontSize: '0.75rem', fontWeight: 600,
                                        background: activePreset === key ? 'var(--accent-glow)' : 'rgba(255,255,255,0.06)',
                                        color: activePreset === key ? '#000' : 'var(--text-primary)',
                                        border: activePreset === key ? 'none' : '1px solid var(--border-glass)',
                                        borderRadius: '6px', cursor: 'pointer',
                                    }}>
                                        {preset.label}
                                    </button>
                                ))}
                                {activePreset === 'custom' && (
                                    <span style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#ce93d8', background: 'rgba(206,147,216,0.1)', borderRadius: '6px', border: '1px solid rgba(206,147,216,0.3)' }}>
                                        🎛️ Personalizado
                                    </span>
                                )}
                            </div>
                            {presets && presets[activePreset] && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                    {presets[activePreset].description}
                                </div>
                            )}
                            {/* Sliders */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                                {[
                                    { key: 'trend', icon: '📐', label: 'Tendencia' },
                                    { key: 'pullback', icon: '📉', label: 'Pullback' },
                                    { key: 'divergence', icon: '🔀', label: 'Divergencia' },
                                    { key: 'rsi', icon: '📊', label: 'RSI' },
                                    { key: 'vol_regime', icon: '🌊', label: 'Vol. Régimen' },
                                    { key: 'short_term', icon: '⚡', label: 'Corto Plazo' },
                                ].map(dim => (
                                    <div key={dim.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.72rem', minWidth: '90px', color: 'var(--text-secondary)' }}>{dim.icon} {dim.label}</span>
                                        <input type="range" min="0" max="50" step="1"
                                            value={Math.round((weights[dim.key] || 0) * 100)}
                                            onChange={e => updateWeight(dim.key, parseInt(e.target.value) / 100)}
                                            style={{ flex: 1, accentColor: '#89f7fe' }} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '32px', textAlign: 'right', color: '#89f7fe' }}>
                                            {Math.round((weights[dim.key] || 0) * 100)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
                                <button onClick={applyWeightsAndReload} style={{
                                    padding: '6px 18px', background: 'var(--accent-glow)', color: '#000',
                                    border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
                                }}>✓ Aplicar y recalcular</button>
                                <button onClick={normalizeWeights} style={{
                                    padding: '6px 14px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-glass)', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                                }}>Normalizar a 100%</button>
                                {defaultWeights && (
                                    <button onClick={() => { setWeights(defaultWeights); setActivePreset('balanced'); }} style={{
                                        padding: '6px 14px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                                        border: '1px solid var(--border-glass)', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                                    }}>Reset defaults</button>
                                )}
                            </div>
                        </div>
                    )}

                    {loading && <div className="loading-state"><div className="spinner"></div><p>Analizando fondos de tu cartera...</p></div>}

                    {opportunities && !loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {opportunities.map(opp => (
                                <div key={opp.isin} className="glass-panel" style={{ padding: '1.2rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                        <div style={{ flex: '1 1 280px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>{opp.name}</span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{opp.isin}</span>
                                                {opp.fund_type && <span style={{ fontSize: '0.62rem', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', color: 'var(--text-secondary)' }}>{opp.fund_type}</span>}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', marginBottom: '8px' }}>{opp.level}</div>
                                            <div style={{ maxWidth: '300px', marginBottom: '8px' }}><TimingScoreBar score={opp.timing_score} /></div>
                                            <div style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                                                <SubScoreBar label="Tendencia" icon="📐" score={opp.trend_score} />
                                                <SubScoreBar label="Pullback" icon="📉" score={opp.pullback_score} />
                                                <SubScoreBar label="Divergencia" icon="🔀" score={opp.divergence_score} />
                                                <SubScoreBar label="RSI" icon="📊" score={opp.rsi_score} />
                                                <SubScoreBar label="Vol.Rég" icon="🌊" score={opp.vol_regime_score} />
                                                <SubScoreBar label="Corto P." icon="⚡" score={opp.short_term_score} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', flex: '1 1 420px', justifyContent: 'flex-end', alignContent: 'flex-start' }}>
                                            <SignalBadge label="Z-Trend" value={opp.z_trend} good={v => v < -0.5} neutral={v => v >= -0.5 && v <= 1.0} />
                                            <SignalBadge label="Pull. 3M" value={opp.pullback_3m_pct} unit="%" good={v => v < -5} neutral={v => v > -3} />
                                            <SignalBadge label="Mom 1M" value={opp.momentum_1m} unit="%" good={v => v < -3} neutral={v => v > -1 && v < 5} />
                                            <SignalBadge label="Mom 6M" value={opp.momentum_6m} unit="%" good={v => v > 5} neutral={v => v >= -3} />
                                            <SignalBadge label="RSI-14" value={opp.rsi_14} good={v => v < 30} neutral={v => v >= 30 && v <= 70} />
                                            <SignalBadge label="Vol.Ratio" value={opp.vol_regime_ratio} good={v => v < 0.8} neutral={v => v >= 0.8 && v <= 1.2} />
                                            <SignalBadge label="Mom 3D" value={opp.momentum_3d} unit="%" good={v => v < -1} neutral={v => v > -0.5 && v < 2} />
                                            <SignalBadge label="Mom 1W" value={opp.momentum_1w} unit="%" good={v => v < -2} neutral={v => v > -1 && v < 3} />
                                            <SignalBadge label="Pull. 1W" value={opp.pullback_1w_pct} unit="%" good={v => v < -2} neutral={v => v > -1} />
                                            <SignalBadge label="Sharpe" value={opp.sharpe} good={v => v > 0.8} neutral={v => v >= 0.3} />
                                            <SignalBadge label="MaxDD" value={opp.max_drawdown_pct} unit="%" good={v => v > -15} neutral={v => v > -25} />
                                        </div>
                                    </div>
                                    {/* Short-term nudge */}
                                    {opp.short_term_score != null && opp.short_term_score >= 70 && opp.timing_score >= 50 && (
                                        <div style={{ marginTop: '8px', padding: '6px 12px', background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: '8px', fontSize: '0.78rem', color: '#69f0ae' }}>
                                            🎯 Esta semana parece buen momento para aportar — dip reciente en tendencia favorable
                                        </div>
                                    )}
                                    {opp.short_term_score != null && opp.short_term_score < 30 && opp.timing_score >= 40 && (
                                        <div style={{ marginTop: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            ⏳ Sin señal a corto plazo — considerar esperar unos días dentro del mes
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>{opp.description}</div>
                                        <button onClick={() => toggleChart(opp.isin)} style={{
                                            padding: '5px 14px', background: expandedCharts[opp.isin] ? 'rgba(137,247,254,0.1)' : 'rgba(255,255,255,0.06)',
                                            color: expandedCharts[opp.isin] ? '#89f7fe' : 'var(--text-secondary)',
                                            border: `1px solid ${expandedCharts[opp.isin] ? 'rgba(137,247,254,0.3)' : 'var(--border-glass)'}`,
                                            borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: '12px',
                                        }}>
                                            {expandedCharts[opp.isin] ? '▲ Ocultar gráfico' : '📈 Ver gráfico'}
                                        </button>
                                    </div>
                                    {/* Timing chart */}
                                    {expandedCharts[opp.isin] && (
                                        <div style={{ marginTop: '10px' }}>
                                            {chartLoading[opp.isin] && (
                                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                                    <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
                                                    Cargando datos de gráfico...
                                                </div>
                                            )}
                                            {chartData[opp.isin] && !chartData[opp.isin].error && (
                                                <TimingChartCanvas data={chartData[opp.isin]} signals={opp} />
                                            )}
                                            {chartData[opp.isin] && chartData[opp.isin].error && (
                                                <div style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                                    ⚠️ {chartData[opp.isin].error}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {opportunities && opportunities.length === 0 && !loading && (
                        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No se encontraron fondos con suficiente histórico para analizar.</div>
                    )}
                </div>
            )}

            {/* ── EXPLORER ── */}
            {subTab === 'explorer' && (
                <div>
                    <h3 style={{ marginBottom: '1rem' }}>Explorador de Fondos</h3>

                    {/* Search bar */}
                    <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="text" placeholder="Buscar por ISIN o nombre (ej: MSCI World, renta fija, IE00B4L5Y983...)"
                                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--border-glass)', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }} />
                            <button onClick={handleSearch} disabled={searching} style={{ padding: '10px 20px', background: 'var(--accent-glow)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: searching ? 'not-allowed' : 'pointer' }}>
                                {searching ? '⏳' : '🔍 Buscar'}
                            </button>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                            💡 Busca fondos del universo Finect. Tras la búsqueda, pulsa "Cargar métricas" para ver retornos, Sharpe, timing y más.
                        </div>
                    </div>

                    {/* Search results — pre-enrich */}
                    {searchResults.length > 0 && enrichedFunds.length === 0 && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{searchResults.length} fondos encontrados</span>
                                <button onClick={handleEnrich} disabled={enriching} style={{ padding: '8px 18px', background: 'linear-gradient(135deg,#448aff,#00c853)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: enriching ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                                    {enriching ? `⏳ ${enrichProgress}` : '📊 Cargar métricas de todos'}
                                </button>
                            </div>
                            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', marginBottom: '1rem' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead><tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fondo</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ISIN</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cartera</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Acciones</th>
                                    </tr></thead>
                                    <tbody>
                                        {searchResults.map((r, idx) => (
                                            <tr key={r.isin + idx} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>{r.name || r.isin}</td>
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.isin}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.in_portfolio ? <span style={{ color: 'var(--success)' }}>✓</span> : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                    <button onClick={() => viewFundDetail(r.isin)} style={{ padding: '4px 10px', background: 'rgba(76,161,175,0.3)', color: '#89f7fe', border: '1px solid rgba(76,161,175,0.4)', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer' }}>📊 Analizar</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Enriched screener table + filters */}
                    {enrichedFunds.length > 0 && (
                        <div>
                            {/* Filter bar */}
                            <div className="glass-panel" style={{ padding: '10px 14px', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>🔧 Filtros</span>
                                    <button onClick={() => setFilters({ ret5yMin: '', ret1yMax: '', terMax: '', sharpeMin: '', ratingMin: '', timingMin: '', category: '' })} style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>Limpiar</button>
                                    <button onClick={() => setEnrichedFunds([])} style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', marginLeft: 'auto' }}>← Volver a resultados</button>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <FilterInput label="Ret. 5Y mín (%)" value={filters.ret5yMin} onChange={e => setFilters(f => ({...f, ret5yMin: e.target.value}))} placeholder="ej: 10" step="0.5" />
                                    <FilterInput label="Ret. 1Y máx (%)" value={filters.ret1yMax} onChange={e => setFilters(f => ({...f, ret1yMax: e.target.value}))} placeholder="ej: 20" step="0.5" />
                                    <FilterInput label="TER máx (%)" value={filters.terMax} onChange={e => setFilters(f => ({...f, terMax: e.target.value}))} placeholder="ej: 0.5" step="0.05" />
                                    <FilterInput label="Sharpe mín" value={filters.sharpeMin} onChange={e => setFilters(f => ({...f, sharpeMin: e.target.value}))} placeholder="ej: 0.5" step="0.1" />
                                    <FilterInput label="Rating mín ★" value={filters.ratingMin} onChange={e => setFilters(f => ({...f, ratingMin: e.target.value}))} placeholder="1-5" step="1" />
                                    <FilterInput label="Timing mín" value={filters.timingMin} onChange={e => setFilters(f => ({...f, timingMin: e.target.value}))} placeholder="ej: 50" step="5" />
                                    <FilterInput label="Categoría" value={filters.category} onChange={e => setFilters(f => ({...f, category: e.target.value}))} placeholder="ej: equity" type="text" />
                                </div>
                            </div>

                            {/* Results count */}
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                {filteredFunds.length} de {enrichedFunds.length} fondos · Clic en cabeceras para ordenar · Selecciona ≥2 fondos para comparar
                            </div>

                            {/* Screener table */}
                            <div className="glass-panel" style={{ padding: '0', overflow: 'auto', maxHeight: '500px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1050px' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                                        <tr style={{ background: 'rgba(10,10,25,0.98)' }}>
                                            <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)', width: '32px' }}>☐</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '0.65rem', color: 'var(--text-secondary)', minWidth: '180px', position: 'sticky', left: 0, background: 'rgba(10,10,25,0.98)', zIndex: 3 }}>Fondo</th>
                                            <SortHeader col="timing_score">Timing</SortHeader>
                                            <SortHeader col="ret_5y">Ret 5Y</SortHeader>
                                            <SortHeader col="ret_3y">Ret 3Y</SortHeader>
                                            <SortHeader col="ret_1y">Ret 1Y</SortHeader>
                                            <SortHeader col="sharpe">Sharpe</SortHeader>
                                            <SortHeader col="ter">TER</SortHeader>
                                            <SortHeader col="rating">Rating</SortHeader>
                                            <SortHeader col="volatility">Volat.</SortHeader>
                                            <SortHeader col="max_dd">MaxDD</SortHeader>
                                            <SortHeader col="z_trend">Z-Trend</SortHeader>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredFunds.map(fd => {
                                            const sc = fd.signals || {};
                                            const ts = sc.timing_score ?? 0;
                                            const tsColor = ts >= 75 ? '#00c853' : ts >= 60 ? '#448aff' : ts >= 40 ? '#90a4ae' : ts >= 25 ? '#ffd600' : '#ff9100';
                                            const isSelected = selectedFunds.some(f => f.isin === fd.isin);
                                            return (
                                                <tr key={fd.isin} onClick={() => toggleFundSelect(fd.isin, fd.name)} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isSelected ? 'rgba(0,200,83,0.08)' : 'transparent' }}>
                                                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                                        <span style={{ color: isSelected ? '#00c853' : 'var(--text-secondary)' }}>{isSelected ? '☑' : '☐'}</span>
                                                    </td>
                                                    <td style={{ padding: '5px 8px', position: 'sticky', left: 0, background: isSelected ? 'rgba(10,20,15,0.95)' : 'rgba(15,15,30,0.95)', zIndex: 1 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.78rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fd.name}</div>
                                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{fd.isin} · {fd.fund_type || '—'}</div>
                                                    </td>
                                                    <td style={{ padding: '4px', textAlign: 'center', fontWeight: 700, color: tsColor }}>{ts || '—'}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center', fontWeight: 600, color: (fd.returns?.['5y'] ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{fd.returns?.['5y'] != null ? `${fd.returns['5y'].toFixed(1)}%` : '—'}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center', color: (fd.returns?.['3y'] ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{fd.returns?.['3y'] != null ? `${fd.returns['3y'].toFixed(1)}%` : '—'}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center', color: (fd.returns?.['1y'] ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{fd.returns?.['1y'] != null ? `${fd.returns['1y'].toFixed(1)}%` : '—'}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{sc.sharpe != null ? sc.sharpe.toFixed(2) : (fd.metrics?.sharpe_ratio != null ? fd.metrics.sharpe_ratio.toFixed(2) : '—')}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fd.expense_ratio != null ? `${(fd.expense_ratio * 100).toFixed(2)}%` : '—'}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center' }}>{fd.rating ? '★'.repeat(fd.rating) : '—'}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{sc.volatility_pct != null ? `${sc.volatility_pct.toFixed(1)}%` : '—'}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--danger)' }}>{sc.max_drawdown_pct != null ? `${sc.max_drawdown_pct.toFixed(1)}%` : '—'}</td>
                                                    <td style={{ padding: '4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: (sc.z_trend ?? 0) < -0.5 ? 'var(--success)' : (sc.z_trend ?? 0) > 1 ? 'var(--danger)' : 'var(--text-secondary)' }}>{sc.z_trend != null ? sc.z_trend.toFixed(2) : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Selection bar + compare button */}
                            {selectedFunds.length > 0 && (
                                <div className="glass-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleccionados ({selectedFunds.length}/6):</span>
                                    {selectedFunds.map(f => (
                                        <span key={f.isin} onClick={(e) => { e.stopPropagation(); toggleFundSelect(f.isin, f.name); }} style={{ padding: '3px 8px', background: 'rgba(0,200,83,0.2)', border: '1px solid rgba(0,200,83,0.3)', borderRadius: '20px', fontSize: '0.72rem', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            {f.name.length > 18 ? f.name.slice(0, 18) + '…' : f.name}
                                            <span style={{ color: 'var(--danger)', fontWeight: 700 }}>×</span>
                                        </span>
                                    ))}
                                    <button onClick={handleCompare} disabled={comparingLoading || selectedFunds.length < 2} style={{ padding: '5px 14px', background: selectedFunds.length >= 2 ? 'var(--accent-glow)' : 'var(--border-glass)', color: selectedFunds.length >= 2 ? '#000' : 'var(--text-secondary)', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.8rem', cursor: selectedFunds.length >= 2 ? 'pointer' : 'not-allowed', marginLeft: 'auto' }}>
                                        {comparingLoading ? '⏳ Comparando...' : '⚖️ Comparar seleccionados'}
                                    </button>
                                </div>
                            )}

                            {/* Inline comparison panel */}
                            {comparison && !comparingLoading && (
                                <div className="glass-panel" style={{ padding: '1.2rem', marginTop: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <h4 style={{ margin: 0, fontWeight: 600 }}>⚖️ Comparación lado a lado</h4>
                                        <button onClick={() => setComparison(null)} style={{ padding: '3px 10px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>✕ Cerrar</button>
                                    </div>
                                    {comparison.chart_data && Object.keys(comparison.chart_data).length > 0 && (
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>📈 Evolución Normalizada (Base 100, 5 años)</div>
                                            <CompareChart chartData={comparison.chart_data} />
                                        </div>
                                    )}
                                    <div style={{ overflow: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                                                    <th style={{ padding: '10px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-secondary)', position: 'sticky', left: 0, background: 'rgba(15,15,30,0.95)' }}>Métrica</th>
                                                    {comparison.funds.map((f, i) => (
                                                        <th key={f.isin} style={{ padding: '10px', textAlign: 'center', fontSize: '0.78rem', color: COLORS[i % COLORS.length], minWidth: '130px' }}>
                                                            <div style={{ fontWeight: 700 }}>{f.name.length > 20 ? f.name.slice(0, 20) + '…' : f.name}</div>
                                                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{f.isin}</div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* Timing score */}
                                                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: '0.82rem', position: 'sticky', left: 0, background: 'rgba(15,15,30,0.9)' }}>⏱️ Timing Score</td>
                                                    {comparison.funds.map(f => (
                                                        <td key={f.isin} style={{ padding: '8px 10px', textAlign: 'center' }}><TimingScoreBar score={f.signals?.timing_score ?? 50} height={6} /></td>
                                                    ))}
                                                </tr>
                                                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <td style={{ padding: '8px 10px', fontSize: '0.82rem', position: 'sticky', left: 0, background: 'rgba(15,15,30,0.9)' }}>Señal</td>
                                                    {comparison.funds.map(f => <td key={f.isin} style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.78rem' }}>{f.level}</td>)}
                                                </tr>
                                                {/* Returns */}
                                                {['1y', '3y', '5y'].map(period => (
                                                    <tr key={period} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <td style={{ padding: '8px 10px', fontSize: '0.82rem', position: 'sticky', left: 0, background: 'rgba(15,15,30,0.9)' }}>Ret. {period}</td>
                                                        {comparison.funds.map(f => {
                                                            const ret = f.returns?.[period];
                                                            return <td key={f.isin} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: ret != null ? (ret >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-secondary)' }}>{ret != null ? `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%` : '—'}</td>;
                                                        })}
                                                    </tr>
                                                ))}
                                                {/* Key metrics */}
                                                {[
                                                    { k: 'category', l: 'Categoría', fmt: (f) => f.category || '—' },
                                                    { k: 'ter', l: 'TER', fmt: (f) => f.expense_ratio != null ? `${(f.expense_ratio * 100).toFixed(2)}%` : '—' },
                                                    { k: 'rating', l: 'Rating ★', fmt: (f) => f.rating ? '★'.repeat(f.rating) : '—' },
                                                    { k: 'srri', l: 'Riesgo (SRRI)', fmt: (f) => f.srri || '—' },
                                                ].map(({ k, l, fmt }) => (
                                                    <tr key={k} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <td style={{ padding: '8px 10px', fontSize: '0.82rem', position: 'sticky', left: 0, background: 'rgba(15,15,30,0.9)' }}>{l}</td>
                                                        {comparison.funds.map(f => <td key={f.isin} style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.78rem' }}>{fmt(f)}</td>)}
                                                    </tr>
                                                ))}
                                                {/* Quant metrics */}
                                                {[
                                                    { key: 'sharpe_ratio', label: 'Sharpe' },
                                                    { key: 'standard_deviation', label: 'Volatilidad' },
                                                    { key: 'max_drawdown', label: 'Max Drawdown' },
                                                ].map(({ key, label }) => (
                                                    <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <td style={{ padding: '8px 10px', fontSize: '0.82rem', position: 'sticky', left: 0, background: 'rgba(15,15,30,0.9)' }}>{label}</td>
                                                        {comparison.funds.map(f => {
                                                            const val = f.metrics?.[key];
                                                            return <td key={f.isin} style={{ padding: '8px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{val != null ? (key === 'max_drawdown' ? `${(val * 100).toFixed(1)}%` : val.toFixed(3)) : '—'}</td>;
                                                        })}
                                                    </tr>
                                                ))}
                                                {/* Timing signals */}
                                                {[
                                                    { key: 'z_trend', label: 'Z-Trend', unit: '' },
                                                    { key: 'pullback_3m_pct', label: 'Pullback 3M', unit: '%' },
                                                    { key: 'momentum_1m', label: 'Mom. 1M', unit: '%' },
                                                    { key: 'momentum_6m', label: 'Mom. 6M', unit: '%' },
                                                ].map(({ key, label, unit }) => (
                                                    <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <td style={{ padding: '8px 10px', fontSize: '0.82rem', position: 'sticky', left: 0, background: 'rgba(15,15,30,0.9)' }}>{label}</td>
                                                        {comparison.funds.map(f => {
                                                            const val = f.signals?.[key];
                                                            return <td key={f.isin} style={{ padding: '8px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{val != null ? `${val.toFixed(1)}${unit}` : '—'}</td>;
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Single fund detail panel */}
                    {detailLoading && <div className="loading-state" style={{marginTop:'1rem'}}><div className="spinner"></div><p>Analizando fondo...</p></div>}
                    {fundDetail && !detailLoading && !fundDetail.error && (
                        <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontWeight: 700 }}>{fundDetail.name}</h4>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{fundDetail.isin}</span>
                                    {fundDetail.category && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>| {fundDetail.category}</span>}
                                    {fundDetail.fund_type && <span style={{ fontSize: '0.62rem', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', color: 'var(--text-secondary)', marginLeft: '8px' }}>{fundDetail.fund_type}</span>}
                                </div>
                                <button onClick={() => setFundDetail(null)} style={{ padding: '3px 10px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>✕ Cerrar</button>
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>{fundDetail.level}</div>
                                <TimingScoreBar score={fundDetail.timing_score} />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                                <SubScoreBar label="Tendencia" icon="📐" score={fundDetail.trend_score} />
                                <SubScoreBar label="Pullback" icon="📉" score={fundDetail.pullback_score} />
                                <SubScoreBar label="Divergencia" icon="🔀" score={fundDetail.divergence_score} />
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                                <SignalBadge label="Z-Trend" value={fundDetail.z_trend} good={v => v < -0.5} neutral={v => v >= -0.5 && v <= 1.0} />
                                <SignalBadge label="Pull. 3M" value={fundDetail.pullback_3m_pct} unit="%" good={v => v < -5} neutral={v => v > -3} />
                                <SignalBadge label="Mom 1M" value={fundDetail.momentum_1m} unit="%" good={v => v < -3} neutral={v => v > -1 && v < 5} />
                                <SignalBadge label="Mom 6M" value={fundDetail.momentum_6m} unit="%" good={v => v > 5} neutral={v => v >= -3} />
                                <SignalBadge label="Sharpe" value={fundDetail.sharpe} good={v => v > 0.8} neutral={v => v >= 0.3} />
                                <SignalBadge label="Vol." value={fundDetail.volatility_pct} unit="%" good={v => v < 10} neutral={v => v >= 10 && v <= 20} />
                                <SignalBadge label="MaxDD" value={fundDetail.max_drawdown_pct} unit="%" good={v => v > -15} neutral={v => v > -25} />
                                <SignalBadge label="Calmar" value={fundDetail.calmar} good={v => v > 1} neutral={v => v > 0.3} />
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{fundDetail.description}</div>
                        </div>
                    )}
                    {fundDetail && fundDetail.error && !detailLoading && (
                        <div className="glass-panel" style={{ padding: '1rem', color: 'var(--danger)', marginTop: '1rem' }}>⚠️ {fundDetail.error}</div>
                    )}
                </div>
            )}
        </div>
    );
};


// ---------------- CARTERAS GUARDADAS & FAVORITOS ----------------
// Sub-tabs: Mis Carteras | Favoritos | Comparar

// Palette for portfolio colors
const PORTFOLIO_COLORS = ['#4ca1af','#a78bfa','#4ade80','#fb923c','#f472b6','#60a5fa','#facc15','#34d399'];

const CarterasTab = () => {
    const [subTab, setSubTab] = useState('carteras');
    // ── Mis Carteras state ──
    const [portfolios, setPortfolios] = useState([]);
    const [loadingPortfolios, setLoadingPortfolios] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [cloningCurrent, setCloningCurrent] = useState(false);
    // ── Favoritos state ──
    const [favorites, setFavorites] = useState([]);
    const [loadingFavs, setLoadingFavs] = useState(true);
    const [favSearch, setFavSearch] = useState('');
    const [favResults, setFavResults] = useState([]);
    const [favSearching, setFavSearching] = useState(false);
    const favDebounceRef = React.useRef(null);
    // ── Comparar state ──
    const [comparePortA, setComparePortA] = useState('current'); // 'current' | portfolio_id
    const [comparePortB, setComparePortB] = useState('');
    const [compareYears, setCompareYears] = useState(5);
    const [comparing, setComparing] = useState(false);
    const [compareResult, setCompareResult] = useState(null);
    const [compareError, setCompareError] = useState('');
    // Live positions (for "Mi cartera actual")
    const [livePositions, setLivePositions] = useState(null);

    // ── Load data ──
    const loadPortfolios = () => {
        setLoadingPortfolios(true);
        fetch('/api/portfolio/portfolios')
            .then(r => r.json())
            .then(d => { setPortfolios(d.portfolios || []); setLoadingPortfolios(false); })
            .catch(() => setLoadingPortfolios(false));
    };
    const loadFavorites = () => {
        setLoadingFavs(true);
        fetch('/api/portfolio/favorites')
            .then(r => r.json())
            .then(d => { setFavorites(d.favorites || []); setLoadingFavs(false); })
            .catch(() => setLoadingFavs(false));
    };
    const loadLivePositions = () => {
        fetch('/api/portfolio/positions')
            .then(r => r.json())
            .then(d => setLivePositions(d.positions || []))
            .catch(() => {});
    };

    useEffect(() => {
        loadPortfolios();
        loadFavorites();
        loadLivePositions();
    }, []);

    // ── Favorites search ──
    const handleFavSearch = (q) => {
        setFavSearch(q);
        if (favDebounceRef.current) clearTimeout(favDebounceRef.current);
        if (q.length < 2) { setFavResults([]); return; }
        favDebounceRef.current = setTimeout(() => {
            setFavSearching(true);
            fetch(`/api/portfolio/fund/search?q=${encodeURIComponent(q)}&limit=10`)
                .then(r => r.json())
                .then(res => { setFavResults(res); setFavSearching(false); })
                .catch(() => setFavSearching(false));
        }, 300);
    };

    const addToFavorites = (fund) => {
        fetch('/api/portfolio/favorites', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isin: fund.isin, name: fund.name || fund.isin }),
        }).then(r => r.json()).then(fav => {
            setFavorites(prev => [fav, ...prev.filter(f => f.isin !== fav.isin)]);
            setFavSearch(''); setFavResults([]);
        }).catch(() => {});
    };

    const removeFavorite = (isin) => {
        fetch(`/api/portfolio/favorites/${isin}`, { method: 'DELETE' })
            .then(() => setFavorites(prev => prev.filter(f => f.isin !== isin)))
            .catch(() => {});
    };

    // ── Portfolios delete ──
    const deletePortfolio = (id) => {
        if (!confirm('¿Eliminar esta cartera guardada?')) return;
        fetch(`/api/portfolio/portfolios/${id}`, { method: 'DELETE' })
            .then(() => setPortfolios(prev => prev.filter(p => p.id !== id)))
            .catch(() => {});
    };

    // ── Clone current ──
    const cloneCurrent = () => {
        const name = prompt('Nombre para la copia:', 'Copia de Mi Cartera');
        if (!name) return;
        setCloningCurrent(true);
        fetch('/api/portfolio/portfolios/clone-current', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        }).then(r => r.json()).then(p => { setPortfolios(prev => [p, ...prev]); setCloningCurrent(false); })
          .catch(() => setCloningCurrent(false));
    };

    // ── Comparar ──
    const buildPortDef = (selId, customName) => {
        if (selId === 'current') {
            if (!livePositions || livePositions.length === 0) return null;
            const total = livePositions.reduce((s, p) => s + (p.Valor_Actual || 0), 0) || 1;
            return {
                name: customName || 'Mi Cartera Actual',
                funds: livePositions
                    .filter(p => p.ISIN && (p.Valor_Actual || 0) > 0)
                    .map(p => ({ isin: p.ISIN, name: p.Fondo || p.ISIN, weight: (p.Valor_Actual || 0) / total })),
            };
        }
        const port = portfolios.find(p => String(p.id) === String(selId));
        if (!port) return null;
        return { name: port.name, funds: port.funds || [] };
    };

    const runCompare = async () => {
        if (!comparePortA || !comparePortB) return;
        // Load full portfolio data if needed
        const getFullPort = async (selId) => {
            if (selId === 'current') return buildPortDef('current');
            const res = await fetch(`/api/portfolio/portfolios/${selId}`).then(r => r.json());
            return { name: res.name, funds: res.funds || [] };
        };

        setComparing(true); setCompareResult(null); setCompareError('');
        try {
            const [pa, pb] = await Promise.all([getFullPort(comparePortA), getFullPort(comparePortB)]);
            if (!pa || !pa.funds?.length) { setCompareError('La cartera A no tiene fondos.'); setComparing(false); return; }
            if (!pb || !pb.funds?.length) { setCompareError('La cartera B no tiene fondos.'); setComparing(false); return; }
            const res = await fetch('/api/portfolio/portfolios/compare', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portfolio_a: pa, portfolio_b: pb, years: compareYears }),
            }).then(r => r.json());
            setCompareResult(res);
        } catch (e) {
            setCompareError('Error al comparar. Inténtalo de nuevo.');
        }
        setComparing(false);
    };

    // ── Styles ──
    const subTabBtn = (id) => ({
        padding: '7px 18px', borderRadius: '20px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
        background: subTab === id ? 'var(--accent-glow)' : 'transparent',
        color: subTab === id ? '#000' : 'var(--text-primary)',
        border: subTab === id ? 'none' : '1px solid var(--border-glass)',
    });
    const signColor = v => v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text-primary)';

    return (
        <div>
            {/* Sub-tab bar */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <button style={subTabBtn('carteras')} onClick={() => setSubTab('carteras')}>🗂️ Mis Carteras</button>
                <button style={subTabBtn('favoritos')} onClick={() => setSubTab('favoritos')}>⭐ Favoritos</button>
                <button style={subTabBtn('comparar')} onClick={() => setSubTab('comparar')}>⚖️ Comparar</button>
            </div>

            {/* ── MIS CARTERAS ── */}
            {subTab === 'carteras' && (
                <div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>Carteras Guardadas</h3>
                        <button onClick={() => setShowCreateForm(!showCreateForm)} style={{ padding: '7px 16px', background: 'var(--accent-glow)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>
                            ＋ Nueva cartera
                        </button>
                        <button onClick={cloneCurrent} disabled={cloningCurrent} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.07)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>
                            {cloningCurrent ? '⏳ Clonando...' : '📋 Clonar cartera actual'}
                        </button>
                    </div>

                    {/* Create form */}
                    {showCreateForm && (
                        <CreatePortfolioForm
                            onSave={(p) => { setPortfolios(prev => [p, ...prev]); setShowCreateForm(false); }}
                            onCancel={() => setShowCreateForm(false)}
                            portfolios={portfolios}
                        />
                    )}

                    {loadingPortfolios && <div style={{ color: 'var(--text-secondary)', padding: '1rem' }}>Cargando carteras...</div>}

                    {!loadingPortfolios && portfolios.length === 0 && !showCreateForm && (
                        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No tienes carteras guardadas. Crea una nueva o clona tu cartera actual para empezar.
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {portfolios.map(port => (
                            <div key={port.id}>
                                {editingId === port.id ? (
                                    <CreatePortfolioForm
                                        initialData={port}
                                        onSave={(updated) => { setPortfolios(prev => prev.map(p => p.id === updated.id ? updated : p)); setEditingId(null); }}
                                        onCancel={() => setEditingId(null)}
                                        isEdit
                                        portfolios={portfolios.filter(p => p.id !== port.id)}
                                    />
                                ) : (
                                    <PortfolioCard
                                        port={port}
                                        onEdit={() => setEditingId(port.id)}
                                        onDelete={() => deletePortfolio(port.id)}
                                        onCompare={() => { setComparePortA(String(port.id)); setSubTab('comparar'); }}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── FAVORITOS ── */}
            {subTab === 'favoritos' && (
                <div>
                    <h3 style={{ marginBottom: '1rem' }}>⭐ Fondos Favoritos</h3>
                    {/* Search */}
                    <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem', position: 'relative' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            Añade fondos a tu watchlist personal para seguirlos aunque no estén en tu cartera.
                        </div>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={favSearch}
                                onChange={e => handleFavSearch(e.target.value)}
                                placeholder="Buscar por ISIN o nombre (ej: IE00B4L5Y983)..."
                                style={{ width: '100%', padding: '9px 14px', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.04)', color: 'white', fontSize: '0.85rem', boxSizing: 'border-box' }}
                            />
                            {favSearching && <span style={{ position: 'absolute', right: '12px', top: '10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Buscando...</span>}
                            {favResults.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, maxHeight: '240px', overflowY: 'auto', background: 'rgba(15,20,35,0.98)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '0 0 8px 8px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                                    {favResults.map(r => (
                                        <div key={r.isin}
                                            onClick={() => addToFavorites(r)}
                                            style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,215,0,0.1)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.83rem', color: '#FFD700' }}>{r.isin}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.name?.substring(0, 60)}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                {r.in_portfolio && <span style={{ fontSize: '0.68rem', padding: '2px 7px', background: 'rgba(74,162,175,0.2)', borderRadius: '10px', color: 'var(--accent-glow)' }}>En cartera</span>}
                                                {favorites.some(f => f.isin === r.isin)
                                                    ? <span style={{ color: '#FFD700', fontSize: '0.75rem' }}>⭐ En favoritos</span>
                                                    : <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>➕ Añadir</span>
                                                }
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {loadingFavs && <div style={{ color: 'var(--text-secondary)' }}>Cargando favoritos...</div>}
                    {!loadingFavs && favorites.length === 0 && (
                        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No tienes fondos favoritos aún. Busca un fondo arriba para añadirlo.
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {favorites.map(fav => (
                            <div key={fav.isin} className="glass-panel" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '1.1rem' }}>⭐</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fav.name || fav.isin}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{fav.isin}</div>
                                    {fav.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>📝 {fav.notes}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                                    <a href={`https://www.finect.com/fondos-inversion/${fav.isin}`} target="_blank" rel="noreferrer"
                                        style={{ fontSize: '0.78rem', color: 'var(--accent-glow)', textDecoration: 'none', padding: '4px 10px', border: '1px solid rgba(74,162,175,0.3)', borderRadius: '6px' }}>
                                        🔗 Finect
                                    </a>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{new Date(fav.added_at * 1000).toLocaleDateString('es-ES')}</span>
                                    <button onClick={() => removeFavorite(fav.isin)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>✕ Quitar</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── COMPARAR ── */}
            {subTab === 'comparar' && (
                <div>
                    <h3 style={{ marginBottom: '1rem' }}>⚖️ Comparar Carteras</h3>

                    <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            {[
                                { label: 'Cartera A', value: comparePortA, set: setComparePortA, color: '#FFD700' },
                                { label: 'Cartera B', value: comparePortB, set: setComparePortB, color: '#4ade80' },
                            ].map(({ label, value, set, color }) => (
                                <div key={label}>
                                    <label style={{ fontSize: '0.78rem', color, fontWeight: 700, display: 'block', marginBottom: '4px' }}>{label}</label>
                                    <select value={value} onChange={e => set(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${color}40`, background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <option value="">— Selecciona cartera —</option>
                                        <option value="current">📊 Mi Cartera Actual (posiciones reales)</option>
                                        {portfolios.map(p => (
                                            <option key={p.id} value={String(p.id)}>🗂️ {p.name} ({p.fund_count} fondos)</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Periodo histórico:</label>
                            {[1, 3, 5, 10].map(y => (
                                <button key={y} onClick={() => setCompareYears(y)} style={{ padding: '5px 14px', borderRadius: '16px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', border: compareYears === y ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)', background: compareYears === y ? 'var(--accent-glow)' : 'transparent', color: compareYears === y ? '#000' : 'var(--text-primary)' }}>
                                    {y}A
                                </button>
                            ))}
                            <button onClick={runCompare} disabled={comparing || !comparePortA || !comparePortB} style={{ marginLeft: 'auto', padding: '8px 22px', background: comparePortA && comparePortB ? 'var(--accent-glow)' : 'var(--border-glass)', color: comparePortA && comparePortB ? '#000' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: comparePortA && comparePortB ? 'pointer' : 'not-allowed', fontSize: '0.85rem' }}>
                                {comparing ? '⏳ Comparando...' : '⚖️ Comparar'}
                            </button>
                        </div>
                        {compareError && <div style={{ marginTop: '8px', color: 'var(--danger)', fontSize: '0.82rem' }}>⚠️ {compareError}</div>}
                        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            💡 Puedes comparar tu cartera real vs. una cartera hipotética, o dos carteras guardadas entre sí.
                        </div>
                    </div>

                    {compareResult && !comparing && (
                        <CompareResultPanel result={compareResult} years={compareYears} signColor={signColor} />
                    )}
                </div>
            )}
        </div>
    );
};

// ── Portfolio card (read-only) ──
const PortfolioCard = ({ port, onEdit, onDelete, onCompare }) => {
    const [expanded, setExpanded] = useState(false);
    const [fullData, setFullData] = useState(null);

    const expand = () => {
        if (!expanded && !fullData) {
            fetch(`/api/portfolio/portfolios/${port.id}`)
                .then(r => r.json())
                .then(d => setFullData(d));
        }
        setExpanded(!expanded);
    };

    return (
        <div className="glass-panel" style={{ padding: '1rem', borderLeft: `4px solid ${port.color || '#4ca1af'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '1rem' }}>{port.name}</span>
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'rgba(255,255,255,0.07)', borderRadius: '10px', color: 'var(--text-secondary)' }}>
                            {port.fund_count} fondos
                        </span>
                    </div>
                    {port.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{port.description}</div>}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Última edición: {new Date(port.updated_at * 1000).toLocaleDateString('es-ES')}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button onClick={expand} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}>
                        {expanded ? '▲ Ocultar' : '▼ Ver fondos'}
                    </button>
                    <button onClick={onCompare} style={{ padding: '5px 12px', background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: '6px', color: '#FFD700', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                        ⚖️ Comparar
                    </button>
                    <button onClick={onEdit} style={{ padding: '5px 12px', background: 'rgba(137,247,254,0.07)', border: '1px solid rgba(137,247,254,0.2)', borderRadius: '6px', color: '#89f7fe', fontSize: '0.75rem', cursor: 'pointer' }}>
                        ✏️ Editar
                    </button>
                    <button onClick={onDelete} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer' }}>
                        🗑️
                    </button>
                </div>
            </div>
            {expanded && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    {!fullData ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Cargando fondos...</span>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {(fullData.funds || []).map(f => (
                                <div key={f.isin} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem' }}>
                                    <div style={{ width: `${Math.max(f.weight * 100, 2)}px`, height: '6px', background: port.color || '#4ca1af', borderRadius: '3px', flexShrink: 0, maxWidth: '100px' }} />
                                    <span style={{ fontWeight: 600, color: 'var(--accent-glow)', minWidth: '50px' }}>{(f.weight * 100).toFixed(1)}%</span>
                                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.72rem', minWidth: '80px' }}>{f.isin}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || f.isin}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Create / Edit portfolio form ──
const CreatePortfolioForm = ({ onSave, onCancel, initialData = null, isEdit = false, portfolios = [] }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [color, setColor] = useState(initialData?.color || '#4ca1af');
    const [funds, setFunds] = useState(initialData?.funds ? [...initialData.funds] : []);
    const [saving, setSaving] = useState(false);

    // Input mode: 'pct' = porcentajes (slider), 'eur' = importes (€)
    // If initialData carries a total_value (e.g. from a clone), start in EUR mode
    const [inputMode, setInputMode] = useState(initialData?.total_value > 0 ? 'eur' : 'pct');
    // Total portfolio amount when using EUR mode
    const [totalAmount, setTotalAmount] = useState(
        initialData?.total_value > 0 ? String(initialData.total_value.toFixed(2)) : ''
    );
    // Per-fund EUR amounts (isin -> string)
    const [eurAmounts, setEurAmounts] = useState({});

    // Traspaso planner state
    const [showTraspaso, setShowTraspaso] = useState(false);
    const [trasTransfers, setTrasTransfers] = useState([]);
    const [trasStandalone, setTrasStandalone] = useState([]);
    const [trasFromISIN, setTrasFromISIN] = useState('');
    const [trasToISIN, setTrasToISIN] = useState('');
    const [trasToIsNew, setTrasToIsNew] = useState(false);
    const [trasToNewFund, setTrasToNewFund] = useState(null);
    const [trasAmount, setTrasAmount] = useState('');
    const [trasAddFund, setTrasAddFund] = useState(null);
    const [trasAddAmount, setTrasAddAmount] = useState('');
    // Valor total de la cartera en € — exclusivo del planificador de traspasos
    // Se inicializa desde total_value (clones y edición) para no tener que reintroducirlo
    const [trasPlanTotal, setTrasPlanTotal] = useState(
        initialData?.total_value > 0 ? String(initialData.total_value.toFixed(2)) : ''
    );

    // Import from another portfolio
    const [importPortId, setImportPortId] = useState('');
    const [importLoading, setImportLoading] = useState(false);

    // If editing but no funds loaded yet, fetch them
    useEffect(() => {
        if (isEdit && initialData?.id && funds.length === 0 && (initialData.fund_count || 0) > 0) {
            fetch(`/api/portfolio/portfolios/${initialData.id}`)
                .then(r => r.json())
                .then(d => setFunds(d.funds || []));
        }
    }, []);

    // ── Current fund balance in € (used by the traspaso planner) ──
    const getFundBalance = (isin) => {
        const eurAmt = parseFloat(eurAmounts[isin]);
        if (eurAmt >= 0 && eurAmounts[isin] !== undefined) return eurAmt;
        const fund = funds.find(f => f.isin === isin);
        if (!fund) return 0;
        // Fallback: derive from weight × real total (totalEurEntered) or weight × 100
        const tot = totalEurEntered > 0 ? totalEurEntered : (parseFloat(totalAmount) || 0);
        return tot > 0 ? fund.weight * tot : fund.weight * 100;
    };

    // Load full portfolio and merge its funds into current form
    const importFromPortfolio = (portId) => {
        if (!portId) return;
        setImportLoading(true);
        fetch(`/api/portfolio/portfolios/${portId}`)
            .then(r => r.json())
            .then(data => {
                const toAdd = (data.funds || []).filter(f => !funds.some(x => x.isin === f.isin));
                if (toAdd.length === 0) { setImportLoading(false); return; }
                const srcTotal = data.total_value || 0;
                setFunds(prev => {
                    const next = [...prev, ...toAdd.map(f => ({ isin: f.isin, name: f.name || f.isin, weight: f.weight || 0 }))];
                    return next;
                });
                if (srcTotal > 0 && inputMode === 'eur') {
                    setEurAmounts(prev => {
                        const next = { ...prev };
                        toAdd.forEach(f => { next[f.isin] = ((f.weight || 0) * srcTotal).toFixed(2); });
                        return next;
                    });
                }
                setImportLoading(false);
                setImportPortId('');
            })
            .catch(() => setImportLoading(false));
    };

    // ── Fund helpers ──
    const addFund = (fund) => {
        if (funds.some(f => f.isin === fund.isin)) return;
        setFunds(prev => {
            const next = [...prev, { isin: fund.isin, name: fund.name || fund.isin, weight: 0 }];
            // In EUR mode: new fund starts at €0 and weights stay proportional to existing amounts
            // Weights will be recalculated when user enters an amount
            return next;
        });
        if (inputMode === 'eur') {
            // Register the new fund with €0 explicitly so the existing funds' values are never touched
            setEurAmounts(prev => ({ ...prev, [fund.isin]: '0' }));
        }
    };
    const removeFund = (isin) => {
        setFunds(prev => prev.filter(f => f.isin !== isin));
        setEurAmounts(prev => { const n = { ...prev }; delete n[isin]; return n; });
    };

    // PCT mode: update weight from slider/input
    const updateWeightPct = (isin, val) =>
        setFunds(prev => prev.map(f => f.isin === isin ? { ...f, weight: parseFloat(val) / 100 } : f));

    // EUR mode: update per-fund € amount
    // Other funds' € values are NEVER touched — only percentages are recalculated.
    const updateEurAmount = (isin, val) => {
        setEurAmounts(prev => {
            const next = { ...prev, [isin]: val };
            // Recompute weights using only the explicit values in next
            const total = Object.values(next).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            if (total > 0) {
                setFunds(prevFunds => prevFunds.map(f => ({
                    ...f,
                    weight: (parseFloat(next[f.isin]) || 0) / total,
                })));
            }
            return next;
        });
    };

    // EUR mode: the total field is used ONLY to seed an equal distribution
    // when no explicit amounts have been entered yet.
    // Once any explicit amounts exist, editing the total field does nothing
    // to avoid silently reshuffling values the user has already set.
    const applyTotalAmount = () => {
        const total = parseFloat(totalAmount) || 0;
        if (total <= 0 || funds.length === 0) return;
        const hasAmounts = funds.some(f => parseFloat(eurAmounts[f.isin]) > 0);
        if (!hasAmounts) {
            // Seed: distribute total equally among all funds
            const perFund = total / funds.length;
            const newAmounts = {};
            funds.forEach(f => { newAmounts[f.isin] = perFund.toFixed(2); });
            setEurAmounts(newAmounts);
            setFunds(prev => prev.map(f => ({ ...f, weight: 1 / prev.length })));
        }
        // If amounts already exist: do nothing — user controls amounts explicitly.
        // Use "Normalizar" to scale to a target total.
    };

    const normalizeWeights = () => {
        if (inputMode === 'eur') {
            // Re-derive weights from current € amounts so they sum to exactly 1.0
            // (fixes floating-point drift — € amounts themselves are NOT changed)
            const total = totalEurEntered;
            if (total <= 0) return;
            setFunds(prev => prev.map(f => ({
                ...f,
                weight: (parseFloat(eurAmounts[f.isin]) || 0) / total,
            })));
        } else {
            const total = funds.reduce((s, f) => s + (f.weight || 0), 0);
            if (total <= 0) return;
            setFunds(prev => prev.map(f => ({ ...f, weight: f.weight / total })));
        }
    };

    // ── Traspaso helpers ──
    // Balance por fondo usando el total en € del planificador (nunca base-100)
    const getPlanBalance = (isin) => {
        const plan = parseFloat(trasPlanTotal);
        if (plan > 0) {
            const eurAmt = parseFloat(eurAmounts[isin]);
            if (eurAmt >= 0 && eurAmounts[isin] !== undefined) return eurAmt;
            const fund = funds.find(f => f.isin === isin);
            return fund ? (fund.weight || 0) * plan : 0;
        }
        return getFundBalance(isin);
    };

    const getTrasBal = () => {
        const bal = {};
        // Start from the current form funds
        funds.forEach(f => { bal[f.isin] = getPlanBalance(f.isin); });
        trasTransfers.forEach(t => {
            bal[t.fromISIN] = (bal[t.fromISIN] || 0) - t.amount;
            if (t.toISIN) bal[t.toISIN] = (bal[t.toISIN] || 0) + t.amount;
        });
        trasStandalone.forEach(a => { bal[a.isin] = (bal[a.isin] || 0) + a.amount; });
        return bal;
    };

    const addTrasTransfer = () => {
        const destISIN = trasToIsNew ? trasToNewFund?.isin : trasToISIN;
        const destName = trasToIsNew ? trasToNewFund?.name : (funds.find(f => f.isin === trasToISIN)?.name || trasToISIN);
        if (!trasFromISIN || !destISIN || !trasAmount || parseFloat(trasAmount) <= 0) return;
        setTrasTransfers(prev => [...prev, {
            id: Date.now(),
            fromISIN: trasFromISIN,
            fromName: funds.find(f => f.isin === trasFromISIN)?.name || trasFromISIN,
            toISIN: destISIN, toName: destName, toIsNew: trasToIsNew,
            amount: parseFloat(trasAmount),
        }]);
        setTrasAmount('');
        if (trasToIsNew) setTrasToNewFund(null);
    };

    const addTrasStandalone = () => {
        if (!trasAddFund || !trasAddAmount || parseFloat(trasAddAmount) <= 0) return;
        setTrasStandalone(prev => [...prev, { id: Date.now(), isin: trasAddFund.isin, name: trasAddFund.name, amount: parseFloat(trasAddAmount) }]);
        setTrasAddFund(null); setTrasAddAmount('');
    };

    const resetTraspasoInputs = () => {
        setTrasTransfers([]);
        setTrasStandalone([]);
        setTrasFromISIN('');
        setTrasToISIN('');
        setTrasToIsNew(false);
        setTrasToNewFund(null);
        setTrasAmount('');
        setTrasAddFund(null);
        setTrasAddAmount('');
        setTrasPlanTotal('');
    };

    // Apply traspaso result → update funds list, then reset planner so next session starts from updated state
    const applyTraspasoToFunds = () => {
        const bal = getTrasBal();
        const total = Object.values(bal).reduce((s, v) => s + Math.max(v, 0), 0);
        if (total <= 0) return;
        // Build name map from current funds + new funds introduced via transfers/standalone
        const nameMap = {};
        funds.forEach(f => { nameMap[f.isin] = f.name; });
        trasTransfers.filter(t => t.toIsNew).forEach(t => { nameMap[t.toISIN] = t.toName; });
        trasStandalone.forEach(a => { nameMap[a.isin] = a.name; });

        const newFunds = Object.entries(bal)
            .filter(([, v]) => v > 0.01)
            .map(([isin, v]) => ({ isin, name: nameMap[isin] || isin, weight: v / total }));
        setFunds(newFunds);
        const newAmounts = {};
        newFunds.forEach(f => { newAmounts[f.isin] = (f.weight * total).toFixed(2); });
        setEurAmounts(newAmounts);
        setTotalAmount(total.toFixed(2));
        setInputMode('eur');
        // Reset planner — next opening will use the updated funds as baseline
        resetTraspasoInputs();
        setShowTraspaso(false);
    };

    const save = () => {
        if (!name || funds.length === 0) return;
        setSaving(true);
        const url = isEdit ? `/api/portfolio/portfolios/${initialData.id}` : '/api/portfolio/portfolios';
        const method = isEdit ? 'PUT' : 'POST';
        fetch(url, {
            method, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, color, funds, total_value: inputMode === 'eur' ? totalEurEntered : (parseFloat(totalAmount) || 0) }),
        }).then(r => r.json()).then(p => { onSave(p); setSaving(false); })
          .catch(() => setSaving(false));
    };

    const totalW = funds.reduce((s, f) => s + (f.weight || 0), 0);
    const isPctOk = Math.abs(totalW - 1) < 0.005;
    const totalEurEntered = Object.values(eurAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const inputStyle = { padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)', color: 'white', fontSize: '0.85rem' };

    const trasBal = showTraspaso ? getTrasBal() : {};
    const trasTotalAfter = Object.values(trasBal).reduce((s, v) => s + Math.max(v, 0), 0);
    const trasHasChanges = trasTransfers.length > 0 || trasStandalone.length > 0;
    const trasHasErrors = Object.values(trasBal).some(v => v < -0.01);
    // Total en uso como base del planificador (suma de saldos reales en €)
    const trasTotalBase = funds.reduce((s, f) => s + getPlanBalance(f.isin), 0);
    const trasPlanTotalNum = parseFloat(trasPlanTotal) || 0;

    return (
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '10px', border: '1px solid rgba(137,247,254,0.2)' }}>
            <h4 style={{ margin: '0 0 1rem', fontWeight: 600 }}>{isEdit ? '✏️ Editar cartera' : '＋ Nueva cartera'}</h4>

            {/* Name + color */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la cartera *"
                    style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)', color: 'white', fontSize: '0.85rem' }} />
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción (opcional)"
                    style={{ flex: '2 1 260px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)', color: 'white', fontSize: '0.85rem' }} />
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {PORTFOLIO_COLORS.map(c => (
                        <button key={c} onClick={() => setColor(c)} style={{ width: '22px', height: '22px', borderRadius: '50%', background: c, border: color === c ? '3px solid white' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                    ))}
                </div>
            </div>

            {/* Input mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Modo de entrada:</span>
                {[['pct', '% Porcentajes'], ['eur', '€ Importes']].map(([m, label]) => (
                    <button key={m} onClick={() => {
                        if (m === 'eur' && inputMode !== 'eur') {
                            // Populate eurAmounts from current weights so fields don't show 0
                            const tot = parseFloat(totalAmount);
                            const base = tot > 0 ? tot : 100; // fallback base-100 if no total set
                            const derived = {};
                            funds.forEach(f => { derived[f.isin] = ((f.weight || 0) * base).toFixed(2); });
                            setEurAmounts(prev => {
                                // Only fill blank/zero entries; keep any already-entered values
                                const merged = { ...derived };
                                funds.forEach(f => {
                                    const existing = parseFloat(prev[f.isin]);
                                    if (existing > 0) merged[f.isin] = prev[f.isin];
                                });
                                return merged;
                            });
                            if (!tot) setTotalAmount('100');
                        }
                        setInputMode(m);
                    }}
                        style={{ padding: '4px 14px', borderRadius: '16px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                            border: inputMode === m ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)',
                            background: inputMode === m ? 'var(--accent-glow)' : 'transparent',
                            color: inputMode === m ? '#000' : 'var(--text-primary)' }}>
                        {label}
                    </button>
                ))}
                {inputMode === 'eur' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {totalEurEntered > 0 ? 'Total actual (€):' : 'Inversión total (€):'}
                        </label>
                        {totalEurEntered > 0 ? (
                            // Read-only once amounts are set — reflects the real sum of all fund amounts
                            <span style={{ ...inputStyle, width: '120px', display: 'inline-block', textAlign: 'right', fontWeight: 700, color: 'var(--accent-glow)', fontVariantNumeric: 'tabular-nums' }}>
                                {totalEurEntered.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                            </span>
                        ) : (
                            // Editable seed: used only to distribute total equally when no amounts entered yet
                            <input type="number" min="0" step="100" placeholder="ej: 10000" value={totalAmount}
                                onChange={e => setTotalAmount(e.target.value)}
                                onBlur={applyTotalAmount}
                                style={{ ...inputStyle, width: '120px' }} />
                        )}
                    </div>
                )}
            </div>

            {/* Funds list */}
            {funds.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            Fondos: {funds.length}
                            {inputMode === 'pct' && (
                                <> · Total: <span style={{ color: isPctOk ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>{(totalW * 100).toFixed(1)}%</span></>
                            )}
                            {inputMode === 'eur' && (
                                <> · Total: <span style={{ color: 'var(--accent-glow)', fontWeight: 700 }}>€{totalEurEntered.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span></>
                            )}
                        </span>
                        <button onClick={normalizeWeights} style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            {inputMode === 'eur' ? 'Recalcular %' : 'Normalizar a 100%'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {funds.map(f => (
                            <div key={f.isin} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--accent-glow)', minWidth: '95px' }}>{f.isin}</span>
                                <span style={{ flex: 1, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</span>

                                {inputMode === 'pct' ? (
                                    <>
                                        <input type="range" min="0" max="100" step="0.5"
                                            value={Math.round((f.weight || 0) * 100 * 10) / 10}
                                            onChange={e => updateWeightPct(f.isin, e.target.value)}
                                            style={{ width: '100px', accentColor: color }} />
                                        <input type="number" min="0" max="100" step="0.1"
                                            value={((f.weight || 0) * 100).toFixed(1)}
                                            onChange={e => updateWeightPct(f.isin, e.target.value)}
                                            style={{ ...inputStyle, width: '72px', textAlign: 'right', padding: '4px 8px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '12px' }}>%</span>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '42px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                            {((f.weight || 0) * 100).toFixed(1)}%
                                        </span>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>€</span>
                                        <input type="number" min="0" step="any" placeholder="0,00"
                                            value={eurAmounts[f.isin] ?? '0'}
                                            onChange={e => updateEurAmount(f.isin, e.target.value)}
                                            style={{ ...inputStyle, width: '110px', textAlign: 'right', padding: '4px 8px' }} />
                                    </>
                                )}

                                <button onClick={() => removeFund(f.isin)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}>×</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add fund search + import from portfolio */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 260px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Añadir fondo</label>
                    <FundSearchInput placeholder="Buscar por ISIN o nombre..." onSelect={addFund} clearOnSelect />
                </div>
                {portfolios.length > 0 && (
                    <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Importar fondos de otra cartera</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <select value={importPortId} onChange={e => setImportPortId(e.target.value)}
                                style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
                                <option value="">— Selecciona cartera —</option>
                                {portfolios.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <button onClick={() => importFromPortfolio(importPortId)} disabled={!importPortId || importLoading}
                                style={{ padding: '8px 14px', background: importPortId ? 'rgba(74,162,175,0.3)' : 'var(--border-glass)', color: importPortId ? 'white' : 'var(--text-secondary)', border: '1px solid var(--accent-glow)', borderRadius: '6px', fontWeight: 700, cursor: importPortId ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                {importLoading ? '⏳' : '＋ Importar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Traspaso planner ── */}
            <div style={{ marginBottom: '12px' }}>
                <button onClick={() => {
                    // Auto-rellenar el total si ya hay datos disponibles y no se ha introducido
                    if (!trasPlanTotal) {
                        const derived = totalEurEntered > 0 ? totalEurEntered : (parseFloat(totalAmount) || 0);
                        if (derived > 0) setTrasPlanTotal(derived.toFixed(2));
                    }
                    setShowTraspaso(p => !p);
                }}
                    style={{ padding: '6px 16px', borderRadius: '8px', border: '1px dashed var(--accent-glow)', background: 'rgba(74,162,175,0.07)', color: 'var(--accent-glow)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                    {showTraspaso ? '▲ Ocultar planificador de traspasos' : '⚖️ Realizar traspasos'}
                </button>
            </div>

            {showTraspaso && (
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(74,162,175,0.25)', padding: '1.25rem', marginBottom: '12px' }}>
                    <h5 style={{ margin: '0 0 0.5rem', fontWeight: 600, color: 'var(--accent-glow)' }}>⚖️ Realizar traspasos</h5>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>
                        Redistribuye los fondos de <strong>esta cartera</strong>: traspasa importe (€) de un fondo a otro o añade nueva inversión. Al aplicar, los pesos se actualizan y el planificador se reinicia.
                    </p>
                    {/* Campo valor total para el planificador */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', padding: '10px 14px', background: 'rgba(74,162,175,0.06)', borderRadius: '8px', border: '1px solid rgba(74,162,175,0.2)', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Valor total de la cartera (€):</label>
                        <input type="number" min="0" step="100" placeholder={totalEurEntered > 0 ? totalEurEntered.toFixed(2) : (parseFloat(totalAmount) ? parseFloat(totalAmount).toFixed(2) : 'ej: 20000')}
                            value={trasPlanTotal}
                            onChange={e => setTrasPlanTotal(e.target.value)}
                            style={{ ...inputStyle, width: '150px', fontWeight: 700, color: 'var(--accent-glow)' }} />
                        {!trasPlanTotalNum && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>⚠️ Necesario para introducir importes en €</span>
                        )}
                        {trasPlanTotalNum > 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>✔ Los saldos se calculan sobre €{trasPlanTotalNum.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</span>
                        )}
                    </div>

                    {funds.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Añade fondos a la cartera antes de usar el planificador.</div>
                    ) : (
                        <>
                            {/* Current funds summary */}
                            <div style={{ marginBottom: '1rem', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                            <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Fondo</th>
                                            <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Saldo (€)</th>
                                            <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Peso</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...funds].sort((a, b) => getFundBalance(b.isin) - getFundBalance(a.isin)).map(f => {
                                            const val = getFundBalance(f.isin);
                                            return (
                                                <tr key={f.isin} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '5px 10px' }}>
                                                        <span style={{ fontWeight: 600 }}>{f.name}</span>
                                                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{f.isin}</span>
                                                    </td>
                                                    <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                        {trasPlanTotalNum > 0 ? `€${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })}` : <span style={{ color: 'var(--warning)', fontSize: '0.75rem' }}>— Introduce valor total —</span>}
                                                    </td>
                                                    <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                        {trasTotalBase > 0 ? (val / trasTotalBase * 100).toFixed(1) : (f.weight * 100).toFixed(1)}%
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Add transfer row */}
                            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px dashed var(--border-glass)', padding: '1rem', marginBottom: '0.75rem' }}>
                                <h6 style={{ margin: '0 0 0.75rem', fontWeight: 600, color: 'var(--accent-glow)', fontSize: '0.82rem' }}>➕ Añadir Traspaso</h6>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    {/* FROM */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Origen</label>
                                        <select value={trasFromISIN} onChange={e => setTrasFromISIN(e.target.value)} style={{ ...inputStyle, minWidth: '180px' }}>
                                            <option value="">— Selecciona fondo —</option>
                                            {funds.map(f => <option key={f.isin} value={f.isin}>{f.name}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ fontSize: '1.2rem', paddingBottom: '4px', color: 'var(--accent-glow)' }}>→</div>
                                    {/* TO */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Destino</label>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={trasToIsNew} onChange={e => { setTrasToIsNew(e.target.checked); setTrasToISIN(''); setTrasToNewFund(null); }} />
                                                Fondo nuevo
                                            </label>
                                        </div>
                                        {trasToIsNew ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <FundSearchInput placeholder="Busca el fondo destino" clearOnSelect={false} onSelect={f => setTrasToNewFund(f)} />
                                                {trasToNewFund && <div style={{ fontSize: '0.7rem', padding: '3px 7px', background: 'rgba(74,162,175,0.1)', borderRadius: '4px', color: 'var(--accent-glow)' }}>✔ {trasToNewFund.isin} — {trasToNewFund.name}</div>}
                                            </div>
                                        ) : (
                                            <select value={trasToISIN} onChange={e => setTrasToISIN(e.target.value)} style={{ ...inputStyle, minWidth: '180px' }}>
                                                <option value="">— Selecciona fondo —</option>
                                                {funds.filter(f => f.isin !== trasFromISIN).map(f => <option key={f.isin} value={f.isin}>{f.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    {/* Amount */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Importe (€)</label>
                                            {trasFromISIN && funds.find(f => f.isin === trasFromISIN) && trasPlanTotalNum > 0 && (
                                                <button type="button" onClick={() => {
                                                    setTrasAmount(String(getPlanBalance(trasFromISIN).toFixed(2)));
                                                }} style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--accent-glow)', background: 'rgba(74,162,175,0.15)', color: 'var(--accent-glow)', cursor: 'pointer', fontWeight: 700 }}>Todo</button>
                                            )}
                                        </div>
                                        {trasFromISIN && funds.find(f => f.isin === trasFromISIN) && trasPlanTotalNum > 0 && (
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                                Disponible: €{getPlanBalance(trasFromISIN).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                                {' · '}Tras traspasos: €{(trasBal[trasFromISIN] ?? getPlanBalance(trasFromISIN)).toFixed(2)}
                                            </div>
                                        )}
                                        <input type="number" min="0" step="any" placeholder="0,00" value={trasAmount} onChange={e => setTrasAmount(e.target.value)} style={{ ...inputStyle, width: '130px' }} />
                                    </div>
                                    <button onClick={addTrasTransfer} style={{ padding: '7px 16px', background: 'var(--accent-glow)', color: 'black', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', height: '35px', alignSelf: 'flex-end' }}>Añadir</button>
                                </div>
                            </div>

                            {/* Standalone add (nueva aportación) */}
                            <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: '8px', border: '1px dashed rgba(74,162,175,0.25)', padding: '1rem', marginBottom: '0.75rem' }}>
                                <h6 style={{ margin: '0 0 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>💰 Aportación nueva (sin traspaso)</h6>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Fondo destino</label>
                                        <FundSearchInput placeholder="Busca por ISIN o nombre" onSelect={f => setTrasAddFund(f)} clearOnSelect={false} />
                                        {trasAddFund && <div style={{ fontSize: '0.7rem', padding: '3px 7px', background: 'rgba(74,162,175,0.1)', borderRadius: '4px', color: 'var(--accent-glow)' }}>✔ {trasAddFund.isin} — {trasAddFund.name}</div>}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Importe (€)</label>
                                        <input type="number" min="0" step="any" placeholder="0,00" value={trasAddAmount} onChange={e => setTrasAddAmount(e.target.value)} style={{ ...inputStyle, width: '110px' }} />
                                    </div>
                                    <button onClick={addTrasStandalone} style={{ padding: '7px 14px', background: 'rgba(74,162,175,0.3)', color: 'white', border: '1px solid var(--accent-glow)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', height: '35px', alignSelf: 'flex-end' }}>Añadir</button>
                                </div>
                                {trasStandalone.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {trasStandalone.map(a => (
                                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', background: 'rgba(74,162,175,0.08)', borderRadius: '5px', border: '1px solid rgba(74,162,175,0.2)', fontSize: '0.82rem' }}>
                                                <span style={{ flex: 1, fontWeight: 600 }}>{a.name}</span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{a.isin}</span>
                                                <span style={{ color: 'var(--success)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+€{a.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                                <button onClick={() => setTrasStandalone(prev => prev.filter(x => x.id !== a.id))} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--danger)', borderRadius: '4px', padding: '1px 6px', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Transfers list */}
                            {trasTransfers.length > 0 && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <h6 style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.8rem' }}>📋 Traspasos definidos</h6>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {trasTransfers.map(t => {
                                            const balAfter = trasBal[t.fromISIN] ?? 0;
                                            const neg = balAfter < -0.01;
                                            return (
                                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: neg ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: '6px', border: `1px solid ${neg ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`, fontSize: '0.82rem' }}>
                                                    <span style={{ flex: 1, fontWeight: 600 }}>{t.fromName}</span>
                                                    <span style={{ color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>−€{t.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>→</span>
                                                    <span style={{ flex: 1, fontWeight: 600 }}>{t.toName}{t.toIsNew && <span style={{ fontSize: '0.65rem', background: 'rgba(74,162,175,0.2)', color: 'var(--accent-glow)', padding: '1px 4px', borderRadius: '3px', marginLeft: '5px' }}>nuevo</span>}</span>
                                                    <span style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>+€{t.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                                    {neg && <span style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>⚠️ saldo insuf.</span>}
                                                    <button onClick={() => setTrasTransfers(prev => prev.filter(x => x.id !== t.id))} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--danger)', borderRadius: '4px', padding: '1px 6px', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Apply button */}
                            {trasHasChanges && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                        Resultado: <strong style={{ color: 'var(--accent-glow)' }}>€{trasTotalAfter.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</strong>
                                    </div>
                                    {trasHasErrors && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>⚠️ Saldo insuficiente en algún origen</span>}
                                    <button onClick={applyTraspasoToFunds} disabled={trasHasErrors}
                                        style={{ marginLeft: 'auto', padding: '8px 20px', background: trasHasErrors ? 'var(--border-glass)' : 'var(--accent-glow)', color: trasHasErrors ? 'var(--text-secondary)' : '#000', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: trasHasErrors ? 'not-allowed' : 'pointer' }}>
                                        ✅ Aplicar a cartera
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={save} disabled={saving || !name || funds.length === 0} style={{ padding: '8px 20px', background: name && funds.length > 0 ? 'var(--accent-glow)' : 'var(--border-glass)', color: name && funds.length > 0 ? '#000' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: name && funds.length > 0 ? 'pointer' : 'not-allowed' }}>
                    {saving ? '⏳ Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear cartera')}
                </button>
                <button onClick={onCancel} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Cancelar
                </button>
            </div>
        </div>
    );
};

// ── Comparison result panel ──
const CompareResultPanel = ({ result, years, signColor }) => {
    const [zoom, setZoom] = useState(String(years) + 'Y');

    const colA = '#FFD700', colB = '#4ade80';

    const datasets = {};
    if (result.portfolio_a?.series?.length > 0) datasets[result.portfolio_a.name] = result.portfolio_a.series.map(p => ({ date: p.date, price: p.price }));
    if (result.portfolio_b?.series?.length > 0) datasets[result.portfolio_b.name] = result.portfolio_b.series.map(p => ({ date: p.date, price: p.price }));
    const colorMap = { [result.portfolio_a?.name]: colA, [result.portfolio_b?.name]: colB };
    const activeFunds = Object.keys(datasets);

    const m = (port, field) => port?.metrics?.[field];

    return (
        <div>
            {/* Metric cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '3px', marginBottom: '1.5rem' }}>
                {/* Header */}
                <div style={{ padding: '8px 12px', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Métrica</div>
                <div style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, color: colA, textAlign: 'center', background: 'rgba(255,215,0,0.06)', borderRadius: '8px 8px 0 0' }}>{result.portfolio_a?.name}</div>
                <div style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, color: colB, textAlign: 'center', background: 'rgba(74,222,128,0.06)', borderRadius: '8px 8px 0 0' }}>{result.portfolio_b?.name}</div>
                {/* Rows */}
                {[
                    { label: '📈 Retorno Total', field: 'total_return', unit: '%' },
                    { label: '📊 CAGR', field: 'ann_return', unit: '%' },
                    { label: '🌊 Volatilidad', field: 'vol', unit: '%', invert: true },
                    { label: '⚡ Sharpe', field: 'sharpe', unit: '' },
                    { label: '📉 Máx. Drawdown', field: 'max_dd', unit: '%', invert: true },
                ].map(({ label, field, unit, invert }) => {
                    const vA = m(result.portfolio_a, field);
                    const vB = m(result.portfolio_b, field);
                    const winner = vA != null && vB != null ? (invert ? (vA < vB ? 'A' : vA > vB ? 'B' : '') : (vA > vB ? 'A' : vA < vB ? 'B' : '')) : '';
                    const fmt = v => v != null ? `${v >= 0 && !invert ? '+' : ''}${v.toFixed(2)}${unit}` : '—';
                    return (
                        <React.Fragment key={field}>
                            <div style={{ padding: '7px 12px', fontSize: '0.82rem', color: 'var(--text-secondary)', alignSelf: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{label}</div>
                            <div style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: '0.88rem', background: 'rgba(255,215,0,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', color: vA != null ? signColor(invert ? -vA : vA) : 'var(--text-secondary)', position: 'relative' }}>
                                {fmt(vA)}{winner === 'A' && <span style={{ position: 'absolute', right: '6px', color: '#FFD700', fontSize: '0.7rem' }}>★</span>}
                            </div>
                            <div style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: '0.88rem', background: 'rgba(74,222,128,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', color: vB != null ? signColor(invert ? -vB : vB) : 'var(--text-secondary)', position: 'relative' }}>
                                {fmt(vB)}{winner === 'B' && <span style={{ position: 'absolute', right: '6px', color: '#4ade80', fontSize: '0.7rem' }}>★</span>}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Chart */}
            {activeFunds.length > 0 && (
                <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>📉 Evolución comparativa (base 100)</h4>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                        {[String(years) + 'Y', 'MAX'].map(z => (
                            <button key={z} onClick={() => setZoom(z)} style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: zoom === z ? '1px solid var(--accent-glow)' : '1px solid var(--border-glass)', background: zoom === z ? 'var(--accent-glow)' : 'transparent', color: zoom === z ? '#000' : 'var(--text-primary)' }}>
                                {z}
                            </button>
                        ))}
                    </div>
                    <InteractiveChart
                        datasets={datasets}
                        timeframe={zoom === 'MAX' ? 'MAX' : zoom.replace('Y', 'Y')}
                        activeFunds={activeFunds}
                        customRange={null}
                        fundColorMap={colorMap}
                    />
                </div>
            )}

            {/* Fund overlap */}
            <div className="glass-panel" style={{ padding: '1rem' }}>
                <div style={{ fontSize: '0.85rem', marginBottom: '8px' }}>
                    <strong>Fondos en común:</strong> <span style={{ color: result.overlap_count > 0 ? 'var(--warning)' : 'var(--success)' }}>{result.overlap_count}</span>
                    {result.overlap_count > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginLeft: '8px' }}>({result.overlap_isins?.join(', ')})</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
                    {[result.portfolio_a, result.portfolio_b].map((port, idx) => (
                        <div key={idx}>
                            <div style={{ fontWeight: 700, color: idx === 0 ? colA : colB, marginBottom: '5px' }}>{port?.name}</div>
                            {(port?.funds || []).map(f => (
                                <div key={f.isin} style={{ display: 'flex', gap: '6px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ color: 'var(--accent-glow)', minWidth: '45px', fontWeight: 600 }}>{((f.weight || 0) * 100).toFixed(1)}%</span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontFamily: 'monospace', minWidth: '80px' }}>{f.isin}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: result.overlap_isins?.includes(f.isin) ? 'var(--warning)' : 'var(--text-primary)' }} title={f.name}>{f.name?.substring(0, 35) || f.isin}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


// ---------------- MAIN DASHBOARD ----------------

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
    const [refreshStep, setRefreshStep] = useState('');
    const [refreshElapsed, setRefreshElapsed] = useState(0);
    const [activeTab, setActiveTab] = useState('general');
    const refreshIntervalRef = React.useRef(null);

    const loadData = (endpoint = '/api/portfolio/summary', retries = 4, delay = 2000) => {
        fetch(endpoint)
            .then(res => res.json())
            .then(json => {
                if (json && json.summary) {
                    setData(json);
                    setLoading(false);
                } else if (retries > 0) {
                    // Got a response but no summary (server warming up) — retry
                    setTimeout(() => loadData(endpoint, retries - 1, delay), delay);
                } else {
                    setData(json);
                    setLoading(false);
                }
            })
            .catch(err => {
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
        fetch('/api/portfolio/refresh-nav')
            .then(res => res.json())
            .then(() => {
                // Pipeline triggered in background — start polling for new built_at
                setRefreshingNav(false);
                setPollingNav(true);
                if (navPollIntervalRef.current) clearInterval(navPollIntervalRef.current);
                let elapsed = 0;
                navPollIntervalRef.current = setInterval(() => {
                    elapsed += 5;
                    fetch('/api/portfolio/summary')
                        .then(r => r.json())
                        .then(json => {
                            if (json.built_at && json.built_at !== navRefreshBuiltAtRef.current) {
                                clearInterval(navPollIntervalRef.current);
                                setPollingNav(false);
                                setData(json);
                                setRefreshToast(true);
                                setTimeout(() => setRefreshToast(false), 4000);
                            } else if (elapsed >= 300) {
                                clearInterval(navPollIntervalRef.current);
                                setPollingNav(false);
                            }
                        })
                        .catch(() => {
                            if (elapsed >= 300) {
                                clearInterval(navPollIntervalRef.current);
                                setPollingNav(false);
                            }
                        });
                }, 5000);
            })
            .catch(err => { console.error("Error refreshing NAVs:", err); setRefreshingNav(false); });
    };

    const handleRefreshDetails = () => {
        setRefreshingDetails(true);
        setRefreshElapsed(0);
        const steps = [
            '🔗 Conectando con Finect...',
            '📡 Descargando datos sectoriales...',
            '🌍 Descargando exposición geográfica...',
            '📊 Procesando métricas de cada fondo...',
            '🔄 Normalizando sectores y regiones...',
            '💾 Guardando resultados en caché...',
        ];
        setRefreshStep(steps[0]);
        // Trigger async background refresh (returns instantly)
        fetch('/api/portfolio/refresh-details').catch(() => {});
        let elapsed = 0;
        let stepIdx = 0;
        if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = setInterval(() => {
            elapsed += 5;
            stepIdx = Math.min(Math.floor(elapsed / 20), steps.length - 1);
            setRefreshStep(steps[stepIdx]);
            setRefreshElapsed(elapsed);
            // Poll for new data; stop after 150s or when details change
            fetch('/api/portfolio/details')
                .then(r => r.json())
                .then(d => {
                    const hasContent = d && Object.keys(d).length > 0 && Object.values(d).some(f =>
                        (f.sector && Object.keys(f.sector).length > 0) || (f.region && Object.keys(f.region).length > 0)
                    );
                    if (hasContent || elapsed >= 150) {
                        clearInterval(refreshIntervalRef.current);
                        setRefreshingDetails(false);
                        setRefreshStep('');
                        setRefreshElapsed(0);
                        setRefreshDetailsKey(k => k + 1);
                    }
                })
                .catch(() => {
                    if (elapsed >= 150) {
                        clearInterval(refreshIntervalRef.current);
                        setRefreshingDetails(false);
                    }
                });
        }, 5000);
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <div className="loading-state"><div className="spinner"></div><p>Connecting...</p></div>;
    if (!data || !data.summary) return <div style={{padding:'2rem', color:'#ff4444'}}><h3>API Error / Database Empty</h3></div>;

    const chartData = Object.keys(data.summary.details).map(k => ({ name: k, value: data.summary.details[k] }));

    const tabs = ['general', 'detalles', 'evolucion', 'oportunidades', 'simulador', 'retiradas', 'carteras'];
    const tabLabels = { general: 'General', detalles: 'Detalles', evolucion: 'Evolución', oportunidades: 'Oportunidades', simulador: 'Simulador', retiradas: 'Retiradas', carteras: '💼 Carteras' };

    return (
        <div className="dashboard-container">
            <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem'}}>
                <div>
                    <h1>Portfolio Tracker</h1>
                </div>
                
                {/* TABS NAVEGACIÓN */}
                <div style={{display:'flex', gap:'5px', background:'rgba(0,0,0,0.3)', padding:'4px', borderRadius:'10px', border:'1px solid var(--border-glass)'}}>
                    {tabs.map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                            padding: '8px 16px', background: activeTab === tab ? 'var(--accent-glow)' : 'transparent',
                            color: activeTab === tab ? '#000' : 'var(--text-primary)', border: 'none', borderRadius: '8px',
                            fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
                        }}>
                            {tabLabels[tab]}
                        </button>
                    ))}
                </div>

                {refreshToast && (
                    <div style={{
                        position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
                        background: 'linear-gradient(135deg,#0d6e3b,#14a356)', color: '#fff',
                        padding: '12px 20px', borderRadius: '10px', fontWeight: '600',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'fadeInUp 0.3s ease'
                    }}>✓ Datos actualizados</div>
                )}
                <button 
                    onClick={handleRefreshNav}
                    disabled={refreshingNav || pollingNav}
                    style={{
                        padding: '10px 20px',
                        background: (refreshingNav || pollingNav) ? 'var(--border-glass)' : 'var(--bg-glass)',
                        color: (refreshingNav || pollingNav) ? 'var(--text-secondary)' : '#fff',
                        border: pollingNav ? '1px solid #14a356' : '1px solid var(--border-glass)',
                        borderRadius: '8px', fontWeight: '600',
                        cursor: (refreshingNav || pollingNav) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.3s'
                    }}>
                    {refreshingNav ? 'Iniciando...' : pollingNav ? '⏳ Recalculando...' : '🔄 Recalcular Cotizaciones'}
                </button>
            </header>
            


            {/* CONTENIDO — display:none preserva estado entre pestañas */}
            <div style={{marginTop: '2rem'}}>
                <div style={{display: activeTab === 'general' ? 'block' : 'none'}}>
                    <GeneralTab data={data} chartData={chartData} reloadData={loadData} />
                </div>
                <div style={{display: activeTab === 'detalles' ? 'block' : 'none'}}>
                    <DetailsTab
                        onRefreshDetails={handleRefreshDetails}
                        refreshingDetails={refreshingDetails}
                        refreshStep={refreshStep}
                        refreshElapsed={refreshElapsed}
                        refreshDetailsKey={refreshDetailsKey}
                    />
                </div>
                <div style={{display: activeTab === 'evolucion' ? 'block' : 'none'}}>
                    <EvolutionTab rawData={data} />
                </div>
                <div style={{display: activeTab === 'oportunidades' ? 'block' : 'none'}}>
                    <OportunidadesTab />
                </div>
                <div style={{display: activeTab === 'simulador' ? 'block' : 'none'}}>
                    <SimuladorTab />
                </div>
                <div style={{display: activeTab === 'retiradas' ? 'block' : 'none'}}>
                    <RetiradasTab />
                </div>
                <div style={{display: activeTab === 'carteras' ? 'block' : 'none'}}>
                    <CarterasTab />
                </div>
            </div>
        </div>
    );
};

// Global Error Boundary
class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) return <div style={{padding:'2rem',color:'red'}}><h2>Crash</h2><pre>{this.state.error.toString()}</pre></div>;
        return this.props.children;
    }
}

try {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<ErrorBoundary><Dashboard /></ErrorBoundary>);
} catch (e) {
    document.getElementById('root').innerHTML = `<p style="color:red">React Engine Fatal Error: ${e.message}</p>`;
}
