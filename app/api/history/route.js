import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const RANGE_CONFIG = {
  '1d':  { range: '1d',  interval: '5m'  },
  '1mo': { range: '1mo', interval: '1d'  },
  '6mo': { range: '6mo', interval: '1d'  },
  '1y':  { range: '1y',  interval: '1wk' },
  'ytd': { range: 'ytd', interval: '1d'  },
  'max': { range: 'max', interval: '1wk' },
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');
  const range = searchParams.get('range') || '1mo';

  if (!symbolsParam?.trim()) return NextResponse.json({ history: {} });

  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  const config = RANGE_CONFIG[range] || RANGE_CONFIG['1mo'];

  const results = await Promise.allSettled(
    symbols.map((sym) => fetchHistory(sym, config.range, config.interval))
  );

  const history = {};
  for (let i = 0; i < symbols.length; i++) {
    if (results[i].status === 'fulfilled') {
      history[symbols[i]] = results[i].value;
    }
  }

  return NextResponse.json({ history });
}

async function fetchHistory(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://finance.yahoo.com/',
      Origin: 'https://finance.yahoo.com',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No data');

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const currency = result.meta?.currency || 'USD';

  const points = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      points.push({ t: timestamps[i], c: closes[i] });
    }
  }

  return { points, currency };
}
