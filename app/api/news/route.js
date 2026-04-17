import { NextResponse } from 'next/server';
import { fetchNewsForSymbols } from '@/lib/news';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');
  if (!symbolsParam?.trim()) return NextResponse.json({ news: [] });

  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const news = await fetchNewsForSymbols(symbols);
  return NextResponse.json({ news });
}
