'use client';

import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// ── constants ────────────────────────────────────────────────────────────────

export const SECTORS = [
  'Tech', 'Finans', 'Sundhed', 'Energi', 'Forbrugsgoder',
  'Industri', 'Materialer', 'Kommunikation', 'Ejendomme', 'Forsyning', 'Andet',
];

const ASSET_TAGS = ['stock', 'crypto', 'crowdlending'];
const ALL_TAGS   = [...ASSET_TAGS, ...SECTORS];

const TAG_LABEL = {
  stock: 'Aktier (alle)', crypto: 'Krypto (alle)', crowdlending: 'Crowdlending',
};

const PRESET_COLORS = [
  '#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6',
  '#f97316','#06b6d4','#84cc16','#ec4899','#6366f1','#14b8a6','#a855f7',
];

const DEFAULT_STRATEGY = () => ({
  id: `s-${Date.now()}`,
  name: 'Min strategi',
  buckets: [
    { id: 'b-1', name: 'Aktier',       color: '#3b82f6', target: 60, tags: ['stock']        },
    { id: 'b-2', name: 'Krypto',       color: '#f59e0b', target: 20, tags: ['crypto']       },
    { id: 'b-3', name: 'Crowdlending', color: '#10b981', target: 20, tags: ['crowdlending'] },
  ],
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** All effective tags for a holding: type + sectors (backward compat with single sector) */
function effectiveTags(h) {
  const type = h.type === 'crowdlending' ? 'crowdlending' : (h.type || 'stock');
  const sectors = h.sectors ?? (h.sector ? [h.sector] : []);
  return [type, ...sectors];
}

/** DKK value of a holding given prices + rates */
function holdingDKK(h, prices, rates) {
  if (h.type === 'crowdlending') {
    const interest = (h.payments || []).reduce((s, p) => s + p.amount, 0);
    return (h.invested + interest) * (rates[h.currency] ?? 1);
  }
  const p = prices[h.symbol];
  if (!p || p.price == null) return null; // unknown — excluded from %
  const rate = rates[p.currency] ?? rates['USD'] ?? 6.9;
  return h.shares * p.price * rate;
}

function nextColor(existing) {
  const used = new Set(existing.map((b) => b.color));
  return PRESET_COLORS.find((c) => !used.has(c)) ?? PRESET_COLORS[0];
}

function fmtPct(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1).replace('.', ',')}%`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function DiffBadge({ diff }) {
  if (diff == null) return null;
  const abs = Math.abs(diff);
  if (abs < 0.5) return <span className="text-xs text-gray-400">≈ mål</span>;
  const pos = diff > 0;
  return (
    <span className={`text-xs font-semibold ${pos ? 'text-green-600' : 'text-red-500'}`}>
      {pos ? '+' : ''}{diff.toFixed(1).replace('.', ',')}%
    </span>
  );
}

function StrategyCard({ strategy, allHoldings, prices, rates, onChange, onDelete }) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal]         = useState(strategy.name);
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [bucketForm, setBucketForm] = useState({
    name: '', target: '', color: '', tags: [],
  });
  const [formErr, setFormErr] = useState('');

  // Assign each holding to the FIRST bucket whose tags overlap its effective tags
  let totalDKK = 0;
  const bucketValues = {};
  const assignedIds = new Set();
  for (const h of allHoldings) {
    const v = holdingDKK(h, prices, rates);
    if (v == null) continue;
    totalDKK += v;
    const tags = effectiveTags(h);
    for (const b of strategy.buckets) {
      if (b.tags.some((t) => tags.includes(t))) {
        bucketValues[b.id] = (bucketValues[b.id] ?? 0) + v;
        assignedIds.add(h.id);
        break; // first match only — no double-counting
      }
    }
  }

  const buckets = strategy.buckets.map((b) => {
    const value = bucketValues[b.id] ?? 0;
    const currentPct = totalDKK > 0 ? (value / totalDKK) * 100 : 0;
    const diff = currentPct - b.target;
    return { ...b, value, currentPct, diff };
  });

  // Holdings not matched by any bucket
  const unassigned = allHoldings.filter((h) => {
    const v = holdingDKK(h, prices, rates);
    return v !== null && !assignedIds.has(h.id);
  });

  const totalTarget = strategy.buckets.reduce((s, b) => s + Number(b.target), 0);
  const targetOk    = Math.abs(totalTarget - 100) < 0.1;

  // Pie data
  const pieData = buckets.filter((b) => b.currentPct > 0).map((b) => ({
    name: b.name, value: Math.round(b.currentPct * 10) / 10, color: b.color,
  }));

  const saveName = () => {
    if (nameVal.trim()) onChange({ ...strategy, name: nameVal.trim() });
    setEditingName(false);
  };

  const updateBucket = (updated) =>
    onChange({ ...strategy, buckets: strategy.buckets.map((b) => (b.id === updated.id ? updated : b)) });

  const removeBucket = (id) =>
    onChange({ ...strategy, buckets: strategy.buckets.filter((b) => b.id !== id) });

  const addBucket = (e) => {
    e.preventDefault();
    const name   = bucketForm.name.trim();
    const target = parseFloat(bucketForm.target.replace(',', '.'));
    if (!name) return setFormErr('Angiv et navn');
    if (!target || target <= 0 || target > 100) return setFormErr('Mål skal være 1–100%');
    if (bucketForm.tags.length === 0) return setFormErr('Vælg mindst én type/sektor');
    const newBucket = {
      id: `b-${Date.now()}`,
      name,
      target,
      color: bucketForm.color || nextColor(strategy.buckets),
      tags: bucketForm.tags,
    };
    onChange({ ...strategy, buckets: [...strategy.buckets, newBucket] });
    setBucketForm({ name: '', target: '', color: '', tags: [] });
    setFormErr('');
    setShowAddBucket(false);
  };

  const toggleTag = (tag) =>
    setBucketForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        {editingName ? (
          <form onSubmit={(e) => { e.preventDefault(); saveName(); }} className="flex gap-2 items-center flex-1 mr-4">
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={saveName}
              maxLength={40}
              className="text-sm font-semibold border-b border-blue-400 outline-none bg-transparent flex-1"
            />
          </form>
        ) : (
          <button
            onClick={() => { setNameVal(strategy.name); setEditingName(true); }}
            className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left"
          >
            {strategy.name}
            <span className="ml-1 text-gray-300 text-xs">✎</span>
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Slet strategi
        </button>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie chart */}
        <div className="flex flex-col items-center justify-center">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nuværende</p>
          {totalDKK === 0 ? (
            <div className="w-32 h-32 rounded-full border-4 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400">
              Ingen data
            </div>
          ) : (
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={36} outerRadius={60} paddingAngle={2}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v.toFixed(1)}%`]} contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bucket table */}
        <div className="lg:col-span-2">
          {!targetOk && (
            <p className="text-xs text-amber-600 mb-2">
              Mål summerer til {totalTarget.toFixed(0)}% — bør være 100%
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left pb-2">Bucket</th>
                <th className="text-right pb-2">Mål</th>
                <th className="text-right pb-2">Nu</th>
                <th className="text-right pb-2">Diff</th>
                <th className="w-24 pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {buckets.map((b) => (
                <tr key={b.id} className="group">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={b.color}
                        onChange={(e) => updateBucket({ ...b, color: e.target.value })}
                        className="w-4 h-4 rounded cursor-pointer border-0 p-0 bg-transparent"
                        title="Vælg farve"
                      />
                      <span className="font-medium text-gray-900">{b.name}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden w-full">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(b.currentPct, 100)}%`, backgroundColor: b.color }}
                      />
                    </div>
                  </td>
                  <td className="py-2.5 text-right">
                    <input
                      type="number"
                      value={b.target}
                      min="0"
                      max="100"
                      step="1"
                      onChange={(e) => updateBucket({ ...b, target: parseFloat(e.target.value) || 0 })}
                      className="w-14 text-right text-sm border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <span className="text-gray-400 ml-0.5 text-xs">%</span>
                  </td>
                  <td className={`py-2.5 text-right tabular-nums font-semibold ${b.currentPct > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                    {b.currentPct.toFixed(1).replace('.', ',')}%
                  </td>
                  <td className="py-2.5 text-right">
                    <DiffBadge diff={b.diff} />
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => removeBucket(b.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-xs"
                    >
                      Fjern
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {unassigned.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              {unassigned.length} beholdning{unassigned.length !== 1 ? 'er' : ''} er ikke tildelt nogen bucket:{' '}
              {unassigned.map((h) => h.symbol || h.name).join(', ')}
            </p>
          )}

          {/* Add bucket */}
          {showAddBucket ? (
            <form onSubmit={addBucket} className="mt-3 p-3 bg-blue-50 rounded-lg space-y-2">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-medium text-gray-600">Navn</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="f.eks. USA-aktier"
                    value={bucketForm.name}
                    maxLength={30}
                    onChange={(e) => setBucketForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-36 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-medium text-gray-600">Mål %</label>
                  <input
                    type="number"
                    placeholder="30"
                    value={bucketForm.target}
                    min="1"
                    max="100"
                    onChange={(e) => setBucketForm((f) => ({ ...f, target: e.target.value }))}
                    className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-medium text-gray-600">Farve</label>
                  <input
                    type="color"
                    value={bucketForm.color || nextColor(strategy.buckets)}
                    onChange={(e) => setBucketForm((f) => ({ ...f, color: e.target.value }))}
                    className="w-10 h-8 rounded cursor-pointer border border-gray-300"
                  />
                </div>
                <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                  Tilføj
                </button>
                <button type="button" onClick={() => { setShowAddBucket(false); setFormErr(''); }} className="px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                  Annuller
                </button>
              </div>
              {/* Tag picker */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Type / Sektor (vælg hvad der hører til)</p>
                <div className="flex flex-wrap gap-1">
                  {ALL_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                        bucketForm.tags.includes(tag)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {TAG_LABEL[tag] ?? tag}
                    </button>
                  ))}
                </div>
              </div>
              {formErr && <p className="text-xs text-red-600">{formErr}</p>}
            </form>
          ) : (
            <button
              onClick={() => setShowAddBucket(true)}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              + Tilføj bucket
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function AllocationView() {
  const [holdings, setHoldings] = useState(null);
  const [prices,   setPrices]   = useState({});
  const [rates,    setRates]    = useState({ DKK: 1, USD: 6.9 });
  const [strategies, setStrategies] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const h = localStorage.getItem('aktie-beholdninger');
    try { setHoldings(h ? JSON.parse(h) : []); } catch { setHoldings([]); }

    const s = localStorage.getItem('allocation-strategies');
    try { setStrategies(s ? JSON.parse(s) : [DEFAULT_STRATEGY()]); }
    catch { setStrategies([DEFAULT_STRATEGY()]); }
  }, []);

  // Persist strategies
  useEffect(() => {
    if (strategies !== null) {
      localStorage.setItem('allocation-strategies', JSON.stringify(strategies));
    }
  }, [strategies]);

  // Fetch prices + rates
  const fetchData = useCallback(async (list) => {
    if (!list) return;
    setLoading(true);
    try {
      const [ratesRes] = await Promise.all([fetch('/api/rates')]);
      const ratesData = await ratesRes.json();
      setRates(ratesData.rates || { DKK: 1 });

      const symbols = [...new Set(list.filter((h) => h.symbol).map((h) => h.symbol))];
      if (symbols.length > 0) {
        const pricesRes = await fetch(`/api/prices?symbols=${symbols.join(',')}`);
        const pricesData = await pricesRes.json();
        setPrices(pricesData.prices || {});
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (holdings !== null) fetchData(holdings); }, [holdings, fetchData]);

  const updateStrategy = (updated) =>
    setStrategies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

  const deleteStrategy = (id) =>
    setStrategies((prev) => prev.filter((s) => s.id !== id));

  const addStrategy = () =>
    setStrategies((prev) => [...prev, DEFAULT_STRATEGY()]);

  if (holdings === null || strategies === null) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="animate-pulse space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Allokering</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Sammenlign din nuværende fordeling med din strategi
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-gray-400 animate-pulse">Henter kurser…</span>}
          <button
            onClick={() => fetchData(holdings)}
            disabled={loading}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40"
          >
            Opdater
          </button>
          <button
            onClick={addStrategy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Ny strategi
          </button>
        </div>
      </div>

      {strategies.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="font-medium text-gray-500">Ingen strategier endnu</p>
          <p className="text-sm mt-1">Tryk <span className="font-semibold">Ny strategi</span> for at starte</p>
        </div>
      ) : (
        strategies.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            allHoldings={holdings}
            prices={prices}
            rates={rates}
            onChange={updateStrategy}
            onDelete={() => deleteStrategy(s.id)}
          />
        ))
      )}

      {holdings.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          Tilføj beholdninger under <span className="font-semibold">Portefølje</span> for at se din nuværende allokering.
        </div>
      )}
    </div>
  );
}
