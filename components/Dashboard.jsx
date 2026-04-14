'use client';

import { useState, useEffect, useCallback } from 'react';

function fmt(amount, currency) {
  if (amount == null || isNaN(amount)) return '—';
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtPct(pct) {
  if (pct == null || isNaN(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2).replace('.', ',')}%`;
}

function gainColor(value) {
  if (value == null) return 'text-gray-300';
  return value >= 0 ? 'text-green-600' : 'text-red-600';
}

export default function Dashboard() {
  const [holdings, setHoldings] = useState(null);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: '', shares: '', avgBuyPrice: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('aktie-beholdninger');
    try {
      setHoldings(saved ? JSON.parse(saved) : []);
    } catch {
      setHoldings([]);
    }
  }, []);

  useEffect(() => {
    if (holdings !== null) {
      localStorage.setItem('aktie-beholdninger', JSON.stringify(holdings));
    }
  }, [holdings]);

  const fetchPrices = useCallback(async (list) => {
    if (!list || list.length === 0) {
      setPrices({});
      return;
    }
    const symbols = [...new Set(list.map((h) => h.symbol))];
    setLoading(true);
    try {
      const res = await fetch(`/api/prices?symbols=${symbols.join(',')}`);
      const data = await res.json();
      setPrices(data.prices || {});
      setLastUpdated(new Date());
    } catch {}
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (holdings !== null) {
      fetchPrices(holdings);
      const interval = setInterval(() => fetchPrices(holdings), 60_000);
      return () => clearInterval(interval);
    }
  }, [holdings, fetchPrices]);

  const addHolding = (e) => {
    e.preventDefault();
    const symbol = form.symbol.trim().toUpperCase();
    const shares = parseFloat(form.shares.replace(',', '.'));
    const avgBuyPrice = parseFloat(form.avgBuyPrice.replace(',', '.'));

    if (!symbol) return setFormError('Angiv et aktiesymbol');
    if (!shares || shares <= 0) return setFormError('Antal skal være større end 0');
    if (!avgBuyPrice || avgBuyPrice <= 0) return setFormError('Gns. kurs skal være større end 0');

    setHoldings((prev) => [
      ...prev,
      { id: `${symbol}-${Date.now()}`, symbol, shares, avgBuyPrice },
    ]);
    setForm({ symbol: '', shares: '', avgBuyPrice: '' });
    setFormError('');
    setShowForm(false);
  };

  const removeHolding = (id) => setHoldings((prev) => prev.filter((h) => h.id !== id));

  // Enrich each holding with live price data
  const enriched = (holdings || []).map((h) => {
    const p = prices[h.symbol];
    const currentPrice = p?.price ?? null;
    const currency = p?.currency || 'USD';
    const currentValue = currentPrice !== null ? h.shares * currentPrice : null;
    const invested = h.shares * h.avgBuyPrice;
    const gainLoss = currentValue !== null ? currentValue - invested : null;
    const gainLossPct =
      gainLoss !== null && invested > 0 ? (gainLoss / invested) * 100 : null;
    return {
      ...h,
      name: p?.name || h.symbol,
      currentPrice,
      currency,
      currentValue,
      invested,
      gainLoss,
      gainLossPct,
      dayChangePct: p?.changePercent ?? null,
    };
  });

  // Summary grouped by currency
  const summary = {};
  for (const h of enriched) {
    if (h.currentValue === null) continue;
    if (!summary[h.currency]) summary[h.currency] = { value: 0, invested: 0 };
    summary[h.currency].value += h.currentValue;
    summary[h.currency].invested += h.invested;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Summary cards */}
      {holdings && holdings.length > 0 && Object.keys(summary).length > 0 && (
        <div className="space-y-3">
          {Object.entries(summary).map(([cur, { value, invested }]) => {
            const gain = value - invested;
            const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
            return (
              <div key={cur} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-2 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {Object.keys(summary).length > 1
                      ? `Kursværdi (${cur})`
                      : 'Samlet kursværdi'}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">
                    {fmt(value, cur)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Investeret:{' '}
                    <span className="tabular-nums font-medium">{fmt(invested, cur)}</span>
                  </p>
                </div>
                <div
                  className={`bg-white rounded-xl border p-4 shadow-sm ${gain >= 0 ? 'border-green-200' : 'border-red-200'}`}
                >
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Afkast
                  </p>
                  <p className={`text-xl font-bold tabular-nums ${gainColor(gain)}`}>
                    {gain >= 0 ? '+' : ''}
                    {fmt(gain, cur)}
                  </p>
                </div>
                <div
                  className={`bg-white rounded-xl border p-4 shadow-sm ${gainPct >= 0 ? 'border-green-200' : 'border-red-200'}`}
                >
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Afkast %
                  </p>
                  <p className={`text-xl font-bold ${gainColor(gainPct)}`}>
                    {fmtPct(gainPct)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Holdings card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Beholdninger{holdings?.length ? ` (${holdings.length})` : ''}
            </h2>
            {lastUpdated && (
              <span className="text-xs text-gray-400 tabular-nums">
                {lastUpdated.toLocaleTimeString('da-DK', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchPrices(holdings)}
              disabled={loading || !holdings?.length}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Opdaterer...' : 'Opdater kurser'}
            </button>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Tilføj aktie
            </button>
          </div>
        </div>

        {/* Add form */}
        {showForm && (
          <form
            onSubmit={addHolding}
            className="px-5 py-4 bg-blue-50 border-b border-blue-100"
          >
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Symbol</label>
                <input
                  type="text"
                  placeholder="AAPL"
                  value={form.symbol}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))
                  }
                  maxLength={20}
                  className="w-28 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Antal</label>
                <input
                  type="number"
                  placeholder="10"
                  value={form.shares}
                  min="0"
                  step="any"
                  onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
                  className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">
                  Gns. købskurs
                </label>
                <input
                  type="number"
                  placeholder="150.00"
                  value={form.avgBuyPrice}
                  min="0"
                  step="any"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, avgBuyPrice: e.target.value }))
                  }
                  className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Tilføj
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormError('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuller
              </button>
            </div>
            {formError && <p className="text-xs text-red-600 mt-2">{formError}</p>}
            <p className="text-xs text-gray-400 mt-2">
              Dansk aktiesymbol eksempel: NOVO-B.CO · Krypto: BTC-USD
            </p>
          </form>
        )}

        {/* Empty state */}
        {holdings !== null && holdings.length === 0 && !showForm && (
          <div className="text-center py-16 text-gray-400">
            <svg
              className="w-14 h-14 mx-auto mb-4 text-gray-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <p className="text-base font-medium text-gray-500">Ingen beholdninger endnu</p>
            <p className="text-sm mt-1">
              Tryk <span className="font-semibold">Tilføj aktie</span> for at starte
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {holdings === null && (
          <div className="divide-y divide-gray-100">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
                <div className="h-5 w-12 bg-gray-200 rounded" />
                <div className="h-4 w-28 bg-gray-100 rounded" />
                <div className="ml-auto flex gap-4">
                  <div className="h-5 w-20 bg-gray-100 rounded" />
                  <div className="h-5 w-16 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Desktop table */}
        {holdings !== null && holdings.length > 0 && (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Aktie</th>
                    <th className="px-3 py-3 text-right">Antal</th>
                    <th className="px-3 py-3 text-right">Gns. kurs</th>
                    <th className="px-3 py-3 text-right">Kurs nu</th>
                    <th className="px-3 py-3 text-right">Kursværdi</th>
                    <th className="px-3 py-3 text-right">Afkast</th>
                    <th className="px-3 py-3 text-right">Afkast %</th>
                    <th className="px-3 py-3 text-right">I dag</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enriched.map((h) => (
                    <tr
                      key={h.id}
                      className="hover:bg-gray-50 group transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-gray-900">{h.symbol}</div>
                        <div className="text-xs text-gray-400 max-w-[140px] truncate">
                          {h.name}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">
                        {h.shares}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-gray-500">
                        {fmt(h.avgBuyPrice, h.currency)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums font-medium text-gray-900">
                        {h.currentPrice !== null ? (
                          fmt(h.currentPrice, h.currency)
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums font-medium text-gray-900">
                        {h.currentValue !== null ? (
                          fmt(h.currentValue, h.currency)
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-3.5 text-right tabular-nums font-semibold ${gainColor(h.gainLoss)}`}
                      >
                        {h.gainLoss !== null ? (
                          `${h.gainLoss >= 0 ? '+' : ''}${fmt(h.gainLoss, h.currency)}`
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-3.5 text-right tabular-nums font-bold ${gainColor(h.gainLossPct)}`}
                      >
                        {h.gainLossPct !== null ? (
                          fmtPct(h.gainLossPct)
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-3.5 text-right tabular-nums text-xs ${gainColor(h.dayChangePct)}`}
                      >
                        {h.dayChangePct !== null ? (
                          fmtPct(h.dayChangePct)
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <button
                          onClick={() => removeHolding(h.id)}
                          aria-label={`Fjern ${h.symbol}`}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-500 transition-all"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-100">
              {enriched.map((h) => (
                <div key={h.id} className="px-4 py-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="font-bold text-base text-gray-900">{h.symbol}</span>
                      <span className="text-xs text-gray-400 ml-2 align-middle">
                        {h.name}
                      </span>
                    </div>
                    <button
                      onClick={() => removeHolding(h.id)}
                      aria-label={`Fjern ${h.symbol}`}
                      className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-gray-500">Antal</span>
                    <span className="text-right font-medium text-gray-900">{h.shares}</span>
                    <span className="text-gray-500">Kurs nu</span>
                    <span className="text-right font-medium text-gray-900">
                      {h.currentPrice !== null ? fmt(h.currentPrice, h.currency) : '—'}
                    </span>
                    <span className="text-gray-500">Kursværdi</span>
                    <span className="text-right font-medium text-gray-900">
                      {h.currentValue !== null ? fmt(h.currentValue, h.currency) : '—'}
                    </span>
                    <span className="text-gray-500">Afkast</span>
                    <span className={`text-right font-bold ${gainColor(h.gainLoss)}`}>
                      {h.gainLoss !== null
                        ? `${h.gainLoss >= 0 ? '+' : ''}${fmt(h.gainLoss, h.currency)}`
                        : '—'}
                    </span>
                    <span className="text-gray-500">Afkast %</span>
                    <span className={`text-right font-bold ${gainColor(h.gainLossPct)}`}>
                      {h.gainLossPct !== null ? fmtPct(h.gainLossPct) : '—'}
                    </span>
                    <span className="text-gray-500">I dag</span>
                    <span
                      className={`text-right text-xs font-medium ${gainColor(h.dayChangePct)}`}
                    >
                      {h.dayChangePct !== null ? fmtPct(h.dayChangePct) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer note */}
      {Object.keys(summary).length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Priser fra Yahoo Finance · Opdateres hvert minut
          {Object.keys(summary).length > 1 && ' · Totaler vises per valuta'}
        </p>
      )}
    </div>
  );
}
