// Live trade tracker — stores user-entered trades, provides smart exit
// analysis, and generates detailed post-trade reviews on close.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getPipValue, priceToPips, formatPrice } = require('../utils/helpers');

// Pip value in USD per standard lot (100k units).
// USD-quote pairs: 1 pip = $10 per lot.
// JPY pairs: 1 pip ≈ $10000 * 0.01 / rate. We use the current price to compute.
function pipValueUsd(pair, currentPrice) {
  const isJpy = pair.includes('JPY');
  if (!isJpy) return 10; // $10 per pip per standard lot
  // For JPY pairs: pip value = (0.01 / currentPrice) * 100000
  return currentPrice > 0 ? (0.01 / currentPrice) * 100000 : 6.5;
}

const DB_PATH = path.resolve(__dirname, '../../data/journal.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS live_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    sl_price REAL NOT NULL,
    tp_price REAL NOT NULL,
    lot_size REAL NOT NULL DEFAULT 0.01,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    exit_price REAL,
    pnl_pips REAL,
    pnl_r REAL,
    analysis TEXT,
    created_at TEXT NOT NULL,
    closed_at TEXT
  );
`);

// Add analysis column if upgrading from previous schema
try { db.exec('ALTER TABLE live_trades ADD COLUMN analysis TEXT'); } catch { /* already exists */ }

const insertStmt = db.prepare(`
  INSERT INTO live_trades (pair, direction, entry_price, sl_price, tp_price, lot_size, notes, status, created_at)
  VALUES (@pair, @direction, @entry_price, @sl_price, @tp_price, @lot_size, @notes, 'open', @created_at)
`);

const closeStmt = db.prepare(`
  UPDATE live_trades
  SET status = @status, exit_price = @exit_price, pnl_pips = @pnl_pips,
      pnl_r = @pnl_r, analysis = @analysis, closed_at = @closed_at
  WHERE id = @id AND status = 'open'
`);

const deleteStmt = db.prepare('DELETE FROM live_trades WHERE id = ?');
const listOpenStmt = db.prepare("SELECT * FROM live_trades WHERE status = 'open' ORDER BY id DESC");
const listAllStmt = db.prepare('SELECT * FROM live_trades ORDER BY id DESC LIMIT ?');
const getByIdStmt = db.prepare('SELECT * FROM live_trades WHERE id = ?');

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

// Generate post-trade analysis: what went right, what went wrong, lessons.
// analysisData: { bias, levels, timeframes } from the current analysis engine
function generateTradeReview(trade, exitPrice, analysisData) {
  const pip = getPipValue(trade.pair);
  const pnlRaw = trade.direction === 'LONG'
    ? exitPrice - trade.entry_price
    : trade.entry_price - exitPrice;
  const pnlPips = pnlRaw / pip;
  const risk = Math.abs(trade.entry_price - trade.sl_price);
  const reward = Math.abs(trade.tp_price - trade.entry_price);
  const pnlR = risk > 0 ? pnlRaw / risk : 0;
  const plannedRR = risk > 0 ? reward / risk : 0;
  const isWin = pnlRaw > 0;
  const pvUsd = pipValueUsd(trade.pair, exitPrice);
  const pnlUsd = pnlPips * pvUsd * trade.lot_size;

  const review = {
    outcome: isWin ? 'WIN' : 'LOSS',
    pnlPips: Math.round(pnlPips * 10) / 10,
    pnlUsd: Math.round(pnlUsd * 100) / 100,
    pnlR: Math.round(pnlR * 100) / 100,
    plannedRR: Math.round(plannedRR * 10) / 10,
    holdTime: null,
    wentRight: [],
    wentWrong: [],
    lessons: [],
  };

  // Hold time
  const openMs = new Date(trade.created_at).getTime();
  const closeMs = Date.now();
  const holdMins = Math.round((closeMs - openMs) / 60000);
  review.holdTime = holdMins < 60
    ? `${holdMins}m`
    : `${Math.floor(holdMins / 60)}h ${holdMins % 60}m`;

  if (!analysisData) return review;

  const { bias, levels, timeframes } = analysisData;

  // 1. Bias alignment at close
  const biasAligned = (trade.direction === 'LONG' && bias === 'BULLISH')
    || (trade.direction === 'SHORT' && bias === 'BEARISH');
  const biasAtEntry = trade.notes?.includes('bias:')
    ? trade.notes.split('bias:')[1]?.split(' ')[0]
    : null;

  if (biasAligned) {
    review.wentRight.push(`Trade direction aligned with current MTF bias (${bias})`);
  } else if (bias !== 'NEUTRAL') {
    review.wentWrong.push(`MTF bias is ${bias} — against your ${trade.direction} position`);
    review.lessons.push('Consider only taking trades that align with the dominant MTF bias');
  }

  // 2. Timeframe agreement at close
  if (timeframes) {
    const agreeing = timeframes.filter(tf =>
      (trade.direction === 'LONG' && tf.bias === 'BULLISH') ||
      (trade.direction === 'SHORT' && tf.bias === 'BEARISH')
    );
    const against = timeframes.filter(tf =>
      (trade.direction === 'LONG' && tf.bias === 'BEARISH') ||
      (trade.direction === 'SHORT' && tf.bias === 'BULLISH')
    );

    if (agreeing.length >= 3) {
      review.wentRight.push(`${agreeing.length}/${timeframes.length} timeframes agreed with trade direction`);
    }
    if (against.length >= 3) {
      review.wentWrong.push(`${against.length}/${timeframes.length} timeframes were against trade direction`);
      review.lessons.push(`Higher timeframes (${against.map(t => t.label).join(', ')}) disagreed — wait for alignment`);
    }

    // 3. RSI divergence warnings
    for (const tf of timeframes) {
      if (!tf.divergence) continue;
      if (trade.direction === 'LONG' && tf.divergence.bearish) {
        review.wentWrong.push(`${tf.label} showed bearish RSI divergence — momentum was fading on your LONG`);
        review.lessons.push(`Check ${tf.label} RSI divergence before entering — it signaled exhaustion`);
      }
      if (trade.direction === 'SHORT' && tf.divergence.bullish) {
        review.wentWrong.push(`${tf.label} showed bullish RSI divergence — selling pressure was fading on your SHORT`);
        review.lessons.push(`Check ${tf.label} RSI divergence before entering — it signaled reversal potential`);
      }
      if (trade.direction === 'LONG' && tf.divergence.bullish) {
        review.wentRight.push(`${tf.label} bullish RSI divergence supported your LONG`);
      }
      if (trade.direction === 'SHORT' && tf.divergence.bearish) {
        review.wentRight.push(`${tf.label} bearish RSI divergence supported your SHORT`);
      }
    }
  }

  // 4. Key levels analysis
  if (levels) {
    const resistanceLevels = levels.filter(l => l.type === 'resistance');
    const supportLevels = levels.filter(l => l.type === 'support');

    if (trade.direction === 'LONG') {
      // Did price stall at a resistance level?
      for (const lvl of resistanceLevels) {
        const dist = Math.abs(exitPrice - lvl.value) / pip;
        if (dist < 10 && !isWin) {
          review.wentWrong.push(`Price stalled near ${lvl.label} (${formatPrice(lvl.value, trade.pair)}) — only ${dist.toFixed(0)} pips away at exit`);
          review.lessons.push(`Set TP below key resistance levels, not beyond them`);
        }
      }
      // Did support hold?
      for (const lvl of supportLevels) {
        if (lvl.value > trade.sl_price && lvl.value < trade.entry_price) {
          const held = exitPrice > lvl.value;
          if (held) review.wentRight.push(`Support at ${lvl.label} held during the trade`);
        }
      }
    } else {
      for (const lvl of supportLevels) {
        const dist = Math.abs(exitPrice - lvl.value) / pip;
        if (dist < 10 && !isWin) {
          review.wentWrong.push(`Price bounced near ${lvl.label} (${formatPrice(lvl.value, trade.pair)}) — only ${dist.toFixed(0)} pips away at exit`);
          review.lessons.push(`Set TP above key support levels, not beyond them`);
        }
      }
    }
  }

  // 5. Risk management review
  if (isWin) {
    if (pnlR >= 2) {
      review.wentRight.push(`Excellent risk management — captured ${pnlR.toFixed(1)}R`);
    } else if (pnlR >= 1) {
      review.wentRight.push(`Solid +${pnlR.toFixed(1)}R return`);
    } else {
      review.lessons.push(`Only captured ${pnlR.toFixed(1)}R — aim for at least 1R minimum on winners`);
    }
  } else {
    if (Math.abs(pnlR) > 1.5) {
      review.wentWrong.push(`Lost ${Math.abs(pnlR).toFixed(1)}R — more than planned 1R risk`);
      review.lessons.push('Stick to your stop loss. Moving it further away increases risk beyond plan');
    } else {
      review.wentRight.push('Risk was contained within planned parameters');
    }
  }

  // 6. Entry quality
  const entryToSl = Math.abs(trade.entry_price - trade.sl_price) / pip;
  const entryToTp = Math.abs(trade.tp_price - trade.entry_price) / pip;
  if (plannedRR < 1.5) {
    review.wentWrong.push(`Planned R:R was only 1:${plannedRR.toFixed(1)} — below the 1:2 minimum`);
    review.lessons.push('Only take setups with at least 1:2 risk-to-reward ratio');
  } else {
    review.wentRight.push(`Good planned R:R of 1:${plannedRR.toFixed(1)}`);
  }

  // Deduplicate lessons
  review.lessons = [...new Set(review.lessons)];

  return review;
}

function closeTrade(id, exitPrice, analysisData = null) {
  const trade = db.prepare('SELECT * FROM live_trades WHERE id = ? AND status = ?').get(id, 'open');
  if (!trade) return null;

  const pip = getPipValue(trade.pair);
  const pnlRaw = trade.direction === 'LONG'
    ? exitPrice - trade.entry_price
    : trade.entry_price - exitPrice;
  const pnlPips = pnlRaw / pip;
  const risk = Math.abs(trade.entry_price - trade.sl_price);
  const pnlR = risk > 0 ? pnlRaw / risk : 0;

  const review = generateTradeReview(trade, exitPrice, analysisData);
  const status = pnlRaw >= 0 ? 'closed_win' : 'closed_loss';

  closeStmt.run({
    id,
    status,
    exit_price: exitPrice,
    pnl_pips: Math.round(pnlPips * 10) / 10,
    pnl_r: Math.round(pnlR * 100) / 100,
    analysis: JSON.stringify(review),
    closed_at: new Date().toISOString(),
  });

  return { id, pnlPips: review.pnlPips, pnlR: review.pnlR, review };
}

function getTradeById(id) {
  const trade = getByIdStmt.get(id);
  if (trade && trade.analysis) {
    try { trade.analysis = JSON.parse(trade.analysis); } catch { /* leave as string */ }
  }
  return trade;
}

function deleteTrade(id) {
  return deleteStmt.run(id);
}

function getOpenTrades() {
  return listOpenStmt.all();
}

function getAllTrades(limit = 30) {
  const trades = listAllStmt.all(limit);
  for (const t of trades) {
    if (t.analysis) {
      try { t.analysis = JSON.parse(t.analysis); } catch { /* leave as string */ }
    }
  }
  return trades;
}

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

    const tpDist = Math.abs(trade.tp_price - trade.entry_price);
    const slDist = Math.abs(trade.sl_price - trade.entry_price);
    const progress = pnlRaw >= 0
      ? (tpDist > 0 ? pnlRaw / tpDist : 0)
      : -(Math.abs(pnlRaw) / (slDist || 1));

    const distToSl = trade.direction === 'LONG'
      ? (currentPrice - trade.sl_price) / pip
      : (trade.sl_price - currentPrice) / pip;
    const distToTp = trade.direction === 'LONG'
      ? (trade.tp_price - currentPrice) / pip
      : (currentPrice - trade.tp_price) / pip;

    // $ P&L: pips * pipValueUsd * lots (lot_size is in standard lots)
    const pvUsd = pipValueUsd(trade.pair, currentPrice);
    const pnlUsd = pnlPips * pvUsd * trade.lot_size;

    const suggestions = [];
    const analysis = analysisMap[trade.pair];

    if (analysis) {
      if (trade.direction === 'LONG' && analysis.bias === 'BEARISH') {
        suggestions.push({ type: 'warning', text: 'MTF bias flipped BEARISH against your LONG' });
      } else if (trade.direction === 'SHORT' && analysis.bias === 'BULLISH') {
        suggestions.push({ type: 'warning', text: 'MTF bias flipped BULLISH against your SHORT' });
      }

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
        pnlUsd: Math.round(pnlUsd * 100) / 100,
        suggestions,
      },
    };
  });
}

module.exports = { addTrade, closeTrade, getTradeById, deleteTrade, getOpenTrades, getAllTrades, computeLiveSnapshot };
