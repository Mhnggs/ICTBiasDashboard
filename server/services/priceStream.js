const WebSocket = require('ws');
const { SUPPORTED_PAIRS } = require('../utils/helpers');

const TD_WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';

let upstream = null;
let upstreamReady = false;
let reconnectTimer = null;
let heartbeatTimer = null;
let currentSymbol = 'EUR/USD'; // The one symbol we stream (Grow plan = 1 WS symbol)
const clients = new Set();
const lastPrices = new Map();
let lastScanner = null;
let lastStrength = null;
const recentAlerts = [];
const MAX_ALERTS = 50;

function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  }
}

function pushScanner(snapshot) {
  lastScanner = snapshot;
  broadcast({ type: 'scanner', ...snapshot });
}

function pushStrength(snapshot) {
  lastStrength = snapshot;
  broadcast({ type: 'strength', ...snapshot });
}

function pushAlert(alert) {
  recentAlerts.unshift(alert);
  if (recentAlerts.length > MAX_ALERTS) recentAlerts.length = MAX_ALERTS;
  console.log(`[priceStream] ALERT: ${alert.message}`);
  broadcast({ type: 'alert', alert });
}

// Switch the upstream WS to a different symbol
function switchSymbol(symbol) {
  if (!SUPPORTED_PAIRS.includes(symbol)) return;
  if (symbol === currentSymbol) return;

  const oldSymbol = currentSymbol;
  currentSymbol = symbol;
  console.log(`[priceStream] Switching WS: ${oldSymbol} -> ${symbol}`);

  if (upstream && upstreamReady) {
    // Unsubscribe old, subscribe new
    upstream.send(JSON.stringify({
      action: 'unsubscribe',
      params: { symbols: oldSymbol },
    }));
    upstream.send(JSON.stringify({
      action: 'subscribe',
      params: { symbols: symbol },
    }));
  }

  // Notify clients of the switch
  broadcast({ type: 'ws-symbol', symbol: currentSymbol });
}

function getActiveSymbol() {
  return currentSymbol;
}

function connectUpstream() {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.warn('[priceStream] No API key, upstream disabled');
    return;
  }
  console.log(`[priceStream] Connecting to Twelve Data WS for ${currentSymbol}...`);
  upstream = new WebSocket(`${TD_WS_URL}?apikey=${apiKey}`);

  upstream.on('open', () => {
    upstreamReady = true;
    console.log('[priceStream] Upstream connected');
    // Subscribe to just the current symbol (Grow plan = 1 symbol)
    upstream.send(JSON.stringify({
      action: 'subscribe',
      params: { symbols: currentSymbol },
    }));
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ action: 'heartbeat' }));
      }
    }, 10000);
  });

  upstream.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.event === 'price' && msg.symbol) {
      const tick = {
        type: 'price',
        symbol: msg.symbol,
        price: msg.price,
        timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
        bid: msg.bid,
        ask: msg.ask,
      };
      lastPrices.set(msg.symbol, tick);
      broadcast(tick);
    } else if (msg.event === 'subscribe-status') {
      console.log('[priceStream] Subscribe status:', JSON.stringify(msg, null, 2));
    } else {
      console.log('[priceStream] Upstream msg:', JSON.stringify(msg));
    }
  });

  upstream.on('close', () => {
    upstreamReady = false;
    clearInterval(heartbeatTimer);
    console.log('[priceStream] Upstream closed, reconnecting in 3s');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectUpstream, 3000);
  });

  upstream.on('error', (err) => {
    console.error('[priceStream] Upstream error:', err.message);
  });
}

function attach(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[priceStream] Client connected (${clients.size} total)`);
    for (const tick of lastPrices.values()) {
      ws.send(JSON.stringify(tick));
    }
    if (lastScanner) ws.send(JSON.stringify({ type: 'scanner', ...lastScanner }));
    if (lastStrength) ws.send(JSON.stringify({ type: 'strength', ...lastStrength }));
    if (recentAlerts.length) {
      ws.send(JSON.stringify({ type: 'alerts-history', alerts: recentAlerts }));
    }
    ws.send(JSON.stringify({ type: 'ws-symbol', symbol: currentSymbol }));
    ws.send(JSON.stringify({ type: 'status', upstream: upstreamReady }));

    // Listen for symbol switch requests from the client
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.action === 'switch-symbol' && msg.symbol) {
          switchSymbol(msg.symbol);
        }
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[priceStream] Client disconnected (${clients.size} total)`);
    });
    ws.on('error', () => clients.delete(ws));
  });
  connectUpstream();
}

module.exports = { attach, pushScanner, pushStrength, pushAlert, switchSymbol, getActiveSymbol };
