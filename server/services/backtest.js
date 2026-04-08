// Asia-sweep strategy backtester.
//
// Strategy under test:
//   1. Each session day, identify Asian range = highest high / lowest low of
//      candles whose hour is 19..23 EST.
//   2. After the Asian range closes, if any subsequent candle high > range high
//      ("high sweep") OR low < range low ("low sweep"), that's the entry trigger.
//   3. Direction:
//        - low sweep  -> LONG  (we expect mean-reversion higher)
//        - high sweep -> SHORT
//      Optionally filter to only sweeps that align with the active MTF bias
//      ("aligned" mode = your stricter rule).
//   4. Entry = the first candle close after the sweep candle.
//      SL = opposite extreme of asian range +/- 5 pip buffer.
//      TP = entry +/- 2R.
//   5. Walk forward 15min candles until SL or TP is hit, or end of data.
//
// Returns aggregate stats: trades, wins, losses, win rate, avg R, expectancy,
// plus a list of individual trades for inspection.

const { getDeepHistory } = require('./twelveData');
const { ema, sma, rsi, macd } = require('../utils/indicators');
const { getPipValue } = require('../utils/helpers');

// Reuse the same scoring as live analysis so the bias filter is identical.
function biasFromCloses(closes) {
  if (closes.length < 60) return 'NEUTRAL';
  const price = closes[closes.length - 1];
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const s200 = sma(closes, 200) ?? sma(closes, Math.min(closes.length, 100));
  const r = rsi(closes, 14);
  const m = macd(closes);
  let bull = 0, bear = 0;
  if (e50 != null) (price > e50 ? bull++ : bear++);
  if (e20 != null && e50 != null) (e20 > e50 ? bull++ : bear++);
  if (s200 != null) (price > s200 ? bull++ : bear++);
  if (r != null) (r > 50 ? bull++ : bear++);
  if (m != null) (m.histogram > 0 ? bull++ : bear++);
  if (bull > bear) return 'BULLISH';
  if (bear > bull) return 'BEARISH';
  return 'NEUTRAL';
}

// Aggregate MTF bias from 4H, 1H, 30m, 15m closes up to a given timestamp.
function biasAtTime(c4hUpTo, c1hUpTo, c30mUpTo, c15mUpTo) {
  const tfs = [
    biasFromCloses(c4hUpTo),
    biasFromCloses(c1hUpTo),
    biasFromCloses(c30mUpTo),
    biasFromCloses(c15mUpTo),
  ];
  const bull = tfs.filter((b) => b === 'BULLISH').length;
  const bear = tfs.filter((b) => b === 'BEARISH').length;
  if (bull > bear) return { bias: 'BULLISH', alignment: bull };
  if (bear > bull) return { bias: 'BEARISH', alignment: bear };
  return { bias: 'NEUTRAL', alignment: 0 };
}

function dateOf(dt) {
  return dt.split(' ')[0];
}

function hourOf(dt) {
  const t = dt.split(' ')[1] || '00:00:00';
  return parseInt(t.split(':')[0], 10);
}

// Group 1h candles by "session date" — the calendar date of the asian session
// (which spans 19..23 of one day in EST).
function buildAsianRanges(c1h) {
  const byDate = {};
  for (const c of c1h) {
    const h = hourOf(c.datetime);
    if (h < 19 || h > 23) continue;
    const date = dateOf(c.datetime);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(c);
  }
  const ranges = [];
  for (const date of Object.keys(byDate).sort()) {
    const block = byDate[date];
    if (block.length < 3) continue; // need most of the session
    const high = Math.max(...block.map((c) => c.high));
    const low = Math.min(...block.map((c) => c.low));
    const endTs = new Date(block[block.length - 1].datetime).getTime() + 60 * 60 * 1000;
    ranges.push({ date, high, low, endTs });
  }
  return ranges;
}

function closesUpTo(candles, ts) {
  // Returns array of close prices for all candles strictly before ts.
  const out = [];
  for (const c of candles) {
    if (new Date(c.datetime).getTime() >= ts) break;
    out.push(c.close);
  }
  return out;
}

async function runBacktest({ pair, days = 30, onlyAligned = false }) {
  // Fetch deep history. We need enough 4h bars for indicators (~60 min) plus
  // the test window. 5000 15m bars ≈ 52 days of 24/5 forex.
  const need15m = Math.min(5000, days * 96);
  const need1h = Math.min(5000, days * 24 + 200);
  const need4h = Math.min(5000, Math.ceil(days * 6) + 200);
  const need30m = Math.min(5000, days * 48 + 200);

  const [c15, c30, c1h, c4h] = await Promise.all([
    getDeepHistory(pair, '15min', need15m),
    getDeepHistory(pair, '30min', need30m),
    getDeepHistory(pair, '1h', need1h),
    getDeepHistory(pair, '4h', need4h),
  ]);

  if (!c15.length || !c1h.length) {
    return { pair, days, trades: [], stats: null, error: 'Insufficient data' };
  }

  const pip = getPipValue(pair);
  const ranges = buildAsianRanges(c1h);
  const trades = [];

  for (const range of ranges) {
    // Walk 15m candles after range.endTs looking for a sweep
    const after = c15.filter((c) => new Date(c.datetime).getTime() >= range.endTs);
    if (!after.length) continue;

    // Find first sweep candle
    let sweepCandle = null;
    let sweepSide = null;
    for (const c of after) {
      if (c.high > range.high) { sweepCandle = c; sweepSide = 'high'; break; }
      if (c.low < range.low)  { sweepCandle = c; sweepSide = 'low';  break; }
    }
    if (!sweepCandle) continue;

    const sweepTs = new Date(sweepCandle.datetime).getTime();
    // Cap sweep search to within next 18h to keep trades intraday
    if (sweepTs - range.endTs > 18 * 3600 * 1000) continue;

    const direction = sweepSide === 'low' ? 'LONG' : 'SHORT';

    // Compute MTF bias as of the sweep
    const bias = biasAtTime(
      closesUpTo(c4h, sweepTs),
      closesUpTo(c1h, sweepTs),
      closesUpTo(c30, sweepTs),
      closesUpTo(c15, sweepTs)
    );
    const aligned =
      (direction === 'LONG' && bias.bias === 'BULLISH') ||
      (direction === 'SHORT' && bias.bias === 'BEARISH');

    if (onlyAligned && !aligned) continue;

    // Entry = close of sweep candle
    const entry = sweepCandle.close;
    let sl, tp, risk;
    if (direction === 'LONG') {
      sl = range.low - 5 * pip;
      risk = entry - sl;
      if (risk <= 0) continue;
      tp = entry + 2 * risk;
    } else {
      sl = range.high + 5 * pip;
      risk = sl - entry;
      if (risk <= 0) continue;
      tp = entry - 2 * risk;
    }

    // Walk forward 15m candles after the sweep
    const fwd = c15.filter((c) => new Date(c.datetime).getTime() > sweepTs);
    let outcome = 'open';
    let exitPrice = null;
    let exitTs = null;
    for (const c of fwd) {
      if (direction === 'LONG') {
        if (c.low <= sl)  { outcome = 'loss'; exitPrice = sl; exitTs = c.datetime; break; }
        if (c.high >= tp) { outcome = 'win';  exitPrice = tp; exitTs = c.datetime; break; }
      } else {
        if (c.high >= sl) { outcome = 'loss'; exitPrice = sl; exitTs = c.datetime; break; }
        if (c.low  <= tp) { outcome = 'win';  exitPrice = tp; exitTs = c.datetime; break; }
      }
    }
    if (outcome === 'open') continue; // skip unresolved

    const r = direction === 'LONG'
      ? (exitPrice - entry) / risk
      : (entry - exitPrice) / risk;

    trades.push({
      sessionDate: range.date,
      sweepAt: sweepCandle.datetime,
      side: sweepSide,
      direction,
      bias: bias.bias,
      aligned,
      entry,
      sl,
      tp,
      exitPrice,
      exitAt: exitTs,
      outcome,
      r,
    });
  }

  // Stats
  const wins = trades.filter((t) => t.outcome === 'win').length;
  const losses = trades.filter((t) => t.outcome === 'loss').length;
  const total = wins + losses;
  const winRate = total ? (wins / total) * 100 : null;
  const totalR = trades.reduce((acc, t) => acc + t.r, 0);
  const avgR = total ? totalR / total : null;
  const expectancy = avgR; // since R is per-trade returns in R units
  const alignedTrades = trades.filter((t) => t.aligned);
  const alignedWins = alignedTrades.filter((t) => t.outcome === 'win').length;
  const alignedRate = alignedTrades.length
    ? (alignedWins / alignedTrades.length) * 100
    : null;

  return {
    pair,
    days,
    onlyAligned,
    rangesScanned: ranges.length,
    trades,
    stats: {
      total,
      wins,
      losses,
      winRate,
      avgR,
      totalR,
      expectancy,
      alignedTotal: alignedTrades.length,
      alignedWins,
      alignedWinRate: alignedRate,
    },
  };
}

module.exports = { runBacktest };
