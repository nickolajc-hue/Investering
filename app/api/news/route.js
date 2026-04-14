import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam?.trim()) {
    return NextResponse.json({ news: [] });
  }

  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  const results = await Promise.allSettled(symbols.map((symbol) => fetchNewsForSymbol(symbol)));

  const allNews = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return NextResponse.json({ news: allNews });
}

async function fetchNewsForSymbol(symbol) {
  const url = `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(symbol)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/xml, application/xml, application/rss+xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${symbol}`);
  }

  const xml = await response.text();
  return parseRSS(xml, symbol);
}

function parseRSS(xml, symbol) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractContent(itemXml, 'title');
    const link = extractContent(itemXml, 'link');
    const pubDate = extractContent(itemXml, 'pubDate');
    const description = extractContent(itemXml, 'description');
    const guid = extractContent(itemXml, 'guid');

    if (!title) continue;

    items.push({
      symbol,
      title: cleanText(title),
      link: link || guid || '',
      pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      description: description ? cleanText(stripHtml(description)).substring(0, 400) : '',
    });
  }

  return items;
}

// Handles both <tag><![CDATA[...]]></tag> and plain <tag>text</tag>
function extractContent(xml, tag) {
  const cdataRe = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`,
    'i'
  );
  const cdataMatch = cdataRe.exec(xml);
  if (cdataMatch) return cdataMatch[1];

  const textRe = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i');
  const textMatch = textRe.exec(xml);
  if (textMatch) return decodeEntities(textMatch[1]);

  return null;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
}
