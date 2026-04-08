// Trade journal — persists every sweep alert as a signal and resolves it
// later by scanning subsequent candles for TP / SL hits.

const Database = require('better-sqlite3');
const path = require('path');
const { fetchPairData } = require('./twelveData');
const { getPipValue } = require('../utils/helpers');

const DB_PATH = path.resolve(__dirname, '../../data/journal.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT UNIQUE,
    pair TEXT NOT NULL,
    side TEXT NOT NULL,                 -- 'high' (short) | 'low' (long)
    direction TEXT NOT NULL,            -- 'LONG' | 'SHORT'
    bias TEXT,
    strength TEXT,
    aligned INTEGER,                    -- 1/0 — bias matches sweep direction
    asia_high REAL,
    asia_low REAL,
    entry_price REAL,
    sl_price REAL,
    tp_price REAL,
    rr REAL,
    status TEXT NOT NULL DEFAULT 'open', -- open | win | loss | expired
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    max_favorable REAL,
    max_adverse REAL
  );
  CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
  CREATE INDEX IF NOT EXISTS idx_signals_pair ON signals(pair);
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO signals
    (alert_id, pair, side, direction, bias, strength, aligned,
     asia_high, asia_low, entry_price, sl_price, tp_price, rr,
     status, created_at)
  VALUES
    (@alert_id, @pair, @side, @direction, @bias, @strength, @aligned,
     @asia_high, @asia_low, @entry_price, @sl_price, @tp_price, @rr,
     'open', @created_at)
`);

const updateResolvedStmt = db.prepare(`
  UPDATE signals
  SET status = @status,
      resolved_at = @resolved_at,
      max_favorable = @max_favorable,
      max_adverse = @max_adverse
  WHERE id = @id
`);

const listOpenStmt = db.prepare(`SELECT * FROM signals WHERE status = 'open' ORDER BY id DESC`);
const listAllStmt = db.prepare(`SELECT * FROM signals ORDER BY id DESC LIMIT @limit`);
const statsStmt = db.prepare(`
  SELECT
    pair,
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'win' THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN status = 'loss' THEN 1 ELSE 0 END) AS losses,
    SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
    SUM(CASE WHEN aligned = 1 THEN 1 ELSE 0 END) AS aligned_total,
    SUM(CASE WHEN aligned = 1 AND status = 'win' THEN 1 ELSE 0 END) AS aligned_wins
  FROM signals
  GROUP BY pair
`);

// Convert a sweep alert into a signal: long on low sweep, short on high sweep.
// Default SL = opposite side of the asian range; TP = 2R.
function logAlertAsSignal(alert) {
  if (!alert?.pair) return;
  const direction = alert.side === 'low' ? 'LONG' : 'SHORT';
  const entry = alert.price;
  let sl, tp, rr;
  if (direction === 'LONG') {
    sl = alert.high; // we just swept low; if it then breaks asia high we abandoned anyway
    // Actually for the strategy: stop should be below the swept low extreme.
    // Use a fixed buffer of ~5 pips for backtesting. Take profit = 2R.
    const pip = getPipValue(alert.pair);
    sl = alert.low - 5 * pip; // 5 pips below swept low
    const risk = entry - sl;
    if (risk <= 0) return;
    tp = entry + 2 * risk;
    rr = 2;
  } else {
    const pip = getPipValue(alert.pair);
    sl = alert.high + 5 * pip;
    const risk = sl - entry;
    if (risk <= 0) return;
    tp = entry - 2 * risk;
    rr = 2;
  }

  insertStmt.run({
    alert_id: alert.id,
    pair: alert.pair,
    side: alert.side,
    direction,
    bias: alert.bias || null,
    strength: alert.strength || null,
    aligned: alert.aligned ? 1 : 0,
    asia_high: alert.high ?? null,
    asia_low: alert.low ?? null,
    entry_price: entry,
    sl_price: sl,
    tp_price: tp,
    rr,
    created_at: alert.timestamp || new Date().toISOString(),
  });
}

// Resolve open signals by scanning recent 15m candles for SL/TP hits.
async function resolveOpenSignals() {
  const open = listOpenStmt.all();
  if (!open.length) return { checked: 0, resolved: 0 };

  // Group by pair so we fetch each pair once
  const byPair = {};
  for (const sig of open) {
    if (!byPair[sig.pair]) byPair[sig.pair] = [];
    byPair[sig.pair].push(sig);
  }

  let resolved = 0;
  for (const pair of Object.keys(byPair)) {
    let candles15m;
    try {
      const data = await fetchPairData(pair);
      candles15m = data.candles15m;
    } catch (err) {
      console.error('[journal] resolve fetch error', pair, err.message);
      continue;
    }

    for (const sig of byPair[pair]) {
      const createdMs = new Date(sig.created_at).getTime();
      const after = candles15m.filter((c) => new Date(c.datetime).getTime() > createdMs);
      if (!after.length) continue;

      let maxFav = 0, maxAdv = 0;
      let outcome = null;
      for (const c of after) {
        if (sig.direction === 'LONG') {
          maxFav = Math.max(maxFav, c.high - sig.entry_price);
          maxAdv = Math.min(maxAdv, c.low - sig.entry_price);
          if (c.low <= sig.sl_price) { outcome = 'loss'; break; }
          if (c.high >= sig.tp_price) { outcome = 'win'; break; }
        } else {
          maxFav = Math.max(maxFav, sig.entry_price - c.low);
          maxAdv = Math.min(maxAdv, sig.entry_price - c.high);
          if (c.high >= sig.sl_price) { outcome = 'loss'; break; }
          if (c.low <= sig.tp_price) { outcome = 'win'; break; }
        }
      }

      // Expire signals older than 24h with no resolution
      if (!outcome && Date.now() - createdMs > 24 * 3600 * 1000) {
        outcome = 'expired';
      }

      if (outcome) {
        updateResolvedStmt.run({
          id: sig.id,
          status: outcome,
          resolved_at: new Date().toISOString(),
          max_favorable: maxFav,
          max_adverse: maxAdv,
        });
        resolved++;
      }
    }
  }
  return { checked: open.length, resolved };
}

function listSignals(limit = 50) {
  return listAllStmt.all({ limit });
}

function getStats() {
  const rows = statsStmt.all();
  let totalAll = 0, winsAll = 0, lossesAll = 0;
  let alignedAll = 0, alignedWinsAll = 0;
  for (const r of rows) {
    totalAll += r.total;
    winsAll += r.wins;
    lossesAll += r.losses;
    alignedAll += r.aligned_total;
    alignedWinsAll += r.aligned_wins;
  }
  const closedAll = winsAll + lossesAll;
  const closedAligned = rows.reduce(
    (acc, r) => acc + (r.aligned_total - (r.open_count > 0 ? Math.min(r.open_count, r.aligned_total) : 0)),
    0
  );
  return {
    perPair: rows.map((r) => {
      const closed = r.wins + r.losses;
      const winRate = closed ? (r.wins / closed) * 100 : null;
      return {
        pair: r.pair,
        total: r.total,
        wins: r.wins,
        losses: r.losses,
        open: r.open_count,
        winRate,
        alignedTotal: r.aligned_total,
        alignedWins: r.aligned_wins,
      };
    }),
    overall: {
      total: totalAll,
      wins: winsAll,
      losses: lossesAll,
      open: totalAll - closedAll,
      winRate: closedAll ? (winsAll / closedAll) * 100 : null,
      alignedWinRate: closedAligned ? (alignedWinsAll / closedAligned) * 100 : null,
    },
  };
}

module.exports = { logAlertAsSignal, resolveOpenSignals, listSignals, getStats };
