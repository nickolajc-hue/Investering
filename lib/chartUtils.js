export function buildChartData(history, tradable, crowdlending, rates) {
  const allTs = new Set();
  const priceAt = {};

  for (const [sym, data] of Object.entries(history)) {
    priceAt[sym] = {};
    for (const { t, c } of (data.points || [])) {
      priceAt[sym][t] = c;
      allTs.add(t);
    }
  }

  const sorted = [...allTs].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const lastSeen = {};

  return sorted.map((ts) => {
    let value = 0;

    for (const h of tradable) {
      if (h.buyDate && ts < new Date(h.buyDate).getTime() / 1000) continue;
      const raw = priceAt[h.symbol]?.[ts] ?? lastSeen[h.symbol];
      if (raw != null) {
        lastSeen[h.symbol] = raw;
        const rate = rates[history[h.symbol]?.currency || 'USD'] ?? 6.9;
        value += h.shares * raw * rate;
      }
    }

    for (const cl of crowdlending) {
      const startTs = new Date(cl.startDate || cl.buyDate || '2020-01-01').getTime() / 1000;
      if (ts < startTs) continue;
      const rate = rates[cl.currency || 'DKK'] ?? 1;
      const interest = (cl.payments || [])
        .filter((p) => new Date(p.date).getTime() / 1000 <= ts)
        .reduce((sum, p) => sum + p.amount, 0);
      value += (cl.invested + interest) * rate;
    }

    return { t: ts * 1000, v: Math.round(value) };
  });
}
