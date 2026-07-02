export function buildChartData(history, tradable, crowdlending, rates, manual = []) {
  const allTs = new Set();
  const priceAt = {};

  for (const [sym, data] of Object.entries(history)) {
    priceAt[sym] = {};
    for (const { t, c } of (data.points || [])) {
      priceAt[sym][t] = c;
      allTs.add(t);
    }
  }

  // When no stock history exists, generate timestamps from crowdlending/manual dates
  if (allTs.size === 0 && (crowdlending.length > 0 || manual.length > 0)) {
    for (const cl of crowdlending) {
      const startTs = Math.floor(new Date(cl.startDate || cl.buyDate || '2020-01-01').getTime() / 1000);
      allTs.add(startTs);
      for (const p of (cl.payments || [])) {
        allTs.add(Math.floor(new Date(p.date).getTime() / 1000));
      }
    }
    for (const m of manual) {
      const startTs = Math.floor(new Date(m.buyDate || '2020-01-01').getTime() / 1000);
      allTs.add(startTs);
    }
    allTs.add(Math.floor(Date.now() / 1000));
  }

  const sorted = [...allTs].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const lastSeen = {};

  return sorted.map((ts) => {
    let value = 0;

    for (const h of tradable) {
      if (h.buyDate && ts < new Date(h.buyDate).getTime() / 1000) continue;
      if (h.sellDate && ts > new Date(h.sellDate).getTime() / 1000) continue;
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

    for (const m of manual) {
      const startTs = m.buyDate ? new Date(m.buyDate).getTime() / 1000 : 0;
      if (ts < startTs) continue;
      if (m.sellDate && ts > new Date(m.sellDate).getTime() / 1000) continue;
      const p = m.manualPrice ?? m.avgBuyPrice ?? 0;
      const rate = rates[m.currency || 'DKK'] ?? 1;
      value += m.shares * p * rate;
    }

    return { t: ts * 1000, v: Math.round(value) };
  });
}

/** Build {t, portfolio, benchmark} series — both normalised to 0% at first point. */
export function buildComparisonData(history, tradable, crowdlending, rates, benchmarkSymbol, manual = []) {
  const portfolioRaw = buildChartData(history, tradable, crowdlending, rates, manual);
  if (portfolioRaw.length === 0) return [];

  const benchPoints = (history[benchmarkSymbol]?.points || []).slice().sort((a, b) => a.t - b.t);
  if (benchPoints.length === 0) return [];

  const benchTs    = benchPoints.map((p) => p.t);
  const benchPrice = Object.fromEntries(benchPoints.map(({ t, c }) => [t, c]));
  const benchBase  = benchPoints[0].c;
  const portBase   = portfolioRaw.find((d) => d.v > 0)?.v ?? 1;

  let idx = 0;
  let lastBench = null;
  const result = [];

  for (const { t, v } of portfolioRaw) {
    const tsS = t / 1000;
    while (idx < benchTs.length && benchTs[idx] <= tsS) {
      lastBench = benchPrice[benchTs[idx]];
      idx++;
    }
    if (lastBench == null) continue;
    result.push({
      t,
      portfolio: portBase  > 0 ? +((v          / portBase  - 1) * 100).toFixed(2) : 0,
      benchmark: benchBase > 0 ? +((lastBench  / benchBase - 1) * 100).toFixed(2) : 0,
    });
  }
  return result;
}
