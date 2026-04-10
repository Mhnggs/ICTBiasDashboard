const { getPipValue, priceToPips, formatPrice } = require('../utils/helpers');
const { isInsideKillzone } = require('./session');
const { ema, sma, rsi, macd } = require('../utils/indicators');

// ---------- INDICATOR-BASED BIAS PER TIMEFRAME ----------
function analyzeTimeframe(candles, label) {
  if (!candles || candles.length < 60) {
    return { label, bias: 'NEUTRAL', score: 0, indicators: {}, factors: [] };
  }
  const closes = candles.map(c => c.close);
  const price = closes[closes.length - 1];

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const sma200 = sma(closes, 200) ?? sma(closes, Math.min(closes.length, 100));
  const rsiVal = rsi(closes, 14);
  const macdVal = macd(closes);

  const factors = [];
  let bull = 0;
  let bear = 0;

  // 1. Price vs EMA50
  if (ema50 != null) {
    if (price > ema50) { bull++; factors.push({ name: 'Price > EMA50', bullish: true }); }
    else { bear++; factors.push({ name: 'Price < EMA50', bullish: false }); }
  }

  // 2. EMA20 vs EMA50 (fast trend)
  if (ema20 != null && ema50 != null) {
    if (ema20 > ema50) { bull++; factors.push({ name: 'EMA20 > EMA50', bullish: true }); }
    else { bear++; factors.push({ name: 'EMA20 < EMA50', bullish: false }); }
  }

  // 3. Price vs SMA200 (long-term)
  if (sma200 != null) {
    if (price > sma200) { bull++; factors.push({ name: 'Price > SMA200', bullish: true }); }
    else { bear++; factors.push({ name: 'Price < SMA200', bullish: false }); }
  }

  // 4. RSI direction (>50 bullish)
  if (rsiVal != null) {
    if (rsiVal > 50) { bull++; factors.push({ name: `RSI ${rsiVal.toFixed(0)} > 50`, bullish: true }); }
    else { bear++; factors.push({ name: `RSI ${rsiVal.toFixed(0)} < 50`, bullish: false }); }
  }

  // 5. MACD (line vs signal)
  if (macdVal != null) {
    if (macdVal.histogram > 0) { bull++; factors.push({ name: 'MACD bullish cross', bullish: true }); }
    else { bear++; factors.push({ name: 'MACD bearish cross', bullish: false }); }
  }

  let bias = 'NEUTRAL';
  if (bull >= 4) bias = 'BULLISH';
  else if (bear >= 4) bias = 'BEARISH';
  else if (bull > bear) bias = 'BULLISH';
  else if (bear > bull) bias = 'BEARISH';

  return {
    label,
    bias,
    score: bias === 'BULLISH' ? bull : bias === 'BEARISH' ? bear : 0,
    bullCount: bull,
    bearCount: bear,
    indicators: {
      price,
      ema20,
      ema50,
      sma200,
      rsi: rsiVal,
      macd: macdVal,
    },
    factors,
  };
}

// ---------- ASIAN RANGE (18:00-23:59 EST / 6 PM - midnight NY) ----------
// Twelve Data candle datetimes are in America/New_York (set in the API call).
// The 1H candle stamped "18:00" covers 18:00–18:59, "23:00" covers 23:00–23:59.
// Asian range = highest high & lowest low of candles with hour 18..23 on the
// same calendar date (they all fall on one date since midnight isn't crossed).
function detectAsianRange(candles1H) {
  if (!candles1H || candles1H.length < 5) {
    return { high: null, low: null, range: 0, highSwept: false, lowSwept: false, complete: false };
  }

  // Tag each candle with its date and hour from the datetime string.
  const tagged = candles1H.map((c, idx) => {
    const parts = c.datetime.split(' ');
    const datePart = parts[0]; // e.g. "2026-04-09"
    const timePart = parts[1] || '00:00:00';
    const hour = parseInt(timePart.split(':')[0], 10);
    return { ...c, datePart, hour, idx, isAsian: hour >= 18 && hour <= 23 };
  });

  // Group asian-hour candles by date so we don't mix different sessions.
  const asianByDate = {};
  for (const c of tagged) {
    if (!c.isAsian) continue;
    if (!asianByDate[c.datePart]) asianByDate[c.datePart] = [];
    asianByDate[c.datePart].push(c);
  }

  // Pick the most recent session date that has at least 3 candles (6h window
  // should produce 6, but weekend gaps or partial data may give fewer).
  const dates = Object.keys(asianByDate).sort();
  if (!dates.length) {
    return { high: null, low: null, range: 0, highSwept: false, lowSwept: false, complete: false };
  }

  let sessionDate = dates[dates.length - 1];
  let blockCandles = asianByDate[sessionDate];

  // If the most recent date has very few candles and there's a prior one with
  // more, it may mean the latest session is still forming — that's fine, use it.
  // But if it has only 1 candle we might be at the very start; still use it.

  const high = Math.max(...blockCandles.map(c => c.high));
  const low = Math.min(...blockCandles.map(c => c.low));

  // Session is complete when we have the 23:00 candle AND there exists at
  // least one candle after the block (i.e. post-midnight data has arrived).
  const has23 = blockCandles.some(c => c.hour === 23);
  const lastBlockIdx = Math.max(...blockCandles.map(c => c.idx));
  const hasPostCandle = lastBlockIdx < tagged.length - 1;
  const complete = has23 && hasPostCandle;

  // Check for sweeps: only look at candles AFTER the asian block.
  const postCandles = tagged.filter(c => c.idx > lastBlockIdx);
  let highSwept = false, lowSwept = false;
  for (const c of postCandles) {
    if (c.high > high) highSwept = true;
    if (c.low < low) lowSwept = true;
  }

  return {
    high, low,
    range: high - low,
    highSwept, lowSwept,
    complete,
    sessionDate,
    sessionStart: blockCandles[0].datetime,
    sessionEnd: blockCandles[blockCandles.length - 1].datetime,
    candleCount: blockCandles.length,
  };
}

// ---------- PREVIOUS DAY H/L ----------
function detectPreviousDayHL(candles1H) {
  const grouped = {};
  for (const c of candles1H) {
    const date = c.datetime.split(' ')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(c);
  }
  const dates = Object.keys(grouped).sort();
  if (dates.length < 2) return { high: null, low: null };

  const prevDate = dates[dates.length - 2];
  const prevCandles = grouped[prevDate];
  const high = Math.max(...prevCandles.map(c => c.high));
  const low = Math.min(...prevCandles.map(c => c.low));

  const todayDate = dates[dates.length - 1];
  const todayCandles = grouped[todayDate];
  const todayHigh = Math.max(...todayCandles.map(c => c.high));
  const todayLow = Math.min(...todayCandles.map(c => c.low));

  return { high, low, todayHigh, todayLow };
}

// ---------- AGGREGATE MTF SIGNAL ----------
function aggregateSignal(timeframes) {
  const bullCount = timeframes.filter(t => t.bias === 'BULLISH').length;
  const bearCount = timeframes.filter(t => t.bias === 'BEARISH').length;
  const total = timeframes.length;

  let bias = 'NEUTRAL';
  let strength = 'NO_SIGNAL';
  let strengthLabel = 'No Clear Signal';
  let confidence = 30;

  if (bullCount === total) {
    bias = 'BULLISH';
    strength = 'STRONGEST';
    strengthLabel = `STRONGEST (${total}/${total} aligned)`;
    confidence = 95;
  } else if (bearCount === total) {
    bias = 'BEARISH';
    strength = 'STRONGEST';
    strengthLabel = `STRONGEST (${total}/${total} aligned)`;
    confidence = 95;
  } else if (bullCount === total - 1 && bearCount === 0) {
    bias = 'BULLISH';
    strength = 'STRONG';
    strengthLabel = `STRONG (${bullCount}/${total} aligned)`;
    confidence = 80;
  } else if (bearCount === total - 1 && bullCount === 0) {
    bias = 'BEARISH';
    strength = 'STRONG';
    strengthLabel = `STRONG (${bearCount}/${total} aligned)`;
    confidence = 80;
  } else if (bullCount >= total - 1) {
    bias = 'BULLISH';
    strength = 'MODERATE';
    strengthLabel = `MODERATE (${bullCount}/${total} bullish)`;
    confidence = 65;
  } else if (bearCount >= total - 1) {
    bias = 'BEARISH';
    strength = 'MODERATE';
    strengthLabel = `MODERATE (${bearCount}/${total} bearish)`;
    confidence = 65;
  } else if (bullCount > bearCount) {
    bias = 'BULLISH';
    strength = 'WEAK';
    strengthLabel = `WEAK (${bullCount}/${total} bullish, ${bearCount} bearish)`;
    confidence = 45;
  } else if (bearCount > bullCount) {
    bias = 'BEARISH';
    strength = 'WEAK';
    strengthLabel = `WEAK (${bearCount}/${total} bearish, ${bullCount} bullish)`;
    confidence = 45;
  } else {
    bias = 'NEUTRAL';
    strength = 'NO_SIGNAL';
    strengthLabel = `Mixed (${bullCount} bull / ${bearCount} bear)`;
    confidence = 30;
  }

  return { bias, strength, strengthLabel, confidence, bullCount, bearCount, total };
}

// ---------- ENTRY PLAN ----------
function generateEntryPlan(pair, signal, asian, pdhl) {
  const sections = [];

  // SIGNAL
  sections.push(`SIGNAL: ${signal.bias} - ${signal.strengthLabel}`);

  // ENTRY based on Asia sweep
  if (signal.bias === 'BEARISH') {
    const steps = [];
    if (asian.high) {
      if (!asian.complete) {
        steps.push(`1) Asian session still forming. Provisional high: ${formatPrice(asian.high, pair)}. Wait for session close (midnight EST) before looking for entries.`);
      } else if (asian.highSwept) {
        steps.push(`1) Asia high (${formatPrice(asian.high, pair)}) has been SWEPT — liquidity grabbed above. Setup is LIVE.`);
      } else {
        steps.push(`1) WAIT for Asia high (${formatPrice(asian.high, pair)}) to get swept before looking for shorts.`);
      }
    }
    steps.push('2) After the sweep, drop to 5min and watch for bearish CHoCH / displacement.');
    steps.push('3) Enter short on the close back below the swept high or on a 5min FVG mitigation.');
    if (asian.high) steps.push(`4) SL above the sweep wick (above ${formatPrice(asian.high, pair)} + a few pips).`);
    sections.push('ENTRY PLAN:\n' + steps.join('\n'));
  } else if (signal.bias === 'BULLISH') {
    const steps = [];
    if (asian.low) {
      if (!asian.complete) {
        steps.push(`1) Asian session still forming. Provisional low: ${formatPrice(asian.low, pair)}. Wait for session close (midnight EST) before looking for entries.`);
      } else if (asian.lowSwept) {
        steps.push(`1) Asia low (${formatPrice(asian.low, pair)}) has been SWEPT — liquidity grabbed below. Setup is LIVE.`);
      } else {
        steps.push(`1) WAIT for Asia low (${formatPrice(asian.low, pair)}) to get swept before looking for longs.`);
      }
    }
    steps.push('2) After the sweep, drop to 5min and watch for bullish CHoCH / displacement.');
    steps.push('3) Enter long on the close back above the swept low or on a 5min FVG mitigation.');
    if (asian.low) steps.push(`4) SL below the sweep wick (below ${formatPrice(asian.low, pair)} - a few pips).`);
    sections.push('ENTRY PLAN:\n' + steps.join('\n'));
  } else {
    sections.push('ENTRY PLAN: No trade — timeframes are mixed. Wait for alignment before looking for setups.');
  }

  // TARGETS
  if (signal.bias === 'BULLISH') {
    const t = [];
    if (pdhl.todayHigh) t.push(`Today High ${formatPrice(pdhl.todayHigh, pair)}`);
    if (pdhl.high) t.push(`PDH ${formatPrice(pdhl.high, pair)}`);
    if (t.length) sections.push(`TARGETS: ${t.join(' → ')}.`);
  } else if (signal.bias === 'BEARISH') {
    const t = [];
    if (pdhl.todayLow) t.push(`Today Low ${formatPrice(pdhl.todayLow, pair)}`);
    if (pdhl.low) t.push(`PDL ${formatPrice(pdhl.low, pair)}`);
    if (t.length) sections.push(`TARGETS: ${t.join(' → ')}.`);
  }

  return sections.join('\n\n');
}

// ---------- MAIN ----------
function runAnalysis(pair, candles4H, candles1H, candles30m, candles15m, currentPrice, quoteHL = {}, candles5m = null) {
  // Per-timeframe bias
  const tf4H = analyzeTimeframe(candles4H, '4H');
  const tf1H = analyzeTimeframe(candles1H, '1H');
  const tf30m = analyzeTimeframe(candles30m, '30m');
  const tf15m = analyzeTimeframe(candles15m, '15m');
  const timeframes = [tf4H, tf1H, tf30m, tf15m];
  if (candles5m && candles5m.length >= 60) {
    const tf5m = analyzeTimeframe(candles5m, '5m');
    timeframes.push(tf5m);
  }

  // Aggregate
  const signal = aggregateSignal(timeframes);

  // Asian range, PDH/PDL
  const asian = detectAsianRange(candles1H);
  const pdhl = detectPreviousDayHL(candles1H);
  if (quoteHL.todayHigh != null) pdhl.todayHigh = quoteHL.todayHigh;
  if (quoteHL.todayLow != null) pdhl.todayLow = quoteHL.todayLow;

  // Killzone
  const insideKZ = isInsideKillzone();

  // Entry plan
  const analysis = generateEntryPlan(pair, signal, asian, pdhl);

  // Levels
  const levels = [];
  if (pdhl.todayHigh) levels.push({ label: 'Today High', value: pdhl.todayHigh, type: 'resistance' });
  if (pdhl.todayLow) levels.push({ label: 'Today Low', value: pdhl.todayLow, type: 'support' });
  if (pdhl.high) levels.push({ label: 'Prev Day High', value: pdhl.high, type: 'resistance' });
  if (pdhl.low) levels.push({ label: 'Prev Day Low', value: pdhl.low, type: 'support' });
  if (asian.high) levels.push({
    label: `Asian High${!asian.complete ? ' (forming)' : asian.highSwept ? ' (swept)' : ''}`,
    value: asian.high,
    type: 'resistance',
  });
  if (asian.low) levels.push({
    label: `Asian Low${!asian.complete ? ' (forming)' : asian.lowSwept ? ' (swept)' : ''}`,
    value: asian.low,
    type: 'support',
  });

  // Checklist - now MTF based
  const checklist = timeframes.map(tf => ({
    text: `${tf.label}: ${tf.bias} (${tf.bullCount} bull / ${tf.bearCount} bear)`,
    passed: tf.bias === signal.bias && signal.bias !== 'NEUTRAL',
  }));

  // Asian sweep entry trigger
  checklist.push({
    text: !asian.complete
      ? 'Asian session still forming — wait for midnight EST close'
      : signal.bias === 'BEARISH'
        ? (asian.highSwept ? 'Asia high SWEPT — entry trigger active' : `Asia high (${formatPrice(asian.high, pair)}) NOT swept — wait`)
        : signal.bias === 'BULLISH'
          ? (asian.lowSwept ? 'Asia low SWEPT — entry trigger active' : `Asia low (${formatPrice(asian.low, pair)}) NOT swept — wait`)
          : 'Asian sweep N/A (no clear signal)',
    passed: !asian.complete ? null
      : signal.bias === 'BEARISH' ? (asian.highSwept === true)
      : signal.bias === 'BULLISH' ? (asian.lowSwept === true)
      : null,
  });

  checklist.push({
    text: insideKZ ? 'Inside active Killzone' : 'Outside Killzone — lower probability',
    passed: insideKZ,
  });

  checklist.push({
    text: 'No high-impact news in next 2 hours',
    passed: null,
  });

  return {
    pair,
    currentPrice,
    bias: signal.bias,
    confidence: signal.confidence,
    strength: signal.strength,
    strengthLabel: signal.strengthLabel,
    timestamp: new Date().toISOString(),
    levels,
    checklist,
    analysis,
    candles4H,
    candles1H,
    candles30m,
    candles15m,
    candles5m,
    timeframes,
    asian,
    pdhl,
  };
}

module.exports = { runAnalysis };
