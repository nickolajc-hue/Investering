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

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const results = data?.quoteResponse?.result ?? [];

    const prices = {};
    for (const q of results) {
      prices[q.symbol] = {
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        name: q.shortName || q.longName || q.symbol,
        currency: q.currency || 'USD',
        marketState: q.marketState || 'CLOSED',
      };
    }

    return NextResponse.json({ prices });
  } catch (err) {
    console.error('Price fetch error:', err.message);
    return NextResponse.json({ prices: {}, error: err.message }, { status: 500 });
  }
}
