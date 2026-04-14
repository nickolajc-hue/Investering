import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');
  if (!symbolsParam?.trim()) return NextResponse.json({ prices: {} });

  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);

  const results = await Promise.allSettled(symbols.map(fetchSymbolPrice));

  const prices = {};
  const failed = [];

  for (let i = 0; i < symbols.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      prices[symbols[i]] = r.value;
    } else {
      failed.push(symbols[i]);
      console.error(`Price fetch failed for ${symbols[i]}:`, r.reason?.message);
    }
  }

  return NextResponse.json({ prices, failed });
}

async function fetchSymbolPrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://finance.yahoo.com/',
      Origin: 'https://finance.yahoo.com',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('Tomt svar fra Yahoo Finance');

  const meta = result.meta;
  const currentPrice = meta.regularMarketPrice ?? null;
  const previousClose =
    meta.previousClose ?? meta.chartPreviousClose ?? null;

  return {
    price: currentPrice,
    previousClose,
    change:
      currentPrice !== null && previousClose !== null
        ? currentPrice - previousClose
        : null,
    changePercent:
      currentPrice !== null && previousClose !== null && previousClose > 0
        ? ((currentPrice - previousClose) / previousClose) * 100
        : null,
    name: meta.shortName || meta.longName || symbol,
    currency: meta.currency || 'USD',
  };
}
