'use client';

import { useState, useEffect, useCallback } from 'react';

const BADGE_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-300' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
];

function formatDate(isoDate) {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Lige nu';
  if (diffMins < 60) return `${diffMins} min siden`;
  if (diffHours < 24) return `${diffHours} time${diffHours !== 1 ? 'r' : ''} siden`;
  if (diffDays < 7) return `${diffDays} dag${diffDays !== 1 ? 'e' : ''} siden`;

  return date.toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function NewsCard({ item, color }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-md transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${color.bg} ${color.text} ${color.border}`}
        >
          {item.symbol}
        </span>
        <span className="text-xs text-gray-400 tabular-nums">{formatDate(item.pubDate)}</span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2 leading-snug group-hover:text-blue-600 transition-colors line-clamp-3">
        {item.title}
      </h3>
      {item.description && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 flex-1">
          {item.description}
        </p>
      )}
      <div className="mt-3 text-xs font-medium text-blue-500 group-hover:text-blue-700 transition-colors">
        Læs mere →
      </div>
    </a>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-14 bg-gray-200 rounded-full" />
        <div className="h-4 w-20 bg-gray-100 rounded" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-5/6" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-4/5" />
      </div>
    </div>
  );
}

export default function Home() {
  const [portfolio, setPortfolio] = useState(null);
  const [newSymbol, setNewSymbol] = useState('');
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [error, setError] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('aktie-portfolio');
    if (saved) {
      try {
        setPortfolio(JSON.parse(saved));
      } catch {
        setPortfolio(['AAPL', 'MSFT', 'NVDA']);
      }
    } else {
      setPortfolio(['AAPL', 'MSFT', 'NVDA']);
    }
  }, []);

  useEffect(() => {
    if (portfolio !== null) {
      localStorage.setItem('aktie-portfolio', JSON.stringify(portfolio));
    }
  }, [portfolio]);

  const fetchNews = useCallback(async (symbols) => {
    if (!symbols || symbols.length === 0) {
      setNews([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news?symbols=${symbols.join(',')}`);
      if (!res.ok) throw new Error('Serverfejl');
      const data = await res.json();
      setNews(data.news || []);
      setLastUpdated(new Date());
    } catch {
      setError('Kunne ikke hente nyheder. Tjek din forbindelse og prøv igen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (portfolio !== null) {
      fetchNews(portfolio);
      const interval = setInterval(() => fetchNews(portfolio), 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [portfolio, fetchNews]);

  const addStock = (e) => {
    e.preventDefault();
    const symbol = newSymbol.trim().toUpperCase();
    if (symbol && portfolio && !portfolio.includes(symbol)) {
      setPortfolio((prev) => [...prev, symbol]);
    }
    setNewSymbol('');
  };

  const removeStock = (symbol) => {
    setPortfolio((prev) => prev.filter((s) => s !== symbol));
    if (activeFilter === symbol) setActiveFilter('all');
  };

  const getColor = (symbol) => {
    if (!portfolio) return BADGE_COLORS[0];
    return BADGE_COLORS[portfolio.indexOf(symbol) % BADGE_COLORS.length];
  };

  const filteredNews =
    activeFilter === 'all' ? news : news.filter((n) => n.symbol === activeFilter);

  const isInitialLoading = portfolio === null || (loading && news.length === 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight truncate">
              Aktienyhedsfeed
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 h-4">
              {loading
                ? 'Henter nyheder...'
                : lastUpdated
                ? `Opdateret ${lastUpdated.toLocaleTimeString('da-DK', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
            </p>
          </div>
          <button
            onClick={() => portfolio && fetchNews(portfolio)}
            disabled={loading || !portfolio}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span className="hidden sm:inline">{loading ? 'Opdaterer...' : 'Opdater'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Portfolio Manager */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Mine aktier
          </h2>

          <div className="flex flex-wrap gap-2 mb-4 min-h-[2rem] items-center">
            {portfolio === null ? (
              <div className="h-7 w-28 bg-gray-100 rounded-full animate-pulse" />
            ) : portfolio.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Ingen aktier tilføjet endnu</p>
            ) : (
              portfolio.map((symbol) => {
                const color = getColor(symbol);
                return (
                  <span
                    key={symbol}
                    className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-sm font-semibold border ${color.bg} ${color.text} ${color.border}`}
                  >
                    {symbol}
                    <button
                      onClick={() => removeStock(symbol)}
                      aria-label={`Fjern ${symbol}`}
                      className="w-4 h-4 rounded-full hover:bg-black/10 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M9 3L3 9M3 3l6 6" />
                      </svg>
                    </button>
                  </span>
                );
              })
            )}
          </div>

          <form onSubmit={addStock} className="flex gap-2">
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="Aktiesymbol (f.eks. AAPL, NOVO-B.CO)"
              maxLength={20}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 min-w-0"
            />
            <button
              type="submit"
              disabled={!newSymbol.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors flex-shrink-0"
            >
              Tilføj
            </button>
          </form>
        </div>

        {/* Filter bar */}
        {portfolio && portfolio.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeFilter === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              Alle{' '}
              <span className={activeFilter === 'all' ? 'opacity-60' : 'opacity-50'}>
                ({news.length})
              </span>
            </button>
            {portfolio.map((symbol) => {
              const count = news.filter((n) => n.symbol === symbol).length;
              return (
                <button
                  key={symbol}
                  onClick={() => setActiveFilter(symbol)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeFilter === symbol
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {symbol}{' '}
                  <span className={activeFilter === symbol ? 'opacity-60' : 'opacity-50'}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-5 text-sm flex items-start gap-2">
            <svg
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </div>
        )}

        {/* News content */}
        {isInitialLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : portfolio?.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <svg
              className="w-14 h-14 mx-auto mb-4 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
              />
            </svg>
            <p className="text-base font-medium text-gray-500">Tilføj aktier for at se nyheder</p>
            <p className="text-sm mt-1">Indtast et aktiesymbol ovenfor</p>
          </div>
        ) : filteredNews.length === 0 && !loading ? (
          <div className="text-center py-20 text-gray-400">
            <p className="font-medium">Ingen nyheder fundet</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredNews.map((item, index) => (
              <NewsCard
                key={`${item.symbol}-${index}`}
                item={item}
                color={getColor(item.symbol)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
