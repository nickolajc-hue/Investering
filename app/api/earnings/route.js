import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchCalendarEvents(symbol) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const cal = data?.quoteSummary?.result?.[0]?.calendarEvents;
  if (!cal) return null;

  const earningsDates = (cal.earnings?.earningsDate || []).map((d) => d.raw * 1000);
  const exDivDate = cal.exDividendDate?.raw ? cal.exDividendDate.raw * 1000 : null;
  const divDate = cal.dividendDate?.raw ? cal.dividendDate.raw * 1000 : null;

  return {
    symbol,
    earningsDate: earningsDates[0] ?? null,
    earningsDateEnd: earningsDates[1] ?? null,
    exDividendDate: exDivDate,
    dividendDate: divDate,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') || '';
  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 25);

  if (symbols.length === 0) return NextResponse.json({ events: [] });

  const results = await Promise.allSettled(symbols.map(fetchCalendarEvents));

  const events = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);

  return NextResponse.json({ events });
}
