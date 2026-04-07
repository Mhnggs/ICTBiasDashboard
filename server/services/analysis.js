const { getPipValue, priceToPips, formatPrice, percentDiff } = require('../utils/helpers');
const { isInsideKillzone } = require('./session');

// 1. HTF Trend Detection
function detectTrend(candles) {
  if (candles.length < 10) return { trend: 'neutral', strength: 50 };

  const mid = Math.floor(candles.length / 2);
  const firstHalf = candles.slice(0, mid);
  const secondHalf = candles.slice(mid);

  const avgFirst = firstHalf.reduce((s, c) => s + c.close, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, c) => s + c.close, 0) / secondHalf.length;

  const swings = detectSwingPoints(candles, 3);
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  let higherHighs = false, higherLows = false, lowerHighs = false, lowerLows = false;

  if (highs.length >= 2) {
    const recentH = highs.slice(-2);
    higherHighs = recentH[1].price > recentH[0].price;
    lowerHighs = recentH[1].price < recentH[0].price;
  }
  if (lows.length >= 2) {
    const recentL = lows.slice(-2);
    higherLows = recentL[1].price > recentL[0].price;
    lowerLows = recentL[1].price < recentL[0].price;
  }

  let trend = 'neutral';
  let strength = 50;

  if (avgSecond > avgFirst && higherHighs && higherLows) { trend = 'bullish'; strength = 80; }
  else if (avgSecond > avgFirst && (higherHighs || higherLows)) { trend = 'bullish'; strength = 65; }
  else if (avgSecond < avgFirst && lowerHighs && lowerLows) { trend = 'bearish'; strength = 80; }
  else if (avgSecond < avgFirst && (lowerHighs || lowerLows)) { trend = 'bearish'; strength = 65; }
  else if (avgSecond > avgFirst) { trend = 'bullish'; strength = 55; }
  else if (avgSecond < avgFirst) { trend = 'bearish'; strength = 55; }

  return { trend, strength, higherHighs, higherLows, lowerHighs, lowerLows };
}

// 1b. 1H Trend for MTF confirmation
function detect1HTrend(candles1H) {
  if (!candles1H || candles1H.length < 10) return { trend: 'neutral' };
  const recent = candles1H.slice(-20);
  const mid = Math.floor(recent.length / 2);
  const avgFirst = recent.slice(0, mid).reduce((s, c) => s + c.close, 0) / mid;
  const avgSecond = recent.slice(mid).reduce((s, c) => s + c.close, 0) / (recent.length - mid);
  if (avgSecond > avgFirst) return { trend: 'bullish' };
  if (avgSecond < avgFirst) return { trend: 'bearish' };
  return { trend: 'neutral' };
}

// 2. Swing Point Detection
function detectSwingPoints(candles, lookback = 1) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
    }
    if (isHigh) swings.push({ type: 'high', price: candles[i].high, index: i, datetime: candles[i].datetime });
    if (isLow) swings.push({ type: 'low', price: candles[i].low, index: i, datetime: candles[i].datetime });
  }
  return swings;
}

// 3. Break of Structure
function detectBOS(swings, currentPrice) {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  if (highs.length === 0 || lows.length === 0) return { detected: false, direction: null, level: null };

  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];

  if (currentPrice > lastHigh.price) return { detected: true, direction: 'bullish', level: lastHigh.price, datetime: lastHigh.datetime };
  if (currentPrice < lastLow.price) return { detected: true, direction: 'bearish', level: lastLow.price, datetime: lastLow.datetime };
  return { detected: false, direction: null, level: null };
}

// 4. Order Block Detection with displacement validation
function detectOrderBlocks(candles, trendDirection) {
  const orderBlocks = [];
  const bodies = candles.map(c => Math.abs(c.close - c.open));
  const avgBody = bodies.reduce((s, b) => s + b, 0) / bodies.length;
  const displacementThreshold = avgBody * 1.5;

  for (let i = candles.length - 2; i >= 1; i--) {
    const curr = candles[i];
    const next = candles[i + 1];
    const nextBody = Math.abs(next.close - next.open);

    if (curr.close < curr.open && next.close > curr.high && nextBody >= displacementThreshold) {
      const zone = [curr.low, curr.high];
      let mitigated = false;
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].low <= curr.high && candles[j].low >= curr.low) { mitigated = true; break; }
      }
      orderBlocks.push({ type: 'demand', zone, datetime: curr.datetime, index: i, mitigated });
    }

    if (curr.close > curr.open && next.close < curr.low && nextBody >= displacementThreshold) {
      const zone = [curr.low, curr.high];
      let mitigated = false;
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].high >= curr.low && candles[j].high <= curr.high) { mitigated = true; break; }
      }
      orderBlocks.push({ type: 'supply', zone, datetime: curr.datetime, index: i, mitigated });
    }
  }

  const unmitigated = orderBlocks.filter(ob => !ob.mitigated);
  const matching = unmitigated.filter(ob =>
    (trendDirection === 'bullish' && ob.type === 'demand') ||
    (trendDirection === 'bearish' && ob.type === 'supply')
  );

  return { primary: matching[0] || unmitigated[0] || null, all: unmitigated.slice(0, 5) };
}

// 5. Fair Value Gap Detection
function detectFVGs(candles) {
  const fvgs = [];
  const scanLength = Math.min(20, candles.length - 2);
  const startIdx = candles.length - scanLength;

  for (let i = startIdx + 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c2 = candles[i];

    if (c2.low > c0.high) {
      const zone = [c0.high, c2.low];
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= c0.high) { filled = true; break; }
      }
      if (!filled) fvgs.push({ type: 'bullish', zone, datetime: candles[i - 1].datetime, index: i - 1 });
    }

    if (c2.high < c0.low) {
      const zone = [c2.high, c0.low];
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= c0.low) { filled = true; break; }
      }
      if (!filled) fvgs.push({ type: 'bearish', zone, datetime: candles[i - 1].datetime, index: i - 1 });
    }
  }
  return fvgs;
}

// 6. ICT Asian Range: 19:00 - 24:00 EST (7 PM - midnight NY time)
// The session belongs to the date it STARTED on (since it's all on the same calendar day).
// Sweep detection only runs AFTER midnight (00:00 onwards on the next calendar day).
function detectAsianRange(candles1H) {
  if (!candles1H || candles1H.length < 5) {
    return { high: null, low: null, range: 0, highSwept: false, lowSwept: false, complete: false };
  }

  const tagged = candles1H.map((c, idx) => {
    const timePart = c.datetime.split(' ')[1] || '00:00:00';
    const hour = parseInt(timePart.split(':')[0], 10);
    return { ...c, hour, idx, isAsian: hour >= 19 && hour <= 23 };
  });

  // Walk backwards from the most recent candle to find the latest asian-hour candle.
  let lastAsianIdx = -1;
  for (let i = tagged.length - 1; i >= 0; i--) {
    if (tagged[i].isAsian) { lastAsianIdx = i; break; }
  }

  if (lastAsianIdx === -1) {
    return { high: null, low: null, range: 0, highSwept: false, lowSwept: false, complete: false };
  }

  // Walk further back to gather the contiguous asian block
  const blockCandles = [];
  for (let i = lastAsianIdx; i >= 0; i--) {
    if (tagged[i].isAsian) blockCandles.unshift(tagged[i]);
    else break;
  }

  const high = Math.max(...blockCandles.map(c => c.high));
  const low = Math.min(...blockCandles.map(c => c.low));

  // Session is complete only if hour 23 is in the block AND we have at least
  // one candle AFTER the block (i.e. the session has actually ended).
  const hasClose = blockCandles.some(c => c.hour === 23);
  const hasPostCandle = lastAsianIdx < tagged.length - 1;
  const complete = hasClose && hasPostCandle;

  // Sweeps are checked ONLY on candles strictly after the asian block.
  const postCandles = tagged.slice(lastAsianIdx + 1);

  let highSwept = false, lowSwept = false;
  for (const c of postCandles) {
    if (c.high > high) highSwept = true;
    if (c.low < low) lowSwept = true;
  }

  return {
    high,
    low,
    range: high - low,
    highSwept,
    lowSwept,
    complete,
    sessionStart: blockCandles[0].datetime,
    sessionEnd: blockCandles[blockCandles.length - 1].datetime,
  };
}

// 7. Previous Day H/L
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

// 8. Liquidity Pools
function detectLiquidityPools(swings, pdh, pdl, currentPrice) {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  const pools = [];

  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (percentDiff(highs[i].price, highs[j].price) < 0.03) {
        pools.push({ price: (highs[i].price + highs[j].price) / 2, type: 'above', label: 'Equal Highs' });
      }
    }
  }
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (percentDiff(lows[i].price, lows[j].price) < 0.03) {
        pools.push({ price: (lows[i].price + lows[j].price) / 2, type: 'below', label: 'Equal Lows' });
      }
    }
  }

  const above = (pdh && currentPrice < pdh) || pools.some(p => p.type === 'above' && p.price > currentPrice);
  const below = (pdl && currentPrice > pdl) || pools.some(p => p.type === 'below' && p.price < currentPrice);

  if (pdh && currentPrice < pdh) pools.push({ price: pdh, type: 'above', label: 'PDH Liquidity' });
  if (pdl && currentPrice > pdl) pools.push({ price: pdl, type: 'below', label: 'PDL Liquidity' });

  return { above, below, pools };
}

// 8b. Premium/Discount Zone
function detectPremiumDiscount(currentPrice, recentHigh, recentLow) {
  if (!recentHigh || !recentLow || recentHigh === recentLow) return { zone: 'equilibrium', level: 50 };
  const range = recentHigh - recentLow;
  const pct = ((currentPrice - recentLow) / range) * 100;
  if (pct > 70) return { zone: 'premium', level: pct };
  if (pct < 30) return { zone: 'discount', level: pct };
  return { zone: 'equilibrium', level: pct };
}

// 9. Confluence Scoring (stricter)
function calculateConfluence(factors) {
  let score = 25;

  if (factors.trendAligns) score += 12;
  if (factors.bosDetected) score += 18;
  if (factors.obPresent) score += 12;
  if (factors.fvgPresent) score += 8;
  if (factors.liquidityTarget) score += 8;
  if (factors.insideKillzone) score += 10;
  if (factors.asianSweepReady) score += 8;
  if (factors.nearKeyLevel) score += 8;
  if (factors.mtfAligned) score += 10;
  if (factors.priceInCorrectZone) score += 6;
  if (factors.conflicting) score -= 15;

  // Hard caps
  if (!factors.bosDetected) score = Math.min(score, 65);
  if (!factors.mtfAligned) score = Math.min(score, 75);

  return Math.min(95, Math.max(20, score));
}

// 10. Bias Determination
function determineBias(trend, bos, orderBlock, fvgs) {
  let bull = 0, bear = 0;

  if (trend.trend === 'bullish') bull += 2;
  if (trend.trend === 'bearish') bear += 2;
  if (bos.direction === 'bullish') bull += 2;
  if (bos.direction === 'bearish') bear += 2;
  if (orderBlock && orderBlock.type === 'demand') bull += 1;
  if (orderBlock && orderBlock.type === 'supply') bear += 1;

  const bullFvgs = fvgs.filter(f => f.type === 'bullish').length;
  const bearFvgs = fvgs.filter(f => f.type === 'bearish').length;
  if (bullFvgs > bearFvgs) bull += 1;
  if (bearFvgs > bullFvgs) bear += 1;

  if (bull > bear + 1) return 'BULLISH';
  if (bear > bull + 1) return 'BEARISH';
  return 'NEUTRAL';
}

// 11. Analysis & Entry Plan Text
function generateAnalysis(pair, bias, trend, bos, ob, fvgs, asian, pdhl, liquidity, premDisc, insideKZ, mtfAligned) {
  const sections = [];

  // BIAS
  if (bias === 'BULLISH') {
    let s = `BIAS: Bullish on ${pair}.`;
    if (trend.higherHighs && trend.higherLows) s += ' 4H is printing higher highs and higher lows.';
    else s += ' 4H structure leans bullish.';
    if (bos.detected && bos.direction === 'bullish') s += ` BOS confirmed above ${formatPrice(bos.level, pair)}.`;
    else s += ' Waiting for BOS confirmation to the upside.';
    sections.push(s);
  } else if (bias === 'BEARISH') {
    let s = `BIAS: Bearish on ${pair}.`;
    if (trend.lowerHighs && trend.lowerLows) s += ' 4H is printing lower highs and lower lows.';
    else s += ' 4H structure leans bearish.';
    if (bos.detected && bos.direction === 'bearish') s += ` BOS confirmed below ${formatPrice(bos.level, pair)}.`;
    else s += ' Waiting for BOS confirmation to the downside.';
    sections.push(s);
  } else {
    sections.push(`BIAS: Neutral on ${pair}. No clear directional bias — stay flat or wait for structure to develop.`);
  }

  // ENTRY PLAN
  if (bias === 'BEARISH') {
    const steps = [];
    if (asian.high) {
      if (!asian.complete) {
        steps.push(`1) Asian session still forming. Provisional high: ${formatPrice(asian.high, pair)}. Wait for session close (midnight EST), then for the high to get swept.`);
      } else if (asian.highSwept) {
        steps.push(`1) Asia high (${formatPrice(asian.high, pair)}) has been SWEPT — liquidity grabbed above. Setup is live.`);
      } else {
        steps.push(`1) WAIT for Asia high (${formatPrice(asian.high, pair)}) to get swept before looking for shorts.`);
      }
    }
    if (ob && ob.type === 'supply') {
      steps.push(`2) Look for price to tap into the supply OB at ${formatPrice(ob.zone[0], pair)}-${formatPrice(ob.zone[1], pair)}.`);
    } else {
      const f = fvgs.find(x => x.type === 'bearish');
      if (f) steps.push(`2) Look for rejection at the bearish FVG (${formatPrice(f.zone[0], pair)}-${formatPrice(f.zone[1], pair)}).`);
      else steps.push('2) Look for rejection at premium 4H levels.');
    }
    steps.push('3) Confirm with bearish displacement on 15min/1H (strong close below the entry zone).');
    if (ob && ob.type === 'supply') steps.push(`4) SL above the supply OB high at ${formatPrice(ob.zone[1], pair)}.`);
    else if (asian.high) steps.push(`4) SL above the Asia high sweep at ${formatPrice(asian.high, pair)}.`);
    sections.push('ENTRY PLAN:\n' + steps.join('\n'));
  } else if (bias === 'BULLISH') {
    const steps = [];
    if (asian.low) {
      if (!asian.complete) {
        steps.push(`1) Asian session still forming. Provisional low: ${formatPrice(asian.low, pair)}. Wait for session close (midnight EST), then for the low to get swept.`);
      } else if (asian.lowSwept) {
        steps.push(`1) Asia low (${formatPrice(asian.low, pair)}) has been SWEPT — liquidity grabbed below. Setup is live.`);
      } else {
        steps.push(`1) WAIT for Asia low (${formatPrice(asian.low, pair)}) to get swept before looking for longs.`);
      }
    }
    if (ob && ob.type === 'demand') {
      steps.push(`2) Look for price to tap into the demand OB at ${formatPrice(ob.zone[0], pair)}-${formatPrice(ob.zone[1], pair)}.`);
    } else {
      const f = fvgs.find(x => x.type === 'bullish');
      if (f) steps.push(`2) Look for bounce at the bullish FVG (${formatPrice(f.zone[0], pair)}-${formatPrice(f.zone[1], pair)}).`);
      else steps.push('2) Look for bounce at discount 4H levels.');
    }
    steps.push('3) Confirm with bullish displacement on 15min/1H (strong close above the entry zone).');
    if (ob && ob.type === 'demand') steps.push(`4) SL below the demand OB low at ${formatPrice(ob.zone[0], pair)}.`);
    else if (asian.low) steps.push(`4) SL below the Asia low sweep at ${formatPrice(asian.low, pair)}.`);
    sections.push('ENTRY PLAN:\n' + steps.join('\n'));
  }

  // TARGETS
  if (bias === 'BULLISH') {
    const t = [];
    if (pdhl.todayHigh) t.push(`Today High ${formatPrice(pdhl.todayHigh, pair)}`);
    if (pdhl.high) t.push(`PDH ${formatPrice(pdhl.high, pair)}`);
    if (t.length) sections.push(`TARGETS: ${t.join(' → ')}.`);
  } else if (bias === 'BEARISH') {
    const t = [];
    if (pdhl.todayLow) t.push(`Today Low ${formatPrice(pdhl.todayLow, pair)}`);
    if (pdhl.low) t.push(`PDL ${formatPrice(pdhl.low, pair)}`);
    if (t.length) sections.push(`TARGETS: ${t.join(' → ')}.`);
  }

  // CAUTIONS
  const cautions = [];
  if (!insideKZ) cautions.push('Outside killzone — wait for London or NY session for best entries.');
  if (!mtfAligned && bias !== 'NEUTRAL') cautions.push('1H trend does not confirm 4H — lower conviction.');
  if (premDisc.zone === 'premium' && bias === 'BULLISH') cautions.push('Price in premium zone — risky for longs, wait for pullback to discount.');
  if (premDisc.zone === 'discount' && bias === 'BEARISH') cautions.push('Price in discount zone — risky for shorts, wait for push into premium.');
  if (!bos.detected && bias !== 'NEUTRAL') cautions.push('No BOS yet — structure not fully confirmed. Lower position size or wait.');
  if (cautions.length) sections.push('CAUTION: ' + cautions.join(' '));

  return sections.join('\n\n');
}

// Main analysis function
function runAnalysis(pair, candles4H, candles1H, currentPrice) {
  const pipValue = getPipValue(pair);

  const trend = detectTrend(candles4H);
  const trend1H = detect1HTrend(candles1H);
  const mtfAligned = trend.trend === trend1H.trend && trend.trend !== 'neutral';

  const swings4H = detectSwingPoints(candles4H, 3);
  const bos = detectBOS(swings4H, currentPrice);

  const orderBlocks = detectOrderBlocks(candles4H, trend.trend);
  const primaryOB = orderBlocks.primary;

  const fvgs = detectFVGs(candles4H);
  const asian = detectAsianRange(candles1H);
  const pdhl = detectPreviousDayHL(candles1H);
  const liquidity = detectLiquidityPools(swings4H, pdhl.high, pdhl.low, currentPrice);

  const recentHigh = pdhl.todayHigh || pdhl.high;
  const recentLow = pdhl.todayLow || pdhl.low;
  const premDisc = detectPremiumDiscount(currentPrice, recentHigh, recentLow);

  const bias = determineBias(trend, bos, primaryOB, fvgs);

  const insideKZ = isInsideKillzone();

  const asianSweepReady = asian.complete && (
    (bias === 'BEARISH' && asian.high && !asian.highSwept) ||
    (bias === 'BULLISH' && asian.low && !asian.lowSwept)
  );

  let nearKeyLevel = false;
  if (primaryOB) {
    const distToOB = Math.min(
      Math.abs(currentPrice - primaryOB.zone[0]),
      Math.abs(currentPrice - primaryOB.zone[1])
    );
    nearKeyLevel = priceToPips(distToOB, pair) <= 20;
  }

  const priceInCorrectZone =
    (bias === 'BULLISH' && premDisc.zone === 'discount') ||
    (bias === 'BEARISH' && premDisc.zone === 'premium');

  const confidence = calculateConfluence({
    trendAligns: (bias === 'BULLISH' && trend.trend === 'bullish') ||
                 (bias === 'BEARISH' && trend.trend === 'bearish'),
    bosDetected: bos.detected && (
      (bias === 'BULLISH' && bos.direction === 'bullish') ||
      (bias === 'BEARISH' && bos.direction === 'bearish')
    ),
    obPresent: !!primaryOB,
    fvgPresent: fvgs.length > 0,
    liquidityTarget: (bias === 'BULLISH' && liquidity.above) ||
                     (bias === 'BEARISH' && liquidity.below),
    insideKillzone: insideKZ,
    asianSweepReady,
    nearKeyLevel,
    mtfAligned,
    priceInCorrectZone,
    conflicting: bias === 'NEUTRAL',
  });

  const analysis = generateAnalysis(
    pair, bias, trend, bos, primaryOB, fvgs, asian, pdhl, liquidity, premDisc, insideKZ, mtfAligned
  );

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
  if (primaryOB) {
    levels.push({
      label: `4H ${primaryOB.type === 'demand' ? 'Demand' : 'Supply'} OB`,
      value: primaryOB.zone,
      type: primaryOB.type,
    });
  }
  for (const fvg of fvgs.slice(0, 2)) {
    levels.push({ label: `4H ${fvg.type} FVG`, value: fvg.zone, type: 'fvg' });
  }

  // Checklist
  const checklist = [
    {
      text: `4H trend: ${trend.trend} (${trend.higherHighs ? 'HH' : trend.lowerHighs ? 'LH' : '~H'}, ${trend.higherLows ? 'HL' : trend.lowerLows ? 'LL' : '~L'})`,
      passed: (bias === 'BULLISH' && trend.trend === 'bullish') || (bias === 'BEARISH' && trend.trend === 'bearish'),
    },
    {
      text: bos.detected
        ? `BOS confirmed ${bos.direction === 'bullish' ? 'above' : 'below'} ${formatPrice(bos.level, pair)}`
        : 'BOS not yet confirmed',
      passed: bos.detected && (
        (bias === 'BULLISH' && bos.direction === 'bullish') ||
        (bias === 'BEARISH' && bos.direction === 'bearish')
      ),
    },
    {
      text: `1H ${mtfAligned ? 'confirms' : 'does NOT confirm'} 4H bias`,
      passed: mtfAligned,
    },
    {
      text: primaryOB
        ? `${primaryOB.type === 'demand' ? 'Demand' : 'Supply'} OB at ${formatPrice(primaryOB.zone[0], pair)}-${formatPrice(primaryOB.zone[1], pair)}`
        : 'No valid OB (weak displacement)',
      passed: !!primaryOB,
    },
    {
      text: !asian.complete
        ? `Asian session still forming — wait for midnight EST close`
        : bias === 'BEARISH'
          ? (asian.high
              ? (asian.highSwept ? 'Asia high already swept' : `Asia high (${formatPrice(asian.high, pair)}) NOT swept — wait for sweep`)
              : 'No Asian range data')
          : bias === 'BULLISH'
            ? (asian.low
                ? (asian.lowSwept ? 'Asia low already swept' : `Asia low (${formatPrice(asian.low, pair)}) NOT swept — wait for sweep`)
                : 'No Asian range data')
            : 'Asian sweep N/A (neutral bias)',
      passed: !asian.complete ? null
        : bias === 'BEARISH' ? (asian.highSwept === true)
        : bias === 'BULLISH' ? (asian.lowSwept === true)
        : null,
    },
    {
      text: `Price in ${premDisc.zone} zone (${premDisc.level.toFixed(0)}%)`,
      passed: priceInCorrectZone,
    },
    {
      text: insideKZ ? 'Inside active Killzone' : 'Outside Killzone — lower probability',
      passed: insideKZ,
    },
    {
      text: 'No high-impact news in next 2 hours',
      passed: null,
    },
  ];

  return {
    pair,
    currentPrice,
    bias,
    confidence,
    timestamp: new Date().toISOString(),
    levels,
    checklist,
    analysis,
    candles4H,
    candles1H,
    trend,
    trend1H,
    bos,
    orderBlocks: orderBlocks.all,
    fvgs,
    asian,
    pdhl,
    liquidity,
    premiumDiscount: premDisc,
    mtfAligned,
  };
}

module.exports = { runAnalysis };
