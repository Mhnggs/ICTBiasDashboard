// Pearson correlation between % changes of the supported pairs.
// Re-uses fetchPairData (cached) so no extra API calls beyond what the
// scanner already pulled.

const { fetchPairData } = require('./twelveData');
const { SUPPORTED_PAIRS } = require('../utils/helpers');

function pctReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (!prev) { out.push(0); continue; }
    out.push((closes[i] - prev) / prev);
  }
  return out;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
    sumAB += a[i] * b[i];
  }
  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  if (!den) return 0;
  return num / den;
}

async function computeCorrelation({ interval = '1h', lookback = 50 } = {}) {
  // Pull candles for each pair (cached). We use the per-pair fetcher which
  // hits all 4 timeframes — that's fine because they're cached anyway.
  const seriesByPair = {};
  for (const pair of SUPPORTED_PAIRS) {
    try {
      const data = await fetchPairData(pair);
      let candles;
      if (interval === '4h') candles = data.candles4H;
      else if (interval === '30min') candles = data.candles30m;
      else if (interval === '15min') candles = data.candles15m;
      else if (interval === '5min') candles = data.candles5m;
      else candles = data.candles1H;
      const closes = candles.slice(-lookback).map((c) => c.close);
      seriesByPair[pair] = pctReturns(closes);
    } catch (err) {
      seriesByPair[pair] = null;
    }
  }

  const pairs = SUPPORTED_PAIRS;
  const matrix = pairs.map((row) =>
    pairs.map((col) => {
      const a = seriesByPair[row];
      const b = seriesByPair[col];
      if (!a || !b) return null;
      if (row === col) return 1;
      return pearson(a, b);
    })
  );

  return {
    timestamp: new Date().toISOString(),
    interval,
    lookback,
    pairs,
    matrix,
  };
}

module.exports = { computeCorrelation };
