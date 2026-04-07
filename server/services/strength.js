const { getQuote } = require('./twelveData');

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];

// Build the 28 unique pairs from 8 currencies. Use the conventional base order
// (the side that is normally quoted first on the market) so % change signs are correct.
// Convention: EUR > GBP > AUD > NZD > USD > CAD > CHF > JPY
const ORDER = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
const PAIRS = [];
for (let i = 0; i < ORDER.length; i++) {
  for (let j = i + 1; j < ORDER.length; j++) {
    PAIRS.push(`${ORDER[i]}/${ORDER[j]}`);
  }
}

async function computeStrength() {
  const quotes = await Promise.all(
    PAIRS.map(async (pair) => {
      try {
        const q = await getQuote(pair);
        const close = parseFloat(q.close ?? q.price);
        const prev = parseFloat(q.previous_close);
        if (!isFinite(close) || !isFinite(prev) || prev === 0) return null;
        const pct = ((close - prev) / prev) * 100;
        return { pair, pct, close };
      } catch {
        return null;
      }
    })
  );

  // For each currency, average pct (positive when base, negative when quote)
  const sums = Object.fromEntries(CURRENCIES.map((c) => [c, { total: 0, n: 0 }]));
  for (const q of quotes) {
    if (!q) continue;
    const [base, quote] = q.pair.split('/');
    sums[base].total += q.pct;
    sums[base].n += 1;
    sums[quote].total -= q.pct;
    sums[quote].n += 1;
  }

  const raw = CURRENCIES.map((c) => ({
    currency: c,
    avgPct: sums[c].n ? sums[c].total / sums[c].n : 0,
  }));

  // Normalize to a 0–100 score for visualization
  const max = Math.max(...raw.map((r) => Math.abs(r.avgPct)), 0.0001);
  const scored = raw
    .map((r) => ({
      currency: r.currency,
      avgPct: r.avgPct,
      score: 50 + (r.avgPct / max) * 50, // 0..100
    }))
    .sort((a, b) => b.avgPct - a.avgPct);

  return {
    timestamp: new Date().toISOString(),
    currencies: scored,
    pairsUsed: quotes.filter(Boolean).length,
    pairsTotal: PAIRS.length,
  };
}

module.exports = { computeStrength };
