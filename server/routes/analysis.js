const express = require('express');
const router = express.Router();
const { fetchPairData, getCacheStatus } = require('../services/twelveData');
const { runAnalysis } = require('../services/analysis');
const { getSessionInfo } = require('../services/session');
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
      { todayHigh: data.todayHigh, todayLow: data.todayLow, todayOpen: data.todayOpen }
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
          { todayHigh: data.todayHigh, todayLow: data.todayLow, todayOpen: data.todayOpen }
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
    const results = await Promise.all(
      SUPPORTED_PAIRS.map(async (pair) => {
        try {
          const data = await fetchPairData(pair);
          const r = runAnalysis(
            pair,
            data.candles4H,
            data.candles1H,
            data.candles30m,
            data.candles15m,
            data.currentPrice,
            { todayHigh: data.todayHigh, todayLow: data.todayLow, todayOpen: data.todayOpen }
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
      })
    );
    res.json({ timestamp: new Date().toISOString(), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session', (req, res) => {
  res.json(getSessionInfo());
});

router.get('/cache-status', (req, res) => {
  res.json(getCacheStatus());
});

module.exports = router;
