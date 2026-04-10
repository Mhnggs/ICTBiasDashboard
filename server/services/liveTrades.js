// Live trade tracker — stores user-entered trades and provides smart exit analysis.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getPipValue, priceToPips, formatPrice } = require('../utils/helpers');

const DB_PATH = path.resolve(__dirname, '../../data/journal.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS live_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL,       -- 'LONG' | 'SHORT'
    entry_price REAL NOT NULL,
    sl_price REAL NOT NULL,
    tp_price REAL NOT NULL,
    lot_size REAL NOT NULL DEFAULT 0.01,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open',  -- open | closed_tp | closed_sl | closed_manual
    exit_price REAL,
    pnl_pips REAL,
    pnl_r REAL,
    created_at TEXT NOT NULL,
    closed_at TEXT
  );
`);

const insertStmt = db.prepare(`
  INSERT INTO live_trades (pair, direction, entry_price, sl_price, tp_price, lot_size, notes, status, created_at)
  VALUES (@pair, @direction, @entry_price, @sl_price, @tp_price, @lot_size, @notes, 'open', @created_at)
`);

const closeStmt = db.prepare(`
  UPDATE live_trades
  SET status = @status, exit_price = @exit_price, pnl_pips = @pnl_pips, pnl_r = @pnl_r, closed_at = @closed_at
  WHERE id = @id AND status = 'open'
`);

const deleteStmt = db.prepare('DELETE FROM live_trades WHERE id = ?');
const listOpenStmt = db.prepare("SELECT * FROM live_trades WHERE status = 'open' ORDER BY id DESC");
const listAllStmt = db.prepare('SELECT * FROM live_trades ORDER BY id DESC LIMIT ?');

function addTrade({ pair, direction, entry_price, sl_price, tp_price, lot_size = 0.01, notes = '' }) {
  const result = insertStmt.run({
    pair,
    direction: direction.toUpperCase(),
    entry_price,
    sl_price,
    tp_price,
    lot_size,
    notes: notes || null,
    created_at: new Date().toISOString(),
  });
  return result.lastInsertRowid;
}

function closeTrade(id, exitPrice) {
  const trade = db.prepare('SELECT * FROM live_trades WHERE id = ? AND status = ?').get(id, 'open');
  if (!trade) return null;

  const pip = getPipValue(trade.pair);
  const pnlRaw = trade.direction === 'LONG'
    ? exitPrice - trade.entry_price
    : trade.entry_price - exitPrice;
  const pnlPips = pnlRaw / pip;
  const risk = Math.abs(trade.entry_price - trade.sl_price);
  const pnlR = risk > 0 ? pnlRaw / risk : 0;

  const status = pnlRaw >= 0 ? 'closed_manual' : 'closed_manual';
  closeStmt.run({
    id,
    status,
    exit_price: exitPrice,
    pnl_pips: Math.round(pnlPips * 10) / 10,
    pnl_r: Math.round(pnlR * 100) / 100,
    closed_at: new Date().toISOString(),
  });
  return { id, pnlPips, pnlR };
}

function deleteTrade(id) {
  return deleteStmt.run(id);
}

function getOpenTrades() {
  return listOpenStmt.all();
}

function getAllTrades(limit = 30) {
  return listAllStmt.all(limit);
}

// Compute live P&L snapshot for all open trades given current prices map.
// prices: { 'EUR/USD': 1.1234, ... }
// analysisMap: { 'EUR/USD': { bias, levels, timeframes } } (optional)
function computeLiveSnapshot(prices, analysisMap = {}) {
  const open = listOpenStmt.all();
  return open.map((trade) => {
    const currentPrice = prices[trade.pair];
    if (currentPrice == null) {
      return { ...trade, live: null };
    }

    const pip = getPipValue(trade.pair);
    const pnlRaw = trade.direction === 'LONG'
      ? currentPrice - trade.entry_price
      : trade.entry_price - currentPrice;
    const pnlPips = pnlRaw / pip;
    const risk = Math.abs(trade.entry_price - trade.sl_price);
    const rMultiple = risk > 0 ? pnlRaw / risk : 0;

    // Progress: 0 = at entry, -1 = at SL, +1 = at TP (can exceed)
    const tpDist = Math.abs(trade.tp_price - trade.entry_price);
    const slDist = Math.abs(trade.sl_price - trade.entry_price);
    const progress = pnlRaw >= 0
      ? (tpDist > 0 ? pnlRaw / tpDist : 0)
      : -(Math.abs(pnlRaw) / (slDist || 1));

    // Distance to SL and TP in pips
    const distToSl = trade.direction === 'LONG'
      ? (currentPrice - trade.sl_price) / pip
      : (trade.sl_price - currentPrice) / pip;
    const distToTp = trade.direction === 'LONG'
      ? (trade.tp_price - currentPrice) / pip
      : (currentPrice - trade.tp_price) / pip;

    // Smart exit suggestions
    const suggestions = [];
    const analysis = analysisMap[trade.pair];

    if (analysis) {
      // 1. Bias flip warning
      if (trade.direction === 'LONG' && analysis.bias === 'BEARISH') {
        suggestions.push({ type: 'warning', text: 'MTF bias flipped BEARISH against your LONG' });
      } else if (trade.direction === 'SHORT' && analysis.bias === 'BULLISH') {
        suggestions.push({ type: 'warning', text: 'MTF bias flipped BULLISH against your SHORT' });
      }

      // 2. Divergence against trade
      if (analysis.timeframes) {
        for (const tf of analysis.timeframes) {
          if (!tf.divergence) continue;
          if (trade.direction === 'LONG' && tf.divergence.bearish) {
            suggestions.push({ type: 'caution', text: `${tf.label} bearish RSI divergence — momentum fading` });
          }
          if (trade.direction === 'SHORT' && tf.divergence.bullish) {
            suggestions.push({ type: 'caution', text: `${tf.label} bullish RSI divergence — selling pressure fading` });
          }
        }
      }

      // 3. Key level proximity (within 15 pips of a level between price and TP)
      if (analysis.levels) {
        for (const lvl of analysis.levels) {
          const lvlDist = Math.abs(currentPrice - lvl.value) / pip;
          if (lvlDist < 15) {
            const isBetween = trade.direction === 'LONG'
              ? lvl.value > currentPrice && lvl.value < trade.tp_price
              : lvl.value < currentPrice && lvl.value > trade.tp_price;
            if (isBetween) {
              suggestions.push({ type: 'info', text: `${lvl.label} (${formatPrice(lvl.value, trade.pair)}) nearby — consider partials` });
            }
          }
        }
      }
    }

    // 4. R-milestone suggestions
    if (rMultiple >= 1.0 && rMultiple < 1.5) {
      suggestions.push({ type: 'action', text: 'At +1R — consider moving SL to breakeven' });
    } else if (rMultiple >= 1.5) {
      suggestions.push({ type: 'action', text: 'At +1.5R — consider trailing SL to +1R' });
    }

    return {
      ...trade,
      live: {
        currentPrice,
        pnlPips: Math.round(pnlPips * 10) / 10,
        rMultiple: Math.round(rMultiple * 100) / 100,
        progress: Math.round(progress * 1000) / 1000,
        distToSl: Math.round(distToSl * 10) / 10,
        distToTp: Math.round(distToTp * 10) / 10,
        suggestions,
      },
    };
  });
}

module.exports = { addTrade, closeTrade, deleteTrade, getOpenTrades, getAllTrades, computeLiveSnapshot };
