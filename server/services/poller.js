// Background poller: refreshes the scanner snapshot, currency strength, and
// checks for upcoming high-impact news events.

const { buildScannerSnapshot } = require('../routes/analysis');
const { computeStrength } = require('./strength');
const { fetchCalendar } = require('./economicCalendar');
const { pushScanner, pushStrength, pushAlert } = require('./priceStream');

// Track previous sweep state per pair so we only fire alerts on transitions.
const sweepState = {};

// Track which news events we've already alerted on (by title+datetime).
const alertedNews = new Set();

const SCANNER_INTERVAL_MS = 30 * 1000;        // 30s
const STRENGTH_INTERVAL_MS = 60 * 1000;       // 60s
const NEWS_CHECK_INTERVAL_MS = 60 * 1000;     // 60s
const FIRST_RUN_DELAY_MS = 2 * 1000;

let scannerTimer = null;
let strengthTimer = null;
let newsTimer = null;
let scannerRunning = false;
let strengthRunning = false;
let newsRunning = false;

function detectSweepAlerts(snapshot) {
  for (const row of snapshot.results || []) {
    if (row.error || !row.asian) continue;
    const prev = sweepState[row.pair];
    const curr = {
      highSwept: !!row.asian.highSwept,
      lowSwept: !!row.asian.lowSwept,
    };

    if (prev) {
      if (!prev.highSwept && curr.highSwept) {
        const aligned = row.bias === 'BEARISH';
        pushAlert({
          id: `${row.pair}-high-${Date.now()}`,
          pair: row.pair,
          side: 'high',
          bias: row.bias,
          strength: row.strength,
          aligned,
          high: row.asian.high,
          low: row.asian.low,
          price: row.currentPrice,
          message: aligned
            ? `${row.pair} swept Asia HIGH — bearish setup live`
            : `${row.pair} swept Asia HIGH (bias ${row.bias})`,
          timestamp: snapshot.timestamp,
        });
      }
      if (!prev.lowSwept && curr.lowSwept) {
        const aligned = row.bias === 'BULLISH';
        pushAlert({
          id: `${row.pair}-low-${Date.now()}`,
          pair: row.pair,
          side: 'low',
          bias: row.bias,
          strength: row.strength,
          aligned,
          high: row.asian.high,
          low: row.asian.low,
          price: row.currentPrice,
          message: aligned
            ? `${row.pair} swept Asia LOW — bullish setup live`
            : `${row.pair} swept Asia LOW (bias ${row.bias})`,
          timestamp: snapshot.timestamp,
        });
      }
    }
    sweepState[row.pair] = curr;
  }
}

async function tickScanner() {
  if (scannerRunning) return;
  scannerRunning = true;
  try {
    const snap = await buildScannerSnapshot();
    pushScanner(snap);
    detectSweepAlerts(snap);
  } catch (err) {
    console.error('[poller] scanner error:', err.message);
  } finally {
    scannerRunning = false;
  }
}

async function tickStrength() {
  if (strengthRunning) return;
  strengthRunning = true;
  try {
    const snap = await computeStrength();
    pushStrength(snap);
  } catch (err) {
    console.error('[poller] strength error:', err.message);
  } finally {
    strengthRunning = false;
  }
}

async function tickNews() {
  if (newsRunning) return;
  newsRunning = true;
  try {
    const data = await fetchCalendar({ hoursAhead: 2, minImportance: 2 });
    const now = Date.now();

    for (const event of data.events || []) {
      const minsUntil = (event.timestampMs - now) / 60000;
      // Alert at ~30 min and ~5 min before
      const windows = [
        { min: 25, max: 35, label: '30 min' },
        { min: 3, max: 7, label: '5 min' },
      ];
      for (const w of windows) {
        if (minsUntil >= w.min && minsUntil <= w.max) {
          const key = `${event.title}-${event.datetime}-${w.label}`;
          if (alertedNews.has(key)) continue;
          alertedNews.add(key);

          const impLabel = event.importance >= 3 ? 'HIGH' : 'MEDIUM';
          pushAlert({
            id: `news-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'news',
            importance: event.importance,
            currency: event.currency,
            title: event.title,
            message: `${impLabel}-IMPACT: ${event.currency} ${event.title} in ~${w.label}`,
            eventTime: event.datetime,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Clean up old entries (older than 2h) to prevent memory growth
    if (alertedNews.size > 200) alertedNews.clear();
  } catch (err) {
    console.error('[poller] news check error:', err.message);
  } finally {
    newsRunning = false;
  }
}

function start() {
  console.log('[poller] starting background poller');
  setTimeout(() => {
    tickScanner();
    tickStrength();
    tickNews();
    scannerTimer = setInterval(tickScanner, SCANNER_INTERVAL_MS);
    strengthTimer = setInterval(tickStrength, STRENGTH_INTERVAL_MS);
    newsTimer = setInterval(tickNews, NEWS_CHECK_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

function stop() {
  clearInterval(scannerTimer);
  clearInterval(strengthTimer);
  clearInterval(newsTimer);
}

module.exports = { start, stop };
