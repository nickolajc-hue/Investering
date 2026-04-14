import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Fallback rates if Yahoo Finance is unreachable
const FALLBACK = {
  DKK: 1,
  USD: 6.9,
  EUR: 7.46,
  GBP: 8.75,
  SEK: 0.64,
  NOK: 0.62,
  CHF: 7.8,
};

const PAIRS = [
  { currency: 'USD', symbol: 'USDDKK=X' },
  { currency: 'EUR', symbol: 'EURDKK=X' },
  { currency: 'GBP', symbol: 'GBPDKK=X' },
  { currency: 'SEK', symbol: 'SEKDKK=X' },
  { currency: 'NOK', symbol: 'NOKDKK=X' },
  { currency: 'CHF', symbol: 'CHFDKK=X' },
];

export async function GET() {
  const results = await Promise.allSettled(PAIRS.map((p) => fetchRate(p.symbol)));

  const rates = { DKK: 1 };
  for (let i = 0; i < PAIRS.length; i++) {
    rates[PAIRS[i].currency] =
      results[i].status === 'fulfilled' ? results[i].value : FALLBACK[PAIRS[i].currency];
  }

  return NextResponse.json({ rates });
}

async function fetchRate(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Referer: 'https://finance.yahoo.com/',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!price) throw new Error('No rate');
  return price;
}
