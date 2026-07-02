'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { buildChartData, buildComparisonData } from '@/lib/chartUtils';

const PERIODS = [
  { label: 'Dag',    value: '1d'  },
  { label: 'Måned',  value: '1mo' },
  { label: '6 mdr',  value: '6mo' },
  { label: '12 mdr', value: '1y'  },
  { label: 'I år',   value: 'ytd' },
  { label: 'Total',  value: 'max' },
];

const ASSET_FILTERS = [
  { label: 'Portefølje',   value: 'all'          },
  { label: 'Aktier',       value: 'stock'        },
  { label: 'Krypto',       value: 'crypto'       },
  { label: 'Crowdlending', value: 'crowdlending' },
];

export function formatXAxis(ts, range) {
  const d = new Date(ts);
  if (range === '1d')  return d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  if (range === '1mo') return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('da-DK', { month: 'short', year: '2-digit' });
}

function formatDKK(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} mio.`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`;
  return `${v.toFixed(0)}`;
}

function fmtPctTick(v) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export default function PortfolioChart({ holdings, rates }) {
  const [period,          setPeriod]          = useState('1mo');
  const [viewMode,        setViewMode]        = useState('dkk');   // 'dkk' | 'pct'
  const [assetFilter,     setAssetFilter]     = useState('all');
  const [benchInput,      setBenchInput]      = useState('IUSQ');
  const [benchmarkSymbol, setBenchmarkSymbol] = useState('');       // '' = off
  const [fetchedHistory,  setFetchedHistory]  = useState({});
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);

  const tradable     = (holdings || []).filter((h) => h.type === 'stock' || h.type === 'crypto' || !h.type);
  const crowdlending = (holdings || []).filter((h) => h.type === 'crowdlending');
  const manual       = (holdings || []).filter((h) => h.type === 'manual');

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadChart = useCallback(async (p) => {
    if (!holdings || holdings.length === 0) return;
    const symbols = [...new Set([
      ...tradable.map((h) => h.symbol),
      ...(benchmarkSymbol ? [benchmarkSymbol] : []),
    ])];
    setFetchedHistory({});   // clear stale data immediately to prevent flash
    setLoading(true);
    setError(null);
    try {
      let history = {};
      if (symbols.length > 0) {
        const res  = await fetch(`/api/history?symbols=${symbols.join(',')}&range=${p}`);
        const json = await res.json();
        history = json.history || {};
      }
      setFetchedHistory(history);
    } catch {
      setError('Kunne ikke hente historik');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(holdings), JSON.stringify(rates), benchmarkSymbol]);

  useEffect(() => { loadChart(period); }, [loadChart, period]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const filteredTradable = useMemo(() => {
    if (assetFilter === 'crowdlending') return [];   // ← crowdlending fix
    if (assetFilter === 'stock')  return tradable.filter((h) => h.type === 'stock'  || !h.type);
    if (assetFilter === 'crypto') return tradable.filter((h) => h.type === 'crypto');
    return tradable;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetFilter, JSON.stringify(tradable)]);

  const filteredCrowdlending = useMemo(
    () => assetFilter === 'all' || assetFilter === 'crowdlending' ? crowdlending : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assetFilter, JSON.stringify(crowdlending)]
  );

  // Manual holdings always included (they have no API history to filter on)
  const filteredManual = useMemo(
    () => assetFilter === 'all' || assetFilter === 'stock' ? manual : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assetFilter, JSON.stringify(manual)]
  );

  const rawChartData = useMemo(
    () => buildChartData(fetchedHistory, filteredTradable, filteredCrowdlending, rates || {}, filteredManual),
    [fetchedHistory, filteredTradable, filteredCrowdlending, rates, filteredManual]
  );

  // Comparison data — only when benchmark is active and history was fetched
  const compData = useMemo(() => {
    if (!benchmarkSymbol || !fetchedHistory[benchmarkSymbol]) return null;
    return buildComparisonData(fetchedHistory, filteredTradable, filteredCrowdlending, rates || {}, benchmarkSymbol, filteredManual);
  }, [fetchedHistory, benchmarkSymbol, filteredTradable, filteredCrowdlending, rates, filteredManual]);

  // Normalise to % for standalone view
  const displayData = useMemo(() => {
    if (compData) return compData;                 // comparison handles its own normalisation
    if (viewMode === 'dkk' || rawChartData.length === 0) return rawChartData;
    const base = rawChartData.find((d) => d.v > 0)?.v ?? 1;
    return rawChartData.map((d) => ({ t: d.t, v: base > 0 ? ((d.v - base) / base) * 100 : 0 }));
  }, [compData, rawChartData, viewMode]);

  const isComparison = !!compData;
  const first    = rawChartData[0]?.v ?? 0;
  const last     = rawChartData[rawChartData.length - 1]?.v ?? 0;
  const gain     = last - first;
  const gainPct  = first > 0 ? (gain / first) * 100 : 0;
  const positive = gain >= 0;
  const portColor = positive ? '#16a34a' : '#dc2626';

  if (!holdings || holdings.length === 0) return null;

  const benchmarkMissing = benchmarkSymbol && !loading && fetchedHistory && !fetchedHistory[benchmarkSymbol];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Samlet kursværdi (DKK)
          </p>
          <p className="text-3xl font-bold text-gray-900 tabular-nums">
            {last.toLocaleString('da-DK')} kr.
          </p>
          {rawChartData.length > 1 && (
            <p className={`text-sm font-semibold mt-0.5 ${positive ? 'text-green-600' : 'text-red-600'}`}>
              {positive ? '+' : ''}{gain.toLocaleString('da-DK')} kr.&nbsp;
              ({positive ? '+' : ''}{gainPct.toFixed(2).replace('.', ',')}%)
              &nbsp;i perioden
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* kr./% toggle — hidden when comparison is active */}
          {!isComparison && (
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[{ label: 'kr.', value: 'dkk' }, { label: '%', value: 'pct' }].map((m) => (
                <button key={m.value} onClick={() => setViewMode(m.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    viewMode === m.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {/* Period selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  period === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Asset filter + benchmark input row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {ASSET_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setAssetFilter(f.value)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              assetFilter === f.value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {/* Benchmark input */}
          {benchmarkSymbol ? (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-xs font-semibold">
              vs {benchmarkSymbol}
              <button
                onClick={() => { setBenchmarkSymbol(''); setBenchInput('IUSQ'); }}
                className="hover:text-red-600 transition-colors ml-0.5"
                aria-label="Fjern sammenligning"
              >✕</button>
            </span>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); const s = benchInput.trim().toUpperCase(); if (s) setBenchmarkSymbol(s); }}
              className="flex gap-1"
            >
              <input
                value={benchInput}
                onChange={(e) => setBenchInput(e.target.value.toUpperCase())}
                placeholder="Sammenlign med…"
                maxLength={15}
                className="w-32 px-2 py-1 text-xs border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
              />
              <button type="submit"
                className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full font-medium transition-colors whitespace-nowrap"
              >
                Sammenlign
              </button>
            </form>
          )}
        </div>
      </div>

      {benchmarkMissing && (
        <p className="text-xs text-amber-600 mb-2">
          Kunne ikke finde data for <strong>{benchmarkSymbol}</strong> — tjek symbolet og prøv igen.
        </p>
      )}

      {/* Chart */}
      <div className="h-48">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 animate-pulse">
            Henter historik...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-sm text-amber-600">{error}</div>
        ) : displayData.length < 2 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            Ikke nok data til at vise graf
          </div>
        ) : isComparison ? (
          // ── Comparison mode: two lines, % normalised ───────────────────────
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
                tickFormatter={(ts) => formatXAxis(ts, period)}
                tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} minTickGap={40}
              />
              <YAxis tickFormatter={fmtPctTick}
                tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={52}
              />
              <Tooltip
                formatter={(v, name) => [
                  `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')}%`,
                  name === 'portfolio' ? 'Min portefølje' : benchmarkSymbol,
                ]}
                labelFormatter={(ts) => new Date(ts).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend
                formatter={(name) => name === 'portfolio' ? 'Min portefølje' : benchmarkSymbol}
                iconType="line" wrapperStyle={{ fontSize: 11 }}
              />
              <Area type="monotone" dataKey="portfolio" stroke="#3b82f6" strokeWidth={2}
                fill="url(#portGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area type="monotone" dataKey="benchmark" stroke="#f59e0b" strokeWidth={2}
                fill="none" strokeDasharray="4 2" dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          // ── Normal mode: single area ───────────────────────────────────────
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={portColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={portColor} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
                tickFormatter={(ts) => formatXAxis(ts, period)}
                tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} minTickGap={40}
              />
              <YAxis
                tickFormatter={viewMode === 'pct' ? fmtPctTick : formatDKK}
                tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                width={viewMode === 'pct' ? 52 : 44}
              />
              <Tooltip
                formatter={(v) =>
                  viewMode === 'pct'
                    ? [`${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')}%`, 'Stigning']
                    : [`${Math.round(v).toLocaleString('da-DK')} kr.`, 'Kursværdi']
                }
                labelFormatter={(ts) =>
                  new Date(ts).toLocaleDateString('da-DK', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    ...(period === '1d' ? { hour: '2-digit', minute: '2-digit' } : {}),
                  })
                }
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Area type="monotone" dataKey="v" stroke={portColor} strokeWidth={2}
                fill="url(#portGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
