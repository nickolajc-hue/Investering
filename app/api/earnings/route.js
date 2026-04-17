import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json',
  Referer: 'https://finance.yahoo.com/',
  Origin: 'https://finance.yahoo.com',
};

// ── Crumb auth ────────────────────────────────────────────────────────────────
let _crumb = null;
let _cookies = '';
let _crumbExpiry = 0;

async function getAuth() {
  if (_crumb && Date.now() < _crumbExpiry) return { crumb: _crumb, cookies: _cookies };

  const sessionRes = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);

  let cookieStr = '';
  if (sessionRes?.ok) {
    const raw = sessionRes.headers.getSetCookie?.() ?? [];
    cookieStr = raw.map((c) => c.split(';')[0]).join('; ');
  }

  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...BASE_HEADERS, Cookie: cookieStr },
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);

  const crumb = crumbRes?.ok ? (await crumbRes.text()).trim() : null;
  if (!crumb || crumb === 'null' || crumb.length > 30) return null;

  _crumb = crumb;
  _cookies = cookieStr;
  _crumbExpiry = Date.now() + 55 * 60 * 1000;
  return { crumb, cookies: cookieStr };
}

// ── Chart endpoint (range=1y) ─────────────────────────────────────────────────
// Yahoo Finance chart meta always contains earningsTimestampsStart/End for the
// NEXT upcoming earnings window regardless of range.
async function fetchViaChartRange(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1mo&events=earnings%2Cdividends&includePrePost=false`;
  const res = await fetch(url, { headers: BASE_HEADERS, signal: AbortSignal.timeout(9000) }).catch(() => null);
  if (!res?.ok) return null;
  return parseChartResponse(symbol, await res.json());
}

// ── Chart endpoint (future period) ────────────────────────────────────────────
// Querying a future period surface events.earnings for scheduled announcements.
async function fetchViaChartFuture(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const future = now + 366 * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${now - 86400}&period2=${future}&interval=3mo&events=earnings%2Cdividends`;
  const res = await fetch(url, { headers: BASE_HEADERS, signal: AbortSignal.timeout(9000) }).catch(() => null);
  if (!res?.ok) return null;
  return parseChartResponse(symbol, await res.json());
}

function parseChartResponse(symbol, data) {
  const now = Math.floor(Date.now() / 1000);
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const meta   = result.meta   ?? {};
  const events = result.events ?? {};

  const eStart = meta.earningsTimestampsStart;
  const eEnd   = meta.earningsTimestampsEnd;

  // All earnings timestamps from meta (filter out old ones > 14 days ago)
  const cutoff = now - 14 * 86400;
  const allEtsMeta = (meta.earningsTimestamps ?? []).filter((t) => t > cutoff);

  // All earnings from events block (includes future scheduled dates)
  const allEtsEvents = Object.values(events.earnings ?? {})
    .map((e) => e.date ?? e.startdatets)
    .filter((t) => t && t > cutoff);

  const upcoming = [...new Set([
    ...(eStart && eStart > cutoff ? [eStart] : []),
    ...allEtsMeta,
    ...allEtsEvents,
  ])].sort((a, b) => a - b);

  let earningsDate = null;
  let earningsDateEnd = null;

  if (eStart && eStart > cutoff) {
    earningsDate    = eStart * 1000;
    earningsDateEnd = eEnd && eEnd > cutoff ? eEnd * 1000 : null;
  } else if (upcoming.length > 0) {
    earningsDate = upcoming[0] * 1000;
  }

  // Ex-dividend: future only (allow up to 2 weeks in past)
  const futureDivs = Object.values(events.dividends ?? {})
    .filter((d) => d.date > cutoff)
    .sort((a, b) => a.date - b.date);
  const exDivDate = futureDivs[0]?.date ? futureDivs[0].date * 1000 : null;

  return { symbol, earningsDate, earningsDateEnd, exDividendDate: exDivDate };
}

// ── quoteSummary: calendarEvents module ──────────────────────────────────────
async function fetchViaQuoteSummary(symbol, host, version, auth) {
  const crumbQ = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const url = `https://${host}.finance.yahoo.com/${version}/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents${crumbQ}`;
  const res = await fetch(url, {
    headers: { ...BASE_HEADERS, ...(auth ? { Cookie: auth.cookies } : {}) },
    signal: AbortSignal.timeout(9000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  const cal = data?.quoteSummary?.result?.[0]?.calendarEvents;
  if (!cal) return null;

  const earningsDates = (cal.earnings?.earningsDate ?? []).map((d) => d.raw * 1000).filter(Boolean);
  const exDivRaw = cal.exDividendDate?.raw;
  return {
    symbol,
    earningsDate:    earningsDates[0] ?? null,
    earningsDateEnd: earningsDates[1] ?? null,
    exDividendDate:  exDivRaw ? exDivRaw * 1000 : null,
  };
}

// ── Merge two results, preferring non-null fields ─────────────────────────────
function merge(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    symbol: a.symbol,
    earningsDate:    a.earningsDate    ?? b.earningsDate,
    earningsDateEnd: a.earningsDateEnd ?? b.earningsDateEnd,
    exDividendDate:  a.exDividendDate  ?? b.exDividendDate,
  };
}

async function fetchCalendarEvents(symbol) {
  // Get auth once (cached) for quoteSummary calls
  const authPromise = getAuth();

  // Run all strategies in parallel
  const [chartRange, chartFuture] = await Promise.allSettled([
    fetchViaChartRange(symbol),
    fetchViaChartFuture(symbol),
  ]);

  let combined = merge(
    chartRange.status  === 'fulfilled' ? chartRange.value  : null,
    chartFuture.status === 'fulfilled' ? chartFuture.value : null,
  );

  // If chart results are incomplete, try quoteSummary endpoints
  if (!combined?.earningsDate) {
    const auth = await authPromise.catch(() => null);
    const [qs1, qs2, qs11] = await Promise.allSettled([
      fetchViaQuoteSummary(symbol, 'query1', 'v10', null),
      fetchViaQuoteSummary(symbol, 'query2', 'v10', auth),
      fetchViaQuoteSummary(symbol, 'query1', 'v11', null),
    ]);
    for (const r of [qs1, qs2, qs11]) {
      if (r.status === 'fulfilled') combined = merge(combined, r.value);
      if (combined?.earningsDate) break;
    }
  }

  return combined;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get('symbols') || '')
    .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 25);

  if (symbols.length === 0) return NextResponse.json({ events: [] });

  const results = await Promise.allSettled(symbols.map(fetchCalendarEvents));
  const events = results
    .filter((r) => r.status === 'fulfilled' && r.value && (r.value.earningsDate || r.value.exDividendDate))
    .map((r) => r.value);

  return NextResponse.json({ events });
}
