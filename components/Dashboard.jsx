'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const PortfolioChart = dynamic(() => import('./PortfolioChart'), { ssr: false });

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
  const [dkkRates, setDkkRates] = useState({ DKK: 1 });
  const [showDKK, setShowDKK] = useState(true);
  const [loading, setLoading] = useState(false);
  const [priceError, setPriceError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assetFilter, setAssetFilter] = useState('all'); // 'all' | 'stock' | 'crypto'
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'stock',
    symbol: '', shares: '', avgBuyPrice: '',
    sector: '', annualDividend: '',
    name: '', invested: '', currency: 'DKK', startDate: '',
  });
  const [formError, setFormError] = useState('');
  // { clId, amount, date } — open payment form for a crowdlending row
  const [paymentForm, setPaymentForm] = useState(null);
  const [paymentError, setPaymentError] = useState('');

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
    const symbols = [...new Set(list.filter((h) => h.symbol).map((h) => h.symbol))];
    setLoading(true);
    setPriceError(null);
    try {
      const res = await fetch(`/api/prices?symbols=${symbols.join(',')}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.failed?.length > 0) {
        setPriceError(`Kunne ikke hente kurs for: ${data.failed.join(', ')} — tjek at symbolet er korrekt.`);
      }
      setPrices(data.prices || {});
      setLastUpdated(new Date());
    } catch (err) {
      setPriceError(`Kunne ikke hente kurser: ${err.message}`);
    } finally {
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

  // Fetch DKK exchange rates once on mount
  useEffect(() => {
    fetch('/api/rates')
      .then((r) => r.json())
      .then((d) => setDkkRates(d.rates || { DKK: 1 }))
      .catch(() => {}); // keep fallback defaults
  }, []);

  const addHolding = (e) => {
    e.preventDefault();

    if (form.type === 'crowdlending') {
      const name = form.name.trim();
      const invested = parseFloat(form.invested.replace(',', '.'));
      if (!name) return setFormError('Angiv et platformsnavn');
      if (!invested || invested <= 0) return setFormError('Investeret beløb skal være større end 0');
      setHoldings((prev) => [
        ...prev,
        {
          id: `CL-${Date.now()}`,
          type: 'crowdlending',
          name,
          invested,
          currency: form.currency,
          startDate: form.startDate || new Date().toISOString().split('T')[0],
          payments: [],
        },
      ]);
    } else {
      const symbol = form.symbol.trim().toUpperCase();
      const shares = parseFloat(form.shares.replace(',', '.'));
      const avgBuyPrice = parseFloat(form.avgBuyPrice.replace(',', '.'));
      if (!symbol) return setFormError('Angiv et symbol');
      if (!shares || shares <= 0) return setFormError('Antal skal være større end 0');
      if (!avgBuyPrice || avgBuyPrice <= 0) return setFormError('Gns. kurs skal være større end 0');
      const annualDividend = parseFloat(form.annualDividend.replace(',', '.')) || 0;
      setHoldings((prev) => [
        ...prev,
        {
          id: `${symbol}-${Date.now()}`,
          symbol, shares, avgBuyPrice,
          type: form.type,
          sector: form.sector || undefined,
          annualDividend: annualDividend > 0 ? annualDividend : undefined,
        },
      ]);
    }

    setForm((f) => ({
      type: f.type,
      symbol: '', shares: '', avgBuyPrice: '',
      sector: '', annualDividend: '',
      name: '', invested: '', currency: 'DKK', startDate: '',
    }));
    setFormError('');
    setShowForm(false);
  };

  const removeHolding = (id) => setHoldings((prev) => prev.filter((h) => h.id !== id));

  const openPaymentForm = (clId) => {
    const today = new Date().toISOString().split('T')[0];
    setPaymentForm({ clId, amount: '', date: today });
    setPaymentError('');
  };

  const savePayment = (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentForm.amount.replace(',', '.'));
    if (!amount || amount <= 0) return setPaymentError('Beløb skal være større end 0');
    if (!paymentForm.date) return setPaymentError('Vælg en dato');
    setHoldings((prev) =>
      prev.map((h) =>
        h.id === paymentForm.clId
          ? { ...h, payments: [...(h.payments || []), { date: paymentForm.date, amount }] }
          : h
      )
    );
    setPaymentForm(null);
    setPaymentError('');
  };

  // Enrich each holding with live price data (+ DKK equivalents)
  const enriched = (holdings || []).map((h) => {
    const p = prices[h.symbol];
    const currentPrice = p?.price ?? null;
    const currency = p?.currency || 'USD';
    const rate = dkkRates[currency] ?? 6.9;
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
      // DKK equivalents
      dkkRate: rate,
      currentValueDKK: currentValue !== null ? currentValue * rate : null,
      investedDKK: invested * rate,
      gainLossDKK: gainLoss !== null ? gainLoss * rate : null,
      // Dividend
      dividendYield: h.annualDividend && currentPrice
        ? (h.annualDividend / currentPrice) * 100
        : null,
      annualDividendDKK: h.annualDividend ? h.annualDividend * h.shares * rate : 0,
    };
  });

  // Display currency helper
  const displayCurrency = showDKK ? 'DKK' : null; // null = use native
  const val   = (h) => showDKK ? h.currentValueDKK : h.currentValue;
  const inv   = (h) => showDKK ? h.investedDKK     : h.invested;
  const gain  = (h) => showDKK ? h.gainLossDKK     : h.gainLoss;
  const cur   = (h) => showDKK ? 'DKK'             : h.currency;
  const price = (h) => showDKK && h.currentPrice != null
    ? h.currentPrice * h.dkkRate
    : h.currentPrice;

  // Crowdlending computed rows — interest = sum of all registered payments
  const crowdlendingRows = (holdings || [])
    .filter((h) => h.type === 'crowdlending')
    .map((h) => {
      const payments = h.payments || [];
      const interest = payments.reduce((s, p) => s + p.amount, 0);
      const currentValue = h.invested + interest;
      const returnPct = h.invested > 0 ? (interest / h.invested) * 100 : 0;
      const rate = dkkRates[h.currency] ?? 1;
      return { ...h, payments, interest, currentValue, returnPct, rate };
    });

  // Filter by asset type — crowdlending is always excluded from the stock/crypto table
  const filteredEnriched = enriched.filter((h) => {
    if (h.type === 'crowdlending') return false;
    if (assetFilter === 'crypto') return h.type === 'crypto';
    if (assetFilter === 'stock') return h.type === 'stock' || !h.type;
    return true; // 'all'
  });
  const filteredCrowdlending = assetFilter === 'crowdlending' || assetFilter === 'all'
    ? crowdlendingRows
    : [];

  // Portfolio dividend yield (DKK)
  const totalAnnualDividendDKK = enriched.reduce((s, h) => s + (h.annualDividendDKK || 0), 0);

  // Summary (stocks + crypto + crowdlending)
  const summary = {};
  for (const h of enriched) {
    if (val(h) === null) continue;
    const c = cur(h);
    if (!summary[c]) summary[c] = { value: 0, invested: 0 };
    summary[c].value    += val(h);
    summary[c].invested += inv(h);
  }
  for (const cl of crowdlendingRows) {
    const c = showDKK ? 'DKK' : cl.currency;
    const mult = showDKK ? cl.rate : 1;
    if (!summary[c]) summary[c] = { value: 0, invested: 0 };
    summary[c].value    += cl.currentValue * mult;
    summary[c].invested += cl.invested     * mult;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Price error banner */}
      {priceError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{priceError}</span>
        </div>
      )}

      {/* Summary cards */}
      {holdings && holdings.length > 0 && Object.keys(summary).length > 0 && (
        <div className="space-y-3">
          {Object.entries(summary).map(([cur, { value, invested }]) => {
            const gain = value - invested;
            const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
            return (
              <div key={cur} className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-2 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {Object.keys(summary).length > 1 ? `Kursværdi (${cur})` : 'Samlet kursværdi'}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">
                    {fmt(value, cur)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Investeret: <span className="tabular-nums font-medium">{fmt(invested, cur)}</span>
                  </p>
                </div>
                <div className={`bg-white rounded-xl border p-4 shadow-sm ${gain >= 0 ? 'border-green-200' : 'border-red-200'}`}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Afkast</p>
                  <p className={`text-xl font-bold tabular-nums ${gainColor(gain)}`}>
                    {gain >= 0 ? '+' : ''}{fmt(gain, cur)}
                  </p>
                </div>
                <div className={`bg-white rounded-xl border p-4 shadow-sm ${gainPct >= 0 ? 'border-green-200' : 'border-red-200'}`}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Afkast %</p>
                  <p className={`text-xl font-bold ${gainColor(gainPct)}`}>{fmtPct(gainPct)}</p>
                </div>
              </div>{/* end grid */}
              {/* Portfolio dividend yield — only shown when any holding has a dividend */}
              {totalAnnualDividendDKK > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Årsudbytte (DKK)
                    </p>
                    <p className="text-xl font-bold text-indigo-600 tabular-nums">
                      {fmt(totalAnnualDividendDKK, 'DKK')}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Portefølje udbytte%
                    </p>
                    <p className="text-xl font-bold text-indigo-600 tabular-nums">
                      {value > 0
                        ? `${((totalAnnualDividendDKK / (showDKK ? value : value)) * 100).toFixed(2).replace('.', ',')}%`
                        : '—'}
                    </p>
                  </div>
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}

      {/* Portfolio chart */}
      <PortfolioChart holdings={holdings || []} rates={dkkRates} />

      {/* Holdings card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-3 border-b border-gray-100">
          {/* Row 1: title + action buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Beholdninger{holdings?.length ? ` (${holdings.length})` : ''}
              </h2>
              {lastUpdated && (
                <span className="text-xs text-gray-400 tabular-nums">
                  {lastUpdated.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchPrices(holdings)}
              disabled={loading || !holdings?.length}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Opdaterer...' : 'Opdater kurser'}
            </button>
            <button
              onClick={() => setShowDKK((v) => !v)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                showDKK
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              DKK
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
              Tilføj {form.type === 'crypto' ? 'krypto' : form.type === 'crowdlending' ? 'crowdlending' : 'aktie'}
            </button>
          </div>
          </div>{/* end row 1 */}
          {/* Row 2: filter tabs */}
          {holdings?.length > 0 && (
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 mt-2 w-fit">
              {[
                { label: 'Alle', value: 'all' },
                { label: 'Aktier', value: 'stock' },
                { label: 'Krypto', value: 'crypto' },
                { label: 'Crowdlending', value: 'crowdlending' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setAssetFilter(tab.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    assetFilter === tab.value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <form
            onSubmit={addHolding}
            className="px-5 py-4 bg-blue-50 border-b border-blue-100"
          >
            <div className="flex flex-wrap gap-2 items-end">
              {/* Type toggle */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Type</label>
                <div className="flex gap-0.5 bg-gray-200 rounded-lg p-0.5">
                  {[
                    { label: 'Aktie', value: 'stock' },
                    { label: 'Krypto', value: 'crypto' },
                    { label: 'Crowdlending', value: 'crowdlending' },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        form.type === t.value
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.type === 'crowdlending' ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Platform</label>
                    <input
                      type="text"
                      placeholder="Bondora"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      maxLength={40}
                      className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Investeret</label>
                    <input
                      type="number"
                      placeholder="50000"
                      value={form.invested}
                      min="0"
                      step="any"
                      onChange={(e) => setForm((f) => ({ ...f, invested: e.target.value }))}
                      className="w-28 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Valuta</label>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                      className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {['DKK', 'EUR', 'USD', 'GBP', 'SEK', 'NOK'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Startdato</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-36 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </>
              ) : (
                <>
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
                    <label className="text-xs font-medium text-gray-600">Gns. købskurs</label>
                    <input
                      type="number"
                      placeholder="150.00"
                      value={form.avgBuyPrice}
                      min="0"
                      step="any"
                      onChange={(e) => setForm((f) => ({ ...f, avgBuyPrice: e.target.value }))}
                      className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Sektor</label>
                    <select
                      value={form.sector}
                      onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
                      className="w-36 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">— valgfri —</option>
                      {['Tech','Finans','Sundhed','Energi','Forbrugsgoder','Industri','Materialer','Kommunikation','Ejendomme','Forsyning','Andet'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Udbytte/aktie (år)</label>
                    <input
                      type="number"
                      placeholder="2.50"
                      value={form.annualDividend}
                      min="0"
                      step="any"
                      onChange={(e) => setForm((f) => ({ ...f, annualDividend: e.target.value }))}
                      className="w-28 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </>
              )}
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
              {form.type === 'crowdlending'
                ? 'Tilføj renteudbetalinger direkte på platformen efterfølgende'
                : form.type === 'crypto'
                ? 'Krypto eksempel: BTC-USD · ETH-USD · SOL-USD'
                : 'Aktie eksempel: AAPL · NOVO-B.CO · TSLA'}
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
        {holdings !== null && filteredEnriched.length > 0 && (
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
                    <th className="px-3 py-3 text-right">Udbytte%</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEnriched.map((h) => (
                    <tr
                      key={h.id}
                      className="hover:bg-gray-50 group transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-gray-900">{h.symbol}</div>
                        <div className="text-xs text-gray-400 max-w-[160px] truncate">{h.name}</div>
                        {h.sector && (
                          <span className="inline-block mt-0.5 px-1.5 py-0 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">
                            {h.sector}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">
                        {h.shares}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-gray-500">
                        {fmt(h.avgBuyPrice, cur(h))}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums font-medium text-gray-900">
                        {price(h) !== null ? (
                          fmt(price(h), cur(h))
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums font-medium text-gray-900">
                        {val(h) !== null ? (
                          fmt(val(h), cur(h))
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-3.5 text-right tabular-nums font-semibold ${gainColor(gain(h))}`}
                      >
                        {gain(h) !== null ? (
                          `${gain(h) >= 0 ? '+' : ''}${fmt(gain(h), cur(h))}`
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
                      <td className={`px-3 py-3.5 text-right tabular-nums text-xs ${gainColor(h.dayChangePct)}`}>
                        {h.dayChangePct !== null ? fmtPct(h.dayChangePct) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-xs text-indigo-600 font-medium">
                        {h.dividendYield != null ? `${h.dividendYield.toFixed(2).replace('.', ',')}%` : <span className="text-gray-200">—</span>}
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
              {filteredEnriched.map((h) => (
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
                      {price(h) !== null ? fmt(price(h), cur(h)) : '—'}
                    </span>
                    <span className="text-gray-500">Kursværdi</span>
                    <span className="text-right font-medium text-gray-900">
                      {val(h) !== null ? fmt(val(h), cur(h)) : '—'}
                    </span>
                    <span className="text-gray-500">Afkast</span>
                    <span className={`text-right font-bold ${gainColor(gain(h))}`}>
                      {gain(h) !== null
                        ? `${gain(h) >= 0 ? '+' : ''}${fmt(gain(h), cur(h))}`
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

      {/* Crowdlending section */}
      {(filteredCrowdlending.length > 0 || (assetFilter === 'crowdlending' && crowdlendingRows.length === 0)) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Crowdlending ({filteredCrowdlending.length})
            </h3>
          </div>

          {filteredCrowdlending.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              Ingen crowdlending-platforme endnu — tryk <span className="font-semibold">Tilføj crowdlending</span>
            </div>
          )}

          {/* Desktop */}
          {filteredCrowdlending.length > 0 && (
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Platform</th>
                    <th className="px-3 py-3 text-right">Investeret</th>
                    <th className="px-3 py-3 text-right">Udbetalinger</th>
                    <th className="px-3 py-3 text-right">Renteindtægt</th>
                    <th className="px-3 py-3 text-right">Nuværende værdi</th>
                    <th className="px-3 py-3 text-right">Afkast %</th>
                    <th className="px-3 py-3 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCrowdlending.map((cl) => {
                    const c = showDKK ? 'DKK' : cl.currency;
                    const m = showDKK ? cl.rate : 1;
                    const isOpen = paymentForm?.clId === cl.id;
                    return (
                      <>
                        <tr key={cl.id} className="hover:bg-gray-50 group transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-gray-900">{cl.name}</div>
                            <div className="text-xs text-gray-400">{cl.currency}</div>
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums text-gray-700">
                            {fmt(cl.invested * m, c)}
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums text-gray-500">
                            {cl.payments.length} udbetaling{cl.payments.length !== 1 ? 'er' : ''}
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums font-medium text-green-600">
                            +{fmt(cl.interest * m, c)}
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums font-bold text-gray-900">
                            {fmt(cl.currentValue * m, c)}
                          </td>
                          <td className={`px-3 py-3.5 text-right tabular-nums font-bold ${gainColor(cl.returnPct)}`}>
                            {fmtPct(cl.returnPct)}
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={() => isOpen ? setPaymentForm(null) : openPaymentForm(cl.id)}
                                className="px-2 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold whitespace-nowrap"
                              >
                                + Rente
                              </button>
                              <button
                                onClick={() => removeHolding(cl.id)}
                                aria-label={`Fjern ${cl.name}`}
                                className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-500 transition-all"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${cl.id}-payment`}>
                            <td colSpan={7} className="px-5 py-3 bg-green-50 border-b border-green-100">
                              <form onSubmit={savePayment} className="flex flex-wrap gap-2 items-end">
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs font-medium text-gray-600">Dato</label>
                                  <input
                                    type="date"
                                    value={paymentForm.date}
                                    onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs font-medium text-gray-600">
                                    Rente udbetalt ({cl.currency})
                                  </label>
                                  <input
                                    type="number"
                                    placeholder="450"
                                    value={paymentForm.amount}
                                    min="0"
                                    step="any"
                                    autoFocus
                                    onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                                    className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                  />
                                </div>
                                <button type="submit" className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                                  Gem
                                </button>
                                <button type="button" onClick={() => { setPaymentForm(null); setPaymentError(''); }} className="px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                                  Annuller
                                </button>
                                {paymentError && <p className="w-full text-xs text-red-600 mt-1">{paymentError}</p>}
                              </form>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile */}
          {filteredCrowdlending.length > 0 && (
            <div className="sm:hidden divide-y divide-gray-100">
              {filteredCrowdlending.map((cl) => {
                const c = showDKK ? 'DKK' : cl.currency;
                const m = showDKK ? cl.rate : 1;
                const isOpen = paymentForm?.clId === cl.id;
                return (
                  <div key={cl.id} className="px-4 py-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="font-bold text-base text-gray-900">{cl.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{cl.currency}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => isOpen ? setPaymentForm(null) : openPaymentForm(cl.id)}
                          className="px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs font-semibold"
                        >
                          + Rente
                        </button>
                        <button onClick={() => removeHolding(cl.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <form onSubmit={savePayment} className="flex gap-2 items-end mb-3 p-3 bg-green-50 rounded-lg">
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-xs font-medium text-gray-600">Dato</label>
                          <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white w-full" />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-xs font-medium text-gray-600">Beløb ({cl.currency})</label>
                          <input type="number" placeholder="450" value={paymentForm.amount} min="0" step="any" autoFocus onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white w-full" />
                        </div>
                        <button type="submit" className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg">Gem</button>
                      </form>
                    )}
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <span className="text-gray-500">Investeret</span>
                      <span className="text-right font-medium text-gray-900">{fmt(cl.invested * m, c)}</span>
                      <span className="text-gray-500">Udbetalinger</span>
                      <span className="text-right text-gray-600">{cl.payments.length} stk.</span>
                      <span className="text-gray-500">Renteindtægt</span>
                      <span className="text-right font-bold text-green-600">+{fmt(cl.interest * m, c)}</span>
                      <span className="text-gray-500">Nuværende værdi</span>
                      <span className="text-right font-bold text-gray-900">{fmt(cl.currentValue * m, c)}</span>
                      <span className="text-gray-500">Afkast %</span>
                      <span className={`text-right font-bold ${gainColor(cl.returnPct)}`}>{fmtPct(cl.returnPct)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
