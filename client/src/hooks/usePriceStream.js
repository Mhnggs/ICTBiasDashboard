import { useEffect, useRef, useState } from 'react';

// Subscribes to server WS and exposes a map of symbol -> { price, timestamp, bid, ask }
export function usePriceStream() {
  const [prices, setPrices] = useState({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In dev, bypass Vite's flaky ws proxy and hit the backend directly.
      const host = import.meta.env.DEV
        ? `${window.location.hostname}:3001`
        : window.location.host;
      const ws = new WebSocket(`${proto}//${host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          clearTimeout(reconnectRef.current);
          reconnectRef.current = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'price' && msg.symbol) {
            setPrices((prev) => {
              const prior = prev[msg.symbol];
              return {
                ...prev,
                [msg.symbol]: {
                  price: msg.price,
                  timestamp: msg.timestamp,
                  bid: msg.bid,
                  ask: msg.ask,
                  prev: prior?.price,
                },
              };
            });
          }
        } catch {
          // ignore
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { prices, connected };
}
