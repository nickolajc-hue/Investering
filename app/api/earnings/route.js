import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://finance.yahoo.com/',
  Origin: 'https://finance.yahoo.com',
};

// ── Crumb auth (cached in-process) ────────────────────────────────────────────
let _crumb = null;
let _cookies = '';
let _crumbExpiry = 0;

async function getAuth() {
  if (_crumb && Date.now() < _crumbExpiry) return { crumb: _crumb, cookies: _cookies };

  // Step 1: get session cookie from Yahoo Finance main page
  const sessionRes = await fetch('https://finance.yahoo.com/', {
    headers: {
      'User-Agent': HEADERS['User-Agent'],
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  let cookieStr = '';
  if (sessionRes?.ok) {
    const raw = sessionRes.headers.getSetCookie?.() ?? [];
    cookieStr = raw.map((c) => c.split(';')[0]).join('; ');
  }

  // Step 2: fetch crumb
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...HEADERS, Cookie: cookieStr },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  const crumb = crumbRes?.ok ? (await crumbRes.text()).trim() : null;
  if (!crumb || crumb === 'null' || crumb.length > 30) return null;

  _crumb = crumb;
  _cookies = cookieStr;
  _crumbExpiry = Date.now() + 55 * 60 * 1000; // 55 min
  return { crumb, cookies: cookieStr };
}

// ── Strategy 1: chart endpoint (same path as /api/history — known to work) ───
async function fetchViaChart(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const future = now + 365 * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${now - 86400}&period2=${future}&interval=1mo&events=earnings,dividends`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta ?? {};
  const events = result.events ?? {};

  // Earnings: prefer earningsTimestampsStart (next expected window)
  const eStart = meta.earningsTimestampsStart;
  const eEnd   = meta.earningsTimestampsEnd;
  // Also check timestamps array for upcoming ones
  const allEts = (meta.earningsTimestamps ?? []).filter((t) => t > now);
  const allEtsInEvents = Object.values(events.earnings ?? {})
    .map((e) => e.date ?? e.startdatets)
    .filter((t) => t && t > now);

  const upcoming = [...new Set([...allEts, ...allEtsInEvents])].sort((a, b) => a - b);

  let earningsDate = null;
  let earningsDateEnd = null;
  if (eStart && eStart > now) {
    earningsDate    = eStart * 1000;
    earningsDateEnd = eEnd && eEnd > now ? eEnd * 1000 : null;
  } else if (upcoming.length > 0) {
    earningsDate = upcoming[0] * 1000;
  }

  // Ex-dividend from events (filter future only)
  const futureDivs = Object.values(events.dividends ?? {})
    .filter((d) => d.date > now)
    .sort((a, b) => a.date - b.date);
  const exDivDate = futureDivs[0]?.date ? futureDivs[0].date * 1000 : null;

  return { symbol, earningsDate, earningsDateEnd, exDividendDate: exDivDate };
}

// ── Strategy 2: quoteSummary with crumb auth ──────────────────────────────────
async function fetchViaQuoteSummary(symbol) {
  const auth = await getAuth();
  const crumbQ = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents${crumbQ}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, ...(auth ? { Cookie: auth.cookies } : {}) },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const cal = data?.quoteSummary?.result?.[0]?.calendarEvents;
  if (!cal) return null;

  const earningsDates = (cal.earnings?.earningsDate ?? []).map((d) => d.raw * 1000);
  return {
    symbol,
    earningsDate:    earningsDates[0] ?? null,
    earningsDateEnd: earningsDates[1] ?? null,
    exDividendDate:  cal.exDividendDate?.raw ? cal.exDividendDate.raw * 1000 : null,
  };
}

async function fetchCalendarEvents(symbol) {
  // Try chart endpoint first (no auth required)
  const chart = await fetchViaChart(symbol).catch(() => null);
  if (chart?.earningsDate || chart?.exDividendDate) return chart;

  // Fall back to quoteSummary with crumb
  const qs = await fetchViaQuoteSummary(symbol).catch(() => null);
  if (qs?.earningsDate || qs?.exDividendDate) return qs;

  // Return partial result if we at least have a symbol
  return chart ?? null;
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
