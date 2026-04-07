const WebSocket = require('ws');
const { SUPPORTED_PAIRS } = require('../utils/helpers');

const TD_WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';

let upstream = null;
let upstreamReady = false;
let reconnectTimer = null;
let heartbeatTimer = null;
const clients = new Set();
const lastPrices = new Map(); // symbol -> { price, timestamp }

function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  }
}

function connectUpstream() {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.warn('[priceStream] No API key, upstream disabled');
    return;
  }
  console.log('[priceStream] Connecting to Twelve Data WS...');
  upstream = new WebSocket(`${TD_WS_URL}?apikey=${apiKey}`);

  upstream.on('open', () => {
    upstreamReady = true;
    console.log('[priceStream] Upstream connected');
    upstream.send(JSON.stringify({
      action: 'subscribe',
      params: { symbols: SUPPORTED_PAIRS.join(',') },
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
    // Send last known prices immediately
    for (const tick of lastPrices.values()) {
      ws.send(JSON.stringify(tick));
    }
    ws.send(JSON.stringify({ type: 'status', upstream: upstreamReady }));
    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[priceStream] Client disconnected (${clients.size} total)`);
    });
    ws.on('error', () => clients.delete(ws));
  });
  connectUpstream();
}

module.exports = { attach };
