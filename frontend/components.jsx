const { useState, useEffect } = React;
const COLORS = ['#4ca1af', '#c4e0e5', '#89f7fe', '#66a6ff', '#f3a183', '#a18cd1', '#fbc2eb', '#fad0c4', '#ff9a9e', '#fecfef'];

// ---------------- UI COMPONENTS ----------------
const MetricCard = ({ title, value, unit = "%" }) => (
    <div className="glass-panel metric-card">
        <div className="metric-card-title">{title}</div>
        <div className="metric-card-value">{value}{unit}</div>
    </div>
);

const AdviceCard = ({ advice, type = "info" }) => (
    <div className={`glass-panel advice-card ${type}`}>
        <div className="advice-title">{advice.title}</div>
        <div className="advice-text">{advice.text}</div>
    </div>
);

// ---------------- TAB 1: Config & General ----------------
const GeneralTab = ({ data, chartData, reloadData }) => {
    const [newFund, setNewFund] = useState({ Fondo: '', ISIN: '', TIPO: 'INDEX', Porcentaje: 0 });
    const [isSaving, setIsSaving] = useState(false);

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
        <div className="main-content">
            <div className="glass-panel fund-table-container">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '1.5rem'}}>
                    <h3 style={{fontWeight: 600, margin:0}}>Mi Cartera Base</h3>
                </div>
                <div style={{overflowX: 'auto'}}>
                    <table style={{width: '100%', minWidth: '600px'}}>
                        <thead>
                            <tr>
                                <th>Fondo / Activo</th>
                                <th>Tipo / Categoría MS</th>
                                <th>NAV Actual</th>
                                <th>YTD (%)</th>
                                <th>Rating</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.funds.map((fund, idx) => (
                                <tr key={idx}>
                                    <td style={{fontWeight: 500}}>
                                        {fund.Fondo} <span style={{color: 'var(--accent-glow)', fontSize: '0.75rem'}}>({fund.Porcentaje}%)</span>
                                        <div style={{color: 'var(--text-secondary)', fontSize: '0.75rem'}}>{fund.ISIN || ''}</div>
                                    </td>
                                    <td>
                                        <span style={{padding: '4px 8px', background: 'var(--border-glass)', borderRadius: '6px', fontSize: '0.8rem'}}>
                                            {fund['Categoría'] || fund.TIPO}
                                        </span>
                                    </td>
                                    <td style={{color: 'var(--text-primary)', fontWeight: 'bold'}}>{fund['NAV (Precio)'] || '---'}</td>
                                    <td style={{color: fund['YTD (%)'] && fund['YTD (%)'].includes('-') ? 'var(--danger)' : 'var(--success)'}}>
                                        {fund['YTD (%)'] || '---'}
                                    </td>
                                    <td style={{color: 'var(--accent-secondary)'}}>{fund['Estrellas MS'] || '---'}</td>
                                    <td>
                                        <button onClick={() => handleDelete(fund.ISIN || fund.Fondo)} style={{background:'transparent', color:'var(--danger)', border:'1px solid var(--danger)', padding:'4px 8px', borderRadius:'4px', cursor:'pointer'}}>X</button>
                                    </td>
                                </tr>
                            ))}
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

            <div className="advice-section">
                <div className="glass-panel" style={{height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem'}}>
                     <h3 style={{marginBottom: '1rem', alignSelf: 'flex-start'}}>Asset Allocation</h3>
                     <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                         <div style={{display: 'flex', height: '35px', borderRadius: '8px', overflow: 'hidden', width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'}}>
                            {chartData.map((entry, index) => (
                                <div key={entry.name} style={{
                                    width: `${(entry.value / Object.values(data.summary.details).reduce((a,b)=>a+b,0)) * 100}%`,
                                    backgroundColor: COLORS[index % COLORS.length]
                                }} />
                            ))}
                         </div>
                         <div style={{display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem'}}>
                            {chartData.map((entry, index) => (
                                <div key={entry.name} style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem'}}>
                                    <div style={{width: '12px', height: '12px', borderRadius: '50%', backgroundColor: COLORS[index % COLORS.length]}} />
                                    <span style={{color: 'var(--text-secondary)'}}>{entry.name} <strong style={{color: 'var(--text-primary)'}}>({entry.value.toFixed(2)}%)</strong></span>
                                </div>
                            ))}
                         </div>
                     </div>
                </div>
                {data.recommendation.rf_sug && <AdviceCard advice={data.recommendation.rf_sug} type="info" />}
                {data.recommendation.cash_warn && <AdviceCard advice={data.recommendation.cash_warn} type="warning" />}
            </div>
        </div>
    );
};

// ---------------- TAB 2: Detalle (Geografías y Sectores) ----------------
const DetailsTab = () => {
    const [details, setDetails] = useState(null);
    useEffect(() => {
        fetch('/api/portfolio/details').then(r=>r.json()).then(setDetails).catch(console.error);
    }, []);

    if (!details) return <div style={{padding:'3rem', textAlign:'center'}}>Descargando perfiles estructurales asíncronamente desde Morningstar...</div>;

    // Aggregate function over all funds
    const aggregate = (keyExtractor) => {
         const aggr = {};
         Object.values(details).forEach(fund => {
             const dataBlock = fund[keyExtractor] || {};
             let items = [];
             if(Array.isArray(dataBlock)) items = dataBlock;
             else if(typeof dataBlock === 'object') {
                 items = Object.keys(dataBlock).map(k => ({name: k, value: dataBlock[k]}));
             }
             
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
            .filter(x => x.value > 0.5) // Limpiar ruido
            .sort((a,b) => b.value - a.value);
    };

    const sectors = aggregate('sector');
    const regions = aggregate('region');

    const renderBars = (dataList) => (
        <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
             {dataList.map((item, idx) => (
                 <div key={item.name} style={{fontSize:'0.85rem'}}>
                     <div style={{display:'flex', justifyContent:'space-between', marginBottom:'6px'}}>
                         <span>{item.name}</span>
                         <strong style={{color:'var(--accent-secondary)'}}>{item.value.toFixed(1)}%</strong>
                     </div>
                     <div style={{width:'100%', height:'8px', background:'var(--border-glass)', borderRadius:'4px', overflow:'hidden'}}>
                         <div style={{height:'100%', width:`${Math.min(item.value*2, 100)}%`, background: COLORS[idx % COLORS.length]}} />
                     </div>
                 </div>
             ))}
             {dataList.length === 0 && <span style={{color:'var(--text-secondary)'}}>No se detectó información en la capa externa.</span>}
        </div>
    );

    return (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'2rem'}}>
            <div className="glass-panel" style={{padding: '2rem'}}>
                <h3 style={{marginBottom:'1.5rem', fontWeight:600}}>🎯 Exposición Sectorial</h3>
                {renderBars(sectors)}
            </div>
            <div className="glass-panel" style={{padding: '2rem'}}>
                <h3 style={{marginBottom:'1.5rem', fontWeight:600}}>🌍 Exposición Geográfica</h3>
                {renderBars(regions)}
            </div>
        </div>
    );
};

// ---------------- TAB 3: Evolución (Multi Línea SV) ----------------

const HeatmapRenderer = ({ data, activeFunds }) => {
    if (!data || !data.labels) return null;
    const labels = data.labels.filter(l => activeFunds.includes(l));
    return (
        <div style={{display: 'grid', gridTemplateColumns: `auto repeat(${labels.length}, 1fr)`, gap: '4px', fontSize:'0.7rem', marginTop: '1rem'}}>
            <div />
            {labels.map(l => <div key={l} style={{textAlign:'center', writingMode: 'vertical-rl', alignSelf:'end'}}>{l.substring(0,18)}</div>)}
            
            {labels.map((l1) => (
                <React.Fragment key={l1}>
                    <div style={{textAlign:'right', paddingRight: '12px', alignSelf:'center', fontWeight: 'bold'}}>{l1.substring(0,18)}</div>
                    {labels.map((l2) => {
                        const val = data.matrix[l1]?.[l2] ?? 0;
                        const hue = ((val + 1) / 2) * 120;
                        return (
                            <div key={l2} style={{
                                backgroundColor: `hsla(${hue}, 80%, 40%, 0.85)`, color: 'white', padding: '10px 4px',
                                textAlign: 'center', borderRadius: '4px', textShadow: '0 0 2px black', fontWeight: 'bold', 
                                border: val >= 0.99 ? '1px solid rgba(255,255,255,0.6)': '1px solid rgba(0,0,0,0.1)'
                            }}>
                                {val.toFixed(2)}
                            </div>
                        );
                    })}
                </React.Fragment>
            ))}
            {labels.length === 0 && <div>Por favor, selecciona dos o más fondos.</div>}
        </div>
    );
};

// SVG Multi Line Chart
const MultiLineChart = ({ datasets, timeframe, activeFunds }) => {
    if (!datasets || Object.keys(datasets).length === 0) return <div style={{padding:'2rem'}}>No hay datos...</div>;

    const limitDate = new Date();
    if(timeframe === '1Y') limitDate.setFullYear(limitDate.getFullYear() - 1);
    else if(timeframe === '3Y') limitDate.setFullYear(limitDate.getFullYear() - 3);
    else if(timeframe === '5Y') limitDate.setFullYear(limitDate.getFullYear() - 5);
    else if(timeframe === '10Y') limitDate.setFullYear(limitDate.getFullYear() - 10);
    else if(timeframe === 'MAX') limitDate.setFullYear(1900);
    
    let globalMin = 0;
    let globalMax = 0;
    let maxPoints = 0;
    
    const processedLines = [];
    let idx = 0;
    
    activeFunds.forEach(fund => {
        const rawPoints = datasets[fund];
        if(!rawPoints || rawPoints.length === 0) return;
        
        let validPoints = rawPoints.filter(p => new Date(p.date) >= limitDate);
        if(validPoints.length === 0) validPoints = rawPoints;
        
        const basePrice = validPoints[0].price;
        
        const normalized = validPoints.map(p => {
             const pct = ((p.price - basePrice) / basePrice) * 100;
             if (pct < globalMin) globalMin = pct;
             if (pct > globalMax) globalMax = pct;
             return { date: p.date, pct };
        });
        
        if (normalized.length > maxPoints) maxPoints = normalized.length;
        processedLines.push({ fund, color: COLORS[idx % COLORS.length], points: normalized });
        idx++;
    });
    
    if(processedLines.length === 0) return <div style={{padding:'2rem'}}>Selecciona al menos un fondo en los controles inferiores.</div>;
    
    const range = (globalMax - globalMin) || 1;
    
    return (
        <div style={{width: '100%', height: '400px', position: 'relative', marginTop:'1rem', padding: '1rem', background: 'var(--bg-glass)', borderRadius: '10px', display:'flex', flexDirection:'column'}}>
            <div style={{display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'10px'}}>
                 {processedLines.map(l => (
                     <span key={l.fund} style={{color: l.color, fontSize:'0.75rem', fontWeight:'bold', background:'rgba(0,0,0,0.4)', padding:'4px 8px', borderRadius:'6px', border:`1px solid ${l.color}`}}>
                         {l.fund.substring(0,18)}
                     </span>
                 ))}
            </div>
            <svg viewBox="0 -10 100 120" preserveAspectRatio="none" style={{width: '100%', flex: 1, overflow: 'visible', marginTop:'5px'}}>
                {/* 0% Axis */}
                <line x1="0" y1={100 - ((0 - globalMin) / range) * 100} x2="100" y2={100 - ((0 - globalMin) / range) * 100} stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="2 2" />
                
                {/* Paths */}
                {processedLines.map(line => {
                    const polyPoints = line.points.map((p, i) => {
                        const x = (i / (maxPoints - 1 || 1)) * 100;
                        const y = 100 - ((p.pct - globalMin) / range) * 100;
                        return `${x},${y}`;
                    }).join(' ');
                    
                    return <polyline key={line.fund} fill="none" stroke={line.color} strokeWidth="1.2" strokeLinejoin="round" points={polyPoints} style={{filter: `drop-shadow(0px 0px 3px ${line.color}60)`}} />
                })}
            </svg>
            <div style={{position:'absolute', top: '50px', right: '15px', fontSize:'0.75rem', color: 'var(--success)'}}>Máx: +{globalMax.toFixed(1)}%</div>
            <div style={{position:'absolute', bottom: '15px', right: '15px', fontSize:'0.75rem', color: 'var(--danger)'}}>Mín: {globalMin.toFixed(1)}%</div>
        </div>
    );
};

const EvolutionTab = ({ rawData }) => {
    const [historyBatch, setHistoryBatch] = useState(null);
    const [correlationMatrix, setCorrelationMatrix] = useState(null);
    const [activeFunds, setActiveFunds] = useState([]);
    const [timeframe, setTimeframe] = useState('5Y');
    
    useEffect(() => {
        const funds = rawData.funds.filter(f=>f.ISIN).map(f=>f.Fondo);
        setActiveFunds(funds.slice(0, 4));
        
        fetch('/api/portfolio/history_batch').then(r=>r.json()).then(setHistoryBatch).catch(console.error);
        fetch('/api/portfolio/correlation').then(r=>r.json()).then(setCorrelationMatrix).catch(console.error);
    }, [rawData]);

    if (!historyBatch || !correlationMatrix) return <div style={{padding:'3rem', textAlign:'center'}}>Compilando modelos multivariables históricos (10-15 segundos máximo)...</div>;
    const allFunds = Object.keys(historyBatch);

    return (
        <div>
            <div className="glass-panel" style={{padding:'1rem', marginBottom:'1rem'}}>
                 <div style={{display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center'}}>
                     <strong style={{marginRight:'10px'}}>Acotar Tiempo:</strong>
                     {['1Y', '3Y', '5Y', '10Y', 'MAX'].map(tf => (
                         <button key={tf} onClick={()=>setTimeframe(tf)} style={{padding:'4px 12px', borderRadius:'20px', border:'1px solid var(--accent-glow)', background: timeframe === tf ? 'var(--accent-glow)' : 'transparent', color: timeframe === tf ? '#000': 'white', cursor:'pointer', fontWeight:'bold', transition: 'all 0.2s'}}>
                            {tf}
                         </button>
                     ))}
                 </div>
                 
                 <div style={{display:'flex', gap:'10px', flexWrap:'wrap', marginTop:'1rem', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'1rem'}}>
                     <strong style={{marginRight:'10px'}}>Trazar Series:</strong>
                     {allFunds.map(fund => (
                         <label key={fund} style={{display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', fontSize:'0.85rem', background:'rgba(255,255,255,0.05)', padding:'4px 8px', borderRadius:'6px'}}>
                             <input type="checkbox" checked={activeFunds.includes(fund)} onChange={(e) => {
                                 if(e.target.checked) setActiveFunds([...activeFunds, fund]);
                                 else setActiveFunds(activeFunds.filter(f => f !== fund));
                             }} />
                             {fund.substring(0, 20)}
                         </label>
                     ))}
                 </div>
            </div>
            
            <h3 style={{marginBottom:'0.5rem', fontWeight:600}}>Crecimiento Porcentual Acumulado</h3>
            <MultiLineChart datasets={historyBatch} timeframe={timeframe} activeFunds={activeFunds} />
            
            <h3 style={{marginTop:'2rem', marginBottom:'0.5rem', fontWeight:600}}>Matriz de Pearson Dinámica</h3>
            <p style={{fontSize:'0.85rem', color:'var(--text-secondary)'}}>Analiza qué fondos están descorrelacionados (rojo) protegiendo tu cartera.</p>
            <div className="glass-panel" style={{padding:'1rem', overflowX:'auto'}}>
                 <HeatmapRenderer data={correlationMatrix} activeFunds={activeFunds} />
            </div>
        </div>
    );
};


// ---------------- MAIN DASHBOARD ----------------

const Dashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('general'); // general | detalles | evolucion

    const loadData = (endpoint = '/api/portfolio/summary') => {
        if (endpoint.includes('enrich')) setRefreshing(true);
        fetch(endpoint)
            .then(res => res.json())
            .then(json => {
                setData(json);
                setLoading(false);
                setRefreshing(false);
            })
            .catch(err => {
                console.error("Error fetching data:", err);
                setLoading(false);
                setRefreshing(false);
            });
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <div className="loading-state"><div className="spinner"></div><p>Establishing Secure Connection...</p></div>;
    if (!data || !data.summary) return <div style={{padding:'2rem', color:'#ff4444'}}><h3>API Error / Database Empty</h3></div>;

    const chartData = Object.keys(data.summary.details).map(k => ({ name: k, value: data.summary.details[k] }));

    return (
        <div className="dashboard-container">
            <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem'}}>
                <div>
                    <h1>Portfolio Tracker Pro</h1>
                    <div style={{color: 'var(--success)'}}>🚀 Arquitectura SQL/JSON Local Integrada</div>
                </div>
                
                {/* TABS NAVEGACIÓN */}
                <div style={{display:'flex', gap:'5px', background:'rgba(0,0,0,0.3)', padding:'4px', borderRadius:'10px', border:'1px solid var(--border-glass)'}}>
                    {['general', 'detalles', 'evolucion'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                            padding: '8px 16px', background: activeTab === tab ? 'var(--accent-glow)' : 'transparent',
                            color: activeTab === tab ? '#000' : 'var(--text-primary)', border: 'none', borderRadius: '8px',
                            fontWeight: '600', cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.2s'
                        }}>
                            {tab}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => loadData('/api/portfolio/enrich')}
                    disabled={refreshing}
                    style={{
                        padding: '10px 20px', background: refreshing ? 'var(--border-glass)' : 'var(--bg-glass)',
                        color: refreshing ? 'var(--text-secondary)' : '#fff', border: '1px solid var(--border-glass)',
                        borderRadius: '8px', fontWeight: '600', cursor: refreshing ? 'not-allowed' : 'pointer', transition: 'all 0.3s'
                    }}>
                    {refreshing ? 'Sincronizando...' : '🔄 Recalcular Morningstar'}
                </button>
            </header>
            
            <div className="top-metrics">
                <MetricCard title="Renta Variable (RV)" value={data.summary.total_rv.toFixed(2)} />
                <MetricCard title="Renta Fija (RF)" value={data.summary.total_rf.toFixed(2)} />
                <MetricCard title="Liquidez (Cash)" value={data.summary.total_cash.toFixed(2)} />
                <MetricCard title="Alternativos" value={data.summary.total_alt.toFixed(2)} />
            </div>

            {/* CONTENIDO DE LA PESTAÑA */}
            <div style={{marginTop: '2rem'}}>
                {activeTab === 'general' && <GeneralTab data={data} chartData={chartData} reloadData={loadData} />}
                {activeTab === 'detalles' && <DetailsTab />}
                {activeTab === 'evolucion' && <EvolutionTab rawData={data} />}
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
