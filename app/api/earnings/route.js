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

  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...HEADERS, Cookie: cookieStr },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  const crumb = crumbRes?.ok ? (await crumbRes.text()).trim() : null;
  if (!crumb || crumb === 'null' || crumb.length > 30) return null;

  _crumb = crumb;
  _cookies = cookieStr;
  _crumbExpiry = Date.now() + 55 * 60 * 1000;
  return { crumb, cookies: cookieStr };
}

// ── Strategy 1: chart with range=1y (same pattern as working history route) ───
async function fetchViaChart(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1mo&events=earnings,dividends&includePrePost=false`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta ?? {};
  const events = result.events ?? {};

  // Gather all upcoming earnings timestamps from meta fields
  const eStart = meta.earningsTimestampsStart;
  const eEnd   = meta.earningsTimestampsEnd;
  const allEts = (meta.earningsTimestamps ?? []).filter((t) => t > now - 86400);

  // Also from events.earnings (historical + future)
  const allEtsInEvents = Object.values(events.earnings ?? {})
    .map((e) => e.date ?? e.startdatets)
    .filter((t) => t && t > now - 86400);

  const upcoming = [...new Set([...allEts, ...allEtsInEvents])].sort((a, b) => a - b);

  let earningsDate = null;
  let earningsDateEnd = null;
  if (eStart && eStart > now - 86400) {
    earningsDate    = eStart * 1000;
    earningsDateEnd = eEnd && eEnd > now - 86400 ? eEnd * 1000 : null;
  } else if (upcoming.length > 0) {
    earningsDate    = upcoming[0] * 1000;
  }

  // Ex-dividend: include future ones (within 1 year)
  const futureDivs = Object.values(events.dividends ?? {})
    .filter((d) => d.date > now - 86400)
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
  }).catch(() => null);
  if (!res?.ok) return null;
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

// ── Strategy 3: v11 quote endpoint ────────────────────────────────────────────
async function fetchViaQuote(symbol) {
  const auth = await getAuth();
  const crumbQ = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents${crumbQ}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, ...(auth ? { Cookie: auth.cookies } : {}) },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
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
  const chart = await fetchViaChart(symbol);
  if (chart?.earningsDate || chart?.exDividendDate) return chart;

  const qs = await fetchViaQuoteSummary(symbol);
  if (qs?.earningsDate || qs?.exDividendDate) return qs;

  const q11 = await fetchViaQuote(symbol);
  if (q11?.earningsDate || q11?.exDividendDate) return q11;

  return chart ?? qs ?? null;
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
