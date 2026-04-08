// Background poller: refreshes the scanner snapshot and currency strength on
// a fixed interval and pushes the results to all connected WS clients via
// priceStream. Keeps the server-side cache warm so REST endpoints stay fast.

const { buildScannerSnapshot } = require('../routes/analysis');
const { computeStrength } = require('./strength');
const { pushScanner, pushStrength, pushAlert } = require('./priceStream');

// Track previous sweep state per pair so we only fire alerts on transitions.
// Shape: { [pair]: { highSwept: bool, lowSwept: bool } }
const sweepState = {};

const SCANNER_INTERVAL_MS = 30 * 1000;        // 30s
const STRENGTH_INTERVAL_MS = 60 * 1000;       // 60s
const FIRST_RUN_DELAY_MS = 2 * 1000;          // wait 2s after boot

let scannerTimer = null;
let strengthTimer = null;
let scannerRunning = false;
let strengthRunning = false;

function detectSweepAlerts(snapshot) {
  for (const row of snapshot.results || []) {
    if (row.error || !row.asian) continue;
    const prev = sweepState[row.pair];
    const curr = {
      highSwept: !!row.asian.highSwept,
      lowSwept: !!row.asian.lowSwept,
    };

    // Only fire if we have a prior baseline (avoid alert on cold-start)
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

function start() {
  console.log('[poller] starting background poller');
  setTimeout(() => {
    tickScanner();
    tickStrength();
    scannerTimer = setInterval(tickScanner, SCANNER_INTERVAL_MS);
    strengthTimer = setInterval(tickStrength, STRENGTH_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

function stop() {
  clearInterval(scannerTimer);
  clearInterval(strengthTimer);
}

module.exports = { start, stop };
