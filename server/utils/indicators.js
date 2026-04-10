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

// RSI as a full series (needed for divergence detection)
function rsiSeries(values, period = 14) {
  const out = [];
  if (values.length < period + 1) return out;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  // First RSI value at index `period`
  const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  // Pad with nulls
  for (let i = 0; i < period; i++) out.push(null);
  out.push(firstRsi);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return out;
}

// Detect swing pivot highs/lows using N-bar lookback/lookahead.
// Returns arrays of { idx, price, rsi } objects.
function findSwingPivots(highs, lows, rsiArr, barsAround = 5) {
  const swingHighs = [];
  const swingLows = [];
  const len = highs.length;

  for (let i = barsAround; i < len - barsAround; i++) {
    if (rsiArr[i] == null) continue;

    // Swing high: highs[i] is the highest of surrounding bars
    let isHigh = true;
    for (let j = i - barsAround; j <= i + barsAround; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) { isHigh = false; break; }
    }
    if (isHigh) swingHighs.push({ idx: i, price: highs[i], rsi: rsiArr[i] });

    // Swing low: lows[i] is the lowest of surrounding bars
    let isLow = true;
    for (let j = i - barsAround; j <= i + barsAround; j++) {
      if (j === i) continue;
      if (lows[j] <= lows[i]) { isLow = false; break; }
    }
    if (isLow) swingLows.push({ idx: i, price: lows[i], rsi: rsiArr[i] });
  }

  return { swingHighs, swingLows };
}

// Detect RSI divergence from candle arrays.
// Returns { bearish: bool, bullish: bool, details: string }
// Bearish div: price makes higher high but RSI makes lower high
// Bullish div: price makes lower low but RSI makes higher low
function detectRsiDivergence(candles, period = 14, pivotBars = 5) {
  if (!candles || candles.length < period + pivotBars * 2 + 10) {
    return { bearish: false, bullish: false, details: null };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const rsiArr = rsiSeries(closes, period);

  const { swingHighs, swingLows } = findSwingPivots(highs, lows, rsiArr, pivotBars);

  let bearish = false;
  let bullish = false;
  let details = null;

  // Check the last two swing highs for bearish divergence
  if (swingHighs.length >= 2) {
    const prev = swingHighs[swingHighs.length - 2];
    const curr = swingHighs[swingHighs.length - 1];
    // Price higher high + RSI lower high = bearish divergence
    if (curr.price > prev.price && curr.rsi < prev.rsi - 1) {
      bearish = true;
      details = `Bearish div: price HH (${curr.price.toFixed(5)}) but RSI LH (${curr.rsi.toFixed(0)} < ${prev.rsi.toFixed(0)})`;
    }
  }

  // Check the last two swing lows for bullish divergence
  if (swingLows.length >= 2) {
    const prev = swingLows[swingLows.length - 2];
    const curr = swingLows[swingLows.length - 1];
    // Price lower low + RSI higher low = bullish divergence
    if (curr.price < prev.price && curr.rsi > prev.rsi + 1) {
      bullish = true;
      const d = `Bullish div: price LL (${curr.price.toFixed(5)}) but RSI HL (${curr.rsi.toFixed(0)} > ${prev.rsi.toFixed(0)})`;
      details = details ? `${details}; ${d}` : d;
    }
  }

  return { bearish, bullish, details };
}

module.exports = { sma, smaSeries, ema, emaSeries, rsi, rsiSeries, macd, detectRsiDivergence };
