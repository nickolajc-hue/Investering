'use client';

import { useState, useCallback } from 'react';

const PRESETS = {
  global: {
    label: 'Global (udbytte)',
    symbols: [
      'JNJ','PG','KO','PEP','MO','T','VZ','IBM','XOM','CVX',
      'MMM','ABT','MCD','WMT','TGT','HD','LOW','GIS','CL','ED',
      'SO','D','DUK','NEE','O','REALTY','WPC',
    ],
  },
  usa: {
    label: 'USA',
    symbols: [
      'JNJ','PG','KO','PEP','MO','T','VZ','IBM','XOM','CVX',
      'MMM','ABT','MCD','WMT','TGT','HD','LOW','GIS','CL','ED',
      'SO','D','DUK','NEE','O','PFE','ABBV','MRK','BMY','AMGN',
    ],
  },
  europe: {
    label: 'Europa',
    symbols: [
      'NESN.SW','ULVR.L','SHEL.L','BP.L','AZN.L','GSK.L','RIO.L',
      'BHP.L','HSBA.L','LLOY.L','DGE.L','REL.L','NG.L','BT-A.L',
      'SAN.PA','TTE.PA','MC.PA','OR.PA','BNP.PA','AIR.PA',
      'SIE.DE','ALV.DE','DTE.DE','MUV2.DE','BAYN.DE',
      'ENI.MI','ENEL.MI','ISP.MI',
    ],
  },
  nordic: {
    label: 'Norden',
    symbols: [
      'NOVO-B.CO','MAERSK-B.CO','CARL-B.CO','TRYG.CO','DSV.CO',
      'COLO-B.CO','GN.CO','RBREW.CO','BAVAR.CO','NKT.CO',
      'ASSA-B.ST','VOLV-B.ST','SKF-B.ST','SEB-A.ST','SWED-A.ST',
      'HM-B.ST','INVE-B.ST','SAND.ST','TEL2-B.ST','TELIA.ST',
      'EQNR.OL','DNB.OL','TEL.OL','MOWI.OL','YAR.OL',
      'NESTE.HE','FORTUM.HE','SAMPO.HE','ELISA.HE',
    ],
  },
};

const CRITERIA_LABELS = [
  { short: 'Cash > Gæld',      long: 'Kontanter & ækvivalenter > Samlet gæld' },
  { short: 'Gæld/EK < 0,8',    long: 'Samlet gæld / Egenkapital < 0,8' },
  { short: 'Ingen præf.',       long: 'Ingen præferenceaktier' },
  { short: 'Oversk. vokser',    long: 'Tilbageholdt overskud steg ÅoÅ' },
  { short: 'Tilbagekøb',        long: 'Aktietilbagekøb (treasury stock) til stede' },
  { short: 'Udbytte ≥ 3%',      long: 'Dividendeafkast ≥ 3%' },
  { short: 'Analyst ≥ Hold',    long: 'Analytiker konsensus: Hold eller bedre' },
];

function CriterionBadge({ value }) {
  if (value === null || value === undefined)
    return <span className="text-gray-300 text-base leading-none">–</span>;
  return value
    ? <span className="text-green-500 text-base leading-none font-bold">✓</span>
    : <span className="text-red-400 text-base leading-none font-bold">✗</span>;
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

function fmtNum(n, decimals = 1, suffix = '') {
  if (n === null || n === undefined) return '–';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(decimals) + 'T' + suffix;
  if (abs >= 1e9)  return (n / 1e9).toFixed(decimals) + 'B' + suffix;
  if (abs >= 1e6)  return (n / 1e6).toFixed(decimals) + 'M' + suffix;
  return n.toFixed(decimals) + suffix;
}

function fmtPct(n) {
  if (n === null || n === undefined) return '–';
  return (n * 100).toFixed(1) + '%';
}

const REC_LABELS = {
  'strongBuy':  { label: 'Stærkt køb', color: 'text-green-700 bg-green-50' },
  'buy':        { label: 'Køb',        color: 'text-green-600 bg-green-50' },
  'hold':       { label: 'Hold',       color: 'text-amber-700 bg-amber-50' },
  'underperform': { label: 'Underp.', color: 'text-red-600 bg-red-50' },
  'sell':       { label: 'Sælg',       color: 'text-red-700 bg-red-50' },
};

export default function StockScreener() {
  const [preset, setPreset] = useState('global');
  const [customInput, setCustomInput] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [tooltipIdx, setTooltipIdx] = useState(null);

  const runScan = useCallback(async () => {
    const symbols = customInput.trim()
      ? customInput.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
      : PRESETS[preset]?.symbols ?? [];

    if (symbols.length === 0) return;
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch(`/api/screen?symbols=${symbols.join(',')}`);
      if (!res.ok) throw new Error('Server fejl');
      const data = await res.json();
      setResults(data.results ?? []);
      setScanned(true);
    } catch (e) {
      setError('Kunne ikke hente data. Prøv igen.');
    } finally {
      setLoading(false);
    }
  }, [preset, customInput]);

  const symbolCount = customInput.trim()
    ? customInput.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).length
    : PRESETS[preset]?.symbols?.length ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Aktie Screener</h2>
          <p className="text-xs text-gray-400 mt-0.5">Screener baseret på 7 finansielle kriterier</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Preset selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Forudindstilling</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => { setPreset(key); setCustomInput(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    preset === key && !customInput.trim()
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label} ({p.symbols.length})
                </button>
              ))}
            </div>
          </div>

          {/* Custom symbols */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Egne symboler <span className="font-normal text-gray-400">(komma- eller mellemrumssepareret, erstatter forudindstilling)</span>
            </label>
            <textarea
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="f.eks. AAPL, MSFT, NOVO-B.CO"
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
            />
          </div>

          <button
            onClick={runScan}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Scanner...' : `Scan ${symbolCount} aktier`}
          </button>
        </div>
      </div>

      {/* Criteria legend */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Kriterier</h3>
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

      {/* Results */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-500">Henter finansielle data...</p>
          <p className="text-xs text-gray-400 mt-1">Dette kan tage 20-30 sekunder</p>
        </div>
      )}

      {!loading && scanned && results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-gray-900">Resultater</span>
              <span className="ml-2 text-xs text-gray-400">{results.length} aktier</span>
            </div>
            <span className="text-xs text-gray-400 hidden sm:block">
              Sorteret efter flest opfyldte kriterier
            </span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">Ticker</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Navn</th>
                  {CRITERIA_LABELS.map((c, i) => (
                    <th
                      key={i}
                      className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 cursor-pointer relative group w-14"
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
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-32">Score</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 w-20">Udbytte</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 w-24">Anbef.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr
                    key={r.symbol}
                    className={`hover:bg-gray-50 transition-colors ${r.error ? 'opacity-40' : ''}`}
                  >
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
                      <td key={i} className="px-2 py-3 text-center">
                        <CriterionBadge value={v} />
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <PassBar count={r.passCount} />
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-gray-600 tabular-nums">
                      {fmtPct(r.divYield)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {r.recKey ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          REC_LABELS[r.recKey]?.color ?? 'text-gray-600 bg-gray-100'
                        }`}>
                          {REC_LABELS[r.recKey]?.label ?? r.recKey}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {results.map((r) => (
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
                    <span className="text-xs text-gray-500 truncate max-w-[140px]">{r.name}</span>
                  </div>
                  <div className="flex-shrink-0 ml-2 w-28">
                    <PassBar count={r.passCount} />
                  </div>
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
                    <span>
                      Anbef.:{' '}
                      <span className={`font-medium ${
                        REC_LABELS[r.recKey]?.color?.split(' ')[0] ?? 'text-gray-700'
                      }`}>
                        {REC_LABELS[r.recKey]?.label ?? r.recKey}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
