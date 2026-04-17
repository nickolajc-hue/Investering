import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://finance.yahoo.com/',
  Origin: 'https://finance.yahoo.com',
};

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

async function fetchQuoteSummary(symbol, auth) {
  const modules = 'summaryDetail,financialData,defaultKeyStatistics,balanceSheetHistoryQuarterly,recommendationTrend';
  const crumbQ = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}${crumbQ}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, ...(auth ? { Cookie: auth.cookies } : {}) },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  return data?.quoteSummary?.result?.[0] ?? null;
}

function evaluateCriteria(symbol, q) {
  if (!q) return { symbol, error: true, criteria: null, passCount: 0, name: symbol };

  const sd  = q.summaryDetail ?? {};
  const fd  = q.financialData ?? {};
  const ks  = q.defaultKeyStatistics ?? {};
  const bsh = q.balanceSheetHistoryQuarterly?.balanceSheetStatements ?? [];
  const rt  = q.recommendationTrend?.trend ?? [];

  const name = fd.companyName ?? symbol;

  // 1. Cash > Total Debt
  const cash      = fd.totalCash?.raw ?? null;
  const totalDebt = fd.totalDebt?.raw ?? null;
  const c1 = cash !== null && totalDebt !== null ? cash > totalDebt : null;

  // 2. Total Liabilities / Shareholders' Equity < 0.8
  // Use balance sheet: totalLiab / totalStockholderEquity
  const bs0 = bsh[0] ?? {};
  const totalLiab   = bs0.totalLiab?.raw ?? null;
  const totalEquity = bs0.totalStockholderEquity?.raw ?? null;
  const debtToEquityRatio = totalLiab !== null && totalEquity !== null && totalEquity > 0
    ? totalLiab / totalEquity : null;
  const c2 = debtToEquityRatio !== null ? debtToEquityRatio < 0.8 : null;

  // 3. No preferred stock (preferredStock === 0 or absent)
  const preferredStock = bs0.preferredStock?.raw ?? 0;
  const c3 = preferredStock === 0 || preferredStock === null;

  // 4. Retained earnings increased YoY (compare most recent 2 quarters separated by ~4 quarters)
  let c4 = null;
  if (bsh.length >= 2) {
    const re0 = bsh[0]?.retainedEarnings?.raw ?? null;
    // find entry ~4 quarters back
    const re4 = bsh[Math.min(4, bsh.length - 1)]?.retainedEarnings?.raw ?? null;
    if (re0 !== null && re4 !== null) c4 = re0 > re4;
  }

  // 5. Treasury stock exists (share buybacks present)
  const treasuryStock = bs0.treasuryStock?.raw ?? null;
  // treasury stock is typically negative on balance sheet
  const c5 = treasuryStock !== null && treasuryStock !== 0;

  // 6. Dividend yield >= 3%
  const divYield = sd.dividendYield?.raw ?? null;
  const c6 = divYield !== null ? divYield >= 0.03 : null;

  // 7. Analyst consensus >= Hold (mean recommendation 1=Buy…3=Hold…5=Sell; ≤3 = Hold or better)
  const meanRec = fd.recommendationMean?.raw ?? null;
  const recKey  = fd.recommendationKey ?? null;
  const c7 = meanRec !== null ? meanRec <= 3.0 : null;

  const criteria = [c1, c2, c3, c4, c5, c6, c7];
  const passCount = criteria.filter(Boolean).length;

  return {
    symbol,
    name,
    criteria,
    passCount,
    // extra display data
    cash,
    totalDebt,
    debtToEquityRatio,
    divYield,
    meanRec,
    recKey,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') || '';
  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);

  if (symbols.length === 0) return NextResponse.json({ results: [] });

  const auth = await getAuth();

  // Process in batches of 5 to avoid rate limiting
  const results = [];
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map((sym) => fetchQuoteSummary(sym, auth))
    );
    for (let j = 0; j < batch.length; j++) {
      const q = batchResults[j].status === 'fulfilled' ? batchResults[j].value : null;
      results.push(evaluateCriteria(batch[j], q));
    }
    if (i + 5 < symbols.length) await sleep(300);
  }

  results.sort((a, b) => b.passCount - a.passCount);
  return NextResponse.json({ results });
}
