const express = require('express');
const router = express.Router();
const { fetchPairData, getCacheStatus, getATR, getRealTimePrice } = require('../services/twelveData');
const { runAnalysis } = require('../services/analysis');
const { getSessionInfo } = require('../services/session');
const { computeStrength } = require('../services/strength');
const { fetchCalendar } = require('../services/economicCalendar');
const { computeCorrelation } = require('../services/correlation');
const journal = require('../services/journal');
const liveTrades = require('../services/liveTrades');
const { runBacktest } = require('../services/backtest');
const { SUPPORTED_PAIRS, sleep } = require('../utils/helpers');

router.get('/analyze/:pair', async (req, res) => {
  try {
    const pair = req.params.pair.replace('-', '/').toUpperCase();
    if (!SUPPORTED_PAIRS.includes(pair)) {
      return res.status(400).json({ error: `Unsupported pair: ${pair}. Supported: ${SUPPORTED_PAIRS.join(', ')}` });
    }

    const data = await fetchPairData(pair);
    const result = runAnalysis(
      pair,
      data.candles4H,
      data.candles1H,
      data.candles30m,
      data.candles15m,
      data.currentPrice,
      { todayHigh: data.todayHigh, todayLow: data.todayLow, todayOpen: data.todayOpen },
      data.candles5m
    );
    res.json(result);
  } catch (err) {
    console.error(`Analysis error for ${req.params.pair}:`, err.message);
    if (err.code === 429 || (err.message && err.message.includes('rate limit'))) {
      return res.status(429).json({ error: 'Rate limit reached. Please wait before retrying.', retryAfter: 60 });
    }
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

router.get('/analyze-all', async (req, res) => {
  try {
    const results = [];
    for (let i = 0; i < SUPPORTED_PAIRS.length; i++) {
      const pair = SUPPORTED_PAIRS[i];
      try {
        const data = await fetchPairData(pair);
        const result = runAnalysis(
          pair,
          data.candles4H,
          data.candles1H,
          data.candles30m,
          data.candles15m,
          data.currentPrice,
          { todayHigh: data.todayHigh, todayLow: data.todayLow, todayOpen: data.todayOpen },
          data.candles5m
        );
        results.push(result);
      } catch (err) {
        console.error(`Error analyzing ${pair}:`, err.message);
        results.push({ pair, error: err.message });
      }
      // Delay between pairs to respect rate limits (except after last)
      if (i < SUPPORTED_PAIRS.length - 1) {
        await sleep(8000);
      }
    }
    res.json(results);
  } catch (err) {
    console.error('Analyze-all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/scanner', async (req, res) => {
  try {
    const snapshot = await buildScannerSnapshot();
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function buildScannerRow(pair) {
  try {
    const data = await fetchPairData(pair);
    const r = runAnalysis(
      pair,
      data.candles4H,
      data.candles1H,
      data.candles30m,
      data.candles15m,
      data.currentPrice,
      { todayHigh: data.todayHigh, todayLow: data.todayLow, todayOpen: data.todayOpen },
      data.candles5m
    );
    return {
      pair,
      currentPrice: r.currentPrice,
      bias: r.bias,
      strength: r.strength,
      strengthLabel: r.strengthLabel,
      confidence: r.confidence,
      timeframes: r.timeframes.map(tf => ({
        label: tf.label,
        bias: tf.bias,
        bullCount: tf.bullCount,
        bearCount: tf.bearCount,
        divergence: tf.divergence || null,
      })),
      asian: {
        high: r.asian.high,
        low: r.asian.low,
        highSwept: r.asian.highSwept,
        lowSwept: r.asian.lowSwept,
        complete: r.asian.complete,
      },
    };
  } catch (err) {
    return { pair, error: err.message };
  }
}

async function buildScannerSnapshot() {
  const results = await Promise.all(SUPPORTED_PAIRS.map(buildScannerRow));
  return { timestamp: new Date().toISOString(), results };
}

router.get('/atr/:pair', async (req, res) => {
  try {
    const pair = req.params.pair.replace('-', '/').toUpperCase();
    const interval = req.query.interval || '1h';
    const period = parseInt(req.query.period || '14', 10);
    const data = await getATR(pair, interval, period);
    const latest = data.values?.[0];
    const atr = latest ? parseFloat(latest.atr) : null;
    res.json({ pair, interval, period, atr, datetime: latest?.datetime });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/strength', async (req, res) => {
  try {
    const data = await computeStrength();
    res.json(data);
  } catch (err) {
    console.error('Strength error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/calendar', async (req, res) => {
  try {
    const hoursAhead = parseInt(req.query.hours || '48', 10);
    const minImportance = parseInt(req.query.minImportance || '2', 10);
    const data = await fetchCalendar({ hoursAhead, minImportance });
    res.json(data);
  } catch (err) {
    console.error('Calendar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/correlation', async (req, res) => {
  try {
    const interval = req.query.interval || '1h';
    const lookback = parseInt(req.query.lookback || '50', 10);
    const data = await computeCorrelation({ interval, lookback });
    res.json(data);
  } catch (err) {
    console.error('Correlation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/journal/list', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    res.json({ signals: journal.listSignals(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/journal/stats', (req, res) => {
  try {
    res.json(journal.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/journal/resolve', async (req, res) => {
  try {
    const r = await journal.resolveOpenSignals();
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backtest/:pair', async (req, res) => {
  try {
    const pair = req.params.pair.replace('-', '/').toUpperCase();
    if (!SUPPORTED_PAIRS.includes(pair)) {
      return res.status(400).json({ error: `Unsupported pair: ${pair}` });
    }
    const days = parseInt(req.query.days || '30', 10);
    const onlyAligned = req.query.onlyAligned === '1';
    const data = await runBacktest({ pair, days, onlyAligned });
    res.json(data);
  } catch (err) {
    console.error('Backtest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/session', (req, res) => {
  res.json(getSessionInfo());
});

router.get('/cache-status', (req, res) => {
  res.json(getCacheStatus());
});

// ─── Live Trades ───

router.get('/trades', (req, res) => {
  try {
    const all = req.query.all === '1';
    res.json({ trades: all ? liveTrades.getAllTrades(50) : liveTrades.getOpenTrades() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trades/snapshot', async (req, res) => {
  try {
    // Get real-time prices only for pairs with open trades (fast, 15s cache)
    const openTrades = liveTrades.getOpenTrades();
    const tradePairs = [...new Set(openTrades.map(t => t.pair))];

    const prices = {};
    // Fetch real-time prices in parallel for open trade pairs
    await Promise.all(tradePairs.map(async (pair) => {
      const price = await getRealTimePrice(pair);
      if (price != null) prices[pair] = price;
    }));

    // Analysis data from the heavier cache (for suggestions — ok if slightly stale)
    const analysisMap = {};
    for (const pair of tradePairs) {
      try {
        const data = await fetchPairData(pair);
        const result = runAnalysis(
          pair, data.candles4H, data.candles1H, data.candles30m, data.candles15m,
          data.currentPrice,
          { todayHigh: data.todayHigh, todayLow: data.todayLow, todayOpen: data.todayOpen },
          data.candles5m
        );
        analysisMap[pair] = { bias: result.bias, levels: result.levels, timeframes: result.timeframes };
      } catch { /* suggestions won't show if this fails — that's ok */ }
    }

    const snapshot = liveTrades.computeLiveSnapshot(prices, analysisMap);
    res.json({ trades: snapshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trades', (req, res) => {
  try {
    const { pair, direction, entry_price, sl_price, tp_price, lot_size, notes } = req.body;
    if (!pair || !direction || !entry_price || !sl_price || !tp_price) {
      return res.status(400).json({ error: 'Missing required fields: pair, direction, entry_price, sl_price, tp_price' });
    }
    if (!SUPPORTED_PAIRS.includes(pair)) {
      return res.status(400).json({ error: `Unsupported pair: ${pair}` });
    }
    const id = liveTrades.addTrade({
      pair,
      direction,
      entry_price: parseFloat(entry_price),
      sl_price: parseFloat(sl_price),
      tp_price: parseFloat(tp_price),
      lot_size: parseFloat(lot_size || 0.01),
      notes,
    });
    res.json({ id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trades/:id/close', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { exit_price } = req.body;
    if (!exit_price) return res.status(400).json({ error: 'exit_price required' });

    // Fetch current analysis for the trade's pair to generate a detailed review
    let analysisData = null;
    const trade = liveTrades.getTradeById(id);
    if (trade?.pair) {
      try {
        const data = await fetchPairData(trade.pair);
        const result = runAnalysis(
          trade.pair, data.candles4H, data.candles1H, data.candles30m, data.candles15m,
          data.currentPrice,
          { todayHigh: data.todayHigh, todayLow: data.todayLow, todayOpen: data.todayOpen },
          data.candles5m
        );
        analysisData = { bias: result.bias, levels: result.levels, timeframes: result.timeframes };
      } catch { /* close without analysis if fetch fails */ }
    }

    const closeResult = liveTrades.closeTrade(id, parseFloat(exit_price), analysisData);
    if (!closeResult) return res.status(404).json({ error: 'Trade not found or already closed' });
    res.json(closeResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trades/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const trade = liveTrades.getTradeById(id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/trades/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    liveTrades.deleteTrade(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.buildScannerSnapshot = buildScannerSnapshot;
