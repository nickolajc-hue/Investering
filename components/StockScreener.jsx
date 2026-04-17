'use client';

import { useState, useCallback } from 'react';

const STATIC_PRESETS = {
  usa: {
    label: 'USA (statisk)',
    symbols: [
      'JNJ','PG','KO','PEP','MO','T','VZ','IBM','XOM','CVX','MMM','ABT',
      'MCD','WMT','TGT','HD','LOW','GIS','CL','ED','SO','D','DUK','NEE',
      'O','PFE','ABBV','MRK','BMY','AMGN','LMT','RTX','GD','HON','EMR',
      'ITW','CAT','DE','DOW','PPG','CINF','AFL','CB','TRV','MET','PRU',
      'AIG','WFC','JPM','BAC','USB','PNC',
    ],
  },
  europe: {
    label: 'Europa (statisk)',
    symbols: [
      'NESN.SW','ULVR.L','SHEL.L','BP.L','AZN.L','GSK.L','RIO.L','BHP.L',
      'HSBA.L','LLOY.L','DGE.L','REL.L','NG.L','BT-A.L','IMB.L','BATS.L',
      'SAN.PA','TTE.PA','MC.PA','OR.PA','BNP.PA','AIR.PA','SU.PA','ML.PA',
      'SIE.DE','ALV.DE','DTE.DE','MUV2.DE','BAYN.DE','SAP.DE','BMW.DE',
      'ENI.MI','ENEL.MI','ISP.MI','UCG.MI','G.MI',
    ],
  },
  nordic: {
    label: 'Norden (statisk)',
    symbols: [
      'NOVO-B.CO','MAERSK-B.CO','CARL-B.CO','TRYG.CO','DSV.CO','COLO-B.CO',
      'GN.CO','RBREW.CO','NKT.CO','PNDORA.CO','DEMANT.CO','ISS.CO',
      'ASSA-B.ST','VOLV-B.ST','SKF-B.ST','SEB-A.ST','SWED-A.ST','HM-B.ST',
      'INVE-B.ST','SAND.ST','TEL2-B.ST','TELIA.ST','ATCO-A.ST','ESSITY-B.ST',
      'EQNR.OL','DNB.OL','TEL.OL','MOWI.OL','YAR.OL','AKERBP.OL',
      'NESTE.HE','FORTUM.HE','SAMPO.HE','ELISA.HE','NOKIA.HE',
    ],
  },
};

const DYNAMIC_PRESETS = [
  { key: 'global', label: 'Globalt (dynamisk)', desc: 'Top udbytte-aktier på tværs af alle markeder' },
  { key: 'us',     label: 'USA (dynamisk)',     desc: 'Top amerikanske udbytte-aktier fra Yahoo screener' },
  { key: 'europe', label: 'Europa (dynamisk)',  desc: 'Top europæiske udbytte-aktier fra Yahoo screener' },
  { key: 'nordic', label: 'Norden (dynamisk)',  desc: 'Top nordiske udbytte-aktier fra Yahoo screener' },
];

const CRITERIA_LABELS = [
  { short: 'Cash > Gæld',    long: 'Kontanter & ækvivalenter > Samlet gæld' },
  { short: 'Gæld/EK < 0,8', long: 'Samlet gæld / Egenkapital < 0,8' },
  { short: 'Ingen præf.',    long: 'Ingen præferenceaktier' },
  { short: 'RE vokser',      long: 'Tilbageholdt overskud steg ÅoÅ' },
  { short: 'Tilbagekøb',     long: 'Aktietilbagekøb (treasury stock) til stede' },
  { short: 'Udbytte ≥ 3%',  long: 'Dividendeafkast ≥ 3%' },
  { short: '≥ Hold',         long: 'Analytiker konsensus: Hold eller bedre' },
];

function CriterionBadge({ value }) {
  if (value === null || value === undefined)
    return <span className="text-gray-300 text-sm leading-none">–</span>;
  return value
    ? <span className="text-green-500 text-sm leading-none font-bold">✓</span>
    : <span className="text-red-400 text-sm leading-none font-bold">✗</span>;
}

function PassBar({ count, total = 7 }) {
  const pct = Math.round((count / total) * 100);
  const color = count >= 6 ? 'bg-green-500' : count >= 4 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[40px]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-6 text-right ${
        count >= 6 ? 'text-green-600' : count >= 4 ? 'text-amber-600' : 'text-red-500'
      }`}>{count}/7</span>
    </div>
  );
}

function fmtPct(n) {
  if (n === null || n === undefined) return '–';
  return (n * 100).toFixed(1) + '%';
}

const REC_LABELS = {
  strongBuy:    { label: 'Stærkt køb', color: 'text-green-700 bg-green-50' },
  buy:          { label: 'Køb',        color: 'text-green-600 bg-green-50' },
  hold:         { label: 'Hold',       color: 'text-amber-700 bg-amber-50' },
  underperform: { label: 'Underp.',   color: 'text-red-600 bg-red-50'    },
  sell:         { label: 'Sælg',      color: 'text-red-700 bg-red-50'    },
};

export default function StockScreener() {
  const [mode, setMode]           = useState('dynamic'); // 'dynamic' | 'static' | 'custom'
  const [dynamicKey, setDynamicKey] = useState('global');
  const [staticKey, setStaticKey]   = useState('usa');
  const [customInput, setCustomInput] = useState('');
  const [minYield, setMinYield]     = useState('1');
  const [maxCount, setMaxCount]     = useState('100');
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [scanned, setScanned]       = useState(false);
  const [tooltipIdx, setTooltipIdx] = useState(null);
  const [filterPass, setFilterPass] = useState(0); // min passCount filter

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      let url;
      if (mode === 'dynamic') {
        url = `/api/screen?dynamic=${dynamicKey}&minYield=${parseFloat(minYield) / 100}&count=${maxCount}`;
      } else if (mode === 'static') {
        const syms = STATIC_PRESETS[staticKey]?.symbols ?? [];
        url = `/api/screen?symbols=${syms.join(',')}`;
      } else {
        const syms = customInput.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
        if (syms.length === 0) { setLoading(false); return; }
        url = `/api/screen?symbols=${syms.join(',')}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Server fejl');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results ?? []);
      setScanned(true);
    } catch (e) {
      setError(e.message || 'Kunne ikke hente data. Prøv igen.');
    } finally {
      setLoading(false);
    }
  }, [mode, dynamicKey, staticKey, customInput, minYield, maxCount]);

  const displayResults = filterPass > 0
    ? results.filter((r) => r.passCount >= filterPass)
    : results;

  const modeTabCls = (m) =>
    `px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
      mode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Controls card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Aktie Screener</h2>
          <p className="text-xs text-gray-400 mt-0.5">Screener baseret på 7 finansielle kriterier</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Mode selector */}
          <div className="flex gap-2 flex-wrap">
            <button className={modeTabCls('dynamic')} onClick={() => setMode('dynamic')}>Dynamisk (Yahoo)</button>
            <button className={modeTabCls('static')}  onClick={() => setMode('static')}>Statisk liste</button>
            <button className={modeTabCls('custom')}  onClick={() => setMode('custom')}>Egne symboler</button>
          </div>

          {mode === 'dynamic' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Henter aktier direkte fra Yahoo Finance screener — dækker hele markedet.</p>
              <div className="flex flex-wrap gap-2">
                {DYNAMIC_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setDynamicKey(p.key)}
                    title={p.desc}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      dynamicKey === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">Min. udbytteafkast</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" max="20" step="0.5"
                      value={minYield}
                      onChange={(e) => setMinYield(e.target.value)}
                      className="w-20 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">Max antal aktier</span>
                  <input
                    type="number" min="10" max="250" step="10"
                    value={maxCount}
                    onChange={(e) => setMaxCount(e.target.value)}
                    className="w-24 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </label>
              </div>
            </div>
          )}

          {mode === 'static' && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(STATIC_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setStaticKey(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    staticKey === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label} ({p.symbols.length})
                </button>
              ))}
            </div>
          )}

          {mode === 'custom' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">
                Symboler <span className="font-normal text-gray-400">(komma- eller mellemrumssepareret)</span>
              </label>
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="f.eks. AAPL, MSFT, NOVO-B.CO, SHEL.L"
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
              />
            </div>
          )}

          <button
            onClick={runScan}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? 'Scanner...'
              : mode === 'dynamic'
                ? `Hent top ${maxCount} og screen`
                : 'Kør screening'}
          </button>
          {mode === 'dynamic' && (
            <p className="text-xs text-gray-400">
              Dette kan tage 30-60 sekunder afhængig af antal aktier.
            </p>
          )}
        </div>
      </div>

      {/* Criteria legend */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Kriterier</span>
        </div>
        <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {CRITERIA_LABELS.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-bold text-blue-600 tabular-nums mt-0.5 flex-shrink-0">#{i + 1}</span>
              <div>
                <p className="text-xs font-medium text-gray-800">{c.short}</p>
                <p className="text-[10px] text-gray-400 leading-tight">{c.long}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <div className="inline-block w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-500">Henter og screener aktier...</p>
          <p className="text-xs text-gray-400 mt-1">Kan tage 30-60 sekunder</p>
        </div>
      )}

      {!loading && scanned && results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Resultater</span>
              <span className="text-xs text-gray-400">{displayResults.length} / {results.length} aktier</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Min. score:</span>
              {[0, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  onClick={() => setFilterPass(n)}
                  className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                    filterPass === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {n === 0 ? 'Alle' : `${n}+`}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-24">Ticker</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Navn</th>
                  {CRITERIA_LABELS.map((c, i) => (
                    <th
                      key={i}
                      className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 cursor-default relative w-12"
                      onMouseEnter={() => setTooltipIdx(i)}
                      onMouseLeave={() => setTooltipIdx(null)}
                    >
                      #{i + 1}
                      {tooltipIdx === i && (
                        <div className="absolute z-20 bottom-full mb-1 left-1/2 -translate-x-1/2 w-48 bg-gray-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-normal text-left pointer-events-none">
                          {c.long}
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">Score</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 w-20">Udbytte</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 w-24">Anbef.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayResults.map((r) => (
                  <tr key={r.symbol} className={`hover:bg-gray-50 transition-colors ${r.error ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        r.passCount >= 6 ? 'bg-green-100 text-green-700' :
                        r.passCount >= 4 ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {r.symbol}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 max-w-[160px] truncate">{r.name}</td>
                    {(r.criteria ?? Array(7).fill(null)).map((v, i) => (
                      <td key={i} className="px-2 py-3 text-center"><CriterionBadge value={v} /></td>
                    ))}
                    <td className="px-4 py-3"><PassBar count={r.passCount} /></td>
                    <td className="px-3 py-3 text-right text-xs tabular-nums text-gray-600">{fmtPct(r.divYield)}</td>
                    <td className="px-3 py-3 text-right">
                      {r.recKey ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          REC_LABELS[r.recKey]?.color ?? 'text-gray-600 bg-gray-100'
                        }`}>
                          {REC_LABELS[r.recKey]?.label ?? r.recKey}
                        </span>
                      ) : <span className="text-xs text-gray-300">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {displayResults.map((r) => (
              <div key={r.symbol} className={`px-4 py-3 ${r.error ? 'opacity-40' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      r.passCount >= 6 ? 'bg-green-100 text-green-700' :
                      r.passCount >= 4 ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {r.symbol}
                    </span>
                    <span className="text-xs text-gray-500 truncate max-w-[130px]">{r.name}</span>
                  </div>
                  <div className="flex-shrink-0 ml-2 w-28"><PassBar count={r.passCount} /></div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {CRITERIA_LABELS.map((c, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <CriterionBadge value={(r.criteria ?? [])[i]} />
                      <span className="text-[10px] text-gray-500">{c.short}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                  <span>Udbytte: <span className="font-medium text-gray-700">{fmtPct(r.divYield)}</span></span>
                  {r.recKey && (
                    <span>Anbef.: <span className="font-medium text-gray-700">{REC_LABELS[r.recKey]?.label ?? r.recKey}</span></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && scanned && displayResults.length === 0 && results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
          Ingen aktier opfylder det valgte minimum-scorefilter
        </div>
      )}
      {!loading && scanned && results.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
          Ingen resultater fundet
        </div>
      )}
    </div>
  );
}
