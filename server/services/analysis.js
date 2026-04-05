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

  const swings = detectSwingPoints(candles);
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  let higherHighs = false;
  let higherLows = false;
  let lowerHighs = false;
  let lowerLows = false;

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

  if (avgSecond > avgFirst && higherHighs && higherLows) {
    trend = 'bullish';
    strength = 80;
  } else if (avgSecond > avgFirst && (higherHighs || higherLows)) {
    trend = 'bullish';
    strength = 65;
  } else if (avgSecond < avgFirst && lowerHighs && lowerLows) {
    trend = 'bearish';
    strength = 80;
  } else if (avgSecond < avgFirst && (lowerHighs || lowerLows)) {
    trend = 'bearish';
    strength = 65;
  } else if (avgSecond > avgFirst) {
    trend = 'bullish';
    strength = 55;
  } else if (avgSecond < avgFirst) {
    trend = 'bearish';
    strength = 55;
  }

  return { trend, strength, higherHighs, higherLows, lowerHighs, lowerLows };
}

// 2. Swing Point Detection
function detectSwingPoints(candles, lookback = 1) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isLow = false;
      }
    }
    if (isHigh) {
      swings.push({ type: 'high', price: candles[i].high, index: i, datetime: candles[i].datetime });
    }
    if (isLow) {
      swings.push({ type: 'low', price: candles[i].low, index: i, datetime: candles[i].datetime });
    }
  }
  return swings;
}

// 3. Break of Structure Detection
function detectBOS(swings, currentPrice) {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  if (highs.length === 0 || lows.length === 0) {
    return { detected: false, direction: null, level: null };
  }

  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];

  if (currentPrice > lastHigh.price) {
    return { detected: true, direction: 'bullish', level: lastHigh.price, datetime: lastHigh.datetime };
  }
  if (currentPrice < lastLow.price) {
    return { detected: true, direction: 'bearish', level: lastLow.price, datetime: lastLow.datetime };
  }

  return { detected: false, direction: null, level: null };
}

// 4. Order Block Detection
function detectOrderBlocks(candles, trendDirection) {
  const orderBlocks = [];

  for (let i = candles.length - 2; i >= 1; i--) {
    const curr = candles[i];
    const next = candles[i + 1];

    // Bullish OB (demand): bearish candle before bullish displacement
    if (curr.close < curr.open && next.close > curr.high) {
      const zone = [curr.low, curr.high];
      // Check if mitigated (price returned to zone after creation)
      let mitigated = false;
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].low <= curr.high && candles[j].low >= curr.low) {
          mitigated = true;
          break;
        }
      }
      orderBlocks.push({
        type: 'demand',
        zone,
        datetime: curr.datetime,
        index: i,
        mitigated,
      });
    }

    // Bearish OB (supply): bullish candle before bearish displacement
    if (curr.close > curr.open && next.close < curr.low) {
      const zone = [curr.low, curr.high];
      let mitigated = false;
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].high >= curr.low && candles[j].high <= curr.high) {
          mitigated = true;
          break;
        }
      }
      orderBlocks.push({
        type: 'supply',
        zone,
        datetime: curr.datetime,
        index: i,
        mitigated,
      });
    }
  }

  // Return unmitigated OBs, prioritize matching trend direction
  const unmitigated = orderBlocks.filter(ob => !ob.mitigated);
  const matching = unmitigated.filter(ob =>
    (trendDirection === 'bullish' && ob.type === 'demand') ||
    (trendDirection === 'bearish' && ob.type === 'supply')
  );

  return {
    primary: matching[0] || unmitigated[0] || null,
    all: unmitigated.slice(0, 5),
  };
}

// 5. Fair Value Gap Detection
function detectFVGs(candles) {
  const fvgs = [];
  const scanLength = Math.min(20, candles.length - 2);
  const startIdx = candles.length - scanLength;

  for (let i = startIdx + 2; i < candles.length; i++) {
    const c0 = candles[i - 2]; // oldest
    const c2 = candles[i];     // newest

    // Bullish FVG: gap up
    if (c2.low > c0.high) {
      const zone = [c0.high, c2.low];
      // Check if filled
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= c0.high) {
          filled = true;
          break;
        }
      }
      if (!filled) {
        fvgs.push({ type: 'bullish', zone, datetime: candles[i - 1].datetime, index: i - 1 });
      }
    }

    // Bearish FVG: gap down
    if (c2.high < c0.low) {
      const zone = [c2.high, c0.low];
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= c0.low) {
          filled = true;
          break;
        }
      }
      if (!filled) {
        fvgs.push({ type: 'bearish', zone, datetime: candles[i - 1].datetime, index: i - 1 });
      }
    }
  }

  return fvgs;
}

// 6. Asian Range Detection
function detectAsianRange(candles1H) {
  const asianCandles = candles1H.filter(c => {
    const hour = parseInt(c.datetime.split(' ')[1].split(':')[0], 10);
    return hour >= 19 || hour < 2;
  });

  if (asianCandles.length === 0) {
    return { high: null, low: null, range: 0 };
  }

  const high = Math.max(...asianCandles.map(c => c.high));
  const low = Math.min(...asianCandles.map(c => c.low));

  return { high, low, range: high - low };
}

// 7. Previous Day High/Low
function detectPreviousDayHL(candles1H) {
  const grouped = {};
  for (const c of candles1H) {
    const date = c.datetime.split(' ')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(c);
  }

  const dates = Object.keys(grouped).sort();
  if (dates.length < 2) {
    return { high: null, low: null };
  }

  const prevDate = dates[dates.length - 2];
  const prevCandles = grouped[prevDate];

  const high = Math.max(...prevCandles.map(c => c.high));
  const low = Math.min(...prevCandles.map(c => c.low));

  // Also get today's H/L
  const todayDate = dates[dates.length - 1];
  const todayCandles = grouped[todayDate];
  const todayHigh = Math.max(...todayCandles.map(c => c.high));
  const todayLow = Math.min(...todayCandles.map(c => c.low));

  return {
    high,
    low,
    todayHigh,
    todayLow,
  };
}

// 8. Liquidity Pool Detection
function detectLiquidityPools(swings, pdh, pdl, currentPrice) {
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  const pools = [];

  // Equal highs
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (percentDiff(highs[i].price, highs[j].price) < 0.03) {
        pools.push({ price: (highs[i].price + highs[j].price) / 2, type: 'above', label: 'Equal Highs' });
      }
    }
  }

  // Equal lows
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (percentDiff(lows[i].price, lows[j].price) < 0.03) {
        pools.push({ price: (lows[i].price + lows[j].price) / 2, type: 'below', label: 'Equal Lows' });
      }
    }
  }

  const above = (pdh && currentPrice < pdh) || pools.some(p => p.type === 'above' && p.price > currentPrice);
  const below = (pdl && currentPrice > pdl) || pools.some(p => p.type === 'below' && p.price < currentPrice);

  if (pdh && currentPrice < pdh) {
    pools.push({ price: pdh, type: 'above', label: 'PDH Liquidity' });
  }
  if (pdl && currentPrice > pdl) {
    pools.push({ price: pdl, type: 'below', label: 'PDL Liquidity' });
  }

  return { above, below, pools };
}

// 9. Confluence Scoring
function calculateConfluence(factors) {
  let score = 30; // base

  if (factors.trendAligns) score += 15;
  if (factors.bosDetected) score += 20;
  if (factors.obPresent) score += 15;
  if (factors.fvgPresent) score += 10;
  if (factors.liquidityTarget) score += 10;
  if (factors.insideKillzone) score += 10;
  if (factors.asianNotSwept) score += 5;
  if (factors.nearKeyLevel) score += 10;
  if (!factors.conflicting) score += 5;

  return Math.min(95, Math.max(30, score));
}

// 10. Bias Determination
function determineBias(trend, bos, orderBlock, fvgs, liquidity) {
  let bullishSignals = 0;
  let bearishSignals = 0;

  if (trend.trend === 'bullish') bullishSignals += 2;
  if (trend.trend === 'bearish') bearishSignals += 2;

  if (bos.direction === 'bullish') bullishSignals += 2;
  if (bos.direction === 'bearish') bearishSignals += 2;

  if (orderBlock && orderBlock.type === 'demand') bullishSignals += 1;
  if (orderBlock && orderBlock.type === 'supply') bearishSignals += 1;

  const bullishFVGs = fvgs.filter(f => f.type === 'bullish').length;
  const bearishFVGs = fvgs.filter(f => f.type === 'bearish').length;
  if (bullishFVGs > bearishFVGs) bullishSignals += 1;
  if (bearishFVGs > bullishFVGs) bearishSignals += 1;

  if (bullishSignals > bearishSignals + 1) return 'BULLISH';
  if (bearishSignals > bullishSignals + 1) return 'BEARISH';
  return 'NEUTRAL';
}

// 11. Analysis Text Generation
function generateAnalysis(pair, bias, trend, bos, ob, fvgs, asian, pdhl, liquidity, currentPrice, pipValue) {
  const parts = [];

  // Bias statement
  if (bias === 'BULLISH') {
    parts.push(`${pair} shows bullish structure on the 4H`);
    if (trend.higherHighs && trend.higherLows) parts[0] += ' with price making higher highs and higher lows';
    else if (bos.detected && bos.direction === 'bullish') parts[0] += ` with a confirmed BOS above ${formatPrice(bos.level, pair)}`;
    parts[0] += '.';
  } else if (bias === 'BEARISH') {
    parts.push(`${pair} shows bearish structure on the 4H`);
    if (trend.lowerHighs && trend.lowerLows) parts[0] += ' with price making lower highs and lower lows';
    else if (bos.detected && bos.direction === 'bearish') parts[0] += ` with a confirmed BOS below ${formatPrice(bos.level, pair)}`;
    parts[0] += '.';
  } else {
    parts.push(`${pair} shows mixed signals on the 4H with no clear directional bias.`);
  }

  // Entry zone
  if (ob) {
    parts.push(`A ${ob.type} OB at ${formatPrice(ob.zone[0], pair)}-${formatPrice(ob.zone[1], pair)} provides a key zone.`);
  }
  if (fvgs.length > 0) {
    const matchingFvg = fvgs.find(f =>
      (bias === 'BULLISH' && f.type === 'bullish') || (bias === 'BEARISH' && f.type === 'bearish')
    );
    if (matchingFvg) {
      parts.push(`An unfilled FVG at ${formatPrice(matchingFvg.zone[0], pair)}-${formatPrice(matchingFvg.zone[1], pair)} aligns with the bias.`);
    }
  }

  // Targets and cautions
  if (bias === 'BULLISH' && pdhl.high) {
    if (asian.low) {
      parts.push(`Look for a sweep of the Asian low (${formatPrice(asian.low, pair)}) into demand, then displacement higher targeting PDH at ${formatPrice(pdhl.high, pair)}.`);
    } else {
      parts.push(`Upside target is the PDH at ${formatPrice(pdhl.high, pair)}.`);
    }
  } else if (bias === 'BEARISH' && pdhl.low) {
    if (asian.high) {
      parts.push(`Look for a sweep of the Asian high (${formatPrice(asian.high, pair)}) into supply, then displacement lower targeting PDL at ${formatPrice(pdhl.low, pair)}.`);
    } else {
      parts.push(`Downside target is the PDL at ${formatPrice(pdhl.low, pair)}.`);
    }
  }

  if (!isInsideKillzone()) {
    parts.push('Caution: currently outside of a killzone window.');
  }

  return parts.join(' ');
}

// Main analysis function
function runAnalysis(pair, candles4H, candles1H, currentPrice) {
  const pipValue = getPipValue(pair);

  // Step 1: HTF Trend
  const trend = detectTrend(candles4H);

  // Step 2: Swing Points
  const swings4H = detectSwingPoints(candles4H, 2);
  const swings1H = detectSwingPoints(candles1H, 1);

  // Step 3: Break of Structure
  const bos = detectBOS(swings4H, currentPrice);

  // Step 4: Order Blocks
  const orderBlocks = detectOrderBlocks(candles4H, trend.trend);
  const primaryOB = orderBlocks.primary;

  // Step 5: Fair Value Gaps
  const fvgs = detectFVGs(candles4H);

  // Step 6: Asian Range
  const asian = detectAsianRange(candles1H);

  // Step 7: Previous Day H/L
  const pdhl = detectPreviousDayHL(candles1H);

  // Step 8: Liquidity Pools
  const liquidity = detectLiquidityPools(swings4H, pdhl.high, pdhl.low, currentPrice);

  // Step 9: Determine Bias
  const bias = determineBias(trend, bos, primaryOB, fvgs, liquidity);

  // Step 10: Confluence Score
  const insideKZ = isInsideKillzone();
  const asianNotSwept = asian.low && asian.high &&
    currentPrice > asian.low && currentPrice < asian.high;

  let nearKeyLevel = false;
  if (primaryOB) {
    const distToOB = Math.min(
      Math.abs(currentPrice - primaryOB.zone[0]),
      Math.abs(currentPrice - primaryOB.zone[1])
    );
    nearKeyLevel = priceToPips(distToOB, pair) <= 20;
  }

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
    asianNotSwept,
    nearKeyLevel,
    conflicting: bias === 'NEUTRAL',
  });

  // Step 11: Generate Analysis Text
  const analysis = generateAnalysis(
    pair, bias, trend, bos, primaryOB, fvgs, asian, pdhl, liquidity, currentPrice, pipValue
  );

  // Build levels array
  const levels = [];
  if (pdhl.todayHigh) levels.push({ label: 'Today High', value: pdhl.todayHigh, type: 'resistance' });
  if (pdhl.todayLow) levels.push({ label: 'Today Low', value: pdhl.todayLow, type: 'support' });
  if (pdhl.high) levels.push({ label: 'Prev Day High', value: pdhl.high, type: 'resistance' });
  if (pdhl.low) levels.push({ label: 'Prev Day Low', value: pdhl.low, type: 'support' });
  if (asian.high) levels.push({ label: 'Asian High', value: asian.high, type: 'resistance' });
  if (asian.low) levels.push({ label: 'Asian Low', value: asian.low, type: 'support' });
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

  // Build checklist
  const checklist = [
    {
      text: `4H trend is ${trend.trend} (${trend.higherHighs ? 'higher highs' : trend.lowerHighs ? 'lower highs' : 'mixed highs'}, ${trend.higherLows ? 'higher lows' : trend.lowerLows ? 'lower lows' : 'mixed lows'})`,
      passed: (bias === 'BULLISH' && trend.trend === 'bullish') || (bias === 'BEARISH' && trend.trend === 'bearish'),
    },
    {
      text: bos.detected
        ? `4H Break of Structure confirmed to the ${bos.direction === 'bullish' ? 'upside' : 'downside'}`
        : '4H Break of Structure not detected',
      passed: bos.detected,
    },
    {
      text: primaryOB
        ? `${primaryOB.type === 'demand' ? 'Demand' : 'Supply'} Order Block at ${formatPrice(primaryOB.zone[0], pair)}-${formatPrice(primaryOB.zone[1], pair)}`
        : 'No unmitigated Order Block found',
      passed: !!primaryOB,
    },
    {
      text: liquidity.above
        ? 'Liquidity resting above (potential upside target)'
        : liquidity.below
          ? 'Liquidity resting below (potential downside target)'
          : 'No clear liquidity pools identified',
      passed: (bias === 'BULLISH' && liquidity.above) || (bias === 'BEARISH' && liquidity.below),
    },
    {
      text: insideKZ ? 'Inside active Killzone' : 'Outside Killzone window',
      passed: insideKZ,
    },
    {
      text: 'No high-impact news in next 2 hours',
      passed: null, // Cannot determine programmatically
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
    bos,
    orderBlocks: orderBlocks.all,
    fvgs,
    asian,
    pdhl,
    liquidity,
  };
}

module.exports = { runAnalysis };
