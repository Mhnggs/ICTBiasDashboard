// Technical indicator calculations: EMA, SMA, RSI, MACD

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function smaSeries(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    const slice = values.slice(i - period + 1, i + 1);
    out.push(slice.reduce((s, v) => s + v, 0) / period);
  }
  return out;
}

function emaSeries(values, period) {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [];
  // Seed with SMA of first `period` values
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
    } else if (i === period - 1) {
      const seed = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
      out.push(seed);
      prev = seed;
    } else {
      const e = values[i] * k + prev * (1 - k);
      out.push(e);
      prev = e;
    }
  }
  return out;
}

function ema(values, period) {
  const series = emaSeries(values, period);
  return series[series.length - 1];
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  // Seed
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Wilder smoothing for the rest
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(values, fast = 12, slow = 26, signal = 9) {
  if (values.length < slow + signal) return null;
  const emaFast = emaSeries(values, fast);
  const emaSlow = emaSeries(values, slow);
  const macdLine = emaFast.map((v, i) => (v != null && emaSlow[i] != null) ? v - emaSlow[i] : null);
  const macdValid = macdLine.filter(v => v != null);
  const signalSeries = emaSeries(macdValid, signal);
  const macdNow = macdLine[macdLine.length - 1];
  const signalNow = signalSeries[signalSeries.length - 1];
  if (macdNow == null || signalNow == null) return null;
  return {
    macd: macdNow,
    signal: signalNow,
    histogram: macdNow - signalNow,
  };
}

module.exports = { sma, smaSeries, ema, emaSeries, rsi, macd };
