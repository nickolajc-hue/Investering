'use client';

import { useState, useEffect, useMemo } from 'react';

function daysUntil(ts) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((ts - now.getTime()) / 86400000);
  return diff;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DayBadge({ days }) {
  if (days < 0) return <span className="text-[10px] font-semibold text-gray-400">{Math.abs(days)} dage siden</span>;
  if (days === 0) return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">I dag</span>;
  if (days <= 7)  return <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Om {days} dag{days !== 1 ? 'e' : ''}</span>;
  if (days <= 30) return <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Om {days} dage</span>;
  return <span className="text-[10px] font-semibold text-gray-400">Om {days} dage</span>;
}

export default function EarningsCalendar({ holdings }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const symbols = useMemo(() => {
    return [...new Set(
      (holdings || [])
        .filter((h) => h.type === 'stock' || h.type === 'crypto' || !h.type)
        .map((h) => h.symbol)
    )];
  }, [holdings]);

  useEffect(() => {
    if (symbols.length === 0) return;
    setLoading(true);
    setError(null);
    fetch(`/api/earnings?symbols=${symbols.join(',')}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => setError('Kunne ikke hente regnskabsdatoer'))
      .finally(() => setLoading(false));
  }, [symbols.join(',')]);

  // Build flat event list for display
  const allEvents = useMemo(() => {
    const list = [];
    const now = Date.now();
    const cutoffPast = now - 14 * 86400000; // 14 days ago
    const cutoffFuture = now + 180 * 86400000; // 180 days ahead

    for (const ev of events) {
      if (ev.earningsDate) {
        const ts = ev.earningsDate;
        if (ts >= cutoffPast && ts <= cutoffFuture) {
          list.push({
            symbol: ev.symbol,
            ts,
            tsEnd: ev.earningsDateEnd,
            type: 'earnings',
            label: 'Regnskab',
            color: 'blue',
          });
        }
      }
      if (ev.exDividendDate) {
        const ts = ev.exDividendDate;
        if (ts >= cutoffPast && ts <= cutoffFuture) {
          list.push({
            symbol: ev.symbol,
            ts,
            type: 'exdiv',
            label: 'Ex-udbytte',
            color: 'indigo',
          });
        }
      }
    }
    return list.sort((a, b) => a.ts - b.ts);
  }, [events]);

  if (!holdings || holdings.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Kommende begivenheder
        </h3>
        {loading && <span className="text-xs text-gray-400 animate-pulse">Henter...</span>}
        {error && <span className="text-xs text-amber-600">{error}</span>}
      </div>

      {!loading && allEvents.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">
          Ingen kommende regnskaber fundet for dine beholdninger
        </div>
      )}

      {allEvents.length > 0 && (
        <>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider bg-white">
                  <th className="px-5 py-2.5 text-left">Selskab</th>
                  <th className="px-3 py-2.5 text-left">Type</th>
                  <th className="px-3 py-2.5 text-left">Dato</th>
                  <th className="px-3 py-2.5 text-left">Tid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allEvents.map((ev, i) => {
                  const days = daysUntil(ev.ts);
                  const isPast = days < 0;
                  return (
                    <tr key={i} className={`hover:bg-gray-50 transition-colors ${isPast ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          ev.color === 'indigo' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {ev.symbol}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium ${
                          ev.color === 'indigo' ? 'text-indigo-600' : 'text-blue-600'
                        }`}>
                          {ev.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">
                        {fmtDate(ev.ts)}
                        {ev.tsEnd && ev.tsEnd !== ev.ts && (
                          <span className="text-gray-400"> – {fmtDate(ev.tsEnd)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <DayBadge days={days} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-gray-100">
            {allEvents.map((ev, i) => {
              const days = daysUntil(ev.ts);
              const isPast = days < 0;
              return (
                <div key={i} className={`px-4 py-3 flex items-center gap-3 ${isPast ? 'opacity-50' : ''}`}>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${
                    ev.color === 'indigo' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {ev.symbol}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-600">{ev.label}</p>
                    <p className="text-xs text-gray-400 tabular-nums">{fmtDate(ev.ts)}</p>
                  </div>
                  <DayBadge days={days} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
