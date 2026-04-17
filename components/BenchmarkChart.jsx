'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { buildChartData } from '@/lib/chartUtils';
import { formatXAxis } from './PortfolioChart';

const PERIODS = [
  { label: 'Måned',  value: '1mo' },
  { label: '6 mdr',  value: '6mo' },
  { label: '12 mdr', value: '1y'  },
  { label: 'I år',   value: 'ytd' },
  { label: 'Total',  value: 'max' },
];

function buildComparisonData(history, tradable, crowdlending, rates, benchmarkSymbol) {
  const portfolioRaw = buildChartData(history, tradable, crowdlending, rates);
  if (portfolioRaw.length === 0) return [];

  const benchPoints = (history[benchmarkSymbol]?.points || []).sort((a, b) => a.t - b.t);
  if (benchPoints.length === 0) return [];

  // Build forward-filled benchmark lookup
  const benchTs = benchPoints.map((p) => p.t);
  const benchPrice = {};
  for (const { t, c } of benchPoints) benchPrice[t] = c;

  const benchBase = benchPoints[0].c;
  const portfolioBase = portfolioRaw.find((d) => d.v > 0)?.v ?? 1;

  let benchIdx = 0;
  let lastBench = null;
  const result = [];

  for (const { t, v } of portfolioRaw) {
    const tsS = t / 1000;
    // Advance pointer to latest benchmark timestamp ≤ tsS
    while (benchIdx < benchTs.length && benchTs[benchIdx] <= tsS) {
      lastBench = benchPrice[benchTs[benchIdx]];
      benchIdx++;
    }
    if (lastBench == null) continue;

    result.push({
      t,
      portfolio: portfolioBase > 0 ? +((v / portfolioBase - 1) * 100).toFixed(2) : 0,
      benchmark: benchBase  > 0 ? +((lastBench / benchBase  - 1) * 100).toFixed(2) : 0,
    });
  }
  return result;
}

export default function BenchmarkChart({ holdings, rates }) {
  const [period, setPeriod] = useState('1mo');
  const [benchmarkInput, setBenchmarkInput] = useState('IUSQ');
  const [benchmarkSymbol, setBenchmarkSymbol] = useState('IUSQ');
  const [fetchedHistory, setFetchedHistory] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const tradable = (holdings || []).filter(
    (h) => h.type === 'stock' || h.type === 'crypto' || !h.type
  );
  const crowdlending = (holdings || []).filter((h) => h.type === 'crowdlending');

  const loadData = useCallback(async (p, bench) => {
    if (!holdings || holdings.length === 0) return;
    const portfolioSymbols = [...new Set(tradable.map((h) => h.symbol))];
    const allSymbols = [...new Set([...portfolioSymbols, bench])];
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/history?symbols=${allSymbols.join(',')}&range=${p}`);
      const json = await res.json();
      setFetchedHistory(json.history || {});
    } catch {
      setError('Kunne ikke hente historik');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(holdings), JSON.stringify(rates)]);

  useEffect(() => { loadData(period, benchmarkSymbol); }, [loadData, period, benchmarkSymbol]);

  const compData = useMemo(
    () => buildComparisonData(fetchedHistory, tradable, crowdlending, rates || {}, benchmarkSymbol),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchedHistory, benchmarkSymbol, JSON.stringify(tradable), JSON.stringify(crowdlending), JSON.stringify(rates)]
  );

  const submitBenchmark = (e) => {
    e.preventDefault();
    const sym = benchmarkInput.trim().toUpperCase();
    if (sym) setBenchmarkSymbol(sym);
  };

  if (!holdings || holdings.length === 0) return null;

  const lastPort  = compData[compData.length - 1]?.portfolio ?? null;
  const lastBench = compData[compData.length - 1]?.benchmark ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Sammenligning (% afkast)
          </p>
          <div className="flex items-center gap-4">
            {lastPort != null && (
              <span className={`text-sm font-bold ${lastPort >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Portefølje: {lastPort >= 0 ? '+' : ''}{lastPort.toFixed(2).replace('.', ',')}%
              </span>
            )}
            {lastBench != null && (
              <span className={`text-sm font-bold ${lastBench >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {benchmarkSymbol}: {lastBench >= 0 ? '+' : ''}{lastBench.toFixed(2).replace('.', ',')}%
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Benchmark input */}
          <form onSubmit={submitBenchmark} className="flex gap-1">
            <input
              value={benchmarkInput}
              onChange={(e) => setBenchmarkInput(e.target.value.toUpperCase())}
              placeholder="Symbol"
              maxLength={15}
              className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
            />
            <button
              type="submit"
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Sammenlign
            </button>
          </form>
          {/* Period selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  period === p.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-44">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 animate-pulse">
            Henter historik...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-sm text-amber-600">{error}</div>
        ) : compData.length < 2 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            Ikke nok data — tjek at symbolet er korrekt
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={compData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
                tickFormatter={(ts) => formatXAxis(ts, period)}
                tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} minTickGap={40}
              />
              <YAxis
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={52}
              />
              <Tooltip
                formatter={(v, name) => [
                  `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')}%`,
                  name === 'portfolio' ? 'Min portefølje' : benchmarkSymbol,
                ]}
                labelFormatter={(ts) =>
                  new Date(ts).toLocaleDateString('da-DK', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })
                }
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend
                formatter={(value) => value === 'portfolio' ? 'Min portefølje' : benchmarkSymbol}
                iconType="line"
                wrapperStyle={{ fontSize: 11 }}
              />
              <Line
                type="monotone" dataKey="portfolio" stroke="#3b82f6" strokeWidth={2}
                dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                type="monotone" dataKey="benchmark" stroke="#f59e0b" strokeWidth={2}
                dot={false} activeDot={{ r: 4, strokeWidth: 0 }} strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
