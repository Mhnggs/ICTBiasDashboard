// Background poller: refreshes the scanner snapshot and currency strength on
// a fixed interval and pushes the results to all connected WS clients via
// priceStream. Keeps the server-side cache warm so REST endpoints stay fast.

const { buildScannerSnapshot } = require('../routes/analysis');
const { computeStrength } = require('./strength');
const { pushScanner, pushStrength } = require('./priceStream');

const SCANNER_INTERVAL_MS = 30 * 1000;        // 30s
const STRENGTH_INTERVAL_MS = 60 * 1000;       // 60s
const FIRST_RUN_DELAY_MS = 2 * 1000;          // wait 2s after boot

let scannerTimer = null;
let strengthTimer = null;
let scannerRunning = false;
let strengthRunning = false;

async function tickScanner() {
  if (scannerRunning) return;
  scannerRunning = true;
  try {
    const snap = await buildScannerSnapshot();
    pushScanner(snap);
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
